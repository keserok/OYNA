-- ════════════════════════════════════════════════════════════════════════════
-- İKİ SAHANIN ORTAK FOTOĞRAFI AYRILDI (25 Ağustos 2026)
-- ════════════════════════════════════════════════════════════════════════════
--
-- `magaza-denetim` 11. kapısı yazılıp çalıştırıldığında, aradığı hatanın bir
-- örneğini daha buldu:
--
--   "Ruzgar Arena"           galeri 2 ─┐
--                                      ├─ AYNI stok fotoğraf, AYNI adres
--   "Yildiz Vadi Hali Saha"  galeri 2 ─┘
--
-- Kaldırılan FIFA kupası kadar ağır değil — telif sorunu yok, kişisel veri
-- yok. Ama aynı sınıftan: örnek veri kopyalanmış ve iki ayrı tesis aynı
-- fotoğrafı kendi tesisinin fotoğrafı diye gösteriyor. Bir tesis fotoğrafı
-- kimlik iddiasıdır; iki tesise birden ait olamaz.
--
-- Fotoğraf "Ruzgar Arena"da bırakılır, "Yildiz Vadi"den kaldırılır. Seçim
-- keyfîdir; önemli olan tek bir tesiste kalması. Yildiz Vadi'nin kendi
-- fotoğrafı (galeri 1) yerinde duruyor, yani galerisi boşalmıyor.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

UPDATE public.pitches p
   SET images = COALESCE((
         SELECT jsonb_agg(e)
         FROM jsonb_array_elements(p.images) AS e
         WHERE e::text NOT LIKE '%photo-1551958219-acbc608c6377%'
       ), '[]'::jsonb)
 WHERE p.name = 'Yildiz Vadi Hali Saha';

-- ═══ DOĞRULAMA (§7.7) ══════════════════════════════════════════════════════
DO $$
DECLARE v_saha int; v_yildiz int;
BEGIN
  -- Fotoğraf artık TEK sahada olmalı.
  SELECT count(*) INTO v_saha FROM public.pitches
   WHERE images::text LIKE '%photo-1551958219-acbc608c6377%'
      OR COALESCE(image,'') LIKE '%photo-1551958219-acbc608c6377%';
  IF v_saha <> 1 THEN
    RAISE EXCEPTION 'DOGRULAMA: ortak fotograf % sahada (1 bekleniyordu)', v_saha;
  END IF;

  -- Yildiz Vadi galerisi boşalmamış olmalı: hata, fazla silmek de olabilirdi.
  SELECT jsonb_array_length(images) INTO v_yildiz FROM public.pitches
   WHERE name = 'Yildiz Vadi Hali Saha';
  IF v_yildiz < 1 THEN
    RAISE EXCEPTION 'DOGRULAMA: Yildiz Vadi galerisi bosaldi (% gorsel)', v_yildiz;
  END IF;

  -- Genel kural: HİÇBİR fotoğraf adresi iki farklı sahada geçmemeli.
  -- 11. kapının ağsız çalışan hâlinin veritabanı karşılığı.
  IF EXISTS (
    SELECT 1 FROM (
      SELECT e::text AS adres, count(DISTINCT p.id) AS saha
      FROM public.pitches p, jsonb_array_elements(p.images) AS e
      GROUP BY e::text HAVING count(DISTINCT p.id) > 1
    ) x
  ) THEN
    RAISE EXCEPTION 'DOGRULAMA: hala birden fazla sahada gecen fotograf var';
  END IF;

  RAISE NOTICE 'DOGRULAMA GECTI: her fotograf tek tesise ait';
END $$;

COMMIT;
