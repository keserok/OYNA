-- ════════════════════════════════════════════════════════════════════════════
-- [S1 latent / C5 + C7] İADE TAHMİNİ = SUNUCU FORMÜLÜYLE BİREBİR (tek kaynak)
-- ────────────────────────────────────────────────────────────────────────────
-- SORUN: MyBookings iptal modalı iade yüzdesini FE'de HARDCODE hesaplıyor
--   (24/6/50) ve `paid × pct/100` (BRÜT) gösteriyor. Sunucu ise:
--     • eşikleri `settings`'ten okur (admin değiştirebilir),
--     • Istanbul saatiyle hesaplar,
--     • iade = BRÜT − PSP kesintisi (go-live'da admin PSP oranını yazınca >0).
--   Bu üç fark, go-live'da FE'nin FAZLA vaat etmesine yol açar (C5/C7: tutmayan
--   tahmin). Kullanıcı "tam profesyonellik" istedi.
--
-- ÇÖZÜM (tek kaynak / SSOT): iade hesabı `_booking_cancel_quote` helper'ına
--   çıkarılır. Hem `cancel_app_booking` (gerçek iptal) hem `preview_booking_cancel`
--   (salt-okunur önizleme) AYNI helper'ı çağırır → FE artık kendi formülünü
--   uydurmaz, sunucunun KENDİ rakamını gösterir. İkisi ASLA ayrışamaz.
--
-- Davranış değişmezi: cancel_app_booking'in ürettiği pct/psp/refund AYNI kalır
--   (yalnız hesap helper'a taşındı) — para akışı birebir korunur.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1) SSOT: iade kotası (pct/gross/psp/refund) — cancel + preview ortak ─────
CREATE OR REPLACE FUNCTION public._booking_cancel_quote(p_paid numeric, p_start timestamp)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  s RECORD;
  v_now_tr timestamp := (now() AT TIME ZONE 'Europe/Istanbul');
  v_hours numeric;
  v_pct numeric;
  v_gross numeric;
  v_psp numeric;
  v_refund numeric;
BEGIN
  SELECT COALESCE(booking_refund_full_hours,24) AS full_h,
         COALESCE(booking_refund_half_hours,6)  AS half_h,
         COALESCE(booking_refund_half_pct,50)   AS half_pct
    INTO s FROM public.settings LIMIT 1;

  v_hours := EXTRACT(EPOCH FROM (p_start - v_now_tr)) / 3600.0;
  v_pct := CASE WHEN v_hours >= s.full_h THEN 100
                WHEN v_hours >= s.half_h THEN s.half_pct
                ELSE 0 END;
  v_gross  := round(COALESCE(p_paid, 0) * v_pct / 100.0, 2);
  v_psp    := public._psp_fee(v_gross);
  v_refund := GREATEST(0, v_gross - v_psp);

  RETURN jsonb_build_object(
    'pct', v_pct, 'gross', v_gross, 'psp', v_psp, 'refund', v_refund,
    'hours_left', round(v_hours, 2)
  );
END;
$$;
REVOKE ALL ON FUNCTION public._booking_cancel_quote(numeric, timestamp) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._booking_cancel_quote(numeric, timestamp) TO service_role;

-- ─── 2) cancel_app_booking — helper'ı kullanır (davranış birebir korunur) ─────
CREATE OR REPLACE FUNCTION public.cancel_app_booking(p_booking_id uuid, p_reason text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  b RECORD;
  v_start timestamp;
  v_now_tr timestamp := (now() AT TIME ZONE 'Europe/Istanbul');
  v_q jsonb;
  v_pct numeric;
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

  -- SSOT: preview ile birebir aynı hesap.
  v_q := public._booking_cancel_quote(COALESCE(b.paid_amount, 0), v_start);
  v_pct    := (v_q->>'pct')::numeric;
  v_psp    := (v_q->>'psp')::numeric;
  v_refund := (v_q->>'refund')::numeric;

  UPDATE public.pitch_bookings SET
    status = 'CANCELLED',
    cancelled_at = now(),
    cancelled_by = auth.uid(),
    cancellation_reason = COALESCE(p_reason, 'Oyuncu iptali (kademeli iade)'),
    payment_status = CASE WHEN COALESCE(paid_amount, 0) > 0 AND v_refund > 0 THEN 'REFUNDED' ELSE payment_status END
  WHERE id = p_booking_id;

  -- A5: owner BOOKING_EARNING kazancını geri al (idempotent).
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

-- ─── 3) preview_booking_cancel — salt-okunur önizleme (FE bunu gösterir) ──────
-- FE iptal modalı açılınca çağrılır; SUNUCUNUN kendi rakamını döndürür → tahmin
-- her zaman gerçek iptalle birebir tutar (PSP/eşik/timezone dahil).
CREATE OR REPLACE FUNCTION public.preview_booking_cancel(p_booking_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  b RECORD;
  v_start timestamp;
  v_now_tr timestamp := (now() AT TIME ZONE 'Europe/Istanbul');
  v_q jsonb;
  v_cancellable boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED: Giris gerekli.'; END IF;

  SELECT * INTO b FROM public.pitch_bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Rezervasyon bulunamadi.'; END IF;
  IF b.user_id IS DISTINCT FROM auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Bu rezervasyon size ait degil.';
  END IF;

  v_start := (b.booking_date + b.start_time)::timestamp;
  v_cancellable := (b.status <> 'CANCELLED'
                    AND v_start > v_now_tr
                    AND b.source IN ('APP_BOOKING', 'APP_MATCH'));

  v_q := public._booking_cancel_quote(COALESCE(b.paid_amount, 0), v_start);

  RETURN jsonb_build_object(
    'booking_id',      p_booking_id,
    'cancellable',     v_cancellable,
    'refund_percent',  (v_q->>'pct')::numeric,
    'refund_amount',   (v_q->>'refund')::numeric,
    'psp_fee',         (v_q->>'psp')::numeric,
    'gross',           (v_q->>'gross')::numeric,
    'paid_amount',     COALESCE(b.paid_amount, 0),
    'hours_left',      (v_q->>'hours_left')::numeric
  );
END;
$$;
REVOKE ALL ON FUNCTION public.preview_booking_cancel(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_booking_cancel(uuid) TO authenticated, service_role;
