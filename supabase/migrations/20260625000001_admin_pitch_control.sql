-- Admin Saha Kontrol — audited CRUD RPC'leri
-- OYNA OS PitchesPage

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
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
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
  ORDER BY p.created_at DESC NULLS LAST, p.name ASC
  LIMIT GREATEST(p_limit, 1)
  OFFSET GREATEST(p_offset, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_create_pitch(p_payload JSONB)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id UUID := COALESCE(NULLIF(p_payload->>'id', '')::uuid, gen_random_uuid());
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  INSERT INTO public.pitches (
    id, name, district, city, latitude, longitude,
    price_per_match, google_rating, google_review_count,
    verification_status, owner_id, image, "isDemo", address
  ) VALUES (
    v_id,
    COALESCE(p_payload->>'name', 'Yeni Saha'),
    p_payload->>'district',
    p_payload->>'city',
    COALESCE((p_payload->>'latitude')::double precision, 41.0),
    COALESCE((p_payload->>'longitude')::double precision, 29.0),
    COALESCE((p_payload->>'price_per_match')::numeric, 0),
    COALESCE((p_payload->>'google_rating')::numeric, 4.5),
    COALESCE((p_payload->>'google_review_count')::int, 0),
    COALESCE(p_payload->>'verification_status', 'approved'),
    NULLIF(p_payload->>'owner_id', '')::uuid,
    p_payload->>'image',
    COALESCE((p_payload->>'isDemo')::boolean, false),
    COALESCE(p_payload->>'address', p_payload->>'district', '')
  );
  PERFORM public.log_admin_action('PITCH_CREATE', 'pitch', v_id, p_payload->>'name', NULL, p_payload);
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_pitch(p_pitch_id UUID, p_payload JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_old JSONB;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT to_jsonb(p.*) INTO v_old FROM public.pitches p WHERE id = p_pitch_id;
  IF v_old IS NULL THEN RAISE EXCEPTION 'Saha bulunamadı'; END IF;
  UPDATE public.pitches SET
    name = COALESCE(p_payload->>'name', name),
    district = COALESCE(p_payload->>'district', district),
    city = COALESCE(p_payload->>'city', city),
    latitude = COALESCE((p_payload->>'latitude')::double precision, latitude),
    longitude = COALESCE((p_payload->>'longitude')::double precision, longitude),
    price_per_match = COALESCE((p_payload->>'price_per_match')::numeric, price_per_match),
    google_rating = COALESCE((p_payload->>'google_rating')::numeric, google_rating),
    google_review_count = COALESCE((p_payload->>'google_review_count')::int, google_review_count),
    verification_status = COALESCE(p_payload->>'verification_status', verification_status),
    image = COALESCE(p_payload->>'image', image),
    updated_at = NOW()
  WHERE id = p_pitch_id;
  PERFORM public.log_admin_action('PITCH_UPDATE', 'pitch', p_pitch_id, p_payload->>'name', v_old, p_payload);
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_pitch(p_pitch_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_name TEXT;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT name INTO v_name FROM public.pitches WHERE id = p_pitch_id;
  IF v_name IS NULL THEN RAISE EXCEPTION 'Saha bulunamadı'; END IF;
  DELETE FROM public.pitches WHERE id = p_pitch_id;
  PERFORM public.log_admin_action('PITCH_DELETE', 'pitch', p_pitch_id, v_name, NULL, NULL);
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_fetch_withdrawal_requests(
  p_status TEXT DEFAULT 'PENDING',
  p_limit INT DEFAULT 100
)
RETURNS TABLE (
  id UUID,
  pitch_id UUID,
  owner_id UUID,
  amount NUMERIC,
  iban TEXT,
  iban_photo_url TEXT,
  status TEXT,
  created_at TIMESTAMPTZ,
  pitch_name TEXT,
  owner_name TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  RETURN QUERY
  SELECT
    w.id,
    w.pitch_id,
    w.owner_id,
    w.amount,
    w.iban,
    w.iban_photo_url,
    w.status::text,
    w.created_at,
    p.name::text AS pitch_name,
    COALESCE(pr.full_name, pr.email, 'Bilinmeyen')::text AS owner_name
  FROM public.owner_withdrawal_requests w
  LEFT JOIN public.pitches p ON p.id = w.pitch_id
  LEFT JOIN public.profiles pr ON pr.id = w.owner_id
  WHERE p_status IS NULL OR p_status = 'ALL' OR w.status ILIKE p_status
  ORDER BY w.created_at DESC
  LIMIT GREATEST(p_limit, 1);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_fetch_pitches(text, text, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_pitch(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_pitch(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_pitch(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_fetch_withdrawal_requests(text, int) TO authenticated;
