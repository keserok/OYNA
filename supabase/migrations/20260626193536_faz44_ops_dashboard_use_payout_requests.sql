-- FAZ 4.4 birleştirme: admin dashboard + ops kuyruğu "bekleyen çekim"i de
-- tek kaynaktan (payout_requests) okur. Eski owner_withdrawal_requests terk edildi.

CREATE OR REPLACE FUNCTION public.admin_dashboard_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT jsonb_build_object(
    'total_users',        (SELECT COUNT(*)::int FROM public.profiles),
    'total_pitches',      (SELECT COUNT(*)::int FROM public.pitches),
    'total_matches',      (SELECT COUNT(*)::int FROM public.matches),
    'total_communities',  (SELECT COUNT(*)::int FROM public.communities),
    'pending_verifications', (SELECT COUNT(*)::int FROM public.profiles WHERE verification_status = 'pending'),
    'pending_pitches',    (SELECT COUNT(*)::int FROM public.pitches WHERE verification_status = 'pending'),
    'pending_withdrawals',(SELECT COUNT(*)::int FROM public.payout_requests WHERE status = 'PENDING'),
    'open_disputes',      (SELECT COUNT(*)::int FROM public.match_disputes WHERE status IN ('OPEN','UNDER_REVIEW')),
    'deletion_requests',  (SELECT COUNT(*)::int FROM public.profiles WHERE account_deletion_requested_at IS NOT NULL),
    'pending_community_requests', (SELECT COUNT(*)::int FROM public.community_creation_requests WHERE status = 'PENDING'),
    'banned_users',       (SELECT COUNT(*)::int FROM public.profiles WHERE is_banned = true),
    'active_goalkeepers', (SELECT COUNT(*)::int FROM public.goalkeepers),
    'active_referees',    (SELECT COUNT(*)::int FROM public.referees),
    'total_booking_revenue', COALESCE((SELECT SUM(amount) FROM public.booking_payments), 0),
    'total_wallet_volume', COALESCE((SELECT SUM(ABS(amount)) FROM public.wallet_transactions), 0),
    'active_promo_codes', (SELECT COUNT(*)::int FROM public.promo_codes WHERE is_active = true),
    'commission_rate',    (SELECT "commissionRate" FROM public.settings WHERE id = 'main')
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_ops_queue()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        'id', id, 'amount', amount, 'owner_id', user_id, 'created_at', created_at
      )), '[]'::jsonb)
      FROM public.payout_requests
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
$function$;
