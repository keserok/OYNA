-- ==============================================================================
-- FAZ 2 Düzeltmeleri — adversarial denetim bulgularının giderilmesi (25 bulgu)
-- CRITICAL: booking_id NOT NULL, owner-kredi pitch_id, kazanç serbest bırakma
-- HIGH: birthdate, Model B markup, payout double-spend, get_wallet_summary
-- MEDIUM: scope precedence, idempotency, amount validation, consent ownership
-- ==============================================================================

-- ── CRITICAL #1: payment_intents.booking_id maç pre-auth'ları için nullable ──
ALTER TABLE public.payment_intents ALTER COLUMN booking_id DROP NOT NULL;

-- ── CRITICAL #3: matches.pitch_id — maç→saha ilişkisi (owner kredisi için) ──
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS pitch_id uuid REFERENCES public.pitches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_matches_pitch ON public.matches(pitch_id);

-- ── HIGH #5: profiles.birthdate — 18 yaş altı tespiti için ──
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS birthdate date;

-- ── MEDIUM #23 + #16: idempotency için unique index'ler ──
-- commission_config: aynı scope default'u veya scope_id tekrar yazılamasın
CREATE UNIQUE INDEX IF NOT EXISTS uq_commission_config_default
  ON public.commission_config(scope) WHERE scope_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_commission_config_scoped
  ON public.commission_config(scope, scope_id) WHERE scope_id IS NOT NULL;

-- payment_intents: aynı (match_id,user_id) için tek aktif blokaj (çift blokaj yarışı)
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_intents_active_match
  ON public.payment_intents(match_id, user_id)
  WHERE status IN ('PENDING','BLOCKED') AND match_id IS NOT NULL;

-- payout_requests: kullanıcı başına tek PENDING talep (double-spend yarışı)
CREATE UNIQUE INDEX IF NOT EXISTS uq_payout_requests_pending
  ON public.payout_requests(user_id) WHERE status = 'PENDING';

