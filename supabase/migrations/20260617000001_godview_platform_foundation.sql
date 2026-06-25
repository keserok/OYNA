-- ============================================================
-- OYNA Godview Platform — Faz 1-3 Temel Altyapı
-- Birleşik admin kimliği, okuma politikaları, denetim RPC'leri
-- ============================================================

-- ─── A. Birleşik platform admin kontrolü ─────────────────────
CREATE OR REPLACE FUNCTION public.is_platform_admin(p_uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_uid
      AND (
        is_admin = true
        OR role IN ('ADMIN', 'SUPER_ADMIN')
        OR COALESCE(roles, '[]'::jsonb) ? 'ADMIN'
        OR COALESCE(roles, '[]'::jsonb) ? 'SUPER_ADMIN'
      )
  );
$$;

REVOKE ALL ON FUNCTION public.is_platform_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO authenticated;

-- role/is_admin senkronizasyonu
CREATE OR REPLACE FUNCTION public.sync_admin_flags()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role IN ('ADMIN', 'SUPER_ADMIN')
     OR COALESCE(NEW.roles, '[]'::jsonb) ? 'ADMIN'
     OR COALESCE(NEW.roles, '[]'::jsonb) ? 'SUPER_ADMIN'
  THEN
    NEW.is_admin := true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_admin_flags_trigger ON public.profiles;
CREATE TRIGGER sync_admin_flags_trigger
  BEFORE INSERT OR UPDATE OF role, roles, is_admin ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_admin_flags();

-- Mevcut adminleri senkronize et
UPDATE public.profiles
SET is_admin = true
WHERE role IN ('ADMIN', 'SUPER_ADMIN')
   OR COALESCE(roles, '[]'::jsonb) ? 'ADMIN'
   OR COALESCE(roles, '[]'::jsonb) ? 'SUPER_ADMIN';

-- ─── B. Profil koruması (genişletilmiş) ──────────────────────
CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_platform_admin() THEN
    IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
      RAISE EXCEPTION 'SECURITY: is_admin alanı doğrudan değiştirilemez.';
    END IF;
    IF NEW.phone_verified IS DISTINCT FROM OLD.phone_verified THEN
      RAISE EXCEPTION 'SECURITY: phone_verified alanı doğrudan değiştirilemez.';
    END IF;
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'SECURITY: role alanı doğrudan değiştirilemez.';
    END IF;
    IF NEW.roles IS DISTINCT FROM OLD.roles THEN
      RAISE EXCEPTION 'SECURITY: roles alanı doğrudan değiştirilemez.';
    END IF;
    IF NEW.wallet_balance IS DISTINCT FROM OLD.wallet_balance THEN
      RAISE EXCEPTION 'SECURITY: wallet_balance doğrudan değiştirilemez.';
    END IF;
    IF NEW.is_banned IS DISTINCT FROM OLD.is_banned THEN
      RAISE EXCEPTION 'SECURITY: is_banned doğrudan değiştirilemez.';
    END IF;
    IF NEW.ban_expires_at IS DISTINCT FROM OLD.ban_expires_at THEN
      RAISE EXCEPTION 'SECURITY: ban_expires_at doğrudan değiştirilemez.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ─── C. Admin okuma politikaları ─────────────────────────────
DROP POLICY IF EXISTS "Platform admins read all profiles" ON public.profiles;
CREATE POLICY "Platform admins read all profiles" ON public.profiles
  FOR SELECT USING (public.is_platform_admin());

DROP POLICY IF EXISTS "Only admins can view audit logs" ON public.admin_audit_log;
CREATE POLICY "Only admins can view audit logs" ON public.admin_audit_log
  FOR SELECT USING (public.is_platform_admin());

