-- ════════════════════════════════════════════════════════════════════════════
-- [P-2c / M-P0-1] KANONİK KİLİT SIRASI — kilitlenme (deadlock) kapatılıyor
-- ────────────────────────────────────────────────────────────────────────────
-- SORUN (canlı fonksiyon gövdelerinden ölçüldü):
--
--   apply_card_payment        : payment_intents(17) → pitch_bookings(39) → matches(90)
--   process_match_at_deadline : matches(12) → payment_intents(28,55)
--
--   İki fonksiyon aynı iki satırı TERS SIRADA kilitliyor. Klasik çapraz
--   kilitlenme: A önce ödemeyi kilitler ve maçı bekler; B önce maçı kilitler
--   ve ödemeyi bekler. PostgreSQL birini zorla iptal eder.
--
--   İptal edilen taraf ödeme ise: KARTTAN PARA ÇEKİLMİŞ AMA SLOT VERİLMEMİŞ
--   olur. Kullanıcı için "param gitti, yerim yok" demektir — A1.1 wedge'inin
--   ("parayı biz topluyoruz") tam kalbinden vurur.
--
--   Cuma 20:00'de 30 lobide ödeme akarken auto_process_matches cron'u (10
--   dakikada bir) aynı maçları işliyor. Çakışma olasılığı düşük değil, yüksek.
--
--   Tarama sonucu: matches + payment_intents ikisini birden kilitleyen TEK
--   ters sıralı fonksiyon apply_card_payment. process_match_at_deadline zaten
--   doğru sırada (matches önce).
--
-- ÇÖZÜM — 157 satırlık para fonksiyonu YENİDEN YAZILMIYOR:
--   Gövdeyi elden geçirmek, para akışının en hassas noktasında transkripsiyon
--   hatası riski demektir. Bunun yerine fonksiyonun BAŞINA kanonik sırada
--   kilit alan küçük bir blok EKLENİYOR:
--
--     matches → pitch_bookings → payment_intents
--
--   Blok bittiğinde kilitler zaten alınmış olur; alttaki mevcut kod aynen
--   çalışır ve kendi FOR UPDATE'leri no-op'a döner. Davranış değişmez,
--   yalnız kilit alma SIRASI sabitlenir.
--
--   Kilitsiz ön okuma güvenlidir: yalnız match_id/booking_id öğrenmek için
--   yapılır (bunlar değişmez), ve hemen ardından mevcut kod niyeti
--   KİLİTLEYEREK yeniden okur.
--
-- YÖNTEM: gövde elle kopyalanmıyor; canlı tanım okunup tek bir yere blok
--   eklenerek yeniden tanımlanıyor. Ekleme yapılamazsa migration HATA VERİR.
-- ════════════════════════════════════════════════════════════════════════════

DO $do$
DECLARE
  v_src  text;
  v_yeni text;
  v_ara  text;
  v_blok text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'apply_card_payment';

  IF v_src IS NULL THEN
    RAISE EXCEPTION '[P-2c] apply_card_payment bulunamadi.';
  END IF;

  -- Zaten uygulanmışsa tekrar ekleme (idempotent)
  IF position('[P-2c] KANONIK KILIT' in v_src) > 0 THEN
    RAISE NOTICE '[P-2c] Kanonik kilit blogu zaten mevcut - atlaniyor.';
    RETURN;
  END IF;

  v_ara := E'BEGIN\n  SELECT * INTO v_i FROM public.payment_intents WHERE id = p_intent_id FOR UPDATE;';

  IF position(v_ara in v_src) = 0 THEN
    RAISE EXCEPTION '[P-2c] Beklenen ekleme noktasi bulunamadi. Fonksiyon degismis - elle incelenmeli.';
  END IF;

  v_blok :=
    E'BEGIN\n'
    || E'  -- [P-2c] KANONIK KILIT SIRASI: matches -> pitch_bookings -> payment_intents\n'
    || E'  -- Ters sirali kilit = deadlock = karttan para cekilir ama slot verilmez.\n'
    || E'  DECLARE\n'
    || E'    v_lock_mid uuid;\n'
    || E'    v_lock_bid uuid;\n'
    || E'  BEGIN\n'
    || E'    SELECT match_id, booking_id INTO v_lock_mid, v_lock_bid\n'
    || E'      FROM public.payment_intents WHERE id = p_intent_id;\n'
    || E'    IF v_lock_mid IS NOT NULL THEN\n'
    || E'      PERFORM 1 FROM public.matches WHERE id = v_lock_mid FOR UPDATE;\n'
    || E'    END IF;\n'
    || E'    IF v_lock_bid IS NOT NULL THEN\n'
    || E'      PERFORM 1 FROM public.pitch_bookings WHERE id = v_lock_bid FOR UPDATE;\n'
    || E'    END IF;\n'
    || E'  END;\n\n'
    || E'  SELECT * INTO v_i FROM public.payment_intents WHERE id = p_intent_id FOR UPDATE;';

  v_yeni := replace(v_src, v_ara, v_blok);

  IF v_yeni = v_src THEN
    RAISE EXCEPTION '[P-2c] Degistirme gerceklesmedi.';
  END IF;

  EXECUTE v_yeni;
  RAISE NOTICE '[P-2c] apply_card_payment kanonik kilit sirasina alindi.';
END $do$;

-- ── Doğrulama: matches kilidi artık payment_intents kilidinden ÖNCE mi? ─────
DO $do$
DECLARE
  v_src text;
  v_m   int;
  v_p   int;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'apply_card_payment';

  SELECT min(ln) INTO v_m FROM unnest(string_to_array(v_src, E'\n')) WITH ORDINALITY t(txt, ln)
    WHERE txt ~* 'public\.matches' AND txt ~* 'FOR UPDATE';
  SELECT min(ln) INTO v_p FROM unnest(string_to_array(v_src, E'\n')) WITH ORDINALITY t(txt, ln)
    WHERE txt ~* 'payment_intents' AND txt ~* 'FOR UPDATE';

  IF v_m IS NULL OR v_p IS NULL OR v_m >= v_p THEN
    RAISE EXCEPTION '[P-2c] Kilit sirasi DOGRULANAMADI (matches=%, intents=%).', v_m, v_p;
  END IF;

  RAISE NOTICE '[P-2c] Dogrulandi: matches satir % < payment_intents satir %', v_m, v_p;
END $do$;

-- ════════════════════════════════════════════════════════════════════════════
-- GERİ ALMA: eklenen blok kaldırılır (ama YAPMAYIN — kilitlenme geri gelir):
--   canlı tanım okunup '[P-2c] KANONIK KILIT' ile başlayan DECLARE..END; bloğu
--   silinerek yeniden tanımlanır.
-- ════════════════════════════════════════════════════════════════════════════
