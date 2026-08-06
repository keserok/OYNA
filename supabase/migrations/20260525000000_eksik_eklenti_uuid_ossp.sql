-- ════════════════════════════════════════════════════════════════════════════
-- EKSİK EKLENTİLER: uuid-ossp + pgcrypto  (temiz kurulumu bozan depo açığı)
-- ════════════════════════════════════════════════════════════════════════════
--
-- NASIL BULUNDU: 456 migration, boş bir PostgreSQL 16 veritabanına sırayla
-- uygulandı. 4. migration (`20260530000000_service_integration.sql`) şu hatayla
-- durdu:
--     ERROR: function uuid_generate_v4() does not exist
--
-- SEBEP: `uuid_generate_v4()` **uuid-ossp** eklentisinden gelir. Bu eklenti
-- canlı veritabanında KURULU (extensions şemasında) — ama onu kuran bir
-- migration YOK; bir zamanlar Supabase panelinden ELLE açılmış.
--
-- SONUCU: canlıda her şey çalışıyor, ama depo tek başına temiz bir
-- veritabanına kurulamıyor. Her PR'da açılan Supabase önizleme veritabanı da
-- bu yüzden kuruluma başlayamıyor (main dalı 29 Mayıs 2026'dan beri
-- MIGRATIONS_FAILED durumunda).
--
-- ── NEDEN DOSYA ADI EN ESKİ TARİHTE ──────────────────────────────────────
-- Supabase migration'ları DOSYA ADI SIRASIYLA uygular. Eklentinin, onu
-- kullanan migration'dan ÖNCE kurulması gerekiyor. Var olan migration'lara
-- dokunmak yasak (migration-immutability CI kuralı ve depo standardı), bu
-- yüzden YENİ ve daha eski tarihli bir dosya eklendi:
--     20260525000000 < 20260526000000 (ilk migration)
--
-- CANLIYA ETKİSİ YOK: eklenti zaten kurulu, `IF NOT EXISTS` sessizce geçer.
-- Bu dosya yalnız "sıfırdan kurulum" yolunu onarır.
--
-- İKİNCİ AYNI HATA: **pgcrypto** de aynı durumdaydı. Onu kuran migration
-- `20260710223110_pgcrypto_guard_and_sla_seed.sql` (10 Temmuz), ama ilk KULLANAN
-- `20260607000001_owner_module_complete.sql` (7 Haziran) — yani bir ay ÖNCE.
-- Canlıda çalışıyor çünkü pgcrypto da elle açılmıştı. Temiz kurulumda
--     ERROR: function gen_random_bytes(integer) does not exist
-- ile duruyordu. O yüzden pgcrypto da burada, en başta kuruluyor; 10 Temmuz'daki
-- migration `IF NOT EXISTS` kullandığı için çakışma olmaz.
--
-- NOT: `gen_random_uuid` PostgreSQL 13+ ile yerleşiktir, eklenti gerekmez.
--
-- GERİ ALMA: DROP EXTENSION IF EXISTS "uuid-ossp";
--            (Canlıda YAPMA — kurulu eklenti başka yerlerde kullanılıyor.)
-- ════════════════════════════════════════════════════════════════════════════

-- Supabase'de eklentiler `extensions` şemasında durur; o şema yoksa (saf
-- PostgreSQL) varsayılan şemaya kurulur.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'extensions') THEN
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
    CREATE EXTENSION IF NOT EXISTS pgcrypto   WITH SCHEMA extensions;
  ELSE
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
  END IF;
END $$;
