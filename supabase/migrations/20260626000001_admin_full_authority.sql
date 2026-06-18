-- Admin tam yetki — provider, owner account, promo audited RPC'leri

CREATE OR REPLACE FUNCTION public.admin_delete_goalkeeper(p_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name TEXT;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT name INTO v_name FROM public.goalkeepers WHERE id = p_id;
  IF v_name IS NULL THEN RAISE EXCEPTION 'Kaleci bulunamadı'; END IF;
  DELETE FROM public.goalkeepers WHERE id = p_id;
  PERFORM public.log_admin_action('GK_DELETE', 'goalkeeper', p_id, v_name, NULL, NULL);
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_referee(p_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name TEXT;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT name INTO v_name FROM public.referees WHERE id = p_id;
  IF v_name IS NULL THEN RAISE EXCEPTION 'Hakem bulunamadı'; END IF;
  DELETE FROM public.referees WHERE id = p_id;
  PERFORM public.log_admin_action('REF_DELETE', 'referee', p_id, v_name, NULL, NULL);
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_owner_account(
  p_owner_user_id UUID,
  p_payload JSONB
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old JSONB;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT to_jsonb(o.*) INTO v_old FROM public.owner_accounts o WHERE owner_user_id = p_owner_user_id;
  IF v_old IS NULL THEN RAISE EXCEPTION 'SaaS hesabı bulunamadı'; END IF;
  UPDATE public.owner_accounts SET
    plan_tier = COALESCE(p_payload->>'plan_tier', plan_tier),
    status = COALESCE(p_payload->>'status', status),
    entitlements = COALESCE(p_payload->'entitlements', entitlements),
    billing_email = COALESCE(p_payload->>'billing_email', billing_email),
    trial_ends_at = COALESCE((p_payload->>'trial_ends_at')::timestamptz, trial_ends_at),
    updated_at = NOW()
  WHERE owner_user_id = p_owner_user_id;
  PERFORM public.log_admin_action('OWNER_ACCOUNT_UPDATE', 'owner_account', p_owner_user_id, p_owner_user_id::text, v_old, p_payload);
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_promo_code(p_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_code TEXT;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT code INTO v_code FROM public.promo_codes WHERE id = p_id;
  IF v_code IS NULL THEN RAISE EXCEPTION 'Promo kod bulunamadı'; END IF;
  DELETE FROM public.promo_codes WHERE id = p_id;
  PERFORM public.log_admin_action('PROMO_DELETE', 'promo_code', p_id, v_code, NULL, NULL);
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_promo_code_active(p_id UUID, p_active BOOLEAN)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_code TEXT;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT code INTO v_code FROM public.promo_codes WHERE id = p_id;
  IF v_code IS NULL THEN RAISE EXCEPTION 'Promo kod bulunamadı'; END IF;
  UPDATE public.promo_codes SET is_active = p_active WHERE id = p_id;
  PERFORM public.log_admin_action('PROMO_TOGGLE', 'promo_code', p_id, v_code, NULL, jsonb_build_object('is_active', p_active));
  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_goalkeeper(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_referee(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_owner_account(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_promo_code(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_promo_code_active(uuid, boolean) TO authenticated;
