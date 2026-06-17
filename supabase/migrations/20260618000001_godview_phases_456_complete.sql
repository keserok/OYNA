-- ============================================================
-- OYNA Godview — Faz 4-6 Tamamlama
-- Finans, topluluk, CMS, kampanya, ACL, KVKK silme
-- ============================================================

-- ─── A. texts CMS tablosu ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.texts (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL DEFAULT '',
  category    TEXT DEFAULT 'ui',
  updated_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.texts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "texts_public_read" ON public.texts;
CREATE POLICY "texts_public_read" ON public.texts FOR SELECT USING (true);

DROP POLICY IF EXISTS "texts_admin_write" ON public.texts;
CREATE POLICY "texts_admin_write" ON public.texts FOR ALL
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

INSERT INTO public.texts (key, value, category) VALUES
  ('dashboardTitle', 'ANA SAYFA', 'ui'),
  ('dashboardSubtitle', 'OYNA''YA HOŞ GELDİN', 'ui'),
  ('communityViewTitle', 'TOPLULUKLAR', 'ui'),
  ('profileTitle', 'OYUNCU PROFİLİ', 'ui'),
  ('matchDiscoveryTitle', 'MAÇ BUL', 'ui'),
  ('marketplaceGkTitle', 'KALECİ KİRALA', 'ui'),
  ('marketplaceRefTitle', 'HAKEM KİRALA', 'ui'),
  ('pitchDiscoveryTitle', 'SAHA KİRALA', 'ui'),
  ('opponentFinderTitle', 'RAKİP BUL', 'ui'),
  ('studioTitle', 'TAKTİK ZEKA', 'ui')
ON CONFLICT (key) DO NOTHING;

-- ─── B. promo_codes ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.promo_codes (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code            TEXT NOT NULL UNIQUE,
  description     TEXT,
  discount_type   TEXT NOT NULL DEFAULT 'PERCENT' CHECK (discount_type IN ('PERCENT', 'FIXED')),
  discount_value  NUMERIC NOT NULL CHECK (discount_value > 0),
  max_redemptions INTEGER,
  redemption_count INTEGER DEFAULT 0,
  valid_from      TIMESTAMPTZ DEFAULT NOW(),
  valid_until     TIMESTAMPTZ,
  target_segment  TEXT DEFAULT 'ALL' CHECK (target_segment IN ('ALL', 'PRO', 'CAPTAIN', 'OWNER', 'NEW_USERS')),
  is_active       BOOLEAN DEFAULT true,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.promo_redemptions (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  promo_id     UUID NOT NULL REFERENCES public.promo_codes(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  redeemed_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(promo_id, user_id)
);

ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "promo_codes_admin" ON public.promo_codes;
CREATE POLICY "promo_codes_admin" ON public.promo_codes FOR ALL
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "promo_codes_public_read" ON public.promo_codes;
CREATE POLICY "promo_codes_public_read" ON public.promo_codes FOR SELECT
  USING (is_active = true AND (valid_until IS NULL OR valid_until > NOW()));

DROP POLICY IF EXISTS "promo_redemptions_own" ON public.promo_redemptions;
CREATE POLICY "promo_redemptions_own" ON public.promo_redemptions FOR SELECT
  USING (user_id = auth.uid() OR public.is_platform_admin());

DROP POLICY IF EXISTS "promo_redemptions_insert_own" ON public.promo_redemptions;
CREATE POLICY "promo_redemptions_insert_own" ON public.promo_redemptions FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- ─── C. owner_billing_events ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.owner_billing_events (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_user_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL,
  amount          NUMERIC,
  currency        TEXT DEFAULT 'TRY',
  external_id     TEXT,
  payload         JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_owner_billing_events_owner ON public.owner_billing_events(owner_user_id);

ALTER TABLE public.owner_billing_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_billing_events_admin" ON public.owner_billing_events;
CREATE POLICY "owner_billing_events_admin" ON public.owner_billing_events FOR ALL
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "owner_billing_events_owner_read" ON public.owner_billing_events;
CREATE POLICY "owner_billing_events_owner_read" ON public.owner_billing_events FOR SELECT
  USING (owner_user_id = auth.uid());

-- ─── D. admin_team_members (ACL) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.admin_team_members (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
  admin_role  TEXT NOT NULL DEFAULT 'ADMIN' CHECK (admin_role IN ('SUPER_ADMIN', 'ADMIN', 'MODERATOR', 'FINANCE', 'SUPPORT')),
  permissions JSONB DEFAULT '[]'::jsonb,
  invited_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.admin_team_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_team_platform_admin" ON public.admin_team_members;
CREATE POLICY "admin_team_platform_admin" ON public.admin_team_members FOR ALL
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

-- ─── E. wallet_transactions match_id (schema drift fix) ──────
ALTER TABLE public.wallet_transactions ADD COLUMN IF NOT EXISTS match_id UUID;

DROP POLICY IF EXISTS "Platform admins read wallet ledger" ON public.wallet_transactions;
CREATE POLICY "Platform admins read wallet ledger" ON public.wallet_transactions FOR SELECT
  USING (public.is_platform_admin());

-- ─── F. Fix dispute RLS to is_platform_admin ───────────────────
DROP POLICY IF EXISTS "Admins manage disputes" ON public.match_disputes;
CREATE POLICY "Admins manage disputes" ON public.match_disputes FOR ALL
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "Platform admins read booking payments" ON public.booking_payments;
CREATE POLICY "Platform admins read booking payments" ON public.booking_payments FOR SELECT
  USING (public.is_platform_admin());

-- ─── G. Extended dashboard stats ───────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_dashboard_stats()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  RETURN jsonb_build_object(
    'total_users', (SELECT COUNT(*)::int FROM profiles),
    'total_pitches', (SELECT COUNT(*)::int FROM pitches),
    'total_matches', (SELECT COUNT(*)::int FROM matches),
    'total_communities', (SELECT COUNT(*)::int FROM communities),
    'pending_verifications', (SELECT COUNT(*)::int FROM profiles WHERE verification_status = 'pending'),
    'pending_pitches', (SELECT COUNT(*)::int FROM pitches WHERE verification_status = 'pending'),
    'pending_withdrawals', (SELECT COUNT(*)::int FROM owner_withdrawal_requests WHERE status = 'PENDING'),
    'open_disputes', (SELECT COUNT(*)::int FROM match_disputes WHERE status IN ('OPEN','UNDER_REVIEW')),
    'deletion_requests', (SELECT COUNT(*)::int FROM profiles WHERE account_deletion_requested_at IS NOT NULL),
    'pending_community_requests', (SELECT COUNT(*)::int FROM community_creation_requests WHERE status = 'PENDING'),
    'banned_users', (SELECT COUNT(*)::int FROM profiles WHERE is_banned = true),
    'active_goalkeepers', (SELECT COUNT(*)::int FROM goalkeepers),
    'active_referees', (SELECT COUNT(*)::int FROM referees),
    'total_booking_revenue', COALESCE((SELECT SUM(amount) FROM booking_payments), 0),
    'total_wallet_volume', COALESCE((SELECT SUM(ABS(amount)) FROM wallet_transactions), 0),
    'active_promo_codes', (SELECT COUNT(*)::int FROM promo_codes WHERE is_active = true),
    'commission_rate', (SELECT commission_rate FROM settings WHERE id = 1)
  );
END;
$$;

-- ─── H. Operasyon kuyruğu (Komuta Merkezi) ───────────────────
CREATE OR REPLACE FUNCTION public.admin_ops_queue()
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  RETURN jsonb_build_object(
    'pending_verifications', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'name', full_name, 'email', email, 'created_at', created_at)), '[]'::jsonb)
      FROM profiles WHERE verification_status = 'pending' LIMIT 20
    ),
    'pending_pitches', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'created_at', created_at)), '[]'::jsonb)
      FROM pitches WHERE verification_status = 'pending' LIMIT 20
    ),
    'pending_withdrawals', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'amount', amount, 'owner_id', owner_id, 'created_at', created_at)), '[]'::jsonb)
      FROM owner_withdrawal_requests WHERE status = 'PENDING' LIMIT 20
    ),
    'open_disputes', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'match_id', match_id, 'status', status, 'created_at', created_at)), '[]'::jsonb)
      FROM match_disputes WHERE status IN ('OPEN','UNDER_REVIEW') LIMIT 20
    ),
    'deletion_requests', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'name', full_name, 'email', email, 'requested_at', account_deletion_requested_at)), '[]'::jsonb)
      FROM profiles WHERE account_deletion_requested_at IS NOT NULL LIMIT 20
    ),
    'community_requests', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'requester_id', requester_id, 'created_at', created_at)), '[]'::jsonb)
      FROM community_creation_requests WHERE status = 'PENDING' LIMIT 20
    )
  );
