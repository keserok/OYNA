-- ════════════════════════════════════════════════════════════════════════════
-- [S4] GÜVENLİK PAKETİ — hız limitleri + yeni hesap çekim yasağı (K16/17/18)
-- ────────────────────────────────────────────────────────────────────────────
-- Master plan S4 / Risk kaydı:
--   • "10 dk'da 5 başarısız ödeme → kısa kilit" (çalıntı kart deneme koruması).
--   • "yeni hesap 24s çekim yasağı" (yükle→hemen çek dolandırıcılık tamponu).
-- İki koruma da SALT-GATE (para HAREKET ETTİRMEZ; yalnız engeller) → yanlış
-- pozitif riski var, para kaybı riski YOK. Bu yüzden korumalar AÇIK doğar ama
-- eşikler config'ten ayarlanır ve tek anahtarla kapatılabilir.
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO public.app_config (key, value, value_type, category, label, description, is_public, min_value, max_value) VALUES
  ('payment_rate_limit_enabled', 'true'::jsonb, 'boolean', 'GUVENLIK',
   'Ödeme Hız Limiti',
   'AÇIK iken kısa sürede çok sayıda başarısız ödeme denemesi geçici olarak kilitlenir (çalıntı kart deneme koruması). Yanlış pozitif olursa kapatın.',
   false, NULL, NULL),
  ('payment_fail_limit_count', '5'::jsonb, 'number', 'GUVENLIK',
   'Başarısız Ödeme Eşiği',
   'Bu kadar başarısız ödeme (pencere içinde) → geçici kilit.',
   false, 2, 50),
  ('payment_fail_limit_window_min', '10'::jsonb, 'number', 'GUVENLIK',
   'Hız Limiti Penceresi (dk)',
   'Başarısız ödeme sayımı bu kadar dakikalık kayan pencerede yapılır.',
   false, 1, 120),
  ('cashout_new_account_hours', '24'::jsonb, 'number', 'GUVENLIK',
   'Yeni Hesap Çekim Kilidi (saat)',
   'Hesap açıldıktan sonra bu kadar saat para çekimi (cüzdan + kazanç) kapalıdır (dolandırıcılık tamponu). 0 = kapalı.',
   false, 0, 720)
ON CONFLICT (key) DO NOTHING;

