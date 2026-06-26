-- ==============================================================================
-- FAZ 5 — Düzeltmeler (adversarial denetim bulguları)
-- ------------------------------------------------------------------------------
-- KRİTİK 1: İptal/iade hizmet motorundan kopuktu → _void_services_on_match_cancel
--           + trigger (quorum-fail ve admin-cancel yollarını kapsar)
-- KRİTİK 2: capture_service_request authenticated'a açıktı → service_role'e kapat;
--           onay sonrası ekleme respond içinde güvenli (SECURITY DEFINER) tahsil
-- YÜKSEK 3: create_service_request TOCTOU yarışı → advisory lock
-- YÜKSEK 4: submit_service_rating self-rating ile payout açma → rater≠provider
-- ORTA  5: submit_provider_identity TC/isim değişince VERIFIED kalıyordu → PENDING
-- ORTA  6: request_payout TC kapısı yalnız skaler role → roles[] da kontrol
-- ORTA  7: find_providers_for_match kaptan/sahip kontrolü eklendi
-- ORTA  8: report_service_attendance expires_at hack'i → reported_at kolonu
-- ==============================================================================

-- ── 8. dispute işaretleyici kolon (expires_at hack'i yerine) ──────────────────
ALTER TABLE public.service_requests ADD COLUMN IF NOT EXISTS reported_at timestamptz;

-- ── KRİTİK 1: maç iptalinde hizmetleri void/iade et ──────────────────────────
CREATE OR REPLACE FUNCTION public._void_services_on_match_cancel(p_match_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT * FROM public.service_requests
    WHERE match_id = p_match_id AND status IN ('PENDING','ACCEPTED','CAPTURED')
      AND payout_released = false
    FOR UPDATE
  LOOP
    IF r.payment_intent_id IS NOT NULL THEN
      IF r.status = 'CAPTURED' THEN
        -- Tahsil edilmişti → iade + sağlayıcının beklemedeki kazancını geri al
        UPDATE public.payment_intents SET status = 'REFUNDED', void_reason = 'MATCH_CANCELLED'
        WHERE id = r.payment_intent_id AND status = 'CAPTURED';
        UPDATE public.wallet_transactions SET status = 'CANCELLED'
        WHERE type = 'SERVICE_EARNING' AND status = 'PENDING' AND reference_id = r.payment_intent_id;
      ELSE
        -- Henüz tahsil edilmemiş → blokajı serbest bırak
        UPDATE public.payment_intents SET status = 'VOIDED', voided_at = now(), void_reason = 'MATCH_CANCELLED'
        WHERE id = r.payment_intent_id AND status IN ('PENDING','BLOCKED');
      END IF;
    END IF;

    UPDATE public.service_requests SET status = 'CANCELLED', cancelled_at = now() WHERE id = r.id;

    -- Maça atanan sağlayıcıyı temizle
    IF r.provider_type = 'GK' THEN
      UPDATE public.matches SET gk_id = NULL WHERE id = p_match_id AND gk_id = r.provider_id;
    ELSE
      UPDATE public.matches SET "refereeId" = NULL WHERE id = p_match_id AND "refereeId" = r.provider_id;
    END IF;
  END LOOP;
END; $$;
REVOKE ALL ON FUNCTION public._void_services_on_match_cancel(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._void_services_on_match_cancel(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public._void_services_on_cancel()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.status = 'CANCELLED' AND COALESCE(OLD.status,'') IS DISTINCT FROM 'CANCELLED' THEN
    PERFORM public._void_services_on_match_cancel(NEW.id);
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public._void_services_on_cancel() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_void_services_on_cancel ON public.matches;
CREATE TRIGGER trg_void_services_on_cancel
  AFTER UPDATE OF status ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public._void_services_on_cancel();

-- ── KRİTİK 2: capture_service_request yalnız service_role ─────────────────────
REVOKE EXECUTE ON FUNCTION public.capture_service_request(uuid) FROM authenticated;

-- ── YÜKSEK 3: create_service_request — advisory lock (TOCTOU) ─────────────────
CREATE OR REPLACE FUNCTION public.create_service_request(p_match_id uuid, p_provider_id uuid, p_provider_type text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := auth.uid(); v_match RECORD; v_fee numeric; v_scope text; v_comm jsonb;
  v_prov_amt numeric; v_comm_amt numeric; v_intent public.payment_intents; v_req public.service_requests; v_expiry numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_provider_type NOT IN ('GK','REF') THEN RAISE EXCEPTION 'INVALID_TYPE'; END IF;
  -- Aynı sağlayıcı için eşzamanlı talepleri serialize et (çakışma yarışını önler)
  PERFORM pg_advisory_xact_lock(hashtext('svc_provider:' || p_provider_id::text));
  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_match."creatorId" IS DISTINCT FROM v_uid AND v_match.captain_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'FORBIDDEN: Yalniz mac sahibi/kaptan hizmet talep edebilir.'; END IF;
  IF v_match.status IN ('CANCELLED','COMPLETED') THEN RAISE EXCEPTION 'INVALID_MATCH_STATE: Mac % durumunda.', v_match.status; END IF;
  IF p_provider_type = 'GK' THEN
    SELECT g.fee INTO v_fee FROM public.goalkeepers g JOIN public.profiles p ON p.id = g.id
    WHERE g.id = p_provider_id AND p.verification_status = 'approved'; v_scope := 'SERVICE_GK';
  ELSE
    SELECT r.fee INTO v_fee FROM public.referees r JOIN public.profiles p ON p.id = r.id
    WHERE r.id = p_provider_id AND p.verification_status = 'approved'; v_scope := 'SERVICE_REF';
  END IF;
  IF v_fee IS NULL THEN RAISE EXCEPTION 'PROVIDER_UNAVAILABLE: Onayli saglayici bulunamadi.'; END IF;
  IF public._provider_has_conflict(p_provider_id, v_match.starts_at, p_match_id) THEN
    RAISE EXCEPTION 'PROVIDER_CONFLICT: Saglayicinin bu saatte baska bir maci var.'; END IF;
  v_comm := public.calculate_commission(v_fee, v_scope);
  v_comm_amt := (v_comm->>'commission_amt')::numeric; v_prov_amt := (v_comm->>'net_amount')::numeric;
  INSERT INTO public.payment_intents (user_id, match_id, amount, currency, status, provider,
    commission_amount, owner_amount, service_provider_amount, commission_model, related_entity_type)
  VALUES (v_uid, p_match_id, v_fee, 'TRY', 'PENDING', 'IYZICO', v_comm_amt, 0, v_prov_amt, v_comm->>'model',
    CASE WHEN p_provider_type = 'GK' THEN 'GK_SERVICE' ELSE 'REF_SERVICE' END) RETURNING * INTO v_intent;
  SELECT COALESCE(service_request_expiry_hours, 24) INTO v_expiry FROM public.settings ORDER BY 1 LIMIT 1;
  INSERT INTO public.service_requests (match_id, provider_id, provider_type, requested_by, fee,
    commission_amount, provider_amount, payment_intent_id, expires_at)
  VALUES (p_match_id, p_provider_id, p_provider_type, v_uid, v_fee, v_comm_amt, v_prov_amt, v_intent.id,
    now() + make_interval(hours => COALESCE(v_expiry,24)::int)) RETURNING * INTO v_req;
  RETURN jsonb_build_object('request_id', v_req.id, 'intent_id', v_intent.id, 'status', 'PENDING',
    'fee', v_fee, 'commission', v_comm_amt, 'provider_amount', v_prov_amt);
END; $$;
REVOKE ALL ON FUNCTION public.create_service_request(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_service_request(uuid, uuid, text) TO authenticated;

-- ── KRİTİK 2 (devamı): respond_service_request — onay sonrası güvenli tahsil ──
CREATE OR REPLACE FUNCTION public.respond_service_request(p_request_id uuid, p_accept boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := auth.uid(); v_req public.service_requests; v_match_status text;
BEGIN
  SELECT * INTO v_req FROM public.service_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_req.provider_id IS DISTINCT FROM v_uid AND NOT public.is_platform_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF v_req.status <> 'PENDING' THEN RAISE EXCEPTION 'INVALID_STATE: Talep % durumunda.', v_req.status; END IF;
  IF p_accept THEN
    UPDATE public.service_requests SET status = 'ACCEPTED', accepted_at = now() WHERE id = p_request_id;
    -- Maç ZATEN onaylıysa (onay sonrası ekleme): anında tahsil et (SECURITY DEFINER → yetkili)
    SELECT status INTO v_match_status FROM public.matches WHERE id = v_req.match_id;
    IF v_match_status IN ('CONFIRMED','LIVE') THEN
      PERFORM public.capture_service_request(p_request_id);
      RETURN jsonb_build_object('request_id', p_request_id, 'status', 'CAPTURED');
    END IF;
    RETURN jsonb_build_object('request_id', p_request_id, 'status', 'ACCEPTED');
  ELSE
    UPDATE public.service_requests SET status = 'REJECTED', cancelled_at = now() WHERE id = p_request_id;
    IF v_req.payment_intent_id IS NOT NULL THEN PERFORM public.void_preauth(v_req.payment_intent_id, 'SERVICE_REJECTED'); END IF;
    RETURN jsonb_build_object('request_id', p_request_id, 'status', 'REJECTED');
  END IF;
END; $$;
REVOKE ALL ON FUNCTION public.respond_service_request(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_service_request(uuid, boolean) TO authenticated;

-- ── YÜKSEK 4: submit_service_rating — sağlayıcı kendini puanlayıp payout açamaz ─
CREATE OR REPLACE FUNCTION public.submit_service_rating(p_match_id uuid, p_provider_id uuid, p_provider_type text, p_score integer, p_comment text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_provider_type NOT IN ('GK','REF') THEN RAISE EXCEPTION 'INVALID_TYPE'; END IF;
  IF v_uid = p_provider_id THEN RAISE EXCEPTION 'CANNOT_RATE_SELF: Saglayici kendini puanlayamaz.'; END IF;
  IF NOT public._is_match_participant(p_match_id, v_uid) AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'NOT_PARTICIPANT: Yalniz maca katilanlar degerlendirebilir.'; END IF;
  INSERT INTO public.service_ratings (match_id, provider_id, provider_type, rater_id, score, comment)
  VALUES (p_match_id, p_provider_id, p_provider_type, v_uid, LEAST(10, GREATEST(1, p_score)), p_comment)
  ON CONFLICT (match_id, provider_id, rater_id) DO UPDATE SET score = EXCLUDED.score, comment = EXCLUDED.comment;
  PERFORM public._recompute_provider_rating(p_provider_id, p_provider_type);
  PERFORM public._release_service_payout(p_match_id, p_provider_id);
  RETURN jsonb_build_object('match_id', p_match_id, 'provider_id', p_provider_id, 'score', p_score);
END; $$;
REVOKE ALL ON FUNCTION public.submit_service_rating(uuid, uuid, text, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_service_rating(uuid, uuid, text, integer, text) TO authenticated;

-- ── ORTA 5: submit_provider_identity — TC/isim değişince yeniden doğrulama ────
CREATE OR REPLACE FUNCTION public.submit_provider_identity(p_tc_no text, p_full_name text, p_birth_year integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := auth.uid(); v_hash text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_tc_no IS NULL OR p_tc_no !~ '^[1-9][0-9]{10}$' THEN RAISE EXCEPTION 'INVALID_TC: Gecerli bir 11 haneli TC kimlik no girin.'; END IF;
  IF p_full_name IS NULL OR length(trim(p_full_name)) < 3 THEN RAISE EXCEPTION 'NAME_REQUIRED'; END IF;
  v_hash := encode(extensions.digest(p_tc_no, 'sha256'), 'hex');
  INSERT INTO public.provider_identities (user_id, tc_no_hash, full_name, birth_year, status)
  VALUES (v_uid, v_hash, trim(p_full_name), p_birth_year, 'PENDING')
  ON CONFLICT (user_id) DO UPDATE SET tc_no_hash = EXCLUDED.tc_no_hash, full_name = EXCLUDED.full_name, birth_year = EXCLUDED.birth_year,
    -- Yalnız hem TC hem isim aynıysa VERIFIED korunur; değişirse yeniden PENDING
    status = CASE WHEN public.provider_identities.status = 'VERIFIED'
                   AND public.provider_identities.tc_no_hash = EXCLUDED.tc_no_hash
                   AND public.provider_identities.full_name = EXCLUDED.full_name
                  THEN 'VERIFIED' ELSE 'PENDING' END,
    updated_at = now();
  RETURN jsonb_build_object('user_id', v_uid, 'status', 'PENDING');
END; $$;
REVOKE ALL ON FUNCTION public.submit_provider_identity(text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_provider_identity(text, text, integer) TO authenticated;

-- ── ORTA 6: request_payout — TC kapısı roles[] dizisini de kontrol etsin ─────
CREATE OR REPLACE FUNCTION public.request_payout(p_amount numeric, p_iban text, p_iban_holder_name text, p_payout_type text DEFAULT 'MANUAL')
RETURNS public.payout_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := auth.uid(); v_balance numeric; v_wallet jsonb; v_payout public.payout_requests;
  v_role text; v_roles jsonb; v_idstat text; v_is_provider boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT: Tutar sifirdan buyuk olmali.'; END IF;
  IF p_iban IS NULL OR length(trim(p_iban)) < 10 THEN RAISE EXCEPTION 'INVALID_IBAN'; END IF;
  SELECT role, roles INTO v_role, v_roles FROM public.profiles WHERE id = v_uid;
  v_is_provider := v_role IN ('GOALKEEPER','REFEREE')
                   OR (v_roles ? 'GOALKEEPER') OR (v_roles ? 'REFEREE');
  IF v_is_provider THEN
    SELECT status INTO v_idstat FROM public.provider_identities WHERE user_id = v_uid;
    IF v_idstat IS DISTINCT FROM 'VERIFIED' THEN RAISE EXCEPTION 'IDENTITY_REQUIRED: Odeme almadan once TC kimlik dogrulamasi gerekli.'; END IF;
  END IF;
  v_wallet := public.get_wallet_summary(); v_balance := (v_wallet->>'earnings_balance')::numeric;
  IF v_balance < p_amount THEN RAISE EXCEPTION 'INSUFFICIENT_BALANCE: Bakiye yetersiz. Mevcut: %', v_balance; END IF;
  IF EXISTS (SELECT 1 FROM public.payout_requests WHERE user_id = v_uid AND status = 'PENDING') THEN
    RAISE EXCEPTION 'PENDING_PAYOUT: Bekleyen odeme talebiniz mevcut.'; END IF;
  INSERT INTO public.payout_requests (user_id, amount, iban, iban_holder_name, payout_type)
  VALUES (v_uid, p_amount, p_iban, p_iban_holder_name, p_payout_type) RETURNING * INTO v_payout;
  INSERT INTO public.wallet_transactions (user_id, amount, type, balance_type, status, reference_type, reference_id, description)
  VALUES (v_uid, p_amount, 'WITHDRAWAL', 'EARNINGS', 'PENDING', 'PAYOUT', v_payout.id, 'IBAN odeme talebi');
  RETURN v_payout;
END; $$;
REVOKE ALL ON FUNCTION public.request_payout(numeric, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_payout(numeric, text, text, text) TO authenticated;

-- ── ORTA 7: find_providers_for_match — maç sahibi/kaptan kontrolü ────────────
CREATE OR REPLACE FUNCTION public.find_providers_for_match(p_match_id uuid, p_provider_type text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := auth.uid(); v_match RECORD; v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_provider_type NOT IN ('GK','REF') THEN RAISE EXCEPTION 'INVALID_TYPE'; END IF;
  SELECT id, starts_at, status, "creatorId", captain_id INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_match."creatorId" IS DISTINCT FROM v_uid AND v_match.captain_id IS DISTINCT FROM v_uid AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Yalniz mac sahibi/kaptan saglayici arayabilir.'; END IF;
  IF p_provider_type = 'GK' THEN
    SELECT jsonb_agg(row_to_json(t) ORDER BY t.rating DESC, t.match_count DESC, t.fee ASC) INTO v_result FROM (
      SELECT g.id, g.name, g.avatar, g.rating, g.fee, g."matchCount" AS match_count, g.style,
             g."preferredZones" AS preferred_zones, g.coordinates, g."isElite" AS is_elite
      FROM public.goalkeepers g JOIN public.profiles p ON p.id = g.id
      WHERE p.verification_status = 'approved' AND COALESCE(p.is_available, true) = true AND COALESCE(g."isDemo", false) = false
        AND NOT public._provider_has_conflict(g.id, v_match.starts_at, p_match_id)) t;
  ELSE
    SELECT jsonb_agg(row_to_json(t) ORDER BY t.rating DESC, t.match_count DESC, t.fee ASC) INTO v_result FROM (
      SELECT r.id, r.name, r.avatar, r.rating, r.fee, r."matchCount" AS match_count, r.level, r.style,
             r."preferredZones" AS preferred_zones, r.coordinates, r."isElite" AS is_elite
      FROM public.referees r JOIN public.profiles p ON p.id = r.id
      WHERE p.verification_status = 'approved' AND COALESCE(p.is_available, true) = true AND COALESCE(r."isDemo", false) = false
        AND NOT public._provider_has_conflict(r.id, v_match.starts_at, p_match_id)) t;
  END IF;
  RETURN COALESCE(v_result, '[]'::jsonb);
END; $$;
REVOKE ALL ON FUNCTION public.find_providers_for_match(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_providers_for_match(uuid, text) TO authenticated;

-- ── ORTA 8: report_service_attendance — reported_at kullan (expires_at değil) ─
CREATE OR REPLACE FUNCTION public.report_service_attendance(p_request_id uuid, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := auth.uid(); v_req public.service_requests;
BEGIN
  SELECT * INTO v_req FROM public.service_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_req.provider_id IS DISTINCT FROM v_uid THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF v_req.status <> 'CAPTURED' THEN RAISE EXCEPTION 'INVALID_STATE: Yalniz tahsil edilmis ve odenmemis talep bildirilebilir.'; END IF;
  UPDATE public.service_requests SET reported_at = now() WHERE id = p_request_id;
  RETURN jsonb_build_object('request_id', p_request_id, 'status', 'REPORTED', 'message', 'Talebiniz admin operasyon ekibine iletildi.');
END; $$;
REVOKE ALL ON FUNCTION public.report_service_attendance(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_service_attendance(uuid, text) TO authenticated;

-- ── KRİTİK (entegrasyon testi bulgusu): otomatik rating güncellemesi engelleniyordu ─
-- protect_provider_sensitive_fields trigger'ı goalkeepers/referees.rating değişimini
-- yalnız admin'e izin veriyor; katılımcı puanı sonrası _recompute_provider_rating
-- (SECURITY DEFINER ama auth.uid()=katılımcı) takılıp tüm submit_service_rating'i
-- çökertiyordu. Transaction-local GUC bayrağı ile yalnız bu yola izin ver.
CREATE OR REPLACE FUNCTION public.protect_provider_sensitive_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.is_platform_admin()
     AND current_setting('app.rating_recompute', true) IS DISTINCT FROM 'true' THEN
    IF COALESCE(NEW."isElite", false) <> COALESCE(OLD."isElite", false)
       OR COALESCE(NEW.rating, 0) <> COALESCE(OLD.rating, 0) THEN
      RAISE EXCEPTION 'UNAUTHORIZED: Elite statüsü ve rating sadece yöneticiler tarafından güncellenebilir.';
    END IF;
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public._recompute_provider_rating(p_provider_id uuid, p_provider_type text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_avg numeric;
BEGIN
  SELECT round(avg(score)::numeric, 2) INTO v_avg FROM public.service_ratings WHERE provider_id = p_provider_id;
  IF v_avg IS NULL THEN RETURN; END IF;
  PERFORM set_config('app.rating_recompute', 'true', true);   -- yalnız bu işlem için trigger bypass
  IF p_provider_type = 'GK' THEN UPDATE public.goalkeepers SET rating = v_avg WHERE id = p_provider_id;
  ELSE UPDATE public.referees SET rating = v_avg WHERE id = p_provider_id; END IF;
  PERFORM set_config('app.rating_recompute', 'false', true);
END; $$;
REVOKE ALL ON FUNCTION public._recompute_provider_rating(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._recompute_provider_rating(uuid, text) TO authenticated, service_role;
