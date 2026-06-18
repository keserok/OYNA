-- Admin bootstrap fix — eksik created_at kolonları + RPC sıralama düzeltmesi

ALTER TABLE public.goalkeepers ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT timezone('utc', now());
ALTER TABLE public.referees ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT timezone('utc', now());
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT timezone('utc', now());
ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT timezone('utc', now());

CREATE OR REPLACE FUNCTION public.admin_fetch_goalkeepers(p_limit INT DEFAULT 500)
RETURNS SETOF public.goalkeepers
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  RETURN QUERY
  SELECT * FROM public.goalkeepers
  ORDER BY name ASC NULLS LAST
  LIMIT GREATEST(p_limit, 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_fetch_referees(p_limit INT DEFAULT 500)
RETURNS SETOF public.referees
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  RETURN QUERY
  SELECT * FROM public.referees
  ORDER BY name ASC NULLS LAST
  LIMIT GREATEST(p_limit, 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_fetch_pitches(
  p_search TEXT DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_limit INT DEFAULT 200,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  district TEXT,
  city TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  price_per_match NUMERIC,
  google_rating NUMERIC,
  google_review_count INT,
  verification_status TEXT,
  owner_id UUID,
  image TEXT,
  "isDemo" BOOLEAN,
  created_at TIMESTAMPTZ,
  total_count BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  RETURN QUERY
  SELECT
    p.id,
    p.name::text,
    p.district::text,
    p.city::text,
    p.latitude,
    p.longitude,
    p.price_per_match,
    p.google_rating,
    p.google_review_count,
    p.verification_status::text,
    p.owner_id,
    p.image::text,
    COALESCE(p."isDemo", false) AS "isDemo",
    p.created_at,
    COUNT(*) OVER() AS total_count
  FROM public.pitches p
  WHERE (
    p_search IS NULL OR p_search = '' OR
    p.name ILIKE '%' || p_search || '%' OR
    p.district ILIKE '%' || p_search || '%' OR
    p.city ILIKE '%' || p_search || '%' OR
    p.id::text ILIKE '%' || p_search || '%'
  )
  AND (
    p_status IS NULL OR p_status = '' OR p_status = 'ALL' OR
    p.verification_status ILIKE p_status
  )
  ORDER BY p.name ASC NULLS LAST
  LIMIT GREATEST(p_limit, 1)
  OFFSET GREATEST(p_offset, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_fetch_profiles(
  p_offset INT DEFAULT 0,
  p_limit INT DEFAULT 500
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
  ORDER BY COALESCE(p.created_at, p.join_date) DESC NULLS LAST
  LIMIT GREATEST(p_limit, 1)
  OFFSET GREATEST(p_offset, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_fetch_goalkeepers(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_fetch_referees(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_fetch_pitches(text, text, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_fetch_profiles(int, int) TO authenticated;
