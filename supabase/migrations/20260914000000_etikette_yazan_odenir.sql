-- ════════════════════════════════════════════════════════════════════════════
-- ETİKETTE YAZAN ÖDENİR — kart işlem bedeli ve yuvarlama tahsilattan kalktı
-- ----------------------------------------------------------------------------
-- KURUCU KARARI (20 Ağustos 2026): "Kullanıcı herhangi bir maçta slotta kaç
-- lira yazıyorsa ONU ödemeli; ödeme ekranında artmış ücretle ASLA
-- karşılaşmamalı. Bu kararı her yere uygula. Maç ücretlerini belirlerken bu
-- kuralı dikkate alalım."
--
-- Bu karar 19 Ağustos modelini (%3,5 kart işlem bedeli + 10'un katına YUKARI
-- yuvarlama; 20260911000000) İPTAL EDER. O model 90 ₺ yazan slotu ödeme
-- ekranında 100 ₺ yapıyordu: kurucu bunu canlıda kendisi gördü ve "zam" diye
-- raporladı. Yeni dünyada altyapı maliyeti ve yuvarlak-rakam isteği FİYAT
-- BELİRLENİRKEN düşünülür (son cümlenin anlamı bu); tahsilat anında rakam
-- DEĞİŞTİRİLMEZ.
--
-- DÖRT AKIŞIN DÖRDÜ DE AYNI KURALA GEÇER (yarım istisna bırakmak, "her yere
-- uygula" talimatının tersi olurdu):
--   BOOKING_DEPOSIT · TOP_UP · MATCH_JOIN · MATCH_DEPOSIT → çekilen = taban.
--
-- GERİYE DÖNÜK UYUM:
--   · payment_intents.card_fee_amount / rounding_amount kolonları KALIYOR —
--     eski niyetlerde sıfırdan büyük değerler var; iade motoru "çekilen toplam"
--     modeliyle (20260911000001) onları doğru işlemeye devam eder. Yeni
--     niyetlerde ikisi de 0 yazılır.
--   · raw içindeki card_base/card_fee/card_fee_pct/card_rounding anahtarları
--     0 değerleriyle KALIYOR — başarı/iade ekranları ve raporlar bu şekli okur.
--   · get_card_fee_quote RPC'si KALIYOR (eski istemciler çağırıyor) ama artık
--     dürüstçe 0 döner: total = base. Eski istemci +0 hesaplar, yeni tutarla
--     birebir aynı rakamı gösterir.
--
-- `_odeme_yuvarla` bu göçte DÜŞÜRÜLMEZ: demo tohumlayıcının canlıdaki sürümü
-- hâlâ ona başvuruyor. Sökme, tohumlayıcı kanonik sürümüne geçtikten sonra
-- (20260914000001) yapılır — sıra bilinçli.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) prepare_card_payment: çekilen = taban ────────────────────────────────
CREATE OR REPLACE FUNCTION public.prepare_card_payment(p_user_id uuid, p_flow text, p_amount numeric DEFAULT NULL::numeric, p_booking_id uuid DEFAULT NULL::uuid, p_match_id uuid DEFAULT NULL::uuid, p_slot_ids text[] DEFAULT NULL::text[], p_use_balance boolean DEFAULT false, p_idempotency_key text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_b RECORD;
  v_m RECORD;
  v_buckets RECORD;
  v_balance_applied numeric := 0;
  v_card_base numeric;              -- hizmetin karttan karşılanan TABAN tutarı
  -- ETİKETTE YAZAN ÖDENİR (kurucu kararı, 20 Ağu 2026): işlem bedeli ve
  -- yuvarlama tahsilattan kalktı. Alanlar rapor/iade uyumu için 0 olarak
  -- yazılmaya devam eder; karttan çekilen HER akışta tabanın kendisidir.
  v_card_fee numeric := 0;
  v_fee_pct numeric := 0;
  v_card_amount numeric;            -- karttan ÇEKİLEN toplam = taban
  v_total numeric;
  v_comm jsonb;
  v_intent public.payment_intents;
  v_existing public.payment_intents;
  v_slots jsonb; v_price numeric; v_sid text; v_slot jsonb; v_count int := 0;
  v_min numeric; v_max numeric;
  v_rounding numeric := 0;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

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
        'card_rounding', COALESCE(v_existing.rounding_amount, 0),
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
    -- ETİKETTE YAZAN ÖDENİR: ek yok, çekilen = taban.
    v_card_amount := v_card_base;

    -- Komisyon TABANDAN: işlem bedeli hizmet cirosu değildir, altyapı maliyetidir.
    v_comm := public.calculate_commission(v_card_base, 'PITCH', v_b.pitch_id);
    INSERT INTO public.payment_intents (
      user_id, booking_id, pitch_id, amount, currency, status, provider,
      commission_amount, owner_amount, service_provider_amount,
      commission_model, related_entity_type, raw, idempotency_key, card_fee_amount, rounding_amount
    ) VALUES (
      p_user_id, p_booking_id, v_b.pitch_id, v_card_amount, 'TRY', 'PENDING', 'IYZICO',
      (v_comm->>'commission_amt')::numeric, (v_comm->>'net_amount')::numeric, 0,
      v_comm->>'model', 'BOOKING',
      jsonb_build_object('flow', p_flow, 'full_amount', p_amount,
                         'balance_applied', v_balance_applied, 'use_balance', p_use_balance,
                         'card_base', v_card_base, 'card_fee', v_card_fee, 'card_fee_pct', v_fee_pct, 'card_rounding', v_rounding),
      p_idempotency_key, v_card_fee, v_rounding
    ) RETURNING * INTO v_intent;

  ELSIF p_flow = 'TOP_UP' THEN
    -- Alt/üst sınır CÜZDANA YÜKLENECEK tutara bakar.
    v_min := COALESCE(public.get_config_number('wallet_topup_min', 300), 300);
    v_max := COALESCE(public.get_config_number('wallet_topup_max', 20000), 20000);
    IF p_amount IS NULL OR p_amount < v_min THEN
      RAISE EXCEPTION 'MIN_TOPUP: Minimum yükleme tutarı %₺''dir.', v_min::int;
    END IF;
    IF p_amount > v_max THEN
      RAISE EXCEPTION 'MAX_TOPUP: Tek seferde en fazla %₺ yüklenebilir.', v_max::int;
    END IF;
    v_card_base := round(p_amount, 2);
    -- ETİKETTE YAZAN ÖDENİR: ek yok, çekilen = taban.
    v_card_amount := v_card_base;
    INSERT INTO public.payment_intents (
      user_id, amount, currency, status, provider,
      commission_amount, owner_amount, service_provider_amount,
      commission_model, related_entity_type, raw, idempotency_key, card_fee_amount, rounding_amount
    ) VALUES (
      p_user_id, v_card_amount, 'TRY', 'PENDING', 'IYZICO',
      0, 0, 0, 'MODEL_A', 'TOP_UP',
      jsonb_build_object('flow', p_flow, 'full_amount', v_card_base,
                         'card_base', v_card_base, 'card_fee', v_card_fee, 'card_fee_pct', v_fee_pct, 'card_rounding', v_rounding),
      p_idempotency_key, v_card_fee, v_rounding
    ) RETURNING * INTO v_intent;

  ELSIF p_flow = 'MATCH_JOIN' THEN
    IF p_match_id IS NULL OR p_slot_ids IS NULL OR array_length(p_slot_ids, 1) IS NULL THEN
      RAISE EXCEPTION 'NO_SLOTS: En az bir slot seç';
    END IF;
    SELECT slots, price INTO v_slots, v_price FROM public.matches WHERE id = p_match_id;
    IF v_slots IS NULL THEN RAISE EXCEPTION 'NOT_FOUND: Maç bulunamadı'; END IF;
    IF EXISTS (SELECT 1 FROM public.matches
               WHERE id = p_match_id AND deposit_status = 'AWAITING_PAYMENT') THEN
      RAISE EXCEPTION 'MATCH_NOT_READY: Maçın kaporası henüz ödenmedi; kapora onaylanınca katılım açılır.';
    END IF;
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
    -- ETİKETTE YAZAN ÖDENİR: slotta yazan × adet — kuruşu kuruşuna.
    v_card_amount := v_card_base;

    v_comm := public.calculate_commission(v_card_base, 'GLOBAL');
    INSERT INTO public.payment_intents (
      user_id, match_id, amount, currency, status, provider,
      commission_amount, owner_amount, service_provider_amount,
      commission_model, related_entity_type, raw, idempotency_key, card_fee_amount, rounding_amount
    ) VALUES (
      p_user_id, p_match_id, v_card_amount, 'TRY', 'PENDING', 'IYZICO',
      (v_comm->>'commission_amt')::numeric, (v_comm->>'net_amount')::numeric, 0,
      v_comm->>'model', 'MATCH',
      jsonb_build_object('flow', p_flow, 'full_amount', v_total, 'slot_ids', to_jsonb(p_slot_ids),
                         'balance_applied', v_balance_applied, 'use_balance', p_use_balance,
                         'card_base', v_card_base, 'card_fee', v_card_fee, 'card_fee_pct', v_fee_pct, 'card_rounding', v_rounding),
      p_idempotency_key, v_card_fee, v_rounding
    ) RETURNING * INTO v_intent;

  ELSIF p_flow = 'MATCH_DEPOSIT' THEN
    -- KART KAPORASI (16 Ağu 2026): tutar SUNUCUDAN — matches.deposit_amount.
    IF p_match_id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND: Maç bilgisi eksik.'; END IF;
    SELECT id, "creatorId", captain_id, deposit_status, deposit_amount, pitch_id, commission_model, status
      INTO v_m FROM public.matches WHERE id = p_match_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Maç bulunamadı.'; END IF;
    IF COALESCE(v_m."creatorId", v_m.captain_id) IS DISTINCT FROM p_user_id THEN
      RAISE EXCEPTION 'FORBIDDEN: Kaporayı yalnız maçı kuran kaptan öder.';
    END IF;
    IF v_m.status = 'CANCELLED' THEN RAISE EXCEPTION 'MATCH_CANCELLED: Maç iptal edilmiş.'; END IF;
    IF v_m.deposit_status <> 'AWAITING_PAYMENT' THEN
      RAISE EXCEPTION 'ALREADY_BLOCKED: Bu maçın kaporası zaten işlenmiş (%).', v_m.deposit_status;
    END IF;
    IF COALESCE(v_m.deposit_amount, 0) <= 0 THEN
      RAISE EXCEPTION 'INVALID_AMOUNT: Bu maç için kapora tanımlı değil.';
    END IF;

    v_card_base := round(v_m.deposit_amount, 2);
    -- ETİKETTE YAZAN ÖDENİR: ek yok, çekilen = kapora tutarının kendisi.
    v_card_amount := v_card_base;

    -- Kapora ciro değil GÜVENCEDİR: komisyon/hakediş dağılımı yazılmaz.
    INSERT INTO public.payment_intents (
      user_id, match_id, pitch_id, amount, currency, status, provider,
      commission_amount, owner_amount, service_provider_amount,
      commission_model, related_entity_type, raw, idempotency_key, card_fee_amount, rounding_amount
    ) VALUES (
      p_user_id, p_match_id, v_m.pitch_id, v_card_amount, 'TRY', 'PENDING', 'IYZICO',
      0, 0, 0, COALESCE(v_m.commission_model, 'MODEL_A'), 'MATCH_DEPOSIT',
      jsonb_build_object('flow', p_flow, 'full_amount', v_card_base,
                         'card_base', v_card_base, 'card_fee', v_card_fee, 'card_fee_pct', v_fee_pct, 'card_rounding', v_rounding),
      p_idempotency_key, v_card_fee, v_rounding
    ) RETURNING * INTO v_intent;

  ELSE
    RAISE EXCEPTION 'INVALID_FLOW: %', p_flow;
  END IF;

  RETURN jsonb_build_object(
    'intent_id', v_intent.id,
    'card_amount', v_card_amount,     -- karttan çekilecek TOPLAM = taban
    'card_base', v_card_base,
    'card_fee', v_card_fee,
    'card_rounding', v_rounding,
    'card_fee_pct', v_fee_pct,
    'balance_applied', v_balance_applied,
    'currency', 'TRY'
  );
END;
$function$;

-- ── 2) get_card_fee_quote: dürüst sıfır (eski istemciler için uyum) ────────
CREATE OR REPLACE FUNCTION public.get_card_fee_quote(p_amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_t numeric := round(GREATEST(COALESCE(p_amount, 0), 0), 2);
BEGIN
  -- ETİKETTE YAZAN ÖDENİR (20 Ağu 2026): bedel/yuvarlama yok. RPC, sahadaki
  -- eski uygulamalar hâlâ çağırdığı için KALIYOR; +0 hesaplayıp aynı rakamı
  -- gösterirler. enabled=false → bedel cümlesi kuran ekran metinleri kapanır.
  RETURN jsonb_build_object(
    'pct',      0,
    'base',     v_t,
    'fee',      0,
    'rounding', 0,
    'total',    v_t,
    'enabled',  false
  );
END;
$function$;

-- ── 3) Panel anahtarı dürüst kalsın ─────────────────────────────────────────
-- Fonksiyonlar artık bu anahtarı OKUMUYOR; 3,5 yazan bir panel satırı yalancı
-- bir düğme olurdu. 0'a çekilir ve açıklaması kararı söyler.
INSERT INTO public.app_config (key, value, value_type, category, label, description, is_public)
VALUES ('card_fee_pct', '0'::jsonb, 'number', 'ODEME',
        'Kart İşlem Bedeli % (KALDIRILDI)',
        'Kurucu kararı (20 Ağu 2026): etikette yazan ödenir — tahsilata bedel/yuvarlama eklenmez ve bu anahtar artık hiçbir hesapta OKUNMAZ. Satır, eski panellerin hata vermemesi için 0 değeriyle duruyor.',
        false)
