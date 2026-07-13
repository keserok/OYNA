-- FAZ 4: Kaleci (ve hakem) ödeme & emanet sistemi.
-- Kaptan hizmet talebini CÜZDAN veya KART ile fonlar (emanete alınır); kaleci
-- ancak fonlanmış + hesabında ≥500₺ teminat + sözleşme onayı ile kabul eder.
-- Maç sonrası iki-taraflı onayla ödeme kaleciye serbest bırakılır. No-show'da
-- kaptan bildirir → kalecinin kazancı iptal + kaptan iadesi + ceza (maçın slot
-- ücreti) kalecinin teminatından kaptana; 48s içinde kaleci itiraz edebilir → admin.

-- ── M6: yapılandırma ────────────────────────────────────────────────────────
INSERT INTO public.app_config (key, value, value_type, category, label) VALUES
  ('gk_min_balance', to_jsonb(500), 'number', 'HIZMET', 'Kaleci No-show Teminatı (min bakiye, ₺)'),
  ('gk_noshow_dispute_hours', to_jsonb(48), 'number', 'HIZMET', 'No-show İtiraz Süresi (saat)'),
  ('gk_service_contract', to_jsonb(
    'OYNA Kaleci Hizmet Sözleşmesi: Kabul ettiğiniz maça ilan edilen saatte katılmayı taahhüt edersiniz. ' ||
    'Mazeretsiz katılmama (no-show) durumunda, ilgili maçın kaleci slot ücreti hesabınızdan otomatik tahsil edilir ' ||
    've maç kaptanına tazminat olarak aktarılır. Bu tahsilata karşı 48 saat içinde itiraz edebilirsiniz; itiraz halinde ' ||
    'durum OYNA yönetimi tarafından incelenir. Hizmet verebilmek için hesabınızda en az 500₺ bakiye bulundurmanız gerekir ' ||
    '(no-show teminatı); bu bakiye ceza tahsilatının güvencesidir.'), 'text', 'HIZMET', 'Kaleci Hizmet Sözleşmesi Metni')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- ── Ek kolonlar (fonlama, sözleşme, no-show/itiraz) ─────────────────────────
ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS funding_source text,
  ADD COLUMN IF NOT EXISTS contract_accepted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS captain_refunded boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dispute_deadline timestamptz,
  ADD COLUMN IF NOT EXISTS penalty_amount numeric;

-- No-show/itiraz durumlarını status CHECK'ine ekle.
ALTER TABLE public.service_requests DROP CONSTRAINT IF EXISTS service_requests_status_check;
ALTER TABLE public.service_requests ADD CONSTRAINT service_requests_status_check
  CHECK (status = ANY (ARRAY['APPLIED','PENDING','ACCEPTED','REJECTED','CAPTURED','COMPLETED','CANCELLED','EXPIRED','NOSHOW_REPORTED','DISPUTED','NOSHOW_FINALIZED']));

-- ── Yardımcı: kaptana emanet ücretini iade et (yalnız cüzdan-fonlu, bir kez) ──
CREATE OR REPLACE FUNCTION public._refund_service_captain(p_req public.service_requests)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
BEGIN
  IF p_req.captain_refunded THEN RETURN; END IF;
  IF COALESCE(p_req.funding_source,'') = 'WALLET' THEN
    INSERT INTO public.wallet_transactions
      (user_id, match_id, amount, type, balance_type, status, reference_type, reference_id, description)
    VALUES
      (p_req.requested_by, p_req.match_id, p_req.fee, 'REFUND', 'REFUND_CREDIT', 'COMPLETED',
       'REFUND', p_req.match_id, 'Hizmet iadesi (talep iptal/red/no-show)');
    PERFORM public._sync_wallet_mirror(p_req.requested_by);
  END IF;
  UPDATE public.service_requests SET captain_refunded = true WHERE id = p_req.id;
END; $function$;