END;
$$;

-- ─── I. Finans RPC'leri ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_finance_stats(p_days int DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_since timestamptz := NOW() - (p_days || ' days')::interval;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  RETURN jsonb_build_object(
    'booking_revenue', COALESCE((SELECT SUM(amount) FROM booking_payments WHERE created_at >= v_since), 0),
    'wallet_credits', COALESCE((SELECT SUM(amount) FROM wallet_transactions WHERE amount > 0 AND created_at >= v_since), 0),
    'wallet_debits', COALESCE((SELECT SUM(ABS(amount)) FROM wallet_transactions WHERE amount < 0 AND created_at >= v_since), 0),
    'withdrawal_pending', COALESCE((SELECT SUM(amount) FROM owner_withdrawal_requests WHERE status = 'PENDING'), 0),
    'payment_count', (SELECT COUNT(*)::int FROM booking_payments WHERE created_at >= v_since)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_fetch_wallet_ledger(p_limit int DEFAULT 100)
RETURNS SETOF public.wallet_transactions
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  RETURN QUERY SELECT * FROM wallet_transactions ORDER BY created_at DESC LIMIT p_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_fetch_booking_payments(p_limit int DEFAULT 100)
RETURNS TABLE (
  id uuid, booking_id uuid, amount numeric, payment_method text,
  note text, created_at timestamptz, pitch_name text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  RETURN QUERY
  SELECT bp.id, bp.booking_id, bp.amount, bp.payment_method, bp.note, bp.created_at, p.name
  FROM booking_payments bp
  LEFT JOIN pitch_bookings pb ON pb.id = bp.booking_id
  LEFT JOIN pitches p ON p.id = pb.pitch_id
  ORDER BY bp.created_at DESC LIMIT p_limit;
END;
$$;

-- ─── J. Dispute çözümü ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_resolve_dispute(
  p_dispute_id uuid,
  p_status text,
  p_notes text DEFAULT NULL
) RETURNS boolean AS $$
DECLARE v_match_id uuid;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_status NOT IN ('RESOLVED', 'DISMISSED', 'UNDER_REVIEW') THEN
    RAISE EXCEPTION 'Geçersiz durum';
  END IF;
  SELECT match_id INTO v_match_id FROM match_disputes WHERE id = p_dispute_id;
  UPDATE match_disputes SET
    status = p_status, resolution_notes = p_notes,
    resolved_by = auth.uid(), resolved_at = CASE WHEN p_status IN ('RESOLVED','DISMISSED') THEN NOW() ELSE NULL END
  WHERE id = p_dispute_id;
  PERFORM log_admin_action('DISPUTE_' || p_status, 'match', v_match_id, p_dispute_id::text,
    NULL, jsonb_build_object('status', p_status, 'notes', p_notes));
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ─── K. KVKK hesap silme işleme ────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_process_account_deletion(
  p_user_id uuid,
  p_anonymize boolean DEFAULT true
) RETURNS boolean AS $$
DECLARE v_email text;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT email INTO v_email FROM profiles WHERE id = p_user_id;
  IF v_email IS NULL THEN RAISE EXCEPTION 'Kullanıcı bulunamadı'; END IF;

  IF p_anonymize THEN
    UPDATE profiles SET
      full_name = 'Silinmiş Kullanıcı',
      email = 'deleted_' || substr(p_user_id::text, 1, 8) || '@oyna.deleted',
      avatar_url = NULL,
      phone = NULL,
      is_banned = true,
      account_deletion_requested_at = NULL,
      updated_at = NOW()
    WHERE id = p_user_id;
  ELSE
    DELETE FROM profiles WHERE id = p_user_id;
  END IF;

  PERFORM log_admin_action('ACCOUNT_DELETE', 'user', p_user_id, v_email,
    NULL, jsonb_build_object('anonymized', p_anonymize));
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ─── L. Broadcast bildirim ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_broadcast_notification(
  p_title text,
  p_body text,
  p_segment text DEFAULT 'ALL',
  p_type text DEFAULT 'ADMIN_BROADCAST'
) RETURNS int AS $$
DECLARE v_count int := 0;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  INSERT INTO notifications (user_id, title, body, type)
  SELECT p.id, p_title, p_body, p_type
  FROM profiles p
  WHERE CASE p_segment
    WHEN 'ALL' THEN true
    WHEN 'PRO' THEN p.is_pro = true
    WHEN 'CAPTAIN' THEN p.role = 'CAPTAIN' OR COALESCE(p.roles, '[]'::jsonb) ? 'CAPTAIN'
    WHEN 'OWNER' THEN p.role = 'OWNER' OR COALESCE(p.roles, '[]'::jsonb) ? 'OWNER'
    WHEN 'NEW_USERS' THEN p.created_at >= NOW() - INTERVAL '30 days'
    ELSE true
  END;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM log_admin_action('BROADCAST', 'system', NULL, p_segment,
    NULL, jsonb_build_object('title', p_title, 'recipients', v_count));
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ─── M. Topluluk oluşturma onayı ─────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_moderate_community_creation(
  p_request_id uuid,
  p_approved boolean,
  p_notes text DEFAULT NULL
) RETURNS boolean AS $$
DECLARE
  v_req community_creation_requests%ROWTYPE;
  v_community_id uuid;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  SELECT * INTO v_req FROM community_creation_requests WHERE id = p_request_id;
  IF v_req.id IS NULL THEN RAISE EXCEPTION 'Talep bulunamadı'; END IF;

  UPDATE community_creation_requests SET
    status = CASE WHEN p_approved THEN 'APPROVED' ELSE 'REJECTED' END,
    reviewed_by = auth.uid(), reviewed_at = NOW(),
    rejection_reason = CASE WHEN p_approved THEN NULL ELSE p_notes END,
    admin_notes = p_notes
  WHERE id = p_request_id;

  IF p_approved THEN
    INSERT INTO communities (name, type, description, location, owner_id, is_verified)
    VALUES (v_req.name, v_req.type, v_req.description, v_req.location, v_req.requester_id, true)
    RETURNING id INTO v_community_id;

    INSERT INTO community_members (community_id, user_id, role)
    VALUES (v_community_id, v_req.requester_id, 'ADMIN');

    INSERT INTO notifications (user_id, title, body, type)
    VALUES (v_req.requester_id, 'Topluluğun Onaylandı!', v_req.name || ' topluluğun oluşturuldu.', 'COMMUNITY_APPROVED');
  ELSE
    INSERT INTO notifications (user_id, title, body, type)
    VALUES (v_req.requester_id, 'Topluluk Talebi Reddedildi', COALESCE(p_notes, 'Talep onaylanamadı.'), 'COMMUNITY_REJECTED');
  END IF;

  PERFORM log_admin_action(
    CASE WHEN p_approved THEN 'COMMUNITY_APPROVE' ELSE 'COMMUNITY_REJECT' END,
    'community', p_request_id, v_req.name, NULL,
    jsonb_build_object('approved', p_approved, 'notes', p_notes)
  );
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ─── N. CMS metin güncelleme ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_update_texts(p_texts jsonb)
RETURNS int AS $$
DECLARE v_key text; v_val text; v_count int := 0;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  FOR v_key, v_val IN SELECT * FROM jsonb_each_text(p_texts) LOOP
    INSERT INTO texts (key, value, updated_by, updated_at)
    VALUES (v_key, v_val, auth.uid(), NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = auth.uid(), updated_at = NOW();
    v_count := v_count + 1;
  END LOOP;
  PERFORM log_admin_action('CMS_UPDATE', 'system', NULL, 'texts', NULL, p_texts);
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ─── O. Promo kod oluşturma ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_create_promo_code(
  p_code text,
  p_discount_type text,
  p_discount_value numeric,
  p_description text DEFAULT NULL,
  p_max_redemptions int DEFAULT NULL,
  p_valid_until timestamptz DEFAULT NULL,
  p_target_segment text DEFAULT 'ALL'
) RETURNS uuid AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  INSERT INTO promo_codes (code, description, discount_type, discount_value, max_redemptions, valid_until, target_segment, created_by)
  VALUES (upper(trim(p_code)), p_description, p_discount_type, p_discount_value, p_max_redemptions, p_valid_until, p_target_segment, auth.uid())
  RETURNING id INTO v_id;
  PERFORM log_admin_action('PROMO_CREATE', 'system', v_id, upper(trim(p_code)),
    NULL, jsonb_build_object('type', p_discount_type, 'value', p_discount_value));
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ─── P. ACL rol atama ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_set_platform_role(
  p_user_id uuid,
  p_admin_role text,
  p_grant_platform_admin boolean DEFAULT false
) RETURNS boolean AS $$
DECLARE v_email text;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_admin_role NOT IN ('SUPER_ADMIN', 'ADMIN', 'MODERATOR', 'FINANCE', 'SUPPORT') THEN
    RAISE EXCEPTION 'Geçersiz rol';
  END IF;
  SELECT email INTO v_email FROM profiles WHERE id = p_user_id;

  INSERT INTO admin_team_members (user_id, admin_role, invited_by)
  VALUES (p_user_id, p_admin_role, auth.uid())
  ON CONFLICT (user_id) DO UPDATE SET admin_role = EXCLUDED.admin_role;

  IF p_grant_platform_admin OR p_admin_role IN ('SUPER_ADMIN', 'ADMIN') THEN
    UPDATE profiles SET role = 'ADMIN', is_admin = true WHERE id = p_user_id;
  END IF;

  PERFORM log_admin_action('ROLE_CHANGE', 'user', p_user_id, v_email,
    NULL, jsonb_build_object('admin_role', p_admin_role, 'is_admin', p_grant_platform_admin));
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Grants
GRANT EXECUTE ON FUNCTION public.admin_ops_queue() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_finance_stats(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_fetch_wallet_ledger(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_fetch_booking_payments(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_resolve_dispute(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_process_account_deletion(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_broadcast_notification(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_moderate_community_creation(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_texts(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_promo_code(text, text, numeric, text, int, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_platform_role(uuid, text, boolean) TO authenticated;
