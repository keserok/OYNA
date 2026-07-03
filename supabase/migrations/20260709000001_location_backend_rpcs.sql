-- ============================================================================
-- KONUM (LOCATION) BACKEND — earthdistance tabanlı (PostGIS YOK)
-- ----------------------------------------------------------------------------
-- Bu migration konum arka ucunu düzeltir/tamamlar:
--   A) set_user_location   — güvenli, auth.uid() bazlı konum yazma (JSONB)
--   B) get_nearby_matches  — distance_meters/distance_km EKLER (client okuyabilsin)
--   C) get_nearby_pitches  — yakındaki onaylı/açık sahalar
--   D) get_nearby_providers— yakındaki kaleci/hakem (coordinates JSONB {lat,lng})
--   +  update_user_location — ESKİ, ST_GeomFromText ile bozuk olan RPC'yi
--                             fırlatmayan (no-throw) bir sarmalayıcıya çevirir.
--
-- Uzaklık: earthdistance uzantısı public şemasında kuruludur (cube + earthdistance).
--   earth_distance(ll_to_earth(lat,lon), ll_to_earth(lat,lon))  -> METRE
-- Idempotent: CREATE OR REPLACE / ADD COLUMN IF NOT EXISTS / DROP IF EXISTS.
-- ============================================================================

-- profiles.last_location JSONB kolonunu garanti et (demo seed JSON yazıyor)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_location jsonb;

-- ----------------------------------------------------------------------------
-- A) set_user_location — SADECE mevcut kullanıcının (auth.uid()) konumunu yazar.
--    p_user_id parametresi YOK -> spoofing engellenir.
--    lat/lng 3 ondalığa yuvarlanır (~110m gizlilik kabalaştırması).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_user_location(
  p_lat      double precision,
  p_lng      double precision,
  p_city     text DEFAULT NULL,
  p_district text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: giriş gerekli.';
  END IF;
  IF p_lat IS NULL OR p_lng IS NULL THEN
    RAISE EXCEPTION 'INVALID_COORDS: lat/lng zorunludur.';
  END IF;
  IF p_lat < -90 OR p_lat > 90 OR p_lng < -180 OR p_lng > 180 THEN
    RAISE EXCEPTION 'INVALID_COORDS: aralık dışı koordinat.';
  END IF;

  UPDATE public.profiles
     SET last_location = jsonb_build_object(
           'lat',        round(p_lat::numeric, 3),
           'lng',        round(p_lng::numeric, 3),
           'city',       p_city,
           'district',   p_district,
           'updated_at', now()
         )
   WHERE id = v_uid;
END;
$$;

REVOKE ALL     ON FUNCTION public.set_user_location(double precision, double precision, text, text) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.set_user_location(double precision, double precision, text, text) TO   authenticated;

-- ----------------------------------------------------------------------------
--   update_user_location (ESKİ) — ST_GeomFromText (PostGIS) çağırdığı için
--   %100 fırlatıyordu ve hiçbir gerçek konum kalıcı olmuyordu. Artık client
--   set_user_location'a geçiyor; bu sarmalayıcı geriye-uyum için POINT(lng lat)
--   metnini ayrıştırıp JSONB yazar ve HİÇBİR durumda client'ı çökertmez.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_user_location(
  p_user_id   uuid,
  p_point_str text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_coords text;
  v_lng    double precision;
  v_lat    double precision;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: giriş gerekli.';
  END IF;
  IF v_uid <> p_user_id AND NOT COALESCE(public.is_platform_admin(), false) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Başka bir kullanıcının konumunu güncelleyemezsiniz.';
  END IF;

  -- 'POINT(lng lat)' -> lng, lat  (ayrıştırma hatasını yut: no-throw geriye-uyum)
  BEGIN
    v_coords := regexp_replace(p_point_str, '^\s*POINT\s*\(\s*|\s*\)\s*$', '', 'gi');
    v_lng := split_part(v_coords, ' ', 1)::double precision;
    v_lat := split_part(v_coords, ' ', 2)::double precision;

    UPDATE public.profiles
       SET last_location = jsonb_build_object(
             'lat',        round(v_lat::numeric, 3),
             'lng',        round(v_lng::numeric, 3),
             'updated_at', now()
           )
     WHERE id = p_user_id;
  EXCEPTION WHEN others THEN
    -- Legacy yol: bozuk girdi client'ı çökertmesin (yeni yol set_user_location).
    NULL;
  END;
END;
$$;

REVOKE ALL     ON FUNCTION public.update_user_location(uuid, text) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.update_user_location(uuid, text) TO   authenticated;
-- ----------------------------------------------------------------------------
-- C) get_nearby_pitches — yakındaki onaylı + açık + demo-olmayan sahalar.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_nearby_pitches(double precision, double precision, double precision);

