-- ════════════════════════════════════════════════════════════════════════════
-- TOHUMLAYICI DOLU SAATİ ATLASIN
-- ----------------------------------------------------------------------------
-- BULUNAN HATA (19 Ağustos 2026): `demo_ekosistem_kur()` rastgele bir kort ve
-- saat seçip oraya rezervasyon yazıyor, ama o saatin BOŞ olduğunu kontrol
-- etmiyordu. Boş bir veritabanında sorun çıkmıyor; üzerinde başka rezervasyon
-- olan bir veritabanında ise:
--
--   ERROR 23P01: conflicting key value violates exclusion constraint
--   "pitch_bookings_no_overlap"
--
-- ve TÜM tohumlama işlemi geri alınıyordu. Canlıda birebir yaşandı: ekosistemi
-- yeniden kurmak isterken, o saatte duran tek bir rezervasyon yüzünden 90 maçın
-- hiçbiri yazılamadı.
--
-- NİYE ÖNEMLİ: kurucu bu fonksiyonu inceleme boyunca tekrar tekrar çağıracak.
-- "Bazen çalışıyor, bazen çalışmıyor" davranışı, elinde tek düğme olan biri
-- için kullanılamaz demektir.
--
-- ── ÇÖZÜM: ÇAKIŞMAYI ÖNCEDEN GÖR, O SAATİ ATLA ────────────────────────────
-- Kortun null olduğu durumu zaten atlayan `CONTINUE WHEN` satırının yanına,
-- saatin dolu olduğu durumu atlayan ikinci bir koşul ekleniyor. Kısıtın
-- kendisiyle aynı şeye bakar: aynı kort, aynı gün, aynı başlangıç saati.
--
-- Fonksiyon gövdesi YERİNDE dönüştürülüyor (pg_get_functiondef + tek desen
-- değişimi) — 150 satırlık tohumlayıcıyı buraya kopyalamak, ileride gövde
-- değişince iki sürümün sessizce ayrışması demekti. Değişimin GERÇEKTEN
-- olduğu aşağıda iddia ediliyor; olmazsa göç durur.
-- ════════════════════════════════════════════════════════════════════════════

DO $gov$
DECLARE
  v_def text;
  -- ÇAPA `v_saat` ATANDIKTAN SONRA: ilk denememde çapayı bir satır yukarıya,
  -- `CONTINUE WHEN v_kortlar.court_id IS NULL;` satırına koymuştum — orada
  -- `v_saat` HENÜZ ATANMAMIŞ oluyor, yani kontrol yanlış saate bakıyordu.
  -- Canlıda yine 23P01 ile patladı. Çapa artık atamanın kendisi.
  v_eski CONSTANT text := 'v_saat := 17 + v_i;';
  v_yeni CONSTANT text := 'v_saat := 17 + v_i;
      -- Saat zaten doluysa bu turu atla: exclusion kısıtı tüm tohumlamayı
      -- geri aldırıyordu (bkz. 20260912000004). Abonelikten gelen
      -- rezervasyonlar geçmiş günlerde de duruyor.
      CONTINUE WHEN EXISTS (
        SELECT 1 FROM public.pitch_bookings b
        WHERE b.court_id = v_kortlar.court_id
          AND b.booking_date = (current_date + v_gun)
          AND b.start_time = (lpad(v_saat::text, 2, ''0'') || '':00'')::time
          AND b.status <> ''CANCELLED''
      );';
  v_adet int;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'demo_ekosistem_kur';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'DOGRULAMA: demo_ekosistem_kur bulunamadi';
  END IF;

  v_adet := (length(v_def) - length(replace(v_def, v_eski, ''))) / length(v_eski);
  IF v_adet <> 1 THEN
    RAISE EXCEPTION 'DOGRULAMA: capa satiri % kez bulundu, 1 bekleniyordu', v_adet;
  END IF;

  EXECUTE replace(v_def, v_eski, v_yeni);
END $gov$;

-- ── Doğrulama (prensip 7.7) ────────────────────────────────────────────────
-- Bu göç bir FONKSİYON GÖVDESİNİ dönüştürüyor; doğrulaması da tam olarak
-- bunu sınar: kapı gövdeye girdi mi ve DOĞRU YERE mi girdi?
--
-- Bilerek ÇALIŞTIRMIYOR. `demo_ekosistem_kur()` çağırmak, göçü ortamda demo
-- kadrosu olup olmamasına bağlar (boş bir CI/önizleme veritabanında
-- 'DEMO_YOK' ile durur) — yani göçün kendi işiyle ilgisi olmayan bir sebeple
-- kırmızı olurdu. Tohumlama bir operatör işi; göç yalnız kodu kurar.
--
-- "Doğru yer" tek bir şeye indirgeniyor: kapı `v_saat` ATANDIKTAN SONRA
-- gelmeli. İlk denemede bir satır yukarıdaydı ve `v_saat` henüz atanmamış
-- olduğu için yanlış saate bakıyordu; canlıda 23P01 ile tekrar patladı.
-- Aşağıdaki sıra iddiası tam olarak o hatayı yakalar.
DO $dog$
DECLARE v_src text; v_kapi int; v_atama int;
BEGIN
  SELECT p.prosrc INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'demo_ekosistem_kur';

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'DOGRULAMA: demo_ekosistem_kur bulunamadi';
  END IF;

  v_kapi  := position('pitch_bookings b' in v_src);
  v_atama := position('v_saat := 17 + v_i;' in v_src);

  IF v_kapi = 0 THEN
    RAISE EXCEPTION 'DOGRULAMA: dolu-saat kapisi govdeye girmedi';
  END IF;
  IF v_atama = 0 THEN
    RAISE EXCEPTION 'DOGRULAMA: v_saat atamasi bulunamadi — govde degismis';
  END IF;
  IF v_kapi < v_atama THEN
    RAISE EXCEPTION 'DOGRULAMA: kapi v_saat atanmadan ONCE geliyor — yanlis saate bakar';
  END IF;

  -- Kapı, kısıtın kendisiyle aynı üç şeye bakmalı: kort, gün, saat.
  IF position('b.court_id = v_kortlar.court_id' in v_src) = 0
     OR position('b.booking_date = (current_date + v_gun)' in v_src) = 0
     OR position('b.status <> ' in v_src) = 0 THEN
    RAISE EXCEPTION 'DOGRULAMA: kapi kisitla ayni kosullara bakmiyor';
  END IF;

  RAISE NOTICE 'DOGRULAMA TAMAM: dolu-saat kapisi v_saat atamasindan SONRA ve kisitla ayni kosullarda.';
END $dog$;
