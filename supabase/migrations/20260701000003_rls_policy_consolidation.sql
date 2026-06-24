-- RLS Policy Consolidation: eliminate multiple_permissive_policies warnings
-- Strategy:
--   1. Drop exact duplicate SELECT policies (identical USING conditions)
--   2. Replace {public} ALL admin policies with per-command TO authenticated
--   3. Merge overlapping public/authenticated policies into single combined policy
--   4. Scope auth-only {public} policies to TO authenticated

-- ═══ goalkeepers ══════════════════════════════════════════════════════════════
-- Before: ALL(public/admin) + INSERT/SELECT×2/UPDATE(public) = 6 warnings
-- After:  SELECT(public/true) + INSERT/UPDATE/DELETE(authenticated) = 0 warnings

DROP POLICY IF EXISTS "Herkes kalecileri görebilir" ON public.goalkeepers;
DROP POLICY IF EXISTS "Platform admins manage goalkeepers" ON public.goalkeepers;
DROP POLICY IF EXISTS "Users can insert their own goalkeeper profile." ON public.goalkeepers;
DROP POLICY IF EXISTS "Users can update their own goalkeeper profile." ON public.goalkeepers;

-- "Public read goalkeepers" (USING true) already exists — kept for anon/all read
CREATE POLICY "goalkeepers_insert" ON public.goalkeepers
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid() AS uid) = id
    OR is_platform_admin()
  );

CREATE POLICY "goalkeepers_update" ON public.goalkeepers
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid() AS uid) = id OR is_platform_admin())
  WITH CHECK ((SELECT auth.uid() AS uid) = id OR is_platform_admin());

CREATE POLICY "goalkeepers_delete" ON public.goalkeepers
  FOR DELETE TO authenticated
  USING (is_platform_admin());

-- ═══ referees ═════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Herkes hakemleri görebilir" ON public.referees;
DROP POLICY IF EXISTS "Platform admins manage referees" ON public.referees;
DROP POLICY IF EXISTS "Users can insert their own referee profile." ON public.referees;
DROP POLICY IF EXISTS "Users can update their own referee profile." ON public.referees;

-- "Public read referees" (USING true) already exists — kept
CREATE POLICY "referees_insert" ON public.referees
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid() AS uid) = id
    OR is_platform_admin()
  );

CREATE POLICY "referees_update" ON public.referees
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid() AS uid) = id OR is_platform_admin())
  WITH CHECK ((SELECT auth.uid() AS uid) = id OR is_platform_admin());

CREATE POLICY "referees_delete" ON public.referees
  FOR DELETE TO authenticated
  USING (is_platform_admin());

-- ═══ pitches ══════════════════════════════════════════════════════════════════
-- pitches_select_public (USING true) already supersedes both SELECT policies.
-- "Owners manage demo pitches" ALL is covered by pitches_insert/update/delete_owner_or_admin.

DROP POLICY IF EXISTS "Authenticated users can view demo pitches" ON public.pitches;
DROP POLICY IF EXISTS "Owners manage demo pitches" ON public.pitches;

-- ═══ match_disputes ════════════════════════════════════════════════════════════
-- All authenticated-specific policies already handle admin via is_admin(),
-- which is broader than is_platform_admin().

DROP POLICY IF EXISTS "Admins manage disputes" ON public.match_disputes;

-- ═══ owner_accounts ════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Admins manage owner accounts" ON public.owner_accounts;
DROP POLICY IF EXISTS "Owners read own account" ON public.owner_accounts;
DROP POLICY IF EXISTS "Owners update own billing email" ON public.owner_accounts;

CREATE POLICY "owner_accounts_select" ON public.owner_accounts
  FOR SELECT TO authenticated
  USING (
    owner_user_id = (SELECT auth.uid() AS uid)
    OR is_admin()
  );

CREATE POLICY "owner_accounts_insert" ON public.owner_accounts
  FOR INSERT TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "owner_accounts_update" ON public.owner_accounts
  FOR UPDATE TO authenticated
  USING (owner_user_id = (SELECT auth.uid() AS uid) OR is_admin())
  WITH CHECK (owner_user_id = (SELECT auth.uid() AS uid) OR is_admin());

CREATE POLICY "owner_accounts_delete" ON public.owner_accounts
  FOR DELETE TO authenticated
  USING (is_admin());

-- ═══ owner_billing_events ══════════════════════════════════════════════════════

DROP POLICY IF EXISTS "owner_billing_events_admin" ON public.owner_billing_events;
DROP POLICY IF EXISTS "owner_billing_events_owner_read" ON public.owner_billing_events;

