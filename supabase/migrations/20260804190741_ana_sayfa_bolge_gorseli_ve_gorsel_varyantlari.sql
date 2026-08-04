-- ════════════════════════════════════════════════════════════════════════════
-- ANA SAYFA · BÖLGE GÖRSELİ + GÖRSEL VARYANTLARI
-- ────────────────────────────────────────────────────────────────────────────
-- NEDEN (onaylı ana sayfa tasarımı, 2026-08):
--
--   1) "Saha Kirala" kartının sağındaki fotoğraf ARTIK SABİT DEĞİL. Proje
--      sahibinin kararı: temelde tek bir marka görseli durur, ama bölge bölge
--      (il / ilçe) panelden değiştirilebilir. Ordu'daki oyuncu Ordu'yu,
--      İstanbul'daki oyuncu İstanbul'u görsün.
--
--   2) Ekrandaki üç fotoğraf alanı (maç kartı, saha bandı, profil) telefon
--      ekranına göre ÜÇ AYRI BOYDA sunulmalı (@1x/@2x/@3x), WebP olmalı ve
--      açılırken bulanık bir minyatürle (LQIP) yer tutmalı. Bugün tek boy
--      JPEG yükleniyor: 675 KB'lık bir bant fotoğrafı orta segment Android'de
--      ilk açılışı görünür biçimde geciktiriyor.
--
-- BU MIGRATION NE YAPAR
--   • `image_variants`  — bir orijinal görselin türetilmiş boyları. Tek yer;
--     saha fotoğrafı da, bant görseli de, avatar da aynı tablodan okunur.
--     Mevcut tabloların HİÇBİRİNE kolon eklemez (yayılım yarıçapı sıfır).
--   • `home_banners`    — bölgeye göre ana sayfa bant görseli.
--   • `home_banner_for_region()` — okuma RPC'si; ilçe → il → varsayılan
--     sırasıyla tek satır döner, varyantları da birleştirilmiş hâlde.
--   • `admin_upsert_home_banner()` / `admin_delete_home_banner()` — yazma;
--     `require_admin_role(ARRAY[]::text[])` kapısıyla YALNIZ ADMIN/SUPER_ADMIN.
--
-- PARA GÜVENLİĞİ: bu migration para akışına, bakiyeye, ödemeye DOKUNMAZ.
-- Hiçbir kaydı silmez; yalnız iki yeni tablo ve dört fonksiyon ekler.
--
-- YETKİ ÖZETİ (docs/master/RPC_YETKI_ENVANTERI.md ile aynı dil):
--   okuma  → herkes (anon dahil), yalnız `is_active` satırlar
--   yazma  → yalnız ADMIN / SUPER_ADMIN
-- Gerekçe: bant görseli bir BÖLGEDEKİ HERKESİN gördüğü sunum içeriğidir;
-- `admin_update_texts` ile aynı sınıfta sayıldı.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) GÖRSEL VARYANTLARI ───────────────────────────────────────────────────
-- Anahtar: storage yolu (bucket içi yol). Aynı görsel iki yerde kullanılsa
-- bile varyantlar bir kez üretilir ve bir kez saklanır.
--
-- `lqip` bir data: URI'dir (≈16px genişlikte bulanık WebP, birkaç yüz bayt).
-- Ayrı bir dosya olarak tutulsaydı, "yer tutucu"yu görmek için de bir ağ
-- isteği gerekirdi — amacın tam tersi.

