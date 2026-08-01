-- ════════════════════════════════════════════════════════════════════════════
-- TEK KESİNLEŞME + SAHA SAHİBİNİN HAKEDİŞİ + SAHA BAZLI İPTAL SAATİ
-- ────────────────────────────────────────────────────────────────────────────
-- NEDEN (2026-09 denetimi, canlı veriyle doğrulandı):
--
--  A) İKİ AYRI "TUTTU" HÂLİ VARDI. Kadro dolunca maç `LIVE`, karar anında
--     `CONFIRMED` oluyordu. Saha sahibinin hakediş kaydı ve kaleci/hakem
--     ödemesinin tahsili ise YALNIZ `CONFIRMED`'e bağlıydı. Pratikte hep
--     `LIVE` yolu işlediği için:
--       • canlıda bugüne kadar HİÇ maç kazancı kaydı oluşmamıştı (0 adet),
--       • uygulamadan kurulan maçın rezervasyonu "ödeme bekliyor" kalıyordu
--         (3200₺'lik saat, ödenen 0₺, ödeme kaydı yok),
--       • kaleci/hakem tahsili hiç tetiklenmiyordu — ve o adım aynı zamanda
--         KALECİYİ MAÇA ATAYAN adım olduğu için kiralanan kaleci kadroda
--         resmen hiç görünmüyordu.
--
--  B) KESİNLEŞEN MAÇ ASLA TAMAMLANMIYORDU. `match_check_threshold` kadro
--     dolunca `is_successful = true` yazıyordu; maçı tamamlayan otomatik adım
--     (`auto_finalize_matches`) ise tam tersine `is_successful IS NOT TRUE`
--     arıyor. Yani kesinleşen maç o taramaya HİÇ girmiyor → COMPLETED olmuyor
--     → "maçını değerlendir" bildirimi gitmiyor, maç sayacı artmıyor.
--     `is_successful` zaten `finalize_match`'in işidir; kesinleşmede yazılmaz.
--
--  C) KAPTANIN İPTAL SÜRESİ KODA GÖMÜLÜYDÜ (24 saat). Sahaların kendi
--     `refund_full_hours` ayarı varken okunmuyordu.
--
-- KARARLAR (proje sahibi):
--   1a  Tek kesinleşme durumu: CONFIRMED. LIVE artık kullanılmıyor.
--   2a  Hakediş tabanı SAHANIN KENDİ FİYATI (rezervasyon fiyatı) — doğrudan
--       rezervasyondaki kuralın aynısı. Model/oran maça DONDURULMUŞ anlaşmadan.
--   3a  Hakediş kesinleşme anında oluşur, 2 hafta beklemede kalır.
--   4a  Kesinleşmiş maç, sahanın serbest-iptal saatinden AZ kala iptal edilirse
--       saha sahibi hakedişini KORUR (saatini kaybetti, para da tahsil edildi).
--       Daha erken iptalde hakediş geri alınır ve oyunculara iade edilir.
--   5a  İptal saati sahanın `refund_full_hours` ayarından okunur.
--   6a  Maç kesinleşince rezervasyon ÖDENDİ işaretlenir.
--
-- ÇİFT ÖDEME KORUMASI: hakediş `wallet_transactions`'ta maç başına TEK kez
-- yazılır (MATCH_EARNING kontrolü). Rezervasyona `booking_payments` satırı
-- EKLENMEZ — eklenseydi `credit_owner_booking_earning` tetiklenir ve sahibe
-- İKİNCİ kez (BOOKING_EARNING olarak) ödenirdi.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) Oyuncu fiyatı artık anlaşmadan gelir (gömülü %5 kaldırıldı) ──────────
-- ESKİDEN: v_per_person := CEIL(total / (per*2) * 1.05)  ← 1.05 KODA GÖMÜLÜ
-- ARTIK  : markup sahanın anlaşmasından okunur ve maça dondurulur.
-- Global MODEL_A markup'ı %5 olduğu için BUGÜNKÜ FİYATLAR AYNI KALIR.

