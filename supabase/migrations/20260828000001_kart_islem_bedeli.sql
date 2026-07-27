-- ============================================================================
-- KART İŞLEM BEDELİ — cüzdanı ilk tercih yapan şeffaf fiyatlandırma
--
-- KARAR: Kartla ödemede ödeme altyapısına (iyzico) ödenen komisyon, kullanıcıya
-- ayrı bir satır olarak yansıtılır; cüzdandan ödemede HİÇ ek bedel yoktur.
-- Böylece cüzdan gerçekten ucuz kalır ve tercih edilmesi için sebep doğar.
--
-- BİRİM SÖZLEŞMESİ (bu dosyanın kurduğu ayrım):
--   * "taban" (card_base)  = hizmetin gerçek bedeli — kaportaya, cüzdana,
--                            saha sahibine, maç defterine YAZILAN tutar budur.
--   * "bedel" (card_fee)   = yalnız kart yolunda eklenen işlem bedeli.
--   * payment_intents.amount = karttan ÇEKİLEN toplam (taban + bedel).
-- Bu ayrım olmadan TOP_UP akışı bozulurdu: kullanıcı 1025₺ öderken cüzdanına
-- 1025₺ yüklenirdi ve bedel kaybolurdu. Aşağıda cüzdana yalnız taban yazılır.
--
-- İadeler bilinçli olarak TOPLAM tutar (taban + bedel) üzerinden yapılır:
-- hizmeti biz veremediysek (yer doldu / rezervasyon kapandı) kullanıcı işlem
-- bedelini de geri alır.
--
-- KADEMELİ İADE (process_tiered_refund) BİLEREK DEĞİŞTİRİLMEDİ: oradaki taban
-- payment_intents.amount'tır, yani artık taban + bedel. Zincir şöyle kapanır —
-- kullanıcı 1000₺ hizmet için 1025₺ öder; tam iade kademesinde brütü 1025₺
-- olur, üstünden mevcut _psp_fee kesintisi düşer ve eline ~1000₺ (hizmet
-- bedeli) geçer. Kademeli iadeyi tabandan hesaplasaydık aynı PSP maliyeti
-- kullanıcıdan İKİ KEZ alınmış olurdu (bir kez bedel, bir kez kesinti).
-- ============================================================================

-- ─── 1) Oran: panelden yönetilir, 0 = özellik kapalı ────────────────────────
INSERT INTO public.app_config (key, value, value_type, category, label, description, is_public, min_value, max_value)
VALUES (
  'card_fee_pct', '2.5'::jsonb, 'number', 'ODEME', 'Kart İşlem Bedeli (%)',
  'Kartla ödemede tutarın üstüne eklenen işlem bedeli yüzdesi (ödeme altyapısı komisyonunu karşılar). Cüzdandan ödemede uygulanmaz. 0 yapılırsa özellik tamamen kapanır ve ekranlarda hiç görünmez.',
  true, 0, 15
)
ON CONFLICT (key) DO NOTHING;

-- ─── 2) Raporlama: çekilen bedel niyette ayrı kolonda durur ─────────────────
-- (commission_amount HİZMET komisyonudur; ikisi karışmasın diye ayrı tutulur.)
ALTER TABLE public.payment_intents
  ADD COLUMN IF NOT EXISTS card_fee_amount numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.payment_intents.card_fee_amount IS
  'Kart yolunda tabana eklenen işlem bedeli. amount = taban + card_fee_amount.';

