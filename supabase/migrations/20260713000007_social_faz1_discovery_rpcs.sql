-- ================================================================
-- SOSYAL AŞAMA 1.6 — Keşif RPC'leri (Spec §6 / Bölüm B)
-- search_users · match_contacts · get_recent_teammates · get_friend_suggestions
-- Gizlilik kuralları SUNUCUDA: banned/is_searchable/discoverable_by_phone/engel.
-- ================================================================

-- ── 1) Kullanıcı arama (isim + @oyna_id, Türkçe-normalize) ──
CREATE OR REPLACE FUNCTION public.search_users(
  p_q text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
RETURNS TABLE (
  user_id        uuid,
  full_name      text,
  avatar_url     text,
  oyna_id        text,
  pos            text,
  relationship   text,
  request_id     uuid,
  mutual_friends integer
) LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_q       text := trim(coalesce(p_q, ''));
  v_norm    text;
  v_id_mode boolean := false;
  v_limit   integer := least(greatest(coalesce(p_limit, 20), 1), 50);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF left(v_q, 1) = '@' THEN v_id_mode := true; v_q := substr(v_q, 2); END IF;
  v_norm := public.normalize_tr(v_q);
  IF length(v_norm) < 2 THEN RETURN; END IF;

  RETURN QUERY
  WITH my_friends AS (
    SELECT CASE WHEN f.requester_id = v_uid THEN f.addressee_id ELSE f.requester_id END AS fid
    FROM public.friendships f
    WHERE f.status = 'ACCEPTED' AND (f.requester_id = v_uid OR f.addressee_id = v_uid)
  )
  SELECT
    p.id,
    coalesce(p.full_name, p.name::text, 'Oyuncu'),
    p.avatar_url,
    p.oyna_id,
    p.player_card->>'position',
    (public._friendship_state(v_uid, p.id)->>'state'),
    nullif(public._friendship_state(v_uid, p.id)->>'request_id', '')::uuid,
    (SELECT count(*)::int FROM public.friendships f2
     WHERE f2.status = 'ACCEPTED'
       AND ((f2.requester_id = p.id AND f2.addressee_id IN (SELECT fid FROM my_friends))
         OR (f2.addressee_id = p.id AND f2.requester_id IN (SELECT fid FROM my_friends))))
  FROM public.profiles p
  WHERE p.id <> v_uid
    AND coalesce(p.is_banned, false) = false
    AND coalesce(p.is_searchable, true) = true
    AND NOT public._is_blocked_between(v_uid, p.id)
    AND (
      (v_id_mode AND lower(coalesce(p.oyna_id, '')) LIKE v_norm || '%')
      OR (NOT v_id_mode AND (
            lower(coalesce(p.oyna_id, '')) LIKE v_norm || '%'
            OR public.normalize_tr(p.full_name) LIKE '%' || v_norm || '%'
            OR public.normalize_tr(p.name::text) LIKE '%' || v_norm || '%'))
    )
  ORDER BY
    (lower(coalesce(p.oyna_id, '')) = v_norm) DESC,
    (lower(coalesce(p.oyna_id, '')) LIKE v_norm || '%') DESC,
    coalesce(p.full_name, p.name::text)
  LIMIT v_limit OFFSET greatest(coalesce(p_offset, 0), 0);
END $$;
REVOKE EXECUTE ON FUNCTION public.search_users(text,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_users(text,integer,integer) TO authenticated;

-- ── 2) Rehber eşleştirme (yalnız hash; eşleşmeyen SAKLANMAZ — Spec B3) ──
CREATE OR REPLACE FUNCTION public.match_contacts(p_hashes text[])
RETURNS TABLE (
  user_id      uuid,
  full_name    text,
  avatar_url   text,
  oyna_id      text,
  relationship text,
  request_id   uuid
) LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_batch     integer := coalesce(array_length(p_hashes, 1), 0);
  v_daily_max integer := public._social_config_int('contact_hash_daily_max', 5000);
  v_used      integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF v_batch = 0 THEN RETURN; END IF;
  IF v_batch > 500 THEN
    RAISE EXCEPTION 'BATCH_TOO_LARGE: Tek seferde en fazla 500 kayıt gönderilebilir.';
  END IF;

  -- Günlük kota (istismar önleme; telefon uzayı sayılabilir olduğundan şart)
  INSERT INTO public.social_rate_usage (user_id, bucket, day, count)
  VALUES (v_uid, 'contact_hash', (timezone('utc', now()))::date, v_batch)
  ON CONFLICT (user_id, bucket, day)
    DO UPDATE SET count = public.social_rate_usage.count + EXCLUDED.count
  RETURNING count INTO v_used;
  IF v_used > v_daily_max THEN
    RAISE EXCEPTION 'QUOTA: Günlük rehber eşleştirme kotası aşıldı.';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    coalesce(p.full_name, p.name::text, 'Oyuncu'),
    p.avatar_url,
    p.oyna_id,
    (public._friendship_state(v_uid, p.id)->>'state'),
    nullif(public._friendship_state(v_uid, p.id)->>'request_id', '')::uuid
  FROM public.profile_contact_hash h
  JOIN public.profiles p ON p.id = h.user_id
  WHERE h.phone_sha256 = ANY (p_hashes)
    AND p.id <> v_uid
    AND coalesce(p.is_banned, false) = false
    AND coalesce(p.discoverable_by_phone, true) = true
    AND NOT public._is_blocked_between(v_uid, p.id);
END $$;
REVOKE EXECUTE ON FUNCTION public.match_contacts(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.match_contacts(text[]) TO authenticated;

-- ── 3) Birlikte oynadıkların (tamamlanmış maçlardan; mevcut arkadaşlar hariç) ──
CREATE OR REPLACE FUNCTION public.get_recent_teammates(p_limit integer DEFAULT 20)
RETURNS TABLE (
  user_id        uuid,
  full_name      text,
  avatar_url     text,
  oyna_id        text,
  pos            text,
  shared_matches integer,
  relationship   text,
  request_id     uuid
) LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  RETURN QUERY
  WITH parts AS (
    SELECT m.id AS mid, x.pid
    FROM public.matches m
    CROSS JOIN LATERAL (
      SELECT DISTINCT
        CASE
          WHEN s->>'occupant' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            THEN (s->>'occupant')::uuid
          WHEN s->'player'->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            THEN (s->'player'->>'id')::uuid
        END AS pid
      FROM jsonb_array_elements(coalesce(m.slots,'[]'::jsonb) || coalesce(m."awaySlots",'[]'::jsonb)) s
    ) x
    WHERE upper(coalesce(m.status, '')) IN ('COMPLETED','FINISHED','SCORED')
      AND x.pid IS NOT NULL
  ),
  my AS (SELECT mid FROM parts WHERE pid = v_uid),
  mates AS (
    SELECT pr.pid, count(*)::int AS shared
    FROM parts pr JOIN my ON my.mid = pr.mid
    WHERE pr.pid <> v_uid
    GROUP BY pr.pid
  )
  SELECT
    p.id,
    coalesce(p.full_name, p.name::text, 'Oyuncu'),
    p.avatar_url,
    p.oyna_id,
    p.player_card->>'position',
    mt.shared,
    (public._friendship_state(v_uid, p.id)->>'state'),
    nullif(public._friendship_state(v_uid, p.id)->>'request_id', '')::uuid
  FROM mates mt
  JOIN public.profiles p ON p.id = mt.pid
  WHERE coalesce(p.is_banned, false) = false
    AND coalesce(p.is_searchable, true) = true
    AND NOT public._is_blocked_between(v_uid, p.id)
    AND NOT public._are_friends(v_uid, p.id)
  ORDER BY mt.shared DESC, coalesce(p.full_name, p.name::text)
  LIMIT v_limit;
END $$;
REVOKE EXECUTE ON FUNCTION public.get_recent_teammates(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_recent_teammates(integer) TO authenticated;

-- ── 4) "Tanıyor olabilirsin" (arkadaşın arkadaşları — ortak arkadaş sayısıyla) ──
CREATE OR REPLACE FUNCTION public.get_friend_suggestions(p_limit integer DEFAULT 10)
RETURNS TABLE (
  user_id        uuid,
  full_name      text,
  avatar_url     text,
  oyna_id        text,
  pos            text,
  mutual_friends integer,
  relationship   text,
  request_id     uuid
) LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 30);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  RETURN QUERY
  WITH my_friends AS (
    SELECT CASE WHEN f.requester_id = v_uid THEN f.addressee_id ELSE f.requester_id END AS fid
    FROM public.friendships f
    WHERE f.status = 'ACCEPTED' AND (f.requester_id = v_uid OR f.addressee_id = v_uid)
  ),
  cand AS (
    SELECT
      CASE WHEN f.requester_id = mf.fid THEN f.addressee_id ELSE f.requester_id END AS pid,
      count(*)::int AS mutual
    FROM public.friendships f
    JOIN my_friends mf
      ON f.status = 'ACCEPTED' AND (f.requester_id = mf.fid OR f.addressee_id = mf.fid)
    GROUP BY 1
  )
  SELECT
    p.id,
    coalesce(p.full_name, p.name::text, 'Oyuncu'),
    p.avatar_url,
    p.oyna_id,
    p.player_card->>'position',
    c.mutual,
    (public._friendship_state(v_uid, p.id)->>'state'),
    nullif(public._friendship_state(v_uid, p.id)->>'request_id', '')::uuid
  FROM cand c
  JOIN public.profiles p ON p.id = c.pid
  WHERE c.pid <> v_uid
    AND c.pid NOT IN (SELECT fid FROM my_friends)
    AND coalesce(p.is_banned, false) = false
    AND coalesce(p.is_searchable, true) = true
    AND NOT public._is_blocked_between(v_uid, p.id)
  ORDER BY c.mutual DESC, coalesce(p.full_name, p.name::text)
  LIMIT v_limit;
END $$;
REVOKE EXECUTE ON FUNCTION public.get_friend_suggestions(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_friend_suggestions(integer) TO authenticated;
