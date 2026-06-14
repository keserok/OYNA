-- ============================================================================
-- OYNA: Harden RLS — remove always-true policies that bypass row-level security
-- APPLIED TO PRODUCTION on 2026-06-06 (project iikvzgyccvgcybzdfwlv).
-- Root cause: duplicate permissive policies (secure + always-true) are OR'd by
-- Postgres, so the "true" duplicate negated the secure one. Drop the duplicates;
-- add proper ownership scoping where no secure policy existed.
-- ============================================================================

-- matches: secure policies already exist; drop the true duplicates
DROP POLICY IF EXISTS "Oluşturan silebilir" ON public.matches;
DROP POLICY IF EXISTS "Katılımcılar veya oluşturan güncelleyebilir" ON public.matches;
DROP POLICY IF EXISTS "Herkes maç oluşturabilir" ON public.matches;

-- teams: secure policies already exist; drop the true duplicates
DROP POLICY IF EXISTS "Sadece kaptan silebilir" ON public.teams;
DROP POLICY IF EXISTS "Sadece kaptan veya kurucu güncelleyebilir" ON public.teams;
DROP POLICY IF EXISTS "Kaptanlar takım kurabilir" ON public.teams;

-- settings: secure ADMIN policy already exists; drop the true duplicate
DROP POLICY IF EXISTS "Sadece admin güncelleyebilir" ON public.settings;

-- goalkeepers / referees: own insert/update policies exist; drop the ALL-true
DROP POLICY IF EXISTS "Kaleciler kendilerini güncelleyebilir" ON public.goalkeepers;
DROP POLICY IF EXISTS "Hakemler kendilerini güncelleyebilir" ON public.referees;

-- team_members: no secure policy existed — create proper ones
DROP POLICY IF EXISTS "Kullanıcılar takıma üye ekleyebilir" ON public.team_members;
DROP POLICY IF EXISTS "Kaptanlar üyeleri güncelleyebilir" ON public.team_members;
DROP POLICY IF EXISTS "Kaptanlar veya üyenin kendisi silebilir" ON public.team_members;

CREATE POLICY "tm_insert_self_or_captain" ON public.team_members FOR INSERT WITH CHECK (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_id AND t.captain_id = auth.uid())
);
CREATE POLICY "tm_update_captain" ON public.team_members FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_id AND t.captain_id = auth.uid())
);
CREATE POLICY "tm_delete_self_or_captain" ON public.team_members FOR DELETE USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.teams t WHERE t.id = team_id AND t.captain_id = auth.uid())
);

-- tactics: personal studio saves — owner = "userId"
DROP POLICY IF EXISTS "Kullanıcılar kendi taktiklerini güncelleyebilir/ekleyebilir" ON public.tactics;
DROP POLICY IF EXISTS "Kullanıcılar kendi taktiklerini görebilir" ON public.tactics;

CREATE POLICY "tactics_select_own" ON public.tactics FOR SELECT USING (auth.uid() = "userId");
CREATE POLICY "tactics_write_own" ON public.tactics FOR ALL
  USING (auth.uid() = "userId")
  WITH CHECK (auth.uid() = "userId");

-- match_tactics: collaborative board, no owner column — require auth for writes
DROP POLICY IF EXISTS "Herkes maç taktiklerini güncelleyebilir" ON public.match_tactics;
CREATE POLICY "mt_write_authenticated" ON public.match_tactics FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- friendships: scope to the two participants
DROP POLICY IF EXISTS "Kullanıcılar arkadaşlık isteği atabilir" ON public.friendships;
DROP POLICY IF EXISTS "Kullanıcılar istek güncelleyebilir" ON public.friendships;
DROP POLICY IF EXISTS "Kullanıcılar arkadaşlıkları görebilir" ON public.friendships;

CREATE POLICY "fr_select_participant" ON public.friendships FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
CREATE POLICY "fr_insert_sender" ON public.friendships FOR INSERT
  WITH CHECK (auth.uid() = sender_id);
CREATE POLICY "fr_update_participant" ON public.friendships FOR UPDATE
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
CREATE POLICY "fr_delete_participant" ON public.friendships FOR DELETE
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- texts: admin-only writes (public read kept)
DROP POLICY IF EXISTS "Admin metinleri güncelleyebilir" ON public.texts;
CREATE POLICY "texts_admin_write" ON public.texts FOR ALL
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('ADMIN','SUPER_ADMIN'))
  WITH CHECK ((SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('ADMIN','SUPER_ADMIN'));

-- audit_logs: admin-only read AND write (name said admin-only but qual was true)
DROP POLICY IF EXISTS "Yöneticiler log yazabilir" ON public.audit_logs;
DROP POLICY IF EXISTS "Sadece yöneticiler görebilir" ON public.audit_logs;
CREATE POLICY "audit_select_admin" ON public.audit_logs FOR SELECT
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('ADMIN','SUPER_ADMIN'));
CREATE POLICY "audit_insert_admin" ON public.audit_logs FOR INSERT
  WITH CHECK ((SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('ADMIN','SUPER_ADMIN'));
