-- KRİTİK güvenlik düzeltmesi + RPC yetki yüzeyi sertleştirme
-- Supabase security advisor taraması ve manuel fonksiyon incelemesiyle bulundu.
--
-- 1) process_match_payment: "auth.uid() IS NOT NULL AND ..." kontrolü, oturumsuz
--    (anon) çağrılarda tamamen atlanıyordu. Yani kimliksiz bir HTTP isteği,
--    pay_public_match_deposit üzerinden herhangi bir kullanıcının (p_user_id)
--    cüzdanından para çekebiliyordu. IS DISTINCT FROM kullanarak NULL durumunu
--    da kapsayacak şekilde düzeltildi.
-- 2) join_public_match_slot / leave_public_match_slot / join_public_match_reserve:
--    p_user_id parametresi hiçbir şekilde doğrulanmıyordu — herhangi bir çağıran
--    (anon dahil), başka bir kullanıcıyı rastgele bir maç slotuna ekleyebilir ya
--    da çıkarabilirdi. Aynı "auth.uid() IS DISTINCT FROM p_user_id" deseni eklendi.
-- 3) ~81 fonksiyon (tüm admin_* RPC'leri, demo seed/purge, is_platform_admin(uuid),
--    is_super_admin(uuid), vb.) Supabase projesinin public şema için varsayılan
--    yetkilendirmesi nedeniyle anon rolüne EXECUTE veriyordu (hiçbir migration
--    bunu hiç REVOKE etmemiş). İçeride hepsi is_platform_admin()/auth.uid() ile
--    kendini koruyor, ama gereksiz saldırı yüzeyini kapatmak için toplu REVOKE
--    uygulanıyor + gelecekteki fonksiyonlar için varsayılan ayar değiştiriliyor.

-- ============================================================
-- 1) process_match_payment — NULL-bypass düzeltmesi
-- ============================================================
CREATE OR REPLACE FUNCTION public.process_match_payment(p_user_id uuid, p_match_id uuid, p_amount numeric)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_current_balance numeric;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Başka bir kullanıcının cüzdanından ödeme yapamazsınız.';
  END IF;
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'GECERSIZ_TUTAR: Ödeme tutarı pozitif olmalıdır.';
  END IF;
  SELECT wallet_balance INTO v_current_balance FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF v_current_balance IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: Kullanıcı bulunamadı.';
  END IF;
  IF v_current_balance < p_amount THEN
    RAISE EXCEPTION 'Yetersiz bakiye. Gerekli: % ₺, Mevcut: % ₺', p_amount, v_current_balance;
  END IF;
  UPDATE public.profiles SET wallet_balance = wallet_balance - p_amount, updated_at = NOW() WHERE id = p_user_id;
  INSERT INTO public.wallet_transactions (user_id, match_id, amount, type, description)
  VALUES (p_user_id, p_match_id, -p_amount, 'MATCH_FEE', 'Maç katılım ücreti');
  RETURN TRUE;
END;
$function$;

