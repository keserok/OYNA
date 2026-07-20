-- ════════════════════════════════════════════════════════════════════════════
-- İKİ TARAFLI KALECİ 🧤🧤 — her takım KENDİ kalecisini kiralayabilsin
-- ----------------------------------------------------------------------------
-- Sorun: matches.gk_id TEK kolon + service_requests benzersiz indeksi (match,tip)
-- → bir maçta yalnız bir kaleci. Ev sahibi kaleci kiralayınca deplasman ikinci
-- kaleci kiralayamıyordu; ayrıca kalecinin HANGİ takıma ait olduğu hiçbir yerde
-- KALICI saklanmıyordu (yalnız RLS-kısıtlı talep satırından çıkarılabiliyordu →
-- kaptan olmayan takım üyeleri kendi kalecisini göremiyordu).
--
-- Çözüm:
--   • matches.away_gk_id  → deplasman kalecisi (gk_id = ev sahibi kalecisi).
--     Taraf artık HANGİ kolonun dolu olduğundan okunur; matches SELECT herkese
--     açık olduğundan kaptan-olmayan üyeler de kendi kalecisini görür (RLS yok).
--   • service_requests.team_side ('HOME'|'AWAY') → talebin hangi takım için
--     olduğunu kalıcı tutar; capture doğru kolona yazar.
--   • Benzersizlik: GK taraf-başına (maç,taraf), REF maç-başına (tek hakem —
--     iki takım paylaşır, değişmez).
--   • Yetki: away kaptanı da kendi tarafı için kiralayabilir.
--
-- Hakem TEK kalır — iki takımın ekranında da gösterilir (istenen davranış).
-- Tüm para/escrow alt-motoru (payment_intents, wallet, payout, no-show, iade)
-- AYNEN çalışır; yalnız "hangi kolona/taraf" bilgisi eklenir. Additive + idempotent.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── 0. Şema: deplasman kaleci kolonu + talep taraf kolonu ──────────────────
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS away_gk_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS team_side text NOT NULL DEFAULT 'HOME';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_requests_team_side_check') THEN
    ALTER TABLE public.service_requests
      ADD CONSTRAINT service_requests_team_side_check CHECK (team_side IN ('HOME','AWAY'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_matches_away_gk
  ON public.matches(away_gk_id) WHERE away_gk_id IS NOT NULL;

-- ─── 1. Benzersizlik: GK taraf-başına, REF maç-başına ───────────────────────
-- Eski (match_id, provider_type) tekilliği iki tarafı engelliyordu → kaldır.
DROP INDEX IF EXISTS public.uq_service_requests_active_per_match;

-- GK: aynı maçta aynı TARAF için tek aktif talep (iki taraf ayrı ayrı olur).
CREATE UNIQUE INDEX IF NOT EXISTS uq_service_requests_gk_per_side
  ON public.service_requests(match_id, team_side)
  WHERE provider_type = 'GK' AND status IN ('PENDING','ACCEPTED','CAPTURED');

-- REF: aynı maçta tek aktif talep (taraftan bağımsız — tek hakem).
CREATE UNIQUE INDEX IF NOT EXISTS uq_service_requests_ref_active
  ON public.service_requests(match_id)
  WHERE provider_type = 'REF' AND status IN ('PENDING','ACCEPTED','CAPTURED');

-- ─── 2. Yardımcılar ─────────────────────────────────────────────────────────

-- Bir kullanıcının bu maçta hangi taraf için kiralama yetkisi var?
--   HOME → maç sahibi/kurucu, matches.captain_id veya ev sahibi takım kaptanı
--   AWAY → deplasman takımı kaptanı
--   NULL → yetkisiz
CREATE OR REPLACE FUNCTION public._hire_side_for(p_match_id uuid, p_uid uuid)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v public.matches; v_home_cap uuid; v_away_cap uuid;
BEGIN
  IF p_uid IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO v FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT captain_id INTO v_home_cap FROM public.teams WHERE id = v."homeTeamId";
  SELECT captain_id INTO v_away_cap FROM public.teams WHERE id = v."awayTeamId";
  IF p_uid = v."creatorId" OR p_uid = v.captain_id
     OR (v_home_cap IS NOT NULL AND p_uid = v_home_cap) THEN
    RETURN 'HOME';
  END IF;
  IF v_away_cap IS NOT NULL AND p_uid = v_away_cap THEN
    RETURN 'AWAY';
  END IF;
  RETURN NULL;
END; $$;
REVOKE ALL ON FUNCTION public._hire_side_for(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._hire_side_for(uuid, uuid) TO authenticated, service_role;

-- Belirtilen tarafın kalecisi dolu mu? (kolon yazılmış YA DA aktif talep var)
CREATE OR REPLACE FUNCTION public._gk_side_taken(p_match_id uuid, p_side text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v public.matches; v_col uuid; v_active boolean;
BEGIN
  SELECT * INTO v FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RETURN false; END IF;
  v_col := CASE WHEN p_side = 'AWAY' THEN v.away_gk_id ELSE v.gk_id END;
  SELECT EXISTS (
    SELECT 1 FROM public.service_requests
    WHERE match_id = p_match_id AND provider_type = 'GK' AND team_side = p_side
      AND status IN ('PENDING','ACCEPTED','CAPTURED')
  ) INTO v_active;
  RETURN v_col IS NOT NULL OR v_active;
END; $$;
REVOKE ALL ON FUNCTION public._gk_side_taken(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._gk_side_taken(uuid, text) TO authenticated, service_role;

-- ─── 3. create_service_request — taraf-farkında (kaptan-başlatan kiralama) ──
-- KC-4 tabanı KORUNUR: advisory lock (TOCTOU) + müsaitlik/showProfile/allowOffer
-- guard'ı + config-tabanlı TTL + bildirim. ÜZERİNE iki-taraflılık eklenir:
--   • yetki: ev sahibi VEYA deplasman kaptanı (_hire_side_for)
--   • GK taraf-başına slot; REF maç-tekil (taraf HOME'a sabitlenir)
--   • team_side kalıcı yazılır (capture doğru kolona koyar)
-- Eski 3-arg imza kaldırılır; 4. arg p_team_side varsayılan NULL (auto-derive).
DROP FUNCTION IF EXISTS public.create_service_request(uuid, uuid, text);
CREATE OR REPLACE FUNCTION public.create_service_request(
  p_match_id      uuid,
  p_provider_id   uuid,
  p_provider_type text,
  p_team_side     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid(); v_match RECORD; v_side text; v_fee numeric; v_scope text; v_comm jsonb;
  v_prov_amt numeric; v_comm_amt numeric; v_intent public.payment_intents; v_req public.service_requests;
  v_far_h numeric; v_near_m numeric; v_floor_m numeric; v_expires timestamptz;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_provider_type NOT IN ('GK','REF') THEN RAISE EXCEPTION 'INVALID_TYPE'; END IF;
  -- Aynı sağlayıcı için eşzamanlı talepleri serialize et (çakışma yarışını önler)
  PERFORM pg_advisory_xact_lock(hashtext('svc_provider:' || p_provider_id::text));
  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  -- Taraf çözümü + yetki (ev sahibi VEYA deplasman kaptanı)
  v_side := public._hire_side_for(p_match_id, v_uid);
  IF p_team_side IS NOT NULL THEN
    IF p_team_side NOT IN ('HOME','AWAY') THEN RAISE EXCEPTION 'INVALID_SIDE'; END IF;
    IF v_side IS DISTINCT FROM p_team_side AND NOT public.is_platform_admin() THEN
      RAISE EXCEPTION 'FORBIDDEN: Bu taraf için hizmet talep yetkin yok.';
    END IF;
    v_side := p_team_side;
  END IF;
  IF p_provider_type = 'REF' THEN v_side := 'HOME'; END IF;   -- tek hakem semantiği
  IF v_side IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: Yalniz mac sahibi/kaptan hizmet talep edebilir.';
  END IF;

  IF v_match.status IN ('CANCELLED','COMPLETED') THEN RAISE EXCEPTION 'INVALID_MATCH_STATE: Mac % durumunda.', v_match.status; END IF;

  -- Slot doluluk: GK taraf-başına, REF maç-başına
  IF p_provider_type = 'GK' THEN
    IF public._gk_side_taken(p_match_id, v_side) THEN
      RAISE EXCEPTION 'SLOT_FILLED: Bu tarafin kalecisi zaten atanmis/talep edilmis.';
    END IF;
  ELSE
    IF v_match."refereeId" IS NOT NULL
       OR EXISTS (SELECT 1 FROM public.service_requests
                  WHERE match_id = p_match_id AND provider_type = 'REF'
                    AND status IN ('PENDING','ACCEPTED','CAPTURED')) THEN
      RAISE EXCEPTION 'SLOT_FILLED: Macin hakemi zaten atanmis/talep edilmis.';
    END IF;
  END IF;

  -- Aynı sağlayıcı bu maçta zaten görevli mi (iki tarafa aynı kişi engeli)
  IF EXISTS (SELECT 1 FROM public.service_requests
             WHERE match_id = p_match_id AND provider_id = p_provider_id
               AND provider_type = p_provider_type
               AND status IN ('PENDING','ACCEPTED','CAPTURED')) THEN
    RAISE EXCEPTION 'PROVIDER_ALREADY_ON_MATCH: Bu saglayici bu macta zaten gorevli.';
  END IF;

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
    commission_amount, provider_amount, payment_intent_id, expires_at, team_side)
  VALUES (p_match_id, p_provider_id, p_provider_type, v_uid, v_fee, v_comm_amt, v_prov_amt, v_intent.id, v_expires, v_side)
  RETURNING * INTO v_req;

  INSERT INTO public.notifications (user_id, title, body, type_key, match_id, deep_link)
  VALUES (p_provider_id,
          CASE WHEN p_provider_type = 'GK' THEN 'Yeni kaleci talebi 🧤' ELSE 'Yeni hakem talebi ⚖️' END,
          COALESCE(v_match.title, 'Bir maç') || ' için ' || v_fee || '₺ (net ' || v_prov_amt ||
          '₺) teklif var. Son yanıt: ' || to_char(v_expires AT TIME ZONE 'Europe/Istanbul', 'DD.MM HH24:MI'),
          'service_request_new', p_match_id, 'oyna://match/' || p_match_id);

  RETURN jsonb_build_object('request_id', v_req.id, 'intent_id', v_intent.id, 'status', 'PENDING',
    'fee', v_fee, 'commission', v_comm_amt, 'provider_amount', v_prov_amt,
    'expires_at', v_expires, 'team_side', v_side);
END;
$$;
REVOKE ALL ON FUNCTION public.create_service_request(uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_service_request(uuid, uuid, text, text) TO authenticated;

-- ─── 4. capture_service_request — doğru taraf kolonuna yaz ──────────────────
CREATE OR REPLACE FUNCTION public.capture_service_request(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_req public.service_requests;
BEGIN
  SELECT * INTO v_req FROM public.service_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_req.status = 'CAPTURED' THEN
    RETURN jsonb_build_object('request_id', p_request_id, 'status', 'CAPTURED', 'idempotent', true);
  END IF;
  IF v_req.status <> 'ACCEPTED' THEN
    RAISE EXCEPTION 'INVALID_STATE: Tahsil için ACCEPTED bekleniyor, mevcut: %', v_req.status;
  END IF;

  IF v_req.payment_intent_id IS NOT NULL THEN
    UPDATE public.payment_intents
    SET status = 'CAPTURED', captured_at = now()
    WHERE id = v_req.payment_intent_id AND status IN ('BLOCKED','PENDING');
  END IF;

  UPDATE public.service_requests SET status = 'CAPTURED', captured_at = now()
  WHERE id = p_request_id;

  -- Atanmış sağlayıcıyı maça yaz — GK taraf-başına, REF tek kolon.
  IF v_req.provider_type = 'GK' THEN
    IF v_req.team_side = 'AWAY' THEN
      UPDATE public.matches SET away_gk_id = v_req.provider_id WHERE id = v_req.match_id;
    ELSE
      UPDATE public.matches SET gk_id = v_req.provider_id WHERE id = v_req.match_id;
    END IF;
  ELSE
    UPDATE public.matches SET "refereeId" = v_req.provider_id WHERE id = v_req.match_id;
  END IF;

  INSERT INTO public.wallet_transactions
    (user_id, amount, type, balance_type, status, reference_type, reference_id, description, meta)
  VALUES
    (v_req.provider_id, v_req.provider_amount, 'SERVICE_EARNING', 'EARNINGS', 'PENDING',
     'PAYMENT_INTENT', v_req.payment_intent_id,
     'Hizmet kazancı (değerlendirme sonrası serbest)',
     jsonb_build_object('service_request_id', v_req.id, 'provider_type', v_req.provider_type, 'team_side', v_req.team_side));

  RETURN jsonb_build_object('request_id', p_request_id, 'status', 'CAPTURED',
    'provider_amount', v_req.provider_amount);
END;
$$;
-- faz5_corrections sertleştirmesini KORU: capture yalnız içeriden (trigger/RPC) çağrılır.
REVOKE ALL ON FUNCTION public.capture_service_request(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.capture_service_request(uuid) TO service_role;

-- ─── 5. İptal temizliği — doğru taraf kolonunu boşalt ───────────────────────
-- (guard'lı UPDATE'ler zaten provider_id eşleşmesine bakar; away_gk_id eklenir)
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
        UPDATE public.payment_intents SET status = 'REFUNDED', void_reason = 'MATCH_CANCELLED'
        WHERE id = r.payment_intent_id AND status = 'CAPTURED';
        UPDATE public.wallet_transactions SET status = 'CANCELLED'
        WHERE type = 'SERVICE_EARNING' AND status = 'PENDING' AND reference_id = r.payment_intent_id;
      ELSE
        UPDATE public.payment_intents SET status = 'VOIDED', voided_at = now(), void_reason = 'MATCH_CANCELLED'
        WHERE id = r.payment_intent_id AND status IN ('PENDING','BLOCKED');
      END IF;
    END IF;

    UPDATE public.service_requests SET status = 'CANCELLED', cancelled_at = now() WHERE id = r.id;

    -- Maça atanan sağlayıcıyı temizle (GK: her iki taraf kolonu guard'lı)
    IF r.provider_type = 'GK' THEN
      UPDATE public.matches SET gk_id = NULL      WHERE id = p_match_id AND gk_id = r.provider_id;
      UPDATE public.matches SET away_gk_id = NULL WHERE id = p_match_id AND away_gk_id = r.provider_id;
    ELSE
      UPDATE public.matches SET "refereeId" = NULL WHERE id = p_match_id AND "refereeId" = r.provider_id;
    END IF;
  END LOOP;
END; $$;
REVOKE ALL ON FUNCTION public._void_services_on_match_cancel(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._void_services_on_match_cancel(uuid) TO service_role;

-- ─── 6. apply_to_match_as_provider — GK için İKİ taraf da doluysa kapalı ────
CREATE OR REPLACE FUNCTION public.apply_to_match_as_provider(
  p_match_id      uuid,
  p_provider_type text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_match  RECORD;
  v_fee    numeric;
  v_scope  text;
  v_comm   jsonb;
  v_comm_amt numeric;
  v_prov_amt numeric;
  v_captain uuid;
  v_req    public.service_requests;
  v_expiry numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_provider_type NOT IN ('GK','REF') THEN RAISE EXCEPTION 'INVALID_TYPE'; END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_match.status IN ('CANCELLED','COMPLETED') THEN
    RAISE EXCEPTION 'INVALID_MATCH_STATE: Maç % durumunda.', v_match.status;
  END IF;

  -- Slot boş olmalı: GK → İKİ taraf da dolu değilse başvurulabilir; REF → tek.
  IF p_provider_type = 'GK' THEN
    IF public._gk_side_taken(p_match_id, 'HOME') AND public._gk_side_taken(p_match_id, 'AWAY') THEN
      RAISE EXCEPTION 'SLOT_FILLED: Bu maçın her iki kalecisi de atanmış.';
    END IF;
  ELSE
    IF v_match."refereeId" IS NOT NULL THEN
      RAISE EXCEPTION 'SLOT_FILLED: Bu maçın hakemi zaten atanmış.';
    END IF;
  END IF;

  v_captain := COALESCE(v_match."creatorId", v_match.captain_id);
  IF v_captain IS NULL THEN RAISE EXCEPTION 'NO_CAPTAIN: Maçın sahibi bulunamadı.'; END IF;
  IF v_captain = v_uid THEN RAISE EXCEPTION 'SELF_APPLY: Kendi maçına başvuramazsın.'; END IF;

  IF p_provider_type = 'GK' THEN
    SELECT g.fee INTO v_fee FROM public.goalkeepers g
    JOIN public.profiles p ON p.id = g.id
    WHERE g.id = v_uid AND p.verification_status = 'approved';
    v_scope := 'SERVICE_GK';
  ELSE
    SELECT r.fee INTO v_fee FROM public.referees r
    JOIN public.profiles p ON p.id = r.id
    WHERE r.id = v_uid AND p.verification_status = 'approved';
    v_scope := 'SERVICE_REF';
  END IF;
  IF v_fee IS NULL THEN RAISE EXCEPTION 'NOT_APPROVED: Onaylı %s profilin yok.', p_provider_type; END IF;

  IF public._provider_has_conflict(v_uid, v_match.starts_at, p_match_id) THEN
    RAISE EXCEPTION 'PROVIDER_CONFLICT: Bu saatte başka bir maçın var.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.service_requests
    WHERE match_id = p_match_id AND provider_id = v_uid
      AND status IN ('APPLIED','PENDING','ACCEPTED','CAPTURED')
  ) THEN
    RAISE EXCEPTION 'ALREADY_APPLIED: Bu maça zaten başvurdun.';
  END IF;

  v_comm     := public.calculate_commission(v_fee, v_scope);
  v_comm_amt := (v_comm->>'commission_amt')::numeric;
  v_prov_amt := (v_comm->>'net_amount')::numeric;

  SELECT COALESCE(service_request_expiry_hours, 48) INTO v_expiry FROM public.settings LIMIT 1;

  -- APPLIED: taraf henüz belirsiz (kabul eden kaptanın tarafında kesinleşir) →
  -- placeholder 'HOME' (team_side yalnız aktif statülerde anlam taşır).
  INSERT INTO public.service_requests (
    match_id, provider_id, provider_type, requested_by, fee,
    commission_amount, provider_amount, status, initiated_by, applied_at, expires_at, team_side
  ) VALUES (
    p_match_id, v_uid, p_provider_type, v_captain, v_fee,
    v_comm_amt, v_prov_amt, 'APPLIED', 'PROVIDER', now(),
    now() + make_interval(hours => COALESCE(v_expiry,48)::int), 'HOME'
  )
  RETURNING * INTO v_req;

  INSERT INTO public.notifications (user_id, title, body, type_key, match_id)
  VALUES (v_captain,
    CASE WHEN p_provider_type='GK' THEN 'Yeni kaleci başvurusu' ELSE 'Yeni hakem başvurusu' END,
    'Maçına bir ' || CASE WHEN p_provider_type='GK' THEN 'kaleci' ELSE 'hakem' END ||
      ' başvurdu. Kabul edersen ücret bloke edilir.',
    'service_request_applied', p_match_id);

  RETURN jsonb_build_object('request_id', v_req.id, 'status', 'APPLIED',
    'fee', v_fee, 'provider_amount', v_prov_amt);
END;
$$;
REVOKE ALL ON FUNCTION public.apply_to_match_as_provider(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_to_match_as_provider(uuid, text) TO authenticated;

-- ─── 7. accept_provider_application — kabul eden kaptanın TARAFINA tahsis ───
CREATE OR REPLACE FUNCTION public.accept_provider_application(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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

  SELECT * INTO v_match FROM public.matches WHERE id = v_req.match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  -- Kabul eden kaptanın tarafı (ev sahibi VEYA deplasman); REF → HOME sabiti.
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

  -- Slot hâlâ boş olmalı (bu taraf için)
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
    SET status = 'ACCEPTED', accepted_at = now(), payment_intent_id = v_intent.id, team_side = v_side
    WHERE id = p_request_id;

  -- Diğer bekleyen başvuruları reddet:
  --   REF → hepsi (tek hakem).
  --   GK  → yalnız DİĞER taraf da kapandıysa (yoksa öbür kaptana açık kalsın).
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
$$;
REVOKE ALL ON FUNCTION public.accept_provider_application(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_provider_application(uuid) TO authenticated;

-- ─── 8. find_providers_for_match — away kaptanı da sağlayıcı arayabilsin ────
-- kb8_schedule_zone_matching gövdesi KORUNUR (zone + schedule + privacy filtreleri);
-- yalnız yetki satırı _hire_side_for ile genişletilir (ev sahibi + deplasman kaptanı).
CREATE OR REPLACE FUNCTION public.find_providers_for_match(p_match_id uuid, p_provider_type text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_match RECORD; v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_provider_type NOT IN ('GK','REF') THEN RAISE EXCEPTION 'INVALID_TYPE'; END IF;
  SELECT id, starts_at, status, "creatorId", captain_id, location INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF public._hire_side_for(p_match_id, v_uid) IS NULL AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Yalniz mac sahibi/kaptan saglayici arayabilir.'; END IF;
  IF p_provider_type = 'GK' THEN
    SELECT jsonb_agg(row_to_json(t) ORDER BY t.rating DESC, t.match_count DESC, t.fee ASC) INTO v_result FROM (
      SELECT g.id, g.name, g.avatar, g.rating, g.fee, g."matchCount" AS match_count, g.style,
             g.height, g.age, g.skills, g.stats,
             g."preferredZones" AS preferred_zones, g.coordinates, g."isElite" AS is_elite
      FROM public.goalkeepers g JOIN public.profiles p ON p.id = g.id
      WHERE p.verification_status = 'approved' AND COALESCE(p.is_available, true) = true AND COALESCE(g."isDemo", false) = false
        AND COALESCE((g.settings->>'showProfile')::boolean, true) = true
        AND public._provider_serves_zone(g."preferredZones", v_match.location)
        AND public._provider_serves_schedule(g.working_hours, v_match.starts_at)
        AND NOT public._provider_has_conflict(g.id, v_match.starts_at, p_match_id)) t;
  ELSE
    SELECT jsonb_agg(row_to_json(t) ORDER BY t.rating DESC, t.match_count DESC, t.fee ASC) INTO v_result FROM (
      SELECT r.id, r.name, r.avatar, r.rating, r.fee, r."matchCount" AS match_count, r.level, r.style,
             r.stats,
             r."preferredZones" AS preferred_zones, r.coordinates, r."isElite" AS is_elite
      FROM public.referees r JOIN public.profiles p ON p.id = r.id
      WHERE p.verification_status = 'approved' AND COALESCE(p.is_available, true) = true AND COALESCE(r."isDemo", false) = false
        AND COALESCE((r.settings->>'showProfile')::boolean, true) = true
        AND public._provider_serves_zone(r."preferredZones", v_match.location)
        AND public._provider_serves_schedule(r.working_hours, v_match.starts_at)
        AND NOT public._provider_has_conflict(r.id, v_match.starts_at, p_match_id)) t;
  END IF;
  RETURN COALESCE(v_result, '[]'::jsonb);
END; $function$;
REVOKE ALL ON FUNCTION public.find_providers_for_match(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_providers_for_match(uuid, text) TO authenticated;

-- ─── 9. captain_confirm_service — away kaptanı da KENDİ tarafını onaylasın ──
-- provider_match_applications gövdesi KORUNUR; yetki _hire_side_for ile genişler.
CREATE OR REPLACE FUNCTION public.captain_confirm_service(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_uid uuid := auth.uid(); v_req public.service_requests;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT * INTO v_req FROM public.service_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_req.requested_by IS DISTINCT FROM v_uid
     AND public._hire_side_for(v_req.match_id, v_uid) IS NULL
     AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF v_req.status NOT IN ('CAPTURED') THEN
    RAISE EXCEPTION 'INVALID_STATE: Onay için maçın tahsil edilmiş olması gerekir.';
  END IF;
  UPDATE public.service_requests SET captain_confirmed = true WHERE id = p_request_id;
  PERFORM public._release_service_payout(v_req.match_id, v_req.provider_id);
  RETURN jsonb_build_object('request_id', p_request_id, 'captain_confirmed', true);
END;
$$;
REVOKE ALL ON FUNCTION public.captain_confirm_service(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.captain_confirm_service(uuid) TO authenticated;

-- ─── 10. captain_report_no_show — away kaptanı da KENDİ kalecisini bildirsin ─
-- escrow gövdesi KORUNUR (iade/ceza/teminat akışı aynen); yetki _hire_side_for ile genişler.
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
  IF v_req.requested_by IS DISTINCT FROM v_uid
     AND public._hire_side_for(v_req.match_id, v_uid) IS NULL
     AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Yalniz mac kaptani no-show bildirebilir.';
  END IF;
  IF v_req.status <> 'CAPTURED' THEN
    RAISE EXCEPTION 'INVALID_STATE: No-show yalniz tahsil edilmis (aktif) hizmet icin bildirilebilir (mevcut: %).', v_req.status;
  END IF;

  v_penalty := COALESCE(v_match.price, 0);
  v_hours := public.get_config_number('gk_noshow_dispute_hours', 48);
  SELECT COALESCE(name, full_name, 'Saglayici') INTO v_gk_name FROM public.profiles WHERE id = v_req.provider_id;

  UPDATE public.wallet_transactions SET status = 'CANCELLED'
    WHERE reference_id = v_req.payment_intent_id AND balance_type = 'EARNINGS' AND status = 'PENDING';
  PERFORM public._sync_wallet_mirror(v_req.provider_id);

  PERFORM public._refund_service_captain(v_req);

  IF v_penalty > 0 THEN
    BEGIN
      PERFORM public.wallet_spend_balance(v_req.provider_id, v_penalty, 'MATCH', v_req.match_id, v_req.match_id,
        'Kaleci no-show cezasi (' || COALESCE(v_match.title,'mac') || ')');
      INSERT INTO public.wallet_transactions
        (user_id, match_id, amount, type, balance_type, status, reference_type, reference_id, description)
      VALUES
        (v_req.requested_by, v_req.match_id, v_penalty, 'MATCH_REFUND', 'REFUND_CREDIT', 'COMPLETED',
         'MATCH', v_req.match_id, 'No-show tazminati (' || v_gk_name || ')');
      PERFORM public._sync_wallet_mirror(v_req.provider_id);
      PERFORM public._sync_wallet_mirror(v_req.requested_by);
      v_charged := true;
    EXCEPTION WHEN OTHERS THEN
      v_charged := false;
    END;
  END IF;

  UPDATE public.service_requests
    SET status = 'NOSHOW_REPORTED', reported_at = now(),
        dispute_deadline = now() + make_interval(hours => v_hours::int),
        penalty_amount = v_penalty, payout_released = true
    WHERE id = p_request_id;

  INSERT INTO public.notifications (user_id, title, body, type_key, match_id, deep_link)
  VALUES (v_req.provider_id, 'No-show bildirildi ⚠️',
          COALESCE(v_match.title,'Bir mac') || ' icin katilmadigin bildirildi. Ceza: ' || v_penalty ||
          '₺. Itirazin icin ' || v_hours || ' saatin var.',
          'service_noshow_reported', v_req.match_id, 'oyna://match/' || v_req.match_id);

  RETURN jsonb_build_object('request_id', p_request_id, 'status', 'NOSHOW_REPORTED',
    'penalty', v_penalty, 'penalty_charged', v_charged, 'dispute_deadline', now() + make_interval(hours => v_hours::int));
END; $function$;
REVOKE ALL ON FUNCTION public.captain_report_no_show(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.captain_report_no_show(uuid, text) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- NOT: matches SELECT zaten herkese açık (matches_select_public) → away_gk_id
-- otomatik olarak tüm istemcilere döner; ek RLS gerekmez. Admin tekil-atama ve
-- eski FAZ9 self-assign RPC'leri ev sahibi kolonuna (gk_id) yazmaya devam eder
-- (kiralama akışının dışında, davranış değişmez).
-- ════════════════════════════════════════════════════════════════════════════
