-- ================================================================
-- SOSYAL AŞAMA 1.8 — Takım yapısal genişletmesi (Spec §5 / G-L bölümleri)
-- format(3v3–11v11, değiştirilebilir) · görünürlük · ⚡arıyor · şehir ·
-- draws · davet linki · crest_config(jsonb) · team_members rol modeli.
-- Geriye uyum: eski kolonlara DOKUNULMAZ (Aşama 2'de kalkar);
-- crest TEXT yerinde kalır, yeni kanonik = crest_config (jsonb).
-- ================================================================

-- ── 1) teams yeni kolonlar ──
ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS format        text,
  ADD COLUMN IF NOT EXISTS visibility    text NOT NULL DEFAULT 'PUBLIC',
  ADD COLUMN IF NOT EXISTS is_recruiting boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS city          text,
  ADD COLUMN IF NOT EXISTS draws         integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS invite_token  uuid,
  ADD COLUMN IF NOT EXISTS crest_config  jsonb;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='teams_format_check') THEN
    ALTER TABLE public.teams ADD CONSTRAINT teams_format_check
      CHECK (format IS NULL OR format IN ('3v3','4v4','5v5','6v6','7v7','8v8','9v9','10v10','11v11'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='teams_visibility_check') THEN
    ALTER TABLE public.teams ADD CONSTRAINT teams_visibility_check
      CHECK (visibility IN ('PUBLIC','PRIVATE'));
  END IF;
END $$;

-- Backfill: format ← formation adından en-iyi-çaba eşleme ("5+1"=6v6 vb.);
-- eşlenemeyen halı saha standardı 7v7 alır.
UPDATE public.teams SET format = CASE
    WHEN formation->>'name' IN ('4+1')        THEN '5v5'
    WHEN formation->>'name' IN ('5+1')        THEN '6v6'
    WHEN formation->>'name' IN ('6+1','2-3-1','3-2-1','2-2-2','3-1-2','1-3-2') THEN '7v7'
    WHEN formation->>'name' IN ('7+1')        THEN '8v8'
    WHEN formation->>'name' IN ('10+1')       THEN '11v11'
    ELSE '7v7' END
WHERE format IS NULL;

-- Backfill: city ← location (serbest metin olduğu gibi taşınır)
UPDATE public.teams SET city = location WHERE city IS NULL AND location IS NOT NULL;

-- Backfill: crest_config ← crest (ikon id'si → GENERATED; URL → IMAGE)
UPDATE public.teams SET crest_config = CASE
    WHEN crest IS NULL OR crest = '' THEN
      jsonb_build_object('type','GENERATED','shape','shield','pattern','solid','symbol','star')
    WHEN crest LIKE 'http%' THEN
      jsonb_build_object('type','IMAGE','url',crest)
    ELSE
      jsonb_build_object('type','GENERATED','shape','shield','pattern','solid','symbol',crest)
    END
WHERE crest_config IS NULL;

CREATE INDEX IF NOT EXISTS idx_teams_directory
  ON public.teams (visibility, is_recruiting, city)
  WHERE is_archived = false AND is_demo = false;

-- ── 2) team_members rol modeli ──
ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS role          text NOT NULL DEFAULT 'MEMBER',
  ADD COLUMN IF NOT EXISTS jersey_number integer,
  ADD COLUMN IF NOT EXISTS position      text,
  ADD COLUMN IF NOT EXISTS joined_at     timestamptz,
  ADD COLUMN IF NOT EXISTS sort_order    integer NOT NULL DEFAULT 0;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='team_members_role_check') THEN
    ALTER TABLE public.team_members ADD CONSTRAINT team_members_role_check
      CHECK (role IN ('CAPTAIN','ADMIN','MEMBER'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='team_members_jersey_check') THEN
    ALTER TABLE public.team_members ADD CONSTRAINT team_members_jersey_check
      CHECK (jersey_number IS NULL OR jersey_number BETWEEN 1 AND 99);
  END IF;
END $$;

UPDATE public.team_members SET joined_at = created_at WHERE joined_at IS NULL;

-- Backfill: kaptanların team_members satırı garanti edilir (K70 —
-- "üyelik hep gerçek satır"; eski createTeam kaptanı bazen eklemiyordu)
INSERT INTO public.team_members (team_id, user_id, is_active, role, joined_at)
SELECT t.id, t.captain_id, true, 'CAPTAIN', coalesce(t.created_at, timezone('utc', now()))
FROM public.teams t
WHERE t.captain_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.team_members tm
                  WHERE tm.team_id = t.id AND tm.user_id = t.captain_id)
