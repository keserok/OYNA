-- ════════════════════════════════════════════════════════════════════════════
-- [S2.5 + S2.6] İade push bildirimi + tesis-bazlı iptal politikası override
-- ════════════════════════════════════════════════════════════════════════════

-- ─── S2.5) İADE PUSH — REFUND_CREDIT yazılınca "paran döndü" bildirimi ────────
-- İadeler (maç/rezervasyon iptali, slot doldu, escrow çözüldü) her yerde
-- wallet_transactions'a REFUND_CREDIT olarak yazılır → TEK trigger hepsini yakalar.
-- notifications'ın send_push_on_notification trigger'ı push'u OTOMATİK gönderir.
CREATE OR REPLACE FUNCTION public._notify_refund_credit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  IF public.get_config_bool('refund_notify_enabled', true)
     AND NEW.balance_type = 'REFUND_CREDIT'
     AND NEW.status = 'COMPLETED'
     AND NEW.type IN ('DEPOSIT','REFUND','MATCH_REFUND')
     AND COALESCE(NEW.amount, 0) > 0 THEN
    INSERT INTO public.notifications (user_id, title, body, type_key, deep_link, inbox)
    VALUES (
      NEW.user_id,
      'Paran cüzdanına döndü',
      format('%s₺ iade kredisi olarak cüzdanına eklendi. Dilediğin ödemede kullanabilirsin.',
             trim(trailing '.' FROM trim(trailing '0' FROM to_char(NEW.amount, 'FM999999990.00')))),
      'REFUND', 'oyna://wallet', true
    );
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._notify_refund_credit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tg_notify_refund_credit ON public.wallet_transactions;
CREATE TRIGGER tg_notify_refund_credit
  AFTER INSERT ON public.wallet_transactions
  FOR EACH ROW EXECUTE FUNCTION public._notify_refund_credit();

INSERT INTO public.app_config (key, value, value_type, category, label, description, is_public, min_value, max_value) VALUES
  ('refund_notify_enabled', 'true'::jsonb, 'boolean', 'ODEME', 'İade Bildirimi',
   'AÇIK iken iade kredisi cüzdana eklenince kullanıcıya "paran döndü" bildirimi/push gider.', false, NULL, NULL)
ON CONFLICT (key) DO NOTHING;

-- ─── S2.6) TESİS-BAZLI İPTAL POLİTİKASI (pitch override; yoksa global) ────────
-- Saha sahibi kendi iade eşiklerini belirler; NULL bırakırsa GLOBAL settings
-- geçerli. cancel_app_booking + preview_booking_cancel AYNI helper'ı kullandığı
-- için (C5/C7 SSOT) tek yerde değiştirmek yeter → tahmin/gerçek asla ayrışmaz.
ALTER TABLE public.pitches
  ADD COLUMN IF NOT EXISTS refund_full_hours numeric,
  ADD COLUMN IF NOT EXISTS refund_half_hours numeric,
  ADD COLUMN IF NOT EXISTS refund_half_pct   numeric;

