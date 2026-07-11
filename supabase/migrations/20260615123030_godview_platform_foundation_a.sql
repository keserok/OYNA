-- [DB GEÇMİŞİNDEN KURTARILDI 2026-07-11] Bu migration canlı veritabanına uygulanmıştı ancak repoda dosyası yoktu; supabase_migrations.schema_migrations.statements kolonundan geri çıkarıldı.

CREATE OR REPLACE FUNCTION public.is_platform_admin(p_uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_uid
      AND (
        is_admin = true
        OR role IN ('ADMIN', 'SUPER_ADMIN')
        OR COALESCE(roles, '[]'::jsonb) ? 'ADMIN'
        OR COALESCE(roles, '[]'::jsonb) ? 'SUPER_ADMIN'
      )
  );
$$;
REVOKE ALL ON FUNCTION public.is_platform_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.sync_admin_flags()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role IN ('ADMIN', 'SUPER_ADMIN')
     OR COALESCE(NEW.roles, '[]'::jsonb) ? 'ADMIN'
     OR COALESCE(NEW.roles, '[]'::jsonb) ? 'SUPER_ADMIN'
  THEN
    NEW.is_admin := true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS sync_admin_flags_trigger ON public.profiles;
CREATE TRIGGER sync_admin_flags_trigger
  BEFORE INSERT OR UPDATE OF role, roles, is_admin ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_admin_flags();
UPDATE public.profiles SET is_admin = true WHERE role IN ('ADMIN', 'SUPER_ADMIN') OR COALESCE(roles, '[]'::jsonb) ? 'ADMIN' OR COALESCE(roles, '[]'::jsonb) ? 'SUPER_ADMIN';
CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_platform_admin() THEN
    IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN RAISE EXCEPTION 'SECURITY: is_admin alanı doğrudan değiştirilemez.'; END IF;
    IF NEW.phone_verified IS DISTINCT FROM OLD.phone_verified THEN RAISE EXCEPTION 'SECURITY: phone_verified alanı doğrudan değiştirilemez.'; END IF;
    IF NEW.role IS DISTINCT FROM OLD.role THEN RAISE EXCEPTION 'SECURITY: role alanı doğrudan değiştirilemez.'; END IF;
    IF NEW.roles IS DISTINCT FROM OLD.roles THEN RAISE EXCEPTION 'SECURITY: roles alanı doğrudan değiştirilemez.'; END IF;
    IF NEW.wallet_balance IS DISTINCT FROM OLD.wallet_balance THEN RAISE EXCEPTION 'SECURITY: wallet_balance doğrudan değiştirilemez.'; END IF;
    IF NEW.is_banned IS DISTINCT FROM OLD.is_banned THEN RAISE EXCEPTION 'SECURITY: is_banned doğrudan değiştirilemez.'; END IF;
    IF NEW.ban_expires_at IS DISTINCT FROM OLD.ban_expires_at THEN RAISE EXCEPTION 'SECURITY: ban_expires_at doğrudan değiştirilemez.'; END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
DROP POLICY IF EXISTS "Platform admins read all profiles" ON public.profiles;
CREATE POLICY "Platform admins read all profiles" ON public.profiles FOR SELECT USING (public.is_platform_admin());
DROP POLICY IF EXISTS "Only admins can view audit logs" ON public.admin_audit_log;
CREATE POLICY "Only admins can view audit logs" ON public.admin_audit_log FOR SELECT USING (public.is_platform_admin());