ON CONFLICT (team_id, user_id) DO NOTHING;

-- Backfill: rol ataması — captain_id → CAPTAIN; captains[] → ADMIN
UPDATE public.team_members tm SET role = 'CAPTAIN'
FROM public.teams t
WHERE t.id = tm.team_id AND t.captain_id = tm.user_id AND tm.role <> 'CAPTAIN';

UPDATE public.team_members tm SET role = 'ADMIN'
FROM public.teams t
WHERE t.id = tm.team_id
  AND tm.role = 'MEMBER'
  AND t.captains ? tm.user_id::text;

-- Takım başına TAM BİR kaptan (aktif üyelikte)
CREATE UNIQUE INDEX IF NOT EXISTS team_members_one_captain_uidx
  ON public.team_members (team_id)
  WHERE role = 'CAPTAIN' AND is_active = true;

-- Forma numarası takım içinde benzersiz (aktif üyelikte)
CREATE UNIQUE INDEX IF NOT EXISTS team_members_jersey_uidx
  ON public.team_members (team_id, jersey_number)
  WHERE jersey_number IS NOT NULL AND is_active = true;

CREATE INDEX IF NOT EXISTS team_members_user_active_idx
  ON public.team_members (user_id, is_active);

-- ── 3) Yardımcılar rol kolonundan okur (tek hakem — K66) ──
-- Geçiş güvenliği: Aşama 2'ye dek eski captain_id/captains[] OR-yedeği korunur.
CREATE OR REPLACE FUNCTION public._is_team_member(p_team_id uuid, p_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_id = p_team_id AND tm.user_id = p_uid AND tm.is_active = true
  ) OR EXISTS (
    SELECT 1 FROM public.teams t
    WHERE t.id = p_team_id
      AND (t.captain_id = p_uid OR t.captains ? p_uid::text)
  );
$$;

CREATE OR REPLACE FUNCTION public._is_team_admin(p_team_id uuid, p_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_id = p_team_id AND tm.user_id = p_uid
      AND tm.is_active = true AND tm.role IN ('CAPTAIN','ADMIN')
  ) OR EXISTS (
    SELECT 1 FROM public.teams t
    WHERE t.id = p_team_id
      AND (t.captain_id = p_uid OR t.captains ? p_uid::text)
  );
$$;

-- ── 4) RLS: görünürlük gerçekten uygulanır (I51) ──
DROP POLICY IF EXISTS "Teams are viewable by everyone" ON public.teams;
DROP POLICY IF EXISTS teams_select_visibility ON public.teams;
CREATE POLICY teams_select_visibility ON public.teams
  FOR SELECT TO authenticated
  USING (
    visibility = 'PUBLIC'
    OR public._is_team_member(id, (SELECT auth.uid()))
    OR public.is_platform_admin()
  );

-- UPDATE artık yönetici-genelinde (yalnız captain_id tekelciliği biter)
DROP POLICY IF EXISTS "Captains or platform admins can update teams" ON public.teams;
DROP POLICY IF EXISTS teams_update_admin ON public.teams;
CREATE POLICY teams_update_admin ON public.teams
  FOR UPDATE TO authenticated
  USING (public._is_team_admin(id, (SELECT auth.uid())) OR public.is_platform_admin())
  WITH CHECK (public._is_team_admin(id, (SELECT auth.uid())) OR public.is_platform_admin());

-- Kullanıcı yolunda hard DELETE kapanır (K72: dağıtma = arşiv; hard delete admin panel)
DROP POLICY IF EXISTS "Captains or platform admins can delete teams" ON public.teams;
DROP POLICY IF EXISTS teams_delete_admin_only ON public.teams;
CREATE POLICY teams_delete_admin_only ON public.teams
  FOR DELETE TO authenticated
  USING (public.is_platform_admin());
