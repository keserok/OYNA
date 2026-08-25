-- ════════════════════════════════════════════════════════════════════════════
-- SIZAN GÖRSELLER KALDIRILDI (25 Ağustos 2026)
-- ════════════════════════════════════════════════════════════════════════════
--
-- App Store ekran görüntüsü çekilirken vitrindeki fotoğraflara ilk kez
-- TEK TEK BAKILDI. Görülen şuydu: `images` kovası HERKESE AÇIK ve içinde
-- uygulamayla ilgisi olmayan üç tür dosya var. Üçü de canlıda, üçü de
-- kullanıcının gördüğü ekranlarda.
--
-- ─── 1) KİŞİSEL FOTOĞRAFLAR (en ağırı) ──────────────────────────────────────
-- Tanınabilir kişilerin ve ÇOCUKLARIN özel fotoğrafları, saha/kort görseli
-- ve profil avatarı olarak yayında. Muhtemelen fotoğraf yükleme akışı
-- denenirken telefondan seçilip unutulmuş.
--
-- KVKK açısından bu bir veri ihlalidir: açık rıza yok, hukuki sebep yok,
-- veri sorumlusu kurucudur ve ispat yükü ondadır. Çocuk fotoğrafı olması
-- ağırlaştırıcıdır. Apple açısından 5.1.1 (gizlilik) ve 1.2 (kullanıcı
-- içeriği) kapsamındadır.
--
-- ─── 2) ÜÇÜNCÜ KİŞİ TELİFİ ──────────────────────────────────────────────────
-- "Panorama Spor Tesisleri" ve "Safak Hali Saha" sahalarının vitrin
-- fotoğrafı FIFA Dünya Kupası kupasının renderıydı — kaidesinde
-- "FIFA WORLD CUP" yazısı okunuyor. Aynı dosya üç yere kopyalanmış.
-- Bir kortun fotoğrafı ise gerçek, tanınabilir bir futbolcunun basın
-- fotoğrafıydı. İkisi de tescilli marka / kişilik hakkı; Apple 5.2.
--
-- Ağırlığı: kupa fotoğrafı "Saha Kirala" listesinin İLK kartıydı.
-- İnceleyen uygulamayı açtıktan saniyeler sonra görüyordu.
--
-- ─── 3) UYGULAMANIN KENDİ LOGOSU ────────────────────────────────────────────
-- Bir sahanın ve bir demo profilin fotoğrafı olarak OYNA logosu duruyordu.
-- Telif sorunu değil ama "yarım bırakılmış ürün" görüntüsü — Apple 2.1.
--
-- ─── DÜZELTME ───────────────────────────────────────────────────────────────
-- Bu göç yalnızca VERİTABANI BAĞLARINI koparır: hiçbir dosyayı silmez.
-- Bilinçli bir tercihtir — depodaki nesneyi silmek geri alınamaz, kişisel
-- fotoğrafların tek kopyası olabilir, o karar kurucunundur. Bağ koptuğunda
-- uygulama görseli SERVİS ETMEYİ BIRAKIR; dosya ise adresini bilenler için
-- erişilebilir kalmaya devam eder. Kalıcı silme ayrı bir adımdır.
--
-- SIRA ÖNEMLİ: `trg_matches_autofill_image`, maçın görseli NULL'landığında
-- onu `_pitch_image(pitch_id)` ile yeniden doldurur. Önce saha temizlenmezse
-- maç aynı kupa fotoğrafını geri çeker. Bu yüzden saha → kort → profil →
-- maç sırası izlenir.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- Kaldırılacak dosyaların ad parçaları. Tam URL değil parça aranır:
-- aynı dosya farklı klasörlere kopyalanmış durumda ve depo adresi
-- ileride değişebilir.
CREATE TEMP TABLE _sizan(parca text PRIMARY KEY, tur text) ON COMMIT DROP;
INSERT INTO _sizan VALUES
  ('1785754944701_6251sf395g7', 'KISISEL'),
  ('1785755000065_zyyogu2rq1r', 'KISISEL'),
  ('1784478259933_2r0ddztl9b4', 'KISISEL'),
  ('1787673941131_096tl6gjxl4f','KISISEL'),
  ('1787673959548_t68d7129w3f', 'KISISEL'),
  ('1784553998988_7zxyupupnvc', 'TELIF'),
  ('1784553999200_zsxtt7wpst',  'TELIF'),
  ('1785254543922_2od4oqlchnb', 'TELIF'),
  ('1784736683246_saox1t2a12',  'TELIF'),
  ('1785254361205_lkgor2ikz0f', 'TELIF'),
  ('1785165009806_6a052tgyd8',  'TELIF'),
  ('1783179975695_v8v40idnnz',  'LOGO'),
  ('1784338920486_golnofsbs9n', 'LOGO');

