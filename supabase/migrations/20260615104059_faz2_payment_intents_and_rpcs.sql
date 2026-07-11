-- ============================================================
-- FAZ 2 — Ödeme modeli (sağlayıcı-bağımsız kapora tahsilatı)
-- Canlıya uygulandı: faz2_payment_intents_and_rpcs
-- payment_intents: her ödeme denemesi. Komisyon (platform) / owner ayrımı kaydedilir.
-- create_payment_intent: oyuncu kendi rezervasyonu için niyet oluşturur (auth.uid kontrollü).
-- apply_booking_payment: ödeme onayını uygular (yalnız service_role = edge function). Idempotent.
-- fail_payment_intent: başarısız ödemeyi işaretler (service_role).
-- GERÇEK PARA için bir ödeme sağlayıcısı (iyzico/PayTR) + edge function gerekir.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.payment_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.pitch_bookings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  pitch_id uuid REFERENCES public.pitches(id),
  amount numeric NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'TRY',
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PAID','FAILED','REFUNDED')),
  provider text NOT NULL DEFAULT 'SIMULATION',
  provider_ref text,
  commission_amount numeric NOT NULL DEFAULT 0,
  owner_amount numeric NOT NULL DEFAULT 0,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_payment_intents_booking ON public.payment_intents(booking_id);
CREATE INDEX IF NOT EXISTS idx_payment_intents_user ON public.payment_intents(user_id);

ALTER TABLE public.payment_intents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own payment intents" ON public.payment_intents;
CREATE POLICY "Users view own payment intents"
  ON public.payment_intents FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.create_payment_intent(
  p_booking_id uuid,
  p_provider text DEFAULT 'SIMULATION'
)
RETURNS public.payment_intents
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  b RECORD; v_rate numeric; v_amount numeric; v_commission numeric;
  v_existing public.payment_intents; v_intent public.payment_intents;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED: Giris gerekli.'; END IF;
  SELECT * INTO b FROM public.pitch_bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Rezervasyon bulunamadi.'; END IF;
  IF b.user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'UNAUTHORIZED: Bu rezervasyon size ait degil.'; END IF;
  IF b.status = 'CANCELLED' THEN RAISE EXCEPTION 'CANCELLED: Iptal edilmis rezervasyon odenemez.'; END IF;
  v_amount := COALESCE(b.deposit_amount, 0);
  IF v_amount <= 0 THEN RAISE EXCEPTION 'NO_DEPOSIT: Bu rezervasyon icin online kapora gerekmiyor.'; END IF;
  IF EXISTS (SELECT 1 FROM public.payment_intents WHERE booking_id = p_booking_id AND status = 'PAID') THEN
    RAISE EXCEPTION 'ALREADY_PAID: Bu rezervasyonun kaporasi zaten odenmis.';
  END IF;
  SELECT * INTO v_existing FROM public.payment_intents
    WHERE booking_id = p_booking_id AND status = 'PENDING' ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN RETURN v_existing; END IF;
  SELECT COALESCE(platform_commission_rate, 10.0) INTO v_rate FROM public.pitches WHERE id = b.pitch_id;
  v_commission := round(v_amount * COALESCE(v_rate, 10.0) / 100.0, 2);
  INSERT INTO public.payment_intents (booking_id, user_id, pitch_id, amount, provider, commission_amount, owner_amount)
  VALUES (p_booking_id, auth.uid(), b.pitch_id, v_amount, p_provider, v_commission, v_amount - v_commission)
  RETURNING * INTO v_intent;
  RETURN v_intent;
END;
$$;
REVOKE ALL ON FUNCTION public.create_payment_intent(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_payment_intent(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_payment_intent(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.apply_booking_payment(
  p_intent_id uuid, p_provider_ref text DEFAULT NULL, p_raw jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE i public.payment_intents; b RECORD; v_new_paid numeric; v_pay_status text;
BEGIN
  SELECT * INTO i FROM public.payment_intents WHERE id = p_intent_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Odeme niyeti bulunamadi.'; END IF;
  IF i.status = 'PAID' THEN RETURN jsonb_build_object('intent_id', i.id, 'status', 'PAID', 'idempotent', true); END IF;
  UPDATE public.payment_intents
    SET status = 'PAID', paid_at = now(), provider_ref = COALESCE(p_provider_ref, provider_ref), raw = COALESCE(p_raw, raw)
    WHERE id = p_intent_id;
  SELECT * INTO b FROM public.pitch_bookings WHERE id = i.booking_id FOR UPDATE;
  v_new_paid := COALESCE(b.paid_amount, 0) + i.amount;
  v_pay_status := CASE WHEN v_new_paid >= COALESCE(b.price, 0) AND COALESCE(b.price,0) > 0 THEN 'PAID' ELSE 'PARTIAL' END;
  UPDATE public.pitch_bookings SET paid_amount = v_new_paid, payment_status = v_pay_status WHERE id = i.booking_id;
  INSERT INTO public.booking_payments (booking_id, amount, payment_method, note)
  VALUES (i.booking_id, i.amount, 'CARD', 'Uygulama kaporasi (' || i.provider || ')');
  RETURN jsonb_build_object('intent_id', i.id, 'status', 'PAID', 'booking_id', i.booking_id,
    'amount', i.amount, 'commission', i.commission_amount, 'owner_amount', i.owner_amount,
    'booking_payment_status', v_pay_status);
END;
$$;
REVOKE ALL ON FUNCTION public.apply_booking_payment(uuid, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_booking_payment(uuid, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.apply_booking_payment(uuid, text, jsonb) FROM authenticated;

CREATE OR REPLACE FUNCTION public.fail_payment_intent(p_intent_id uuid, p_raw jsonb DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.payment_intents SET status = 'FAILED', raw = COALESCE(p_raw, raw)
    WHERE id = p_intent_id AND status = 'PENDING';
END;
$$;
REVOKE ALL ON FUNCTION public.fail_payment_intent(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fail_payment_intent(uuid, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.fail_payment_intent(uuid, jsonb) FROM authenticated;
