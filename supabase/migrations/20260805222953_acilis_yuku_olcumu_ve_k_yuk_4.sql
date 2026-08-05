-- ════════════════════════════════════════════════════════════════════════════
-- AÇILIŞ YÜKÜ ÖLÇÜMÜ — tablo + yazım kapısı   (B09 YUK yapı taşı)
-- ════════════════════════════════════════════════════════════════════════════
--
-- NEDEN:
-- Uygulama açılışında atılan istek sayısı, ölçülmediği için sessizce büyümüştü:
-- hiç kullanılmayan bir takım listesi, panelin yönetici fonksiyonu, ülke geneli
-- saha/maç sorguları... Hepsi düzeltildi (10 istek → 7). Ama düzeltmenin kendisi
-- bir koruma DEĞİLDİR; koruma, bozulduğunda HABER VERENDİR (P-0).
--
-- Bu dosya haber verme yolunun ilk yarısını kurar: ölçümün yazıldığı yer.
-- İkinci yarısı (K-YUK-4 gece kontrolü) bir sonraki migration'dadır.
--
-- GERİ ALMA:
--   DROP FUNCTION IF EXISTS public.acilis_olcumu_yaz(int,int,boolean,text,text);
--   DROP TABLE IF EXISTS public.acilis_olcumu;
-- ════════════════════════════════════════════════════════════════════════════

-- ── ÖLÇÜM TABLOSU ──────────────────────────────────────────────────────────
-- Kişisel veri YOK: kim olduğu değil, açılışın kaça mal olduğu tutulur.
CREATE TABLE IF NOT EXISTS public.acilis_olcumu (
  id              bigserial PRIMARY KEY,
  olustu_at       timestamptz NOT NULL DEFAULT now(),
  istek_sayisi    int         NOT NULL,
  sure_ms         int         NOT NULL,
  bolge_biliniyor boolean     NOT NULL DEFAULT false,
  platform        text,
  surum           text,
  CONSTRAINT acilis_olcumu_makul_istek CHECK (istek_sayisi BETWEEN 0 AND 200),
  CONSTRAINT acilis_olcumu_makul_sure  CHECK (sure_ms      BETWEEN 0 AND 600000)
);

CREATE INDEX IF NOT EXISTS acilis_olcumu_zaman_idx
  ON public.acilis_olcumu (olustu_at DESC);

ALTER TABLE public.acilis_olcumu ENABLE ROW LEVEL SECURITY;

-- OKUMA: yalnız yönetici. Ölçüm kullanıcıya ait değildir, operasyon verisidir.
DROP POLICY IF EXISTS acilis_olcumu_select_admin ON public.acilis_olcumu;
CREATE POLICY acilis_olcumu_select_admin ON public.acilis_olcumu
  FOR SELECT TO authenticated
  USING (public.is_platform_admin());

-- YAZMA: doğrudan INSERT'e kapalı (politika yazılmadı). Yazım yalnız aşağıdaki
-- fonksiyonla yapılır; böylece uydurma/aşırı kayıt tek noktadan sınırlanabilir.
REVOKE ALL ON public.acilis_olcumu FROM anon, authenticated;

-- ── YAZIM KAPISI ───────────────────────────────────────────────────────────
-- Uygulama bunu çağırır. Giriş yapılmamış olsa da çalışır (açılış ölçümü
-- misafirleri de kapsamalı), ama YALNIZ ölçüm satırı yazar; başka yetki vermez.
CREATE OR REPLACE FUNCTION public.acilis_olcumu_yaz(
  p_istek_sayisi    int,
  p_sure_ms         int,
  p_bolge_biliniyor boolean,
  p_platform        text DEFAULT NULL,
  p_surum           text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
BEGIN
  -- Saçma değerleri sessizce ele: ölçüm hiçbir koşulda çağıranı bozmaz.
  IF p_istek_sayisi IS NULL OR p_istek_sayisi < 0 OR p_istek_sayisi > 200 THEN RETURN; END IF;
  IF p_sure_ms      IS NULL OR p_sure_ms      < 0 OR p_sure_ms      > 600000 THEN RETURN; END IF;

  INSERT INTO public.acilis_olcumu
    (istek_sayisi, sure_ms, bolge_biliniyor, platform, surum)
  VALUES
    (p_istek_sayisi, p_sure_ms, COALESCE(p_bolge_biliniyor,false),
     left(COALESCE(p_platform,''), 20), left(COALESCE(p_surum,''), 20));
END; $fn$;

-- Kapı politikası: bu fonksiyon BİLEREK açıktır — misafir dahil her açılış
-- ölçülebilmeli. Yetki vermez, yalnız sayı yazar. Onaylı kapı listesine
-- kaydı 20260805223623 numaralı migration'da yapılır.
GRANT EXECUTE ON FUNCTION public.acilis_olcumu_yaz(int,int,boolean,text,text)
  TO anon, authenticated;
