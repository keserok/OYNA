-- ============================================================================
-- ORDU ADMIN DEMO PURGE — ordu_admin_demo_seed.sql'in geri alımı
-- Tüm demo kayıtları  id LIKE 'd0e51%'  önekiyle işaretli.
-- auth.users silinince profiles ON DELETE CASCADE ile temizlenir.
-- ============================================================================
BEGIN;

-- Maç katılımcıları + maçlar
DELETE FROM public.match_participants WHERE match_id::text LIKE 'd0e51e00%';
DELETE FROM public.matches WHERE id::text LIKE 'd0e51e00%';

-- Kaleci/hakem katalog satırları
DELETE FROM public.goalkeepers WHERE id::text LIKE 'd0e51c00%';
DELETE FROM public.referees WHERE id::text LIKE 'd0e51d00%';

-- Saha sahipliğini geri al (sahaların kendisi KALIR)
UPDATE public.pitches SET owner_id = NULL WHERE owner_id::text LIKE 'd0e51b00%';

-- owner_accounts
DELETE FROM public.owner_accounts WHERE owner_user_id::text LIKE 'd0e51b00%';

-- Auth kullanıcıları (profiles + identities cascade ile gider)
DELETE FROM auth.identities WHERE user_id::text LIKE 'd0e51%';
DELETE FROM auth.users WHERE id::text LIKE 'd0e51%';

COMMIT;
