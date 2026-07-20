-- KC-4: Uygun olmayan / gizli / teklif-almayan sağlayıcı BOOKINGLENEMEZ.
--
-- (1) create_service_request: ücret aramasına is_available + showProfile + allowOffer
--     kapıları eklendi. Uygun değilse v_fee null → PROVIDER_UNAVAILABLE (sunucu
--     otoritatif guard; istemci listesi bayat olsa bile booking reddedilir).
-- (2) get_available_provider_ids(p_type): marketplace'in uygun sağlayıcıları
--     filtreleyebilmesi için (is_available profiles'ta; goalkeepers/referees'te yok).
--     Yalnız uuid döner (profil sızıntısı yok).

-- ─── (2) yardımcı: uygun sağlayıcı id'leri ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_available_provider_ids(p_type text)
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT g.id FROM public.goalkeepers g JOIN public.profiles p ON p.id = g.id
   WHERE p_type = 'GK' AND p.verification_status = 'approved' AND COALESCE(p.is_available, true) = true
  UNION ALL
  SELECT r.id FROM public.referees r JOIN public.profiles p ON p.id = r.id
   WHERE p_type = 'REF' AND p.verification_status = 'approved' AND COALESCE(p.is_available, true) = true
$function$;
GRANT EXECUTE ON FUNCTION public.get_available_provider_ids(text) TO authenticated;

-- ─── (1) create_service_request: uygunluk/gizlilik guard ─────────────────────
CREATE OR REPLACE FUNCTION public.create_service_request(p_match_id uuid, p_provider_id uuid, p_provider_type text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_match RECORD; v_fee numeric; v_scope text; v_comm jsonb;
  v_prov_amt numeric; v_comm_amt numeric; v_intent public.payment_intents; v_req public.service_requests;
  v_far_h numeric; v_near_m numeric; v_floor_m numeric; v_expires timestamptz;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_provider_type NOT IN ('GK','REF') THEN RAISE EXCEPTION 'INVALID_TYPE'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('svc_provider:' || p_provider_id::text));
  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_match."creatorId" IS DISTINCT FROM v_uid AND v_match.captain_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'FORBIDDEN: Yalniz mac sahibi/kaptan hizmet talep edebilir.'; END IF;
  IF v_match.status IN ('CANCELLED','COMPLETED') THEN RAISE EXCEPTION 'INVALID_MATCH_STATE: Mac % durumunda.', v_match.status; END IF;
  -- KC-4: approved + is_available + showProfile + allowOffer → aksi halde v_fee null.
  IF p_provider_type = 'GK' THEN
    SELECT g.fee INTO v_fee FROM public.goalkeepers g JOIN public.profiles p ON p.id = g.id
    WHERE g.id = p_provider_id AND p.verification_status = 'approved'
      AND COALESCE(p.is_available, true) = true
      AND COALESCE((g.settings->>'showProfile')::boolean, true) = true
      AND COALESCE((g.settings->>'allowOffer')::boolean, true) = true; v_scope := 'SERVICE_GK';
  ELSE
    SELECT r.fee INTO v_fee FROM public.referees r JOIN public.profiles p ON p.id = r.id
    WHERE r.id = p_provider_id AND p.verification_status = 'approved'
      AND COALESCE(p.is_available, true) = true
      AND COALESCE((r.settings->>'showProfile')::boolean, true) = true
      AND COALESCE((r.settings->>'allowOffer')::boolean, true) = true; v_scope := 'SERVICE_REF';
  END IF;
  IF v_fee IS NULL THEN RAISE EXCEPTION 'PROVIDER_UNAVAILABLE: Saglayici su an musait degil veya teklif almiyor.'; END IF;
  IF public._provider_has_conflict(p_provider_id, v_match.starts_at, p_match_id) THEN
    RAISE EXCEPTION 'PROVIDER_CONFLICT: Saglayicinin bu saatte baska bir maci var.'; END IF;
  v_comm := public.calculate_commission(v_fee, v_scope);
  v_comm_amt := (v_comm->>'commission_amt')::numeric; v_prov_amt := (v_comm->>'net_amount')::numeric;
  INSERT INTO public.payment_intents (user_id, match_id, amount, currency, status, provider,
    commission_amount, owner_amount, service_provider_amount, commission_model, related_entity_type)
  VALUES (v_uid, p_match_id, v_fee, 'TRY', 'PENDING', 'IYZICO', v_comm_amt, 0, v_prov_amt, v_comm->>'model',
    CASE WHEN p_provider_type = 'GK' THEN 'GK_SERVICE' ELSE 'REF_SERVICE' END) RETURNING * INTO v_intent;

  v_far_h   := public.get_config_number('service_ttl_far_hours', 4);
  v_near_m  := public.get_config_number('service_ttl_near_minutes', 60);
  v_floor_m := public.get_config_number('service_ttl_floor_minutes', 30);
  IF v_match.starts_at IS NULL THEN
    v_expires := now() + make_interval(hours => v_far_h::int);
  ELSIF v_match.starts_at - now() > interval '24 hours' THEN
    v_expires := LEAST(now() + make_interval(hours => v_far_h::int),
                       v_match.starts_at - make_interval(mins => v_floor_m::int));
  ELSE
    v_expires := LEAST(now() + make_interval(mins => v_near_m::int),
                       v_match.starts_at - make_interval(mins => v_floor_m::int));
  END IF;
  IF v_expires <= now() THEN v_expires := now() + interval '15 minutes'; END IF;

  INSERT INTO public.service_requests (match_id, provider_id, provider_type, requested_by, fee,
    commission_amount, provider_amount, payment_intent_id, expires_at)
  VALUES (p_match_id, p_provider_id, p_provider_type, v_uid, v_fee, v_comm_amt, v_prov_amt, v_intent.id, v_expires)
  RETURNING * INTO v_req;

  INSERT INTO public.notifications (user_id, title, body, type_key, match_id, deep_link)
  VALUES (p_provider_id,
          CASE WHEN p_provider_type = 'GK' THEN 'Yeni kaleci talebi 🧤' ELSE 'Yeni hakem talebi ⚖️' END,
          COALESCE(v_match.title, 'Bir maç') || ' için ' || v_fee || '₺ (net ' || v_prov_amt ||
          '₺) teklif var. Son yanıt: ' || to_char(v_expires AT TIME ZONE 'Europe/Istanbul', 'DD.MM HH24:MI'),
          'service_request_new', p_match_id, 'oyna://match/' || p_match_id);

  RETURN jsonb_build_object('request_id', v_req.id, 'intent_id', v_intent.id, 'status', 'PENDING',
    'fee', v_fee, 'commission', v_comm_amt, 'provider_amount', v_prov_amt,
    'expires_at', v_expires);
END; $function$;
