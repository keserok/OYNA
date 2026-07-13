-- ================================================================
-- Profiles PII hardening — profiles_select_authenticated (USING true)
-- lets ANY authenticated user read every column of every profile row,
-- including email, phone, last_location, wallet_balance/wallet and
-- iyzico_card_user_key (saved-card token reference). Flagged
-- internally (LANSMAN_ENGELLERI_VE_ASMA_PLANI.md) as a KVKK risk;
-- confirmed live against production on 2026-07-12.
--
-- Fix: lock the base table to owner-or-admin, and reinstate a
-- `public_profiles` view (previously created then dropped — see
-- SUPABASE_MIGRATION_RECONCILIATION.md §8, `create_public_profiles_view`)
-- exposing only the columns the app's social/matchmaking features
-- actually need, honoring each user's own visibility toggles.
-- ================================================================

-- 1) Lock down direct table reads to the row owner or an admin.
--    (is_admin() keeps the admin panel's existing reliance on this
--    policy working — see the comment this replaces in
--    20260701000003_rls_policy_consolidation.sql.)
DROP POLICY IF EXISTS "profiles_select_authenticated" ON public.profiles;
CREATE POLICY "profiles_select_own_or_admin" ON public.profiles
  FOR SELECT TO authenticated
  USING (((SELECT auth.uid()) = id) OR is_admin());

-- 2) Public-safe view for looking up OTHER users (match rosters, team
--    lists, leaderboards, friend search, etc). Declared with
--    security_invoker = false so it runs as the view owner and can see
--    all rows despite the tightened base policy above — the WHERE
--    clause and column list below are what actually gate exposure.
--    No email, phone, last_location, wallet, or payment token ever
--    leaves this view.
DROP VIEW IF EXISTS public.public_profiles;
CREATE VIEW public.public_profiles
WITH (security_invoker = false) AS
SELECT
  id,
  name,
  full_name,
  avatar_url,
  role,
  roles,
  trust_score,
  skill_rating,
  reliability_score,
  ratings_history,
  is_verified,
  join_date,
  rating,
  is_pro,
  match_count,
  win_count,
  total_matches,
  diamonds,
  communities,
  player_card,
  oyna_id,
  is_looking_for_team,
  is_available,
  card_active,
  card_tier,
  position,
  bio,
  preferred_foot,
  CASE WHEN show_online_status THEN last_active_at ELSE NULL END AS last_active_at
FROM public.profiles
WHERE is_searchable = true
   OR id = (SELECT auth.uid())
   OR is_admin();

GRANT SELECT ON public.public_profiles TO authenticated;
REVOKE ALL ON public.public_profiles FROM anon, public;

COMMENT ON VIEW public.public_profiles IS
  'Column- and row-filtered public read surface for profiles. Never add email, phone, last_location, wallet_balance, wallet, or iyzico_card_user_key to this view.';
