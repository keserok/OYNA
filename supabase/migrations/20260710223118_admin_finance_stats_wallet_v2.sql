-- [DB GEÇMİŞİNDEN KURTARILDI 2026-07-11] Bu migration canlı veritabanına uygulanmıştı ancak repoda dosyası yoktu; supabase_migrations.schema_migrations.statements kolonundan geri çıkarıldı.

-- CÜZDAN V2 (ek) — admin_finance_stats giriş/çıkış sınıflandırması tip bazlı.
-- (repo: 20260717000004_admin_finance_stats_wallet_v2.sql)
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
    'wallet_credits',     COALESCE((SELECT SUM(ABS(amount)) FROM wallet_transactions
                             WHERE created_at >= v_since
                               AND status <> 'CANCELLED'
                               AND (type IN ('TOP_UP','DEPOSIT','REFUND','MATCH_REFUND','MATCH_EARNING','BOOKING_EARNING','SERVICE_EARNING','REFERRAL_BONUS')
                                    OR (type NOT IN ('WALLET_PAYMENT','WITHDRAWAL','MATCH_FEE') AND amount > 0))), 0),
    'wallet_debits',      COALESCE((SELECT SUM(ABS(amount)) FROM wallet_transactions
                             WHERE created_at >= v_since
                               AND status <> 'CANCELLED'
                               AND (type IN ('WALLET_PAYMENT','WITHDRAWAL','MATCH_FEE')
                                    OR (type NOT IN ('TOP_UP','DEPOSIT','REFUND','MATCH_REFUND','MATCH_EARNING','BOOKING_EARNING','SERVICE_EARNING','REFERRAL_BONUS') AND amount < 0))), 0),
    'withdrawal_pending', COALESCE((SELECT SUM(amount) FROM payout_requests WHERE status = 'PENDING'), 0),
    'payment_count',      (SELECT COUNT(*)::int FROM booking_payments WHERE created_at >= v_since)
  );
END; $function$;
