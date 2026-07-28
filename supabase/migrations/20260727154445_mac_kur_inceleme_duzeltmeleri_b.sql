-- ÜRETİMDEN GERİ ÇEKİLDİ (defter sapması onarımı, 2026-07-28)
-- MAÇ KUR inceleme düzeltmeleri — Bölüm B: create_match_atomic v2
CREATE OR REPLACE FUNCTION public.create_match_atomic(
  p_court_id   uuid,
  p_date       date,
  p_start_time time without time zone,
  p_format     text,
  p_visibility text DEFAULT 'OPEN',
  p_payload    jsonb DEFAULT '{}'::jsonb,
  p_seed_booking_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_court RECORD;
  v_seed RECORD;
  v_per int;
  v_q RECORD;
  v_total numeric; v_deposit numeric; v_deal uuid;
  v_per_person numeric;
  v_dur int := 60;
  v_slots jsonb; v_away jsonb;
  v_title text;
  v_payload jsonb;
  v_match_id uuid;
  v_booking_id uuid;
  v_end time;
  v_providers jsonb := '[]'::jsonb;
  v_prov jsonb; v_pid text;
  v_counts RECORD;
  v_minp int;
  v_block jsonb;
  v_code text;
  v_wh jsonb;
  v_night boolean;
  v_eff timestamp;
  v_claimed int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_visibility NOT IN ('OPEN', 'PRIVATE') THEN p_visibility := 'OPEN'; END IF;

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

  v_wh := v_court.wh;
  IF v_wh IS NOT NULL AND jsonb_typeof(v_wh) = 'object' THEN
    v_dur := COALESCE((v_wh->>'slot_duration')::int, 60);
  END IF;

  IF p_seed_booking_id IS NOT NULL THEN
    v_total := COALESCE(v_seed.price, 0);
    v_deposit := 0;
  ELSE
    SELECT * INTO v_q FROM public._resolve_court_quote(p_court_id, p_date, p_start_time);
    IF v_q.tariff_id IS NULL THEN
      RAISE EXCEPTION 'NO_TARIFF: Bu saha için fiyat tarifesi tanımlanmamış; şimdilik maç kurulamıyor.';
    END IF;
    v_total := v_q.total;
    v_deposit := v_q.deposit;
    v_deal := v_q.deal_id;
  END IF;

  v_per_person := CEIL(COALESCE(v_total, 0) / (v_per * 2) * 1.05);

  v_slots := public._default_formation_slots(p_format, 'slot');
  v_away  := public._default_formation_slots(p_format, 'away');
  IF jsonb_array_length(v_slots) = 0 THEN
    RAISE EXCEPTION 'FORMAT_OUT_OF_RANGE: % desteklenmeyen format.', p_format;
  END IF;

  v_title := COALESCE(NULLIF(trim(p_payload->>'title'), ''), v_court.pitch_name || ' Maçı');

  v_payload := (p_payload - 'slots' - 'awaySlots' - 'deferredProviders' - 'invitedFriends')
    || jsonb_build_object(
      'title', v_title,
      'location', v_court.pitch_name || ' · ' || v_court.name,
      'date', to_char(p_date, 'YYYY-MM-DD'),
      'time', to_char(p_start_time, 'HH24:MI'),
      'price', v_per_person,
      'format', p_format,
      'visibility', p_visibility,
      'pitch_id', v_court.pid::text,
      'duration', COALESCE(NULLIF(p_payload->>'duration', ''), v_dur::text || ' Dakika'),
      'slots', v_slots,
      'awaySlots', v_away
    );
  v_match_id := public.player_create_match(v_payload);
  UPDATE public.matches SET
    court_id = p_court_id,
    starts_at = CASE WHEN v_night THEN ((p_date + 1) + p_start_time)::timestamptz ELSE starts_at END
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

  RETURN jsonb_build_object(
    'match_id', v_match_id,
    'booking_id', v_booking_id,
    'deposit', COALESCE(v_deposit, 0),
    'per_person', v_per_person,
    'total_price', COALESCE(v_total, 0),
    'private_code', v_code,
    'min_players', v_minp,
    'deposit_status', COALESCE(v_block->>'deposit_status', 'NONE')
  );
END;
$$;
REVOKE ALL ON FUNCTION public.create_match_atomic(uuid, date, time, text, text, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_match_atomic(uuid, date, time, text, text, jsonb, uuid) TO authenticated;
