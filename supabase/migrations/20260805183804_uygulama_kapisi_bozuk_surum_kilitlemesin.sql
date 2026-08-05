-- ════════════════════════════════════════════════════════════════════════════
-- DÜZELTME: okunamayan sürüm metni kullanıcıyı KİLİTLEMEMELİ
-- ────────────────────────────────────────────────────────────────────────────
-- NASIL YAKALANDI: `20260805183708_uygulama_kapisi.sql` canlıya uygulandıktan
-- hemen sonra sürüm karşılaştırması on ayrı senaryoyla sınandı. Dokuzu doğru
-- çıktı, biri YANLIŞTI:
--
--     surum_kucuk_mu('bozuk', '3.0.0')  →  true      (olması gereken: false)
--
-- SEBEP: harfler silininde metin boş kalıyor, boş `0` sayılıyor ve "0 < 3"
-- doğru çıkıyordu. Yani uygulama sürümü herhangi bir şekilde bozulan HER
-- kullanıcı kapatılamaz "Güncelle" ekranına düşerdi — bu kapının yapmaması
-- gereken TEK şey. Kapı açık arızalanmalıdır.
--
-- ÇÖZÜM: içinde hiç rakam olmayan bir sürüm/eşik KARŞILAŞTIRILMAZ; false döner.
-- Kalıcı testi: tests/unit/uygulamaKapisi.test.ts →
--   "RAKAMSIZ sürüm metni kilitlemez (canlıda yakalanan hata)"
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.surum_kucuk_mu(p_surum text, p_esik text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  a int[]; b int[]; i int; x int; y int;
BEGIN
  IF p_esik IS NULL OR btrim(p_esik) = '' THEN RETURN false; END IF;
  IF p_surum IS NULL OR btrim(p_surum) = '' THEN RETURN false; END IF;

  -- OKUNAMAYAN SÜRÜM KİLİTLEMEZ.
  IF p_surum !~ '\d' OR p_esik !~ '\d' THEN RETURN false; END IF;

  SELECT array_agg(COALESCE(NULLIF(regexp_replace(t, '\D', '', 'g'), '')::int, 0))
    INTO a FROM unnest(string_to_array(split_part(p_surum, '-', 1), '.')) AS t;
  SELECT array_agg(COALESCE(NULLIF(regexp_replace(t, '\D', '', 'g'), '')::int, 0))
    INTO b FROM unnest(string_to_array(split_part(p_esik,  '-', 1), '.')) AS t;

  FOR i IN 1..GREATEST(COALESCE(array_length(a,1),0), COALESCE(array_length(b,1),0)) LOOP
    x := COALESCE(a[i], 0);
    y := COALESCE(b[i], 0);
    IF x < y THEN RETURN true;  END IF;
    IF x > y THEN RETURN false; END IF;
  END LOOP;
  RETURN false;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$function$;
