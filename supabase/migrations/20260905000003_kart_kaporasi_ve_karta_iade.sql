-- ════════════════════════════════════════════════════════════════════════════
-- KART KAPORASI + KARTA İADE (kurucu kararı, 16 Ağustos 2026 — ikinci tur)
-- ----------------------------------------------------------------------------
-- KARAR: Kapora KARTTAN ödenir (hem maç kurma hem saha kiralama) ve iptalde
-- iade KARTA döner — varsayılan serbest-iptal penceresi 24 saattir ve iadeye
-- ödeme altyapısı kesintisi (_psp_fee) yansıtılır. Cüzdan KAPALI kalır
-- (20260905000001, §2.10): iadeler artık uygulama içi krediye DEĞİL, tahsil
-- edilen karta döner.
--
-- Bu göç dört şey kurar:
--
--  A) KARTA İADE KUYRUĞU (card_refund_queue). Veritabanı iyzico'yu eşzamanlı
--     çağıramaz; iade kararı ANINDA kuyruğa yazılır, kuyruk cron ile
--     refund-payment ucundan işlenir (SIMULATION'da anında biter). Zehirli iş
--     kuralı 7.5: 3 denemede geçmeyen satır FAILED durur, insan bakar.
--     Muhasebe: her karta iade, cüzdan defterine BAKİYESİZ bir satır olarak da
--     yazılır (balance_type NULL → hiçbir kovaya girmez, bakiye DOĞMAZ) —
--     "zaten iade edildi mi" korumaları ve raporlar tek defterden okumaya
--     devam eder.
--
--  B) MAÇ KAPORASI = KART AKIŞI. create_match_atomic değişmeden kalır;
--     match_block_deposit artık para OYNATMAZ: maçı AWAITING_PAYMENT'a alır
--     (tutar + sağlayıcı istekleri maça yazılır), kaptan ödeme ekranına gider,
--     kart tahsilatı onaylanınca (apply_card_payment · MATCH_DEPOSIT akışı)
--     kapora BLOCKED olur, kaptan kadroya oturur, sağlayıcı istekleri çıkar.
--     Ödeme 30 dakikada gelmezse süpürücü maçı ve rezervasyonu iptal eder
--     (7.4: ödeme alınmadıysa alınmasın).
--
--  C) KAPORA YAŞAM DÖNGÜSÜ KART-FARKINDALIĞI. Kadro dolunca fazla kısım
--     (kapora − kişi başı pay) karta TAM iade edilir (kesinti yok — iptal
--     değil, tasarlanmış akış). Maç iptalinde/kaptan cayması serbest-iptal
--     penceresi içindeyse iade NET yapılır (tutar − _psp_fee); pencere
--     kapandıysa kapora yanar. Pencere sahanın refund_full_hours ayarıdır
--     (varsayılan 24 — _pitch_refund_tiers SSOT).
--
--  D) İADE YAZARLARI YENİDEN BAĞLANDI. process_tiered_refund ·
--     process_match_refund · _match_refund_partial · cancel_app_booking ·
--     _refund_wallet_escrow: kartla ödenmiş niyetlerde hedef artık kuyruk;
--     eski cüzdan-emanet (provider='WALLET') kayıtları için eski davranış
--     korunur (demo/tarihsel veri kırılmaz).
--
-- Saha kiralama kaporası zaten kartla tahsil ediliyordu (BOOKING_DEPOSIT);
-- bu göç yalnız İADESİNİ karta çevirir. Varsayılan kademe değişmedi:
-- ≥24 saat %100 · 6–24 saat %50 · <6 saat yok (saha kendi ayarıyla ezebilir).
--
-- İdempotent: tekrar uygulanması güvenlidir.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 0 · Ayarlar ─────────────────────────────────────────────────────────────
UPDATE public.app_config
   SET value = 'true'::jsonb
 WHERE key = 'match_deposit_enabled';

INSERT INTO public.app_config (key, value, value_type, category, label, description, is_public, min_value, max_value) VALUES
  ('match_deposit_timeout_min', '30'::jsonb, 'number', 'ODEME',
   'Kapora Ödeme Süresi (dk)',
   'Maç yayınlandıktan sonra kaptanın kart kaporasını tamamlaması için tanınan süre. Dolunca süpürücü maçı ve rezervasyonu iptal eder (7.4: ödeme alınmadıysa alınmasın).',
   false, 5, 240)
ON CONFLICT (key) DO NOTHING;

-- ── A1 · Karta iade kuyruğu ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.card_refund_queue (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_id     uuid NOT NULL REFERENCES public.payment_intents(id),
  user_id       uuid NOT NULL,
  match_id      uuid,
  booking_id    uuid,
  amount        numeric NOT NULL CHECK (amount > 0),
  reason        text NOT NULL,
  status        text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','DONE','FAILED')),
  attempts      int  NOT NULL DEFAULT 0,
  last_error    text,
  provider_ref  text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  processed_at  timestamptz
);

COMMENT ON TABLE public.card_refund_queue IS
  'Karta iade kuyruğu: iade kararı burada doğar, refund-payment ucu (cron) iyzico''ya taşır. SIMULATION''da anında DONE. 3 denemede geçmeyen FAILED durur (7.5).';

CREATE INDEX IF NOT EXISTS idx_card_refund_queue_pending
  ON public.card_refund_queue (status, created_at) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_card_refund_queue_intent
  ON public.card_refund_queue (intent_id);

-- Kapı: istemciden erişim YOK (6.1). Sistem service_role ile yazar/okur;
-- admin paneli ileride kendi RPC'siyle bakar.
ALTER TABLE public.card_refund_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.card_refund_queue FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.card_refund_queue TO service_role;

