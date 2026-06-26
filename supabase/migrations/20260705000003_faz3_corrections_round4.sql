-- ==============================================================================
-- FAZ 3 Düzeltmeleri — Round 4 (entegrasyon testi bulgusu, CRITICAL)
-- protect_profile_sensitive_fields trigger'ı, auth.uid()=normal kullanıcı olduğu
-- HER durumda wallet_balance değişimini engelliyordu. Ama cüzdan tabanlı maç
-- ödemesi (process_match_payment) SECURITY DEFINER fonksiyon içinden çağrılsa da
-- auth.uid() çağıran kullanıcıyı döndürür → trigger ödemeyi BLOKLUYOR. Yani
-- gerçek kullanıcılar için cüzdan tabanlı maç kaporası ödemesi/iadesi TAMAMEN
-- kırıktı (önceki testler auth.uid()=NULL servis bağlamında çalıştığı için
-- bunu maskelemişti).
--
-- Çözüm: transaction-local GUC bayrağı app.wallet_ctx. Yalnız SECURITY DEFINER
-- para fonksiyonları bunu 'on' yapar; PostgREST üzerinden istemci bu GUC'u
-- enjekte edemez (yalnız fonksiyon argümanı geçebilir). Trigger, bayrak 'on'
-- iken wallet_balance değişimine izin verir — doğrudan istemci UPDATE'i hâlâ
-- bloklanır.
-- ==============================================================================

-- ── 1. Trigger: app.wallet_ctx='on' iken wallet_balance değişimine izin ver ──
CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_fields()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_platform_admin() THEN
    IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
      RAISE EXCEPTION 'SECURITY: is_admin alanı doğrudan değiştirilemez.';
    END IF;
    IF NEW.phone_verified IS DISTINCT FROM OLD.phone_verified THEN
      RAISE EXCEPTION 'SECURITY: phone_verified alanı doğrudan değiştirilemez.';
    END IF;
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'SECURITY: role alanı doğrudan değiştirilemez.';
    END IF;
    IF NEW.roles IS DISTINCT FROM OLD.roles THEN
      RAISE EXCEPTION 'SECURITY: roles alanı doğrudan değiştirilemez.';
    END IF;
    -- wallet_balance: yalnız para fonksiyonları (app.wallet_ctx='on') değiştirebilir
    IF NEW.wallet_balance IS DISTINCT FROM OLD.wallet_balance
       AND COALESCE(current_setting('app.wallet_ctx', true), '') <> 'on' THEN
      RAISE EXCEPTION 'SECURITY: wallet_balance doğrudan değiştirilemez.';
    END IF;
    IF NEW.is_banned IS DISTINCT FROM OLD.is_banned THEN
      RAISE EXCEPTION 'SECURITY: is_banned doğrudan değiştirilemez.';
    END IF;
    IF NEW.ban_expires_at IS DISTINCT FROM OLD.ban_expires_at THEN
      RAISE EXCEPTION 'SECURITY: ban_expires_at doğrudan değiştirilemez.';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- ── 2. process_match_payment — cüzdan kesintisi öncesi bayrağı set et ──
CREATE OR REPLACE FUNCTION public.process_match_payment(p_user_id uuid, p_match_id uuid, p_amount numeric)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
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
  PERFORM set_config('app.wallet_ctx', 'on', true);
  UPDATE public.profiles SET wallet_balance = wallet_balance - p_amount, updated_at = NOW() WHERE id = p_user_id;
  INSERT INTO public.wallet_transactions (user_id, match_id, amount, type, description)
  VALUES (p_user_id, p_match_id, -p_amount, 'MATCH_FEE', 'Maç katılım ücreti');
  RETURN TRUE;
END;
$function$;

-- ── 3. process_match_refund — iade öncesi bayrağı set et ──
CREATE OR REPLACE FUNCTION public.process_match_refund(p_user_id uuid, p_match_id uuid, p_amount numeric)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_paid     numeric;
  v_refunded numeric;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Başka bir kullanıcının cüzdanına iade yapamazsınız.';
  END IF;
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'GECERSIZ_TUTAR: İade tutarı pozitif olmalıdır.';
  END IF;

  SELECT COALESCE(SUM(-amount), 0) INTO v_paid
  FROM public.wallet_transactions
  WHERE user_id = p_user_id AND match_id = p_match_id AND type = 'MATCH_FEE';
  IF v_paid <= 0 THEN
    RAISE EXCEPTION 'ODEME_YOK: Bu maç için bu kullanıcıya ait ödeme bulunamadı.';
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_refunded
  FROM public.wallet_transactions
  WHERE user_id = p_user_id AND match_id = p_match_id AND type = 'REFUND';
  IF v_refunded > 0 THEN
    RAISE EXCEPTION 'ZATEN_IADE: Bu maç için zaten iade yapılmış.';
  END IF;

  IF p_amount <> v_paid THEN
    RAISE EXCEPTION 'TUTAR_UYUSMUYOR: İade tutarı % ödenen tutarla % eşleşmiyor.', p_amount, v_paid;
  END IF;

  PERFORM set_config('app.wallet_ctx', 'on', true);
  UPDATE public.profiles SET wallet_balance = wallet_balance + p_amount, updated_at = NOW() WHERE id = p_user_id;
  INSERT INTO public.wallet_transactions (user_id, match_id, amount, type, description)
  VALUES (p_user_id, p_match_id, p_amount, 'REFUND', 'Maç iptali / Ayrılma iadesi');
  RETURN TRUE;
END;
$function$;

