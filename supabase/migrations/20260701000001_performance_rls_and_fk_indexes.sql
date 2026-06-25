-- Performance: auth_rls_initplan fix + unindexed FK indexes
-- auth.uid() inline → (SELECT auth.uid() AS uid) for single-evaluation per query

-- ═══ 1. RLS politika düzeltmeleri (auth_rls_initplan) ═══════════════════════════

ALTER POLICY "Owners or admins delete communities" ON public.communities
  USING (((owner_id = (SELECT auth.uid() AS uid)) OR is_platform_admin()));

ALTER POLICY "Owners or admins update communities" ON public.communities
  USING (((owner_id = (SELECT auth.uid() AS uid)) OR is_platform_admin()))
  WITH CHECK (((owner_id = (SELECT auth.uid() AS uid)) OR is_platform_admin()));

ALTER POLICY "communities_delete_owner" ON public.communities
  USING (((owner_id = (SELECT auth.uid() AS uid)) OR is_platform_admin()));

ALTER POLICY "communities_insert_auth" ON public.communities
  WITH CHECK ((((SELECT auth.uid() AS uid) IS NOT NULL) AND ((owner_id = (SELECT auth.uid() AS uid)) OR is_platform_admin())));

ALTER POLICY "communities_update_admin" ON public.communities
  USING (((owner_id = (SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM community_members cm
  WHERE ((cm.community_id = communities.id) AND (cm.user_id = (SELECT auth.uid() AS uid)) AND (cm.role = 'ADMIN'::text)))) OR is_platform_admin()));

ALTER POLICY "ccr_requester_insert" ON public.community_creation_requests
  WITH CHECK ((requester_id = (SELECT auth.uid() AS uid)));

ALTER POLICY "ccr_requester_read" ON public.community_creation_requests
  USING (((requester_id = (SELECT auth.uid() AS uid)) OR is_platform_admin()));

ALTER POLICY "Members view memberships" ON public.community_members
  USING (((user_id = (SELECT auth.uid() AS uid)) OR is_platform_admin() OR (EXISTS ( SELECT 1
   FROM communities c
  WHERE ((c.id = community_members.community_id) AND (c.owner_id = (SELECT auth.uid() AS uid))))) OR (EXISTS ( SELECT 1
   FROM community_members cm2
  WHERE ((cm2.community_id = community_members.community_id) AND (cm2.user_id = (SELECT auth.uid() AS uid)))))));

ALTER POLICY "courts_write_delete" ON public.courts
  USING (((EXISTS ( SELECT 1
   FROM pitches p
  WHERE ((p.id = courts.pitch_id) AND ((p.owner_id = (SELECT auth.uid() AS uid)) OR ((p.is_demo = true) AND has_role('OWNER'::text)))))) OR is_admin()));

ALTER POLICY "courts_write_insert" ON public.courts
  WITH CHECK (((EXISTS ( SELECT 1
   FROM pitches p
  WHERE ((p.id = courts.pitch_id) AND ((p.owner_id = (SELECT auth.uid() AS uid)) OR ((p.is_demo = true) AND has_role('OWNER'::text)))))) OR is_admin()));

ALTER POLICY "courts_write_update" ON public.courts
  USING (((EXISTS ( SELECT 1
   FROM pitches p
  WHERE ((p.id = courts.pitch_id) AND ((p.owner_id = (SELECT auth.uid() AS uid)) OR ((p.is_demo = true) AND has_role('OWNER'::text)))))) OR is_admin()))
  WITH CHECK (((EXISTS ( SELECT 1
   FROM pitches p
  WHERE ((p.id = courts.pitch_id) AND ((p.owner_id = (SELECT auth.uid() AS uid)) OR ((p.is_demo = true) AND has_role('OWNER'::text)))))) OR is_admin()));

ALTER POLICY "Authenticated users can create matches" ON public.matches
  WITH CHECK ((((SELECT auth.role() AS role) = 'authenticated'::text) AND (((SELECT auth.uid() AS uid) = captain_id) OR (captain_id IS NULL) OR is_platform_admin())));

ALTER POLICY "Creators or platform admins can delete matches" ON public.matches
  USING ((((SELECT auth.uid() AS uid) = captain_id) OR is_platform_admin()));

ALTER POLICY "Creators or platform admins can update matches" ON public.matches
  USING ((((SELECT auth.uid() AS uid) = captain_id) OR is_platform_admin()));

ALTER POLICY "Admins manage owner accounts" ON public.owner_accounts
  USING ((is_admin() OR ((( SELECT profiles.role
   FROM profiles
  WHERE (profiles.id = (SELECT auth.uid() AS uid))))::text = 'ADMIN'::text)));

ALTER POLICY "Owners read own account" ON public.owner_accounts
  USING ((owner_user_id = (SELECT auth.uid() AS uid)));

ALTER POLICY "Owners update own billing email" ON public.owner_accounts
  USING ((owner_user_id = (SELECT auth.uid() AS uid)))
  WITH CHECK ((owner_user_id = (SELECT auth.uid() AS uid)));

ALTER POLICY "owner_billing_events_owner_read" ON public.owner_billing_events
  USING ((owner_user_id = (SELECT auth.uid() AS uid)));

