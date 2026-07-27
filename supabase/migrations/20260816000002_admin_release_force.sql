-- ============================================================
-- F1.1d — Admin "Ödemeyi Serbest Bırak" gerçek zorla-serbest yolu
-- ============================================================
-- Eski admin_release_service_payout__core yalnız _release_service_payout'a
-- devrediyordu; iki-taraflı onay kapısı (provider_confirmed AND
-- captain_confirmed) sağlanmamışsa fonksiyon sessiz RETURN ediyor, RPC yine
-- {'status':'RELEASED'} döndürüyor ve admin paneli sahte "başarılı" toast'ı
-- gösteriyordu. Operasyon çalıştığını sanıyordu; para yerinden oynamıyordu.
--
-- Yeni davranış: admin çağrısı bir OVERRIDE'dır — eksik onay bayrakları
-- audit'e yazılarak true'ya çekilir, payout serbest bırakılır; yine de
-- serbest kalmadıysa (yanlış statü vb.) sessiz başarı yerine EXCEPTION.
-- FINANCE rol kapısı üstteki admin_release_service_payout sarmalayıcısında
-- aynen duruyor (bu dosya sarmalayıcıya dokunmaz).

CREATE OR REPLACE FUNCTION public.admin_release_service_payout__core(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_req public.service_requests; v_after public.service_requests;
        v_forced_provider boolean := false; v_forced_captain boolean := false;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT * INTO v_req FROM public.service_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  IF v_req.payout_released THEN
    RAISE EXCEPTION 'ALREADY_RELEASED: Bu talebin ödemesi zaten serbest bırakılmış.';
  END IF;
  IF v_req.status <> 'CAPTURED' THEN
    RAISE EXCEPTION 'INVALID_STATE: Serbest bırakma yalnız CAPTURED talepte yapılabilir (mevcut: %). No-show/itiraz kayıtları için Hizmet İtirazları ekranını kullanın.', v_req.status;
  END IF;

  IF NOT COALESCE(v_req.provider_confirmed, false) THEN
    v_forced_provider := true;
    UPDATE public.service_requests SET provider_confirmed = true WHERE id = p_request_id;
  END IF;
  IF NOT COALESCE(v_req.captain_confirmed, false) THEN
    v_forced_captain := true;
    UPDATE public.service_requests SET captain_confirmed = true WHERE id = p_request_id;
  END IF;

  PERFORM public._release_service_payout(v_req.match_id, v_req.provider_id);

  SELECT * INTO v_after FROM public.service_requests WHERE id = p_request_id;
  IF NOT COALESCE(v_after.payout_released, false) THEN
    RAISE EXCEPTION 'RELEASE_FAILED: Payout serbest bırakılamadı — talep durumunu kontrol edin.';
  END IF;

  PERFORM public.log_admin_action('SERVICE_PAYOUT_RELEASE', 'service_request', p_request_id, v_req.provider_id::text,
    jsonb_build_object('provider_confirmed', v_req.provider_confirmed, 'captain_confirmed', v_req.captain_confirmed),
    jsonb_build_object('match_id', v_req.match_id, 'provider_id', v_req.provider_id,
                       'forced_provider_confirm', v_forced_provider, 'forced_captain_confirm', v_forced_captain));
  RETURN jsonb_build_object('request_id', p_request_id, 'status', 'RELEASED',
                            'forced_provider_confirm', v_forced_provider,
                            'forced_captain_confirm', v_forced_captain);
END; $function$;
