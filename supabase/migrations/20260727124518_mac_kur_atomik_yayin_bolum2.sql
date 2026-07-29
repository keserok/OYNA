-- ÜRETİMDEN GERİ ÇEKİLDİ (defter sapması onarımı, 2026-07-28)
-- Bölüm 2/2: create_match_atomic + invite_friends_to_match + admin çekirdekleri
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
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_visibility NOT IN ('OPEN', 'PRIVATE') THEN p_visibility := 'OPEN'; END IF;

  IF p_seed_booking_id IS NOT NULL THEN
    SELECT b.* INTO v_seed FROM public.pitch_bookings b
    WHERE b.id = p_seed_booking_id AND b.user_id = v_uid
      AND b.status <> 'CANCELLED' AND b.match_id IS NULL
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'SEED_NOT_FOUND: Çevrilecek rezervasyon bulunamadı ya da zaten maça bağlı.'; END IF;
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

  IF (p_date + p_start_time) < (now() AT TIME ZONE 'Europe/Istanbul') THEN
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
  UPDATE public.matches SET court_id = p_court_id WHERE id = v_match_id;

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

CREATE OR REPLACE FUNCTION public.invite_friends_to_match(p_match_id uuid, p_friend_ids uuid[])
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_match RECORD;
  v_sender text;
  v_fid uuid;
  v_sent int := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT id, "creatorId", title, date, "time" INTO v_match
  FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Maç bulunamadı.'; END IF;
  IF v_match."creatorId" IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'FORBIDDEN: Yalnız maçı kuran davet gönderebilir.';
  END IF;

  SELECT COALESCE(NULLIF(trim(full_name), ''), NULLIF(trim(name), ''), 'Bir arkadaşın')
    INTO v_sender FROM public.profiles WHERE id = v_uid;

  FOREACH v_fid IN ARRAY COALESCE(p_friend_ids, '{}') LOOP
    CONTINUE WHEN v_fid = v_uid OR NOT public._are_friends(v_uid, v_fid);
    PERFORM public._notify_team_event(
      v_fid, 'match_invite', v_uid, NULL,
      jsonb_build_object('sender_name', v_sender,
                         'match_date', COALESCE(v_match.date || ' ' || v_match."time", '')),
      true, 'oyna://match/' || p_match_id);
    v_sent := v_sent + 1;
  END LOOP;
  RETURN v_sent;
