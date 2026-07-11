-- ════════════════════════════════════════════════════════════════════════
-- Rol geçişi: her kullanıcı için güvenli + optimize (SQL denetimi faz 2, karar:
-- kaleci/hakem rolüne ancak admin onayı SONRASI geçilebilir).
-- Bekleyen 20260714000002_role_switch_landing_backfill dosyasının yerine geçer;
-- backfill'i onay şartıyla günceller, rol tahsisini onay anına taşır.
--
-- Kurallar:
--  * profiles.roles = sahip olunan roller (SSOT), profiles.role = aktif rol.
--  * GOALKEEPER/REFEREE rolü yalnız ilgili sağlayıcı satırı 'approved' ise
--    sahiplenilir; onay kalkarsa rol otomatik geri alınır (trigger).
--  * Başvuru (apply_for_provider_role) artık ROL VERMEZ; yalnız doğrular.
--  * OWNER rolü gerçek (demo olmayan) tesis sahipliğiyle kazanılır (claim_owner_role).
--  * Girişte paneli frontend ROLE_PRIORITY (OWNER > REFEREE > GOALKEEPER > PLAYER)
--    ile seçer; backfill roles[]'u bu mantığın çalışacağı hale getirir.
-- ════════════════════════════════════════════════════════════════════════

-- ─── 1) BACKFILL (migration postgres rolüyle koşar; protect_profile_columns
--        auth.uid() IS NULL iken serbest bırakır) ─────────────────────────

-- 1a) Kayıt olan herkes oyuncu (yönetici satırları hariç)
UPDATE public.profiles
SET roles = COALESCE(roles, '[]'::jsonb) || '["PLAYER"]'::jsonb
WHERE NOT (COALESCE(roles, '[]'::jsonb) ? 'PLAYER')
  AND COALESCE(role, '') NOT IN ('ADMIN', 'SUPER_ADMIN');

-- 1b) Aktif rol sahip olunan roller içinde olmalı — PLAYER/OWNER koşulsuz,
--     GOALKEEPER/REFEREE yalnız onaylıysa
UPDATE public.profiles
SET roles = COALESCE(roles, '[]'::jsonb) || jsonb_build_array(role)
WHERE role IN ('PLAYER', 'OWNER')
  AND NOT (COALESCE(roles, '[]'::jsonb) ? role);

UPDATE public.profiles p
SET roles = COALESCE(p.roles, '[]'::jsonb) || jsonb_build_array(p.role)
WHERE p.role IN ('GOALKEEPER', 'REFEREE')
  AND NOT (COALESCE(p.roles, '[]'::jsonb) ? p.role)
  AND ((p.role = 'GOALKEEPER' AND EXISTS (
          SELECT 1 FROM public.goalkeepers g
          WHERE g.id = p.id AND g.verification_status = 'approved'))
    OR (p.role = 'REFEREE' AND EXISTS (
          SELECT 1 FROM public.referees r
          WHERE r.id = p.id AND r.verification_status = 'approved')));

-- 1c) Gerçek (demo olmayan) tesisi olan herkes OWNER rolü taşır
UPDATE public.profiles p
SET roles = COALESCE(p.roles, '[]'::jsonb) || '["OWNER"]'::jsonb
WHERE EXISTS (
    SELECT 1 FROM public.pitches pt
    WHERE pt.owner_id = p.id AND NOT COALESCE(pt.is_demo, false))
  AND NOT (COALESCE(p.roles, '[]'::jsonb) ? 'OWNER');

-- 1d) ONAYSIZ sağlayıcı rollerini geri al (güvenlik: eski akış başvuru anında
--     rol veriyordu)
UPDATE public.profiles p
SET roles = (COALESCE(p.roles, '[]'::jsonb) - 'GOALKEEPER')
WHERE COALESCE(p.roles, '[]'::jsonb) ? 'GOALKEEPER'
  AND NOT EXISTS (SELECT 1 FROM public.goalkeepers g
                  WHERE g.id = p.id AND g.verification_status = 'approved');

UPDATE public.profiles p
SET roles = (COALESCE(p.roles, '[]'::jsonb) - 'REFEREE')
WHERE COALESCE(p.roles, '[]'::jsonb) ? 'REFEREE'
  AND NOT EXISTS (SELECT 1 FROM public.referees r
                  WHERE r.id = p.id AND r.verification_status = 'approved');

-- 1e) Aktif rolü artık sahip olmadığı GK/REF olan profilleri en iyi kalan
--     role çek (öncelik: OWNER > REFEREE > GOALKEEPER > PLAYER)
UPDATE public.profiles p
SET role = CASE
    WHEN COALESCE(p.roles, '[]'::jsonb) ? 'OWNER' THEN 'OWNER'
    WHEN COALESCE(p.roles, '[]'::jsonb) ? 'REFEREE' THEN 'REFEREE'
    WHEN COALESCE(p.roles, '[]'::jsonb) ? 'GOALKEEPER' THEN 'GOALKEEPER'
    ELSE 'PLAYER' END,
    updated_at = now()
WHERE p.role IN ('GOALKEEPER', 'REFEREE')
  AND NOT (COALESCE(p.roles, '[]'::jsonb) ? p.role);

