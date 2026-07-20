-- ═══════════════════════════════════════════════════════════════════════════
-- BASELINE — teams / team_members / courts (yapısal defter drift'i onarımı, 2/2)
-- ---------------------------------------------------------------------------
-- 20260713000001_social_faz0_baseline_core_tables.sql bu tabloların CREATE'ini
-- repo'ya kazandırmıştı ama TEMMUZ konumunda duruyor; 20260531_security_hardening
-- (ve sonrası) teams'e MAYIS'ta başvuruyor → sıfırdan kurulum yine kırılıyordu
-- (o dosyanın kendi NOT'u da bu borcu kaydeder). Bu dosya aynı kanonik
-- tanımları DOĞRU sıraya (ilk referanstan önce) yerleştirir; Temmuz dosyası
-- IF NOT EXISTS sayesinde tamamen no-op'a düşer. courts ise hiçbir migration'da
-- yaratılmıyordu — canlı şemadan (2026-07-19 introspection) eklendi.
-- CHECK kısıtları BİLEREK yok (tarihteki migration'lar kendileri ekliyor).
-- ÜRETİMDE: üç tablo da zaten var → dosya tamamen no-op.
-- Bkz: docs/master/SUPABASE_MIGRATION_RECONCILIATION.md
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────── teams ───────────────────────────
-- (20260713000001 ile birebir aynı kanonik tanım)
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

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- ───────────────────────── courts ────────────────────────────
-- (canlı şemadan; hiçbir migration yaratmıyordu)
CREATE TABLE IF NOT EXISTS public.courts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pitch_id       uuid NOT NULL,
  name           varchar NOT NULL,
  court_type     varchar DEFAULT 'CLOSED',
  size           varchar,
  price          numeric,
  images         jsonb DEFAULT '[]'::jsonb,
  description    text,
  is_active      boolean DEFAULT true,
  lighting_grade text,
  grass_grade    text,
  locker_grade   text,
  sort_order     integer DEFAULT 0,
  created_at     timestamptz DEFAULT now(),
  capacity       integer DEFAULT 14,
  surface        text NOT NULL DEFAULT 'TURF',
  grades_status  text NOT NULL DEFAULT 'approved'
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='courts_pitch_id_fkey') THEN
    ALTER TABLE public.courts
      ADD CONSTRAINT courts_pitch_id_fkey
      FOREIGN KEY (pitch_id) REFERENCES public.pitches(id) ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE public.courts ENABLE ROW LEVEL SECURITY;
