-- ════════════════════════════════════════════════════════════════════════════
-- YENİ TABLOLAR SATIR GÜVENLİĞİ AÇIK DOĞAR  (B05 KAPILAR)
-- ════════════════════════════════════════════════════════════════════════════
--
-- NASIL BULUNDU: 6 Ağustos 2026'da gece denetimi (K-KAPI-4) "1 yeni fonksiyon
-- eklendi - gözden geçirilmeli (rls_auto_enable())" dedi. Bakıldığında:
--   · `rls_auto_enable()` ve onu tetikleyen `ensure_rls` olay tetikleyicisi
--     CANLIDA VAR ve çalışıyor,
--   · ama hiçbir migration onları yaratmıyor — canlıya elle eklenmişler.
--
-- İKİ AYRI SORUN, İKİSİ DE BURADA ÇÖZÜLÜYOR:
--
-- 1) KAYMA: Sıfırdan kurulan bir veritabanında (her PR önizlemesi, felaket
--    kurtarma, yeni ortam) bu koruma HİÇ oluşmuyordu. Yani depo, canlının
--    sahip olduğu bir güvenliği üretemiyordu. Aşağıda depoya yazıldı.
--
-- 2) AÇIK KAPI: `rls_auto_enable()` SECURITY DEFINER ve `anon` dahil herkese
--    EXECUTE açıktı. Pratikte çağrılamaz — dönüş tipi `event_trigger` olduğu
--    için PostgREST onu dışarı sunmaz ve doğrudan çağrılırsa PostgreSQL
--    "can only be called in an event trigger" der. Yine de deponun kuralı
--    açık: her kapı BİLEREK açık olmalı. Bu kapının açık olması bir karar
--    değil, gözden kaçmaydı. Kapatıldı.
--
-- KORUMANIN DEĞERİ: Yeni bir tablo eklenirken satır güvenliğini açmayı
-- unutmak, o tablodaki HER SATIRI herkese okutur. Bu tetikleyici o unutmayı
-- imkânsız kılar — tablo doğduğu anda kilit takılır.
--
-- CANLIYA ETKİSİ: Fonksiyon ve tetikleyici zaten var; `CREATE OR REPLACE` ve
-- koşullu oluşturma sessizce geçer. Tek gerçek değişiklik: gereksiz EXECUTE
-- yetkisinin geri alınması.
--
-- GERİ ALMA:
--   DROP EVENT TRIGGER IF EXISTS ensure_rls;
--   DROP FUNCTION IF EXISTS public.rls_auto_enable();
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) Fonksiyon (canlıdaki gövdenin birebir aynısı) ───────────────────────
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

-- ── 2) Kapı kapatılıyor ────────────────────────────────────────────────────
-- Olay tetikleyicisi fonksiyonunu hiçbir kullanıcı rolü çağırmamalı; PostgreSQL
-- onu zaten yalnız olay anında, sahibi yetkisiyle çalıştırır.
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;

-- ── 3) Olay tetikleyicisi ──────────────────────────────────────────────────
-- Olay tetikleyicisi yaratmak yükseltilmiş yetki ister. Canlıda `postgres`
-- rolü bunu yapabiliyor; yapamayan bir ortamda kurulum ÇÖKMESİN diye
-- istisna yakalanıp uyarı yazılıyor. (Koruma kaybolursa K-KAPI-4 zaten
-- gece denetiminde haber verir.)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_event_trigger WHERE evtname = 'ensure_rls') THEN
    RAISE NOTICE '[KAPI] ensure_rls zaten kurulu - dokunulmadi.';
  ELSE
    BEGIN
      CREATE EVENT TRIGGER ensure_rls
        ON ddl_command_end
        WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
        EXECUTE FUNCTION public.rls_auto_enable();
      RAISE NOTICE '[KAPI] ensure_rls kuruldu - yeni tablolar RLS acik dogacak.';
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE '[KAPI] ensure_rls kurulamadi (yetki yok) - bu ortamda atlandi.';
    END;
  END IF;
END $$;

-- ── 4) Onaylı kapı listesine kaydediliyor ──────────────────────────────────
-- Gece denetimi (K-KAPI-4), canlıdaki her fonksiyonun kapı durumunu onaylı
-- temel listeyle karşılaştırır. Listede olmayan bir fonksiyon "yeni eklendi,
-- gözden geçirilmeli" diye SARI yanar — bu fonksiyon tam olarak öyle yaptı ve
-- bu migration'ı doğurdu. Kararı verdik: kapı KAPALI. Şimdi listeye
-- yazılıyor ki denetim onu bilinen ve onaylanmış saysın.
--
-- Not: temel listenin tamamını yeniden almıyoruz — o, başka gerçek bir
-- kaymayı da sessizce onaylardı. Yalnız bu tek satır ekleniyor.
DO $$
BEGIN
  IF to_regclass('public.kapi_kayitli_durum') IS NULL THEN
    RAISE NOTICE '[KAPI] kapi_kayitli_durum yok - kayit atlandi.';
    RETURN;
  END IF;

  DELETE FROM public.kapi_kayitli_durum
   WHERE fonksiyon = 'rls_auto_enable()';

  INSERT INTO public.kapi_kayitli_durum (fonksiyon, anon_acik, authenticated_acik, aciklama)
  VALUES ('rls_auto_enable()', false, false,
          'Olay tetikleyicisi fonksiyonu: yeni tablolara RLS acar. Disaridan cagrilamaz; kapisi bilerek KAPALI.');
END $$;
