-- Admin kullanıcı / kaleci / hakem güncelleme — denetimli RPC'ler

CREATE OR REPLACE FUNCTION public.admin_update_user_profile(
  p_user_id UUID,
  p_payload JSONB
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old JSONB;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT to_jsonb(p.*) INTO v_old FROM public.profiles p WHERE id = p_user_id;
  IF v_old IS NULL THEN RAISE EXCEPTION 'Kullanıcı bulunamadı'; END IF;

  UPDATE public.profiles SET
    full_name = COALESCE(p_payload->>'full_name', full_name),
    email = COALESCE(p_payload->>'email', email),
    phone = COALESCE(p_payload->>'phone', phone),
    avatar_url = COALESCE(p_payload->>'avatar_url', avatar_url),
    role = COALESCE(p_payload->>'role', role),
    roles = CASE WHEN p_payload ? 'role' THEN jsonb_build_array(p_payload->>'role') ELSE roles END,
    is_verified = COALESCE((p_payload->>'is_verified')::boolean, is_verified),
    is_pro = COALESCE((p_payload->>'is_pro')::boolean, is_pro),
    wallet_balance = COALESCE((p_payload->>'wallet_balance')::numeric, wallet_balance),
    match_count = COALESCE((p_payload->>'match_count')::int, match_count),
    rating = COALESCE((p_payload->>'rating')::numeric, rating),
    player_card = COALESCE(p_payload->'player_card', player_card),
    updated_at = NOW()
  WHERE id = p_user_id;

  PERFORM public.log_admin_action(
    'USER_UPDATE', 'user', p_user_id,
    COALESCE(p_payload->>'email', v_old->>'email'),
    v_old, p_payload
  );
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_goalkeeper(
  p_id UUID,
  p_payload JSONB
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old JSONB;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT to_jsonb(g.*) INTO v_old FROM public.goalkeepers g WHERE id = p_id;
  IF v_old IS NULL THEN RAISE EXCEPTION 'Kaleci bulunamadı'; END IF;

  UPDATE public.goalkeepers SET
    name = COALESCE(p_payload->>'name', name),
    height = COALESCE(p_payload->>'height', height),
    age = COALESCE((p_payload->>'age')::int, age),
    rating = COALESCE((p_payload->>'rating')::numeric, rating),
    fee = COALESCE((p_payload->>'fee')::int, fee),
    "matchCount" = COALESCE((p_payload->>'match_count')::int, "matchCount"),
    avatar = COALESCE(p_payload->>'avatar', avatar),
    "recentAwards" = COALESCE(p_payload->>'recent_awards', "recentAwards"),
    style = COALESCE(p_payload->>'style', style),
    bio = COALESCE(p_payload->>'bio', bio),
    "preferredZones" = COALESCE(p_payload->'preferred_zones', "preferredZones"),
    "isElite" = COALESCE((p_payload->>'is_elite')::boolean, "isElite"),
    coordinates = COALESCE(p_payload->'coordinates', coordinates),
    stats = COALESCE(p_payload->'stats', stats),
    skills = COALESCE(p_payload->'skills', skills),
    equipment = COALESCE(p_payload->'equipment', equipment)
  WHERE id = p_id;

  PERFORM public.log_admin_action('GK_UPDATE', 'goalkeeper', p_id, COALESCE(p_payload->>'name', v_old->>'name'), v_old, p_payload);
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_referee(
  p_id UUID,
  p_payload JSONB
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old JSONB;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT to_jsonb(r.*) INTO v_old FROM public.referees r WHERE id = p_id;
  IF v_old IS NULL THEN RAISE EXCEPTION 'Hakem bulunamadı'; END IF;

  UPDATE public.referees SET
    name = COALESCE(p_payload->>'name', name),
    level = COALESCE(p_payload->>'level', level),
    "matchCount" = COALESCE((p_payload->>'match_count')::int, "matchCount"),
    fee = COALESCE((p_payload->>'fee')::int, fee),
    avatar = COALESCE(p_payload->>'avatar', avatar),
    rating = COALESCE((p_payload->>'rating')::numeric, rating),
    style = COALESCE(p_payload->>'style', style),
    bio = COALESCE(p_payload->>'bio', bio),
    "preferredZones" = COALESCE(p_payload->'preferred_zones', "preferredZones"),
    "isElite" = COALESCE((p_payload->>'is_elite')::boolean, "isElite"),
    coordinates = COALESCE(p_payload->'coordinates', coordinates),
    stats = COALESCE(p_payload->'stats', stats)
  WHERE id = p_id;

  PERFORM public.log_admin_action('REF_UPDATE', 'referee', p_id, COALESCE(p_payload->>'name', v_old->>'name'), v_old, p_payload);
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_toggle_user_pro(p_user_id UUID, p_is_pro BOOLEAN)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email TEXT;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT email INTO v_email FROM public.profiles WHERE id = p_user_id;
  IF v_email IS NULL THEN RAISE EXCEPTION 'Kullanıcı bulunamadı'; END IF;
  UPDATE public.profiles SET is_pro = p_is_pro, updated_at = NOW() WHERE id = p_user_id;
  PERFORM public.log_admin_action('USER_PRO_TOGGLE', 'user', p_user_id, v_email, NULL, jsonb_build_object('is_pro', p_is_pro));
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_verify_user(p_user_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email TEXT;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT email INTO v_email FROM public.profiles WHERE id = p_user_id;
  IF v_email IS NULL THEN RAISE EXCEPTION 'Kullanıcı bulunamadı'; END IF;
  UPDATE public.profiles SET is_verified = true, updated_at = NOW() WHERE id = p_user_id;
  PERFORM public.log_admin_action('USER_VERIFY', 'user', p_user_id, v_email, NULL, jsonb_build_object('is_verified', true));
  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_user_profile(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_goalkeeper(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_referee(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_toggle_user_pro(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_verify_user(uuid) TO authenticated;
