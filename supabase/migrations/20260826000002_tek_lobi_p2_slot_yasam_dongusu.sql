-- ============================================================================
-- TEK MAÇ LOBİSİ — PAKET 2: Slot yaşam döngüsü
--
-- Yeni durum makinesi (jsonb anahtarları):
--   OPEN ──satın al──▶ TAKEN·RESERVED (purchasedBy, occupant yok → "DOLU")
--     ├─ player_self_assign ──▶ TAKEN·SELF     (occupant = alıcı)
--     ├─ player_assign_slot ──▶ TAKEN·ASSIGNED (occupant = arkadaş, ANINDA)
--     └─ player_make_slot_code ▶ TAKEN·LINK_PENDING ──claim──▶ TAKEN·ASSIGNED
--   occupant ayrılır (unassign/leave) ──▶ TAKEN·RESERVED (para alıcıda kalır)
--   alıcı bırakır (release/leave)     ──▶ OPEN + kısmi iade → purchasedBy cüzdanı
--
-- Kurallar:
--   • Para HER ZAMAN purchasedBy'ı izler; iadeler _match_refund_partial ile
--     (ödenen − iade edilen) tavanlıdır — kısmi iade artık güvenli.
--   • Yedek terfisi ÖDEMESİZ YAPILMAZ: yer açılınca ilk yedeğe bildirim gider,
--     slot vitrine döner ve normal satın almayla alınır.
--   • Doluluk/eşik matematiği değişmez: RESERVED da TAKEN'dır.
--   • Tüm fonksiyonlar FOR UPDATE kilitli, SECURITY DEFINER, idempotent CREATE.
-- ============================================================================

-- ─── 0) Kısmi iade yardımcısı — (ödenen − iade) tavanlı, aynalı ─────────────
CREATE OR REPLACE FUNCTION public._match_refund_partial(p_user_id uuid, p_match_id uuid, p_cap numeric)
RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_paid numeric; v_refunded numeric; v_amount numeric;
BEGIN
  SELECT COALESCE(SUM(-amount), 0) INTO v_paid FROM public.wallet_transactions
   WHERE user_id = p_user_id AND match_id = p_match_id AND type = 'MATCH_FEE';
  SELECT COALESCE(SUM(amount), 0) INTO v_refunded FROM public.wallet_transactions
   WHERE user_id = p_user_id AND match_id = p_match_id AND type IN ('MATCH_REFUND','REFUND');
  v_amount := GREATEST(v_paid - v_refunded, 0);
  IF p_cap IS NOT NULL THEN v_amount := LEAST(v_amount, GREATEST(p_cap, 0)); END IF;
  IF v_amount <= 0 THEN RETURN 0; END IF;

  INSERT INTO public.wallet_transactions
    (user_id, match_id, amount, type, balance_type, status, reference_type, description)
  VALUES
    (p_user_id, p_match_id, v_amount, 'MATCH_REFUND', 'REFUND_CREDIT', 'COMPLETED',
     'REFUND', 'Slot iadesi — OYNA iade kredisi');
  PERFORM public._sync_wallet_mirror(p_user_id);
  RETURN v_amount;
END;
$$;
REVOKE ALL ON FUNCTION public._match_refund_partial(uuid, uuid, numeric) FROM PUBLIC, anon, authenticated;

-- ─── 0b) Slot yardımcıları: profil kartı + yedek bildirimi ──────────────────
CREATE OR REPLACE FUNCTION public._profile_player_json(p_user_id uuid, p_role text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'id', id, 'name', COALESCE(name, full_name, 'Oyuncu'),
    'avatar', COALESCE(avatar_url, ''), 'rating', COALESCE(rating, 4.5),
    'position', COALESCE(p_role, ''))
  FROM public.profiles WHERE id = p_user_id;
