-- admin_fetch_profiles: arama ve durum filtresi (UsersPage server pagination)

DROP FUNCTION IF EXISTS public.admin_fetch_profiles(int, int);

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

GRANT EXECUTE ON FUNCTION public.admin_fetch_profiles(int, int, text, text) TO authenticated;
