-- ================================================================
-- SOSYAL AŞAMA 1.11 — Takım sohbeti + DM kapısı genişletme (Spec §N)
-- 1:1 makinesi BOZULMAZ (iki-kişilik kısıt yük taşıyor) — takım sohbeti
-- ayrı tablo. DM kapısı: arkadaş VEYA aktif takımdaş (engel mutlak).
-- Not: send_message'ın kutu-bildirimi ŞİMDİLİK korunur (push zinciri ona
-- bağlı); "sohbet kutuya yazmaz" değişikliği Küme 4'te istemciyle birlikte.
-- ================================================================

-- ── 1) Aktif ortak takım yardımcısı ──
CREATE OR REPLACE FUNCTION public._share_active_team(a uuid, b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.team_members ta
    JOIN public.team_members tb ON tb.team_id = ta.team_id
    JOIN public.teams t ON t.id = ta.team_id AND t.is_archived = false
    WHERE ta.user_id = a AND tb.user_id = b
      AND ta.is_active = true AND tb.is_active = true
  );
$$;
REVOKE EXECUTE ON FUNCTION public._share_active_team(uuid,uuid) FROM PUBLIC, anon, authenticated;

-- ── 2) DM kapısı genişler: arkadaş VEYA takımdaş (N91) ──
CREATE OR REPLACE FUNCTION public.get_or_create_conversation(p_other uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','pg_temp' AS $$
DECLARE v_uid uuid := auth.uid(); v_a uuid; v_b uuid; v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_other IS NULL OR p_other = v_uid THEN RAISE EXCEPTION 'INVALID_TARGET'; END IF;
  IF NOT (public._are_friends(v_uid, p_other) OR public._share_active_team(v_uid, p_other)) THEN
    RAISE EXCEPTION 'NOT_CONNECTED: Yalnız arkadaşların veya takım arkadaşlarınla mesajlaşabilirsin.';
  END IF;
  IF public._is_blocked_between(v_uid, p_other) THEN
    RAISE EXCEPTION 'BLOCKED: Engelleme nedeniyle mesajlaşılamaz.';
  END IF;
  v_a := LEAST(v_uid, p_other); v_b := GREATEST(v_uid, p_other);
  INSERT INTO public.conversations (user_a, user_b) VALUES (v_a, v_b)
  ON CONFLICT (user_a, user_b) DO UPDATE SET user_a = EXCLUDED.user_a RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.send_message(p_conversation_id uuid, p_body text)
RETURNS messages LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','pg_temp' AS $$
DECLARE v_uid uuid := auth.uid(); c public.conversations; v_other uuid; v_msg public.messages; v_sender text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_body IS NULL OR length(trim(p_body)) = 0 THEN RAISE EXCEPTION 'EMPTY_MESSAGE'; END IF;
  SELECT * INTO c FROM public.conversations WHERE id = p_conversation_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_uid NOT IN (c.user_a, c.user_b) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  v_other := CASE WHEN v_uid = c.user_a THEN c.user_b ELSE c.user_a END;
  IF NOT (public._are_friends(v_uid, v_other) OR public._share_active_team(v_uid, v_other)) THEN
    RAISE EXCEPTION 'NOT_CONNECTED: Yalnız arkadaşların veya takım arkadaşlarınla mesajlaşabilirsin.';
  END IF;
  IF public._is_blocked_between(v_uid, v_other) THEN RAISE EXCEPTION 'BLOCKED'; END IF;
  INSERT INTO public.messages (conversation_id, sender_id, body)
  VALUES (p_conversation_id, v_uid, trim(p_body)) RETURNING * INTO v_msg;
  UPDATE public.conversations SET last_message_at = now(), last_message_preview = left(trim(p_body), 120)
  WHERE id = p_conversation_id;
  SELECT COALESCE(full_name, name, 'Birisi') INTO v_sender FROM public.profiles WHERE id = v_uid;
  INSERT INTO public.notifications (user_id, title, body, type_key, sender_id)
  VALUES (v_other, v_sender || ' sana mesaj gönderdi', left(trim(p_body), 120), 'NEW_MESSAGE', v_uid);
  RETURN v_msg;
END; $$;

-- ── 3) Takım sohbeti ──
CREATE TABLE IF NOT EXISTS public.team_messages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id    uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  sender_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body       text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);
CREATE INDEX IF NOT EXISTS team_messages_team_created_idx
  ON public.team_messages (team_id, created_at DESC);

ALTER TABLE public.team_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tmsg_select_member ON public.team_messages;
CREATE POLICY tmsg_select_member ON public.team_messages
  FOR SELECT TO authenticated
  USING (public._is_team_member(team_id, (SELECT auth.uid())));
-- Silme: gönderen kendi mesajını, yöneticiler herkesinkini (N90)
DROP POLICY IF EXISTS tmsg_delete ON public.team_messages;
CREATE POLICY tmsg_delete ON public.team_messages
  FOR DELETE TO authenticated
  USING (sender_id = (SELECT auth.uid())
      OR public._is_team_admin(team_id, (SELECT auth.uid())));
