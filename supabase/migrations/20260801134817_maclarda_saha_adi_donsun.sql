-- ════════════════════════════════════════════════════════════════════════════
-- MAÇ KARTLARINDA SAHA ADI
-- ════════════════════════════════════════════════════════════════════════════
-- SORUN
-- Top Oyna listesindeki kartlarda büyük başlık olarak `matches.location`
-- basılıyordu. O alan tesis adını değil İLÇEYİ taşır; aynı ilçedeki bütün
-- maçlar tek tip görünüyordu ("Altınordu", "Altınordu", "Altınordu"...).
-- Oyuncu maçın hangi tesiste olduğunu listeden anlayamıyordu.
--
-- SEBEP
-- Saha adı uygulamaya HİÇ gönderilmiyordu: `get_nearby_matches` pitches
-- tablosuna zaten JOIN yapıyor ama yalnız koordinatı kullanıyor, adı ve
-- ilçeyi döndürmüyordu.
--
-- ÇÖZÜM
-- İki alan eklenir: `pitch_name` ve `pitch_district`. Kart başlıkta tesis
-- adını, altında ilçeyi gösterir. Var olan hiçbir kolon çıkarılmadı, sıraları
-- değişmedi — eski istemciler etkilenmez.
--
-- NEDEN DROP + CREATE: dönüş tablosuna kolon eklemek `CREATE OR REPLACE` ile
-- yapılamaz (42P13 "cannot change return type"). Yetkiler yeniden verilir.
-- ════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.get_nearby_matches(double precision, double precision, double precision);

CREATE FUNCTION public.get_nearby_matches(
  p_lat double precision,
  p_lon double precision,
  p_radius_km double precision DEFAULT 25
)
RETURNS TABLE(
  id uuid, title text, location text, "time" text, date text, price numeric,
  difficulty text, "minRating" numeric, image text, badges jsonb,
  "missingPositions" jsonb, slots jsonb, status text, "creatorId" uuid,
  "communityId" text, format text, duration text, gender text, "ageGroup" text,
  "refereeId" uuid, "homeTeamId" uuid, "awayTeamId" uuid, "homeScore" integer,
  "awayScore" integer, "scoreEnteredAt" timestamp with time zone,
  captain_id uuid, "isDemo" boolean, cancel_reason text, refund_status text,
  created_at timestamp with time zone, "awaySlots" jsonb,
  "reservePlayers" jsonb, "chatMessages" jsonb, pitch_id uuid, visibility text,
  is_successful boolean, confirmed_at timestamp with time zone,
  starts_at timestamp with time zone, gk_id uuid, reminder_24h_sent boolean,
  reminder_1h_sent boolean, commission_model text, duration_minutes integer,
  distance_meters double precision, distance_km double precision,
  pitch_name text, pitch_district text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp', 'extensions'
AS $function$
  SELECT m.id, m.title, m.location, m."time", m.date, m.price, m.difficulty,
         m."minRating", m.image, m.badges, m."missingPositions", m.slots,
         m.status, m."creatorId", m."communityId", m.format, m.duration,
         m.gender, m."ageGroup", m."refereeId", m."homeTeamId", m."awayTeamId",
         m."homeScore", m."awayScore", m."scoreEnteredAt", m.captain_id,
         m."isDemo", m.cancel_reason, m.refund_status, m.created_at,
         m."awaySlots", m."reservePlayers", m."chatMessages", m.pitch_id,
         m.visibility, m.is_successful, m.confirmed_at,
         m.starts_at, m.gk_id, m.reminder_24h_sent, m.reminder_1h_sent,
         m.commission_model,
         m.duration_minutes,
         earth_distance(ll_to_earth(p_lat, p_lon), ll_to_earth(pt.latitude, pt.longitude))          AS distance_meters,
         earth_distance(ll_to_earth(p_lat, p_lon), ll_to_earth(pt.latitude, pt.longitude)) / 1000.0 AS distance_km,
         pt.name::text     AS pitch_name,
         pt.district::text AS pitch_district
  FROM public.matches m
  JOIN public.pitches pt ON pt.id = m.pitch_id
  WHERE m.status IN ('OPEN', 'ACTIVE') AND m.visibility = 'OPEN'
    AND pt.latitude IS NOT NULL AND pt.longitude IS NOT NULL
    AND m.starts_at IS NOT NULL AND m.starts_at > now()
    AND earth_distance(ll_to_earth(p_lat, p_lon), ll_to_earth(pt.latitude, pt.longitude)) <= p_radius_km * 1000.0
  ORDER BY earth_distance(ll_to_earth(p_lat, p_lon), ll_to_earth(pt.latitude, pt.longitude)) ASC
  LIMIT 100;
$function$;

-- Yetkiler: anon HİÇBİR koşulda çağıramaz (güvenlik sertleştirmesi deseni).
REVOKE ALL ON FUNCTION public.get_nearby_matches(double precision, double precision, double precision) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_nearby_matches(double precision, double precision, double precision) TO authenticated, service_role;
