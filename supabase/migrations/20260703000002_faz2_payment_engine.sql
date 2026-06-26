-- ==============================================================================
-- FAZ 2 — Para Akışı & Komisyon Motoru
-- iyzico pre-auth (blokaj→tahsil→void) + çok-seviyeli komisyon
-- OYNA cüzdanı (iki bakiye tipi) + payout sistemi + 18 yaş altı akışı
-- ==============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. payment_intents: iyzico pre-auth state machine + ek sütunlar
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.payment_intents
  DROP CONSTRAINT IF EXISTS payment_intents_status_check;

ALTER TABLE public.payment_intents
  ADD CONSTRAINT payment_intents_status_check
  CHECK (status IN ('PENDING','BLOCKED','CAPTURED','PAID','FAILED','REFUNDED','VOIDED'));

ALTER TABLE public.payment_intents
  ADD COLUMN IF NOT EXISTS iyzico_token       text,
  ADD COLUMN IF NOT EXISTS conversation_id    text,
  ADD COLUMN IF NOT EXISTS basket_id          text,
  ADD COLUMN IF NOT EXISTS blocked_at         timestamptz,
  ADD COLUMN IF NOT EXISTS captured_at        timestamptz,
  ADD COLUMN IF NOT EXISTS voided_at          timestamptz,
  ADD COLUMN IF NOT EXISTS match_id           uuid REFERENCES public.matches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS related_entity_type text
      CHECK (related_entity_type IN ('BOOKING','MATCH','GK_SERVICE','REF_SERVICE')),
  ADD COLUMN IF NOT EXISTS commission_model   text NOT NULL DEFAULT 'MODEL_A'
      CHECK (commission_model IN ('MODEL_A','MODEL_B')),
  ADD COLUMN IF NOT EXISTS void_reason        text,
  ADD COLUMN IF NOT EXISTS service_provider_amount numeric NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_payment_intents_match ON public.payment_intents(match_id);
CREATE INDEX IF NOT EXISTS idx_payment_intents_status ON public.payment_intents(status);

