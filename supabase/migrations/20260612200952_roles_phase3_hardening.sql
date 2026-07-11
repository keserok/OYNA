-- [DB GEÇMİŞİNDEN KURTARILDI 2026-07-11] Bu migration canlı veritabanına uygulanmıştı ancak repoda dosyası yoktu; supabase_migrations.schema_migrations.statements kolonundan geri çıkarıldı.

-- ============================================================
-- OYNA — Rol Sistemi / Faz 3: Sertleştirme
-- ============================================================

-- A) profiles_public: PII kolonlarını çıkar (DEFINER kalır - anon güvenli kartları görsün)
DROP VIEW IF EXISTS public.profiles_public;
CREATE VIEW public.profiles_public AS
  SELECT id, name, avatar_url, role, trust_score, skill_rating,
         reliability_score, is_verified, join_date
  FROM public.profiles;
GRANT SELECT ON public.profiles_public TO anon, authenticated;

-- B) Helper fonksiyonları anon'a kapat
REVOKE EXECUTE ON FUNCTION public.is_admin()      FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(text)   FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_admin()       TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.is_super_admin() TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.has_role(text)   TO authenticated, service_role;
-- trigger fonksiyonu RPC API'sinden tamamen çıksın (trigger yine de çalışır)
REVOKE EXECUTE ON FUNCTION public.protect_profile_columns() FROM PUBLIC;

-- C) matches/teams INSERT: sadece kendi adına oluşturma
DROP POLICY IF EXISTS "matches_insert_authenticated" ON public.matches;
CREATE POLICY "matches_insert_own" ON public.matches
  FOR INSERT TO authenticated
  WITH CHECK (captain_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "teams_insert_authenticated" ON public.teams;
CREATE POLICY "teams_insert_own" ON public.teams
  FOR INSERT TO authenticated
  WITH CHECK (captain_id = (SELECT auth.uid()));
