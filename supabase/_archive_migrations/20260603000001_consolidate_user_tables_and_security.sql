-- =============================================================================
-- Migration: Kullanıcı Tablolarını Birleştir + Güvenlik Düzeltmeleri
-- =============================================================================
-- Tarih: 3 Haziran 2026
-- Amaç:
--   1. profiles tablosunu tek kullanıcı tablosu olarak zenginleştir
--   2. users tablosuna bağlı tüm FK'leri profiles'a yönlendir
--   3. auth.users'a bağlı public tablo FK'lerini profiles'a yönlendir
--   4. users tablosunu kaldır
--   5. Yeni kullanıcı kaydında otomatik profil oluşturan trigger ekle
--   6. Eksik RLS policy'leri ekle (player_ratings, wallet_transactions)
--   7. SECURITY DEFINER fonksiyonlarda search_path güvenliği
-- =============================================================================

-- ----------------------------------------------------------------------------
-- ADIM 1: profiles tablosuna eksik kolonları ekle (snake_case standardı)
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS rating numeric DEFAULT 5.0,
  ADD COLUMN IF NOT EXISTS is_pro boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS match_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wallet numeric DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS ban_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS communities jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS player_card jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS oyna_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS friends jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS is_looking_for_team boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_available boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS diamonds integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS win_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_matches integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS roles jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT timezone('utc', now()),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT timezone('utc', now());

-- ----------------------------------------------------------------------------
-- ADIM 2: role constraint güncelle - tüm UserRole değerlerini kapsar
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'PLAYER';
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role::text IN (
    'PLAYER','GOALKEEPER','REFEREE','ADMIN','ORGANIZER',
    'SUPER_ADMIN','COMMUNITY_ADMIN','CAPTAIN','OWNER'
  ));

-- ----------------------------------------------------------------------------
-- ADIM 3: public.users'a bağlı FK'leri profiles'a yönlendir
-- ----------------------------------------------------------------------------
ALTER TABLE public.friendships DROP CONSTRAINT IF EXISTS friendships_sender_id_fkey;
ALTER TABLE public.friendships DROP CONSTRAINT IF EXISTS friendships_receiver_id_fkey;
ALTER TABLE public.friendships
  ADD CONSTRAINT friendships_sender_id_fkey
    FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD CONSTRAINT friendships_receiver_id_fkey
    FOREIGN KEY (receiver_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.team_members DROP CONSTRAINT IF EXISTS team_members_user_id_fkey;
ALTER TABLE public.team_members
  ADD CONSTRAINT team_members_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.tactics DROP CONSTRAINT IF EXISTS "tactics_userId_fkey";
ALTER TABLE public.tactics
  ADD CONSTRAINT "tactics_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_admin_id_fkey;
ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_admin_id_fkey
    FOREIGN KEY (admin_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- ----------------------------------------------------------------------------
-- ADIM 4: auth.users'a bağlı public tablo FK'lerini profiles'a yönlendir
-- (profiles.id = auth.users.id, birebir aynı UUID'ler)
-- ----------------------------------------------------------------------------
ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_captain_id_fkey;
ALTER TABLE public.matches
  ADD CONSTRAINT matches_captain_id_fkey
    FOREIGN KEY (captain_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.pitch_bookings DROP CONSTRAINT IF EXISTS pitch_bookings_user_id_fkey;
ALTER TABLE public.pitch_bookings
  ADD CONSTRAINT pitch_bookings_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.pitches DROP CONSTRAINT IF EXISTS pitches_owner_id_fkey;
ALTER TABLE public.pitches
  ADD CONSTRAINT pitches_owner_id_fkey
    FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.service_offers DROP CONSTRAINT IF EXISTS service_offers_captain_id_fkey;
ALTER TABLE public.service_offers DROP CONSTRAINT IF EXISTS service_offers_provider_id_fkey;
ALTER TABLE public.service_offers
  ADD CONSTRAINT service_offers_captain_id_fkey
    FOREIGN KEY (captain_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD CONSTRAINT service_offers_provider_id_fkey
    FOREIGN KEY (provider_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.teams DROP CONSTRAINT IF EXISTS teams_captain_id_fkey;
ALTER TABLE public.teams
  ADD CONSTRAINT teams_captain_id_fkey
    FOREIGN KEY (captain_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- ADIM 5: users tablosunu kaldır (FK'ler profiles'a taşındı, DB boştu)
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS public.users CASCADE;

-- ----------------------------------------------------------------------------
-- ADIM 6: Yeni kullanıcı kaydında otomatik profiles satırı oluşturan trigger
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, avatar_url, role, created_at, updated_at)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      split_part(COALESCE(NEW.email, ''), '@', 1)
    ),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', ''),
    'PLAYER',
    now(),
    now()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ----------------------------------------------------------------------------
-- ADIM 7: Eksik RLS policy'leri
-- ----------------------------------------------------------------------------
-- player_ratings: herkese okuma, giriş yapan kullanıcı puan verebilir
DROP POLICY IF EXISTS "player_ratings_select" ON public.player_ratings;
CREATE POLICY "player_ratings_select" ON public.player_ratings
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "player_ratings_insert" ON public.player_ratings;
CREATE POLICY "player_ratings_insert" ON public.player_ratings
  FOR INSERT WITH CHECK (auth.uid() = rater_id);

DROP POLICY IF EXISTS "player_ratings_no_update" ON public.player_ratings;
CREATE POLICY "player_ratings_no_update" ON public.player_ratings
  FOR UPDATE USING (false);

-- wallet_transactions: kullanıcı sadece kendi işlemlerini görür
-- Yazma işlemi sadece SECURITY DEFINER fonksiyonlar üzerinden (process_match_payment)
DROP POLICY IF EXISTS "wallet_select_own" ON public.wallet_transactions;
CREATE POLICY "wallet_select_own" ON public.wallet_transactions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "wallet_no_direct_insert" ON public.wallet_transactions;
CREATE POLICY "wallet_no_direct_insert" ON public.wallet_transactions
  FOR INSERT WITH CHECK (false);

-- ----------------------------------------------------------------------------
-- ADIM 8: SECURITY DEFINER fonksiyonlarda search_path güvenliği
-- ----------------------------------------------------------------------------
ALTER FUNCTION public.process_match_payment(uuid, uuid, numeric)    SET search_path = public, pg_temp;
ALTER FUNCTION public.join_match_slot(uuid, uuid, varchar, varchar)  SET search_path = public, pg_temp;
ALTER FUNCTION public.notify_match_joined()                          SET search_path = public, pg_temp;
ALTER FUNCTION public.notify_match_cancelled()                       SET search_path = public, pg_temp;
ALTER FUNCTION public.notify_ref_status_change()                     SET search_path = public, pg_temp;
ALTER FUNCTION public.notify_send_push_webhook()                     SET search_path = public, pg_temp;
ALTER FUNCTION public.send_match_invite(uuid, uuid, uuid, uuid)      SET search_path = public, pg_temp;
ALTER FUNCTION public.update_player_diamond(uuid, boolean, integer)  SET search_path = public, pg_temp;
ALTER FUNCTION public.update_user_skill_rating()                     SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_new_user()                              SET search_path = public, pg_temp;

-- Ödeme ve diamond fonksiyonları anon role'dan erişilemesin
REVOKE EXECUTE ON FUNCTION public.process_match_payment(uuid, uuid, numeric)   FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_player_diamond(uuid, boolean, integer) FROM anon;
