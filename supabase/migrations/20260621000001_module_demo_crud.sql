-- Modül bazlı demo seed/purge + teams is_demo + godview demo saha/takım

ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.purge_module_demo(p_module TEXT DEFAULT 'all')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  IF p_module IN ('all', 'tournaments') THEN
    DELETE FROM public.tournaments WHERE is_demo = true;
  END IF;
  IF p_module IN ('all', 'promo_codes') THEN
    DELETE FROM public.promo_codes WHERE is_demo = true;
  END IF;
  IF p_module IN ('all', 'communities') THEN
    DELETE FROM public.community_creation_requests WHERE name LIKE '[DEMO]%';
    DELETE FROM public.communities WHERE is_demo = true;
  END IF;
  IF p_module IN ('all', 'matches') THEN
    DELETE FROM public.matches WHERE "isDemo" = true;
  END IF;
  IF p_module IN ('all', 'goalkeepers') THEN
    DELETE FROM public.goalkeepers WHERE "isDemo" = true;
  END IF;
  IF p_module IN ('all', 'referees') THEN
    DELETE FROM public.referees WHERE "isDemo" = true;
  END IF;
  IF p_module IN ('all', 'teams') THEN
    DELETE FROM public.teams WHERE is_demo = true;
  END IF;
  IF p_module IN ('all', 'pitches') THEN
    DELETE FROM public.pitches WHERE is_demo = true AND id NOT IN (
      'd1111111-1111-4111-8111-111111111111',
      'a8888888-8888-4888-8888-888888888888'
    );
    DELETE FROM public.pitches WHERE id = 'a8888888-8888-4888-8888-888888888888';
  END IF;
  IF p_module IN ('all', 'texts') THEN
    DELETE FROM public.texts WHERE key LIKE 'demo_%';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.seed_module_demo(p_module TEXT DEFAULT 'all')
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_gk1 UUID := 'a1111111-1111-4111-8111-111111111111';
  v_gk2 UUID := 'a2222222-2222-4222-8222-222222222222';
  v_ref1 UUID := 'a3333333-3333-4333-8333-333333333333';
  v_match1 UUID := 'a4444444-4444-4444-8444-444444444444';
  v_comm UUID := 'a5555555-5555-4555-8555-555555555555';
  v_promo UUID := 'a6666666-6666-4666-8666-666666666666';
  v_tourn UUID := 'a7777777-7777-4777-8777-777777777777';
  v_team UUID := 'a9999999-9999-4999-8999-999999999999';
  v_pitch UUID := 'a8888888-8888-4888-8888-888888888888';
  v_result JSONB := '{}'::jsonb;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  PERFORM public.purge_module_demo(p_module);

  IF p_module IN ('all', 'goalkeepers') THEN
    INSERT INTO public.goalkeepers (id, "authUid", name, height, age, rating, fee, "matchCount", avatar, style, bio, "preferredZones", "isElite", "isDemo", stats, skills, equipment)
    VALUES
      (v_gk1, v_gk1, 'Demo Kaleci — Uğurcan T.', '1.92', 28, 4.8, 300, 42,
       'https://images.unsplash.com/photo-1574629310576-6e84c60be5cb?w=400', 'Panter',
       'Refleks ve penaltı kurtarmada uzman demo kaleci.', '["Kadıköy","Beşiktaş"]'::jsonb, true, true,
       '{"savePercentage":"88","cleanSheets":12}'::jsonb, '{"reflexes":92,"diving":90}'::jsonb, '{}'::jsonb),
      (v_gk2, v_gk2, 'Demo Kaleci — Altay D.', '1.89', 25, 4.5, 220, 18,
       'https://images.unsplash.com/photo-1529900748604-07564a03e7a6?w=400', 'Libero',
       'Ayak oyunu güçlü demo kaleci.', '["Ümraniye"]'::jsonb, false, true,
       '{"savePercentage":"82"}'::jsonb, '{"reflexes":80}'::jsonb, '{}'::jsonb)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, "isDemo" = true;
    v_result := v_result || jsonb_build_object('goalkeepers', 2);
  END IF;

  IF p_module IN ('all', 'referees') THEN
    INSERT INTO public.referees (id, "authUid", name, level, rating, fee, "matchCount", avatar, style, bio, "preferredZones", "isElite", "isDemo", stats)
    VALUES (v_ref1, v_ref1, 'Demo Hakem — Cüneyt Ç.', 'FIFA', 4.7, 400, 156,
      'https://images.unsplash.com/photo-1580234811497-9df7fd2f357e?w=400', 'Otoriter',
      'VAR sertifikalı demo hakem.', '["İstanbul"]'::jsonb, true, true,
      '{"authority":90,"fitness":85}'::jsonb)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, "isDemo" = true;
    v_result := v_result || jsonb_build_object('referees', 1);
  END IF;

  IF p_module IN ('all', 'matches') THEN
    INSERT INTO public.matches (id, title, location, date, time, price, difficulty, status, format, "missingPositions", slots, "isDemo")
    VALUES (
      v_match1, 'Demo Akşam Maçı', 'OYNA Demo Arena', to_char(CURRENT_DATE + 2, 'YYYY-MM-DD'), '20:00', 150, 'Orta', 'OPEN', '7v7',
      '[{"role":"GK","count":1}]'::jsonb, '[{"id":"s1","status":"OPEN"}]'::jsonb, true
    ) ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, "isDemo" = true;
    v_result := v_result || jsonb_build_object('matches', 1);
  END IF;

  IF p_module IN ('all', 'communities') THEN
    INSERT INTO public.communities (id, name, type, description, location, is_verified, member_count, is_demo)
    VALUES (v_comm, '[DEMO] Kadıköy Halı Saha Topluluğu', 'Semt', 'Demo topluluk', 'Kadıköy', true, 24, true)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, is_demo = true;
    v_result := v_result || jsonb_build_object('communities', 1);
  END IF;

  IF p_module IN ('all', 'promo_codes') THEN
    INSERT INTO public.promo_codes (id, code, description, discount_type, discount_value, is_active, is_demo, target_segment)
    VALUES (v_promo, 'DEMO20', 'Demo indirim %20', 'PERCENT', 20, true, true, 'ALL')
    ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, is_demo = true;
    v_result := v_result || jsonb_build_object('promo_codes', 1);
  END IF;

  IF p_module IN ('all', 'tournaments') THEN
    INSERT INTO public.tournaments (id, name, status, max_teams, is_demo, starts_at)
    VALUES (v_tourn, '[DEMO] Yaz Turnuvası', 'OPEN', 8, true, NOW() + INTERVAL '14 days')
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, is_demo = true;
    v_result := v_result || jsonb_build_object('tournaments', 1);
  END IF;

  IF p_module IN ('all', 'teams') THEN
    INSERT INTO public.teams (id, name, is_demo, wins, losses)
    VALUES (v_team, '[DEMO] Beşiktaş Gençler', true, 5, 2)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, is_demo = true;
    v_result := v_result || jsonb_build_object('teams', 1);
  END IF;

  IF p_module IN ('all', 'pitches') THEN
    INSERT INTO public.pitches (id, name, district, is_demo, verification_status, is_open, price_per_match)
    VALUES (v_pitch, '[DEMO] Godview Test Sahası', 'Kadıköy', true, 'approved', true, 1200)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, is_demo = true;
    v_result := v_result || jsonb_build_object('pitches', 1);
  END IF;

  IF p_module IN ('all', 'texts') THEN
    INSERT INTO public.texts (key, value, category) VALUES
      ('demo_banner', 'Demo içerik aktif — Godview test', 'ui')
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
    v_result := v_result || jsonb_build_object('texts', 1);
  END IF;

  IF p_module = 'all' THEN
    PERFORM public.log_admin_action('DEMO_SEED', 'system', NULL, 'godview_demo_all', NULL, jsonb_build_object('seeded_at', NOW()));
  END IF;

  RETURN v_result;
END;
$$;

-- Eski RPC'leri modül sarmalayıcıya yönlendir
CREATE OR REPLACE FUNCTION public.purge_godview_demo()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.purge_module_demo('all');
END;
$$;

CREATE OR REPLACE FUNCTION public.seed_godview_demo()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN public.seed_module_demo('all');
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_module_demo(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.purge_module_demo(text) TO authenticated;
