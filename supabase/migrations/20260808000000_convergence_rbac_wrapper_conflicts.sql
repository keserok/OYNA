-- ============================================================================
-- YAKINSAMA (Faz 2a-2 · ÇAKIŞMA ÇÖZÜMÜ) — repo↔canlı 5 fonksiyon farkı
-- ----------------------------------------------------------------------------
-- DRIFT ONARIMI NOTU (2026-07-22): Preview(repo)-vs-prod md5 taraması, repoda
-- ZATEN VAR olan 5 fonksiyonun canlıdan farklı (eski) olduğunu buldu. Her
-- birinde CANLI daha yeni ve bakımlı sürüm; repo eski kalıntı. Karar yönü:
-- canlı → repo (kullanıcı onayı). Bu migration canlıda NO-OP'tur (CREATE OR
-- REPLACE ile canlının mevcut tanımının aynısı yazılır); kazanç, sıfırdan
-- kurulumların bu canlı iyileştirmeleri KORUMASIdır. Tanımlar canlıdan
-- pg_get_functiondef ile BİREBİR; ACL'ler canlı proacl'den.
--
-- Farkların özeti:
--  1) admin_broadcast_notification: canlı 5-param (bildirim şablonu desteği);
--     repo eski 4-param. Eski 4-param sarmalayıcı + 4-param __core düşürülür
--     (canlıda yok; 4-arg çağrılar 5-param'ın DEFAULT'una düşer).
--  2) admin_create_match__core: canlı formata göre slot auto-üretimi + private_code.
--  3) admin_process_payout: canlı, iptal edilen WALLET_CASHOUT'u cüzdana iade eder.
--  4) admin_update_settings: canlı zamanlı bakım + payout_mode alanlarını yazar.
--  5) admin_update_user_profile__core: canlı PII-maskesine duyarlı + kart alanları.
-- ============================================================================

-- ─── 1) admin_broadcast_notification: 5-param (şablon) benimse, 4-param düşür ──

