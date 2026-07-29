-- ============================================================================
-- IP-02 — player_create_match İDEMPOTENCY
--
-- SORUN: fonksiyon her çağrıda v_id := gen_random_uuid() üretip düz INSERT
-- yapıyordu. Zayıf şebekede ikinci dokunuş / retry = aynı saha+saate İKİNCİ
-- maç ilanı + ikinci kapora bloğu. Kaptan yalnız SON maçın kaporasını ödüyor,
-- ilk maç kaporasız ve öksüz vitrinde kalıyordu (BULGU-043).
--
-- ÇÖZÜM: owner_client_ops defteri (20260726000006) YENİDEN KULLANILIR — yeni
-- tablo AÇILMAZ. Claim/replay kalıbı 20260802000001 ile birebir aynı.
-- İmza DEĞİŞMEZ (anahtar payload içinde gelir) → PostgREST overload riski yok.
--
-- NOT: Gövde CANLIDAN (pg_get_functiondef) alındı, plandaki taslaktan DEĞİL.
-- Plan 20260812000003'ü taban alıyordu; canlı gövde o tarihten sonra
-- 20260728161215 ile court_id + duration_minutes, ayrıca slot normalizasyonu,
-- match_private_codes ve match_participants eklerini kazanmıştı. Taslak
-- uygulansaydı bu dört kazanım SESSİZCE geri alınırdı.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.player_create_match(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_id        uuid := gen_random_uuid();
  v_uid       uuid := auth.uid();
  v_is_banned boolean;
  v_visibility text;
  v_code      text;
  v_starts_at timestamptz;
  v_date      text;
  v_time      text;
  v_time_norm text;
  v_uuid_re   text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_pitch_id  uuid;
  v_court_id  uuid;
  v_duration_min integer;
  v_home_team uuid;
  v_away_team uuid;
  v_slots     jsonb;
  v_away      jsonb;
  v_idem      uuid;
  v_claimed   int := 0;
  v_existing  jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT is_banned INTO v_is_banned FROM public.profiles WHERE id = v_uid;
  IF v_is_banned THEN RAISE EXCEPTION 'Kullanıcı banlı!'; END IF;

  -- ── İdempotency claim ────────────────────────────────────────────────────
  -- Anahtar YOKSA davranış eskisiyle birebir aynı kalır (geriye dönük uyum:
  -- admin paneli ve eski istemciler anahtar göndermiyor).
  v_idem := CASE WHEN COALESCE(p_payload->>'idempotencyKey','') ~ v_uuid_re
                 THEN (p_payload->>'idempotencyKey')::uuid ELSE NULL END;
  IF v_idem IS NOT NULL THEN
    INSERT INTO public.owner_client_ops (client_request_id, op_type, created_by)
    VALUES (v_idem, 'PLAYER_CREATE_MATCH', v_uid)
    ON CONFLICT (client_request_id) DO NOTHING;
    GET DIAGNOSTICS v_claimed = ROW_COUNT;
    IF v_claimed = 0 THEN
      SELECT result INTO v_existing FROM public.owner_client_ops
      WHERE client_request_id = v_idem;
      IF v_existing IS NOT NULL AND (v_existing->>'match_id') IS NOT NULL THEN
        RETURN (v_existing->>'match_id')::uuid;   -- tekrar gönderim → İLK maç
      END IF;
      -- İlk istek hâlâ uçuşta: ikinci maç YARATMA, çağırana durumu bildir.
      RAISE EXCEPTION 'DUPLICATE_IN_FLIGHT';
    END IF;
  END IF;

  v_visibility := COALESCE(p_payload->>'visibility', 'OPEN');
  IF v_visibility = 'PRIVATE' THEN
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  END IF;

  v_date := p_payload->>'date';
  v_time := p_payload->>'time';
  v_time_norm := (SELECT (regexp_match(replace(COALESCE(v_time, ''), '.', ':'), '\d{1,2}:\d{2}'))[1]);
  v_starts_at := CASE
    WHEN v_date ~ '^\d{4}-\d{2}-\d{2}$' AND v_time_norm IS NOT NULL
    THEN (v_date::date + (v_time_norm||':00')::time)::timestamptz ELSE NULL END;

  v_pitch_id  := CASE WHEN COALESCE(p_payload->>'pitch_id','')   ~ v_uuid_re THEN (p_payload->>'pitch_id')::uuid   ELSE NULL END;
  v_court_id  := CASE WHEN COALESCE(p_payload->>'court_id','')   ~ v_uuid_re THEN (p_payload->>'court_id')::uuid   ELSE NULL END;
  v_home_team := CASE WHEN COALESCE(p_payload->>'homeTeamId','') ~ v_uuid_re THEN (p_payload->>'homeTeamId')::uuid ELSE NULL END;
  v_away_team := CASE WHEN COALESCE(p_payload->>'awayTeamId','') ~ v_uuid_re THEN (p_payload->>'awayTeamId')::uuid ELSE NULL END;

  IF v_court_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.courts c
      WHERE c.id = v_court_id
        AND (v_pitch_id IS NULL OR c.pitch_id = v_pitch_id)
    ) THEN
      v_court_id := NULL;
    END IF;
  END IF;

  v_duration_min := COALESCE(
    NULLIF((p_payload->>'duration_minutes'), '')::integer,
    NULLIF((regexp_match(COALESCE(p_payload->>'duration',''), '\d+'))[1], '')::integer,
    60
  );
  IF v_duration_min NOT IN (60, 90, 120) THEN v_duration_min := 60; END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',   COALESCE(s->>'id', 'slot_' || (ord - 1)::text),
      'role', COALESCE(s->>'role', 'ORT'),
      'x',    COALESCE((s->>'x')::numeric, 50),
      'y',    COALESCE((s->>'y')::numeric, 50),
      'status', 'OPEN'
    ) || CASE WHEN s ? 'side' THEN jsonb_build_object('side', s->>'side') ELSE '{}'::jsonb END
    ORDER BY ord
  ), '[]'::jsonb) INTO v_slots
  FROM jsonb_array_elements(COALESCE(p_payload->'slots', '[]'::jsonb)) WITH ORDINALITY AS t(s, ord);

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',   COALESCE(s->>'id', 'away_' || (ord - 1)::text),
      'role', COALESCE(s->>'role', 'ORT'),
      'x',    COALESCE((s->>'x')::numeric, 50),
      'y',    COALESCE((s->>'y')::numeric, 50),
      'status', 'OPEN'
    ) || CASE WHEN s ? 'side' THEN jsonb_build_object('side', s->>'side') ELSE '{}'::jsonb END
    ORDER BY ord
  ), '[]'::jsonb) INTO v_away
  FROM jsonb_array_elements(COALESCE(p_payload->'awaySlots', '[]'::jsonb)) WITH ORDINALITY AS t(s, ord);

  INSERT INTO public.matches (
    id, title, location, date, "time", price, difficulty, status, format,
    duration, duration_minutes, gender, "ageGroup", image, badges, "minRating", "missingPositions",
    slots, "awaySlots", "creatorId", captain_id, "isDemo",
    pitch_id, court_id, visibility, starts_at,
    "homeTeamId", "awayTeamId"
  ) VALUES (
    v_id,
    COALESCE(p_payload->>'title', 'Yeni Maç'),
    COALESCE(p_payload->>'location', ''),
    CASE WHEN v_date ~ '^\d{4}-\d{2}-\d{2}$' THEN v_date::date ELSE CURRENT_DATE END,
    COALESCE(v_time_norm, '20:00'),
    COALESCE((p_payload->>'price')::numeric, 0),
    COALESCE(p_payload->>'difficulty', 'Rahat'),
    COALESCE(p_payload->>'status', 'ACTIVE'),
    COALESCE(p_payload->>'format', '7v7'),
    v_duration_min || ' Dakika',
    v_duration_min,
    p_payload->>'gender',
    p_payload->>'ageGroup',
    p_payload->>'image',
    COALESCE(p_payload->'badges', '[]'::jsonb),
    COALESCE((p_payload->>'minRating')::numeric, 0),
    COALESCE(p_payload->'missingPositions', '[]'::jsonb),
    v_slots,
    v_away,
    v_uid, v_uid, false,
    v_pitch_id,
    v_court_id,
    v_visibility,
    v_starts_at,
    v_home_team,
    v_away_team
  );

  IF v_code IS NOT NULL THEN
    INSERT INTO public.match_private_codes (match_id, code) VALUES (v_id, v_code)
    ON CONFLICT (match_id) DO NOTHING;
  END IF;

  INSERT INTO public.match_participants (match_id, user_id, role, status)
  VALUES (v_id, v_uid, 'home', 'creator')
  ON CONFLICT (match_id, user_id) DO NOTHING;

  -- Claim'i sonuçla kapat: aynı anahtarla gelen tekrar gönderim artık İLK
  -- maçın id'sini alır, ikinci maç oluşmaz.
  IF v_idem IS NOT NULL THEN
    UPDATE public.owner_client_ops
       SET result = jsonb_build_object('status','OK','match_id', v_id)
     WHERE client_request_id = v_idem;
  END IF;

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.player_create_match(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.player_create_match(jsonb) TO authenticated;
