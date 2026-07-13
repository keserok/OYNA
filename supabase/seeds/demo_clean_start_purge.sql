-- ============================================================================
-- OYNA — DEMO TEMİZ BAŞLANGIÇ (CLEAN START) PURGE
-- ----------------------------------------------------------------------------
-- AMAÇ: Lansman zamanı geldiğinde TÜM demo veriyi tek hamlede siler; uygulama
--       tertemiz (sıfır demo) başlar. Gerçek kullanıcı verisine DOKUNMAZ.
--
-- KAPSAM (iki demo sistemi de):
--   • ordu_admin_demo_seed + social_demo_seed  → önek  d0e51%
--       (20 oyuncu · 4 saha sahibi · 3 kaleci · 2 hakem · demo maçlar · demo takım)
--   • ordu_demo_seed (eski sistem, prod'da yok) → önek  bb0000/cc0000/dd0000/ee0000/ff0000
--
-- GÜVENLİK:
--   • Yalnız demo önekli kimlikleri hedefler; ölçüt kaymaz.
--   • FK-güvenli sıra: bloklayan NO-ACTION/RESTRICT satırları önce çözülür,
--     sonra demo auth.users silinir → profiles + tüm CASCADE çocuklar temizlenir.
--   • Denetçi/işlemci rolü kolonları (reviewed_by/updated_by…) SET NULL yapılır
--     (o satır gerçek veriye ait olabilir; yalnız referans boşaltılır).
--   • Idempotent: tekrar çalıştırılabilir (yoksa satır = no-op). Tek transaction:
--     bir hata olursa HİÇBİR ŞEY silinmez (tümü geri alınır).
--
-- ÇALIŞTIRMA (3 yoldan biri):
--   1) Supabase Dashboard → SQL Editor → bu dosyayı yapıştır → Run
--   2) psql "$DATABASE_URL" -f supabase/seeds/demo_clean_start_purge.sql
--   3) "Şimdi temizle" de → asistan Supabase MCP ile bu içeriği çalıştırır.
--
-- SON ADIM (UI): Demo giriş seçicisini kapatmak için build ortamına
--   VITE_DEMO_ACCOUNTS=false ver ve yeniden deploy et (bkz. OYNA_DEMO_HESAPLARI.md).
-- ============================================================================

BEGIN;

-- Silinecek demo kullanıcı kimlikleri (her iki sistem)
CREATE TEMP TABLE _demo_users ON COMMIT DROP AS
  SELECT id FROM auth.users
  WHERE id::text LIKE 'd0e51%' OR id::text LIKE 'bb0000%';

DO $$ BEGIN
  RAISE NOTICE 'Temizlenecek demo kullanıcı sayısı: %', (SELECT count(*) FROM _demo_users);
END $$;

-- ── 1) auth.users silinmesini BLOKLAYAN satırlar (NO ACTION / RESTRICT) ──────
--     Bunlar demo kullanıcıya AİT kayıtlar → satırı sil.
DELETE FROM public.payment_intents        WHERE user_id       IN (SELECT id FROM _demo_users);
DELETE FROM public.payout_requests        WHERE user_id       IN (SELECT id FROM _demo_users);
DELETE FROM public.player_ratings         WHERE rater_id      IN (SELECT id FROM _demo_users);
DELETE FROM public.service_ratings        WHERE rater_id      IN (SELECT id FROM _demo_users);
DELETE FROM public.service_requests       WHERE requested_by  IN (SELECT id FROM _demo_users);
DELETE FROM public.match_score_proposals  WHERE proposed_by   IN (SELECT id FROM _demo_users);
DELETE FROM public.minor_payment_consents WHERE minor_user_id IN (SELECT id FROM _demo_users);
DELETE FROM public.admin_audit_log        WHERE admin_id      IN (SELECT id FROM _demo_users);

--     Bunlar denetçi/işlemci rolü → satır gerçek veriye ait olabilir → SET NULL.
UPDATE public.payout_requests       SET processed_by = NULL WHERE processed_by IN (SELECT id FROM _demo_users);
UPDATE public.provider_applications SET reviewed_by  = NULL WHERE reviewed_by  IN (SELECT id FROM _demo_users);
UPDATE public.provider_identities   SET verified_by  = NULL WHERE verified_by  IN (SELECT id FROM _demo_users);
UPDATE public.app_config            SET updated_by   = NULL WHERE updated_by   IN (SELECT id FROM _demo_users);
UPDATE public.commission_config     SET created_by   = NULL WHERE created_by   IN (SELECT id FROM _demo_users);
UPDATE public.feature_flags         SET updated_by   = NULL WHERE updated_by   IN (SELECT id FROM _demo_users);
UPDATE public.region_coverage       SET updated_by   = NULL WHERE updated_by   IN (SELECT id FROM _demo_users);