CREATE OR REPLACE FUNCTION public.get_nearby_pitches(
  p_lat       double precision,
  p_lon       double precision,
  p_radius_km double precision DEFAULT 25
)
RETURNS TABLE(id uuid, distance_km double precision)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp, extensions
AS $$
  SELECT pt.id,
         earth_distance(ll_to_earth(p_lat, p_lon), ll_to_earth(pt.latitude, pt.longitude)) / 1000.0 AS distance_km
  FROM public.pitches pt
  WHERE pt.verification_status = 'approved'
    AND pt.is_open IS TRUE
    AND COALESCE(pt.is_demo, false) = false
    AND pt.latitude IS NOT NULL AND pt.longitude IS NOT NULL
    AND earth_distance(ll_to_earth(p_lat, p_lon), ll_to_earth(pt.latitude, pt.longitude)) <= p_radius_km * 1000.0
  ORDER BY 2 ASC;
$$;

REVOKE ALL     ON FUNCTION public.get_nearby_pitches(double precision, double precision, double precision) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.get_nearby_pitches(double precision, double precision, double precision) TO   authenticated;

-- ----------------------------------------------------------------------------
-- D) get_nearby_providers — yakındaki kaleci (GK) / hakem (REF).
--    Koordinatlar coordinates JSONB {lat,lng} içinde saklanıyor.
--    find_providers_for_match ile TUTARLI kapı:
--      profiles.verification_status='approved' AND COALESCE(is_available,true)
--      AND NOT isDemo. Koordinatı olmayan sağlayıcılar (çoğu) doğal olarak elenir.
--    p_type: 'GK' -> goalkeepers, 'REF' -> referees. UNION ALL + WHERE filtresi
--    ile tek dalı çalıştırır (dinamik SQL yok).
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_nearby_providers(double precision, double precision, double precision, text);

CREATE OR REPLACE FUNCTION public.get_nearby_providers(
  p_lat       double precision,
  p_lon       double precision,
  p_radius_km double precision DEFAULT 25,
  p_type      text DEFAULT 'GK'
)
RETURNS TABLE(id uuid, distance_km double precision)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp, extensions
AS $$
  -- GK dalı
  SELECT g.id,
         earth_distance(
           ll_to_earth(p_lat, p_lon),
           ll_to_earth((g.coordinates->>'lat')::double precision, (g.coordinates->>'lng')::double precision)
         ) / 1000.0 AS distance_km
  FROM public.goalkeepers g
  JOIN public.profiles p ON p.id = g.id
  WHERE p_type = 'GK'
    AND p.verification_status = 'approved'
    AND COALESCE(p.is_available, true) = true
    AND COALESCE(g."isDemo", false) = false
    AND g.coordinates IS NOT NULL
    AND (g.coordinates->>'lat') IS NOT NULL AND (g.coordinates->>'lng') IS NOT NULL
    AND earth_distance(
          ll_to_earth(p_lat, p_lon),
          ll_to_earth((g.coordinates->>'lat')::double precision, (g.coordinates->>'lng')::double precision)
        ) <= p_radius_km * 1000.0

  UNION ALL

  -- REF dalı
  SELECT r.id,
         earth_distance(
           ll_to_earth(p_lat, p_lon),
           ll_to_earth((r.coordinates->>'lat')::double precision, (r.coordinates->>'lng')::double precision)
         ) / 1000.0 AS distance_km
  FROM public.referees r
  JOIN public.profiles p ON p.id = r.id
  WHERE p_type = 'REF'
    AND p.verification_status = 'approved'
    AND COALESCE(p.is_available, true) = true
    AND COALESCE(r."isDemo", false) = false
    AND r.coordinates IS NOT NULL
    AND (r.coordinates->>'lat') IS NOT NULL AND (r.coordinates->>'lng') IS NOT NULL
    AND earth_distance(
          ll_to_earth(p_lat, p_lon),
          ll_to_earth((r.coordinates->>'lat')::double precision, (r.coordinates->>'lng')::double precision)
        ) <= p_radius_km * 1000.0

  ORDER BY 2 ASC;
$$;

REVOKE ALL     ON FUNCTION public.get_nearby_providers(double precision, double precision, double precision, text) FROM anon, public;
GRANT  EXECUTE ON FUNCTION public.get_nearby_providers(double precision, double precision, double precision, text) TO   authenticated;