CREATE OR REPLACE FUNCTION public.admin_broadcast_notification(p_title text, p_body text, p_segment text DEFAULT 'ALL'::text, p_type text DEFAULT 'ADMIN_BROADCAST'::text, p_template_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.require_admin_role('{}'::text[]);
  RETURN public.admin_broadcast_notification__core(p_title, p_body, p_segment, p_type, p_template_id);
END; $function$
;

-- Eski 4-param sürümler (canlıda YOK; repo kalıntısı) — düşür.
DROP FUNCTION IF EXISTS public.admin_broadcast_notification(text, text, text, text);
DROP FUNCTION IF EXISTS public.admin_broadcast_notification__core(text, text, text, text);

REVOKE ALL ON FUNCTION public.admin_broadcast_notification(p_title text, p_body text, p_segment text, p_type text, p_template_id uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_broadcast_notification(p_title text, p_body text, p_segment text, p_type text, p_template_id uuid) TO authenticated, service_role;

-- ─── 2) admin_create_match__core ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_create_match__core(p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id UUID := gen_random_uuid();
  v_slots JSONB := COALESCE(p_payload->'slots', '[]'::jsonb);
  v_away JSONB := COALESCE(p_payload->'awaySlots', p_payload->'away_slots', '[]'::jsonb);
  v_missing JSONB := COALESCE(p_payload->'missingPositions', '[]'::jsonb);
  v_format TEXT := COALESCE(p_payload->>'format', '7v7');
  v_visibility TEXT := CASE WHEN COALESCE(p_payload->>'visibility', 'OPEN') = 'PRIVATE'
                            THEN 'PRIVATE' ELSE 'OPEN' END;
  v_code TEXT := NULLIF(p_payload->>'private_code', '');
  v_per_side INT;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  IF jsonb_array_length(v_slots) = 0 THEN
    v_per_side := CASE v_format
      WHEN '3v3'   THEN 3
      WHEN '4v4'   THEN 4
      WHEN '5v5'   THEN 5
      WHEN '6v6'   THEN 6
      WHEN '7v7'   THEN 7
      WHEN '8v8'   THEN 8
      WHEN '9v9'   THEN 9
      WHEN '10v10' THEN 10
      WHEN '11v11' THEN 11
      ELSE 7
    END;
    SELECT jsonb_agg(jsonb_build_object('id', 'h' || g, 'role', 'P', 'status', 'OPEN', 'userId', NULL) ORDER BY g)
      INTO v_slots
      FROM generate_series(1, v_per_side) AS g;
    IF jsonb_array_length(v_away) = 0 THEN
      SELECT jsonb_agg(jsonb_build_object('id', 'a' || g, 'role', 'P', 'status', 'OPEN', 'userId', NULL) ORDER BY g)
        INTO v_away
        FROM generate_series(1, v_per_side) AS g;
    END IF;
    IF jsonb_array_length(v_missing) = 0 THEN
      v_missing := jsonb_build_array(jsonb_build_object('role', 'P', 'count', v_per_side));
    END IF;
  END IF;

  IF v_visibility = 'PRIVATE' AND v_code IS NULL THEN
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  ELSIF v_visibility <> 'PRIVATE' THEN
    v_code := NULL;
  ELSE
    v_code := upper(v_code);
  END IF;

  INSERT INTO public.matches (
    id, title, location, date, "time", price, difficulty, status, format,
    image, badges, "minRating", "missingPositions", slots, "awaySlots",
    "refereeId", "creatorId", captain_id, pitch_id, "isDemo",
    visibility, private_code, duration, gender, "ageGroup"
  ) VALUES (
    v_id,
    COALESCE(p_payload->>'title', 'Yeni Maç'),
    COALESCE(p_payload->>'location', ''),
    COALESCE((p_payload->>'date')::date, CURRENT_DATE),
    COALESCE(p_payload->>'time', '20:00'),
    COALESCE((p_payload->>'price')::numeric, 0),
    COALESCE(p_payload->>'difficulty', 'Rahat'),
    COALESCE(p_payload->>'status', 'ACTIVE'),
    v_format,
    p_payload->>'image',
    COALESCE(p_payload->'badges', '[]'::jsonb),
    COALESCE((p_payload->>'minRating')::numeric, 3.0),
    v_missing,
    v_slots,
    v_away,
    NULLIF(p_payload->>'refereeId', '')::uuid,
    NULLIF(p_payload->>'creatorId', '')::uuid,
    NULLIF(p_payload->>'creatorId', '')::uuid,
    NULLIF(p_payload->>'pitch_id', '')::uuid,
    COALESCE((p_payload->>'isDemo')::boolean, false),
    v_visibility,
    v_code,
    NULLIF(p_payload->>'duration', ''),
    NULLIF(p_payload->>'gender', ''),
    NULLIF(p_payload->>'ageGroup', '')
  );
  PERFORM public.log_admin_action('MATCH_CREATE', 'match', v_id, p_payload->>'title', NULL, p_payload);
  RETURN v_id;
END;
$function$
;

REVOKE ALL ON FUNCTION public.admin_create_match__core(p_payload jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_match__core(p_payload jsonb) TO service_role;

-- ─── 3) admin_process_payout (cüzdan-çekim iadesi) ──────────────────────────

CREATE OR REPLACE FUNCTION public.admin_process_payout(p_payout_id uuid, p_status text, p_ref text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
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
  IF p_status NOT IN ('PROCESSING','COMPLETED','FAILED','CANCELLED') THEN RAISE EXCEPTION 'INVALID_STATUS'; END IF;
  IF p_status = 'COMPLETED' AND COALESCE(btrim(p_ref), '') = '' THEN
    RAISE EXCEPTION 'PAYOUT_REF_REQUIRED: COMPLETED işaretlemek için banka/iyzico transfer referansı zorunludur.';
  END IF;
  SELECT * INTO v_payout FROM public.payout_requests WHERE id = p_payout_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  UPDATE public.payout_requests SET status = p_status, iyzico_payout_ref = COALESCE(p_ref, iyzico_payout_ref),
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
    IF v_payout.payout_type = 'WALLET_CASHOUT'
       AND NOT EXISTS (SELECT 1 FROM public.wallet_transactions
         WHERE reference_type = 'PAYOUT' AND reference_id = p_payout_id AND type = 'TOP_UP' AND balance_type = 'TOP_UP') THEN
      INSERT INTO public.wallet_transactions
        (user_id, amount, type, balance_type, status, reference_type, reference_id, description)
      VALUES (v_payout.user_id, v_payout.amount, 'TOP_UP', 'TOP_UP', 'COMPLETED', 'PAYOUT', p_payout_id,
              'Çekim talebi reddedildi — tutar cüzdana iade edildi');
      PERFORM public._sync_wallet_mirror(v_payout.user_id);
    END IF;
  END IF;
  PERFORM public.log_admin_action('PAYOUT_PROCESS', 'payout', p_payout_id, v_payout.user_id::text,
    jsonb_build_object('old_status', v_payout.status, 'amount', v_payout.amount),
    jsonb_build_object('status', p_status, 'ref', p_ref, 'notes', p_notes));
  RETURN jsonb_build_object('payout_id', p_payout_id, 'status', p_status);
END;
$function$
;

REVOKE ALL ON FUNCTION public.admin_process_payout(p_payout_id uuid, p_status text, p_ref text, p_notes text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_process_payout(p_payout_id uuid, p_status text, p_ref text, p_notes text) TO authenticated, service_role;

-- ─── 4) admin_update_settings (zamanlı bakım + payout_mode) ──────────────────

CREATE OR REPLACE FUNCTION public.admin_update_settings(p_settings jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_old JSONB;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  SELECT to_jsonb(s.*) INTO v_old FROM public.settings s WHERE id = 'main';

  UPDATE public.settings SET
    "appName"                = COALESCE((p_settings->>'app_name')::text,                  "appName"),
    "maintenanceMode"        = COALESCE((p_settings->>'maintenance_mode')::boolean,       "maintenanceMode"),
    "registrationOpen"       = COALESCE((p_settings->>'registration_open')::boolean,      "registrationOpen"),
    "proPrice"               = COALESCE((p_settings->>'pro_price')::numeric,              "proPrice"),
    "commissionRate"         = COALESCE((p_settings->>'commission_rate')::numeric,        "commissionRate"),
    "minRatingToPlay"        = COALESCE((p_settings->>'min_rating_to_play')::numeric,     "minRatingToPlay"),
    "maxMatchsPerDay"        = COALESCE((p_settings->>'max_matches_per_day')::integer,    "maxMatchsPerDay"),
    "featuredPitchId"        = COALESCE((p_settings->>'featured_pitch_id')::text,         "featuredPitchId"),
    "showAnnouncementBanner" = COALESCE((p_settings->>'show_announcement_banner')::boolean, "showAnnouncementBanner"),
    "announcementBanner"     = COALESCE((p_settings->>'announcement_banner')::text,       "announcementBanner"),
    "payoutMode"             = COALESCE((p_settings->>'payout_mode')::text,               "payoutMode"),
    payout_mode              = COALESCE((p_settings->>'payout_mode')::text,               payout_mode),
    "maintenanceStartsAt"    = CASE WHEN p_settings ? 'maintenance_starts_at'
                                    THEN (p_settings->>'maintenance_starts_at')::timestamptz
                                    ELSE "maintenanceStartsAt" END,
    "maintenanceEndsAt"      = CASE WHEN p_settings ? 'maintenance_ends_at'
                                    THEN (p_settings->>'maintenance_ends_at')::timestamptz
                                    ELSE "maintenanceEndsAt" END
  WHERE id = 'main';

  PERFORM public.log_admin_action('SETTINGS_UPDATE', 'system', NULL, 'global_settings', v_old, p_settings);
  RETURN TRUE;
END;
$function$
;

REVOKE ALL ON FUNCTION public.admin_update_settings(p_settings jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_settings(p_settings jsonb) TO authenticated, service_role;

-- ─── 5) admin_update_user_profile__core (PII-maske duyarlı + kart alanları) ──

CREATE OR REPLACE FUNCTION public.admin_update_user_profile__core(p_user_id uuid, p_payload jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_old JSONB;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT to_jsonb(p.*) INTO v_old FROM public.profiles p WHERE id = p_user_id;
  IF v_old IS NULL THEN RAISE EXCEPTION 'Kullanıcı bulunamadı'; END IF;

  UPDATE public.profiles SET
    full_name = COALESCE(p_payload->>'full_name', full_name),
    email = CASE WHEN p_payload ? 'email' AND position('•' in COALESCE(p_payload->>'email','')) = 0
                 THEN COALESCE(NULLIF(p_payload->>'email',''), email) ELSE email END,
    phone = CASE WHEN p_payload ? 'phone' AND position('•' in COALESCE(p_payload->>'phone','')) = 0
                 THEN COALESCE(NULLIF(p_payload->>'phone',''), phone) ELSE phone END,
    avatar_url = COALESCE(p_payload->>'avatar_url', avatar_url),
    role = COALESCE(p_payload->>'role', role),
    roles = CASE WHEN p_payload ? 'role' THEN jsonb_build_array(p_payload->>'role') ELSE roles END,
    is_verified = COALESCE((p_payload->>'is_verified')::boolean, is_verified),
    is_pro = COALESCE((p_payload->>'is_pro')::boolean, is_pro),
    wallet_balance = COALESCE((p_payload->>'wallet_balance')::numeric, wallet_balance),
    match_count = COALESCE((p_payload->>'match_count')::int, match_count),
    rating = COALESCE((p_payload->>'rating')::numeric, rating),
    player_card = CASE
      WHEN p_payload ? 'player_card' AND jsonb_typeof(p_payload->'player_card') = 'object'
      THEN COALESCE(player_card, '{}'::jsonb) || (p_payload->'player_card')
      ELSE player_card
    END,
    card_tier = COALESCE(NULLIF(p_payload->>'card_tier',''), card_tier),
    card_active = COALESCE((p_payload->>'card_active')::boolean, card_active),
    updated_at = NOW()
  WHERE id = p_user_id;

  PERFORM public.log_admin_action(
    'USER_UPDATE', 'user', p_user_id,
    COALESCE(v_old->>'email', p_user_id::text),
    v_old, p_payload
  );
  RETURN TRUE;
END;
$function$
;

REVOKE ALL ON FUNCTION public.admin_update_user_profile__core(p_user_id uuid, p_payload jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_user_profile__core(p_user_id uuid, p_payload jsonb) TO service_role;
