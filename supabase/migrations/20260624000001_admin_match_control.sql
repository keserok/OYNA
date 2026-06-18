-- Admin Maç Kontrol — tam yetki RPC'leri + RLS düzeltmesi
-- OYNA OS MatchesPage

-- Eksik kolonlar (uygulama + demo seed ile uyumlu)
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS price NUMERIC DEFAULT 0;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS image TEXT;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS "minRating" NUMERIC DEFAULT 3.0;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS "missingPositions" JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS "refereeId" UUID;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS "creatorId" UUID;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS refund_status TEXT;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- RLS: is_platform_admin() kullan
DROP POLICY IF EXISTS "Creators or Admins can update matches" ON public.matches;
CREATE POLICY "Creators or platform admins can update matches" ON public.matches
FOR UPDATE USING (
  auth.uid() = captain_id OR public.is_platform_admin()
);

DROP POLICY IF EXISTS "Creators or Admins can delete matches" ON public.matches;
CREATE POLICY "Creators or platform admins can delete matches" ON public.matches
FOR DELETE USING (
  auth.uid() = captain_id OR public.is_platform_admin()
);

DROP POLICY IF EXISTS "Authenticated users can create matches" ON public.matches;
CREATE POLICY "Authenticated users can create matches" ON public.matches
FOR INSERT WITH CHECK (
  auth.role() = 'authenticated' AND (
    auth.uid() = captain_id OR captain_id IS NULL OR public.is_platform_admin()
  )
);

-- Slot JSONB yardımcıları
CREATE OR REPLACE FUNCTION public._admin_patch_slot(
  p_slots JSONB,
  p_slot_id TEXT,
  p_patch JSONB
) RETURNS JSONB LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(jsonb_agg(
    CASE WHEN elem->>'id' = p_slot_id THEN elem || p_patch ELSE elem END
  ), '[]'::jsonb)
  FROM jsonb_array_elements(COALESCE(p_slots, '[]'::jsonb)) AS elem;
$$;

