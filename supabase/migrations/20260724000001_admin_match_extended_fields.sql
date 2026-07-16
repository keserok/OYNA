-- =============================================================================
-- Migration: Admin maç RPC'leri maçın TAM DNA'sını yazsın
--   visibility · private_code · duration · gender · "ageGroup"
-- =============================================================================
-- Sorun: admin panelinden kurulan/düzenlenen maçlar bu alanları TAŞIMIYORDU.
--   - admin_create_match__core INSERT'i bu kolonları hiç yazmıyordu (visibility
--     hep DEFAULT 'OPEN', diğerleri NULL kalıyordu).
--   - admin_update_match__core bu kolonları güncellemiyordu.
-- Oyuncu uygulamasının maç filtreleri (yaş/cinsiyet/süre/format) ve özel-maç
-- (kodla katılım) akışı bu kolonlara dayanır → admin maçları filtrelerde eksik
-- çıkıyor, özel maçların kodu yönetilemiyordu.
--
-- 🐛 EK DÜZELTME: Canlı gövdeler var olmayan `ref_id` kolonuna yazıyordu
--   (matches tablosunda yalnız "refereeId" var; ref_id yok) → admin maç
--   oluşturma/güncelleme RUNTIME'da "column ref_id does not exist" ile
--   kırılıyordu. Bu göç ref_id referanslarını kaldırarak hatayı da giderir.
--
-- ⚠️ RBAC deseni korunur (Wave 8, 20260710000006): davranış yalnız __core
--    gövdelerinde değişir. require_admin_role(['MODERATOR']) kapılı sarmalayıcılar
--    (admin_create_match / admin_update_match) ve is_platform_admin() koruması
--    DOKUNULMAZ. İmzalar birebir korunur:
--      admin_create_match__core(p_payload jsonb) RETURNS uuid
--      admin_update_match__core(p_match_id uuid, p_payload jsonb) RETURNS boolean
-- =============================================================================

-- ─── CREATE ──────────────────────────────────────────────────────────────────
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
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  -- Slot şablonu verilmediyse format'a göre taraf başına slot üret (9 format: 3v3–11v11).
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

  -- Özel maç: kod verilmediyse üret; OPEN maçta kod tutulmaz.
  IF v_visibility = 'PRIVATE' AND v_code IS NULL THEN
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  ELSIF v_visibility <> 'PRIVATE' THEN
    v_code := NULL;
  ELSE
    v_code := upper(v_code);
  END IF;

  INSERT INTO public.matches (
    id, title, location, date, "time", price, difficulty, status, format,
    image, badges, "minRating", "missingPositions", slots, "awaySlots",
    "refereeId", "creatorId", captain_id, pitch_id, "isDemo",
    visibility, private_code, duration, gender, "ageGroup"
  ) VALUES (
    v_id,
    COALESCE(p_payload->>'title', 'Yeni Maç'),
    COALESCE(p_payload->>'location', ''),
    COALESCE((p_payload->>'date')::date, CURRENT_DATE),
    COALESCE(p_payload->>'time', '20:00'),
    COALESCE((p_payload->>'price')::numeric, 0),
    COALESCE(p_payload->>'difficulty', 'Rahat'),
    COALESCE(p_payload->>'status', 'ACTIVE'),
    v_format,
    p_payload->>'image',
    COALESCE(p_payload->'badges', '[]'::jsonb),
    COALESCE((p_payload->>'minRating')::numeric, 3.0),
    v_missing,
    v_slots,
    v_away,
    NULLIF(p_payload->>'refereeId', '')::uuid,
    NULLIF(p_payload->>'creatorId', '')::uuid,
    NULLIF(p_payload->>'creatorId', '')::uuid,
    NULLIF(p_payload->>'pitch_id', '')::uuid,
    COALESCE((p_payload->>'isDemo')::boolean, false),
    v_visibility,
    v_code,
    NULLIF(p_payload->>'duration', ''),
    NULLIF(p_payload->>'gender', ''),
    NULLIF(p_payload->>'ageGroup', '')
  );
  PERFORM public.log_admin_action('MATCH_CREATE', 'match', v_id, p_payload->>'title', NULL, p_payload);
  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_create_match__core(jsonb) FROM PUBLIC, anon, authenticated;

-- ─── UPDATE ──────────────────────────────────────────────────────────────────
-- Gövde CANLI admin_update_match__core (prod) okunarak yeniden tanımlandı; canlı
-- imza/yetki (yalnız is_platform_admin) KORUNDU, var olmayan ref_id yazımı
-- KALDIRILDI (bug fix) ve DNA kolonları eklendi. RBAC sarmalayıcısı
-- (admin_update_match) korunur.
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
    date = COALESCE((p_payload->>'date')::date, date),
    "time" = COALESCE(p_payload->>'time', "time"),
    price = COALESCE((p_payload->>'price')::numeric, price),
    difficulty = COALESCE(p_payload->>'difficulty', difficulty),
    status = COALESCE(p_payload->>'status', status),
    format = COALESCE(p_payload->>'format', format),
    image = COALESCE(p_payload->>'image', image),
    "minRating" = COALESCE((p_payload->>'minRating')::numeric, "minRating"),
    badges = COALESCE(p_payload->'badges', badges),
    "missingPositions" = COALESCE(p_payload->'missingPositions', "missingPositions"),
    slots = CASE WHEN p_payload ? 'slots' THEN p_payload->'slots' ELSE slots END,
    "awaySlots" = CASE WHEN p_payload ? 'awaySlots' OR p_payload ? 'away_slots'
      THEN COALESCE(p_payload->'awaySlots', p_payload->'away_slots') ELSE "awaySlots" END,
    "refereeId" = COALESCE(NULLIF(p_payload->>'refereeId', '')::uuid, "refereeId"),
    -- FAZ 3 + admin DNA: süre/cinsiyet/yaş/görünürlük/özel kod
    duration = CASE WHEN p_payload ? 'duration' THEN NULLIF(p_payload->>'duration','') ELSE duration END,
    gender = CASE WHEN p_payload ? 'gender' THEN NULLIF(p_payload->>'gender','') ELSE gender END,
    "ageGroup" = CASE WHEN p_payload ? 'ageGroup' THEN NULLIF(p_payload->>'ageGroup','') ELSE "ageGroup" END,
    visibility = CASE WHEN p_payload ? 'visibility' AND (p_payload->>'visibility') IN ('OPEN','PRIVATE')
                      THEN p_payload->>'visibility' ELSE visibility END,
    private_code = CASE
      -- Admin açık bir kod verdiyse onu yaz (özel kod düzenleme)
      WHEN NULLIF(p_payload->>'private_code','') IS NOT NULL THEN upper(p_payload->>'private_code')
      -- PRIVATE'a geçiş + kod yoksa üret
      WHEN COALESCE(NULLIF(p_payload->>'visibility',''), visibility) = 'PRIVATE' AND private_code IS NULL
      THEN upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
      ELSE private_code END
  WHERE id = p_match_id;
  PERFORM public.log_admin_action('MATCH_UPDATE', 'match', p_match_id, p_payload->>'title', v_old, p_payload);
  RETURN TRUE;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_update_match__core(uuid, jsonb) FROM PUBLIC, anon, authenticated;
