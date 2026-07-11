-- ============================================================================
-- ZAMANLANMIŞ BAKIM MODU
--
-- Eksiklik #4: Bakım modunu elle açıp kapatmak yerine bir pencere planlanabilir
-- ("01:00–03:00 arası bakım"). settings tablosuna başlangıç/bitiş zaman damgaları
-- eklenir; admin_update_settings bunları yazar/temizler. is_maintenance_active()
-- efektif durumu döndürür: elle açık VEYA planlı pencere şu an aktif.
-- ============================================================================

ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS "maintenanceStartsAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "maintenanceEndsAt"   timestamptz;

-- admin_update_settings — mevcut kolonlar + planlı bakım pencere alanları.
-- Pencere alanları için "anahtar varsa yaz (null olabilir)" deseni: böylece
-- pencere temizlenebilir (null gönderilince silinir).
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
    payout_mode              = COALESCE((p_settings->>'payout_mode')::text,               payout_mode),
    "maintenanceStartsAt"    = CASE WHEN p_settings ? 'maintenance_starts_at'
                                    THEN (p_settings->>'maintenance_starts_at')::timestamptz
                                    ELSE "maintenanceStartsAt" END,
    "maintenanceEndsAt"      = CASE WHEN p_settings ? 'maintenance_ends_at'
                                    THEN (p_settings->>'maintenance_ends_at')::timestamptz
                                    ELSE "maintenanceEndsAt" END
  WHERE id = 'main';

  PERFORM public.log_admin_action('SETTINGS_UPDATE', 'system', NULL, 'global_settings', v_old, p_settings);
  RETURN TRUE;
END;
$function$;

-- Efektif bakım durumu: elle açık VEYA planlı pencere şu an aktif.
-- Kararlılık için planlı aktivasyon HER İKİ ucun da dolu olmasını ister
-- (yarım bırakılmış tek damga ile kalıcı kilit oluşmaz).
CREATE OR REPLACE FUNCTION public.is_maintenance_active()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(s."maintenanceMode", false)
      OR (
        s."maintenanceStartsAt" IS NOT NULL
        AND s."maintenanceEndsAt" IS NOT NULL
        AND now() >= s."maintenanceStartsAt"
        AND now() <  s."maintenanceEndsAt"
      )
  FROM public.settings s WHERE s.id = 'main';
$$;

REVOKE ALL ON FUNCTION public.is_maintenance_active() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_maintenance_active() TO authenticated, anon;
