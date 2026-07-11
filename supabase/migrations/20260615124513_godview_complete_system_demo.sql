-- [DB GEÇMİŞİNDEN KURTARILDI 2026-07-11] Bu migration canlı veritabanına uygulanmıştı ancak repoda dosyası yoktu; supabase_migrations.schema_migrations.statements kolonundan geri çıkarıldı.

CREATE TABLE IF NOT EXISTS public.tournaments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  community_id UUID REFERENCES public.communities(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','OPEN','IN_PROGRESS','COMPLETED','CANCELLED')),
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  max_teams INT DEFAULT 16,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tournaments_public_read" ON public.tournaments;
CREATE POLICY "tournaments_public_read" ON public.tournaments FOR SELECT USING (true);
DROP POLICY IF EXISTS "tournaments_admin_all" ON public.tournaments;
CREATE POLICY "tournaments_admin_all" ON public.tournaments FOR ALL
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

CREATE OR REPLACE FUNCTION public.purge_godview_demo()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  DELETE FROM public.tournaments WHERE is_demo = true;
  DELETE FROM public.promo_codes WHERE is_demo = true;
  DELETE FROM public.community_creation_requests WHERE name LIKE '[DEMO]%';
  DELETE FROM public.communities WHERE is_demo = true;
  DELETE FROM public.matches WHERE "isDemo" = true;
  DELETE FROM public.goalkeepers WHERE "isDemo" = true;
  DELETE FROM public.referees WHERE "isDemo" = true;
  DELETE FROM public.pitches WHERE is_demo = true AND id != 'd1111111-1111-4111-8111-111111111111';
END;
$$;

CREATE OR REPLACE FUNCTION public.seed_godview_demo()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_gk1 UUID := 'a1111111-1111-4111-8111-111111111111';
  v_gk2 UUID := 'a2222222-2222-4222-8222-222222222222';
  v_ref1 UUID := 'a3333333-3333-4333-8333-333333333333';
  v_match1 UUID := 'a4444444-4444-4444-8444-444444444444';
  v_comm UUID := 'a5555555-5555-4555-8555-555555555555';
  v_promo UUID := 'a6666666-6666-4666-8666-666666666666';
  v_tourn UUID := 'a7777777-7777-4777-8777-777777777777';
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  PERFORM public.purge_godview_demo();

  INSERT INTO public.goalkeepers (id, "authUid", name, height, age, rating, fee, "matchCount", avatar, style, bio, "preferredZones", "isElite", "isDemo", stats, skills, equipment)
  VALUES
    (v_gk1, v_gk1, 'Demo Kaleci — Uğurcan T.', '1.92', 28, 4.8, 300, 42,
     'https://images.unsplash.com/photo-1574629310576-6e84c60be5cb?w=400', 'Panter',
     'Refleks ve penaltı kurtarmada uzman demo kaleci.', '["Kadıköy","Beşiktaş"]'::jsonb, true, true,
     '{"savePercentage":"88","cleanSheets":12,"penaltySaveRate":"35"}'::jsonb,
     '{"reflexes":92,"diving":90,"handling":85}'::jsonb, '{"gloves":"Elite Pro"}'::jsonb),
    (v_gk2, v_gk2, 'Demo Kaleci — Altay D.', '1.89', 25, 4.5, 220, 18,
     'https://images.unsplash.com/photo-1529900748604-07564a03e7a6?w=400', 'Libero',
     'Ayak oyunu güçlü, çıkış yapan kaleci.', '["Ümraniye","Maltepe"]'::jsonb, false, true,
     '{"savePercentage":"82","cleanSheets":5}'::jsonb, '{"reflexes":80,"kicking":88}'::jsonb, '{}'::jsonb)
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, "isDemo" = true;

  INSERT INTO public.referees (id, "authUid", name, level, rating, fee, "matchCount", avatar, style, bio, "preferredZones", "isElite", "isDemo", stats)
  VALUES
    (v_ref1, v_ref1, 'Demo Hakem — Cüneyt Ç.', 'FIFA', 4.7, 400, 156,
     'https://images.unsplash.com/photo-1580234811497-9df7fd2f357e?w=400', 'Otoriter',
     '150+ maç deneyimi. VAR sertifikalı demo hakem.', '["İstanbul Avrupa"]'::jsonb, true, true,
     '{"avgCards":3.2,"authority":90,"fitness":85,"communication":88}'::jsonb)
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, "isDemo" = true;

  INSERT INTO public.matches (id, title, location, date, time, price, difficulty, status, format, "missingPositions", slots, "isDemo")
  VALUES (
    v_match1, 'Demo Akşam Maçı', 'OYNA Demo Arena', to_char(CURRENT_DATE + 2, 'YYYY-MM-DD'), '20:00', 150, 'Orta', 'OPEN', '7v7',
    '[{"role":"GK","count":1},{"role":"REF","count":0}]'::jsonb,
    '[{"id":"s1","status":"OPEN"},{"id":"s2","status":"OPEN"}]'::jsonb, true
  ) ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, "isDemo" = true;

  INSERT INTO public.communities (id, name, type, description, location, is_verified, member_count, is_demo)
  VALUES (v_comm, '[DEMO] Kadıköy Halı Saha Topluluğu', 'Semt', 'Demo topluluk — silinebilir', 'Kadıköy', true, 24, true)
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, is_demo = true;

  INSERT INTO public.promo_codes (id, code, description, discount_type, discount_value, is_active, is_demo, target_segment)
  VALUES (v_promo, 'DEMO20', 'Demo indirim kodu %20', 'PERCENT', 20, true, true, 'ALL')
  ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, is_demo = true;

  INSERT INTO public.tournaments (id, name, status, max_teams, is_demo, starts_at)
  VALUES (v_tourn, '[DEMO] Yaz Turnuvası', 'OPEN', 8, true, NOW() + INTERVAL '14 days')
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, is_demo = true;

  INSERT INTO public.texts (key, value, category) VALUES
    ('dashboardTitle', 'ANA SAYFA', 'ui'),
    ('dashboardSubtitle', 'OYNA''YA HOŞ GELDİN', 'ui')
  ON CONFLICT (key) DO NOTHING;

  PERFORM public.log_admin_action('DEMO_SEED', 'system', NULL, 'godview_demo', NULL, jsonb_build_object('seeded_at', NOW()));
  RETURN jsonb_build_object('goalkeepers', 2, 'referees', 1, 'matches', 1, 'communities', 1, 'promo_codes', 1, 'tournaments', 1);
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_godview_demo() TO authenticated;
GRANT EXECUTE ON FUNCTION public.purge_godview_demo() TO authenticated;
