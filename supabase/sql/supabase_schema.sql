-- OYNA APP SUPABASE POSTGRESQL SCHEMA
-- Lütfen bu kodların tamamını Supabase Dashboard -> SQL Editor kısmına yapıştırıp "RUN" tuşuna basın.

-- 1. PROFILES (Kullanıcılar) Tablosu
-- Supabase Auth ile bağlantılı çalışır.
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE,
  full_name TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'PLAYER', -- PLAYER, GOALKEEPER, REFEREE, ADMIN
  dna JSONB DEFAULT '{}'::jsonb, -- yaş, pozisyon, ayak tercihleri
  stats JSONB DEFAULT '{"matchesPlayed": 0, "rating": 5.0}'::jsonb,
  wallet_balance NUMERIC DEFAULT 0,
  is_verified BOOLEAN DEFAULT false,
  is_banned BOOLEAN DEFAULT false,
  is_pro BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Realtime Dinlemeyi Aç
alter publication supabase_realtime add table public.profiles;


-- 2. PITCHES (Sahalar / Tesisler)
CREATE TABLE IF NOT EXISTS public.pitches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  district TEXT NOT NULL,
  price_per_match NUMERIC NOT NULL,
  features JSONB DEFAULT '[]'::jsonb, -- [Otopark, Duş, vb.]
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
alter publication supabase_realtime add table public.pitches;


-- 3. PITCH_SLOTS (Saha Müsaitlik Saatleri)
CREATE TABLE IF NOT EXISTS public.pitch_slots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pitch_id UUID REFERENCES public.pitches(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  time TEXT NOT NULL,
  status TEXT DEFAULT 'AVAILABLE', -- AVAILABLE, BOOKED
  price NUMERIC NOT NULL,
  booked_by UUID REFERENCES public.profiles(id),
  booked_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
alter publication supabase_realtime add table public.pitch_slots;


-- 4. MATCHES (Maçlar)
CREATE TABLE IF NOT EXISTS public.matches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pitch_id UUID REFERENCES public.pitches(id),
  pitch_name TEXT,
  captain_id UUID REFERENCES public.profiles(id),
  captain_name TEXT,
  date DATE NOT NULL,
  time TEXT NOT NULL,
  status TEXT DEFAULT 'OPEN', -- OPEN, CONFIRMED, COMPLETED, CANCELLED
  gk_id UUID REFERENCES public.profiles(id),
  ref_id UUID REFERENCES public.profiles(id),
  applicants JSONB DEFAULT '[]'::jsonb, -- Başvuran kaleci/hakem listesi
  format TEXT DEFAULT '7v7',
  budget NUMERIC DEFAULT 0,
  slots JSONB DEFAULT '[]'::jsonb,
  away_slots JSONB DEFAULT '[]'::jsonb,
  home_team_id UUID REFERENCES public.teams(id),
  away_team_id UUID REFERENCES public.teams(id),
  badges JSONB DEFAULT '[]'::jsonb,
  difficulty TEXT DEFAULT 'RAHAT',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
alter publication supabase_realtime add table public.matches;


-- 5. TEAMS (Takımlar - Sosyal)
CREATE TABLE IF NOT EXISTS public.teams (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  logo_url TEXT,
  captain_id UUID REFERENCES public.profiles(id),
  players JSONB DEFAULT '[]'::jsonb,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
alter publication supabase_realtime add table public.teams;


-- 6. NOTIFICATIONS (Bildirimler)
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  type TEXT DEFAULT 'SYSTEM', -- SYSTEM, MATCH_INVITE, WARNING
  is_active BOOLEAN DEFAULT true,
  is_read BOOLEAN DEFAULT false,
  target_audience TEXT DEFAULT 'ALL',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
alter publication supabase_realtime add table public.notifications;


-- 7. SETTINGS (Uygulama Ayarları - Admin Panel İçin)
CREATE TABLE IF NOT EXISTS public.settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  app_name TEXT DEFAULT 'OYNA',
  maintenance_mode BOOLEAN DEFAULT false,
  registration_open BOOLEAN DEFAULT true,
  pro_price NUMERIC DEFAULT 99.9,
  commission_rate NUMERIC DEFAULT 10.0,
  min_rating_to_play NUMERIC DEFAULT 3.0,
  max_matches_per_day INTEGER DEFAULT 3,
  featured_pitch_id UUID,
  show_announcement_banner BOOLEAN DEFAULT true,
  announcement_banner TEXT DEFAULT 'Hoş Geldiniz!',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
-- Sadece 1 satır olmasını garanti edelim
INSERT INTO public.settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- TRIGGER: Auth'a yeni kayıt olunduğunda Profile tablosunu otomatik oluştur (Opsiyonel ama güvenli)
create or replace function public.handle_new_user() 
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url');
  return new;
end;
$$ language plpgsql security definer;

-- Bu satır çalışmazsa Supabase'de sorun olmaz, çünkü kod tarafında syncUserToSupabase yazmıştık
-- Ama SQL seviyesinde de ek güvenlik sağlar:
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