CREATE TABLE IF NOT EXISTS public.image_variants (
  storage_path   text PRIMARY KEY,
  bucket         text NOT NULL DEFAULT 'images',
  url_1x         text NOT NULL,
  url_2x         text NOT NULL,
  url_3x         text NOT NULL,
  lqip           text,
  width          integer NOT NULL,
  height         integer NOT NULL,
  bytes_original integer,
  created_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.image_variants IS
  'Bir orijinal görselden türetilmiş WebP boyları (@1x/@2x/@3x) ve bulanık '
  'minyatürü (LQIP). Üretim YÜKLEME ANINDA, tarayıcıda yapılır '
  '(OYNA_PRENSIPLER.md · PRO-3); Pro planda sunucu tarafına taşınacak.';
COMMENT ON COLUMN public.image_variants.lqip IS
  'data: URI — ~16px bulanık WebP. Ağ isteği gerektirmesin diye satırda tutulur.';
COMMENT ON COLUMN public.image_variants.width IS
  'ORİJİNALİN genişliği (px). @3x bundan büyük olamaz — büyütme yapılmaz.';

ALTER TABLE public.image_variants ENABLE ROW LEVEL SECURITY;

-- Okuma herkese açık: bu satırlar zaten herkese açık (`images` bucket'ı public)
-- görsellerin adreslerinden ibarettir, kişisel veri taşımaz.
DROP POLICY IF EXISTS image_variants_read ON public.image_variants;
CREATE POLICY image_variants_read ON public.image_variants
  FOR SELECT USING (true);

-- Yazma YALNIZ sunucu tarafından (edge function service_role ile yazar).
-- `authenticated` ve `anon` için hiçbir yazma politikası tanımlı DEĞİL →
-- RLS açık olduğu için varsayılan RED. service_role RLS'i atlar.
REVOKE ALL ON TABLE public.image_variants FROM PUBLIC;
GRANT SELECT ON TABLE public.image_variants TO anon, authenticated;


-- ── 2) BÖLGEYE GÖRE ANA SAYFA BANDI ─────────────────────────────────────────
-- Üç kademe, en özelden en genele:
--   (city='Ordu', district='Altınordu')  → o ilçe
--   (city='Ordu', district=NULL)         → il geneli
--   (city=NULL,  district=NULL)          → VARSAYILAN (marka görseli)
--
-- Proje sahibinin istediği davranış tam olarak budur: temelde sabit bir marka
-- görseli vardır, üstüne bölge istisnaları konur.

CREATE TABLE IF NOT EXISTS public.home_banners (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot         text NOT NULL DEFAULT 'PITCH_RENT',
  city         text,
  district     text,
  source_url   text NOT NULL,
  storage_path text,
  alt_text     text,
  is_active    boolean NOT NULL DEFAULT true,
  updated_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT home_banners_slot_chk CHECK (slot IN ('PITCH_RENT')),
  -- İlçe varsa il de olmalı; "ilçesi var ama ili yok" diye bir bölge yoktur.
  CONSTRAINT home_banners_region_chk CHECK (district IS NULL OR city IS NOT NULL)
);

COMMENT ON TABLE public.home_banners IS
  'Ana sayfadaki bölgeye göre değişen bant görseli. city/district NULL = '
  'varsayılan (marka) görseli. Çözümleme: ilçe → il → varsayılan.';
COMMENT ON COLUMN public.home_banners.slot IS
  'Hangi bant. Bugün tek değer: PITCH_RENT (Saha Kirala kartı).';
COMMENT ON COLUMN public.home_banners.storage_path IS
  'image_variants ile eşleşen storage yolu. NULL ise varyant yoktur ve '
  'istemci source_url''i tek boy olarak kullanır.';

-- Aynı bölge için iki AKTİF kayıt olamaz. NULL''lar eşit sayılmadığı için
-- kısmi ifade indeksinde COALESCE ile normalize edilir.
CREATE UNIQUE INDEX IF NOT EXISTS home_banners_region_uidx
  ON public.home_banners (slot, COALESCE(city, ''), COALESCE(district, ''))
  WHERE is_active;

ALTER TABLE public.home_banners ENABLE ROW LEVEL SECURITY;

-- Okuma: herkes, yalnız aktif satırlar. Giriş yapmamış kullanıcı da ana
-- sayfayı görebilmeli (önbellekten çizim + ilk açılış).
DROP POLICY IF EXISTS home_banners_read ON public.home_banners;
CREATE POLICY home_banners_read ON public.home_banners
  FOR SELECT USING (is_active);

-- Yazma politikası YOK → RLS varsayılanı RED. Yazma yalnız aşağıdaki
-- SECURITY DEFINER RPC'lerinden, admin kapısından geçerek yapılır.
REVOKE ALL ON TABLE public.home_banners FROM PUBLIC;
GRANT SELECT ON TABLE public.home_banners TO anon, authenticated;


-- ── 3) OKUMA RPC'Sİ ─────────────────────────────────────────────────────────
-- Tek çağrı, tek satır: istemci kademe mantığını bilmek zorunda kalmasın.
-- `STABLE` — aynı işlem içinde aynı sonucu verir, planlayıcı önbellekleyebilir.