-- ============================================================
-- 2) join_public_match_slot — p_user_id doğrulaması eklendi
-- ============================================================
CREATE OR REPLACE FUNCTION public.join_public_match_slot(p_match_id uuid, p_slot_id text, p_user_id uuid, p_is_away boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
    v_slots JSONB;
    v_slot JSONB;
    v_updated_slots JSONB := '[]'::jsonb;
    v_found BOOLEAN := FALSE;
    v_user_profile RECORD;
    v_already_joined BOOLEAN := FALSE;
BEGIN
    IF auth.uid() IS DISTINCT FROM p_user_id AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Başka bir kullanıcı adına maça katılamazsınız.';
    END IF;

    SELECT is_banned, full_name, avatar_url, rating INTO v_user_profile
    FROM public.profiles WHERE id = p_user_id;

    IF v_user_profile.is_banned THEN
        RAISE EXCEPTION 'Kullanıcı banlı!';
    END IF;

    IF p_is_away THEN
        SELECT "awaySlots" INTO v_slots FROM public.matches WHERE id = p_match_id FOR UPDATE;
    ELSE
        SELECT slots INTO v_slots FROM public.matches WHERE id = p_match_id FOR UPDATE;
    END IF;

    IF v_slots IS NULL THEN
        RAISE EXCEPTION 'Maç bulunamadı!';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM (
            SELECT jsonb_array_elements(slots) AS s FROM public.matches WHERE id = p_match_id
            UNION ALL
            SELECT jsonb_array_elements(COALESCE("awaySlots", '[]'::jsonb)) AS s FROM public.matches WHERE id = p_match_id
        ) q WHERE (q.s->'player'->>'id')::UUID = p_user_id
    ) INTO v_already_joined;

    IF v_already_joined THEN
        RAISE EXCEPTION 'Zaten bu maça katılmışsınız!';
    END IF;

    FOR v_slot IN SELECT jsonb_array_elements(v_slots) LOOP
        IF (v_slot->>'id') = p_slot_id THEN
            IF (v_slot->>'status') = 'TAKEN' THEN
                RAISE EXCEPTION 'Bu slot zaten dolu!';
            END IF;

            v_slot := jsonb_set(v_slot, '{status}', '"TAKEN"'::jsonb);
            v_slot := jsonb_set(v_slot, '{player}', jsonb_build_object(
                'id', p_user_id,
                'name', COALESCE(v_user_profile.full_name, 'Oyuncu'),
                'avatar', COALESCE(v_user_profile.avatar_url, 'https://i.pravatar.cc/150'),
                'rating', COALESCE((v_user_profile.rating)::numeric, 4.5),
                'position', COALESCE(v_slot->>'role', 'OYUNCU'),
                'x', (v_slot->>'x')::numeric,
                'y', (v_slot->>'y')::numeric,
                'paymentStatus', 'UNPAID'
            ));
            v_found := TRUE;
        END IF;
        v_updated_slots := v_updated_slots || jsonb_build_array(v_slot);
    END LOOP;

    IF NOT v_found THEN
        RAISE EXCEPTION 'Belirtilen slot bulunamadı!';
    END IF;

    IF p_is_away THEN
        UPDATE public.matches SET "awaySlots" = v_updated_slots WHERE id = p_match_id;
    ELSE
        UPDATE public.matches SET slots = v_updated_slots WHERE id = p_match_id;
    END IF;
END;
$function$;

