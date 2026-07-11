-- ============================================================================
-- DESTEK MERKEZİ — Uygulama içi destek talepleri + tesis sahibi mesajlaşması
--
-- Eksiklik #1 (Destek Talebi Gelen Kutusu) ve #2 (Saha Sahibi ↔ Admin İletişim)
-- tek bir kaynaktan çözülür: `support_tickets` tablosu bir `channel` ayrımıyla
-- iki kitleyi taşır — PLAYER (oyuncu şikayet/talebi) ve OWNER (tesis sahibi
-- panel-içi mesajı). Admin panelinde iki ayrı kuyruk (Destek Talepleri /
-- Tesis Sahibi Mesajları) aynı tabloyu channel'a göre okur.
--
-- Akış: Kullanıcı/owner uygulamadan talep açar → admin panelde kuyrukta belirir
-- → admin yanıtlar (kullanıcıya bildirim düşer), durumu değiştirir/kapatır.
-- Her admin yanıtı/durum değişikliği denetim günlüğüne (log_admin_action) yazılır.
-- ============================================================================

-- ─── 1) Tablolar ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  channel           text NOT NULL DEFAULT 'PLAYER' CHECK (channel IN ('PLAYER','OWNER')),
  subject           text NOT NULL,
  category          text NOT NULL DEFAULT 'GENERAL',
  status            text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','PENDING','RESOLVED','CLOSED')),
  priority          text NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW','NORMAL','HIGH','URGENT')),
  last_sender_role  text NOT NULL DEFAULT 'USER' CHECK (last_sender_role IN ('USER','ADMIN')),
  unread_for_admin  boolean NOT NULL DEFAULT true,
  unread_for_user   boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  last_message_at   timestamptz NOT NULL DEFAULT now(),
  resolved_at       timestamptz,
  resolved_by       uuid
);

CREATE TABLE IF NOT EXISTS public.support_ticket_messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id    uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sender_id    uuid,
  sender_role  text NOT NULL CHECK (sender_role IN ('USER','ADMIN')),
  sender_name  text,
  body         text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_channel_status
  ON public.support_tickets (channel, status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user
  ON public.support_tickets (user_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_ticket
  ON public.support_ticket_messages (ticket_id, created_at);

-- ─── 2) RLS — kullanıcı yalnız kendi taleplerini görür; yazım RPC üstünden ────
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "support_tickets_owner_select" ON public.support_tickets;
CREATE POLICY "support_tickets_owner_select" ON public.support_tickets
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "support_ticket_messages_owner_select" ON public.support_ticket_messages;
CREATE POLICY "support_ticket_messages_owner_select" ON public.support_ticket_messages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_id AND t.user_id = auth.uid())
  );

-- Realtime (kullanıcı kendi talebinde admin yanıtını canlı görür)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.support_tickets;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.support_ticket_messages;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL; END $$;