-- ── 2) Demo MAÇLARI silmeyi bloklayan tek NO-ACTION: wallet_transactions.match_id ──
UPDATE public.wallet_transactions SET match_id = NULL
WHERE match_id::text LIKE 'd0e51e00%' OR match_id::text LIKE 'cc0000%';

-- ── 3) Demo maçlar (çocukların çoğu CASCADE) — katılımcıları da açıkça sil ─────
DELETE FROM public.match_participants WHERE match_id::text LIKE 'd0e51e00%' OR match_id::text LIKE 'cc0000%';
DELETE FROM public.matches            WHERE id::text       LIKE 'd0e51e00%' OR id::text       LIKE 'cc0000%';

-- ── 4) Demo takım(lar) (team_members/mesaj/davet CASCADE ile gider) ───────────
DELETE FROM public.teams WHERE id::text LIKE 'd0e51f%' OR id::text LIKE 'dd0000%';

-- ── 5) Kaleci/hakem katalog satırları (kullanıcıdan CASCADE GELMEZ) ───────────
DELETE FROM public.goalkeepers WHERE id::text LIKE 'd0e51c%' OR id::text LIKE 'ee0000%';
DELETE FROM public.referees    WHERE id::text LIKE 'd0e51d%' OR id::text LIKE 'ff0000%';

-- ── 6) Demo sahiplerinin sahalarını boşalt (kullanıcı silinince zaten SET NULL) ─
--     Sahaların KENDİSİ silinmez (gerçek katalog kabul edilir).
UPDATE public.pitches SET owner_id = NULL WHERE owner_id IN (SELECT id FROM _demo_users);

-- ── 7) owner_accounts (kullanıcıdan CASCADE gelir; yine de açık) ──────────────
DELETE FROM public.owner_accounts WHERE owner_user_id IN (SELECT id FROM _demo_users);

-- ── 8) Auth kullanıcıları → profiles + TÜM CASCADE çocuk kayıtları temizlenir ──
--     (arkadaşlık, takım üyeliği, cüzdan, bildirim, rezervasyon, kart… hepsi)
DELETE FROM auth.identities WHERE user_id IN (SELECT id FROM _demo_users);
DELETE FROM auth.users      WHERE id      IN (SELECT id FROM _demo_users);

-- ── 9) DOĞRULAMA: hiç demo iz kalmadıysa COMMIT; kaldıysa tümünü geri al ──────
DO $$
DECLARE u int; p int; m int; t int; g int; r int;
BEGIN
  SELECT count(*) INTO u FROM auth.users     WHERE id::text LIKE 'd0e51%'    OR id::text LIKE 'bb0000%';
  SELECT count(*) INTO p FROM public.profiles WHERE id::text LIKE 'd0e51%'   OR id::text LIKE 'bb0000%';
  SELECT count(*) INTO m FROM public.matches WHERE id::text LIKE 'd0e51e00%' OR id::text LIKE 'cc0000%';
  SELECT count(*) INTO t FROM public.teams   WHERE id::text LIKE 'd0e51f%'   OR id::text LIKE 'dd0000%';
  SELECT count(*) INTO g FROM public.goalkeepers WHERE id::text LIKE 'd0e51c%' OR id::text LIKE 'ee0000%';
  SELECT count(*) INTO r FROM public.referees    WHERE id::text LIKE 'd0e51d%' OR id::text LIKE 'ff0000%';
  RAISE NOTICE 'PURGE SONRASI kalan → users:% profiles:% matches:% teams:% gk:% ref:%', u,p,m,t,g,r;
  IF (u+p+m+t+g+r) > 0 THEN
    RAISE EXCEPTION 'Demo veri kaldı — purge eksik, transaction geri alınıyor.';
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- TEMİZ BAŞLANGIÇ TAMAM. Sahalar (a0000xxx) korunur; gerçek kullanıcılar korunur.
-- ============================================================================