-- ─── D. log_admin_action güncellemesi ────────────────────────
CREATE OR REPLACE FUNCTION public.log_admin_action(
  p_action            TEXT,
  p_target_type       TEXT,
  p_target_id         UUID,
  p_target_identifier TEXT,
  p_old_value         JSONB DEFAULT NULL,
  p_new_value         JSONB DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_log_id     UUID;
  v_admin_name TEXT;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Bu işlem sadece platform adminleri tarafından yapılabilir.';
  END IF;

  SELECT COALESCE(full_name, email, 'Admin') INTO v_admin_name
  FROM public.profiles WHERE id = auth.uid();

  INSERT INTO public.admin_audit_log
    (admin_id, admin_name, action, target_type, target_id, target_identifier, old_value, new_value)
  VALUES
    (auth.uid(), v_admin_name, p_action, p_target_type, p_target_id, p_target_identifier, p_old_value, p_new_value)
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- approve_provider_verification güncellemesi — onay anında kaleci/hakem profilini de oluşturur
CREATE OR REPLACE FUNCTION public.approve_provider_verification(
  p_user_id  UUID,
  p_approved BOOLEAN,
  p_notes    TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
  v_user_email TEXT;
  v_name       TEXT;
  v_role       TEXT;
  v_roles      JSONB;
  v_is_gk      BOOLEAN;
  v_is_ref     BOOLEAN;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT email, COALESCE(full_name, name), role, roles
  INTO v_user_email, v_name, v_role, v_roles
  FROM public.profiles WHERE id = p_user_id;

  v_is_gk := v_role = 'GOALKEEPER' OR COALESCE(v_roles, '[]'::jsonb) ? 'GOALKEEPER';
  v_is_ref := v_role = 'REFEREE' OR COALESCE(v_roles, '[]'::jsonb) ? 'REFEREE';

  UPDATE public.profiles SET
    verification_status      = CASE WHEN p_approved THEN 'approved' ELSE 'rejected' END,
    verification_notes       = p_notes,
    verification_reviewed_by = auth.uid(),
    verification_reviewed_at = NOW(),
    updated_at               = NOW()
  WHERE id = p_user_id;

  IF p_approved AND v_is_gk THEN
    INSERT INTO public.goalkeepers (id, "authUid", name, bio, fee, rating, "matchCount", style, avatar, "isElite", "isDemo", stats, skills)
    VALUES (p_user_id, p_user_id, COALESCE(v_name, 'Kaleci'), 'Onaylanmış kaleci profili', 250, 4.5, 0, 'Dengeli',
      'https://images.unsplash.com/photo-1574629310576-6e84c60be5cb?w=400', false, false,
      '{"savePercentage":"85","cleanSheets":0}'::jsonb, '{"reflexes":80,"diving":80}'::jsonb)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, "authUid" = EXCLUDED."authUid";
  END IF;

  IF p_approved AND v_is_ref THEN
    INSERT INTO public.referees (id, "authUid", name, bio, fee, rating, "matchCount", level, avatar, "isElite", "isDemo", stats)
    VALUES (p_user_id, p_user_id, COALESCE(v_name, 'Hakem'), 'Onaylanmış hakem profili', 350, 4.5, 0, 'FIFA',
      'https://images.unsplash.com/photo-1580234811497-9df7fd2f357e?w=400', false, false,
      '{"authority":80,"fitness":80,"communication":80}'::jsonb)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, "authUid" = EXCLUDED."authUid";
  END IF;

  INSERT INTO public.notifications (user_id, title, body, type_key)
  VALUES (
    p_user_id,
    CASE WHEN p_approved THEN 'Profilin Onaylandı!' ELSE 'Profil Onayı Reddedildi' END,
    CASE WHEN p_approved
      THEN 'Tebrikler! Hizmet sağlayıcı profilin aktif.'
      ELSE COALESCE('Sebep: ' || p_notes, 'Profilin onaylanamadı.')
    END,
    CASE WHEN p_approved THEN 'VERIFICATION_APPROVED' ELSE 'VERIFICATION_REJECTED' END
  );

  PERFORM public.log_admin_action(
    CASE WHEN p_approved THEN 'VERIFICATION_APPROVE' ELSE 'VERIFICATION_REJECT' END,
    'user', p_user_id, v_user_email,
    jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', CASE WHEN p_approved THEN 'approved' ELSE 'rejected' END, 'notes', p_notes)
  );

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ─── E. Operasyon RPC'leri (Faz 3) ───────────────────────────
CREATE OR REPLACE FUNCTION public.admin_moderate_pitch(
  p_pitch_id UUID,
  p_approved BOOLEAN,
  p_notes    TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
  v_pitch_name TEXT;
  v_owner_id   UUID;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT name, owner_id INTO v_pitch_name, v_owner_id
  FROM public.pitches WHERE id = p_pitch_id;

  IF v_pitch_name IS NULL THEN
    RAISE EXCEPTION 'Tesis bulunamadı.';
  END IF;

  UPDATE public.pitches SET
    verification_status = CASE WHEN p_approved THEN 'approved' ELSE 'rejected' END,
    verification_notes  = CASE WHEN p_approved THEN NULL ELSE p_notes END,
    updated_at          = NOW()
  WHERE id = p_pitch_id;

  IF v_owner_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, body, type_key)
    VALUES (
      v_owner_id,
      CASE WHEN p_approved THEN 'Tesisiniz Onaylandı' ELSE 'Tesisiniz Onaylanmadı' END,
      CASE WHEN p_approved
        THEN v_pitch_name || ' tesisiniz onaylandı ve oyunculara görünür hale geldi.'
        ELSE v_pitch_name || ': ' || COALESCE(p_notes, 'Onaylanamadı.')
      END,
      CASE WHEN p_approved THEN 'PITCH_APPROVED' ELSE 'PITCH_REJECTED' END
    );
  END IF;

  PERFORM public.log_admin_action(
    CASE WHEN p_approved THEN 'PITCH_APPROVE' ELSE 'PITCH_REJECT' END,
    'pitch', p_pitch_id, v_pitch_name,
    jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', CASE WHEN p_approved THEN 'approved' ELSE 'rejected' END, 'notes', p_notes)
  );

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.admin_process_withdrawal(
  p_request_id UUID,
  p_approved   BOOLEAN,
  p_notes      TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
  v_owner_id   UUID;
  v_amount     NUMERIC;
  v_pitch_name TEXT;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT w.owner_id, w.amount, p.name
  INTO v_owner_id, v_amount, v_pitch_name
  FROM public.owner_withdrawal_requests w
  LEFT JOIN public.pitches p ON p.id = w.pitch_id
  WHERE w.id = p_request_id;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Talep bulunamadı.';
  END IF;

  UPDATE public.owner_withdrawal_requests SET
    status       = CASE WHEN p_approved THEN 'APPROVED' ELSE 'REJECTED' END,
    admin_notes  = p_notes,
    processed_at = NOW(),
    processed_by = auth.uid()
  WHERE id = p_request_id;

  INSERT INTO public.notifications (user_id, title, body, type_key)
  VALUES (
    v_owner_id,
    CASE WHEN p_approved THEN 'Para Çekme Talebiniz Onaylandı' ELSE 'Para Çekme Talebiniz Reddedildi' END,
    CASE WHEN p_approved
      THEN COALESCE(v_amount::text, '0') || '₺ tutarındaki talebiniz onaylandı.'
      ELSE COALESCE(p_notes, 'Talep reddedildi.')
    END,
    CASE WHEN p_approved THEN 'WITHDRAWAL_APPROVED' ELSE 'WITHDRAWAL_REJECTED' END
  );

  PERFORM public.log_admin_action(
    CASE WHEN p_approved THEN 'WITHDRAWAL_APPROVE' ELSE 'WITHDRAWAL_REJECT' END,
    'withdrawal', p_request_id, COALESCE(v_pitch_name, 'withdrawal'),
    jsonb_build_object('status', 'PENDING'),
    jsonb_build_object('status', CASE WHEN p_approved THEN 'APPROVED' ELSE 'REJECTED' END, 'notes', p_notes, 'amount', v_amount)
  );

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.admin_ban_user(
  p_user_id    UUID,
  p_is_banned  BOOLEAN,
  p_expires_at TIMESTAMPTZ DEFAULT NULL,
  p_reason     TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
  v_email TEXT;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT email INTO v_email FROM public.profiles WHERE id = p_user_id;
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Kullanıcı bulunamadı.';
  END IF;

  UPDATE public.profiles SET
    is_banned      = p_is_banned,
    ban_expires_at = CASE WHEN p_is_banned THEN p_expires_at ELSE NULL END,
    updated_at     = NOW()
  WHERE id = p_user_id;

  PERFORM public.log_admin_action(
    CASE WHEN p_is_banned THEN 'BAN' ELSE 'UNBAN' END,
    'user', p_user_id, v_email,
    NULL,
    jsonb_build_object('is_banned', p_is_banned, 'expires_at', p_expires_at, 'reason', p_reason)
  );

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- admin_update_settings burada TANIMLANMAZ: doğru RBAC-korumalı, camelCase,
-- id='main' versiyonu 20260618105120_subrole_rbac.sql migration'ında tanımlı.

CREATE OR REPLACE FUNCTION public.admin_log_impersonation(
  p_target_user_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_identifier TEXT;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT COALESCE(full_name, email) INTO v_identifier
  FROM public.profiles WHERE id = p_target_user_id;

  PERFORM public.log_admin_action(
    'IMPERSONATE', 'user', p_target_user_id, v_identifier,
    NULL, jsonb_build_object('started_at', NOW())
  );

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ─── F. Dashboard istatistikleri ─────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_dashboard_stats()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT jsonb_build_object(
    'total_users',        (SELECT COUNT(*)::int FROM public.profiles),
    'total_pitches',      (SELECT COUNT(*)::int FROM public.pitches),
    'total_matches',      (SELECT COUNT(*)::int FROM public.matches),
    'total_communities',  (SELECT COUNT(*)::int FROM public.communities),
    'pending_verifications', (SELECT COUNT(*)::int FROM public.profiles WHERE verification_status = 'pending'),
    'pending_pitches',    (SELECT COUNT(*)::int FROM public.pitches WHERE verification_status = 'pending'),
    'pending_withdrawals',(SELECT COUNT(*)::int FROM public.owner_withdrawal_requests WHERE status = 'PENDING'),
    'open_disputes',      (SELECT COUNT(*)::int FROM public.match_disputes WHERE status IN ('OPEN','UNDER_REVIEW')),
    'deletion_requests',  (SELECT COUNT(*)::int FROM public.profiles WHERE account_deletion_requested_at IS NOT NULL),
    'pending_community_requests', (SELECT COUNT(*)::int FROM public.community_creation_requests WHERE status = 'PENDING'),
    'banned_users',       (SELECT COUNT(*)::int FROM public.profiles WHERE is_banned = true),
    'active_goalkeepers', (SELECT COUNT(*)::int FROM public.goalkeepers),
    'active_referees',    (SELECT COUNT(*)::int FROM public.referees),
    'total_booking_revenue', COALESCE((SELECT SUM(amount) FROM public.booking_payments), 0),
    'total_wallet_volume', COALESCE((SELECT SUM(ABS(amount)) FROM public.wallet_transactions), 0),
    'active_promo_codes', (SELECT COUNT(*)::int FROM public.promo_codes WHERE is_active = true),
    'commission_rate',    (SELECT "commissionRate" FROM public.settings WHERE id = 'main')
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_dashboard_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_moderate_pitch(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_process_withdrawal(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_ban_user(uuid, boolean, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_log_impersonation(uuid) TO authenticated;
