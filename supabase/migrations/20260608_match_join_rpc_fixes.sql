-- ==============================================================================
-- OYNA: Match Join RPC Fixes
-- Creates secure, concurrency-safe PostgreSQL RPC functions for public.matches.
-- ==============================================================================

-- 1. RPC for joining a public match slot
CREATE OR REPLACE FUNCTION join_public_match_slot(
    p_match_id UUID,
    p_slot_id TEXT,
    p_user_id UUID,
    p_is_away BOOLEAN
) RETURNS VOID AS $$
DECLARE
    v_slots JSONB;
    v_slot JSONB;
    v_updated_slots JSONB := '[]'::jsonb;
    v_found BOOLEAN := FALSE;
    v_user_profile RECORD;
    v_already_joined BOOLEAN := FALSE;
BEGIN
    -- Ban kontrolü ve profil bilgileri
    SELECT is_banned, full_name, avatar_url, stats->>'rating' AS rating INTO v_user_profile
    FROM public.profiles WHERE id = p_user_id;
    
    IF v_user_profile.is_banned THEN
        RAISE EXCEPTION 'Kullanıcı banlı!';
    END IF;

    -- Eşzamanlılık kilidi (Pessimistic Lock)
    IF p_is_away THEN
        SELECT away_slots INTO v_slots FROM public.matches WHERE id = p_match_id FOR UPDATE;
    ELSE
        SELECT slots INTO v_slots FROM public.matches WHERE id = p_match_id FOR UPDATE;
    END IF;

    IF v_slots IS NULL THEN
        RAISE EXCEPTION 'Maç bulunamadı!';
    END IF;

    -- Kullanıcı mükerrerlik kontrolü (Hem ev sahibi hem deplasman slotları aranır)
    SELECT EXISTS (
        SELECT 1 FROM (
            SELECT jsonb_array_elements(slots) AS s FROM public.matches WHERE id = p_match_id
            UNION ALL
            SELECT jsonb_array_elements(away_slots) AS s FROM public.matches WHERE id = p_match_id
        ) q WHERE (q.s->'player'->>'id')::UUID = p_user_id
    ) INTO v_already_joined;

    IF v_already_joined THEN
        RAISE EXCEPTION 'Zaten bu maça katılmışsınız!';
    END IF;

    -- Slotları dön ve eşleşen slotu güncelle
    FOR v_slot IN SELECT jsonb_array_elements(v_slots) LOOP
        IF (v_slot->>'id') = p_slot_id THEN
            IF (v_slot->>'status') = 'TAKEN' THEN
                RAISE EXCEPTION 'Bu slot zaten dolu!';
            END IF;
            
            -- Slot durumunu TAKEN yap ve oyuncuyu ata
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

    -- Kaydet
    IF p_is_away THEN
        UPDATE public.matches SET away_slots = v_updated_slots WHERE id = p_match_id;
    ELSE
        UPDATE public.matches SET slots = v_updated_slots WHERE id = p_match_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. RPC for joining as a reserve player
CREATE OR REPLACE FUNCTION join_public_match_reserve(
    p_match_id UUID,
    p_user_id UUID
) RETURNS VOID AS $$
DECLARE
    v_reserve_players JSONB;
    v_user_profile RECORD;
    v_already_joined BOOLEAN := FALSE;
