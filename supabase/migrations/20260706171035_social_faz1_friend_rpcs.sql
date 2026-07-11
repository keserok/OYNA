-- ================================================================
-- SOSYAL AŞAMA 1.5 — Arkadaşlık durum makinesi RPC'leri (Spec §6 / Bölüm C)
-- Tüm yazımlar SECURITY DEFINER; status/limit/engel kuralları SUNUCUDA.
-- ================================================================

-- ── Bildirim şablonları (SOCIAL kategorisi) ──
INSERT INTO public.notification_templates (type_key, label_tr, title_tr, body_tr, category, is_mandatory, can_user_disable, sort_order)
SELECT 'friend_request', 'Arkadaşlık isteği', 'Yeni arkadaşlık isteği 👋',
       '{sender_name} seni arkadaş olarak eklemek istiyor.', 'SOCIAL', false, true, 10
WHERE NOT EXISTS (SELECT 1 FROM public.notification_templates WHERE type_key = 'friend_request');

INSERT INTO public.notification_templates (type_key, label_tr, title_tr, body_tr, category, is_mandatory, can_user_disable, sort_order)
SELECT 'friend_accepted', 'Arkadaşlık kabulü', 'Artık arkadaşsınız 🤝',
       '{sender_name} arkadaşlık isteğini kabul etti.', 'SOCIAL', false, true, 11
WHERE NOT EXISTS (SELECT 1 FROM public.notification_templates WHERE type_key = 'friend_accepted');

INSERT INTO public.notification_templates (type_key, label_tr, title_tr, body_tr, category, is_mandatory, can_user_disable, sort_order)
SELECT 'referral_joined', 'Davet karşılığı', 'Davetin karşılık buldu! 🎉',
       '{sender_name} senin davetinle OYNA''ya katıldı.', 'SOCIAL', false, true, 12
WHERE NOT EXISTS (SELECT 1 FROM public.notification_templates WHERE type_key = 'referral_joined');

-- ── Yardımcılar ──

-- Birlikte oynanan tamamlanmış maç sayısı (kabulde backfill — Spec D21)
CREATE OR REPLACE FUNCTION public._count_matches_together(a uuid, b uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
  SELECT count(*)::int FROM public.matches m
  WHERE upper(coalesce(m.status, '')) IN ('COMPLETED','FINISHED','SCORED')
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(coalesce(m.slots,'[]'::jsonb) || coalesce(m."awaySlots",'[]'::jsonb)) s
      WHERE s->>'occupant' = a::text OR s->'player'->>'id' = a::text)
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(coalesce(m.slots,'[]'::jsonb) || coalesce(m."awaySlots",'[]'::jsonb)) s
      WHERE s->>'occupant' = b::text OR s->'player'->>'id' = b::text);
