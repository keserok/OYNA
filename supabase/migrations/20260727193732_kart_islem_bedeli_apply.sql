-- ÜRETİMDEN GERİ ÇEKİLDİ (defter sapması onarımı, 2026-07-28)
-- Kart işlem bedeli: apply_card_payment yüklemeye net tutarı yazar, bedeli ayırır
CREATE OR REPLACE FUNCTION public.apply_card_payment(p_intent_id uuid, p_provider_ref text DEFAULT NULL, p_raw jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_i public.payment_intents;
  v_flow text;
  v_full numeric; v_bal numeric; v_base numeric; v_fee numeric;
  v_b public.pitch_bookings%ROWTYPE;
  v_new_paid numeric; v_note text;
  v_slots jsonb; v_sid text; v_slot jsonb; v_player jsonb; v_taken boolean := false;
  v_slot_ids text[];
BEGIN
  SELECT * INTO v_i FROM public.payment_intents WHERE id = p_intent_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_i.status = 'PAID' THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'intent_id', p_intent_id);
  END IF;
  IF v_i.status <> 'PENDING' THEN
    RAISE EXCEPTION 'INVALID_STATE: PENDING bekleniyor, mevcut %', v_i.status;
  END IF;

  v_flow := v_i.raw->>'flow';
  v_full := COALESCE((v_i.raw->>'full_amount')::numeric, v_i.amount);
  v_bal  := COALESCE((v_i.raw->>'balance_applied')::numeric, 0);
  v_fee  := COALESCE(v_i.card_fee_amount, 0);
  v_base := COALESCE((v_i.raw->>'card_base')::numeric, round(v_i.amount - v_fee, 2));

  UPDATE public.payment_intents
  SET status = 'PAID', paid_at = now(),
      provider_ref = COALESCE(p_provider_ref, provider_ref),
      raw = COALESCE(raw, '{}'::jsonb) || COALESCE(p_raw, '{}'::jsonb)
  WHERE id = p_intent_id;

  IF v_flow = 'BOOKING_DEPOSIT' THEN
    SELECT * INTO v_b FROM public.pitch_bookings WHERE id = v_i.booking_id FOR UPDATE;
    IF NOT FOUND OR v_b.status = 'CANCELLED'
       OR COALESCE(v_b.paid_amount, 0) + v_full > COALESCE(v_b.price, 0) THEN
      INSERT INTO public.wallet_transactions
        (user_id, amount, type, balance_type, status, reference_type, reference_id, description)
      VALUES (v_i.user_id, v_i.amount, 'DEPOSIT', 'REFUND_CREDIT', 'COMPLETED',
              'PAYMENT_INTENT', p_intent_id, 'Rezervasyon kapandı — kart tutarı iade kredisine aktarıldı');
      PERFORM public._sync_wallet_mirror(v_i.user_id);
      UPDATE public.payment_intents
      SET raw = COALESCE(raw, '{}'::jsonb) || jsonb_build_object('result_reason', 'BOOKING_CLOSED_REFUNDED')
      WHERE id = p_intent_id;
      RETURN jsonb_build_object('ok', false, 'reason', 'BOOKING_CLOSED_REFUNDED', 'refunded', v_i.amount);
    END IF;

    IF v_bal > 0 THEN
      PERFORM public.wallet_spend_balance(v_i.user_id, v_bal, 'BOOKING', v_i.booking_id, NULL,
        'Saha kaporası — cüzdan bakiyesi');
    END IF;

    v_note := CASE WHEN v_bal > 0
      THEN format('Uygulama içi kapora ödemesi (%s₺ bakiye + %s₺ kart)', v_bal, v_base)
      ELSE 'Uygulama içi kapora ödemesi' END;
    IF v_fee > 0 THEN v_note := v_note || format(' · %s₺ kart işlem bedeli', v_fee); END IF;
    INSERT INTO public.booking_payments (booking_id, amount, payment_method, note, recorded_by)
    VALUES (v_i.booking_id, v_full, 'CARD', v_note, v_i.user_id);

    v_new_paid := COALESCE(v_b.paid_amount, 0) + v_full;
    UPDATE public.pitch_bookings SET
      paid_amount = v_new_paid,
      payment_status = CASE WHEN v_new_paid >= COALESCE(price, 0) THEN 'PAID' ELSE 'PARTIAL' END
    WHERE id = v_i.booking_id;

    RETURN jsonb_build_object('ok', true, 'flow', v_flow, 'amount', v_full,
      'balance_applied', v_bal, 'card_amount', v_i.amount, 'card_fee', v_fee);

  ELSIF v_flow = 'TOP_UP' THEN
    INSERT INTO public.wallet_transactions
      (user_id, amount, type, balance_type, status, reference_type, reference_id, description)
    VALUES (v_i.user_id, v_base, 'TOP_UP', 'TOP_UP', 'COMPLETED',
            'PAYMENT_INTENT', p_intent_id,
            CASE WHEN v_fee > 0
              THEN format('Cüzdana para yükleme (%s₺ kart işlem bedeli hariç)', v_fee)
              ELSE 'Cüzdana para yükleme' END);
    PERFORM public._sync_wallet_mirror(v_i.user_id);
    RETURN jsonb_build_object('ok', true, 'flow', v_flow, 'amount', v_base,
      'card_amount', v_i.amount, 'card_fee', v_fee);

  ELSIF v_flow = 'MATCH_JOIN' THEN
    SELECT array_agg(e) INTO v_slot_ids FROM jsonb_array_elements_text(COALESCE(v_i.raw->'slot_ids','[]'::jsonb)) e;
    SELECT slots INTO v_slots FROM public.matches WHERE id = v_i.match_id FOR UPDATE;

    IF v_slots IS NULL THEN v_taken := true;
    ELSE
      FOREACH v_sid IN ARRAY COALESCE(v_slot_ids, ARRAY[]::text[]) LOOP
        SELECT s INTO v_slot FROM jsonb_array_elements(v_slots) s WHERE s->>'id' = v_sid;
        IF v_slot IS NULL OR COALESCE(v_slot->>'status','OPEN') <> 'OPEN' THEN v_taken := true; END IF;
      END LOOP;
    END IF;

    IF v_taken THEN
      INSERT INTO public.wallet_transactions
        (user_id, match_id, amount, type, balance_type, status, reference_type, reference_id, description)
      VALUES (v_i.user_id, v_i.match_id, v_i.amount, 'DEPOSIT', 'REFUND_CREDIT', 'COMPLETED',
              'PAYMENT_INTENT', p_intent_id, 'Yer dolduğu için kart tutarı iade kredisine aktarıldı');
      PERFORM public._sync_wallet_mirror(v_i.user_id);
      UPDATE public.payment_intents
      SET raw = COALESCE(raw, '{}'::jsonb) || jsonb_build_object('result_reason', 'SLOT_TAKEN_REFUNDED')
      WHERE id = p_intent_id;
      RETURN jsonb_build_object('ok', false, 'reason', 'SLOT_TAKEN_REFUNDED', 'refunded', v_i.amount);
    END IF;

    IF v_bal > 0 THEN
      PERFORM public.wallet_spend_balance(v_i.user_id, v_bal, 'MATCH', v_i.match_id, v_i.match_id,
        'Maça katılım — cüzdan bakiyesi');
    END IF;

    INSERT INTO public.wallet_transactions (user_id, match_id, amount, type, status, description, meta)
    VALUES (v_i.user_id, v_i.match_id, -v_full, 'MATCH_FEE', 'COMPLETED', 'Maç katılım ücreti',
            jsonb_build_object('balance_applied', v_bal, 'card_amount', v_base, 'card_fee', v_fee));

    SELECT jsonb_build_object(
      'id', id, 'name', COALESCE(name, full_name, 'Oyuncu'),
      'avatar', COALESCE(avatar_url,''), 'rating', COALESCE(rating, 4.5), 'position', ''
    ) INTO v_player FROM public.profiles WHERE id = v_i.user_id;

    FOREACH v_sid IN ARRAY COALESCE(v_slot_ids, ARRAY[]::text[]) LOOP
      v_slots := (SELECT jsonb_agg(CASE WHEN s->>'id' = v_sid
          THEN s || jsonb_build_object('status','TAKEN','player',v_player,
               'purchasedBy', v_i.user_id::text, 'occupant', v_i.user_id::text, 'assignmentStatus','SELF')
          ELSE s END) FROM jsonb_array_elements(v_slots) s);
    END LOOP;
    UPDATE public.matches SET slots = v_slots WHERE id = v_i.match_id;

    INSERT INTO public.match_participants (match_id, user_id, role, status, is_buyer, bought_slots)
    VALUES (v_i.match_id, v_i.user_id, 'home', 'confirmed', true,
            COALESCE(array_length(v_slot_ids, 1), 0))
    ON CONFLICT (match_id, user_id) DO UPDATE SET
      is_buyer = true,
      bought_slots = public.match_participants.bought_slots + EXCLUDED.bought_slots,
      status = CASE WHEN public.match_participants.status IN ('left','cancelled','removed','declined')
                    THEN 'confirmed' ELSE public.match_participants.status END;

    RETURN jsonb_build_object('ok', true, 'flow', v_flow, 'amount', v_full,
      'balance_applied', v_bal, 'card_amount', v_i.amount, 'card_fee', v_fee);
  END IF;

  RAISE EXCEPTION 'INVALID_FLOW: %', v_flow;
END;
$fn$;