-- ── M3: kaptan talebi fonlar (cüzdan tam / kart pre-auth) ───────────────────
CREATE OR REPLACE FUNCTION public.fund_service_request(p_request_id uuid, p_source text DEFAULT 'WALLET')
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_req public.service_requests; v_intent public.payment_intents;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_source NOT IN ('WALLET','CARD') THEN RAISE EXCEPTION 'INVALID_SOURCE'; END IF;
  SELECT * INTO v_req FROM public.service_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_req.requested_by IS DISTINCT FROM v_uid AND NOT public.is_platform_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF v_req.status <> 'PENDING' THEN RAISE EXCEPTION 'INVALID_STATE: Yalnız bekleyen talep fonlanır (mevcut: %).', v_req.status; END IF;
  SELECT * INTO v_intent FROM public.payment_intents WHERE id = v_req.payment_intent_id FOR UPDATE;
  IF v_intent.status = 'BLOCKED' THEN
    RETURN jsonb_build_object('request_id', p_request_id, 'status', 'ALREADY_FUNDED', 'source', v_req.funding_source);
  END IF;
  IF p_source = 'WALLET' THEN
    -- Cüzdan-tam ödeme: bakiyeden düş (emanete alınır). Yetersizse hata.
    PERFORM public.wallet_spend_balance(v_uid, v_req.fee, 'MATCH', v_req.match_id, v_req.match_id,
      'Kaleci/hakem hizmet ödemesi (emanet)');
  END IF;
  -- Kart: gerçek pre-auth istemci tarafında IYZICO ile yapılır; burada emanet işaretlenir.
  UPDATE public.payment_intents
    SET status = 'BLOCKED', provider = (CASE WHEN p_source = 'CARD' THEN 'IYZICO' ELSE 'WALLET' END)
    WHERE id = v_req.payment_intent_id;
  UPDATE public.service_requests SET funding_source = p_source WHERE id = p_request_id;
  RETURN jsonb_build_object('request_id', p_request_id, 'status', 'FUNDED', 'source', p_source, 'amount', v_req.fee);
END; $function$;

-- ── M4: sağlayıcı yanıtı — kabul için fonlama + (kaleci) 500₺ + sözleşme ────
-- Eski 2-argümanlı sürümü düşür (aksi halde overload; 2-arg çağrılar eskisine gider).
DROP FUNCTION IF EXISTS public.respond_service_request(uuid, boolean);
CREATE OR REPLACE FUNCTION public.respond_service_request(p_request_id uuid, p_accept boolean, p_contract_accepted boolean DEFAULT false)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_req public.service_requests; v_match_status text; v_name text; v_result jsonb;
  v_funded boolean; v_min numeric; v_bal numeric;
BEGIN
  SELECT * INTO v_req FROM public.service_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_req.provider_id IS DISTINCT FROM v_uid AND NOT public.is_platform_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF v_req.status <> 'PENDING' THEN RAISE EXCEPTION 'INVALID_STATE: Talep % durumunda.', v_req.status; END IF;

  SELECT COALESCE(name, full_name, 'Sağlayıcı') INTO v_name FROM public.profiles WHERE id = v_req.provider_id;

  IF p_accept THEN
    -- Fonlanmış mı? (kaptan ödemeyi tamamlamadan kabul edilemez)
    SELECT (status IN ('BLOCKED','CAPTURED')) INTO v_funded FROM public.payment_intents WHERE id = v_req.payment_intent_id;
    IF NOT COALESCE(v_funded, false) THEN
      RAISE EXCEPTION 'AWAITING_PAYMENT: Kaptan ödemeyi tamamlamadan talep kabul edilemez.';
    END IF;
    -- Kaleci: no-show teminatı (≥500₺) + sözleşme onayı zorunlu.
    IF v_req.provider_type = 'GK' THEN
      IF NOT p_contract_accepted THEN
        RAISE EXCEPTION 'CONTRACT_REQUIRED: Hizmet sözleşmesini onaylamalısınız.';
      END IF;
      v_min := public.get_config_number('gk_min_balance', 500);
      SELECT (topup_balance + refund_credit_balance) INTO v_bal FROM public._wallet_bucket_balances(v_uid);
      IF COALESCE(v_bal,0) < v_min THEN
        RAISE EXCEPTION 'INSUFFICIENT_GUARANTEE: Hizmet verebilmek için hesabınızda en az %₺ bakiye olmalı (no-show teminatı). Mevcut: %₺.', v_min, COALESCE(v_bal,0);
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
    VALUES (v_req.requested_by, 'Talebin kabul edildi 🎉',
            v_name || ' maçın için talebini kabul etti.',
            'service_request_accepted', v_req.match_id, 'oyna://match/' || v_req.match_id);
    RETURN v_result;
  ELSE
    UPDATE public.service_requests SET status = 'REJECTED', cancelled_at = now() WHERE id = p_request_id;
    -- Fonlanmışsa kaptana iade + blokajı serbest bırak.
    PERFORM public._refund_service_captain(v_req);
    IF v_req.payment_intent_id IS NOT NULL THEN
      UPDATE public.payment_intents
      SET status = 'VOIDED', voided_at = now(), void_reason = 'SERVICE_REJECTED'
      WHERE id = v_req.payment_intent_id AND status IN ('PENDING','BLOCKED');
    END IF;
    INSERT INTO public.notifications (user_id, title, body, type_key, match_id, deep_link)
    VALUES (v_req.requested_by, 'Talebin reddedildi',
            v_name || ' talebini reddetti. Ödemen iade edildi — başka bir sağlayıcı seçebilirsin.',
            'service_request_rejected', v_req.match_id, 'oyna://match/' || v_req.match_id);
    RETURN jsonb_build_object('request_id', p_request_id, 'status', 'REJECTED');
  END IF;
