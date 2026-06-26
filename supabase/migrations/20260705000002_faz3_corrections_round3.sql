-- ==============================================================================
-- FAZ 3 Düzeltmeleri — Round 3 (adversarial denetim bulguları, doğrulanmış)
-- CRITICAL: cancel_app_booking %90 iadeyi hiçbir cüzdana işlemiyordu (para kaybı)
-- HIGH: pay_public_match_deposit çift-ödeme koruması yok (çift tahsilat)
-- HIGH: leave_public_match_slot ayrılan PAID oyuncuya iade yapmıyordu (para kaybı)
-- MEDIUM: player_update_match visibility/pitch_id/private_code'u güncellemiyordu
-- REPO-FIX: admin_broadcast_notification & admin_moderate_community_creation
--          migration dosyalarında hâlâ var olmayan 'type' kolonuna yazıyordu
--          (canlı DB type_key ile düzeltilmiş; taze reset tutarlılığı için).
-- Not: MATCH-COL-003 / NOTIF-TYPE-001/002 canlı DB'ye karşı YANLIŞ POZİTİF çıktı.
-- ==============================================================================

-- ── CRITICAL: cancel_app_booking — %90 iadeyi REFUND_CREDIT olarak gerçekten yaz ──
CREATE OR REPLACE FUNCTION public.cancel_app_booking(p_booking_id uuid, p_reason text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  b RECORD;
  v_start timestamp;
  v_now_tr timestamp := (now() AT TIME ZONE 'Europe/Istanbul');
  v_refund numeric := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED: Giris gerekli.'; END IF;

  SELECT * INTO b FROM public.pitch_bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Rezervasyon bulunamadi.'; END IF;
  IF b.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Bu rezervasyon size ait degil.';
  END IF;
  IF b.source NOT IN ('APP_BOOKING', 'APP_MATCH') THEN
    RAISE EXCEPTION 'INVALID_SOURCE: Bu rezervasyon uygulamadan iptal edilemez.';
  END IF;
  IF b.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'ALREADY_CANCELLED: Rezervasyon zaten iptal edilmis.';
  END IF;

  v_start := (b.booking_date + b.start_time)::timestamp;
  IF v_start <= v_now_tr THEN
    RAISE EXCEPTION 'ALREADY_STARTED: Gecmis veya baslamis rezervasyon iptal edilemez.';
  END IF;
  IF v_start - v_now_tr < interval '48 hours' THEN
    RAISE EXCEPTION 'CANCEL_WINDOW_CLOSED: Rezervasyon saatine 48 saatten az kaldigi icin uygulamadan iptal edilemez. Lutfen tesisle iletisime gecin.';
  END IF;

  -- %90 iade kurali
  v_refund := round(COALESCE(b.paid_amount, 0) * 0.90, 2);

  UPDATE public.pitch_bookings SET
    status = 'CANCELLED',
    cancelled_at = now(),
    cancelled_by = auth.uid(),
    cancellation_reason = COALESCE(p_reason, 'Oyuncu iptali (48 saat kurali icinde)'),
    payment_status = CASE WHEN COALESCE(paid_amount, 0) > 0 THEN 'REFUNDED' ELSE payment_status END
  WHERE id = p_booking_id;

  -- DÜZELTME (CRITICAL): ödenen tutarın %90'ını REFUND_CREDIT (OYNA kredisi) olarak
  -- cüzdana GERÇEKTEN yaz; idempotent (aynı booking için tekrar yazma).
  IF COALESCE(b.paid_amount, 0) > 0 AND v_refund > 0
     AND NOT EXISTS (
       SELECT 1 FROM public.wallet_transactions
       WHERE user_id = b.user_id AND reference_type = 'BOOKING' AND reference_id = p_booking_id
         AND balance_type = 'REFUND_CREDIT'
     ) THEN
    INSERT INTO public.wallet_transactions
      (user_id, amount, type, balance_type, status, reference_type, reference_id, description)
    VALUES (b.user_id, v_refund, 'DEPOSIT', 'REFUND_CREDIT', 'COMPLETED', 'BOOKING', p_booking_id,
            'Rezervasyon iptali — %90 OYNA kredisi');
  END IF;

  RETURN jsonb_build_object(
    'booking_id', p_booking_id,
    'refund_percent', 90,
    'refund_amount', v_refund,
    'paid_amount', COALESCE(b.paid_amount, 0)
  );
END;
$function$;

-- ── HIGH: pay_public_match_deposit — çift ödeme koruması ──────────────────────
CREATE OR REPLACE FUNCTION public.pay_public_match_deposit(p_match_id uuid, p_user_id uuid, p_amount numeric)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_slots JSONB;
    v_away_slots JSONB;
    v_slot JSONB;
    v_updated_slots JSONB := '[]'::jsonb;
    v_updated_away_slots JSONB := '[]'::jsonb;
    v_found BOOLEAN := FALSE;
    v_payment_success BOOLEAN;
BEGIN
    -- DÜZELTME (HIGH): iadesiz MATCH_FEE zaten varsa tekrar tahsil etme (çift-tıklama/retry)
    IF EXISTS (
        SELECT 1 FROM public.wallet_transactions
        WHERE user_id = p_user_id AND match_id = p_match_id AND type = 'MATCH_FEE'
    ) AND NOT EXISTS (
        SELECT 1 FROM public.wallet_transactions
        WHERE user_id = p_user_id AND match_id = p_match_id AND type IN ('MATCH_REFUND','REFUND')
    ) THEN
        RAISE EXCEPTION 'ALREADY_PAID: Bu maç için kapora zaten ödenmiş.';
    END IF;

    SELECT process_match_payment(p_user_id, p_match_id, p_amount) INTO v_payment_success;
    IF NOT v_payment_success THEN
        RAISE EXCEPTION 'Ödeme işlemi başarısız!';
    END IF;

    SELECT slots, "awaySlots" INTO v_slots, v_away_slots FROM public.matches WHERE id = p_match_id FOR UPDATE;

    FOR v_slot IN SELECT jsonb_array_elements(v_slots) LOOP
        IF (v_slot->'player'->>'id')::UUID = p_user_id THEN
            v_slot := jsonb_set(v_slot, '{player,paymentStatus}', '"PAID"'::jsonb);
            v_found := TRUE;
        END IF;
        v_updated_slots := v_updated_slots || jsonb_build_array(v_slot);
    END LOOP;

    IF NOT v_found THEN
        FOR v_slot IN SELECT jsonb_array_elements(COALESCE(v_away_slots, '[]'::jsonb)) LOOP
            IF (v_slot->'player'->>'id')::UUID = p_user_id THEN
                v_slot := jsonb_set(v_slot, '{player,paymentStatus}', '"PAID"'::jsonb);
                v_found := TRUE;
            END IF;
            v_updated_away_slots := v_updated_away_slots || jsonb_build_array(v_slot);
        END LOOP;
    ELSE
        v_updated_away_slots := COALESCE(v_away_slots, '[]'::jsonb);
    END IF;

    IF NOT v_found THEN
        RAISE EXCEPTION 'Kullanıcı bu maçta kadroda bulunamadı!';
    END IF;

    UPDATE public.matches
    SET slots = v_updated_slots, "awaySlots" = v_updated_away_slots
    WHERE id = p_match_id;
END;
$function$;

-- ── HIGH: leave_public_match_slot — ayrılan PAID oyuncuya kapora iadesi ───────
CREATE OR REPLACE FUNCTION public.leave_public_match_slot(p_match_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
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
    v_paid numeric;
    v_already numeric;
BEGIN
    IF auth.uid() IS DISTINCT FROM p_user_id AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Başka bir kullanıcıyı maçtan çıkaramazsınız.';
    END IF;

    SELECT slots, "awaySlots", "creatorId", "reservePlayers"
    INTO v_slots, v_away_slots, v_creator_id, v_reserve_players
    FROM public.matches WHERE id = p_match_id FOR UPDATE;

    IF v_slots IS NULL THEN RAISE EXCEPTION 'Maç bulunamadı!'; END IF;

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
                    'id', v_promoted_player->>'id', 'name', v_promoted_player->>'name',
                    'avatar', v_promoted_player->>'avatar', 'rating', (v_promoted_player->>'rating')::numeric,
                    'position', COALESCE(v_slot->>'role', 'OYUNCU'),
                    'x', (v_slot->>'x')::numeric, 'y', (v_slot->>'y')::numeric, 'paymentStatus', 'UNPAID'));
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
                        'id', v_promoted_player->>'id', 'name', v_promoted_player->>'name',
                        'avatar', v_promoted_player->>'avatar', 'rating', (v_promoted_player->>'rating')::numeric,
                        'position', COALESCE(v_slot->>'role', 'OYUNCU'),
                        'x', (v_slot->>'x')::numeric, 'y', (v_slot->>'y')::numeric, 'paymentStatus', 'UNPAID'));
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
            RETURN;  -- yedekler kapora ödemez; iade gerekmez
        END IF;
    END IF;

    IF NOT v_found THEN RAISE EXCEPTION 'Kullanıcı maça kayıtlı değil!'; END IF;

    -- DÜZELTME (HIGH): kadrodan (home/away) ayrılan oyuncu kapora ödediyse İADE et (idempotent)
    SELECT COALESCE(SUM(-amount), 0) INTO v_paid FROM public.wallet_transactions
     WHERE user_id = p_user_id AND match_id = p_match_id AND type = 'MATCH_FEE';
    SELECT COALESCE(SUM(amount), 0) INTO v_already FROM public.wallet_transactions
     WHERE user_id = p_user_id AND match_id = p_match_id AND type IN ('MATCH_REFUND','REFUND');
    IF v_paid > 0 AND v_already = 0 THEN
        UPDATE public.profiles SET wallet_balance = COALESCE(wallet_balance, 0) + v_paid WHERE id = p_user_id;
        INSERT INTO public.wallet_transactions (user_id, match_id, amount, type, description)
        VALUES (p_user_id, p_match_id, v_paid, 'MATCH_REFUND', 'Maçtan ayrılma — kapora iadesi');
    END IF;

    IF v_creator_id = p_user_id THEN
        DECLARE v_new_creator_id UUID := NULL;
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
                VALUES (v_new_creator_id, '👑 Yeni Kaptan Sensin!',
                    'Eski kaptan ayrıldığı için yüksek güvenilirlik skorunla bu maçın yeni kaptanı seçildin.',
                    'SYSTEM');
            END IF;
        END;
    END IF;

    UPDATE public.matches
    SET slots = v_updated_slots, "awaySlots" = v_updated_away_slots, "reservePlayers" = v_remaining_reserves
    WHERE id = p_match_id;
