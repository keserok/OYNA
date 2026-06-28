-- ============================================================================
-- FAZ 4 — AUDIT KAPSAMINI TAMAMLAMA (Soru 11/80)
-- ----------------------------------------------------------------------------
-- Canlı kaynak taranarak (pg_proc) gerçekten audit YAZMAYAN 5 durum-değiştiren
-- admin fonksiyonu bulundu ve her birine log_admin_action eklendi. Gövdeler
-- CANLI tanımdan birebir alınmıştır (hiçbir mevcut davranış değiştirilmez);
-- yalnız tek bir denetim-kaydı satırı eklenir.
-- Not: GK/REF sil-güncelle, toggle_pro vb. zaten audit'liydi (canlıda eklenmiş).
-- ============================================================================

-- 1) admin_process_payout — finansal: payout durumu değişimi audit'lenir
CREATE OR REPLACE FUNCTION public.admin_process_payout(p_payout_id uuid, p_status text, p_ref text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_payout public.payout_requests;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_status NOT IN ('PROCESSING','COMPLETED','FAILED','CANCELLED') THEN
    RAISE EXCEPTION 'INVALID_STATUS';
  END IF;

  SELECT * INTO v_payout FROM public.payout_requests WHERE id = p_payout_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  UPDATE public.payout_requests SET
    status = p_status,
    iyzico_payout_ref = COALESCE(p_ref, iyzico_payout_ref),
    admin_notes = COALESCE(p_notes, admin_notes),
    processed_at = CASE WHEN p_status IN ('COMPLETED','FAILED','CANCELLED') THEN now() ELSE processed_at END,
    processed_by = auth.uid()
  WHERE id = p_payout_id;

  IF p_status = 'COMPLETED' THEN
    UPDATE public.wallet_transactions SET status = 'COMPLETED'
    WHERE reference_type = 'PAYOUT' AND reference_id = p_payout_id AND status = 'PENDING';
  ELSIF p_status IN ('FAILED','CANCELLED') THEN
    UPDATE public.wallet_transactions SET status = 'CANCELLED'
    WHERE reference_type = 'PAYOUT' AND reference_id = p_payout_id AND status = 'PENDING';
  END IF;

  PERFORM public.log_admin_action('PAYOUT_PROCESS', 'payout', p_payout_id, v_payout.user_id::text,
    jsonb_build_object('old_status', v_payout.status, 'amount', v_payout.amount),
    jsonb_build_object('status', p_status, 'ref', p_ref, 'notes', p_notes));

  RETURN jsonb_build_object('payout_id', p_payout_id, 'status', p_status);
END;
$function$;

-- 2) admin_set_player_card — oyuncu kartı değişimi audit'lenir
CREATE OR REPLACE FUNCTION public.admin_set_player_card(p_user_id uuid, p_active boolean, p_tier text DEFAULT NULL::text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if not public.is_admin() then raise exception 'UNAUTHORIZED: yalnız admin'; end if;
  if p_tier is not null and p_tier not in ('bronze','silver','gold') then raise exception 'INVALID_TIER'; end if;
  update public.profiles
    set card_active = p_active,
        card_tier = case when p_active then coalesce(p_tier, card_tier, 'bronze') else null end
    where id = p_user_id;
  perform public.log_admin_action('PLAYER_CARD_SET', 'user', p_user_id, null, null,
    jsonb_build_object('active', p_active, 'tier', p_tier));
end; $function$;

-- 3) admin_verify_provider_identity — kimlik doğrulama kararı audit'lenir
CREATE OR REPLACE FUNCTION public.admin_verify_provider_identity(p_user_id uuid, p_approve boolean, p_notes text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  UPDATE public.provider_identities SET status = CASE WHEN p_approve THEN 'VERIFIED' ELSE 'REJECTED' END,
    admin_notes = p_notes, verified_by = v_uid, verified_at = CASE WHEN p_approve THEN now() ELSE NULL END, updated_at = now()
  WHERE user_id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  PERFORM public.log_admin_action(CASE WHEN p_approve THEN 'PROVIDER_IDENTITY_VERIFY' ELSE 'PROVIDER_IDENTITY_REJECT' END,
    'user', p_user_id, NULL, NULL, jsonb_build_object('approve', p_approve, 'notes', p_notes));
  RETURN jsonb_build_object('user_id', p_user_id, 'status', CASE WHEN p_approve THEN 'VERIFIED' ELSE 'REJECTED' END);
END; $function$;

-- 4) admin_review_provider_application — başvuru onay/red audit'lenir
CREATE OR REPLACE FUNCTION public.admin_review_provider_application(p_app_id uuid, p_approve boolean, p_notes text DEFAULT NULL::text)
 RETURNS public.provider_applications LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_app public.provider_applications;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'FORBIDDEN: Yalniz admin.'; END IF;
  SELECT * INTO v_app FROM public.provider_applications WHERE id = p_app_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
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
  PERFORM public.log_admin_action(CASE WHEN p_approve THEN 'PROVIDER_APP_APPROVE' ELSE 'PROVIDER_APP_REJECT' END,
    'user', v_app.user_id, NULL, NULL, jsonb_build_object('app_id', p_app_id, 'role', v_app.role, 'notes', p_notes));
  RETURN v_app;
END; $function$;

-- 5) admin_release_service_payout — hizmet payout serbest bırakma audit'lenir
CREATE OR REPLACE FUNCTION public.admin_release_service_payout(p_request_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_req public.service_requests;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT * INTO v_req FROM public.service_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  PERFORM public._release_service_payout(v_req.match_id, v_req.provider_id);
  PERFORM public.log_admin_action('SERVICE_PAYOUT_RELEASE', 'service_request', p_request_id, v_req.provider_id::text,
    NULL, jsonb_build_object('match_id', v_req.match_id, 'provider_id', v_req.provider_id));
  RETURN jsonb_build_object('request_id', p_request_id, 'status', 'RELEASED');
END; $function$;
