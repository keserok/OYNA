-- [DB GEÇMİŞİNDEN KURTARILDI 2026-07-11] Bu migration canlı veritabanına uygulanmıştı ancak repoda dosyası yoktu; supabase_migrations.schema_migrations.statements kolonundan geri çıkarıldı.

-- CÜZDAN V2 (3/3) — Birleşik ödeme akışı: bakiye (+kart) ile ödeme
-- (repo: 20260717000003_unified_payment_flows.sql)

-- ─── 1) process_match_payment — kova sisteminden harca (ayna senkron) ────────
CREATE OR REPLACE FUNCTION public.process_match_payment(p_user_id uuid, p_match_id uuid, p_amount numeric)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Başka bir kullanıcının cüzdanından ödeme yapamazsınız.';
  END IF;
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'GECERSIZ_TUTAR: Ödeme tutarı pozitif olmalıdır.';
  END IF;

  PERFORM public.wallet_spend_balance(
    p_user_id, p_amount, 'MATCH', p_match_id, p_match_id, 'Maç katılım ücreti');

  INSERT INTO public.wallet_transactions (user_id, match_id, amount, type, status, description)
  VALUES (p_user_id, p_match_id, -p_amount, 'MATCH_FEE', 'COMPLETED', 'Maç katılım ücreti');

  RETURN TRUE;
END;
$function$;

-- ─── 2) process_match_refund — iade REFUND_CREDIT kovasına ──────────────────
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
  WHERE user_id = p_user_id AND match_id = p_match_id AND type IN ('MATCH_REFUND','REFUND');
  IF v_refunded > 0 THEN
    RAISE EXCEPTION 'ZATEN_IADE: Bu maç için zaten iade yapılmış.';
  END IF;

  IF p_amount <> v_paid THEN
    RAISE EXCEPTION 'TUTAR_UYUSMUYOR: İade tutarı % ödenen tutarla % eşleşmiyor.', p_amount, v_paid;
  END IF;

  INSERT INTO public.wallet_transactions
    (user_id, match_id, amount, type, balance_type, status, reference_type, description)
  VALUES
    (p_user_id, p_match_id, p_amount, 'REFUND', 'REFUND_CREDIT', 'COMPLETED',
     'REFUND', 'Maç iptali / Ayrılma iadesi — OYNA iade kredisi');

  PERFORM public._sync_wallet_mirror(p_user_id);
  RETURN TRUE;
END;
$function$;

-- ─── 3) leave_public_match_slot — ayrılma iadesi REFUND_CREDIT kovasına ─────
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

    SELECT COALESCE(SUM(-amount), 0) INTO v_paid FROM public.wallet_transactions
     WHERE user_id = p_user_id AND match_id = p_match_id AND type = 'MATCH_FEE';
    SELECT COALESCE(SUM(amount), 0) INTO v_already FROM public.wallet_transactions
     WHERE user_id = p_user_id AND match_id = p_match_id AND type IN ('MATCH_REFUND','REFUND');
    IF v_paid > 0 AND v_already = 0 THEN
        INSERT INTO public.wallet_transactions
          (user_id, match_id, amount, type, balance_type, status, reference_type, description)
        VALUES
          (p_user_id, p_match_id, v_paid, 'MATCH_REFUND', 'REFUND_CREDIT', 'COMPLETED',
           'REFUND', 'Maçtan ayrılma — kapora iadesi (OYNA iade kredisi)');
        PERFORM public._sync_wallet_mirror(p_user_id);
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

