-- Admin panel tam hazırlık — bootstrap RPC'leri, ACL rol, profil isimleri

CREATE OR REPLACE FUNCTION public.admin_get_my_role()
RETURNS TEXT LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_role TEXT;
BEGIN
  IF NOT public.is_platform_admin() THEN RETURN NULL; END IF;
  SELECT admin_role INTO v_role FROM public.admin_team_members WHERE user_id = auth.uid();
  RETURN COALESCE(v_role, 'ADMIN');
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_fetch_goalkeepers(p_limit INT DEFAULT 500)
RETURNS SETOF public.goalkeepers
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  RETURN QUERY SELECT * FROM public.goalkeepers ORDER BY name ASC NULLS LAST LIMIT GREATEST(p_limit, 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_fetch_referees(p_limit INT DEFAULT 500)
RETURNS SETOF public.referees
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  RETURN QUERY SELECT * FROM public.referees ORDER BY name ASC NULLS LAST LIMIT GREATEST(p_limit, 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_fetch_pending_verifications()
RETURNS SETOF public.pending_provider_verifications
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  RETURN QUERY SELECT * FROM public.pending_provider_verifications ORDER BY created_at ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_fetch_cms_texts()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_map JSONB := '{}'::jsonb;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb) INTO v_map FROM public.texts;
  RETURN v_map;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_fetch_profile_names(p_ids UUID[])
RETURNS TABLE(id UUID, full_name TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  RETURN QUERY
  SELECT pr.id, COALESCE(pr.full_name, pr.email, 'Bilinmeyen')::text
  FROM public.profiles pr
  WHERE p_ids IS NULL OR array_length(p_ids, 1) IS NULL OR pr.id = ANY(p_ids);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_fetch_profiles(
  p_offset INT DEFAULT 0,
  p_limit INT DEFAULT 500,
  p_search TEXT DEFAULT NULL,
  p_status TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  name TEXT,
  email TEXT,
  phone TEXT,
  avatar_url TEXT,
  role TEXT,
  roles JSONB,
  rating NUMERIC,
  match_count INT,
  is_verified BOOLEAN,
  is_banned BOOLEAN,
  is_pro BOOLEAN,
  wallet_balance NUMERIC,
  ban_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  total_count BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  RETURN QUERY
  SELECT
    p.id,
    p.full_name::text,
    p.name::text,
    p.email::text,
    p.phone::text,
    p.avatar_url::text,
    p.role::text,
    p.roles,
    p.rating,
    p.match_count,
    p.is_verified,
    p.is_banned,
    p.is_pro,
    p.wallet_balance,
    p.ban_expires_at,
    COALESCE(p.created_at, p.join_date, NOW()) AS created_at,
    COUNT(*) OVER() AS total_count
  FROM public.profiles p
  WHERE
    (p_search IS NULL OR p_search = '' OR
      p.full_name ILIKE '%' || p_search || '%' OR
      p.name ILIKE '%' || p_search || '%' OR
      p.email ILIKE '%' || p_search || '%' OR
      p.role ILIKE '%' || p_search || '%' OR
      p.id::text ILIKE '%' || p_search || '%')
    AND (
      p_status IS NULL OR p_status = '' OR p_status = 'all' OR
      (p_status = 'banned' AND p.is_banned = true) OR
      (p_status = 'pro' AND p.is_pro = true) OR
      (p_status = 'active' AND COALESCE(p.is_banned, false) = false)
    )
  ORDER BY COALESCE(p.created_at, p.join_date) DESC NULLS LAST
  LIMIT GREATEST(p_limit, 1)
  OFFSET GREATEST(p_offset, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_my_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_fetch_goalkeepers(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_fetch_referees(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_fetch_pending_verifications() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_fetch_cms_texts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_fetch_profile_names(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_fetch_profiles(int, int, text, text) TO authenticated;