CREATE POLICY "owner_billing_events_select" ON public.owner_billing_events
  FOR SELECT TO authenticated
  USING (
    owner_user_id = (SELECT auth.uid() AS uid)
    OR is_platform_admin()
  );

CREATE POLICY "owner_billing_events_insert" ON public.owner_billing_events
  FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());

CREATE POLICY "owner_billing_events_update" ON public.owner_billing_events
  FOR UPDATE TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "owner_billing_events_delete" ON public.owner_billing_events
  FOR DELETE TO authenticated
  USING (is_platform_admin());

-- ═══ pitch_availability_exceptions ════════════════════════════════════════════
-- pitch_exceptions_insert/update/delete cover demo owners via owner_id = auth.uid().

DROP POLICY IF EXISTS "Owners manage demo availability exceptions" ON public.pitch_availability_exceptions;

-- ═══ pitch_bookings ════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Owners manage demo pitch bookings" ON public.pitch_bookings;

-- ═══ pitch_flash_deals ════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Owners manage demo flash deals" ON public.pitch_flash_deals;

-- ═══ promo_codes ═══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "promo_codes_admin" ON public.promo_codes;
DROP POLICY IF EXISTS "promo_codes_public_read" ON public.promo_codes;

-- Single SELECT: admin sees all; public sees active/valid only
CREATE POLICY "promo_codes_select" ON public.promo_codes
  FOR SELECT
  USING (
    is_platform_admin()
    OR (is_active = true AND (valid_until IS NULL OR valid_until > now()))
  );

CREATE POLICY "promo_codes_insert" ON public.promo_codes
  FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());

CREATE POLICY "promo_codes_update" ON public.promo_codes
  FOR UPDATE TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "promo_codes_delete" ON public.promo_codes
  FOR DELETE TO authenticated
  USING (is_platform_admin());

-- ═══ texts ════════════════════════════════════════════════════════════════════
-- texts_public_read (USING true) covers SELECT for all.
-- Replace ALL(public) with per-command TO authenticated for writes.

DROP POLICY IF EXISTS "texts_admin_write" ON public.texts;

CREATE POLICY "texts_admin_insert" ON public.texts
  FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());

CREATE POLICY "texts_admin_update" ON public.texts
  FOR UPDATE TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "texts_admin_delete" ON public.texts
  FOR DELETE TO authenticated
  USING (is_platform_admin());

-- ═══ tournaments ═══════════════════════════════════════════════════════════════
-- tournaments_public_read (USING true) covers SELECT for all.

DROP POLICY IF EXISTS "tournaments_admin_all" ON public.tournaments;

CREATE POLICY "tournaments_admin_insert" ON public.tournaments
  FOR INSERT TO authenticated
  WITH CHECK (is_platform_admin());

CREATE POLICY "tournaments_admin_update" ON public.tournaments
  FOR UPDATE TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "tournaments_admin_delete" ON public.tournaments
  FOR DELETE TO authenticated
  USING (is_platform_admin());

-- ═══ wallet_transactions ══════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Platform admins read wallet ledger" ON public.wallet_transactions;
DROP POLICY IF EXISTS "wallet_select_own" ON public.wallet_transactions;

CREATE POLICY "wallet_select" ON public.wallet_transactions
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid() AS uid) = user_id
    OR is_platform_admin()
  );

-- ═══ booking_payments ══════════════════════════════════════════════════════════
-- booking_payments_manage (authenticated ALL) already covers is_admin() reads.

DROP POLICY IF EXISTS "Platform admins read booking payments" ON public.booking_payments;

-- ═══ communities ═══════════════════════════════════════════════════════════════
-- "Platform admins full access communities" ALL creates cross-command duplicates.
-- "Communities viewable by authenticated" (USING true) already handles SELECT.
-- communities_delete_owner is identical to "Owners or admins delete communities".

DROP POLICY IF EXISTS "Platform admins full access communities" ON public.communities;
DROP POLICY IF EXISTS "communities_delete_owner" ON public.communities;
DROP POLICY IF EXISTS "communities_insert_auth" ON public.communities;
DROP POLICY IF EXISTS "Users create own communities" ON public.communities;
DROP POLICY IF EXISTS "Owners or admins update communities" ON public.communities;
DROP POLICY IF EXISTS "communities_update_admin" ON public.communities;

-- INSERT: community owner or platform admin
CREATE POLICY "communities_insert" ON public.communities
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = (SELECT auth.uid() AS uid)
    OR is_platform_admin()
  );