END; $function$;

-- ── İki-taraflı payout: her hizmet için hem kaptan hem sağlayıcı onayı ───────
CREATE OR REPLACE FUNCTION public._release_service_payout(p_match_id uuid, p_provider_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_req public.service_requests;
BEGIN
  SELECT * INTO v_req FROM public.service_requests
    WHERE match_id = p_match_id AND provider_id = p_provider_id AND status = 'CAPTURED' AND payout_released = false
    ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;
  -- İki-taraflı onay şart (kaleci geldi mi? hem kaptan hem kaleci onaylar).
  IF NOT (COALESCE(v_req.provider_confirmed,false) AND COALESCE(v_req.captain_confirmed,false)) THEN RETURN; END IF;
  UPDATE public.wallet_transactions SET status = 'COMPLETED'
    WHERE reference_id = v_req.payment_intent_id AND balance_type = 'EARNINGS' AND status = 'PENDING';
  PERFORM public._sync_wallet_mirror(v_req.provider_id);
  UPDATE public.service_requests SET status = 'COMPLETED', completed_at = now(), payout_released = true WHERE id = v_req.id;
END; $function$;

-- ── M5: kaptan no-show bildirir ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.captain_report_no_show(p_request_id uuid, p_note text DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_req public.service_requests; v_match RECORD;
  v_penalty numeric; v_hours numeric; v_charged boolean := false; v_gk_name text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT * INTO v_req FROM public.service_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  SELECT * INTO v_match FROM public.matches WHERE id = v_req.match_id;
  IF v_req.requested_by IS DISTINCT FROM v_uid AND v_match."creatorId" IS DISTINCT FROM v_uid
     AND v_match.captain_id IS DISTINCT FROM v_uid AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Yalnız maç kaptanı no-show bildirebilir.';
  END IF;
  IF v_req.status <> 'CAPTURED' THEN
    RAISE EXCEPTION 'INVALID_STATE: No-show yalnız tahsil edilmiş (aktif) hizmet için bildirilebilir (mevcut: %).', v_req.status;
  END IF;

  v_penalty := COALESCE(v_match.price, 0);
  v_hours := public.get_config_number('gk_noshow_dispute_hours', 48);
  SELECT COALESCE(name, full_name, 'Sağlayıcı') INTO v_gk_name FROM public.profiles WHERE id = v_req.provider_id;

  -- 1) Sağlayıcının bekleyen kazancını iptal et (hizmet verilmedi).
  UPDATE public.wallet_transactions SET status = 'CANCELLED'
    WHERE reference_id = v_req.payment_intent_id AND balance_type = 'EARNINGS' AND status = 'PENDING';
  PERFORM public._sync_wallet_mirror(v_req.provider_id);

  -- 2) Kaptana hizmet ücretini iade et (gelmeyen sağlayıcı için ödeme yapılmaz).
  PERFORM public._refund_service_captain(v_req);

  -- 3) Ceza = maçın slot ücreti → sağlayıcı teminatından kaptana (best-effort).
  IF v_penalty > 0 THEN
    BEGIN
      PERFORM public.wallet_spend_balance(v_req.provider_id, v_penalty, 'MATCH', v_req.match_id, v_req.match_id,
        'Kaleci no-show cezası (' || COALESCE(v_match.title,'maç') || ')');
      INSERT INTO public.wallet_transactions
        (user_id, match_id, amount, type, balance_type, status, reference_type, reference_id, description)
      VALUES
        (v_req.requested_by, v_req.match_id, v_penalty, 'MATCH_REFUND', 'REFUND_CREDIT', 'COMPLETED',
         'MATCH', v_req.match_id, 'No-show tazminatı (' || v_gk_name || ')');
      PERFORM public._sync_wallet_mirror(v_req.provider_id);
      PERFORM public._sync_wallet_mirror(v_req.requested_by);
      v_charged := true;
    EXCEPTION WHEN OTHERS THEN
      v_charged := false;  -- teminat yetersiz → admin takip eder (itiraz/çözüm akışı)
    END;
  END IF;

  UPDATE public.service_requests
    SET status = 'NOSHOW_REPORTED', reported_at = now(),
        dispute_deadline = now() + make_interval(hours => v_hours::int),
        penalty_amount = v_penalty, payout_released = true
    WHERE id = p_request_id;

  INSERT INTO public.notifications (user_id, title, body, type_key, match_id, deep_link)
  VALUES (v_req.provider_id, 'No-show bildirildi ⚠️',
          COALESCE(v_match.title,'Bir maç') || ' için katılmadığın bildirildi. Ceza: ' || v_penalty ||
          '₺. İtirazın için ' || v_hours || ' saatin var.',
          'service_noshow_reported', v_req.match_id, 'oyna://match/' || v_req.match_id);

  RETURN jsonb_build_object('request_id', p_request_id, 'status', 'NOSHOW_REPORTED',
    'penalty', v_penalty, 'penalty_charged', v_charged, 'dispute_deadline', now() + make_interval(hours => v_hours::int));
