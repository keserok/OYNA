-- ============================================================================
-- TEK MAÇ LOBİSİ — PAKET 5: Admin paneli uyumu + legacy yazım yolu sökümü
--
--  • matches.is_platform: admin maçları "OYNA Organizasyonu" rozetiyle ayrışır
--    (kaporasız platform maçı — 16A kararı).
--  • admin_create_match__core / admin_update_match__core: P1'de kaldırılan
--    private_code kolonuna yazmayı bırakır (kod → match_private_codes),
--    starts_at üretir (konum bazlı vitrine düşme şartı), slotları yapıya
--    normalize eder ve tam-slot yazımında satın alma anahtarlarını KORUR.
--  • Legacy tekli-katılım RPC'leri DÜŞÜRÜLÜR (yayın öncesi karar: tombstone
--    gerekmez): join_public_match_slot(+__inner), player_buy_slots v1(+__inner),
--    plei dönemi join_match_slot. Tek satın alma yolu: player_buy_slots_v2.
-- ============================================================================

-- ─── 1) is_platform kolonu (idempotent) ─────────────────────────────────────
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS is_platform boolean NOT NULL DEFAULT false;

-- ─── 2) Tam-slot yazımlarında satın alma anahtarlarını koruyan yardımcı ─────
-- Admin panelinin drawer düzenlemeleri slots dizisini bütün olarak gönderir;
-- bu birleştirici, aynı id'li eski slottaki purchasedBy/occupant/assignmentStatus/
-- claimCode anahtarlarını yeni dizinin üstüne taşır — admin düzenlemesi ödeme
-- durumunu asla silemez (drift kapısı kapalı).
CREATE OR REPLACE FUNCTION public._merge_slot_purchase_keys(p_old jsonb, p_new jsonb)
RETURNS jsonb
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(jsonb_agg(
    CASE WHEN o.slot IS NULL OR o.slot->>'purchasedBy' IS NULL THEN n.slot
    ELSE n.slot
         || jsonb_build_object(
              'status', 'TAKEN',
              'purchasedBy', o.slot->>'purchasedBy',
              'assignmentStatus', COALESCE(n.slot->>'assignmentStatus', o.slot->>'assignmentStatus', 'RESERVED'))
         || CASE WHEN o.slot ? 'occupant' AND NOT (n.slot ? 'occupant')
                 THEN jsonb_build_object('occupant', o.slot->>'occupant') ELSE '{}'::jsonb END
         || CASE WHEN o.slot ? 'claimCode' AND NOT (n.slot ? 'claimCode')
                 THEN jsonb_build_object('claimCode', o.slot->>'claimCode') ELSE '{}'::jsonb END
    END ORDER BY n.ord)
  , '[]'::jsonb)
  FROM jsonb_array_elements(COALESCE(p_new, '[]'::jsonb)) WITH ORDINALITY AS n(slot, ord)
  LEFT JOIN LATERAL (
    SELECT o2 AS slot FROM jsonb_array_elements(COALESCE(p_old, '[]'::jsonb)) o2
    WHERE o2->>'id' = n.slot->>'id' LIMIT 1
  ) o ON TRUE;
$$;
REVOKE ALL ON FUNCTION public._merge_slot_purchase_keys(jsonb, jsonb) FROM PUBLIC, anon, authenticated;