-- Helper artık pitch_id alır: önce tesis override, yoksa global settings.
CREATE OR REPLACE FUNCTION public._booking_cancel_quote(p_paid numeric, p_start timestamp, p_pitch_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  s RECORD;
  v_now_tr timestamp := (now() AT TIME ZONE 'Europe/Istanbul');
  v_full numeric; v_half numeric; v_halfpct numeric;
  v_hours numeric; v_pct numeric; v_gross numeric; v_psp numeric; v_refund numeric;
BEGIN
  SELECT COALESCE(booking_refund_full_hours,24) AS full_h,
         COALESCE(booking_refund_half_hours,6)  AS half_h,
         COALESCE(booking_refund_half_pct,50)   AS half_pct
    INTO s FROM public.settings LIMIT 1;

  -- Global varsayılan; tesis override varsa (NULL alanlar global'e düşer) ezer.
  v_full := s.full_h; v_half := s.half_h; v_halfpct := s.half_pct;
  IF p_pitch_id IS NOT NULL THEN
    SELECT COALESCE(p.refund_full_hours, s.full_h),
           COALESCE(p.refund_half_hours, s.half_h),
           COALESCE(p.refund_half_pct,   s.half_pct)
      INTO v_full, v_half, v_halfpct
    FROM public.pitches p WHERE p.id = p_pitch_id;
    IF NOT FOUND THEN v_full := s.full_h; v_half := s.half_h; v_halfpct := s.half_pct; END IF;
  END IF;

  v_hours := EXTRACT(EPOCH FROM (p_start - v_now_tr)) / 3600.0;
  v_pct := CASE WHEN v_hours >= v_full THEN 100
                WHEN v_hours >= v_half THEN v_halfpct
                ELSE 0 END;
  v_gross  := round(COALESCE(p_paid, 0) * v_pct / 100.0, 2);
  v_psp    := public._psp_fee(v_gross);
  v_refund := GREATEST(0, v_gross - v_psp);

  RETURN jsonb_build_object('pct', v_pct, 'gross', v_gross, 'psp', v_psp, 'refund', v_refund,
    'hours_left', round(v_hours, 2));
END;
$$;
REVOKE ALL ON FUNCTION public._booking_cancel_quote(numeric, timestamp, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._booking_cancel_quote(numeric, timestamp, uuid) TO service_role;

-- cancel_app_booking + preview_booking_cancel: pitch_id'yi helper'a geçir (tek satır).
CREATE OR REPLACE FUNCTION public.cancel_app_booking(p_booking_id uuid, p_reason text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  b RECORD; v_start timestamp;
  v_now_tr timestamp := (now() AT TIME ZONE 'Europe/Istanbul');
  v_q jsonb; v_pct numeric; v_psp numeric; v_refund numeric := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED: Giris gerekli.'; END IF;
  SELECT * INTO b FROM public.pitch_bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Rezervasyon bulunamadi.'; END IF;
  IF b.user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'UNAUTHORIZED: Bu rezervasyon size ait degil.'; END IF;
  IF b.source NOT IN ('APP_BOOKING', 'APP_MATCH') THEN RAISE EXCEPTION 'INVALID_SOURCE: Bu rezervasyon uygulamadan iptal edilemez.'; END IF;
  IF b.status = 'CANCELLED' THEN RAISE EXCEPTION 'ALREADY_CANCELLED: Rezervasyon zaten iptal edilmis.'; END IF;
  v_start := (b.booking_date + b.start_time)::timestamp;
  IF v_start <= v_now_tr THEN RAISE EXCEPTION 'ALREADY_STARTED: Gecmis veya baslamis rezervasyon iptal edilemez.'; END IF;
  v_q := public._booking_cancel_quote(COALESCE(b.paid_amount, 0), v_start, b.pitch_id);
  v_pct := (v_q->>'pct')::numeric; v_psp := (v_q->>'psp')::numeric; v_refund := (v_q->>'refund')::numeric;
  UPDATE public.pitch_bookings SET
    status = 'CANCELLED', cancelled_at = now(), cancelled_by = auth.uid(),
    cancellation_reason = COALESCE(p_reason, 'Oyuncu iptali (kademeli iade)'),
    payment_status = CASE WHEN COALESCE(paid_amount, 0) > 0 AND v_refund > 0 THEN 'REFUNDED' ELSE payment_status END
  WHERE id = p_booking_id;
  PERFORM public.reverse_booking_earnings(p_booking_id);
  IF COALESCE(b.paid_amount, 0) > 0 AND v_refund > 0
     AND NOT EXISTS (SELECT 1 FROM public.wallet_transactions
       WHERE user_id = b.user_id AND reference_type = 'BOOKING' AND reference_id = p_booking_id AND balance_type = 'REFUND_CREDIT') THEN
    INSERT INTO public.wallet_transactions
      (user_id, amount, type, balance_type, status, reference_type, reference_id, description)
    VALUES (b.user_id, v_refund, 'DEPOSIT', 'REFUND_CREDIT', 'COMPLETED', 'BOOKING', p_booking_id,
            format('Rezervasyon iptali — %%%s iade (PSP -%s)', v_pct, v_psp));
  END IF;
  RETURN jsonb_build_object('booking_id', p_booking_id, 'refund_percent', v_pct, 'refund_amount', v_refund,
    'psp_fee', v_psp, 'paid_amount', COALESCE(b.paid_amount, 0));
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_app_booking(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_app_booking(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.preview_booking_cancel(p_booking_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  b RECORD; v_start timestamp;
  v_now_tr timestamp := (now() AT TIME ZONE 'Europe/Istanbul');
  v_q jsonb; v_cancellable boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED: Giris gerekli.'; END IF;
  SELECT * INTO b FROM public.pitch_bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Rezervasyon bulunamadi.'; END IF;
  IF b.user_id IS DISTINCT FROM auth.uid() AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Bu rezervasyon size ait degil.';
  END IF;
  v_start := (b.booking_date + b.start_time)::timestamp;
  v_cancellable := (b.status <> 'CANCELLED' AND v_start > v_now_tr AND b.source IN ('APP_BOOKING', 'APP_MATCH'));
  v_q := public._booking_cancel_quote(COALESCE(b.paid_amount, 0), v_start, b.pitch_id);
  RETURN jsonb_build_object('booking_id', p_booking_id, 'cancellable', v_cancellable,
    'refund_percent', (v_q->>'pct')::numeric, 'refund_amount', (v_q->>'refund')::numeric,
    'psp_fee', (v_q->>'psp')::numeric, 'gross', (v_q->>'gross')::numeric,
    'paid_amount', COALESCE(b.paid_amount, 0), 'hours_left', (v_q->>'hours_left')::numeric);
END;
$$;
REVOKE ALL ON FUNCTION public.preview_booking_cancel(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_booking_cancel(uuid) TO authenticated, service_role;

-- Eski 2-arg helper imzasını kaldır (yeni 3-arg tek kaynak; kalıntı imza kalmasın).
DROP FUNCTION IF EXISTS public._booking_cancel_quote(numeric, timestamp);

-- Saha sahibi kendi iptal politikasını belirler (NULL = global). Yalnız kendi sahası.
CREATE OR REPLACE FUNCTION public.owner_set_pitch_refund_policy(
  p_pitch_id uuid, p_full_hours numeric, p_half_hours numeric, p_half_pct numeric
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_owner uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT owner_id INTO v_owner FROM public.pitches WHERE id = p_pitch_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Saha bulunamadı.'; END IF;
  IF v_owner IS DISTINCT FROM auth.uid() AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Yalnız kendi sahanın politikasını belirleyebilirsin.';
  END IF;
  IF p_full_hours IS NOT NULL AND (p_full_hours < 0 OR p_full_hours > 720) THEN RAISE EXCEPTION 'INVALID: Tam-iade saati 0–720 olmalı.'; END IF;
  IF p_half_hours IS NOT NULL AND (p_half_hours < 0 OR p_half_hours > 720) THEN RAISE EXCEPTION 'INVALID: Yarım-iade saati 0–720 olmalı.'; END IF;
  IF p_half_pct   IS NOT NULL AND (p_half_pct < 0 OR p_half_pct > 100) THEN RAISE EXCEPTION 'INVALID: Yarım-iade yüzdesi 0–100 olmalı.'; END IF;
  IF p_full_hours IS NOT NULL AND p_half_hours IS NOT NULL AND p_half_hours > p_full_hours THEN
    RAISE EXCEPTION 'INVALID: Yarım-iade saati tam-iade saatinden büyük olamaz.';
  END IF;
  UPDATE public.pitches SET refund_full_hours = p_full_hours, refund_half_hours = p_half_hours, refund_half_pct = p_half_pct
  WHERE id = p_pitch_id;
  RETURN jsonb_build_object('pitch_id', p_pitch_id, 'refund_full_hours', p_full_hours,
    'refund_half_hours', p_half_hours, 'refund_half_pct', p_half_pct);
END;
$$;
REVOKE ALL ON FUNCTION public.owner_set_pitch_refund_policy(uuid, numeric, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_set_pitch_refund_policy(uuid, numeric, numeric, numeric) TO authenticated;
