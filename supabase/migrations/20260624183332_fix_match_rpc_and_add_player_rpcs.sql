-- [DB GEÇMİŞİNDEN KURTARILDI 2026-07-11] Bu migration canlı veritabanına uygulanmıştı ancak repoda dosyası yoktu; supabase_migrations.schema_migrations.statements kolonundan geri çıkarıldı.

-- ── 1. admin_create_match: away_slots -> "awaySlots" ────────────────────────
CREATE OR REPLACE FUNCTION public.admin_create_match(p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id UUID := gen_random_uuid();
  v_slots JSONB := COALESCE(p_payload->'slots', '[]'::jsonb);
  v_missing JSONB := COALESCE(p_payload->'missingPositions', '[]'::jsonb);
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF jsonb_array_length(v_slots) = 0 THEN
    v_slots := '[
      {"id":"s1","role":"GK","x":50,"y":90,"status":"OPEN"},
      {"id":"s2","role":"DEF","x":30,"y":70,"status":"OPEN"},
      {"id":"s3","role":"MID","x":50,"y":50,"status":"OPEN"},
      {"id":"s4","role":"FW","x":50,"y":20,"status":"OPEN"}
    ]'::jsonb;
    v_missing := '[{"role":"GK","count":1},{"role":"DEF","count":1}]'::jsonb;
  END IF;
  INSERT INTO public.matches (
    id, title, location, date, "time", price, difficulty, status, format,
    image, badges, "minRating", "missingPositions", slots, "awaySlots",
    "refereeId", ref_id, "creatorId", captain_id, "isDemo"
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
    p_payload->>'image',
    COALESCE(p_payload->'badges', '[]'::jsonb),
    COALESCE((p_payload->>'minRating')::numeric, 3.0),
    v_missing,
    v_slots,
    COALESCE(p_payload->'awaySlots', p_payload->'away_slots', '[]'::jsonb),
    NULLIF(p_payload->>'refereeId', '')::uuid,
    NULLIF(p_payload->>'refereeId', '')::uuid,
    NULLIF(p_payload->>'creatorId', '')::uuid,
    NULLIF(p_payload->>'creatorId', '')::uuid,
    COALESCE((p_payload->>'isDemo')::boolean, false)
  );
  PERFORM public.log_admin_action('MATCH_CREATE', 'match', v_id, p_payload->>'title', NULL, p_payload);
  RETURN v_id;
END;
$function$;

-- ── 2. admin_update_match: away_slots -> "awaySlots" ────────────────────────
CREATE OR REPLACE FUNCTION public.admin_update_match(p_match_id uuid, p_payload jsonb)
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
    ref_id = COALESCE(NULLIF(p_payload->>'refereeId', '')::uuid, ref_id)
  WHERE id = p_match_id;
  PERFORM public.log_admin_action('MATCH_UPDATE', 'match', p_match_id, p_payload->>'title', v_old, p_payload);
  RETURN TRUE;
END;
$function$;