END;
$function$;

-- ── MEDIUM: player_update_match — visibility/pitch_id güncelle + PRIVATE'a geçişte kod üret ──
CREATE OR REPLACE FUNCTION public.player_update_match(p_match_id uuid, p_payload jsonb)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_is_banned boolean;
  v_is_participant boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT is_banned INTO v_is_banned FROM public.profiles WHERE id = v_uid;
  IF v_is_banned THEN RAISE EXCEPTION 'Kullanıcı banlı!'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.matches m
    WHERE m.id = p_match_id
    AND (
      m."creatorId" = v_uid
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(m.slots, '[]'::jsonb)) s WHERE (s->'player'->>'id')::uuid = v_uid)
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(m."awaySlots", '[]'::jsonb)) s WHERE (s->'player'->>'id')::uuid = v_uid)
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(m."reservePlayers", '[]'::jsonb)) s WHERE (s->>'id')::uuid = v_uid)
    )
  ) INTO v_is_participant;

  IF NOT v_is_participant AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  UPDATE public.matches SET
    slots = CASE WHEN p_payload ? 'slots' THEN p_payload->'slots' ELSE slots END,
    "awaySlots" = CASE WHEN p_payload ? 'awaySlots' THEN p_payload->'awaySlots' ELSE "awaySlots" END,
    "reservePlayers" = CASE WHEN p_payload ? 'reservePlayers' THEN p_payload->'reservePlayers' ELSE "reservePlayers" END,
    "chatMessages" = CASE WHEN p_payload ? 'chatMessages' THEN p_payload->'chatMessages' ELSE "chatMessages" END,
    "homeTeamId" = CASE WHEN p_payload ? 'homeTeamId' THEN NULLIF(p_payload->>'homeTeamId', '')::uuid ELSE "homeTeamId" END,
    "awayTeamId" = CASE WHEN p_payload ? 'awayTeamId' THEN NULLIF(p_payload->>'awayTeamId', '')::uuid ELSE "awayTeamId" END,
    status = CASE
      WHEN p_payload ? 'status'
           AND status IN ('DRAFT','ACTIVE')
           AND (p_payload->>'status') IN ('DRAFT','ACTIVE','CANCELLED')
      THEN p_payload->>'status'
      ELSE status END,
    -- FAZ 3: görünürlük + saha güncellenebilir; PRIVATE'a geçişte kod üret
    visibility = CASE WHEN p_payload ? 'visibility' AND (p_payload->>'visibility') IN ('OPEN','PRIVATE')
                      THEN p_payload->>'visibility' ELSE visibility END,
    pitch_id = CASE WHEN p_payload ? 'pitch_id' THEN NULLIF(p_payload->>'pitch_id','')::uuid ELSE pitch_id END,
    private_code = CASE
      WHEN COALESCE(NULLIF(p_payload->>'visibility',''), visibility) = 'PRIVATE' AND private_code IS NULL
      THEN upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
      ELSE private_code END,
    format = CASE WHEN p_payload ? 'format' THEN p_payload->>'format' ELSE format END,
    duration = CASE WHEN p_payload ? 'duration' THEN p_payload->>'duration' ELSE duration END,
    gender = CASE WHEN p_payload ? 'gender' THEN p_payload->>'gender' ELSE gender END,
    "ageGroup" = CASE WHEN p_payload ? 'ageGroup' THEN p_payload->>'ageGroup' ELSE "ageGroup" END,
    "homeScore" = CASE WHEN p_payload ? 'homeScore' THEN (p_payload->>'homeScore')::int ELSE "homeScore" END,
    "awayScore" = CASE WHEN p_payload ? 'awayScore' THEN (p_payload->>'awayScore')::int ELSE "awayScore" END,
    "scoreEnteredAt" = CASE WHEN p_payload ? 'scoreEnteredAt' THEN (p_payload->>'scoreEnteredAt')::timestamptz ELSE "scoreEnteredAt" END
  WHERE id = p_match_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Maç bulunamadı'; END IF;
  RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.player_update_match(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.player_update_match(uuid, jsonb) TO authenticated;

-- ── REPO-FIX: admin_broadcast_notification (migration dosyası 'type' yazıyordu) ──
CREATE OR REPLACE FUNCTION public.admin_broadcast_notification(p_title text, p_body text, p_segment text DEFAULT 'ALL'::text, p_type text DEFAULT 'ADMIN_BROADCAST'::text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_count int := 0;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  INSERT INTO notifications (user_id, title, body, type_key)
  SELECT p.id, p_title, p_body, p_type FROM profiles p
  WHERE CASE p_segment
          WHEN 'ALL' THEN true
          WHEN 'PRO' THEN p.is_pro = true
          WHEN 'CAPTAIN' THEN p.role = 'CAPTAIN' OR COALESCE(p.roles, '[]'::jsonb) ? 'CAPTAIN'
          WHEN 'OWNER' THEN p.role = 'OWNER' OR COALESCE(p.roles, '[]'::jsonb) ? 'OWNER'
          WHEN 'NEW_USERS' THEN p.created_at >= NOW() - INTERVAL '30 days'
          ELSE true END;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM log_admin_action('BROADCAST', 'system', NULL, p_segment, NULL, jsonb_build_object('title', p_title, 'recipients', v_count));
  RETURN v_count;
END; $function$;

-- ── REPO-FIX: admin_moderate_community_creation (migration dosyası 'type' yazıyordu) ──
CREATE OR REPLACE FUNCTION public.admin_moderate_community_creation(p_request_id uuid, p_approved boolean, p_notes text DEFAULT NULL::text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_req community_creation_requests%ROWTYPE; v_community_id uuid;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT * INTO v_req FROM community_creation_requests WHERE id = p_request_id;
  IF v_req.id IS NULL THEN RAISE EXCEPTION 'Talep bulunamadı'; END IF;
  UPDATE community_creation_requests SET status = CASE WHEN p_approved THEN 'APPROVED' ELSE 'REJECTED' END,
    reviewed_by = auth.uid(), reviewed_at = NOW(),
    rejection_reason = CASE WHEN p_approved THEN NULL ELSE p_notes END, admin_notes = p_notes
  WHERE id = p_request_id;
  IF p_approved THEN
    INSERT INTO communities (name, type, description, location, owner_id, is_verified)
    VALUES (v_req.name, v_req.type, v_req.description, v_req.location, v_req.requester_id, true) RETURNING id INTO v_community_id;
    INSERT INTO community_members (community_id, user_id, role) VALUES (v_community_id, v_req.requester_id, 'ADMIN');
    INSERT INTO notifications (user_id, title, body, type_key)
    VALUES (v_req.requester_id, 'Topluluğun Onaylandı!', v_req.name || ' topluluğun oluşturuldu.', 'COMMUNITY_APPROVED');
  ELSE
    INSERT INTO notifications (user_id, title, body, type_key)
    VALUES (v_req.requester_id, 'Topluluk Talebi Reddedildi', COALESCE(p_notes, 'Talep onaylanamadı.'), 'COMMUNITY_REJECTED');
  END IF;
  PERFORM log_admin_action(CASE WHEN p_approved THEN 'COMMUNITY_APPROVE' ELSE 'COMMUNITY_REJECT' END, 'community', p_request_id, v_req.name, NULL, jsonb_build_object('approved', p_approved, 'notes', p_notes));
  RETURN true;
END; $function$;
