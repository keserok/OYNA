-- ════════════════════════════════════════════════════════════════════════════
-- DEMO AVATARLARI LOGODAN ARINDIRILDI (25 Ağustos 2026)
-- ════════════════════════════════════════════════════════════════════════════
--
-- 20260917000005 sızan görselleri koparırken bir demo profilin avatarı da
-- temizlendi — çünkü o dosya, kaldırılan saha fotoğrafıyla BAYT BAYT AYNI
-- OYNA logosuydu. Geriye aynı sınıftan iki profil kaldı:
--
--   "Emre Kaya"              → mermer zeminde altın OYNA amblemi
--   "Ornek Tesis Sahibi 2"   → siyah zeminde sarı OYNA logosu
--
-- Telif sorunu yok; sorun tutarlılık. Bir maçı açan inceleyici, oyuncu
-- listesinde yüzü uygulamanın kendi logosu olan kişiler görüyor. Üçünden
-- birini temizleyip ikisini bırakmak, hiçbirini temizlememekten daha kötü:
-- yarım yapılmış iş izlenimi verir (Apple 2.1).
--
-- Avatar NULL olduğunda uygulama baş harf rozetine döner ("EK", "OT") —
-- 06-profil ekran görüntüsündeki "DO" rozetinin aynısı. Kasıtlı ve temiz
-- görünür. Dosyalar depoda durmaya devam eder; bu göç hiçbir şey silmez.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

UPDATE public.profiles
   SET avatar_url = NULL
 WHERE avatar_url LIKE '%1785591975887_ws6kzrokmv%'
    OR avatar_url LIKE '%1783507848609_9qgacpvxkv6%'
    OR avatar_url LIKE '%1783882922994_wzvudendkac%';

-- ═══ DOĞRULAMA (§7.7) ══════════════════════════════════════════════════════
DO $$
DECLARE v_kalan int;
BEGIN
  SELECT count(*) INTO v_kalan FROM public.profiles
   WHERE avatar_url LIKE '%1785591975887_ws6kzrokmv%'
      OR avatar_url LIKE '%1783507848609_9qgacpvxkv6%'
      OR avatar_url LIKE '%1783882922994_wzvudendkac%';
  IF v_kalan > 0 THEN
    RAISE EXCEPTION 'DOGRULAMA: % profilde logo avatari duruyor', v_kalan;
  END IF;

  -- Geriye kalan HİÇBİR avatar kendi depomuzdaki bir dosyayı göstermemeli.
  -- Bugün ayakta kalması beklenen tek avatar, Google ile giriş yapan gerçek
  -- kullanıcının Google tarafından servis edilen fotoğrafıdır.
  SELECT count(*) INTO v_kalan FROM public.profiles
   WHERE COALESCE(avatar_url,'') <> ''
     AND avatar_url LIKE '%/storage/v1/object/public/images/avatars/%';
  IF v_kalan > 0 THEN
    RAISE EXCEPTION 'DOGRULAMA: % avatar hala kendi depomuzu gosteriyor', v_kalan;
  END IF;

  RAISE NOTICE 'DOGRULAMA GECTI: demo avatarlari bas harf rozetine dondu';
END $$;

COMMIT;
