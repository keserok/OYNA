-- ==============================================================================
-- FAZ 7 — İade düzeltmeleri (adversarial denetim bulguları)
-- ------------------------------------------------------------------------------
-- BULGU 4 (KRİTİK): process_tiered_refund owner kazanç tersine-çevirmesi yalnız
--   reference_type='PAYMENT_INTENT' (capture_preauth) kayıtlarını yakalıyordu;
--   process_match_at_deadline'ın yazdığı AGGREGE 'MATCH' kazancını kaçırıyordu →
--   quorum-onaylı maçta oyuncu iadesinde owner ÇİFT ödeme alıyordu.
--   Çözüm: önce bu intent'in per-intent PENDING kazancını iptal et; yoksa (aggrege
--   yol) tam olarak bu intent'in owner_amount'u kadar TELAFİ NEGATİF kazanç ekle
--   (release_owner_earnings'te netlenir). Aggrege satırı toptan iptal etmeden,
--   yalnız bu oyuncunun payı düşülür.
-- BULGU 1 (ORTA): PSP kesintisi iade edilen GROSS tutara orantılı olmalı (tam
--   tutara değil) → kısmi iadede çift ceza olmasın. (cancel_app_booking da düzeltilir.)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.process_tiered_refund(p_intent_id uuid, p_hours_to_match numeric, p_policy text DEFAULT 'MATCH')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_intent public.payment_intents;
  v_uid    uuid := auth.uid();
  s        RECORD;
  v_tier   text;
  v_pct    numeric;
  v_gross  numeric;
  v_psp    numeric;
  v_net    numeric;
  v_rc     integer;
BEGIN
  SELECT * INTO v_intent FROM public.payment_intents WHERE id = p_intent_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_uid IS NOT NULL AND v_intent.user_id IS DISTINCT FROM v_uid AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  IF v_intent.status IN ('PENDING','BLOCKED') THEN
    UPDATE public.payment_intents SET status = 'VOIDED', voided_at = now(),
      void_reason = 'TIERED_REFUND_PRECAPTURE' WHERE id = p_intent_id;
    RETURN jsonb_build_object('intent_id', p_intent_id, 'tier', 'VOID', 'refund', 0, 'psp_fee', 0);
  END IF;
  IF v_intent.status NOT IN ('CAPTURED','PAID') THEN
    RAISE EXCEPTION 'INVALID_STATE: İade yalnızca CAPTURED/PAID için, mevcut: %', v_intent.status;
  END IF;

  SELECT COALESCE(refund_free_hours,8) AS free_h, COALESCE(refund_credit_hours,3) AS credit_h,
         COALESCE(booking_refund_full_hours,24) AS bfull_h, COALESCE(booking_refund_half_hours,6) AS bhalf_h,
         COALESCE(booking_refund_half_pct,50) AS bhalf_pct
  INTO s FROM public.settings LIMIT 1;

  IF p_policy = 'BOOKING' THEN
    IF    p_hours_to_match >= s.bfull_h THEN v_tier := 'FULL_REFUND';    v_pct := 100;
    ELSIF p_hours_to_match >= s.bhalf_h THEN v_tier := 'PARTIAL_REFUND'; v_pct := s.bhalf_pct;
    ELSE  v_tier := 'NO_REFUND'; v_pct := 0; END IF;
  ELSE
    IF    p_hours_to_match >= s.free_h   THEN v_tier := 'FULL_REFUND'; v_pct := 100;
    ELSIF p_hours_to_match >= s.credit_h THEN v_tier := 'CREDIT';      v_pct := 100;
    ELSE  v_tier := 'NO_REFUND'; v_pct := 0; END IF;
  END IF;

  IF v_pct <= 0 THEN
    RETURN jsonb_build_object('intent_id', p_intent_id, 'tier', 'NO_REFUND', 'refund', 0, 'pct', 0, 'hours_to_match', p_hours_to_match);
  END IF;

  v_gross := round(v_intent.amount * v_pct / 100.0, 2);
  v_psp   := public._psp_fee(v_gross);                    -- BULGU 1: PSP iade edilen tutara orantılı
  v_net   := GREATEST(0, v_gross - v_psp);

  UPDATE public.payment_intents SET status = 'REFUNDED' WHERE id = p_intent_id;

  -- BULGU 4: owner kazanç telafisi (çift-ödeme önlemi)
  -- (a) per-intent PENDING kazancı varsa iptal et (capture_preauth yolu)
  UPDATE public.wallet_transactions SET status = 'CANCELLED'
   WHERE reference_type = 'PAYMENT_INTENT' AND reference_id = p_intent_id
     AND type = 'MATCH_EARNING' AND status = 'PENDING';
  GET DIAGNOSTICS v_rc = ROW_COUNT;
  -- (b) iptal edilecek per-intent kayıt yoksa (aggrege MATCH yolu) → telafi negatif
  IF v_rc = 0 AND COALESCE(v_intent.owner_amount,0) > 0 AND v_intent.pitch_id IS NOT NULL THEN
    INSERT INTO public.wallet_transactions (user_id, amount, type, balance_type, status, reference_type, reference_id, description)
    SELECT p.owner_id, -v_intent.owner_amount, 'MATCH_EARNING', 'EARNINGS', 'PENDING', 'REFUND', p_intent_id,
           'İade — owner kazanç düzeltmesi (çift-ödeme önlemi)'
    FROM public.pitches p
    WHERE p.id = v_intent.pitch_id AND p.owner_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.wallet_transactions
        WHERE reference_type = 'REFUND' AND reference_id = p_intent_id AND type = 'MATCH_EARNING'
      );
  END IF;

  INSERT INTO public.wallet_transactions (user_id, amount, type, balance_type, status, reference_type, reference_id, description)
  VALUES (v_intent.user_id, v_net, 'DEPOSIT', 'REFUND_CREDIT', 'COMPLETED', 'REFUND', p_intent_id,
          format('Kademeli iade %%%s (PSP -%s) — %s', v_pct, v_psp, p_policy));

  RETURN jsonb_build_object('intent_id', p_intent_id, 'tier', v_tier, 'pct', v_pct,
    'gross', v_gross, 'psp_fee', v_psp, 'refund', v_net, 'hours_to_match', p_hours_to_match);
