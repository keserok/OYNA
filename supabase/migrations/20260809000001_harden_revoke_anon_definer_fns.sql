-- ============================================================================
-- SERTLEŞTİRME — GERİ KAZANIM (Faz 2b.5): harden_revoke_anon_definer_fns
-- ----------------------------------------------------------------------------
-- Bu migration CANLIYA daha önce PR-hattı DIŞINDA doğrudan uygulanmıştı
-- (supabase_migrations.schema_migrations'ta 20260809000001 olarak KAYITLI ama
-- statements NULL, repo'da dosyası YOKTU). Ledger↔repo tutarlılığı ve taze
-- preview'in canlıyı birebir üretmesi için içerik canlının GÜNCEL durumundan
-- yeniden üretildi. Canlı prod'da ledger'da zaten mevcut olduğundan merge
-- sırasında ATLANIR → canlıda NET NO-OP. Yalnız sıfırdan (fresh preview) kurulumda
-- çalışır ve canlının güvenlik duruşunu üretir.
--
-- Amaç: anon rolünden TÜM kullanıcı-tanımlı SECURITY DEFINER fonksiyonlarının
-- EXECUTE yetkisini çek. Yalnızca herkese açık olması gereken 3 fonksiyon istisna
-- (kayıt açık mı / bakım modu / vitrin uygunluğu — giriş yapmamış kullanıcı çağırır).
-- ============================================================================

DO $mig$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.prosecdef
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.sig);
  END LOOP;
END $mig$;

-- Herkese açık kalması gereken SECURITY DEFINER fonksiyonlar (anon'a geri ver):
GRANT EXECUTE ON FUNCTION public.get_showcase_availability(date) TO anon;
GRANT EXECUTE ON FUNCTION public.is_maintenance_active()        TO anon;
GRANT EXECUTE ON FUNCTION public.is_registration_open()         TO anon;
