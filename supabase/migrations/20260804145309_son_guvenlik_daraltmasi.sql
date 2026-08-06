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

-- ⚠️ HENÜZ DOĞMAMIŞ FONKSİYON SORUNU (sıfırdan kurulum)
-- Aşağıdaki fonksiyonların bir kısmı depoda DAHA SONRAKİ bir migration'da
-- yaratılıyor (ör. `admin_pitch_agreements` → 20260904000000). Canlıda bu
-- dosya çalıştığında hepsi mevcuttu; ama SIFIRDAN kurulan bir veritabanında
-- (her PR önizlemesi) henüz yoklar ve düz `REVOKE` "function does not exist"
-- diyip kurulumu çökertiyordu.
--
-- Çözüm: var olanın yetkisi ALINIR, olmayan ATLANIR ve adı NOTICE ile yazılır.
-- Atlanan hiçbir şey açıkta kalmaz — çünkü 20260805204225 ile kurulan
-- "yeni fonksiyonlar KAPALI doğar" tetikleyicisi, sonradan yaratılan
-- fonksiyonların PUBLIC yetkisini doğduğu anda geri alır; o fonksiyonu
-- yaratan migration da gereken GRANT'i kendisi verir.
DO $kapat$
DECLARE
  r record;
  -- imza · yalnız bu rollerden alınacak · geri verilecek rol (NULL = yok)
  v_liste constant text[][] := ARRAY[
    ['public.admin_pitch_agreements()',                                              'PUBLIC, anon', 'authenticated'],
    ['public.admin_set_pitch_agreement(uuid,text,numeric,numeric,numeric,text)',     'PUBLIC, anon', 'authenticated'],
    ['public.admin_set_pitch_cancel_policy(uuid,numeric,numeric,numeric)',           'PUBLIC, anon', 'authenticated'],
    ['public.calculate_commission(numeric,text,uuid,text,numeric,numeric,numeric)',  'PUBLIC, anon', 'authenticated'],
    ['public._kullanici_demo_mu(uuid)',                    'PUBLIC, anon, authenticated', NULL],
    ['public.demo_isareti_ata()',                          'PUBLIC, anon, authenticated', NULL],
    ['public.demo_isareti_profil()',                       'PUBLIC, anon, authenticated', NULL]
  ];
  v_imza text; v_alinacak text; v_verilecek text; v_atlanan int := 0;
BEGIN
  FOR i IN 1 .. array_length(v_liste, 1) LOOP
    v_imza      := v_liste[i][1];
    v_alinacak  := v_liste[i][2];
    v_verilecek := v_liste[i][3];

    -- Fonksiyon var mı? (imzayı regprocedure'a çevirmek yoksa hata verir)
    BEGIN
      PERFORM v_imza::regprocedure;
    EXCEPTION WHEN undefined_function OR invalid_text_representation THEN
      RAISE NOTICE '[SON-1] % henuz yok - atlandi (sonraki migration yaratacak).', v_imza;
      v_atlanan := v_atlanan + 1;
      CONTINUE;
    END;

    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %s', v_imza, v_alinacak);
    IF v_verilecek IS NOT NULL THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %s', v_imza, v_verilecek);
    END IF;
  END LOOP;

  IF v_atlanan > 0 THEN
    RAISE NOTICE '[SON-1] % fonksiyon henuz yaratilmamisti; kapilari kendi migration''larinda kurulur.', v_atlanan;
  END IF;
END $kapat$;

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

  -- Fonksiyon henüz yaratılmamış olabilir (sıfırdan kurulum: onu yaratan
  -- migration Eylül'de). `to_regprocedure` yoksa NULL döner, hata vermez;
  -- böylece kontrol VARSA sınar, YOKSA sessizce geçer.
  IF to_regprocedure('public.admin_pitch_agreements()') IS NOT NULL
     AND has_function_privilege('anon','public.admin_pitch_agreements()','EXECUTE') THEN
    RAISE EXCEPTION 'SON-1 eksik: admin fonksiyonu hala anon''a acik';
  END IF;
END
$dogrula$;

-- ════════════════════════════════════════════════════════════════════════════
-- GERİ ALMA: ilgili GRANT satırları geri verilir; `pay_public_match_deposit`
-- için 20260608000000_match_join_rpc_fixes.sql içindeki tanıma bakılır.
-- ════════════════════════════════════════════════════════════════════════════
