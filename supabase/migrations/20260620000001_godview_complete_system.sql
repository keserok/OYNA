-- OYNA Godview — Tam sistem uyumu, GK/Hakem admin, demo seed
-- Remote şema: camelCase provider/match kolonları

-- ─── Provider trigger (camelCase uyum) ────────────────────────
CREATE OR REPLACE FUNCTION public.protect_provider_sensitive_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    IF COALESCE(NEW."isElite", false) <> COALESCE(OLD."isElite", false)
       OR COALESCE(NEW.rating, 0) <> COALESCE(OLD.rating, 0) THEN
      RAISE EXCEPTION 'UNAUTHORIZED: Elite statüsü ve rating sadece yöneticiler tarafından güncellenebilir.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ─── is_demo bayrakları ───────────────────────────────────────
ALTER TABLE public.goalkeepers ADD COLUMN IF NOT EXISTS "isDemo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.referees ADD COLUMN IF NOT EXISTS "isDemo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS "isDemo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.communities ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.promo_codes ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.goalkeepers ADD COLUMN IF NOT EXISTS "authUid" UUID;

UPDATE public.goalkeepers SET "authUid" = id WHERE "authUid" IS NULL;

-- ─── Topluluk talepleri RLS ───────────────────────────────────
DROP POLICY IF EXISTS "ccr_admin_all" ON public.community_creation_requests;
CREATE POLICY "ccr_admin_all" ON public.community_creation_requests FOR ALL
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "ccr_requester_read" ON public.community_creation_requests;
CREATE POLICY "ccr_requester_read" ON public.community_creation_requests FOR SELECT
  USING (requester_id = auth.uid() OR public.is_platform_admin());

DROP POLICY IF EXISTS "ccr_requester_insert" ON public.community_creation_requests;
CREATE POLICY "ccr_requester_insert" ON public.community_creation_requests FOR INSERT
  WITH CHECK (requester_id = auth.uid());

-- ─── GK/Hakem admin yazma (platform admin) ────────────────────
DROP POLICY IF EXISTS "Platform admins manage goalkeepers" ON public.goalkeepers;
CREATE POLICY "Platform admins manage goalkeepers" ON public.goalkeepers FOR ALL
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "Platform admins manage referees" ON public.referees;
CREATE POLICY "Platform admins manage referees" ON public.referees FOR ALL
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "Public read goalkeepers" ON public.goalkeepers;
CREATE POLICY "Public read goalkeepers" ON public.goalkeepers FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read referees" ON public.referees;
CREATE POLICY "Public read referees" ON public.referees FOR SELECT USING (true);

-- ─── Pending verifications view (camelCase uyumlu) ─────────────
CREATE OR REPLACE VIEW public.pending_provider_verifications AS
SELECT
  p.id,
  COALESCE(p.full_name, p.name) AS full_name,
  p.email,
  p.avatar_url,
  p.role AS primary_role,
  p.roles,
  p.verification_status,
  p.created_at,
  g.id AS gk_profile_id,
  g.bio AS gk_bio,
  g.fee AS gk_fee,
  r.id AS ref_profile_id,
  r.bio AS ref_bio,
  r.fee AS ref_fee
FROM public.profiles p
LEFT JOIN public.goalkeepers g ON g.id = p.id OR g."authUid" = p.id
LEFT JOIN public.referees r ON r.id = p.id OR r."authUid" = p.id
WHERE p.verification_status = 'pending'
  AND (
    p.role IN ('GOALKEEPER', 'REFEREE')
    OR COALESCE(p.roles, '[]'::jsonb) ? 'GOALKEEPER'
    OR COALESCE(p.roles, '[]'::jsonb) ? 'REFEREE'
  );

GRANT SELECT ON public.pending_provider_verifications TO authenticated;