BEGIN
    -- Ban kontrolü ve profil bilgileri
    SELECT is_banned, full_name, avatar_url, stats->>'rating' AS rating INTO v_user_profile
    FROM public.profiles WHERE id = p_user_id;
    
    IF v_user_profile.is_banned THEN
        RAISE EXCEPTION 'Kullanıcı banlı!';
    END IF;

    -- Eşzamanlılık kilidi (Pessimistic Lock)
    SELECT reserve_players INTO v_reserve_players FROM public.matches WHERE id = p_match_id FOR UPDATE;

    IF v_reserve_players IS NULL THEN
        v_reserve_players := '[]'::jsonb;
    END IF;

    -- Kullanıcı mükerrerlik kontrolü (Asil kadrolar ve yedek kulübesi)
    SELECT EXISTS (
        SELECT 1 FROM (
            SELECT jsonb_array_elements(slots) AS s FROM public.matches WHERE id = p_match_id
            UNION ALL
            SELECT jsonb_array_elements(away_slots) AS s FROM public.matches WHERE id = p_match_id
            UNION ALL
            SELECT jsonb_array_elements(reserve_players) AS s FROM public.matches WHERE id = p_match_id
        ) q WHERE (q.s->'player'->>'id')::UUID = p_user_id OR (q.s->>'id')::UUID = p_user_id
    ) INTO v_already_joined;

    IF v_already_joined THEN
        RAISE EXCEPTION 'Zaten bu maça katılmışsınız!';
    END IF;

    -- Yedek kulübesine ekle
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

    -- Kaydet
    UPDATE public.matches SET reserve_players = v_reserve_players WHERE id = p_match_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. RPC for leaving a public match slot or reserve list (with auto promotion)
CREATE OR REPLACE FUNCTION leave_public_match_slot(
    p_match_id UUID,
    p_user_id UUID
) RETURNS VOID AS $$
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
    -- Eşzamanlılık kilidi (Pessimistic Lock)
    SELECT slots, away_slots, creator_id, reserve_players
    INTO v_slots, v_away_slots, v_creator_id, v_reserve_players
    FROM public.matches WHERE id = p_match_id FOR UPDATE;

    IF v_slots IS NULL THEN
        RAISE EXCEPTION 'Maç bulunamadı!';
    END IF;

    -- Yedek oyuncu listesinde biri varsa, ilk yedek oyuncuyu terfi ettir
    IF v_reserve_players IS NOT NULL AND jsonb_array_length(v_reserve_players) > 0 THEN
        v_promoted_player := v_reserve_players->0;
        -- Geri kalan yedekleri toparla
        FOR i IN 1..jsonb_array_length(v_reserve_players)-1 LOOP
            v_remaining_reserves := v_remaining_reserves || jsonb_build_array(v_reserve_players->i);
        END LOOP;
    ELSE
        v_remaining_reserves := '[]'::jsonb;
    END IF;

    -- Ev sahibi kadrosunda ara ve boşalt/terfi ettir
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
                v_promoted_player := NULL; -- Tüketildi
            ELSE
                v_slot := jsonb_set(v_slot, '{status}', '"OPEN"'::jsonb);
                v_slot := v_slot - 'player';
            END IF;
        END IF;
        v_updated_slots := v_updated_slots || jsonb_build_array(v_slot);
    END LOOP;

    -- Deplasman kadrosunda ara
    IF NOT v_found THEN
        FOR v_slot IN SELECT jsonb_array_elements(v_away_slots) LOOP
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
                    v_promoted_player := NULL; -- Tüketildi
                ELSE
                    v_slot := jsonb_set(v_slot, '{status}', '"OPEN"'::jsonb);
                    v_slot := v_slot - 'player';
                END IF;
            END IF;
            v_updated_away_slots := v_updated_away_slots || jsonb_build_array(v_slot);
        END LOOP;
    ELSE
        v_updated_away_slots := v_away_slots;
    END IF;

    -- Kadroda bulunamadıysa yedek kulübesinde ara
    IF NOT v_found THEN
        v_remaining_reserves := '[]'::jsonb;
        FOR v_slot IN SELECT jsonb_array_elements(v_reserve_players) LOOP
            IF (v_slot->>'id')::UUID <> p_user_id THEN
                v_remaining_reserves := v_remaining_reserves || jsonb_build_array(v_slot);
            ELSE
                v_found := TRUE;
            END IF;
        END LOOP;
        
        IF v_found THEN
            UPDATE public.matches SET reserve_players = v_remaining_reserves WHERE id = p_match_id;
            RETURN;
        END IF;
    END IF;

    IF NOT v_found THEN
        RAISE EXCEPTION 'Kullanıcı maça kayıtlı değil!';
    END IF;

    -- Eğer ayrılan kişi maçı oluşturan kaptan (creator_id) ise yeni kaptan belirle
    IF v_creator_id = p_user_id THEN
        DECLARE
            v_new_creator_id UUID := NULL;
        BEGIN
            -- Güvenilirlik skoru en yüksek olan aktif oyuncuyu bul
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
                UPDATE public.matches SET creator_id = v_new_creator_id WHERE id = p_match_id;
                
                -- Yeni kaptana bildirim gönder
                INSERT INTO public.notifications (user_id, title, body, type)
                VALUES (
                    v_new_creator_id,
                    '👑 Yeni Kaptan Sensin!',
                    'Eski kaptan ayrıldığı için yüksek güvenilirlik skorunla bu maçın yeni kaptanı seçildin.',
                    'SYSTEM'
                );
            END IF;
        END;
    END IF;

    -- Kaydet
    UPDATE public.matches
    SET slots = v_updated_slots,
        away_slots = v_updated_away_slots,
        reserve_players = v_remaining_reserves
    WHERE id = p_match_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. RPC to pay the match deposit from wallet balance
