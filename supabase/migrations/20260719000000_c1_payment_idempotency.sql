-- ============================================================================
-- C1 — ÖDEME IDEMPOTENCY (çift-çekim koruması)
--
-- SORUN: prepare_card_payment her çağrıda YENİ payment_intents satırı açıyordu.
-- Geç gelen 3DS (istemci 5 dk timeout'undan sonra banka onayı geçerse) ilk
-- niyeti PAID yapar; kullanıcı "zaman aşımı, tekrar dene" görüp bastığında İKİNCİ
-- niyet + İKİNCİ gerçek kart çekimi oluşuyordu. TOP_UP'ta hedef guard'ı da yoktu.
--
-- ÇÖZÜM: İstemci her ödeme denemesi için stabil bir idempotency_key üretir ve
-- retry'larda aynısını gönderir. prepare_card_payment aynı (user, key) için var
-- olan PENDING/PAID niyeti YENİDEN KULLANIR (yeni satır açmaz). Niyet zaten PAID
-- ise edge iyzico'yu hiç çağırmadan başarı döner → ikinci çekim olmaz.
--
-- Geriye dönük uyumlu: idempotency_key NULL ise eski davranış (her çağrı yeni
-- niyet) korunur; mevcut satırlar NULL key ile kısmi indeksin dışındadır.
-- ============================================================================

-- 1) Kolon + kısmi tekil indeks (yalnız canlı/ödenmiş niyetlerde tekillik)
ALTER TABLE public.payment_intents
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS payment_intents_user_idem_uq
  ON public.payment_intents (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND status IN ('PENDING', 'PAID');

-- 2) prepare_card_payment — idempotency_key parametresi + yeniden kullanım mantığı
--    (İmza değiştiği için önce eski 7-argümanlı sürümü düşür.)
DROP FUNCTION IF EXISTS public.prepare_card_payment(uuid, text, numeric, uuid, uuid, text[], boolean);

