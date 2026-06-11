-- =============================================================================
-- Migration: Topluluklar Sistemi
-- =============================================================================
-- Tarih: 3 Haziran 2026
-- Amaç:
--   1. communities tablosu - topluluk ana verisi
--   2. community_members tablosu - üyelik ilişkisi
--   3. community_join_requests tablosu - özel topluluğa katılma talepleri
--   4. community_creation_requests tablosu - yeni topluluk oluşturma talepleri
--   5. RLS politikaları
--   6. Trigger'lar (üye sayısı, davet kodu)
-- =============================================================================

-- ----------------------------------------------------------------------------
-- ADIM 1: communities tablosu
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.communities (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name           text NOT NULL,
  type           text NOT NULL DEFAULT 'Bağımsız'
                   CHECK (type IN ('Üniversite', 'Kurumsal', 'Semt', 'Bağımsız')),
  description    text,
  rules          text,
  domain         text,
  logo_url       text,
  banner_url     text,
  location       text,
  is_verified    boolean DEFAULT false,
  is_private     boolean DEFAULT false,
  join_mode      text NOT NULL DEFAULT 'OPEN'
                   CHECK (join_mode IN ('OPEN', 'REQUEST', 'INVITE_ONLY')),
  invite_code    text UNIQUE,
  member_count   integer DEFAULT 0,
  active_matches integer DEFAULT 0,
  owner_id       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- ADIM 2: community_members tablosu
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.community_members (
  id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  community_id          uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id               uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role                  text NOT NULL DEFAULT 'MEMBER'
                          CHECK (role IN ('MEMBER', 'ADMIN')),
  notifications_enabled boolean DEFAULT true,
  joined_at             timestamptz DEFAULT now(),
  UNIQUE(community_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_community_members_community ON public.community_members(community_id);
CREATE INDEX IF NOT EXISTS idx_community_members_user ON public.community_members(user_id);

-- ----------------------------------------------------------------------------
-- ADIM 3: community_join_requests tablosu (özel topluluğa katılma)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.community_join_requests (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  community_id     uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message          text,
  status           text NOT NULL DEFAULT 'PENDING'
                     CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  reviewed_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at      timestamptz,
  rejection_reason text,
  created_at       timestamptz DEFAULT now(),
  UNIQUE(community_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_cjr_community ON public.community_join_requests(community_id);
CREATE INDEX IF NOT EXISTS idx_cjr_user     ON public.community_join_requests(user_id);

-- ----------------------------------------------------------------------------
-- ADIM 4: community_creation_requests tablosu (yeni topluluk talebi)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.community_creation_requests (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  requester_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name             text NOT NULL,
  type             text NOT NULL DEFAULT 'Bağımsız'
                     CHECK (type IN ('Üniversite', 'Kurumsal', 'Semt', 'Bağımsız')),
  description      text,
  location         text,
  status           text NOT NULL DEFAULT 'PENDING'
                     CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  reviewed_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at      timestamptz,
  rejection_reason text,
  admin_notes      text,
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ccr_requester ON public.community_creation_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_ccr_status    ON public.community_creation_requests(status);

-- ----------------------------------------------------------------------------
-- ADIM 5: Trigger - davet kodu oluşturma
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_community_invite_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  new_code text;
  code_exists boolean;
BEGIN
  IF NEW.invite_code IS NULL THEN
    LOOP
      new_code := upper(substring(replace(gen_random_uuid()::text, '-', '') FROM 1 FOR 6));
      SELECT EXISTS(SELECT 1 FROM communities WHERE invite_code = new_code) INTO code_exists;
      EXIT WHEN NOT code_exists;
    END LOOP;
    NEW.invite_code := new_code;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_community_invite_code ON public.communities;
CREATE TRIGGER trg_community_invite_code
  BEFORE INSERT ON public.communities
  FOR EACH ROW EXECUTE FUNCTION public.generate_community_invite_code();

-- ----------------------------------------------------------------------------
-- ADIM 6: Trigger - üye sayısı güncelleme
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_community_member_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.communities
      SET member_count = member_count + 1, updated_at = now()
      WHERE id = NEW.community_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.communities
      SET member_count = GREATEST(0, member_count - 1), updated_at = now()
      WHERE id = OLD.community_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_community_member_count ON public.community_members;
CREATE TRIGGER trg_community_member_count
  AFTER INSERT OR DELETE ON public.community_members
  FOR EACH ROW EXECUTE FUNCTION public.update_community_member_count();

-- ----------------------------------------------------------------------------
-- ADIM 7: updated_at trigger
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_communities_updated_at ON public.communities;
CREATE TRIGGER trg_communities_updated_at
  BEFORE UPDATE ON public.communities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- ADIM 8: RLS Etkinleştirme
-- ----------------------------------------------------------------------------
ALTER TABLE public.communities                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_members          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_join_requests    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_creation_requests ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- ADIM 9: communities RLS Politikaları
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "communities_select_public" ON public.communities;
CREATE POLICY "communities_select_public" ON public.communities
  FOR SELECT USING (
    NOT is_private
    OR EXISTS (
      SELECT 1 FROM public.community_members
      WHERE community_id = communities.id AND user_id = auth.uid()
    )
    OR owner_id = auth.uid()
  );

DROP POLICY IF EXISTS "communities_insert_auth" ON public.communities;
CREATE POLICY "communities_insert_auth" ON public.communities
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      owner_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role IN ('SUPER_ADMIN', 'ADMIN')
      )
    )
  );

DROP POLICY IF EXISTS "communities_update_admin" ON public.communities;
CREATE POLICY "communities_update_admin" ON public.communities
  FOR UPDATE USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.community_members
      WHERE community_id = communities.id AND user_id = auth.uid() AND role = 'ADMIN'
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('SUPER_ADMIN', 'ADMIN')
    )
  );

DROP POLICY IF EXISTS "communities_delete_owner" ON public.communities;
CREATE POLICY "communities_delete_owner" ON public.communities
  FOR DELETE USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('SUPER_ADMIN', 'ADMIN')
    )
  );

