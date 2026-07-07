-- ==============================================================================
-- FAZ 8A (admin) — Kaleci/Hakem operasyonel yönetim RPC'si
-- ------------------------------------------------------------------------------
-- admin_update_goalkeeper/referee (Wave 8 __core sarmalı) yalnız katalog
-- alanlarını (ad/ücret/bio/stat/isElite...) günceller; müsaitlik (profiles.
-- is_available), çalışma saatleri ve ayarlar admin panelden yönetilemiyordu.
-- Bu RPC o boşluğu kapatır — sarmalayıcılara DOKUNMADAN yeni fonksiyon olarak
-- eklenir, MODERATOR alt-rol kapısı admin_update_goalkeeper ile aynıdır.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.admin_update_provider_ops(
  p_provider_id   uuid,
  p_provider_type text,
  p_payload       jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old jsonb;
BEGIN
  PERFORM public.require_admin_role(ARRAY['MODERATOR']);
  IF p_provider_type NOT IN ('GK','REF') THEN RAISE EXCEPTION 'INVALID_TYPE'; END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN RAISE EXCEPTION 'INVALID_PAYLOAD'; END IF;

  IF p_provider_type = 'GK' THEN
    SELECT jsonb_build_object('working_hours', working_hours, 'settings', settings)
      INTO v_old FROM public.goalkeepers WHERE id = p_provider_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    UPDATE public.goalkeepers SET
      working_hours = CASE WHEN p_payload ? 'workingHours' THEN p_payload->'workingHours' ELSE working_hours END,
      settings      = CASE WHEN p_payload ? 'settings'     THEN p_payload->'settings'     ELSE settings      END
    WHERE id = p_provider_id;
  ELSE
    SELECT jsonb_build_object('working_hours', working_hours, 'settings', settings)
      INTO v_old FROM public.referees WHERE id = p_provider_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    UPDATE public.referees SET
      working_hours = CASE WHEN p_payload ? 'workingHours' THEN p_payload->'workingHours' ELSE working_hours END,
      settings      = CASE WHEN p_payload ? 'settings'     THEN p_payload->'settings'     ELSE settings      END
    WHERE id = p_provider_id;
  END IF;

  -- Müsaitlik tek kaynak: profiles.is_available (eşleştirme motoru burayı okur)
  IF p_payload ? 'isAvailable' THEN
    UPDATE public.profiles SET is_available = (p_payload->>'isAvailable')::boolean
    WHERE id = p_provider_id;
  END IF;

  PERFORM public.log_admin_action(
    'PROVIDER_OPS_UPDATE',
    CASE WHEN p_provider_type = 'GK' THEN 'goalkeeper' ELSE 'referee' END,
    p_provider_id, NULL, v_old, p_payload);

  RETURN jsonb_build_object('updated', true, 'provider_id', p_provider_id);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_update_provider_ops(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_provider_ops(uuid, text, jsonb) TO authenticated;

-- Panelin canlı durum okuması: müsaitlik + doğrulama + saatler tek çağrıda
CREATE OR REPLACE FUNCTION public.admin_fetch_provider_ops(
  p_provider_id   uuid,
  p_provider_type text
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_prof RECORD; v_wh jsonb; v_settings jsonb; v_payouts jsonb;
BEGIN
  PERFORM public.require_admin_role(ARRAY['MODERATOR','FINANCE','SUPPORT']);
  IF p_provider_type NOT IN ('GK','REF') THEN RAISE EXCEPTION 'INVALID_TYPE'; END IF;

  SELECT is_available, verification_status INTO v_prof
  FROM public.profiles WHERE id = p_provider_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  IF p_provider_type = 'GK' THEN
    SELECT working_hours, settings INTO v_wh, v_settings FROM public.goalkeepers WHERE id = p_provider_id;
  ELSE
    SELECT working_hours, settings INTO v_wh, v_settings FROM public.referees WHERE id = p_provider_id;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', pr.id, 'amount', pr.amount, 'status', pr.status,
           'iban', pr.iban, 'method_kind', pr.method_kind, 'created_at', pr.created_at)
           ORDER BY pr.created_at DESC), '[]'::jsonb)
    INTO v_payouts
  FROM (SELECT * FROM public.payout_requests WHERE user_id = p_provider_id
        ORDER BY created_at DESC LIMIT 5) pr;

  RETURN jsonb_build_object(
    'is_available', COALESCE(v_prof.is_available, true),
    'verification_status', v_prof.verification_status,
    'working_hours', v_wh,
    'settings', v_settings,
    'recent_payouts', v_payouts);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_fetch_provider_ops(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_fetch_provider_ops(uuid, text) TO authenticated;