-- ─── 3) Kullanıcı/owner RPC'leri ─────────────────────────────────────────────
-- Yeni talep aç (ilk mesajla birlikte). p_channel owner panelinden 'OWNER' gelir.
CREATE OR REPLACE FUNCTION public.support_ticket_create(
  p_subject  text,
  p_body     text,
  p_category text DEFAULT 'GENERAL',
  p_channel  text DEFAULT 'PLAYER'
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_name   text;
  v_ticket uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_channel NOT IN ('PLAYER','OWNER') THEN p_channel := 'PLAYER'; END IF;
  p_subject := btrim(COALESCE(p_subject, ''));
  p_body    := btrim(COALESCE(p_body, ''));
  IF length(p_subject) < 3 THEN RAISE EXCEPTION 'Konu en az 3 karakter olmalıdır.'; END IF;
  IF length(p_body) < 1 THEN RAISE EXCEPTION 'Mesaj boş olamaz.'; END IF;

  SELECT COALESCE(full_name, name, email) INTO v_name FROM public.profiles WHERE id = v_uid;

  INSERT INTO public.support_tickets (user_id, channel, subject, category, last_sender_role, unread_for_admin)
  VALUES (v_uid, p_channel, left(p_subject, 160), COALESCE(NULLIF(btrim(p_category), ''), 'GENERAL'), 'USER', true)
  RETURNING id INTO v_ticket;

  INSERT INTO public.support_ticket_messages (ticket_id, sender_id, sender_role, sender_name, body)
  VALUES (v_ticket, v_uid, 'USER', v_name, p_body);

  RETURN v_ticket;
END;
$$;

-- Mevcut talebe mesaj ekle (yalnız talep sahibi)
CREATE OR REPLACE FUNCTION public.support_ticket_add_message(
  p_ticket_id uuid,
  p_body      text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
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
$$;

-- Kullanıcının kendi taleplerini (mesajlarıyla) getir
CREATE OR REPLACE FUNCTION public.support_ticket_list_mine(p_channel text DEFAULT 'PLAYER')
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
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

  -- Kullanıcı kendi kuyruğunu açınca "okundu" işaretle
  UPDATE public.support_tickets SET unread_for_user = false
  WHERE user_id = v_uid AND channel = COALESCE(p_channel, 'PLAYER') AND unread_for_user = true;

  RETURN v_out;
END;
$$;

-- ─── 4) Admin RPC'leri ───────────────────────────────────────────────────────
-- Kuyruk listesi (channel'a göre) — kullanıcı adı + mesaj sayısı + son mesaj önizleme
CREATE OR REPLACE FUNCTION public.admin_support_tickets_list(
  p_channel text,
  p_status  text DEFAULT NULL,
  p_search  text DEFAULT NULL,
  p_limit   int  DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
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
$$;

-- Tek talebin tam dökümü (mesajlarıyla) + admin okundu işareti
CREATE OR REPLACE FUNCTION public.admin_support_ticket_thread(p_ticket_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
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
$$;

-- Admin yanıtı (+ opsiyonel durum değişimi) → kullanıcıya bildirim + audit
CREATE OR REPLACE FUNCTION public.admin_support_ticket_reply(
  p_ticket_id  uuid,
  p_body       text,
  p_new_status text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
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

  -- Kullanıcıya bildirim (uygulama içi)
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
$$;

-- Yalnız durum değişimi (yanıtsız kapatma/yeniden açma) → audit
CREATE OR REPLACE FUNCTION public.admin_support_ticket_set_status(
  p_ticket_id uuid,
  p_status    text
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
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
$$;

-- ─── 5) Grants ───────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.support_ticket_create(text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.support_ticket_add_message(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.support_ticket_list_mine(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.support_ticket_create(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.support_ticket_add_message(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.support_ticket_list_mine(text) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_support_tickets_list(text, text, text, int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_support_ticket_thread(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_support_ticket_reply(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_support_ticket_set_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_support_tickets_list(text, text, text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_support_ticket_thread(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_support_ticket_reply(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_support_ticket_set_status(uuid, text) TO authenticated;

-- ─── 6) Dashboard sayaçları (sidebar rozetleri) ──────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_dashboard_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT jsonb_build_object(
    'total_users',        (SELECT COUNT(*)::int FROM public.profiles),
    'total_pitches',      (SELECT COUNT(*)::int FROM public.pitches),
    'total_matches',      (SELECT COUNT(*)::int FROM public.matches),
    'total_communities',  (SELECT COUNT(*)::int FROM public.communities),
    'pending_verifications', (SELECT COUNT(*)::int FROM public.profiles WHERE verification_status = 'pending'),
    'pending_pitches',    (SELECT COUNT(*)::int FROM public.pitches WHERE verification_status = 'pending'),
    'pending_withdrawals',(SELECT COUNT(*)::int FROM public.payout_requests WHERE status = 'PENDING'),
    'open_disputes',      (SELECT COUNT(*)::int FROM public.match_disputes WHERE status IN ('OPEN','UNDER_REVIEW')),
    'deletion_requests',  (SELECT COUNT(*)::int FROM public.profiles WHERE account_deletion_requested_at IS NOT NULL),
    'pending_community_requests', (SELECT COUNT(*)::int FROM public.community_creation_requests WHERE status = 'PENDING'),
    'banned_users',       (SELECT COUNT(*)::int FROM public.profiles WHERE is_banned = true),
    'active_goalkeepers', (SELECT COUNT(*)::int FROM public.goalkeepers),
    'active_referees',    (SELECT COUNT(*)::int FROM public.referees),
    'total_booking_revenue', COALESCE((SELECT SUM(amount) FROM public.booking_payments), 0),
    'total_wallet_volume', COALESCE((SELECT SUM(ABS(amount)) FROM public.wallet_transactions), 0),
    'active_promo_codes', (SELECT COUNT(*)::int FROM public.promo_codes WHERE is_active = true),
    'open_support_tickets', (SELECT COUNT(*)::int FROM public.support_tickets WHERE channel = 'PLAYER' AND status IN ('OPEN','PENDING')),
    'open_owner_messages',  (SELECT COUNT(*)::int FROM public.support_tickets WHERE channel = 'OWNER'  AND status IN ('OPEN','PENDING')),
    'commission_rate',    (SELECT "commissionRate" FROM public.settings WHERE id = 'main')
  ) INTO v_result;

  RETURN v_result;
END;
$function$;
