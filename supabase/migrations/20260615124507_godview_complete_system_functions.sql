-- [DB GEÇMİŞİNDEN KURTARILDI 2026-07-11] Bu migration canlı veritabanına uygulanmıştı ancak repoda dosyası yoktu; supabase_migrations.schema_migrations.statements kolonundan geri çıkarıldı.

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