-- ────────────────────────────────────────────────────────────────────────────
-- 2. commission_config: çok seviyeli, admin ayarlı komisyon tablosu
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.commission_config (
  id         uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  scope      text    NOT NULL CHECK (scope IN ('GLOBAL','PITCH','SERVICE_GK','SERVICE_REF','MATCH')),
  scope_id   uuid,
  model      text    NOT NULL DEFAULT 'MODEL_A' CHECK (model IN ('MODEL_A','MODEL_B')),
  rate_pct   numeric NOT NULL CHECK (rate_pct BETWEEN 0 AND 100),
  markup_pct numeric NOT NULL DEFAULT 0 CHECK (markup_pct BETWEEN 0 AND 100),
  is_active  boolean NOT NULL DEFAULT true,
  notes      text,
  created_by uuid    REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.commission_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manages commission_config" ON public.commission_config;
CREATE POLICY "Admin manages commission_config"
  ON public.commission_config FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "Authenticated users read commission_config" ON public.commission_config;
CREATE POLICY "Authenticated users read commission_config"
  ON public.commission_config FOR SELECT TO authenticated
  USING (is_active = true);

INSERT INTO public.commission_config (scope, model, rate_pct, notes) VALUES
  ('GLOBAL',      'MODEL_A', 15.0, 'Varsayılan saha kapora komisyonu (Model A: %15)'),
  ('SERVICE_GK',  'MODEL_A', 10.0, 'Kaleci hizmet komisyonu (%10)'),
  ('SERVICE_REF', 'MODEL_A', 10.0, 'Hakem hizmet komisyonu (%10)')
ON CONFLICT DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. wallet_transactions: iki bakiye tipi (EARNINGS vs REFUND_CREDIT)
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.wallet_transactions
  ADD COLUMN IF NOT EXISTS balance_type    text NOT NULL DEFAULT 'EARNINGS'
      CHECK (balance_type IN ('EARNINGS','REFUND_CREDIT')),
  ADD COLUMN IF NOT EXISTS status          text NOT NULL DEFAULT 'COMPLETED'
      CHECK (status IN ('PENDING','COMPLETED','FAILED','CANCELLED')),
  ADD COLUMN IF NOT EXISTS reference_type  text
      CHECK (reference_type IN ('PAYMENT_INTENT','BOOKING','MATCH','PAYOUT','REFUND','MANUAL')),
  ADD COLUMN IF NOT EXISTS reference_id    uuid,
  ADD COLUMN IF NOT EXISTS meta            jsonb;

CREATE INDEX IF NOT EXISTS idx_wallet_tx_user_type
  ON public.wallet_transactions(user_id, balance_type, status);

-- ────────────────────────────────────────────────────────────────────────────
-- 4. payout_requests: birleşik payout tablosu (owner 2 haftalık + anlık)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payout_requests (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES public.profiles(id),
  amount              numeric NOT NULL CHECK (amount > 0),
  iban                text NOT NULL,
  iban_holder_name    text NOT NULL,
  status              text NOT NULL DEFAULT 'PENDING'
      CHECK (status IN ('PENDING','PROCESSING','COMPLETED','FAILED','CANCELLED')),
  payout_type         text NOT NULL
      CHECK (payout_type IN ('OWNER_BIWEEKLY','PROVIDER_INSTANT','MANUAL')),
  related_entity_type text
      CHECK (related_entity_type IN ('BOOKING','MATCH','GK_SERVICE','REF_SERVICE')),
  related_entity_id   uuid,
  scheduled_for       timestamptz,
  processed_at        timestamptz,
  processed_by        uuid REFERENCES public.profiles(id),
  admin_notes         text,
  iyzico_payout_ref   text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own payout_requests" ON public.payout_requests;
CREATE POLICY "Users view own payout_requests"
  ON public.payout_requests FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users create own payout_requests" ON public.payout_requests;
CREATE POLICY "Users create own payout_requests"
  ON public.payout_requests FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND status = 'PENDING');

DROP POLICY IF EXISTS "Admin manages payout_requests" ON public.payout_requests;
CREATE POLICY "Admin manages payout_requests"
  ON public.payout_requests FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

CREATE INDEX IF NOT EXISTS idx_payout_requests_user ON public.payout_requests(user_id, status);
CREATE INDEX IF NOT EXISTS idx_payout_requests_scheduled ON public.payout_requests(scheduled_for) WHERE status = 'PENDING';

-- ────────────────────────────────────────────────────────────────────────────
-- 5. minor_payment_consents: 18 yaş altı veli onayı
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.minor_payment_consents (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  minor_user_id      uuid NOT NULL REFERENCES public.profiles(id),
  payment_intent_id  uuid REFERENCES public.payment_intents(id),
  guardian_name      text NOT NULL,
  guardian_phone     text NOT NULL,
  guardian_card_last4 text,
  consent_text       text NOT NULL,
  consented_at       timestamptz NOT NULL DEFAULT now(),
  ip_address         text
);

ALTER TABLE public.minor_payment_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin reads minor_payment_consents" ON public.minor_payment_consents;
CREATE POLICY "Admin reads minor_payment_consents"
  ON public.minor_payment_consents FOR SELECT TO authenticated
  USING (public.is_platform_admin());

DROP POLICY IF EXISTS "Users insert own minor_consent" ON public.minor_payment_consents;
CREATE POLICY "Users insert own minor_consent"
  ON public.minor_payment_consents FOR INSERT TO authenticated
  WITH CHECK (minor_user_id = (SELECT auth.uid()));

-- ────────────────────────────────────────────────────────────────────────────
-- 6. RPC: calculate_commission — komisyon hesaplama yardımcısı
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.calculate_commission(
  p_amount      numeric,
  p_scope       text    DEFAULT 'GLOBAL',
  p_scope_id    uuid    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cfg  RECORD;
  v_rate numeric;
  v_comm numeric;
  v_net  numeric;
BEGIN
  -- Önce scope'a özel, yoksa global
  SELECT rate_pct, model, markup_pct INTO v_cfg
  FROM public.commission_config
  WHERE scope = p_scope AND is_active = true
    AND (p_scope_id IS NULL OR scope_id = p_scope_id)
  ORDER BY (scope_id IS NOT NULL) DESC
  LIMIT 1;

  IF NOT FOUND THEN
    SELECT rate_pct, model, markup_pct INTO v_cfg
    FROM public.commission_config WHERE scope = 'GLOBAL' AND is_active = true LIMIT 1;
  END IF;

  v_rate := COALESCE(v_cfg.rate_pct, 15.0);
  v_comm := round(p_amount * v_rate / 100.0, 2);
  v_net  := p_amount - v_comm;

  RETURN jsonb_build_object(
    'amount',          p_amount,
    'commission_pct',  v_rate,
    'commission_amt',  v_comm,
    'net_amount',      v_net,
    'model',           COALESCE(v_cfg.model, 'MODEL_A')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.calculate_commission(numeric, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calculate_commission(numeric, text, uuid) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 7. RPC: create_match_preauth — maç katılımı için blokaj oluştur
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_match_preauth(
  p_match_id    uuid,
  p_amount      numeric,
  p_provider    text DEFAULT 'IYZICO'
)
RETURNS public.payment_intents
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_comm    jsonb;
  v_intent  public.payment_intents;
  v_existing public.payment_intents;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;

  -- Mevcut aktif blokaj var mı?
  SELECT * INTO v_existing FROM public.payment_intents
  WHERE match_id = p_match_id AND user_id = v_uid
    AND status IN ('PENDING','BLOCKED') ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN RETURN v_existing; END IF;

  v_comm := public.calculate_commission(p_amount, 'GLOBAL');

  INSERT INTO public.payment_intents (
    user_id, match_id, amount, currency, status, provider,
    commission_amount, owner_amount, service_provider_amount,
    commission_model, related_entity_type
  ) VALUES (
    v_uid, p_match_id, p_amount, 'TRY', 'PENDING', p_provider,
    (v_comm->>'commission_amt')::numeric,
    (v_comm->>'net_amount')::numeric,
    0,
    v_comm->>'model',
    'MATCH'
  )
  RETURNING * INTO v_intent;

  RETURN v_intent;
END;
$$;

REVOKE ALL ON FUNCTION public.create_match_preauth(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_match_preauth(uuid, numeric, text) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 8. RPC: apply_preauth_block — iyzico blokaj onayı (service_role çağırır)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.apply_preauth_block(
  p_intent_id      uuid,
  p_iyzico_token   text,
  p_conversation_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_intent public.payment_intents;
BEGIN
  SELECT * INTO v_intent FROM public.payment_intents WHERE id = p_intent_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Odeme niyeti bulunamadi.'; END IF;
  IF v_intent.status = 'BLOCKED' THEN
    RETURN jsonb_build_object('intent_id', v_intent.id, 'status', 'BLOCKED', 'idempotent', true);
  END IF;
  IF v_intent.status NOT IN ('PENDING') THEN
    RAISE EXCEPTION 'INVALID_STATE: Beklenen PENDING, mevcut: %', v_intent.status;
  END IF;

  UPDATE public.payment_intents SET
    status = 'BLOCKED',
    iyzico_token = p_iyzico_token,
    conversation_id = p_conversation_id,
    blocked_at = now()
  WHERE id = p_intent_id;

  RETURN jsonb_build_object('intent_id', p_intent_id, 'status', 'BLOCKED');
END;
$$;

REVOKE ALL ON FUNCTION public.apply_preauth_block(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_preauth_block(uuid, text, text) TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 9. RPC: capture_preauth — T-8s onayda tahsil (service_role çağırır)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.capture_preauth(
  p_intent_id     uuid,
  p_provider_ref  text DEFAULT NULL,
  p_raw           jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_intent public.payment_intents;
BEGIN
  SELECT * INTO v_intent FROM public.payment_intents WHERE id = p_intent_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_intent.status = 'CAPTURED' THEN
    RETURN jsonb_build_object('intent_id', v_intent.id, 'status', 'CAPTURED', 'idempotent', true);
  END IF;
  IF v_intent.status NOT IN ('BLOCKED','PENDING') THEN
    RAISE EXCEPTION 'INVALID_STATE: Yakalama icin BLOCKED/PENDING bekleniyor, mevcut: %', v_intent.status;
  END IF;

  UPDATE public.payment_intents SET
    status = 'CAPTURED',
    captured_at = now(),
    provider_ref = COALESCE(p_provider_ref, provider_ref),
    raw = COALESCE(p_raw, raw)
  WHERE id = p_intent_id;

  -- Saha sahibi kazancını EARNINGS bakiyesine yaz
  INSERT INTO public.wallet_transactions (user_id, amount, type, balance_type, status, reference_type, reference_id, description)
  SELECT p.owner_id, v_intent.owner_amount, 'MATCH_EARNING', 'EARNINGS', 'PENDING',
         'PAYMENT_INTENT', p_intent_id,
         'Maç kapora tahsilatı (serbest bırakma 2 hafta)'
  FROM public.pitches p
  WHERE p.id = v_intent.pitch_id
    AND p.owner_id IS NOT NULL;

  RETURN jsonb_build_object(
    'intent_id',     p_intent_id,
    'status',        'CAPTURED',
    'amount',        v_intent.amount,
    'commission',    v_intent.commission_amount,
    'owner_amount',  v_intent.owner_amount
  );
END;
$$;

REVOKE ALL ON FUNCTION public.capture_preauth(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.capture_preauth(uuid, text, jsonb) TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 10. RPC: void_preauth — blokajı iptal et (service_role veya authenticated)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.void_preauth(
  p_intent_id   uuid,
  p_void_reason text DEFAULT 'USER_CANCELLED'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_intent public.payment_intents;
  v_uid    uuid := auth.uid();
BEGIN
  SELECT * INTO v_intent FROM public.payment_intents WHERE id = p_intent_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_intent.status = 'VOIDED' THEN
    RETURN jsonb_build_object('intent_id', v_intent.id, 'status', 'VOIDED', 'idempotent', true);
  END IF;
  IF v_intent.status NOT IN ('PENDING','BLOCKED') THEN
    RAISE EXCEPTION 'INVALID_STATE: PENDING veya BLOCKED bekleniyor, mevcut: %', v_intent.status;
  END IF;
  -- Kendi ödeme niyeti veya admin
  IF v_uid IS NOT NULL AND v_intent.user_id IS DISTINCT FROM v_uid AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  UPDATE public.payment_intents SET
    status = 'VOIDED', voided_at = now(), void_reason = p_void_reason
  WHERE id = p_intent_id;

  RETURN jsonb_build_object('intent_id', p_intent_id, 'status', 'VOIDED', 'reason', p_void_reason);
END;
$$;

REVOKE ALL ON FUNCTION public.void_preauth(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_preauth(uuid, text) TO authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 11. RPC: get_wallet_summary — cüzdan bakiyesi (iki tip)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_wallet_summary()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_earnings   numeric;
  v_refund     numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  SELECT COALESCE(SUM(CASE WHEN type IN ('DEPOSIT','MATCH_EARNING','REFERRAL_BONUS') THEN amount ELSE -amount END), 0)
  INTO v_earnings
  FROM public.wallet_transactions
  WHERE user_id = v_uid AND balance_type = 'EARNINGS' AND status = 'COMPLETED';

  SELECT COALESCE(SUM(CASE WHEN type = 'DEPOSIT' THEN amount ELSE -amount END), 0)
  INTO v_refund
  FROM public.wallet_transactions
  WHERE user_id = v_uid AND balance_type = 'REFUND_CREDIT' AND status = 'COMPLETED';

  RETURN jsonb_build_object(
    'earnings_balance',      GREATEST(v_earnings, 0),
    'refund_credit_balance', GREATEST(v_refund, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_wallet_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_wallet_summary() TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 12. RPC: request_payout — kullanıcı IBAN'ına ödeme talebi
-- ────────────────────────────────────────────────────────────────────────────
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
  v_uid       uuid := auth.uid();
  v_balance   numeric;
  v_wallet    jsonb;
  v_payout    public.payout_requests;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT: Tutar sifirdan buyuk olmali.'; END IF;
  IF p_iban IS NULL OR length(trim(p_iban)) < 10 THEN RAISE EXCEPTION 'INVALID_IBAN'; END IF;

  v_wallet := public.get_wallet_summary();
  v_balance := (v_wallet->>'earnings_balance')::numeric;

  IF v_balance < p_amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE: Bakiye yetersiz. Mevcut: %', v_balance;
  END IF;

  -- Bekleyen ödeme talebi var mı?
  IF EXISTS (SELECT 1 FROM public.payout_requests WHERE user_id = v_uid AND status = 'PENDING') THEN
    RAISE EXCEPTION 'PENDING_PAYOUT: Bekleyen odeme talebiniz mevcut.';
  END IF;

  INSERT INTO public.payout_requests (user_id, amount, iban, iban_holder_name, payout_type)
  VALUES (v_uid, p_amount, p_iban, p_iban_holder_name, p_payout_type)
  RETURNING * INTO v_payout;

  -- Kazanç bakiyesini blokla (PENDING işlem olarak yaz)
  INSERT INTO public.wallet_transactions (user_id, amount, type, balance_type, status, reference_type, reference_id, description)
  VALUES (v_uid, p_amount, 'WITHDRAWAL', 'EARNINGS', 'PENDING', 'PAYOUT', v_payout.id, 'IBAN odeme talebi');

  RETURN v_payout;
END;
$$;

REVOKE ALL ON FUNCTION public.request_payout(numeric, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_payout(numeric, text, text, text) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 13. RPC: record_minor_consent — 18 yaş altı veli onayı kaydet
-- ────────────────────────────────────────────────────────────────────────────
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

-- ────────────────────────────────────────────────────────────────────────────
-- 14. settings tablosuna FAZ 2 alanları ekle
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS "iyzico_sandbox_mode"   boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS "capture_window_hours"  numeric DEFAULT 8,
  ADD COLUMN IF NOT EXISTS "min_quorum_pct"        numeric DEFAULT 70,
  ADD COLUMN IF NOT EXISTS "owner_payout_days"     integer DEFAULT 14,
  ADD COLUMN IF NOT EXISTS "refund_free_hours"     numeric DEFAULT 8,
  ADD COLUMN IF NOT EXISTS "refund_credit_hours"   numeric DEFAULT 3;
