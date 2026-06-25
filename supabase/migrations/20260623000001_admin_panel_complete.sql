-- Admin Panel Tam Kontrol — Adım 2-10 altyapısı
-- revoke ACL, kullanıcı oluşturma profili, finans trend, billing events
-- NOT: admin_update_settings burada YENİDEN tanımlanmıyor — 20260618105120_subrole_rbac.sql
-- içindeki sürüm (alt-rol RBAC korumalı) zaten canlıda ve tek doğru kaynak; burada onu
-- snake_case kolon adlarıyla ezen eski/bozuk bir kopya vardı, kaldırıldı.

-- payoutMode/payout_mode mükerrerliği temizliği: tek kanonik kolon "payoutMode" kalsın.
UPDATE public.settings SET "payoutMode" = COALESCE("payoutMode", payout_mode) WHERE id = 'main';
ALTER TABLE public.settings DROP COLUMN IF EXISTS payout_mode;

CREATE OR REPLACE FUNCTION public.admin_update_settings(p_settings JSONB)
RETURNS BOOLEAN AS $$
DECLARE
  v_old JSONB;
  v_member_role TEXT;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

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
    "payoutMode"             = COALESCE((p_settings->>'payout_mode')::text,                 "payoutMode")
  WHERE id = 'main';

  PERFORM public.log_admin_action('SETTINGS_UPDATE', 'system', NULL, 'global_settings', v_old, p_settings);
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ACL revoke
CREATE OR REPLACE FUNCTION public.admin_revoke_platform_role(p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE v_email TEXT;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_user_id = auth.uid() THEN RAISE EXCEPTION 'Kendi admin yetkinizi kaldıramazsınız.'; END IF;
  SELECT email INTO v_email FROM public.profiles WHERE id = p_user_id;
  IF v_email IS NULL THEN RAISE EXCEPTION 'Kullanıcı bulunamadı.'; END IF;
  DELETE FROM public.admin_team_members WHERE user_id = p_user_id;
  UPDATE public.profiles SET is_admin = false, role = 'PLAYER' WHERE id = p_user_id;
  PERFORM public.log_admin_action('ROLE_REVOKE', 'user', p_user_id, v_email, NULL,
    jsonb_build_object('revoked_at', NOW()));
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Profil kaydı (Auth kullanıcısı edge function tarafından oluşturulur)
CREATE OR REPLACE FUNCTION public.admin_upsert_user_profile(
  p_user_id UUID,
  p_email TEXT,
  p_full_name TEXT,
  p_role TEXT DEFAULT 'PLAYER'
) RETURNS UUID AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  INSERT INTO public.profiles (id, email, full_name, role, roles, verification_status, created_at, updated_at)
  VALUES (p_user_id, lower(trim(p_email)), trim(p_full_name), p_role, jsonb_build_array(p_role), 'approved', NOW(), NOW())
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    roles = EXCLUDED.roles,
    updated_at = NOW();
  PERFORM public.log_admin_action('USER_CREATE', 'user', p_user_id, p_email, NULL,
    jsonb_build_object('role', p_role, 'full_name', p_full_name));
  RETURN p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Günlük gelir trendi (dashboard)
CREATE OR REPLACE FUNCTION public.admin_fetch_revenue_trend(p_days INT DEFAULT 30)
RETURNS TABLE(day_date DATE, revenue NUMERIC, payment_count INT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  RETURN QUERY
  SELECT
    d::date AS day_date,
    COALESCE(SUM(bp.amount), 0) AS revenue,
    COUNT(bp.id)::int AS payment_count
  FROM generate_series(
    (CURRENT_DATE - (p_days - 1)),
    CURRENT_DATE,
    '1 day'::interval
  ) AS d
  LEFT JOIN public.booking_payments bp
    ON date_trunc('day', bp.created_at)::date = d::date
  GROUP BY d::date
  ORDER BY d::date;
END;
$$;

-- Owner billing events
CREATE OR REPLACE FUNCTION public.admin_fetch_owner_billing_events(p_limit INT DEFAULT 100)
RETURNS TABLE (
  id UUID,
  owner_user_id UUID,
  owner_name TEXT,
  event_type TEXT,
  amount NUMERIC,
  currency TEXT,
  external_id TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  RETURN QUERY
  SELECT
    obe.id,
    obe.owner_user_id,
    COALESCE(pr.full_name, pr.email, '—') AS owner_name,
    obe.event_type,
    obe.amount,
    obe.currency,
    obe.external_id,
    obe.created_at
  FROM public.owner_billing_events obe
  LEFT JOIN public.profiles pr ON pr.id = obe.owner_user_id
  ORDER BY obe.created_at DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_settings(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_platform_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert_user_profile(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_fetch_revenue_trend(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_fetch_owner_billing_events(int) TO authenticated;
