-- =============================================================================
-- Migration: admin_create_match — pitch_id bağlama + format'a göre kadro slotları
-- =============================================================================
-- Kaynak: 20260701000001'deki admin_create_match gövdesi okunarak, iki düzeltme
-- ile yeniden tanımlandı:
--   (a) INSERT artık pitch_id yazar (NULLIF(p_payload->>'pitch_id','')::uuid) —
--       maçı sahaya bağlar (owner kredisi + iade akışı buna dayanır). Eski RPC
--       pitch_id'i hiç eklemiyordu, bu yüzden client pitch_id gönderse de kayboluyordu.
--   (b) Slot şablonu verilmediğinde sabit 4 slotluk şablon yerine `format` alanına
--       göre taraf başına slot üretilir: 5v5→5, 6v6→6, 7v7→7, 8v8→8, 11v11→11.
--       Hem `slots` hem `"awaySlots"` JSONB dizileri doldurulur; her eleman
--       {"id":..., "role":"P", "status":"OPEN", "userId":null} şeklindedir.
--
-- ⚠️ RBAC KORUMASI: 20260710000006 (Wave 8) admin_create_match'i
--    admin_create_match__core olarak yeniden adlandırıp require_admin_role(['MODERATOR'])
--    kapılı bir sarmalayıcıyla sardı ve "gelecek migration'lar sarmalayıcıyı
--    CREATE OR REPLACE ile EZMEMELİ; davranış değişikliği __core üzerinde yapılmalı"
--    uyarısını koydu. Bu yüzden düzeltme __core'a uygulanır; RBAC kapısı (sarmalayıcı
--    admin_create_match) ve is_platform_admin() koruması olduğu gibi korunur.
--    İmza ve dönüş tipi orijinalle birebir aynıdır: (p_payload jsonb) RETURNS uuid.
-- =============================================================================

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
  v_per_side INT;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  -- Slot şablonu verilmediyse format'a göre taraf başına slot üret (hem ev hem deplasman).
  IF jsonb_array_length(v_slots) = 0 THEN
    v_per_side := CASE v_format
      WHEN '5v5'   THEN 5
      WHEN '6v6'   THEN 6
      WHEN '7v7'   THEN 7
      WHEN '8v8'   THEN 8
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

  INSERT INTO public.matches (
    id, title, location, date, "time", price, difficulty, status, format,
    image, badges, "minRating", "missingPositions", slots, "awaySlots",
    "refereeId", ref_id, "creatorId", captain_id, pitch_id, "isDemo"
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
    NULLIF(p_payload->>'refereeId', '')::uuid,
    NULLIF(p_payload->>'creatorId', '')::uuid,
    NULLIF(p_payload->>'creatorId', '')::uuid,
    NULLIF(p_payload->>'pitch_id', '')::uuid,
    COALESCE((p_payload->>'isDemo')::boolean, false)
  );
  PERFORM public.log_admin_action('MATCH_CREATE', 'match', v_id, p_payload->>'title', NULL, p_payload);
  RETURN v_id;
END;
$function$;

-- __core dışa kapalı kalmalı: API yüzeyi yalnız RBAC kapılı sarmalayıcı (admin_create_match).
-- CREATE OR REPLACE mevcut izinleri korur; yine de güvenli tarafta kalmak için tekrar kapatılır.
REVOKE ALL ON FUNCTION public.admin_create_match__core(jsonb) FROM PUBLIC, anon, authenticated;
