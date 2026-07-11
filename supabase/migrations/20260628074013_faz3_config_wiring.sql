-- ============================================================================
-- FAZ 3 — KURALLARI UYGULAMAYA BAĞLAMA (Soru 4/87/90) — bölüm 1
-- ----------------------------------------------------------------------------
-- app_config'teki değerlerin uygulamaya GERÇEKTEN etki etmesi için fonksiyonlar
-- get_config* ile okunmaya başlanır. Bu bölümde: app-booking otomatik onayının
-- GLOBAL VARSAYILANI (saha kendi süresini ayarlamamışsa) artık panelden
-- (app_config.app_booking_auto_approve_minutes) yönetilir.
-- Gövde CANLI tanımdan birebir; yalnız hardcode fallback (35) config'e bağlanır.
-- get_config_number SECURITY INVOKER'dır; bu DEFINER fonksiyon içinden definer
-- ayrıcalığıyla okunur (RLS sorunsuz).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_approve_pending_bookings()
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_count integer;
  v_now_tr timestamp := (now() AT TIME ZONE 'Europe/Istanbul');
  v_default_min int := COALESCE(public.get_config_number('app_booking_auto_approve_minutes', 15)::int, 15);
BEGIN
  WITH upd AS (
    UPDATE public.pitch_bookings b
    SET status = 'CONFIRMED', auto_approved_at = now()
    FROM public.pitches p
    WHERE p.id = b.pitch_id
      AND b.status = 'PENDING'
      AND b.source IN ('APP_BOOKING', 'APP_MATCH')
      AND COALESCE(p.auto_approve_enabled, true)
      AND COALESCE(p.auto_approve_minutes, v_default_min) > 0
      AND b.created_at + make_interval(mins => COALESCE(p.auto_approve_minutes, v_default_min)) <= now()
      AND (b.booking_date + b.start_time) > v_now_tr  -- geçmişteki rezervasyonu onaylama
    RETURNING b.id
  )
  SELECT count(*) INTO v_count FROM upd;
  RETURN v_count;
END;
$function$;
