-- ============================================================================
-- FIX: get_nearby_matches yalnızca status='ACTIVE' döndürüyordu; ancak maçlar
-- create_match ile 'OPEN' olarak oluşturuluyor ve hiçbir akış status'u 'ACTIVE'
-- yapmıyor. Sonuç: "Top Oyna / Bireysel Maç Bul" keşfi HER ZAMAN boştu.
-- Çözüm: OPEN ve ACTIVE maçların ikisini de yakındaki keşifte göster.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_nearby_matches(
  p_lat double precision,
  p_lon double precision,
  p_radius_km double precision DEFAULT 25
)
RETURNS SETOF public.matches
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp', 'extensions'
AS $function$
  SELECT m.* FROM public.matches m
  JOIN public.pitches pt ON pt.id = m.pitch_id
  WHERE m.status IN ('OPEN', 'ACTIVE') AND m.visibility = 'OPEN'
    AND pt.latitude IS NOT NULL AND pt.longitude IS NOT NULL
    AND m.starts_at IS NOT NULL AND m.starts_at > now()
    AND earth_distance(ll_to_earth(p_lat, p_lon), ll_to_earth(pt.latitude, pt.longitude)) <= p_radius_km * 1000.0
  ORDER BY earth_distance(ll_to_earth(p_lat, p_lon), ll_to_earth(pt.latitude, pt.longitude)) ASC
  LIMIT 100;
$function$;