END; $function$;

-- ── M5: sağlayıcı itiraz eder (48s içinde) → admin incelemesine ─────────────
CREATE OR REPLACE FUNCTION public.provider_dispute_no_show(p_request_id uuid, p_note text DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_req public.service_requests;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT * INTO v_req FROM public.service_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_req.provider_id IS DISTINCT FROM v_uid THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF v_req.status <> 'NOSHOW_REPORTED' THEN RAISE EXCEPTION 'INVALID_STATE: İtiraz için no-show bildirimi bekleniyor.'; END IF;
  IF v_req.dispute_deadline IS NOT NULL AND now() > v_req.dispute_deadline THEN
    RAISE EXCEPTION 'DISPUTE_WINDOW_CLOSED: İtiraz süresi (48s) doldu.';
  END IF;
  UPDATE public.service_requests SET status = 'DISPUTED' WHERE id = p_request_id;
  INSERT INTO public.notifications (user_id, title, body, type_key, match_id, deep_link)
  VALUES (v_req.requested_by, 'No-show itirazı 📣',
          'Kaleci no-show cezasına itiraz etti. Durum OYNA yönetimi tarafından incelenecek.',
          'service_noshow_disputed', v_req.match_id, 'oyna://match/' || v_req.match_id);
  RETURN jsonb_build_object('request_id', p_request_id, 'status', 'DISPUTED');
END; $function$;

GRANT EXECUTE ON FUNCTION public.fund_service_request(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.captain_report_no_show(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.provider_dispute_no_show(uuid, text) TO authenticated;