CREATE OR REPLACE FUNCTION public.home_banner_for_region(
  p_city     text DEFAULT NULL,
  p_district text DEFAULT NULL,
  p_slot     text DEFAULT 'PITCH_RENT'
)
RETURNS TABLE (
  source_url text,
  url_1x     text,
  url_2x     text,
  url_3x     text,
  lqip       text,
  alt_text   text,
  scope      text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT
    b.source_url,
    v.url_1x,
    v.url_2x,
    v.url_3x,
    v.lqip,
    b.alt_text,
    CASE
      WHEN b.district IS NOT NULL THEN 'DISTRICT'
      WHEN b.city     IS NOT NULL THEN 'CITY'
      ELSE 'DEFAULT'
    END AS scope
  FROM public.home_banners b
  LEFT JOIN public.image_variants v ON v.storage_path = b.storage_path
  WHERE b.is_active
    AND b.slot = p_slot
    AND (
      (b.city IS NULL     AND b.district IS NULL)
      OR (b.city = p_city AND b.district IS NULL)
      OR (b.city = p_city AND b.district = p_district)
    )
  -- En özel eşleşme kazanır: ilçe (0) → il (1) → varsayılan (2).
  ORDER BY
    CASE
      WHEN b.district IS NOT NULL THEN 0
      WHEN b.city     IS NOT NULL THEN 1
      ELSE 2
    END
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.home_banner_for_region(text, text, text) IS
  'Ana sayfa bant görselini bölgeye göre çözer: ilçe → il → varsayılan.';

REVOKE ALL ON FUNCTION public.home_banner_for_region(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.home_banner_for_region(text, text, text) TO anon, authenticated;


-- ── 4) YAZMA RPC'LERİ (yalnız ADMIN / SUPER_ADMIN) ──────────────────────────

CREATE OR REPLACE FUNCTION public.admin_upsert_home_banner(
  p_city         text,
  p_district     text,
  p_source_url   text,
  p_storage_path text DEFAULT NULL,
  p_alt_text     text DEFAULT NULL,
  p_slot         text DEFAULT 'PITCH_RENT'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_city     text := NULLIF(btrim(COALESCE(p_city, '')), '');
  v_district text := NULLIF(btrim(COALESCE(p_district, '')), '');
  v_id       uuid;
BEGIN
  PERFORM public.require_admin_role(ARRAY[]::text[]);

  IF NULLIF(btrim(COALESCE(p_source_url, '')), '') IS NULL THEN
    RAISE EXCEPTION 'INVALID: görsel adresi boş olamaz';
  END IF;
  IF v_district IS NOT NULL AND v_city IS NULL THEN
    RAISE EXCEPTION 'INVALID: ilçe seçildiyse il de seçilmeli';
  END IF;

  -- Aynı bölgenin aktif kaydı varsa üstüne yaz; yoksa yeni satır aç.
  UPDATE public.home_banners
     SET source_url   = p_source_url,
         storage_path = p_storage_path,
         alt_text     = p_alt_text,
         updated_by   = auth.uid(),
         updated_at   = now()
   WHERE is_active
     AND slot = p_slot
     AND COALESCE(city, '')     = COALESCE(v_city, '')
     AND COALESCE(district, '') = COALESCE(v_district, '')
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    INSERT INTO public.home_banners (slot, city, district, source_url, storage_path, alt_text, updated_by)
    VALUES (p_slot, v_city, v_district, p_source_url, p_storage_path, p_alt_text, auth.uid())
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.admin_upsert_home_banner(text, text, text, text, text, text) IS
  'Bölgeye ana sayfa bant görseli atar (varsa günceller). Yalnız ADMIN/SUPER_ADMIN.';

CREATE OR REPLACE FUNCTION public.admin_delete_home_banner(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  PERFORM public.require_admin_role(ARRAY[]::text[]);
  -- Silmiyoruz, pasifleştiriyoruz: hangi bölgeye ne zaman ne konduğu izlenebilir
  -- kalsın. Kısmi benzersiz indeks yalnız aktif satırlara baktığı için aynı
  -- bölgeye hemen yeni görsel atanabilir.
  UPDATE public.home_banners
     SET is_active = false, updated_by = auth.uid(), updated_at = now()
   WHERE id = p_id;
END;
$$;

COMMENT ON FUNCTION public.admin_delete_home_banner(uuid) IS
  'Bölge bant görselini pasifleştirir (kayıt silinmez). Yalnız ADMIN/SUPER_ADMIN.';

REVOKE ALL ON FUNCTION public.admin_upsert_home_banner(text, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_home_banner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_upsert_home_banner(text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_home_banner(uuid) TO authenticated;


-- ── 5) VARYANT KAYIT RPC'Sİ ─────────────────────────────────────────────────
-- Boylar YÜKLEME ANINDA, tarayıcıda üretilir (OYNA_PRENSIPLER.md · PRO-3:
-- "ücretsiz planda yükleme anında çok boy; Pro'da sunucu tarafı dönüştürme").
-- Bu yüzden kaydı da yükleyen istemci yapar.
--
-- GÜVENLİK KAPISI — burası kritik: `storage_path` serbest metin olsaydı, giriş
-- yapmış HERHANGİ bir kullanıcı BAŞKASININ görselinin varyant adreslerini
-- kendi yüklediği görsellerle değiştirebilirdi (ekranda görünen fotoğrafı
-- sessizce değiştirmek = içerik ele geçirme). Bu yüzden çağıran, o storage
-- nesnesinin SAHİBİ olmak zorundadır. Admin muaftır (panelden yönetim).
--
-- Pro plana geçildiğinde bu fonksiyonun gövdesi değişmez; yalnız çağıran
-- taraf (tarayıcı yerine sunucu) değişir.

CREATE OR REPLACE FUNCTION public.record_image_variants(
  p_storage_path   text,
  p_url_1x         text,
  p_url_2x         text,
  p_url_3x         text,
  p_lqip           text,
  p_width          integer,
  p_height         integer,
  p_bytes_original integer DEFAULT NULL,
  p_bucket         text DEFAULT 'images'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF p_width IS NULL OR p_width <= 0 OR p_height IS NULL OR p_height <= 0 THEN
    RAISE EXCEPTION 'INVALID: görsel ölçüleri geçersiz';
  END IF;
  IF NULLIF(btrim(COALESCE(p_storage_path, '')), '') IS NULL THEN
    RAISE EXCEPTION 'INVALID: storage yolu boş olamaz';
  END IF;

  -- Yalnız kendi yüklediğin nesnenin varyantını kaydedebilirsin.
  IF NOT public.is_platform_admin() THEN
    IF NOT EXISTS (
      SELECT 1 FROM storage.objects o
       WHERE o.bucket_id = p_bucket
         AND o.name = p_storage_path
         AND o.owner = auth.uid()
    ) THEN
      RAISE EXCEPTION 'FORBIDDEN: bu görselin sahibi değilsiniz';
    END IF;
  END IF;

  INSERT INTO public.image_variants (
    storage_path, bucket, url_1x, url_2x, url_3x, lqip, width, height, bytes_original
  )
  VALUES (
    p_storage_path, p_bucket, p_url_1x, p_url_2x, p_url_3x, p_lqip, p_width, p_height, p_bytes_original
  )
  ON CONFLICT (storage_path) DO UPDATE
    SET url_1x = EXCLUDED.url_1x,
        url_2x = EXCLUDED.url_2x,
        url_3x = EXCLUDED.url_3x,
        lqip   = EXCLUDED.lqip,
        width  = EXCLUDED.width,
        height = EXCLUDED.height,
        bytes_original = EXCLUDED.bytes_original;
END;
$$;

COMMENT ON FUNCTION public.record_image_variants(text, text, text, text, text, integer, integer, integer, text) IS
  'Yükleme anında üretilen WebP boylarını kaydeder. Çağıran, storage nesnesinin '
  'sahibi olmalıdır (admin muaf) — aksi hâlde başkasının görseli değiştirilebilirdi.';

REVOKE ALL ON FUNCTION public.record_image_variants(text, text, text, text, text, integer, integer, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_image_variants(text, text, text, text, text, integer, integer, integer, text) TO authenticated;
