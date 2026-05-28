-- ==============================================================================
-- OYNA: Plei & Fubles Hybrid Architecture (Supabase SQL Schema)
-- ==============================================================================
-- Bu SQL betiği, Patron Paneli yetkilendirmesi, Row Level Security (RLS), 
-- Triggerlar, ve RPC'ler dahil olmak üzere tüm mimariyi kurar.
-- Kullanım: Supabase SQL Editor'de tümünü seçip çalıştırın.
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS earthdistance CASCADE;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ==============================================================================
-- TABLES
-- ==============================================================================

-- Çakışmaları önlemek için eski tabloları siliyoruz (Veri kaybı uyarısı: Test verileriniz silinir)
DROP TABLE IF EXISTS waitlist CASCADE;
DROP TABLE IF EXISTS match_registrations CASCADE;
DROP TABLE IF EXISTS player_ratings CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS individual_matches CASCADE;
DROP TABLE IF EXISTS pitches CASCADE;
-- Profil tablosunu düşürmek auth ile sorun yaratabilir, o yüzden onu alter edeceğiz veya bırakacağız.

-- 1. Kullanıcı Profilleri ve İtibar Tablosu
-- Eğer zaten varsa hata vermez, yoksa yaratır. 
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    avatar_url TEXT,
    role VARCHAR DEFAULT 'USER' CHECK (role IN ('USER', 'ADMIN', 'ORGANIZER')),
    trust_score FLOAT DEFAULT 5.0 CHECK (trust_score BETWEEN 0.0 AND 5.0),
    skill_rating FLOAT DEFAULT 4.0 CHECK (skill_rating BETWEEN 1.0 AND 5.0),
    ratings_history JSONB[] DEFAULT '{}',
    reliability_score INT DEFAULT 100 CHECK (reliability_score BETWEEN 0 AND 100),
    is_verified BOOLEAN DEFAULT false,
    is_banned BOOLEAN DEFAULT false,
    join_date TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- (Eğer profiles tablosu önceden varsa kolonları ekleyelim ki eksik kalmasın)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role VARCHAR DEFAULT 'USER' CHECK (role IN ('USER', 'ADMIN', 'ORGANIZER'));
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS trust_score FLOAT DEFAULT 5.0 CHECK (trust_score BETWEEN 0.0 AND 5.0);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS skill_rating FLOAT DEFAULT 4.0 CHECK (skill_rating BETWEEN 1.0 AND 5.0);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ratings_history JSONB[] DEFAULT '{}';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS reliability_score INT DEFAULT 100 CHECK (reliability_score BETWEEN 0 AND 100);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT false;

-- 2. Tesisler (Pitches) Tablosu (GiST İndeksi ile Coğrafi Destekli)
-- ll_to_earth fonksiyonu DOUBLE PRECISION (float8) gerektirir.
CREATE TABLE pitches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    address TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true
);
CREATE INDEX pitches_geo_idx ON pitches USING gist (ll_to_earth(latitude, longitude));

-- 3. Bireysel Maç Havuzu (Plei Çekirdeği)
CREATE TABLE individual_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pitch_id UUID REFERENCES pitches(id) ON DELETE RESTRICT,
    title VARCHAR(150) NOT NULL,
    match_datetime TIMESTAMP WITH TIME ZONE NOT NULL,
    total_capacity INT NOT NULL DEFAULT 14,
    min_capacity INT NOT NULL DEFAULT 10,
    cost_per_player DECIMAL(10,2) NOT NULL,
    status VARCHAR(30) DEFAULT 'GATHERING' CHECK (status IN ('GATHERING', 'CONFIRMED', 'PLAYING', 'COMPLETED', 'CANCELLED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Maç Rezervasyonları (Plei Concurrency Lock)
CREATE TABLE IF NOT EXISTS match_registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID REFERENCES individual_matches(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    slot_id VARCHAR(50) NOT NULL,
    slot_role VARCHAR(20) NOT NULL, 
    payment_status VARCHAR(30) DEFAULT 'HELD' CHECK (payment_status IN ('HELD', 'CAPTURED', 'REFUNDED')),
    registered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_slot_per_match UNIQUE (match_id, slot_id),
    CONSTRAINT unique_user_per_match UNIQUE (match_id, user_id)
);

-- 5. Otomatik Yedek Kulübesi (Waitlist) - Kısmi İndeks İyileştirmesi
CREATE TABLE IF NOT EXISTS waitlist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID REFERENCES individual_matches(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    registered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status VARCHAR(30) DEFAULT 'WAITING' CHECK (status IN ('WAITING', 'PENDING', 'CONFIRMED', 'EXPIRED', 'CANCELLED')),
    expires_at TIMESTAMP WITH TIME ZONE 
);
-- Kısmi İndeks: Bir kullanıcı sadece aktif bekleyişteyken tekrar sıraya giremez. Süresi geçerse tekrar girebilir.
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_waitlist ON waitlist (match_id, user_id) WHERE status IN ('WAITING', 'PENDING', 'CONFIRMED');

-- 6. Fubles Akıllı Değerlendirme (Rating)
CREATE TABLE IF NOT EXISTS player_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id UUID REFERENCES individual_matches(id) ON DELETE CASCADE,
    rater_id UUID REFERENCES profiles(id) ON DELETE RESTRICT,
    ratee_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    skill_score INT CHECK (skill_score BETWEEN 1 AND 5),
    fair_play_score INT CHECK (fair_play_score BETWEEN 1 AND 5),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_rating_per_match UNIQUE (match_id, rater_id, ratee_id)
);

-- 7. Push Notifications Tablosu
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    title VARCHAR(100),
    body TEXT,
    payload JSONB,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE pitches ENABLE ROW LEVEL SECURITY;
ALTER TABLE individual_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Profiles: Public read, owner or Admin update
CREATE POLICY "Public profiles are viewable by everyone." ON profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile." ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admins can update any profile." ON profiles FOR UPDATE USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'ADMIN');

