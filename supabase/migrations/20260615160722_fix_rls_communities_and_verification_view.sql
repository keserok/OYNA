-- Güvenlik ERROR düzeltmeleri (canlıya uygulandı: fix_rls_communities_and_verification_view + harden_verification_view_grants)
-- Advisor 3 ERROR → 0:
--   1) pending_provider_verifications view SECURITY DEFINER idi → security_invoker
--   2) communities tablosunda RLS kapalıydı (herkese açık) → RLS + politikalar
--   3) community_members tablosunda RLS kapalıydı → RLS + politikalar

-- 1) View RLS'e saygı duysun
ALTER VIEW public.pending_provider_verifications SET (security_invoker = true);

-- 2) communities
ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Communities viewable by authenticated" ON public.communities;
CREATE POLICY "Communities viewable by authenticated"
  ON public.communities FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users create own communities" ON public.communities;
CREATE POLICY "Users create own communities"
  ON public.communities FOR INSERT TO authenticated
  WITH CHECK (owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Owners or admins update communities" ON public.communities;
CREATE POLICY "Owners or admins update communities"
  ON public.communities FOR UPDATE TO authenticated
  USING (owner_id = (SELECT auth.uid()) OR public.is_admin())
  WITH CHECK (owner_id = (SELECT auth.uid()) OR public.is_admin());

DROP POLICY IF EXISTS "Owners or admins delete communities" ON public.communities;
CREATE POLICY "Owners or admins delete communities"
  ON public.communities FOR DELETE TO authenticated
  USING (owner_id = (SELECT auth.uid()) OR public.is_admin());

-- 3) community_members
ALTER TABLE public.community_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members view memberships" ON public.community_members;
CREATE POLICY "Members view memberships"
  ON public.community_members FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.is_admin()
    OR EXISTS (SELECT 1 FROM public.communities c WHERE c.id = community_members.community_id AND c.owner_id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Users join communities" ON public.community_members;
CREATE POLICY "Users join communities"
  ON public.community_members FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users update own membership" ON public.community_members;
CREATE POLICY "Users update own membership"
  ON public.community_members FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.is_admin())
  WITH CHECK (user_id = (SELECT auth.uid()) OR public.is_admin());

DROP POLICY IF EXISTS "Users leave or admin removes" ON public.community_members;
CREATE POLICY "Users leave or admin removes"
  ON public.community_members FOR DELETE TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.is_admin()
    OR EXISTS (SELECT 1 FROM public.communities c WHERE c.id = community_members.community_id AND c.owner_id = (SELECT auth.uid()))
  );

-- View izinlerini sıkılaştır: anon kaldır, authenticated yalnız SELECT
REVOKE ALL ON public.pending_provider_verifications FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.pending_provider_verifications FROM authenticated;
GRANT SELECT ON public.pending_provider_verifications TO authenticated;
