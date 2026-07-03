-- ============================================================================
-- get_nearby_matches — kanonik "zenginleştirilmiş" sürüm.
-- SORUN 1: faz7_backend sürümü yalnız status='ACTIVE' döndürüyordu; maçlar 'OPEN'
--          oluşturulduğu için "Top Oyna / Bireysel Maç Bul" keşfi HER ZAMAN boştu.
-- SORUN 2: SETOF matches (ham satır) döndürüyordu; istemci mesafe (distance_meters)
--          ve tam alan kümesi bekliyor.
-- ÇÖZÜM: TABLE(...) + distance_meters/distance_km döndür, status IN ('OPEN','ACTIVE').
-- Dönüş tipi değiştiği için önce DROP (CREATE OR REPLACE tip değiştiremez).
-- ============================================================================
DROP FUNCTION IF EXISTS public.get_nearby_matches(double precision, double precision, double precision);

CREATE FUNCTION public.get_nearby_matches(
  p_lat double precision, p_lon double precision, p_radius_km double precision DEFAULT 25
)
RETURNS TABLE(
  id uuid, title text, location text, "time" text, date text, price numeric,
  difficulty text, "minRating" numeric, image text, badges jsonb,
  "missingPositions" jsonb, slots jsonb, status text, "creatorId" uuid,
  "communityId" text, format text, duration text, gender text, "ageGroup" text,
  "refereeId" uuid, "homeTeamId" uuid, "awayTeamId" uuid, "homeScore" integer,
  "awayScore" integer, "scoreEnteredAt" timestamp with time zone, captain_id uuid,
  "isDemo" boolean, cancel_reason text, refund_status text,
  created_at timestamp with time zone, "awaySlots" jsonb, "reservePlayers" jsonb,
  "chatMessages" jsonb, pitch_id uuid, visibility text, private_code text,
  is_successful boolean, confirmed_at timestamp with time zone,
  starts_at timestamp with time zone, gk_id uuid, reminder_24h_sent boolean,
  reminder_1h_sent boolean, commission_model text,
  distance_meters double precision, distance_km double precision
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp', 'extensions'
AS $function$
  SELECT m.*,
         earth_distance(ll_to_earth(p_lat, p_lon), ll_to_earth(pt.latitude, pt.longitude))          AS distance_meters,
         earth_distance(ll_to_earth(p_lat, p_lon), ll_to_earth(pt.latitude, pt.longitude)) / 1000.0 AS distance_km
  FROM public.matches m
  JOIN public.pitches pt ON pt.id = m.pitch_id
  WHERE m.status IN ('OPEN', 'ACTIVE') AND m.visibility = 'OPEN'
    AND pt.latitude IS NOT NULL AND pt.longitude IS NOT NULL
    AND m.starts_at IS NOT NULL AND m.starts_at > now()
    AND earth_distance(ll_to_earth(p_lat, p_lon), ll_to_earth(pt.latitude, pt.longitude)) <= p_radius_km * 1000.0
  ORDER BY earth_distance(ll_to_earth(p_lat, p_lon), ll_to_earth(pt.latitude, pt.longitude)) ASC
  LIMIT 100;
$function$;

REVOKE ALL ON FUNCTION public.get_nearby_matches(double precision, double precision, double precision) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_nearby_matches(double precision, double precision, double precision) TO authenticated;
