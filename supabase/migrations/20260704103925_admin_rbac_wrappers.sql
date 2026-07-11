-- Wave 8 (Kararlar Soru 21-22): alt-rol RBAC'ının SUNUCUDA zorlanması.
--
-- Desen: mevcut fonksiyon <ad>__core olarak yeniden adlandırılır; aynı imzalı
-- (DEFAULT'lar dahil) yeni fonksiyon önce require_admin_role(...) kapısından
-- geçer, sonra çekirdeği çağırır. Çekirdeğin EXECUTE izni authenticated'dan
-- alınır — API yüzeyi yalnız kapılı sarmalayıcıdır.
--
-- require_admin_role semantiği (canlı, Wave 4): rol NULL (admin_team_members
-- dışı kurucu) veya SUPER_ADMIN/ADMIN → geçer; aksi halde izinli listede
-- olmalı. Boş liste = yalnız ADMIN/SUPER_ADMIN.
--
-- ⚠️ Gelecek migration'lar bu fonksiyonları CREATE OR REPLACE ile ezmemeli;
-- davranış değişikliği __core üzerinde yapılmalı (bkz. docs/RPC_YETKI_ENVANTERI.md).

DO $do$
DECLARE
  spec RECORD;
  v_oid oid;
  v_decl text;   -- DEFAULT'lu bildirim
  v_ident text;  -- imza (identity)
  v_ret text;
  v_call text;   -- parametre geçiş listesi
  v_core text;
  v_tail text;
BEGIN
  FOR spec IN
    SELECT * FROM (VALUES
      -- ── FİNANS: para hareketi ───────────────────────────────────────────
      ('admin_process_payout',            ARRAY['FINANCE']),
      ('admin_reverse_payout',            ARRAY['FINANCE']),
      ('admin_process_withdrawal',        ARRAY['FINANCE']),
      ('admin_release_service_payout',    ARRAY['FINANCE']),
      ('admin_refund_intent',             ARRAY['FINANCE']),
      ('admin_force_capture_intent',      ARRAY['FINANCE']),
      ('admin_force_void_intent',         ARRAY['FINANCE']),
      ('admin_update_owner_account',      ARRAY['FINANCE']),
      -- ── İhtilaf: operasyon + finans birlikte çözebilir ──────────────────
      ('admin_resolve_dispute',           ARRAY['FINANCE','MODERATOR']),
      -- ── Yalnız ADMIN/SUPER_ADMIN: platform ayarları & broadcast ────────
      ('admin_update_settings',           ARRAY[]::text[]),
      ('admin_set_config',                ARRAY[]::text[]),
      ('admin_set_feature_flag',          ARRAY[]::text[]),
      ('admin_update_texts',              ARRAY[]::text[]),
      ('admin_broadcast_notification',    ARRAY[]::text[]),
      -- ── OPERASYON (MODERATOR): kullanıcı/tesis/maç/sağlayıcı ───────────
      ('admin_ban_user',                  ARRAY['MODERATOR']),
      ('admin_verify_user',               ARRAY['MODERATOR']),
      ('admin_moderate_pitch',            ARRAY['MODERATOR']),
      ('admin_review_provider_application', ARRAY['MODERATOR']),
      ('admin_verify_provider_identity',  ARRAY['MODERATOR']),
      ('admin_update_user_profile',       ARRAY['MODERATOR']),
      ('admin_upsert_user_profile',       ARRAY['MODERATOR']),
      ('admin_process_account_deletion',  ARRAY['MODERATOR']),
      ('admin_set_player_card',           ARRAY['MODERATOR']),
      ('admin_set_player_card_data',      ARRAY['MODERATOR']),
      ('admin_cancel_match',              ARRAY['MODERATOR']),
      ('admin_set_match_status',          ARRAY['MODERATOR']),
      ('admin_override_match_score',      ARRAY['MODERATOR']),
      ('admin_delete_match',              ARRAY['MODERATOR']),
      ('admin_create_match',              ARRAY['MODERATOR']),
      ('admin_update_match',              ARRAY['MODERATOR']),
      ('admin_delete_pitch',              ARRAY['MODERATOR']),
      ('admin_assign_to_slot',            ARRAY['MODERATOR']),
      ('admin_kick_from_slot',            ARRAY['MODERATOR']),
      ('admin_swap_slots',                ARRAY['MODERATOR']),
      ('admin_assign_match_referee',      ARRAY['MODERATOR']),
      ('admin_assign_match_goalkeeper',   ARRAY['MODERATOR']),
      ('admin_notify_match_roster',       ARRAY['MODERATOR']),
      ('admin_create_goalkeeper',         ARRAY['MODERATOR']),
      ('admin_update_goalkeeper',         ARRAY['MODERATOR']),
      ('admin_delete_goalkeeper',         ARRAY['MODERATOR']),
      ('admin_create_referee',            ARRAY['MODERATOR']),
      ('admin_update_referee',            ARRAY['MODERATOR']),
      ('admin_delete_referee',            ARRAY['MODERATOR'])
    ) AS t(fname, roles)
  LOOP
    v_core := spec.fname || '__core';

    -- Idempotens: sarmalayıcı zaten kuruluysa atla
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = v_core
    ) THEN CONTINUE; END IF;

    SELECT p.oid,
           pg_get_function_arguments(p.oid),
           pg_get_function_identity_arguments(p.oid),
           pg_get_function_result(p.oid),
           (SELECT string_agg(quote_ident(a), ', ') FROM unnest(p.proargnames) a)
      INTO v_oid, v_decl, v_ident, v_ret, v_call
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = spec.fname;

    IF v_oid IS NULL THEN
      RAISE NOTICE 'Atlandı (bulunamadı): %', spec.fname;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER FUNCTION public.%I(%s) RENAME TO %I', spec.fname, v_ident, v_core);

    IF v_ret = 'void' THEN
      v_tail := format('PERFORM public.%I(%s); RETURN;', v_core, COALESCE(v_call, ''));
    ELSE
      v_tail := format('RETURN public.%I(%s);', v_core, COALESCE(v_call, ''));
    END IF;

    EXECUTE format(
      'CREATE FUNCTION public.%I(%s) RETURNS %s LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''public'' AS $w$ BEGIN PERFORM public.require_admin_role(%L::text[]); %s END; $w$',
      spec.fname, v_decl, v_ret, spec.roles::text, v_tail
    );

    EXECUTE format('COMMENT ON FUNCTION public.%I(%s) IS %L',
      spec.fname, v_ident,
      'RBAC kapısı (Wave 8). Davranış değişikliği ' || v_core || ' üzerinde yapılmalı; bu sarmalayıcıyı CREATE OR REPLACE ile ezmeyin.');

    -- İzinler: API yüzeyi yalnız sarmalayıcı; çekirdek dışa kapalı
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon', spec.fname, v_ident);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated', spec.fname, v_ident);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated', v_core, v_ident);
  END LOOP;
