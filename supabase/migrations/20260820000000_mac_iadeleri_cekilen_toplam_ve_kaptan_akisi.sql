-- ════════════════════════════════════════════════════════════════════════════
-- MAÇ İADELERİ ÇEKİLEN TOPLAMA GEÇTİ · KAPTAN AYRILMA AKIŞI NETLEŞTİ
-- ----------------------------------------------------------------------------
-- KURUCU KARARLARI (20 Ağustos 2026, canlı doğrulama gecesi):
--   1. "Çekilen neyse ekrana onu yaz." → iade motoru da ÇEKİLEN tutardan
--      hesaplar; ekran ile motor aynı rakamı söyler.
--   3. "Evet çek." → maç iadeleri de rezervasyon iadeleriyle AYNI kurala
--      geçer: taban = karttan çekilen toplam, kesinti = yalnız ödeme
--      altyapısı bedeli (19 Ağustos kuralı).
--   2. Kaptan ayrılması: "maç minimum sayıya ulaştıysa maç aktif olmuş
--      demektir." → kadroda başka gerçek oyuncu VARSA kaptanlık devri
--      (mevcut davranış) maçı yaşatır; kimse YOKSA ayrılış fiilen iptaldir
--      ve mevcut iptal motoru (match_cancel_by_captain) çalışır — kapora
--      kuralı, rezervasyon iptali ve bildirim tek yoldan işler.
--
-- CANLIDA ÖLÇÜLEN HATALAR (bu göç öncesi):
--   • 130 ₺ ödeyen oyuncu tam-iade penceresinde 120 ₺ alıyordu (bedel +
--     yuvarlama sessizce OYNA'da kalıyordu; karar 125,45 ₺ diyor).
--   • Kaptan "Maçtan Ayrıl" deyince maç ACTIVE kalıyor, 1.000 ₺'lik kapora
--     PAID olarak kilitleniyor, iade kuyruğuna hiç düşmüyordu.
--   • Kaptan iptalinde katılımcıların parası hiç iade edilmiyordu (yalnız
--     kapora ele alınıyordu).
--   • Kaporası ödenmemiş maç vitrinde YAYINDA görünüyor ve katılım ödemesi
--     kabul ediyordu; süpürücü maçı silince katılan parasız kalırdı.
--   • Geçmiş saate (bugün 09:00'a gece 23:44'te) rezervasyon yazılabiliyordu.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1 · Kullanıcının maç ödeme profili: taban / çekilen / katsayı ────────────
-- Defter (wallet_transactions.MATCH_FEE) kanaldan bağımsız TABAN tutar,
-- kart niyetleri (payment_intents, flow=MATCH_JOIN) ÇEKİLEN tutardır.
-- Katsayı = çekilen / taban; eski cüzdan ödemelerinde 1'dir (bedel yoktu).
CREATE OR REPLACE FUNCTION public._match_charge_profile(p_user_id uuid, p_match_id uuid)
RETURNS TABLE(base_paid numeric, charged_paid numeric, uplift numeric, has_card boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_card_charged numeric; v_card_base numeric;
BEGIN
  SELECT COALESCE(SUM(-amount), 0) INTO base_paid
  FROM public.wallet_transactions
  WHERE user_id = p_user_id AND match_id = p_match_id AND type = 'MATCH_FEE';

  SELECT COALESCE(SUM(pi.amount), 0),
         COALESCE(SUM(pi.amount - COALESCE(pi.card_fee_amount, 0)
                                 - COALESCE(pi.rounding_amount, 0)), 0)
    INTO v_card_charged, v_card_base
  FROM public.payment_intents pi
  WHERE pi.user_id = p_user_id AND pi.match_id = p_match_id
    AND pi.raw->>'flow' = 'MATCH_JOIN'
    AND pi.provider <> 'WALLET'
    AND pi.status IN ('PAID', 'CAPTURED');

  -- Cüzdanla karşılanan kısım (varsa) çekilene taban değeriyle katılır.
  charged_paid := round(v_card_charged + GREATEST(base_paid - v_card_base, 0), 2);
  uplift := CASE WHEN base_paid > 0 THEN charged_paid / base_paid ELSE 1 END;
  has_card := v_card_charged > 0;
  RETURN NEXT;
END;
$fn$;

-- ── 2 · Ayrılma sözleşmesi: rakamlar artık ÇEKİLEN dünyasında ────────────────
-- Ek olarak kaptan bağlamı da döner: arayüz tek çağrıyla doğru diyalogu kurar
-- (kaptan mı, kadroda başkası var mı, kapora ne olur).
CREATE OR REPLACE FUNCTION public._leave_match_quote(p_match_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_starts_at timestamptz; v_pitch_id uuid;
  v_penalty numeric := public.get_config_number('fairplay_late_cancel_penalty', 10);
  t RECORD; prof RECORD; m RECORD;
  v_already numeric; v_charged_remaining numeric;
  v_price numeric; v_release_count int; v_base numeric;
  v_occupies boolean; v_hours numeric; v_in_squad boolean;
  v_pct numeric; v_late boolean;
  v_released_charged numeric; v_gross numeric; v_psp numeric; v_refundable numeric;
  v_is_captain boolean; v_others int := 0;
  v_dep_refundable numeric := 0; v_dep_late boolean := false; v_dep_full_hours numeric;
BEGIN
  SELECT starts_at, pitch_id, COALESCE(price, 0)
    INTO v_starts_at, v_pitch_id, v_price
    FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Maç bulunamadı.'; END IF;

  SELECT * INTO m FROM public.matches WHERE id = p_match_id;
  SELECT * INTO t FROM public._pitch_refund_tiers(v_pitch_id);
  SELECT * INTO prof FROM public._match_charge_profile(p_user_id, p_match_id);

  -- Gerçekte iade edilenler (karta kuyruklanan tutarlar — çekilen dünyası).
  SELECT COALESCE(SUM(amount), 0) INTO v_already FROM public.wallet_transactions
    WHERE user_id = p_user_id AND match_id = p_match_id AND type IN ('MATCH_REFUND','REFUND');
  v_charged_remaining := GREATEST(prof.charged_paid - v_already, 0);

  -- Ayrılınca serbest kalacak slotlar (taban dünyasında sayılır).
  SELECT (SELECT COUNT(*) FROM (
            SELECT s FROM jsonb_array_elements(mm.slots) s
            UNION ALL
            SELECT s FROM jsonb_array_elements(COALESCE(mm."awaySlots",'[]'::jsonb)) s
          ) q(s)
          WHERE q.s->>'purchasedBy' = p_user_id::text
            AND (COALESCE(NULLIF(q.s->>'occupant',''), q.s->'player'->>'id') IS NULL
                 OR COALESCE(NULLIF(q.s->>'occupant',''), q.s->'player'->>'id') = p_user_id::text))
  INTO v_release_count
  FROM public.matches mm WHERE mm.id = p_match_id;

  IF v_release_count > 0 THEN
    v_base := LEAST(v_price * v_release_count, GREATEST(prof.base_paid, 0));
  ELSE
    SELECT CASE WHEN EXISTS (
      SELECT 1 FROM public.matches mm,
        LATERAL (SELECT s FROM jsonb_array_elements(mm.slots) s
                 UNION ALL
                 SELECT s FROM jsonb_array_elements(COALESCE(mm."awaySlots",'[]'::jsonb)) s) q(s)
      WHERE mm.id = p_match_id
        AND COALESCE(NULLIF(q.s->>'occupant',''), q.s->'player'->>'id') = p_user_id::text
        AND COALESCE(q.s->>'purchasedBy','') = ''
    ) THEN GREATEST(prof.base_paid, 0) ELSE 0 END INTO v_base;
  END IF;
  v_base := COALESCE(v_base, 0);

  SELECT EXISTS (
    SELECT 1 FROM public.matches mm,
      LATERAL (SELECT s FROM jsonb_array_elements(mm.slots) s
               UNION ALL
               SELECT s FROM jsonb_array_elements(COALESCE(mm."awaySlots",'[]'::jsonb)) s) q(s)
    WHERE mm.id = p_match_id
      AND COALESCE(NULLIF(q.s->>'occupant',''), q.s->'player'->>'id') = p_user_id::text
  ) INTO v_occupies;

  v_in_squad := v_occupies OR v_release_count > 0;

  v_hours := CASE WHEN v_starts_at IS NULL THEN 999
                  ELSE EXTRACT(EPOCH FROM (v_starts_at - timezone('utc', now()))) / 3600 END;

  v_pct := CASE WHEN NOT v_in_squad          THEN 100
                WHEN v_hours >= t.full_hours THEN 100
                WHEN v_hours >= t.half_hours THEN t.half_pct
                ELSE 0 END;

  -- ÇEKİLEN dünyasına geçiş (kurucu kararı, 19-20 Ağustos):
  -- taban × katsayı = o slotlar için karttan gerçekten çekilmiş tutar.
  v_released_charged := LEAST(round(v_base * prof.uplift, 2), v_charged_remaining);
  v_gross := round(v_released_charged * v_pct / 100.0, 2);
  v_psp   := CASE WHEN prof.has_card AND v_pct > 0
                  THEN public._psp_fee(v_released_charged) ELSE 0 END;
  v_refundable := GREATEST(0, v_gross - v_psp);

  v_late := v_in_squad AND v_hours < t.full_hours;

  -- Kaptan bağlamı: arayüz doğru akışı tek çağrıyla kursun.
  v_is_captain := (m."creatorId" = p_user_id);
  IF v_is_captain THEN
    SELECT count(*) INTO v_others FROM (
      SELECT s FROM jsonb_array_elements(m.slots) s
      UNION ALL
      SELECT s FROM jsonb_array_elements(COALESCE(m."awaySlots",'[]'::jsonb)) s
    ) q(s)
    WHERE COALESCE(NULLIF(q.s->>'occupant',''), q.s->'player'->>'id') IS NOT NULL
      AND COALESCE(NULLIF(q.s->>'occupant',''), q.s->'player'->>'id') <> p_user_id::text;

    -- Kapora önizlemesi (match_void_deposit kuralının aynası):
    -- serbest-iptal penceresi açıkken PSP kesintili iade; kapandıysa yanar.
    IF m.deposit_status = 'BLOCKED' AND m.deposit_intent_id IS NOT NULL THEN
      SELECT t2.full_hours INTO v_dep_full_hours FROM public._pitch_refund_tiers(m.pitch_id) t2;
      v_dep_late := v_hours < COALESCE(v_dep_full_hours, 24);
      IF NOT v_dep_late THEN
        SELECT GREATEST(round(pi.amount - public._psp_fee(pi.amount), 2), 0)
          INTO v_dep_refundable
        FROM public.payment_intents pi WHERE pi.id = m.deposit_intent_id;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'refundable',       v_refundable,
    'paid',             round(prof.charged_paid, 2),
    'paid_base',        round(prof.base_paid, 2),
    'released_charged', v_released_charged,
    'psp_fee',          v_psp,
    'already_refunded', (v_already > 0),
    'in_squad',         v_in_squad,
    'hours_to_start',   round(v_hours, 2),
    'refund_pct',       v_pct,
    'full_hours',       t.full_hours,
    'half_hours',       t.half_hours,
    'half_pct',         t.half_pct,
    'late',             v_late,
    'penalty',          CASE WHEN v_late THEN v_penalty ELSE 0 END,
    'forfeited',        round(GREATEST(v_released_charged - v_gross, 0), 2),
    'is_captain',       v_is_captain,
    'squad_others',     v_others,
    'captain_cancels_match', (v_is_captain AND v_others = 0),
    'deposit_status',   m.deposit_status,
    'deposit_amount',   COALESCE(m.deposit_amount, 0),
    'deposit_charged',  COALESCE((SELECT pi.amount FROM public.payment_intents pi
                                   WHERE pi.id = m.deposit_intent_id), 0),
    'deposit_refundable', v_dep_refundable,
    'deposit_late',     v_dep_late
  );
END;
$fn$;

-- ── 3 · Tam-tutar iade yazıcısı (sözleşmenin dediği kuruş neyse o) ───────────
CREATE OR REPLACE FUNCTION public._match_refund_exact(
  p_user_id uuid, p_match_id uuid, p_amount numeric, p_reason text DEFAULT 'Slot iadesi')
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  prof RECORD; v_already numeric; v_remaining numeric; v_amount numeric;
BEGIN
  SELECT * INTO prof FROM public._match_charge_profile(p_user_id, p_match_id);
  SELECT COALESCE(SUM(amount), 0) INTO v_already FROM public.wallet_transactions
   WHERE user_id = p_user_id AND match_id = p_match_id AND type IN ('MATCH_REFUND','REFUND');
  v_remaining := GREATEST(prof.charged_paid - v_already, 0);
  v_amount := LEAST(round(GREATEST(COALESCE(p_amount, 0), 0), 2), v_remaining);
  IF v_amount <= 0 THEN RETURN 0; END IF;
  PERFORM public._iade_kullaniciya_mac(p_user_id, p_match_id, v_amount, p_reason, 'MATCH_REFUND');
  RETURN v_amount;
END;
$fn$;

-- ── 4 · Kısmi iade: taban-tavanlı çağıranlar için, artık çekilen dünyasında ──
-- p_cap TABAN dünyasında gelir (kick/release slot fiyatı yollar; iptal/dolmama
-- NULL yollar = kalan her şey). Kesinti (PSP) kart ödemesi varsa uygulanır —
-- 19 Ağustos kuralı: "İadeden yalnız ödeme altyapısı bedeli düşülür."
DROP FUNCTION IF EXISTS public._match_refund_partial(uuid, uuid, numeric);
CREATE OR REPLACE FUNCTION public._match_refund_partial(
  p_user_id uuid, p_match_id uuid, p_cap numeric, p_apply_psp boolean DEFAULT true)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  prof RECORD; v_already numeric;
  v_base_remaining numeric; v_charged_remaining numeric;
  v_released_base numeric; v_released_charged numeric;
  v_psp numeric := 0; v_pay numeric;
BEGIN
  SELECT * INTO prof FROM public._match_charge_profile(p_user_id, p_match_id);
  SELECT COALESCE(SUM(amount), 0) INTO v_already FROM public.wallet_transactions
   WHERE user_id = p_user_id AND match_id = p_match_id AND type IN ('MATCH_REFUND','REFUND');

  v_charged_remaining := GREATEST(prof.charged_paid - v_already, 0);
  -- Taban kalanı: katsayı üzerinden geri çevrilir (eski iadeler çekilen
  -- dünyasında yazılmış olabilir; tavan cömerte değil kalana bağlanır).
  v_base_remaining := CASE WHEN prof.uplift > 0
                           THEN round(v_charged_remaining / prof.uplift, 2)
                           ELSE 0 END;

  v_released_base := LEAST(COALESCE(p_cap, v_base_remaining), v_base_remaining);
  IF v_released_base <= 0 THEN RETURN 0; END IF;

  v_released_charged := LEAST(round(v_released_base * prof.uplift, 2), v_charged_remaining);
  IF p_apply_psp AND prof.has_card THEN
    v_psp := public._psp_fee(v_released_charged);
  END IF;
  v_pay := GREATEST(round(v_released_charged - v_psp, 2), 0);
  IF v_pay <= 0 THEN RETURN 0; END IF;

  PERFORM public._iade_kullaniciya_mac(p_user_id, p_match_id, v_pay,
    'Slot iadesi', 'MATCH_REFUND');
  RETURN v_pay;
END;
$fn$;

-- ── 5 · Kaptan yalnızsa ayrılış = iptal (tek motor: match_cancel_by_captain) ─
-- leave_public_match_slot'a dokunuş: kaptan ayrılıyor ve kadroda başka gerçek
-- oyuncu yoksa maç yaşayamaz — iptal motoru çağrılır (kapora kuralı, katılımcı
-- iadesi, rezervasyon iptali ve bildirim tek yoldan). Başka oyuncu varsa
-- mevcut kaptanlık devri aynen işler; iade tutarı artık sözleşmenin çekilen-
-- taban rakamıdır ve _match_refund_exact ile kuruşu kuruşuna yazılır.
DO $patch$
DECLARE
  v_def text;
  v_anchor CONSTANT text :=
'    -- (b) Sözleşme kilitten SONRA, slotlar değişmeden ÖNCE okunur; böylece
    -- kullanıcıya gösterilen önizlemeyle aynı girdiden hesaplanır.';
  v_insert CONSTANT text :=
'    -- (b0) KAPTAN YALNIZSA AYRILIŞ = İPTAL (kurucu kararı, 20 Ağu 2026):
    -- kadroda kendisinden başka oturan yoksa maç yaşayamaz. İptal motoru
    -- kapora kuralını, katılımcı iadelerini, rezervasyon iptalini ve
    -- bildirimi tek yoldan işletir; burada kopyası tutulmaz.
    IF v_creator = p_user_id THEN
        IF NOT EXISTS (
            SELECT 1 FROM (
                SELECT s FROM jsonb_array_elements(v_slots) s
                UNION ALL
                SELECT s FROM jsonb_array_elements(v_away) s
            ) q(s)
            WHERE COALESCE(NULLIF(q.s->>''occupant'',''''), q.s->''player''->>''id'') IS NOT NULL
              AND COALESCE(NULLIF(q.s->>''occupant'',''''), q.s->''player''->>''id'') <> p_user_id::text
        ) THEN
            PERFORM public.match_cancel_by_captain(p_match_id);
            RETURN;
        END IF;
    END IF;

';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'leave_public_match_slot';

  IF v_def IS NULL THEN RAISE EXCEPTION 'leave_public_match_slot bulunamadı'; END IF;
  IF position(v_anchor in v_def) = 0 THEN
    RAISE EXCEPTION 'leave_public_match_slot çapası bulunamadı — gövde değişmiş, göç elden geçmeli';
  END IF;
  IF position('KAPTAN YALNIZSA AYRILIŞ' in v_def) > 0 THEN
    RAISE NOTICE 'leave_public_match_slot zaten yamalı (idempotent).';
  ELSE
    v_def := replace(v_def, v_anchor, v_insert || v_anchor);
    -- İade çağrısı: sözleşme rakamı artık nihai kuruştur; taban-tavanlı
    -- kısmi iadeci yerine tam-tutar yazıcı kullanılır.
    IF position('_match_refund_partial(p_user_id, p_match_id, v_refundable)' in v_def) = 0 THEN
      RAISE EXCEPTION 'leave_public_match_slot iade çapası bulunamadı';
    END IF;
    v_def := replace(v_def,
      '_match_refund_partial(p_user_id, p_match_id, v_refundable)',
      '_match_refund_exact(p_user_id, p_match_id, v_refundable)');
    EXECUTE v_def;
  END IF;
END;
$patch$;

-- ── 6 · Kaptan iptali artık KATILIMCILARI da iade eder ───────────────────────
-- (canlıda ölçüldü: yalnız kapora ele alınıyordu; katılan paralar askıda
-- kalırdı). Kural: iptal katılımcının suçu değildir → %100, kesinti yalnız
-- PSP bedeli (kart ödemesiyse). Kaptanın kendi MATCH_FEE satırı yoktur;
-- onun parası kapora dalında zaten ele alınır.
DO $patch$
DECLARE
  v_def text;
  v_anchor CONSTANT text :=
'  -- HER başarı dalında: bağlı rezervasyon iptal — slot sahibin takviminde';
  v_insert CONSTANT text :=
'  -- KATILIMCI İADELERİ (20 Ağu 2026): iptal kaptanın kararıdır; katılan
  -- herkesin ödemesi çekilen-taban üzerinden, yalnız PSP kesintisiyle döner.
  DECLARE v_payer RECORD;
  BEGIN
    FOR v_payer IN
      SELECT wt.user_id FROM public.wallet_transactions wt
      WHERE wt.match_id = p_match_id AND wt.type = ''MATCH_FEE''
        AND wt.user_id IS DISTINCT FROM COALESCE(v_match."creatorId", v_match.captain_id)
      GROUP BY wt.user_id
    LOOP
      PERFORM public._match_refund_partial(v_payer.user_id, p_match_id, NULL, true);
    END LOOP;
  END;

';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'match_cancel_by_captain';

  IF v_def IS NULL THEN RAISE EXCEPTION 'match_cancel_by_captain bulunamadı'; END IF;
  IF position('KATILIMCI İADELERİ' in v_def) > 0 THEN
    RAISE NOTICE 'match_cancel_by_captain zaten yamalı (idempotent).';
  ELSE
    IF position(v_anchor in v_def) = 0 THEN
      RAISE EXCEPTION 'match_cancel_by_captain çapası bulunamadı — gövde değişmiş';
    END IF;
    v_def := replace(v_def, v_anchor, v_insert || v_anchor);
    EXECUTE v_def;
  END IF;
END;
$patch$;

-- ── 7 · Kapora süpürücüsü de katılımcıları iade eder ─────────────────────────
-- Kaporasız maç 30 dk sonra düşerken içine ödeme yapmış biri varsa parası
-- askıda kalmasın. (Vitrin kapısı [madde 9] bunu zaten büyük ölçüde önler;
-- bu, kapının arkasındaki ikinci kattır — prensip 6.1.)
DO $patch$
DECLARE
  v_def text;
  v_anchor CONSTANT text :=
'    UPDATE public.pitch_bookings
       SET status = ''CANCELLED'', cancelled_at = now(),
           cancellation_reason = ''Maç kaporası ödenmedi — slot serbest bırakıldı.''
     WHERE match_id = v_m.id AND status <> ''CANCELLED'';';
  v_insert CONSTANT text :=
'
    -- Katılımcı iadeleri (20 Ağu 2026): süpürülen maça para ödemiş herkes
    -- çekilen-taban üzerinden, yalnız PSP kesintisiyle iade alır.
    DECLARE v_payer RECORD;
    BEGIN
      FOR v_payer IN
        SELECT wt.user_id FROM public.wallet_transactions wt
        WHERE wt.match_id = v_m.id AND wt.type = ''MATCH_FEE''
        GROUP BY wt.user_id
      LOOP
        PERFORM public._match_refund_partial(v_payer.user_id, v_m.id, NULL, true);
      END LOOP;
    END;';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'sweep_awaiting_deposit_matches';

  IF v_def IS NULL THEN RAISE EXCEPTION 'sweep_awaiting_deposit_matches bulunamadı'; END IF;
  IF position('Katılımcı iadeleri (20 Ağu 2026)' in v_def) > 0 THEN
    RAISE NOTICE 'sweep_awaiting_deposit_matches zaten yamalı (idempotent).';
  ELSE
    IF position(v_anchor in v_def) = 0 THEN
      RAISE EXCEPTION 'sweep_awaiting_deposit_matches çapası bulunamadı — gövde değişmiş';
    END IF;
    v_def := replace(v_def, v_anchor, v_anchor || v_insert);
    EXECUTE v_def;
  END IF;
END;
$patch$;

-- ── 8 · Kaporası ödenmemiş maça KATILIM kapısı ───────────────────────────────
-- Vitrin filtresi arayüzü korur; bu kapı parayı korur (prensip 6.1: kapı
-- arayüze güvenmez). Kapora onaylanmadan hiçbir katılım ödemesi başlayamaz.
DO $patch$
DECLARE
  v_def text;
  v_anchor CONSTANT text :=
'    SELECT slots, price INTO v_slots, v_price FROM public.matches WHERE id = p_match_id;
    IF v_slots IS NULL THEN RAISE EXCEPTION ''NOT_FOUND: Maç bulunamadı''; END IF;';
  v_insert CONSTANT text :=
'
    IF EXISTS (SELECT 1 FROM public.matches
               WHERE id = p_match_id AND deposit_status = ''AWAITING_PAYMENT'') THEN
      RAISE EXCEPTION ''MATCH_NOT_READY: Maçın kaporası henüz ödenmedi; kapora onaylanınca katılım açılır.'';
    END IF;';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'prepare_card_payment';

  IF v_def IS NULL THEN RAISE EXCEPTION 'prepare_card_payment bulunamadı'; END IF;
  IF position('MATCH_NOT_READY' in v_def) > 0 THEN
    RAISE NOTICE 'prepare_card_payment zaten yamalı (idempotent).';
  ELSE
    IF position(v_anchor in v_def) = 0 THEN
      RAISE EXCEPTION 'prepare_card_payment çapası bulunamadı — gövde değişmiş';
    END IF;
    v_def := replace(v_def, v_anchor, v_anchor || v_insert);
    EXECUTE v_def;
  END IF;
END;
$patch$;

-- ── 9 · Vitrin: kaporası ödenmemiş maç YAYINDA görünmez ──────────────────────
-- Kaptan kendi maçını Maçlarım'dan görmeye devam eder (get_my_matches ayrı
-- yoldur); vitrin ve lobi bu görünümden beslenir.
DO $view$
DECLARE v_def text;
BEGIN
  v_def := pg_get_viewdef('public.public_matches'::regclass, true);
  IF position('AWAITING_PAYMENT' in v_def) > 0 THEN
    RAISE NOTICE 'public_matches zaten filtreli (idempotent).';
  ELSE
    IF position('WHERE' in v_def) = 0 THEN
      RAISE EXCEPTION 'public_matches WHERE bulunamadı — görünüm değişmiş';
    END IF;
    -- Mevcut koşul OR içeriyor: filtre parantezle DIŞINA sarılır, yoksa
    -- AND/OR önceliği filtreyi demo modunda devre dışı bırakırdı.
    v_def := rtrim(v_def);
    v_def := rtrim(v_def, ';');
    v_def := 'CREATE OR REPLACE VIEW public.public_matches AS '
      || replace(v_def, 'WHERE',
                 'WHERE (m.deposit_status IS DISTINCT FROM ''AWAITING_PAYMENT'') AND (')
      || ');';
    EXECUTE v_def;
  END IF;
END;
$view$;

-- ── 10 · Geçmiş saate rezervasyon kapısı (sunucu katmanı) ────────────────────
-- Canlıda ölçüldü: gece 23:44'te BUGÜN 09:00 seçilebiliyor ve ödeme
-- başlatılabiliyordu. Arayüz saati artık kapatıyor; bu, arayüze güvenmeyen
-- ikinci kat. Tesis kendi kaydını (OWNER_MANUAL) geçmişe yazabilir — defter
-- tutmak meşru; uygulama akışları yazamaz.
DO $patch$
DECLARE
  v_def text;
  v_anchor CONSTANT text :=
'  IF v_end_ts <= v_start_ts THEN
    v_end_ts := v_end_ts + INTERVAL ''1 day'';
  END IF;';
  v_insert CONSTANT text :=
'
  IF p_source IN (''APP_BOOKING'', ''APP_MATCH'')
     AND v_start_ts <= (now() AT TIME ZONE ''Europe/Istanbul'') THEN
    RAISE EXCEPTION ''SLOT_IN_PAST: Geçmiş bir saat için rezervasyon alınamaz.'';
  END IF;';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'create_pitch_booking';

  IF v_def IS NULL THEN RAISE EXCEPTION 'create_pitch_booking bulunamadı'; END IF;
  IF position('SLOT_IN_PAST' in v_def) > 0 THEN
    RAISE NOTICE 'create_pitch_booking zaten yamalı (idempotent).';
  ELSE
    IF position(v_anchor in v_def) = 0 THEN
      RAISE EXCEPTION 'create_pitch_booking çapası bulunamadı — gövde değişmiş';
    END IF;
    v_def := replace(v_def, v_anchor, v_anchor || v_insert);
    EXECUTE v_def;
  END IF;
END;
$patch$;

-- ── 11 · Sunucu bildirim metni: "cüzdanına döndü" → karta iade gerçeği ───────
-- player_kick_slot'un bildirimi cüzdan diyordu; iade karta kuyruklanır.
DO $patch$
DECLARE v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'player_kick_slot';
  IF v_def IS NULL THEN RAISE EXCEPTION 'player_kick_slot bulunamadı'; END IF;
  IF position('iade kredisi olarak cüzdanına döndü' in v_def) = 0 THEN
    RAISE NOTICE 'player_kick_slot metni zaten güncel (idempotent).';
  ELSE
    v_def := replace(v_def,
      ' Ödemen iade kredisi olarak cüzdanına döndü.',
      ' Ödemen kartına iade edilmek üzere işleme alındı.');
    EXECUTE v_def;
  END IF;
END;
$patch$;

-- ════════════════════════════ DOĞRULAMA ═════════════════════════════════════
-- Göç kendi iddiasını kanıtlar; kanıtlayamazsa geri alınır (transaction).
DO $dogrula$
DECLARE
  v_txt text; v_q jsonb; v_fee numeric;
BEGIN
  -- (a) PSP bedeli: 130 ₺ çekilen için 4,55 (oran %3,5 iken).
  v_fee := public._psp_fee(130);
  IF (SELECT refund_psp_fee_pct FROM public.settings LIMIT 1) = 3.5 AND v_fee <> 4.55 THEN
    RAISE EXCEPTION 'DOGRULAMA: _psp_fee(130) beklenen 4.55, gelen %', v_fee;
  END IF;

  -- (b) Sözleşme yeni alanları taşıyor mu (ölü uuid ile NOT_FOUND beklenir,
  --     alan denetimi fonksiyon gövdesinden yapılır).
  SELECT pg_get_functiondef(p.oid) INTO v_txt FROM pg_proc p
   JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = '_leave_match_quote';
  IF position('released_charged' in v_txt) = 0 OR position('captain_cancels_match' in v_txt) = 0 THEN
    RAISE EXCEPTION 'DOGRULAMA: _leave_match_quote yeni alanları taşımıyor';
  END IF;

  -- (c) Ayrılma yolu: kaptan-yalnız dalı ve tam-tutar yazıcı bağlı mı.
  SELECT pg_get_functiondef(p.oid) INTO v_txt FROM pg_proc p
   JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'leave_public_match_slot';
  IF position('match_cancel_by_captain' in v_txt) = 0
     OR position('_match_refund_exact' in v_txt) = 0 THEN
    RAISE EXCEPTION 'DOGRULAMA: leave_public_match_slot yaması eksik';
  END IF;

  -- (d) İptal motoru katılımcıları iade ediyor mu.
  SELECT pg_get_functiondef(p.oid) INTO v_txt FROM pg_proc p
   JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'match_cancel_by_captain';
  IF position('KATILIMCI İADELERİ' in v_txt) = 0 THEN
    RAISE EXCEPTION 'DOGRULAMA: match_cancel_by_captain katılımcı iadesi eksik';
  END IF;

  -- (e) Katılım kapısı ve vitrin filtresi.
  SELECT pg_get_functiondef(p.oid) INTO v_txt FROM pg_proc p
   JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'prepare_card_payment';
  IF position('MATCH_NOT_READY' in v_txt) = 0 THEN
    RAISE EXCEPTION 'DOGRULAMA: prepare_card_payment katılım kapısı eksik';
  END IF;
  IF position('AWAITING_PAYMENT' in pg_get_viewdef('public.public_matches'::regclass, true)) = 0 THEN
    RAISE EXCEPTION 'DOGRULAMA: public_matches vitrin filtresi eksik';
  END IF;

  -- (f) Geçmiş saat kapısı.
  SELECT pg_get_functiondef(p.oid) INTO v_txt FROM pg_proc p
   JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'create_pitch_booking';
  IF position('SLOT_IN_PAST' in v_txt) = 0 THEN
    RAISE EXCEPTION 'DOGRULAMA: create_pitch_booking geçmiş saat kapısı eksik';
  END IF;

  RAISE NOTICE 'DOGRULAMA TAMAM — maç iadeleri çekilen dünyasında, kaptan akışı bağlı.';
END;
$dogrula$;
