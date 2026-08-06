-- ════════════════════════════════════════════════════════════════════════════
-- MASKELEME YARDIMCILARINA ÇALIŞTIRMA İZNİ
-- ════════════════════════════════════════════════════════════════════════════
-- `public_matches` görünümü bu iki yardımcıyı çağırıyor. Görünüm SATIRLARI
-- görünüm sahibinin yetkisiyle okunur, ama FONKSİYON çalıştırma izni ÇAĞIRANA
-- göre denetlenir — bu yüzden izin gerekiyor, yoksa misafir görünümü hiç
-- açamaz ("permission denied for function").
--
-- GÜVENLİ: ikisi de saf jsonb dönüştürücü (IMMUTABLE). Veriye ERİŞMEZ, yetki
-- VERMEZ; yalnızca kendilerine verilen diziden kimlik alanlarını siler.
-- Dışarıdan çağrılsalar bile çağıranın kendi verdiği JSON'dan başka bir şey
-- göremezler.
-- ════════════════════════════════════════════════════════════════════════════
GRANT EXECUTE ON FUNCTION public._slots_anon_maskele(jsonb)   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public._reserve_anon_maskele(jsonb) TO anon, authenticated;

-- Gece kapı denetimi (K-KAPI-4) bunları "kendiliğinden açılmış" diye SARI
-- yakmasın: açık olmaları BİLİNÇLİ.
INSERT INTO public.kapi_kayitli_durum (fonksiyon, anon_acik, authenticated_acik, aciklama)
SELECT p.oid::regprocedure::text, true, true,
       'public_matches gorunumunun kadro maskeleme yardimcisi. Saf jsonb donusturucu; veriye erismez.'
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('_slots_anon_maskele','_reserve_anon_maskele')
ON CONFLICT (fonksiyon) DO UPDATE
  SET anon_acik = EXCLUDED.anon_acik,
      authenticated_acik = EXCLUDED.authenticated_acik,
      aciklama = EXCLUDED.aciklama;