END;
$$;
REVOKE ALL ON FUNCTION public.invite_friends_to_match(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invite_friends_to_match(uuid, uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_create_match__core(p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id UUID := gen_random_uuid();
  v_slots JSONB := COALESCE(p_payload->'slots', '[]'::jsonb);
  v_away JSONB := COALESCE(p_payload->'awaySlots', p_payload->'away_slots', '[]'::jsonb);
  v_format TEXT := COALESCE(p_payload->>'format', '7v7');
  v_visibility TEXT := CASE WHEN COALESCE(p_payload->>'visibility', 'OPEN') = 'PRIVATE'
                            THEN 'PRIVATE' ELSE 'OPEN' END;
  v_code TEXT := NULLIF(p_payload->>'private_code', '');
  v_date DATE := COALESCE(NULLIF(p_payload->>'date','')::date, CURRENT_DATE);
  v_time TEXT := COALESCE(p_payload->>'time', '20:00');
  v_time_norm TEXT;
  v_starts_at timestamptz;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  IF jsonb_array_length(v_slots) = 0 THEN
    v_slots := public._default_formation_slots(v_format, 'slot');
    IF jsonb_array_length(v_slots) = 0 THEN
      v_slots := public._default_formation_slots('7v7', 'slot');
    END IF;
  END IF;
  IF jsonb_array_length(v_away) = 0 THEN
    v_away := public._default_formation_slots(v_format, 'away');
    IF jsonb_array_length(v_away) = 0 THEN
      v_away := public._default_formation_slots('7v7', 'away');
    END IF;
  END IF;

  SELECT COALESCE(jsonb_agg(
    (s - 'player' - 'occupant' - 'purchasedBy' - 'assignmentStatus' - 'inviteeId' - 'claimCode' - 'userId')
    || jsonb_build_object('status', 'OPEN') ORDER BY ord), '[]'::jsonb)
  INTO v_slots FROM jsonb_array_elements(v_slots) WITH ORDINALITY AS t(s, ord);
  SELECT COALESCE(jsonb_agg(
    (s - 'player' - 'occupant' - 'purchasedBy' - 'assignmentStatus' - 'inviteeId' - 'claimCode' - 'userId')
    || jsonb_build_object('status', 'OPEN') ORDER BY ord), '[]'::jsonb)
  INTO v_away FROM jsonb_array_elements(v_away) WITH ORDINALITY AS t(s, ord);

  IF v_visibility = 'PRIVATE' AND v_code IS NULL THEN
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  ELSIF v_visibility <> 'PRIVATE' THEN
    v_code := NULL;
  ELSE
    v_code := upper(v_code);
  END IF;

  v_time_norm := (SELECT (regexp_match(replace(COALESCE(v_time, ''), '.', ':'), '\d{1,2}:\d{2}'))[1]);
  v_starts_at := (v_date + (COALESCE(v_time_norm, '20:00') || ':00')::time)::timestamptz;

  INSERT INTO public.matches (
    id, title, location, date, "time", price, difficulty, status, format,
    image, badges, "minRating", "missingPositions", slots, "awaySlots",
    "refereeId", "creatorId", captain_id, pitch_id, court_id, "isDemo",
    visibility, duration, gender, "ageGroup", starts_at, is_platform
  ) VALUES (
    v_id,
    COALESCE(p_payload->>'title', 'Yeni Maç'),
    COALESCE(p_payload->>'location', ''),
    v_date,
    COALESCE(v_time_norm, '20:00'),
    COALESCE((p_payload->>'price')::numeric, 0),
    COALESCE(p_payload->>'difficulty', 'Rahat'),
    COALESCE(p_payload->>'status', 'ACTIVE'),
    v_format,
    p_payload->>'image',
    COALESCE(p_payload->'badges', '[]'::jsonb),
    COALESCE((p_payload->>'minRating')::numeric, 0),
    '[]'::jsonb,
    v_slots,
    v_away,
    NULLIF(p_payload->>'refereeId', '')::uuid,
    NULLIF(p_payload->>'creatorId', '')::uuid,
    NULLIF(p_payload->>'creatorId', '')::uuid,
    NULLIF(p_payload->>'pitch_id', '')::uuid,
    NULLIF(p_payload->>'court_id', '')::uuid,
    COALESCE((p_payload->>'isDemo')::boolean, false),
    v_visibility,
    NULLIF(p_payload->>'duration', ''),
    NULLIF(p_payload->>'gender', ''),
    NULLIF(p_payload->>'ageGroup', ''),
    v_starts_at,
    COALESCE((p_payload->>'is_platform')::boolean, true)
  );

  IF v_code IS NOT NULL THEN
    INSERT INTO public.match_private_codes (match_id, code) VALUES (v_id, v_code)
    ON CONFLICT (match_id) DO UPDATE SET code = EXCLUDED.code;
  END IF;

  PERFORM public.log_admin_action('MATCH_CREATE', 'match', v_id, p_payload->>'title', NULL, p_payload);
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_update_match__core(p_match_id uuid, p_payload jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_old JSONB;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT to_jsonb(m.*) INTO v_old FROM public.matches m WHERE id = p_match_id;
  IF v_old IS NULL THEN RAISE EXCEPTION 'Maç bulunamadı'; END IF;
  UPDATE public.matches SET
    title = COALESCE(p_payload->>'title', title),
    location = COALESCE(p_payload->>'location', location),
    date = COALESCE(NULLIF(p_payload->>'date',''), date),
    "time" = COALESCE(p_payload->>'time', "time"),
    price = COALESCE((p_payload->>'price')::numeric, price),
    difficulty = COALESCE(p_payload->>'difficulty', difficulty),
    status = COALESCE(p_payload->>'status', status),
    format = COALESCE(p_payload->>'format', format),
    image = COALESCE(p_payload->>'image', image),
    "minRating" = COALESCE((p_payload->>'minRating')::numeric, "minRating"),
    badges = COALESCE(p_payload->'badges', badges),
    "missingPositions" = COALESCE(p_payload->'missingPositions', "missingPositions"),
    slots = CASE WHEN p_payload ? 'slots'
      THEN public._merge_slot_purchase_keys(slots, p_payload->'slots') ELSE slots END,
    "awaySlots" = CASE WHEN p_payload ? 'awaySlots' OR p_payload ? 'away_slots'
      THEN public._merge_slot_purchase_keys("awaySlots", COALESCE(p_payload->'awaySlots', p_payload->'away_slots'))
      ELSE "awaySlots" END,
    "refereeId" = COALESCE(NULLIF(p_payload->>'refereeId', '')::uuid, "refereeId"),
    duration = CASE WHEN p_payload ? 'duration' THEN NULLIF(p_payload->>'duration','') ELSE duration END,
    gender = CASE WHEN p_payload ? 'gender' THEN NULLIF(p_payload->>'gender','') ELSE gender END,
    "ageGroup" = CASE WHEN p_payload ? 'ageGroup' THEN NULLIF(p_payload->>'ageGroup','') ELSE "ageGroup" END,
    visibility = CASE WHEN p_payload ? 'visibility' AND (p_payload->>'visibility') IN ('OPEN','PRIVATE')
                      THEN p_payload->>'visibility' ELSE visibility END,
    is_platform = COALESCE((p_payload->>'is_platform')::boolean, is_platform),
    "isDemo" = COALESCE((p_payload->>'isDemo')::boolean, "isDemo"),
    pitch_id = CASE WHEN p_payload ? 'pitch_id' THEN NULLIF(p_payload->>'pitch_id','')::uuid ELSE pitch_id END,
    court_id = CASE WHEN p_payload ? 'court_id' THEN NULLIF(p_payload->>'court_id','')::uuid ELSE court_id END,
    starts_at = CASE
      WHEN (p_payload ? 'date' OR p_payload ? 'time')
           AND COALESCE(NULLIF(p_payload->>'date',''), date) ~ '^\d{4}-\d{2}-\d{2}$' THEN
        ((COALESCE(NULLIF(p_payload->>'date',''), date))::date
         + (COALESCE((SELECT (regexp_match(replace(COALESCE(p_payload->>'time', "time"), '.', ':'), '\d{1,2}:\d{2}'))[1]), '20:00') || ':00')::time)::timestamptz
      ELSE starts_at END
  WHERE id = p_match_id;

  IF NULLIF(p_payload->>'private_code','') IS NOT NULL THEN
    INSERT INTO public.match_private_codes (match_id, code)
    VALUES (p_match_id, upper(p_payload->>'private_code'))
    ON CONFLICT (match_id) DO UPDATE SET code = EXCLUDED.code;
  ELSIF COALESCE(p_payload->>'visibility','') = 'PRIVATE' THEN
    INSERT INTO public.match_private_codes (match_id, code)
    VALUES (p_match_id, upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)))
    ON CONFLICT (match_id) DO NOTHING;
  END IF;

  PERFORM public.log_admin_action('MATCH_UPDATE', 'match', p_match_id, p_payload->>'title', v_old, p_payload);
  RETURN TRUE;
END;
$function$;