CREATE OR REPLACE FUNCTION public.create_match_atomic(
  p_court_id uuid, p_date date, p_start_time time without time zone, p_format text,
  p_visibility text DEFAULT 'OPEN'::text, p_payload jsonb DEFAULT '{}'::jsonb,
  p_seed_booking_id uuid DEFAULT NULL::uuid, p_client_request_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_court RECORD; v_seed RECORD; v_per int; v_q RECORD;
  v_total numeric; v_deposit numeric; v_deal uuid;
  v_per_person numeric; v_dur int;
  v_slots jsonb; v_away jsonb; v_title text; v_payload jsonb;
  v_match_id uuid; v_booking_id uuid; v_end time;
  v_providers jsonb := '[]'::jsonb; v_prov jsonb; v_pid text;
  v_counts RECORD; v_minp int; v_block jsonb; v_code text;
  v_wh jsonb; v_night boolean; v_eff timestamp;
  v_claimed int; v_op_claimed int := 0; v_existing jsonb; v_result jsonb;
  v_anlasma RECORD; v_markup numeric; v_oyuncu_toplam numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_visibility NOT IN ('OPEN', 'PRIVATE') THEN p_visibility := 'OPEN'; END IF;

  IF p_client_request_id IS NOT NULL THEN
    INSERT INTO public.owner_client_ops (client_request_id, op_type, created_by)
    VALUES (p_client_request_id, 'CREATE_MATCH_ATOMIC', v_uid)
    ON CONFLICT (client_request_id) DO NOTHING;
    GET DIAGNOSTICS v_op_claimed = ROW_COUNT;
    IF v_op_claimed = 0 THEN
      SELECT result INTO v_existing FROM public.owner_client_ops
      WHERE client_request_id = p_client_request_id;
      IF v_existing IS NOT NULL AND (v_existing->>'match_id') IS NOT NULL THEN
        RETURN v_existing;
      END IF;
      RAISE EXCEPTION 'DUPLICATE_IN_FLIGHT: Bu yayın isteği hâlâ işleniyor.';
    END IF;
  END IF;

  IF p_seed_booking_id IS NOT NULL THEN
    SELECT b.* INTO v_seed FROM public.pitch_bookings b
    WHERE b.id = p_seed_booking_id AND b.user_id = v_uid
      AND b.status <> 'CANCELLED' AND b.match_id IS NULL
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'SEED_NOT_FOUND: Çevrilecek rezervasyon bulunamadı ya da zaten maça bağlı.'; END IF;
    IF v_seed.status <> 'CONFIRMED' AND COALESCE(v_seed.paid_amount, 0) <= 0 THEN
      RAISE EXCEPTION 'SEED_NOT_READY: Rezervasyon onaylanmadan ya da kaporası ödenmeden maça çevrilemez.';
    END IF;
    p_court_id   := v_seed.court_id;
    p_date       := v_seed.booking_date;
    p_start_time := v_seed.start_time;
  END IF;

  SELECT c.*, p.id AS pid, p.name AS pitch_name, p.working_hours AS wh
    INTO v_court
  FROM public.courts c JOIN public.pitches p ON p.id = c.pitch_id
  WHERE c.id = p_court_id AND COALESCE(c.is_active, true);
  IF NOT FOUND THEN RAISE EXCEPTION 'COURT_NOT_FOUND: Saha bulunamadı.'; END IF;

  v_per := NULLIF(split_part(COALESCE(p_format, ''), 'v', 1), '')::int;
  IF v_per IS NULL OR v_per < COALESCE(v_court.min_capacity, 3) OR v_per > COALESCE(v_court.max_capacity, 11) THEN
    RAISE EXCEPTION 'FORMAT_OUT_OF_RANGE: % sahası %v% desteklemiyor (%v% – %v%).',
      v_court.name, v_per, v_per,
      COALESCE(v_court.min_capacity, 3), COALESCE(v_court.min_capacity, 3),
      COALESCE(v_court.max_capacity, 11), COALESCE(v_court.max_capacity, 11);
  END IF;

  v_night := EXTRACT(HOUR FROM p_start_time)::int < 6;
  v_eff := (p_date + p_start_time) + CASE WHEN v_night THEN interval '1 day' ELSE interval '0' END;
  IF v_eff < (now() AT TIME ZONE 'Europe/Istanbul') THEN
    RAISE EXCEPTION 'PAST_TIME: Geçmiş bir saat için maç kurulamaz.';
  END IF;

  IF p_seed_booking_id IS NOT NULL THEN
    v_total := COALESCE(v_seed.price, 0);
    v_deposit := 0;
    IF v_seed.start_time IS NOT NULL AND v_seed.end_time IS NOT NULL THEN
      v_dur := (EXTRACT(EPOCH FROM (
                  CASE WHEN v_seed.end_time <= v_seed.start_time
                       THEN v_seed.end_time::interval + interval '24 hours'
                       ELSE v_seed.end_time::interval END
                  - v_seed.start_time::interval)) / 60)::int;
      IF COALESCE(v_dur, 0) <= 0 THEN v_dur := NULL; END IF;
    END IF;
    IF v_dur IS NULL THEN
      SELECT * INTO v_q FROM public._resolve_court_quote(p_court_id, p_date, p_start_time);
      v_dur := v_q.slot_minutes;
    END IF;
  ELSE
    SELECT * INTO v_q FROM public._resolve_court_quote(p_court_id, p_date, p_start_time);
    IF v_q.tariff_id IS NULL THEN
      RAISE EXCEPTION 'NO_TARIFF: Bu saha için fiyat tarifesi tanımlanmamış; şimdilik maç kurulamıyor.';
    END IF;
    v_total := v_q.total;
    v_deposit := v_q.deposit;
    v_deal := v_q.deal_id;
    v_dur := v_q.slot_minutes;
  END IF;

  IF COALESCE(v_dur, 0) <= 0 THEN
    v_wh := v_court.wh;
    IF v_wh IS NOT NULL AND jsonb_typeof(v_wh) = 'object' THEN
      v_dur := NULLIF(v_wh->>'slot_duration', '')::int;
    END IF;
  END IF;
  IF COALESCE(v_dur, 0) <= 0 THEN v_dur := 60; END IF;

  -- ── FİYAT: sahanın anlaşmasından ────────────────────────────────────────
  -- Tarifedeki tutar SAHAYA ait taban; oyuncudan alınan = taban + markup.
  -- Markup yüzde ya da sabit tutar olabilir (sabit doluysa o kazanır).
  SELECT * INTO v_anlasma FROM public._pitch_agreement(v_court.pid);
  v_markup := public._markup_tutari(COALESCE(v_total, 0), v_anlasma.markup_pct, v_anlasma.markup_amount);
  v_oyuncu_toplam := COALESCE(v_total, 0) + v_markup;
  v_per_person := CEIL(v_oyuncu_toplam / (v_per * 2));

  v_slots := public._default_formation_slots(p_format, 'slot');
  v_away  := public._default_formation_slots(p_format, 'away');
  IF jsonb_array_length(v_slots) = 0 THEN
    RAISE EXCEPTION 'FORMAT_OUT_OF_RANGE: % desteklenmeyen format.', p_format;
  END IF;

  v_title := COALESCE(NULLIF(trim(p_payload->>'title'), ''), v_court.pitch_name || ' Maçı');

  v_payload := (p_payload - 'slots' - 'awaySlots' - 'deferredProviders'
                          - 'invitedFriends' - 'duration' - 'duration_minutes'
                          - 'idempotencyKey')
    || jsonb_build_object(
      'title', v_title,
      'location', v_court.pitch_name || ' · ' || v_court.name,
      'date', to_char(p_date, 'YYYY-MM-DD'),
      'time', to_char(p_start_time, 'HH24:MI'),
      'price', v_per_person,
      'format', p_format,
      'visibility', p_visibility,
      'pitch_id', v_court.pid::text,
      'duration', v_dur::text || ' Dakika',
      'slots', v_slots,
      'awaySlots', v_away
    );
  v_match_id := public.player_create_match(v_payload);
  UPDATE public.matches SET
    court_id = p_court_id,
    starts_at = CASE WHEN v_night THEN ((p_date + 1) + p_start_time) AT TIME ZONE 'Europe/Istanbul' ELSE starts_at END
  WHERE id = v_match_id;

  IF p_seed_booking_id IS NOT NULL THEN
    UPDATE public.pitch_bookings
       SET match_id = v_match_id, title = v_title
     WHERE id = p_seed_booking_id;
    v_booking_id := p_seed_booking_id;
  ELSE
    v_end := p_start_time + make_interval(mins => v_dur);
    v_booking_id := public.create_pitch_booking(
      v_court.pid, p_court_id, p_date, p_start_time, v_end,
      'APP_MATCH', NULL, NULL, NULL, v_title);
    UPDATE public.pitch_bookings
       SET match_id = v_match_id,
           status = 'CONFIRMED',
           auto_approved_at = COALESCE(auto_approved_at, now()),
           price = COALESCE(v_total, price)
     WHERE id = v_booking_id;
    IF v_deal IS NOT NULL THEN
      UPDATE public.pitch_flash_deals
         SET is_claimed = true, claimed_by = v_uid, claimed_at = now()
       WHERE id = v_deal AND NOT COALESCE(is_claimed, false);
      GET DIAGNOSTICS v_claimed = ROW_COUNT;
      IF v_claimed = 0 THEN
        RAISE EXCEPTION 'SLOT_TAKEN: Son dakika indirimi az önce kullanıldı — saati yeniden seçip dene.';
      END IF;
    END IF;
  END IF;

  FOR v_prov IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'deferredProviders', '[]'::jsonb)) LOOP
    IF v_prov->>'type' IS NOT NULL THEN
      IF jsonb_array_length(COALESCE(v_prov->'providerIds', '[]'::jsonb)) > 0 THEN
        FOR v_pid IN SELECT jsonb_array_elements_text(v_prov->'providerIds') LOOP
          v_providers := v_providers || jsonb_build_object('type', v_prov->>'type', 'providerId', v_pid);
        END LOOP;
      ELSE
        v_providers := v_providers || jsonb_build_object('type', v_prov->>'type');
      END IF;
    END IF;
  END LOOP;

  IF v_deposit > 0 THEN
    v_block := public.match_block_deposit(v_match_id, v_deposit, v_providers);
    v_minp := (v_block->>'min_players')::int;
  ELSE
    SELECT * INTO v_counts FROM public._match_player_counts(v_match_id);
    v_minp := v_counts.min_players;
    UPDATE public.matches SET
      deposit_status = 'NONE',
      deferred_providers = v_providers,
      min_players = v_minp,
      status = 'ACTIVE'
    WHERE id = v_match_id;
    FOR v_prov IN SELECT * FROM jsonb_array_elements(v_providers) LOOP
      BEGIN
        v_pid := NULLIF(v_prov->>'providerId', '');
        IF v_pid IS NOT NULL THEN
          PERFORM public.create_service_request(v_match_id, v_pid::uuid, (v_prov->>'type')::text);
        END IF;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Sağlayıcı talebi gönderilemedi (%): %', v_prov, SQLERRM;
      END;
    END LOOP;
  END IF;

  SELECT code INTO v_code FROM public.match_private_codes WHERE match_id = v_match_id;

  v_result := jsonb_build_object(
    'match_id', v_match_id,
    'booking_id', v_booking_id,
    'deposit', COALESCE(v_deposit, 0),
    'per_person', v_per_person,
    'total_price', COALESCE(v_total, 0),
    'player_total', v_oyuncu_toplam,
    'markup', v_markup,
    'private_code', v_code,
    'min_players', v_minp,
    'duration_minutes', v_dur,
    'deposit_status', COALESCE(v_block->>'deposit_status', 'NONE')
  );

  IF p_client_request_id IS NOT NULL THEN
    UPDATE public.owner_client_ops SET result = v_result
    WHERE client_request_id = p_client_request_id;
  END IF;

  RETURN v_result;
