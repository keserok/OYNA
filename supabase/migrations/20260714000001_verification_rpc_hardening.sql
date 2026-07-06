-- ============================================================================
-- Doğrulama RPC sağlamlaştırma
-- ----------------------------------------------------------------------------
--  A. approve_provider_verification:
--       • MODERATOR RBAC sarmalı (diğer admin işlemleriyle tutarlı)
--       • onayda katalog satırını 'approved' olarak yaz (satır yoksa oluştururken
--         de görünür olsun; profiles→katalog trigger'ı zaten mevcut satırı günceller)
--  B. admin_verify_provider_identity__core: kullanıcıya kimlik sonucu bildirimi
--  C. admin_review_provider_application__core: kullanıcıya başvuru sonucu bildirimi
--       (yalnız verification_status GERÇEKTEN değiştiyse — iki-RPC onay akışında
--        mükerrer bildirim olmasın diye)
-- ============================================================================

-- A) approve_provider_verification --------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_provider_verification(p_user_id uuid, p_approved boolean, p_notes text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  PERFORM public.require_admin_role(ARRAY['MODERATOR']);

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
    INSERT INTO public.goalkeepers (id, "authUid", name, bio, fee, rating, "matchCount", style, avatar, "isElite", "isDemo", verification_status, stats, skills)
    VALUES (p_user_id, p_user_id, COALESCE(v_name, 'Kaleci'), 'Onaylanmış kaleci profili', 250, 4.5, 0, 'Dengeli',
      'https://images.unsplash.com/photo-1574629310576-6e84c60be5cb?w=400', false, false, 'approved',
      '{"savePercentage":"85","cleanSheets":0}'::jsonb, '{"reflexes":80,"diving":80}'::jsonb)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, "authUid" = EXCLUDED."authUid", verification_status = 'approved';
  END IF;

  IF p_approved AND v_is_ref THEN
    INSERT INTO public.referees (id, "authUid", name, bio, fee, rating, "matchCount", level, avatar, "isElite", "isDemo", verification_status, stats)
    VALUES (p_user_id, p_user_id, COALESCE(v_name, 'Hakem'), 'Onaylanmış hakem profili', 350, 4.5, 0, 'FIFA',
      'https://images.unsplash.com/photo-1580234811497-9df7fd2f357e?w=400', false, false, 'approved',
      '{"authority":80,"fitness":80,"communication":80}'::jsonb)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, "authUid" = EXCLUDED."authUid", verification_status = 'approved';
  END IF;

  INSERT INTO public.notifications (user_id, title, body, type_key)
  VALUES (
    p_user_id,
    CASE WHEN p_approved THEN 'Profilin Onaylandı!' ELSE 'Profil Onayı Reddedildi' END,
    CASE WHEN p_approved
      THEN 'Tebrikler! Hizmet sağlayıcı profilin aktif ve pazaryerinde görünür.'
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
$function$;

-- B) admin_verify_provider_identity__core — kullanıcı bildirimi ekle ----------
CREATE OR REPLACE FUNCTION public.admin_verify_provider_identity__core(p_user_id uuid, p_approve boolean, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  UPDATE public.provider_identities SET status = CASE WHEN p_approve THEN 'VERIFIED' ELSE 'REJECTED' END,
    admin_notes = p_notes, verified_by = v_uid, verified_at = CASE WHEN p_approve THEN now() ELSE NULL END, updated_at = now()
  WHERE user_id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  INSERT INTO public.notifications (user_id, title, body, type_key)
  VALUES (
    p_user_id,
    CASE WHEN p_approve THEN 'Kimliğin Doğrulandı' ELSE 'Kimlik Doğrulama Reddedildi' END,
    CASE WHEN p_approve
      THEN 'Kimlik doğrulaman tamamlandı. Hizmet sağlayıcı sürecine devam edebilirsin.'
      ELSE COALESCE('Kimlik doğrulaman reddedildi. Sebep: ' || p_notes, 'Kimlik doğrulaman reddedildi. Lütfen belgeleri kontrol edip tekrar yükle.')
    END,
    CASE WHEN p_approve THEN 'IDENTITY_VERIFIED' ELSE 'IDENTITY_REJECTED' END
  );

  PERFORM public.log_admin_action(CASE WHEN p_approve THEN 'PROVIDER_IDENTITY_VERIFY' ELSE 'PROVIDER_IDENTITY_REJECT' END,
    'user', p_user_id, NULL, NULL, jsonb_build_object('approve', p_approve, 'notes', p_notes));
  RETURN jsonb_build_object('user_id', p_user_id, 'status', CASE WHEN p_approve THEN 'VERIFIED' ELSE 'REJECTED' END);
END; $function$;

-- C) admin_review_provider_application__core — kullanıcı bildirimi ekle --------
CREATE OR REPLACE FUNCTION public.admin_review_provider_application__core(p_app_id uuid, p_approve boolean, p_notes text DEFAULT NULL::text)
 RETURNS provider_applications
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_app public.provider_applications;
  v_old_status text;
  v_new_status text;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'FORBIDDEN: Yalniz admin.'; END IF;
  SELECT * INTO v_app FROM public.provider_applications WHERE id = p_app_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  SELECT verification_status INTO v_old_status FROM public.profiles WHERE id = v_app.user_id;
  v_new_status := CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END;

  UPDATE public.provider_applications SET status = CASE WHEN p_approve THEN 'APPROVED' ELSE 'REJECTED' END,
    admin_notes = p_notes, reviewed_by = v_uid, reviewed_at = now() WHERE id = p_app_id RETURNING * INTO v_app;
  PERFORM set_config('app.bypass_role_protection', 'true', true);
  IF p_approve THEN
    UPDATE public.profiles SET role = v_app.role,
      roles = CASE WHEN COALESCE(roles,'[]'::jsonb) ? v_app.role THEN roles ELSE COALESCE(roles,'[]'::jsonb) || jsonb_build_array(v_app.role) END,
      verification_status = 'approved', verification_reviewed_by = v_uid, verification_reviewed_at = now(), is_available = true, updated_at = now()
    WHERE id = v_app.user_id;
  ELSE
    UPDATE public.profiles SET verification_status = 'rejected', verification_notes = p_notes,
      verification_reviewed_by = v_uid, verification_reviewed_at = now(), updated_at = now() WHERE id = v_app.user_id;
  END IF;

  -- Bildirim: yalnız durum GERÇEKTEN değiştiyse (approve_provider_verification
  -- ile birlikte çağrılırsa mükerrer bildirimi engeller).
  IF v_old_status IS DISTINCT FROM v_new_status THEN
    INSERT INTO public.notifications (user_id, title, body, type_key)
    VALUES (
      v_app.user_id,
      CASE WHEN p_approve THEN 'Başvurun Onaylandı!' ELSE 'Başvurun Reddedildi' END,
      CASE WHEN p_approve
        THEN 'Hizmet sağlayıcı başvurun onaylandı. Profilin pazaryerinde görünür.'
        ELSE COALESCE('Başvurun reddedildi. Sebep: ' || p_notes, 'Başvurun reddedildi.')
      END,
      CASE WHEN p_approve THEN 'PROVIDER_APP_APPROVED' ELSE 'PROVIDER_APP_REJECTED' END
    );
  END IF;

  PERFORM public.log_admin_action(CASE WHEN p_approve THEN 'PROVIDER_APP_APPROVE' ELSE 'PROVIDER_APP_REJECT' END,
    'user', v_app.user_id, NULL, NULL, jsonb_build_object('app_id', p_app_id, 'role', v_app.role, 'notes', p_notes));
  RETURN v_app;
END; $function$;
