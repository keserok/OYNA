-- ============================================================================
-- FAZ 7 — AUDIT SERTLEŞTİRME + RBAC KAPI YARDIMCILARI
-- ----------------------------------------------------------------------------
-- AMAÇ (sürdürülebilirlik + güvenlik):
--   1) admin_audit_log'u DEĞİŞTİRİLEMEZ (append-only) yapar — "kim ne yaptı"
--      kaydı sonradan silinip/değiştirilemesin (Soru 12).
--   2) Sunucu-tarafı alt-rol kapısı yardımcıları: require_admin_role / is_finance_admin
--      / is_moderator — finans/operasyon RPC'lerine tek noktadan yetki için temel
--      (Soru 21/22). Bu migration yalnızca YARDIMCILARI ekler; RPC'lere tatbiki
--      ayrı, dikkatli adımlarda yapılır.
--
-- GÜVENLİK: Tümü eklemeli/idempotent. Mevcut davranışı değiştirmez (yardımcılar
-- henüz hiçbir RPC'ye bağlanmadı); yalnız audit log'a yazma-sonrası değiştirme
-- engellenir.
-- ============================================================================

-- ─── 1) admin_audit_log append-only (Soru 12) ───────────────────────────────
CREATE OR REPLACE FUNCTION public.prevent_audit_log_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'admin_audit_log değiştirilemez (append-only): % engellendi', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_audit_log_immutable ON public.admin_audit_log;
CREATE TRIGGER trg_admin_audit_log_immutable
  BEFORE UPDATE OR DELETE ON public.admin_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_log_mutation();

-- Yazma yalnız log_admin_action (SECURITY DEFINER) üzerinden; doğrudan
-- UPDATE/DELETE rollerden de alınır (trigger zaten her durumda engeller).
REVOKE UPDATE, DELETE ON public.admin_audit_log FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE UPDATE, DELETE ON public.admin_audit_log FROM authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE UPDATE, DELETE ON public.admin_audit_log FROM anon';
  END IF;
END $$;

-- ─── 2) RBAC kapı yardımcıları (Soru 21/22 temeli) ──────────────────────────
-- Çağıranın alt-rolünü (admin_team_members.admin_role) döndürür. Kayıt yoksa NULL.
CREATE OR REPLACE FUNCTION public.current_admin_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT admin_role FROM public.admin_team_members WHERE user_id = auth.uid();
$$;

-- Fail-closed yetki kapısı: admin değilse VEYA rolü izinli listede değilse hata.
-- SUPER_ADMIN/ADMIN (tam yetki) ve alt-rolü tanımsız (yalnız profiles.is_admin ile
-- admin olan) hesaplar her zaman geçer — mevcut davranış korunur, kırılma olmaz.
CREATE OR REPLACE FUNCTION public.require_admin_role(p_allowed text[])
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_role text;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: admin yetkisi gerekli';
  END IF;
  v_role := public.current_admin_role();
  IF v_role IS NULL OR v_role IN ('SUPER_ADMIN', 'ADMIN') THEN
    RETURN; -- tam yetki
  END IF;
  IF NOT (v_role = ANY(p_allowed)) THEN
    RAISE EXCEPTION 'FORBIDDEN: bu işlem için yetkiniz yok (rol: %)', v_role;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_finance_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.is_platform_admin()
     AND COALESCE(public.current_admin_role(), 'ADMIN') IN ('SUPER_ADMIN', 'ADMIN', 'FINANCE');
$$;

CREATE OR REPLACE FUNCTION public.is_moderator()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.is_platform_admin()
     AND COALESCE(public.current_admin_role(), 'ADMIN') IN ('SUPER_ADMIN', 'ADMIN', 'MODERATOR');
$$;

-- Yetkiler (en az ayrıcalık)
REVOKE ALL ON FUNCTION public.current_admin_role()          FROM PUBLIC;
REVOKE ALL ON FUNCTION public.require_admin_role(text[])     FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_finance_admin()            FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_moderator()                FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_admin_role()        TO authenticated;
GRANT EXECUTE ON FUNCTION public.require_admin_role(text[])  TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_finance_admin()          TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_moderator()              TO authenticated;

-- ============================================================================
-- SON. Audit log artık değiştirilemez; alt-rol kapısı yardımcıları hazır.
-- Sonraki adım (Wave 8): finans RPC'lerine require_admin_role(ARRAY['FINANCE']),
-- operasyon RPC'lerine require_admin_role(ARRAY['MODERATOR','SUPPORT']) tatbiki.
-- ============================================================================