-- ============================================================
-- 3) leave_public_match_slot — p_user_id doğrulaması eklendi
-- ============================================================
CREATE OR REPLACE FUNCTION public.leave_public_match_slot(p_match_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
    v_slots JSONB;
    v_away_slots JSONB;
    v_slot JSONB;
    v_updated_slots JSONB := '[]'::jsonb;
    v_updated_away_slots JSONB := '[]'::jsonb;
    v_found BOOLEAN := FALSE;
    v_creator_id UUID;
    v_reserve_players JSONB;
    v_promoted_player JSONB := NULL;
    v_remaining_reserves JSONB := '[]'::jsonb;
BEGIN
    IF auth.uid() IS DISTINCT FROM p_user_id AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Başka bir kullanıcıyı maçtan çıkaramazsınız.';
    END IF;

    SELECT slots, "awaySlots", "creatorId", "reservePlayers"
    INTO v_slots, v_away_slots, v_creator_id, v_reserve_players
    FROM public.matches WHERE id = p_match_id FOR UPDATE;

    IF v_slots IS NULL THEN
        RAISE EXCEPTION 'Maç bulunamadı!';
    END IF;

    IF v_reserve_players IS NOT NULL AND jsonb_array_length(v_reserve_players) > 0 THEN
        v_promoted_player := v_reserve_players->0;
        FOR i IN 1..jsonb_array_length(v_reserve_players)-1 LOOP
            v_remaining_reserves := v_remaining_reserves || jsonb_build_array(v_reserve_players->i);
        END LOOP;
    ELSE
        v_remaining_reserves := '[]'::jsonb;
    END IF;

    FOR v_slot IN SELECT jsonb_array_elements(v_slots) LOOP
        IF (v_slot->'player'->>'id')::UUID = p_user_id THEN
            v_found := TRUE;
            IF v_promoted_player IS NOT NULL THEN
                v_slot := jsonb_set(v_slot, '{status}', '"TAKEN"'::jsonb);
                v_slot := jsonb_set(v_slot, '{player}', jsonb_build_object(
                    'id', v_promoted_player->>'id',
                    'name', v_promoted_player->>'name',
                    'avatar', v_promoted_player->>'avatar',
                    'rating', (v_promoted_player->>'rating')::numeric,
                    'position', COALESCE(v_slot->>'role', 'OYUNCU'),
                    'x', (v_slot->>'x')::numeric,
                    'y', (v_slot->>'y')::numeric,
                    'paymentStatus', 'UNPAID'
                ));
                v_promoted_player := NULL;
            ELSE
                v_slot := jsonb_set(v_slot, '{status}', '"OPEN"'::jsonb);
                v_slot := v_slot - 'player';
            END IF;
        END IF;
        v_updated_slots := v_updated_slots || jsonb_build_array(v_slot);
    END LOOP;

    IF NOT v_found THEN
        FOR v_slot IN SELECT jsonb_array_elements(COALESCE(v_away_slots, '[]'::jsonb)) LOOP
            IF (v_slot->'player'->>'id')::UUID = p_user_id THEN
                v_found := TRUE;
                IF v_promoted_player IS NOT NULL THEN
                    v_slot := jsonb_set(v_slot, '{status}', '"TAKEN"'::jsonb);
                    v_slot := jsonb_set(v_slot, '{player}', jsonb_build_object(
                        'id', v_promoted_player->>'id',
                        'name', v_promoted_player->>'name',
                        'avatar', v_promoted_player->>'avatar',
                        'rating', (v_promoted_player->>'rating')::numeric,
                        'position', COALESCE(v_slot->>'role', 'OYUNCU'),
                        'x', (v_slot->>'x')::numeric,
                        'y', (v_slot->>'y')::numeric,
                        'paymentStatus', 'UNPAID'
                    ));
                    v_promoted_player := NULL;
                ELSE
                    v_slot := jsonb_set(v_slot, '{status}', '"OPEN"'::jsonb);
                    v_slot := v_slot - 'player';
                END IF;
            END IF;
            v_updated_away_slots := v_updated_away_slots || jsonb_build_array(v_slot);
        END LOOP;
    ELSE
        v_updated_away_slots := COALESCE(v_away_slots, '[]'::jsonb);
    END IF;

    IF NOT v_found THEN
        v_remaining_reserves := '[]'::jsonb;
        FOR v_slot IN SELECT jsonb_array_elements(COALESCE(v_reserve_players, '[]'::jsonb)) LOOP
            IF (v_slot->>'id')::UUID <> p_user_id THEN
                v_remaining_reserves := v_remaining_reserves || jsonb_build_array(v_slot);
            ELSE
                v_found := TRUE;
            END IF;
        END LOOP;

        IF v_found THEN
            UPDATE public.matches SET "reservePlayers" = v_remaining_reserves WHERE id = p_match_id;
            RETURN;
        END IF;
    END IF;

    IF NOT v_found THEN
        RAISE EXCEPTION 'Kullanıcı maça kayıtlı değil!';
    END IF;

    IF v_creator_id = p_user_id THEN
        DECLARE
            v_new_creator_id UUID := NULL;
        BEGIN
            SELECT p.id INTO v_new_creator_id
            FROM (
                SELECT (jsonb_array_elements(v_updated_slots)->'player'->>'id')::UUID AS id
                UNION ALL
                SELECT (jsonb_array_elements(v_updated_away_slots)->'player'->>'id')::UUID AS id
            ) active_players
            JOIN public.profiles p ON p.id = active_players.id
            WHERE active_players.id IS NOT NULL AND active_players.id <> p_user_id
            ORDER BY p.reliability_score DESC NULLS LAST, p.created_at ASC
            LIMIT 1;

            IF v_new_creator_id IS NOT NULL THEN
                UPDATE public.matches SET "creatorId" = v_new_creator_id WHERE id = p_match_id;

                INSERT INTO public.notifications (user_id, title, body, type_key)
                VALUES (
                    v_new_creator_id,
                    '👑 Yeni Kaptan Sensin!',
                    'Eski kaptan ayrıldığı için yüksek güvenilirlik skorunla bu maçın yeni kaptanı seçildin.',
                    'SYSTEM'
                );
            END IF;
        END;
    END IF;

    UPDATE public.matches
    SET slots = v_updated_slots,
        "awaySlots" = v_updated_away_slots,
        "reservePlayers" = v_remaining_reserves
    WHERE id = p_match_id;
END;
$function$;

-- ============================================================
-- 4) join_public_match_reserve — p_user_id doğrulaması eklendi
-- ============================================================
CREATE OR REPLACE FUNCTION public.join_public_match_reserve(p_match_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
    v_reserve_players JSONB;
    v_user_profile RECORD;
    v_already_joined BOOLEAN := FALSE;
BEGIN
    IF auth.uid() IS DISTINCT FROM p_user_id AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Başka bir kullanıcı adına yedek kadroya katılamazsınız.';
    END IF;

    SELECT is_banned, full_name, avatar_url, rating INTO v_user_profile
    FROM public.profiles WHERE id = p_user_id;

    IF v_user_profile.is_banned THEN
        RAISE EXCEPTION 'Kullanıcı banlı!';
    END IF;

    SELECT "reservePlayers" INTO v_reserve_players FROM public.matches WHERE id = p_match_id FOR UPDATE;

    IF v_reserve_players IS NULL THEN
        v_reserve_players := '[]'::jsonb;
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM (
            SELECT jsonb_array_elements(slots) AS s FROM public.matches WHERE id = p_match_id
            UNION ALL
            SELECT jsonb_array_elements(COALESCE("awaySlots", '[]'::jsonb)) AS s FROM public.matches WHERE id = p_match_id
            UNION ALL
            SELECT jsonb_array_elements(COALESCE("reservePlayers", '[]'::jsonb)) AS s FROM public.matches WHERE id = p_match_id
        ) q WHERE (q.s->'player'->>'id')::UUID = p_user_id OR (q.s->>'id')::UUID = p_user_id
    ) INTO v_already_joined;

    IF v_already_joined THEN
        RAISE EXCEPTION 'Zaten bu maça katılmışsınız!';
    END IF;

    v_reserve_players := v_reserve_players || jsonb_build_array(jsonb_build_object(
        'id', p_user_id,
        'name', COALESCE(v_user_profile.full_name, 'Oyuncu'),
        'avatar', COALESCE(v_user_profile.avatar_url, 'https://i.pravatar.cc/150'),
        'rating', COALESCE((v_user_profile.rating)::numeric, 4.5),
        'position', 'YEDEK',
        'x', 50,
        'y', 50,
        'paymentStatus', 'UNPAID'
    ));

    UPDATE public.matches SET "reservePlayers" = v_reserve_players WHERE id = p_match_id;
