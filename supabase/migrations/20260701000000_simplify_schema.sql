-- ==============================================================================
-- OYNA: Database Simplification & Redesign Migration
-- ==============================================================================
-- Bu migration, kullanılmayan 7 adet tabloyu kaldırır.
-- goalkeepers ve referees tablolarını tek bir service_providers tablosunda birleştirir.
-- İstemci geriye uyumluluğu için goalkeepers ve referees View'larını ve
-- INSTEAD OF trigger'larını tanımlar.
-- ==============================================================================

BEGIN;

-- 1. Bağımlı görünümleri geçici olarak kaldır (re-compile için)
DROP VIEW IF EXISTS public.pending_provider_verifications CASCADE;
DROP VIEW IF EXISTS public.goalkeepers CASCADE;
DROP VIEW IF EXISTS public.referees CASCADE;

-- 2. Kullanılmayan ve yedekli tabloları tamamen kaldır
DROP TABLE IF EXISTS public.individual_matches CASCADE;
DROP TABLE IF EXISTS public.match_registrations CASCADE;
DROP TABLE IF EXISTS public.waitlist CASCADE;
DROP TABLE IF EXISTS public.player_ratings CASCADE;
DROP TABLE IF EXISTS public.pitch_slots CASCADE;
DROP TABLE IF EXISTS public.pitch_staff_tasks CASCADE;
DROP TABLE IF EXISTS public.pitch_staff_members CASCADE;
DROP TABLE IF EXISTS public.texts_legacy CASCADE;

-- 3. Birleştirilmiş Hizmet Sağlayıcılar (service_providers) tablosunu oluştur
CREATE TABLE IF NOT EXISTS public.service_providers (
  id               UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider_type    TEXT NOT NULL CHECK (provider_type IN ('GOALKEEPER', 'REFEREE')),
  name             TEXT NOT NULL,
  avatar           TEXT,
  bio              TEXT,
  fee              INTEGER DEFAULT 0,
  rating           NUMERIC DEFAULT 0,
  match_count      INTEGER DEFAULT 0,
  style            TEXT,
  preferred_zones  JSONB DEFAULT '[]'::jsonb,
  is_elite         BOOLEAN DEFAULT FALSE,
  is_demo          BOOLEAN DEFAULT FALSE,
  coordinates      JSONB, -- { lat, lng }
  stats            JSONB DEFAULT '{}'::jsonb,
  skills           JSONB DEFAULT '{}'::jsonb, -- Kaleciye özel
  equipment        JSONB DEFAULT '[]'::jsonb, -- Kaleciye özel
  height           TEXT,                      -- Kaleciye özel
  age              INTEGER,                   -- Kaleciye özel
  level            TEXT,                      -- Hakeme özel
  working_hours    JSONB DEFAULT '{"activeDays": [], "activeHours": ""}'::jsonb,
  settings         JSONB DEFAULT '{"notifNewOffer": true}'::jsonb,
  created_at       TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS'i aktifleştir
ALTER TABLE public.service_providers ENABLE ROW LEVEL SECURITY;

-- RLS Politikalarını Tanımla
DROP POLICY IF EXISTS "Herkes sağlayıcıları görebilir" ON public.service_providers;
CREATE POLICY "Herkes sağlayıcıları görebilir" ON public.service_providers FOR SELECT USING (true);

DROP POLICY IF EXISTS "Kullanıcı kendi sağlayıcı profilini yönetebilir" ON public.service_providers;
CREATE POLICY "Kullanıcı kendi sağlayıcı profilini yönetebilir" ON public.service_providers FOR ALL USING (auth.uid() = id);

DROP POLICY IF EXISTS "Adminler tüm sağlayıcıları yönetebilir" ON public.service_providers;
CREATE POLICY "Adminler tüm sağlayıcıları yönetebilir" ON public.service_providers FOR ALL USING (public.is_platform_admin());

-- 4. Eğer eski tablolar varsa verileri service_providers tablosuna aktar
DO $$
BEGIN
  -- Kaleciler verisi varsa taşı
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'goalkeepers') THEN
    INSERT INTO public.service_providers (
      id, provider_type, name, avatar, bio, fee, rating, match_count, style, preferred_zones, is_elite, is_demo, coordinates, stats, skills, equipment, height, age, working_hours, settings, created_at
    )
    SELECT 
      id, 'GOALKEEPER', name, avatar, bio, fee, rating, COALESCE("matchCount", match_count, 0), style, COALESCE("preferredZones", preferred_zones, '[]'::jsonb), COALESCE("isElite", is_elite, false), COALESCE("isDemo", is_demo, false), coordinates, stats, skills, equipment, height, age, working_hours, settings, created_at
    FROM public.goalkeepers
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- Hakemler verisi varsa taşı
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'referees') THEN
    INSERT INTO public.service_providers (
      id, provider_type, name, avatar, bio, fee, rating, match_count, style, preferred_zones, is_elite, is_demo, coordinates, stats, level, working_hours, settings, created_at
    )
    SELECT 
      id, 'REFEREE', name, avatar, bio, fee, rating, COALESCE("matchCount", match_count, 0), style, COALESCE("preferredZones", preferred_zones, '[]'::jsonb), COALESCE("isElite", is_elite, false), COALESCE("isDemo", is_demo, false), coordinates, stats, level, working_hours, settings, created_at
    FROM public.referees
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- 5. Eski tabloları drop et
DROP TABLE IF EXISTS public.goalkeepers CASCADE;
DROP TABLE IF EXISTS public.referees CASCADE;

