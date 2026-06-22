-- F1 — Ayarlar modülü canlı şemaya hizalandı
-- Sorun: settings tablosu boştu (0 satır) ve kolonları camelCase ("appName"),
--        oysa admin_update_settings RPC'si snake_case (app_name) yazıyor,
--        olmayan updated_at'i set ediyor, featuredPitchId'yi ::uuid'ye cast ediyor
--        ve yanlış anahtar (WHERE id = 1) kullanıyordu. id text tipinde, varsayılan 'main'.
-- Çözüm: tek satır seed + RPC'yi gerçek camelCase kolonlara/­'main' anahtarına göre yeniden yaz.

-- 1) Singleton ayar satırını garanti et (varsayılan kolon değerleri dolar)
INSERT INTO public.settings (id)
SELECT 'main'
WHERE NOT EXISTS (SELECT 1 FROM public.settings WHERE id = 'main');

-- 2) admin_update_settings — gerçek (camelCase) kolonlara yaz, payload anahtarları snake_case kalır
CREATE OR REPLACE FUNCTION public.admin_update_settings(p_settings jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_old JSONB;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  SELECT to_jsonb(s.*) INTO v_old FROM public.settings s WHERE id = 'main';

  UPDATE public.settings SET
    "appName"                = COALESCE((p_settings->>'app_name')::text,                  "appName"),
    "maintenanceMode"        = COALESCE((p_settings->>'maintenance_mode')::boolean,       "maintenanceMode"),
    "registrationOpen"       = COALESCE((p_settings->>'registration_open')::boolean,      "registrationOpen"),
    "proPrice"               = COALESCE((p_settings->>'pro_price')::numeric,              "proPrice"),
    "commissionRate"         = COALESCE((p_settings->>'commission_rate')::numeric,        "commissionRate"),
    "minRatingToPlay"        = COALESCE((p_settings->>'min_rating_to_play')::numeric,     "minRatingToPlay"),
    "maxMatchsPerDay"        = COALESCE((p_settings->>'max_matches_per_day')::integer,    "maxMatchsPerDay"),
    "featuredPitchId"        = COALESCE((p_settings->>'featured_pitch_id')::text,         "featuredPitchId"),
    "showAnnouncementBanner" = COALESCE((p_settings->>'show_announcement_banner')::boolean, "showAnnouncementBanner"),
    "announcementBanner"     = COALESCE((p_settings->>'announcement_banner')::text,       "announcementBanner"),
    "payoutMode"             = COALESCE((p_settings->>'payout_mode')::text,               "payoutMode"),
    payout_mode              = COALESCE((p_settings->>'payout_mode')::text,               payout_mode)
  WHERE id = 'main';

  PERFORM public.log_admin_action('SETTINGS_UPDATE', 'system', NULL, 'global_settings', v_old, p_settings);
  RETURN TRUE;
END;
$function$;
