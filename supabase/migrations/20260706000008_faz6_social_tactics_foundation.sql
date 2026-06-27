-- ==============================================================================
-- FAZ 6 — Takım & Taktik (Sosyal Çekirdek) · DB Temeli (1/2)
-- ------------------------------------------------------------------------------
-- 8.4 Arkadaşlar & Mesaj: engelleme + 1-1 mesajlaşma (yalnız arkadaşlar, realtime)
-- 8.3 Takım Taktik Sistemi: oylama (% slider) + yorum + favori + aktif taktik +
--      kopyala&öner + "En İyi Taktikler" vitrini (aggregate)
-- 8.1 Takımlar: kaptanlık devir + (son yönetici ayrılınca) arşiv; çoklu yönetici
-- NOT: tactics tablosu mevcut (camelCase, slots/drawings TEXT). Buraya yalnız
-- sosyal katman + is_active eklenir; mevcut öner/onayla akışı korunur.
-- ==============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- 0. Yardımcılar: arkadaşlık + engelleme kontrolü
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.user_blocks (
  blocker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id)
);
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own blocks" ON public.user_blocks;
CREATE POLICY "Users manage own blocks" ON public.user_blocks FOR ALL TO authenticated
  USING (blocker_id = (SELECT auth.uid())) WITH CHECK (blocker_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "Users see blocks involving them" ON public.user_blocks;
CREATE POLICY "Users see blocks involving them" ON public.user_blocks FOR SELECT TO authenticated
  USING (blocker_id = (SELECT auth.uid()) OR blocked_id = (SELECT auth.uid()) OR public.is_platform_admin());

CREATE OR REPLACE FUNCTION public._are_friends(a uuid, b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.friendships
    WHERE status = 'ACCEPTED'
      AND ((sender_id = a AND receiver_id = b) OR (sender_id = b AND receiver_id = a))
  );
$$;
REVOKE ALL ON FUNCTION public._are_friends(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._are_friends(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public._is_blocked_between(a uuid, b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_blocks
    WHERE (blocker_id = a AND blocked_id = b) OR (blocker_id = b AND blocked_id = a)
  );
$$;
REVOKE ALL ON FUNCTION public._is_blocked_between(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._is_blocked_between(uuid, uuid) TO authenticated, service_role;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. Mesajlaşma: conversations + messages (yalnız arkadaşlar)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.conversations (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a               uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,  -- LEAST(uid1,uid2)
  user_b               uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,  -- GREATEST(uid1,uid2)
  last_message_at      timestamptz,
  last_message_preview text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversations_ordered CHECK (user_a < user_b),
  UNIQUE (user_a, user_b)
);
CREATE INDEX IF NOT EXISTS idx_conversations_a ON public.conversations(user_a, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_b ON public.conversations(user_b, last_message_at DESC);
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Participants read conversations" ON public.conversations;
CREATE POLICY "Participants read conversations" ON public.conversations FOR SELECT TO authenticated
  USING (user_a = (SELECT auth.uid()) OR user_b = (SELECT auth.uid()) OR public.is_platform_admin());
-- INSERT/UPDATE yalnız RPC (SECURITY DEFINER) üzerinden.

CREATE TABLE IF NOT EXISTS public.messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body            text NOT NULL CHECK (length(trim(body)) > 0 AND length(body) <= 2000),
  read_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON public.messages(conversation_id, created_at DESC);
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Participants read messages" ON public.messages;
CREATE POLICY "Participants read messages" ON public.messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id
           AND ((SELECT auth.uid()) IN (c.user_a, c.user_b))) OR public.is_platform_admin());
-- INSERT yalnız send_message RPC üzerinden.

-- Realtime yayını
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN others THEN NULL; END $$;

-- RPC: konuşma getir/oluştur (yalnız arkadaşlar, engelli değil)
CREATE OR REPLACE FUNCTION public.get_or_create_conversation(p_other uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := auth.uid(); v_a uuid; v_b uuid; v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_other IS NULL OR p_other = v_uid THEN RAISE EXCEPTION 'INVALID_TARGET'; END IF;
  IF NOT public._are_friends(v_uid, p_other) THEN RAISE EXCEPTION 'NOT_FRIENDS: Yalniz arkadaslarinla mesajlasabilirsin.'; END IF;
  IF public._is_blocked_between(v_uid, p_other) THEN RAISE EXCEPTION 'BLOCKED: Engelleme nedeniyle mesajlasilamaz.'; END IF;
  v_a := LEAST(v_uid, p_other); v_b := GREATEST(v_uid, p_other);
  INSERT INTO public.conversations (user_a, user_b) VALUES (v_a, v_b)
  ON CONFLICT (user_a, user_b) DO UPDATE SET user_a = EXCLUDED.user_a
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION public.get_or_create_conversation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_conversation(uuid) TO authenticated;

-- RPC: mesaj gönder
CREATE OR REPLACE FUNCTION public.send_message(p_conversation_id uuid, p_body text)
RETURNS public.messages LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := auth.uid(); c public.conversations; v_other uuid; v_msg public.messages;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_body IS NULL OR length(trim(p_body)) = 0 THEN RAISE EXCEPTION 'EMPTY_MESSAGE'; END IF;
  SELECT * INTO c FROM public.conversations WHERE id = p_conversation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_uid NOT IN (c.user_a, c.user_b) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  v_other := CASE WHEN v_uid = c.user_a THEN c.user_b ELSE c.user_a END;
  IF NOT public._are_friends(v_uid, v_other) THEN RAISE EXCEPTION 'NOT_FRIENDS'; END IF;
  IF public._is_blocked_between(v_uid, v_other) THEN RAISE EXCEPTION 'BLOCKED'; END IF;
  INSERT INTO public.messages (conversation_id, sender_id, body)
  VALUES (p_conversation_id, v_uid, trim(p_body)) RETURNING * INTO v_msg;
  UPDATE public.conversations SET last_message_at = now(), last_message_preview = left(trim(p_body), 120)
  WHERE id = p_conversation_id;
  RETURN v_msg;
END; $$;
REVOKE ALL ON FUNCTION public.send_message(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_message(uuid, text) TO authenticated;

-- RPC: okundu işaretle
CREATE OR REPLACE FUNCTION public.mark_conversation_read(p_conversation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := auth.uid(); c public.conversations;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT * INTO c FROM public.conversations WHERE id = p_conversation_id;
  IF NOT FOUND OR v_uid NOT IN (c.user_a, c.user_b) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  UPDATE public.messages SET read_at = now()
  WHERE conversation_id = p_conversation_id AND sender_id <> v_uid AND read_at IS NULL;
END; $$;
REVOKE ALL ON FUNCTION public.mark_conversation_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(uuid) TO authenticated;

-- RPC: konuşma listesi (diğer kullanıcı profili + okunmamış sayısı ile)
CREATE OR REPLACE FUNCTION public.get_my_conversations()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := auth.uid(); v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT jsonb_agg(row_to_json(t) ORDER BY t.last_message_at DESC NULLS LAST) INTO v_result FROM (
    SELECT c.id, c.last_message_at, c.last_message_preview,
           CASE WHEN c.user_a = v_uid THEN c.user_b ELSE c.user_a END AS other_id,
           p.full_name AS other_name, p.avatar_url AS other_avatar, p.oyna_id AS other_oyna_id,
           (SELECT count(*) FROM public.messages m WHERE m.conversation_id = c.id AND m.sender_id <> v_uid AND m.read_at IS NULL) AS unread_count
    FROM public.conversations c
    JOIN public.profiles p ON p.id = (CASE WHEN c.user_a = v_uid THEN c.user_b ELSE c.user_a END)
    WHERE v_uid IN (c.user_a, c.user_b)
  ) t;
  RETURN COALESCE(v_result, '[]'::jsonb);
END; $$;
REVOKE ALL ON FUNCTION public.get_my_conversations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_conversations() TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 2. Taktik sosyal motoru: oylama + yorum + favori + aktif taktik
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.tactics ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.tactic_votes (
  tactic_id uuid NOT NULL REFERENCES public.tactics(id) ON DELETE CASCADE,
  user_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  percent   integer NOT NULL CHECK (percent BETWEEN 0 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tactic_id, user_id)
);
CREATE TABLE IF NOT EXISTS public.tactic_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tactic_id uuid NOT NULL REFERENCES public.tactics(id) ON DELETE CASCADE,
  user_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body      text NOT NULL CHECK (length(trim(body)) > 0 AND length(body) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tactic_comments_tactic ON public.tactic_comments(tactic_id, created_at);
CREATE TABLE IF NOT EXISTS public.tactic_favorites (
  tactic_id uuid NOT NULL REFERENCES public.tactics(id) ON DELETE CASCADE,
  user_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tactic_id, user_id)
);

-- Yardımcı: kullanıcı takımın üyesi mi? (team_members aktif veya kaptan)
CREATE OR REPLACE FUNCTION public._is_team_member(p_team_id uuid, p_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.team_members WHERE team_id = p_team_id AND user_id = p_uid AND is_active = true)
      OR EXISTS (SELECT 1 FROM public.teams t WHERE t.id = p_team_id
                  AND (t.captain_id = p_uid OR COALESCE(t.captains,'[]'::jsonb) ? p_uid::text));
$$;
REVOKE ALL ON FUNCTION public._is_team_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._is_team_member(uuid, uuid) TO authenticated, service_role;

-- Yardımcı: kullanıcı takımın yöneticisi mi? (kaptan veya captains[])
CREATE OR REPLACE FUNCTION public._is_team_admin(p_team_id uuid, p_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.teams t WHERE t.id = p_team_id
    AND (t.captain_id = p_uid OR COALESCE(t.captains,'[]'::jsonb) ? p_uid::text));
$$;
REVOKE ALL ON FUNCTION public._is_team_admin(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._is_team_admin(uuid, uuid) TO authenticated, service_role;

ALTER TABLE public.tactic_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tactic_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tactic_favorites ENABLE ROW LEVEL SECURITY;

-- Okuma: takım üyesi ilgili taktiğin sosyal verisini görebilir
DROP POLICY IF EXISTS "Team members read tactic_votes" ON public.tactic_votes;
CREATE POLICY "Team members read tactic_votes" ON public.tactic_votes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tactics t WHERE t.id = tactic_id AND t."teamId" IS NOT NULL
           AND public._is_team_member(t."teamId", (SELECT auth.uid()))) OR public.is_platform_admin());
DROP POLICY IF EXISTS "Team members read tactic_comments" ON public.tactic_comments;
CREATE POLICY "Team members read tactic_comments" ON public.tactic_comments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tactics t WHERE t.id = tactic_id AND t."teamId" IS NOT NULL
           AND public._is_team_member(t."teamId", (SELECT auth.uid()))) OR public.is_platform_admin());
DROP POLICY IF EXISTS "Users read own favorites" ON public.tactic_favorites;
CREATE POLICY "Users read own favorites" ON public.tactic_favorites FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.is_platform_admin());
-- Yazma yalnız RPC üzerinden (aşağıda).

-- RPC: oy ver (0-100 %), takım üyesi
CREATE OR REPLACE FUNCTION public.vote_tactic(p_tactic_id uuid, p_percent integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := auth.uid(); v_team uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT "teamId" INTO v_team FROM public.tactics WHERE id = p_tactic_id;
  IF v_team IS NULL THEN RAISE EXCEPTION 'NOT_TEAM_TACTIC: Yalniz takim taktikleri oylanabilir.'; END IF;
  IF NOT public._is_team_member(v_team, v_uid) THEN RAISE EXCEPTION 'FORBIDDEN: Takim uyesi degilsin.'; END IF;
  INSERT INTO public.tactic_votes (tactic_id, user_id, percent)
  VALUES (p_tactic_id, v_uid, LEAST(100, GREATEST(0, p_percent)))
  ON CONFLICT (tactic_id, user_id) DO UPDATE SET percent = EXCLUDED.percent, created_at = now();
END; $$;
REVOKE ALL ON FUNCTION public.vote_tactic(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vote_tactic(uuid, integer) TO authenticated;

-- RPC: yorum yap
CREATE OR REPLACE FUNCTION public.comment_tactic(p_tactic_id uuid, p_body text)
RETURNS public.tactic_comments LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := auth.uid(); v_team uuid; v_c public.tactic_comments;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_body IS NULL OR length(trim(p_body)) = 0 THEN RAISE EXCEPTION 'EMPTY'; END IF;
  SELECT "teamId" INTO v_team FROM public.tactics WHERE id = p_tactic_id;
  IF v_team IS NULL THEN RAISE EXCEPTION 'NOT_TEAM_TACTIC'; END IF;
  IF NOT public._is_team_member(v_team, v_uid) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  INSERT INTO public.tactic_comments (tactic_id, user_id, body) VALUES (p_tactic_id, v_uid, trim(p_body))
  RETURNING * INTO v_c;
  RETURN v_c;
END; $$;
REVOKE ALL ON FUNCTION public.comment_tactic(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.comment_tactic(uuid, text) TO authenticated;

-- RPC: favori aç/kapat
CREATE OR REPLACE FUNCTION public.toggle_tactic_favorite(p_tactic_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := auth.uid(); v_team uuid; v_exists boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT "teamId" INTO v_team FROM public.tactics WHERE id = p_tactic_id;
  IF v_team IS NULL THEN RAISE EXCEPTION 'NOT_TEAM_TACTIC'; END IF;
  IF NOT public._is_team_member(v_team, v_uid) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT EXISTS(SELECT 1 FROM public.tactic_favorites WHERE tactic_id = p_tactic_id AND user_id = v_uid) INTO v_exists;
  IF v_exists THEN
    DELETE FROM public.tactic_favorites WHERE tactic_id = p_tactic_id AND user_id = v_uid; RETURN false;
  ELSE
    INSERT INTO public.tactic_favorites (tactic_id, user_id) VALUES (p_tactic_id, v_uid); RETURN true;
  END IF;
END; $$;
REVOKE ALL ON FUNCTION public.toggle_tactic_favorite(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toggle_tactic_favorite(uuid) TO authenticated;

-- RPC: aktif taktiği ayarla (yalnız yönetici; takımda tek aktif)
CREATE OR REPLACE FUNCTION public.set_active_tactic(p_tactic_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := auth.uid(); v_team uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT "teamId" INTO v_team FROM public.tactics WHERE id = p_tactic_id;
  IF v_team IS NULL THEN RAISE EXCEPTION 'NOT_TEAM_TACTIC'; END IF;
  IF NOT public._is_team_admin(v_team, v_uid) THEN RAISE EXCEPTION 'FORBIDDEN: Yalniz takim yoneticisi.'; END IF;
  UPDATE public.tactics SET is_active = false WHERE "teamId" = v_team AND is_active = true;
  UPDATE public.tactics SET is_active = true, status = 'APPROVED' WHERE id = p_tactic_id;
END; $$;
REVOKE ALL ON FUNCTION public.set_active_tactic(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_active_tactic(uuid) TO authenticated;

-- RPC: kopyala & öner (başka taktiği klonlayıp PENDING_APPROVAL olarak öner)
CREATE OR REPLACE FUNCTION public.copy_tactic(p_tactic_id uuid, p_team_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := auth.uid(); src public.tactics; v_target uuid; v_new uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT * INTO src FROM public.tactics WHERE id = p_tactic_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  v_target := COALESCE(p_team_id, src."teamId");
  IF v_target IS NULL OR NOT public._is_team_member(v_target, v_uid) THEN
    RAISE EXCEPTION 'FORBIDDEN: Hedef takim uyesi degilsin.'; END IF;
  INSERT INTO public.tactics ("userId","teamId", name, "teamName", size, formation, slots, subs, notes,
    opponents, mentality, tempo, identity, drawings, status, "proposedBy", priority, is_active, "createdAt","updatedAt")
  SELECT v_uid, v_target, COALESCE(src.name,'Taktik')||' (kopya)', src."teamName", src.size, src.formation,
    src.slots, src.subs, src.notes, src.opponents, src.mentality, src.tempo, src.identity, src.drawings,
    'PENDING_APPROVAL', v_uid, 0, false, now(), now()
  RETURNING id INTO v_new;
  RETURN v_new;
END; $$;
REVOKE ALL ON FUNCTION public.copy_tactic(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.copy_tactic(uuid, uuid) TO authenticated;

-- RPC: "En İyi Taktikler" vitrini (aggregate: ortalama oy %, oy/favori/yorum sayısı)
CREATE OR REPLACE FUNCTION public.get_team_tactics_showcase(p_team_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := auth.uid(); v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF NOT public._is_team_member(p_team_id, v_uid) AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Takim uyesi degilsin.'; END IF;
  SELECT jsonb_agg(row_to_json(t) ORDER BY t.is_active DESC, t.avg_vote DESC NULLS LAST, t.fav_count DESC) INTO v_result FROM (
    SELECT tc.id, tc.name, tc.formation, tc.size, tc.status, tc.is_active, tc."proposedBy" AS proposed_by, tc.priority,
      COALESCE(round(avg(v.percent)::numeric, 0), 0) AS avg_vote,
      count(DISTINCT v.user_id) AS vote_count,
      (SELECT count(*) FROM public.tactic_favorites f WHERE f.tactic_id = tc.id) AS fav_count,
      (SELECT count(*) FROM public.tactic_comments cm WHERE cm.tactic_id = tc.id) AS comment_count,
      EXISTS (SELECT 1 FROM public.tactic_favorites f2 WHERE f2.tactic_id = tc.id AND f2.user_id = v_uid) AS i_favorited,
      (SELECT vv.percent FROM public.tactic_votes vv WHERE vv.tactic_id = tc.id AND vv.user_id = v_uid) AS my_vote
    FROM public.tactics tc
    LEFT JOIN public.tactic_votes v ON v.tactic_id = tc.id
    WHERE tc."teamId" = p_team_id
    GROUP BY tc.id
  ) t;
  RETURN COALESCE(v_result, '[]'::jsonb);
END; $$;
REVOKE ALL ON FUNCTION public.get_team_tactics_showcase(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_tactics_showcase(uuid) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 3. Takımlar: kaptanlık devir + arşiv (8.1)
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- RPC: kaptanlık devret (mevcut yönetici → yeni kaptan)
CREATE OR REPLACE FUNCTION public.transfer_captaincy(p_team_id uuid, p_new_captain uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF NOT public._is_team_admin(p_team_id, v_uid) THEN RAISE EXCEPTION 'FORBIDDEN: Yalniz yonetici devredebilir.'; END IF;
  IF NOT public._is_team_member(p_team_id, p_new_captain) THEN RAISE EXCEPTION 'NOT_MEMBER: Yeni kaptan takim uyesi olmali.'; END IF;
  UPDATE public.teams SET
    captain_id = p_new_captain, captain = p_new_captain,
    captains = CASE WHEN COALESCE(captains,'[]'::jsonb) ? p_new_captain::text
                    THEN captains ELSE COALESCE(captains,'[]'::jsonb) || jsonb_build_array(p_new_captain::text) END
  WHERE id = p_team_id;
END; $$;
REVOKE ALL ON FUNCTION public.transfer_captaincy(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_captaincy(uuid, uuid) TO authenticated;

-- RPC: yönetici ekle/çıkar (çoklu yönetici)
CREATE OR REPLACE FUNCTION public.set_team_admin(p_team_id uuid, p_user uuid, p_grant boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := auth.uid(); v_caps jsonb; v_primary uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF NOT public._is_team_admin(p_team_id, v_uid) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT COALESCE(captains,'[]'::jsonb), captain_id INTO v_caps, v_primary FROM public.teams WHERE id = p_team_id;
  IF p_grant THEN
    IF NOT public._is_team_member(p_team_id, p_user) THEN RAISE EXCEPTION 'NOT_MEMBER'; END IF;
    IF NOT (v_caps ? p_user::text) THEN v_caps := v_caps || jsonb_build_array(p_user::text); END IF;
  ELSE
    IF p_user = v_primary THEN RAISE EXCEPTION 'CANNOT_REMOVE_PRIMARY: Ana kaptan once devredilmeli.'; END IF;
    v_caps := (SELECT COALESCE(jsonb_agg(x),'[]'::jsonb) FROM jsonb_array_elements_text(v_caps) x WHERE x <> p_user::text);
  END IF;
  UPDATE public.teams SET captains = v_caps WHERE id = p_team_id;
END; $$;
REVOKE ALL ON FUNCTION public.set_team_admin(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_team_admin(uuid, uuid, boolean) TO authenticated;

-- RPC: takımdan ayrıl (son yönetici ayrılırsa arşivlenir; geçmiş korunur)
CREATE OR REPLACE FUNCTION public.leave_team(p_team_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := auth.uid(); v_caps jsonb; v_active_members int; v_remaining_admins int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT COALESCE(captains,'[]'::jsonb) INTO v_caps FROM public.teams WHERE id = p_team_id;
  IF v_caps IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  -- Üyeliği pasifleştir
  UPDATE public.team_members SET is_active = false WHERE team_id = p_team_id AND user_id = v_uid;
  -- Yöneticiyse captains'tan çıkar
  IF v_caps ? v_uid::text THEN
    v_caps := (SELECT COALESCE(jsonb_agg(x),'[]'::jsonb) FROM jsonb_array_elements_text(v_caps) x WHERE x <> v_uid::text);
    UPDATE public.teams SET captains = v_caps,
      captain_id = CASE WHEN captain_id = v_uid THEN NULL ELSE captain_id END
    WHERE id = p_team_id;
  END IF;

  SELECT count(*) INTO v_active_members FROM public.team_members WHERE team_id = p_team_id AND is_active = true;
  SELECT jsonb_array_length(COALESCE(captains,'[]'::jsonb)) INTO v_remaining_admins FROM public.teams WHERE id = p_team_id;

  -- Son yönetici yoksa veya hiç üye kalmadıysa → arşivle (geçmiş korunur)
  IF v_remaining_admins = 0 OR v_active_members = 0 THEN
    UPDATE public.teams SET is_archived = true, archived_at = now() WHERE id = p_team_id;
    RETURN jsonb_build_object('team_id', p_team_id, 'archived', true);
  END IF;
  RETURN jsonb_build_object('team_id', p_team_id, 'archived', false);
END; $$;
REVOKE ALL ON FUNCTION public.leave_team(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_team(uuid) TO authenticated;

-- RPC: takımı arşivle (yönetici; geçmiş korunur)
CREATE OR REPLACE FUNCTION public.archive_team(p_team_id uuid, p_archive boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF NOT public._is_team_admin(p_team_id, v_uid) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  UPDATE public.teams SET is_archived = p_archive, archived_at = CASE WHEN p_archive THEN now() ELSE NULL END
  WHERE id = p_team_id;
END; $$;
REVOKE ALL ON FUNCTION public.archive_team(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_team(uuid, boolean) TO authenticated;
