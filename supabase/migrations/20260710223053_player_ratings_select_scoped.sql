-- [DB GEÇMİŞİNDEN KURTARILDI 2026-07-11] Bu migration canlı veritabanına uygulanmıştı ancak repoda dosyası yoktu; supabase_migrations.schema_migrations.statements kolonundan geri çıkarıldı.

-- player_ratings SELECT: USING(true) → yalnız puanlayan/puanlanan taraf + platform admin.
-- Client bu tabloyu doğrudan okumuyor (doğrulandı); agregasyonlar SECURITY DEFINER
-- RPC'lerde çalıştığı için etkilenmez. Kişi-bazlı ham puanların (kim kime kaç verdi)
-- tüm kullanıcılara açık olması sosyal veri sızıntısıydı.

DROP POLICY IF EXISTS "player_ratings_select" ON public.player_ratings;
DROP POLICY IF EXISTS "player_ratings_select_secure" ON public.player_ratings;
DROP POLICY IF EXISTS "player_ratings_select_scoped" ON public.player_ratings;

CREATE POLICY "player_ratings_select_scoped" ON public.player_ratings
  FOR SELECT TO authenticated
  USING (
    (SELECT auth.uid()) = rater_id
    OR (SELECT auth.uid()) = ratee_id
    OR public.is_platform_admin()
  );