-- ─── 3) admin_create_match__core — kodsuz kolon + starts_at + is_platform ───
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
  v_missing JSONB := COALESCE(p_payload->'missingPositions', '[]'::jsonb);
  v_format TEXT := COALESCE(p_payload->>'format', '7v7');
  v_visibility TEXT := CASE WHEN COALESCE(p_payload->>'visibility', 'OPEN') = 'PRIVATE'
                            THEN 'PRIVATE' ELSE 'OPEN' END;
  v_code TEXT := NULLIF(p_payload->>'private_code', '');
  v_per_side INT;
  v_date DATE := COALESCE(NULLIF(p_payload->>'date','')::date, CURRENT_DATE);
  v_time TEXT := COALESCE(p_payload->>'time', '20:00');
  v_time_norm TEXT;
  v_starts_at timestamptz;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  IF jsonb_array_length(v_slots) = 0 THEN
    v_per_side := CASE v_format
      WHEN '3v3'   THEN 3
      WHEN '4v4'   THEN 4
      WHEN '5v5'   THEN 5
      WHEN '6v6'   THEN 6
      WHEN '7v7'   THEN 7
      WHEN '8v8'   THEN 8
      WHEN '9v9'   THEN 9
      WHEN '10v10' THEN 10
      WHEN '11v11' THEN 11
      ELSE 7
    END;
    SELECT jsonb_agg(jsonb_build_object('id', 'h' || g, 'role', 'P', 'status', 'OPEN', 'userId', NULL) ORDER BY g)
      INTO v_slots
      FROM generate_series(1, v_per_side) AS g;
    IF jsonb_array_length(v_away) = 0 THEN
      SELECT jsonb_agg(jsonb_build_object('id', 'a' || g, 'role', 'P', 'status', 'OPEN', 'userId', NULL) ORDER BY g)
        INTO v_away
        FROM generate_series(1, v_per_side) AS g;
    END IF;
    IF jsonb_array_length(v_missing) = 0 THEN
      v_missing := jsonb_build_array(jsonb_build_object('role', 'P', 'count', v_per_side));
    END IF;
  END IF;

  -- TEK LOBİ KURALI admin için de geçerli: oluşturma YAPI kurar; slotlar
  -- OPEN'a normalize edilir, oyuncu/satın alma anahtarları sıyrılır.
  SELECT COALESCE(jsonb_agg(
    (s - 'player' - 'occupant' - 'purchasedBy' - 'assignmentStatus' - 'inviteeId' - 'claimCode')
    || jsonb_build_object('status', 'OPEN') ORDER BY ord), '[]'::jsonb)
  INTO v_slots FROM jsonb_array_elements(v_slots) WITH ORDINALITY AS t(s, ord);
  SELECT COALESCE(jsonb_agg(
    (s - 'player' - 'occupant' - 'purchasedBy' - 'assignmentStatus' - 'inviteeId' - 'claimCode')
    || jsonb_build_object('status', 'OPEN') ORDER BY ord), '[]'::jsonb)
  INTO v_away FROM jsonb_array_elements(v_away) WITH ORDINALITY AS t(s, ord);

  IF v_visibility = 'PRIVATE' AND v_code IS NULL THEN
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  ELSIF v_visibility <> 'PRIVATE' THEN
    v_code := NULL;
  ELSE
    v_code := upper(v_code);
  END IF;

  -- Konum bazlı vitrine düşme şartı: starts_at zorunlu üretim.
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
    v_missing,
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

-- ─── 4) admin_update_match__core — kod kolonu yok + satın alma koruması ─────
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
    -- matches.date TEXT'tir: eski (p_payload->>'date')::date COALESCE'u 42804
    -- ile fonksiyonu KIRIYORDU (duman testi buldu) — metin olarak yaz.
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
    -- Tam-slot yazımında satın alma anahtarları KORUNUR (drift kapısı kapalı).
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
    starts_at = CASE
      WHEN (p_payload ? 'date' OR p_payload ? 'time')
           AND COALESCE(NULLIF(p_payload->>'date',''), date) ~ '^\d{4}-\d{2}-\d{2}$' THEN
        ((COALESCE(NULLIF(p_payload->>'date',''), date))::date
         + (COALESCE((SELECT (regexp_match(replace(COALESCE(p_payload->>'time', "time"), '.', ':'), '\d{1,2}:\d{2}'))[1]), '20:00') || ':00')::time)::timestamptz
      ELSE starts_at END
  WHERE id = p_match_id;

  -- PRIVATE'a geçişte / özel kod gönderiminde kod tablosunu besle.
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

-- ─── 5) Legacy yazım yolları DÜŞER (yayın öncesi — tombstone gerekmez) ──────
-- Tek satın alma/katılım yolu artık player_buy_slots_v2 (+ self_assign/assign/
-- claim). player_accept_slot legacy INVITED kabulü için BİLİNÇLİ tutulur.
DROP FUNCTION IF EXISTS public.join_public_match_slot(uuid, text, uuid, boolean);
DROP FUNCTION IF EXISTS public.join_public_match_slot__inner(uuid, text, uuid, boolean);
DROP FUNCTION IF EXISTS public.player_buy_slots(uuid, text[]);
DROP FUNCTION IF EXISTS public.player_buy_slots__inner(uuid, text[]);
DROP FUNCTION IF EXISTS public.join_match_slot(uuid, uuid, character varying, character varying);
