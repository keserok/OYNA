-- KRİTİK: profiles UPDATE RLS + F6 GK/Referee RPC oluşturma
--
-- Güvenlik bulgusu (pre-existing, bu PR tarafından tetiklenebilir):
--   profiles UPDATE politikası yalnızca `USING (auth.uid() = id)` içeriyor — WITH CHECK yok.
--   Herhangi bir kimlik doğrulanmış kullanıcı kendi satırında role='SUPER_ADMIN' yazabilir.
--   sync_admin_flags trigger'ı is_admin=true'ya da çeker → is_platform_admin() geçer.
--   is_super_admin() de profiles.role'u okur → tam yetki yükseltme zinciri tamamlanır.
--
-- F6: GK/Referee oluşturma raw INSERT (denetim yok, created_by yok) → SECURITY DEFINER RPC.

-- ─── 0) Yardımcı: ayrıcalık kolonlarının değişmediğini doğrula (RLS recursion'ı önler) ──
CREATE OR REPLACE FUNCTION public.profile_privileges_unchanged(
  p_uid      uuid,
  p_new_role text,
  p_new_is_admin  boolean,
  p_new_roles jsonb
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_uid
      AND role               IS NOT DISTINCT FROM p_new_role
      AND is_admin           IS NOT DISTINCT FROM p_new_is_admin
      AND COALESCE(roles, '[]'::jsonb) IS NOT DISTINCT FROM COALESCE(p_new_roles, '[]'::jsonb)
  );
$function$;

GRANT EXECUTE ON FUNCTION public.profile_privileges_unchanged(uuid, text, boolean, jsonb)
  TO authenticated;

-- ─── 1) profiles UPDATE politikası — WITH CHECK ekle ─────────────────────────
-- Önceki sürüm: yalnızca USING (auth.uid() = id) — herhangi bir sütun yazılabilirdi.
-- Yeni sürüm: admin olmayan kullanıcılar role/is_admin/roles sütunlarını değiştiremez.
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND (
      -- Platform adminler tüm alanları değiştirebilir (is_admin, role, vb.)
      public.is_platform_admin()
      -- Normal kullanıcılar: ayrıcalık kolonları değişmeden kalmalı
      OR public.profile_privileges_unchanged(auth.uid(), role, is_admin, roles)
    )
  );

-- ─── 2) admin_create_goalkeeper — RPC ile denetimli kaleci oluşturma ──────────
CREATE OR REPLACE FUNCTION public.admin_create_goalkeeper(p_data jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  v_id := COALESCE((p_data->>'id')::uuid, gen_random_uuid());

  INSERT INTO public.goalkeepers (
    id, name, height, age, rating, fee, match_count, avatar,
    recent_awards, style, bio, preferred_zones, is_elite,
    coordinates, stats, skills, equipment,
    is_available, working_hours, settings
  ) VALUES (
    v_id,
    p_data->>'name',
    p_data->>'height',
    (p_data->>'age')::integer,
    COALESCE((p_data->>'rating')::numeric, 0),
    COALESCE((p_data->>'fee')::integer, 0),
    COALESCE((p_data->>'match_count')::integer, 0),
    p_data->>'avatar',
    p_data->>'recent_awards',
    p_data->>'style',
    p_data->>'bio',
    p_data->'preferred_zones',
    COALESCE((p_data->>'is_elite')::boolean, false),
    p_data->'coordinates',
    p_data->'stats',
    p_data->'skills',
    p_data->'equipment',
    COALESCE((p_data->>'is_available')::boolean, true),
    p_data->'working_hours',
    p_data->'settings'
  );

  PERFORM public.log_admin_action(
    'GK_CREATE', 'goalkeeper', v_id, p_data->>'name', NULL,
    jsonb_build_object('created_by', auth.uid(), 'name', p_data->>'name')
  );
  RETURN v_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_create_goalkeeper(jsonb) TO authenticated;

-- ─── 3) admin_create_referee — RPC ile denetimli hakem oluşturma ──────────────
CREATE OR REPLACE FUNCTION public.admin_create_referee(p_data jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  v_id := COALESCE((p_data->>'id')::uuid, gen_random_uuid());

  INSERT INTO public.referees (
    id, auth_uid, name, level, match_count, fee, avatar, rating,
    style, bio, preferred_zones, is_elite, coordinates, stats,
    is_available, working_hours, settings
  ) VALUES (
    v_id,
    (p_data->>'auth_uid')::uuid,
    p_data->>'name',
    p_data->>'level',
    COALESCE((p_data->>'match_count')::integer, 0),
    COALESCE((p_data->>'fee')::integer, 0),
    p_data->>'avatar',
    COALESCE((p_data->>'rating')::numeric, 0),
    p_data->>'style',
    p_data->>'bio',
    p_data->'preferred_zones',
    COALESCE((p_data->>'is_elite')::boolean, false),
    p_data->'coordinates',
    p_data->'stats',
    COALESCE((p_data->>'is_available')::boolean, true),
    p_data->'working_hours',
    p_data->'settings'
  );

  PERFORM public.log_admin_action(
    'REF_CREATE', 'referee', v_id, p_data->>'name', NULL,
    jsonb_build_object('created_by', auth.uid(), 'name', p_data->>'name')
  );
  RETURN v_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_create_referee(jsonb) TO authenticated;