CREATE OR REPLACE FUNCTION public.prepare_card_payment(
  p_user_id         uuid,
  p_flow            text,              -- 'BOOKING_DEPOSIT' | 'TOP_UP' | 'MATCH_JOIN'
  p_amount          numeric DEFAULT NULL,   -- BOOKING/TOP_UP tutarı
  p_booking_id      uuid    DEFAULT NULL,
  p_match_id        uuid    DEFAULT NULL,
  p_slot_ids        text[]  DEFAULT NULL,
  p_use_balance     boolean DEFAULT false,
  p_idempotency_key text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_b RECORD;
  v_buckets RECORD;
  v_balance_applied numeric := 0;
  v_card_amount numeric;
  v_total numeric;
  v_comm jsonb;
  v_intent public.payment_intents;
  v_existing public.payment_intents;
  v_slots jsonb; v_price numeric; v_sid text; v_slot jsonb; v_count int := 0;
  v_min numeric; v_max numeric;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  -- ─── C1: Idempotency — aynı anahtarlı canlı/ödenmiş niyeti yeniden kullan ──
  IF p_idempotency_key IS NOT NULL AND length(trim(p_idempotency_key)) > 0 THEN
    SELECT * INTO v_existing
    FROM public.payment_intents
    WHERE user_id = p_user_id
      AND idempotency_key = p_idempotency_key
      AND status IN ('PENDING', 'PAID')
    ORDER BY created_at DESC
    LIMIT 1;
    IF FOUND THEN
      -- Niyet zaten var: yeni satır AÇMA, yeni çekim BAŞLATMA. Edge, status='PAID'
      -- ise iyzico'yu atlayıp başarı döner; 'PENDING' ise aynı niyette 3DS sürer.
      RETURN jsonb_build_object(
        'intent_id', v_existing.id,
        'card_amount', v_existing.amount,
        'balance_applied', COALESCE((v_existing.raw->>'balance_applied')::numeric, 0),
        'currency', COALESCE(v_existing.currency, 'TRY'),
        'status', v_existing.status,
        'reused', true
      );
    END IF;
  END IF;

  IF p_flow = 'BOOKING_DEPOSIT' THEN
    IF p_booking_id IS NULL OR p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;
    SELECT * INTO v_b FROM public.pitch_bookings WHERE id = p_booking_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND'; END IF;
    IF v_b.user_id IS DISTINCT FROM p_user_id THEN RAISE EXCEPTION 'UNAUTHORIZED: Bu rezervasyon size ait değil.'; END IF;
    IF v_b.status = 'CANCELLED' THEN RAISE EXCEPTION 'BOOKING_CANCELLED'; END IF;
    IF COALESCE(v_b.paid_amount, 0) + p_amount > COALESCE(v_b.price, 0) THEN RAISE EXCEPTION 'AMOUNT_EXCEEDS_PRICE'; END IF;

    IF p_use_balance THEN
      SELECT * INTO v_buckets FROM public._wallet_bucket_balances(p_user_id);
      v_balance_applied := LEAST(v_buckets.topup_balance + v_buckets.refund_credit_balance, p_amount);
    END IF;
    v_card_amount := round(p_amount - v_balance_applied, 2);
    IF v_card_amount <= 0 THEN RAISE EXCEPTION 'NO_CARD_AMOUNT: Kart tutarı yok (bakiye karşılıyor).'; END IF;

    v_comm := public.calculate_commission(v_card_amount, 'PITCH', v_b.pitch_id);
    INSERT INTO public.payment_intents (
      user_id, booking_id, pitch_id, amount, currency, status, provider,
      commission_amount, owner_amount, service_provider_amount,
      commission_model, related_entity_type, raw, idempotency_key
    ) VALUES (
      p_user_id, p_booking_id, v_b.pitch_id, v_card_amount, 'TRY', 'PENDING', 'IYZICO',
      (v_comm->>'commission_amt')::numeric, (v_comm->>'net_amount')::numeric, 0,
      v_comm->>'model', 'BOOKING',
      jsonb_build_object('flow', p_flow, 'full_amount', p_amount,
                         'balance_applied', v_balance_applied, 'use_balance', p_use_balance),
      p_idempotency_key
    ) RETURNING * INTO v_intent;

  ELSIF p_flow = 'TOP_UP' THEN
    v_min := COALESCE(public.get_config_number('wallet_topup_min', 300), 300);
    v_max := COALESCE(public.get_config_number('wallet_topup_max', 20000), 20000);
    IF p_amount IS NULL OR p_amount < v_min THEN
      RAISE EXCEPTION 'MIN_TOPUP: Minimum yükleme tutarı %₺''dir.', v_min::int;
    END IF;
    IF p_amount > v_max THEN
      RAISE EXCEPTION 'MAX_TOPUP: Tek seferde en fazla %₺ yüklenebilir.', v_max::int;
    END IF;
    v_card_amount := round(p_amount, 2);
    INSERT INTO public.payment_intents (
      user_id, amount, currency, status, provider,
      commission_amount, owner_amount, service_provider_amount,
      commission_model, related_entity_type, raw, idempotency_key
    ) VALUES (
      p_user_id, v_card_amount, 'TRY', 'PENDING', 'IYZICO',
      0, 0, 0, 'MODEL_A', 'TOP_UP',
      jsonb_build_object('flow', p_flow, 'full_amount', v_card_amount),
      p_idempotency_key
    ) RETURNING * INTO v_intent;

  ELSIF p_flow = 'MATCH_JOIN' THEN
    IF p_match_id IS NULL OR p_slot_ids IS NULL OR array_length(p_slot_ids, 1) IS NULL THEN
      RAISE EXCEPTION 'NO_SLOTS: En az bir slot seç';
    END IF;
    SELECT slots, price INTO v_slots, v_price FROM public.matches WHERE id = p_match_id;
    IF v_slots IS NULL THEN RAISE EXCEPTION 'NOT_FOUND: Maç bulunamadı'; END IF;
    FOREACH v_sid IN ARRAY p_slot_ids LOOP
      SELECT s INTO v_slot FROM jsonb_array_elements(v_slots) s WHERE s->>'id' = v_sid;
      IF v_slot IS NULL THEN RAISE EXCEPTION 'SLOT_NOT_FOUND: %', v_sid; END IF;
      IF COALESCE(v_slot->>'status','OPEN') <> 'OPEN' THEN RAISE EXCEPTION 'SLOT_TAKEN: % dolu', v_sid; END IF;
      v_count := v_count + 1;
    END LOOP;
    v_total := round(COALESCE(v_price, 0) * v_count, 2);
    IF v_total <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT: Ücretsiz maç için kart gerekmez.'; END IF;

    IF p_use_balance THEN
      SELECT * INTO v_buckets FROM public._wallet_bucket_balances(p_user_id);
      v_balance_applied := LEAST(v_buckets.topup_balance + v_buckets.refund_credit_balance, v_total);
    END IF;
    v_card_amount := round(v_total - v_balance_applied, 2);
    IF v_card_amount <= 0 THEN RAISE EXCEPTION 'NO_CARD_AMOUNT: Kart tutarı yok (bakiye karşılıyor).'; END IF;

    v_comm := public.calculate_commission(v_card_amount, 'GLOBAL');
    INSERT INTO public.payment_intents (
      user_id, match_id, amount, currency, status, provider,
      commission_amount, owner_amount, service_provider_amount,
      commission_model, related_entity_type, raw, idempotency_key
    ) VALUES (
      p_user_id, p_match_id, v_card_amount, 'TRY', 'PENDING', 'IYZICO',
      (v_comm->>'commission_amt')::numeric, (v_comm->>'net_amount')::numeric, 0,
      v_comm->>'model', 'MATCH',
      jsonb_build_object('flow', p_flow, 'full_amount', v_total, 'slot_ids', to_jsonb(p_slot_ids),
                         'balance_applied', v_balance_applied, 'use_balance', p_use_balance),
      p_idempotency_key
    ) RETURNING * INTO v_intent;

  ELSE
    RAISE EXCEPTION 'INVALID_FLOW: %', p_flow;
  END IF;

  RETURN jsonb_build_object(
    'intent_id', v_intent.id,
    'card_amount', v_card_amount,
    'balance_applied', v_balance_applied,
    'currency', 'TRY',
    'status', 'PENDING',
    'reused', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_card_payment(uuid, text, numeric, uuid, uuid, text[], boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_card_payment(uuid, text, numeric, uuid, uuid, text[], boolean, text) TO service_role;
