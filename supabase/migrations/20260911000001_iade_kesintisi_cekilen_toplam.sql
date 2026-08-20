-- ════════════════════════════════════════════════════════════════════════════
-- İADE KESİNTİSİNİN TABANI: KARTTAN ÇEKİLEN TOPLAM
-- ----------------------------------------------------------------------------
-- KURUCU KARARI (19 Ağustos 2026): "İptal kuralımız sıkı olmalı; para
-- konusunda bizden kesilen ödeme altyapısı komisyonu olmasın, iade durumunda
-- kullanıcıya yansısın." Ayrıca kesinti tabanı olarak, sorulduğunda "çekilen
-- toplam üzerinden" seçildi.
--
-- ÖNCEKİ DAVRANIŞ: kesinti, iade edilen KISIM üzerinden hesaplanıyordu
-- (`_psp_fee(v_gross)`). %50 iadede 210 ₺'nin payı kesiliyordu — ama ödeme
-- kuruluşu komisyonunu tahsilat anında 420 ₺'nin TAMAMI üzerinden almıştı ve
-- iadede geri vermiyor. Aradaki farkı OYNA üstleniyordu.
--
-- YENİ DAVRANIŞ: kesinti tabanı = karttan çekilen toplam.
--   420 ₺ ödendi · tam iade  → 420 − 14,70 = 405,30 ₺
--   420 ₺ ödendi · %50 iade  → 210 − 14,70 = 195,30 ₺
-- Kullanıcı bu kesintiyi ödemeden ÖNCE ekranda görür (yasal metin madde 6).
--
-- İADE TUTARI YUVARLANMAZ: kurucu kararı, "kuruşu kuruşuna ödensin". Küsurat
-- yasağı kullanıcının ÖDEDİĞİ tutar içindir; iade karta geri döner, elden para
-- sayılmaz. Yuvarlansaydı ya kullanıcı kaybederdi ya OYNA — ikisi de gereksiz.
--
-- İADE TABANI ARTIK YUVARLAMAYI DA İÇERİR: kullanıcıdan 10'a tamamlanan fark
-- da tahsil edildi; onu iade dışında bırakmak gerekçesiz ikinci bir kesinti
-- olurdu. Bu yüzden `v_fees` toplamına `rounding_amount` eklendi.
--
-- GERİ UYUMLULUK: `p_psp_taban` verilmezse eski davranış (gross üzerinden)
-- korunur. Kart niyeti olmayan eski cüzdan-emanet kayıtları böyle çalışır.
--
-- YÖNTEM: preview_booking_cancel ve cancel_app_booking gövdeleri KURULU
-- tanımdan okunup adı adına değiştirilir (bkz. 20260911000000 aynı gerekçe).
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._booking_cancel_quote(
  p_paid numeric,
  p_start timestamp without time zone,
  p_pitch_id uuid,
  p_psp_taban numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  t RECORD; v_now_tr timestamp := (now() AT TIME ZONE 'Europe/Istanbul');
  v_hours numeric; v_pct numeric; v_gross numeric; v_psp numeric; v_refund numeric;
BEGIN
  SELECT * INTO t FROM public._pitch_refund_tiers(p_pitch_id);
  v_hours := EXTRACT(EPOCH FROM (p_start - v_now_tr)) / 3600.0;
  v_pct := CASE WHEN v_hours >= t.full_hours THEN 100 WHEN v_hours >= t.half_hours THEN t.half_pct ELSE 0 END;
  v_gross := round(COALESCE(p_paid, 0) * v_pct / 100.0, 2);
  v_psp := public._psp_fee(COALESCE(p_psp_taban, v_gross));
  v_refund := GREATEST(0, v_gross - v_psp);
  RETURN jsonb_build_object(
    'pct', v_pct, 'gross', v_gross, 'psp', v_psp, 'refund', v_refund,
    'hours_left', round(v_hours, 2)
  );
END;
$fn$;

DO $mig$
DECLARE
  v_def text;
  v_n int;
  eski  CONSTANT text := $p$v_q := public._booking_cancel_quote(v_taban, v_start, b.pitch_id);$p$;
  yeni  CONSTANT text := $p$v_q := public._booking_cancel_quote(v_taban, v_start, b.pitch_id, NULLIF(v_taban, 0));$p$;
  eski2 CONSTANT text := $p$v_q := public._booking_cancel_quote(v_iade_taban, v_start, b.pitch_id);$p$;
  yeni2 CONSTANT text := $p$v_q := public._booking_cancel_quote(v_iade_taban, v_start, b.pitch_id, NULLIF(v_iade_taban, 0));$p$;
  eski3 CONSTANT text := $p$SELECT COALESCE(SUM(COALESCE(i.card_fee_amount, 0)), 0) INTO v_fees$p$;
  yeni3 CONSTANT text := $p$SELECT COALESCE(SUM(COALESCE(i.card_fee_amount, 0) + COALESCE(i.rounding_amount, 0)), 0) INTO v_fees$p$;
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY['preview_booking_cancel', 'cancel_app_booking'] LOOP
    SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = fn;
    IF v_def IS NULL THEN RAISE EXCEPTION 'DOGRULAMA: % kurulu degil', fn; END IF;

    v_n := (length(v_def) - length(replace(v_def, eski3, ''))) / length(eski3);
    IF v_n <> 1 THEN RAISE EXCEPTION 'DOGRULAMA: %s icinde bedel toplami % kez bulundu', fn, v_n; END IF;
    v_def := replace(v_def, eski3, yeni3);

    IF position(eski IN v_def) > 0 THEN
      v_def := replace(v_def, eski, yeni);
    ELSIF position(eski2 IN v_def) > 0 THEN
      v_def := replace(v_def, eski2, yeni2);
    ELSE
      RAISE EXCEPTION 'DOGRULAMA: % icinde _booking_cancel_quote cagrisi bulunamadi', fn;
    END IF;

    EXECUTE v_def;
  END LOOP;
END $mig$;

-- ── Doğrulama (prensip 7.7) ────────────────────────────────────────────────
DO $dog$
DECLARE v_q jsonb;
BEGIN
  IF public._psp_fee(420) <> 14.70 THEN
    RAISE EXCEPTION 'DOGRULAMA: 420 uzerinden psp 14.70 olmadi (%)', public._psp_fee(420);
  END IF;

  v_q := public._booking_cancel_quote(420, (now() AT TIME ZONE 'Europe/Istanbul') + interval '2 hours', NULL, 420);
  IF (v_q->>'psp')::numeric <> 14.70 THEN
    RAISE EXCEPTION 'DOGRULAMA: kismi iadede psp tabani cekilen toplam degil (%)', v_q;
  END IF;

  v_q := public._booking_cancel_quote(420, (now() AT TIME ZONE 'Europe/Istanbul') + interval '200 hours', NULL, NULL);
  IF (v_q->>'psp')::numeric <> public._psp_fee((v_q->>'gross')::numeric) THEN
    RAISE EXCEPTION 'DOGRULAMA: taban verilmeyince eski davranisa dusulmedi (%)', v_q;
  END IF;

  v_q := public._booking_cancel_quote(10, (now() AT TIME ZONE 'Europe/Istanbul') + interval '2 hours', NULL, 10000);
  IF (v_q->>'refund')::numeric < 0 THEN
    RAISE EXCEPTION 'DOGRULAMA: negatif iade uretildi (%)', v_q;
  END IF;

  RAISE NOTICE 'DOGRULAMA TAMAM: iade kesintisi cekilen toplam uzerinden.';
END $dog$;
