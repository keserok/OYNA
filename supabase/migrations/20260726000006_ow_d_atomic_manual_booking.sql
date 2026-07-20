-- ==============================================================================
-- OW-D / OP-P0-1 — Atomik + idempotent manuel rezervasyon (rezervasyon + nakit
-- ödeme TEK transaction). Ödeme MANUEL yürüdüğü için otomatik payout YOK; bu
-- yalnız defter bütünlüğü: "CONFIRMED rezervasyon var ama tahsilat kaydı yok"
-- (ya da tersi) durumunu kapatır.
-- ------------------------------------------------------------------------------
-- SORUN: OwnerPanel createManualBooking (RPC) sonrası AYRI recordBookingPayment
-- çağırıyordu. İkinci adım ağ/hata ile kesilirse rezervasyon CONFIRMED ama
-- paid_amount=0 kalan tutarsız kayıt oluşuyordu.
--
-- ÇÖZÜM: owner_create_manual_booking — mevcut create_pitch_booking'i (test
-- edilmiş yetki/çakışma/tarife mantığı) İÇ transaction'da çağırır, hemen ardından
-- nakit ödemeyi booking_payments'a source='OWNER_MANUAL' ile yazar. İkisi tek
-- transaction: biri düşerse ikisi de geri alınır. client_request_id ile idempotent
-- (ağ timeout retry'ı ikinci rezervasyon/ödeme YARATMAZ; ilk sonucu döner).
-- ==============================================================================

-- ─── 1) İdempotency defteri ────────────────────────────────────────────────
-- client_request_id UNIQUE → eşzamanlı retry'ları serialize eder (ikinci INSERT
-- ilk commit olana dek bloke olur, sonra saklanmış sonucu döner).
CREATE TABLE IF NOT EXISTS public.owner_client_ops (
  client_request_id uuid PRIMARY KEY,
  op_type    text NOT NULL,
  result     jsonb,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.owner_client_ops ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own ops read" ON public.owner_client_ops;
CREATE POLICY "own ops read" ON public.owner_client_ops FOR SELECT TO authenticated
  USING (created_by = (SELECT auth.uid()) OR public.is_admin());
-- Yazma yalnız SECURITY DEFINER RPC üzerinden (doğrudan INSERT/UPDATE yok).
REVOKE INSERT, UPDATE, DELETE ON public.owner_client_ops FROM authenticated, anon;

-- ─── 2) Atomik manuel rezervasyon RPC ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.owner_create_manual_booking(
  p_pitch_id        uuid,
  p_court_id        uuid,
  p_booking_date    date,
  p_start_time      time,
  p_end_time        time,
  p_customer_name   text DEFAULT NULL,
  p_customer_phone  text DEFAULT NULL,
  p_payment_status  text DEFAULT 'PENDING',   -- 'PENDING' | 'PARTIAL' | 'PAID'
  p_paid_amount     numeric DEFAULT 0,
  p_payment_method  text DEFAULT 'CASH',
  p_client_request_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_claimed   integer := 0;
  v_existing  jsonb;
  v_booking_id uuid;
  v_result    jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED: Giris gerekli.'; END IF;
  IF p_payment_status NOT IN ('PENDING','PARTIAL','PAID') THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_STATUS';
  END IF;

  -- İdempotency: request id'yi ÖNCE claim et (UNIQUE serialize eder).
  IF p_client_request_id IS NOT NULL THEN
    INSERT INTO public.owner_client_ops (client_request_id, op_type, created_by)
    VALUES (p_client_request_id, 'MANUAL_BOOKING', v_uid)
    ON CONFLICT (client_request_id) DO NOTHING;
    GET DIAGNOSTICS v_claimed = ROW_COUNT;
    IF v_claimed = 0 THEN
      -- Zaten işlenmiş (ya da eşzamanlı işleniyor → commit'e dek bloke olmuştuk).
      SELECT result INTO v_existing FROM public.owner_client_ops
      WHERE client_request_id = p_client_request_id;
      RETURN COALESCE(v_existing, jsonb_build_object('status','DUPLICATE_IN_FLIGHT'));
    END IF;
  END IF;

  -- Rezervasyon (yetki/çakışma/tarife mantığı create_pitch_booking'te; OWNER_MANUAL
  -- → CONFIRMED; slot çakışması → SLOT_TAKEN exception → tüm transaction geri alınır,
  -- claim satırı dahil).
  v_booking_id := public.create_pitch_booking(
    p_pitch_id, p_court_id, p_booking_date, p_start_time, p_end_time,
    'OWNER_MANUAL', p_customer_name, p_customer_phone, NULL, NULL);

  -- Nakit ödeme AYNI transaction'da. source='OWNER_MANUAL' → cüzdana kredi yazılmaz
  -- (credit_owner_booking_earning trigger'ı bunu atlar). paid_amount/payment_status
  -- booking_payments trigger'ıyla güncellenir.
  IF p_payment_status IN ('PAID','PARTIAL') AND COALESCE(p_paid_amount,0) > 0 THEN
    INSERT INTO public.booking_payments (booking_id, amount, payment_method, note, recorded_by, source)
    VALUES (v_booking_id, p_paid_amount, COALESCE(NULLIF(p_payment_method,''),'CASH'),
            CASE WHEN p_payment_status='PARTIAL' THEN 'Kapora' ELSE NULL END,
            v_uid, 'OWNER_MANUAL');
  END IF;

  v_result := jsonb_build_object('booking_id', v_booking_id, 'payment_status', p_payment_status);

  IF p_client_request_id IS NOT NULL THEN
    UPDATE public.owner_client_ops SET result = v_result
    WHERE client_request_id = p_client_request_id;
  END IF;

  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.owner_create_manual_booking(uuid,uuid,date,time,time,text,text,text,numeric,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_create_manual_booking(uuid,uuid,date,time,time,text,text,text,numeric,text,uuid) TO authenticated;