-- ─── 3) Ekranların ödeme öncesi okuduğu tek kaynak ──────────────────────────
-- Ödeme ekranı bunu çağırıp "Kart işlem bedeli" satırını ve toplamı gösterir;
-- sunucudaki hesapla birebir aynı yuvarlama kullanılır ki ekranda yazan tutar
-- ile karttan çekilen tutar asla ayrışmasın.
CREATE OR REPLACE FUNCTION public.get_card_fee_quote(p_amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pct numeric := COALESCE(public.get_config_number('card_fee_pct', 2.5), 2.5);
  v_base numeric := round(GREATEST(COALESCE(p_amount, 0), 0), 2);
  v_fee numeric;
BEGIN
  v_fee := CASE WHEN v_pct > 0 THEN round(v_base * v_pct / 100.0, 2) ELSE 0 END;
  RETURN jsonb_build_object(
    'pct', v_pct,
    'base', v_base,
    'fee', v_fee,
    'total', round(v_base + v_fee, 2),
    'enabled', v_pct > 0
  );
END;
$$;

-- anon DA çağırabilir: kullanıcı üye olmadan ödeme ekranını görüyor (üyelik
-- kapısı ödeme anında çıkıyor). Kota misafire kapalı olsaydı ekran bedeli
-- göstermez ama sunucu eklerdi — ekrandaki tutar ile çekilen tutar ayrışırdı.
-- Fonksiyon yalnız herkese açık bir ayar sayısını okur; kullanıcı verisi yok.
REVOKE ALL ON FUNCTION public.get_card_fee_quote(numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_card_fee_quote(numeric) TO authenticated, anon;

-- ─── 4) Niyet üretimi: bedel karta eklenir, komisyon TABANDAN hesaplanır ────
-- Değişen tek şey fiyat kırılımı; akış doğrulamaları (sahiplik, iptal, slot
-- doluluk, min/max yükleme, hız limiti, idempotency) aynen korunur.
CREATE OR REPLACE FUNCTION public.prepare_card_payment(
  p_user_id uuid,
  p_flow text,
  p_amount numeric DEFAULT NULL,
  p_booking_id uuid DEFAULT NULL,
  p_match_id uuid DEFAULT NULL,
  p_slot_ids text[] DEFAULT NULL,
  p_use_balance boolean DEFAULT false,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_b RECORD;
  v_buckets RECORD;
  v_balance_applied numeric := 0;
  v_card_base numeric;              -- hizmetin karttan karşılanan TABAN tutarı
  v_card_fee numeric := 0;          -- yalnız kart yolundaki işlem bedeli
  v_fee_pct numeric := COALESCE(public.get_config_number('card_fee_pct', 2.5), 2.5);
  v_card_amount numeric;            -- karttan ÇEKİLEN toplam (taban + bedel)
  v_total numeric;
  v_comm jsonb;
  v_intent public.payment_intents;
  v_existing public.payment_intents;
  v_slots jsonb; v_price numeric; v_sid text; v_slot jsonb; v_count int := 0;
  v_min numeric; v_max numeric;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF v_fee_pct < 0 THEN v_fee_pct := 0; END IF;

  IF p_idempotency_key IS NOT NULL AND btrim(p_idempotency_key) <> '' THEN
    SELECT * INTO v_existing FROM public.payment_intents
    WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key
      AND status IN ('PENDING','PAID','CAPTURED','BLOCKED')
    ORDER BY created_at DESC LIMIT 1;
    IF FOUND THEN
      -- Aynı denemenin retry'ı: fiyat kırılımı da ilk niyetten aynen döner.
      RETURN jsonb_build_object(
        'intent_id', v_existing.id,
        'card_amount', v_existing.amount,
        'card_base', COALESCE((v_existing.raw->>'card_base')::numeric, v_existing.amount),
        'card_fee', COALESCE(v_existing.card_fee_amount, 0),
        'card_fee_pct', COALESCE((v_existing.raw->>'card_fee_pct')::numeric, 0),
        'balance_applied', COALESCE((v_existing.raw->>'balance_applied')::numeric, 0),
        'currency', COALESCE(v_existing.currency, 'TRY'),
        'idempotent', true,
        'reused', true,
        'status', v_existing.status
      );
    END IF;
  END IF;

  -- [S4] HIZ LİMİTİ: yalnız yeni intent üretiminden önce (reuse yolu hariç).
  PERFORM public._check_payment_rate_limit(p_user_id);

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
    v_card_base := round(p_amount - v_balance_applied, 2);
    IF v_card_base <= 0 THEN RAISE EXCEPTION 'NO_CARD_AMOUNT: Kart tutarı yok (bakiye karşılıyor).'; END IF;
    v_card_fee := CASE WHEN v_fee_pct > 0 THEN round(v_card_base * v_fee_pct / 100.0, 2) ELSE 0 END;
    v_card_amount := round(v_card_base + v_card_fee, 2);

    -- Komisyon TABANDAN: işlem bedeli hizmet cirosu değildir, altyapı maliyetidir.
    v_comm := public.calculate_commission(v_card_base, 'PITCH', v_b.pitch_id);
    INSERT INTO public.payment_intents (
      user_id, booking_id, pitch_id, amount, currency, status, provider,
      commission_amount, owner_amount, service_provider_amount,
      commission_model, related_entity_type, raw, idempotency_key, card_fee_amount
    ) VALUES (
      p_user_id, p_booking_id, v_b.pitch_id, v_card_amount, 'TRY', 'PENDING', 'IYZICO',
      (v_comm->>'commission_amt')::numeric, (v_comm->>'net_amount')::numeric, 0,
      v_comm->>'model', 'BOOKING',
      jsonb_build_object('flow', p_flow, 'full_amount', p_amount,
                         'balance_applied', v_balance_applied, 'use_balance', p_use_balance,
                         'card_base', v_card_base, 'card_fee', v_card_fee, 'card_fee_pct', v_fee_pct),
      p_idempotency_key, v_card_fee
    ) RETURNING * INTO v_intent;

  ELSIF p_flow = 'TOP_UP' THEN
    -- Alt/üst sınır CÜZDANA YÜKLENECEK tutara bakar; işlem bedeli sınırı yemez.
    v_min := COALESCE(public.get_config_number('wallet_topup_min', 300), 300);
    v_max := COALESCE(public.get_config_number('wallet_topup_max', 20000), 20000);
    IF p_amount IS NULL OR p_amount < v_min THEN
      RAISE EXCEPTION 'MIN_TOPUP: Minimum yükleme tutarı %₺''dir.', v_min::int;
    END IF;
    IF p_amount > v_max THEN
      RAISE EXCEPTION 'MAX_TOPUP: Tek seferde en fazla %₺ yüklenebilir.', v_max::int;
    END IF;
    v_card_base := round(p_amount, 2);
    v_card_fee := CASE WHEN v_fee_pct > 0 THEN round(v_card_base * v_fee_pct / 100.0, 2) ELSE 0 END;
    v_card_amount := round(v_card_base + v_card_fee, 2);
    INSERT INTO public.payment_intents (
      user_id, amount, currency, status, provider,
      commission_amount, owner_amount, service_provider_amount,
      commission_model, related_entity_type, raw, idempotency_key, card_fee_amount
    ) VALUES (
      p_user_id, v_card_amount, 'TRY', 'PENDING', 'IYZICO',
      0, 0, 0, 'MODEL_A', 'TOP_UP',
      jsonb_build_object('flow', p_flow, 'full_amount', v_card_base,
                         'card_base', v_card_base, 'card_fee', v_card_fee, 'card_fee_pct', v_fee_pct),
      p_idempotency_key, v_card_fee
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
    v_card_base := round(v_total - v_balance_applied, 2);
    IF v_card_base <= 0 THEN RAISE EXCEPTION 'NO_CARD_AMOUNT: Kart tutarı yok (bakiye karşılıyor).'; END IF;
    v_card_fee := CASE WHEN v_fee_pct > 0 THEN round(v_card_base * v_fee_pct / 100.0, 2) ELSE 0 END;
    v_card_amount := round(v_card_base + v_card_fee, 2);

    v_comm := public.calculate_commission(v_card_base, 'GLOBAL');
    INSERT INTO public.payment_intents (
      user_id, match_id, amount, currency, status, provider,
      commission_amount, owner_amount, service_provider_amount,
      commission_model, related_entity_type, raw, idempotency_key, card_fee_amount
    ) VALUES (
      p_user_id, p_match_id, v_card_amount, 'TRY', 'PENDING', 'IYZICO',
      (v_comm->>'commission_amt')::numeric, (v_comm->>'net_amount')::numeric, 0,
      v_comm->>'model', 'MATCH',
      jsonb_build_object('flow', p_flow, 'full_amount', v_total, 'slot_ids', to_jsonb(p_slot_ids),
                         'balance_applied', v_balance_applied, 'use_balance', p_use_balance,
                         'card_base', v_card_base, 'card_fee', v_card_fee, 'card_fee_pct', v_fee_pct),
      p_idempotency_key, v_card_fee
    ) RETURNING * INTO v_intent;

  ELSE
    RAISE EXCEPTION 'INVALID_FLOW: %', p_flow;
  END IF;

  RETURN jsonb_build_object(
    'intent_id', v_intent.id,
    'card_amount', v_card_amount,     -- karttan çekilecek TOPLAM (taban + bedel)
    'card_base', v_card_base,
    'card_fee', v_card_fee,
    'card_fee_pct', v_fee_pct,
    'balance_applied', v_balance_applied,
    'currency', 'TRY'
  );
END;
$$;

-- ─── 5) Tahsilat: karşı tarafa/cüzdana yalnız TABAN yazılır ─────────────────
-- Tek davranış değişikliği TOP_UP'tadır: cüzdana artık çekilen toplam değil,
-- kullanıcının yüklemek istediği taban tutar geçer. Diğer akışlarda zaten
-- full_amount (taban) kullanılıyordu; iade dalları bilinçle TOPLAM iade eder.
CREATE OR REPLACE FUNCTION public.apply_card_payment(p_intent_id uuid, p_provider_ref text DEFAULT NULL, p_raw jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
  -- Bedel öncesi taban: eski niyetlerde kolon/anahtar yoksa amount'a düşer.
  v_base := COALESCE((v_i.raw->>'card_base')::numeric, round(v_i.amount - v_fee, 2));

  UPDATE public.payment_intents
  SET status = 'PAID', paid_at = now(),
      provider_ref = COALESCE(p_provider_ref, provider_ref),
      raw = COALESCE(raw, '{}'::jsonb) || COALESCE(p_raw, '{}'::jsonb)
  WHERE id = p_intent_id;

  IF v_flow = 'BOOKING_DEPOSIT' THEN
    SELECT * INTO v_b FROM public.pitch_bookings WHERE id = v_i.booking_id FOR UPDATE;
    -- Bu arada iptal/ödenmişse: çekilen TOPLAMI (bedel dahil) iade kredisine çevir
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

    -- Sahaya işlenen tutar TABANDIR; işlem bedeli notta ayrıca görünür.
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
    -- KRİTİK: cüzdana TABAN yüklenir; işlem bedeli bakiyeye dönüşmez.
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

    -- SMS doğrulaması sürerken yerler dolduysa: çekilen TOPLAM iade kredisine
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

    -- Legacy mutabakat işareti: maç defterine TABAN yazılır (bedel hariç);
    -- quorum onay/iptal hesapları bu tutardan okur.
    INSERT INTO public.wallet_transactions (user_id, match_id, amount, type, status, description, meta)
    VALUES (v_i.user_id, v_i.match_id, -v_full, 'MATCH_FEE', 'COMPLETED', 'Maç katılım ücreti',
            jsonb_build_object('balance_applied', v_bal, 'card_amount', v_base, 'card_fee', v_fee));

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

    -- Katılım indeksi: kart yolundan gelen oyuncu da maçın katılımcısıdır.
    -- player_buy_slots_v2__inner ile BİREBİR aynı kalıp — kart yolu bu satırı
    -- hiç yazmıyordu, dolayısıyla kartla katılan oyuncu türetilmiş katılım
    -- listelerinde (kadro/no-show/istatistik) görünmüyordu.
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
$$;

-- ============================================================================
-- SON. Bu migration uygulandığında: kart ödemesinde bedel ayrı satır olarak
-- görünür ve karttan taban+bedel çekilir; cüzdan yolunda hiçbir şey değişmez.
-- Oranı 0 yapmak özelliği tamamen kapatır (ekranlar satırı gizler).
-- ============================================================================
