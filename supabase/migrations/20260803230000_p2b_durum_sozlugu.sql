-- ════════════════════════════════════════════════════════════════════════════
-- [P-2b / M-P0-5] MAÇ DURUM SÖZLÜĞÜ + HESAP SİLME KAPISI
-- ────────────────────────────────────────────────────────────────────────────
-- SORUN 1 — Hayalet sözlük (canlıda doğrulandı):
--   Hesap silme kapısı şunu kontrol ediyordu:
--     m.status IN ('GATHERING','CONFIRMED','PLAYING','LIVE')
--   Ama 'GATHERING' ve 'PLAYING' bu sistemde HİÇ kullanılmıyor (repo geneli
--   arama: 0 sonuç). Gerçek sözlük types.ts:294'te:
--     'DRAFT' | 'ACTIVE' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'LIVE'
--   Kapıda EKSİK olan 'ACTIVE', maçların ana çalışır durumu (canlıda 5 maç).
--   SONUÇ: parası bir maçta bloke duran kullanıcı hesabını SİLEBİLİYORDU.
--   Kapı vardı, hata vermiyordu, hiç tetiklenmiyordu.
--
--   Aynı hatalı satır ÜÇ fonksiyonda: _account_deletion_status,
--   admin_process_account_deletion__core, process_expired_account_deletions.
--
-- SORUN 2 — matches.status'ta CHECK yok:
--   matches tablosunda 6 CHECK kısıtı var (deposit_status, score_status,
--   visibility, commission_model, duration_minutes, footwear_rule) ama
--   status'ta YOK. Yani bir yazım hatası ('ACTIVE ' sondaki boşlukla)
--   sessizce kaydedilir ve o maç bütün filtrelerden düşer.
--
-- ⚠️ MİMAR RAPORUNUN DÜZELTİLMESİ: Rapor canlıdaki 'CONFIRMED' satırını
--   "sözlük dışı" diye işaretlemişti. YANLIŞTI — 'CONFIRMED' types.ts:294'te
--   geçerli bir değer. Gerçek sorun yalnız CHECK'in yokluğu ve kapıdaki
--   hayalet kelimelerdi. Demo satırında düzeltilecek bir şey yok.
--
-- YÖNTEM — fonksiyonlar ELLE KOPYALANMIYOR:
--   Gövdeleri elle yeniden yazmak transkripsiyon hatası riski taşır. Bunun
--   yerine canlı tanım okunup yalnız ilgili metin değiştirilerek yeniden
--   tanımlanıyor. Beklenen fonksiyon sayısı tutmazsa migration HATA VERİR.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) Sözlük kısıtı ────────────────────────────────────────────────────────
ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_status_check;
ALTER TABLE public.matches ADD CONSTRAINT matches_status_check
  CHECK (status IS NULL OR status IN ('DRAFT','ACTIVE','CONFIRMED','CANCELLED','COMPLETED','LIVE'));

COMMENT ON CONSTRAINT matches_status_check ON public.matches IS
  'P-2b/M-P0-5: gecerli mac durum sozlugu. Kaynak: types.ts:294. Yeni bir durum eklenecekse ONCE burasi guncellenir.';

-- ── 2) Hayalet sözlüğü kullanan tüm fonksiyonlar ────────────────────────────
DO $do$
DECLARE
  r        record;
  v_yeni   text;
  v_sayi   int := 0;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_functiondef(p.oid) AS src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND position($q$'GATHERING','CONFIRMED','PLAYING','LIVE'$q$ in pg_get_functiondef(p.oid)) > 0
  LOOP
    v_yeni := replace(
      r.src,
      $q$'GATHERING','CONFIRMED','PLAYING','LIVE'$q$,
      $q$'DRAFT','ACTIVE','CONFIRMED','LIVE'$q$
    );
    EXECUTE v_yeni;
    v_sayi := v_sayi + 1;
    RAISE NOTICE '[P-2b] Sozluk duzeltildi: %', r.proname;
  END LOOP;

  -- Sessiz geçme yok: beklenenden farklıysa migration başarısız olsun.
  IF v_sayi <> 3 THEN
    RAISE EXCEPTION '[P-2b] Beklenen 3 fonksiyon, bulunan %. Durum degismis - elle incelenmeli.', v_sayi;
  END IF;
END $do$;

-- ════════════════════════════════════════════════════════════════════════════
-- GERİ ALMA:
--   ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_status_check;
--   -- Fonksiyonlar icin ters yonde ayni DO blogu calistirilir
--   -- ('DRAFT','ACTIVE','CONFIRMED','LIVE' -> 'GATHERING','CONFIRMED','PLAYING','LIVE')
--   -- ama bunu YAPMAYIN: eski hali kapiyi tamamen etkisiz kiliyordu.
-- ════════════════════════════════════════════════════════════════════════════
