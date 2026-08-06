-- ═══════════════════════════════════════════════════════════════════════════
-- ÜCRETSİZ SAĞLAYICI KİRALAMASI ENGELLENDİ · 4 Ağustos 2026
--
-- Başvuru formunu sadeleştirirken ortaya çıktı: create_service_request
-- yalnızca "ücret NULL mu" diye bakıyordu. Ücreti 0 olan bir kaleci/hakem
-- 0 ₺'ye kiralanabiliyordu — kaptan bedava hizmet alıyor, sağlayıcının eline
-- hiçbir şey geçmiyordu. Ödeme kaydı bile 0 ₺ olarak açılıyordu.
--
-- Bugün etkilenen kimse yok (5 sağlayıcının hiçbirinin ücreti 0 değil), ama
-- başvuru formunda ücret alanı isteğe bağlı hâle geldiği için bu kapı şart.
--
-- YÖNTEM: 90 satırlık para fonksiyonunu elle yeniden yazmak yerine, canlı
-- tanımın İÇİNDEKİ tek satır değiştiriliyor — kopyalama hatası riski sıfır.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_def  text;
  v_eski text := 'IF v_fee IS NULL THEN RAISE EXCEPTION ''PROVIDER_UNAVAILABLE: Saglayici su an musait degil veya teklif almiyor.''; END IF;';
  v_yeni text := 'IF v_fee IS NULL THEN RAISE EXCEPTION ''PROVIDER_UNAVAILABLE: Saglayici su an musait degil veya teklif almiyor.''; END IF;'
              || E'\n  IF v_fee <= 0 THEN RAISE EXCEPTION ''PROVIDER_NO_FEE: Saglayici henuz ucretini belirlememis.''; END IF;';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'create_service_request';

  IF v_def IS NULL THEN RAISE EXCEPTION 'create_service_request bulunamadi.'; END IF;

  -- Zaten eklenmişse tekrar ekleme (göç iki kez koşarsa).
  IF position('PROVIDER_NO_FEE' in v_def) > 0 THEN
    RAISE NOTICE 'Ucret kapisi zaten var, atlandi.';
    RETURN;
  END IF;

  IF position(v_eski in v_def) = 0 THEN
    RAISE EXCEPTION 'Degistirilecek satir bulunamadi - fonksiyon degismis olabilir.';
  END IF;

  v_def := replace(v_def, v_eski, v_yeni);
  EXECUTE v_def;
END $$;

-- ─── DOĞRULAMA ────────────────────────────────────────────────────────────
DO $$
DECLARE v_src text;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'create_service_request';

  IF v_src NOT LIKE '%PROVIDER_NO_FEE%' THEN
    RAISE EXCEPTION 'DOGRULAMA: ucret kapisi eklenmedi.';
  END IF;
  IF v_src NOT LIKE '%PROVIDER_UNAVAILABLE%' THEN
    RAISE EXCEPTION 'DOGRULAMA: mevcut musaitlik kapisi kayboldu!';
  END IF;
  IF v_src NOT LIKE '%calculate_commission%' OR v_src NOT LIKE '%service_requests%' THEN
    RAISE EXCEPTION 'DOGRULAMA: fonksiyon govdesi bozuldu.';
  END IF;
  RAISE NOTICE 'Ucretsiz kiralama kapisi kapatildi.';
END $$;
