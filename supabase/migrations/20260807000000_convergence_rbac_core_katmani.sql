-- ============================================================================
-- YAKINSAMA (Faz 2a-2) — RBAC __core KATMANI (saf ekleme)
-- ----------------------------------------------------------------------------
-- DRIFT ONARIMI NOTU (2026-07-21): Bu 40 __core fonksiyonu canlıda RBAC
-- sarmalayıcı deseninin çekirdeğiydi ama repoda tanımları yoktu (yalnız kamu
-- sarmalayıcıları vardı → repo iç tutarsızlığı: sarmalayıcı, var olmayan
-- __core'u çağırıyordu). admin_cancel_account_deletion SARMALAYICISI da eksikti.
-- Tüm tanımlar canlıdan pg_get_functiondef ile BİREBİR alınmıştır; canlıda
-- CREATE OR REPLACE = aynı tanım = no-op. ACL'ler canlı proacl'den üretildi:
-- __core fonksiyonları yalnız service_role (iç çağrı; kamu sarmalayıcısı
-- SECURITY DEFINER olarak owner haklarıyla çağırır), sarmalayıcı authenticated.
-- Repoda ZATEN VAR olan 4 __core (broadcast_notification, cancel_account_
-- deletion, create_match, update_user_profile) ve 43 kamu sarmalayıcısı bu
-- dosyada YOKTUR; onların çakışma denetimi ayrı yürütülür (preview-vs-prod md5).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_assign_match_goalkeeper__core(p_match_id uuid, p_goalkeeper_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  PERFORM public.require_admin_role(ARRAY['MODERATOR']);
  IF p_goalkeeper_id IS NULL THEN
    v_uid := NULL;
  ELSE
    SELECT "authUid" INTO v_uid FROM public.goalkeepers WHERE id = p_goalkeeper_id;
    IF v_uid IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid) THEN
      RAISE EXCEPTION 'Bu kalecinin sistemde bağlı kullanıcı hesabı yok; maça doğrudan atanamıyor.';
    END IF;
  END IF;
  UPDATE public.matches SET gk_id = v_uid WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Maç bulunamadı'; END IF;
  PERFORM public.log_admin_action('MATCH_ASSIGN_GK', 'match', p_match_id, COALESCE(p_goalkeeper_id::text,'kaldırıldı'), NULL, NULL);
  RETURN TRUE;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_assign_match_referee__core(p_match_id uuid, p_referee_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  UPDATE public.matches SET
    "refereeId" = NULLIF(p_referee_id::text, '')::uuid
  WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Maç bulunamadı'; END IF;
  PERFORM public.log_admin_action('MATCH_ASSIGN_REFEREE', 'match', p_match_id, p_referee_id::text, NULL, NULL);
  RETURN TRUE;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_assign_to_slot__core(p_match_id uuid, p_slot_id text, p_user_id uuid, p_is_away boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_slots JSONB; v_updated JSONB; v_elem JSONB; v_player JSONB; v_patch JSONB;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT jsonb_build_object(
    'id', p.id, 'name', COALESCE(p.full_name, p.email),
    'avatar', p.avatar_url, 'rating', COALESCE(p.rating, 5.0)
  ) INTO v_player FROM public.profiles p WHERE id = p_user_id;
  IF v_player IS NULL THEN RAISE EXCEPTION 'Kullanıcı bulunamadı'; END IF;

  IF p_is_away THEN
    SELECT "awaySlots" INTO v_slots FROM public.matches WHERE id = p_match_id FOR UPDATE;
  ELSE
    SELECT slots INTO v_slots FROM public.matches WHERE id = p_match_id FOR UPDATE;
  END IF;

  SELECT elem INTO v_elem FROM jsonb_array_elements(COALESCE(v_slots,'[]'::jsonb)) elem WHERE elem->>'id' = p_slot_id;
  IF v_elem IS NULL THEN RAISE EXCEPTION 'Slot bulunamadı'; END IF;

  v_player := v_player || jsonb_build_object(
    'position', COALESCE(v_elem->>'role','OYUNCU'),
    'x', v_elem->'x', 'y', v_elem->'y',
    'paymentStatus', 'PAID'
  );
  v_patch := jsonb_build_object('status','TAKEN','userId',p_user_id,'player',v_player,'assignmentStatus','ADMIN');
  v_updated := public._admin_patch_slot(v_slots, p_slot_id, v_patch);

  IF p_is_away THEN
    UPDATE public.matches SET "awaySlots" = v_updated WHERE id = p_match_id;
  ELSE
    UPDATE public.matches SET slots = v_updated WHERE id = p_match_id;
  END IF;

  PERFORM public.log_admin_action('MATCH_ASSIGN_SLOT', 'match', p_match_id, p_user_id::text, NULL,
    jsonb_build_object('slot_id', p_slot_id, 'is_away', p_is_away, 'paymentStatus','PAID'));
  PERFORM public.admin_recompute_match_status(p_match_id);
  RETURN v_updated;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_ban_user__core(p_user_id uuid, p_is_banned boolean, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_reason text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_email TEXT;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT email INTO v_email FROM public.profiles WHERE id = p_user_id;
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Kullanıcı bulunamadı.';
  END IF;

  UPDATE public.profiles SET
    is_banned      = p_is_banned,
    ban_expires_at = CASE WHEN p_is_banned THEN p_expires_at ELSE NULL END,
    updated_at     = NOW()
  WHERE id = p_user_id;

  PERFORM public.log_admin_action(
    CASE WHEN p_is_banned THEN 'BAN' ELSE 'UNBAN' END,
    'user', p_user_id, v_email,
    NULL,
    jsonb_build_object('is_banned', p_is_banned, 'expires_at', p_expires_at, 'reason', p_reason)
  );

  RETURN TRUE;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_cancel_match__core(p_match_id uuid, p_reason text DEFAULT NULL::text, p_refund boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  UPDATE public.matches SET
    status = 'CANCELLED',
    cancel_reason = COALESCE(p_reason, cancel_reason),
    refund_status = CASE WHEN p_refund THEN 'PENDING' ELSE refund_status END
  WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Maç bulunamadı'; END IF;
  PERFORM public.log_admin_action('MATCH_CANCEL', 'match', p_match_id, p_reason, NULL,
    jsonb_build_object('refund', p_refund));
  RETURN TRUE;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_create_goalkeeper__core(p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  v_id := COALESCE((p_data->>'id')::uuid, gen_random_uuid());

  INSERT INTO public.goalkeepers (
    id, name, height, age, rating, fee, match_count, avatar,
    recent_awards, style, bio, preferred_zones, is_elite,
    coordinates, stats, skills, equipment,
    is_available, working_hours, settings
  ) VALUES (
    v_id,
    p_data->>'name',
    p_data->>'height',
    (p_data->>'age')::integer,
    COALESCE((p_data->>'rating')::numeric, 0),
    COALESCE((p_data->>'fee')::integer, 0),
    COALESCE((p_data->>'match_count')::integer, 0),
    p_data->>'avatar',
    p_data->>'recent_awards',
    p_data->>'style',
    p_data->>'bio',
    p_data->'preferred_zones',
    COALESCE((p_data->>'is_elite')::boolean, false),
    p_data->'coordinates',
    p_data->'stats',
    p_data->'skills',
    p_data->'equipment',
    COALESCE((p_data->>'is_available')::boolean, true),
    p_data->'working_hours',
    p_data->'settings'
  );

  PERFORM public.log_admin_action(
    'GK_CREATE', 'goalkeeper', v_id, p_data->>'name', NULL,
    jsonb_build_object('created_by', auth.uid(), 'name', p_data->>'name')
  );
  RETURN v_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_create_referee__core(p_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  v_id := COALESCE((p_data->>'id')::uuid, gen_random_uuid());

  INSERT INTO public.referees (
    id, auth_uid, name, level, match_count, fee, avatar, rating,
    style, bio, preferred_zones, is_elite, coordinates, stats,
    is_available, working_hours, settings
  ) VALUES (
    v_id,
    (p_data->>'auth_uid')::uuid,
    p_data->>'name',
    p_data->>'level',
    COALESCE((p_data->>'match_count')::integer, 0),
    COALESCE((p_data->>'fee')::integer, 0),
    p_data->>'avatar',
    COALESCE((p_data->>'rating')::numeric, 0),
    p_data->>'style',
    p_data->>'bio',
    p_data->'preferred_zones',
    COALESCE((p_data->>'is_elite')::boolean, false),
    p_data->'coordinates',
    p_data->'stats',
    COALESCE((p_data->>'is_available')::boolean, true),
    p_data->'working_hours',
    p_data->'settings'
  );

  PERFORM public.log_admin_action(
    'REF_CREATE', 'referee', v_id, p_data->>'name', NULL,
    jsonb_build_object('created_by', auth.uid(), 'name', p_data->>'name')
  );
  RETURN v_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_delete_goalkeeper__core(p_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_name TEXT;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT name INTO v_name FROM public.goalkeepers WHERE id = p_id;
  IF v_name IS NULL THEN RAISE EXCEPTION 'Kaleci bulunamadı'; END IF;
  DELETE FROM public.goalkeepers WHERE id = p_id;
  PERFORM public.log_admin_action('GK_DELETE', 'goalkeeper', p_id, v_name, NULL, NULL);
  RETURN TRUE;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_delete_match__core(p_match_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_title TEXT;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT title INTO v_title FROM public.matches WHERE id = p_match_id;
  IF v_title IS NULL THEN RAISE EXCEPTION 'Maç bulunamadı'; END IF;
  DELETE FROM public.matches WHERE id = p_match_id;
  PERFORM public.log_admin_action('MATCH_DELETE', 'match', p_match_id, v_title, NULL, NULL);
  RETURN TRUE;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_delete_pitch__core(p_pitch_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_name TEXT;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT name INTO v_name FROM public.pitches WHERE id = p_pitch_id;
  IF v_name IS NULL THEN RAISE EXCEPTION 'Saha bulunamadı'; END IF;
  DELETE FROM public.pitches WHERE id = p_pitch_id;
  PERFORM public.log_admin_action('PITCH_DELETE', 'pitch', p_pitch_id, v_name, NULL, NULL);
  RETURN TRUE;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_delete_referee__core(p_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_name TEXT;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT name INTO v_name FROM public.referees WHERE id = p_id;
  IF v_name IS NULL THEN RAISE EXCEPTION 'Hakem bulunamadı'; END IF;
  DELETE FROM public.referees WHERE id = p_id;
  PERFORM public.log_admin_action('REF_DELETE', 'referee', p_id, v_name, NULL, NULL);
  RETURN TRUE;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_force_capture_intent__core(p_intent_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_res jsonb;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  PERFORM public.require_admin_role(ARRAY['FINANCE']);
  PERFORM public.require_admin_write();
  v_res := public.capture_preauth(p_intent_id, 'ADMIN_FORCE', jsonb_build_object('admin', true, 'notes', p_notes));
  PERFORM public.log_admin_action('FORCE_CAPTURE', 'payment_intent', p_intent_id, NULL, NULL,
    v_res || jsonb_build_object('notes', p_notes));
  RETURN v_res;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_force_void_intent__core(p_intent_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_res jsonb;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  PERFORM public.require_admin_role(ARRAY['FINANCE']);
  PERFORM public.require_admin_write();
  v_res := public.void_preauth(p_intent_id, COALESCE(p_reason, 'ADMIN_FORCE_VOID'));
  PERFORM public.log_admin_action('FORCE_VOID', 'payment_intent', p_intent_id, NULL, NULL,
    v_res || jsonb_build_object('reason', p_reason));
  RETURN v_res;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_kick_from_slot__core(p_match_id uuid, p_slot_id text, p_is_away boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_slots JSONB; v_updated JSONB;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_is_away THEN
    SELECT "awaySlots" INTO v_slots FROM public.matches WHERE id = p_match_id FOR UPDATE;
  ELSE
    SELECT slots INTO v_slots FROM public.matches WHERE id = p_match_id FOR UPDATE;
  END IF;

  SELECT COALESCE(jsonb_agg(
    CASE WHEN elem->>'id' = p_slot_id
      THEN (elem - 'userId' - 'player' - 'purchasedBy' - 'occupant' - 'assignmentStatus')
           || jsonb_build_object('status','OPEN')
      ELSE elem END
  ), '[]'::jsonb)
  INTO v_updated
  FROM jsonb_array_elements(COALESCE(v_slots,'[]'::jsonb)) AS elem;

  IF p_is_away THEN
    UPDATE public.matches SET "awaySlots" = v_updated WHERE id = p_match_id;
  ELSE
    UPDATE public.matches SET slots = v_updated WHERE id = p_match_id;
  END IF;

  PERFORM public.log_admin_action('MATCH_KICK_SLOT', 'match', p_match_id, p_slot_id, NULL,
    jsonb_build_object('is_away', p_is_away));
  PERFORM public.admin_recompute_match_status(p_match_id);
  RETURN v_updated;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_moderate_pitch__core(p_pitch_id uuid, p_approved boolean, p_notes text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_pitch_name TEXT; v_owner_id UUID;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT name, owner_id INTO v_pitch_name, v_owner_id FROM public.pitches WHERE id = p_pitch_id;
  IF v_pitch_name IS NULL THEN RAISE EXCEPTION 'Tesis bulunamadı.'; END IF;
  UPDATE public.pitches SET
    verification_status = CASE WHEN p_approved THEN 'approved' ELSE 'rejected' END,
    verification_notes  = CASE WHEN p_approved THEN NULL ELSE p_notes END,
    updated_at = NOW()
  WHERE id = p_pitch_id;
  PERFORM public.log_admin_action(
    CASE WHEN p_approved THEN 'PITCH_APPROVE' ELSE 'PITCH_REJECT' END,
    'pitch', p_pitch_id, v_pitch_name, jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', CASE WHEN p_approved THEN 'approved' ELSE 'rejected' END, 'notes', p_notes));
  RETURN TRUE;
END; $function$
;

CREATE OR REPLACE FUNCTION public.admin_notify_match_roster__core(p_match_id uuid, p_title text, p_body text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
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
$function$
;

CREATE OR REPLACE FUNCTION public.admin_override_match_score__core(p_match_id uuid, p_home integer, p_away integer, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
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
    PERFORM public._finalize_team_match_score(p_match_id, p_home, p_away);
  ELSE
    UPDATE public.matches SET "homeScore" = p_home, "awayScore" = p_away WHERE id = p_match_id;
  END IF;

  v_notified := public.admin_notify_match_roster(
    p_match_id, 'Maç sonucu güncellendi',
    format('Maçın skoru %s-%s olarak güncellendi.', p_home, p_away));

  PERFORM public.log_admin_action('MATCH_SCORE_OVERRIDE', 'match', p_match_id, NULL,
    jsonb_build_object('home', v_old_h, 'away', v_old_a),
    jsonb_build_object('home', p_home, 'away', p_away, 'notes', p_notes, 'notified', v_notified));

  RETURN jsonb_build_object('match_id', p_match_id, 'home', p_home, 'away', p_away,
    'finalized', (v_prev IS NULL), 'notified', v_notified);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_process_account_deletion__core(p_user_id uuid, p_anonymize boolean DEFAULT true)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_email text; v_is_admin boolean;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT email, (COALESCE(is_admin,false) OR role IN ('ADMIN','SUPER_ADMIN')) INTO v_email, v_is_admin
  FROM public.profiles WHERE id = p_user_id;
  IF v_email IS NULL THEN RAISE EXCEPTION 'Kullanıcı bulunamadı'; END IF;
  IF v_is_admin THEN RAISE EXCEPTION 'Admin hesabı silinemez. Önce yönetici yetkilerini kaldırın.'; END IF;
  IF EXISTS (SELECT 1 FROM public.pitch_bookings WHERE user_id = p_user_id AND status IN ('PENDING','CONFIRMED')
      AND (booking_date > CURRENT_DATE OR (booking_date = CURRENT_DATE AND end_time > CURRENT_TIME))) THEN
    RAISE EXCEPTION 'Kullanıcının aktif saha rezervasyonu var — silme reddedildi. Önce rezervasyon çözülmeli.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.payment_intents pi JOIN public.matches m ON m.id = pi.match_id
      WHERE pi.user_id = p_user_id AND pi.status IN ('PENDING','BLOCKED','CAPTURED')
      AND m.status IN ('GATHERING','CONFIRMED','PLAYING','LIVE')) THEN
    RAISE EXCEPTION 'Kullanıcının yaklaşan maçta blokaj/ödemesi var — silme reddedildi.';
  END IF;
  IF p_anonymize THEN
    UPDATE public.profiles SET full_name='Silinmiş Kullanıcı', name='Silinmiş Kullanıcı',
      email='deleted_'||substr(p_user_id::text,1,8)||'@oyna.deleted', phone=NULL, avatar_url=NULL,
      is_banned=true, account_deletion_requested_at=NULL, updated_at=NOW() WHERE id=p_user_id;
    BEGIN
      UPDATE auth.users SET email='deleted_'||substr(p_user_id::text,1,8)||'@oyna.deleted',
        phone=NULL, raw_user_meta_data='{}'::jsonb, banned_until='2999-01-01'::timestamptz, updated_at=NOW()
      WHERE id=p_user_id;
    EXCEPTION WHEN others THEN RAISE WARNING 'admin_process_account_deletion: auth.users anonimleştirilemedi (%): %', p_user_id, SQLERRM;
    END;
  ELSE
    DELETE FROM auth.users WHERE id = p_user_id;
    DELETE FROM public.profiles WHERE id = p_user_id;
  END IF;
  PERFORM public.log_admin_action('ACCOUNT_DELETE','user',p_user_id,v_email,NULL,jsonb_build_object('anonymized',p_anonymize));
  RETURN true;
END; $function$
;

CREATE OR REPLACE FUNCTION public.admin_process_payout__core(p_payout_id uuid, p_status text, p_ref text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_payout public.payout_requests;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  PERFORM public.require_admin_role(ARRAY['FINANCE']);
  PERFORM public.require_admin_write();
  IF p_status NOT IN ('PROCESSING','COMPLETED','FAILED','CANCELLED') THEN
    RAISE EXCEPTION 'INVALID_STATUS';
  END IF;
  IF p_status = 'COMPLETED' AND COALESCE(btrim(p_ref), '') = '' THEN
    RAISE EXCEPTION 'PAYOUT_REF_REQUIRED: COMPLETED işaretlemek için banka/iyzico transfer referansı zorunludur (iz ve mutabakat için).';
  END IF;
  SELECT * INTO v_payout FROM public.payout_requests WHERE id = p_payout_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  UPDATE public.payout_requests SET
    status = p_status,
    iyzico_payout_ref = COALESCE(p_ref, iyzico_payout_ref),
    admin_notes = COALESCE(p_notes, admin_notes),
    processed_at = CASE WHEN p_status IN ('COMPLETED','FAILED','CANCELLED') THEN now() ELSE processed_at END,
    processed_by = auth.uid()
  WHERE id = p_payout_id;
  IF p_status = 'COMPLETED' THEN
    UPDATE public.wallet_transactions SET status = 'COMPLETED'
    WHERE reference_type = 'PAYOUT' AND reference_id = p_payout_id AND status = 'PENDING';
  ELSIF p_status IN ('FAILED','CANCELLED') THEN
    UPDATE public.wallet_transactions SET status = 'CANCELLED'
    WHERE reference_type = 'PAYOUT' AND reference_id = p_payout_id AND status = 'PENDING';
  END IF;
  PERFORM public.log_admin_action('PAYOUT_PROCESS', 'payout', p_payout_id, v_payout.user_id::text,
    jsonb_build_object('old_status', v_payout.status, 'amount', v_payout.amount),
    jsonb_build_object('status', p_status, 'ref', p_ref, 'notes', p_notes));
  RETURN jsonb_build_object('payout_id', p_payout_id, 'status', p_status);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_process_withdrawal__core(p_request_id uuid, p_approved boolean, p_notes text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_owner_id   UUID;
  v_amount     NUMERIC;
  v_pitch_name TEXT;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;
  PERFORM public.require_admin_role(ARRAY['FINANCE']);
  SELECT w.owner_id, w.amount, p.name
  INTO v_owner_id, v_amount, v_pitch_name
  FROM public.owner_withdrawal_requests w
  LEFT JOIN public.pitches p ON p.id = w.pitch_id
  WHERE w.id = p_request_id;
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'Talep bulunamadı.';
  END IF;
  UPDATE public.owner_withdrawal_requests SET
    status       = CASE WHEN p_approved THEN 'APPROVED' ELSE 'REJECTED' END,
    admin_notes  = p_notes,
    processed_at = NOW(),
    processed_by = auth.uid()
  WHERE id = p_request_id;
  INSERT INTO public.notifications (user_id, title, body, type_key)
  VALUES (
    v_owner_id,
    CASE WHEN p_approved THEN 'Para Çekme Talebiniz Onaylandı' ELSE 'Para Çekme Talebiniz Reddedildi' END,
    CASE WHEN p_approved
      THEN COALESCE(v_amount::text, '0') || '₺ tutarındaki talebiniz onaylandı.'
      ELSE COALESCE(p_notes, 'Talep reddedildi.')
    END,
    CASE WHEN p_approved THEN 'WITHDRAWAL_APPROVED' ELSE 'WITHDRAWAL_REJECTED' END
  );
  PERFORM public.log_admin_action(
    CASE WHEN p_approved THEN 'WITHDRAWAL_APPROVE' ELSE 'WITHDRAWAL_REJECT' END,
    'withdrawal', p_request_id, COALESCE(v_pitch_name, 'withdrawal'),
    jsonb_build_object('status', 'PENDING'),
    jsonb_build_object('status', CASE WHEN p_approved THEN 'APPROVED' ELSE 'REJECTED' END, 'notes', p_notes, 'amount', v_amount)
  );
  RETURN TRUE;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_refund_intent__core(p_intent_id uuid, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_intent public.payment_intents;
  v_hours  numeric;
  v_start  timestamptz;
  v_policy text := 'MATCH';
  v_res    jsonb;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  PERFORM public.require_admin_role(ARRAY['FINANCE']);
  PERFORM public.require_admin_write();
  SELECT * INTO v_intent FROM public.payment_intents WHERE id = p_intent_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_intent.match_id IS NOT NULL THEN
    SELECT starts_at INTO v_start FROM public.matches WHERE id = v_intent.match_id;
    v_policy := 'MATCH';
  ELSIF v_intent.booking_id IS NOT NULL THEN
    SELECT (booking_date + start_time)::timestamptz INTO v_start FROM public.pitch_bookings WHERE id = v_intent.booking_id;
    v_policy := 'BOOKING';
  END IF;
  v_hours := CASE WHEN v_start IS NULL THEN 999
                  ELSE GREATEST(0, EXTRACT(EPOCH FROM (v_start - now())) / 3600.0) END;
  v_res := public.process_tiered_refund(p_intent_id, v_hours, v_policy);
  PERFORM public.log_admin_action('FORCE_REFUND', 'payment_intent', p_intent_id, NULL,
    jsonb_build_object('status', v_intent.status, 'amount', v_intent.amount),
    jsonb_build_object('result', v_res, 'hours_to_match', round(v_hours,2), 'policy', v_policy, 'notes', p_notes));
  RETURN v_res;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_release_service_payout__core(p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_req public.service_requests;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT * INTO v_req FROM public.service_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  PERFORM public._release_service_payout(v_req.match_id, v_req.provider_id);
  PERFORM public.log_admin_action('SERVICE_PAYOUT_RELEASE', 'service_request', p_request_id, v_req.provider_id::text,
    NULL, jsonb_build_object('match_id', v_req.match_id, 'provider_id', v_req.provider_id));
  RETURN jsonb_build_object('request_id', p_request_id, 'status', 'RELEASED');
END; $function$
;

CREATE OR REPLACE FUNCTION public.admin_resolve_dispute__core(p_dispute_id uuid, p_status text, p_notes text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_match_id uuid;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  PERFORM public.require_admin_role(ARRAY['MODERATOR','FINANCE']);
  IF p_status NOT IN ('RESOLVED', 'DISMISSED', 'UNDER_REVIEW') THEN RAISE EXCEPTION 'Geçersiz durum'; END IF;
  SELECT match_id INTO v_match_id FROM match_disputes WHERE id = p_dispute_id;
  UPDATE match_disputes SET status = p_status, resolution_notes = p_notes, resolved_by = auth.uid(), resolved_at = CASE WHEN p_status IN ('RESOLVED','DISMISSED') THEN NOW() ELSE NULL END WHERE id = p_dispute_id;
  PERFORM log_admin_action('DISPUTE_' || p_status, 'match', v_match_id, p_dispute_id::text, NULL, jsonb_build_object('status', p_status, 'notes', p_notes));
  RETURN true;
END; $function$
;

CREATE OR REPLACE FUNCTION public.admin_reverse_payout__core(p_payout_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_payout public.payout_requests;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  PERFORM public.require_admin_role(ARRAY['FINANCE']);
  PERFORM public.require_admin_write();
  IF COALESCE(btrim(p_reason), '') = '' THEN RAISE EXCEPTION 'Geri alma nedeni zorunludur.'; END IF;
  SELECT * INTO v_payout FROM public.payout_requests WHERE id = p_payout_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_payout.status <> 'COMPLETED' THEN
    RAISE EXCEPTION 'Yalnız COMPLETED ödeme geri alınabilir (mevcut: %).', v_payout.status;
  END IF;
  UPDATE public.payout_requests SET
    status = 'PENDING', processed_at = NULL, processed_by = auth.uid(),
    admin_notes = COALESCE(admin_notes,'') || ' | GERİ ALINDI: ' || p_reason
  WHERE id = p_payout_id;
  UPDATE public.wallet_transactions SET status = 'PENDING'
  WHERE reference_type = 'PAYOUT' AND reference_id = p_payout_id AND status = 'COMPLETED';
  PERFORM public.log_admin_action('PAYOUT_REVERSE', 'payout', p_payout_id, v_payout.user_id::text,
    jsonb_build_object('old_status', 'COMPLETED', 'amount', v_payout.amount),
    jsonb_build_object('reason', p_reason));
  RETURN jsonb_build_object('payout_id', p_payout_id, 'status', 'PENDING');
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_review_provider_application__core(p_app_id uuid, p_approve boolean, p_notes text DEFAULT NULL::text)
 RETURNS provider_applications
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_app public.provider_applications; v_old_status text; v_new_status text;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'FORBIDDEN: Yalniz admin.'; END IF;
  SELECT * INTO v_app FROM public.provider_applications WHERE id = p_app_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  SELECT verification_status INTO v_old_status FROM public.profiles WHERE id = v_app.user_id;
  v_new_status := CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END;
  UPDATE public.provider_applications SET status = CASE WHEN p_approve THEN 'APPROVED' ELSE 'REJECTED' END,
    admin_notes = p_notes, reviewed_by = v_uid, reviewed_at = now() WHERE id = p_app_id RETURNING * INTO v_app;
  PERFORM set_config('app.bypass_role_protection', 'true', true);
  IF p_approve THEN
    UPDATE public.profiles SET role = v_app.role,
      roles = CASE WHEN COALESCE(roles,'[]'::jsonb) ? v_app.role THEN roles ELSE COALESCE(roles,'[]'::jsonb) || jsonb_build_array(v_app.role) END,
      verification_status = 'approved', verification_reviewed_by = v_uid, verification_reviewed_at = now(), is_available = true, updated_at = now()
    WHERE id = v_app.user_id;
  ELSE
    UPDATE public.profiles SET verification_status = 'rejected', verification_notes = p_notes,
      verification_reviewed_by = v_uid, verification_reviewed_at = now(), updated_at = now() WHERE id = v_app.user_id;
  END IF;
  IF v_old_status IS DISTINCT FROM v_new_status THEN
    INSERT INTO public.notifications (user_id, title, body, type_key)
    VALUES (v_app.user_id,
      CASE WHEN p_approve THEN 'Başvurun Onaylandı!' ELSE 'Başvurun Reddedildi' END,
      CASE WHEN p_approve THEN 'Hizmet sağlayıcı başvurun onaylandı. Profilin pazaryerinde görünür.'
        ELSE COALESCE('Başvurun reddedildi. Sebep: ' || p_notes, 'Başvurun reddedildi.') END,
      CASE WHEN p_approve THEN 'PROVIDER_APP_APPROVED' ELSE 'PROVIDER_APP_REJECTED' END);
  END IF;
  PERFORM public.log_admin_action(CASE WHEN p_approve THEN 'PROVIDER_APP_APPROVE' ELSE 'PROVIDER_APP_REJECT' END,
    'user', v_app.user_id, NULL, NULL, jsonb_build_object('app_id', p_app_id, 'role', v_app.role, 'notes', p_notes));
  RETURN v_app;
END; $function$
;

CREATE OR REPLACE FUNCTION public.admin_set_config__core(p_key text, p_value jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_old jsonb; v_min numeric; v_max numeric; v_type text; v_num numeric;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT value, min_value, max_value, value_type
    INTO v_old, v_min, v_max, v_type
  FROM public.app_config WHERE key = p_key;
  IF NOT FOUND THEN RAISE EXCEPTION 'CONFIG_NOT_FOUND: %', p_key; END IF;
  IF v_type = 'number' THEN
    v_num := (p_value #>> '{}')::numeric;
    IF v_min IS NOT NULL AND v_num < v_min THEN RAISE EXCEPTION 'VALUE_TOO_LOW: % (min %)', v_num, v_min; END IF;
    IF v_max IS NOT NULL AND v_num > v_max THEN RAISE EXCEPTION 'VALUE_TOO_HIGH: % (max %)', v_num, v_max; END IF;
  END IF;
  UPDATE public.app_config
     SET value = p_value, updated_by = auth.uid(), updated_at = now()
   WHERE key = p_key;
  PERFORM public.log_admin_action('CONFIG_UPDATE', 'system', NULL, p_key, v_old, p_value);
  RETURN true;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_set_feature_flag__core(p_key text, p_enabled boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_old boolean;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT enabled INTO v_old FROM public.feature_flags WHERE key = p_key;
  IF NOT FOUND THEN RAISE EXCEPTION 'FLAG_NOT_FOUND: %', p_key; END IF;
  UPDATE public.feature_flags
     SET enabled = p_enabled, updated_by = auth.uid(), updated_at = now()
   WHERE key = p_key;
  PERFORM public.log_admin_action('FEATURE_FLAG_UPDATE', 'system', NULL, p_key, to_jsonb(v_old), to_jsonb(p_enabled));
  RETURN true;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_cancel_account_deletion(p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN PERFORM public.require_admin_role('{MODERATOR}'::text[]); RETURN public.admin_cancel_account_deletion__core(p_user_id); END; $function$
;

CREATE OR REPLACE FUNCTION public.admin_set_match_status__core(p_match_id uuid, p_status text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_old TEXT;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT status INTO v_old FROM public.matches WHERE id = p_match_id;
  IF v_old IS NULL THEN RAISE EXCEPTION 'Maç bulunamadı'; END IF;
  UPDATE public.matches SET status = p_status WHERE id = p_match_id;
  PERFORM public.log_admin_action('MATCH_STATUS', 'match', p_match_id, p_status, jsonb_build_object('old', v_old), jsonb_build_object('new', p_status));
  RETURN TRUE;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_set_player_card__core(p_user_id uuid, p_active boolean, p_tier text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if not public.is_admin() then raise exception 'UNAUTHORIZED: yalnız admin'; end if;
  if p_tier is not null and p_tier not in ('bronze','silver','gold') then raise exception 'INVALID_TIER'; end if;
  update public.profiles
    set card_active = p_active,
        card_tier = case when p_active then coalesce(p_tier, card_tier, 'bronze') else null end
    where id = p_user_id;
  perform public.log_admin_action('PLAYER_CARD_SET', 'user', p_user_id, null, null,
    jsonb_build_object('active', p_active, 'tier', p_tier));
end; $function$
;

CREATE OR REPLACE FUNCTION public.admin_set_player_card_data__core(p_user_id uuid, p_card jsonb, p_card_active boolean DEFAULT NULL::boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_card IS NULL OR jsonb_typeof(p_card) <> 'object' THEN RAISE EXCEPTION 'INVALID_CARD'; END IF;
  UPDATE public.profiles SET
    player_card = COALESCE(player_card, '{}'::jsonb) || p_card,
    card_tier   = COALESCE(NULLIF(p_card->>'tier',''), card_tier),
    rating      = COALESCE(NULLIF(p_card->>'overall','')::numeric / 20.0, rating),
    card_active = COALESCE(p_card_active, card_active)
  WHERE id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Kullanıcı bulunamadı'; END IF;
  PERFORM public.log_admin_action(
    'PLAYER_CARD_DATA_SET', 'user', p_user_id, NULL, NULL,
    p_card || jsonb_build_object('card_active', p_card_active)
  );
END; $function$
;

CREATE OR REPLACE FUNCTION public.admin_swap_slots__core(p_match_id uuid, p_slot_a text, p_slot_b text, p_is_away boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_slots JSONB; v_a JSONB; v_b JSONB; v_pos_a JSONB; v_pos_b JSONB; v_occ_a JSONB; v_occ_b JSONB;
  v_new_a JSONB; v_new_b JSONB; v_updated JSONB;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_slot_a = p_slot_b THEN RAISE EXCEPTION 'Aynı slot'; END IF;

  IF p_is_away THEN
    SELECT "awaySlots" INTO v_slots FROM public.matches WHERE id = p_match_id FOR UPDATE;
  ELSE
    SELECT slots INTO v_slots FROM public.matches WHERE id = p_match_id FOR UPDATE;
  END IF;

  SELECT elem INTO v_a FROM jsonb_array_elements(COALESCE(v_slots,'[]'::jsonb)) elem WHERE elem->>'id' = p_slot_a;
  SELECT elem INTO v_b FROM jsonb_array_elements(COALESCE(v_slots,'[]'::jsonb)) elem WHERE elem->>'id' = p_slot_b;
  IF v_a IS NULL OR v_b IS NULL THEN RAISE EXCEPTION 'Slot bulunamadı'; END IF;

  v_pos_a := v_a - 'status' - 'userId' - 'player' - 'assignmentStatus' - 'purchasedBy' - 'occupant';
  v_pos_b := v_b - 'status' - 'userId' - 'player' - 'assignmentStatus' - 'purchasedBy' - 'occupant';
  v_occ_a := v_a - 'id' - 'role' - 'x' - 'y';
  v_occ_b := v_b - 'id' - 'role' - 'x' - 'y';

  v_new_a := v_pos_a || v_occ_b;
  v_new_a := v_new_a || jsonb_build_object('status', COALESCE(v_new_a->>'status','OPEN'));
  v_new_b := v_pos_b || v_occ_a;
  v_new_b := v_new_b || jsonb_build_object('status', COALESCE(v_new_b->>'status','OPEN'));

  SELECT COALESCE(jsonb_agg(
    CASE WHEN elem->>'id' = p_slot_a THEN v_new_a
         WHEN elem->>'id' = p_slot_b THEN v_new_b
         ELSE elem END
  ), '[]'::jsonb)
  INTO v_updated
  FROM jsonb_array_elements(COALESCE(v_slots,'[]'::jsonb)) AS elem;

  IF p_is_away THEN
    UPDATE public.matches SET "awaySlots" = v_updated WHERE id = p_match_id;
  ELSE
    UPDATE public.matches SET slots = v_updated WHERE id = p_match_id;
  END IF;

  PERFORM public.log_admin_action('MATCH_SWAP_SLOTS', 'match', p_match_id, NULL, NULL,
    jsonb_build_object('slot_a', p_slot_a, 'slot_b', p_slot_b, 'is_away', p_is_away));
  PERFORM public.admin_recompute_match_status(p_match_id);
  RETURN v_updated;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_update_goalkeeper__core(p_id uuid, p_payload jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_old JSONB;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT to_jsonb(g.*) INTO v_old FROM public.goalkeepers g WHERE id = p_id;
  IF v_old IS NULL THEN RAISE EXCEPTION 'Kaleci bulunamadı'; END IF;

  UPDATE public.goalkeepers SET
    name = COALESCE(p_payload->>'name', name),
    height = COALESCE(p_payload->>'height', height),
    age = COALESCE((p_payload->>'age')::int, age),
    rating = COALESCE((p_payload->>'rating')::numeric, rating),
    fee = COALESCE((p_payload->>'fee')::int, fee),
    "matchCount" = COALESCE((p_payload->>'match_count')::int, "matchCount"),
    avatar = COALESCE(p_payload->>'avatar', avatar),
    "recentAwards" = COALESCE(p_payload->>'recent_awards', "recentAwards"),
    style = COALESCE(p_payload->>'style', style),
    bio = COALESCE(p_payload->>'bio', bio),
    "preferredZones" = COALESCE(p_payload->'preferred_zones', "preferredZones"),
    "isElite" = COALESCE((p_payload->>'is_elite')::boolean, "isElite"),
    coordinates = COALESCE(p_payload->'coordinates', coordinates),
    stats = COALESCE(p_payload->'stats', stats),
    skills = COALESCE(p_payload->'skills', skills),
    equipment = COALESCE(p_payload->'equipment', equipment)
  WHERE id = p_id;

  PERFORM public.log_admin_action('GK_UPDATE', 'goalkeeper', p_id, COALESCE(p_payload->>'name', v_old->>'name'), v_old, p_payload);
  RETURN TRUE;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_update_match__core(p_match_id uuid, p_payload jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_old JSONB;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT to_jsonb(m.*) INTO v_old FROM public.matches m WHERE id = p_match_id;
  IF v_old IS NULL THEN RAISE EXCEPTION 'Maç bulunamadı'; END IF;
  UPDATE public.matches SET
    title = COALESCE(p_payload->>'title', title),
    location = COALESCE(p_payload->>'location', location),
    date = COALESCE((p_payload->>'date')::date, date),
    "time" = COALESCE(p_payload->>'time', "time"),
    price = COALESCE((p_payload->>'price')::numeric, price),
    difficulty = COALESCE(p_payload->>'difficulty', difficulty),
    status = COALESCE(p_payload->>'status', status),
    format = COALESCE(p_payload->>'format', format),
    image = COALESCE(p_payload->>'image', image),
    "minRating" = COALESCE((p_payload->>'minRating')::numeric, "minRating"),
    badges = COALESCE(p_payload->'badges', badges),
    "missingPositions" = COALESCE(p_payload->'missingPositions', "missingPositions"),
    slots = CASE WHEN p_payload ? 'slots' THEN p_payload->'slots' ELSE slots END,
    "awaySlots" = CASE WHEN p_payload ? 'awaySlots' OR p_payload ? 'away_slots'
      THEN COALESCE(p_payload->'awaySlots', p_payload->'away_slots') ELSE "awaySlots" END,
    "refereeId" = COALESCE(NULLIF(p_payload->>'refereeId', '')::uuid, "refereeId"),
    duration = CASE WHEN p_payload ? 'duration' THEN NULLIF(p_payload->>'duration','') ELSE duration END,
    gender = CASE WHEN p_payload ? 'gender' THEN NULLIF(p_payload->>'gender','') ELSE gender END,
    "ageGroup" = CASE WHEN p_payload ? 'ageGroup' THEN NULLIF(p_payload->>'ageGroup','') ELSE "ageGroup" END,
    visibility = CASE WHEN p_payload ? 'visibility' AND (p_payload->>'visibility') IN ('OPEN','PRIVATE')
                      THEN p_payload->>'visibility' ELSE visibility END,
    private_code = CASE
      WHEN NULLIF(p_payload->>'private_code','') IS NOT NULL THEN upper(p_payload->>'private_code')
      WHEN COALESCE(NULLIF(p_payload->>'visibility',''), visibility) = 'PRIVATE' AND private_code IS NULL
      THEN upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
      ELSE private_code END
  WHERE id = p_match_id;
  PERFORM public.log_admin_action('MATCH_UPDATE', 'match', p_match_id, p_payload->>'title', v_old, p_payload);
  RETURN TRUE;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_update_owner_account__core(p_owner_user_id uuid, p_payload jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_old JSONB;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT to_jsonb(o.*) INTO v_old FROM public.owner_accounts o WHERE owner_user_id = p_owner_user_id;
  IF v_old IS NULL THEN RAISE EXCEPTION 'SaaS hesabı bulunamadı'; END IF;
  UPDATE public.owner_accounts SET
    plan_tier = COALESCE(p_payload->>'plan_tier', plan_tier),
    status = COALESCE(p_payload->>'status', status),
    entitlements = COALESCE(p_payload->'entitlements', entitlements),
    billing_email = COALESCE(p_payload->>'billing_email', billing_email),
    trial_ends_at = COALESCE((p_payload->>'trial_ends_at')::timestamptz, trial_ends_at),
    updated_at = NOW()
  WHERE owner_user_id = p_owner_user_id;
  PERFORM public.log_admin_action('OWNER_ACCOUNT_UPDATE', 'owner_account', p_owner_user_id, p_owner_user_id::text, v_old, p_payload);
  RETURN TRUE;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_update_referee__core(p_id uuid, p_payload jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_old JSONB;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT to_jsonb(r.*) INTO v_old FROM public.referees r WHERE id = p_id;
  IF v_old IS NULL THEN RAISE EXCEPTION 'Hakem bulunamadı'; END IF;

  UPDATE public.referees SET
    name = COALESCE(p_payload->>'name', name),
    level = COALESCE(p_payload->>'level', level),
    "matchCount" = COALESCE((p_payload->>'match_count')::int, "matchCount"),
    fee = COALESCE((p_payload->>'fee')::int, fee),
    avatar = COALESCE(p_payload->>'avatar', avatar),
    rating = COALESCE((p_payload->>'rating')::numeric, rating),
    style = COALESCE(p_payload->>'style', style),
    bio = COALESCE(p_payload->>'bio', bio),
    "preferredZones" = COALESCE(p_payload->'preferred_zones', "preferredZones"),
    "isElite" = COALESCE((p_payload->>'is_elite')::boolean, "isElite"),
    coordinates = COALESCE(p_payload->'coordinates', coordinates),
    stats = COALESCE(p_payload->'stats', stats)
  WHERE id = p_id;

  PERFORM public.log_admin_action('REF_UPDATE', 'referee', p_id, COALESCE(p_payload->>'name', v_old->>'name'), v_old, p_payload);
  RETURN TRUE;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_update_settings__core(p_settings jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old JSONB;
  v_member_role TEXT;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT admin_role INTO v_member_role
  FROM public.admin_team_members
  WHERE user_id = auth.uid();

  IF v_member_role IS NOT NULL AND v_member_role NOT IN ('SUPER_ADMIN', 'ADMIN') THEN
    RAISE EXCEPTION 'SETTINGS_RESTRICTED: Ayarlar yalnızca ADMIN veya SUPER_ADMIN tarafından değiştirilebilir';
  END IF;

  SELECT to_jsonb(s.*) INTO v_old FROM public.settings s WHERE id = 'main';

  UPDATE public.settings SET
    "appName"                = COALESCE((p_settings->>'app_name')::text,                    "appName"),
    "maintenanceMode"        = COALESCE((p_settings->>'maintenance_mode')::boolean,         "maintenanceMode"),
    "registrationOpen"       = COALESCE((p_settings->>'registration_open')::boolean,        "registrationOpen"),
    "proPrice"               = COALESCE((p_settings->>'pro_price')::numeric,                "proPrice"),
    "commissionRate"         = COALESCE((p_settings->>'commission_rate')::numeric,          "commissionRate"),
    "minRatingToPlay"        = COALESCE((p_settings->>'min_rating_to_play')::numeric,       "minRatingToPlay"),
    "maxMatchsPerDay"        = COALESCE((p_settings->>'max_matches_per_day')::integer,      "maxMatchsPerDay"),
    "featuredPitchId"        = COALESCE((p_settings->>'featured_pitch_id')::text,           "featuredPitchId"),
    "showAnnouncementBanner" = COALESCE((p_settings->>'show_announcement_banner')::boolean, "showAnnouncementBanner"),
    "announcementBanner"     = COALESCE((p_settings->>'announcement_banner')::text,         "announcementBanner"),
    "payoutMode"             = COALESCE((p_settings->>'payout_mode')::text,                 "payoutMode")
  WHERE id = 'main';

  PERFORM public.log_admin_action('SETTINGS_UPDATE', 'system', NULL, 'global_settings', v_old, p_settings);
  RETURN TRUE;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_update_texts__core(p_texts jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_key text; v_val text; v_count int := 0;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  FOR v_key, v_val IN SELECT * FROM jsonb_each_text(p_texts) LOOP
    INSERT INTO texts (key, value, updated_by, updated_at) VALUES (v_key, v_val, auth.uid(), NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = auth.uid(), updated_at = NOW();
    v_count := v_count + 1;
  END LOOP;
  PERFORM log_admin_action('CMS_UPDATE', 'system', NULL, 'texts', NULL, p_texts);
  RETURN v_count;
END; $function$
;

CREATE OR REPLACE FUNCTION public.admin_upsert_user_profile__core(p_user_id uuid, p_email text, p_full_name text, p_role text DEFAULT 'PLAYER'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  INSERT INTO public.profiles (id, email, full_name, role, roles, verification_status, created_at, updated_at)
  VALUES (p_user_id, lower(trim(p_email)), trim(p_full_name), p_role, jsonb_build_array(p_role), 'approved', NOW(), NOW())
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    roles = EXCLUDED.roles,
    updated_at = NOW();
  PERFORM public.log_admin_action('USER_CREATE', 'user', p_user_id, p_email, NULL,
    jsonb_build_object('role', p_role, 'full_name', p_full_name));
  RETURN p_user_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_verify_provider_identity__core(p_user_id uuid, p_approve boolean, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  UPDATE public.provider_identities SET status = CASE WHEN p_approve THEN 'VERIFIED' ELSE 'REJECTED' END,
    admin_notes = p_notes, verified_by = v_uid, verified_at = CASE WHEN p_approve THEN now() ELSE NULL END, updated_at = now()
  WHERE user_id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  INSERT INTO public.notifications (user_id, title, body, type_key)
  VALUES (p_user_id,
    CASE WHEN p_approve THEN 'Kimliğin Doğrulandı' ELSE 'Kimlik Doğrulama Reddedildi' END,
    CASE WHEN p_approve THEN 'Kimlik doğrulaman tamamlandı. Hizmet sağlayıcı sürecine devam edebilirsin.'
      ELSE COALESCE('Kimlik doğrulaman reddedildi. Sebep: ' || p_notes, 'Kimlik doğrulaman reddedildi. Lütfen belgeleri kontrol edip tekrar yükle.') END,
    CASE WHEN p_approve THEN 'IDENTITY_VERIFIED' ELSE 'IDENTITY_REJECTED' END);
  PERFORM public.log_admin_action(CASE WHEN p_approve THEN 'PROVIDER_IDENTITY_VERIFY' ELSE 'PROVIDER_IDENTITY_REJECT' END,
    'user', p_user_id, NULL, NULL, jsonb_build_object('approve', p_approve, 'notes', p_notes));
  RETURN jsonb_build_object('user_id', p_user_id, 'status', CASE WHEN p_approve THEN 'VERIFIED' ELSE 'REJECTED' END);
END; $function$
;

CREATE OR REPLACE FUNCTION public.admin_verify_user__core(p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_email TEXT;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT email INTO v_email FROM public.profiles WHERE id = p_user_id;
  IF v_email IS NULL THEN RAISE EXCEPTION 'Kullanıcı bulunamadı'; END IF;
  UPDATE public.profiles SET is_verified = true, updated_at = NOW() WHERE id = p_user_id;
  PERFORM public.log_admin_action('USER_VERIFY', 'user', p_user_id, v_email, NULL, jsonb_build_object('is_verified', true));
  RETURN TRUE;
END;
$function$
;

-- ─── Yetkiler (canlı proacl kayıtları birebir) ──────────────────────────────
-- __core fonksiyonları yalnız service_role; kamu sarmalayıcıları SECURITY
-- DEFINER olarak owner haklarıyla __core'u çağırır. admin_cancel_account_
-- deletion sarmalayıcısı authenticated (iç guard: require_admin_role).

REVOKE ALL ON FUNCTION public.admin_assign_match_goalkeeper__core(p_match_id uuid, p_goalkeeper_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_assign_match_goalkeeper__core(p_match_id uuid, p_goalkeeper_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.admin_assign_match_referee__core(p_match_id uuid, p_referee_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_assign_match_referee__core(p_match_id uuid, p_referee_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.admin_assign_to_slot__core(p_match_id uuid, p_slot_id text, p_user_id uuid, p_is_away boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_assign_to_slot__core(p_match_id uuid, p_slot_id text, p_user_id uuid, p_is_away boolean) TO service_role;

REVOKE ALL ON FUNCTION public.admin_ban_user__core(p_user_id uuid, p_is_banned boolean, p_expires_at timestamp with time zone, p_reason text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_ban_user__core(p_user_id uuid, p_is_banned boolean, p_expires_at timestamp with time zone, p_reason text) TO service_role;

REVOKE ALL ON FUNCTION public.admin_cancel_account_deletion(p_user_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_cancel_account_deletion(p_user_id uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_cancel_match__core(p_match_id uuid, p_reason text, p_refund boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cancel_match__core(p_match_id uuid, p_reason text, p_refund boolean) TO service_role;

REVOKE ALL ON FUNCTION public.admin_create_goalkeeper__core(p_data jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_goalkeeper__core(p_data jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.admin_create_referee__core(p_data jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_referee__core(p_data jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.admin_delete_goalkeeper__core(p_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_goalkeeper__core(p_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.admin_delete_match__core(p_match_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_match__core(p_match_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.admin_delete_pitch__core(p_pitch_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_pitch__core(p_pitch_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.admin_delete_referee__core(p_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_referee__core(p_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.admin_force_capture_intent__core(p_intent_id uuid, p_notes text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_force_capture_intent__core(p_intent_id uuid, p_notes text) TO service_role;

REVOKE ALL ON FUNCTION public.admin_force_void_intent__core(p_intent_id uuid, p_reason text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_force_void_intent__core(p_intent_id uuid, p_reason text) TO service_role;

REVOKE ALL ON FUNCTION public.admin_kick_from_slot__core(p_match_id uuid, p_slot_id text, p_is_away boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_kick_from_slot__core(p_match_id uuid, p_slot_id text, p_is_away boolean) TO service_role;

REVOKE ALL ON FUNCTION public.admin_moderate_pitch__core(p_pitch_id uuid, p_approved boolean, p_notes text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_moderate_pitch__core(p_pitch_id uuid, p_approved boolean, p_notes text) TO service_role;

REVOKE ALL ON FUNCTION public.admin_notify_match_roster__core(p_match_id uuid, p_title text, p_body text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_notify_match_roster__core(p_match_id uuid, p_title text, p_body text) TO service_role;

REVOKE ALL ON FUNCTION public.admin_override_match_score__core(p_match_id uuid, p_home integer, p_away integer, p_notes text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_override_match_score__core(p_match_id uuid, p_home integer, p_away integer, p_notes text) TO service_role;

REVOKE ALL ON FUNCTION public.admin_process_account_deletion__core(p_user_id uuid, p_anonymize boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_process_account_deletion__core(p_user_id uuid, p_anonymize boolean) TO service_role;

REVOKE ALL ON FUNCTION public.admin_process_payout__core(p_payout_id uuid, p_status text, p_ref text, p_notes text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_process_payout__core(p_payout_id uuid, p_status text, p_ref text, p_notes text) TO service_role;

REVOKE ALL ON FUNCTION public.admin_process_withdrawal__core(p_request_id uuid, p_approved boolean, p_notes text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_process_withdrawal__core(p_request_id uuid, p_approved boolean, p_notes text) TO service_role;

REVOKE ALL ON FUNCTION public.admin_refund_intent__core(p_intent_id uuid, p_notes text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_refund_intent__core(p_intent_id uuid, p_notes text) TO service_role;

REVOKE ALL ON FUNCTION public.admin_release_service_payout__core(p_request_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_release_service_payout__core(p_request_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.admin_resolve_dispute__core(p_dispute_id uuid, p_status text, p_notes text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_resolve_dispute__core(p_dispute_id uuid, p_status text, p_notes text) TO service_role;

REVOKE ALL ON FUNCTION public.admin_reverse_payout__core(p_payout_id uuid, p_reason text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reverse_payout__core(p_payout_id uuid, p_reason text) TO service_role;

REVOKE ALL ON FUNCTION public.admin_review_provider_application__core(p_app_id uuid, p_approve boolean, p_notes text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_provider_application__core(p_app_id uuid, p_approve boolean, p_notes text) TO service_role;

REVOKE ALL ON FUNCTION public.admin_set_config__core(p_key text, p_value jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_config__core(p_key text, p_value jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.admin_set_feature_flag__core(p_key text, p_enabled boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_feature_flag__core(p_key text, p_enabled boolean) TO service_role;

REVOKE ALL ON FUNCTION public.admin_set_match_status__core(p_match_id uuid, p_status text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_match_status__core(p_match_id uuid, p_status text) TO service_role;

REVOKE ALL ON FUNCTION public.admin_set_player_card__core(p_user_id uuid, p_active boolean, p_tier text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_player_card__core(p_user_id uuid, p_active boolean, p_tier text) TO service_role;

REVOKE ALL ON FUNCTION public.admin_set_player_card_data__core(p_user_id uuid, p_card jsonb, p_card_active boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_player_card_data__core(p_user_id uuid, p_card jsonb, p_card_active boolean) TO service_role;

REVOKE ALL ON FUNCTION public.admin_swap_slots__core(p_match_id uuid, p_slot_a text, p_slot_b text, p_is_away boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_swap_slots__core(p_match_id uuid, p_slot_a text, p_slot_b text, p_is_away boolean) TO service_role;

REVOKE ALL ON FUNCTION public.admin_update_goalkeeper__core(p_id uuid, p_payload jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_goalkeeper__core(p_id uuid, p_payload jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.admin_update_match__core(p_match_id uuid, p_payload jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_match__core(p_match_id uuid, p_payload jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.admin_update_owner_account__core(p_owner_user_id uuid, p_payload jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_owner_account__core(p_owner_user_id uuid, p_payload jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.admin_update_referee__core(p_id uuid, p_payload jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_referee__core(p_id uuid, p_payload jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.admin_update_settings__core(p_settings jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_settings__core(p_settings jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.admin_update_texts__core(p_texts jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_texts__core(p_texts jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.admin_upsert_user_profile__core(p_user_id uuid, p_email text, p_full_name text, p_role text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert_user_profile__core(p_user_id uuid, p_email text, p_full_name text, p_role text) TO service_role;

REVOKE ALL ON FUNCTION public.admin_verify_provider_identity__core(p_user_id uuid, p_approve boolean, p_notes text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_verify_provider_identity__core(p_user_id uuid, p_approve boolean, p_notes text) TO service_role;

REVOKE ALL ON FUNCTION public.admin_verify_user__core(p_user_id uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_verify_user__core(p_user_id uuid) TO service_role;