-- ─── 2) set_active_role: onay şartı + initplan ─────────────────────────────
CREATE OR REPLACE FUNCTION public.set_active_role(p_role text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_roles jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_role NOT IN ('PLAYER','GOALKEEPER','REFEREE','OWNER') THEN
    RAISE EXCEPTION 'INVALID_ROLE';
  END IF;
  SELECT roles INTO v_roles FROM public.profiles WHERE id = v_uid;
  IF NOT (COALESCE(v_roles, '[]'::jsonb) ? p_role) THEN
    RAISE EXCEPTION 'ROLE_NOT_OWNED: Bu role sahip degilsin.';
  END IF;
  -- Onay şartı: sağlayıcı rollerine yalnız doğrulama onaylıysa geçilir.
  IF p_role = 'GOALKEEPER' AND NOT EXISTS (
      SELECT 1 FROM public.goalkeepers g
      WHERE g.id = v_uid AND g.verification_status = 'approved') THEN
    RAISE EXCEPTION 'ROLE_NOT_APPROVED: Kaleci doğrulaman henüz onaylanmadı.';
  END IF;
  IF p_role = 'REFEREE' AND NOT EXISTS (
      SELECT 1 FROM public.referees r
      WHERE r.id = v_uid AND r.verification_status = 'approved') THEN
    RAISE EXCEPTION 'ROLE_NOT_APPROVED: Hakem doğrulaman henüz onaylanmadı.';
  END IF;
  PERFORM set_config('app.bypass_role_protection', 'true', true);
  UPDATE public.profiles SET role = p_role, updated_at = now() WHERE id = v_uid;
  RETURN p_role;
END; $function$;

REVOKE ALL ON FUNCTION public.set_active_role(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_active_role(text) TO authenticated;

-- ─── 3) apply_for_provider_role: başvuru artık ROL VERMEZ ─────────────────
-- Rol tahsisi onay anına taşındı (bkz. 5. bölümdeki trigger). Fonksiyon eski
-- istemcilerle uyumluluk için korunur; yalnız doğrulama yapar.
CREATE OR REPLACE FUNCTION public.apply_for_provider_role(p_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Oturum bulunamadı';
  END IF;
  IF p_role NOT IN ('GOALKEEPER', 'REFEREE') THEN
    RAISE EXCEPTION 'Geçersiz rol: %', p_role;
  END IF;
  -- Bilinçli olarak role/roles DEĞİŞTİRİLMEZ: başvuran, onay gelene dek
  -- PLAYER olarak devam eder. (Karar 2026-07-11: onay şartı.)
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_for_provider_role(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_for_provider_role(text) TO authenticated;

-- ─── 4) claim_owner_role: tesis onboarding'i OWNER rolü kazandırır ────────
CREATE OR REPLACE FUNCTION public.claim_owner_role()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Oturum bulunamadı';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.pitches
    WHERE owner_id = v_uid AND NOT COALESCE(is_demo, false)
  ) THEN
    RAISE EXCEPTION 'NO_PITCH: Tesis sahibi değilsin.';
  END IF;
  PERFORM set_config('app.bypass_role_protection', 'true', true);
  UPDATE public.profiles
     SET roles = (
           SELECT COALESCE(jsonb_agg(DISTINCT e), '[]'::jsonb)
           FROM jsonb_array_elements_text(
             COALESCE(roles, '[]'::jsonb) || '["PLAYER","OWNER"]'::jsonb
           ) AS t(e)
         ),
         role = CASE WHEN COALESCE(role, 'PLAYER') = 'PLAYER' THEN 'OWNER' ELSE role END,
         updated_at = now()
   WHERE id = v_uid;
  RETURN 'OWNER';
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_owner_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_owner_role() TO authenticated;

-- ─── 5) Onay ↔ rol senkronu: goalkeepers/referees.verification_status
--        değişince rol otomatik verilir/geri alınır. Tüm onay yolları
--        (approve_provider_verification, profiles sync trigger'ı, elle admin
--        SQL'i) bu tek noktadan geçer. ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public._sync_role_from_provider_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_role text := CASE WHEN TG_TABLE_NAME = 'goalkeepers' THEN 'GOALKEEPER' ELSE 'REFEREE' END;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.verification_status IS NOT DISTINCT FROM OLD.verification_status THEN
    RETURN NEW;
  END IF;
  PERFORM set_config('app.bypass_role_protection', 'true', true);
  IF NEW.verification_status = 'approved' THEN
    UPDATE public.profiles
       SET roles = COALESCE(roles, '[]'::jsonb) || jsonb_build_array(v_role),
           updated_at = now()
     WHERE id = NEW.id AND NOT (COALESCE(roles, '[]'::jsonb) ? v_role);
  ELSE
    UPDATE public.profiles
       SET roles = (COALESCE(roles, '[]'::jsonb) - v_role),
           updated_at = now()
     WHERE id = NEW.id AND COALESCE(roles, '[]'::jsonb) ? v_role;
    UPDATE public.profiles p
       SET role = CASE
           WHEN COALESCE(p.roles, '[]'::jsonb) ? 'OWNER' THEN 'OWNER'
           WHEN COALESCE(p.roles, '[]'::jsonb) ? 'REFEREE' THEN 'REFEREE'
           WHEN COALESCE(p.roles, '[]'::jsonb) ? 'GOALKEEPER' THEN 'GOALKEEPER'
           ELSE 'PLAYER' END,
           updated_at = now()
     WHERE p.id = NEW.id AND p.role = v_role;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public._sync_role_from_provider_status() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_gk_role_sync ON public.goalkeepers;
CREATE TRIGGER trg_gk_role_sync
  AFTER INSERT OR UPDATE OF verification_status ON public.goalkeepers
  FOR EACH ROW EXECUTE FUNCTION public._sync_role_from_provider_status();

DROP TRIGGER IF EXISTS trg_ref_role_sync ON public.referees;
CREATE TRIGGER trg_ref_role_sync
  AFTER INSERT OR UPDATE OF verification_status ON public.referees
  FOR EACH ROW EXECUTE FUNCTION public._sync_role_from_provider_status();