END; $function$;


-- ── 2) KESİNLEŞME MUHASEBESİ — tek yerden, tek kez ──────────────────────────
-- Hem kadro dolunca hem karar anında BURASI çalışır. İki kez çağrılsa da
-- ikinci çağrı hiçbir şey yazmaz.

CREATE OR REPLACE FUNCTION public._match_confirm_settle(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  m RECORD; v_booking RECORD; v_taban numeric; v_comm jsonb;
  v_owner uuid; v_net numeric;
BEGIN
  SELECT id, pitch_id, commission_model, commission_rate_pct,
         commission_markup_pct, commission_markup_amount
    INTO m FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  -- Tek kez: hakediş zaten yazılmışsa çık.
  IF EXISTS (SELECT 1 FROM public.wallet_transactions
             WHERE match_id = p_match_id AND type = 'MATCH_EARNING') THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true);
  END IF;

  SELECT b.id, b.price INTO v_booking
  FROM public.pitch_bookings b
  WHERE b.match_id = p_match_id AND b.status <> 'CANCELLED'
  ORDER BY b.created_at LIMIT 1;

  -- HAKEDİŞ TABANI: sahanın kendi fiyatı (rezervasyon fiyatı).
  v_taban := COALESCE(v_booking.price, 0);
  IF v_taban <= 0 OR m.pitch_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'NO_BASE');
  END IF;

  SELECT owner_id INTO v_owner FROM public.pitches WHERE id = m.pitch_id;
  IF v_owner IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'NO_OWNER');
  END IF;

  v_comm := public.calculate_commission(
    v_taban, 'PITCH', m.pitch_id, COALESCE(m.commission_model, 'MODEL_A'),
    m.commission_rate_pct, m.commission_markup_pct, m.commission_markup_amount);
  v_net := round((v_comm->>'owner_net')::numeric, 2);

  IF v_net > 0 THEN
    INSERT INTO public.wallet_transactions
      (user_id, match_id, amount, type, balance_type, status, reference_type, reference_id, description, meta)
    VALUES (v_owner, p_match_id, v_net, 'MATCH_EARNING', 'EARNINGS', 'PENDING',
            'MATCH', p_match_id,
            format('Maç kesinleşti — saha geliri (%%%s komisyon düşüldü · 2 hafta beklemede)',
                   round((v_comm->>'commission_pct')::numeric)),
            jsonb_build_object('base', v_taban, 'model', v_comm->>'model',
                               'player_total', v_comm->>'player_total'));
  END IF;

  -- Rezervasyon ÖDENDİ (6a): para OYNA'da toplandı, sahibin alacağı güvencede.
  -- `booking_payments` satırı EKLENMEZ — eklenirse sahibe ikinci kez ödenirdi.
  IF v_booking.id IS NOT NULL THEN
    UPDATE public.pitch_bookings
       SET payment_status = 'PAID', paid_amount = v_taban
     WHERE id = v_booking.id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'owner_net', v_net, 'base', v_taban,
                            'model', v_comm->>'model');
