-- ════════════════════════════════════════════════════════════════════════════
-- [SON-1] GÜVENLİK YÜZEYİ DARALTMA — kurucu onayı: SON_KARARLAR 10, 12, 13
-- ────────────────────────────────────────────────────────────────────────────
-- Uygulama bir süre rafa kaldırılıyor. Kimsenin bakmadığı bir dönemde gereksiz
-- açık kapı bırakmamak için üç iş birden yapılıyor.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 10 · Kuralsız tabloların geniş yetkileri geri alınıyor ──────────────────
-- Bu altı tabloda satır kuralı (RLS) AÇIK ama hiç kural YAZILMAMIŞ. Postgres'te
-- bu "her şeyi reddet" demektir — yani bugün güvenliler. Kanıt: anon rolüyle
-- altısı da okunmaya çalışıldı, hepsinden 0 satır döndü.
--
-- SORUN: güvenliği sağlayan şey **kuralın yokluğu**, yetkinin doğruluğu değil.
-- Biri bu tablolardan birine tek bir izin verici kural eklerse, arkadaki
-- SELECT/INSERT/UPDATE/DELETE yetkileri AYNI ANDA devreye girer.
-- `password_reset_codes` bir parola sıfırlama tablosudur; oradaki bir kaza
-- doğrudan hesap ele geçirmedir.
--
-- GÜVENLİ Mİ: Evet. Bu tablolara uygulama doğrudan erişmiyor —
-- `password_reset_codes` yalnız Edge Function'lardan `service_role` ile
-- kullanılıyor (kodda doğrulandı) ve o rol bu değişiklikten etkilenmez.
REVOKE ALL ON TABLE public.password_reset_codes          FROM anon, authenticated;
REVOKE ALL ON TABLE public.studio_events                 FROM anon, authenticated;
REVOKE ALL ON TABLE public.profile_contact_hash          FROM anon, authenticated;
REVOKE ALL ON TABLE public.guardian_lookup_attempts      FROM anon, authenticated;
REVOKE ALL ON TABLE public.social_rate_usage             FROM anon, authenticated;
REVOKE ALL ON TABLE public._saat_dilimi_duzeltme_yedek   FROM anon, authenticated;

-- ── 12 · Kullanılmayan ödeme yolu kaldırılıyor ──────────────────────────────
-- `pay_public_match_deposit` tutarı İSTEMCİDEN alıyordu ve içinde hiç yetki
-- kontrolü yoktu. Başkasının parası harcanamıyordu (çağırdığı
-- `process_match_payment` bunu engelliyor) ve uygulama bu fonksiyonu HİÇ
-- çağırmıyor (kodda arandı). Kalan tek etkisi: kullanıcı 1 kuruş ödeyip
-- kadroda görsel "ÖDENDİ" rozeti alabiliyordu.
--
-- Kullanılmayan bir para yolunun ayakta durması gereksiz risktir.
DROP FUNCTION IF EXISTS public.pay_public_match_deposit(uuid, uuid, numeric);

-- ── 13 · Gereksiz `anon` çağırma yetkileri geri alınıyor ────────────────────
-- Aşağıdakiler ya YÖNETİCİ işlemleri ya da iç yardımcılar. Hepsi içeriden
-- korumalıydı (canlıda denendi: UNAUTHORIZED), ama giriş yapmamış birine açık
-- olmaları gereksiz yüzeydir ve sonraki incelemeleri yanıltır.
-- ⚠️ POSTGRES TUZAĞI: Fonksiyonlar oluşturulduğunda EXECUTE yetkisi
-- otomatik olarak `PUBLIC`'e verilir ve `anon` da PUBLIC'in içindedir.
-- Yani yalnız `FROM anon` demek HİÇBİR ŞEY DEĞİŞTİRMEZ — bu migration'ın ilk
-- hâli tam olarak bu yüzden doğrulama adımında durdu ve geri alındı.
-- Doğrusu: önce PUBLIC'ten al, sonra gerçekten ihtiyacı olan role geri ver.

-- Yönetici işlemleri: yalnız giriş yapmış kullanıcı çağırabilsin
-- (fonksiyonun kendi içinde ayrıca `is_platform_admin()` kontrolü var).
REVOKE ALL ON FUNCTION public.admin_pitch_agreements() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_pitch_agreements() TO authenticated;

REVOKE ALL ON FUNCTION public.admin_set_pitch_agreement(uuid,text,numeric,numeric,numeric,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_pitch_agreement(uuid,text,numeric,numeric,numeric,text) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_set_pitch_cancel_policy(uuid,numeric,numeric,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_pitch_cancel_policy(uuid,numeric,numeric,numeric) TO authenticated;

-- Komisyon hesabı: giriş yapmış kullanıcıya lazım, anonime değil.
REVOKE ALL ON FUNCTION public.calculate_commission(numeric,text,uuid,text,numeric,numeric,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calculate_commission(numeric,text,uuid,text,numeric,numeric,numeric) TO authenticated;

-- İç yardımcı ve tetikleyici fonksiyonları: hiçbir kullanıcı rolü çağırmamalı.
-- (SECURITY DEFINER fonksiyonlar bunları sahibi yetkisiyle yine çağırabilir.)
REVOKE ALL ON FUNCTION public._kullanici_demo_mu(uuid)  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.demo_isareti_ata()        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.demo_isareti_profil()     FROM PUBLIC, anon, authenticated;

-- BİLEREK DOKUNULMADI — giriş yapmamış kullanıcının gördüğü ekranlar bunlara
-- ihtiyaç duyuyor; kapatmak vitrini bozardı:
--   is_maintenance_active · is_registration_open · get_showcase_availability
--   pitch_price_preview · resolve_payment_mode · match_cancel_policy
--   get_card_fee_quote · my_pitch_agreement · hata_bildir (giriş öncesi çökme)

-- ── Doğrulama ───────────────────────────────────────────────────────────────
DO $dogrula$
DECLARE v_kalan int;
BEGIN
  SELECT count(*) INTO v_kalan FROM (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname IN (
      'password_reset_codes','studio_events','profile_contact_hash',
      'guardian_lookup_attempts','social_rate_usage','_saat_dilimi_duzeltme_yedek')
      AND (has_table_privilege('anon', c.oid,'SELECT')
        OR has_table_privilege('authenticated', c.oid,'SELECT')
        OR has_table_privilege('authenticated', c.oid,'UPDATE'))
  ) t;
  IF v_kalan > 0 THEN
    RAISE EXCEPTION 'SON-1 eksik: % tabloda yetki hala duruyor', v_kalan;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='public' AND p.proname='pay_public_match_deposit') THEN
    RAISE EXCEPTION 'SON-1 eksik: pay_public_match_deposit hala duruyor';
  END IF;

  IF has_function_privilege('anon','public.admin_pitch_agreements()','EXECUTE') THEN
    RAISE EXCEPTION 'SON-1 eksik: admin fonksiyonu hala anon''a acik';
  END IF;
END
$dogrula$;

-- ════════════════════════════════════════════════════════════════════════════
-- GERİ ALMA: ilgili GRANT satırları geri verilir; `pay_public_match_deposit`
-- için 20260608000000_match_join_rpc_fixes.sql içindeki tanıma bakılır.
-- ════════════════════════════════════════════════════════════════════════════