-- ─── Yardımcı 1: ödeme hız limiti (başarısız deneme sayacı) ──────────────────
CREATE OR REPLACE FUNCTION public._check_payment_rate_limit(p_uid uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_enabled boolean := public.get_config_bool('payment_rate_limit_enabled', true);
  v_count int := COALESCE(public.get_config_number('payment_fail_limit_count', 5), 5)::int;
  v_win   int := COALESCE(public.get_config_number('payment_fail_limit_window_min', 10), 10)::int;
  v_fails int;
BEGIN
  IF NOT v_enabled OR v_count <= 0 THEN RETURN; END IF;
  SELECT count(*) INTO v_fails FROM public.payment_intents
  WHERE user_id = p_uid AND status = 'FAILED'
    AND created_at >= now() - make_interval(mins => v_win);
  IF v_fails >= v_count THEN
    RAISE EXCEPTION 'RATE_LIMIT: Çok fazla başarısız ödeme denemesi. Güvenliğin için birkaç dakika bekle, sonra tekrar dene.';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public._check_payment_rate_limit(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._check_payment_rate_limit(uuid) TO service_role;

-- ─── Yardımcı 2: yeni hesap çekim kilidi ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public._assert_account_old_enough_for_cashout(p_uid uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_hours int := COALESCE(public.get_config_number('cashout_new_account_hours', 24), 24)::int;
  v_created timestamptz;
BEGIN
  IF v_hours <= 0 THEN RETURN; END IF;
  SELECT created_at INTO v_created FROM public.profiles WHERE id = p_uid;
  IF v_created IS NOT NULL AND v_created > now() - make_interval(hours => v_hours) THEN
    RAISE EXCEPTION 'NEW_ACCOUNT_LOCK: Yeni hesaplarda ilk % saat para çekimi güvenlik için kapalıdır. Lütfen daha sonra tekrar dene.', v_hours;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public._assert_account_old_enough_for_cashout(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._assert_account_old_enough_for_cashout(uuid) TO service_role, authenticated;

-- ─── prepare_card_payment — mevcut gövde + hız limiti (idempotency SONRASI) ──
-- Değişmez: yalnız YENİ intent üretiminden önce _check_payment_rate_limit çağrısı
-- eklendi. Idempotency reuse yolu (aynı deneme tekrarı) limite TAKILMAZ.
CREATE OR REPLACE FUNCTION public.prepare_card_payment(
  p_user_id         uuid,
  p_flow            text,
  p_amount          numeric DEFAULT NULL,
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

  -- İDEMPOTENCY: aynı anahtarla açık/ödenmiş intent varsa onu döndür (yeni yaratma).
  IF p_idempotency_key IS NOT NULL AND btrim(p_idempotency_key) <> '' THEN
    SELECT * INTO v_existing FROM public.payment_intents
    WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key
      AND status IN ('PENDING','PAID','CAPTURED','BLOCKED')
    ORDER BY created_at DESC LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'intent_id', v_existing.id,
        'card_amount', v_existing.amount,
        'balance_applied', COALESCE((v_existing.raw->>'balance_applied')::numeric, 0),
        'currency', COALESCE(v_existing.currency, 'TRY'),
        'idempotent', true,
        'reused', true,
        'status', v_existing.status
      );
    END IF;
  END IF;

  -- [S4] HIZ LİMİTİ: yalnız yeni intent üretiminden önce (reuse yolu hariç).
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
    'currency', 'TRY'
  );
END;
$$;
REVOKE ALL ON FUNCTION public.prepare_card_payment(uuid, text, numeric, uuid, uuid, text[], boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_card_payment(uuid, text, numeric, uuid, uuid, text[], boolean, text) TO service_role;

-- ─── request_wallet_cashout — mevcut gövde + yeni hesap kilidi ───────────────
CREATE OR REPLACE FUNCTION public.request_wallet_cashout(p_gross numeric, p_method_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_method public.payout_methods;
  v_buckets RECORD;
  v_topup numeric;
  v_min numeric := COALESCE(public.get_config_number('wallet_cashout_min', 100), 100);
  v_req_id boolean := public.get_config_bool('wallet_cashout_require_identity', true);
  v_q jsonb; v_fee numeric; v_net numeric; v_gross numeric;
  v_payout public.payout_requests;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED: Giriş gerekli.'; END IF;

  -- Kill-switch
  IF NOT public.get_config_bool('wallet_cashout_enabled', false) THEN
    RAISE EXCEPTION 'CASHOUT_DISABLED: Para çekme şu an kapalı.';
  END IF;

  -- [S4] Yeni hesap çekim kilidi
  PERFORM public._assert_account_old_enough_for_cashout(v_uid);

  v_gross := round(COALESCE(p_gross, 0), 2);
  IF v_gross < v_min THEN
    RAISE EXCEPTION 'MIN_CASHOUT: En az %₺ çekebilirsin.', v_min::int;
  END IF;

  -- Yöntem: yalnız IBAN + kullanıcıya ait
  SELECT * INTO v_method FROM public.payout_methods WHERE id = p_method_id AND user_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'METHOD_NOT_FOUND: Kayıtlı IBAN bulunamadı.'; END IF;
  IF v_method.kind <> 'IBAN' THEN
    RAISE EXCEPTION 'IBAN_REQUIRED: Çekim yalnız kayıtlı IBAN''a yapılabilir.';
  END IF;

  -- Kimlik (ilk çekim koruması)
  IF v_req_id AND NOT EXISTS (SELECT 1 FROM public.provider_identities WHERE user_id = v_uid AND status = 'VERIFIED') THEN
    RAISE EXCEPTION 'IDENTITY_REQUIRED: Para çekmeden önce TC kimlik doğrulaması gerekli.';
  END IF;

  -- Eşzamanlılık kilidi + tek bekleyen talep
  PERFORM 1 FROM public.profiles WHERE id = v_uid FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.payout_requests WHERE user_id = v_uid AND status = 'PENDING') THEN
    RAISE EXCEPTION 'PENDING_PAYOUT: Bekleyen bir çekim talebin var. Sonuçlanınca yeni talep açabilirsin.';
  END IF;

  -- Yalnız TOP_UP kovası (iade kredisi/kazanç HARİÇ)
  SELECT * INTO v_buckets FROM public._wallet_bucket_balances(v_uid);
  v_topup := COALESCE(v_buckets.topup_balance, 0);
  IF v_topup < v_gross THEN
    RAISE EXCEPTION 'INSUFFICIENT_TOPUP: Çekilebilir (yüklenen) bakiyen %₺, istenen %₺.', round(v_topup,2), v_gross;
  END IF;

  v_q := public._wallet_cashout_quote(v_gross);
  v_fee := (v_q->>'fee')::numeric;
  v_net := (v_q->>'net')::numeric;
  IF v_net <= 0 THEN RAISE EXCEPTION 'INVALID_NET: Net çekim tutarı sıfırdan büyük olmalı.'; END IF;

  INSERT INTO public.payout_requests
    (user_id, amount, fee_amount, net_amount, iban, iban_holder_name, status, payout_type, payout_method_id, method_kind)
  VALUES
    (v_uid, v_gross, v_fee, v_net, v_method.iban, v_method.holder_name, 'PENDING', 'WALLET_CASHOUT', v_method.id, 'IBAN')
  RETURNING * INTO v_payout;

  INSERT INTO public.wallet_transactions
    (user_id, amount, type, balance_type, status, reference_type, reference_id, description)
  VALUES
    (v_uid, v_gross, 'WITHDRAWAL', 'TOP_UP', 'COMPLETED', 'PAYOUT', v_payout.id,
     format('Cüzdandan çekim — kesinti %s₺, net %s₺ IBAN''a', v_fee, v_net));
  PERFORM public._sync_wallet_mirror(v_uid);

  RETURN jsonb_build_object(
    'payout_id', v_payout.id, 'gross', v_gross, 'fee', v_fee, 'net', v_net,
    'status', 'PENDING', 'iban_last4', right(v_method.iban, 4)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.request_wallet_cashout(numeric, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_wallet_cashout(numeric, uuid) TO authenticated, service_role;

-- ─── request_payout_with_method — mevcut gövde + yeni hesap kilidi ───────────
CREATE OR REPLACE FUNCTION public.request_payout_with_method(
  p_amount    numeric,
  p_method_id uuid
)
RETURNS public.payout_requests
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_method      public.payout_methods;
  v_wallet      jsonb;
  v_balance     numeric;
  v_payout      public.payout_requests;
  v_role        text;
  v_roles       jsonb;
  v_idstat      text;
  v_is_provider boolean;
  v_iban_disp   text;
  v_min         numeric := COALESCE(public.get_config_number('earnings_payout_min', 100), 100);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT: Tutar sifirdan buyuk olmali.'; END IF;
  IF p_amount < v_min THEN
    RAISE EXCEPTION 'MIN_PAYOUT: En az %₺ çekebilirsin.', v_min::int;
  END IF;

  -- [S4] Yeni hesap çekim kilidi
  PERFORM public._assert_account_old_enough_for_cashout(v_uid);

  SELECT * INTO v_method FROM public.payout_methods WHERE id = p_method_id AND user_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'METHOD_NOT_FOUND: Kayitli odeme yontemi bulunamadi.'; END IF;

  SELECT role, roles INTO v_role, v_roles FROM public.profiles WHERE id = v_uid;
  v_is_provider := v_role IN ('GOALKEEPER','REFEREE')
                   OR (COALESCE(v_roles,'[]'::jsonb) ? 'GOALKEEPER')
                   OR (COALESCE(v_roles,'[]'::jsonb) ? 'REFEREE');
  IF v_is_provider THEN
    SELECT status INTO v_idstat FROM public.provider_identities WHERE user_id = v_uid;
    IF v_idstat IS DISTINCT FROM 'VERIFIED' THEN
      RAISE EXCEPTION 'IDENTITY_REQUIRED: Odeme almadan once TC kimlik dogrulamasi gerekli.';
    END IF;
  END IF;

  v_wallet  := public.get_wallet_summary();
  v_balance := (v_wallet->>'earnings_balance')::numeric;
  IF v_balance < p_amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE: Bakiye yetersiz. Mevcut: %', v_balance;
  END IF;
  IF EXISTS (SELECT 1 FROM public.payout_requests WHERE user_id = v_uid AND status = 'PENDING') THEN
    RAISE EXCEPTION 'PENDING_PAYOUT: Bekleyen odeme talebiniz mevcut.';
  END IF;

  v_iban_disp := CASE WHEN v_method.kind = 'IBAN' THEN v_method.iban
                      ELSE 'KART **** ' || v_method.card_last4 || ' (' || COALESCE(v_method.card_brand,'KART') || ')' END;

  INSERT INTO public.payout_requests
    (user_id, amount, iban, iban_holder_name, payout_type, payout_method_id, method_kind)
  VALUES
    (v_uid, p_amount, v_iban_disp, v_method.holder_name,
     CASE WHEN v_is_provider THEN 'PROVIDER_INSTANT' ELSE 'MANUAL' END,
     v_method.id, v_method.kind)
  RETURNING * INTO v_payout;

  INSERT INTO public.wallet_transactions (user_id, amount, type, balance_type, status, reference_type, reference_id, description)
  VALUES (v_uid, p_amount, 'WITHDRAWAL', 'EARNINGS', 'PENDING', 'PAYOUT', v_payout.id,
          CASE WHEN v_method.kind = 'IBAN' THEN 'IBAN''a çekim talebi' ELSE 'Kayıtlı karta çekim talebi' END);

  RETURN v_payout;
END;
$$;
REVOKE ALL ON FUNCTION public.request_payout_with_method(numeric, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_payout_with_method(numeric, uuid) TO authenticated;