-- Pitches & Matches: Public read, Admin write
CREATE POLICY "Pitches are viewable by everyone." ON pitches FOR SELECT USING (true);
CREATE POLICY "Admins can manage pitches." ON pitches FOR ALL USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'ADMIN');

CREATE POLICY "Matches are viewable by everyone." ON individual_matches FOR SELECT USING (true);
CREATE POLICY "Admins can manage matches." ON individual_matches FOR ALL USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'ADMIN');

-- Match Registrations: Public read, No direct insert (done via RPC), Admin can manage
CREATE POLICY "Registrations are viewable by everyone." ON match_registrations FOR SELECT USING (true);
CREATE POLICY "Admins can manage registrations." ON match_registrations FOR ALL USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'ADMIN');
-- (Kullanıcı eklemesi RPC içerisinde SECURITY DEFINER yetkisiyle yapılacağı için burada RLS INSERT iznine gerek yoktur)

-- Waitlist: Public read, Admin manage
CREATE POLICY "Waitlist viewable by everyone." ON waitlist FOR SELECT USING (true);
CREATE POLICY "Admins can manage waitlist." ON waitlist FOR ALL USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'ADMIN');

-- ==============================================================================
-- FUNCTIONS (RPC & TRIGGERS)
-- ==============================================================================

-- A. Atomik Slot Kilitleme (Pessimistic Lock & Waitlist Fallback)
CREATE OR REPLACE FUNCTION join_match_slot(
    p_match_id UUID,
    p_user_id UUID,
    p_slot_id VARCHAR,
    p_slot_role VARCHAR
) RETURNS VOID AS $$
DECLARE
    v_capacity INT;
    v_current_count INT;
    v_status VARCHAR;
    v_is_banned BOOLEAN;
BEGIN
    -- Ban kontrolü
    SELECT is_banned INTO v_is_banned FROM profiles WHERE id = p_user_id;
    IF v_is_banned THEN RAISE EXCEPTION 'Kullanıcı banlı!'; END IF;

    -- Eşzamanlılık kilidi (Pessimistic Lock)
    SELECT status, total_capacity INTO v_status, v_capacity
    FROM individual_matches WHERE id = p_match_id FOR UPDATE;

    IF v_status != 'GATHERING' THEN RAISE EXCEPTION 'Maç aktif değil!'; END IF;

    -- Slot mükerrerlik kontrolü
    IF EXISTS (SELECT 1 FROM match_registrations WHERE match_id = p_match_id AND slot_id = p_slot_id) THEN
        RAISE EXCEPTION 'Slot doldu!';
    END IF;

    -- Kullanıcı mükerrerlik kontrolü
    IF EXISTS (SELECT 1 FROM match_registrations WHERE match_id = p_match_id AND user_id = p_user_id) THEN
        RAISE EXCEPTION 'Zaten maça kayıtlısınız!';
    END IF;

    SELECT COUNT(*) INTO v_current_count FROM match_registrations WHERE match_id = p_match_id;

    IF v_current_count >= v_capacity THEN
        -- Kapasite doluysa Waitlist'e at
        INSERT INTO waitlist (match_id, user_id) VALUES (p_match_id, p_user_id);
    ELSE
        -- Boş yer varsa Asil Kadroya al
        INSERT INTO match_registrations (match_id, user_id, slot_id, slot_role, payment_status)
        VALUES (p_match_id, p_user_id, p_slot_id, p_slot_role, 'HELD');
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- B. Anti-Fraud İtibar Puanlama Tetikleyicisi (Weighted Fubles Rating)
CREATE OR REPLACE FUNCTION update_user_skill_rating()
RETURNS TRIGGER AS $$
DECLARE
    v_rater_ts FLOAT;
    v_weighted_rating FLOAT;
BEGIN
    SELECT trust_score INTO v_rater_ts FROM profiles WHERE id = NEW.rater_id;
    v_weighted_rating := ((NEW.skill_score * 0.7 + NEW.fair_play_score * 0.3) * (v_rater_ts / 5.0));

    UPDATE profiles
    SET ratings_history = array_append(ratings_history, jsonb_build_object('rater_ts', v_rater_ts, 'score', v_weighted_rating))
    WHERE id = NEW.ratee_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_player_rating_added
    AFTER INSERT ON player_ratings
    FOR EACH ROW EXECUTE FUNCTION update_user_skill_rating();

-- C. pg_cron ile Waitlist Otomatik Zaman Aşımı
-- Sadece Supabase'de extension pg_cron aktifse çalışır.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('expire_stale_waitlists', '* * * * *', 
        'UPDATE waitlist SET status = ''EXPIRED'' WHERE status = ''PENDING'' AND expires_at < NOW()');
  END IF;
END $$;
