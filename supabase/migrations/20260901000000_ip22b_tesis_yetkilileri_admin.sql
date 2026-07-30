-- IP-22 (2. bölüm) — Tesis yetkilileri (Sahip / Müdür / Personel) yönetici
-- panelinden atanır.
--
-- KARAR (kullanıcı):
--   "Anlaştığımız tesisleri admin panelden mükemmel şekilde uygulamaya
--    ekleyebilir ve tesislerin yönetici sahip ve personellerini admin
--    panelinden belirleyebiliyor olmalıyız."
--   16a: "bu sistem zaten sistemde sahip müdür personel olarak yer alıyor
--         aynı olmalarını sağla"
--
-- ÜÇ YETKİ DÜZEYİ (tek tanım):
--   Sahip   = pitches.owner_id
--   Müdür   = pitch_staff_members.staff_role = 'MANAGER'
--   Personel= pitch_staff_members.staff_role = 'STAFF'
-- Bunun dışında "rol" yoktur. Ekranda görünen etiket (role_title) artık serbest
-- metin değil, staff_role'den TÜRETİLİR — iki ayrı isimlendirme kalmaz.

-- ---------------------------------------------------------------------------
-- 1) Etiket = yetki. Serbest metin ("Resepsiyon", "Tesis Müdürü") kalkar.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pitch_staff_sync_role_title()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.role_title := CASE WHEN NEW.staff_role = 'MANAGER' THEN 'Müdür' ELSE 'Personel' END;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_pitch_staff_role_title ON public.pitch_staff_members;
CREATE TRIGGER trg_pitch_staff_role_title
  BEFORE INSERT OR UPDATE OF staff_role, role_title ON public.pitch_staff_members
  FOR EACH ROW EXECUTE FUNCTION public.pitch_staff_sync_role_title();

UPDATE public.pitch_staff_members
   SET role_title = CASE WHEN staff_role = 'MANAGER' THEN 'Müdür' ELSE 'Personel' END
 WHERE role_title IS DISTINCT FROM (CASE WHEN staff_role = 'MANAGER' THEN 'Müdür' ELSE 'Personel' END);

-- ---------------------------------------------------------------------------
-- 2) Yönetici, tesisin müdürünü/personelini doğrudan atar.
--    Sahibi ayrı yoldan atanır (pitches.owner_id → admin_update_pitch).
--    Davet kodu akışı tesis sahibi için duruyor; yöneticinin kod beklemesine
--    gerek yok, bağlanan hesap ANINDA aktif olur.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_pitch_staff(
  p_pitch_id uuid,
  p_user_id uuid,
  p_staff_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role text := upper(coalesce(nullif(trim(p_staff_role), ''), ''));
  v_name text;
  v_owner uuid;
  v_member public.pitch_staff_members%ROWTYPE;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  PERFORM public.require_admin_role(ARRAY['MODERATOR']);

  IF v_role NOT IN ('MANAGER', 'STAFF') THEN
    RAISE EXCEPTION 'INVALID_ROLE: Yetki MANAGER veya STAFF olmalı.';
  END IF;

  SELECT owner_id INTO v_owner FROM public.pitches WHERE id = p_pitch_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Tesis bulunamadı.'; END IF;

  IF v_owner = p_user_id THEN
    RAISE EXCEPTION 'ALREADY_OWNER: Bu kullanıcı tesisin sahibi — ayrıca müdür/personel yapılamaz.';
  END IF;

  SELECT COALESCE(NULLIF(TRIM(full_name), ''), NULLIF(TRIM(name), ''), NULLIF(TRIM(email), ''), 'Yetkili')
    INTO v_name
  FROM public.profiles WHERE id = p_user_id;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'USER_NOT_FOUND: Seçilen kullanıcı bulunamadı.';
  END IF;

  SELECT * INTO v_member FROM public.pitch_staff_members
   WHERE pitch_id = p_pitch_id AND user_id = p_user_id
   ORDER BY created_at LIMIT 1;

  IF FOUND THEN
    UPDATE public.pitch_staff_members
       SET staff_role = v_role,
           account_status = 'ACTIVE',
           activated_at = COALESCE(activated_at, now()),
           deactivated_at = NULL,
           invite_code = NULL,
           invite_code_expires_at = NULL
     WHERE id = v_member.id
    RETURNING * INTO v_member;
  ELSE
    INSERT INTO public.pitch_staff_members (
      pitch_id, user_id, name, staff_role, status,
      account_status, activated_at, created_by
    ) VALUES (
      p_pitch_id, p_user_id, v_name, v_role, 'OFF_DUTY',
      'ACTIVE', now(), auth.uid()
    ) RETURNING * INTO v_member;
  END IF;

  PERFORM public.log_admin_action(
    'PITCH_STAFF_SET', 'pitch', p_pitch_id, v_name, NULL,
    jsonb_build_object('user_id', p_user_id, 'staff_role', v_role));

  RETURN jsonb_build_object(
    'member_id', v_member.id, 'staff_role', v_member.staff_role,
    'role_title', v_member.role_title, 'name', v_member.name);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_remove_pitch_staff(p_member_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_member public.pitch_staff_members%ROWTYPE;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  PERFORM public.require_admin_role(ARRAY['MODERATOR']);

  SELECT * INTO v_member FROM public.pitch_staff_members WHERE id = p_member_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Yetkili bulunamadı.'; END IF;

  DELETE FROM public.pitch_staff_members WHERE id = p_member_id;

  PERFORM public.log_admin_action(
    'PITCH_STAFF_REMOVE', 'pitch', v_member.pitch_id, v_member.name,
    jsonb_build_object('staff_role', v_member.staff_role, 'user_id', v_member.user_id), NULL);
  RETURN true;
END;
$function$;

-- Tesisin yetki tablosu tek çağrıda: sahip + müdürler + personel.
CREATE OR REPLACE FUNCTION public.admin_pitch_team(p_pitch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_owner uuid;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT owner_id INTO v_owner FROM public.pitches WHERE id = p_pitch_id;

  RETURN jsonb_build_object(
    'owner', (
      SELECT jsonb_build_object(
        'user_id', pr.id,
        'name', COALESCE(NULLIF(TRIM(pr.full_name), ''), NULLIF(TRIM(pr.name), ''), '—'),
        'email', pr.email, 'phone', pr.phone)
      FROM public.profiles pr WHERE pr.id = v_owner
    ),
    'members', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'member_id', s.id,
        'user_id', s.user_id,
        'name', s.name,
        'staff_role', s.staff_role,
        'role_title', s.role_title,
        'account_status', s.account_status,
        'phone', s.phone,
        'email', pr.email,
        'linked', s.user_id IS NOT NULL)
        ORDER BY CASE s.staff_role WHEN 'MANAGER' THEN 0 ELSE 1 END, s.name)
      FROM public.pitch_staff_members s
      LEFT JOIN public.profiles pr ON pr.id = s.user_id
      WHERE s.pitch_id = p_pitch_id
    ), '[]'::jsonb)
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_set_pitch_staff(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_remove_pitch_staff(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_pitch_team(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) Onay sisteminin veritabanındaki son kalıntıları.
--    staff_reject_pending: bekleyen rezervasyon reddi — artık bekleyen yok.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.staff_reject_pending(uuid, text);
DROP FUNCTION IF EXISTS public.admin_moderate_pitch(uuid, boolean, text);
DROP FUNCTION IF EXISTS public.admin_moderate_pitch__core(uuid, boolean, text);
