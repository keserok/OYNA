-- ==============================================================================
-- A5 — reverse_booking_earnings() + iptal yollarına bağlama
-- ------------------------------------------------------------------------------
-- Sorun (denetim OP-P0-5): Kart kaporası ile ödenen bir rezervasyon iptal edilince
-- oyuncuya iade yapılıyor AMA owner'ın BOOKING_EARNING kazancı geri alınmıyor →
-- owner iade edilmiş rezervasyondan gelir tutuyor (çifte-ödeme açığı).
--
-- KRİTİK JOIN TUZAĞI: credit_owner_booking_earning trigger'ı
-- reference_id = booking_payments.id yazar (pitch_bookings.id DEĞİL). Bu yüzden
-- reversal booking_payments üzerinden join etmelidir; reference_id = p_booking_id
-- ile arama hiçbir satır bulmaz (sessiz no-op).
--
-- ÇİFT-İADE YOK: process_tiered_refund (20260707000008) yalnız MATCH_EARNING'i
-- (reference_type='REFUND', type='MATCH_EARNING') çevirir. Bu fonksiyon
-- BOOKING_EARNING'i çevirir → farklı tip/referans, çakışmaz. BOOKING_EARNING bugün
-- HİÇBİR yerde geri alınmıyor; bu ilk reversal yolu.
--
-- İDEMPOTENT: PENDING → CANCELLED (ikinci çalıştırmada eşleşme kalmaz); COMPLETED →
-- negatif telafi, NOT EXISTS(REFUND+BOOKING_EARNING) guard'ı ile tek kez.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.reverse_booking_earnings(p_booking_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- (1) Henüz serbest bırakılmamış (PENDING) owner kazancı → CANCELLED.
  --     get_wallet_summary yalnız COMPLETED sayar → bakiyeden anında düşer,
  --     release_owner_earnings cron'u da PENDING olmadığı için atlar.
  UPDATE public.wallet_transactions wt
     SET status = 'CANCELLED'
   WHERE wt.type = 'BOOKING_EARNING'
     AND wt.reference_type = 'BOOKING'
     AND wt.status = 'PENDING'
     AND wt.reference_id IN (
       SELECT bp.id FROM public.booking_payments bp WHERE bp.booking_id = p_booking_id
     );

  -- (2) Zaten serbest bırakılmış (COMPLETED) kazanç → negatif telafi satırı (COMPLETED).
  --     tip='BOOKING_EARNING' NOT EXISTS guard'ı çift-reversal'ı önler.
  INSERT INTO public.wallet_transactions
    (user_id, amount, type, balance_type, status, reference_type, reference_id, description)
  SELECT wt.user_id, -wt.amount, 'BOOKING_EARNING', 'EARNINGS', 'COMPLETED', 'REFUND',
         wt.reference_id, 'İptal — saha kiralama geliri düzeltmesi'
  FROM public.wallet_transactions wt
  WHERE wt.type = 'BOOKING_EARNING'
    AND wt.reference_type = 'BOOKING'
    AND wt.status = 'COMPLETED'
    AND wt.reference_id IN (
      SELECT bp.id FROM public.booking_payments bp WHERE bp.booking_id = p_booking_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.wallet_transactions r
      WHERE r.reference_type = 'REFUND' AND r.type = 'BOOKING_EARNING'
        AND r.reference_id = wt.reference_id
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.reverse_booking_earnings(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_booking_earnings(uuid) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- owner_cancel_confirmed_booking: (a) SELECT'e FOR UPDATE OF b (yarış guard'ı),
-- (b) status='CANCELLED' UPDATE'inden sonra reverse çağrısı.
-- Gövde 20260615180000'den birebir kopya; yalnız bu iki ekleme.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.owner_cancel_confirmed_booking(
  p_booking_id UUID,
  p_reason TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_booking RECORD;
  v_refund_amount NUMERIC;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT
    b.id,
    b.pitch_id,
    b.user_id,
    b.match_id,
    b.paid_amount,
    b.price,
    b.payment_status,
    b.status,
    p.owner_id,
    p.is_demo
  INTO v_booking
  FROM public.pitch_bookings b
  JOIN public.pitches p ON p.id = b.pitch_id
  WHERE b.id = p_booking_id
  FOR UPDATE OF b;   -- A5: eşzamanlı owner+admin iptalini serileştir (yarış guard'ı)

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;

  IF v_booking.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'ALREADY_CANCELLED';
  END IF;

  IF NOT (
    v_booking.owner_id = v_uid
    OR public.is_admin()
    OR (
      v_booking.is_demo = true
      AND public.has_role('OWNER')
    )
  ) THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  v_refund_amount := COALESCE(v_booking.paid_amount, 0);

  UPDATE public.pitch_bookings
  SET
    status = 'CANCELLED',
    cancellation_reason = NULLIF(TRIM(p_reason), ''),
    cancelled_at = NOW(),
    cancelled_by = v_uid,
    payment_status = CASE
      WHEN v_refund_amount > 0 THEN 'REFUNDED'
      ELSE payment_status
    END
  WHERE id = p_booking_id;

  -- A5: owner BOOKING_EARNING kazancını geri al (idempotent; player refund'dan bağımsız,
  -- process_match_refund'dan ÖNCE — o abort ederse bu da tutarlı biçimde geri alınır).
  PERFORM public.reverse_booking_earnings(p_booking_id);

  IF v_booking.user_id IS NOT NULL AND v_refund_amount > 0 THEN
    PERFORM public.process_match_refund(
      v_booking.user_id,
      v_booking.match_id,
      v_refund_amount
    );
  END IF;

  IF v_booking.user_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, body, type_key)
    VALUES (
      v_booking.user_id,
      'Rezervasyonunuz İptal Edildi',
      CASE
        WHEN v_refund_amount > 0 THEN
          'Rezervasyonunuz iptal edildi. ' || v_refund_amount::text || '₺ cüzdanınıza iade edildi.'
        ELSE 'Rezervasyonunuz tesis tarafından iptal edildi.'
      END,
      'BOOKING_CANCELLED'
    );
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.owner_cancel_confirmed_booking(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_cancel_confirmed_booking(UUID, TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- cancel_app_booking (oyuncu iptali): owner kazancını da geri al (kapsam boşluğu).
-- Gövde 20260707000008'den birebir kopya; yalnız reverse çağrısı eklendi.
-- Oyuncuya kademeli iade yapılırken owner'ın kart-kaporası kazancı da geri alınmalı.
-- ------------------------------------------------------------------------------
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

  -- A5: owner BOOKING_EARNING kazancını geri al (kart kaporası kredilenmişse; idempotent).
  PERFORM public.reverse_booking_earnings(p_booking_id);

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
