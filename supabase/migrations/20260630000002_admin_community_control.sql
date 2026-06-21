-- Faz 1 — Topluluk operasyon paketi (audited admin RPC'leri)

-- Eksik tablo güvencesi
CREATE TABLE IF NOT EXISTS public.community_join_requests (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  community_id     uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message          text,
  status           text NOT NULL DEFAULT 'PENDING'
                     CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  reviewed_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at      timestamptz,
  rejection_reason text,
  created_at       timestamptz DEFAULT now(),
  UNIQUE(community_id, user_id)
);

ALTER TABLE public.community_join_requests ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.communities ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;

-- Profil topluluk önbelleği senkronu
CREATE OR REPLACE FUNCTION public._sync_profile_communities(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'communities'
  ) THEN
    RETURN;
  END IF;

  UPDATE public.profiles p
  SET communities = COALESCE(
    (
      SELECT jsonb_agg(cm.community_id::text ORDER BY cm.joined_at)
      FROM public.community_members cm
      WHERE cm.user_id = p_user_id
    ),
    '[]'::jsonb
  )
  WHERE p.id = p_user_id;
END;
$$;

-- ─── Liste ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_fetch_communities(
  p_search TEXT DEFAULT NULL,
  p_verified_only BOOLEAN DEFAULT NULL,
  p_type TEXT DEFAULT NULL,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  type TEXT,
  domain TEXT,
  description TEXT,
  location TEXT,
  owner_id UUID,
  owner_name TEXT,
  is_verified BOOLEAN,
  is_private BOOLEAN,
  is_demo BOOLEAN,
  join_mode TEXT,
  invite_code TEXT,
  member_count INT,
  active_matches INT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  total_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT
      c.*,
      pr.full_name AS owner_name
    FROM public.communities c
    LEFT JOIN public.profiles pr ON pr.id = c.owner_id
    WHERE (p_search IS NULL OR p_search = '' OR (
      c.name ILIKE '%' || p_search || '%'
      OR COALESCE(c.domain, '') ILIKE '%' || p_search || '%'
      OR COALESCE(c.location, '') ILIKE '%' || p_search || '%'
      OR COALESCE(c.type, '') ILIKE '%' || p_search || '%'
    ))
    AND (p_verified_only IS NULL OR c.is_verified = p_verified_only)
    AND (p_type IS NULL OR p_type = '' OR c.type = p_type)
  )
  SELECT
    f.id,
    f.name,
    f.type,
    f.domain,
    f.description,
    f.location,
    f.owner_id,
    f.owner_name,
    f.is_verified,
    f.is_private,
    COALESCE(f.is_demo, false),
    f.join_mode,
    f.invite_code,
    f.member_count,
    f.active_matches,
    f.created_at,
    f.updated_at,
    COUNT(*) OVER() AS total_count
  FROM filtered f
  ORDER BY f.created_at DESC
  LIMIT GREATEST(p_limit, 1)
  OFFSET GREATEST(p_offset, 0);
END;
$$;

-- ─── Detay ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_get_community(p_id uuid)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_community JSONB;
  v_members JSONB;
  v_join_requests JSONB;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT jsonb_build_object(
    'id', c.id,
    'name', c.name,
    'type', c.type,
    'domain', c.domain,
    'description', c.description,
    'rules', c.rules,
    'location', c.location,
    'logo_url', c.logo_url,
    'banner_url', c.banner_url,
    'owner_id', c.owner_id,
    'owner_name', pr.full_name,
    'is_verified', c.is_verified,
    'is_private', c.is_private,
    'is_demo', COALESCE(c.is_demo, false),
    'join_mode', c.join_mode,
    'invite_code', c.invite_code,
    'member_count', c.member_count,
    'active_matches', c.active_matches,
    'created_at', c.created_at,
    'updated_at', c.updated_at
  )
  INTO v_community
  FROM public.communities c
  LEFT JOIN public.profiles pr ON pr.id = c.owner_id
  WHERE c.id = p_id;

  IF v_community IS NULL THEN
    RAISE EXCEPTION 'Topluluk bulunamadı';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', cm.id,
      'user_id', cm.user_id,
      'user_name', p.full_name,
      'user_email', p.email,
      'role', cm.role,
      'notifications_enabled', cm.notifications_enabled,
      'joined_at', cm.joined_at
    ) ORDER BY cm.joined_at
  ), '[]'::jsonb)
  INTO v_members
  FROM public.community_members cm
  JOIN public.profiles p ON p.id = cm.user_id
  WHERE cm.community_id = p_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', jr.id,
      'user_id', jr.user_id,
      'user_name', p.full_name,
      'user_email', p.email,
      'message', jr.message,
      'status', jr.status,
      'created_at', jr.created_at
    ) ORDER BY jr.created_at
  ), '[]'::jsonb)
  INTO v_join_requests
  FROM public.community_join_requests jr
  JOIN public.profiles p ON p.id = jr.user_id
  WHERE jr.community_id = p_id AND jr.status = 'PENDING';

  RETURN jsonb_build_object(
    'community', v_community,
    'members', v_members,
    'pending_join_requests', v_join_requests
  );
