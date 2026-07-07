-- ================================================================
-- SOSYAL YENİDEN TASARIM — AŞAMA 0: ÇEKİRDEK TABLO TABAN KAYDI
-- Kaynak: canlı şema introspeksiyonu (2026-07-06, proje iikvzgyccvgcybzdfwlv)
-- Foundation Spec: docs/social-redesign/FOUNDATION_SPEC.md §5 / Aşama 0
--
-- teams / team_members / friendships / tactics tablolarının CREATE
-- TABLE'ları bugüne dek hiçbir migration'da yoktu (yalnız canlıda).
-- Bu dosya canlıda NO-OP'tur (her şey IF NOT EXISTS / guard'lı);
-- temiz kurulumda üretimle birebir aynı şekli üretir.
--
-- NOT (önceden var olan teknik borç): daha eski tarihli bazı
-- migration'lar bu tablolara referans verir; tamamen sıfırdan bir
-- ortamda tarihsel sıra yine kırık olabilir. Sıfır ortam kurulumunda
-- önce bu dosyayı çalıştırmak yeterlidir (idempotent).
-- ================================================================

-- ─────────────────────────── teams ───────────────────────────
CREATE TABLE IF NOT EXISTS public.teams (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name               text NOT NULL,
  logo               text,
  colors             jsonb DEFAULT '[]'::jsonb,
  wins               integer DEFAULT 0,
  losses             integer DEFAULT 0,
  "playStyle"        text,
  roster             jsonb DEFAULT '[]'::jsonb,
  formation          jsonb,
  level              text,
  distance           text,
  "winRate"          text,
  "fairPlay"         text,
  "avgAge"           text,
  matches            integer DEFAULT 0,
  pitch              text,
  "time"             text,
  date               text,
  weather            jsonb,
  "matchHistory"     jsonb DEFAULT '[]'::jsonb,
  coordinates        jsonb,
  stats              jsonb,
  "shortName"        text,
  location           text,
  color1             text,
  color2             text,
  crest              text,
  players            jsonb DEFAULT '[]'::jsonb,
  captains           jsonb DEFAULT '[]'::jsonb,
  captain            uuid,
  "teamValue"        text,
  rating             numeric DEFAULT 0,
  "karatScore"       integer DEFAULT 0,
  "teamWins"         integer DEFAULT 0,
  "teamTotalMatches" integer DEFAULT 0,
  geohash            text,
  captain_id         uuid,
  is_demo            boolean NOT NULL DEFAULT false,
  created_at         timestamptz DEFAULT timezone('utc', now()),
  is_archived        boolean NOT NULL DEFAULT false,
  archived_at        timestamptz,
  home_pitch_id      uuid
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='teams_captain_id_fkey') THEN
    ALTER TABLE public.teams
      ADD CONSTRAINT teams_captain_id_fkey
      FOREIGN KEY (captain_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_fk_teams_captain_id_fkey ON public.teams (captain_id);
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

-- ─────────────────────── team_members ────────────────────────
CREATE TABLE IF NOT EXISTS public.team_members (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id    uuid NOT NULL,
  user_id    uuid NOT NULL,
  is_active  boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='team_members_team_id_fkey') THEN
    ALTER TABLE public.team_members
      ADD CONSTRAINT team_members_team_id_fkey
      FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='team_members_user_id_fkey') THEN
    ALTER TABLE public.team_members
      ADD CONSTRAINT team_members_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='team_members_team_id_user_id_key') THEN
    ALTER TABLE public.team_members
      ADD CONSTRAINT team_members_team_id_user_id_key UNIQUE (team_id, user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_fk_team_members_user_id_fkey ON public.team_members (user_id);
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- ──────────────────────── friendships ────────────────────────
-- Mevcut (eski) şekil — Aşama 1'de Spec §5'e göre dönüştürülecek.
CREATE TABLE IF NOT EXISTS public.friendships (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id            uuid,
  receiver_id          uuid,
  status               text DEFAULT 'PENDING',
  created_at           timestamptz NOT NULL DEFAULT timezone('utc', now()),
  sender_group         text,
  receiver_group       text,
  sender_is_favorite   boolean DEFAULT false,
  receiver_is_favorite boolean DEFAULT false,
  matches_together     integer DEFAULT 0
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='friendships_sender_id_fkey') THEN
    ALTER TABLE public.friendships
      ADD CONSTRAINT friendships_sender_id_fkey
      FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='friendships_receiver_id_fkey') THEN
    ALTER TABLE public.friendships
      ADD CONSTRAINT friendships_receiver_id_fkey
      FOREIGN KEY (receiver_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='friendships_sender_id_receiver_id_key') THEN
    ALTER TABLE public.friendships
      ADD CONSTRAINT friendships_sender_id_receiver_id_key UNIQUE (sender_id, receiver_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS friendships_sender_receiver_idx ON public.friendships (sender_id, receiver_id);
CREATE INDEX IF NOT EXISTS friendships_status_idx ON public.friendships (status);
CREATE INDEX IF NOT EXISTS idx_fk_friendships_receiver_id_fkey ON public.friendships (receiver_id);
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

-- ────────────────────────── tactics ──────────────────────────
CREATE TABLE IF NOT EXISTS public.tactics (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId"     uuid NOT NULL,
  mode         text,
  name         text NOT NULL,
  "teamName"   text,
  size         text,
  formation    text,
  slots        text,
  subs         text,
  "captainId"  text,
  notes        text,
  opponents    text,
  mentality    text,
  tempo        text,
  identity     text,
  drawings     text,
  "createdAt"  timestamptz NOT NULL DEFAULT timezone('utc', now()),
  "updatedAt"  timestamptz NOT NULL DEFAULT timezone('utc', now()),
  "teamId"     uuid,
  status       varchar DEFAULT 'APPROVED',
  "proposedBy" uuid,
  priority     integer DEFAULT 0,
  votes        jsonb DEFAULT '[]'::jsonb,
  is_active    boolean NOT NULL DEFAULT false
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tactics_userId_fkey') THEN
    ALTER TABLE public.tactics
      ADD CONSTRAINT "tactics_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES public.profiles(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tactics_teamId_fkey') THEN
    ALTER TABLE public.tactics
      ADD CONSTRAINT "tactics_teamId_fkey"
      FOREIGN KEY ("teamId") REFERENCES public.teams(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tactics_proposedBy_fkey') THEN
    ALTER TABLE public.tactics
      ADD CONSTRAINT "tactics_proposedBy_fkey"
      FOREIGN KEY ("proposedBy") REFERENCES public.profiles(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='tactics_status_check') THEN
    ALTER TABLE public.tactics
      ADD CONSTRAINT tactics_status_check
      CHECK (status::text = ANY (ARRAY['APPROVED','PENDING_APPROVAL','REJECTED']));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_fk_tactics_userId_fkey" ON public.tactics ("userId");
CREATE INDEX IF NOT EXISTS idx_tactics_proposed_by ON public.tactics ("proposedBy");
CREATE INDEX IF NOT EXISTS idx_tactics_team_id ON public.tactics ("teamId");
ALTER TABLE public.tactics ENABLE ROW LEVEL SECURITY;
