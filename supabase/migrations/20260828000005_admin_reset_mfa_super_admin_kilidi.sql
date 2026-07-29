-- ============================================================================
-- admin_reset_mfa: SUPER_ADMIN kilidini SIRA olarak da garanti et
--
-- NEDEN: `20260816000011_admin_mfa_recovery.sql` (satır 172) `admin_reset_mfa`'yı
-- `PERFORM public.require_admin_role(ARRAY['SUPER_ADMIN'])` ile tanımlar. İki rol
-- modelinden (20260828000003) sonra `require_admin_role()` p_allowed listesini
-- ARTIK OKUMAZ — yalnız "platform admin mi?" diye bakar. Yani o gövde ADMIN'i
-- geçirir: atanmış bir ADMIN, süper adminin 2FA'sını sıfırlayıp hesabı
-- devralabilir.
--
-- 20260828000003 bu deliği zaten kapatıyor ve sırada 20260816000011'den SONRA
-- geldiği için sıfırdan replay'de de doğru gövde kazanır. Bu dosya kilidi
-- sıranın en sonunda bir kez daha dayatır: `admin_reset_mfa` ileride yeniden
-- düzenlenirse kapının `require_super_admin()` kalması gerektiğini hem kodla
-- hem yorumla sabitler.
--
-- Canlıda gövde zaten bu haldedir; çalıştırma no-op'tur.
-- İdempotent: tekrar uygulanması güvenlidir.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_reset_mfa(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
DECLARE v_uid uuid := auth.uid(); v_deleted int := 0; v_name text;
BEGIN
  -- ADMIN'i BAYPAS ETMEYEN kapı. require_admin_role() burada YETERSİZDİR.
  PERFORM public.require_super_admin();
  IF p_user_id = v_uid THEN
    RAISE EXCEPTION 'SELF_RESET_FORBIDDEN: Kendi MFA''nızı sıfırlayamazsınız (başka bir SUPER_ADMIN yapmalı).';
  END IF;
  SELECT COALESCE(name, full_name, email) INTO v_name FROM public.profiles WHERE id = p_user_id;
  DELETE FROM auth.mfa_factors WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  DELETE FROM public.admin_mfa_recovery_codes WHERE user_id = p_user_id;
  PERFORM public.log_admin_action('MFA_RESET', 'user', p_user_id, v_name, NULL,
    jsonb_build_object('factors_removed', v_deleted));
  RETURN jsonb_build_object('ok', true, 'factors_removed', v_deleted);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reset_mfa(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reset_mfa(uuid) TO authenticated;

COMMENT ON FUNCTION public.admin_reset_mfa(uuid) IS
  'MFA sıfırlama: yalnız SUPER_ADMIN. Kapı require_super_admin() olmalıdır; require_admin_role() ADMIN''i baypas eder.';
