-- ============================================================
-- F1.5 — Kabul anı kapıları: süresi dolmuş talep/teklif + çakışma
-- ============================================================
-- Tespit (canlı gövdelerden, 2026-07-27):
--  * respond_service_request: NE expires_at NE çakışma kontrolü vardı
--    (3 kabul yolundan tek eksik olan buydu).
--  * accept_provider_application: çakışma VAR, expires_at YOK.
--  * respond_match_service_offer: çakışma VAR, expires_at YOK — ve
--    match_service_offers için HİÇBİR süpürücü yoktu: süresi dolan teklif
--    sonsuza dek PENDING kalıyor, bildirim linkinden kabul edilebiliyordu.
--  * expire_service_requests: PENDING+APPLIED taleplerini süpürüyor (5 dk
--    cron); teklifler için üçüncü döngü bu dosyada eklendi (yeni cron YOK,
--    mevcut job'a biner).
-- Tüm gövdeler canlıdan birebir alınıp yalnız işaretli bloklar eklendi.

-- ------------------------------------------------------------
-- 1) respond_service_request — süre + çakışma kapısı (kabul dalında)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.respond_service_request(p_request_id uuid, p_accept boolean, p_contract_accepted boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_req public.service_requests; v_match_status text; v_name text; v_result jsonb;
  v_funded boolean; v_min numeric; v_bal numeric; v_starts timestamptz;
BEGIN
  SELECT * INTO v_req FROM public.service_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_req.provider_id IS DISTINCT FROM v_uid AND NOT public.is_platform_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF v_req.status <> 'PENDING' THEN RAISE EXCEPTION 'INVALID_STATE: Talep % durumunda.', v_req.status; END IF;
  SELECT COALESCE(name, full_name, 'Saglayici') INTO v_name FROM public.profiles WHERE id = v_req.provider_id;
  IF p_accept THEN
    -- F1.5: süresi dolmuş talep kabul edilemez (süpürücüyle 5 dk'lık yarış penceresi kapanır)
    IF v_req.expires_at IS NOT NULL AND now() > v_req.expires_at THEN
      RAISE EXCEPTION 'REQUEST_EXPIRED: Bu talebin süresi doldu.';
    END IF;
    -- F1.5: kabul ANINDA çakışma kontrolü (diğer iki kabul yoluyla eşitlendi)
    SELECT starts_at INTO v_starts FROM public.matches WHERE id = v_req.match_id;
    IF public._provider_has_conflict(v_req.provider_id, v_starts, v_req.match_id) THEN
      RAISE EXCEPTION 'PROVIDER_CONFLICT: Bu saatte başka bir maçın var.';
    END IF;
    SELECT (status IN ('BLOCKED','CAPTURED')) INTO v_funded FROM public.payment_intents WHERE id = v_req.payment_intent_id;
    IF NOT COALESCE(v_funded, false) THEN
      RAISE EXCEPTION 'AWAITING_PAYMENT: Kaptan odemeyi tamamlamadan talep kabul edilemez.';
    END IF;
    IF v_req.provider_type = 'GK' THEN
      IF NOT p_contract_accepted THEN
        RAISE EXCEPTION 'CONTRACT_REQUIRED: Hizmet sozlesmesini onaylamalisiniz.';
      END IF;
      v_min := public.get_config_number('gk_min_balance', 500);
      SELECT (topup_balance + refund_credit_balance) INTO v_bal FROM public._wallet_bucket_balances(v_uid);
      IF COALESCE(v_bal,0) < v_min THEN
        RAISE EXCEPTION 'INSUFFICIENT_GUARANTEE: Hesabinizda en az % TL bakiye olmali (no-show teminati). Mevcut: % TL.', v_min, COALESCE(v_bal,0);
      END IF;
    END IF;
    UPDATE public.service_requests SET status = 'ACCEPTED', accepted_at = now(), contract_accepted = COALESCE(p_contract_accepted, contract_accepted) WHERE id = p_request_id;
    SELECT status INTO v_match_status FROM public.matches WHERE id = v_req.match_id;
    IF v_match_status IN ('CONFIRMED','LIVE') THEN
      PERFORM public.capture_service_request(p_request_id);
      v_result := jsonb_build_object('request_id', p_request_id, 'status', 'CAPTURED');
    ELSE
      v_result := jsonb_build_object('request_id', p_request_id, 'status', 'ACCEPTED');
    END IF;
    INSERT INTO public.notifications (user_id, title, body, type_key, match_id, deep_link)
    VALUES (v_req.requested_by, 'Talebin kabul edildi', v_name || ' macin icin talebini kabul etti.',
            'service_request_accepted', v_req.match_id, 'oyna://match/' || v_req.match_id);
    RETURN v_result;
  ELSE
    UPDATE public.service_requests SET status = 'REJECTED', cancelled_at = now() WHERE id = p_request_id;
    PERFORM public._refund_service_captain(v_req);
    IF v_req.payment_intent_id IS NOT NULL THEN
      UPDATE public.payment_intents SET status = 'VOIDED', voided_at = now(), void_reason = 'SERVICE_REJECTED'
      WHERE id = v_req.payment_intent_id AND status IN ('PENDING','BLOCKED');
    END IF;
    INSERT INTO public.notifications (user_id, title, body, type_key, match_id, deep_link)
    VALUES (v_req.requested_by, 'Talebin reddedildi',
            v_name || ' talebini reddetti. Odemen iade edildi.', 'service_request_rejected', v_req.match_id, 'oyna://match/' || v_req.match_id);
    RETURN jsonb_build_object('request_id', p_request_id, 'status', 'REJECTED');
  END IF;
END; $function$;

-- ------------------------------------------------------------
-- 2) accept_provider_application — süre kapısı (çakışma zaten vardı)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_provider_application(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_req    public.service_requests;
  v_match  RECORD;
  v_side   text;
  v_other  text;
  v_comm   jsonb;
  v_intent public.payment_intents;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT * INTO v_req FROM public.service_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_req.status <> 'APPLIED' OR v_req.initiated_by <> 'PROVIDER' THEN
    RAISE EXCEPTION 'INVALID_STATE: Başvuru % durumunda.', v_req.status;
  END IF;
  -- F1.5: süresi dolmuş başvuru kabul edilemez
  IF v_req.expires_at IS NOT NULL AND now() > v_req.expires_at THEN
    RAISE EXCEPTION 'REQUEST_EXPIRED: Başvurunun süresi dolmuş; sağlayıcıdan yeni başvuru gerekir.';
  END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = v_req.match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  v_side := public._hire_side_for(v_req.match_id, v_uid);
  IF v_req.provider_type = 'REF' THEN v_side := 'HOME'; END IF;
  IF v_side IS NULL THEN
    IF public.is_platform_admin() THEN v_side := 'HOME';
    ELSE RAISE EXCEPTION 'FORBIDDEN: Yalnız maç sahibi/kaptan kabul edebilir.';
    END IF;
  END IF;

  IF v_match.status IN ('CANCELLED','COMPLETED') THEN
    RAISE EXCEPTION 'INVALID_MATCH_STATE';
  END IF;

  IF v_req.provider_type = 'GK' THEN
    IF public._gk_side_taken(v_req.match_id, v_side) THEN
      RAISE EXCEPTION 'SLOT_FILLED: Bu tarafın kalecisi zaten atanmış.';
    END IF;
  ELSE
    IF v_match."refereeId" IS NOT NULL THEN
      RAISE EXCEPTION 'SLOT_FILLED: Hakem zaten atanmış.';
    END IF;
  END IF;
  IF public._provider_has_conflict(v_req.provider_id, v_match.starts_at, v_req.match_id) THEN
    RAISE EXCEPTION 'PROVIDER_CONFLICT: Sağlayıcının bu saatte başka maçı var.';
  END IF;

  v_comm := public.calculate_commission(v_req.fee,
              CASE WHEN v_req.provider_type='GK' THEN 'SERVICE_GK' ELSE 'SERVICE_REF' END);
  INSERT INTO public.payment_intents (
    user_id, match_id, amount, currency, status, provider,
    commission_amount, owner_amount, service_provider_amount,
    commission_model, related_entity_type
  ) VALUES (
    v_uid, v_req.match_id, v_req.fee, 'TRY', 'PENDING', 'IYZICO',
    v_req.commission_amount, 0, v_req.provider_amount,
    v_comm->>'model',
    CASE WHEN v_req.provider_type='GK' THEN 'GK_SERVICE' ELSE 'REF_SERVICE' END
  )
  RETURNING * INTO v_intent;

  UPDATE public.service_requests
    SET status = 'ACCEPTED', accepted_at = now(), payment_intent_id = v_intent.id,
        team_side = v_side, requested_by = v_uid
    WHERE id = p_request_id;

  v_other := CASE WHEN v_side = 'AWAY' THEN 'HOME' ELSE 'AWAY' END;
  IF v_req.provider_type = 'REF' OR public._gk_side_taken(v_req.match_id, v_other) THEN
    UPDATE public.service_requests
      SET status = 'REJECTED', cancelled_at = now()
      WHERE match_id = v_req.match_id AND provider_type = v_req.provider_type
        AND id <> p_request_id AND status = 'APPLIED';
  END IF;

  INSERT INTO public.notifications (user_id, title, body, type_key, match_id)
  VALUES (v_req.provider_id, 'Başvurun kabul edildi',
    'Maç kesinleştiğinde ücretin cüzdanına işlenecek.', 'service_request_accepted', v_req.match_id);

  RETURN jsonb_build_object('request_id', p_request_id, 'status', 'ACCEPTED',
    'intent_id', v_intent.id, 'fee', v_req.fee, 'team_side', v_side);
END;
$function$;

-- ------------------------------------------------------------
-- 3) respond_match_service_offer — teklif süre kapısı
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.respond_match_service_offer(p_offer_id uuid, p_accept boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_offer public.match_service_offers;
  v_match RECORD;
  v_fee numeric; v_scope text; v_comm jsonb; v_comm_amt numeric; v_prov_amt numeric;
  v_intent public.payment_intents; v_req public.service_requests;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT * INTO v_offer FROM public.match_service_offers WHERE id = p_offer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_offer.provider_id IS DISTINCT FROM v_uid AND NOT public.is_platform_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF v_offer.status <> 'PENDING' THEN RAISE EXCEPTION 'INVALID_STATE: Teklif % durumunda.', v_offer.status; END IF;
  -- F1.5: süresi dolmuş teklif kabul/red edilemez; kayıt anında EXPIRED'a çekilir.
  -- (get_my_match_service_offers listesi zaten gizliyordu; RPC artık tutarlı.)
  IF v_offer.expires_at IS NOT NULL AND timezone('utc', now()) > v_offer.expires_at THEN
    UPDATE public.match_service_offers SET status = 'EXPIRED', responded_at = timezone('utc', now()) WHERE id = p_offer_id;
    RAISE EXCEPTION 'OFFER_EXPIRED: Teklifin süresi doldu.';
  END IF;

  IF NOT p_accept THEN
    UPDATE public.match_service_offers SET status = 'DECLINED', responded_at = timezone('utc', now()) WHERE id = p_offer_id;
    RETURN jsonb_build_object('ok', true, 'status', 'DECLINED');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('match_role:' || v_offer.match_id::text || ':' || v_offer.provider_type));

  SELECT * INTO v_match FROM public.matches WHERE id = v_offer.match_id;
  IF v_match.status IN ('CANCELLED','COMPLETED') THEN RAISE EXCEPTION 'INVALID_MATCH_STATE: Maç kapandı.'; END IF;
  IF EXISTS (SELECT 1 FROM public.service_requests
             WHERE match_id = v_offer.match_id AND provider_type = v_offer.provider_type
               AND status IN ('ACCEPTED','CAPTURED','COMPLETED')) THEN
    UPDATE public.match_service_offers SET status = 'EXPIRED', responded_at = timezone('utc', now()) WHERE id = p_offer_id;
    RETURN jsonb_build_object('ok', false, 'reason', 'ROLE_ALREADY_FILLED');
  END IF;
  IF public._provider_has_conflict(v_offer.provider_id, v_match.starts_at, v_offer.match_id) THEN
    RAISE EXCEPTION 'PROVIDER_CONFLICT: Bu saatte başka bir maçın var.';
  END IF;

  v_fee := v_offer.fee;
  v_scope := CASE WHEN v_offer.provider_type = 'GK' THEN 'SERVICE_GK' ELSE 'SERVICE_REF' END;
  v_comm := public.calculate_commission(v_fee, v_scope);
  v_comm_amt := (v_comm->>'commission_amt')::numeric;
  v_prov_amt := (v_comm->>'net_amount')::numeric;

  INSERT INTO public.payment_intents (user_id, match_id, amount, currency, status, provider,
    commission_amount, owner_amount, service_provider_amount, commission_model, related_entity_type, blocked_at)
  VALUES (v_offer.captain_id, v_offer.match_id, v_fee, 'TRY', 'BLOCKED', 'IYZICO',
    v_comm_amt, 0, v_prov_amt, v_comm->>'model',
    CASE WHEN v_offer.provider_type = 'GK' THEN 'GK_SERVICE' ELSE 'REF_SERVICE' END, timezone('utc', now()))
  RETURNING * INTO v_intent;

  INSERT INTO public.service_requests (match_id, provider_id, provider_type, requested_by, fee,
    commission_amount, provider_amount, payment_intent_id, expires_at, status, accepted_at)
  VALUES (v_offer.match_id, v_offer.provider_id, v_offer.provider_type, v_offer.captain_id, v_fee,
    v_comm_amt, v_prov_amt, v_intent.id, timezone('utc', now()) + interval '1 day', 'ACCEPTED', timezone('utc', now()))
  RETURNING * INTO v_req;

  UPDATE public.match_service_offers SET status = 'ACCEPTED', responded_at = timezone('utc', now()) WHERE id = p_offer_id;

  UPDATE public.match_service_offers
    SET status = 'EXPIRED', responded_at = timezone('utc', now())
    WHERE match_id = v_offer.match_id AND provider_type = v_offer.provider_type AND status = 'PENDING' AND id <> p_offer_id;
  INSERT INTO public.notifications (user_id, title, body, type_key, match_id)
    SELECT provider_id,
           CASE WHEN v_offer.provider_type = 'GK' THEN 'Kaleci teklifi kapandı' ELSE 'Hakem teklifi kapandı' END,
           'Bu maçın rolü başka bir sağlayıcı tarafından üstlenildi.', 'service_offer_closed', v_offer.match_id
    FROM public.match_service_offers
    WHERE match_id = v_offer.match_id AND provider_type = v_offer.provider_type AND status = 'EXPIRED' AND id <> p_offer_id;

  INSERT INTO public.notifications (user_id, title, body, type_key, match_id, deep_link)
  VALUES (v_offer.captain_id,
    CASE WHEN v_offer.provider_type = 'GK' THEN 'Kaleci teklifini kabul etti 🧤' ELSE 'Hakem teklifini kabul etti ⚖️' END,
    'Sağlayıcı maçın için teklifi kabul etti; ücret bloke edildi.',
    'service_offer_accepted', v_offer.match_id, 'oyna://match/' || v_offer.match_id::text);

  RETURN jsonb_build_object('ok', true, 'status', 'ACCEPTED', 'request_id', v_req.id, 'fee', v_fee, 'provider_amount', v_prov_amt);
END; $function$;

-- ------------------------------------------------------------
-- 4) expire_service_requests — üçüncü döngü: match_service_offers
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expire_service_requests()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r RECORD; v_count int := 0;
BEGIN
  FOR r IN
    SELECT sr.*, m.title AS match_title
    FROM public.service_requests sr
    LEFT JOIN public.matches m ON m.id = sr.match_id
    WHERE sr.status = 'PENDING' AND sr.expires_at IS NOT NULL AND sr.expires_at < now()
    FOR UPDATE OF sr SKIP LOCKED
  LOOP
    UPDATE public.service_requests SET status = 'EXPIRED', cancelled_at = now() WHERE id = r.id;
    IF r.payment_intent_id IS NOT NULL THEN
      UPDATE public.payment_intents
      SET status = 'VOIDED', voided_at = now(), void_reason = 'SERVICE_EXPIRED'
      WHERE id = r.payment_intent_id AND status IN ('PENDING','BLOCKED');
    END IF;
    INSERT INTO public.notifications (user_id, title, body, type_key, match_id, deep_link)
    VALUES (r.requested_by, 'Talep yanıtsız kaldı ⏳',
            COALESCE(r.match_title,'Maçın') || ' için gönderdiğin ' ||
            CASE WHEN r.provider_type = 'GK' THEN 'kaleci' ELSE 'hakem' END ||
            ' talebi süresi doldu. Blokajın iade edildi — sana uygun diğer sağlayıcılara göz at.',
            'service_request_expired', r.match_id, 'oyna://match/' || r.match_id);
    INSERT INTO public.notifications (user_id, title, body, type_key, match_id, deep_link)
    VALUES (r.provider_id, 'Bir talebi kaçırdın',
            COALESCE(r.match_title,'Bir maç') || ' için gelen ' || r.fee ||
            '₺ tutarındaki talep yanıtlanmadığı için süresi doldu.',
            'service_request_expired', r.match_id, 'oyna://match/' || r.match_id);
    v_count := v_count + 1;
  END LOOP;

  FOR r IN
    SELECT sr.*, m.title AS match_title
    FROM public.service_requests sr
    LEFT JOIN public.matches m ON m.id = sr.match_id
    WHERE sr.status = 'APPLIED' AND sr.expires_at IS NOT NULL AND sr.expires_at < now()
    FOR UPDATE OF sr SKIP LOCKED
  LOOP
    UPDATE public.service_requests SET status = 'EXPIRED', cancelled_at = now() WHERE id = r.id;
    IF r.payment_intent_id IS NOT NULL THEN
      UPDATE public.payment_intents
      SET status = 'VOIDED', voided_at = now(), void_reason = 'SERVICE_EXPIRED'
      WHERE id = r.payment_intent_id AND status IN ('PENDING','BLOCKED');
    END IF;
    INSERT INTO public.notifications (user_id, title, body, type_key, match_id, deep_link)
    VALUES (r.provider_id, 'Başvurun zaman aşımına uğradı ⏳',
            COALESCE(r.match_title,'Bir maç') || ' için gönderdiğin başvuru yanıtsız kaldığı için süresi doldu.',
            'service_request_expired', r.match_id, 'oyna://match/' || r.match_id);
    v_count := v_count + 1;
  END LOOP;

  -- F1.5: kaptan çoklu teklifleri (match_service_offers) — daha önce hiçbir
  -- süpürücü bu tabloyu kapatmıyordu; süresi dolan teklif sonsuza dek PENDING
  -- kalıyordu. Kapanış bildirimi send_match_service_offers'ın açılış
  -- bildirimiyle simetrik.
  FOR r IN
    SELECT o.*, m.title AS match_title
    FROM public.match_service_offers o
    LEFT JOIN public.matches m ON m.id = o.match_id
    WHERE o.status = 'PENDING' AND o.expires_at IS NOT NULL AND o.expires_at < timezone('utc', now())
    FOR UPDATE OF o SKIP LOCKED
  LOOP
    UPDATE public.match_service_offers
      SET status = 'EXPIRED', responded_at = timezone('utc', now())
      WHERE id = r.id;
    INSERT INTO public.notifications (user_id, title, body, type_key, match_id, deep_link)
    VALUES (r.provider_id, 'Teklifin süresi doldu ⏳',
            COALESCE(r.match_title,'Bir maç') || ' için gelen teklif yanıtlanmadığı için kapandı.',
            'service_offer_expired', r.match_id, 'oyna://match/' || r.match_id);
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;
