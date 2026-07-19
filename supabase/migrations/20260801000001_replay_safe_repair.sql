-- ============================================================================
-- Replay onarımı: service_offers çakışma trigger'ını garantiye al
-- ----------------------------------------------------------------------------
-- 20260529_conflict_prevention.sql, service_offers tablosu henüz yokken
-- (tablo 20260530000000'da yaratılıyor) trigger kurmaya çalışıyordu; sıfırdan
-- replay'de (Supabase Preview branch) zincir daha 2. dosyada kırılıyordu.
-- O dosya artık tablo-varsa-kur guard'ı taşıyor; bu kuyruk migration'ı da
-- tablonun kesin var olduğu noktada trigger'ı (yoksa) kurarak replay ile
-- canlıyı aynı sona ulaştırır.
--
-- Idempotent: canlıda trigger zaten var → DROP+CREATE aynı semantiğe döner.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.service_offers') IS NOT NULL
     AND to_regprocedure('public.check_match_conflict()') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_check_match_conflict ON public.service_offers;
    CREATE TRIGGER trg_check_match_conflict
    BEFORE UPDATE ON public.service_offers
    FOR EACH ROW
    EXECUTE FUNCTION public.check_match_conflict();
  END IF;
END $$;
