-- ═══════════════════════════════════════════════════════════════════════════
-- BASELINE — admin __core sarmalayıcıları (canlı pg_get_functiondef, 2026-07-20)
-- 20260713000016_admin_rpc_anon_revoke bu ikisine REVOKE uygular ama CREATE'leri
-- hiçbir migration'da yok (defter-dışı "wrap" kaydından). ÜRETİMDE: birebir
-- aynı tanım → etkisiz. Konum: broadcast_campaigns (20260708) sonrası,
-- 20260713000016 öncesi.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_broadcast_notification__core(p_title text, p_body text, p_segment text DEFAULT 'ALL'::text, p_type text DEFAULT 'ADMIN_BROADCAST'::text, p_template_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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

CREATE OR REPLACE FUNCTION public.admin_cancel_account_deletion__core(p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_email text;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT email INTO v_email FROM public.profiles WHERE id = p_user_id AND account_deletion_requested_at IS NOT NULL;
  IF v_email IS NULL THEN RAISE EXCEPTION 'Bekleyen silme talebi bulunamadı'; END IF;
  UPDATE public.profiles SET account_deletion_requested_at = NULL, updated_at = NOW() WHERE id = p_user_id;
  INSERT INTO public.notifications (user_id, title, body, type_key)
  VALUES (p_user_id, 'Silme Talebin İptal Edildi',
    'Hesap silme talebin yönetici tarafından iptal edildi. Hesabın aktif kalmaya devam ediyor.',
    'ACCOUNT_DELETION_CANCELLED');
  PERFORM public.log_admin_action('ACCOUNT_DELETE_CANCEL','user',p_user_id,v_email,NULL,NULL);
  RETURN true;
END; $function$;
