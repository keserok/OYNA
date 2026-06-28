-- ============================================================================
-- ORDU DEMO PURGE — ordu_demo_seed.sql ile yaratılan TÜM demo veriyi siler
-- ----------------------------------------------------------------------------
-- FK güvenli sırada siler. auth.users silinince profiles CASCADE ile gider.
-- Sabit UUID önekleri: oyuncular/owner bb0000xx · takımlar dd0000xx
--                      maçlar cc0000xx · kaleci ee0000xx · hakem ff0000xx
-- ============================================================================

-- 1) Takım üyeleri + takımlar
DELETE FROM public.team_members WHERE team_id::text LIKE 'dd0000%';
DELETE FROM public.teams        WHERE id::text      LIKE 'dd0000%';

-- 2) Arkadaşlıklar (demo oyuncular arası)
DELETE FROM public.friendships
WHERE sender_id::text LIKE 'bb0000%' OR receiver_id::text LIKE 'bb0000%';

-- 3) Maç katılımcıları + maçlar
DELETE FROM public.match_participants WHERE match_id::text LIKE 'cc0000%';
DELETE FROM public.matches            WHERE id::text       LIKE 'cc0000%';

-- 4) Kaleci / hakem ilanları
DELETE FROM public.goalkeepers WHERE id::text LIKE 'ee0000%';
DELETE FROM public.referees    WHERE id::text LIKE 'ff0000%';

-- 5) Tesis sahipliğini geri al + owner hesabı
UPDATE public.pitches SET owner_id = NULL
WHERE owner_id = 'bb000099-0000-4000-8000-000000000099';
DELETE FROM public.owner_accounts WHERE owner_user_id = 'bb000099-0000-4000-8000-000000000099';

-- 6) Auth kullanıcıları (profiles CASCADE ile silinir)
DELETE FROM auth.users WHERE id::text LIKE 'bb0000%';

-- ============================================================================
-- PURGE TAMAM. (Sahalar a0000xxx kalır — onlar demo değil, gerçek katalog.)
-- ============================================================================
