-- ============================================================================
-- player_create_match SERTLEŞTİRME — "Maç Yayınlanamadı"nın kök nedeni
--
-- KANITLANAN HATA (SQLSTATE 22009): saha seçimi saat değerini SLOT ETİKETİ
-- ("20:00 - 21:00") olarak taşıyordu; RPC'deki (v_time||':00')::time cast'i
-- "20:00 - 21:00:00" üzerinde patlıyor → maç yayını HERKESTE başarısız.
--
-- Bu sürüm RPC'yi payload varyantlarına karşı KIRILAMAZ yapar:
--  • time: metinden ilk SS:DD kalıbı çıkarılır (regexp) — etiket, boşluk, nokta
--    ne gelirse gelsin güvenli; kolona da normalize değer yazılır (eski istemci
--    sürümleri de otomatik düzelir). Kalıp yoksa varsayılan '20:00', starts_at NULL.
--  • pitch_id / homeTeamId / awayTeamId: yalnız GEÇERLİ uuid ise cast edilir
--    (seed/taslak/legacy kimlikleri artık 22P02/400 üretemez).
-- ============================================================================

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
  v_time_norm text;
  v_uuid_re   text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  v_pitch_id  uuid;
  v_home_team uuid;
  v_away_team uuid;
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
  -- "20:00 - 21:00" / "20.00" / " 20:00 " → '20:00' (ilk SS:DD kalıbı)
  v_time_norm := (SELECT (regexp_match(replace(COALESCE(v_time, ''), '.', ':'), '\d{1,2}:\d{2}'))[1]);
  v_starts_at := CASE
    WHEN v_date ~ '^\d{4}-\d{2}-\d{2}$' AND v_time_norm IS NOT NULL
    THEN (v_date::date + (v_time_norm||':00')::time)::timestamptz ELSE NULL END;

  -- Güvenli uuid'ler: geçersiz/legacy kimlik cast hatası üretmek yerine NULL olur.
  v_pitch_id  := CASE WHEN COALESCE(p_payload->>'pitch_id','')   ~ v_uuid_re THEN (p_payload->>'pitch_id')::uuid   ELSE NULL END;
  v_home_team := CASE WHEN COALESCE(p_payload->>'homeTeamId','') ~ v_uuid_re THEN (p_payload->>'homeTeamId')::uuid ELSE NULL END;
  v_away_team := CASE WHEN COALESCE(p_payload->>'awayTeamId','') ~ v_uuid_re THEN (p_payload->>'awayTeamId')::uuid ELSE NULL END;

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
    CASE WHEN v_date ~ '^\d{4}-\d{2}-\d{2}$' THEN v_date::date ELSE CURRENT_DATE END,
    COALESCE(v_time_norm, '20:00'),
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
    v_pitch_id,
    v_visibility,
    v_code,
    v_starts_at,
    v_home_team,
    v_away_team
  );
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.player_create_match(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.player_create_match(jsonb) TO authenticated;
