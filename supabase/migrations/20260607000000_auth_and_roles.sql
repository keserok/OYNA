-- ============================================================
-- OYNA — Auth & Roles Migration
-- Çoklu rol, telefon doğrulama, GK/Ref onay akışı,
-- KVKK hesap silme, admin audit log.
-- ============================================================

-- ─── A. profiles tablosuna yeni sütunlar ─────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS roles TEXT[] DEFAULT ARRAY['PLAYER'],
  ADD COLUMN IF NOT EXISTS phone TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS verification_notes TEXT,
  ADD COLUMN IF NOT EXISTS verification_reviewed_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS verification_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS account_deletion_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ DEFAULT NOW();

-- verification_status kısıt: sadece geçerli değerler
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_verification_status_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_verification_status_check
    CHECK (verification_status IN ('pending', 'approved', 'rejected'));

-- ─── B. admin_audit_log tablosu (KVKK zorunlu) ────────────────
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id          UUID REFERENCES auth.users(id) NOT NULL,
  admin_name        TEXT NOT NULL,
  action            TEXT NOT NULL,
  -- ROLE_CHANGE | BAN | UNBAN | SHADOW_BAN | MUTE | WALLET_ADJUST
  -- VERIFICATION_APPROVE | VERIFICATION_REJECT | IMPERSONATE | ACCOUNT_DELETE
  -- MATCH_CANCEL | PITCH_APPROVE | PITCH_REJECT | SETTINGS_UPDATE
  target_type       TEXT NOT NULL, -- 'user' | 'match' | 'pitch' | 'system'
  target_id         UUID,
  target_identifier TEXT, -- email veya isim (join olmadan hızlı okuma)
  old_value         JSONB,
  new_value         JSONB,
  ip_address        TEXT,
  user_agent        TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ─── B-RLS: admin_audit_log ────────────────────────────────────
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Only admins can view audit logs" ON public.admin_audit_log;
CREATE POLICY "Only admins can view audit logs" ON public.admin_audit_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- Doğrudan client INSERT yasak; sadece SECURITY DEFINER fonksiyonlar yazabilir
DROP POLICY IF EXISTS "No direct inserts" ON public.admin_audit_log;
CREATE POLICY "No direct inserts" ON public.admin_audit_log
  FOR INSERT WITH CHECK (false);

-- ─── C. protect_profile_sensitive_fields trigger güncellemesi ──
-- is_admin ve phone_verified alanlarını da koru.
-- Mevcut trigger fonksiyonu yerine geçer.
CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_fields()
RETURNS TRIGGER AS $$
BEGIN
  -- Direkt client UPDATE ile bu alanlar değiştirilemez
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    RAISE EXCEPTION 'SECURITY: is_admin alanı doğrudan değiştirilemez.';
  END IF;
  IF NEW.phone_verified IS DISTINCT FROM OLD.phone_verified THEN
    RAISE EXCEPTION 'SECURITY: phone_verified alanı doğrudan değiştirilemez.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger varsa drop/recreate
DROP TRIGGER IF EXISTS protect_profile_sensitive_fields_trigger ON public.profiles;
CREATE TRIGGER protect_profile_sensitive_fields_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_sensitive_fields();

-- ─── D. GK/Ref onay pending view ─────────────────────────────────
CREATE OR REPLACE VIEW public.pending_provider_verifications AS
SELECT
  p.id,
  p.full_name,
  p.email,
  p.avatar_url,
  p.role   AS primary_role,
  p.roles,
  p.verification_status,
  p.created_at,
  g.id     AS gk_profile_id,
  g.bio    AS gk_bio,
  g.fee    AS gk_fee,
  r.id     AS ref_profile_id,
  r.bio    AS ref_bio,
  r.fee    AS ref_fee
FROM public.profiles p
LEFT JOIN public.goalkeepers g ON g.auth_uid = p.id
LEFT JOIN public.referees    r ON r.auth_uid = p.id
WHERE p.verification_status = 'pending'
  AND (
    p.role = 'GOALKEEPER' OR p.role = 'REFEREE'
    OR 'GOALKEEPER' = ANY(p.roles)
    OR 'REFEREE'    = ANY(p.roles)
  );

