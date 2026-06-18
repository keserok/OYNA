-- Admin Panel Tam Kontrol — Adım 2-10 altyapısı
-- payout_mode, revoke ACL, kullanıcı oluşturma profili, finans trend, billing events

ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS payout_mode TEXT DEFAULT 'cash';

-- admin_update_settings — payout_mode desteği
CREATE OR REPLACE FUNCTION public.admin_update_settings(p_settings JSONB)
RETURNS BOOLEAN AS $$
DECLARE v_old JSONB;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT to_jsonb(s.*) INTO v_old FROM public.settings s WHERE id = 1;
  UPDATE public.settings SET
    app_name                  = COALESCE((p_settings->>'app_name')::text, app_name),
    maintenance_mode          = COALESCE((p_settings->>'maintenance_mode')::boolean, maintenance_mode),
    registration_open         = COALESCE((p_settings->>'registration_open')::boolean, registration_open),
    pro_price                 = COALESCE((p_settings->>'pro_price')::numeric, pro_price),
    commission_rate           = COALESCE((p_settings->>'commission_rate')::numeric, commission_rate),
    min_rating_to_play        = COALESCE((p_settings->>'min_rating_to_play')::numeric, min_rating_to_play),
    max_matches_per_day       = COALESCE((p_settings->>'max_matches_per_day')::integer, max_matches_per_day),
    featured_pitch_id         = COALESCE((p_settings->>'featured_pitch_id')::uuid, featured_pitch_id),
    show_announcement_banner  = COALESCE((p_settings->>'show_announcement_banner')::boolean, show_announcement_banner),
    announcement_banner       = COALESCE((p_settings->>'announcement_banner')::text, announcement_banner),
    payout_mode               = COALESCE((p_settings->>'payout_mode')::text, payout_mode),
    updated_at                = NOW()
  WHERE id = 1;
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
  VALUES (p_user_id, lower(trim(p_email)), trim(p_full_name), p_role, ARRAY[p_role], 'approved', NOW(), NOW())
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

GRANT EXECUTE ON FUNCTION public.admin_revoke_platform_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert_user_profile(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_fetch_revenue_trend(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_fetch_owner_billing_events(int) TO authenticated;