-- 1) SAHALAR — hem tekil `image` hem `images` dizisi
UPDATE public.pitches p
   SET image = NULL
 WHERE EXISTS (SELECT 1 FROM _sizan s WHERE p.image LIKE '%'||s.parca||'%');

UPDATE public.pitches p
   SET images = COALESCE((
         SELECT jsonb_agg(e)
         FROM jsonb_array_elements(p.images) AS e
         WHERE NOT EXISTS (SELECT 1 FROM _sizan s WHERE e::text LIKE '%'||s.parca||'%')
       ), '[]'::jsonb)
 WHERE EXISTS (SELECT 1 FROM _sizan s WHERE p.images::text LIKE '%'||s.parca||'%');

-- 2) KORTLAR — yalnız sızan öğe çıkarılır, sağlam fotoğraf varsa kalır
UPDATE public.courts c
   SET images = COALESCE((
         SELECT jsonb_agg(e)
         FROM jsonb_array_elements(c.images) AS e
         WHERE NOT EXISTS (SELECT 1 FROM _sizan s WHERE e::text LIKE '%'||s.parca||'%')
       ), '[]'::jsonb)
 WHERE EXISTS (SELECT 1 FROM _sizan s WHERE c.images::text LIKE '%'||s.parca||'%');

-- 3) PROFİLLER — avatar NULL olunca uygulama baş harf rozetine döner
UPDATE public.profiles pr
   SET avatar_url = NULL
 WHERE EXISTS (SELECT 1 FROM _sizan s WHERE pr.avatar_url LIKE '%'||s.parca||'%');

-- 4) MAÇLAR — en son. Saha artık temiz olduğu için autofill tetiği
--    NULL'ı yeniden doldurmaya kalktığında elinde kirli görsel bulamaz.
UPDATE public.matches m
   SET image = NULL
 WHERE EXISTS (SELECT 1 FROM _sizan s WHERE m.image LIKE '%'||s.parca||'%');

-- ═══ DOĞRULAMA (§7.7) ══════════════════════════════════════════════════════
DO $$
DECLARE
  r record; v_kalan int; v_toplam int := 0;
BEGIN
  FOR r IN SELECT parca, tur FROM _sizan LOOP
    SELECT
      (SELECT count(*) FROM public.pitches  WHERE image LIKE '%'||r.parca||'%')
    + (SELECT count(*) FROM public.pitches  WHERE images::text LIKE '%'||r.parca||'%')
    + (SELECT count(*) FROM public.courts   WHERE images::text LIKE '%'||r.parca||'%')
    + (SELECT count(*) FROM public.profiles WHERE avatar_url LIKE '%'||r.parca||'%')
    + (SELECT count(*) FROM public.matches  WHERE image LIKE '%'||r.parca||'%')
    INTO v_kalan;

    IF v_kalan > 0 THEN
      RAISE EXCEPTION 'DOGRULAMA: % dosyasi (%) hala % satirda bagli', r.parca, r.tur, v_kalan;
    END IF;
    v_toplam := v_toplam + 1;
  END LOOP;

  -- Autofill tetigi kirli gorseli GERI GETIRMEMIS olmali. Maçların görseli
  -- ya NULL'dır ya da sahasının temiz fotoğrafıdır; asla sızan dosya değil.
  SELECT count(*) INTO v_kalan
  FROM public.matches m
  WHERE m.image IS NOT NULL
    AND EXISTS (SELECT 1 FROM _sizan s WHERE m.image LIKE '%'||s.parca||'%');
  IF v_kalan > 0 THEN
    RAISE EXCEPTION 'DOGRULAMA: autofill tetigi % macta sizan gorseli geri getirdi', v_kalan;
  END IF;

  RAISE NOTICE 'DOGRULAMA GECTI: % dosyanin tum bağı koparıldı', v_toplam;
END $$;

COMMIT;