-- ── A2 · Kuyruğa yazan çekirdek ─────────────────────────────────────────────
-- Tavan: niyetin karttan çektiği toplam − daha önce kuyruğa yazılmış (FAILED
-- hariç) tutarlar. Çift iade FİZİKSEL olarak imkânsızlaşır.
CREATE OR REPLACE FUNCTION public._iade_karta_kuyruga(
  p_intent_id uuid, p_amount numeric, p_reason text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_i public.payment_intents; v_kuyrukta numeric; v_id uuid;
BEGIN
  IF COALESCE(p_amount, 0) <= 0 THEN RETURN NULL; END IF;
  SELECT * INTO v_i FROM public.payment_intents WHERE id = p_intent_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: iade için niyet bulunamadı (%)', p_intent_id; END IF;
  IF v_i.provider = 'WALLET' THEN
    RAISE EXCEPTION 'INVALID_PROVIDER: cüzdan emaneti karta iade kuyruğuna giremez.';
  END IF;
  IF v_i.status NOT IN ('PAID','CAPTURED','REFUNDED') THEN
    RAISE EXCEPTION 'INVALID_STATE: tahsil edilmemiş niyet iade edilemez (%)', v_i.status;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_kuyrukta
  FROM public.card_refund_queue
  WHERE intent_id = p_intent_id AND status <> 'FAILED';
  IF v_kuyrukta + p_amount > v_i.amount + 0.01 THEN
    RAISE EXCEPTION 'OVER_REFUND: kuyruktaki % + istenen %, çekilen % tutarını aşıyor.',
      round(v_kuyrukta, 2), round(p_amount, 2), round(v_i.amount, 2);
  END IF;

  INSERT INTO public.card_refund_queue (intent_id, user_id, match_id, booking_id, amount, reason)
  VALUES (p_intent_id, v_i.user_id, v_i.match_id, v_i.booking_id, round(p_amount, 2), p_reason)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public._iade_karta_kuyruga(uuid, numeric, text) FROM PUBLIC, anon, authenticated;

-- ── A3 · Maç iadesi bölüştürücüsü ──────────────────────────────────────────
-- "Bu kullanıcıya bu maç için X₺ iade et" kararını gerçek ödeme kaynaklarına
-- dağıtır: önce kartla ödenmiş katılım niyetleri (yeniden eskiye) kuyruğa,
-- kalan (eski cüzdanla ödenmiş kısım) iade kredisine. Defter satırı her iki
-- kolda da yazılır — kart kolunda KOVASIZ (bakiye doğmaz), kredi kolunda
-- REFUND_CREDIT (eski davranış).
CREATE OR REPLACE FUNCTION public._iade_kullaniciya_mac(
  p_user_id uuid, p_match_id uuid, p_amount numeric, p_reason text, p_tx_type text DEFAULT 'REFUND'
) RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_kalan numeric := round(GREATEST(COALESCE(p_amount,0), 0), 2);
  v_karta numeric := 0;
  r RECORD;
  v_taban numeric; v_kuyrukta numeric; v_pay numeric;
BEGIN
  IF v_kalan <= 0 THEN RETURN 0; END IF;

  FOR r IN
    SELECT * FROM public.payment_intents
    WHERE user_id = p_user_id AND match_id = p_match_id
      AND raw->>'flow' = 'MATCH_JOIN'
      AND provider <> 'WALLET'
      AND status IN ('PAID','CAPTURED')
    ORDER BY created_at DESC
  LOOP
    EXIT WHEN v_kalan <= 0;
    -- İade tabanı hizmet tutarıdır (kart işlem bedeli iade dışı — sözleşme:
    -- ödeme altyapısı işlem bedeli her iadede hariçtir).
    v_taban := COALESCE((r.raw->>'card_base')::numeric, r.amount);
    SELECT COALESCE(SUM(amount), 0) INTO v_kuyrukta
    FROM public.card_refund_queue WHERE intent_id = r.id AND status <> 'FAILED';
    v_pay := LEAST(v_kalan, GREATEST(v_taban - v_kuyrukta, 0));
    IF v_pay > 0 THEN
      PERFORM public._iade_karta_kuyruga(r.id, v_pay, p_reason);
      v_karta := v_karta + v_pay;
      v_kalan := v_kalan - v_pay;
    END IF;
  END LOOP;

  IF v_karta > 0 THEN
    INSERT INTO public.wallet_transactions
      (user_id, match_id, amount, type, balance_type, status, reference_type, description)
    VALUES (p_user_id, p_match_id, v_karta, p_tx_type, NULL, 'COMPLETED', 'REFUND',
            p_reason || ' — karta iade kuyruğuna alındı');
  END IF;

  -- Kalan (varsa) eski cüzdan ödemelerinden geliyordur → iade kredisi (legacy).
  IF v_kalan > 0 THEN
    INSERT INTO public.wallet_transactions
      (user_id, match_id, amount, type, balance_type, status, reference_type, description)
    VALUES (p_user_id, p_match_id, v_kalan, p_tx_type, 'REFUND_CREDIT', 'COMPLETED', 'REFUND',
            p_reason || ' — eski cüzdan ödemesi iade kredisine döndü');
  END IF;
  PERFORM public._sync_wallet_mirror(p_user_id);

  RETURN round(v_karta + GREATEST(v_kalan, 0), 2);
END;
$$;
REVOKE ALL ON FUNCTION public._iade_kullaniciya_mac(uuid, uuid, numeric, text, text) FROM PUBLIC, anon, authenticated;

-- ── D1 · process_match_refund: hedef karta (guard'lar birebir korunur) ──────
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
    RAISE EXCEPTION 'UNAUTHORIZED: Başka bir kullanıcı adına iade yapamazsınız.';
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

  -- Karta yazılan iade satırları da bu toplamda görünür (kovasız satırlar dahil).
  SELECT COALESCE(SUM(amount), 0) INTO v_refunded
  FROM public.wallet_transactions
  WHERE user_id = p_user_id AND match_id = p_match_id AND type IN ('MATCH_REFUND','REFUND');
  IF v_refunded > 0 THEN
    RAISE EXCEPTION 'ZATEN_IADE: Bu maç için zaten iade yapılmış.';
  END IF;

  IF p_amount <> v_paid THEN
    RAISE EXCEPTION 'TUTAR_UYUSMUYOR: İade tutarı % ödenen tutarla % eşleşmiyor.', p_amount, v_paid;
  END IF;

  PERFORM public._iade_kullaniciya_mac(p_user_id, p_match_id, p_amount,
    'Maç iptali / ayrılma iadesi', 'REFUND');
  RETURN TRUE;
END;
$function$;

-- ── D2 · _match_refund_partial: hedef karta (matematik birebir) ─────────────
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

  PERFORM public._iade_kullaniciya_mac(p_user_id, p_match_id, v_amount,
    'Slot iadesi', 'MATCH_REFUND');
  RETURN v_amount;
END;
$$;
REVOKE ALL ON FUNCTION public._match_refund_partial(uuid, uuid, numeric) FROM PUBLIC, anon, authenticated;

-- ── D3 · process_tiered_refund: hedef karta (kademe + PSP birebir) ──────────
CREATE OR REPLACE FUNCTION public.process_tiered_refund(p_intent_id uuid, p_hours_to_match numeric, p_policy text DEFAULT 'MATCH')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_intent public.payment_intents;
  v_uid    uuid := auth.uid();
  s        RECORD;
  v_tier   text;
  v_pct    numeric;
  v_gross  numeric;
  v_psp    numeric;
  v_net    numeric;
  v_rc     integer;
BEGIN
  SELECT * INTO v_intent FROM public.payment_intents WHERE id = p_intent_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_uid IS NOT NULL AND v_intent.user_id IS DISTINCT FROM v_uid AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  IF v_intent.status IN ('PENDING','BLOCKED') THEN
    UPDATE public.payment_intents SET status = 'VOIDED', voided_at = now(),
      void_reason = 'TIERED_REFUND_PRECAPTURE' WHERE id = p_intent_id;
    RETURN jsonb_build_object('intent_id', p_intent_id, 'tier', 'VOID', 'refund', 0, 'psp_fee', 0);
  END IF;
  IF v_intent.status NOT IN ('CAPTURED','PAID') THEN
    RAISE EXCEPTION 'INVALID_STATE: İade yalnızca CAPTURED/PAID için, mevcut: %', v_intent.status;
  END IF;

  SELECT COALESCE(refund_free_hours,8) AS free_h, COALESCE(refund_credit_hours,3) AS credit_h,
         COALESCE(booking_refund_full_hours,24) AS bfull_h, COALESCE(booking_refund_half_hours,6) AS bhalf_h,
         COALESCE(booking_refund_half_pct,50) AS bhalf_pct
  INTO s FROM public.settings LIMIT 1;

  IF p_policy = 'BOOKING' THEN
    IF    p_hours_to_match >= s.bfull_h THEN v_tier := 'FULL_REFUND';    v_pct := 100;
    ELSIF p_hours_to_match >= s.bhalf_h THEN v_tier := 'PARTIAL_REFUND'; v_pct := s.bhalf_pct;
    ELSE  v_tier := 'NO_REFUND'; v_pct := 0; END IF;
  ELSE
    IF    p_hours_to_match >= s.free_h   THEN v_tier := 'FULL_REFUND'; v_pct := 100;
    ELSIF p_hours_to_match >= s.credit_h THEN v_tier := 'CREDIT';      v_pct := 100;
    ELSE  v_tier := 'NO_REFUND'; v_pct := 0; END IF;
  END IF;

  IF v_pct <= 0 THEN
    RETURN jsonb_build_object('intent_id', p_intent_id, 'tier', 'NO_REFUND', 'refund', 0, 'pct', 0, 'hours_to_match', p_hours_to_match);
  END IF;

  v_gross := round(v_intent.amount * v_pct / 100.0, 2);
  v_psp   := public._psp_fee(v_gross);                    -- PSP iade edilen tutara orantılı
  v_net   := GREATEST(0, v_gross - v_psp);

  UPDATE public.payment_intents SET status = 'REFUNDED' WHERE id = p_intent_id;

  -- Owner kazanç telafisi (çift-ödeme önlemi) — birebir korunur.
  UPDATE public.wallet_transactions SET status = 'CANCELLED'
   WHERE reference_type = 'PAYMENT_INTENT' AND reference_id = p_intent_id
     AND type = 'MATCH_EARNING' AND status = 'PENDING';
  GET DIAGNOSTICS v_rc = ROW_COUNT;
  IF v_rc = 0 AND COALESCE(v_intent.owner_amount,0) > 0 AND v_intent.pitch_id IS NOT NULL THEN
    INSERT INTO public.wallet_transactions (user_id, amount, type, balance_type, status, reference_type, reference_id, description)
    SELECT p.owner_id, -v_intent.owner_amount, 'MATCH_EARNING', 'EARNINGS', 'PENDING', 'REFUND', p_intent_id,
           'İade — owner kazanç düzeltmesi (çift-ödeme önlemi)'
    FROM public.pitches p
    WHERE p.id = v_intent.pitch_id AND p.owner_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.wallet_transactions
        WHERE reference_type = 'REFUND' AND reference_id = p_intent_id AND type = 'MATCH_EARNING'
      );
  END IF;

  -- HEDEF: kart niyeti → kuyruk (+ kovasız defter izi); cüzdan emaneti → kredi (legacy).
  IF v_intent.provider <> 'WALLET' THEN
    PERFORM public._iade_karta_kuyruga(p_intent_id, v_net,
      format('Kademeli iade %%%s (PSP -%s) — %s', v_pct, v_psp, p_policy));
    INSERT INTO public.wallet_transactions (user_id, amount, type, balance_type, status, reference_type, reference_id, description)
    VALUES (v_intent.user_id, v_net, 'DEPOSIT', NULL, 'COMPLETED', 'REFUND', p_intent_id,
            format('Kademeli iade %%%s (PSP -%s) — %s — karta iade kuyruğunda', v_pct, v_psp, p_policy));
  ELSE
    INSERT INTO public.wallet_transactions (user_id, amount, type, balance_type, status, reference_type, reference_id, description)
    VALUES (v_intent.user_id, v_net, 'DEPOSIT', 'REFUND_CREDIT', 'COMPLETED', 'REFUND', p_intent_id,
            format('Kademeli iade %%%s (PSP -%s) — %s', v_pct, v_psp, p_policy));
    PERFORM public._sync_wallet_mirror(v_intent.user_id);
  END IF;

  RETURN jsonb_build_object('intent_id', p_intent_id, 'tier', v_tier, 'pct', v_pct,
    'gross', v_gross, 'psp_fee', v_psp, 'refund', v_net, 'hours_to_match', p_hours_to_match);
END;
$$;

-- ── D4 · cancel_app_booking: iade karta (kademe/PSP matematiği birebir) ─────
CREATE OR REPLACE FUNCTION public.cancel_app_booking(p_booking_id uuid, p_reason text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  b RECORD; v_start timestamp;
  v_now_tr timestamp := (now() AT TIME ZONE 'Europe/Istanbul');
  v_q jsonb; v_pct numeric; v_psp numeric; v_refund numeric := 0;
  v_kalan numeric; v_karta numeric := 0; r RECORD; v_taban numeric; v_kuyrukta numeric; v_pay numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED: Giris gerekli.'; END IF;
  SELECT * INTO b FROM public.pitch_bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Rezervasyon bulunamadi.'; END IF;
  IF b.user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'UNAUTHORIZED: Bu rezervasyon size ait degil.'; END IF;
  IF b.source NOT IN ('APP_BOOKING', 'APP_MATCH') THEN RAISE EXCEPTION 'INVALID_SOURCE: Bu rezervasyon uygulamadan iptal edilemez.'; END IF;
  IF b.status = 'CANCELLED' THEN RAISE EXCEPTION 'ALREADY_CANCELLED: Rezervasyon zaten iptal edilmis.'; END IF;
  v_start := (b.booking_date + b.start_time)::timestamp;
  IF v_start <= v_now_tr THEN RAISE EXCEPTION 'ALREADY_STARTED: Gecmis veya baslamis rezervasyon iptal edilemez.'; END IF;
  v_q := public._booking_cancel_quote(COALESCE(b.paid_amount, 0), v_start, b.pitch_id);
  v_pct := (v_q->>'pct')::numeric; v_psp := (v_q->>'psp')::numeric; v_refund := (v_q->>'refund')::numeric;
  UPDATE public.pitch_bookings SET
    status = 'CANCELLED', cancelled_at = now(), cancelled_by = auth.uid(),
    cancellation_reason = COALESCE(p_reason, 'Oyuncu iptali (kademeli iade)'),
    payment_status = CASE WHEN COALESCE(paid_amount, 0) > 0 AND v_refund > 0 THEN 'REFUNDED' ELSE payment_status END
  WHERE id = p_booking_id;
  PERFORM public.reverse_booking_earnings(p_booking_id);

  IF COALESCE(b.paid_amount, 0) > 0 AND v_refund > 0
     AND NOT EXISTS (SELECT 1 FROM public.wallet_transactions
       WHERE user_id = b.user_id AND reference_type = 'BOOKING' AND reference_id = p_booking_id
         AND type IN ('DEPOSIT') AND amount > 0 AND status = 'COMPLETED'
         AND (balance_type = 'REFUND_CREDIT' OR balance_type IS NULL)) THEN
    -- Önce kartla ödenmiş kapora niyetleri (yeniden eskiye) kuyruğa, kalan krediye.
    v_kalan := v_refund;
    FOR r IN
      SELECT * FROM public.payment_intents
      WHERE booking_id = p_booking_id AND user_id = b.user_id
        AND provider <> 'WALLET' AND status IN ('PAID','CAPTURED')
      ORDER BY created_at DESC
    LOOP
      EXIT WHEN v_kalan <= 0;
      v_taban := COALESCE((r.raw->>'card_base')::numeric, r.amount);
      SELECT COALESCE(SUM(amount), 0) INTO v_kuyrukta
      FROM public.card_refund_queue WHERE intent_id = r.id AND status <> 'FAILED';
      v_pay := LEAST(v_kalan, GREATEST(v_taban - v_kuyrukta, 0));
      IF v_pay > 0 THEN
        PERFORM public._iade_karta_kuyruga(r.id, v_pay,
          format('Rezervasyon iptali — %%%s iade (PSP -%s)', v_pct, v_psp));
        v_karta := v_karta + v_pay;
        v_kalan := v_kalan - v_pay;
      END IF;
    END LOOP;

    IF v_karta > 0 THEN
      INSERT INTO public.wallet_transactions
        (user_id, amount, type, balance_type, status, reference_type, reference_id, description)
      VALUES (b.user_id, v_karta, 'DEPOSIT', NULL, 'COMPLETED', 'BOOKING', p_booking_id,
              format('Rezervasyon iptali — %%%s iade (PSP -%s) — karta iade kuyruğunda', v_pct, v_psp));
    END IF;
    IF v_kalan > 0 THEN
      INSERT INTO public.wallet_transactions
        (user_id, amount, type, balance_type, status, reference_type, reference_id, description)
      VALUES (b.user_id, v_kalan, 'DEPOSIT', 'REFUND_CREDIT', 'COMPLETED', 'BOOKING', p_booking_id,
              format('Rezervasyon iptali — %%%s iade (PSP -%s)', v_pct, v_psp));
      PERFORM public._sync_wallet_mirror(b.user_id);
    END IF;
  END IF;
  RETURN jsonb_build_object('booking_id', p_booking_id, 'refund_percent', v_pct, 'refund_amount', v_refund,
    'psp_fee', v_psp, 'paid_amount', COALESCE(b.paid_amount, 0));
END;
$$;

-- ── D5 · _refund_wallet_escrow: adı tarihsel — artık kapora iade merkezidir ─
-- Cüzdan emaneti (provider='WALLET'): eski davranış birebir (iade kredisi).
-- Kart kaporası: NET iade kuyruğa (tutar − _psp_fee) — iptal iadesi kesintili
-- (kurucu kararı: "ödeme altyapısı kesintisi yansıtılarak").
CREATE OR REPLACE FUNCTION public._refund_wallet_escrow(p_intent_id uuid, p_note text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_i public.payment_intents; v_psp numeric; v_net numeric;
BEGIN
  SELECT * INTO v_i FROM public.payment_intents WHERE id = p_intent_id;
  IF NOT FOUND THEN RETURN false; END IF;

  IF v_i.provider = 'WALLET' THEN
    IF EXISTS (
      SELECT 1 FROM public.wallet_transactions
      WHERE reference_type = 'PAYMENT_INTENT' AND reference_id = p_intent_id
        AND balance_type = 'REFUND_CREDIT'
    ) THEN RETURN false; END IF;

    INSERT INTO public.wallet_transactions
      (user_id, match_id, amount, type, balance_type, status, reference_type, reference_id, description)
    VALUES (v_i.user_id, v_i.match_id, v_i.amount, 'DEPOSIT', 'REFUND_CREDIT', 'COMPLETED',
            'PAYMENT_INTENT', p_intent_id,
            COALESCE(p_note, 'Maç kaporası çözüldü — tutar iade kredisine döndü'));
    PERFORM public._sync_wallet_mirror(v_i.user_id);
    RETURN true;
  END IF;

  -- KART: tahsil edilmiş kapora — idempotenlik kuyruk üzerinden.
  IF v_i.status NOT IN ('PAID','CAPTURED','REFUNDED') THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.card_refund_queue WHERE intent_id = p_intent_id AND status <> 'FAILED') THEN
    RETURN false;
  END IF;
  v_psp := public._psp_fee(v_i.amount);
  v_net := GREATEST(0, round(v_i.amount - v_psp, 2));
  IF v_net <= 0 THEN RETURN false; END IF;
  PERFORM public._iade_karta_kuyruga(p_intent_id, v_net,
    COALESCE(p_note, 'Maç kaporası iadesi') || format(' (PSP -%s)', v_psp));
  INSERT INTO public.wallet_transactions
    (user_id, match_id, amount, type, balance_type, status, reference_type, reference_id, description)
  VALUES (v_i.user_id, v_i.match_id, v_net, 'DEPOSIT', NULL, 'COMPLETED',
          'PAYMENT_INTENT', p_intent_id,
          COALESCE(p_note, 'Maç kaporası iadesi') || format(' (PSP -%s) — karta iade kuyruğunda', v_psp));
  UPDATE public.payment_intents SET status = 'REFUNDED' WHERE id = p_intent_id AND status <> 'REFUNDED';
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public._refund_wallet_escrow(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._refund_wallet_escrow(uuid, text) TO service_role;

-- ── B1 · match_block_deposit: para OYNATMAZ — maçı kapora bekler duruma alır ─
-- create_match_atomic çağıranı DEĞİŞMEDEN kalır (v_block->>'deposit_status' ve
-- min_players okur). Kaptan kadroya ÖDEME ONAYINDA oturur (apply · B2).
CREATE OR REPLACE FUNCTION public.match_block_deposit(p_match_id uuid, p_amount numeric, p_providers jsonb DEFAULT '[]'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_match RECORD;
  v_counts RECORD;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT: Kapora tutarı pozitif olmalı.'; END IF;

  SELECT id, "creatorId", captain_id, deposit_status
    INTO v_match FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Maç bulunamadı.'; END IF;
  IF COALESCE(v_match."creatorId", v_match.captain_id) IS DISTINCT FROM v_uid AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Yalnız maçı kuran kaptan kapora sürecini başlatabilir.';
  END IF;
  IF v_match.deposit_status <> 'NONE' THEN
    RAISE EXCEPTION 'ALREADY_BLOCKED: Bu maçın kaporası zaten işlenmiş (%).', v_match.deposit_status;
  END IF;

  SELECT * INTO v_counts FROM public._match_player_counts(p_match_id);

  -- KART DÖNEMİ: cüzdan yok (20260905000001) — burada para hareketi OLMAZ.
  -- Tutar ve sağlayıcı istekleri maça yazılır; tahsilat kartla yapılır
  -- (prepare_card_payment · MATCH_DEPOSIT) ve onayda BLOCKED'a geçer.
  UPDATE public.matches SET
    deposit_status     = 'AWAITING_PAYMENT',
    deposit_amount     = p_amount,
    deferred_providers = COALESCE(p_providers, '[]'::jsonb),
    min_players        = v_counts.min_players,
    status             = 'ACTIVE'
  WHERE id = p_match_id;

  RETURN jsonb_build_object(
    'deposit_status', 'AWAITING_PAYMENT',
    'deposit_amount', p_amount,
    'min_players', v_counts.min_players
  );
END; $function$;

-- ── B2/L · prepare_card_payment: MATCH_DEPOSIT akışı eklendi ────────────────
-- Gövde 20260828000001 tanımının birebir kopyasıdır; yalnız yeni akış dalı
-- eklendi. Tutar SUNUCUDAN okunur (matches.deposit_amount) — istemciden gelen
-- tutara güvenilmez (prensip 2.8).
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
  v_m RECORD;
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
    v_card_fee := CASE WHEN v_fee_pct > 0 THEN round(v_card_base * v_fee_pct / 100.0, 2) ELSE 0 END;
    v_card_amount := round(v_card_base + v_card_fee, 2);

    -- Kapora ciro değil GÜVENCEDİR: komisyon/hakediş dağılımı yazılmaz.
    INSERT INTO public.payment_intents (
      user_id, match_id, pitch_id, amount, currency, status, provider,
      commission_amount, owner_amount, service_provider_amount,
      commission_model, related_entity_type, raw, idempotency_key, card_fee_amount
    ) VALUES (
      p_user_id, p_match_id, v_m.pitch_id, v_card_amount, 'TRY', 'PENDING', 'IYZICO',
      0, 0, 0, COALESCE(v_m.commission_model, 'MODEL_A'), 'MATCH_DEPOSIT',
      jsonb_build_object('flow', p_flow, 'full_amount', v_card_base,
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

-- ── B3/M · apply_card_payment: MATCH_DEPOSIT dalı + başarısızlık iadeleri karta ─
-- Gövde 20260828000001 kopyası; değişenler işaretli. Yarış iadeleri (yer doldu /
-- rezervasyon kapandı / maç kapandı) tahsil edilen TOPLAMI (bedel dahil) karta
-- iade eder — hizmet hiç verilmedi, kesinti uygulanmaz.
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
  v_m RECORD; v_counts RECORD; v_prov jsonb; v_pid text; v_sugg jsonb;
  v_hedef text; v_prof RECORD;
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
    -- Bu arada iptal/ödenmişse: çekilen TOPLAM (bedel dahil) KARTA iade edilir.
    IF NOT FOUND OR v_b.status = 'CANCELLED'
       OR COALESCE(v_b.paid_amount, 0) + v_full > COALESCE(v_b.price, 0) THEN
      PERFORM public._iade_karta_kuyruga(p_intent_id, v_i.amount,
        'Rezervasyon kapandı — kart tahsilatı iade ediliyor');
      INSERT INTO public.wallet_transactions
        (user_id, amount, type, balance_type, status, reference_type, reference_id, description)
      VALUES (v_i.user_id, v_i.amount, 'DEPOSIT', NULL, 'COMPLETED',
              'PAYMENT_INTENT', p_intent_id, 'Rezervasyon kapandı — kart tutarı karta iade kuyruğunda');
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
    -- (Cüzdan kapalıyken TOP_UP niyeti zaten üretilemez — 20260905000001 kapısı.)
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

    -- SMS doğrulaması sürerken yerler dolduysa: çekilen TOPLAM KARTA iade edilir.
    IF v_slots IS NULL THEN v_taken := true;
    ELSE
      FOREACH v_sid IN ARRAY COALESCE(v_slot_ids, ARRAY[]::text[]) LOOP
        SELECT s INTO v_slot FROM jsonb_array_elements(v_slots) s WHERE s->>'id' = v_sid;
        IF v_slot IS NULL OR COALESCE(v_slot->>'status','OPEN') <> 'OPEN' THEN v_taken := true; END IF;
      END LOOP;
    END IF;

    IF v_taken THEN
      PERFORM public._iade_karta_kuyruga(p_intent_id, v_i.amount,
        'Yer dolduğu için kart tahsilatı iade ediliyor');
      INSERT INTO public.wallet_transactions
        (user_id, match_id, amount, type, balance_type, status, reference_type, reference_id, description)
      VALUES (v_i.user_id, v_i.match_id, v_i.amount, 'DEPOSIT', NULL, 'COMPLETED',
              'PAYMENT_INTENT', p_intent_id, 'Yer doldu — kart tutarı karta iade kuyruğunda');
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

  ELSIF v_flow = 'MATCH_DEPOSIT' THEN
    -- KART KAPORASI ONAYI: maç hâlâ kaporayı bekliyorsa BLOCKED'a geç,
    -- kaptanı kadroya oturt, sağlayıcı isteklerini çıkar. Maç bu arada
    -- kapandıysa (süpürücü/iptal) tahsilat TAM iade edilir.
    SELECT m.id, m."creatorId", m.captain_id, m.deposit_status, m.deposit_amount,
           m.deferred_providers, m.slots, m.status AS match_status
      INTO v_m FROM public.matches m WHERE m.id = v_i.match_id FOR UPDATE;

    IF v_m.id IS NULL OR v_m.match_status = 'CANCELLED' OR v_m.deposit_status <> 'AWAITING_PAYMENT' THEN
      PERFORM public._iade_karta_kuyruga(p_intent_id, v_i.amount,
        'Maç kapandı — kapora tahsilatı iade ediliyor');
      INSERT INTO public.wallet_transactions
        (user_id, match_id, amount, type, balance_type, status, reference_type, reference_id, description)
      VALUES (v_i.user_id, v_i.match_id, v_i.amount, 'DEPOSIT', NULL, 'COMPLETED',
              'PAYMENT_INTENT', p_intent_id, 'Maç kapandı — kapora karta iade kuyruğunda');
      UPDATE public.payment_intents
      SET raw = COALESCE(raw, '{}'::jsonb) || jsonb_build_object('result_reason', 'MATCH_CLOSED_REFUNDED')
      WHERE id = p_intent_id;
      RETURN jsonb_build_object('ok', false, 'reason', 'MATCH_CLOSED_REFUNDED', 'refunded', v_i.amount);
    END IF;

    UPDATE public.matches SET
      deposit_intent_id = p_intent_id,
      deposit_status    = 'BLOCKED',
      status            = 'ACTIVE'
    WHERE id = v_i.match_id;

    -- Kaptanı kadroya oturt (ilk BOŞ ev sahibi koltuğu) — eski cüzdan
    -- blokajındaki kalıbın birebir taşınmışı: payı kaporanın içinde.
    v_slots := COALESCE(v_m.slots, '[]'::jsonb);
    SELECT s->>'id' INTO v_hedef
    FROM jsonb_array_elements(v_slots) WITH ORDINALITY AS t(s, ord)
    WHERE COALESCE(s->>'status', 'OPEN') = 'OPEN'
    ORDER BY t.ord
    LIMIT 1;

    IF v_hedef IS NOT NULL THEN
      SELECT full_name, avatar_url, self_skill INTO v_prof FROM public.profiles WHERE id = v_i.user_id;
      v_slots := (
        SELECT jsonb_agg(
          CASE WHEN s->>'id' = v_hedef THEN
            s || jsonb_build_object(
              'status', 'TAKEN',
              'purchasedBy', v_i.user_id::text,
              'assignmentStatus', 'ASSIGNED',
              'occupant', v_i.user_id::text,
              'player', jsonb_build_object(
                'id', v_i.user_id::text,
                'name', COALESCE(v_prof.full_name, 'Kaptan'),
                'avatar', COALESCE(v_prof.avatar_url, ''),
                'position', COALESCE(s->>'role', 'OYUNCU'),
                'selfSkill', v_prof.self_skill,
                'x', COALESCE((s->>'x')::numeric, 50),
                'y', COALESCE((s->>'y')::numeric, 50),
                'paymentStatus', 'PAID'
              ))
          ELSE s END
          ORDER BY t.ord)
        FROM jsonb_array_elements(v_slots) WITH ORDINALITY AS t(s, ord)
      );
      UPDATE public.matches SET slots = v_slots WHERE id = v_i.match_id;

      INSERT INTO public.match_participants (match_id, user_id, role, status, is_buyer, bought_slots)
      VALUES (v_i.match_id, v_i.user_id, 'home', 'confirmed', true, 1)
      ON CONFLICT (match_id, user_id) DO UPDATE SET
        is_buyer = true,
        status = 'confirmed';
    END IF;

    -- Sağlayıcı istekleri ÖDEME ONAYINDA çıkar (para yoksa teklif de yok).
    FOR v_prov IN SELECT * FROM jsonb_array_elements(COALESCE(v_m.deferred_providers, '[]'::jsonb)) LOOP
      IF (v_prov->>'type') IS NOT NULL THEN
        BEGIN
          v_pid := NULLIF(v_prov->>'providerId', '');
          IF v_pid IS NULL THEN
            v_sugg := public.find_providers_for_match(v_i.match_id, (v_prov->>'type')::text);
            v_pid  := v_sugg->0->>'id';
          END IF;
          IF v_pid IS NOT NULL THEN
            PERFORM public.create_service_request(v_i.match_id, v_pid::uuid, (v_prov->>'type')::text);
          END IF;
        EXCEPTION WHEN OTHERS THEN
          RAISE WARNING 'Sağlayıcı talebi gönderilemedi (%): %', v_prov, SQLERRM;
        END;
      END IF;
    END LOOP;

    RETURN jsonb_build_object('ok', true, 'flow', v_flow, 'amount', v_full,
      'deposit_status', 'BLOCKED', 'card_amount', v_i.amount, 'card_fee', v_fee);
  END IF;

  RAISE EXCEPTION 'INVALID_FLOW: %', v_flow;
END;
$$;

-- ── C1 · match_capture_deposit: fazla kısım KARTA tam iade ──────────────────
CREATE OR REPLACE FUNCTION public.match_capture_deposit(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_match RECORD;
  v_intent public.payment_intents;
  v_refund numeric := 0;
BEGIN
  SELECT id, deposit_intent_id, deposit_status, deposit_amount, price, "creatorId", captain_id, title
    INTO v_match
  FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_match.deposit_status <> 'BLOCKED' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'NOT_BLOCKED', 'deposit_status', v_match.deposit_status);
  END IF;

  UPDATE public.payment_intents
    SET status = 'CAPTURED', captured_at = timezone('utc', now())
    WHERE id = v_match.deposit_intent_id
    RETURNING * INTO v_intent;
  UPDATE public.matches SET deposit_status = 'CAPTURED' WHERE id = p_match_id;

  -- Kısmi iade: kapora − kişi başı ücret. Kesinti YOK — iptal değil,
  -- tasarlanmış akış (kaptan yalnız kendi payını ödemiş olur).
  v_refund := round(GREATEST(COALESCE(v_match.deposit_amount, 0) - COALESCE(v_match.price, 0), 0), 2);
  IF v_intent.id IS NOT NULL AND v_refund > 0 THEN
    IF v_intent.provider = 'WALLET' THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.wallet_transactions
        WHERE reference_type = 'PAYMENT_INTENT' AND reference_id = v_intent.id
          AND balance_type = 'REFUND_CREDIT'
      ) THEN
        INSERT INTO public.wallet_transactions
          (user_id, match_id, amount, type, balance_type, status, reference_type, reference_id, description)
        VALUES (v_intent.user_id, v_intent.match_id, v_refund, 'DEPOSIT', 'REFUND_CREDIT', 'COMPLETED',
                'PAYMENT_INTENT', v_intent.id,
                format('Maç doldu — kapora payın dışındaki tutar iade edildi (%s₺ kapora − %s₺ katılım payı)',
                       round(COALESCE(v_match.deposit_amount, 0)), round(COALESCE(v_match.price, 0))));
        PERFORM public._sync_wallet_mirror(v_intent.user_id);
      ELSE
        v_refund := 0;
      END IF;
    ELSE
      IF NOT EXISTS (
        SELECT 1 FROM public.card_refund_queue WHERE intent_id = v_intent.id AND status <> 'FAILED'
      ) THEN
        PERFORM public._iade_karta_kuyruga(v_intent.id, v_refund,
          format('Maç doldu — kapora fazlası iade (%s₺ kapora − %s₺ katılım payı)',
                 round(COALESCE(v_match.deposit_amount, 0)), round(COALESCE(v_match.price, 0))));
        INSERT INTO public.wallet_transactions
          (user_id, match_id, amount, type, balance_type, status, reference_type, reference_id, description)
        VALUES (v_intent.user_id, v_intent.match_id, v_refund, 'DEPOSIT', NULL, 'COMPLETED',
                'PAYMENT_INTENT', v_intent.id,
                'Maç doldu — kapora fazlası karta iade kuyruğunda');
      ELSE
        v_refund := 0;
      END IF;
    END IF;

    IF v_refund > 0 THEN
      PERFORM public._notify_deposit(
        COALESCE(v_match."creatorId", v_match.captain_id), p_match_id, 'match_deposit_captured',
        jsonb_build_object(
          'match_title', COALESCE(v_match.title, 'Maçın'),
          'share',  round(COALESCE(v_match.price, 0))::text,
          'refund', round(v_refund)::text
        ));
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'deposit_status', 'CAPTURED', 'fill_refund', v_refund);
END; $function$;

-- ── C2 · match_void_deposit: kaptan iptali 24 saat kuralına bağlandı ────────
-- BLOCKED kart kaporası TAHSİL EDİLMİŞTİR: serbest-iptal penceresi (sahanın
-- refund_full_hours ayarı, varsayılan 24) içindeyse NET iade (PSP kesintili,
-- _refund_wallet_escrow kart dalı); pencere kapandıysa kapora YANAR.
CREATE OR REPLACE FUNCTION public.match_void_deposit(p_match_id uuid, p_reason text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid(); v_match RECORD; v_res jsonb;
  v_intent public.payment_intents;
  v_hours numeric; v_full_hours numeric;
BEGIN
  SELECT id, "creatorId", captain_id, deposit_intent_id, deposit_status, starts_at, pitch_id
    INTO v_match
  FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF COALESCE(v_match."creatorId", v_match.captain_id) IS DISTINCT FROM v_uid AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  SELECT * INTO v_intent FROM public.payment_intents WHERE id = v_match.deposit_intent_id;

  -- Kart kaporası + serbest-iptal penceresi KAPALI → iade yok, kapora yanar.
  IF v_intent.id IS NOT NULL AND v_intent.provider <> 'WALLET'
     AND v_match.deposit_status = 'BLOCKED' THEN
    v_hours := GREATEST(0, EXTRACT(EPOCH FROM (v_match.starts_at - now())) / 3600.0);
    SELECT t.full_hours INTO v_full_hours FROM public._pitch_refund_tiers(v_match.pitch_id) t;
    IF v_hours < COALESCE(v_full_hours, 24) THEN
      UPDATE public.payment_intents SET status = 'CAPTURED', captured_at = timezone('utc', now())
       WHERE id = v_intent.id AND status = 'PAID';
      UPDATE public.matches
         SET deposit_status = 'CAPTURED',
             status = 'CANCELLED',
             cancel_reason = COALESCE(p_reason, format('Geç iptal — kapora iade edilmedi (maça %s saat kala).', round(v_hours, 1)))
       WHERE id = p_match_id;
      RETURN jsonb_build_object('ok', true, 'deposit_status', 'CAPTURED',
        'match_status', 'CANCELLED', 'refund', 0, 'late', true, 'hours_to_match', round(v_hours, 1));
    END IF;
  END IF;

  v_res := public._match_release_deposit(p_match_id, p_reason);
  IF (v_res->>'ok')::boolean THEN
    UPDATE public.matches
       SET status = 'CANCELLED',
           cancel_reason = COALESCE(p_reason, 'Kaptan iptali — kapora iade edildi.')
     WHERE id = p_match_id;
    RETURN jsonb_build_object('ok', true, 'deposit_status', 'VOIDED', 'match_status', 'CANCELLED');
  END IF;
  RETURN v_res;
END; $function$;

-- ── C3 · _match_release_deposit: kart dalı (VOIDED yerine iade + REFUNDED) ──
CREATE OR REPLACE FUNCTION public._match_release_deposit(p_match_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_match RECORD;
  v_intent public.payment_intents;
  v_geri boolean;
BEGIN
  SELECT id, "creatorId", captain_id, deposit_intent_id, deposit_status, deposit_amount, title
    INTO v_match FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_match.deposit_status NOT IN ('BLOCKED', 'AWAITING_PAYMENT') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'NOT_BLOCKED',
                              'deposit_status', v_match.deposit_status);
  END IF;

  -- Kapora hiç ödenmediyse (AWAITING_PAYMENT): iade edilecek para yok.
  IF v_match.deposit_status = 'AWAITING_PAYMENT' THEN
    UPDATE public.matches SET deposit_status = 'NONE' WHERE id = p_match_id;
    RETURN jsonb_build_object('ok', true, 'deposit_status', 'NONE', 'refunded', false, 'amount', 0);
  END IF;

  SELECT * INTO v_intent FROM public.payment_intents WHERE id = v_match.deposit_intent_id;

  IF v_intent.id IS NOT NULL AND v_intent.provider = 'WALLET' THEN
    UPDATE public.payment_intents
       SET status = 'VOIDED', voided_at = timezone('utc', now()),
           void_reason = COALESCE(p_reason, 'Kadro tamamlanamadı.')
     WHERE id = v_match.deposit_intent_id;
    v_geri := public._refund_wallet_escrow(v_match.deposit_intent_id,
      'Maç kaporası serbest bırakıldı — tutar iade edildi');
    UPDATE public.matches SET deposit_status = 'VOIDED' WHERE id = p_match_id;
  ELSE
    -- KART: tahsil edilmiş kapora NET iade edilir (PSP kesintili — kart dalı).
    v_geri := public._refund_wallet_escrow(v_match.deposit_intent_id,
      COALESCE(p_reason, 'Maç iptali — kapora iadesi'));
    UPDATE public.matches SET deposit_status = 'VOIDED' WHERE id = p_match_id;
  END IF;

  IF v_geri AND COALESCE(v_match."creatorId", v_match.captain_id) IS NOT NULL THEN
    PERFORM public._notify_deposit(
      COALESCE(v_match."creatorId", v_match.captain_id),
      p_match_id, 'match_deposit_released',
      jsonb_build_object(
        'amount', round(COALESCE(v_match.deposit_amount, 0))::text,
        'match_title', COALESCE(v_match.title, 'Maçın'),
        'reason', COALESCE(p_reason, 'Kadro tamamlanamadı.')
      ));
  END IF;

  RETURN jsonb_build_object('ok', true, 'deposit_status', 'VOIDED', 'refunded', v_geri,
                            'amount', COALESCE(v_match.deposit_amount, 0));
END; $function$;

REVOKE ALL ON FUNCTION public._match_release_deposit(uuid, text) FROM PUBLIC, anon, authenticated;

-- ── C4 · Bildirim metinleri kanal-bağımsız (cüzdan sözü geçmez) ─────────────
INSERT INTO public.notification_templates
  (type_key, label_tr, title_tr, body_tr, category, is_mandatory, can_user_disable, badge_increment, sort_order)
VALUES
  ('match_deposit_captured', 'Kapora tahsil edildi', 'Maçın kesinleşti ⚽',
   'Kadro doldu. Kaporandan kendi payın ({{share}}₺) düşüldü, {{refund}}₺ sana iade ediliyor.',
   'MATCH', true, false, true, 61),
  ('match_deposit_released', 'Kapora iade edildi', 'Kaporan iade ediliyor 💰',
   '{{match_title}} iptal oldu ({{reason}}). {{amount}}₺ kaporan (işlem kesintisi düşülerek) kartına iade ediliyor.',
   'MATCH', true, false, true, 62),
  ('match_deposit_timeout', 'Kapora süresi doldu', 'Maçın iptal edildi ⏱️',
   '{{match_title}} için kapora ödemesi tamamlanmadığından maç ve saha rezervasyonu iptal edildi. Kartından para çekilmedi.',
   'MATCH', true, false, true, 63)
ON CONFLICT (type_key) DO UPDATE SET
  title_tr = EXCLUDED.title_tr,
  body_tr  = EXCLUDED.body_tr,
  label_tr = EXCLUDED.label_tr,
  category = EXCLUDED.category;

-- ── B4 · Kapora bekleyen maç süpürücüsü (7.4: alınmadıysa alınmasın) ────────
CREATE OR REPLACE FUNCTION public.sweep_awaiting_deposit_matches()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_timeout int := COALESCE(public.get_config_number('match_deposit_timeout_min', 30), 30)::int;
  v_m RECORD;
  v_iptal int := 0;
BEGIN
  FOR v_m IN
    SELECT id, "creatorId", captain_id, title
    FROM public.matches
    WHERE deposit_status = 'AWAITING_PAYMENT'
      AND status <> 'CANCELLED'
      AND created_at < now() - make_interval(mins => v_timeout)
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Bekleyen niyet varsa kapat (tahsilat yok — VOID yeterli).
    UPDATE public.payment_intents
       SET status = 'VOIDED', voided_at = timezone('utc', now()),
           void_reason = 'Kapora ödemesi zamanında tamamlanmadı.'
     WHERE match_id = v_m.id AND related_entity_type = 'MATCH_DEPOSIT' AND status = 'PENDING';

    UPDATE public.matches
       SET status = 'CANCELLED', deposit_status = 'NONE',
           cancel_reason = 'Kapora ödemesi tamamlanmadı — süre doldu.'
     WHERE id = v_m.id;

    UPDATE public.pitch_bookings
       SET status = 'CANCELLED', cancelled_at = now(),
           cancellation_reason = 'Maç kaporası ödenmedi — slot serbest bırakıldı.'
     WHERE match_id = v_m.id AND status <> 'CANCELLED';

    BEGIN
      PERFORM public._notify_deposit(
        COALESCE(v_m."creatorId", v_m.captain_id), v_m.id, 'match_deposit_timeout',
        jsonb_build_object('match_title', COALESCE(v_m.title, 'Maçın')));
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Kapora zaman aşımı bildirimi gönderilemedi (%): %', v_m.id, SQLERRM;
    END;

    v_iptal := v_iptal + 1;
  END LOOP;

  RETURN jsonb_build_object('cancelled', v_iptal, 'timeout_min', v_timeout);
END;
$$;
REVOKE ALL ON FUNCTION public.sweep_awaiting_deposit_matches() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sweep_awaiting_deposit_matches() TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'kapora_bekleyen_mac_supuruecuesu') THEN
    PERFORM cron.schedule(
      'kapora_bekleyen_mac_supuruecuesu',
      '*/10 * * * *',
      'SELECT public.sweep_awaiting_deposit_matches()'
    );
  END IF;
END $$;

-- ── A4 · Karta iade kuyruğu cron'u (refund-payment ucu, Bearer webhook_secret)
-- Kalıp: 20260803204739 süpürücü cron'u — SESSİZ VAZGEÇME YOK: adres/anahtar
-- eksikse göç DURUR ("uygulandı ama işini yapmadı" durumu oluşamaz).
DO $$
DECLARE
  v_base_url text;
  v_secret   text;
BEGIN
  SELECT value #>> '{}' INTO v_base_url
  FROM public.app_config WHERE key = 'functions_base_url';

  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets WHERE name = 'webhook_secret' LIMIT 1;

  IF v_base_url IS NULL OR v_base_url = '' THEN
    RAISE EXCEPTION '[AYAR-EKSIK] app_config.functions_base_url boş — karta iade cron''u KURULAMAZ.';
  END IF;
  IF v_secret IS NULL OR v_secret = '' THEN
    RAISE EXCEPTION '[AYAR-EKSIK] vault.secrets içinde "webhook_secret" YOK — karta iade cron''u KURULAMAZ.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'karta_iade_kuyrugu') THEN
    PERFORM cron.schedule(
      'karta_iade_kuyrugu',
      '*/5 * * * *',
      format(
        $cron$
        SELECT net.http_post(
          url     := %L,
          headers := jsonb_build_object(
                       'Content-Type', 'application/json',
                       'Authorization', 'Bearer ' || (
                         SELECT decrypted_secret FROM vault.decrypted_secrets
                         WHERE name = 'webhook_secret' LIMIT 1
                       )
                     ),
          body    := '{"action":"process-queue"}'::jsonb
        );
        $cron$,
        v_base_url || '/refund-payment'
      )
    );
    RAISE NOTICE '[KURULUM] karta_iade_kuyrugu cron kuruldu (*/5).';
  END IF;
END $$;

-- ── Doğrulama (7.7: göç kendi kanıtını taşır) ───────────────────────────────
DO $$
DECLARE v_n int; v_src text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema = 'public' AND table_name = 'card_refund_queue') THEN
    RAISE EXCEPTION 'DOGRULAMA: card_refund_queue tablosu yok';
  END IF;

  IF (SELECT value::text FROM public.app_config WHERE key = 'match_deposit_enabled') <> 'true' THEN
    RAISE EXCEPTION 'DOGRULAMA: match_deposit_enabled true olmali (kart kaporasi acik)';
  END IF;

  SELECT prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'prepare_card_payment' LIMIT 1;
  IF v_src NOT LIKE '%MATCH_DEPOSIT%' THEN
    RAISE EXCEPTION 'DOGRULAMA: prepare_card_payment MATCH_DEPOSIT akisini tasimiyor';
  END IF;

  SELECT prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'apply_card_payment' LIMIT 1;
  IF v_src NOT LIKE '%MATCH_DEPOSIT%' OR v_src NOT LIKE '%_iade_karta_kuyruga%' THEN
    RAISE EXCEPTION 'DOGRULAMA: apply_card_payment kart kaporasi/karta iade tasimiyor';
  END IF;

  SELECT prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'match_block_deposit' LIMIT 1;
  IF v_src NOT LIKE '%AWAITING_PAYMENT%' OR v_src LIKE '%wallet_spend_balance%' THEN
    RAISE EXCEPTION 'DOGRULAMA: match_block_deposit hala para oynatiyor (cuzdan kalintisi)';
  END IF;

  SELECT count(*) INTO v_n FROM cron.job WHERE jobname = 'kapora_bekleyen_mac_supuruecuesu';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'DOGRULAMA: kapora supuruecuesu cron kurulmadi';
  END IF;
END $$;

-- GERİ ALMA (gerekirse):
--   UPDATE public.app_config SET value = 'false'::jsonb WHERE key = 'match_deposit_enabled';
--   (kapora yeniden beklemeye alınır — maçlar kaporasız yayınlanır; kuyruk ve
--    fonksiyonlar yerinde kalır, PENDING kuyruk satırları işlenmeye devam eder.)
