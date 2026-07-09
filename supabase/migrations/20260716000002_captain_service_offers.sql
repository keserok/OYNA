-- ════════════════════════════════════════════════════════════════════════════
-- KAPTAN → ÇOK SAĞLAYICI TEKLİF (offer) AKIŞI — escrow yalnız İLK KABULDE
-- ────────────────────────────────────────────────────────────────────────────
-- Amaç (kullanıcı isteği): kaptan maç oluştururken marketplace'ten BİRDEN ÇOK
-- kaleci/hakem seçer VEYA "tümüne gönder" der; "Kaporayı ödediğinde teklif
-- gönder" → kapora bloke edilince (match_block_deposit) teklifler GERÇEKTEN
-- gönderilir; sağlayıcılar teklifi görüp kabul/red eder; İLK KABUL eden işi alır
-- (FCFS). Para (escrow) sağlayıcı KABUL edene kadar bloke EDİLMEZ → çoklama yok.
--
-- Mevcut tek-sağlayıcı motoru (create_service_request) escrow'u ANINDA bloke ettiği
-- için çoklu-teklife uygun değildi; bu katman onun üstüne "önce teklif, kabulde
-- escrow" modeli ekler. Kabulde, create_service_request'in escrow'u BİREBİR
-- (kaptan adına) kurulur → sonuç ACCEPTED bir service_request (mevcut ödeme/payout
-- state machine'iyle tam uyumlu).
--
-- ⚠️ FIXME / TEST EDİLMEDİ: SIMULATION'da DB-tamam; gerçek iyzico ön-provizyonu
--   create-payment edge function'inda bağlanmalı. Supabase branching Pro
--   gerektirdiği için burada test EDİLEMEDİ — staging'de SIMULATION ile test edin.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 1) Tablo: match_service_offers (legacy 'service_offers' KULLANILMAZ) ────
CREATE TABLE IF NOT EXISTS public.match_service_offers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id      uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  captain_id    uuid NOT NULL,
  provider_id   uuid NOT NULL,
  provider_type text NOT NULL CHECK (provider_type IN ('GK','REF')),
  fee           numeric,
  status        text NOT NULL DEFAULT 'PENDING'
                  CHECK (status IN ('PENDING','ACCEPTED','DECLINED','EXPIRED','CANCELLED')),
  created_at    timestamptz NOT NULL DEFAULT timezone('utc', now()),
  responded_at  timestamptz,
  expires_at    timestamptz
);
CREATE INDEX IF NOT EXISTS idx_mso_provider_pending ON public.match_service_offers(provider_id) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_mso_match ON public.match_service_offers(match_id);
-- Aynı maç+sağlayıcı+tür için tek aktif teklif.
CREATE UNIQUE INDEX IF NOT EXISTS uq_mso_pending ON public.match_service_offers(match_id, provider_id, provider_type) WHERE status = 'PENDING';

ALTER TABLE public.match_service_offers ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='match_service_offers' AND policyname='mso_select_own') THEN
    CREATE POLICY mso_select_own ON public.match_service_offers FOR SELECT
      USING (provider_id = auth.uid() OR captain_id = auth.uid() OR public.is_platform_admin());
  END IF;
END $$;

