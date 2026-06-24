-- =============================================================================
-- Migration: Unify profiles schema (Remove redundancy and enforce standard)
-- =============================================================================
-- Tarih: 30 Haziran 2026
-- Amaç:
--   1. name -> full_name ve wallet -> wallet_balance veri eşitlemesi
--   2. name ve wallet kolonlarının profiles tablosundan kaldırılması
--   3. handle_new_user tetikleyicisini full_name ve wallet_balance kullanacak şekilde güncelleme
--   4. profiles üzerinde otomatik admin audit log tetikleyicisi ekleme (KVKK / Audit compliance)
-- =============================================================================

-- 1. Veri eşitlemesi (Desenkronizasyonları kurtarma)
UPDATE public.profiles
SET 
  full_name = COALESCE(full_name, name, ''),
  wallet_balance = COALESCE(wallet_balance, wallet, 0.0);

-- 2. name ve wallet kolonlarının kaldırılması
ALTER TABLE public.profiles 
  DROP COLUMN IF EXISTS name,
  DROP COLUMN IF EXISTS wallet;

-- 3. handle_new_user tetikleyicisinin güncellenmesi
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, avatar_url, role, created_at, updated_at, wallet_balance)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      split_part(COALESCE(NEW.email, ''), '@', 1)
    ),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', ''),
    'PLAYER',
    now(),
    now(),
    0.0
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 4. Otomatik Admin Audit Log Tetikleyicisi (Hassas profil güncellemeleri için)
CREATE OR REPLACE FUNCTION public.audit_profile_sensitive_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin_name TEXT;
  v_changes JSONB := '{}'::jsonb;
BEGIN
  -- İşlemi yapan kişi admin ise loglama yapılır
  IF auth.uid() IS NOT NULL AND EXISTS(SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true) THEN
    SELECT COALESCE(full_name, email, 'Admin') INTO v_admin_name FROM public.profiles WHERE id = auth.uid();
    
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      v_changes := v_changes || jsonb_build_object('role', jsonb_build_array(OLD.role, NEW.role));
    END IF;
    IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
      v_changes := v_changes || jsonb_build_object('is_admin', jsonb_build_array(OLD.is_admin, NEW.is_admin));
    END IF;
    IF NEW.wallet_balance IS DISTINCT FROM OLD.wallet_balance THEN
      v_changes := v_changes || jsonb_build_object('wallet_balance', jsonb_build_array(OLD.wallet_balance, NEW.wallet_balance));
    END IF;
    IF NEW.is_banned IS DISTINCT FROM OLD.is_banned THEN
      v_changes := v_changes || jsonb_build_object('is_banned', jsonb_build_array(OLD.is_banned, NEW.is_banned));
    END IF;

    -- Eğer hassas kolonlarda değişiklik yapıldıysa log at
    IF v_changes != '{}'::jsonb THEN
      INSERT INTO public.admin_audit_log (admin_id, admin_name, action, target_type, target_id, target_identifier, old_value, new_value)
      VALUES (
        auth.uid(),
        v_admin_name,
        'PROFILE_DIRECT_SENSITIVE_UPDATE',
        'user',
        NEW.id,
        NEW.email,
        jsonb_build_object('role', OLD.role, 'is_admin', OLD.is_admin, 'wallet_balance', OLD.wallet_balance, 'is_banned', OLD.is_banned),
        v_changes
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_profile_changes ON public.profiles;
CREATE TRIGGER trg_audit_profile_changes
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_profile_sensitive_changes();
