-- Security fix: profiles UPDATE privilege-escalation bypass
--
-- Root cause: two permissive UPDATE policies exist simultaneously:
--   1. "Users can update own profile" {public}  WITH CHECK: uid=id AND (platform_admin OR privileges_unchanged)
--   2. "profiles_update"             {authenticated} WITH CHECK: uid=id OR is_admin()
--
-- PostgreSQL ORs all permissive WITH CHECKs. For an authenticated user updating
-- their own row, policy 2's "uid=id" branch is always true → bypasses
-- profile_privileges_unchanged() entirely → any user can write role='SUPER_ADMIN'.
--
-- Fix: single TO authenticated policy; admin path bypasses privilege check,
-- non-admin path requires privileges_unchanged.

DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "profiles_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (
    (SELECT auth.uid() AS uid) = id
    OR is_admin()
  )
  WITH CHECK (
    is_admin()
    OR (
      (SELECT auth.uid() AS uid) = id
      AND profile_privileges_unchanged(
        (SELECT auth.uid() AS uid),
        (role)::text,
        is_admin,
        roles
      )
    )
  );