-- ─── 2) send_match_service_offers — kaptan çok sağlayıcıya teklif yollar ────
-- provider_ids boş/null ise UYGUN OLAN TÜM sağlayıcılara (find_providers_for_match).
-- Escrow YOK; yalnız teklif kaydı + bildirim.
CREATE OR REPLACE FUNCTION public.send_match_service_offers(
  p_match_id uuid, p_provider_type text, p_provider_ids uuid[] DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_match RECORD;
  v_ids uuid[];
  v_pid uuid;
  v_fee numeric;
  v_sugg jsonb;
  v_sent int := 0;
  v_title text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_provider_type NOT IN ('GK','REF') THEN RAISE EXCEPTION 'INVALID_TYPE'; END IF;

  SELECT id, "creatorId", captain_id, title, status INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF COALESCE(v_match."creatorId", v_match.captain_id) IS DISTINCT FROM v_uid AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Yalnız maçı kuran kaptan teklif gönderebilir.';
  END IF;
  IF v_match.status IN ('CANCELLED','COMPLETED') THEN RAISE EXCEPTION 'INVALID_MATCH_STATE'; END IF;

  -- Rol zaten kabul edilmiş bir sağlayıcıyla dolduysa yeni teklif gönderme.
  IF EXISTS (SELECT 1 FROM public.service_requests
             WHERE match_id = p_match_id AND provider_type = p_provider_type
               AND status IN ('ACCEPTED','CAPTURED','COMPLETED')) THEN
    RETURN jsonb_build_object('ok', true, 'sent', 0, 'reason', 'ALREADY_FILLED');
  END IF;

  IF p_provider_ids IS NULL OR array_length(p_provider_ids, 1) IS NULL THEN
    -- "Tümüne gönder": uygun tüm sağlayıcıları öneriden çek.
    v_sugg := public.find_providers_for_match(p_match_id, p_provider_type);
    SELECT array_agg((e->>'id')::uuid) INTO v_ids FROM jsonb_array_elements(COALESCE(v_sugg,'[]'::jsonb)) e;
  ELSE
    v_ids := p_provider_ids;
  END IF;

  IF v_ids IS NULL THEN RETURN jsonb_build_object('ok', true, 'sent', 0, 'reason', 'NO_PROVIDERS'); END IF;
  v_title := CASE WHEN p_provider_type = 'GK' THEN 'Yeni kaleci teklifi 🧤' ELSE 'Yeni hakem teklifi ⚖️' END;

  FOREACH v_pid IN ARRAY v_ids LOOP
    BEGIN
      -- Zaten aktif teklif/talep varsa atla.
      IF EXISTS (SELECT 1 FROM public.match_service_offers
                 WHERE match_id = p_match_id AND provider_id = v_pid AND provider_type = p_provider_type AND status = 'PENDING')
         OR EXISTS (SELECT 1 FROM public.service_requests
                 WHERE match_id = p_match_id AND provider_id = v_pid AND provider_type = p_provider_type
                   AND status IN ('PENDING','ACCEPTED','CAPTURED')) THEN
        CONTINUE;
      END IF;

      IF p_provider_type = 'GK' THEN
        SELECT g.fee INTO v_fee FROM public.goalkeepers g JOIN public.profiles p ON p.id = g.id
          WHERE g.id = v_pid AND p.verification_status = 'approved';
      ELSE
        SELECT r.fee INTO v_fee FROM public.referees r JOIN public.profiles p ON p.id = r.id
          WHERE r.id = v_pid AND p.verification_status = 'approved';
      END IF;
      IF v_fee IS NULL THEN CONTINUE; END IF; -- onaysız/bulunamayan sağlayıcı

      INSERT INTO public.match_service_offers (match_id, captain_id, provider_id, provider_type, fee, expires_at)
      VALUES (p_match_id, v_uid, v_pid, p_provider_type, v_fee, timezone('utc', now()) + interval '24 hours');

      INSERT INTO public.notifications (user_id, title, body, type_key, match_id, deep_link, action_required)
      VALUES (v_pid, v_title,
              COALESCE(v_match.title, 'Bir maç') || ' için ' || v_fee || '₺ teklif. İlk kabul eden işi alır.',
              'service_offer_new', p_match_id, 'oyna://match/' || p_match_id::text, true);
      v_sent := v_sent + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Teklif gönderilemedi (provider %): %', v_pid, SQLERRM;
    END;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'sent', v_sent, 'type', p_provider_type);
END; $$;

