-- ═══════════════════════════════════════════════════════════════════════════
-- BASELINE — admin yüklemleri (canlı pg_get_functiondef, 2026-07-20)
-- is_admin()/has_role()/is_platform_admin() 20260615093000+ dosyalarında
-- kullanılır ama tarihsel CREATE'leri 20260621165640'ta gelir. Sonraki
-- CREATE OR REPLACE'ler tarihteki gibi üzerine yazar. ÜRETİMDE: birebir
-- aynı tanım → etkisiz.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.is_platform_admin(p_uid uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.is_platform_admin();
$function$;

CREATE OR REPLACE FUNCTION public.has_role(check_role text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;