END; $function$;

REVOKE ALL ON FUNCTION public._match_confirm_settle(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._match_confirm_settle(uuid) TO service_role;


-- ── 3) Kadro dolunca: TEK durum (CONFIRMED) + muhasebe ──────────────────────
-- (A) LIVE yerine CONFIRMED → kaleci/hakem tahsili tetikleyicisi artık çalışır.
-- (B) `is_successful` BURADA YAZILMAZ — o `finalize_match`'in işidir. Eskiden
--     burada true yazıldığı için maç, tamamlama taramasına hiç girmiyordu.

CREATE OR REPLACE FUNCTION public.match_check_threshold(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_status text; v_dep text; v_counts RECORD; v_live boolean := false;
BEGIN
  SELECT status, deposit_status INTO v_status, v_dep FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  SELECT * INTO v_counts FROM public._match_player_counts(p_match_id);

  IF v_status = 'ACTIVE' AND v_counts.filled_slots >= v_counts.min_players THEN
    UPDATE public.matches
      SET status = 'CONFIRMED', confirmed_at = timezone('utc', now())
      WHERE id = p_match_id;
    IF v_dep = 'BLOCKED' THEN PERFORM public.match_capture_deposit(p_match_id); END IF;
    PERFORM public._match_confirm_settle(p_match_id);
    v_live := true;
  END IF;

  RETURN jsonb_build_object(
    'live', v_live, 'confirmed', v_live, 'filled', v_counts.filled_slots,
    'min_players', v_counts.min_players, 'total', v_counts.total_slots
  );
END; $function$;


-- ── 4) Karar anı: aynı muhasebeyi çağırır (kopya hesap yok) ─────────────────

