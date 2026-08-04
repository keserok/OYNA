-- ════════════════════════════════════════════════════════════════════════════
-- TETİKLEYİCİ FONKSİYONLARIN GEREKSİZ YETKİSİ KAPATILDI
-- CEO onayı: 4 Ağustos 2026
-- ────────────────────────────────────────────────────────────────────────────
-- BULGU: `public` şemasındaki 61 tetikleyici fonksiyonun 16'sı `anon` ve/veya
-- `authenticated` rollerine EXECUTE yetkisi taşıyordu. Kalan 45'i zaten
-- kapalıydı — yani DOĞRU HÂL ÇOĞUNLUK, bu 16 istisna: REVOKE yazılması
-- atlanmış.
--
-- NEDEN OLUYOR: PostgreSQL yeni bir fonksiyona varsayılan olarak `PUBLIC`
-- rolüne EXECUTE verir. Migration'da açıkça REVOKE yazılmazsa fonksiyon
-- herkese açık doğar. (Bu tuzağa bu oturumda bir kez daha düşülmüştü:
-- `REVOKE ... FROM anon` tek başına işe yaramaz, çünkü yetki `PUBLIC`
-- üzerinden gelir — bkz. 20260804230000_son_guvenlik_daraltmasi.sql)
--
-- İSTİSMAR EDİLEBİLİR Mİ: HAYIR — ölçüldü. PostgreSQL bir tetikleyici
-- fonksiyonun dışarıdan doğrudan çağrılmasını KENDİSİ engelliyor:
--     ERROR: trigger functions can only be called as triggers
-- Yani bu bir açık değil, HİJYEN. Ama güvenlik taramasında 16 satır gürültü
-- üretiyor ve gürültü büyüdükçe GERÇEK bir bulgu onun içinde kaybolur.
-- Kapatma sebebi budur.
--
-- TETİKLEYİCİLER ÇALIŞMAYA DEVAM EDER: PostgreSQL, EXECUTE yetkisini
-- tetikleyici KURULURKEN (CREATE TRIGGER) kontrol eder — ateş ederken değil.
-- Bu iddia aşağıda ampirik olarak da doğrulanıyor: gerçek bir tetikleyici
-- ateşlenir ve sonuç geri alınır.
--
-- KAPSAM: `public` şemasındaki TÜM tetikleyici fonksiyonlar. Tek tek listelemek
-- yerine döngü kuruldu — böylece ileride eklenecek tetikleyiciler de bu
-- migration yeniden çalıştırıldığında doğru hâle gelir.
-- `postgres` ve `service_role` rollerinin KENDİ açık yetkileri KORUNUR:
-- yalnız `PUBLIC`, `anon`, `authenticated` geri alınır.
--
-- PARA GÜVENLİĞİ: Para akışına, bakiyeye, ödemeye dokunmaz. Hiçbir veri
-- değişmez, hiçbir fonksiyonun GÖVDESİ değişmez — yalnız yetkiler daralır.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) Geri alma ────────────────────────────────────────────────────────────
DO $$
DECLARE
  r        record;
  v_dokunulan int := 0;
  v_toplam    int := 0;
BEGIN
  FOR r IN
    SELECT p.oid,
           p.oid::regprocedure::text AS imza,
           (has_function_privilege('anon', p.oid, 'EXECUTE')
            OR has_function_privilege('authenticated', p.oid, 'EXECUTE')) AS acikti
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prorettype = 'trigger'::regtype
    ORDER BY 2
  LOOP
    v_toplam := v_toplam + 1;
    IF r.acikti THEN
      v_dokunulan := v_dokunulan + 1;
      RAISE NOTICE 'yetki geri aliniyor: %', r.imza;
    END IF;
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.imza);
  END LOOP;

  RAISE NOTICE 'TETIKLEYICI HIJYENI: % fonksiyondan % tanesi disari acikti, hepsi kapatildi.',
               v_toplam, v_dokunulan;
END $$;

-- ── 2) Doğrulama: hiçbiri dışarı açık kalmamalı ─────────────────────────────
-- Başarısızsa EXCEPTION migration'ın tamamını geri alır (atomik).
DO $$
DECLARE v_kalan int; v_liste text;
BEGIN
  SELECT count(*), string_agg(p.oid::regprocedure::text, ', ')
    INTO v_kalan, v_liste
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prorettype = 'trigger'::regtype
    AND (has_function_privilege('anon', p.oid, 'EXECUTE')
         OR has_function_privilege('authenticated', p.oid, 'EXECUTE'));

  IF v_kalan > 0 THEN
    RAISE EXCEPTION 'DOGRULAMA BASARISIZ: % tetikleyici hala disari acik -> %', v_kalan, v_liste;
  END IF;
  RAISE NOTICE 'DOGRULAMA 1/2 TAMAM: hicbir tetikleyici fonksiyon disaridan cagrilamaz.';
END $$;

-- ── 3) Ampirik doğrulama: tetikleyiciler HÂLÂ ateşliyor mu? ─────────────────
-- Bu adımın amacı "teoride çalışır" demeyi bırakıp GÖSTERMEK. Gerçek bir
-- tetikleyici (touch_region_coverage — yetkisi az önce geri alınanlardan biri)
-- ateşlenir, `updated_at` gerçekten değişti mi diye bakılır, sonra değişiklik
-- iç işlemle GERİ ALINIR: tabloda hiçbir kalıcı iz kalmaz.
DO $$
DECLARE
  v_id      uuid;
  v_once    timestamptz;
  v_sonra   timestamptz;
BEGIN
  SELECT id, updated_at INTO v_id, v_once FROM public.region_coverage ORDER BY id LIMIT 1;
  IF v_id IS NULL THEN
    RAISE NOTICE 'DOGRULAMA 2/2 ATLANDI: region_coverage bos.';
    RETURN;
  END IF;

  BEGIN
    UPDATE public.region_coverage SET city = city WHERE id = v_id;
    SELECT updated_at INTO v_sonra FROM public.region_coverage WHERE id = v_id;

    IF v_sonra IS NOT DISTINCT FROM v_once THEN
      RAISE EXCEPTION 'TETIKLEYICI_ATESLEMEDI';
    END IF;

    -- Buraya geldiysek tetikleyici çalıştı. Değişikliği geri al.
    RAISE EXCEPTION 'GERI_AL';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM = 'GERI_AL' THEN
        RAISE NOTICE 'DOGRULAMA 2/2 TAMAM: yetki geri alindiktan SONRA da tetikleyici atesledi (% -> %); test degisikligi geri alindi.',
                     v_once, v_sonra;
      ELSIF SQLERRM = 'TETIKLEYICI_ATESLEMEDI' THEN
        RAISE EXCEPTION 'DOGRULAMA BASARISIZ: yetki geri alininca tetikleyici ATESLEMEDI. Degisiklik geri aliniyor.';
      ELSE
        RAISE;
      END IF;
  END;
END $$;
