-- ============================================================
-- FAZ 8 — Admin paneli sertleştirme (sunucu-taraflı yetki) — güvenlik-only
--
-- Admin paneli denetimi (READ-ONLY) bulgularına göre. Canlı roster: 1 admin = 1
-- SUPER_ADMIN, 0 alt-rol admini, 0 kayıtlı MFA → aşağıdaki değişiklikler meşru
-- admin için SIFIR işlevsel etki taşır.
--
-- A1) is_platform_admin() MFA/aal2 talep etmiyordu → aal2 isteyen yardımcı eklendi
--     (HENÜZ KULLANILMIYOR; admin TOTP kurup MFA enforcement açılınca kritik
--      yazma RPC'lerinde is_platform_admin() → is_admin_aal2() yapılmalı — bkz. runbook).
-- A3) Alt-roller (FİNANS/OPERASYON) yalnız client-side'dı → sunucu-taraflı
--     has_admin_role() yardımcısı eklendi (alt-rol admini EKLENMEDEN ÖNCE kritik
--      RPC'lere uygulanmalı; şu an 0 alt-rol admini olduğu için açık değil).
-- A6) admin_revoke_platform_role herhangi bir admin'e açıktı → grant ile simetrik
--     olacak şekilde is_super_admin()'e daraltıldı (gövde birebir, yalnız kapı değişti).
-- ============================================================

-- ── A1: MFA/aal2 isteyen admin yardımcısı (eklemeli; kullanılmıyor → zero-impact) ──
CREATE OR REPLACE FUNCTION public.is_admin_aal2(p_uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_platform_admin(p_uid)
     AND COALESCE(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;
REVOKE ALL ON FUNCTION public.is_admin_aal2(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin_aal2(uuid) TO authenticated;

-- ── A3: Sunucu-taraflı alt-rol (RBAC) yardımcısı (eklemeli; kullanılmıyor → zero-impact) ──
-- SUPER_ADMIN her zaman geçer; aksi halde admin_team_members.admin_role eşleşmeli.
CREATE OR REPLACE FUNCTION public.has_admin_role(p_role text, p_uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.is_super_admin(p_uid)
      OR EXISTS (
        SELECT 1 FROM public.admin_team_members
        WHERE user_id = p_uid AND admin_role IN ('SUPER_ADMIN', 'ADMIN', p_role)
      );
$$;
REVOKE ALL ON FUNCTION public.has_admin_role(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_admin_role(text, uuid) TO authenticated;

-- ── A6: Platform rol İPTALİ'ni grant ile simetrik kıl (is_super_admin) ──
-- Gövde, canlı tanımdan birebir korundu; YALNIZCA yetki kapısı is_platform_admin() →
-- is_super_admin() olarak değişti (grant zaten super-admin istiyor). Tek admin super
-- olduğundan zero-impact.
CREATE OR REPLACE FUNCTION public.admin_revoke_platform_role(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_email TEXT;
BEGIN
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_user_id = auth.uid() THEN RAISE EXCEPTION 'Kendi admin yetkinizi kaldıramazsınız.'; END IF;
  IF EXISTS (SELECT 1 FROM admin_team_members WHERE user_id = p_user_id AND admin_role = 'SUPER_ADMIN')
     AND (SELECT count(*) FROM admin_team_members WHERE admin_role = 'SUPER_ADMIN') <= 1 THEN
    RAISE EXCEPTION 'Son SUPER_ADMIN''in yetkisi kaldırılamaz.';
  END IF;
  SELECT email INTO v_email FROM public.profiles WHERE id = p_user_id;
  IF v_email IS NULL THEN RAISE EXCEPTION 'Kullanıcı bulunamadı.'; END IF;
  DELETE FROM public.admin_team_members WHERE user_id = p_user_id;
  UPDATE public.profiles SET is_admin = false, role = 'PLAYER' WHERE id = p_user_id;
  PERFORM public.log_admin_action('ROLE_REVOKE', 'user', p_user_id, v_email, NULL,
    jsonb_build_object('revoked_at', NOW()));
  RETURN TRUE;
END;
$function$;