CREATE OR REPLACE FUNCTION public.process_match_at_deadline(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  m RECORD; v_counts RECORD; v_intent RECORD; v_user RECORD;
  v_captured int := 0; v_voided int := 0; v_refunded int := 0;
  v_amt numeric; v_dep jsonb; v_settle jsonb;
BEGIN
  SELECT * INTO m FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF m.status IN ('CONFIRMED','CANCELLED','COMPLETED','LIVE') THEN
    RETURN jsonb_build_object('match_id', p_match_id, 'status', m.status, 'idempotent', true);
  END IF;
  SELECT * INTO v_counts FROM public._match_player_counts(p_match_id);

  IF v_counts.filled_slots >= v_counts.min_players THEN
    UPDATE public.matches SET status = 'CONFIRMED', confirmed_at = now() WHERE id = p_match_id;

    IF m.deposit_status = 'BLOCKED' THEN
      v_dep := public.match_capture_deposit(p_match_id);
      v_captured := v_captured + 1;
    END IF;
    FOR v_intent IN
      SELECT * FROM public.payment_intents
      WHERE match_id = p_match_id AND status IN ('BLOCKED','PENDING') FOR UPDATE
    LOOP
      UPDATE public.payment_intents SET status = 'CAPTURED', captured_at = now() WHERE id = v_intent.id;
      v_captured := v_captured + 1;
    END LOOP;

    v_settle := public._match_confirm_settle(p_match_id);

    RETURN jsonb_build_object('match_id', p_match_id, 'status', 'CONFIRMED',
      'filled', v_counts.filled_slots, 'min_players', v_counts.min_players,
      'captured_intents', v_captured, 'deposit', v_dep, 'settle', v_settle);
  ELSE
    UPDATE public.matches SET status = 'CANCELLED', cancel_reason = 'QUORUM_NOT_MET',
      refund_status = 'PROCESSING' WHERE id = p_match_id;
    FOR v_user IN
      SELECT wt.user_id FROM public.wallet_transactions wt
      WHERE wt.match_id = p_match_id AND wt.type = 'MATCH_FEE' GROUP BY wt.user_id
    LOOP
      v_amt := public._match_refund_partial(v_user.user_id, p_match_id, NULL);
      IF v_amt > 0 THEN v_refunded := v_refunded + 1; END IF;
    END LOOP;
    IF m.deposit_status = 'BLOCKED' THEN
      v_dep := public._match_release_deposit(p_match_id, 'Kadro tamamlanamadı — maç iptal edildi.');
      v_voided := v_voided + 1;
    END IF;
    FOR v_intent IN
      SELECT * FROM public.payment_intents
      WHERE match_id = p_match_id AND status IN ('BLOCKED','PENDING') FOR UPDATE
    LOOP
      UPDATE public.payment_intents SET status = 'VOIDED', voided_at = now(),
        void_reason = 'MATCH_QUORUM_NOT_MET' WHERE id = v_intent.id;
      v_voided := v_voided + 1;
    END LOOP;
    UPDATE public.matches SET refund_status = 'DONE' WHERE id = p_match_id;

    RETURN jsonb_build_object('match_id', p_match_id, 'status', 'CANCELLED',
      'filled', v_counts.filled_slots, 'min_players', v_counts.min_players,
      'refunded', v_refunded, 'voided_intents', v_voided, 'deposit', v_dep);
  END IF;
END; $function$;

REVOKE ALL ON FUNCTION public.process_match_at_deadline(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_match_at_deadline(uuid) TO service_role;


-- ── 5) Kaptan iptali: saat SAHADAN, geç iptalde sahibin hakedişi KALIR ──────

CREATE OR REPLACE FUNCTION public.match_cancel_by_captain(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_match RECORD; v_hours numeric; v_serbest numeric; v_far boolean; v_iptal int := 0;
BEGIN
  SELECT id, "creatorId", captain_id, deposit_intent_id, deposit_status,
         deposit_amount, starts_at, pitch_id
    INTO v_match FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF COALESCE(v_match."creatorId", v_match.captain_id) IS DISTINCT FROM v_uid AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  -- SERBEST İPTAL SAATİ SAHADAN gelir (5a). Saha ayarı yoksa global, o da
  -- yoksa 24. Eskiden bu sayı koda gömülüydü.
  SELECT full_hours INTO v_serbest FROM public._pitch_refund_tiers(v_match.pitch_id);
  v_serbest := COALESCE(v_serbest, 24);

  v_hours := CASE WHEN v_match.starts_at IS NULL THEN 999
                  ELSE EXTRACT(EPOCH FROM (v_match.starts_at - timezone('utc', now()))) / 3600 END;
  v_far := v_hours >= v_serbest;

  IF v_match.deposit_status = 'BLOCKED' THEN
    -- Maç henüz kesinleşmemişti: hakediş de yok, kapora tamamen iade.
    PERFORM public.match_void_deposit(p_match_id, 'Kaptan iptali.');
    RETURN jsonb_build_object('ok', true, 'outcome', 'VOIDED', 'refund', 0,
                              'free_hours', v_serbest);
  ELSIF v_match.deposit_status = 'CAPTURED' THEN
    IF v_far THEN
      -- ERKEN İPTAL: oyunculara iade, saha sahibinin hakedişi GERİ ALINIR.
      UPDATE public.payment_intents SET status = 'REFUNDED', voided_at = timezone('utc', now()),
        void_reason = format('Kaptan iptali (≥%ss) — iade.', v_serbest)
        WHERE id = v_match.deposit_intent_id;
      PERFORM public._refund_wallet_escrow(v_match.deposit_intent_id,
        'Kaptan iptali — kapora iade kredisine döndü');
      UPDATE public.wallet_transactions
         SET status = 'CANCELLED'
       WHERE match_id = p_match_id AND type = 'MATCH_EARNING' AND status = 'PENDING';
      GET DIAGNOSTICS v_iptal = ROW_COUNT;
      UPDATE public.matches SET deposit_status = 'REFUNDED', status = 'CANCELLED',
        cancel_reason = format('Kaptan iptali (≥%ss) — kapora iade edildi.', v_serbest)
       WHERE id = p_match_id;
      RETURN jsonb_build_object('ok', true, 'outcome', 'REFUNDED',
        'free_hours', v_serbest, 'owner_earning_cancelled', v_iptal);
    ELSE
      -- GEÇ İPTAL: iade yok, güven puanı düşer; saha sahibi hakedişini KORUR
      -- (4a) — saatini kaybetti ve para zaten tahsil edilmiş durumda.
      UPDATE public.matches SET status = 'CANCELLED',
        cancel_reason = format('Kaptan iptali (<%ss) — iade yok (no-show).', v_serbest)
       WHERE id = p_match_id;
      UPDATE public.profiles
        SET trust_score = GREATEST(COALESCE(trust_score,5.0) - 0.5, 0)
        WHERE id = v_uid;
      RETURN jsonb_build_object('ok', true, 'outcome', 'NO_REFUND_PENALTY',
        'free_hours', v_serbest, 'owner_earning_kept', true);
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', false, 'reason', 'NO_DEPOSIT',
                            'deposit_status', v_match.deposit_status,
                            'free_hours', v_serbest);
END; $function$;


-- ── 6) Maçın iptal/iade kurallarını OYUNCUYA doğru göstermek için ───────────
-- Ekranlar bugüne kadar 24/6/50 sayılarını KODA GÖMÜLÜ yazıyordu. Artık maçın
-- kendi sahasının ayarını okuyabilsinler diye tek çağrı.

CREATE OR REPLACE FUNCTION public.match_cancel_policy(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_pitch uuid; t RECORD;
BEGIN
  SELECT pitch_id INTO v_pitch FROM public.matches WHERE id = p_match_id;
  SELECT * INTO t FROM public._pitch_refund_tiers(v_pitch);
  RETURN jsonb_build_object(
    'pitch_id',    v_pitch,
    'full_hours',  COALESCE(t.full_hours, 24),
    'half_hours',  COALESCE(t.half_hours, 6),
    'half_pct',    COALESCE(t.half_pct, 50)
  );
END; $function$;

GRANT EXECUTE ON FUNCTION public.match_cancel_policy(uuid) TO authenticated;