-- ─── 4) process_match_at_deadline — iptal iadesi REFUND_CREDIT kovasına ─────
CREATE OR REPLACE FUNCTION public.process_match_at_deadline(p_match_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
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

  v_quorum := COALESCE(public.get_config_number('match_min_player_pct', 70), 70) / 100.0;
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

    FOR v_fee IN
      SELECT wt.user_id, ABS(wt.amount) AS amt
      FROM public.wallet_transactions wt
      WHERE wt.match_id = p_match_id AND wt.type = 'MATCH_FEE'
        AND NOT EXISTS (
          SELECT 1 FROM public.wallet_transactions r
          WHERE r.match_id = p_match_id AND r.user_id = wt.user_id AND r.type = 'MATCH_REFUND'
        )
    LOOP
      INSERT INTO public.wallet_transactions
        (user_id, match_id, amount, type, balance_type, status, reference_type, description)
      VALUES
        (v_fee.user_id, p_match_id, v_fee.amt, 'MATCH_REFUND', 'REFUND_CREDIT', 'COMPLETED',
         'REFUND', 'Maç iptal — kapora iadesi (OYNA iade kredisi)');
      PERFORM public._sync_wallet_mirror(v_fee.user_id);
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
$function$;

-- ─── 5) player_buy_slots_v2 — bakiye + kart bölüşümlü slot satın alma ────────
CREATE OR REPLACE FUNCTION public.player_buy_slots_v2(
  p_match_id    uuid,
  p_slot_ids    text[],
  p_use_balance boolean DEFAULT true,
  p_card_id     uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_slots jsonb; v_price numeric; v_count int := 0; v_total numeric;
  v_player jsonb; v_sid text; v_slot jsonb;
  v_b RECORD;
  v_balance_applied numeric := 0;
  v_card_part numeric := 0;
  v_provider text;
  v_card public.user_saved_cards;
  v_comm jsonb;
  v_intent public.payment_intents;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT slots, price INTO v_slots, v_price FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF v_slots IS NULL THEN RAISE EXCEPTION 'NOT_FOUND: Maç bulunamadı'; END IF;

  FOREACH v_sid IN ARRAY p_slot_ids LOOP
    SELECT s INTO v_slot FROM jsonb_array_elements(v_slots) s WHERE s->>'id' = v_sid;
    IF v_slot IS NULL THEN RAISE EXCEPTION 'SLOT_NOT_FOUND: %', v_sid; END IF;
    IF COALESCE(v_slot->>'status','OPEN') <> 'OPEN' THEN RAISE EXCEPTION 'SLOT_TAKEN: % dolu', v_sid; END IF;
    v_count := v_count + 1;
  END LOOP;
  IF v_count = 0 THEN RAISE EXCEPTION 'NO_SLOTS: En az bir slot seç'; END IF;

  v_total := round(COALESCE(v_price, 0) * v_count, 2);

  IF v_total > 0 THEN
    IF p_use_balance THEN
      SELECT * INTO v_b FROM public._wallet_bucket_balances(v_uid);
      v_balance_applied := LEAST(v_b.topup_balance + v_b.refund_credit_balance, v_total);
    END IF;
    v_card_part := v_total - v_balance_applied;

    IF v_card_part > 0 THEN
      v_provider := COALESCE(public.get_config_text('payment_provider', NULL), 'SIMULATION');
      IF v_provider <> 'SIMULATION' THEN
        RAISE EXCEPTION 'PROVIDER_FLOW_REQUIRED: Canlı modda kart ödemesi ödeme sağlayıcısı üzerinden yapılır.';
      END IF;
      IF p_card_id IS NOT NULL THEN
        SELECT * INTO v_card FROM public.user_saved_cards WHERE id = p_card_id AND user_id = v_uid;
        IF NOT FOUND THEN RAISE EXCEPTION 'CARD_NOT_FOUND: Kart bulunamadı.'; END IF;
      END IF;

      v_comm := public.calculate_commission(v_card_part, 'GLOBAL');
      INSERT INTO public.payment_intents (
        user_id, match_id, amount, currency, status, provider,
        commission_amount, owner_amount, service_provider_amount,
        commission_model, related_entity_type, paid_at, raw
      ) VALUES (
        v_uid, p_match_id, v_card_part, 'TRY', 'PAID', v_provider,
        (v_comm->>'commission_amt')::numeric, (v_comm->>'net_amount')::numeric, 0,
        v_comm->>'model', 'MATCH', now(),
        jsonb_build_object('simulated', true, 'card_last4', v_card.last4,
                           'balance_applied', v_balance_applied)
      ) RETURNING * INTO v_intent;
    END IF;

    IF v_balance_applied > 0 THEN
      PERFORM public.wallet_spend_balance(
        v_uid, v_balance_applied, 'MATCH', p_match_id, p_match_id,
        'Maça katılım — cüzdan bakiyesi');
    END IF;

    INSERT INTO public.wallet_transactions (user_id, match_id, amount, type, status, description, meta)
    VALUES (v_uid, p_match_id, -v_total, 'MATCH_FEE', 'COMPLETED', 'Maç katılım ücreti',
            jsonb_build_object('balance_applied', v_balance_applied, 'card_amount', v_card_part));
  END IF;

  SELECT jsonb_build_object(
    'id', id, 'name', COALESCE(name, full_name, 'Oyuncu'),
    'avatar', COALESCE(avatar_url,''), 'rating', COALESCE(rating, 4.5), 'position', ''
  ) INTO v_player FROM public.profiles WHERE id = v_uid;

  FOREACH v_sid IN ARRAY p_slot_ids LOOP
    v_slots := (SELECT jsonb_agg(CASE WHEN s->>'id' = v_sid
        THEN s || jsonb_build_object('status','TAKEN','player',v_player,
             'purchasedBy', v_uid::text, 'occupant', v_uid::text, 'assignmentStatus','SELF')
        ELSE s END) FROM jsonb_array_elements(v_slots) s);
  END LOOP;
  UPDATE public.matches SET slots = v_slots WHERE id = p_match_id;

  RETURN jsonb_build_object(
    'ok', true, 'count', v_count, 'total', v_total,
    'balance_applied', v_balance_applied, 'card_amount', v_card_part,
    'intent_id', v_intent.id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.player_buy_slots_v2(uuid, text[], boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.player_buy_slots_v2(uuid, text[], boolean, uuid) TO authenticated;

-- ─── 6) record_app_deposit_payment — bakiye + kart bölüşümü desteği ─────────
DROP FUNCTION IF EXISTS public.record_app_deposit_payment(uuid, numeric);

CREATE OR REPLACE FUNCTION public.record_app_deposit_payment(
  p_booking_id  uuid,
  p_amount      numeric,
  p_use_balance boolean DEFAULT false,
  p_card_id     uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_b public.pitch_bookings%ROWTYPE;
  v_new_paid numeric;
  v_buckets RECORD;
  v_balance_applied numeric := 0;
  v_card_part numeric := 0;
  v_provider text;
  v_card public.user_saved_cards;
  v_comm jsonb;
  v_intent public.payment_intents;
  v_note text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Giriş gerekli.';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;

  SELECT * INTO v_b FROM pitch_bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOOKING_NOT_FOUND';
  END IF;
  IF v_b.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Bu rezervasyon size ait değil.';
  END IF;
  IF v_b.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'BOOKING_CANCELLED';
  END IF;
  IF COALESCE(v_b.paid_amount, 0) + p_amount > COALESCE(v_b.price, 0) THEN
    RAISE EXCEPTION 'AMOUNT_EXCEEDS_PRICE';
  END IF;

  IF p_use_balance THEN
    SELECT * INTO v_buckets FROM public._wallet_bucket_balances(v_b.user_id);
    v_balance_applied := LEAST(v_buckets.topup_balance + v_buckets.refund_credit_balance, p_amount);
  END IF;
  v_card_part := p_amount - v_balance_applied;

  IF v_card_part > 0 THEN
    v_provider := COALESCE(public.get_config_text('payment_provider', NULL), 'SIMULATION');
    IF v_provider <> 'SIMULATION' THEN
      RAISE EXCEPTION 'PROVIDER_FLOW_REQUIRED: Canlı modda kart ödemesi ödeme sağlayıcısı üzerinden yapılır.';
    END IF;
    IF p_card_id IS NOT NULL THEN
      SELECT * INTO v_card FROM public.user_saved_cards WHERE id = p_card_id AND user_id = v_b.user_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'CARD_NOT_FOUND: Kart bulunamadı.'; END IF;
    END IF;

    v_comm := public.calculate_commission(v_card_part, 'PITCH', v_b.pitch_id);
    INSERT INTO public.payment_intents (
      user_id, booking_id, pitch_id, amount, currency, status, provider,
      commission_amount, owner_amount, service_provider_amount,
      commission_model, related_entity_type, paid_at, raw
    ) VALUES (
      v_b.user_id, p_booking_id, v_b.pitch_id, v_card_part, 'TRY', 'PAID', v_provider,
      (v_comm->>'commission_amt')::numeric, (v_comm->>'net_amount')::numeric, 0,
      v_comm->>'model', 'BOOKING', now(),
      jsonb_build_object('simulated', true, 'card_last4', v_card.last4,
                         'balance_applied', v_balance_applied)
    ) RETURNING * INTO v_intent;
  END IF;

  IF v_balance_applied > 0 THEN
    PERFORM public.wallet_spend_balance(
      v_b.user_id, v_balance_applied, 'BOOKING', p_booking_id, NULL,
      'Saha kaporası — cüzdan bakiyesi');
  END IF;

  v_note := CASE
    WHEN v_balance_applied > 0 AND v_card_part > 0
      THEN format('Uygulama içi kapora ödemesi (%s₺ bakiye + %s₺ kart)', v_balance_applied, v_card_part)
    WHEN v_balance_applied > 0
      THEN 'Uygulama içi kapora ödemesi (tamamı cüzdan bakiyesinden)'
    ELSE 'Uygulama içi kapora ödemesi'
  END;

  INSERT INTO booking_payments (booking_id, amount, payment_method, note, recorded_by)
  VALUES (p_booking_id, p_amount, 'CARD', v_note, auth.uid());

  v_new_paid := COALESCE(v_b.paid_amount, 0) + p_amount;
  UPDATE pitch_bookings SET
    paid_amount = v_new_paid,
    payment_status = CASE WHEN v_new_paid >= COALESCE(price, 0) THEN 'PAID' ELSE 'PARTIAL' END
  WHERE id = p_booking_id;

  RETURN jsonb_build_object(
    'ok', true, 'amount', p_amount,
    'balance_applied', v_balance_applied, 'card_amount', v_card_part,
    'intent_id', v_intent.id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_app_deposit_payment(uuid, numeric, boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_app_deposit_payment(uuid, numeric, boolean, uuid) TO authenticated;