-- INSERT yalnız RPC (üye + arşiv kontrolü orada); UPDATE yok (düzenleme yok).

CREATE TABLE IF NOT EXISTS public.team_chat_reads (
  team_id      uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  muted        boolean NOT NULL DEFAULT false,
  PRIMARY KEY (team_id, user_id)
);
ALTER TABLE public.team_chat_reads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tcr_owner_all ON public.team_chat_reads;
CREATE POLICY tcr_owner_all ON public.team_chat_reads
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid())
          AND public._is_team_member(team_id, (SELECT auth.uid())));

CREATE OR REPLACE FUNCTION public.send_team_message(p_team_id uuid, p_body text)
RETURNS public.team_messages LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_msg public.team_messages;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_body IS NULL OR length(trim(p_body)) = 0 THEN RAISE EXCEPTION 'EMPTY_MESSAGE'; END IF;
  IF NOT public._is_team_member(p_team_id, v_uid) THEN
    RAISE EXCEPTION 'NOT_MEMBER: Takım sohbeti üyeler içindir.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.teams WHERE id = p_team_id AND is_archived = true) THEN
    RAISE EXCEPTION 'ARCHIVED: Takım arşivde.';
  END IF;
  INSERT INTO public.team_messages (team_id, sender_id, body)
  VALUES (p_team_id, v_uid, trim(p_body))
  RETURNING * INTO v_msg;
  -- Gönderen kendi okundu imini ileri alır
  INSERT INTO public.team_chat_reads (team_id, user_id, last_read_at)
  VALUES (p_team_id, v_uid, v_msg.created_at)
  ON CONFLICT (team_id, user_id) DO UPDATE SET last_read_at = EXCLUDED.last_read_at;
  RETURN v_msg;
END $$;
REVOKE EXECUTE ON FUNCTION public.send_team_message(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_team_message(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_team_chat_read(p_team_id uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF NOT public._is_team_member(p_team_id, v_uid) THEN RAISE EXCEPTION 'NOT_MEMBER'; END IF;
  INSERT INTO public.team_chat_reads (team_id, user_id, last_read_at)
  VALUES (p_team_id, v_uid, timezone('utc', now()))
  ON CONFLICT (team_id, user_id) DO UPDATE SET last_read_at = timezone('utc', now());
END $$;
REVOKE EXECUTE ON FUNCTION public.mark_team_chat_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_team_chat_read(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_team_chat_muted(p_team_id uuid, p_muted boolean)
RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF NOT public._is_team_member(p_team_id, v_uid) THEN RAISE EXCEPTION 'NOT_MEMBER'; END IF;
  INSERT INTO public.team_chat_reads (team_id, user_id, muted)
  VALUES (p_team_id, v_uid, p_muted)
  ON CONFLICT (team_id, user_id) DO UPDATE SET muted = EXCLUDED.muted;
END $$;
REVOKE EXECUTE ON FUNCTION public.set_team_chat_muted(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_team_chat_muted(uuid,boolean) TO authenticated;

-- Birleşik gelen kutusu için: takım sohbet özetleri (son mesaj + okunmamış)
CREATE OR REPLACE FUNCTION public.get_team_chat_overview()
RETURNS TABLE (
  team_id      uuid,
  team_name    text,
  crest_config jsonb,
  color1       text,
  color2       text,
  last_body    text,
  last_sender  text,
  last_at      timestamptz,
  unread_count integer,
  muted        boolean
) LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
  SELECT
    t.id,
    t.name,
    t.crest_config,
    t.color1,
    t.color2,
    lm.body,
    lm.sender_name,
    lm.created_at,
    coalesce((SELECT count(*)::int FROM public.team_messages m
              WHERE m.team_id = t.id
                AND m.created_at > coalesce(r.last_read_at, 'epoch'::timestamptz)
                AND m.sender_id <> auth.uid()), 0),
    coalesce(r.muted, false)
  FROM public.team_members tm
  JOIN public.teams t ON t.id = tm.team_id AND t.is_archived = false
  LEFT JOIN public.team_chat_reads r ON r.team_id = t.id AND r.user_id = auth.uid()
  LEFT JOIN LATERAL (
    SELECT m.body, m.created_at,
           coalesce(p.full_name, p.name::text, 'Oyuncu') AS sender_name
    FROM public.team_messages m
    JOIN public.profiles p ON p.id = m.sender_id
    WHERE m.team_id = t.id
    ORDER BY m.created_at DESC LIMIT 1
  ) lm ON true
  WHERE tm.user_id = auth.uid() AND tm.is_active = true
$$;
REVOKE EXECUTE ON FUNCTION public.get_team_chat_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_team_chat_overview() TO authenticated;

-- ── 4) Realtime: takım mesajları yayına eklenir ──
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                 WHERE pubname = 'supabase_realtime'
                   AND schemaname = 'public' AND tablename = 'team_messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.team_messages;
  END IF;
END $$;