END;
$$;

-- ─── Oluştur ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_create_community(p_payload JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_owner_id UUID;
  v_name TEXT;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  v_name := trim(COALESCE(p_payload->>'name', ''));
  IF v_name = '' THEN
    RAISE EXCEPTION 'Topluluk adı zorunlu';
  END IF;

  v_owner_id := NULLIF(p_payload->>'owner_id', '')::uuid;

  INSERT INTO public.communities (
    name, type, description, rules, domain, location,
    logo_url, banner_url, owner_id, is_verified, is_private, join_mode, is_demo
  ) VALUES (
    v_name,
    COALESCE(NULLIF(p_payload->>'type', ''), 'Bağımsız'),
    COALESCE(p_payload->>'description', ''),
    COALESCE(p_payload->>'rules', ''),
    NULLIF(p_payload->>'domain', ''),
    COALESCE(p_payload->>'location', ''),
    NULLIF(p_payload->>'logo_url', ''),
    NULLIF(p_payload->>'banner_url', ''),
    v_owner_id,
    COALESCE((p_payload->>'is_verified')::boolean, false),
    COALESCE((p_payload->>'is_private')::boolean, false),
    COALESCE(NULLIF(p_payload->>'join_mode', ''), 'OPEN'),
    COALESCE((p_payload->>'is_demo')::boolean, false)
  )
  RETURNING id INTO v_id;

  IF v_owner_id IS NOT NULL THEN
    INSERT INTO public.community_members (community_id, user_id, role)
    VALUES (v_id, v_owner_id, 'ADMIN')
    ON CONFLICT (community_id, user_id) DO UPDATE SET role = 'ADMIN';
    PERFORM public._sync_profile_communities(v_owner_id);
  END IF;

  PERFORM public.log_admin_action(
    'COMMUNITY_CREATE', 'community', v_id, v_name, NULL, p_payload
  );

  RETURN v_id;
END;
$$;

-- ─── Güncelle ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_update_community(
  p_id UUID,
  p_payload JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old JSONB;
  v_new_owner UUID;
  v_prev_owner UUID;
  v_name TEXT;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT jsonb_build_object(
    'name', name, 'type', type, 'is_verified', is_verified,
    'join_mode', join_mode, 'owner_id', owner_id, 'is_private', is_private
  ), owner_id, name
  INTO v_old, v_prev_owner, v_name
  FROM public.communities
  WHERE id = p_id;

  IF v_old IS NULL THEN
    RAISE EXCEPTION 'Topluluk bulunamadı';
  END IF;

  v_new_owner := COALESCE(NULLIF(p_payload->>'owner_id', '')::uuid, v_prev_owner);

  UPDATE public.communities SET
    name = COALESCE(NULLIF(p_payload->>'name', ''), name),
    type = COALESCE(NULLIF(p_payload->>'type', ''), type),
    description = COALESCE(p_payload->>'description', description),
    rules = COALESCE(p_payload->>'rules', rules),
    domain = COALESCE(p_payload->>'domain', domain),
    location = COALESCE(p_payload->>'location', location),
    logo_url = COALESCE(p_payload->>'logo_url', logo_url),
    banner_url = COALESCE(p_payload->>'banner_url', banner_url),
    owner_id = v_new_owner,
    is_verified = COALESCE((p_payload->>'is_verified')::boolean, is_verified),
    is_private = COALESCE((p_payload->>'is_private')::boolean, is_private),
    join_mode = COALESCE(NULLIF(p_payload->>'join_mode', ''), join_mode),
    is_demo = COALESCE((p_payload->>'is_demo')::boolean, is_demo),
    updated_at = NOW()
  WHERE id = p_id;

  IF v_new_owner IS NOT NULL AND v_new_owner IS DISTINCT FROM v_prev_owner THEN
    INSERT INTO public.community_members (community_id, user_id, role)
    VALUES (p_id, v_new_owner, 'ADMIN')
    ON CONFLICT (community_id, user_id) DO UPDATE SET role = 'ADMIN';
    PERFORM public._sync_profile_communities(v_new_owner);
    IF v_prev_owner IS NOT NULL THEN
      PERFORM public._sync_profile_communities(v_prev_owner);
    END IF;
  END IF;

  PERFORM public.log_admin_action(
    'COMMUNITY_UPDATE', 'community', p_id,
    COALESCE(NULLIF(p_payload->>'name', ''), v_name),
    v_old, p_payload
  );

  RETURN true;
END;
$$;

-- ─── Sil ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_delete_community(p_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name TEXT;
  v_member_ids UUID[];
  v_uid UUID;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT name INTO v_name FROM public.communities WHERE id = p_id;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Topluluk bulunamadı';
  END IF;

  SELECT array_agg(user_id) INTO v_member_ids
  FROM public.community_members
  WHERE community_id = p_id;

  DELETE FROM public.communities WHERE id = p_id;

  IF v_member_ids IS NOT NULL THEN
    FOREACH v_uid IN ARRAY v_member_ids LOOP
      PERFORM public._sync_profile_communities(v_uid);
    END LOOP;
  END IF;

  PERFORM public.log_admin_action(
    'COMMUNITY_DELETE', 'community', p_id, v_name, NULL, NULL
  );

  RETURN true;
END;
$$;

-- ─── Üye yönetimi ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_manage_community_member(
  p_community_id UUID,
  p_user_id UUID,
  p_action TEXT,
  p_role TEXT DEFAULT 'MEMBER'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_comm_name TEXT;
  v_action TEXT := upper(trim(p_action));
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT name INTO v_comm_name FROM public.communities WHERE id = p_community_id;
  IF v_comm_name IS NULL THEN
    RAISE EXCEPTION 'Topluluk bulunamadı';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'Kullanıcı bulunamadı';
  END IF;

  IF v_action = 'ADD' THEN
    INSERT INTO public.community_members (community_id, user_id, role)
    VALUES (p_community_id, p_user_id, COALESCE(NULLIF(upper(p_role), ''), 'MEMBER'))
    ON CONFLICT (community_id, user_id) DO UPDATE
      SET role = EXCLUDED.role;
  ELSIF v_action = 'REMOVE' THEN
    DELETE FROM public.community_members
    WHERE community_id = p_community_id AND user_id = p_user_id;
  ELSIF v_action = 'SET_ROLE' THEN
    UPDATE public.community_members
    SET role = COALESCE(NULLIF(upper(p_role), ''), 'MEMBER')
    WHERE community_id = p_community_id AND user_id = p_user_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Üye bulunamadı';
    END IF;
  ELSE
    RAISE EXCEPTION 'Geçersiz aksiyon: %', p_action;
  END IF;

  PERFORM public._sync_profile_communities(p_user_id);

  PERFORM public.log_admin_action(
    'COMMUNITY_MEMBER_' || v_action,
    'community', p_community_id, v_comm_name,
    jsonb_build_object('user_id', p_user_id),
    jsonb_build_object('action', v_action, 'role', p_role)
  );

  RETURN true;
END;
$$;

-- ─── Katılma talebi moderasyonu ────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_moderate_join_request(
  p_request_id UUID,
  p_approved BOOLEAN,
  p_notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.community_join_requests%ROWTYPE;
  v_comm_name TEXT;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT * INTO v_req FROM public.community_join_requests WHERE id = p_request_id;
  IF v_req.id IS NULL THEN
    RAISE EXCEPTION 'Talep bulunamadı';
  END IF;

  SELECT name INTO v_comm_name FROM public.communities WHERE id = v_req.community_id;

  UPDATE public.community_join_requests SET
    status = CASE WHEN p_approved THEN 'APPROVED' ELSE 'REJECTED' END,
    reviewed_by = auth.uid(),
    reviewed_at = NOW(),
    rejection_reason = CASE WHEN p_approved THEN NULL ELSE p_notes END
  WHERE id = p_request_id;

  IF p_approved THEN
    INSERT INTO public.community_members (community_id, user_id, role)
    VALUES (v_req.community_id, v_req.user_id, 'MEMBER')
    ON CONFLICT (community_id, user_id) DO NOTHING;
    PERFORM public._sync_profile_communities(v_req.user_id);

    INSERT INTO public.notifications (user_id, title, body, type)
    VALUES (
      v_req.user_id,
      'Topluluğa Kabul Edildin',
      COALESCE(v_comm_name, 'Topluluk') || ' topluluğuna katılımın onaylandı.',
      'COMMUNITY_JOIN_APPROVED'
    );
  ELSE
    INSERT INTO public.notifications (user_id, title, body, type)
    VALUES (
      v_req.user_id,
      'Katılma Talebi Reddedildi',
      COALESCE(p_notes, 'Topluluk katılma talebin onaylanamadı.'),
      'COMMUNITY_JOIN_REJECTED'
    );
  END IF;

  PERFORM public.log_admin_action(
    CASE WHEN p_approved THEN 'COMMUNITY_JOIN_APPROVE' ELSE 'COMMUNITY_JOIN_REJECT' END,
    'community', v_req.community_id, v_comm_name,
    jsonb_build_object('request_id', p_request_id, 'user_id', v_req.user_id),
    jsonb_build_object('approved', p_approved, 'notes', p_notes)
  );

  RETURN true;
END;
$$;

-- ─── Topluluk bildirimi ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_notify_community(
  p_community_id UUID,
  p_title TEXT,
  p_body TEXT
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT := 0;
  v_name TEXT;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT name INTO v_name FROM public.communities WHERE id = p_community_id;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Topluluk bulunamadı';
  END IF;

  INSERT INTO public.notifications (user_id, title, body, type)
  SELECT cm.user_id, p_title, p_body, 'ADMIN_COMMUNITY'
  FROM public.community_members cm
  WHERE cm.community_id = p_community_id
    AND cm.notifications_enabled IS DISTINCT FROM false;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  PERFORM public.log_admin_action(
    'COMMUNITY_NOTIFY', 'community', p_community_id, v_name,
    NULL, jsonb_build_object('title', p_title, 'recipients', v_count)
  );

  RETURN v_count;
END;
$$;

-- ─── Komuta merkezi kuyruğu (join requests eklendi) ────────────
CREATE OR REPLACE FUNCTION public.admin_ops_queue()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  RETURN jsonb_build_object(
    'pending_verifications', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id, 'name', full_name, 'email', email, 'created_at', created_at
      )), '[]'::jsonb)
      FROM public.profiles
      WHERE verification_status = 'pending'
      LIMIT 20
    ),
    'pending_pitches', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id, 'name', name, 'created_at', created_at
      )), '[]'::jsonb)
      FROM public.pitches
      WHERE verification_status = 'pending'
      LIMIT 20
    ),
    'pending_withdrawals', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id, 'amount', amount, 'owner_id', owner_id, 'created_at', created_at
      )), '[]'::jsonb)
      FROM public.owner_withdrawal_requests
      WHERE status = 'PENDING'
      LIMIT 20
    ),
    'open_disputes', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id, 'match_id', match_id, 'status', status, 'created_at', created_at
      )), '[]'::jsonb)
      FROM public.match_disputes
      WHERE status IN ('OPEN', 'UNDER_REVIEW')
      LIMIT 20
    ),
    'deletion_requests', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id, 'name', full_name, 'email', email, 'requested_at', account_deletion_requested_at
      )), '[]'::jsonb)
      FROM public.profiles
      WHERE account_deletion_requested_at IS NOT NULL
      LIMIT 20
    ),
    'community_requests', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', id, 'name', name, 'requester_id', requester_id, 'created_at', created_at
      )), '[]'::jsonb)
      FROM public.community_creation_requests
      WHERE status = 'PENDING'
      LIMIT 20
    ),
    'community_join_requests', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', sub.id,
        'community_id', sub.community_id,
        'community_name', sub.community_name,
        'user_id', sub.user_id,
        'user_name', sub.user_name,
        'created_at', sub.created_at
      )), '[]'::jsonb)
      FROM (
        SELECT
          jr.id,
          jr.community_id,
          c.name AS community_name,
          jr.user_id,
          p.full_name AS user_name,
          jr.created_at
        FROM public.community_join_requests jr
        JOIN public.communities c ON c.id = jr.community_id
        LEFT JOIN public.profiles p ON p.id = jr.user_id
        WHERE jr.status = 'PENDING'
        ORDER BY jr.created_at
        LIMIT 20
      ) sub
    )
  );
END;
$$;

-- ─── Yetkiler ──────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.admin_fetch_communities(TEXT, BOOLEAN, TEXT, INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_community(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_community(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_community(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_community(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_manage_community_member(UUID, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_moderate_join_request(UUID, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_notify_community(UUID, TEXT, TEXT) TO authenticated;
