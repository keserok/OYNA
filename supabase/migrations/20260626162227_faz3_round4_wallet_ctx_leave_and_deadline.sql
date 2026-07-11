-- [DB GEÇMİŞİNDEN KURTARILDI 2026-07-11] Bu migration canlı veritabanına uygulanmıştı ancak repoda dosyası yoktu; supabase_migrations.schema_migrations.statements kolonundan geri çıkarıldı.


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