-- ── 3. admin_fetch_matches: m.away_slots -> m."awaySlots" ───────────────────
DROP FUNCTION IF EXISTS public.admin_fetch_matches(text, text, integer, integer);
CREATE FUNCTION public.admin_fetch_matches(p_search text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, title text, location text, date date, "time" text, price numeric, difficulty text, status text, format text, image text, "minRating" numeric, badges jsonb, "missingPositions" jsonb, slots jsonb, away_slots jsonb, "refereeId" uuid, "creatorId" uuid, "isDemo" boolean, cancel_reason text, refund_status text, created_at timestamp with time zone, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  RETURN QUERY
  SELECT
    m.id,
    m.title,
    m.location,
    m.date,
    m."time",
    COALESCE(m.price, 0)::numeric AS price,
    m.difficulty,
    m.status,
    m.format,
    m.image,
    m."minRating",
    m.badges,
    m."missingPositions",
    m.slots,
    COALESCE(m."awaySlots", '[]'::jsonb) AS away_slots,
    COALESCE(m."refereeId", m.ref_id) AS "refereeId",
    COALESCE(m."creatorId", m.captain_id) AS "creatorId",
    COALESCE(m."isDemo", false) AS "isDemo",
    m.cancel_reason,
    m.refund_status,
    m.created_at,
    COUNT(*) OVER() AS total_count
  FROM public.matches m
  WHERE (
    p_search IS NULL OR p_search = '' OR
    m.title ILIKE '%' || p_search || '%' OR
    m.location ILIKE '%' || p_search || '%' OR
    m.id::text ILIKE '%' || p_search || '%'
  )
  AND (
    p_status IS NULL OR p_status = '' OR p_status = 'ALL' OR
    m.status ILIKE p_status OR
    (p_status = 'ACTIVE' AND m.status IN ('ACTIVE', 'OPEN', 'CONFIRMED')) OR
    (p_status = 'DRAFT' AND m.status IN ('DRAFT', 'OPEN'))
  )
  ORDER BY m.created_at DESC NULLS LAST, m.date DESC NULLS LAST
  LIMIT GREATEST(p_limit, 1)
  OFFSET GREATEST(p_offset, 0);
END;
$function$;

-- ── 4. admin_assign_to_slot: away_slots -> "awaySlots", p.stats -> p.rating ──
CREATE OR REPLACE FUNCTION public.admin_assign_to_slot(p_match_id uuid, p_slot_id text, p_user_id uuid, p_is_away boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_slots JSONB;
  v_updated JSONB;
  v_player JSONB;
  v_role TEXT;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT jsonb_build_object(
    'id', p.id,
    'name', COALESCE(p.full_name, p.email),
    'avatar', p.avatar_url,
    'rating', COALESCE(p.rating, 5.0)
  ) INTO v_player FROM public.profiles p WHERE id = p_user_id;
  IF v_player IS NULL THEN RAISE EXCEPTION 'Kullanıcı bulunamadı'; END IF;

  IF p_is_away THEN
    SELECT "awaySlots" INTO v_slots FROM public.matches WHERE id = p_match_id FOR UPDATE;
    SELECT elem->>'role' INTO v_role FROM jsonb_array_elements(v_slots) elem WHERE elem->>'id' = p_slot_id;
    v_updated := public._admin_patch_slot(v_slots, p_slot_id,
      jsonb_build_object('status', 'TAKEN', 'player', v_player || jsonb_build_object('position', v_role)));
    UPDATE public.matches SET "awaySlots" = v_updated WHERE id = p_match_id;
  ELSE
    SELECT slots INTO v_slots FROM public.matches WHERE id = p_match_id FOR UPDATE;
    SELECT elem->>'role' INTO v_role FROM jsonb_array_elements(v_slots) elem WHERE elem->>'id' = p_slot_id;
    v_updated := public._admin_patch_slot(v_slots, p_slot_id,
      jsonb_build_object('status', 'TAKEN', 'player', v_player || jsonb_build_object('position', v_role)));
    UPDATE public.matches SET slots = v_updated WHERE id = p_match_id;
  END IF;
  PERFORM public.log_admin_action('MATCH_ASSIGN_SLOT', 'match', p_match_id, p_user_id::text, NULL,
    jsonb_build_object('slot_id', p_slot_id, 'is_away', p_is_away));
  RETURN v_updated;
END;
$function$;

-- ── 5. admin_kick_from_slot: away_slots -> "awaySlots" ───────────────────────
CREATE OR REPLACE FUNCTION public.admin_kick_from_slot(p_match_id uuid, p_slot_id text, p_is_away boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_slots JSONB;
  v_updated JSONB;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_is_away THEN
    SELECT "awaySlots" INTO v_slots FROM public.matches WHERE id = p_match_id FOR UPDATE;
    v_updated := public._admin_patch_slot(v_slots, p_slot_id, '{"status":"OPEN","player":null}'::jsonb);
    UPDATE public.matches SET "awaySlots" = v_updated WHERE id = p_match_id;
  ELSE
    SELECT slots INTO v_slots FROM public.matches WHERE id = p_match_id FOR UPDATE;
    v_updated := public._admin_patch_slot(v_slots, p_slot_id, '{"status":"OPEN","player":null}'::jsonb);
    UPDATE public.matches SET slots = v_updated WHERE id = p_match_id;
  END IF;
  PERFORM public.log_admin_action('MATCH_KICK_SLOT', 'match', p_match_id, p_slot_id, NULL,
    jsonb_build_object('is_away', p_is_away));
  RETURN v_updated;
END;
$function$;

-- ── 6. player_create_match: oyuncunun kendi maçını oluşturması (admin gate YOK) ──
CREATE OR REPLACE FUNCTION public.player_create_match(p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id UUID := gen_random_uuid();
  v_uid UUID := auth.uid();
  v_is_banned boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT is_banned INTO v_is_banned FROM public.profiles WHERE id = v_uid;
  IF v_is_banned THEN RAISE EXCEPTION 'Kullanıcı banlı!'; END IF;

  INSERT INTO public.matches (
    id, title, location, date, "time", price, difficulty, status, format,
    duration, gender, "ageGroup", image, badges, "minRating", "missingPositions",
    slots, "awaySlots", "creatorId", captain_id, "isDemo"
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
    v_uid,
    v_uid,
    false
  );
  RETURN v_id;
END;
$function$;

-- ── 7. player_update_match: katılımcı/kurucu kendi maçını günceller (admin gate YOK) ──
CREATE OR REPLACE FUNCTION public.player_update_match(p_match_id uuid, p_payload jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_is_banned boolean;
  v_is_participant boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT is_banned INTO v_is_banned FROM public.profiles WHERE id = v_uid;
  IF v_is_banned THEN RAISE EXCEPTION 'Kullanıcı banlı!'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.matches m
    WHERE m.id = p_match_id
    AND (
      m."creatorId" = v_uid
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(m.slots, '[]'::jsonb)) s WHERE (s->'player'->>'id')::uuid = v_uid)
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(m."awaySlots", '[]'::jsonb)) s WHERE (s->'player'->>'id')::uuid = v_uid)
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(m."reservePlayers", '[]'::jsonb)) s WHERE (s->>'id')::uuid = v_uid)
    )
  ) INTO v_is_participant;

  IF NOT v_is_participant AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  UPDATE public.matches SET
    slots = CASE WHEN p_payload ? 'slots' THEN p_payload->'slots' ELSE slots END,
    "awaySlots" = CASE WHEN p_payload ? 'awaySlots' THEN p_payload->'awaySlots' ELSE "awaySlots" END,
    "reservePlayers" = CASE WHEN p_payload ? 'reservePlayers' THEN p_payload->'reservePlayers' ELSE "reservePlayers" END,
    "chatMessages" = CASE WHEN p_payload ? 'chatMessages' THEN p_payload->'chatMessages' ELSE "chatMessages" END,
    "homeTeamId" = CASE WHEN p_payload ? 'homeTeamId' THEN NULLIF(p_payload->>'homeTeamId', '')::uuid ELSE "homeTeamId" END,
    "awayTeamId" = CASE WHEN p_payload ? 'awayTeamId' THEN NULLIF(p_payload->>'awayTeamId', '')::uuid ELSE "awayTeamId" END,
    status = CASE WHEN p_payload ? 'status' THEN p_payload->>'status' ELSE status END,
    format = CASE WHEN p_payload ? 'format' THEN p_payload->>'format' ELSE format END,
    duration = CASE WHEN p_payload ? 'duration' THEN p_payload->>'duration' ELSE duration END,
    gender = CASE WHEN p_payload ? 'gender' THEN p_payload->>'gender' ELSE gender END,
    "ageGroup" = CASE WHEN p_payload ? 'ageGroup' THEN p_payload->>'ageGroup' ELSE "ageGroup" END,
    "homeScore" = CASE WHEN p_payload ? 'homeScore' THEN (p_payload->>'homeScore')::int ELSE "homeScore" END,
    "awayScore" = CASE WHEN p_payload ? 'awayScore' THEN (p_payload->>'awayScore')::int ELSE "awayScore" END,
    "scoreEnteredAt" = CASE WHEN p_payload ? 'scoreEnteredAt' THEN (p_payload->>'scoreEnteredAt')::timestamptz ELSE "scoreEnteredAt" END
  WHERE id = p_match_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Maç bulunamadı'; END IF;
  RETURN TRUE;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.player_create_match(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.player_update_match(uuid, jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.player_create_match(jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.player_update_match(uuid, jsonb) FROM anon;