END;
$$;
REVOKE ALL ON FUNCTION public.process_tiered_refund(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_tiered_refund(uuid, numeric, text) TO authenticated, service_role;

-- cancel_app_booking: PSP iade edilen gross'a orantılı (BULGU 1)
CREATE OR REPLACE FUNCTION public.cancel_app_booking(p_booking_id uuid, p_reason text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  b RECORD;
  s RECORD;
  v_start timestamp;
  v_now_tr timestamp := (now() AT TIME ZONE 'Europe/Istanbul');
  v_hours numeric;
  v_pct numeric;
  v_gross numeric;
  v_psp numeric;
  v_refund numeric := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED: Giris gerekli.'; END IF;

  SELECT * INTO b FROM public.pitch_bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Rezervasyon bulunamadi.'; END IF;
  IF b.user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'UNAUTHORIZED: Bu rezervasyon size ait degil.'; END IF;
  IF b.source NOT IN ('APP_BOOKING', 'APP_MATCH') THEN
    RAISE EXCEPTION 'INVALID_SOURCE: Bu rezervasyon uygulamadan iptal edilemez.';
  END IF;
  IF b.status = 'CANCELLED' THEN RAISE EXCEPTION 'ALREADY_CANCELLED: Rezervasyon zaten iptal edilmis.'; END IF;

  v_start := (b.booking_date + b.start_time)::timestamp;
  IF v_start <= v_now_tr THEN
    RAISE EXCEPTION 'ALREADY_STARTED: Gecmis veya baslamis rezervasyon iptal edilemez.';
  END IF;

  SELECT COALESCE(booking_refund_full_hours,24) AS full_h, COALESCE(booking_refund_half_hours,6) AS half_h,
         COALESCE(booking_refund_half_pct,50) AS half_pct
  INTO s FROM public.settings LIMIT 1;
  v_hours := EXTRACT(EPOCH FROM (v_start - v_now_tr)) / 3600.0;
  v_pct := CASE WHEN v_hours >= s.full_h THEN 100
                WHEN v_hours >= s.half_h THEN s.half_pct
                ELSE 0 END;
  v_gross := round(COALESCE(b.paid_amount, 0) * v_pct / 100.0, 2);
  v_psp   := public._psp_fee(v_gross);
  v_refund := GREATEST(0, v_gross - v_psp);

  UPDATE public.pitch_bookings SET
    status = 'CANCELLED',
    cancelled_at = now(),
    cancelled_by = auth.uid(),
    cancellation_reason = COALESCE(p_reason, 'Oyuncu iptali (kademeli iade)'),
    payment_status = CASE WHEN COALESCE(paid_amount, 0) > 0 AND v_refund > 0 THEN 'REFUNDED' ELSE payment_status END
  WHERE id = p_booking_id;

  IF COALESCE(b.paid_amount, 0) > 0 AND v_refund > 0
     AND NOT EXISTS (
       SELECT 1 FROM public.wallet_transactions
       WHERE user_id = b.user_id AND reference_type = 'BOOKING' AND reference_id = p_booking_id
         AND balance_type = 'REFUND_CREDIT'
     ) THEN
    INSERT INTO public.wallet_transactions
      (user_id, amount, type, balance_type, status, reference_type, reference_id, description)
    VALUES (b.user_id, v_refund, 'DEPOSIT', 'REFUND_CREDIT', 'COMPLETED', 'BOOKING', p_booking_id,
            format('Rezervasyon iptali — %%%s iade (PSP -%s)', v_pct, v_psp));
  END IF;

  RETURN jsonb_build_object(
    'booking_id', p_booking_id, 'refund_percent', v_pct, 'refund_amount', v_refund,
    'psp_fee', v_psp, 'paid_amount', COALESCE(b.paid_amount, 0)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_app_booking(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_app_booking(uuid, text) TO authenticated, service_role;