-- UPDATE: owner, community-admin member, or platform admin
-- (merges broader conditions from both dropped UPDATE policies)
CREATE POLICY "communities_update" ON public.communities
  FOR UPDATE TO authenticated
  USING (
    owner_id = (SELECT auth.uid() AS uid)
    OR EXISTS (
      SELECT 1 FROM public.community_members cm
      WHERE cm.community_id = communities.id
        AND cm.user_id = (SELECT auth.uid() AS uid)
        AND cm.role = 'ADMIN'
    )
    OR is_platform_admin()
  )
  WITH CHECK (
    owner_id = (SELECT auth.uid() AS uid)
    OR EXISTS (
      SELECT 1 FROM public.community_members cm
      WHERE cm.community_id = communities.id
        AND cm.user_id = (SELECT auth.uid() AS uid)
        AND cm.role = 'ADMIN'
    )
    OR is_platform_admin()
  );

-- ═══ community_members ════════════════════════════════════════════════════════
-- DROP the ALL policy — all specific policies handle admin via is_admin()/is_platform_admin().
-- Only INSERT needs an admin path added (original "Users join communities" omitted it).

DROP POLICY IF EXISTS "Platform admins manage community members" ON public.community_members;
DROP POLICY IF EXISTS "Users join communities" ON public.community_members;

CREATE POLICY "community_members_insert" ON public.community_members
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid() AS uid)
    OR is_platform_admin()
  );

-- ═══ community_creation_requests ══════════════════════════════════════════════
-- Consolidate: drop ALL(auth) + both public policies, recreate as authenticated only.

DROP POLICY IF EXISTS "ccr_admin_all" ON public.community_creation_requests;
DROP POLICY IF EXISTS "ccr_requester_insert" ON public.community_creation_requests;
DROP POLICY IF EXISTS "ccr_requester_read" ON public.community_creation_requests;

CREATE POLICY "ccr_select" ON public.community_creation_requests
  FOR SELECT TO authenticated
  USING (
    requester_id = (SELECT auth.uid() AS uid)
    OR is_platform_admin()
  );

CREATE POLICY "ccr_insert" ON public.community_creation_requests
  FOR INSERT TO authenticated
  WITH CHECK (requester_id = (SELECT auth.uid() AS uid));

CREATE POLICY "ccr_admin_update" ON public.community_creation_requests
  FOR UPDATE TO authenticated
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "ccr_admin_delete" ON public.community_creation_requests
  FOR DELETE TO authenticated
  USING (is_platform_admin());

-- ═══ profiles ══════════════════════════════════════════════════════════════════
-- profiles_select_authenticated (USING true) already covers admin reads.
-- Dropping this public SELECT removes the anon-visible policy (anon has no auth.uid).

DROP POLICY IF EXISTS "Platform admins read all profiles" ON public.profiles;

-- ═══ teams ════════════════════════════════════════════════════════════════════
-- teams_delete_captain_or_admin uses is_admin() which is >= is_platform_admin().
-- teams_update_captain_or_admin has WITH CHECK; the public counterparts don't.

DROP POLICY IF EXISTS "Captains or platform admins can delete teams" ON public.teams;
DROP POLICY IF EXISTS "Captains or platform admins can update teams" ON public.teams;

-- ═══ tactics ══════════════════════════════════════════════════════════════════
-- All tactics policies were {public} using auth.uid(); move to TO authenticated.
-- Merge the two SELECT policies (own + team) into one.

DROP POLICY IF EXISTS "tactics_select_own" ON public.tactics;
DROP POLICY IF EXISTS "tactics_team_read" ON public.tactics;
DROP POLICY IF EXISTS "tactics_insert" ON public.tactics;
DROP POLICY IF EXISTS "tactics_update" ON public.tactics;
DROP POLICY IF EXISTS "tactics_delete" ON public.tactics;

CREATE POLICY "tactics_select" ON public.tactics
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid() AS uid) = "userId"
    OR EXISTS (
      SELECT 1 FROM public.team_members
      WHERE team_members.team_id = tactics."teamId"
        AND team_members.user_id = (SELECT auth.uid() AS uid)
    )
  );

CREATE POLICY "tactics_insert" ON public.tactics
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid() AS uid) = "userId");

CREATE POLICY "tactics_update" ON public.tactics
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid() AS uid) = "userId")
  WITH CHECK ((SELECT auth.uid() AS uid) = "userId");

CREATE POLICY "tactics_delete" ON public.tactics
  FOR DELETE TO authenticated
  USING ((SELECT auth.uid() AS uid) = "userId");