-- ── HIGH #6 + MEDIUM #17/#18: calculate_commission scope precedence + Model B ──
CREATE OR REPLACE FUNCTION public.calculate_commission(
  p_amount   numeric,
  p_scope    text DEFAULT 'GLOBAL',
  p_scope_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cfg    RECORD;
  v_rate   numeric;
  v_markup numeric;
  v_comm   numeric;
  v_markup_amt numeric;
  v_net    numeric;
  v_model  text;
BEGIN
  -- Önce sahaya/maça özel (scope_id eşleşen), yoksa scope geneli (scope_id NULL)
  SELECT rate_pct, model, markup_pct INTO v_cfg
  FROM public.commission_config
  WHERE scope = p_scope AND is_active = true
    AND (scope_id = p_scope_id OR scope_id IS NULL)
  ORDER BY (scope_id = p_scope_id) DESC NULLS LAST
  LIMIT 1;

  -- O scope hiç yoksa GLOBAL'a düş
  IF NOT FOUND THEN
    SELECT rate_pct, model, markup_pct INTO v_cfg
    FROM public.commission_config WHERE scope = 'GLOBAL' AND is_active = true AND scope_id IS NULL
    LIMIT 1;
  END IF;

  v_rate   := COALESCE(v_cfg.rate_pct, 15.0);
  v_markup := COALESCE(v_cfg.markup_pct, 0.0);
  v_model  := COALESCE(v_cfg.model, 'MODEL_A');

  -- Model A: komisyon = oran% ; Model B: oran% + markup% (saha %95 + değişken markup)
  v_comm       := round(p_amount * v_rate / 100.0, 2);
  v_markup_amt := CASE WHEN v_model = 'MODEL_B' THEN round(p_amount * v_markup / 100.0, 2) ELSE 0 END;
  v_comm       := v_comm + v_markup_amt;
  v_net        := p_amount - v_comm;

  RETURN jsonb_build_object(
    'amount',         p_amount,
    'commission_pct', v_rate,
    'markup_pct',     v_markup,
    'markup_amt',     v_markup_amt,
    'commission_amt', v_comm,
    'net_amount',     v_net,
    'model',          v_model
  );
END;
$$;
REVOKE ALL ON FUNCTION public.calculate_commission(numeric, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calculate_commission(numeric, text, uuid) TO authenticated;

-- ── CRITICAL #3 + MEDIUM #15/#16/#18: create_match_preauth düzeltmesi ──
-- pitch_id türet, tutarı maç fiyatına göre doğrula, doğru scope, idempotent
CREATE OR REPLACE FUNCTION public.create_match_preauth(
  p_match_id uuid,
  p_amount   numeric,
  p_provider text DEFAULT 'IYZICO'
)
RETURNS public.payment_intents
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_match    RECORD;
  v_pitch_id uuid;
  v_scope    text;
  v_comm     jsonb;
  v_intent   public.payment_intents;
  v_existing public.payment_intents;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;

  SELECT id, pitch_id, price INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Maç bulunamadı.'; END IF;

  -- Tutar bütünlüğü: pre-auth maç fiyatını aşamaz (eksik/fazla tahsil koruması)
  IF v_match.price IS NOT NULL AND p_amount > v_match.price THEN
    RAISE EXCEPTION 'AMOUNT_EXCEEDS_PRICE: Blokaj tutarı maç fiyatını aşamaz.';
  END IF;

  v_pitch_id := v_match.pitch_id;

  -- Aynı kullanıcı için aktif blokaj varsa onu döndür (idempotent)
  SELECT * INTO v_existing FROM public.payment_intents
  WHERE match_id = p_match_id AND user_id = v_uid
    AND status IN ('PENDING','BLOCKED') ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN RETURN v_existing; END IF;

  -- Komisyon: saha varsa PITCH scope, yoksa GLOBAL
  v_scope := CASE WHEN v_pitch_id IS NOT NULL THEN 'PITCH' ELSE 'GLOBAL' END;
  v_comm  := public.calculate_commission(p_amount, v_scope, v_pitch_id);

  BEGIN
    INSERT INTO public.payment_intents (
      user_id, match_id, pitch_id, amount, currency, status, provider,
      commission_amount, owner_amount, service_provider_amount,
      commission_model, related_entity_type
    ) VALUES (
      v_uid, p_match_id, v_pitch_id, p_amount, 'TRY', 'PENDING', p_provider,
      (v_comm->>'commission_amt')::numeric,
      (v_comm->>'net_amount')::numeric,
      0,
      v_comm->>'model',
      'MATCH'
    )
    RETURNING * INTO v_intent;
  EXCEPTION WHEN unique_violation THEN
    -- Yarış: başka transaction aynı anda oluşturdu → mevcut olanı döndür
    SELECT * INTO v_intent FROM public.payment_intents
    WHERE match_id = p_match_id AND user_id = v_uid
      AND status IN ('PENDING','BLOCKED') ORDER BY created_at DESC LIMIT 1;
  END;

  RETURN v_intent;
END;
$$;
REVOKE ALL ON FUNCTION public.create_match_preauth(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_match_preauth(uuid, numeric, text) TO authenticated;

-- ── HIGH #8: get_wallet_summary — PENDING WITHDRAWAL'ı rezerve olarak düş ──
CREATE OR REPLACE FUNCTION public.get_wallet_summary()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_earnings  numeric;
  v_reserved  numeric;
  v_refund    numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  -- Tamamlanmış kazanç giriş/çıkışları
  SELECT COALESCE(SUM(CASE WHEN type IN ('DEPOSIT','MATCH_EARNING','REFERRAL_BONUS') THEN amount ELSE -amount END), 0)
  INTO v_earnings
  FROM public.wallet_transactions
  WHERE user_id = v_uid AND balance_type = 'EARNINGS' AND status = 'COMPLETED';

  -- Bekleyen çekimler (rezerve edilmiş, henüz tamamlanmamış) — tekrar harcanamaz
  SELECT COALESCE(SUM(amount), 0)
  INTO v_reserved
  FROM public.wallet_transactions
  WHERE user_id = v_uid AND balance_type = 'EARNINGS'
    AND type = 'WITHDRAWAL' AND status = 'PENDING';

  SELECT COALESCE(SUM(CASE WHEN type = 'DEPOSIT' THEN amount ELSE -amount END), 0)
  INTO v_refund
  FROM public.wallet_transactions
  WHERE user_id = v_uid AND balance_type = 'REFUND_CREDIT' AND status = 'COMPLETED';

  RETURN jsonb_build_object(
    'earnings_balance',      GREATEST(v_earnings - v_reserved, 0),
    'reserved_balance',      GREATEST(v_reserved, 0),
    'refund_credit_balance', GREATEST(v_refund, 0)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_wallet_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_wallet_summary() TO authenticated;

-- ── HIGH #11: request_payout — advisory lock ile double-spend yarışını kapat ──
CREATE OR REPLACE FUNCTION public.request_payout(
  p_amount           numeric,
  p_iban             text,
  p_iban_holder_name text,
  p_payout_type      text DEFAULT 'MANUAL'
)
RETURNS public.payout_requests
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_wallet  jsonb;
  v_balance numeric;
  v_payout  public.payout_requests;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;
  IF p_iban IS NULL OR length(trim(p_iban)) < 10 THEN RAISE EXCEPTION 'INVALID_IBAN'; END IF;

  -- Kullanıcı bazlı serileştirme: eşzamanlı iki talebi sıraya sok
  PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

  v_wallet  := public.get_wallet_summary();
  v_balance := (v_wallet->>'earnings_balance')::numeric;
  IF v_balance < p_amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE: Mevcut kullanılabilir: %', v_balance;
  END IF;

  IF EXISTS (SELECT 1 FROM public.payout_requests WHERE user_id = v_uid AND status = 'PENDING') THEN
    RAISE EXCEPTION 'PENDING_PAYOUT: Bekleyen ödeme talebiniz mevcut.';
  END IF;

  INSERT INTO public.payout_requests (user_id, amount, iban, iban_holder_name, payout_type)
  VALUES (v_uid, p_amount, p_iban, p_iban_holder_name, p_payout_type)
  RETURNING * INTO v_payout;

  -- Bakiyeyi rezerve et (PENDING WITHDRAWAL artık get_wallet_summary'de düşülüyor)
  INSERT INTO public.wallet_transactions (user_id, amount, type, balance_type, status, reference_type, reference_id, description)
  VALUES (v_uid, p_amount, 'WITHDRAWAL', 'EARNINGS', 'PENDING', 'PAYOUT', v_payout.id, 'IBAN ödeme talebi');

  RETURN v_payout;
END;
$$;
REVOKE ALL ON FUNCTION public.request_payout(numeric, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_payout(numeric, text, text, text) TO authenticated;

-- ── CRITICAL #2 (admin tarafı) + payout yaşam döngüsü: admin_process_payout ──
-- Payout'u sonuçlandırırken rezerve WITHDRAWAL'ı da senkronla (COMPLETED/CANCELLED)
CREATE OR REPLACE FUNCTION public.admin_process_payout(
  p_payout_id uuid,
  p_status    text,           -- PROCESSING | COMPLETED | FAILED | CANCELLED
  p_ref       text DEFAULT NULL,
  p_notes     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payout public.payout_requests;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_status NOT IN ('PROCESSING','COMPLETED','FAILED','CANCELLED') THEN
    RAISE EXCEPTION 'INVALID_STATUS';
  END IF;

  SELECT * INTO v_payout FROM public.payout_requests WHERE id = p_payout_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  UPDATE public.payout_requests SET
    status = p_status,
    iyzico_payout_ref = COALESCE(p_ref, iyzico_payout_ref),
    admin_notes = COALESCE(p_notes, admin_notes),
    processed_at = CASE WHEN p_status IN ('COMPLETED','FAILED','CANCELLED') THEN now() ELSE processed_at END,
    processed_by = auth.uid()
  WHERE id = p_payout_id;

  -- Rezerve WITHDRAWAL kaydını sonuçla senkronla
  IF p_status = 'COMPLETED' THEN
    UPDATE public.wallet_transactions SET status = 'COMPLETED'
    WHERE reference_type = 'PAYOUT' AND reference_id = p_payout_id AND status = 'PENDING';
  ELSIF p_status IN ('FAILED','CANCELLED') THEN
    -- Rezervasyonu serbest bırak (iptal et) → bakiye geri kullanılabilir
    UPDATE public.wallet_transactions SET status = 'CANCELLED'
    WHERE reference_type = 'PAYOUT' AND reference_id = p_payout_id AND status = 'PENDING';
  END IF;

  RETURN jsonb_build_object('payout_id', p_payout_id, 'status', p_status);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_process_payout(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_process_payout(uuid, text, text, text) TO authenticated;

-- ── CRITICAL #4 + HIGH #7: release_owner_earnings — 2 haftalık serbest bırakma ──
CREATE OR REPLACE FUNCTION public.release_owner_earnings()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_days      integer;
  v_released  integer;
BEGIN
  SELECT COALESCE(owner_payout_days, 14) INTO v_days FROM public.settings LIMIT 1;
  v_days := COALESCE(v_days, 14);

  -- captured_at + N gün geçmiş PENDING EARNINGS kayıtlarını COMPLETED yap
  WITH released AS (
    UPDATE public.wallet_transactions wt SET status = 'COMPLETED'
    WHERE wt.balance_type = 'EARNINGS'
      AND wt.status = 'PENDING'
      AND wt.type = 'MATCH_EARNING'
      AND wt.created_at <= now() - make_interval(days => v_days)
    RETURNING wt.id
  )
  SELECT COUNT(*) INTO v_released FROM released;

  RETURN jsonb_build_object('released_count', v_released, 'payout_days', v_days);
END;
$$;
REVOKE ALL ON FUNCTION public.release_owner_earnings() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_owner_earnings() TO service_role;

-- Saatlik cron: olgunlaşan kazançları serbest bırak
SELECT cron.schedule('release_owner_earnings_hourly', '0 * * * *',
  'SELECT public.release_owner_earnings()')
WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'release_owner_earnings_hourly');

-- ── HIGH #10: process_tiered_refund — kademeli iade motoru ──
-- p_hours_to_match: maç başlangıcına kalan saat (caller/cron hesaplar)
CREATE OR REPLACE FUNCTION public.process_tiered_refund(
  p_intent_id      uuid,
  p_hours_to_match numeric
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_intent     public.payment_intents;
  v_free_hours numeric;
  v_credit_hrs numeric;
  v_uid        uuid := auth.uid();
  v_tier       text;
  v_amount     numeric;
BEGIN
  SELECT * INTO v_intent FROM public.payment_intents WHERE id = p_intent_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  -- Yetki: kendi niyeti veya admin
  IF v_uid IS NOT NULL AND v_intent.user_id IS DISTINCT FROM v_uid AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT COALESCE(refund_free_hours, 8), COALESCE(refund_credit_hours, 3)
  INTO v_free_hours, v_credit_hrs FROM public.settings LIMIT 1;
  v_free_hours := COALESCE(v_free_hours, 8);
  v_credit_hrs := COALESCE(v_credit_hrs, 3);
  v_amount := v_intent.amount;

  -- Henüz tahsil edilmemiş (BLOCKED/PENDING) → blokajı serbest bırak (iadesiz, para çıkmadı)
  IF v_intent.status IN ('PENDING','BLOCKED') THEN
    UPDATE public.payment_intents SET status = 'VOIDED', voided_at = now(),
      void_reason = 'TIERED_REFUND_PRECAPTURE' WHERE id = p_intent_id;
    RETURN jsonb_build_object('intent_id', p_intent_id, 'tier', 'VOID', 'refund', 0);
  END IF;

  IF v_intent.status <> 'CAPTURED' THEN
    RAISE EXCEPTION 'INVALID_STATE: İade yalnızca CAPTURED için, mevcut: %', v_intent.status;
  END IF;

  -- Kademeler: T-free_hours önce → tam iade; T-credit_hrs önce → OYNA kredisi; sonrası → iadesiz
  IF p_hours_to_match >= v_free_hours THEN
    v_tier := 'FULL_REFUND';
    UPDATE public.payment_intents SET status = 'REFUNDED' WHERE id = p_intent_id;
    INSERT INTO public.wallet_transactions (user_id, amount, type, balance_type, status, reference_type, reference_id, description)
    VALUES (v_intent.user_id, v_amount, 'DEPOSIT', 'REFUND_CREDIT', 'COMPLETED', 'REFUND', p_intent_id, 'Tam iade (T-8s öncesi)');
  ELSIF p_hours_to_match >= v_credit_hrs THEN
    v_tier := 'CREDIT';
    UPDATE public.payment_intents SET status = 'REFUNDED' WHERE id = p_intent_id;
    INSERT INTO public.wallet_transactions (user_id, amount, type, balance_type, status, reference_type, reference_id, description)
    VALUES (v_intent.user_id, v_amount, 'DEPOSIT', 'REFUND_CREDIT', 'COMPLETED', 'REFUND', p_intent_id, 'OYNA kredisi iade (T-3s öncesi)');
  ELSE
    v_tier := 'NO_REFUND';
    -- İadesiz: kayıt CAPTURED kalır
  END IF;

  RETURN jsonb_build_object('intent_id', p_intent_id, 'tier', v_tier,
    'refund', CASE WHEN v_tier = 'NO_REFUND' THEN 0 ELSE v_amount END,
    'hours_to_match', p_hours_to_match);
END;
$$;
REVOKE ALL ON FUNCTION public.process_tiered_refund(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_tiered_refund(uuid, numeric) TO authenticated, service_role;

-- ── MEDIUM #21: record_minor_consent — payment_intent sahipliği doğrula ──
CREATE OR REPLACE FUNCTION public.record_minor_consent(
  p_payment_intent_id   uuid,
  p_guardian_name       text,
  p_guardian_phone      text,
  p_guardian_card_last4 text,
  p_consent_text        text
)
RETURNS public.minor_payment_consents
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_record public.minor_payment_consents;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_guardian_name IS NULL OR p_guardian_phone IS NULL THEN
    RAISE EXCEPTION 'GUARDIAN_INFO_REQUIRED';
  END IF;
  -- Sahiplik: verilen payment_intent gerçekten bu kullanıcıya ait olmalı
  IF p_payment_intent_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.payment_intents WHERE id = p_payment_intent_id AND user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'INTENT_NOT_OWNED: Bu ödeme niyeti size ait değil.';
  END IF;

  INSERT INTO public.minor_payment_consents (
    minor_user_id, payment_intent_id, guardian_name, guardian_phone,
    guardian_card_last4, consent_text
  ) VALUES (
    v_uid, p_payment_intent_id, p_guardian_name, p_guardian_phone,
    p_guardian_card_last4, p_consent_text
  )
  RETURNING * INTO v_record;
  RETURN v_record;
END;
$$;
REVOKE ALL ON FUNCTION public.record_minor_consent(uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_minor_consent(uuid, text, text, text, text) TO authenticated;
