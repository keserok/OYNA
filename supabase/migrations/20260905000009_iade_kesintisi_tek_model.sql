-- ═══════════════════════════════════════════════════════════════════════════
-- İADE KESİNTİSİ TEK MODEL (BULGU-9 kararı, 17 Ağu 2026 — kurucu onayı)
--
-- NE TUTARSIZDI: İki iade akışı iki farklı kesinti modeli kullanıyordu.
--   • Maç iptali:        iade = karttan çekilen TOPLAM − PSP(iade edilen)
--     (461,25 ₺ ödeyen 449,72 ₺ alır — kayıp ~%2,5)
--   • Rezervasyon iptali: kart işlem bedeli hiç iade edilmez + kalan
--     tabandan bir daha PSP kesilir (307,50 ₺ ödeyen 292,50 ₺ alır —
--     kayıp ~%4,9; kesinti İKİ KEZ yansır)
--
-- KURUCU KARARI: maç modeli her yerde — "iade = karttan çekilen toplam,
-- tek PSP kesintisiyle". Gerekçe: kurucunun 16 Ağu kuralının birebir
-- kendisi; iyzico iade edilen işlemin komisyonunu geri vermez, tek
-- kesinti tam o maliyeti karşılar; kullanıcıya tek cümleyle anlatılır.
--
-- DEĞİŞEN: preview_booking_cancel + cancel_app_booking artık iade tabanı
-- olarak taban + kart işlem bedellerini (payment_intents.card_fee_amount)
-- geçer; dağıtım tavanı kartın GERÇEK çekim tutarına (intent.amount)
-- çıkar (işlem bedeli payı da karta dönebilsin). _booking_cancel_quote
-- İMZASIYLA AYNEN DURUR (zaten verilen tabana tek kesinti uyguluyordu).
--
-- DEĞİŞMEYEN: eski cüzdan-emanet (WALLET) ödemeleri — kart ücreti yoktur,
-- tabanları aynıdır, davranışları bit değişmez. Kademeli yüzde yapısı
-- aynı: önce yüzde, iade edilen kısımdan tek PSP.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.preview_booking_cancel(p_booking_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  b RECORD; v_start timestamp; v_now_tr timestamp := (now() AT TIME ZONE 'Europe/Istanbul');
  v_q jsonb; v_cancellable boolean; v_fees numeric := 0; v_taban numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED: Giris gerekli.'; END IF;
  SELECT * INTO b FROM public.pitch_bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Rezervasyon bulunamadi.'; END IF;
  IF b.user_id IS DISTINCT FROM auth.uid() AND NOT public.is_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED: Bu rezervasyon size ait degil.'; END IF;
  v_start := (b.booking_date + b.start_time)::timestamp;
  v_cancellable := (b.status <> 'CANCELLED' AND v_start > v_now_tr AND b.source IN ('APP_BOOKING', 'APP_MATCH'));

  -- TEK MODEL: iade tabanı = taban + bu rezervasyonun kart işlem bedelleri.
  -- (Cüzdan-emanet ödemede kart niyeti yoktur → v_fees = 0, eski davranış.)
  SELECT COALESCE(SUM(COALESCE(i.card_fee_amount, 0)), 0) INTO v_fees
  FROM public.payment_intents i
  WHERE i.booking_id = p_booking_id AND i.user_id = b.user_id
    AND i.provider <> 'WALLET' AND i.status IN ('PAID', 'CAPTURED');
  v_taban := COALESCE(b.paid_amount, 0) + v_fees;

  v_q := public._booking_cancel_quote(v_taban, v_start, b.pitch_id);
  RETURN jsonb_build_object('booking_id', p_booking_id, 'cancellable', v_cancellable,
    'refund_percent', (v_q->>'pct')::numeric, 'refund_amount', (v_q->>'refund')::numeric,
    'psp_fee', (v_q->>'psp')::numeric, 'gross', (v_q->>'gross')::numeric,
    'paid_amount', COALESCE(b.paid_amount, 0), 'hours_left', (v_q->>'hours_left')::numeric);
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_app_booking(p_booking_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  b RECORD; v_start timestamp;
  v_now_tr timestamp := (now() AT TIME ZONE 'Europe/Istanbul');
  v_q jsonb; v_pct numeric; v_psp numeric; v_refund numeric := 0;
  v_kalan numeric; v_karta numeric := 0; r RECORD; v_taban numeric; v_kuyrukta numeric; v_pay numeric;
  v_fees numeric := 0; v_iade_taban numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED: Giris gerekli.'; END IF;
  SELECT * INTO b FROM public.pitch_bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Rezervasyon bulunamadi.'; END IF;
  IF b.user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'UNAUTHORIZED: Bu rezervasyon size ait degil.'; END IF;
  IF b.source NOT IN ('APP_BOOKING', 'APP_MATCH') THEN RAISE EXCEPTION 'INVALID_SOURCE: Bu rezervasyon uygulamadan iptal edilemez.'; END IF;
  IF b.status = 'CANCELLED' THEN RAISE EXCEPTION 'ALREADY_CANCELLED: Rezervasyon zaten iptal edilmis.'; END IF;
  v_start := (b.booking_date + b.start_time)::timestamp;
  IF v_start <= v_now_tr THEN RAISE EXCEPTION 'ALREADY_STARTED: Gecmis veya baslamis rezervasyon iptal edilemez.'; END IF;

  -- TEK MODEL (BULGU-9): önizlemeyle AYNI taban — taban + kart işlem bedelleri.
  SELECT COALESCE(SUM(COALESCE(i.card_fee_amount, 0)), 0) INTO v_fees
  FROM public.payment_intents i
  WHERE i.booking_id = p_booking_id AND i.user_id = b.user_id
    AND i.provider <> 'WALLET' AND i.status IN ('PAID', 'CAPTURED');
  v_iade_taban := COALESCE(b.paid_amount, 0) + v_fees;

  v_q := public._booking_cancel_quote(v_iade_taban, v_start, b.pitch_id);
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
    v_kalan := v_refund;
    FOR r IN
      SELECT * FROM public.payment_intents
      WHERE booking_id = p_booking_id AND user_id = b.user_id
        AND provider <> 'WALLET' AND status IN ('PAID','CAPTURED')
      ORDER BY created_at DESC
    LOOP
      EXIT WHEN v_kalan <= 0;
      -- Tavan artık kartın GERÇEK çekim tutarı (işlem bedeli dahil): iyzico
      -- iadesi çekim tutarına kadar yapılabilir; işlem bedeli payı da döner.
      v_taban := r.amount;
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
$function$;

-- ── KENDİNİ DOĞRULAMA: kartlı ve cüzdan-emanet iki dünya yan yana ─────────
DO $$
DECLARE
  v_user uuid; v_pitch uuid; v_court uuid;
  v_b1 uuid := '00000000-dead-4bee-8f00-000000000006';  -- kartlı (300 + 7,50 bedel)
  v_b2 uuid := '00000000-dead-4bee-8f00-000000000007';  -- eski cüzdan-emanet (300)
  v_i1 uuid := '00000000-dead-4bee-8f00-000000000008';
  v_q jsonb; v_beklenen numeric;
BEGIN
  SELECT p.id INTO v_user FROM public.profiles p WHERE p.is_demo LIMIT 1;
  SELECT s.id, c.id INTO v_pitch, v_court
  FROM public.pitches s JOIN public.courts c ON c.pitch_id = s.id
  WHERE s.name LIKE 'Denek%' AND s.refund_full_hours IS NULL LIMIT 1;
  IF v_user IS NULL OR v_pitch IS NULL THEN
    -- Sıfırdan kurulum (preview replay): demo veri yok — veri kanıtı atlanır.
    -- Canlıda bu iş 20260817094634 olarak veriyle kanıtlandı.
    RAISE NOTICE 'DOĞRULAMA ATLANDI: demo profil/saha yok (sıfırdan kurulum) — veri kanıtı canlıda verildi';
    RETURN;
  END IF;

  INSERT INTO public.pitch_bookings (id, pitch_id, court_id, user_id, booking_date,
    start_time, end_time, status, source, price, paid_amount, deposit_amount)
  VALUES
    (v_b1, v_pitch, v_court, v_user, current_date + 2, '10:00', '11:00', 'CONFIRMED', 'APP_BOOKING', 1000, 300, 300),
    (v_b2, v_pitch, v_court, v_user, current_date + 2, '11:00', '12:00', 'CONFIRMED', 'APP_BOOKING', 1000, 300, 300);

  INSERT INTO public.payment_intents (id, user_id, booking_id, pitch_id, amount, currency,
    status, provider, commission_amount, owner_amount, service_provider_amount,
    related_entity_type, raw, card_fee_amount)
  VALUES (v_i1, v_user, v_b1, v_pitch, 307.50, 'TRY', 'PAID', 'SIMULATION', 0, 0, 0,
    'BOOKING', jsonb_build_object('flow','BOOKING_DEPOSIT','card_base',300,'card_fee',7.50), 7.50);

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_user, 'role', 'authenticated')::text, true);

  -- 1) Kartlı: taban 307,50 → tek PSP kesintisi → 307,50 − psp(307,50)
  v_q := public.preview_booking_cancel(v_b1);
  v_beklenen := round(307.50 - public._psp_fee(307.50), 2);
  IF (v_q->>'refund_amount')::numeric IS DISTINCT FROM v_beklenen THEN
    RAISE EXCEPTION 'DOĞRULAMA: kartlı iade % bekleniyordu, % geldi (%)',
      v_beklenen, v_q->>'refund_amount', v_q;
  END IF;

  -- 2) Cüzdan-emanet (kart niyeti yok): eski davranış — 300 − psp(300)
  v_q := public.preview_booking_cancel(v_b2);
  v_beklenen := round(300 - public._psp_fee(300), 2);
  IF (v_q->>'refund_amount')::numeric IS DISTINCT FROM v_beklenen THEN
    RAISE EXCEPTION 'DOĞRULAMA: emanet iadesi % bekleniyordu, % geldi',
      v_beklenen, v_q->>'refund_amount';
  END IF;

  DELETE FROM public.payment_intents WHERE id = v_i1;
  DELETE FROM public.pitch_bookings WHERE id IN (v_b1, v_b2);
  PERFORM set_config('request.jwt.claims', NULL, true);

  RAISE NOTICE 'DOĞRULAMA TAMAM: kartlı iade tek kesintiyle (%), emanet davranışı değişmedi.', v_beklenen;
END $$;
