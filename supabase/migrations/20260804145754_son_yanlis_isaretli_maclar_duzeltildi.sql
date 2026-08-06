-- [SON-5 / STR-1] Demo kullanicilarin kurdugu 3 mac GERCEK isaretliydi.
-- Kurucu onayi: SON_KARARLAR 31. Bu bir VERI duzeltmesidir.
-- Once kayit altina al, sonra duzelt.
--
-- NOT (5 Agustos 2026): Bu dosya canliya uygulandiktan SONRA depoya yazildi.
-- Canlidaki kayit 20260804145754 surumuyle duruyor; icerik birebir aynidir
-- (canlidaki schema_migrations.statements alanindan geri alindi).
-- Tekrar calistirilabilir: CREATE TABLE IF NOT EXISTS + kosullu UPDATE.

CREATE TABLE IF NOT EXISTS yedek.yanlis_isaretli_maclar_20260804 AS
SELECT m.id, m.title, m."isDemo" AS eski_isDemo, m."creatorId", m.captain_id, now() AS duzeltme_at
FROM public.matches m
WHERE m."isDemo" IS NOT TRUE
  AND EXISTS (SELECT 1 FROM public.profiles p
              WHERE p.id = COALESCE(m."creatorId", m.captain_id) AND p.is_demo);

UPDATE public.matches m
SET "isDemo" = true
WHERE m."isDemo" IS NOT TRUE
  AND EXISTS (SELECT 1 FROM public.profiles p
              WHERE p.id = COALESCE(m."creatorId", m.captain_id) AND p.is_demo);

DO $dogrula$
DECLARE v_kalan int; v_duzeltilen int;
BEGIN
  SELECT count(*) INTO v_duzeltilen FROM yedek.yanlis_isaretli_maclar_20260804;
  SELECT count(*) INTO v_kalan FROM public.matches m
  WHERE m."isDemo" IS NOT TRUE
    AND EXISTS (SELECT 1 FROM public.profiles p
                WHERE p.id = COALESCE(m."creatorId", m.captain_id) AND p.is_demo);
  IF v_kalan > 0 THEN
    RAISE EXCEPTION 'SON-5 eksik: hala % yanlis isaretli mac var', v_kalan;
  END IF;
  RAISE NOTICE 'SON-5: % mac duzeltildi', v_duzeltilen;
END
$dogrula$;
