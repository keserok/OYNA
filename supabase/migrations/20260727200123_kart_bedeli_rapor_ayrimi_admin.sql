-- ÜRETİMDEN GERİ ÇEKİLDİ (defter sapması onarımı, 2026-07-28)
-- Kart işlem bedeli: admin finans raporlarında brüt ciro ile kart bedeli ayrışır
CREATE OR REPLACE FUNCTION public.admin_finance_report(p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE v_days jsonb; v_totals jsonb; v_cashout jsonb; v_payouts numeric;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN RAISE EXCEPTION 'INVALID_RANGE: Bitiş başlangıçtan önce olamaz.'; END IF;
  IF (p_to - p_from) > 366 THEN RAISE EXCEPTION 'RANGE_TOO_LARGE: En fazla 366 günlük aralık.'; END IF;
  WITH days AS (SELECT generate_series(p_from, p_to, interval '1 day')::date AS day),
  pi AS (SELECT created_at::date d,
                SUM(amount - COALESCE(card_fee_amount,0)) gross,
                SUM(COALESCE(card_fee_amount,0)) card_fees,
                SUM(commission_amount) comm, SUM(owner_amount) owner_s, count(*) cnt
         FROM public.payment_intents WHERE status IN ('CAPTURED','PAID') AND created_at::date BETWEEN p_from AND p_to GROUP BY 1),
  rf AS (SELECT created_at::date d, SUM(amount - COALESCE(card_fee_amount,0)) refunded
         FROM public.payment_intents WHERE status='REFUNDED' AND created_at::date BETWEEN p_from AND p_to GROUP BY 1),
  tp AS (SELECT created_at::date d, SUM(amount) topups FROM public.wallet_transactions WHERE type='TOP_UP' AND status='COMPLETED' AND created_at::date BETWEEN p_from AND p_to GROUP BY 1)
  SELECT jsonb_agg(jsonb_build_object('day', day, 'gross', COALESCE(pi.gross,0), 'commission', COALESCE(pi.comm,0),
    'owner_share', COALESCE(pi.owner_s,0), 'card_fees', COALESCE(pi.card_fees,0),
    'refunded', COALESCE(rf.refunded,0), 'topups', COALESCE(tp.topups,0), 'count', COALESCE(pi.cnt,0)) ORDER BY day)
  INTO v_days FROM days LEFT JOIN pi ON pi.d=day LEFT JOIN rf ON rf.d=day LEFT JOIN tp ON tp.d=day;
  SELECT jsonb_build_object('gross_captured', COALESCE(SUM(amount - COALESCE(card_fee_amount,0)) FILTER (WHERE status IN ('CAPTURED','PAID')),0),
    'commission', COALESCE(SUM(commission_amount) FILTER (WHERE status IN ('CAPTURED','PAID')),0),
    'owner_share', COALESCE(SUM(owner_amount) FILTER (WHERE status IN ('CAPTURED','PAID')),0),
    'card_fees', COALESCE(SUM(COALESCE(card_fee_amount,0)) FILTER (WHERE status IN ('CAPTURED','PAID')),0),
    'refunded', COALESCE(SUM(amount - COALESCE(card_fee_amount,0)) FILTER (WHERE status='REFUNDED'),0),
    'count', COALESCE(COUNT(*) FILTER (WHERE status IN ('CAPTURED','PAID')),0)::int)
  INTO v_totals FROM public.payment_intents WHERE created_at::date BETWEEN p_from AND p_to;
  SELECT jsonb_build_object('net', COALESCE(SUM(net_amount),0), 'fee', COALESCE(SUM(fee_amount),0), 'count', COUNT(*)::int)
  INTO v_cashout FROM public.payout_requests WHERE payout_type='WALLET_CASHOUT' AND created_at::date BETWEEN p_from AND p_to;
  SELECT COALESCE(SUM(amount),0) INTO v_payouts FROM public.payout_requests WHERE status='COMPLETED' AND processed_at::date BETWEEN p_from AND p_to;
  RETURN jsonb_build_object('from', p_from, 'to', p_to, 'totals', v_totals,
    'topups', COALESCE((SELECT SUM(amount) FROM public.wallet_transactions WHERE type='TOP_UP' AND status='COMPLETED' AND created_at::date BETWEEN p_from AND p_to),0),
    'cashouts', v_cashout, 'payouts_completed', v_payouts, 'days', COALESCE(v_days, '[]'::jsonb));
END; $fn$;

CREATE OR REPLACE FUNCTION public.admin_reconciliation_summary(
  p_from timestamptz DEFAULT (now() - '30 days'::interval),
  p_to timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE v_out jsonb;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT jsonb_build_object(
    'from', p_from, 'to', p_to,
    'captured_count',  (SELECT COUNT(*) FROM public.payment_intents WHERE status IN ('CAPTURED','PAID') AND created_at BETWEEN p_from AND p_to),
    'gross_captured',  COALESCE((SELECT SUM(amount - COALESCE(card_fee_amount,0)) FROM public.payment_intents WHERE status IN ('CAPTURED','PAID') AND created_at BETWEEN p_from AND p_to), 0),
    'card_fees',       COALESCE((SELECT SUM(COALESCE(card_fee_amount,0)) FROM public.payment_intents WHERE status IN ('CAPTURED','PAID') AND created_at BETWEEN p_from AND p_to), 0),
    'charged_total',   COALESCE((SELECT SUM(amount) FROM public.payment_intents WHERE status IN ('CAPTURED','PAID') AND created_at BETWEEN p_from AND p_to), 0),
    'total_commission',COALESCE((SELECT SUM(commission_amount) FROM public.payment_intents WHERE status IN ('CAPTURED','PAID') AND created_at BETWEEN p_from AND p_to), 0),
    'owner_share',     COALESCE((SELECT SUM(owner_amount) FROM public.payment_intents WHERE status IN ('CAPTURED','PAID') AND created_at BETWEEN p_from AND p_to), 0),
    'refunded_count',  (SELECT COUNT(*) FROM public.payment_intents WHERE status = 'REFUNDED' AND created_at BETWEEN p_from AND p_to),
    'refunded_sum',    COALESCE((SELECT SUM(amount) FROM public.payment_intents WHERE status = 'REFUNDED' AND created_at BETWEEN p_from AND p_to), 0),
    'booking_payments',COALESCE((SELECT SUM(amount) FROM public.booking_payments WHERE created_at BETWEEN p_from AND p_to), 0),
    'wallet_pending',  COALESCE((SELECT SUM(amount) FROM public.wallet_transactions WHERE status = 'PENDING' AND created_at BETWEEN p_from AND p_to), 0),
    'wallet_completed',COALESCE((SELECT SUM(amount) FROM public.wallet_transactions WHERE status = 'COMPLETED' AND created_at BETWEEN p_from AND p_to), 0),
    'payout_requested',COALESCE((SELECT SUM(amount) FROM public.payout_requests WHERE status = 'PENDING' AND created_at BETWEEN p_from AND p_to), 0),
    'payout_completed',COALESCE((SELECT SUM(amount) FROM public.payout_requests WHERE status = 'COMPLETED' AND created_at BETWEEN p_from AND p_to), 0)
  ) INTO v_out;
  RETURN v_out;
END;
$fn$;
