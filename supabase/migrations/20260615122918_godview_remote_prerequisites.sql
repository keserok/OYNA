-- Godview remote önkoşullar (mevcut OYNA prod şeması ile uyum)
-- admin_audit_log, profil alanları, topluluk tabloları, legacy texts taşıma

-- ─── admin_audit_log ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id          UUID REFERENCES auth.users(id) NOT NULL,
  admin_name        TEXT NOT NULL,
  action            TEXT NOT NULL,
  target_type       TEXT NOT NULL,
  target_id         UUID,
  target_identifier TEXT,
  old_value         JSONB,
  new_value         JSONB,
  ip_address        TEXT,
  user_agent        TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "No direct inserts" ON public.admin_audit_log;
CREATE POLICY "No direct inserts" ON public.admin_audit_log
  FOR INSERT WITH CHECK (false);

-- ─── profiles genişletme ─────────────────────────────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS verification_reviewed_by UUID;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS verification_reviewed_at TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS account_deletion_requested_at TIMESTAMPTZ;

UPDATE public.profiles
SET full_name = name
WHERE full_name IS NULL AND name IS NOT NULL;

-- ─── legacy texts → texts_legacy ───────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'texts' AND column_name = 'data'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'texts' AND column_name = 'key'
  ) THEN
    ALTER TABLE public.texts RENAME TO texts_legacy;
  END IF;
END $$;

-- ─── topluluk tabloları (henüz yoksa) ────────────────────────
CREATE TABLE IF NOT EXISTS public.communities (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name           text NOT NULL,
  type           text NOT NULL DEFAULT 'Bağımsız',
  description    text,
  rules          text,
  domain         text,
  logo_url       text,
  banner_url     text,
  location       text,
  is_verified    boolean DEFAULT false,
  is_private     boolean DEFAULT false,
  join_mode      text NOT NULL DEFAULT 'OPEN',
  invite_code    text UNIQUE,
  member_count   integer DEFAULT 0,
  active_matches integer DEFAULT 0,
  owner_id       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.community_members (
  id                    uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  community_id          uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id               uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role                  text NOT NULL DEFAULT 'MEMBER',
  notifications_enabled boolean DEFAULT true,
  joined_at             timestamptz DEFAULT now(),
  UNIQUE(community_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.community_creation_requests (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  requester_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name             text NOT NULL,
  type             text NOT NULL DEFAULT 'Bağımsız',
  description      text,
  location         text,
  status           text NOT NULL DEFAULT 'PENDING',
  reviewed_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at      timestamptz,
  rejection_reason text,
  admin_notes      text,
  created_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ccr_requester ON public.community_creation_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_ccr_status ON public.community_creation_requests(status);

ALTER TABLE public.community_creation_requests ENABLE ROW LEVEL SECURITY;
