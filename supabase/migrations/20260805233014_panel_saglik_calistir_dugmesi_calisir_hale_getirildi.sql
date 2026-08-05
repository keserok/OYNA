-- ════════════════════════════════════════════════════════════════════════════
-- PANELDEKİ "ŞİMDİ ÇALIŞTIR" DÜĞMESİ ÇALIŞMIYORDU
-- ════════════════════════════════════════════════════════════════════════════
--
-- BULGU: Sistem Sağlığı kartındaki "Şimdi Çalıştır" düğmesi
-- `sistem_saglik_calistir()` fonksiyonunu çağırıyor, ama o fonksiyon
-- `authenticated` rolüne KAPALI. Yani düğmeye basınca hiçbir zaman
-- çalışmıyor, yetki hatası dönüyordu.
--
-- NEDEN KAPALI (ve öyle KALMALI): fonksiyonu gece işi çağırıyor
--     cron: sistem_saglik_gunluk · 40 3 * * * (İstanbul 06:40)
--     SELECT public.sistem_saglik_calistir(); SELECT public.sistem_saglik_ek_kontroller();
-- Cron `auth.uid()` olmadan çalışır. Fonksiyonun İÇİNE yönetici kontrolü
-- koysaydık gece denetimi tamamen kırılırdı — yani "düğmeyi tamir edeyim"
-- derken 19 kontrolü birden susturmuş olurduk.
--
-- ÇÖZÜM: deponun kendi `__core` deseni. Çekirdek fonksiyonlar kapalı kalır ve
-- cron onları çağırmaya devam eder; panele YENİ ve yönetici kapılı bir
-- sarmalayıcı verilir.
--
-- EK KAZANÇ: panel eskiden yalnız ana denetimi çağırıyordu; ek kontroller
-- (K-SUPURUCU-1, K-BILDIRIM-2/3, K-KAPI-4 ve yeni K-YUK-4) elle çalıştırmada
-- güncellenmiyordu. Sarmalayıcı İKİSİNİ DE çağırır — düğme artık kartın
-- tamamını tazeler.
--
-- GERİ ALMA:
--   DROP FUNCTION IF EXISTS public.admin_sistem_saglik_calistir();
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.admin_sistem_saglik_calistir()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $fn$
DECLARE v_ana jsonb; v_ek jsonb;
BEGIN
  -- Kapı: yalnız yönetici. (K-KAPI-1: her SECURITY DEFINER fonksiyonun
  -- GÖRÜNÜR bir yetki kontrolü olmalı.)
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: admin yetkisi gerekli';
  END IF;
  -- Salt-okunur (acil durdurma) modunda denetim yazmaya çalışmasın.
  PERFORM public.require_admin_write();

  v_ana := public.sistem_saglik_calistir();
  v_ek  := public.sistem_saglik_ek_kontroller();

  RETURN jsonb_build_object('ana', v_ana, 'ek', v_ek);
END; $fn$;

REVOKE ALL ON FUNCTION public.admin_sistem_saglik_calistir() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_sistem_saglik_calistir() TO authenticated;

-- Kapı denetimi (K-KAPI-4) bu yeni fonksiyonu "gözden geçirilmeli" diye
-- SARI yakmasın: açık olması BİLİNÇLİ ve içeride yönetici kapısı var.
INSERT INTO public.kapi_kayitli_durum (fonksiyon, anon_acik, authenticated_acik, aciklama)
SELECT p.oid::regprocedure::text, false, true,
       'Panelin "Simdi Calistir" dugmesi. Iceride is_platform_admin() kapisi var; cekirdek fonksiyonlar kapali kalir.'
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'admin_sistem_saglik_calistir'
ON CONFLICT (fonksiyon) DO UPDATE
  SET anon_acik = EXCLUDED.anon_acik,
      authenticated_acik = EXCLUDED.authenticated_acik,
      aciklama = EXCLUDED.aciklama;