$$;
REVOKE EXECUTE ON FUNCTION public._count_matches_together(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._count_matches_together(uuid,uuid) TO authenticated, service_role;

-- İkili ilişki durumu (arama/öneri kartları için)
CREATE OR REPLACE FUNCTION public._friendship_state(p_me uuid, p_other uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
  SELECT coalesce((
    SELECT jsonb_build_object(
      'state', CASE
        WHEN f.status = 'ACCEPTED' THEN 'FRIENDS'
        WHEN f.status = 'PENDING' AND f.requester_id = p_me THEN 'PENDING_OUT'
        WHEN f.status = 'PENDING' AND f.addressee_id = p_me THEN 'PENDING_IN'
        ELSE 'NONE' END,        -- REJECTED iki tarafa da NONE görünür (nazik ret — C17)
      'request_id', f.id)
    FROM public.friendships f
    WHERE least(f.requester_id, f.addressee_id) = least(p_me, p_other)
      AND greatest(f.requester_id, f.addressee_id) = greatest(p_me, p_other)
  ), jsonb_build_object('state', 'NONE', 'request_id', null));
$$;
REVOKE EXECUTE ON FUNCTION public._friendship_state(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._friendship_state(uuid,uuid) TO authenticated, service_role;

-- Bildirim üreticileri (tekilleştirmeli — C5)
CREATE OR REPLACE FUNCTION public._notify_friend_request(p_from uuid, p_to uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
DECLARE v_name text; v_tpl record;
BEGIN
  IF EXISTS (SELECT 1 FROM public.notifications
             WHERE user_id = p_to AND type_key = 'friend_request'
               AND sender_id = p_from AND is_read = false) THEN
    RETURN; -- aynı çift için okunmamış istek bildirimi yığılmaz
  END IF;
  SELECT coalesce(full_name, name::text, 'Bir oyuncu') INTO v_name FROM public.profiles WHERE id = p_from;
  SELECT * INTO v_tpl FROM public.notification_templates WHERE type_key = 'friend_request';
  INSERT INTO public.notifications (user_id, title, body, type_key, sender_id, action_required, deep_link, is_read)
  VALUES (
    p_to,
    coalesce(v_tpl.title_tr, 'Yeni arkadaşlık isteği 👋'),
    coalesce(replace(v_tpl.body_tr, '{sender_name}', v_name), v_name || ' seni arkadaş olarak eklemek istiyor.'),
    'friend_request', p_from, true, 'oyna://social/friends/requests', false);
END $$;

CREATE OR REPLACE FUNCTION public._notify_friend_accepted(p_accepter uuid, p_requester uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
DECLARE v_name text; v_tpl record;
BEGIN
  SELECT coalesce(full_name, name::text, 'Bir oyuncu') INTO v_name FROM public.profiles WHERE id = p_accepter;
  SELECT * INTO v_tpl FROM public.notification_templates WHERE type_key = 'friend_accepted';
  INSERT INTO public.notifications (user_id, title, body, type_key, sender_id, action_required, deep_link, is_read)
  VALUES (
    p_requester,
    coalesce(v_tpl.title_tr, 'Artık arkadaşsınız 🤝'),
    coalesce(replace(v_tpl.body_tr, '{sender_name}', v_name), v_name || ' arkadaşlık isteğini kabul etti.'),
    'friend_accepted', p_accepter, false, 'oyna://profile/' || p_accepter::text, false);
END $$;

-- ── 1) İstek gönder ──
CREATE OR REPLACE FUNCTION public.send_friend_request(p_target uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_row         public.friendships%ROWTYPE;
  v_cooldown    int := public._social_config_int('friend_reject_cooldown_hours', 72);
  v_daily       int := public._social_config_int('friend_request_daily_limit', 20);
  v_pending_max int := public._social_config_int('friend_request_pending_max', 50);
  v_banned      boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_target IS NULL OR p_target = v_uid THEN
    RAISE EXCEPTION 'INVALID_TARGET: Kendine istek gönderemezsin.';
  END IF;
  SELECT coalesce(is_banned, false) INTO v_banned FROM public.profiles WHERE id = p_target;
  IF v_banned IS NULL THEN RAISE EXCEPTION 'NOT_FOUND: Kullanıcı bulunamadı.'; END IF;
  IF v_banned THEN RAISE EXCEPTION 'NOT_FOUND: Kullanıcı bulunamadı.'; END IF;
  -- Engel varlığı sızdırılmaz: "bulunamadı" gibi davranılır (E31)
  IF public._is_blocked_between(v_uid, p_target) THEN
    RAISE EXCEPTION 'NOT_FOUND: Kullanıcı bulunamadı.';
  END IF;

  SELECT * INTO v_row FROM public.friendships
  WHERE least(requester_id, addressee_id) = least(v_uid, p_target)
    AND greatest(requester_id, addressee_id) = greatest(v_uid, p_target)
  FOR UPDATE;

  IF FOUND THEN
    IF v_row.status = 'ACCEPTED' THEN
      RETURN jsonb_build_object('ok', true, 'state', 'FRIENDS');
    ELSIF v_row.status = 'PENDING' THEN
      IF v_row.requester_id = v_uid THEN
        RETURN jsonb_build_object('ok', true, 'state', 'PENDING_OUT', 'request_id', v_row.id);
      ELSE
        -- Karşılıklı istek = otomatik arkadaşlık (B5)
        UPDATE public.friendships
        SET status = 'ACCEPTED', responded_at = timezone('utc', now()),
            matches_together = public._count_matches_together(requester_id, addressee_id)
        WHERE id = v_row.id;
        PERFORM public._notify_friend_accepted(v_uid, v_row.requester_id);
        UPDATE public.notifications SET is_read = true
        WHERE user_id = v_uid AND type_key = 'friend_request'
          AND sender_id = v_row.requester_id AND is_read = false;
        RETURN jsonb_build_object('ok', true, 'state', 'FRIENDS', 'auto_accepted', true);
      END IF;
    ELSE -- REJECTED
      IF v_row.addressee_id = v_uid THEN
        -- Reddeden benim → fikir değiştirdim: yön çevrilir, cooldown yok (C1)
        UPDATE public.friendships
        SET requester_id = v_uid, addressee_id = p_target, status = 'PENDING',
            created_at = timezone('utc', now()), responded_at = NULL
        WHERE id = v_row.id;
        PERFORM public._notify_friend_request(v_uid, p_target);
        RETURN jsonb_build_object('ok', true, 'state', 'PENDING_OUT', 'request_id', v_row.id);
      ELSE
        -- Reddedilen benim → cooldown (C17)
        IF v_row.responded_at IS NOT NULL
           AND v_row.responded_at > timezone('utc', now()) - make_interval(hours => v_cooldown) THEN
          RAISE EXCEPTION 'COOLDOWN: Bu kullanıcıya şimdilik tekrar istek gönderemezsin.';
        END IF;
        UPDATE public.friendships
        SET status = 'PENDING', created_at = timezone('utc', now()), responded_at = NULL
        WHERE id = v_row.id;
        PERFORM public._notify_friend_request(v_uid, p_target);
        RETURN jsonb_build_object('ok', true, 'state', 'PENDING_OUT', 'request_id', v_row.id);
      END IF;
    END IF;
  END IF;

  -- Yeni istek: limitler (C2)
  IF (SELECT count(*) FROM public.friendships
      WHERE requester_id = v_uid
        AND created_at >= date_trunc('day', timezone('utc', now()))) >= v_daily THEN
    RAISE EXCEPTION 'DAILY_LIMIT: Günlük istek sınırına ulaştın.';
  END IF;
  IF (SELECT count(*) FROM public.friendships
      WHERE requester_id = v_uid AND status = 'PENDING') >= v_pending_max THEN
    RAISE EXCEPTION 'PENDING_LIMIT: Çok fazla bekleyen isteğin var.';
  END IF;

  BEGIN
    INSERT INTO public.friendships (requester_id, addressee_id, status)
    VALUES (v_uid, p_target, 'PENDING')
    RETURNING * INTO v_row;
  EXCEPTION WHEN unique_violation THEN
    -- Yarış: aynı anda karşı taraf oluşturdu → mevcut durumu döndür
    RETURN public._friendship_state(v_uid, p_target) || jsonb_build_object('ok', true);
  END;
  PERFORM public._notify_friend_request(v_uid, p_target);
  RETURN jsonb_build_object('ok', true, 'state', 'PENDING_OUT', 'request_id', v_row.id);
END $$;
REVOKE EXECUTE ON FUNCTION public.send_friend_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_friend_request(uuid) TO authenticated;

-- ── 2) İsteğe yanıt ver (yalnız alıcı) ──
CREATE OR REPLACE FUNCTION public.respond_friend_request(p_request_id uuid, p_accept boolean)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.friendships%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT * INTO v_row FROM public.friendships WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR v_row.addressee_id <> v_uid THEN
    RAISE EXCEPTION 'NOT_FOUND: İstek bulunamadı.';
  END IF;
  IF v_row.status <> 'PENDING' THEN
    RAISE EXCEPTION 'NOT_PENDING: İstek zaten yanıtlanmış.';
  END IF;

  IF p_accept THEN
    UPDATE public.friendships
    SET status = 'ACCEPTED', responded_at = timezone('utc', now()),
        matches_together = public._count_matches_together(requester_id, addressee_id)
    WHERE id = v_row.id;
    PERFORM public._notify_friend_accepted(v_uid, v_row.requester_id);
  ELSE
    -- Yumuşak ret: sessiz, karşı tarafa bildirim YOK (C17)
    UPDATE public.friendships
    SET status = 'REJECTED', responded_at = timezone('utc', now())
    WHERE id = v_row.id;
  END IF;

  UPDATE public.notifications SET is_read = true
  WHERE user_id = v_uid AND type_key = 'friend_request'
    AND sender_id = v_row.requester_id AND is_read = false;

  RETURN jsonb_build_object('ok', true, 'state', CASE WHEN p_accept THEN 'FRIENDS' ELSE 'NONE' END);
END $$;
REVOKE EXECUTE ON FUNCTION public.respond_friend_request(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_friend_request(uuid,boolean) TO authenticated;

-- ── 3) Gönderilen isteği geri çek ──
CREATE OR REPLACE FUNCTION public.cancel_friend_request(p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.friendships%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT * INTO v_row FROM public.friendships WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR v_row.requester_id <> v_uid THEN
    RAISE EXCEPTION 'NOT_FOUND: İstek bulunamadı.';
  END IF;
  IF v_row.status <> 'PENDING' THEN
    RAISE EXCEPTION 'NOT_PENDING: İstek zaten yanıtlanmış.';
  END IF;
  DELETE FROM public.friendships WHERE id = v_row.id;
  -- Alıcıdaki okunmamış istek bildirimi silinir — "hayalet istek" kalmaz (F36)
  DELETE FROM public.notifications
  WHERE user_id = v_row.addressee_id AND type_key = 'friend_request'
    AND sender_id = v_uid AND is_read = false;
  RETURN jsonb_build_object('ok', true, 'state', 'NONE');
END $$;
REVOKE EXECUTE ON FUNCTION public.cancel_friend_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_friend_request(uuid) TO authenticated;

-- ── 4) Arkadaşlıktan çıkar (retten AYRI işlem — C17) ──
CREATE OR REPLACE FUNCTION public.remove_friend(p_other uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.friendships%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT * INTO v_row FROM public.friendships
  WHERE status = 'ACCEPTED'
    AND least(requester_id, addressee_id) = least(v_uid, p_other)
    AND greatest(requester_id, addressee_id) = greatest(v_uid, p_other)
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Arkadaşlık bulunamadı.'; END IF;

  DELETE FROM public.friendships WHERE id = v_row.id;
  -- Tercih ve liste izleri iki yönde temizlenir (E29)
  DELETE FROM public.friend_prefs
  WHERE (owner_id = v_uid AND friend_id = p_other) OR (owner_id = p_other AND friend_id = v_uid);
  DELETE FROM public.friend_list_members flm
  USING public.friend_lists fl
  WHERE fl.id = flm.list_id
    AND ((fl.owner_id = v_uid AND flm.member_id = p_other)
      OR (fl.owner_id = p_other AND flm.member_id = v_uid));
  RETURN jsonb_build_object('ok', true, 'state', 'NONE');
END $$;
REVOKE EXECUTE ON FUNCTION public.remove_friend(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_friend(uuid) TO authenticated;

-- ── 5) Arkadaş listesi — tek atış (C4; N+1 ölür) ──
CREATE OR REPLACE FUNCTION public.get_friends()
RETURNS TABLE (
  friendship_id    uuid,
  friend_id        uuid,
  full_name        text,
  avatar_url       text,
  oyna_id          text,
  pos              text,
  fp               numeric,
  win_count        integer,
  total_matches    integer,
  matches_together integer,
  is_favorite      boolean,
  list_ids         uuid[],
  last_active_at   timestamptz,
  friends_since    timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
  WITH me AS (
    SELECT auth.uid() AS uid,
           coalesce((SELECT show_online_status FROM public.profiles WHERE id = auth.uid()), true) AS i_show
  )
  SELECT
    f.id,
    p.id,
    coalesce(p.full_name, p.name::text, 'Oyuncu'),
    p.avatar_url,
    p.oyna_id,
    p.player_card->>'position',
    nullif(p.player_card->>'fp', '')::numeric,
    coalesce(p.win_count, 0),
    coalesce(p.total_matches, 0),
    coalesce(f.matches_together, 0),
    coalesce(pref.is_favorite, false),
    coalesce((SELECT array_agg(flm.list_id)
              FROM public.friend_list_members flm
              JOIN public.friend_lists fl ON fl.id = flm.list_id
              WHERE fl.owner_id = me.uid AND flm.member_id = p.id), '{}'),
    -- Karşılıklı görünürlük: ikisi de açıksa (F35)
    CASE WHEN me.i_show AND coalesce(p.show_online_status, true)
         THEN p.last_active_at ELSE NULL END,
    coalesce(f.responded_at, f.created_at)
  FROM me
  JOIN public.friendships f
    ON f.status = 'ACCEPTED' AND (f.requester_id = me.uid OR f.addressee_id = me.uid)
  JOIN public.profiles p
    ON p.id = CASE WHEN f.requester_id = me.uid THEN f.addressee_id ELSE f.requester_id END
  LEFT JOIN public.friend_prefs pref
    ON pref.owner_id = me.uid AND pref.friend_id = p.id
$$;
REVOKE EXECUTE ON FUNCTION public.get_friends() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_friends() TO authenticated;

-- ── 6) Bekleyen istekler — iki yön tek atışta (C15) ──
CREATE OR REPLACE FUNCTION public.get_friend_requests()
RETURNS TABLE (
  request_id uuid,
  direction  text,          -- 'IN' | 'OUT'
  other_id   uuid,
  full_name  text,
  avatar_url text,
  oyna_id    text,
  pos        text,
  created_at timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
  SELECT
    f.id,
    CASE WHEN f.addressee_id = auth.uid() THEN 'IN' ELSE 'OUT' END,
    p.id,
    coalesce(p.full_name, p.name::text, 'Oyuncu'),
    p.avatar_url,
    p.oyna_id,
    p.player_card->>'position',
    f.created_at
  FROM public.friendships f
  JOIN public.profiles p
    ON p.id = CASE WHEN f.addressee_id = auth.uid() THEN f.requester_id ELSE f.addressee_id END
  WHERE f.status = 'PENDING'
    AND (f.requester_id = auth.uid() OR f.addressee_id = auth.uid())
  ORDER BY f.created_at DESC
$$;
REVOKE EXECUTE ON FUNCTION public.get_friend_requests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_friend_requests() TO authenticated;

-- ── 7) Maç tamamlanınca arkadaş çiftlerinin sayacı artar (D21) ──
CREATE OR REPLACE FUNCTION public.matches_update_friend_counters()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
DECLARE v_players uuid[];
BEGIN
  IF upper(coalesce(NEW.status, '')) IN ('COMPLETED','FINISHED','SCORED')
     AND upper(coalesce(OLD.status, '')) NOT IN ('COMPLETED','FINISHED','SCORED') THEN
    SELECT array_agg(DISTINCT pid) INTO v_players FROM (
      SELECT (s->>'occupant')::uuid AS pid
      FROM jsonb_array_elements(coalesce(NEW.slots,'[]'::jsonb) || coalesce(NEW."awaySlots",'[]'::jsonb)) s
      WHERE s->>'occupant' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      UNION
      SELECT (s->'player'->>'id')::uuid
      FROM jsonb_array_elements(coalesce(NEW.slots,'[]'::jsonb) || coalesce(NEW."awaySlots",'[]'::jsonb)) s
      WHERE s->'player'->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) t WHERE pid IS NOT NULL;
    IF v_players IS NOT NULL AND array_length(v_players, 1) >= 2 THEN
      UPDATE public.friendships f
      SET matches_together = coalesce(f.matches_together, 0) + 1
      WHERE f.status = 'ACCEPTED'
        AND f.requester_id = ANY (v_players)
        AND f.addressee_id = ANY (v_players);
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_matches_friend_counters ON public.matches;
CREATE TRIGGER trg_matches_friend_counters
  AFTER UPDATE OF status ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.matches_update_friend_counters();
