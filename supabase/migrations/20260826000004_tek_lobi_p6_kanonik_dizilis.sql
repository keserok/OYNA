-- ============================================================================
-- TEK MAÇ LOBİSİ — P6: Kanonik diziliş SSOT'u sunucuda
--
-- Geri bildirim: admin maçları slotları role:'P' + koordinatsız üretiyordu →
-- lobide tüm slotlar "ORT" görünüyor, kartlarda "8P ARANIYOR" çıkıyordu.
-- Çözüm: utils/formations.ts'deki VARSAYILAN dizilişlerin sunucu kopyası
-- (_default_formation_slots). admin_create_match__core artık oyuncu tarafıyla
-- BİREBİR aynı yapıyı üretir: slot_N/away_N id'leri, GK/DEF/MID/FWD rolleri,
-- gerçek x/y koordinatları. "Tek maç görünümü" sunucudan garanti.
-- ============================================================================

CREATE OR REPLACE FUNCTION public._default_formation_slots(p_size text, p_prefix text)
RETURNS jsonb
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$
  WITH f(size, ord, x, y, role) AS (VALUES
    ('3v3',1,50,90,'GK'),('3v3',2,50,60,'MID'),('3v3',3,50,25,'FWD'),
    ('4v4',1,50,90,'GK'),('4v4',2,50,70,'DEF'),('4v4',3,50,45,'MID'),('4v4',4,50,20,'FWD'),
    ('5v5',1,50,90,'GK'),('5v5',2,50,75,'DEF'),('5v5',3,25,50,'MID'),('5v5',4,75,50,'MID'),('5v5',5,50,25,'FWD'),
    ('6v6',1,50,90,'GK'),('6v6',2,30,75,'DEF'),('6v6',3,70,75,'DEF'),('6v6',4,30,50,'MID'),('6v6',5,70,50,'MID'),('6v6',6,50,25,'FWD'),
    ('7v7',1,50,90,'GK'),('7v7',2,25,75,'DEF'),('7v7',3,75,75,'DEF'),('7v7',4,20,50,'MID'),('7v7',5,50,50,'MID'),('7v7',6,80,50,'MID'),('7v7',7,50,25,'FWD'),
    ('8v8',1,50,90,'GK'),('8v8',2,20,75,'DEF'),('8v8',3,50,75,'DEF'),('8v8',4,80,75,'DEF'),('8v8',5,20,50,'MID'),('8v8',6,50,50,'MID'),('8v8',7,80,50,'MID'),('8v8',8,50,25,'FWD'),
    ('9v9',1,50,90,'GK'),('9v9',2,20,75,'DEF'),('9v9',3,50,75,'DEF'),('9v9',4,80,75,'DEF'),('9v9',5,20,50,'MID'),('9v9',6,50,50,'MID'),('9v9',7,80,50,'MID'),('9v9',8,35,25,'FWD'),('9v9',9,65,25,'FWD'),
    ('10v10',1,50,90,'GK'),('10v10',2,20,75,'DEF'),('10v10',3,40,75,'DEF'),('10v10',4,60,75,'DEF'),('10v10',5,80,75,'DEF'),('10v10',6,20,50,'MID'),('10v10',7,50,50,'MID'),('10v10',8,80,50,'MID'),('10v10',9,35,25,'FWD'),('10v10',10,65,25,'FWD'),
    ('11v11',1,50,90,'GK'),('11v11',2,20,75,'DEF'),('11v11',3,40,75,'DEF'),('11v11',4,60,75,'DEF'),('11v11',5,80,75,'DEF'),('11v11',6,20,50,'MID'),('11v11',7,40,50,'MID'),('11v11',8,60,50,'MID'),('11v11',9,80,50,'MID'),('11v11',10,35,25,'FWD'),('11v11',11,65,25,'FWD')
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('id', p_prefix || '_' || (ord - 1)::text,
                       'role', role, 'x', x, 'y', y, 'status', 'OPEN')
    ORDER BY ord), '[]'::jsonb)
  FROM f WHERE size = p_size;
$$;
REVOKE ALL ON FUNCTION public._default_formation_slots(text, text) FROM PUBLIC, anon, authenticated;

-- admin_create_match__core: 'P' üreteci yerine kanonik diziliş.
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

  -- Slot verilmediyse: oyuncu tarafıyla AYNI kanonik varsayılan diziliş.
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

  -- TEK LOBİ KURALI: oluşturma YAPI kurar — doluluk anahtarları sıyrılır.
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
    "refereeId", "creatorId", captain_id, pitch_id, "isDemo",
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
    '[]'::jsonb, -- kart dili tek: aranan sayı açık slotlardan hesaplanır
    v_slots,
    v_away,
    NULLIF(p_payload->>'refereeId', '')::uuid,
    NULLIF(p_payload->>'creatorId', '')::uuid,
    NULLIF(p_payload->>'creatorId', '')::uuid,
    NULLIF(p_payload->>'pitch_id', '')::uuid,
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
