-- ================================================================
-- SOSYAL AŞAMA 1.18 — Sohbet kutuya yazmaz + takım sohbeti push'u
-- (Küme 4; 000012 başlığındaki bilinçli erteleme kapanıyor.)
--
-- Push zinciri notifications INSERT webhook'una bağlı olduğundan satır
-- ATILMAZ; yeni `inbox` bayrağıyla işaretlenir: inbox=false satırlar
-- push'u tetikler ama bildirim merkezinde LİSTELENMEZ (Spec §N93 —
-- "sohbet kutuya yazmaz, push+rozet"). Rozet kaynağı zaten konuşma
-- okunmamış sayaçları. Eski NEW_MESSAGE kutu satırları da kutudan
-- düşürülür. inbox=false satırları gecelik cron temizler.
-- ================================================================

-- ── 1) inbox bayrağı ──
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS inbox boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS notifications_user_inbox_idx
  ON public.notifications (user_id, created_at DESC)
  WHERE inbox = true;
CREATE INDEX IF NOT EXISTS notifications_chat_cleanup_idx
  ON public.notifications (created_at)
  WHERE inbox = false;

-- Tarihsel DM kutu satırları kutudan düşer (push_log'a dokunulmaz)
UPDATE public.notifications SET inbox = false WHERE type_key = 'NEW_MESSAGE';

-- ── 2) send_message: bildirim satırı artık inbox=false + derin bağlantı ──
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
  -- Kutu DEĞİL, yalnız push taşıyıcısı (inbox=false)
  INSERT INTO public.notifications (user_id, title, body, type_key, sender_id, deep_link, inbox)
  VALUES (v_other, v_sender || ' sana mesaj gönderdi', left(trim(p_body), 120),
          'NEW_MESSAGE', v_uid, 'oyna://messages/' || p_conversation_id::text, false);
  RETURN v_msg;
END; $$;

-- ── 3) send_team_message: sessize almayan üyelere push taşıyıcısı ──
CREATE OR REPLACE FUNCTION public.send_team_message(p_team_id uuid, p_body text)
RETURNS public.team_messages LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = 'public','pg_temp' AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_msg    public.team_messages;
  v_sender text;
  v_team   text;
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

  -- Push taşıyıcıları: gönderen hariç, sessize ALMAYAN aktif üyeler
  SELECT coalesce(full_name, name::text, 'Oyuncu') INTO v_sender FROM public.profiles WHERE id = v_uid;
  SELECT name INTO v_team FROM public.teams WHERE id = p_team_id;
  INSERT INTO public.notifications (user_id, title, body, type_key, sender_id, team_id, deep_link, inbox)
  SELECT tm.user_id,
         v_team || ' 💬',
         v_sender || ': ' || left(trim(p_body), 100),
         'team_chat_message', v_uid, p_team_id,
         'oyna://team/' || p_team_id::text || '/chat',
         false
  FROM public.team_members tm
  LEFT JOIN public.team_chat_reads r ON r.team_id = tm.team_id AND r.user_id = tm.user_id
  WHERE tm.team_id = p_team_id AND tm.is_active = true
    AND tm.user_id <> v_uid
    AND coalesce(r.muted, false) = false;

  RETURN v_msg;
END $$;

-- ── 4) Şablonlar: DM + takım sohbeti tercihi (kapatılabilir) ──
INSERT INTO public.notification_templates (type_key, label_tr, title_tr, body_tr, category, is_mandatory, can_user_disable, sort_order)
SELECT * FROM (VALUES
  ('NEW_MESSAGE','Mesajlar (DM)','Yeni mesaj 💬','{sender_name} sana mesaj gönderdi.','SOCIAL',false,true,50),
  ('team_chat_message','Takım sohbeti','Takım sohbeti 💬','{sender_name}: {body}','SOCIAL',false,true,51)
) AS v(type_key,label_tr,title_tr,body_tr,category,is_mandatory,can_user_disable,sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.notification_templates t WHERE t.type_key = v.type_key);

-- ── 5) Gecelik temizlik: push taşıyıcıları 7 gün sonra silinir ──
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'social_cleanup_chat_pushes') THEN
    PERFORM cron.schedule(
      'social_cleanup_chat_pushes',
      '10 4 * * *',
      $job$DELETE FROM public.notifications
           WHERE inbox = false AND created_at < now() - interval '7 days'$job$
    );
  END IF;
END $$;
