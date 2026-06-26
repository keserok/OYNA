-- ==============================================================================
-- FAZ 0 DB Temizliği: CAPTAIN ve COMMUNITY_ADMIN rollerini sil
-- profiles.role ve profiles.roles CHECK kısıtlarını güncelle
-- admin_segment_preview() fonksiyonundan CAPTAIN case'ini çıkar
-- ==============================================================================

-- 1. profiles.role CHECK kısıtını güncelle
DO $$
DECLARE
  v_con RECORD;
BEGIN
  FOR v_con IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass AND contype = 'c' AND conname LIKE '%role%'
  LOOP
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS %I', v_con.conname);
  END LOOP;
END $$;

-- Yalnızca desteklenen roller: PLAYER, GOALKEEPER, REFEREE, SUPER_ADMIN, ADMIN, ORGANIZER, OWNER
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IS NULL OR role::text = ANY (ARRAY[
    'PLAYER', 'GOALKEEPER', 'REFEREE', 'SUPER_ADMIN', 'ADMIN', 'ORGANIZER', 'OWNER'
  ]));

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_roles_jsonb_check
  CHECK (
    roles IS NULL
    OR (
      jsonb_typeof(roles) = 'array'
      AND roles <@ '["PLAYER","GOALKEEPER","REFEREE","ADMIN","ORGANIZER","SUPER_ADMIN","OWNER"]'::jsonb
    )
  );

-- 2. CAPTAIN referanslarını PLAYER'a geçir (mevcut kayıtları boz olmadan temizle)
UPDATE public.profiles
SET role = 'PLAYER'
WHERE role IN ('CAPTAIN', 'COMMUNITY_ADMIN');

-- roles JSONB dizisindeki CAPTAIN ve COMMUNITY_ADMIN değerlerini çıkar
UPDATE public.profiles
SET roles = (
  SELECT jsonb_agg(r)
  FROM jsonb_array_elements_text(roles) AS r
  WHERE r NOT IN ('CAPTAIN', 'COMMUNITY_ADMIN')
)
WHERE roles IS NOT NULL
  AND (roles ? 'CAPTAIN' OR roles ? 'COMMUNITY_ADMIN');

-- 3. admin_segment_preview fonksiyonundan CAPTAIN case'ini kaldır
CREATE OR REPLACE FUNCTION public.admin_segment_preview(p_segment text DEFAULT 'ALL'::text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  RETURN jsonb_build_object(
    'count', (
      SELECT COUNT(*)::int FROM profiles p WHERE CASE p_segment
        WHEN 'ALL'        THEN true
        WHEN 'PRO'        THEN p.is_pro = true
        WHEN 'OWNER'      THEN p.role = 'OWNER'      OR COALESCE(p.roles, '[]'::jsonb) ? 'OWNER'
        WHEN 'NEW_USERS'  THEN p.created_at >= NOW() - INTERVAL '30 days'
        WHEN 'GOALKEEPER' THEN p.role = 'GOALKEEPER' OR COALESCE(p.roles, '[]'::jsonb) ? 'GOALKEEPER'
        WHEN 'REFEREE'    THEN p.role = 'REFEREE'    OR COALESCE(p.roles, '[]'::jsonb) ? 'REFEREE'
        ELSE true END
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_segment_preview(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_segment_preview(text) TO authenticated;
