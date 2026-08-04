-- ════════════════════════════════════════════════════════════════════════════
-- [SON-2] GEÇİCİ TABLO TEMİZLİĞİ + YEDEK KAPSAMI
-- Kurucu onayı: SON_KARARLAR 11 ve 28
-- ────────────────────────────────────────────────────────────────────────────
-- ⚠️ 27 NUMARALI MADDE YAPILMADI — ve bunu açıkça yazıyorum:
-- `net._http_response` için otomatik temizlik önermiştim. Uygulamadan önce
-- ölçtüm: pg_net'in kendi `pg_net.ttl` ayarı **6 saat** ve tablo kendini zaten
-- temizliyor (13 satır duruyor). Önerim gereksizmiş; boşuna bir zamanlanmış iş
-- eklemek mekanizmayı kirletirdi. Yapılmadı.
--
-- YAN BULGU (düzeltilmedi, kayda geçiyor): `K-BILDIRIM-1` denetimi
-- "son 24 saatte başarısız çağrı" diye sorguluyor ama pg_net 6 saatten eski
-- kayıtları siliyor. Yani gece yarısı olan bir bildirim hatası, sabah 06:40
-- denetimine kadar silinmiş olur ve kontrol YEŞİL görünür. Denetimin kendi
-- geçmişini tutması gerekir — ayrı bir iş.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 11 · Geçici tablo: önce kopyala, sonra sil ──────────────────────────────
-- `_saat_dilimi_duzeltme_yedek`, saat dilimi düzeltmesinden kalma 6 satırlık
-- geçici bir tablo. İşlevi bitti. Yine de körlemesine silmiyoruz: içeriği
-- `yedek` şemasına taşınıyor ki bir ihtiyaç çıkarsa elimizde olsun.
DO $tasi$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='_saat_dilimi_duzeltme_yedek') THEN
    EXECUTE 'DROP TABLE IF EXISTS yedek.saat_dilimi_duzeltme_arsiv';
    EXECUTE 'CREATE TABLE yedek.saat_dilimi_duzeltme_arsiv AS
             SELECT * FROM public._saat_dilimi_duzeltme_yedek';
    EXECUTE 'DROP TABLE public._saat_dilimi_duzeltme_yedek';
  END IF;
END
$tasi$;

COMMENT ON TABLE yedek.saat_dilimi_duzeltme_arsiv IS
  'SON-2: public._saat_dilimi_duzeltme_yedek tablosunun arsivi. Saat dilimi duzeltmesinden kalma, islevi bitti.';

-- ── 28 · Yedek kapsamına iki yeri doldurulamaz tablo ekleniyor ──────────────
-- `app_config` platformun TÜM davranış anahtarlarını tutuyor (55 kayıt).
-- Migration'lar bu tabloyu tohumluyor ama canlı değerler kaymış durumda —
-- örneğin `functions_base_url` P-0'da elle dolduruldu. Sıfırdan kurulumda o
-- ayar boş gelir ve 4 ay süren sessiz bildirim arızası aynen tekrarlanır.
--
-- `commission_config` saha anlaşmalarını (komisyon oranları) tutuyor; bu da
-- ticari bir veridir ve kaybı doğrudan para kaybıdır.
INSERT INTO yedek.kapsam (tablo_adi, aciklama) VALUES
  ('app_config',        'Platformun tum davranis anahtarlari — sifirdan kurulumda kaymis degerler kaybolur'),
  ('commission_config', 'Saha anlasmalari / komisyon oranlari — ticari veri')
ON CONFLICT (tablo_adi) DO NOTHING;

-- İlk yedeği hemen al ki yeni tablolar da kapsama girsin.
SELECT yedek.gunluk_al();

-- ── Doğrulama ───────────────────────────────────────────────────────────────
DO $dogrula$
DECLARE v_beklenen int; v_alinan int;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='public' AND c.relname='_saat_dilimi_duzeltme_yedek') THEN
    RAISE EXCEPTION 'SON-2 eksik: gecici tablo hala duruyor';
  END IF;

  SELECT (public.yedek_durumu()->>'beklenen_tablo')::int,
         (public.yedek_durumu()->>'son_gun_tablo')::int
    INTO v_beklenen, v_alinan;

  IF v_beklenen <> 10 THEN
    RAISE EXCEPTION 'SON-2 eksik: yedek kapsami % tablo (10 olmali)', v_beklenen;
  END IF;
  IF v_alinan < v_beklenen THEN
    RAISE EXCEPTION 'SON-2 eksik: yedekte % / % tablo var', v_alinan, v_beklenen;
  END IF;
END
$dogrula$;
