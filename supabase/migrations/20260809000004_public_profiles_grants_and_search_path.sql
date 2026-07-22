-- ============================================================================
-- SERTLEŞTİRME — GERİ KAZANIM (Faz 2b.5): public_profiles_grants_and_search_path
-- ----------------------------------------------------------------------------
-- Canlıya PR-hattı DIŞINDA doğrudan uygulanmış (ledger'da 20260809000004 KAYITLI,
-- statements NULL, repo'da dosyası yoktu). Canlının güncel durumundan yeniden
-- üretildi. Canlıda ledger'da mevcut → merge'de ATLANIR (NET NO-OP); yalnız fresh
-- preview'de çalışır.
--
-- İki parça:
--   1) public_profiles VIEW'ına authenticated rolüne SELECT ver (herkese-açık
--      minimal profil görünümü).
--   2) search_path'i sabitlenmemiş 4 fonksiyonu 'public, pg_temp' ile sabitle
--      (search_path enjeksiyonu sertleştirmesi; canlıda tüm fonksiyonlarda sabit).
-- ============================================================================

-- 1) public_profiles görünümü okuma yetkisi
DO $mig$
BEGIN
  IF to_regclass('public.public_profiles') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT ON public.public_profiles TO authenticated';
  END IF;
END $mig$;

-- 2) search_path sabitleme (canlıyla birebir: search_path = public, pg_temp)
ALTER FUNCTION public.cleanup_expired_holds()                     SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.get_or_create_match_score_token(uuid)       SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.touch_region_coverage()                     SET search_path TO 'public', 'pg_temp';
ALTER FUNCTION public.update_booking_paid_amount()                SET search_path TO 'public', 'pg_temp';
