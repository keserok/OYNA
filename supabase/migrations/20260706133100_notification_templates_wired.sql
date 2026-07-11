-- [DB GEÇMİŞİNDEN KURTARILDI 2026-07-11] Bu migration canlı veritabanına uygulanmıştı ancak repoda dosyası yoktu; supabase_migrations.schema_migrations.statements kolonundan geri çıkarıldı.

CREATE OR REPLACE FUNCTION public.notify_from_template(
  p_user_id uuid, p_type_key text, p_vars jsonb DEFAULT '{}'::jsonb, p_deep_link text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_title text; v_body text; k text; v_id uuid;
BEGIN
  SELECT title_tr, body_tr INTO v_title, v_body FROM public.notification_templates WHERE type_key = p_type_key;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bildirim şablonu bulunamadı: %', p_type_key; END IF;
  IF p_vars IS NOT NULL AND jsonb_typeof(p_vars) = 'object' THEN
    FOR k IN SELECT jsonb_object_keys(p_vars) LOOP
      v_title := regexp_replace(v_title, '\{\{\s*' || k || '\s*\}\}', COALESCE(p_vars->>k, ''), 'g');
      v_body  := regexp_replace(v_body,  '\{\{\s*' || k || '\s*\}\}', COALESCE(p_vars->>k, ''), 'g');
    END LOOP;
  END IF;
  INSERT INTO public.notifications (user_id, title, body, type_key, deep_link)
  VALUES (p_user_id, v_title, v_body, p_type_key, p_deep_link) RETURNING id INTO v_id;
  RETURN v_id;
END; $function$;
REVOKE ALL ON FUNCTION public.notify_from_template(uuid, text, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_from_template(uuid, text, jsonb, text) FROM anon;
REVOKE ALL ON FUNCTION public.notify_from_template(uuid, text, jsonb, text) FROM authenticated;

CREATE OR REPLACE FUNCTION public.admin_send_template_test(p_type_key text, p_vars jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  v_id := public.notify_from_template(auth.uid(), p_type_key, p_vars, NULL);
  PERFORM public.log_admin_action('NOTIFY_TEMPLATE_TEST', 'notification_template', NULL, p_type_key, NULL, p_vars);
  RETURN v_id;
END; $function$;
GRANT EXECUTE ON FUNCTION public.admin_send_template_test(text, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_send_template_test(text, jsonb) FROM anon;

DROP FUNCTION IF EXISTS public.admin_broadcast_notification(text, text, text, text);
DROP FUNCTION IF EXISTS public.admin_broadcast_notification__core(text, text, text, text);

CREATE OR REPLACE FUNCTION public.admin_broadcast_notification__core(
  p_title text, p_body text, p_segment text DEFAULT 'ALL', p_type text DEFAULT 'ADMIN_BROADCAST', p_template_id uuid DEFAULT NULL
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_count int := 0; v_daily_limit int; v_today_count int; v_sim boolean; v_title text := p_title; v_body text := p_body;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_template_id IS NOT NULL THEN
    SELECT title_tr, body_tr INTO v_title, v_body FROM public.notification_templates WHERE id = p_template_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Bildirim şablonu bulunamadı'; END IF;
  END IF;
  IF COALESCE(btrim(v_title),'') = '' OR COALESCE(btrim(v_body),'') = '' THEN
    RAISE EXCEPTION 'Başlık ve mesaj boş olamaz.';
  END IF;
  v_daily_limit := public.get_config_number('broadcast_max_per_day', 20)::int;
  SELECT COUNT(*) INTO v_today_count FROM public.broadcast_campaigns WHERE created_at >= date_trunc('day', now()) AND status = 'SENT';
  IF v_today_count >= v_daily_limit THEN
    RAISE EXCEPTION 'BROADCAST_DAILY_LIMIT: Bugünkü toplu gönderim limitine (%) ulaşıldı. Sistem Parametreleri''nden artırabilirsiniz.', v_daily_limit;
  END IF;
  INSERT INTO notifications (user_id, title, body, type_key)
  SELECT p.id, v_title, v_body, p_type FROM profiles p
  WHERE CASE p_segment
          WHEN 'ALL'        THEN true
          WHEN 'PRO'        THEN p.is_pro = true
          WHEN 'CAPTAIN'    THEN p.role = 'CAPTAIN'    OR COALESCE(p.roles, '[]'::jsonb) ? 'CAPTAIN'
          WHEN 'OWNER'      THEN p.role = 'OWNER'      OR COALESCE(p.roles, '[]'::jsonb) ? 'OWNER'
          WHEN 'GOALKEEPER' THEN p.role = 'GOALKEEPER' OR COALESCE(p.roles, '[]'::jsonb) ? 'GOALKEEPER'
          WHEN 'REFEREE'    THEN p.role = 'REFEREE'    OR COALESCE(p.roles, '[]'::jsonb) ? 'REFEREE'
          WHEN 'NEW_USERS'  THEN p.created_at >= NOW() - INTERVAL '30 days'
          ELSE false
        END;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_sim := NOT public.get_config_bool('push_live_enabled', false);
  INSERT INTO public.broadcast_campaigns (created_by, segment, type_key, template_id, title, body, recipient_count, status, is_simulation)
  VALUES (auth.uid(), p_segment, p_type, p_template_id, v_title, v_body, v_count, 'SENT', v_sim);
  PERFORM log_admin_action('BROADCAST', 'system', NULL, p_segment, NULL,
    jsonb_build_object('title', v_title, 'recipients', v_count, 'simulation', v_sim, 'template_id', p_template_id));
  RETURN v_count;
END; $function$;

CREATE OR REPLACE FUNCTION public.admin_broadcast_notification(
  p_title text, p_body text, p_segment text DEFAULT 'ALL', p_type text DEFAULT 'ADMIN_BROADCAST', p_template_id uuid DEFAULT NULL
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.require_admin_role('{}'::text[]);
  RETURN public.admin_broadcast_notification__core(p_title, p_body, p_segment, p_type, p_template_id);
END; $function$;
GRANT EXECUTE ON FUNCTION public.admin_broadcast_notification(text, text, text, text, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_broadcast_notification(text, text, text, text, uuid) FROM anon;
