-- ============================================================================
-- YAKINDAKİ MAÇLAR SÜREYİ DE DÖNDÜRÜR (maç kartlarında GERÇEK süre)
--
-- KARAR (E6 / E1a): maçın süresi slottan — yani tarifenin `slot_minutes`
-- değerinden — gelir ve `matches.duration_minutes` kolonunda tutulur
-- (20260728113125 + 20260828000004). Maç kartları ve lobideki "Maç Kuralları"
-- bu kolonu göstermek zorundadır; uydurma/varsayılan 60 veya 90 basılmaz.
--
-- SORUN: "Top Oyna" (maç keşif) ekranı konum kapsamı varken maçları
-- `get_nearby_matches` RPC'sinden çeker. Bu fonksiyonun RETURNS TABLE listesi
-- kolonları TEK TEK sayar ve `duration_minutes` orada YOKTU. Sonuç: keşif
-- ekranındaki kartlar süreyi hiç göremiyor, istemci de serbest metin
-- `duration`a ('90 Dakika') düşüyordu — 60 dakikalık maç kartta 90 görünüyordu.
--
-- ÇÖZÜM: dönüş listesine `duration_minutes integer` eklenir. Başka hiçbir
-- davranış değişmez: aynı filtre (OPEN/ACTIVE + visibility OPEN + gelecekteki
-- starts_at + yarıçap), aynı sıralama, aynı LIMIT 100, aynı SECURITY DEFINER
-- ve aynı yetkiler (anon REVOKE, authenticated GRANT).
--
-- NOT: RETURNS TABLE listesi değiştiği için CREATE OR REPLACE yetmez; fonksiyon
-- önce DROP edilir. Bu salt-okunur bir SELECT fonksiyonudur, veri kaybı yoktur.
--
-- İdempotent: DROP IF EXISTS + CREATE; tekrar uygulanması güvenlidir.
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_nearby_matches(double precision, double precision, double precision);

CREATE FUNCTION public.get_nearby_matches(
  p_lat       double precision,
  p_lon       double precision,
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
  created_at timestamp with time zone, "awaySlots" jsonb, "reservePlayers" jsonb,
  "chatMessages" jsonb, pitch_id uuid, visibility text, is_successful boolean,
  confirmed_at timestamp with time zone, starts_at timestamp with time zone,
  gk_id uuid, reminder_24h_sent boolean, reminder_1h_sent boolean,
  commission_model text,
  -- YENİ: maçın gerçek süresi (dakika). Kartlar bunu gösterir.
  duration_minutes integer,
  distance_meters double precision, distance_km double precision
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp', 'extensions'
AS $$
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
         earth_distance(ll_to_earth(p_lat, p_lon), ll_to_earth(pt.latitude, pt.longitude)) / 1000.0 AS distance_km
  FROM public.matches m
  JOIN public.pitches pt ON pt.id = m.pitch_id
  WHERE m.status IN ('OPEN', 'ACTIVE') AND m.visibility = 'OPEN'
    AND pt.latitude IS NOT NULL AND pt.longitude IS NOT NULL
    AND m.starts_at IS NOT NULL AND m.starts_at > now()
    AND earth_distance(ll_to_earth(p_lat, p_lon), ll_to_earth(pt.latitude, pt.longitude)) <= p_radius_km * 1000.0
  ORDER BY earth_distance(ll_to_earth(p_lat, p_lon), ll_to_earth(pt.latitude, pt.longitude)) ASC
  LIMIT 100;
$$;

REVOKE ALL     ON FUNCTION public.get_nearby_matches(double precision, double precision, double precision) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_nearby_matches(double precision, double precision, double precision) TO   authenticated;

COMMENT ON FUNCTION public.get_nearby_matches(double precision, double precision, double precision) IS
  'Yakındaki açık maçlar (earthdistance). duration_minutes DAHİL döner — maç kartları süreyi gerçek veriden gösterir (E6).';