END
$do$;

-- Saha RPC'leri (gövdeleri bu depoda kanonik): inline kapı — OPERASYON.
-- admin_update_pitch ayrıca owner_id devrini SUPER_ADMIN'e kilitler (000005).
CREATE OR REPLACE FUNCTION public.admin_create_pitch(p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id UUID := COALESCE(NULLIF(p_payload->>'id', '')::uuid, gen_random_uuid());
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  PERFORM public.require_admin_role(ARRAY['MODERATOR']);
  INSERT INTO public.pitches (
    id, name, district, city, latitude, longitude,
    price_per_match, google_rating, google_review_count,
    verification_status, owner_id, image, is_demo, address,
    description, amenities, working_hours, is_published
  ) VALUES (
    v_id,
    COALESCE(p_payload->>'name', 'Yeni Saha'),
    p_payload->>'district',
    p_payload->>'city',
    (p_payload->>'latitude')::double precision,
    (p_payload->>'longitude')::double precision,
    COALESCE((p_payload->>'price_per_match')::numeric, 0),
    COALESCE((p_payload->>'google_rating')::numeric, 0),
    COALESCE((p_payload->>'google_review_count')::int, 0),
    COALESCE(p_payload->>'verification_status', 'approved'),
    NULLIF(p_payload->>'owner_id', '')::uuid,
    p_payload->>'image',
    COALESCE((p_payload->>'isDemo')::boolean, false),
    COALESCE(p_payload->>'address', p_payload->>'district', ''),
    NULLIF(p_payload->>'description', ''),
    COALESCE(p_payload->'amenities', '[]'::jsonb),
    CASE WHEN p_payload ? 'working_hours' THEN p_payload->'working_hours'
         ELSE '{"open": "10:00", "close": "02:00", "slot_duration": 60}'::jsonb END,
    COALESCE((p_payload->>'is_published')::boolean, true)
  );
  PERFORM public.log_admin_action('PITCH_CREATE', 'pitch', v_id, p_payload->>'name', NULL, p_payload);
  RETURN v_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_create_pitch(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_pitch(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_update_pitch(p_pitch_id uuid, p_payload jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_old JSONB;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  PERFORM public.require_admin_role(ARRAY['MODERATOR']);
  IF p_payload ? 'owner_id' AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Tesis sahipliği devri yalnız SUPER_ADMIN tarafından yapılabilir';
  END IF;
  SELECT to_jsonb(p.*) INTO v_old FROM public.pitches p WHERE id = p_pitch_id;
  IF v_old IS NULL THEN RAISE EXCEPTION 'Saha bulunamadı'; END IF;
  UPDATE public.pitches SET
    name = COALESCE(p_payload->>'name', name),
    district = COALESCE(p_payload->>'district', district),
    city = COALESCE(p_payload->>'city', city),
    address = COALESCE(p_payload->>'address', address),
    latitude = COALESCE((p_payload->>'latitude')::double precision, latitude),
    longitude = COALESCE((p_payload->>'longitude')::double precision, longitude),
    price_per_match = COALESCE((p_payload->>'price_per_match')::numeric, price_per_match),
    google_rating = COALESCE((p_payload->>'google_rating')::numeric, google_rating),
    google_review_count = COALESCE((p_payload->>'google_review_count')::int, google_review_count),
    verification_status = COALESCE(p_payload->>'verification_status', verification_status),
    image = COALESCE(p_payload->>'image', image),
    description = CASE WHEN p_payload ? 'description' THEN NULLIF(p_payload->>'description', '') ELSE description END,
    amenities = CASE WHEN p_payload ? 'amenities' THEN p_payload->'amenities' ELSE amenities END,
    working_hours = CASE WHEN p_payload ? 'working_hours' THEN p_payload->'working_hours' ELSE working_hours END,
    is_published = COALESCE((p_payload->>'is_published')::boolean, is_published),
    is_featured = COALESCE((p_payload->>'is_featured')::boolean, is_featured),
    is_active = COALESCE((p_payload->>'is_active')::boolean, is_active),
    owner_id = CASE WHEN p_payload ? 'owner_id' THEN NULLIF(p_payload->>'owner_id', '')::uuid ELSE owner_id END
  WHERE id = p_pitch_id;
  PERFORM public.log_admin_action('PITCH_UPDATE', 'pitch', p_pitch_id, p_payload->>'name', v_old, p_payload);
  RETURN TRUE;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_update_pitch(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_pitch(uuid, jsonb) TO authenticated;
