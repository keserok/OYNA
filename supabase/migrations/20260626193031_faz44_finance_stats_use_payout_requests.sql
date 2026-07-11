-- FAZ 4.4 birleştirme: admin "Bekleyen Çekim" istatistiği artık tek kaynaktan
-- (payout_requests) okunur; eski owner_withdrawal_requests terk edildi.
-- Owner panel request_payout ile payout_requests'e yazıyor; admin tarafı da
-- artık aynı tabloyu görüyor (tek kaynak / SSOT).
CREATE OR REPLACE FUNCTION public.admin_finance_stats(p_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_since timestamptz := NOW() - (p_days || ' days')::interval;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  RETURN jsonb_build_object(
    'booking_revenue',    COALESCE((SELECT SUM(amount) FROM booking_payments WHERE created_at >= v_since), 0),
    'wallet_credits',     COALESCE((SELECT SUM(amount) FROM wallet_transactions WHERE amount > 0 AND created_at >= v_since), 0),
    'wallet_debits',      COALESCE((SELECT SUM(ABS(amount)) FROM wallet_transactions WHERE amount < 0 AND created_at >= v_since), 0),
    'withdrawal_pending', COALESCE((SELECT SUM(amount) FROM payout_requests WHERE status = 'PENDING'), 0),
    'payment_count',      (SELECT COUNT(*)::int FROM booking_payments WHERE created_at >= v_since)
  );
END; $function$;
