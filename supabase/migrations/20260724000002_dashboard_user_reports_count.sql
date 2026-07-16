-- =============================================================================
-- Migration: admin_dashboard_stats'a açık kullanıcı şikayeti sayısı ekle
--   → sidebar "Şikayetler" (USER_REPORTS) canlı rozeti bu sayaçtan beslenir.
-- =============================================================================
-- ⚠️ Gövde CANLI admin_dashboard_stats (prod) okunarak yeniden tanımlandı; canlı
--    tüm anahtarlar (open_support_tickets, open_owner_messages, sayım semantiği)
--    KORUNDU, yalnız 'open_user_reports' eklendi. İmza/dönüş tipi birebir aynı.
-- =============================================================================

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
    'open_user_reports',  (SELECT COUNT(*)::int FROM public.user_reports WHERE status = 'OPEN'),
    'deletion_requests',  (SELECT COUNT(*)::int FROM public.profiles WHERE account_deletion_requested_at IS NOT NULL),
    'pending_community_requests', (SELECT COUNT(*)::int FROM public.community_creation_requests WHERE status = 'PENDING'),
    'banned_users',       (SELECT COUNT(*)::int FROM public.profiles WHERE is_banned = true),
    'active_goalkeepers', (SELECT COUNT(*)::int FROM public.goalkeepers),
    'active_referees',    (SELECT COUNT(*)::int FROM public.referees),
    'total_booking_revenue', COALESCE((SELECT SUM(amount) FROM public.booking_payments), 0),
    'total_wallet_volume', COALESCE((SELECT SUM(ABS(amount)) FROM public.wallet_transactions), 0),
    'active_promo_codes', (SELECT COUNT(*)::int FROM public.promo_codes WHERE is_active = true),
    'open_support_tickets', (SELECT COUNT(*)::int FROM public.support_tickets WHERE channel = 'PLAYER' AND status IN ('OPEN','PENDING')),
    'open_owner_messages',  (SELECT COUNT(*)::int FROM public.support_tickets WHERE channel = 'OWNER'  AND status IN ('OPEN','PENDING')),
    'commission_rate',    (SELECT "commissionRate" FROM public.settings WHERE id = 'main')
  ) INTO v_result;

  RETURN v_result;
END;
$function$;