-- 6. Geriye uyumluluk için goalkeepers ve referees View'larını oluştur
CREATE OR REPLACE VIEW public.goalkeepers AS
SELECT 
  id,
  id AS "authUid",
  name,
  height,
  age,
  rating,
  fee,
  match_count AS "matchCount",
  avatar,
  style,
  bio,
  preferred_zones AS "preferredZones",
  is_elite AS "isElite",
  coordinates,
  stats,
  skills,
  equipment,
  is_demo AS "isDemo",
  working_hours,
  settings,
  created_at
FROM public.service_providers
WHERE provider_type = 'GOALKEEPER';

CREATE OR REPLACE VIEW public.referees AS
SELECT 
  id,
  id AS "authUid",
  name,
  level,
  match_count AS "matchCount",
  fee,
  avatar,
  rating,
  style,
  bio,
  preferred_zones AS "preferredZones",
  is_elite AS "isElite",
  coordinates,
  stats,
  is_demo AS "isDemo",
  working_hours,
  settings,
  created_at
FROM public.service_providers
WHERE provider_type = 'REFEREE';

-- Rol izinlerini ata
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goalkeepers TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.referees TO anon, authenticated, service_role;

-- 7. Görünümler için INSTEAD OF Tetikleyicilerini tanımla
-- Kaleci Görünümü Tetikleyicisi
CREATE OR REPLACE FUNCTION public.handle_goalkeepers_view_modify()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    INSERT INTO public.service_providers (
      id, provider_type, name, avatar, bio, fee, rating, match_count, style, preferred_zones, is_elite, is_demo, coordinates, stats, skills, equipment, height, age, working_hours, settings
    ) VALUES (
      COALESCE(NEW.id, NEW."authUid"), 'GOALKEEPER', NEW.name, NEW.avatar, NEW.bio, NEW.fee, NEW.rating, NEW."matchCount", NEW.style, NEW."preferredZones", COALESCE(NEW."isElite", false), COALESCE(NEW."isDemo", false), NEW.coordinates, NEW.stats, NEW.skills, NEW.equipment, NEW.height, NEW.age, NEW.working_hours, NEW.settings
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name, avatar = EXCLUDED.avatar, bio = EXCLUDED.bio, fee = EXCLUDED.fee, rating = EXCLUDED.rating, match_count = EXCLUDED.match_count, style = EXCLUDED.style, preferred_zones = EXCLUDED.preferred_zones, is_elite = EXCLUDED.is_elite, is_demo = EXCLUDED.is_demo, coordinates = EXCLUDED.coordinates, stats = EXCLUDED.stats, skills = EXCLUDED.skills, equipment = EXCLUDED.equipment, height = EXCLUDED.height, age = EXCLUDED.age, working_hours = EXCLUDED.working_hours, settings = EXCLUDED.settings;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM public.service_providers WHERE id = OLD.id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_modify_goalkeepers ON public.goalkeepers;
CREATE TRIGGER trg_modify_goalkeepers
INSTEAD OF INSERT OR UPDATE OR DELETE ON public.goalkeepers
FOR EACH ROW EXECUTE FUNCTION public.handle_goalkeepers_view_modify();

-- Hakem Görünümü Tetikleyicisi
CREATE OR REPLACE FUNCTION public.handle_referees_view_modify()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    INSERT INTO public.service_providers (
      id, provider_type, name, avatar, bio, fee, rating, match_count, style, preferred_zones, is_elite, is_demo, coordinates, stats, level, working_hours, settings
    ) VALUES (
      COALESCE(NEW.id, NEW."authUid"), 'REFEREE', NEW.name, NEW.avatar, NEW.bio, NEW.fee, NEW.rating, NEW."matchCount", NEW.style, NEW."preferredZones", COALESCE(NEW."isElite", false), COALESCE(NEW."isDemo", false), NEW.coordinates, NEW.stats, NEW.level, NEW.working_hours, NEW.settings
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name, avatar = EXCLUDED.avatar, bio = EXCLUDED.bio, fee = EXCLUDED.fee, rating = EXCLUDED.rating, match_count = EXCLUDED.match_count, style = EXCLUDED.style, preferred_zones = EXCLUDED.preferred_zones, is_elite = EXCLUDED.is_elite, is_demo = EXCLUDED.is_demo, coordinates = EXCLUDED.coordinates, stats = EXCLUDED.stats, level = EXCLUDED.level, working_hours = EXCLUDED.working_hours, settings = EXCLUDED.settings;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM public.service_providers WHERE id = OLD.id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_modify_referees ON public.referees;
CREATE TRIGGER trg_modify_referees
INSTEAD OF INSERT OR UPDATE OR DELETE ON public.referees
FOR EACH ROW EXECUTE FUNCTION public.handle_referees_view_modify();

-- 8. Admin bekleyen onaylar görünümünü (pending_provider_verifications) yeniden bağla
CREATE OR REPLACE VIEW public.pending_provider_verifications AS
SELECT
  p.id,
  COALESCE(p.full_name, p.name) AS full_name,
  p.email,
  p.avatar_url,
  p.role AS primary_role,
  p.roles,
  p.verification_status,
  p.created_at,
  g.id AS gk_profile_id,
  g.bio AS gk_bio,
  g.fee AS gk_fee,
  r.id AS ref_profile_id,
  r.bio AS ref_bio,
  r.fee AS ref_fee
FROM public.profiles p
LEFT JOIN public.goalkeepers g ON g.id = p.id OR g."authUid" = p.id
LEFT JOIN public.referees r ON r.id = p.id OR r."authUid" = p.id
WHERE p.verification_status = 'pending'
  AND (
    p.role IN ('GOALKEEPER', 'REFEREE')
    OR COALESCE(p.roles, '[]'::jsonb) ? 'GOALKEEPER'
    OR COALESCE(p.roles, '[]'::jsonb) ? 'REFEREE'
  );

GRANT SELECT ON public.pending_provider_verifications TO authenticated;

-- Realtime yayınına ekle
-- Tablo zaten yayın listesindeyse hata vermemesi için korumalı ekleme
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'service_providers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE service_providers;
  END IF;
END $$;

COMMIT;
