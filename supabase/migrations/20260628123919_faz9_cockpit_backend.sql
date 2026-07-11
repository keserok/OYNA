-- ============================================================================
-- FAZ 9 — MAÇ KONTROL KOKPİTİ (arka uç) — Soru 51-57
-- Tam god-mode kokpit için eksik RPC'ler + skor override tam zinciri.
-- Mevcut RPC'ler yeniden kullanılır: admin_kick_from_slot, admin_assign_to_slot,
-- admin_assign_match_referee, admin_set_match_status, admin_cancel_match,
-- admin_refund_intent (force refund), admin_release_service_payout.
-- Para işlemleri FİNANS alt-rol kapısı + audit (UI'da yaz-onayla).
-- ============================================================================

-- 1) Kadroya bildirim (otomatik müdahale bildirimi için de kullanılır)
CREATE OR REPLACE FUNCTION public.admin_notify_match_roster(p_match_id uuid, p_title text, p_body text)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_count int;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  WITH roster AS (
    SELECT DISTINCT ((e.s)->'player'->>'id')::uuid AS pid
    FROM public.matches m
    CROSS JOIN LATERAL (
      SELECT jsonb_array_elements(COALESCE(m.slots, '[]'::jsonb)) AS s
      UNION ALL
      SELECT jsonb_array_elements(COALESCE(m."awaySlots", '[]'::jsonb)) AS s
    ) e
    WHERE m.id = p_match_id
      AND (e.s->>'status') = 'TAKEN'
      AND (e.s->'player'->>'id') IS NOT NULL
  )
  INSERT INTO public.notifications (user_id, title, body, type_key)
  SELECT pid, p_title, p_body, 'MATCH_ADMIN_UPDATE' FROM roster WHERE pid IS NOT NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM public.log_admin_action('MATCH_NOTIFY_ROSTER', 'match', p_match_id, NULL, NULL,
    jsonb_build_object('title', p_title, 'recipients', v_count));
  RETURN v_count;
END;
$function$;

-- 2) Force capture (FİNANS) — capture_preauth sarmalayıcısı + audit
CREATE OR REPLACE FUNCTION public.admin_force_capture_intent(p_intent_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_res jsonb;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  PERFORM public.require_admin_role(ARRAY['FINANCE']);
  v_res := public.capture_preauth(p_intent_id, 'ADMIN_FORCE', jsonb_build_object('admin', true, 'notes', p_notes));
  PERFORM public.log_admin_action('FORCE_CAPTURE', 'payment_intent', p_intent_id, NULL, NULL,
    v_res || jsonb_build_object('notes', p_notes));
  RETURN v_res;
END;
$function$;

-- 3) Force void (FİNANS) — void_preauth sarmalayıcısı + audit
CREATE OR REPLACE FUNCTION public.admin_force_void_intent(p_intent_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_res jsonb;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  PERFORM public.require_admin_role(ARRAY['FINANCE']);
  v_res := public.void_preauth(p_intent_id, COALESCE(p_reason, 'ADMIN_FORCE_VOID'));
  PERFORM public.log_admin_action('FORCE_VOID', 'payment_intent', p_intent_id, NULL, NULL,
    v_res || jsonb_build_object('reason', p_reason));
  RETURN v_res;
END;
$function$;

-- 4) Maça-özel audit timeline
CREATE OR REPLACE FUNCTION public.admin_fetch_match_audit(p_match_id uuid)
 RETURNS SETOF public.admin_audit_log LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  RETURN QUERY
    SELECT * FROM public.admin_audit_log
    WHERE target_id = p_match_id
    ORDER BY created_at DESC
    LIMIT 200;
END;
$function$;

-- 5) Skor override — TAM ZİNCİR (skor + tamamla + takım W/L geçmişi + otomatik bildirim)
CREATE OR REPLACE FUNCTION public.admin_override_match_score(p_match_id uuid, p_home integer, p_away integer, p_notes text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_old_h int; v_old_a int; v_prev timestamptz; v_notified int;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  PERFORM public.require_admin_role(ARRAY['MODERATOR']);
  IF p_home < 0 OR p_away < 0 THEN RAISE EXCEPTION 'INVALID_SCORE'; END IF;

  SELECT "homeScore", "awayScore", "scoreEnteredAt" INTO v_old_h, v_old_a, v_prev
  FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  IF v_prev IS NULL THEN
    -- İlk skor: tamamla + takım W/L geçmişine işle (helper score + status + history yapar)
    PERFORM public._finalize_team_match_score(p_match_id, p_home, p_away);
  ELSE
    -- Yeniden düzeltme: skoru güncelle (geçmiş ilk kayıttan korunur)
    UPDATE public.matches SET "homeScore" = p_home, "awayScore" = p_away WHERE id = p_match_id;
  END IF;

  -- Otomatik bildirim (kullanıcı kararı: müdahalede kadroyu bilgilendir)
  v_notified := public.admin_notify_match_roster(
    p_match_id, 'Maç sonucu güncellendi',
    format('Maçın skoru %s-%s olarak güncellendi.', p_home, p_away));

  PERFORM public.log_admin_action('MATCH_SCORE_OVERRIDE', 'match', p_match_id, NULL,
    jsonb_build_object('home', v_old_h, 'away', v_old_a),
    jsonb_build_object('home', p_home, 'away', p_away, 'notes', p_notes, 'notified', v_notified));

  RETURN jsonb_build_object('match_id', p_match_id, 'home', p_home, 'away', p_away,
    'finalized', (v_prev IS NULL), 'notified', v_notified);
END;
$function$;

-- ─── Yetkiler ───────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.admin_notify_match_roster(uuid, text, text)  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_force_capture_intent(uuid, text)        FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_force_void_intent(uuid, text)           FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_fetch_match_audit(uuid)                 FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_override_match_score(uuid, integer, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_notify_match_roster(uuid, text, text)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_force_capture_intent(uuid, text)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_force_void_intent(uuid, text)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_fetch_match_audit(uuid)                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_override_match_score(uuid, integer, integer, text) TO authenticated;
