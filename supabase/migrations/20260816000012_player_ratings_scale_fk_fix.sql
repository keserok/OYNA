-- ============================================================
-- player_ratings ölçek + FK onarımı (değerlendirme motoru blokeri)
-- ============================================================
-- Sorun (canlıdan teyit, 2026-07-27; tablo 0 satır):
--   1) skill_score CHECK (1..5) — oysa submit_match_evaluation RPC'si 1..10
--      kırpar (20260704000001:265) ve PostMatchEval UI'ı yıldız×2 (2..10)
--      gönderir → 3+ yıldızlı her değerlendirme check_violation ile patlar.
--   2) match_id FK'si individual_matches(id)'ye bakıyor — RPC public.matches
--      id'si yazar → foreign_key_violation.
--   3) on_player_rating_added trigger'ı (update_user_skill_rating) 5'lik
--      skala varsayarak 0.7/0.3 ağırlıklı skor üretir; 10'luk skill ile
--      ratings_history enflasyona uğrardı.
-- Bu üçü düzelmeden PostMatchEval erişilebilir yapılamaz (Faz 2 ön koşulu).
--
-- SÜRÜM NOTU (2026-07-27): Bu dosya önce 20260816000000 numarasıyla yazıldı;
-- o sırada canlı ledger'daki en yüksek sürüm 20260815000000'dı. Aynı numarayı
-- paralel bir çalışma (20260816000000_reconcile_profiles_roles_bypass) aldı ve
-- canlıya uygulandı. Çakışma bırakılsaydı `db push` bu dosyayı "zaten uygulandı"
-- sayıp SESSİZCE ATLAYACAK, CHECK düzeltmesi üretime hiç gitmeyecekti. Dosya bu
-- yüzden boş bir numaraya (…012) taşındı — MIGRATION_PLAYBOOK'un 20260716000004
-- için uyguladığı çözümün aynısı; dosya hiç uygulanmadığı için ledger sözleşmesi
-- ihlal edilmez. Sıralama güvenli: constraint değişikliği diğer 11 migration'ın
-- hiçbirine bağımlı değil ve …009'daki match_motm görünümü kolonlara bağlıdır,
-- kısıtlara değil.

-- 1) CHECK: 1..10
ALTER TABLE public.player_ratings
  DROP CONSTRAINT IF EXISTS player_ratings_skill_score_check;
ALTER TABLE public.player_ratings
  ADD CONSTRAINT player_ratings_skill_score_check
  CHECK (skill_score >= 1 AND skill_score <= 10);

-- 2) FK: individual_matches → matches (canlıda tablo boş; veri taşıma gerekmez)
ALTER TABLE public.player_ratings
  DROP CONSTRAINT IF EXISTS player_ratings_match_id_fkey;
ALTER TABLE public.player_ratings
  ADD CONSTRAINT player_ratings_match_id_fkey
  FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE CASCADE;

-- 3) Trigger fonksiyonu: 10'luk skill 5'lik tabana indirgenir; ratings_history
--    'score' çıktı ölçeği (≈1..5 × güven katsayısı) DEĞİŞMEZ. UI yıldız×2
--    gönderdiği için /2 birebir eski yıldız değerini verir; taban 1.0'da
--    sabitlenir (eski davranışla uyum). trust_score NULL ise nötr katsayı (1.0).
CREATE OR REPLACE FUNCTION public.update_user_skill_rating()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_rater_ts FLOAT;
    v_skill_5 FLOAT;
    v_weighted_rating FLOAT;
BEGIN
    SELECT trust_score INTO v_rater_ts FROM profiles WHERE id = NEW.rater_id;
    v_skill_5 := GREATEST(1.0, LEAST(NEW.skill_score, 10)::float / 2.0);
    v_weighted_rating := ((v_skill_5 * 0.7 + NEW.fair_play_score * 0.3)
                          * (COALESCE(v_rater_ts, 5.0) / 5.0));

    UPDATE profiles
    SET ratings_history = array_append(ratings_history,
        jsonb_build_object('rater_ts', v_rater_ts, 'score', v_weighted_rating))
    WHERE id = NEW.ratee_id;

    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.update_user_skill_rating() FROM PUBLIC, anon;