ALTER POLICY "Owners manage pitch bank accounts" ON public.pitch_bank_accounts
  USING (((EXISTS ( SELECT 1
   FROM pitches p
  WHERE ((p.id = pitch_bank_accounts.pitch_id) AND ((p.owner_id = (SELECT auth.uid() AS uid)) OR ((p.is_demo = true) AND has_role('OWNER'::text)))))) OR is_admin()))
  WITH CHECK (((EXISTS ( SELECT 1
   FROM pitches p
  WHERE ((p.id = pitch_bank_accounts.pitch_id) AND ((p.owner_id = (SELECT auth.uid() AS uid)) OR ((p.is_demo = true) AND has_role('OWNER'::text)))))) OR is_admin()));

ALTER POLICY "Authenticated users can view demo pitch bookings" ON public.pitch_bookings
  USING (((EXISTS ( SELECT 1
   FROM pitches p
  WHERE ((p.id = pitch_bookings.pitch_id) AND (p.is_demo = true)))) AND ((SELECT auth.uid() AS uid) IS NOT NULL)));

ALTER POLICY "pitch_debtors_manage" ON public.pitch_debtors
  USING (((EXISTS ( SELECT 1
   FROM pitches p
  WHERE ((p.id = pitch_debtors.pitch_id) AND ((p.owner_id = (SELECT auth.uid() AS uid)) OR ((p.is_demo = true) AND has_role('OWNER'::text)))))) OR is_admin()))
  WITH CHECK (((EXISTS ( SELECT 1
   FROM pitches p
  WHERE ((p.id = pitch_debtors.pitch_id) AND ((p.owner_id = (SELECT auth.uid() AS uid)) OR ((p.is_demo = true) AND has_role('OWNER'::text)))))) OR is_admin()));

ALTER POLICY "pitch_expenses_manage" ON public.pitch_expenses
  USING (((EXISTS ( SELECT 1
   FROM pitches p
  WHERE ((p.id = pitch_expenses.pitch_id) AND ((p.owner_id = (SELECT auth.uid() AS uid)) OR ((p.is_demo = true) AND has_role('OWNER'::text)))))) OR is_admin()))
  WITH CHECK (((EXISTS ( SELECT 1
   FROM pitches p
  WHERE ((p.id = pitch_expenses.pitch_id) AND ((p.owner_id = (SELECT auth.uid() AS uid)) OR ((p.is_demo = true) AND has_role('OWNER'::text)))))) OR is_admin()));

ALTER POLICY "Owners manage pitch staff" ON public.pitch_staff_members
  USING (((EXISTS ( SELECT 1
   FROM pitches p
  WHERE ((p.id = pitch_staff_members.pitch_id) AND ((p.owner_id = (SELECT auth.uid() AS uid)) OR ((p.is_demo = true) AND has_role('OWNER'::text)))))) OR is_admin()))
  WITH CHECK (((EXISTS ( SELECT 1
   FROM pitches p
  WHERE ((p.id = pitch_staff_members.pitch_id) AND ((p.owner_id = (SELECT auth.uid() AS uid)) OR ((p.is_demo = true) AND has_role('OWNER'::text)))))) OR is_admin()));

ALTER POLICY "Owners manage pitch tasks" ON public.pitch_staff_tasks
  USING (((EXISTS ( SELECT 1
   FROM pitches p
  WHERE ((p.id = pitch_staff_tasks.pitch_id) AND ((p.owner_id = (SELECT auth.uid() AS uid)) OR ((p.is_demo = true) AND has_role('OWNER'::text)))))) OR is_admin()))
  WITH CHECK (((EXISTS ( SELECT 1
   FROM pitches p
  WHERE ((p.id = pitch_staff_tasks.pitch_id) AND ((p.owner_id = (SELECT auth.uid() AS uid)) OR ((p.is_demo = true) AND has_role('OWNER'::text)))))) OR is_admin()));

ALTER POLICY "pitch_subscriptions_delete" ON public.pitch_subscriptions
  USING (((EXISTS ( SELECT 1
   FROM pitches p
  WHERE ((p.id = pitch_subscriptions.pitch_id) AND ((p.owner_id = (SELECT auth.uid() AS uid)) OR ((p.is_demo = true) AND has_role('OWNER'::text)))))) OR is_admin()));

ALTER POLICY "pitch_subscriptions_insert" ON public.pitch_subscriptions
  WITH CHECK (((EXISTS ( SELECT 1
   FROM pitches p
  WHERE ((p.id = pitch_subscriptions.pitch_id) AND ((p.owner_id = (SELECT auth.uid() AS uid)) OR ((p.is_demo = true) AND has_role('OWNER'::text)))))) OR is_admin()));

ALTER POLICY "pitch_subscriptions_update" ON public.pitch_subscriptions
  USING (((EXISTS ( SELECT 1
   FROM pitches p
  WHERE ((p.id = pitch_subscriptions.pitch_id) AND ((p.owner_id = (SELECT auth.uid() AS uid)) OR ((p.is_demo = true) AND has_role('OWNER'::text)))))) OR is_admin()))
  WITH CHECK (((EXISTS ( SELECT 1
   FROM pitches p
  WHERE ((p.id = pitch_subscriptions.pitch_id) AND ((p.owner_id = (SELECT auth.uid() AS uid)) OR ((p.is_demo = true) AND has_role('OWNER'::text)))))) OR is_admin()));

