-- FAZ 8 (oyuncu) S38: Takım Maçı — player_create_match artık homeTeamId/awayTeamId persistliyor.
-- Tek slots dizisi (side: HOME/AWAY) modeli; rakip tarafı kodla davet edilip ödeyerek katılır.
CREATE OR REPLACE FUNCTION public.player_create_match(p_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id        uuid := gen_random_uuid();
  v_uid       uuid := auth.uid();
  v_is_banned boolean;
  v_visibility text;
  v_code      text;
  v_starts_at timestamptz;
  v_date      text;
  v_time      text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT is_banned INTO v_is_banned FROM public.profiles WHERE id = v_uid;
  IF v_is_banned THEN RAISE EXCEPTION 'Kullanıcı banlı!'; END IF;

  v_visibility := COALESCE(p_payload->>'visibility', 'OPEN');
  IF v_visibility = 'PRIVATE' THEN
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  END IF;

  v_date := p_payload->>'date';
  v_time := p_payload->>'time';
  v_starts_at := CASE
    WHEN v_date ~ '^\d{4}-\d{2}-\d{2}$' AND v_time ~ '^\d{1,2}:\d{2}'
    THEN (v_date::date + (v_time||':00')::time)::timestamptz ELSE NULL END;

  INSERT INTO public.matches (
    id, title, location, date, "time", price, difficulty, status, format,
    duration, gender, "ageGroup", image, badges, "minRating", "missingPositions",
    slots, "awaySlots", "creatorId", captain_id, "isDemo",
    pitch_id, visibility, private_code, starts_at,
    "homeTeamId", "awayTeamId"
  ) VALUES (
    v_id,
    COALESCE(p_payload->>'title', 'Yeni Maç'),
    COALESCE(p_payload->>'location', ''),
    COALESCE((p_payload->>'date')::date, CURRENT_DATE),
    COALESCE(p_payload->>'time', '20:00'),
    COALESCE((p_payload->>'price')::numeric, 0),
    COALESCE(p_payload->>'difficulty', 'Rahat'),
    COALESCE(p_payload->>'status', 'ACTIVE'),
    COALESCE(p_payload->>'format', '7v7'),
    p_payload->>'duration',
    p_payload->>'gender',
    p_payload->>'ageGroup',
    p_payload->>'image',
    COALESCE(p_payload->'badges', '[]'::jsonb),
    COALESCE((p_payload->>'minRating')::numeric, 3.0),
    COALESCE(p_payload->'missingPositions', '[]'::jsonb),
    COALESCE(p_payload->'slots', '[]'::jsonb),
    COALESCE(p_payload->'awaySlots', '[]'::jsonb),
    v_uid, v_uid, false,
    NULLIF(p_payload->>'pitch_id','')::uuid,
    v_visibility,
    v_code,
    v_starts_at,
    NULLIF(p_payload->>'homeTeamId','')::uuid,
    NULLIF(p_payload->>'awayTeamId','')::uuid
  );
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.player_create_match(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.player_create_match(jsonb) TO authenticated;