-- ─── 3) respond_match_service_offer — sağlayıcı kabul/red (kabulde escrow) ───
-- Kabulde create_service_request escrow'u BİREBİR (kaptan adına) kurulur → ACCEPTED
-- service_request. Diğer bekleyen teklifler EXPIRE edilir (FCFS).
CREATE OR REPLACE FUNCTION public.respond_match_service_offer(p_offer_id uuid, p_accept boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
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

  IF NOT p_accept THEN
    UPDATE public.match_service_offers SET status = 'DECLINED', responded_at = timezone('utc', now()) WHERE id = p_offer_id;
    RETURN jsonb_build_object('ok', true, 'status', 'DECLINED');
  END IF;

  -- KABUL: rol hâlâ boş mu? (başkası kabul etmiş olabilir)
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

  -- Ücret + komisyon (create_service_request ile aynı skala).
  v_fee := v_offer.fee;
  v_scope := CASE WHEN v_offer.provider_type = 'GK' THEN 'SERVICE_GK' ELSE 'SERVICE_REF' END;
  v_comm := public.calculate_commission(v_fee, v_scope);
  v_comm_amt := (v_comm->>'commission_amt')::numeric;
  v_prov_amt := (v_comm->>'net_amount')::numeric;

  -- Escrow blokajı KAPTAN adına ([IYZICO-TODO] gerçek ön-provizyon edge'de).
  INSERT INTO public.payment_intents (user_id, match_id, amount, currency, status, provider,
    commission_amount, owner_amount, service_provider_amount, commission_model, related_entity_type, blocked_at)
  VALUES (v_offer.captain_id, v_offer.match_id, v_fee, 'TRY', 'BLOCKED', 'IYZICO',
    v_comm_amt, 0, v_prov_amt, v_comm->>'model',
    CASE WHEN v_offer.provider_type = 'GK' THEN 'GK_SERVICE' ELSE 'REF_SERVICE' END, timezone('utc', now()))
  RETURNING * INTO v_intent;

  -- ACCEPTED service_request (sağlayıcı zaten kabul etti). initiated_by default CAPTAIN.
  INSERT INTO public.service_requests (match_id, provider_id, provider_type, requested_by, fee,
    commission_amount, provider_amount, payment_intent_id, expires_at, status, accepted_at)
  VALUES (v_offer.match_id, v_offer.provider_id, v_offer.provider_type, v_offer.captain_id, v_fee,
    v_comm_amt, v_prov_amt, v_intent.id, timezone('utc', now()) + interval '1 day', 'ACCEPTED', timezone('utc', now()))
  RETURNING * INTO v_req;

  UPDATE public.match_service_offers SET status = 'ACCEPTED', responded_at = timezone('utc', now()) WHERE id = p_offer_id;

  -- FCFS: aynı maç+tür için diğer bekleyen teklifleri kapat + sağlayıcılara haber ver.
  UPDATE public.match_service_offers
    SET status = 'EXPIRED', responded_at = timezone('utc', now())
    WHERE match_id = v_offer.match_id AND provider_type = v_offer.provider_type AND status = 'PENDING' AND id <> p_offer_id;
  INSERT INTO public.notifications (user_id, title, body, type_key, match_id)
    SELECT provider_id,
           CASE WHEN v_offer.provider_type = 'GK' THEN 'Kaleci teklifi kapandı' ELSE 'Hakem teklifi kapandı' END,
           'Bu maçın rolü başka bir sağlayıcı tarafından üstlenildi.', 'service_offer_closed', v_offer.match_id
    FROM public.match_service_offers
    WHERE match_id = v_offer.match_id AND provider_type = v_offer.provider_type AND status = 'EXPIRED' AND id <> p_offer_id;

  -- Kaptana haber.
  INSERT INTO public.notifications (user_id, title, body, type_key, match_id, deep_link)
  VALUES (v_offer.captain_id,
    CASE WHEN v_offer.provider_type = 'GK' THEN 'Kaleci teklifini kabul etti 🧤' ELSE 'Hakem teklifini kabul etti ⚖️' END,
    'Sağlayıcı maçın için teklifi kabul etti; ücret bloke edildi.',
    'service_offer_accepted', v_offer.match_id, 'oyna://match/' || v_offer.match_id::text);

  RETURN jsonb_build_object('ok', true, 'status', 'ACCEPTED', 'request_id', v_req.id, 'fee', v_fee, 'provider_amount', v_prov_amt);
END; $$;

-- ─── 4) get_my_match_service_offers — sağlayıcının bekleyen teklifleri ──────
CREATE OR REPLACE FUNCTION public.get_my_match_service_offers()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_uid uuid := auth.uid(); v_res jsonb;
BEGIN
  IF v_uid IS NULL THEN RETURN '[]'::jsonb; END IF;
  SELECT jsonb_agg(row_to_json(t) ORDER BY t.created_at DESC) INTO v_res FROM (
    SELECT o.id, o.match_id, o.provider_type, o.fee, o.status, o.created_at, o.expires_at,
           m.title AS match_title, m.location, m.date, m.time, m.format
    FROM public.match_service_offers o JOIN public.matches m ON m.id = o.match_id
    WHERE o.provider_id = v_uid AND o.status = 'PENDING'
      AND (o.expires_at IS NULL OR o.expires_at > timezone('utc', now()))
  ) t;
  RETURN COALESCE(v_res, '[]'::jsonb);
END; $$;

-- ─── 5) cancel_match_service_offers — maç iptal/void'de bekleyenleri kapat ──
CREATE OR REPLACE FUNCTION public.cancel_match_service_offers(p_match_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
BEGIN
  UPDATE public.match_service_offers SET status = 'CANCELLED', responded_at = timezone('utc', now())
    WHERE match_id = p_match_id AND status = 'PENDING';
  RETURN jsonb_build_object('ok', true);
END; $$;

-- ─── 6) match_block_deposit güncelle: deferred teklifleri GERÇEKTEN gönder ──
-- deferred_providers yeni şekli: [{type:'GK'|'REF', providerIds:[...], all:bool}].
-- Aktivasyonda (kapora bloke) her tür için send_match_service_offers çağrılır.
CREATE OR REPLACE FUNCTION public.match_block_deposit(
  p_match_id uuid, p_amount numeric, p_providers jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_match RECORD;
  v_provider text;
  v_intent public.payment_intents;
  v_counts RECORD;
  v_prov jsonb;
  v_type text;
  v_ids uuid[];
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT: Kapora tutarı pozitif olmalı.'; END IF;

  SELECT id, "creatorId", captain_id, pitch_id, deposit_status, price, commission_model
    INTO v_match FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Maç bulunamadı.'; END IF;
  IF COALESCE(v_match."creatorId", v_match.captain_id) IS DISTINCT FROM v_uid AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Yalnız maçı kuran kaptan kapora bloke edebilir.';
  END IF;
  IF v_match.deposit_status <> 'NONE' THEN
    RAISE EXCEPTION 'ALREADY_BLOCKED: Bu maçın kaporası zaten işlenmiş (%).', v_match.deposit_status;
  END IF;

  v_provider := COALESCE(public.get_config_text('payment_provider', NULL), 'SIMULATION');

  INSERT INTO public.payment_intents (
    user_id, match_id, pitch_id, amount, currency, status, provider,
    commission_amount, owner_amount, service_provider_amount,
    commission_model, related_entity_type, blocked_at
  ) VALUES (
    v_uid, p_match_id, v_match.pitch_id, p_amount, 'TRY', 'BLOCKED', v_provider,
    0, 0, 0, COALESCE(v_match.commission_model,'MODEL_A'), 'MATCH_DEPOSIT', timezone('utc', now())
  ) RETURNING * INTO v_intent;

  SELECT * INTO v_counts FROM public._match_player_counts(p_match_id);

  UPDATE public.matches SET
    deposit_intent_id  = v_intent.id,
    deposit_status     = 'BLOCKED',
    deposit_amount     = p_amount,
    deferred_providers = COALESCE(p_providers, '[]'::jsonb),
    min_players        = v_counts.min_players,
    status             = 'ACTIVE'
  WHERE id = p_match_id;

  -- Ertelenmiş kaleci/hakem TEKLİFLERİ artık gerçekten gönderilir (send_match_service_offers).
  FOR v_prov IN SELECT * FROM jsonb_array_elements(COALESCE(p_providers,'[]'::jsonb)) LOOP
    v_type := v_prov->>'type';
    IF v_type IN ('GK','REF') THEN
      BEGIN
        IF COALESCE((v_prov->>'all')::boolean, false) THEN
          PERFORM public.send_match_service_offers(p_match_id, v_type, NULL); -- tümüne
        ELSE
          SELECT array_agg((e)::uuid) INTO v_ids FROM jsonb_array_elements_text(COALESCE(v_prov->'providerIds','[]'::jsonb)) e;
          IF v_ids IS NOT NULL THEN
            PERFORM public.send_match_service_offers(p_match_id, v_type, v_ids);
          END IF;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Teklif gönderimi başarısız (%): %', v_type, SQLERRM;
      END;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true, 'intent_id', v_intent.id, 'deposit_status', 'BLOCKED',
    'match_status', 'ACTIVE', 'min_players', v_counts.min_players,
    'total_slots', v_counts.total_slots
  );
END; $$;

-- ─── 7) Grants ──────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.send_match_service_offers(uuid, text, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.respond_match_service_offer(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_match_service_offers() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_match_service_offers(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_match_service_offers(uuid, text, uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.respond_match_service_offer(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_match_service_offers() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_match_service_offers(uuid) TO authenticated, service_role;
GRANT SELECT ON public.match_service_offers TO authenticated;
