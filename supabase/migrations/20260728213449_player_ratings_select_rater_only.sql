-- BULGU-106: puanlama anonimliği.
-- player_ratings SELECT politikasındaki `auth.uid() = ratee_id` dalı, puanlanan
-- oyuncunun "bana kim kaç puan verdi" satırlarını okumasına izin veriyordu
-- (20260710223053:14 ve 20260810000000:256). Canlıda yürürlükteki politika
-- 2026-07-28'de teyit edildi: player_ratings_select_scoped =
--   (auth.uid() = rater_id) OR (auth.uid() = ratee_id) OR is_platform_admin()
-- Tablo rater_id kolonu taşıdığı için bu doğrudan misilleme riski; üstelik
-- submit_match_evaluation ON CONFLICT DO UPDATE ile puanı sonradan değiştirmeye
-- izin veriyor (20260704000001:268).
-- Puanlananın kendi ortalamasını gördüğü yollar SECURITY DEFINER RPC üzerinden
-- çalışıyor (get_player_motm_count, 20260816000009:124) → etkilenmez.
-- İstemci tarafında ratee_id ile okuma yok (views/MyMatchesHub.tsx rater_id kullanıyor).

DROP POLICY IF EXISTS "player_ratings_select" ON public.player_ratings;
DROP POLICY IF EXISTS "player_ratings_select_secure" ON public.player_ratings;
DROP POLICY IF EXISTS "player_ratings_select_scoped" ON public.player_ratings;
DROP POLICY IF EXISTS "player_ratings_select_rater_only" ON public.player_ratings;

CREATE POLICY "player_ratings_select_rater_only" ON public.player_ratings
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) = rater_id
    OR public.is_platform_admin()
  );
