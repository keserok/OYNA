-- F5: Alt-rol admin girişi düzeltmesi + F2: Ayarlar RBAC koruması
--
-- Sorunlar:
--   F5) admin_set_platform_role yalnızca SUPER_ADMIN/ADMIN için is_admin=true yazıyordu.
--       MODERATOR/FINANCE/SUPPORT is_admin=false kaldığından is_platform_admin() geçemiyorlar
--       ve giriş yapamıyorlar.
--   F2) admin_update_settings yalnızca is_platform_admin() kontrol ediyor.
--       F5 düzeltmesi sonrası alt-rol adminler de bu RPC'yi çağırabilecekti.
--
-- Çözümler:
--   1) admin_set_platform_role: her role için is_admin=true yaz
--   2) admin_update_settings: admin_team_members'tan rol kontrolü ekle (ADMIN/SUPER_ADMIN zorunlu)

-- ─── 1) admin_set_platform_role — her alt-rola is_admin=true ver ───────────────
CREATE OR REPLACE FUNCTION public.admin_set_platform_role(
  p_user_id uuid,
  p_admin_role text,
  p_grant_platform_admin boolean DEFAULT false
)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_email text;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Yalnızca SUPER_ADMIN platform rolü atayabilir';
  END IF;
  IF p_admin_role NOT IN ('SUPER_ADMIN', 'ADMIN', 'MODERATOR', 'FINANCE', 'SUPPORT') THEN
    RAISE EXCEPTION 'Geçersiz rol: %', p_admin_role;
  END IF;

  SELECT email INTO v_email FROM profiles WHERE id = p_user_id;

  INSERT INTO admin_team_members (user_id, admin_role, invited_by)
  VALUES (p_user_id, p_admin_role, auth.uid())
  ON CONFLICT (user_id) DO UPDATE SET admin_role = EXCLUDED.admin_role;

  -- Her admin rolü is_admin=true alır — is_platform_admin() ve RLS politikaları için zorunlu.
  -- profiles.role: SUPER_ADMIN/ADMIN ise olduğu gibi, alt-roller için 'ADMIN' yazılır
  UPDATE profiles SET
    is_admin = true,
    role = CASE WHEN p_admin_role IN ('SUPER_ADMIN', 'ADMIN') THEN p_admin_role ELSE 'ADMIN' END
  WHERE id = p_user_id;

  PERFORM log_admin_action(
    'ROLE_CHANGE', 'user', p_user_id, v_email, NULL,
    jsonb_build_object('admin_role', p_admin_role, 'is_admin', true)
  );
  RETURN true;
END;
$function$;

-- ─── 2) admin_update_settings — FULL_ACCESS guard ─────────────────────────────
-- Önceki sürüm: yalnızca is_platform_admin() → F5 düzeltmesi sonrası alt-roller de geçebilirdi.
-- Yeni sürüm: admin_team_members'ta kayıtlı alt-rollerin (MODERATOR/FINANCE/SUPPORT) erişimi engellenir.
CREATE OR REPLACE FUNCTION public.admin_update_settings(p_settings jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old        JSONB;
  v_member_role TEXT;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  -- Alt-rol admini tespit et ve engelle
  SELECT admin_role INTO v_member_role
  FROM public.admin_team_members
  WHERE user_id = auth.uid();

  IF v_member_role IS NOT NULL AND v_member_role NOT IN ('SUPER_ADMIN', 'ADMIN') THEN
    RAISE EXCEPTION 'SETTINGS_RESTRICTED: Ayarlar yalnızca ADMIN veya SUPER_ADMIN tarafından değiştirilebilir';
  END IF;

  SELECT to_jsonb(s.*) INTO v_old FROM public.settings s WHERE id = 'main';

  UPDATE public.settings SET
    "appName"                = COALESCE((p_settings->>'app_name')::text,                    "appName"),
    "maintenanceMode"        = COALESCE((p_settings->>'maintenance_mode')::boolean,         "maintenanceMode"),
    "registrationOpen"       = COALESCE((p_settings->>'registration_open')::boolean,        "registrationOpen"),
    "proPrice"               = COALESCE((p_settings->>'pro_price')::numeric,                "proPrice"),
    "commissionRate"         = COALESCE((p_settings->>'commission_rate')::numeric,          "commissionRate"),
    "minRatingToPlay"        = COALESCE((p_settings->>'min_rating_to_play')::numeric,       "minRatingToPlay"),
    "maxMatchsPerDay"        = COALESCE((p_settings->>'max_matches_per_day')::integer,      "maxMatchsPerDay"),
    "featuredPitchId"        = COALESCE((p_settings->>'featured_pitch_id')::text,           "featuredPitchId"),
    "showAnnouncementBanner" = COALESCE((p_settings->>'show_announcement_banner')::boolean, "showAnnouncementBanner"),
    "announcementBanner"     = COALESCE((p_settings->>'announcement_banner')::text,         "announcementBanner"),
    "payoutMode"             = COALESCE((p_settings->>'payout_mode')::text,                 "payoutMode"),
    payout_mode              = COALESCE((p_settings->>'payout_mode')::text,                 payout_mode)
  WHERE id = 'main';

  PERFORM public.log_admin_action('SETTINGS_UPDATE', 'system', NULL, 'global_settings', v_old, p_settings);
  RETURN TRUE;
END;
$function$;
