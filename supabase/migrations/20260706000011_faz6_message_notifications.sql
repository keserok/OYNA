-- ==============================================================================
-- FAZ 6 — "Yeni mesaj" bildirimi (master prensipler §7 olaylar: yeni mesaj)
-- send_message: mesaj kaydedildikten sonra alıcıya notifications kaydı düşer.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.send_message(p_conversation_id uuid, p_body text)
RETURNS public.messages LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := auth.uid(); c public.conversations; v_other uuid; v_msg public.messages; v_sender text;
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

  -- Yeni mesaj bildirimi (alıcıya)
  SELECT COALESCE(full_name, name, 'Birisi') INTO v_sender FROM public.profiles WHERE id = v_uid;
  INSERT INTO public.notifications (user_id, title, body, type_key, sender_id)
  VALUES (v_other, v_sender || ' sana mesaj gönderdi', left(trim(p_body), 120), 'NEW_MESSAGE', v_uid);

  RETURN v_msg;
END; $$;
REVOKE ALL ON FUNCTION public.send_message(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_message(uuid, text) TO authenticated;
