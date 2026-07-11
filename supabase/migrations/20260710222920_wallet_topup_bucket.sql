-- [DB GEÇMİŞİNDEN KURTARILDI 2026-07-11] Bu migration canlı veritabanına uygulanmıştı ancak repoda dosyası yoktu; supabase_migrations.schema_migrations.statements kolonundan geri çıkarıldı.

-- CÜZDAN V2 (2/3) — "Yüklenen Bakiye" (TOP_UP) kovası + para yükleme
-- (repo: 20260717000002_wallet_topup_bucket.sql)

-- ─── 1) Kova ve intent tip genişletmeleri ────────────────────────────────────
ALTER TABLE public.wallet_transactions
  DROP CONSTRAINT IF EXISTS wallet_transactions_balance_type_check;
ALTER TABLE public.wallet_transactions
  ADD CONSTRAINT wallet_transactions_balance_type_check
  CHECK (balance_type IN ('EARNINGS','REFUND_CREDIT','TOP_UP'));

ALTER TABLE public.payment_intents
  DROP CONSTRAINT IF EXISTS payment_intents_related_entity_type_check;
ALTER TABLE public.payment_intents
  ADD CONSTRAINT payment_intents_related_entity_type_check
  CHECK (related_entity_type IN ('BOOKING','MATCH','GK_SERVICE','REF_SERVICE','MATCH_DEPOSIT','TOP_UP'));