-- ── 4. leave_public_match_slot — ayrılma iadesi öncesi bayrağı set et ──
-- (round3 gövdesi + app.wallet_ctx; authenticated kullanıcı çağırır → bayrak şart)
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
            RETURN;
        END IF;
    END IF;

    IF NOT v_found THEN RAISE EXCEPTION 'Kullanıcı maça kayıtlı değil!'; END IF;

    -- Kadrodan ayrılan oyuncu kapora ödediyse İADE et (idempotent)
    SELECT COALESCE(SUM(-amount), 0) INTO v_paid FROM public.wallet_transactions
     WHERE user_id = p_user_id AND match_id = p_match_id AND type = 'MATCH_FEE';
    SELECT COALESCE(SUM(amount), 0) INTO v_already FROM public.wallet_transactions
     WHERE user_id = p_user_id AND match_id = p_match_id AND type IN ('MATCH_REFUND','REFUND');
    IF v_paid > 0 AND v_already = 0 THEN
        PERFORM set_config('app.wallet_ctx', 'on', true);
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

-- ── 5. process_match_at_deadline — iptal dalı cüzdan iadesi öncesi bayrağı set et ──
CREATE OR REPLACE FUNCTION public.process_match_at_deadline(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  m          RECORD;
  v_stats    jsonb;
  v_quorum   numeric;
  v_ratio    numeric;
  v_intent   RECORD;
  v_fee      RECORD;
  v_collected numeric;
  v_comm     jsonb;
  v_captured int := 0;
  v_voided   int := 0;
  v_refunded int := 0;
BEGIN
  SELECT * INTO m FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF m.status IN ('CONFIRMED','CANCELLED','COMPLETED','LIVE') THEN
    RETURN jsonb_build_object('match_id', p_match_id, 'status', m.status, 'idempotent', true);
  END IF;

  SELECT COALESCE(min_quorum_pct, 70) INTO v_quorum FROM public.settings LIMIT 1;
  v_quorum := COALESCE(v_quorum, 70) / 100.0;
  v_stats  := public.match_fill_stats(p_match_id);
  v_ratio  := (v_stats->>'paid_ratio')::numeric;

  IF v_ratio >= v_quorum THEN
    UPDATE public.matches SET status = 'CONFIRMED', confirmed_at = now() WHERE id = p_match_id;

    SELECT COALESCE(SUM(ABS(amount)), 0) INTO v_collected
    FROM public.wallet_transactions WHERE match_id = p_match_id AND type = 'MATCH_FEE';

    IF v_collected > 0 AND m.pitch_id IS NOT NULL THEN
      v_comm := public.calculate_commission(v_collected, 'PITCH', m.pitch_id);
      INSERT INTO public.wallet_transactions
        (user_id, match_id, amount, type, balance_type, status, reference_type, reference_id, description)
      SELECT p.owner_id, p_match_id, (v_comm->>'net_amount')::numeric, 'MATCH_EARNING', 'EARNINGS', 'PENDING',
             'MATCH', p_match_id, 'Maç onaylandı — kapora tahsilatı (2 hafta beklemede)'
      FROM public.pitches p WHERE p.id = m.pitch_id AND p.owner_id IS NOT NULL;
    END IF;

    FOR v_intent IN
      SELECT * FROM public.payment_intents
      WHERE match_id = p_match_id AND status IN ('BLOCKED','PENDING') FOR UPDATE
    LOOP
      UPDATE public.payment_intents SET status = 'CAPTURED', captured_at = now()
      WHERE id = v_intent.id;
      v_captured := v_captured + 1;
    END LOOP;

    RETURN jsonb_build_object('match_id', p_match_id, 'status', 'CONFIRMED',
      'paid_ratio', v_ratio, 'collected', v_collected, 'captured_intents', v_captured);
  ELSE
    UPDATE public.matches SET status = 'CANCELLED', cancel_reason = 'QUORUM_NOT_MET',
      refund_status = 'PROCESSING' WHERE id = p_match_id;

    -- cüzdan iadeleri için bayrak (authenticated çağrı yolunda da güvenli)
    PERFORM set_config('app.wallet_ctx', 'on', true);
    FOR v_fee IN
      SELECT wt.user_id, ABS(wt.amount) AS amt
      FROM public.wallet_transactions wt
      WHERE wt.match_id = p_match_id AND wt.type = 'MATCH_FEE'
        AND NOT EXISTS (
          SELECT 1 FROM public.wallet_transactions r
          WHERE r.match_id = p_match_id AND r.user_id = wt.user_id AND r.type = 'MATCH_REFUND'
        )
    LOOP
      UPDATE public.profiles SET wallet_balance = COALESCE(wallet_balance, 0) + v_fee.amt
      WHERE id = v_fee.user_id;
      INSERT INTO public.wallet_transactions (user_id, match_id, amount, type, description)
      VALUES (v_fee.user_id, p_match_id, v_fee.amt, 'MATCH_REFUND', 'Maç iptal — kapora iadesi');
      v_refunded := v_refunded + 1;
    END LOOP;

    FOR v_intent IN
      SELECT * FROM public.payment_intents
      WHERE match_id = p_match_id AND status IN ('BLOCKED','PENDING') FOR UPDATE
    LOOP
      UPDATE public.payment_intents SET status = 'VOIDED', voided_at = now(),
        void_reason = 'MATCH_QUORUM_NOT_MET' WHERE id = v_intent.id;
      v_voided := v_voided + 1;
    END LOOP;

    UPDATE public.matches SET refund_status = 'DONE' WHERE id = p_match_id;

    RETURN jsonb_build_object('match_id', p_match_id, 'status', 'CANCELLED',
      'paid_ratio', v_ratio, 'refunded', v_refunded, 'voided_intents', v_voided);
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.process_match_at_deadline(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_match_at_deadline(uuid) TO authenticated, service_role;
