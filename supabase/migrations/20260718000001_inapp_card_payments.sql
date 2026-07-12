-- ============================================================================
-- UYGULAMA-İÇİ KART ÖDEMESİ (Uber standardı) — iyzico 3DS API köprüsü
--
-- Akış: FE (OYNA formu) → edge 'pay' → prepare_card_payment (intent PENDING)
--   → iyzico 3DS initialize → banka SMS (uygulama içi) → iyzico-3ds-callback
--   → 3DS auth (tahsilat) → apply_card_payment (para hareketi, idempotent).
--
-- Güvenlik: iki RPC de YALNIZ service_role (edge) tarafından çağrılır.
-- Bakiye kısmı ödeme iyzico'da ONAYLANMADAN harcanmaz (apply anında düşülür).
-- Maça katılımda yer bu arada dolduysa: kart tutarı otomatik İADE KREDİSİNE
-- döner (para kaybolmaz), sonuç SLOT_TAKEN_REFUNDED olarak raporlanır.
-- ============================================================================

-- ─── 1) prepare_card_payment — niyet oluştur (kart kısmı > 0 şart) ──────────
CREATE OR REPLACE FUNCTION public.prepare_card_payment(
  p_user_id     uuid,
  p_flow        text,              -- 'BOOKING_DEPOSIT' | 'TOP_UP' | 'MATCH_JOIN'
  p_amount      numeric DEFAULT NULL,   -- BOOKING/TOP_UP tutarı
  p_booking_id  uuid    DEFAULT NULL,
  p_match_id    uuid    DEFAULT NULL,
  p_slot_ids    text[]  DEFAULT NULL,
  p_use_balance boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_b RECORD;
  v_buckets RECORD;
  v_balance_applied numeric := 0;
  v_card_amount numeric;
  v_total numeric;
  v_comm jsonb;
  v_intent public.payment_intents;
  v_slots jsonb; v_price numeric; v_sid text; v_slot jsonb; v_count int := 0;
  v_min numeric; v_max numeric;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  IF p_flow = 'BOOKING_DEPOSIT' THEN
    IF p_booking_id IS NULL OR p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;
    SELECT * INTO v_b FROM public.pitch_bookings WHERE id = p_booking_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'BOOKING_NOT_FOUND'; END IF;
    IF v_b.user_id IS DISTINCT FROM p_user_id THEN RAISE EXCEPTION 'UNAUTHORIZED: Bu rezervasyon size ait değil.'; END IF;
    IF v_b.status = 'CANCELLED' THEN RAISE EXCEPTION 'BOOKING_CANCELLED'; END IF;
    IF COALESCE(v_b.paid_amount, 0) + p_amount > COALESCE(v_b.price, 0) THEN RAISE EXCEPTION 'AMOUNT_EXCEEDS_PRICE'; END IF;

    IF p_use_balance THEN
      SELECT * INTO v_buckets FROM public._wallet_bucket_balances(p_user_id);
      v_balance_applied := LEAST(v_buckets.topup_balance + v_buckets.refund_credit_balance, p_amount);
    END IF;
    v_card_amount := round(p_amount - v_balance_applied, 2);
    IF v_card_amount <= 0 THEN RAISE EXCEPTION 'NO_CARD_AMOUNT: Kart tutarı yok (bakiye karşılıyor).'; END IF;

    v_comm := public.calculate_commission(v_card_amount, 'PITCH', v_b.pitch_id);
    INSERT INTO public.payment_intents (
      user_id, booking_id, pitch_id, amount, currency, status, provider,
      commission_amount, owner_amount, service_provider_amount,
      commission_model, related_entity_type, raw
    ) VALUES (
      p_user_id, p_booking_id, v_b.pitch_id, v_card_amount, 'TRY', 'PENDING', 'IYZICO',
      (v_comm->>'commission_amt')::numeric, (v_comm->>'net_amount')::numeric, 0,
      v_comm->>'model', 'BOOKING',
      jsonb_build_object('flow', p_flow, 'full_amount', p_amount,
                         'balance_applied', v_balance_applied, 'use_balance', p_use_balance)
    ) RETURNING * INTO v_intent;

  ELSIF p_flow = 'TOP_UP' THEN
    v_min := COALESCE(public.get_config_number('wallet_topup_min', 300), 300);
    v_max := COALESCE(public.get_config_number('wallet_topup_max', 20000), 20000);
    IF p_amount IS NULL OR p_amount < v_min THEN
      RAISE EXCEPTION 'MIN_TOPUP: Minimum yükleme tutarı %₺''dir.', v_min::int;
    END IF;
    IF p_amount > v_max THEN
      RAISE EXCEPTION 'MAX_TOPUP: Tek seferde en fazla %₺ yüklenebilir.', v_max::int;
    END IF;
    v_card_amount := round(p_amount, 2);
    INSERT INTO public.payment_intents (
      user_id, amount, currency, status, provider,
      commission_amount, owner_amount, service_provider_amount,
      commission_model, related_entity_type, raw
    ) VALUES (
      p_user_id, v_card_amount, 'TRY', 'PENDING', 'IYZICO',
      0, 0, 0, 'MODEL_A', 'TOP_UP',
      jsonb_build_object('flow', p_flow, 'full_amount', v_card_amount)
    ) RETURNING * INTO v_intent;

  ELSIF p_flow = 'MATCH_JOIN' THEN
    IF p_match_id IS NULL OR p_slot_ids IS NULL OR array_length(p_slot_ids, 1) IS NULL THEN
      RAISE EXCEPTION 'NO_SLOTS: En az bir slot seç';
    END IF;
    SELECT slots, price INTO v_slots, v_price FROM public.matches WHERE id = p_match_id;
    IF v_slots IS NULL THEN RAISE EXCEPTION 'NOT_FOUND: Maç bulunamadı'; END IF;
    FOREACH v_sid IN ARRAY p_slot_ids LOOP
      SELECT s INTO v_slot FROM jsonb_array_elements(v_slots) s WHERE s->>'id' = v_sid;
      IF v_slot IS NULL THEN RAISE EXCEPTION 'SLOT_NOT_FOUND: %', v_sid; END IF;
      IF COALESCE(v_slot->>'status','OPEN') <> 'OPEN' THEN RAISE EXCEPTION 'SLOT_TAKEN: % dolu', v_sid; END IF;
      v_count := v_count + 1;
    END LOOP;
    v_total := round(COALESCE(v_price, 0) * v_count, 2);
    IF v_total <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT: Ücretsiz maç için kart gerekmez.'; END IF;

    IF p_use_balance THEN
      SELECT * INTO v_buckets FROM public._wallet_bucket_balances(p_user_id);
      v_balance_applied := LEAST(v_buckets.topup_balance + v_buckets.refund_credit_balance, v_total);
    END IF;
    v_card_amount := round(v_total - v_balance_applied, 2);
    IF v_card_amount <= 0 THEN RAISE EXCEPTION 'NO_CARD_AMOUNT: Kart tutarı yok (bakiye karşılıyor).'; END IF;

    v_comm := public.calculate_commission(v_card_amount, 'GLOBAL');
    INSERT INTO public.payment_intents (
      user_id, match_id, amount, currency, status, provider,
      commission_amount, owner_amount, service_provider_amount,
      commission_model, related_entity_type, raw
    ) VALUES (
      p_user_id, p_match_id, v_card_amount, 'TRY', 'PENDING', 'IYZICO',
      (v_comm->>'commission_amt')::numeric, (v_comm->>'net_amount')::numeric, 0,
      v_comm->>'model', 'MATCH',
      jsonb_build_object('flow', p_flow, 'full_amount', v_total, 'slot_ids', to_jsonb(p_slot_ids),
                         'balance_applied', v_balance_applied, 'use_balance', p_use_balance)
    ) RETURNING * INTO v_intent;

  ELSE
    RAISE EXCEPTION 'INVALID_FLOW: %', p_flow;
  END IF;

  RETURN jsonb_build_object(
    'intent_id', v_intent.id,
    'card_amount', v_card_amount,
    'balance_applied', v_balance_applied,
    'currency', 'TRY'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_card_payment(uuid, text, numeric, uuid, uuid, text[], boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_card_payment(uuid, text, numeric, uuid, uuid, text[], boolean) TO service_role;

-- ─── 2) apply_card_payment — 3DS onayı sonrası para hareketi (idempotent) ───
CREATE OR REPLACE FUNCTION public.apply_card_payment(
  p_intent_id    uuid,
  p_provider_ref text DEFAULT NULL,
  p_raw          jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_i public.payment_intents;
  v_flow text;
  v_full numeric; v_bal numeric;
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

  UPDATE public.payment_intents
  SET status = 'PAID', paid_at = now(),
      provider_ref = COALESCE(p_provider_ref, provider_ref),
      raw = COALESCE(raw, '{}'::jsonb) || COALESCE(p_raw, '{}'::jsonb)
  WHERE id = p_intent_id;

  IF v_flow = 'BOOKING_DEPOSIT' THEN
    SELECT * INTO v_b FROM public.pitch_bookings WHERE id = v_i.booking_id FOR UPDATE;
    -- Bu arada iptal/ödenmişse: kart tutarını iade kredisine çevir (para kaybolmaz)
    IF NOT FOUND OR v_b.status = 'CANCELLED'
       OR COALESCE(v_b.paid_amount, 0) + v_full > COALESCE(v_b.price, 0) THEN
      INSERT INTO public.wallet_transactions
        (user_id, amount, type, balance_type, status, reference_type, reference_id, description)
      VALUES (v_i.user_id, v_i.amount, 'DEPOSIT', 'REFUND_CREDIT', 'COMPLETED',
              'PAYMENT_INTENT', p_intent_id, 'Rezervasyon kapandı — kart tutarı iade kredisine aktarıldı');
      PERFORM public._sync_wallet_mirror(v_i.user_id);
      -- Neden intent'e de yazılır (FE polling yedeği postMessage'ı kaçırırsa okur)
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
      THEN format('Uygulama içi kapora ödemesi (%s₺ bakiye + %s₺ kart)', v_bal, v_i.amount)
      ELSE 'Uygulama içi kapora ödemesi' END;
    INSERT INTO public.booking_payments (booking_id, amount, payment_method, note, recorded_by)
    VALUES (v_i.booking_id, v_full, 'CARD', v_note, v_i.user_id);

    v_new_paid := COALESCE(v_b.paid_amount, 0) + v_full;
    UPDATE public.pitch_bookings SET
      paid_amount = v_new_paid,
      payment_status = CASE WHEN v_new_paid >= COALESCE(price, 0) THEN 'PAID' ELSE 'PARTIAL' END
    WHERE id = v_i.booking_id;

    RETURN jsonb_build_object('ok', true, 'flow', v_flow, 'amount', v_full,
      'balance_applied', v_bal, 'card_amount', v_i.amount);

  ELSIF v_flow = 'TOP_UP' THEN
    INSERT INTO public.wallet_transactions
      (user_id, amount, type, balance_type, status, reference_type, reference_id, description)
    VALUES (v_i.user_id, v_i.amount, 'TOP_UP', 'TOP_UP', 'COMPLETED',
            'PAYMENT_INTENT', p_intent_id, 'Cüzdana para yükleme');
    PERFORM public._sync_wallet_mirror(v_i.user_id);
    RETURN jsonb_build_object('ok', true, 'flow', v_flow, 'amount', v_i.amount);

  ELSIF v_flow = 'MATCH_JOIN' THEN
    SELECT array_agg(e) INTO v_slot_ids FROM jsonb_array_elements_text(COALESCE(v_i.raw->'slot_ids','[]'::jsonb)) e;
    SELECT slots INTO v_slots FROM public.matches WHERE id = v_i.match_id FOR UPDATE;

    -- SMS doğrulaması sürerken yerler dolduysa: kart tutarı iade kredisine
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
      -- Neden intent'e de yazılır (FE polling yedeği postMessage'ı kaçırırsa okur)
      UPDATE public.payment_intents
      SET raw = COALESCE(raw, '{}'::jsonb) || jsonb_build_object('result_reason', 'SLOT_TAKEN_REFUNDED')
      WHERE id = p_intent_id;
      RETURN jsonb_build_object('ok', false, 'reason', 'SLOT_TAKEN_REFUNDED', 'refunded', v_i.amount);
    END IF;

    IF v_bal > 0 THEN
      PERFORM public.wallet_spend_balance(v_i.user_id, v_bal, 'MATCH', v_i.match_id, v_i.match_id,
        'Maça katılım — cüzdan bakiyesi');
    END IF;

    -- Legacy mutabakat işareti (tam tutar) — quorum onay/iptal bundan okur
    INSERT INTO public.wallet_transactions (user_id, match_id, amount, type, status, description, meta)
    VALUES (v_i.user_id, v_i.match_id, -v_full, 'MATCH_FEE', 'COMPLETED', 'Maç katılım ücreti',
            jsonb_build_object('balance_applied', v_bal, 'card_amount', v_i.amount));

    -- Slotları ata (player_buy_slots_v2 ile aynı kalıp)
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

    RETURN jsonb_build_object('ok', true, 'flow', v_flow, 'amount', v_full,
      'balance_applied', v_bal, 'card_amount', v_i.amount);
  END IF;

  RAISE EXCEPTION 'INVALID_FLOW: %', v_flow;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_card_payment(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_card_payment(uuid, text, jsonb) TO service_role;

-- ─── 3) mark_intent_failed — 3DS başarısızlığında niyet kapansın ────────────
CREATE OR REPLACE FUNCTION public.mark_intent_failed(p_intent_id uuid, p_reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.payment_intents
  SET status = 'FAILED',
      raw = COALESCE(raw, '{}'::jsonb) || jsonb_build_object('fail_reason', p_reason, 'failed_at', now())
  WHERE id = p_intent_id AND status = 'PENDING';
END;
$$;

REVOKE ALL ON FUNCTION public.mark_intent_failed(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_intent_failed(uuid, text) TO service_role;