CREATE OR REPLACE FUNCTION pay_public_match_deposit(
    p_match_id UUID,
    p_user_id UUID,
    p_amount NUMERIC
) RETURNS VOID AS $$
DECLARE
    v_slots JSONB;
    v_away_slots JSONB;
    v_slot JSONB;
    v_updated_slots JSONB := '[]'::jsonb;
    v_updated_away_slots JSONB := '[]'::jsonb;
    v_found BOOLEAN := FALSE;
    v_payment_success BOOLEAN;
BEGIN
    -- 1. process_match_payment fonksiyonu ile bakiyeyi düşür ve logla
    -- Yetersiz bakiye durumunda bu çağrı hata fırlatır ve işlemi otomatik olarak rollback eder.
    SELECT process_match_payment(p_user_id, p_match_id, p_amount) INTO v_payment_success;
    
    IF NOT v_payment_success THEN
        RAISE EXCEPTION 'Ödeme işlemi başarısız!';
    END IF;

    -- 2. Maç slotlarını çek (Eşzamanlılık kilidiyle)
    SELECT slots, away_slots INTO v_slots, v_away_slots FROM public.matches WHERE id = p_match_id FOR UPDATE;

    -- 3. Ev sahibi kadrosunda ara ve ödemeyi işaretle
    FOR v_slot IN SELECT jsonb_array_elements(v_slots) LOOP
        IF (v_slot->'player'->>'id')::UUID = p_user_id THEN
            v_slot := jsonb_set(v_slot, '{player,paymentStatus}', '"PAID"'::jsonb);
            v_found := TRUE;
        END IF;
        v_updated_slots := v_updated_slots || jsonb_build_array(v_slot);
    END LOOP;

    -- 4. Deplasman kadrosunda ara
    IF NOT v_found THEN
        FOR v_slot IN SELECT jsonb_array_elements(v_away_slots) LOOP
            IF (v_slot->'player'->>'id')::UUID = p_user_id THEN
                v_slot := jsonb_set(v_slot, '{player,paymentStatus}', '"PAID"'::jsonb);
                v_found := TRUE;
            END IF;
            v_updated_away_slots := v_updated_away_slots || jsonb_build_array(v_slot);
        END LOOP;
    ELSE
        v_updated_away_slots := v_away_slots;
    END IF;

    IF NOT v_found THEN
        RAISE EXCEPTION 'Kullanıcı bu maçta kadroda bulunamadı!';
    END IF;

    -- 5. Kaydet
    UPDATE public.matches
    SET slots = v_updated_slots,
        away_slots = v_updated_away_slots
    WHERE id = p_match_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
