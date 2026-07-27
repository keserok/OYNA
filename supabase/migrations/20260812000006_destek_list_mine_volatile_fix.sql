-- ═══════════════════════════════════════════════════════════════════════════
-- DESTEK DÜZELTMESİ: support_ticket_list_mine STABLE + UPDATE çelişkisi
--
-- Fonksiyon STABLE işaretliydi ama gövdesinde unread_for_user'ı temizleyen
-- UPDATE var — Postgres her çağrıda "UPDATE is not allowed in a non-volatile
-- function" (0A000) fırlatıyordu: kullanıcı taleplerini HİÇ listeleyemiyordu
-- (canlı uçtan-uca smoke ile yakalandı). VOLATILE olarak yeniden tanımlandı;
-- gövde birebir aynı.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.support_ticket_list_mine(p_channel text DEFAULT 'PLAYER'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
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
$function$;

REVOKE ALL ON FUNCTION public.support_ticket_list_mine(p_channel text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.support_ticket_list_mine(p_channel text) TO authenticated, service_role;
