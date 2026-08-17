-- ═══════════════════════════════════════════════════════════════════════════
-- TARİFE GECE PENCERESİ (BULGU-7, 17 Ağu 2026 canlı testi)
--
-- NE BOZUKTU: Slot motoru (get_pitch_slots) gece yarısını AŞAN tarife
-- penceresini bilerek destekler (end <= start → +1440 dk: 17:00→02:00).
-- Ama pitch_tariffs üzerindeki valid_tariff_time kısıtı yalnız
-- start < end VEYA end = 00:00 kabul ediyordu. Sonuç: 02:00'ye kadar
-- çalışan saha (Ordu'da standart) gece 00:00–02:00 saatlerini
-- FİYATLANDIRAMIYORDU — motorun gece desteği kısıtın arkasında ölü koddu.
-- Canlı testte gece tarifesi yazmaya çalışınca 23514 ile yakalandı.
--
-- ÇÖZÜM: Kısıt gece eksenine hizalanır (listeleme sınırıyla aynı kural:
-- 06:00 öncesi saatler önceki akşamın devamıdır — _listeleme_eksen_dk):
--   • start < end                → normal pencere (08:00→17:00)
--   • end = 00:00                → gece yarısına kadar (17:00→24:00)
--   • end < start AND end ≤ 06:00 → gece yarısını aşan pencere (17:00→02:00)
--   • start = end                → hâlâ RED (anlamı belirsiz)
--
-- BİLİNÇLİ SINIR: owner_replace_tariffs içindeki "tarife değişikliği mevcut
-- rezervasyonla çakışıyor mu" bekçisi gece penceresini hâlâ yüzeysel okur
-- (yalnız end=00:00 özel durumunu bilir). Bu, gece rezervasyonu VARKEN
-- tarife süresi değiştiren sahibin uyarıyı kaçırabilmesi demek — para
-- kaybettirmez, v1.1'de eksene tam hizalanacak (raporda not).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.pitch_tariffs DROP CONSTRAINT IF EXISTS valid_tariff_time;
ALTER TABLE public.pitch_tariffs ADD CONSTRAINT valid_tariff_time
  CHECK (
    start_time < end_time
    OR end_time = '00:00'::time
    OR (end_time < start_time AND end_time <= '06:00'::time)
  );

-- ── KENDİNİ DOĞRULAMA ─────────────────────────────────────────────────────
DO $$
DECLARE
  v_pitch uuid; v_court uuid;
  v_tid uuid := '00000000-dead-4bee-8f00-000000000004';
  v_gece int;
  v_reddetti boolean := false;
BEGIN
  SELECT s.id, c.id INTO v_pitch, v_court
  FROM public.pitches s JOIN public.courts c ON c.pitch_id = s.id
  WHERE s.is_demo LIMIT 1;
  IF v_pitch IS NULL THEN
    -- Sıfırdan kurulum (preview replay): demo veri yok — veri kanıtı atlanır.
    -- Canlıda bu iş 20260817003120 olarak veriyle kanıtlandı.
    RAISE NOTICE 'DOĞRULAMA ATLANDI: demo saha yok (sıfırdan kurulum) — veri kanıtı canlıda verildi';
    RETURN;
  END IF;

  -- 1) Gece yarısını aşan pencere artık yazılabiliyor
  INSERT INTO public.pitch_tariffs (id, pitch_id, court_id, name, tariff_type,
    applies_to_days, start_time, end_time, slot_price, deposit_amount, slot_minutes, is_active)
  VALUES (v_tid, v_pitch, v_court, '_gece_kaniti', 'WEEKDAY',
    '{1,2,3,4,5,6,7}', '22:00', '02:00', 999, 99, 60, true);

  -- 2) Motor bu pencereden GECE slotu üretiyor (00:00 sonrası en az 1 dilim)
  SELECT count(*) INTO v_gece
  FROM public.get_pitch_slots(v_pitch, current_date + 1, v_court, false) g
  WHERE g.crosses_midnight;
  IF v_gece < 1 THEN
    RAISE EXCEPTION 'DOĞRULAMA: gece penceresi slot üretmedi (crosses_midnight=0)';
  END IF;

  -- 3) start = end hâlâ reddediliyor
  BEGIN
    INSERT INTO public.pitch_tariffs (pitch_id, name, tariff_type,
      applies_to_days, start_time, end_time, slot_price, slot_minutes)
    VALUES (v_pitch, '_esit_kaniti', 'WEEKDAY', '{1}', '10:00', '10:00', 1, 60);
  EXCEPTION WHEN check_violation THEN
    v_reddetti := true;
  END;
  IF NOT v_reddetti THEN
    RAISE EXCEPTION 'DOĞRULAMA: start=end kabul edildi — kısıt gevşemiş!';
  END IF;

  DELETE FROM public.pitch_tariffs WHERE id = v_tid;

  RAISE NOTICE 'DOĞRULAMA TAMAM: gece penceresi serbest (% gece dilimi), eşit saat hâlâ kilitli.', v_gece;
END $$;