-- View için RLS: sadece is_admin=true kullanıcılar görebilir
DROP POLICY IF EXISTS "Admins can view pending verifications" ON public.pending_provider_verifications;
-- View'larda policy yerine security_invoker kontrolü
-- (view sahipliği ile security definer fns kullanılıyor; view doğrudan RLS desteklemez)
-- Admin kontrolü E fonksiyonunda sağlanıyor.

-- ─── E. log_admin_action SECURITY DEFINER fonksiyon ────────────
CREATE OR REPLACE FUNCTION public.log_admin_action(
  p_action            TEXT,
  p_target_type       TEXT,
  p_target_id         UUID,
  p_target_identifier TEXT,
  p_old_value         JSONB DEFAULT NULL,
  p_new_value         JSONB DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_log_id    UUID;
  v_admin_name TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Bu işlem sadece adminler tarafından yapılabilir.';
  END IF;

  SELECT full_name INTO v_admin_name
  FROM public.profiles WHERE id = auth.uid();

  INSERT INTO public.admin_audit_log
    (admin_id, admin_name, action, target_type, target_id, target_identifier, old_value, new_value)
  VALUES
    (auth.uid(), v_admin_name, p_action, p_target_type, p_target_id, p_target_identifier, p_old_value, p_new_value)
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── F. approve_provider_verification SECURITY DEFINER fonksiyon ─
CREATE OR REPLACE FUNCTION public.approve_provider_verification(
  p_user_id  UUID,
  p_approved BOOLEAN,
  p_notes    TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
  v_user_email TEXT;
  v_user_name  TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT email, full_name INTO v_user_email, v_user_name
  FROM public.profiles WHERE id = p_user_id;

  UPDATE public.profiles SET
    verification_status      = CASE WHEN p_approved THEN 'approved' ELSE 'rejected' END,
    verification_notes       = p_notes,
    verification_reviewed_by = auth.uid(),
    verification_reviewed_at = NOW(),
    updated_at               = NOW()
  WHERE id = p_user_id;

  -- Kullanıcıya bildirim gönder
  INSERT INTO public.notifications (user_id, title, body, type)
  VALUES (
    p_user_id,
    CASE WHEN p_approved THEN 'Profilin Onaylandı! ✅' ELSE 'Profil Onayı Reddedildi' END,
    CASE WHEN p_approved
      THEN 'Tebrikler! Kaleci/Hakem profilin onaylandı. Artık maçlara teklifler alabilirsin.'
      ELSE COALESCE(
        'Profilin şu an için onaylanamadı. Sebep: ' || p_notes,
        'Profilin onaylanamadı. Lütfen admin ile iletişime geç.'
      )
    END,
    CASE WHEN p_approved THEN 'VERIFICATION_APPROVED' ELSE 'VERIFICATION_REJECTED' END
  );

  -- Audit log kaydı
  PERFORM public.log_admin_action(
    CASE WHEN p_approved THEN 'VERIFICATION_APPROVE' ELSE 'VERIFICATION_REJECT' END,
    'user',
    p_user_id,
    v_user_email,
    jsonb_build_object('status', 'pending'),
    jsonb_build_object(
      'status', CASE WHEN p_approved THEN 'approved' ELSE 'rejected' END,
      'notes',  p_notes
    )
  );

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── G. request_account_deletion SECURITY DEFINER (KVKK) ────────
CREATE OR REPLACE FUNCTION public.request_account_deletion()
RETURNS BOOLEAN AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Giriş yapmanız gerekiyor.';
  END IF;

  UPDATE public.profiles SET
    account_deletion_requested_at = NOW(),
    updated_at = NOW()
  WHERE id = auth.uid();

  -- Tüm adminlere bildirim gönder
  INSERT INTO public.notifications (user_id, title, body, type)
  SELECT
    id,
    'Hesap Silme Talebi',
    'Bir kullanıcı hesap silme talebinde bulundu. 30 gün içinde işleme alınmalı.',
    'ACCOUNT_DELETION_REQUEST'
  FROM public.profiles
  WHERE is_admin = true;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
