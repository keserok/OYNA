-- Canlıda halen bozuk: admin_moderate_join_request ve admin_notify_community
-- notifications.type (yok) yerine notifications.type_key kullanmalı.
-- 20260621165408_admin_community_control.sql zaten tracked/applied olduğundan
-- bu ayrı takip migration'ı ile düzeltiliyor.

CREATE OR REPLACE FUNCTION public.admin_moderate_join_request(p_request_id uuid, p_approved boolean, p_notes text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_req public.community_join_requests%ROWTYPE;
  v_comm_name TEXT;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT * INTO v_req FROM public.community_join_requests WHERE id = p_request_id;
  IF v_req.id IS NULL THEN
    RAISE EXCEPTION 'Talep bulunamadı';
  END IF;

  SELECT name INTO v_comm_name FROM public.communities WHERE id = v_req.community_id;

  UPDATE public.community_join_requests SET
    status = CASE WHEN p_approved THEN 'APPROVED' ELSE 'REJECTED' END,
    reviewed_by = auth.uid(),
    reviewed_at = NOW(),
    rejection_reason = CASE WHEN p_approved THEN NULL ELSE p_notes END
  WHERE id = p_request_id;

  IF p_approved THEN
    INSERT INTO public.community_members (community_id, user_id, role)
    VALUES (v_req.community_id, v_req.user_id, 'MEMBER')
    ON CONFLICT (community_id, user_id) DO NOTHING;
    PERFORM public._sync_profile_communities(v_req.user_id);

    INSERT INTO public.notifications (user_id, title, body, type_key)
    VALUES (
      v_req.user_id,
      'Topluluğa Kabul Edildin',
      COALESCE(v_comm_name, 'Topluluk') || ' topluluğuna katılımın onaylandı.',
      'COMMUNITY_JOIN_APPROVED'
    );
  ELSE
    INSERT INTO public.notifications (user_id, title, body, type_key)
    VALUES (
      v_req.user_id,
      'Katılma Talebi Reddedildi',
      COALESCE(p_notes, 'Topluluk katılma talebin onaylanamadı.'),
      'COMMUNITY_JOIN_REJECTED'
    );
  END IF;

  PERFORM public.log_admin_action(
    CASE WHEN p_approved THEN 'COMMUNITY_JOIN_APPROVE' ELSE 'COMMUNITY_JOIN_REJECT' END,
    'community', v_req.community_id, v_comm_name,
    jsonb_build_object('request_id', p_request_id, 'user_id', v_req.user_id),
    jsonb_build_object('approved', p_approved, 'notes', p_notes)
  );

  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_notify_community(p_community_id uuid, p_title text, p_body text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count INT := 0;
  v_name TEXT;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT name INTO v_name FROM public.communities WHERE id = p_community_id;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Topluluk bulunamadı';
  END IF;

  INSERT INTO public.notifications (user_id, title, body, type_key)
  SELECT cm.user_id, p_title, p_body, 'ADMIN_COMMUNITY'
  FROM public.community_members cm
  WHERE cm.community_id = p_community_id
    AND cm.notifications_enabled IS DISTINCT FROM false;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  PERFORM public.log_admin_action(
    'COMMUNITY_NOTIFY', 'community', p_community_id, v_name,
    NULL, jsonb_build_object('title', p_title, 'recipients', v_count)
  );

  RETURN v_count;
END;
$function$;