-- Liste + arama
CREATE OR REPLACE FUNCTION public.admin_fetch_matches(
  p_search TEXT DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_limit INT DEFAULT 100,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  location TEXT,
  date DATE,
  "time" TEXT,
  price NUMERIC,
  difficulty TEXT,
  status TEXT,
  format TEXT,
  image TEXT,
  "minRating" NUMERIC,
  badges JSONB,
  "missingPositions" JSONB,
  slots JSONB,
  away_slots JSONB,
  "refereeId" UUID,
  "creatorId" UUID,
  "isDemo" BOOLEAN,
  cancel_reason TEXT,
  refund_status TEXT,
  created_at TIMESTAMPTZ,
  total_count BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  RETURN QUERY
  SELECT
    m.id,
    m.title,
    m.location,
    m.date,
    m."time",
    COALESCE(m.price, m.budget, 0)::numeric AS price,
    m.difficulty,
    m.status,
    m.format,
    m.image,
    m."minRating",
    m.badges,
    m."missingPositions",
    m.slots,
    COALESCE(m.away_slots, '[]'::jsonb) AS away_slots,
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
$$;

-- Tekil maç
CREATE OR REPLACE FUNCTION public.admin_get_match(p_match_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row public.matches;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT * INTO v_row FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Maç bulunamadı'; END IF;
  RETURN to_jsonb(v_row);
END;
$$;

-- Oluştur
CREATE OR REPLACE FUNCTION public.admin_create_match(p_payload JSONB)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
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
    image, badges, "minRating", "missingPositions", slots, away_slots,
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
$$;

-- Güncelle
CREATE OR REPLACE FUNCTION public.admin_update_match(p_match_id UUID, p_payload JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
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
    away_slots = CASE WHEN p_payload ? 'awaySlots' OR p_payload ? 'away_slots'
      THEN COALESCE(p_payload->'awaySlots', p_payload->'away_slots') ELSE away_slots END,
    "refereeId" = COALESCE(NULLIF(p_payload->>'refereeId', '')::uuid, "refereeId"),
    ref_id = COALESCE(NULLIF(p_payload->>'refereeId', '')::uuid, ref_id)
  WHERE id = p_match_id;
  PERFORM public.log_admin_action('MATCH_UPDATE', 'match', p_match_id, p_payload->>'title', v_old, p_payload);
  RETURN TRUE;
END;
$$;

-- İptal
CREATE OR REPLACE FUNCTION public.admin_cancel_match(
  p_match_id UUID,
  p_reason TEXT DEFAULT NULL,
  p_refund BOOLEAN DEFAULT false
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  UPDATE public.matches SET
    status = 'CANCELLED',
    cancel_reason = COALESCE(p_reason, cancel_reason),
    refund_status = CASE WHEN p_refund THEN 'PENDING' ELSE refund_status END
  WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Maç bulunamadı'; END IF;
  PERFORM public.log_admin_action('MATCH_CANCEL', 'match', p_match_id, p_reason, NULL,
    jsonb_build_object('refund', p_refund));
  RETURN TRUE;
END;
$$;

-- Durum
CREATE OR REPLACE FUNCTION public.admin_set_match_status(p_match_id UUID, p_status TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_old TEXT;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT status INTO v_old FROM public.matches WHERE id = p_match_id;
  IF v_old IS NULL THEN RAISE EXCEPTION 'Maç bulunamadı'; END IF;
  UPDATE public.matches SET status = p_status WHERE id = p_match_id;
  PERFORM public.log_admin_action('MATCH_STATUS', 'match', p_match_id, p_status, jsonb_build_object('old', v_old), jsonb_build_object('new', p_status));
  RETURN TRUE;
END;
$$;

-- Slot'tan çıkar
CREATE OR REPLACE FUNCTION public.admin_kick_from_slot(
  p_match_id UUID,
  p_slot_id TEXT,
  p_is_away BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_slots JSONB;
  v_updated JSONB;
  v_col TEXT;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_is_away THEN
    SELECT away_slots INTO v_slots FROM public.matches WHERE id = p_match_id FOR UPDATE;
    v_updated := public._admin_patch_slot(v_slots, p_slot_id, '{"status":"OPEN","player":null}'::jsonb);
    UPDATE public.matches SET away_slots = v_updated WHERE id = p_match_id;
    v_col := 'away_slots';
  ELSE
    SELECT slots INTO v_slots FROM public.matches WHERE id = p_match_id FOR UPDATE;
    v_updated := public._admin_patch_slot(v_slots, p_slot_id, '{"status":"OPEN","player":null}'::jsonb);
    UPDATE public.matches SET slots = v_updated WHERE id = p_match_id;
    v_col := 'slots';
  END IF;
  PERFORM public.log_admin_action('MATCH_KICK_SLOT', 'match', p_match_id, p_slot_id, NULL,
    jsonb_build_object('is_away', p_is_away));
  RETURN v_updated;
END;
$$;

-- Slota ata
CREATE OR REPLACE FUNCTION public.admin_assign_to_slot(
  p_match_id UUID,
  p_slot_id TEXT,
  p_user_id UUID,
  p_is_away BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
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
    'rating', COALESCE((p.stats->>'rating')::numeric, 5.0)
  ) INTO v_player FROM public.profiles p WHERE id = p_user_id;
  IF v_player IS NULL THEN RAISE EXCEPTION 'Kullanıcı bulunamadı'; END IF;

  IF p_is_away THEN
    SELECT away_slots INTO v_slots FROM public.matches WHERE id = p_match_id FOR UPDATE;
    SELECT elem->>'role' INTO v_role FROM jsonb_array_elements(v_slots) elem WHERE elem->>'id' = p_slot_id;
    v_updated := public._admin_patch_slot(v_slots, p_slot_id,
      jsonb_build_object('status', 'TAKEN', 'player', v_player || jsonb_build_object('position', v_role)));
    UPDATE public.matches SET away_slots = v_updated WHERE id = p_match_id;
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
$$;

-- Hakem ata
CREATE OR REPLACE FUNCTION public.admin_assign_match_referee(p_match_id UUID, p_referee_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  UPDATE public.matches SET
    "refereeId" = NULLIF(p_referee_id::text, '')::uuid,
    ref_id = NULLIF(p_referee_id::text, '')::uuid
  WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Maç bulunamadı'; END IF;
  PERFORM public.log_admin_action('MATCH_ASSIGN_REFEREE', 'match', p_match_id, p_referee_id::text, NULL, NULL);
  RETURN TRUE;
END;
$$;

-- Sil
CREATE OR REPLACE FUNCTION public.admin_delete_match(p_match_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_title TEXT;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT title INTO v_title FROM public.matches WHERE id = p_match_id;
  IF v_title IS NULL THEN RAISE EXCEPTION 'Maç bulunamadı'; END IF;
  DELETE FROM public.matches WHERE id = p_match_id;
  PERFORM public.log_admin_action('MATCH_DELETE', 'match', p_match_id, v_title, NULL, NULL);
  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_fetch_matches(text, text, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_match(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_match(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_match(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cancel_match(uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_match_status(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_kick_from_slot(uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_assign_to_slot(uuid, text, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_assign_match_referee(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_match(uuid) TO authenticated;
