-- F3 — Platform rolü atama/geri alma yalnızca SUPER_ADMIN'e kısıtlandı
-- Sorun: admin_set_platform_role ve admin_revoke_platform_role yalnızca is_platform_admin()
--        (ikili "admin mi") kontrol ediyordu → herhangi bir admin kendini/başkasını
--        SUPER_ADMIN yapabiliyor (yetki yükseltme).
-- Çözüm: is_super_admin() yardımcısı + iki fonksiyonda guard'ı SUPER_ADMIN'e yükselt.

-- 1) SUPER_ADMIN tespiti (profiles.role/roles veya admin_team_members.admin_role)
CREATE OR REPLACE FUNCTION public.is_super_admin(p_uid uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_uid
      AND (role = 'SUPER_ADMIN' OR COALESCE(roles, '[]'::jsonb) ? 'SUPER_ADMIN')
  ) OR EXISTS (
    SELECT 1 FROM public.admin_team_members
    WHERE user_id = p_uid AND admin_role = 'SUPER_ADMIN'
  );
$function$;

GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated, anon;

-- 2) Rol atama — SUPER_ADMIN guard
CREATE OR REPLACE FUNCTION public.admin_set_platform_role(p_user_id uuid, p_admin_role text, p_grant_platform_admin boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_email text;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Yalnızca SUPER_ADMIN platform rolü atayabilir';
  END IF;
  IF p_admin_role NOT IN ('SUPER_ADMIN', 'ADMIN', 'MODERATOR', 'FINANCE', 'SUPPORT') THEN RAISE EXCEPTION 'Geçersiz rol'; END IF;
  SELECT email INTO v_email FROM profiles WHERE id = p_user_id;
  INSERT INTO admin_team_members (user_id, admin_role, invited_by) VALUES (p_user_id, p_admin_role, auth.uid())
    ON CONFLICT (user_id) DO UPDATE SET admin_role = EXCLUDED.admin_role;
  IF p_grant_platform_admin OR p_admin_role IN ('SUPER_ADMIN', 'ADMIN') THEN
    UPDATE profiles SET role = 'ADMIN', is_admin = true WHERE id = p_user_id;
  END IF;
  PERFORM log_admin_action('ROLE_CHANGE', 'user', p_user_id, v_email, NULL, jsonb_build_object('admin_role', p_admin_role, 'is_admin', p_grant_platform_admin));
  RETURN true;
END;
$function$;

-- 3) Rol geri alma — SUPER_ADMIN guard
CREATE OR REPLACE FUNCTION public.admin_revoke_platform_role(p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_email TEXT;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Yalnızca SUPER_ADMIN platform rolünü geri alabilir';
  END IF;
  IF p_user_id = auth.uid() THEN RAISE EXCEPTION 'Kendi admin yetkinizi kaldıramazsınız.'; END IF;
  SELECT email INTO v_email FROM public.profiles WHERE id = p_user_id;
  IF v_email IS NULL THEN RAISE EXCEPTION 'Kullanıcı bulunamadı.'; END IF;
  DELETE FROM public.admin_team_members WHERE user_id = p_user_id;
  UPDATE public.profiles SET is_admin = false, role = 'PLAYER' WHERE id = p_user_id;
  PERFORM public.log_admin_action('ROLE_REVOKE', 'user', p_user_id, v_email, NULL, jsonb_build_object('revoked_at', NOW()));
  RETURN TRUE;
END;
$function$;
