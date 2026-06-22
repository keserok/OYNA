-- Faz 0 — Operasyonel yetki altyapısı
-- is_admin / has_role tanımları + RLS birleştirme (is_platform_admin)

-- ─── Yardımcı yetki fonksiyonları ─────────────────────────────
-- NOT: is_admin()/has_role() canlıda zaten vardı; parametre adı (check_role)
-- ve sıfır-parametre imzaları korunuyor ki bağımlı RLS politikaları
-- (15+ tablo) DROP CASCADE ile silinmesin — sadece gövde güncelleniyor.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_admin();
$$;

CREATE OR REPLACE FUNCTION public.has_role(check_role text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_role text;
  v_roles_json jsonb;
  v_roles_arr text[];
BEGIN
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  SELECT p.role, p.roles::jsonb, p.roles::text[]
    INTO v_role, v_roles_json, v_roles_arr
  FROM public.profiles p
  WHERE p.id = v_uid;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_role = check_role THEN
    RETURN true;
  END IF;

  IF v_roles_json IS NOT NULL AND v_roles_json ? check_role THEN
    RETURN true;
  END IF;

  IF v_roles_arr IS NOT NULL AND check_role = ANY(v_roles_arr) THEN
    RETURN true;
  END IF;

  RETURN false;
EXCEPTION
  WHEN OTHERS THEN
    RETURN v_role = check_role;
END;
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_role(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(text) TO authenticated;

-- ─── teams RLS → is_platform_admin ─────────────────────────────
DROP POLICY IF EXISTS "Captains or Admins can update teams" ON public.teams;
DROP POLICY IF EXISTS "Captains or platform admins can update teams" ON public.teams;
CREATE POLICY "Captains or platform admins can update teams" ON public.teams
  FOR UPDATE USING (
    auth.uid() = captain_id OR public.is_platform_admin()
  );

DROP POLICY IF EXISTS "Captains or Admins can delete teams" ON public.teams;
DROP POLICY IF EXISTS "Captains or platform admins can delete teams" ON public.teams;
CREATE POLICY "Captains or platform admins can delete teams" ON public.teams
  FOR DELETE USING (
    auth.uid() = captain_id OR public.is_platform_admin()
  );

-- ─── communities — platform admin tam erişim ───────────────────
DROP POLICY IF EXISTS "Platform admins full access communities" ON public.communities;
CREATE POLICY "Platform admins full access communities" ON public.communities
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- Legacy admin politikalarını is_platform_admin ile hizala
DROP POLICY IF EXISTS "Owners or admins update communities" ON public.communities;
CREATE POLICY "Owners or admins update communities" ON public.communities
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR public.is_platform_admin())
  WITH CHECK (owner_id = auth.uid() OR public.is_platform_admin());

DROP POLICY IF EXISTS "Owners or admins delete communities" ON public.communities;
CREATE POLICY "Owners or admins delete communities" ON public.communities
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid() OR public.is_platform_admin());

DROP POLICY IF EXISTS "communities_update_admin" ON public.communities;
CREATE POLICY "communities_update_admin" ON public.communities
  FOR UPDATE USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.community_members cm
      WHERE cm.community_id = communities.id
        AND cm.user_id = auth.uid()
        AND cm.role = 'ADMIN'
    )
    OR public.is_platform_admin()
  );

DROP POLICY IF EXISTS "communities_delete_owner" ON public.communities;
CREATE POLICY "communities_delete_owner" ON public.communities
  FOR DELETE USING (
    owner_id = auth.uid() OR public.is_platform_admin()
  );

DROP POLICY IF EXISTS "communities_insert_auth" ON public.communities;
CREATE POLICY "communities_insert_auth" ON public.communities
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND (owner_id = auth.uid() OR public.is_platform_admin())
  );

-- ─── community_members — platform admin ────────────────────────
DROP POLICY IF EXISTS "Platform admins manage community members" ON public.community_members;
CREATE POLICY "Platform admins manage community members" ON public.community_members
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "Members view memberships" ON public.community_members;
CREATE POLICY "Members view memberships" ON public.community_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.communities c
      WHERE c.id = community_members.community_id
        AND c.owner_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.community_members cm2
      WHERE cm2.community_id = community_members.community_id
        AND cm2.user_id = auth.uid()
    )
  );

-- ─── community_join_requests — platform admin ──────────────────
DROP POLICY IF EXISTS "Platform admins manage join requests" ON public.community_join_requests;
CREATE POLICY "Platform admins manage join requests" ON public.community_join_requests
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- ─── community_creation_requests — zaten ccr_admin_all var; yenile
DROP POLICY IF EXISTS "ccr_admin_all" ON public.community_creation_requests;
CREATE POLICY "ccr_admin_all" ON public.community_creation_requests
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());
