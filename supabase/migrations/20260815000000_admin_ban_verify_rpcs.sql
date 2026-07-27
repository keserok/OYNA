-- ==============================================================================
-- admin_ban_user / admin_verify_user RPC'lerinin repoya resmîleştirilmesi
--
-- Bağlam: Bu iki fonksiyon 2026-07-25 "phase1-5" olayında SQL Editor'den elle
-- oluşturulmuştu; 20260814000000 geri almasında (işe yarar oldukları için)
-- korunup anon EXECUTE'ları kaldırıldı. Ancak tanımları hiçbir repo
-- migration'ında yoktu — sıfırdan replay (preview branch) bu fonksiyonları
-- üretemezdi. Bu dosya canlıdaki tanımları playbook şablonuyla
-- (search_path = public, pg_temp + REVOKE anon) kayda geçirir.
--
-- İstemci tarafı: supabaseMutations.ts fbBanUser/fbVerifyUser bu RPC'leri
-- çağırır (doğrudan profiles UPDATE yerine sunucu tarafı yetki + audit log).
-- ==============================================================================

-- ─── 1) admin_ban_user ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_ban_user(
  p_target_id UUID,
  p_is_banned BOOLEAN,
  p_reason TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_admin_name TEXT := 'ADMIN';
  v_target_name TEXT := '';
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'SECURITY: Yalnızca platform adminleri bu işlemi yapabilir.';
  END IF;

  SELECT full_name INTO v_target_name FROM public.profiles WHERE id = p_target_id;
  SELECT full_name INTO v_admin_name FROM public.profiles WHERE id = v_admin_id;

  UPDATE public.profiles
  SET is_banned = p_is_banned,
      updated_at = NOW()
  WHERE id = p_target_id;

  -- Admin Audit Log'a güvenli kayıt ekle (Definer yetkisiyle)
  INSERT INTO public.admin_audit_log (
    admin_id,
    admin_name,
    action,
    target_type,
    target_id,
    target_identifier,
    new_value
  ) VALUES (
    v_admin_id,
    COALESCE(v_admin_name, 'ADMIN'),
    CASE WHEN p_is_banned THEN 'BAN_USER' ELSE 'UNBAN_USER' END,
    'user',
    p_target_id,
    v_target_name,
    jsonb_build_object('is_banned', p_is_banned, 'reason', p_reason)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_ban_user(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_ban_user(UUID, BOOLEAN, TEXT) TO authenticated;

-- ─── 2) admin_verify_user ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_verify_user(
  p_target_id UUID,
  p_status TEXT DEFAULT 'approved'
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin_id UUID := auth.uid();
  v_admin_name TEXT := 'ADMIN';
  v_target_name TEXT := '';
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'SECURITY: Yalnızca platform adminleri bu işlemi yapabilir.';
  END IF;

  SELECT full_name INTO v_target_name FROM public.profiles WHERE id = p_target_id;
  SELECT full_name INTO v_admin_name FROM public.profiles WHERE id = v_admin_id;

  UPDATE public.profiles
  SET is_verified = (p_status = 'approved'),
      verification_status = p_status,
      verification_reviewed_by = v_admin_id,
      verification_reviewed_at = NOW(),
      updated_at = NOW()
  WHERE id = p_target_id;

  INSERT INTO public.admin_audit_log (
    admin_id,
    admin_name,
    action,
    target_type,
    target_id,
    target_identifier,
    new_value
  ) VALUES (
    v_admin_id,
    COALESCE(v_admin_name, 'ADMIN'),
    'VERIFICATION_UPDATE',
    'user',
    p_target_id,
    v_target_name,
    jsonb_build_object('verification_status', p_status, 'is_verified', (p_status = 'approved'))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_verify_user(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_verify_user(UUID, TEXT) TO authenticated;
