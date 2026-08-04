-- ════════════════════════════════════════════════════════════════════════════
-- [SRE-1 düzeltme] `yedek_durumu()` sıradan kullanıcıya açık kalmış
-- ────────────────────────────────────────────────────────────────────────────
-- HATA BENDEN: Yedek durumunu Sistem Sağlığı panelinde göstereceğim diye
-- fonksiyonu `authenticated` rolüne açtım. Ama panel bu fonksiyonu ZATEN
-- doğrudan çağırmıyor — gece denetimi (`sistem_saglik_calistir`) kendi
-- içinden çağırıyor ve o da veritabanı sahibi yetkisiyle çalışıyor.
--
-- Yani açık olan yetkinin hiçbir faydası yoktu; yalnızca zararı vardı:
-- giriş yapmış HERHANGİ bir kullanıcı yedek tablolarının adlarını,
-- boyutunu ve ne zaman alındığını öğrenebiliyordu. Bir saldırgan için bu
-- "ne zaman ve neyi hedeflemeliyim" bilgisidir.
--
-- Supabase güvenlik danışmanı (advisor) taraması yakaladı.
-- ÇÖZÜM: yetkiyi tamamen geri al. Denetim etkilenmez.
-- ════════════════════════════════════════════════════════════════════════════

REVOKE ALL ON FUNCTION public.yedek_durumu() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.yedek_durumu() IS
  'SRE-1: Yedek durumu. YALNIZCA gece denetimi (sistem_saglik_calistir) icinden cagrilir; hicbir kullanici rolune acik degildir.';

-- Doğrulama: hâlâ açıksa migration burada durur.
DO $dogrula$
BEGIN
  IF has_function_privilege('authenticated', 'public.yedek_durumu()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.yedek_durumu()', 'EXECUTE') THEN
    RAISE EXCEPTION 'yedek_durumu() hala kullanici rollerine acik — yetki daraltmasi ise yaramadi';
  END IF;
END
$dogrula$;