-- ----------------------------------------------------------------------------
-- ADIM 10: community_members RLS Politikaları
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "cm_select" ON public.community_members;
CREATE POLICY "cm_select" ON public.community_members
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.community_members cm2
      WHERE cm2.community_id = community_members.community_id AND cm2.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "cm_insert_self" ON public.community_members;
CREATE POLICY "cm_insert_self" ON public.community_members
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.community_members cm2
      WHERE cm2.community_id = community_members.community_id
        AND cm2.user_id = auth.uid() AND cm2.role = 'ADMIN'
    )
  );

DROP POLICY IF EXISTS "cm_delete_self_or_admin" ON public.community_members;
CREATE POLICY "cm_delete_self_or_admin" ON public.community_members
  FOR DELETE USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.community_members cm2
      WHERE cm2.community_id = community_members.community_id
        AND cm2.user_id = auth.uid() AND cm2.role = 'ADMIN'
    )
  );

DROP POLICY IF EXISTS "cm_update_admin" ON public.community_members;
CREATE POLICY "cm_update_admin" ON public.community_members
  FOR UPDATE USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.community_members cm2
      WHERE cm2.community_id = community_members.community_id
        AND cm2.user_id = auth.uid() AND cm2.role = 'ADMIN'
    )
  );

-- ----------------------------------------------------------------------------
-- ADIM 11: community_join_requests RLS Politikaları
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "cjr_select" ON public.community_join_requests;
CREATE POLICY "cjr_select" ON public.community_join_requests
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.community_members cm
      WHERE cm.community_id = community_join_requests.community_id
        AND cm.user_id = auth.uid() AND cm.role = 'ADMIN'
    )
  );

DROP POLICY IF EXISTS "cjr_insert" ON public.community_join_requests;
CREATE POLICY "cjr_insert" ON public.community_join_requests
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "cjr_update_admin" ON public.community_join_requests;
CREATE POLICY "cjr_update_admin" ON public.community_join_requests
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.community_members cm
      WHERE cm.community_id = community_join_requests.community_id
        AND cm.user_id = auth.uid() AND cm.role = 'ADMIN'
    )
  );

-- ----------------------------------------------------------------------------
-- ADIM 12: community_creation_requests RLS Politikaları
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "ccr_select" ON public.community_creation_requests;
CREATE POLICY "ccr_select" ON public.community_creation_requests
  FOR SELECT USING (
    requester_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('SUPER_ADMIN', 'ADMIN')
    )
  );

DROP POLICY IF EXISTS "ccr_insert" ON public.community_creation_requests;
CREATE POLICY "ccr_insert" ON public.community_creation_requests
  FOR INSERT WITH CHECK (auth.uid() = requester_id);

DROP POLICY IF EXISTS "ccr_update_superadmin" ON public.community_creation_requests;
CREATE POLICY "ccr_update_superadmin" ON public.community_creation_requests
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('SUPER_ADMIN', 'ADMIN')
    )
  );

-- ----------------------------------------------------------------------------
-- ADIM 13: Grant izinleri
-- ----------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.communities                 TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_members           TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_join_requests     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_creation_requests TO authenticated;

GRANT SELECT ON public.communities                 TO anon;
GRANT SELECT ON public.community_members           TO anon;
