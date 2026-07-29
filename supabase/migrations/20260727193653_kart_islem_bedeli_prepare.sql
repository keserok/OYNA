-- ÜRETİMDEN GERİ ÇEKİLDİ (defter sapması onarımı, 2026-07-28)
-- Kart işlem bedeli: prepare_card_payment kart tabanı + komisyonu ayrı hesaplar
CREATE OR REPLACE FUNCTION public.prepare_card_payment(
  p_user_id uuid,
  p_flow text,
  p_amount numeric DEFAULT NULL,
  p_booking_id uuid DEFAULT NULL,
  p_match_id uuid DEFAULT NULL,
  p_slot_ids text[] DEFAULT NULL,
  p_use_balance boolean DEFAULT false,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_b RECORD;
  v_buckets RECORD;
  v_balance_applied numeric := 0;
  v_card_base numeric;
  v_card_fee numeric := 0;
  v_fee_pct numeric := COALESCE(public.get_config_number('card_fee_pct', 2.5), 2.5);
  v_card_amount numeric;
  v_total numeric;
  v_comm jsonb;
  v_intent public.payment_intents;
  v_existing public.payment_intents;
  v_slots jsonb; v_price numeric; v_sid text; v_slot jsonb; v_count int := 0;
  v_min numeric; v_max numeric;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF v_fee_pct < 0 THEN v_fee_pct := 0; END IF;

  IF p_idempotency_key IS NOT NULL AND btrim(p_idempotency_key) <> '' THEN
    SELECT * INTO v_existing FROM public.payment_intents
    WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key
      AND status IN ('PENDING','PAID','CAPTURED','BLOCKED')
    ORDER BY created_at DESC LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'intent_id', v_existing.id,
        'card_amount', v_existing.amount,
        'card_base', COALESCE((v_existing.raw->>'card_base')::numeric, v_existing.amount),
        'card_fee', COALESCE(v_existing.card_fee_amount, 0),
        'card_fee_pct', COALESCE((v_existing.raw->>'card_fee_pct')::numeric, 0),
        'balance_applied', COALESCE((v_existing.raw->>'balance_applied')::numeric, 0),
        'currency', COALESCE(v_existing.currency, 'TRY'),
        'idempotent', true,
        'reused', true,
        'status', v_existing.status
      );
    END IF;
  END IF;

  PERFORM public._check_payment_rate_limit(p_user_id);

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
    v_card_base := round(p_amount - v_balance_applied, 2);
    IF v_card_base <= 0 THEN RAISE EXCEPTION 'NO_CARD_AMOUNT: Kart tutarı yok (bakiye karşılıyor).'; END IF;
    v_card_fee := CASE WHEN v_fee_pct > 0 THEN round(v_card_base * v_fee_pct / 100.0, 2) ELSE 0 END;
    v_card_amount := round(v_card_base + v_card_fee, 2);

    v_comm := public.calculate_commission(v_card_base, 'PITCH', v_b.pitch_id);
    INSERT INTO public.payment_intents (
      user_id, booking_id, pitch_id, amount, currency, status, provider,
      commission_amount, owner_amount, service_provider_amount,
      commission_model, related_entity_type, raw, idempotency_key, card_fee_amount
    ) VALUES (
      p_user_id, p_booking_id, v_b.pitch_id, v_card_amount, 'TRY', 'PENDING', 'IYZICO',
      (v_comm->>'commission_amt')::numeric, (v_comm->>'net_amount')::numeric, 0,
      v_comm->>'model', 'BOOKING',
      jsonb_build_object('flow', p_flow, 'full_amount', p_amount,
                         'balance_applied', v_balance_applied, 'use_balance', p_use_balance,
                         'card_base', v_card_base, 'card_fee', v_card_fee, 'card_fee_pct', v_fee_pct),
      p_idempotency_key, v_card_fee
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
    v_card_base := round(p_amount, 2);
    v_card_fee := CASE WHEN v_fee_pct > 0 THEN round(v_card_base * v_fee_pct / 100.0, 2) ELSE 0 END;
    v_card_amount := round(v_card_base + v_card_fee, 2);
    INSERT INTO public.payment_intents (
      user_id, amount, currency, status, provider,
      commission_amount, owner_amount, service_provider_amount,
      commission_model, related_entity_type, raw, idempotency_key, card_fee_amount
    ) VALUES (
      p_user_id, v_card_amount, 'TRY', 'PENDING', 'IYZICO',
      0, 0, 0, 'MODEL_A', 'TOP_UP',
      jsonb_build_object('flow', p_flow, 'full_amount', v_card_base,
                         'card_base', v_card_base, 'card_fee', v_card_fee, 'card_fee_pct', v_fee_pct),
      p_idempotency_key, v_card_fee
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
    v_card_base := round(v_total - v_balance_applied, 2);
    IF v_card_base <= 0 THEN RAISE EXCEPTION 'NO_CARD_AMOUNT: Kart tutarı yok (bakiye karşılıyor).'; END IF;
    v_card_fee := CASE WHEN v_fee_pct > 0 THEN round(v_card_base * v_fee_pct / 100.0, 2) ELSE 0 END;
    v_card_amount := round(v_card_base + v_card_fee, 2);

    v_comm := public.calculate_commission(v_card_base, 'GLOBAL');
    INSERT INTO public.payment_intents (
      user_id, match_id, amount, currency, status, provider,
      commission_amount, owner_amount, service_provider_amount,
      commission_model, related_entity_type, raw, idempotency_key, card_fee_amount
    ) VALUES (
      p_user_id, p_match_id, v_card_amount, 'TRY', 'PENDING', 'IYZICO',
      (v_comm->>'commission_amt')::numeric, (v_comm->>'net_amount')::numeric, 0,
      v_comm->>'model', 'MATCH',
      jsonb_build_object('flow', p_flow, 'full_amount', v_total, 'slot_ids', to_jsonb(p_slot_ids),
                         'balance_applied', v_balance_applied, 'use_balance', p_use_balance,
                         'card_base', v_card_base, 'card_fee', v_card_fee, 'card_fee_pct', v_fee_pct),
      p_idempotency_key, v_card_fee
    ) RETURNING * INTO v_intent;

  ELSE
    RAISE EXCEPTION 'INVALID_FLOW: %', p_flow;
  END IF;

  RETURN jsonb_build_object(
    'intent_id', v_intent.id,
    'card_amount', v_card_amount,
    'card_base', v_card_base,
    'card_fee', v_card_fee,
    'card_fee_pct', v_fee_pct,
    'balance_applied', v_balance_applied,
    'currency', 'TRY'
  );
END;
$fn$;
