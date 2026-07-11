-- OYNA APP KONUM TABANLI EŞLEŞME (POSTGIS) SİSTEMİ
-- Bu kodu Supabase SQL Editor'de çalıştırın.

-- 1. PostGIS Eklentisini Aktif Et
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. Pitches (Sahalar) Tablosuna Coğrafi Konum Sütunu Ekleme
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS location geography(POINT);
-- Hızlı sorgular için Coğrafi İndeks (GIST)
CREATE INDEX IF NOT EXISTS pitches_location_idx ON public.pitches USING GIST (location);

-- 3. Kullanıcıların (Profiles) Son Bilinen Konumları (Opsiyonel ama eşleşme için faydalı)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_location geography(POINT);

-- 4. Yakındaki Maçları Getirme RPC'si (Remote Procedure Call)
-- Belirtilen Enlem/Boylam (Lat/Lon) ve Yarıçap (KM) içindeki aktif maçları,
-- Kullanıcıya en yakından uzağa doğru sıralayarak getirir.
CREATE OR REPLACE FUNCTION get_nearby_matches(
  p_lat DOUBLE PRECISION,
  p_lon DOUBLE PRECISION,
  p_radius_km DOUBLE PRECISION DEFAULT 50.0
)
RETURNS TABLE (
  match_id UUID,
  pitch_id UUID,
  pitch_name TEXT,
  date DATE,
  time TEXT,
  status TEXT,
  budget NUMERIC,
  format TEXT,
  captain_id UUID,
  applicants JSONB,
  distance_meters DOUBLE PRECISION
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    m.id,
    m.pitch_id,
    m.pitch_name,
    m.date,
    m.time,
    m.status,
    m.budget,
    m.format,
    m.captain_id,
    m.applicants,
    ST_Distance(
      p.location, 
      ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography
    ) AS distance_meters
  FROM 
    public.matches m
  JOIN 
    public.pitches p ON m.pitch_id = p.id
  WHERE 
    m.status = 'OPEN' -- Sadece açık maçları göster
    AND p.location IS NOT NULL
    -- Mesafe filtresi (Metre cinsinden hesaplanır)
    AND ST_DWithin(
      p.location,
      ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography,
      p_radius_km * 1000
    )
  ORDER BY 
    distance_meters ASC; -- En yakından uzağa sırala
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Kullanıcı Konumunu Güncelleme RPC'si
CREATE OR REPLACE FUNCTION update_user_location(
  p_user_id UUID,
  p_point_str TEXT
)
RETURNS VOID AS $$
BEGIN
  UPDATE public.profiles
  SET last_location = ST_GeomFromText(p_point_str, 4326)
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