END;
$function$;

-- ============================================================
-- 5) Gereksiz anon erişimini topluca kaldır
--    (hepsi kendi içinde is_platform_admin()/is_admin()/auth.uid() ile korunuyor,
--    ama anon rolünün bunları doğrudan çağırabilmesi saf gereksiz saldırı yüzeyi)
-- ============================================================
DO $$
DECLARE
  r RECORD;
  v_names TEXT[] := ARRAY[
    '_sync_profile_communities','admin_assign_match_referee','admin_assign_to_slot','admin_ban_user',
    'admin_broadcast_notification','admin_cancel_match','admin_create_community','admin_create_goalkeeper',
    'admin_create_match','admin_create_pitch','admin_create_promo_code','admin_create_referee',
    'admin_dashboard_stats','admin_delete_community','admin_delete_goalkeeper','admin_delete_match',
    'admin_delete_pitch','admin_delete_promo_code','admin_delete_referee','admin_fetch_booking_payments',
    'admin_fetch_cms_texts','admin_fetch_communities','admin_fetch_goalkeepers','admin_fetch_matches',
    'admin_fetch_owner_billing_events','admin_fetch_pending_verifications','admin_fetch_pitches',
    'admin_fetch_profile_names','admin_fetch_profiles','admin_fetch_referees','admin_fetch_revenue_trend',
    'admin_fetch_wallet_ledger','admin_fetch_withdrawal_requests','admin_finance_stats','admin_get_community',
    'admin_get_match','admin_get_my_role','admin_kick_from_slot','admin_log_impersonation',
    'admin_manage_community_member','admin_moderate_community_creation','admin_moderate_join_request',
    'admin_moderate_pitch','admin_notify_community','admin_ops_queue','admin_process_account_deletion',
    'admin_process_withdrawal','admin_resolve_dispute','admin_revoke_platform_role','admin_segment_preview',
    'admin_set_match_status','admin_set_platform_role','admin_set_promo_code_active','admin_toggle_user_pro',
    'admin_update_community','admin_update_goalkeeper','admin_update_match','admin_update_owner_account',
    'admin_update_pitch','admin_update_referee','admin_update_settings','admin_update_texts',
    'admin_update_user_profile','admin_upsert_user_profile','admin_verify_user','approve_provider_verification',
    'ensure_owner_account','is_platform_admin','is_super_admin','join_public_match_reserve',
    'join_public_match_slot','leave_public_match_slot','log_admin_action','pay_public_match_deposit',
    'profile_privileges_unchanged','protect_profile_sensitive_fields','purge_godview_demo','purge_module_demo',
    'request_account_deletion','seed_godview_demo','seed_module_demo'
  ];
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY(v_names)
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.sig);
  END LOOP;
END $$;

-- Gelecekte oluşturulacak fonksiyonların anon'a otomatik sızmaması için varsayılanı değiştir.
-- (Supabase projeleri public şemada varsayılan olarak anon+authenticated'a EXECUTE verir.)
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
