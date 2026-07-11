-- Harita "bu alanda ara" güçlendirmesi: yayından kaldırılmış (is_published=false)
-- sahalar alan aramasında dönmemeli. Vitrin client'ı zaten filtreliyor; bu,
-- güvenceyi DB seviyesine indirir (client kesişimine bağımlılık kalmaz).
CREATE OR REPLACE FUNCTION public.get_nearby_pitches(
  p_lat       double precision,
  p_lon       double precision,
  p_radius_km double precision DEFAULT 25
)
RETURNS TABLE(id uuid, distance_km double precision)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp', 'extensions'
AS $$
  SELECT pt.id,
         earth_distance(ll_to_earth(p_lat, p_lon), ll_to_earth(pt.latitude, pt.longitude)) / 1000.0 AS distance_km
  FROM public.pitches pt
  WHERE pt.verification_status = 'approved'
    AND pt.is_open IS TRUE
    AND pt.is_published IS DISTINCT FROM false
    AND COALESCE(pt.is_demo, false) = false
    AND pt.latitude IS NOT NULL AND pt.longitude IS NOT NULL
    AND earth_distance(ll_to_earth(p_lat, p_lon), ll_to_earth(pt.latitude, pt.longitude)) <= p_radius_km * 1000.0
  ORDER BY 2 ASC;
$$;
