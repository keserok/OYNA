-- [DB GEÇMİŞİNDEN KURTARILDI 2026-07-11] Bu migration canlı veritabanına uygulanmıştı ancak repoda dosyası yoktu; supabase_migrations.schema_migrations.statements kolonundan geri çıkarıldı.

CREATE OR REPLACE FUNCTION public.admin_ban_user(p_user_id UUID, p_is_banned BOOLEAN, p_expires_at TIMESTAMPTZ DEFAULT NULL, p_reason TEXT DEFAULT NULL) RETURNS BOOLEAN AS $$
DECLARE v_email TEXT;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT email INTO v_email FROM public.profiles WHERE id = p_user_id;
  IF v_email IS NULL THEN RAISE EXCEPTION 'Kullanıcı bulunamadı.'; END IF;
  UPDATE public.profiles SET is_banned = p_is_banned, ban_expires_at = CASE WHEN p_is_banned THEN p_expires_at ELSE NULL END, updated_at = NOW() WHERE id = p_user_id;
  PERFORM public.log_admin_action(CASE WHEN p_is_banned THEN 'BAN' ELSE 'UNBAN' END, 'user', p_user_id, v_email, NULL, jsonb_build_object('is_banned', p_is_banned, 'expires_at', p_expires_at, 'reason', p_reason));
  RETURN TRUE;
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
CREATE OR REPLACE FUNCTION public.admin_update_settings(p_settings JSONB) RETURNS BOOLEAN AS $$
DECLARE v_old JSONB;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT to_jsonb(s.*) INTO v_old FROM public.settings s WHERE id = 1;
  UPDATE public.settings SET "appName" = COALESCE((p_settings->>'app_name')::text, "appName"), "maintenanceMode" = COALESCE((p_settings->>'maintenance_mode')::boolean, "maintenanceMode"), "registrationOpen" = COALESCE((p_settings->>'registration_open')::boolean, "registrationOpen"), "proPrice" = COALESCE((p_settings->>'pro_price')::numeric, "proPrice"), "commissionRate" = COALESCE((p_settings->>'commission_rate')::numeric, "commissionRate"), "minRatingToPlay" = COALESCE((p_settings->>'min_rating_to_play')::numeric, "minRatingToPlay"), "maxMatchsPerDay" = COALESCE((p_settings->>'max_matches_per_day')::integer, "maxMatchsPerDay"), "featuredPitchId" = COALESCE((p_settings->>'featured_pitch_id')::uuid, "featuredPitchId"), "showAnnouncementBanner" = COALESCE((p_settings->>'show_announcement_banner')::boolean, "showAnnouncementBanner"), "announcementBanner" = COALESCE((p_settings->>'announcement_banner')::text, "announcementBanner") WHERE id = 1;
  PERFORM public.log_admin_action('SETTINGS_UPDATE', 'system', NULL, 'global_settings', v_old, p_settings);
  RETURN TRUE;
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
CREATE OR REPLACE FUNCTION public.admin_log_impersonation(p_target_user_id UUID) RETURNS BOOLEAN AS $$
DECLARE v_identifier TEXT;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT COALESCE(full_name, email) INTO v_identifier FROM public.profiles WHERE id = p_target_user_id;
  PERFORM public.log_admin_action('IMPERSONATE', 'user', p_target_user_id, v_identifier, NULL, jsonb_build_object('started_at', NOW()));
  RETURN TRUE;
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
CREATE OR REPLACE FUNCTION public.admin_dashboard_stats() RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_result JSONB;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT jsonb_build_object('total_users', (SELECT COUNT(*)::int FROM public.profiles), 'total_pitches', (SELECT COUNT(*)::int FROM public.pitches), 'total_matches', (SELECT COUNT(*)::int FROM public.matches), 'pending_verifications', (SELECT COUNT(*)::int FROM public.profiles WHERE verification_status = 'pending'), 'pending_pitches', (SELECT COUNT(*)::int FROM public.pitches WHERE verification_status = 'pending'), 'pending_withdrawals', (SELECT COUNT(*)::int FROM public.owner_withdrawal_requests WHERE status = 'PENDING'), 'banned_users', (SELECT COUNT(*)::int FROM public.profiles WHERE is_banned = true), 'active_goalkeepers', (SELECT COUNT(*)::int FROM public.goalkeepers), 'active_referees', (SELECT COUNT(*)::int FROM public.referees), 'commission_rate', (SELECT "commissionRate" FROM public.settings WHERE id = 1)) INTO v_result;
  RETURN v_result;
END; $$;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_moderate_pitch(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_process_withdrawal(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_ban_user(uuid, boolean, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_settings(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_log_impersonation(uuid) TO authenticated;
