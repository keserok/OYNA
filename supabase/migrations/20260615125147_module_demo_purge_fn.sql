-- [DB GEÇMİŞİNDEN KURTARILDI 2026-07-11] Bu migration canlı veritabanına uygulanmıştı ancak repoda dosyası yoktu; supabase_migrations.schema_migrations.statements kolonundan geri çıkarıldı.

CREATE OR REPLACE FUNCTION public.purge_module_demo(p_module TEXT DEFAULT 'all')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_module IN ('all', 'tournaments') THEN DELETE FROM public.tournaments WHERE is_demo = true; END IF;
  IF p_module IN ('all', 'promo_codes') THEN DELETE FROM public.promo_codes WHERE is_demo = true; END IF;
  IF p_module IN ('all', 'communities') THEN
    DELETE FROM public.community_creation_requests WHERE name LIKE '[DEMO]%';
    DELETE FROM public.communities WHERE is_demo = true;
  END IF;
  IF p_module IN ('all', 'matches') THEN DELETE FROM public.matches WHERE "isDemo" = true; END IF;
  IF p_module IN ('all', 'goalkeepers') THEN DELETE FROM public.goalkeepers WHERE "isDemo" = true; END IF;
  IF p_module IN ('all', 'referees') THEN DELETE FROM public.referees WHERE "isDemo" = true; END IF;
  IF p_module IN ('all', 'teams') THEN DELETE FROM public.teams WHERE is_demo = true; END IF;
  IF p_module IN ('all', 'pitches') THEN DELETE FROM public.pitches WHERE id = 'a8888888-8888-4888-8888-888888888888'; END IF;
  IF p_module IN ('all', 'texts') THEN DELETE FROM public.texts WHERE key LIKE 'demo_%'; END IF;
END;
$$;