$$;
REVOKE ALL ON FUNCTION public._profile_player_json(uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._notify_first_reserve(p_match_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_first uuid; v_title text;
BEGIN
  SELECT NULLIF(("reservePlayers"->0->>'id'),'')::uuid, title INTO v_first, v_title
  FROM public.matches WHERE id = p_match_id;
  IF v_first IS NOT NULL THEN
    PERFORM public._notify_team_event(
      v_first, 'match_spot_opened', NULL, NULL,
      jsonb_build_object('match_title', COALESCE(v_title, 'Maç')),
      false, 'oyna://match/' || p_match_id::text);
  END IF;
EXCEPTION WHEN OTHERS THEN NULL; -- bildirim asla ana işlemi düşürmez
END;
$$;
REVOKE ALL ON FUNCTION public._notify_first_reserve(uuid) FROM PUBLIC, anon, authenticated;

-- ─── 1) player_buy_slots_v2__inner — RESERVED satın alma (ev + deplasman) ───
CREATE OR REPLACE FUNCTION public.player_buy_slots_v2__inner(p_match_id uuid, p_slot_ids text[], p_use_balance boolean DEFAULT true, p_card_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_slots jsonb; v_away jsonb; v_price numeric; v_total numeric;
  v_count int := 0; v_home_hits int := 0; v_away_hits int := 0;
  v_sid text; v_slot jsonb;
  v_b RECORD;
  v_balance_applied numeric := 0;
  v_card_part numeric := 0;
  v_provider text;
  v_card public.user_saved_cards;
  v_comm jsonb;
  v_intent public.payment_intents;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT slots, COALESCE("awaySlots", '[]'::jsonb), price
  INTO v_slots, v_away, v_price
  FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF v_slots IS NULL THEN RAISE EXCEPTION 'NOT_FOUND: Maç bulunamadı'; END IF;

  -- Tüm slotlar OPEN olmalı (ev VEYA deplasman) — hepsi ya da hiçbiri.
  FOREACH v_sid IN ARRAY p_slot_ids LOOP
    SELECT s INTO v_slot FROM jsonb_array_elements(v_slots) s WHERE s->>'id' = v_sid;
    IF v_slot IS NOT NULL THEN
      v_home_hits := v_home_hits + 1;
    ELSE
      SELECT s INTO v_slot FROM jsonb_array_elements(v_away) s WHERE s->>'id' = v_sid;
      IF v_slot IS NOT NULL THEN v_away_hits := v_away_hits + 1; END IF;
    END IF;
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

  -- YENİ MODEL: satın alınan slot REZERVE olur — sahada "DOLU", oyuncu ataması
  -- Maçlarım lobisinden yapılır (player_self_assign / player_assign_slot / kod).
  FOREACH v_sid IN ARRAY p_slot_ids LOOP
    v_slots := (SELECT jsonb_agg(CASE WHEN s->>'id' = v_sid
        THEN (s - 'player' - 'occupant' - 'inviteeId' - 'claimCode')
             || jsonb_build_object('status','TAKEN','purchasedBy', v_uid::text,'assignmentStatus','RESERVED')
        ELSE s END) FROM jsonb_array_elements(v_slots) s);
    v_away := COALESCE((SELECT jsonb_agg(CASE WHEN s->>'id' = v_sid
        THEN (s - 'player' - 'occupant' - 'inviteeId' - 'claimCode')
             || jsonb_build_object('status','TAKEN','purchasedBy', v_uid::text,'assignmentStatus','RESERVED')
        ELSE s END) FROM jsonb_array_elements(v_away) s), '[]'::jsonb);
  END LOOP;
  UPDATE public.matches SET slots = v_slots, "awaySlots" = v_away WHERE id = p_match_id;

  -- Sorgu indeksi: alıcı katılımcıdır (satır çoğaltmadan, kolonla).
  INSERT INTO public.match_participants (match_id, user_id, role, status, is_buyer, bought_slots)
  VALUES (p_match_id, v_uid,
          CASE WHEN v_away_hits > 0 AND v_home_hits = 0 THEN 'away' ELSE 'home' END,
          'confirmed', true, v_count)
  ON CONFLICT (match_id, user_id) DO UPDATE SET
    is_buyer = true,
    bought_slots = public.match_participants.bought_slots + EXCLUDED.bought_slots,
    status = CASE WHEN public.match_participants.status IN ('left','cancelled','removed','declined')
                  THEN 'confirmed' ELSE public.match_participants.status END;

  RETURN jsonb_build_object(
    'ok', true, 'count', v_count, 'total', v_total, 'reserved', v_count,
    'balance_applied', v_balance_applied, 'card_amount', v_card_part,
    'intent_id', v_intent.id
  );
END;
$function$;

-- ─── 2) player_self_assign — alıcı kendini rezerve slota yerleştirir ────────
CREATE OR REPLACE FUNCTION public.player_self_assign(p_match_id uuid, p_slot_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_slots jsonb; v_away jsonb; v_slot jsonb; v_is_away boolean := false;
  v_player jsonb; v_occupied boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT slots, COALESCE("awaySlots",'[]'::jsonb) INTO v_slots, v_away
  FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF v_slots IS NULL THEN RAISE EXCEPTION 'NOT_FOUND: Maç bulunamadı'; END IF;

  SELECT s INTO v_slot FROM jsonb_array_elements(v_slots) s WHERE s->>'id' = p_slot_id;
  IF v_slot IS NULL THEN
    SELECT s INTO v_slot FROM jsonb_array_elements(v_away) s WHERE s->>'id' = p_slot_id;
    v_is_away := v_slot IS NOT NULL;
  END IF;
  IF v_slot IS NULL THEN RAISE EXCEPTION 'SLOT_NOT_FOUND'; END IF;
  IF (v_slot->>'purchasedBy') IS DISTINCT FROM v_uid::text THEN RAISE EXCEPTION 'NOT_OWNER: Bu slotu sen almadın'; END IF;
  IF COALESCE(v_slot->>'assignmentStatus','RESERVED') NOT IN ('RESERVED','LINK_PENDING') THEN
    RAISE EXCEPTION 'SLOT_OCCUPIED: Önce slottaki oyuncuyu çıkar.';
  END IF;

  -- Aynı maçta zaten sahada mı?
  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_slots || v_away) s
    WHERE s->>'occupant' = v_uid::text
  ) INTO v_occupied;
  IF v_occupied THEN RAISE EXCEPTION 'ALREADY_ON_FIELD: Zaten sahada bir slotun var.'; END IF;

  v_player := public._profile_player_json(v_uid, v_slot->>'role');

  IF v_is_away THEN
    v_away := (SELECT jsonb_agg(CASE WHEN s->>'id' = p_slot_id
        THEN (s - 'claimCode' - 'inviteeId')
             || jsonb_build_object('player', v_player, 'occupant', v_uid::text, 'assignmentStatus','SELF')
        ELSE s END) FROM jsonb_array_elements(v_away) s);
  ELSE
    v_slots := (SELECT jsonb_agg(CASE WHEN s->>'id' = p_slot_id
        THEN (s - 'claimCode' - 'inviteeId')
             || jsonb_build_object('player', v_player, 'occupant', v_uid::text, 'assignmentStatus','SELF')
        ELSE s END) FROM jsonb_array_elements(v_slots) s);
  END IF;
  UPDATE public.matches SET slots = v_slots, "awaySlots" = v_away WHERE id = p_match_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.player_self_assign(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.player_self_assign(uuid, text) TO authenticated;

-- ─── 3) player_assign_slot — arkadaş ANINDA slotta görünür + gerçek bildirim ─
CREATE OR REPLACE FUNCTION public.player_assign_slot(p_match_id uuid, p_slot_id text, p_friend_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_slots jsonb; v_away jsonb; v_slot jsonb; v_is_away boolean := false;
  v_player jsonb; v_occupied boolean; v_title text; v_sender text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_friend_id IS NULL OR p_friend_id = v_uid THEN RAISE EXCEPTION 'INVALID_FRIEND'; END IF;
  IF NOT public._are_friends(v_uid, p_friend_id) THEN
    RAISE EXCEPTION 'NOT_FRIENDS: Yalnız arkadaş listenden atama yapabilirsin.';
  END IF;

  SELECT slots, COALESCE("awaySlots",'[]'::jsonb), title INTO v_slots, v_away, v_title
  FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF v_slots IS NULL THEN RAISE EXCEPTION 'NOT_FOUND: Maç bulunamadı'; END IF;

  SELECT s INTO v_slot FROM jsonb_array_elements(v_slots) s WHERE s->>'id' = p_slot_id;
  IF v_slot IS NULL THEN
    SELECT s INTO v_slot FROM jsonb_array_elements(v_away) s WHERE s->>'id' = p_slot_id;
    v_is_away := v_slot IS NOT NULL;
  END IF;
  IF v_slot IS NULL THEN RAISE EXCEPTION 'SLOT_NOT_FOUND'; END IF;
  IF (v_slot->>'purchasedBy') IS DISTINCT FROM v_uid::text THEN RAISE EXCEPTION 'NOT_OWNER: Bu slotu sen almadın'; END IF;
  IF COALESCE(v_slot->>'assignmentStatus','RESERVED') NOT IN ('RESERVED','LINK_PENDING') THEN
    RAISE EXCEPTION 'SLOT_OCCUPIED: Önce slottaki oyuncuyu çıkar.';
  END IF;

  -- Arkadaş bu maçta zaten sahada mı?
  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_slots || v_away) s
    WHERE s->>'occupant' = p_friend_id::text
       OR s->'player'->>'id' = p_friend_id::text
  ) INTO v_occupied;
  IF v_occupied THEN RAISE EXCEPTION 'FRIEND_ON_FIELD: Arkadaşın zaten bu maçta sahada.'; END IF;

  v_player := public._profile_player_json(p_friend_id, v_slot->>'role');

  IF v_is_away THEN
    v_away := (SELECT jsonb_agg(CASE WHEN s->>'id' = p_slot_id
        THEN (s - 'claimCode' - 'inviteeId')
             || jsonb_build_object('player', v_player, 'occupant', p_friend_id::text, 'assignmentStatus','ASSIGNED')
        ELSE s END) FROM jsonb_array_elements(v_away) s);
  ELSE
    v_slots := (SELECT jsonb_agg(CASE WHEN s->>'id' = p_slot_id
        THEN (s - 'claimCode' - 'inviteeId')
             || jsonb_build_object('player', v_player, 'occupant', p_friend_id::text, 'assignmentStatus','ASSIGNED')
        ELSE s END) FROM jsonb_array_elements(v_slots) s);
  END IF;
  UPDATE public.matches SET slots = v_slots, "awaySlots" = v_away WHERE id = p_match_id;

  -- Katılımcı indeksi + gerçek bildirim (push, Dashboard webhook'u üzerinden).
  INSERT INTO public.match_participants (match_id, user_id, role, status)
  VALUES (p_match_id, p_friend_id, CASE WHEN v_is_away THEN 'away' ELSE 'home' END, 'confirmed')
  ON CONFLICT (match_id, user_id) DO UPDATE SET
    status = CASE WHEN public.match_participants.status IN ('left','cancelled','removed','declined')
                  THEN 'confirmed' ELSE public.match_participants.status END;

  SELECT COALESCE(name, full_name, 'Bir arkadaşın') INTO v_sender FROM public.profiles WHERE id = v_uid;
  PERFORM public._notify_team_event(
    p_friend_id, 'match_slot_assigned', v_uid, NULL,
    jsonb_build_object('sender_name', v_sender, 'match_title', COALESCE(v_title, 'Maç')),
    false, 'oyna://match/' || p_match_id::text);

  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.player_assign_slot(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.player_assign_slot(uuid, text, uuid) TO authenticated;

-- ─── 4) player_unassign_slot — occupant çıkar, slot alıcının rezervine döner ─
CREATE OR REPLACE FUNCTION public.player_unassign_slot(p_match_id uuid, p_slot_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_slots jsonb; v_away jsonb; v_slot jsonb; v_is_away boolean := false;
  v_owner uuid; v_occ uuid; v_title text; v_occ_name text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT slots, COALESCE("awaySlots",'[]'::jsonb), title INTO v_slots, v_away, v_title
  FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF v_slots IS NULL THEN RAISE EXCEPTION 'NOT_FOUND: Maç bulunamadı'; END IF;

  SELECT s INTO v_slot FROM jsonb_array_elements(v_slots) s WHERE s->>'id' = p_slot_id;
  IF v_slot IS NULL THEN
    SELECT s INTO v_slot FROM jsonb_array_elements(v_away) s WHERE s->>'id' = p_slot_id;
    v_is_away := v_slot IS NOT NULL;
  END IF;
  IF v_slot IS NULL THEN RAISE EXCEPTION 'SLOT_NOT_FOUND'; END IF;

  v_owner := NULLIF(v_slot->>'purchasedBy','')::uuid;
  v_occ   := COALESCE(NULLIF(v_slot->>'occupant','')::uuid, NULLIF(v_slot->'player'->>'id','')::uuid);
  IF v_owner IS NULL THEN RAISE EXCEPTION 'NOT_PURCHASED: Bu slot satın alınmış değil.'; END IF;
  IF v_occ IS NULL THEN RAISE EXCEPTION 'SLOT_EMPTY: Slotta oyuncu yok.'; END IF;
  IF v_uid <> v_occ AND v_uid <> v_owner THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Yalnız slottaki oyuncu veya slotu alan çıkarabilir.';
  END IF;

  IF v_is_away THEN
    v_away := (SELECT jsonb_agg(CASE WHEN s->>'id' = p_slot_id
        THEN (s - 'player' - 'occupant' - 'inviteeId' - 'claimCode')
             || jsonb_build_object('status','TAKEN','assignmentStatus','RESERVED')
        ELSE s END) FROM jsonb_array_elements(v_away) s);
  ELSE
    v_slots := (SELECT jsonb_agg(CASE WHEN s->>'id' = p_slot_id
        THEN (s - 'player' - 'occupant' - 'inviteeId' - 'claimCode')
             || jsonb_build_object('status','TAKEN','assignmentStatus','RESERVED')
        ELSE s END) FROM jsonb_array_elements(v_slots) s);
  END IF;
  UPDATE public.matches SET slots = v_slots, "awaySlots" = v_away WHERE id = p_match_id;

  -- Bilgilendirme: misafir ayrıldıysa alıcıya; alıcı çıkardıysa misafire.
  SELECT COALESCE(name, full_name, 'Oyuncu') INTO v_occ_name FROM public.profiles WHERE id = v_occ;
  IF v_uid = v_occ AND v_occ <> v_owner THEN
    PERFORM public._notify_team_event(
      v_owner, 'match_slot_vacated', v_occ, NULL,
      jsonb_build_object('player_name', v_occ_name, 'match_title', COALESCE(v_title, 'Maç')),
      false, 'oyna://match/' || p_match_id::text);
  ELSIF v_uid = v_owner AND v_occ <> v_owner THEN
    PERFORM public._notify_team_event(
      v_occ, 'match_kicked', v_owner, NULL,
      jsonb_build_object('match_title', COALESCE(v_title, 'Maç'), 'refund_note', ''),
      false, 'oyna://match/' || p_match_id::text);
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.player_unassign_slot(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.player_unassign_slot(uuid, text) TO authenticated;

-- ─── 5) player_release_slot — alıcı slotu vitrine iade eder (iade + bildirim) ─
CREATE OR REPLACE FUNCTION public.player_release_slot(p_match_id uuid, p_slot_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_slots jsonb; v_away jsonb; v_slot jsonb; v_is_away boolean := false;
  v_price numeric; v_refunded numeric := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT slots, COALESCE("awaySlots",'[]'::jsonb), COALESCE(price, 0)
  INTO v_slots, v_away, v_price
  FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF v_slots IS NULL THEN RAISE EXCEPTION 'NOT_FOUND: Maç bulunamadı'; END IF;

  SELECT s INTO v_slot FROM jsonb_array_elements(v_slots) s WHERE s->>'id' = p_slot_id;
  IF v_slot IS NULL THEN
    SELECT s INTO v_slot FROM jsonb_array_elements(v_away) s WHERE s->>'id' = p_slot_id;
    v_is_away := v_slot IS NOT NULL;
  END IF;
  IF v_slot IS NULL THEN RAISE EXCEPTION 'SLOT_NOT_FOUND'; END IF;
  IF (v_slot->>'purchasedBy') IS DISTINCT FROM v_uid::text THEN RAISE EXCEPTION 'NOT_OWNER: Bu slotu sen almadın'; END IF;
  IF COALESCE(v_slot->>'assignmentStatus','RESERVED') = 'ASSIGNED'
     AND (v_slot->>'occupant') IS DISTINCT FROM v_uid::text THEN
    RAISE EXCEPTION 'SLOT_OCCUPIED: Slotta arkadaşın oynuyor — önce onu çıkar.';
  END IF;

  IF v_is_away THEN
    v_away := (SELECT jsonb_agg(CASE WHEN s->>'id' = p_slot_id
        THEN (s - 'player' - 'occupant' - 'inviteeId' - 'claimCode' - 'purchasedBy' - 'assignmentStatus')
             || jsonb_build_object('status','OPEN')
        ELSE s END) FROM jsonb_array_elements(v_away) s);
  ELSE
    v_slots := (SELECT jsonb_agg(CASE WHEN s->>'id' = p_slot_id
        THEN (s - 'player' - 'occupant' - 'inviteeId' - 'claimCode' - 'purchasedBy' - 'assignmentStatus')
             || jsonb_build_object('status','OPEN')
        ELSE s END) FROM jsonb_array_elements(v_slots) s);
  END IF;
  UPDATE public.matches SET slots = v_slots, "awaySlots" = v_away WHERE id = p_match_id;

  v_refunded := public._match_refund_partial(v_uid, p_match_id, v_price);
  PERFORM public._notify_first_reserve(p_match_id);

  RETURN jsonb_build_object('ok', true, 'refunded', v_refunded);
END;
$$;
REVOKE ALL ON FUNCTION public.player_release_slot(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.player_release_slot(uuid, text) TO authenticated;

-- ─── 6) player_kick_slot — kaptan çıkarır (iade otomatik, dar RPC) ──────────
CREATE OR REPLACE FUNCTION public.player_kick_slot(p_match_id uuid, p_slot_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_slots jsonb; v_away jsonb; v_slot jsonb; v_is_away boolean := false;
  v_creator uuid; v_title text; v_price numeric;
  v_owner uuid; v_occ uuid; v_refunded numeric := 0; v_occ_name text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT slots, COALESCE("awaySlots",'[]'::jsonb), "creatorId", title, COALESCE(price, 0)
  INTO v_slots, v_away, v_creator, v_title, v_price
  FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF v_slots IS NULL THEN RAISE EXCEPTION 'NOT_FOUND: Maç bulunamadı'; END IF;
  IF v_creator IS DISTINCT FROM v_uid AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Yalnız maçın kurucusu oyuncu çıkarabilir.';
  END IF;

  SELECT s INTO v_slot FROM jsonb_array_elements(v_slots) s WHERE s->>'id' = p_slot_id;
  IF v_slot IS NULL THEN
    SELECT s INTO v_slot FROM jsonb_array_elements(v_away) s WHERE s->>'id' = p_slot_id;
    v_is_away := v_slot IS NOT NULL;
  END IF;
  IF v_slot IS NULL THEN RAISE EXCEPTION 'SLOT_NOT_FOUND'; END IF;

  v_owner := NULLIF(v_slot->>'purchasedBy','')::uuid;
  v_occ   := COALESCE(NULLIF(v_slot->>'occupant','')::uuid, NULLIF(v_slot->'player'->>'id','')::uuid);
  IF v_occ IS NULL AND v_owner IS NULL THEN RAISE EXCEPTION 'SLOT_EMPTY'; END IF;

  IF v_owner IS NOT NULL AND (v_occ IS NULL OR v_occ = v_owner) THEN
    -- Alıcının kendi slotu: tam serbest bırakma + iade → vitrine döner.
    IF v_is_away THEN
      v_away := (SELECT jsonb_agg(CASE WHEN s->>'id' = p_slot_id
          THEN (s - 'player' - 'occupant' - 'inviteeId' - 'claimCode' - 'purchasedBy' - 'assignmentStatus')
               || jsonb_build_object('status','OPEN')
          ELSE s END) FROM jsonb_array_elements(v_away) s);
    ELSE
      v_slots := (SELECT jsonb_agg(CASE WHEN s->>'id' = p_slot_id
          THEN (s - 'player' - 'occupant' - 'inviteeId' - 'claimCode' - 'purchasedBy' - 'assignmentStatus')
               || jsonb_build_object('status','OPEN')
          ELSE s END) FROM jsonb_array_elements(v_slots) s);
    END IF;
    v_refunded := public._match_refund_partial(v_owner, p_match_id, v_price);
    PERFORM public._notify_team_event(
      v_owner, 'match_kicked', v_uid, NULL,
      jsonb_build_object('match_title', COALESCE(v_title,'Maç'),
        'refund_note', CASE WHEN v_refunded > 0 THEN ' Ödemen iade kredisi olarak cüzdanına döndü.' ELSE '' END),
      false, 'oyna://match/' || p_match_id::text);
  ELSIF v_owner IS NOT NULL THEN
    -- Misafir oyuncu: slot alıcının rezervine döner (para hareketi yok).
    IF v_is_away THEN
      v_away := (SELECT jsonb_agg(CASE WHEN s->>'id' = p_slot_id
          THEN (s - 'player' - 'occupant' - 'inviteeId' - 'claimCode')
               || jsonb_build_object('status','TAKEN','assignmentStatus','RESERVED')
          ELSE s END) FROM jsonb_array_elements(v_away) s);
    ELSE
      v_slots := (SELECT jsonb_agg(CASE WHEN s->>'id' = p_slot_id
          THEN (s - 'player' - 'occupant' - 'inviteeId' - 'claimCode')
               || jsonb_build_object('status','TAKEN','assignmentStatus','RESERVED')
          ELSE s END) FROM jsonb_array_elements(v_slots) s);
    END IF;
    SELECT COALESCE(name, full_name, 'Oyuncu') INTO v_occ_name FROM public.profiles WHERE id = v_occ;
    PERFORM public._notify_team_event(v_occ, 'match_kicked', v_uid, NULL,
      jsonb_build_object('match_title', COALESCE(v_title,'Maç'), 'refund_note', ''),
      false, 'oyna://match/' || p_match_id::text);
    PERFORM public._notify_team_event(v_owner, 'match_slot_vacated', v_uid, NULL,
      jsonb_build_object('player_name', COALESCE(v_occ_name,'Oyuncu'), 'match_title', COALESCE(v_title,'Maç')),
      false, 'oyna://match/' || p_match_id::text);
  ELSE
    -- Legacy: satın alınmamış dolu slot → boşalt + varsa oyuncunun parasını iade et.
    IF v_is_away THEN
      v_away := (SELECT jsonb_agg(CASE WHEN s->>'id' = p_slot_id
          THEN (s - 'player' - 'occupant' - 'inviteeId' - 'claimCode' - 'purchasedBy' - 'assignmentStatus')
               || jsonb_build_object('status','OPEN')
          ELSE s END) FROM jsonb_array_elements(v_away) s);
    ELSE
      v_slots := (SELECT jsonb_agg(CASE WHEN s->>'id' = p_slot_id
          THEN (s - 'player' - 'occupant' - 'inviteeId' - 'claimCode' - 'purchasedBy' - 'assignmentStatus')
               || jsonb_build_object('status','OPEN')
          ELSE s END) FROM jsonb_array_elements(v_slots) s);
    END IF;
    v_refunded := public._match_refund_partial(v_occ, p_match_id, NULL);
    PERFORM public._notify_team_event(v_occ, 'match_kicked', v_uid, NULL,
      jsonb_build_object('match_title', COALESCE(v_title,'Maç'),
        'refund_note', CASE WHEN v_refunded > 0 THEN ' Ödemen iade kredisi olarak cüzdanına döndü.' ELSE '' END),
      false, 'oyna://match/' || p_match_id::text);
  END IF;

  UPDATE public.matches SET slots = v_slots, "awaySlots" = v_away WHERE id = p_match_id;
  PERFORM public._notify_first_reserve(p_match_id);
  RETURN jsonb_build_object('ok', true, 'refunded', v_refunded);
END;
$$;
REVOKE ALL ON FUNCTION public.player_kick_slot(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.player_kick_slot(uuid, text) TO authenticated;

-- ─── 7) player_update_formation — YALNIZ koordinat/rol (doluluk dokunulmaz) ──
CREATE OR REPLACE FUNCTION public.player_update_formation(p_match_id uuid, p_side text, p_coords jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_creator uuid; v_slots jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_side NOT IN ('home','away') THEN RAISE EXCEPTION 'INVALID_SIDE'; END IF;

  SELECT "creatorId",
         CASE WHEN p_side = 'home' THEN slots ELSE COALESCE("awaySlots",'[]'::jsonb) END
  INTO v_creator, v_slots
  FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF v_creator IS NULL AND v_slots IS NULL THEN RAISE EXCEPTION 'NOT_FOUND: Maç bulunamadı'; END IF;
  IF v_creator IS DISTINCT FROM v_uid AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Dizilişi yalnız kurucu değiştirir.';
  END IF;

  -- Koordinat birleştirme: yalnız x/y/role (+ player.position/x/y) değişir.
  SELECT jsonb_agg(
    CASE WHEN c.coord IS NULL THEN s.slot
    ELSE
      (s.slot || jsonb_build_object(
         'x', COALESCE((c.coord->>'x')::numeric, (s.slot->>'x')::numeric),
         'y', COALESCE((c.coord->>'y')::numeric, (s.slot->>'y')::numeric),
         'role', COALESCE(c.coord->>'role', s.slot->>'role')))
      || CASE WHEN s.slot ? 'player' THEN jsonb_build_object('player',
           s.slot->'player' || jsonb_build_object(
             'position', COALESCE(c.coord->>'role', s.slot->>'role'),
             'x', COALESCE((c.coord->>'x')::numeric, (s.slot->>'x')::numeric),
             'y', COALESCE((c.coord->>'y')::numeric, (s.slot->>'y')::numeric)))
         ELSE '{}'::jsonb END
    END ORDER BY s.ord)
  INTO v_slots
  FROM jsonb_array_elements(v_slots) WITH ORDINALITY AS s(slot, ord)
  LEFT JOIN LATERAL (
    SELECT c2 AS coord FROM jsonb_array_elements(COALESCE(p_coords,'[]'::jsonb)) c2
    WHERE c2->>'id' = s.slot->>'id' LIMIT 1
  ) c ON TRUE;

  IF p_side = 'home' THEN
    UPDATE public.matches SET slots = v_slots WHERE id = p_match_id;
  ELSE
    UPDATE public.matches SET "awaySlots" = v_slots WHERE id = p_match_id;
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.player_update_formation(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.player_update_formation(uuid, text, jsonb) TO authenticated;

-- ─── 8) player_make_slot_code — ev + deplasman; yalnız RESERVED/LINK_PENDING ─
CREATE OR REPLACE FUNCTION public.player_make_slot_code(p_match_id uuid, p_slot_id text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_slots jsonb; v_away jsonb; v_slot jsonb; v_is_away boolean := false; v_code text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT slots, COALESCE("awaySlots",'[]'::jsonb) INTO v_slots, v_away
  FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF v_slots IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  SELECT s INTO v_slot FROM jsonb_array_elements(v_slots) s WHERE s->>'id' = p_slot_id;
  IF v_slot IS NULL THEN
    SELECT s INTO v_slot FROM jsonb_array_elements(v_away) s WHERE s->>'id' = p_slot_id;
    v_is_away := v_slot IS NOT NULL;
  END IF;
  IF v_slot IS NULL THEN RAISE EXCEPTION 'SLOT_NOT_FOUND'; END IF;
  IF (v_slot->>'purchasedBy') IS DISTINCT FROM v_uid::text THEN RAISE EXCEPTION 'NOT_OWNER'; END IF;
  IF COALESCE(v_slot->>'assignmentStatus','RESERVED') NOT IN ('RESERVED','LINK_PENDING') THEN
    RAISE EXCEPTION 'SLOT_OCCUPIED: Önce slottaki oyuncuyu çıkar.';
  END IF;

  v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
  IF v_is_away THEN
    v_away := (SELECT jsonb_agg(CASE WHEN s->>'id' = p_slot_id
        THEN s || jsonb_build_object('assignmentStatus','LINK_PENDING','claimCode', v_code)
        ELSE s END) FROM jsonb_array_elements(v_away) s);
  ELSE
    v_slots := (SELECT jsonb_agg(CASE WHEN s->>'id' = p_slot_id
        THEN s || jsonb_build_object('assignmentStatus','LINK_PENDING','claimCode', v_code)
        ELSE s END) FROM jsonb_array_elements(v_slots) s);
  END IF;
  UPDATE public.matches SET slots = v_slots, "awaySlots" = v_away WHERE id = p_match_id;
  RETURN v_code;
END;
$$;
REVOKE ALL ON FUNCTION public.player_make_slot_code(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.player_make_slot_code(uuid, text) TO authenticated;

-- ─── 9) player_claim_slot_code — kodla devralma (ev + deplasman + indeks) ────
CREATE OR REPLACE FUNCTION public.player_claim_slot_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_match record; v_slots jsonb; v_away jsonb; v_sid text; v_is_away boolean := false;
  v_player jsonb; v_role text; v_owner uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT id, slots, COALESCE("awaySlots",'[]'::jsonb) AS away INTO v_match FROM public.matches
    WHERE slots @> jsonb_build_array(jsonb_build_object('claimCode', p_code))
       OR COALESCE("awaySlots",'[]'::jsonb) @> jsonb_build_array(jsonb_build_object('claimCode', p_code))
    FOR UPDATE;
  IF v_match.id IS NULL THEN RAISE EXCEPTION 'INVALID_CODE: Kod geçersiz veya kullanılmış'; END IF;
  v_slots := v_match.slots; v_away := v_match.away;

  SELECT s->>'id', s->>'role', NULLIF(s->>'purchasedBy','')::uuid INTO v_sid, v_role, v_owner
  FROM jsonb_array_elements(v_slots) s WHERE s->>'claimCode' = p_code LIMIT 1;
  IF v_sid IS NULL THEN
    SELECT s->>'id', s->>'role', NULLIF(s->>'purchasedBy','')::uuid INTO v_sid, v_role, v_owner
    FROM jsonb_array_elements(v_away) s WHERE s->>'claimCode' = p_code LIMIT 1;
    v_is_away := v_sid IS NOT NULL;
  END IF;
  IF v_sid IS NULL THEN RAISE EXCEPTION 'INVALID_CODE'; END IF;

  v_player := public._profile_player_json(v_uid, v_role);

  IF v_is_away THEN
    v_away := (SELECT jsonb_agg(CASE WHEN s->>'id' = v_sid
        THEN (s - 'claimCode' - 'inviteeId')
             || jsonb_build_object('status','TAKEN','player',v_player,'occupant', v_uid::text,'assignmentStatus','ASSIGNED')
        ELSE s END) FROM jsonb_array_elements(v_away) s);
  ELSE
    v_slots := (SELECT jsonb_agg(CASE WHEN s->>'id' = v_sid
        THEN (s - 'claimCode' - 'inviteeId')
             || jsonb_build_object('status','TAKEN','player',v_player,'occupant', v_uid::text,'assignmentStatus','ASSIGNED')
        ELSE s END) FROM jsonb_array_elements(v_slots) s);
  END IF;
  UPDATE public.matches SET slots = v_slots, "awaySlots" = v_away WHERE id = v_match.id;

  INSERT INTO public.match_participants (match_id, user_id, role, status)
  VALUES (v_match.id, v_uid, CASE WHEN v_is_away THEN 'away' ELSE 'home' END, 'confirmed')
  ON CONFLICT (match_id, user_id) DO UPDATE SET
    status = CASE WHEN public.match_participants.status IN ('left','cancelled','removed','declined')
                  THEN 'confirmed' ELSE public.match_participants.status END;

  RETURN jsonb_build_object('ok', true, 'match_id', v_match.id);
END;
$$;
REVOKE ALL ON FUNCTION public.player_claim_slot_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.player_claim_slot_code(text) TO authenticated;

-- ─── 10) leave_public_match_slot — TAM ÇIKIŞ, ödemesiz terfi YOK ─────────────
-- Yeni sözleşme:
--  • Kullanıcının sahadaki occupancy'si kalkar; SAHİBİ olduğu RESERVED/SELF
--    slotlar vitrine döner ve slot başına ücret (ödenen−iade tavanlı) iade edilir.
--  • Arkadaşına ATANMIŞ slotları KALIR (arkadaş oynamaya devam eder).
--  • Misafir (ödemeyen) ayrılırsa slot ALICININ REZERVİNE döner; para hareketi olmaz.
--  • Yedek terfisi kaldırıldı: yer açılırsa ilk yedeğe bildirim gider (satın alma yolu).
CREATE OR REPLACE FUNCTION public.leave_public_match_slot(p_match_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_slots JSONB; v_away JSONB; v_reserves JSONB;
    v_creator UUID; v_title text; v_price numeric;
    v_new_slots JSONB := '[]'::jsonb; v_new_away JSONB := '[]'::jsonb;
    v_slot JSONB;
    v_found BOOLEAN := FALSE;
    v_opened BOOLEAN := FALSE;
    v_release_count int := 0;
    v_owner uuid; v_occ uuid;
    v_leaver_name text;
    v_new_reserves JSONB := '[]'::jsonb;
    v_owns_assigned BOOLEAN := FALSE;
BEGIN
    IF auth.uid() IS DISTINCT FROM p_user_id AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Başka bir kullanıcıyı maçtan çıkaramazsınız.';
    END IF;

    SELECT slots, COALESCE("awaySlots",'[]'::jsonb), "creatorId", COALESCE("reservePlayers",'[]'::jsonb), title, COALESCE(price,0)
    INTO v_slots, v_away, v_creator, v_reserves, v_title, v_price
    FROM public.matches WHERE id = p_match_id FOR UPDATE;

    IF v_slots IS NULL THEN RAISE EXCEPTION 'Maç bulunamadı!'; END IF;

    SELECT COALESCE(name, full_name, 'Oyuncu') INTO v_leaver_name FROM public.profiles WHERE id = p_user_id;

    -- EV SAHİBİ tarafı
    FOR v_slot IN SELECT jsonb_array_elements(v_slots) LOOP
        v_owner := NULLIF(v_slot->>'purchasedBy','')::uuid;
        v_occ   := COALESCE(NULLIF(v_slot->>'occupant','')::uuid, NULLIF(v_slot->'player'->>'id','')::uuid);
        IF v_owner = p_user_id AND v_occ IS NOT NULL AND v_occ <> p_user_id THEN
            v_owns_assigned := TRUE; -- arkadaşı oynuyor: slot KALIR
        ELSIF v_owner = p_user_id THEN
            v_found := TRUE; v_opened := TRUE; v_release_count := v_release_count + 1;
            v_slot := (v_slot - 'player' - 'occupant' - 'inviteeId' - 'claimCode' - 'purchasedBy' - 'assignmentStatus')
                      || jsonb_build_object('status','OPEN');
        ELSIF v_occ = p_user_id THEN
            v_found := TRUE;
            IF v_owner IS NOT NULL THEN
                -- Misafir ayrılıyor: slot alıcının rezervine döner.
                v_slot := (v_slot - 'player' - 'occupant' - 'inviteeId' - 'claimCode')
                          || jsonb_build_object('status','TAKEN','assignmentStatus','RESERVED');
                PERFORM public._notify_team_event(v_owner, 'match_slot_vacated', p_user_id, NULL,
                  jsonb_build_object('player_name', v_leaver_name, 'match_title', COALESCE(v_title,'Maç')),
                  false, 'oyna://match/' || p_match_id::text);
            ELSE
                v_opened := TRUE;
                v_slot := (v_slot - 'player' - 'occupant' - 'inviteeId' - 'claimCode' - 'purchasedBy' - 'assignmentStatus')
                          || jsonb_build_object('status','OPEN');
            END IF;
        END IF;
        v_new_slots := v_new_slots || jsonb_build_array(v_slot);
    END LOOP;

    -- DEPLASMAN tarafı
    FOR v_slot IN SELECT jsonb_array_elements(v_away) LOOP
        v_owner := NULLIF(v_slot->>'purchasedBy','')::uuid;
        v_occ   := COALESCE(NULLIF(v_slot->>'occupant','')::uuid, NULLIF(v_slot->'player'->>'id','')::uuid);
        IF v_owner = p_user_id AND v_occ IS NOT NULL AND v_occ <> p_user_id THEN
            v_owns_assigned := TRUE;
        ELSIF v_owner = p_user_id THEN
            v_found := TRUE; v_opened := TRUE; v_release_count := v_release_count + 1;
            v_slot := (v_slot - 'player' - 'occupant' - 'inviteeId' - 'claimCode' - 'purchasedBy' - 'assignmentStatus')
                      || jsonb_build_object('status','OPEN');
        ELSIF v_occ = p_user_id THEN
            v_found := TRUE;
            IF v_owner IS NOT NULL THEN
                v_slot := (v_slot - 'player' - 'occupant' - 'inviteeId' - 'claimCode')
                          || jsonb_build_object('status','TAKEN','assignmentStatus','RESERVED');
                PERFORM public._notify_team_event(v_owner, 'match_slot_vacated', p_user_id, NULL,
                  jsonb_build_object('player_name', v_leaver_name, 'match_title', COALESCE(v_title,'Maç')),
                  false, 'oyna://match/' || p_match_id::text);
            ELSE
                v_opened := TRUE;
                v_slot := (v_slot - 'player' - 'occupant' - 'inviteeId' - 'claimCode' - 'purchasedBy' - 'assignmentStatus')
                          || jsonb_build_object('status','OPEN');
            END IF;
        END IF;
        v_new_away := v_new_away || jsonb_build_array(v_slot);
    END LOOP;

    -- Sahada bulunamadıysa: yedek listesinden çıkma denemesi.
    IF NOT v_found THEN
        FOR v_slot IN SELECT jsonb_array_elements(v_reserves) LOOP
            IF NULLIF(v_slot->>'id','')::uuid IS DISTINCT FROM p_user_id THEN
                v_new_reserves := v_new_reserves || jsonb_build_array(v_slot);
            ELSE
                v_found := TRUE;
            END IF;
        END LOOP;
        IF v_found THEN
            UPDATE public.matches SET "reservePlayers" = v_new_reserves WHERE id = p_match_id;
            RETURN;
        END IF;
        RAISE EXCEPTION 'Kullanıcı maça kayıtlı değil!';
    END IF;

    -- İade: bırakılan slot sayısı × ücret; (ödenen − iade) tavanlı; purchasedBy'a.
    IF v_release_count > 0 THEN
        PERFORM public._match_refund_partial(p_user_id, p_match_id, v_price * v_release_count);
    END IF;

    -- Kaptan devri (kalan gerçek oyunculardan en güvenilire).
    IF v_creator = p_user_id THEN
        DECLARE v_new_creator UUID := NULL;
        BEGIN
            SELECT p.id INTO v_new_creator
            FROM (
                SELECT COALESCE(NULLIF(s->>'occupant',''), s->'player'->>'id')::UUID AS id
                FROM jsonb_array_elements(v_new_slots) s
                UNION ALL
                SELECT COALESCE(NULLIF(s->>'occupant',''), s->'player'->>'id')::UUID AS id
                FROM jsonb_array_elements(v_new_away) s
            ) active_players
            JOIN public.profiles p ON p.id = active_players.id
            WHERE active_players.id IS NOT NULL AND active_players.id <> p_user_id
            ORDER BY p.reliability_score DESC NULLS LAST, p.created_at ASC
            LIMIT 1;

            IF v_new_creator IS NOT NULL THEN
                UPDATE public.matches SET "creatorId" = v_new_creator WHERE id = p_match_id;
                INSERT INTO public.notifications (user_id, title, body, type_key)
                VALUES (v_new_creator, '👑 Yeni Kaptan Sensin!',
                    'Eski kaptan ayrıldığı için yüksek güvenilirlik skorunla bu maçın yeni kaptanı seçildin.',
                    'SYSTEM');
            END IF;
        END;
    END IF;

    UPDATE public.matches SET slots = v_new_slots, "awaySlots" = v_new_away WHERE id = p_match_id;

    -- Katılımcı indeksi: hâlâ atanmış slot sahibi değilse 'left'.
    IF NOT v_owns_assigned THEN
        UPDATE public.match_participants SET status = 'left'
        WHERE match_id = p_match_id AND user_id = p_user_id;
    END IF;

    -- Yer açıldıysa ilk yedeğe satın alma çağrısı (ödemesiz terfi YOK).
    IF v_opened THEN PERFORM public._notify_first_reserve(p_match_id); END IF;
END;
$function$;

-- ─── 11) preview_leave_match — yeni ayrılma sözleşmesiyle birebir ────────────
CREATE OR REPLACE FUNCTION public.preview_leave_match(p_match_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_paid numeric; v_already numeric; v_remaining numeric;
  v_price numeric; v_release_count int; v_refundable numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  SELECT COALESCE(SUM(-amount), 0) INTO v_paid FROM public.wallet_transactions
    WHERE user_id = v_uid AND match_id = p_match_id AND type = 'MATCH_FEE';
  SELECT COALESCE(SUM(amount), 0) INTO v_already FROM public.wallet_transactions
    WHERE user_id = v_uid AND match_id = p_match_id AND type IN ('MATCH_REFUND','REFUND');
  v_remaining := GREATEST(v_paid - v_already, 0);

  -- Ayrılınca serbest kalacak slotlar: sahibi olduğum ve arkadaşa atanmamış olanlar
  -- (+ legacy: purchasedBy'sız ama benim oturduğum slotlar tam kalan iadeyi alır).
  SELECT COALESCE(m.price, 0),
         (SELECT COUNT(*) FROM (
            SELECT s FROM jsonb_array_elements(m.slots) s
            UNION ALL
            SELECT s FROM jsonb_array_elements(COALESCE(m."awaySlots",'[]'::jsonb)) s
          ) q(s)
          WHERE q.s->>'purchasedBy' = v_uid::text
            AND (COALESCE(NULLIF(q.s->>'occupant',''), q.s->'player'->>'id') IS NULL
                 OR COALESCE(NULLIF(q.s->>'occupant',''), q.s->'player'->>'id') = v_uid::text))
  INTO v_price, v_release_count
  FROM public.matches m WHERE m.id = p_match_id;

  IF v_release_count > 0 THEN
    v_refundable := LEAST(v_price * v_release_count, v_remaining);
  ELSE
    -- Legacy tekli katılım: sahada oturduğum purchasedBy'sız slot varsa kalan iade.
    SELECT CASE WHEN EXISTS (
      SELECT 1 FROM public.matches m,
        LATERAL (SELECT s FROM jsonb_array_elements(m.slots) s
                 UNION ALL
                 SELECT s FROM jsonb_array_elements(COALESCE(m."awaySlots",'[]'::jsonb)) s) q(s)
      WHERE m.id = p_match_id
        AND COALESCE(NULLIF(q.s->>'occupant',''), q.s->'player'->>'id') = v_uid::text
        AND COALESCE(q.s->>'purchasedBy','') = ''
    ) THEN v_remaining ELSE 0 END INTO v_refundable;
  END IF;

  RETURN jsonb_build_object(
    'refundable', round(COALESCE(v_refundable,0), 2),
    'paid', round(v_paid, 2),
    'already_refunded', (v_already > 0)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.preview_leave_match(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_leave_match(uuid) TO authenticated, service_role;

-- ─── 12) process_match_at_deadline — kısmi iadeyle uyumlu iptal iadesi ───────
-- Eski NOT EXISTS(MATCH_REFUND) kapısı, kısmi iade almış kullanıcıyı iptal
-- iadesinden TAMAMEN dışlıyordu; artık kalan (ödenen − iade) ne ise o iade edilir.
CREATE OR REPLACE FUNCTION public.process_match_at_deadline(p_match_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  m          RECORD;
  v_stats    jsonb;
  v_quorum   numeric;
  v_ratio    numeric;
  v_intent   RECORD;
  v_user     RECORD;
  v_collected numeric;
  v_comm     jsonb;
  v_captured int := 0;
  v_voided   int := 0;
  v_refunded int := 0;
  v_amt      numeric;
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

    SELECT COALESCE(SUM(ABS(amount)), 0) - COALESCE((
      SELECT SUM(amount) FROM public.wallet_transactions
      WHERE match_id = p_match_id AND type IN ('MATCH_REFUND','REFUND')), 0)
    INTO v_collected
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

    -- Kısmi-iade uyumlu: her kullanıcıya KALAN (ödenen − iade) tutar iade edilir.
    FOR v_user IN
      SELECT wt.user_id
      FROM public.wallet_transactions wt
      WHERE wt.match_id = p_match_id AND wt.type = 'MATCH_FEE'
      GROUP BY wt.user_id
    LOOP
      v_amt := public._match_refund_partial(v_user.user_id, p_match_id, NULL);
      IF v_amt > 0 THEN v_refunded := v_refunded + 1; END IF;
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