ALTER POLICY "pitch_tariffs_delete" ON public.pitch_tariffs
  USING (((EXISTS ( SELECT 1
   FROM pitches p
  WHERE ((p.id = pitch_tariffs.pitch_id) AND ((p.owner_id = (SELECT auth.uid() AS uid)) OR ((p.is_demo = true) AND has_role('OWNER'::text)))))) OR is_admin()));

ALTER POLICY "pitch_tariffs_insert" ON public.pitch_tariffs
  WITH CHECK (((EXISTS ( SELECT 1
   FROM pitches p
  WHERE ((p.id = pitch_tariffs.pitch_id) AND ((p.owner_id = (SELECT auth.uid() AS uid)) OR ((p.is_demo = true) AND has_role('OWNER'::text)))))) OR is_admin()));

ALTER POLICY "pitch_tariffs_update" ON public.pitch_tariffs
  USING (((EXISTS ( SELECT 1
   FROM pitches p
  WHERE ((p.id = pitch_tariffs.pitch_id) AND ((p.owner_id = (SELECT auth.uid() AS uid)) OR ((p.is_demo = true) AND has_role('OWNER'::text)))))) OR is_admin()))
  WITH CHECK (((EXISTS ( SELECT 1
   FROM pitches p
  WHERE ((p.id = pitch_tariffs.pitch_id) AND ((p.owner_id = (SELECT auth.uid() AS uid)) OR ((p.is_demo = true) AND has_role('OWNER'::text)))))) OR is_admin()));

ALTER POLICY "Authenticated users can view demo pitches" ON public.pitches
  USING (((is_demo = true) AND ((SELECT auth.uid() AS uid) IS NOT NULL)));

ALTER POLICY "Users can update own profile" ON public.profiles
  USING (((SELECT auth.uid() AS uid) = id))
  WITH CHECK ((((SELECT auth.uid() AS uid) = id) AND (is_platform_admin() OR profile_privileges_unchanged((SELECT auth.uid() AS uid), (role)::text, is_admin, roles))));

ALTER POLICY "promo_redemptions_insert_own" ON public.promo_redemptions
  WITH CHECK ((user_id = (SELECT auth.uid() AS uid)));

ALTER POLICY "promo_redemptions_own" ON public.promo_redemptions
  USING (((user_id = (SELECT auth.uid() AS uid)) OR is_platform_admin()));

ALTER POLICY "tactics_team_read" ON public.tactics
  USING ((EXISTS ( SELECT 1
   FROM team_members
  WHERE ((team_members.team_id = tactics."teamId") AND (team_members.user_id = (SELECT auth.uid() AS uid))))));

ALTER POLICY "Captains or platform admins can delete teams" ON public.teams
  USING ((((SELECT auth.uid() AS uid) = captain_id) OR is_platform_admin()));

ALTER POLICY "Captains or platform admins can update teams" ON public.teams
  USING ((((SELECT auth.uid() AS uid) = captain_id) OR is_platform_admin()));

-- ═══ 2. Eksik FK index'leri ═══════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin_id
  ON public.admin_audit_log (admin_id);

CREATE INDEX IF NOT EXISTS idx_admin_team_members_invited_by
  ON public.admin_team_members (invited_by);

CREATE INDEX IF NOT EXISTS idx_communities_owner_id
  ON public.communities (owner_id);

CREATE INDEX IF NOT EXISTS idx_ccr_reviewed_by
  ON public.community_creation_requests (reviewed_by);

CREATE INDEX IF NOT EXISTS idx_cjr_reviewed_by
  ON public.community_join_requests (reviewed_by);

CREATE INDEX IF NOT EXISTS idx_cjr_user_id
  ON public.community_join_requests (user_id);

CREATE INDEX IF NOT EXISTS idx_community_members_user_id
  ON public.community_members (user_id);

CREATE INDEX IF NOT EXISTS idx_payment_intents_pitch_id
  ON public.payment_intents (pitch_id);

CREATE INDEX IF NOT EXISTS idx_pitch_staff_tasks_assigned_to
  ON public.pitch_staff_tasks (assigned_to);

CREATE INDEX IF NOT EXISTS idx_promo_codes_created_by
  ON public.promo_codes (created_by);

CREATE INDEX IF NOT EXISTS idx_promo_redemptions_user_id
  ON public.promo_redemptions (user_id);

CREATE INDEX IF NOT EXISTS idx_tactics_proposed_by
  ON public.tactics ("proposedBy");

CREATE INDEX IF NOT EXISTS idx_tactics_team_id
  ON public.tactics ("teamId");

CREATE INDEX IF NOT EXISTS idx_texts_updated_by
  ON public.texts (updated_by);

CREATE INDEX IF NOT EXISTS idx_tournaments_community_id
  ON public.tournaments (community_id);