-- ─── 2) İç yardımcı: kova bakiyeleri ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._wallet_bucket_balances(p_user_id uuid)
RETURNS TABLE (topup_balance numeric, refund_credit_balance numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  SELECT COALESCE(SUM(CASE WHEN type = 'TOP_UP' THEN amount ELSE -amount END), 0)
  INTO topup_balance
  FROM public.wallet_transactions
  WHERE user_id = p_user_id AND balance_type = 'TOP_UP' AND status = 'COMPLETED';

  SELECT COALESCE(SUM(CASE WHEN type IN ('DEPOSIT','REFUND','MATCH_REFUND') THEN amount ELSE -amount END), 0)
  INTO refund_credit_balance
  FROM public.wallet_transactions
  WHERE user_id = p_user_id AND balance_type = 'REFUND_CREDIT' AND status = 'COMPLETED';

  topup_balance         := GREATEST(topup_balance, 0);
  refund_credit_balance := GREATEST(refund_credit_balance, 0);
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public._wallet_bucket_balances(uuid) FROM PUBLIC, anon, authenticated;

-- ─── 3) İç yardımcı: legacy wallet_balance aynası ────────────────────────────
CREATE OR REPLACE FUNCTION public._sync_wallet_mirror(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_b RECORD;
BEGIN
  SELECT * INTO v_b FROM public._wallet_bucket_balances(p_user_id);
  PERFORM set_config('app.wallet_ctx', 'on', true);
  UPDATE public.profiles
  SET wallet_balance = v_b.topup_balance + v_b.refund_credit_balance,
      updated_at = now()
  WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public._sync_wallet_mirror(uuid) FROM PUBLIC, anon, authenticated;

-- ─── 4) get_wallet_summary — üç kova + harcanabilir toplam ───────────────────
CREATE OR REPLACE FUNCTION public.get_wallet_summary()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_earnings numeric;
  v_reserved numeric;
  v_buckets  RECORD;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  SELECT COALESCE(SUM(CASE WHEN type IN ('DEPOSIT','MATCH_EARNING','BOOKING_EARNING','SERVICE_EARNING','REFERRAL_BONUS')
                           THEN amount ELSE -amount END), 0)
  INTO v_earnings
  FROM public.wallet_transactions
  WHERE user_id = v_uid AND balance_type = 'EARNINGS' AND status = 'COMPLETED'
    AND type NOT IN ('MATCH_FEE','MATCH_REFUND','REFUND');

  SELECT COALESCE(SUM(amount), 0)
  INTO v_reserved
  FROM public.wallet_transactions
  WHERE user_id = v_uid AND balance_type = 'EARNINGS'
    AND type = 'WITHDRAWAL' AND status = 'PENDING';

  SELECT * INTO v_buckets FROM public._wallet_bucket_balances(v_uid);

  RETURN jsonb_build_object(
    'earnings_balance',      GREATEST(v_earnings - v_reserved, 0),
    'reserved_balance',      GREATEST(v_reserved, 0),
    'refund_credit_balance', v_buckets.refund_credit_balance,
    'topup_balance',         v_buckets.topup_balance,
    'spendable_balance',     v_buckets.topup_balance + v_buckets.refund_credit_balance
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_wallet_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_wallet_summary() TO authenticated;

-- ─── 5) İç yardımcı: bakiyeden harcama (önce iade kredisi, sonra yüklenen) ───
CREATE OR REPLACE FUNCTION public.wallet_spend_balance(
  p_user_id        uuid,
  p_amount         numeric,
  p_reference_type text,
  p_reference_id   uuid,
  p_match_id       uuid DEFAULT NULL,
  p_description    text DEFAULT 'Cüzdan bakiyesi ile ödeme'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_b           RECORD;
  v_from_refund numeric;
  v_from_topup  numeric;
BEGIN
  IF p_amount <= 0 THEN RAISE EXCEPTION 'GECERSIZ_TUTAR: Ödeme tutarı pozitif olmalıdır.'; END IF;

  PERFORM 1 FROM public.profiles WHERE id = p_user_id FOR UPDATE;

  SELECT * INTO v_b FROM public._wallet_bucket_balances(p_user_id);
  IF (v_b.topup_balance + v_b.refund_credit_balance) < p_amount THEN
    RAISE EXCEPTION 'Yetersiz bakiye. Gerekli: % ₺, Mevcut: % ₺',
      p_amount, (v_b.topup_balance + v_b.refund_credit_balance);
  END IF;

  v_from_refund := LEAST(v_b.refund_credit_balance, p_amount);
  v_from_topup  := p_amount - v_from_refund;

  IF v_from_refund > 0 THEN
    INSERT INTO public.wallet_transactions
      (user_id, match_id, amount, type, balance_type, status, reference_type, reference_id, description)
    VALUES
      (p_user_id, p_match_id, v_from_refund, 'WALLET_PAYMENT', 'REFUND_CREDIT', 'COMPLETED',
       p_reference_type, p_reference_id, p_description);
  END IF;

  IF v_from_topup > 0 THEN
    INSERT INTO public.wallet_transactions
      (user_id, match_id, amount, type, balance_type, status, reference_type, reference_id, description)
    VALUES
      (p_user_id, p_match_id, v_from_topup, 'WALLET_PAYMENT', 'TOP_UP', 'COMPLETED',
       p_reference_type, p_reference_id, p_description);
  END IF;

  PERFORM public._sync_wallet_mirror(p_user_id);

  RETURN jsonb_build_object(
    'spent', p_amount,
    'from_refund_credit', v_from_refund,
    'from_topup', v_from_topup
  );
END;
$$;

REVOKE ALL ON FUNCTION public.wallet_spend_balance(uuid, numeric, text, uuid, uuid, text) FROM PUBLIC, anon, authenticated;

-- ─── 6) wallet_topup — para yükleme (min 300₺, bonus yok) ────────────────────
CREATE OR REPLACE FUNCTION public.wallet_topup(
  p_amount  numeric,
  p_card_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_min      numeric := COALESCE(public.get_config_number('wallet_topup_min', 300), 300);
  v_max      numeric := COALESCE(public.get_config_number('wallet_topup_max', 20000), 20000);
  v_provider text := COALESCE(public.get_config_text('payment_provider', NULL), 'SIMULATION');
  v_card     public.user_saved_cards;
  v_intent   public.payment_intents;
  v_b        RECORD;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  p_amount := round(p_amount, 2);
  IF p_amount < v_min THEN
    RAISE EXCEPTION 'MIN_TOPUP: Minimum yükleme tutarı %₺''dir.', v_min::int;
  END IF;
  IF p_amount > v_max THEN
    RAISE EXCEPTION 'MAX_TOPUP: Tek seferde en fazla %₺ yüklenebilir.', v_max::int;
  END IF;

  IF p_card_id IS NOT NULL THEN
    SELECT * INTO v_card FROM public.user_saved_cards
    WHERE id = p_card_id AND user_id = v_uid;
    IF NOT FOUND THEN RAISE EXCEPTION 'CARD_NOT_FOUND: Kart bulunamadı.'; END IF;
  END IF;

  IF v_provider <> 'SIMULATION' THEN
    RAISE EXCEPTION 'PROVIDER_FLOW_REQUIRED: Canlı modda yükleme ödeme sağlayıcısı üzerinden yapılır.';
  END IF;

  INSERT INTO public.payment_intents (
    user_id, amount, currency, status, provider,
    commission_amount, owner_amount, service_provider_amount,
    commission_model, related_entity_type, paid_at, raw
  ) VALUES (
    v_uid, p_amount, 'TRY', 'PAID', v_provider,
    0, 0, 0,
    'MODEL_A', 'TOP_UP', now(),
    jsonb_build_object('simulated', true, 'card_last4', v_card.last4)
  ) RETURNING * INTO v_intent;

  INSERT INTO public.wallet_transactions
    (user_id, amount, type, balance_type, status, reference_type, reference_id, description, meta)
  VALUES
    (v_uid, p_amount, 'TOP_UP', 'TOP_UP', 'COMPLETED',
     'PAYMENT_INTENT', v_intent.id, 'Cüzdana para yükleme',
     jsonb_build_object('card_last4', v_card.last4));

  PERFORM public._sync_wallet_mirror(v_uid);
  SELECT * INTO v_b FROM public._wallet_bucket_balances(v_uid);

  RETURN jsonb_build_object(
    'ok', true,
    'intent_id', v_intent.id,
    'amount', p_amount,
    'topup_balance', v_b.topup_balance,
    'refund_credit_balance', v_b.refund_credit_balance,
    'spendable_balance', v_b.topup_balance + v_b.refund_credit_balance
  );
END;
$$;

REVOKE ALL ON FUNCTION public.wallet_topup(numeric, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wallet_topup(numeric, uuid) TO authenticated;

-- ─── 7) Backfill: mevcut legacy wallet_balance → TOP_UP kovası ───────────────
DO $$
DECLARE
  r   RECORD;
  v_b RECORD;
BEGIN
  FOR r IN
    SELECT id, COALESCE(wallet_balance, 0) AS wb FROM public.profiles
    WHERE COALESCE(wallet_balance, 0) > 0
  LOOP
    SELECT * INTO v_b FROM public._wallet_bucket_balances(r.id);
    IF r.wb > (v_b.topup_balance + v_b.refund_credit_balance) THEN
      INSERT INTO public.wallet_transactions
        (user_id, amount, type, balance_type, status, reference_type, description)
      VALUES
        (r.id, r.wb - (v_b.topup_balance + v_b.refund_credit_balance),
         'TOP_UP', 'TOP_UP', 'COMPLETED', 'MANUAL',
         'Mevcut bakiye aktarımı (cüzdan v2 geçişi)');
    END IF;
  END LOOP;

  FOR r IN
    SELECT DISTINCT p.id FROM public.profiles p
    WHERE COALESCE(p.wallet_balance, 0) > 0
       OR EXISTS (
         SELECT 1 FROM public.wallet_transactions wt
         WHERE wt.user_id = p.id AND wt.balance_type IN ('TOP_UP','REFUND_CREDIT')
       )
  LOOP
    PERFORM public._sync_wallet_mirror(r.id);
  END LOOP;
END $$;