-- ─── Onay sonrası provider satırı oluştur ─────────────────────
CREATE OR REPLACE FUNCTION public.approve_provider_verification(
  p_user_id UUID, p_approved BOOLEAN, p_notes TEXT DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
  v_user_email TEXT;
  v_name TEXT;
  v_role TEXT;
  v_roles JSONB;
  v_is_gk BOOLEAN;
  v_is_ref BOOLEAN;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  SELECT email, COALESCE(full_name, name), role, roles
  INTO v_user_email, v_name, v_role, v_roles
  FROM public.profiles WHERE id = p_user_id;

  v_is_gk := v_role = 'GOALKEEPER' OR COALESCE(v_roles, '[]'::jsonb) ? 'GOALKEEPER';
  v_is_ref := v_role = 'REFEREE' OR COALESCE(v_roles, '[]'::jsonb) ? 'REFEREE';

  UPDATE public.profiles SET
    verification_status = CASE WHEN p_approved THEN 'approved' ELSE 'rejected' END,
    verification_notes = p_notes,
    verification_reviewed_by = auth.uid(),
    verification_reviewed_at = NOW(),
    updated_at = NOW()
  WHERE id = p_user_id;

  IF p_approved AND v_is_gk THEN
    INSERT INTO public.goalkeepers (id, "authUid", name, bio, fee, rating, "matchCount", style, avatar, "isElite", "isDemo", stats, skills)
    VALUES (p_user_id, p_user_id, COALESCE(v_name, 'Kaleci'), 'Onaylanmış kaleci profili', 250, 4.5, 0, 'Dengeli',
      'https://images.unsplash.com/photo-1574629310576-6e84c60be5cb?w=400', false, false,
      '{"savePercentage":"85","cleanSheets":0}'::jsonb, '{"reflexes":80,"diving":80}'::jsonb)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, "authUid" = EXCLUDED."authUid";
  END IF;

  IF p_approved AND v_is_ref THEN
    INSERT INTO public.referees (id, "authUid", name, bio, fee, rating, "matchCount", level, avatar, "isElite", "isDemo", stats)
    VALUES (p_user_id, p_user_id, COALESCE(v_name, 'Hakem'), 'Onaylanmış hakem profili', 350, 4.5, 0, 'FIFA',
      'https://images.unsplash.com/photo-1580234811497-9df7fd2f357e?w=400', false, false,
      '{"authority":80,"fitness":80,"communication":80}'::jsonb)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, "authUid" = EXCLUDED."authUid";
  END IF;

  INSERT INTO public.notifications (user_id, title, body, type_key)
  VALUES (
    p_user_id,
    CASE WHEN p_approved THEN 'Profilin Onaylandı!' ELSE 'Profil Onayı Reddedildi' END,
    CASE WHEN p_approved THEN 'Tebrikler! Hizmet sağlayıcı profilin aktif.' ELSE COALESCE('Sebep: ' || p_notes, 'Profilin onaylanamadı.') END,
    CASE WHEN p_approved THEN 'VERIFICATION_APPROVED' ELSE 'VERIFICATION_REJECTED' END
  );

  PERFORM public.log_admin_action(
    CASE WHEN p_approved THEN 'VERIFICATION_APPROVE' ELSE 'VERIFICATION_REJECT' END,
    'user', p_user_id, v_user_email,
    jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', CASE WHEN p_approved THEN 'approved' ELSE 'rejected' END, 'notes', p_notes)
  );
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ─── Segment önizleme ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_segment_preview(p_segment TEXT DEFAULT 'ALL')
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  RETURN jsonb_build_object(
    'count', (
      SELECT COUNT(*)::int FROM profiles p WHERE CASE p_segment
        WHEN 'ALL' THEN true
        WHEN 'PRO' THEN p.is_pro = true
        WHEN 'CAPTAIN' THEN p.role = 'CAPTAIN' OR COALESCE(p.roles, '[]'::jsonb) ? 'CAPTAIN'
        WHEN 'OWNER' THEN p.role = 'OWNER' OR COALESCE(p.roles, '[]'::jsonb) ? 'OWNER'
        WHEN 'NEW_USERS' THEN p.created_at >= NOW() - INTERVAL '30 days'
        WHEN 'GOALKEEPER' THEN p.role = 'GOALKEEPER' OR COALESCE(p.roles, '[]'::jsonb) ? 'GOALKEEPER'
        WHEN 'REFEREE' THEN p.role = 'REFEREE' OR COALESCE(p.roles, '[]'::jsonb) ? 'REFEREE'
        ELSE true END
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_segment_preview(text) TO authenticated;

-- ─── Turnuvalar (stub tablo) ───────────────────────────────────
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

-- ─── Demo seed / purge ─────────────────────────────────────────
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
