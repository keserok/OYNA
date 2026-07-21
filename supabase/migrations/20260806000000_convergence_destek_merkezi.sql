-- ============================================================================
-- YAKINSAMA (Faz 2a-1) — DESTEK MERKEZİ FONKSİYON SETİ
-- ----------------------------------------------------------------------------
-- DRIFT ONARIMI NOTU (2026-07-21): Bu 7 fonksiyon canlıda çalışıyor ancak hiçbir
-- repo migration'ında tanımları yoktu (prod-only envanteri, Faz 2a kanıt turu).
-- Tanımlar canlıdan pg_get_functiondef ile BİREBİR alınmıştır; canlıda davranış
-- değişmez (aynı tanımın üzerine aynı tanım). Tablolar zaten repoda:
-- 20260720135945_baseline_ledger_only_tables (support_tickets,
-- support_ticket_messages). ACL bölümü canlı proacl kayıtlarından üretilmiştir.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.support_ticket_create(p_subject text, p_body text, p_category text DEFAULT 'GENERAL'::text, p_channel text DEFAULT 'PLAYER'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid       uuid := auth.uid();
  v_name      text;
  v_ticket    uuid;
  v_open_cnt  int;
  v_last_at   timestamptz;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_channel NOT IN ('PLAYER','OWNER') THEN p_channel := 'PLAYER'; END IF;
  p_subject := btrim(COALESCE(p_subject, ''));
  p_body    := btrim(COALESCE(p_body, ''));
  IF length(p_subject) < 3 THEN RAISE EXCEPTION 'Konu en az 3 karakter olmalıdır.'; END IF;
  IF length(p_body) < 1 THEN RAISE EXCEPTION 'Mesaj boş olamaz.'; END IF;

  SELECT count(*) INTO v_open_cnt FROM public.support_tickets
  WHERE user_id = v_uid AND channel = p_channel AND status IN ('OPEN','PENDING');
  IF v_open_cnt >= 5 THEN
    RAISE EXCEPTION 'En fazla 5 açık talebiniz olabilir. Lütfen mevcut taleplerinizin yanıtlanmasını bekleyin.';
  END IF;

  SELECT max(created_at) INTO v_last_at FROM public.support_tickets WHERE user_id = v_uid;
  IF v_last_at IS NOT NULL AND now() - v_last_at < interval '60 seconds' THEN
    RAISE EXCEPTION 'Çok hızlı talep açıyorsunuz. Lütfen 1 dakika bekleyin.';
  END IF;

  SELECT COALESCE(full_name, name, email) INTO v_name FROM public.profiles WHERE id = v_uid;

  INSERT INTO public.support_tickets (user_id, channel, subject, category, last_sender_role, unread_for_admin)
  VALUES (v_uid, p_channel, left(p_subject, 160), COALESCE(NULLIF(btrim(p_category), ''), 'GENERAL'), 'USER', true)
  RETURNING id INTO v_ticket;

  INSERT INTO public.support_ticket_messages (ticket_id, sender_id, sender_role, sender_name, body)
  VALUES (v_ticket, v_uid, 'USER', v_name, left(p_body, 4000));

  RETURN v_ticket;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.support_ticket_add_message(p_ticket_id uuid, p_body text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_name text;
  v_msg  uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  p_body := btrim(COALESCE(p_body, ''));
  IF length(p_body) < 1 THEN RAISE EXCEPTION 'Mesaj boş olamaz.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.support_tickets WHERE id = p_ticket_id AND user_id = v_uid) THEN
    RAISE EXCEPTION 'Talep bulunamadı.';
  END IF;

  SELECT COALESCE(full_name, name, email) INTO v_name FROM public.profiles WHERE id = v_uid;

  INSERT INTO public.support_ticket_messages (ticket_id, sender_id, sender_role, sender_name, body)
  VALUES (p_ticket_id, v_uid, 'USER', v_name, p_body)
  RETURNING id INTO v_msg;

  UPDATE public.support_tickets SET
    last_message_at  = now(),
    updated_at       = now(),
    last_sender_role = 'USER',
    unread_for_admin = true,
    unread_for_user  = false,
    status           = CASE WHEN status IN ('RESOLVED','CLOSED') THEN 'OPEN' ELSE status END,
    resolved_at      = CASE WHEN status IN ('RESOLVED','CLOSED') THEN NULL ELSE resolved_at END
  WHERE id = p_ticket_id;

  RETURN v_msg;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.support_ticket_list_mine(p_channel text DEFAULT 'PLAYER'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_out jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(t2)::jsonb ORDER BY t2.last_message_at DESC), '[]'::jsonb)
  INTO v_out
  FROM (
    SELECT t.id, t.subject, t.category, t.status, t.priority, t.channel,
           t.created_at, t.last_message_at, t.unread_for_user,
           (SELECT COALESCE(jsonb_agg(jsonb_build_object(
              'id', m.id, 'sender_role', m.sender_role, 'sender_name', m.sender_name,
              'body', m.body, 'created_at', m.created_at) ORDER BY m.created_at), '[]'::jsonb)
            FROM public.support_ticket_messages m WHERE m.ticket_id = t.id) AS messages
    FROM public.support_tickets t
    WHERE t.user_id = v_uid AND t.channel = COALESCE(p_channel, 'PLAYER')
  ) t2;

  UPDATE public.support_tickets SET unread_for_user = false
  WHERE user_id = v_uid AND channel = COALESCE(p_channel, 'PLAYER') AND unread_for_user = true;

  RETURN v_out;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_support_tickets_list(p_channel text, p_status text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 100)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_out jsonb;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(t2)::jsonb ORDER BY t2.last_message_at DESC), '[]'::jsonb)
  INTO v_out
  FROM (
    SELECT t.id, t.user_id, t.channel, t.subject, t.category, t.status, t.priority,
           t.last_sender_role, t.unread_for_admin, t.created_at, t.updated_at,
           t.last_message_at, t.resolved_at,
           COALESCE(p.full_name, p.name, p.email) AS user_name,
           p.email AS user_email,
           (SELECT count(*) FROM public.support_ticket_messages m WHERE m.ticket_id = t.id) AS message_count,
           (SELECT m.body FROM public.support_ticket_messages m WHERE m.ticket_id = t.id
             ORDER BY m.created_at DESC LIMIT 1) AS last_preview
    FROM public.support_tickets t
    LEFT JOIN public.profiles p ON p.id = t.user_id
    WHERE t.channel = p_channel
      AND (p_status IS NULL OR t.status = p_status)
      AND (
        p_search IS NULL OR btrim(p_search) = '' OR
        t.subject ILIKE '%' || p_search || '%' OR
        COALESCE(p.full_name, p.name, p.email, '') ILIKE '%' || p_search || '%'
      )
    ORDER BY t.last_message_at DESC
    LIMIT GREATEST(COALESCE(p_limit, 100), 1)
  ) t2;

  RETURN v_out;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_support_ticket_thread(p_ticket_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_out jsonb;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  UPDATE public.support_tickets SET unread_for_admin = false
  WHERE id = p_ticket_id AND unread_for_admin = true;

  SELECT jsonb_build_object(
    'id', t.id, 'user_id', t.user_id, 'channel', t.channel, 'subject', t.subject,
    'category', t.category, 'status', t.status, 'priority', t.priority,
    'created_at', t.created_at, 'last_message_at', t.last_message_at,
    'user_name', COALESCE(p.full_name, p.name, p.email),
    'user_email', p.email,
    'messages', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', m.id, 'sender_role', m.sender_role, 'sender_name', m.sender_name,
        'body', m.body, 'created_at', m.created_at) ORDER BY m.created_at), '[]'::jsonb)
      FROM public.support_ticket_messages m WHERE m.ticket_id = t.id)
  ) INTO v_out
  FROM public.support_tickets t
  LEFT JOIN public.profiles p ON p.id = t.user_id
  WHERE t.id = p_ticket_id;

  IF v_out IS NULL THEN RAISE EXCEPTION 'Talep bulunamadı.'; END IF;
  RETURN v_out;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_support_ticket_reply(p_ticket_id uuid, p_body text, p_new_status text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_name   text;
  v_msg    uuid;
  v_user   uuid;
  v_subj   text;
  v_status text;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  p_body := btrim(COALESCE(p_body, ''));
  IF length(p_body) < 1 THEN RAISE EXCEPTION 'Yanıt boş olamaz.'; END IF;
  IF p_new_status IS NOT NULL AND p_new_status NOT IN ('OPEN','PENDING','RESOLVED','CLOSED') THEN
    RAISE EXCEPTION 'Geçersiz durum.';
  END IF;

  SELECT user_id, subject INTO v_user, v_subj FROM public.support_tickets WHERE id = p_ticket_id;
  IF v_user IS NULL THEN RAISE EXCEPTION 'Talep bulunamadı.'; END IF;

  SELECT COALESCE(full_name, name, email, 'OYNA Destek') INTO v_name FROM public.profiles WHERE id = v_uid;

  INSERT INTO public.support_ticket_messages (ticket_id, sender_id, sender_role, sender_name, body)
  VALUES (p_ticket_id, v_uid, 'ADMIN', COALESCE(v_name, 'OYNA Destek'), p_body)
  RETURNING id INTO v_msg;

  v_status := COALESCE(p_new_status, 'PENDING');

  UPDATE public.support_tickets SET
    last_message_at  = now(),
    updated_at       = now(),
    last_sender_role = 'ADMIN',
    unread_for_admin = false,
    unread_for_user  = true,
    status           = v_status,
    resolved_at      = CASE WHEN v_status IN ('RESOLVED','CLOSED') THEN now() ELSE NULL END,
    resolved_by      = CASE WHEN v_status IN ('RESOLVED','CLOSED') THEN v_uid ELSE resolved_by END
  WHERE id = p_ticket_id;

  INSERT INTO public.notifications (user_id, title, body, type_key, payload)
  VALUES (
    v_user,
    'Destek talebiniz yanıtlandı',
    left(p_body, 140),
    'SUPPORT_REPLY',
    jsonb_build_object('ticket_id', p_ticket_id, 'subject', v_subj)
  );

  PERFORM public.log_admin_action('SUPPORT_REPLY', 'support_ticket', p_ticket_id, v_subj, NULL,
    jsonb_build_object('status', v_status));

  RETURN v_msg;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_support_ticket_set_status(p_ticket_id uuid, p_status text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_subj text;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_status NOT IN ('OPEN','PENDING','RESOLVED','CLOSED') THEN RAISE EXCEPTION 'Geçersiz durum.'; END IF;

  SELECT subject INTO v_subj FROM public.support_tickets WHERE id = p_ticket_id;
  IF v_subj IS NULL THEN RAISE EXCEPTION 'Talep bulunamadı.'; END IF;

  UPDATE public.support_tickets SET
    status      = p_status,
    updated_at  = now(),
    resolved_at = CASE WHEN p_status IN ('RESOLVED','CLOSED') THEN now() ELSE NULL END,
    resolved_by = CASE WHEN p_status IN ('RESOLVED','CLOSED') THEN v_uid ELSE resolved_by END
  WHERE id = p_ticket_id;

  PERFORM public.log_admin_action('SUPPORT_STATUS', 'support_ticket', p_ticket_id, v_subj, NULL,
    jsonb_build_object('status', p_status));
  RETURN true;
END;
$function$
;

-- ─── Yetkiler (canlı proacl kayıtları birebir) ──────────────────────────────

REVOKE ALL ON FUNCTION public.support_ticket_create(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.support_ticket_create(text, text, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.support_ticket_add_message(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.support_ticket_add_message(uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.support_ticket_list_mine(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.support_ticket_list_mine(text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_support_tickets_list(text, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_support_tickets_list(text, text, text, integer) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_support_ticket_thread(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_support_ticket_thread(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_support_ticket_reply(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_support_ticket_reply(uuid, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_support_ticket_set_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_support_ticket_set_status(uuid, text) TO authenticated, service_role;
