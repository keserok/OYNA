-- ═══════════════════════════════════════════════════════════════════════════
-- BASELINE — __inner sarmalayıcıları (canlı pg_get_functiondef, 2026-07-20)
-- 20260724000000_b2_min_rating_join_gate bu dördüne GRANT/REVOKE uygular ama
-- CREATE'leri hiçbir migration'da yok (defter-dışı "wrap" kaydından).
-- DECLARE'larda tablo-tipi kullanıldığından (public.user_saved_cards,
-- public.payment_intents, %ROWTYPE) bu dosya o tabloların yaratılışından
-- SONRA (user_saved_cards→20260717) konumlanmak zorundadır.
-- ÜRETİMDE: birebir aynı tanım → etkisiz.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.join_public_match_reserve__inner(p_match_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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

CREATE OR REPLACE FUNCTION public.join_public_match_slot__inner(p_match_id uuid, p_slot_id text, p_user_id uuid, p_is_away boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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

CREATE OR REPLACE FUNCTION public.player_buy_slots__inner(p_match_id uuid, p_slot_ids text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_slots jsonb; v_away jsonb; v_price numeric; v_count int := 0; v_total numeric;
  v_player jsonb; v_sid text; v_slot jsonb;
  v_inv public.match_list_invites%ROWTYPE;
  v_name text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT slots, "awaySlots", price INTO v_slots, v_away, v_price
  FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF v_slots IS NULL THEN RAISE EXCEPTION 'NOT_FOUND: Maç bulunamadı'; END IF;
  v_away := coalesce(v_away, '[]'::jsonb);

  FOREACH v_sid IN ARRAY p_slot_ids LOOP
    SELECT s INTO v_slot FROM jsonb_array_elements(v_slots) s WHERE s->>'id' = v_sid;
    IF v_slot IS NULL THEN
      SELECT s INTO v_slot FROM jsonb_array_elements(v_away) s WHERE s->>'id' = v_sid;
    END IF;
    IF v_slot IS NULL THEN RAISE EXCEPTION 'SLOT_NOT_FOUND: %', v_sid; END IF;
    IF coalesce(v_slot->>'status','OPEN') <> 'OPEN' THEN RAISE EXCEPTION 'SLOT_TAKEN: % dolu', v_sid; END IF;
    v_count := v_count + 1;
  END LOOP;
  IF v_count = 0 THEN RAISE EXCEPTION 'NO_SLOTS: En az bir slot seç'; END IF;

  v_total := coalesce(v_price, 0) * v_count;
  IF v_total > 0 THEN PERFORM public.process_match_payment(v_uid, p_match_id, v_total); END IF;

  SELECT jsonb_build_object(
    'id', id, 'name', coalesce(name, full_name, 'Oyuncu'),
    'avatar', coalesce(avatar_url, ''), 'rating', coalesce(rating, 4.5), 'position', ''
  ) INTO v_player FROM public.profiles WHERE id = v_uid;

  FOREACH v_sid IN ARRAY p_slot_ids LOOP
    v_slots := coalesce((SELECT jsonb_agg(CASE WHEN s->>'id' = v_sid
        THEN s || jsonb_build_object('status','TAKEN','player',v_player,
             'purchasedBy', v_uid::text, 'occupant', v_uid::text, 'assignmentStatus','SELF')
        ELSE s END) FROM jsonb_array_elements(v_slots) s), '[]'::jsonb);
    v_away := coalesce((SELECT jsonb_agg(CASE WHEN s->>'id' = v_sid
        THEN s || jsonb_build_object('status','TAKEN','player',v_player,
             'purchasedBy', v_uid::text, 'occupant', v_uid::text, 'assignmentStatus','SELF')
        ELSE s END) FROM jsonb_array_elements(v_away) s), '[]'::jsonb);
  END LOOP;
  UPDATE public.matches SET slots = v_slots, "awaySlots" = v_away WHERE id = p_match_id;

  SELECT * INTO v_inv FROM public.match_list_invites
  WHERE match_id = p_match_id AND invited_id = v_uid AND status = 'PENDING'
  FOR UPDATE;
  IF FOUND THEN
    UPDATE public.match_list_invites
    SET status = 'JOINED', responded_at = timezone('utc', now())
    WHERE id = v_inv.id;
    SELECT coalesce(full_name, name::text, 'Bir oyuncu') INTO v_name
    FROM public.profiles WHERE id = v_uid;
    PERFORM public._notify_team_event(
      v_inv.inviter_id, 'match_invite_joined', v_uid, NULL,
      jsonb_build_object('sender_name', v_name),
      false, 'oyna://match/' || p_match_id::text);
  END IF;

  RETURN jsonb_build_object('ok', true, 'count', v_count, 'total', v_total);
END $function$;

CREATE OR REPLACE FUNCTION public.player_buy_slots_v2__inner(p_match_id uuid, p_slot_ids text[], p_use_balance boolean DEFAULT true, p_card_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;