ON CONFLICT (key) DO UPDATE
SET value = '0'::jsonb,
    label = EXCLUDED.label,
    description = EXCLUDED.description;

-- ── Doğrulama (prensip 7.7) ────────────────────────────────────────────────
DO $dog$
DECLARE
  v_q jsonb;
  v_src text;
BEGIN
  -- Teklif RPC'si: buçuklu etiket buçuklu döner, ek yok, özellik kapalı.
  v_q := public.get_card_fee_quote(93.15);
  IF (v_q->>'total')::numeric <> 93.15
     OR (v_q->>'fee')::numeric <> 0
     OR (v_q->>'rounding')::numeric <> 0
     OR (v_q->>'enabled')::boolean THEN
    RAISE EXCEPTION 'DOGRULAMA: get_card_fee_quote hala ek hesapliyor: %', v_q;
  END IF;

  -- Tahsilat fonksiyonu: yuvarlama motoruna ve yukari-yuvarlamaya basvuru YOK.
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'prepare_card_payment';
  IF v_src LIKE '%\_odeme\_yuvarla%' ESCAPE '\' OR v_src ILIKE '%ceil(%' THEN
    RAISE EXCEPTION 'DOGRULAMA: prepare_card_payment icinde yuvarlama kalmis';
  END IF;
  IF position('v_card_amount := v_card_base' in v_src) = 0 THEN
    RAISE EXCEPTION 'DOGRULAMA: cekilen = taban ataması bulunamadi';
  END IF;

  -- Panel anahtari 0 ve dürüst.
  IF (SELECT value FROM public.app_config WHERE key = 'card_fee_pct') <> '0'::jsonb THEN
    RAISE EXCEPTION 'DOGRULAMA: card_fee_pct 0 degil';
  END IF;

  RAISE NOTICE 'DOGRULAMA TAMAM: etikette yazan odenir — dort akista da cekilen = taban.';
END $dog$;
