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
-- Hatayı BİREBİR yeniden üret: bir saati elle doldur, sonra tohumla. Eski kod
-- burada 23P01 ile komple geri alınırdı; yeni kod o saati atlayıp devam eder.
DO $dog$
DECLARE
  v_court uuid; v_pitch uuid; v_user uuid; v_rez uuid; v_ozet jsonb; v_saat time;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'demo_ekosistem_kur'
      AND p.prosrc LIKE '%b.status <> ''CANCELLED''%'
  ) THEN
    RAISE EXCEPTION 'DOGRULAMA: dolu-saat kapisi govdeye girmedi';
  END IF;

  SELECT c.id, c.pitch_id INTO v_court, v_pitch FROM public.courts c LIMIT 1;
  SELECT id INTO v_user FROM public.profiles WHERE is_demo AND role = 'PLAYER' LIMIT 1;
  IF v_court IS NULL OR v_user IS NULL THEN
    RAISE NOTICE 'DOGRULAMA ATLANDI: kort/demo oyuncu yok.';
    RETURN;
  END IF;

  -- Tohumlayıcının kullandığı saat aralığından birini elle kapat.
  v_saat := '19:00'::time;
  v_rez := gen_random_uuid();
  INSERT INTO public.pitch_bookings (
    id, pitch_id, court_id, user_id, booking_date, start_time, end_time,
    status, source, price, paid_amount, deposit_amount, payment_status,
    cancellation_reason)
  VALUES (
    v_rez, v_pitch, v_court, v_user, current_date + 1, v_saat, v_saat + interval '1 hour',
    'CONFIRMED', 'APP_MATCH', 100, 0, 0, 'PARTIAL', '_dogrulama_dolu_saat')
  ON CONFLICT DO NOTHING;

  -- Eski kod burada patlardı.
  v_ozet := public.demo_ekosistem_kur(3, 1);
  IF COALESCE((v_ozet->>'mac')::int, 0) < 1 THEN
    RAISE EXCEPTION 'DOGRULAMA: dolu saat varken hic mac tohumlanamadi (%)', v_ozet;
  END IF;

  DELETE FROM public.pitch_bookings WHERE id = v_rez;
  PERFORM public.demo_ekosistem_temizle();

  RAISE NOTICE 'DOGRULAMA TAMAM: dolu saat atlaniyor, tohumlama devam ediyor.';
END $dog$;
