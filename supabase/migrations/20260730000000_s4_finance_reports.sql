-- ════════════════════════════════════════════════════════════════════════════
-- [S4] FİNANS RAPORLARI — tarih aralığı + GÜN KIRILIMI (CSV FE'de üretilir)
-- ────────────────────────────────────────────────────────────────────────────
-- Kullanıcı: "tüm ödemelerin seçilen tarih aralıklarında VE günlerde analiz
-- edilebilmesi. Tam profesyonellik." → admin (tüm platform) + owner (kendi sahası)
-- için tarih aralıklı, gün-gün kırılımlı finans raporu. FE tabloyu gösterir +
-- CSV indirir.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── admin_finance_report — tüm platform, tarih aralığı + gün kırılımı ───────
CREATE OR REPLACE FUNCTION public.admin_finance_report(p_from date, p_to date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE v_days jsonb; v_totals jsonb; v_cashout jsonb; v_payouts numeric;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN RAISE EXCEPTION 'INVALID_RANGE: Bitiş başlangıçtan önce olamaz.'; END IF;
  IF (p_to - p_from) > 366 THEN RAISE EXCEPTION 'RANGE_TOO_LARGE: En fazla 366 günlük aralık.'; END IF;

  WITH days AS (SELECT generate_series(p_from, p_to, interval '1 day')::date AS day),
  pi AS (SELECT created_at::date d, SUM(amount) gross, SUM(commission_amount) comm, SUM(owner_amount) owner_s, count(*) cnt
         FROM public.payment_intents WHERE status IN ('CAPTURED','PAID') AND created_at::date BETWEEN p_from AND p_to GROUP BY 1),
  rf AS (SELECT created_at::date d, SUM(amount) refunded FROM public.payment_intents WHERE status='REFUNDED' AND created_at::date BETWEEN p_from AND p_to GROUP BY 1),
  tp AS (SELECT created_at::date d, SUM(amount) topups FROM public.wallet_transactions WHERE type='TOP_UP' AND status='COMPLETED' AND created_at::date BETWEEN p_from AND p_to GROUP BY 1)
  SELECT jsonb_agg(jsonb_build_object(
    'day', day, 'gross', COALESCE(pi.gross,0), 'commission', COALESCE(pi.comm,0),
    'owner_share', COALESCE(pi.owner_s,0), 'refunded', COALESCE(rf.refunded,0),
    'topups', COALESCE(tp.topups,0), 'count', COALESCE(pi.cnt,0)) ORDER BY day)
  INTO v_days
  FROM days LEFT JOIN pi ON pi.d=day LEFT JOIN rf ON rf.d=day LEFT JOIN tp ON tp.d=day;

  SELECT jsonb_build_object(
    'gross_captured', COALESCE(SUM(amount) FILTER (WHERE status IN ('CAPTURED','PAID')),0),
    'commission',     COALESCE(SUM(commission_amount) FILTER (WHERE status IN ('CAPTURED','PAID')),0),
    'owner_share',    COALESCE(SUM(owner_amount) FILTER (WHERE status IN ('CAPTURED','PAID')),0),
    'refunded',       COALESCE(SUM(amount) FILTER (WHERE status='REFUNDED'),0),
    'count',          COALESCE(COUNT(*) FILTER (WHERE status IN ('CAPTURED','PAID')),0)::int
  ) INTO v_totals FROM public.payment_intents WHERE created_at::date BETWEEN p_from AND p_to;

  SELECT jsonb_build_object('net', COALESCE(SUM(net_amount),0), 'fee', COALESCE(SUM(fee_amount),0), 'count', COUNT(*)::int)
  INTO v_cashout FROM public.payout_requests WHERE payout_type='WALLET_CASHOUT' AND created_at::date BETWEEN p_from AND p_to;

  SELECT COALESCE(SUM(amount),0) INTO v_payouts FROM public.payout_requests WHERE status='COMPLETED' AND processed_at::date BETWEEN p_from AND p_to;

  RETURN jsonb_build_object('from', p_from, 'to', p_to, 'totals', v_totals,
    'topups', COALESCE((SELECT SUM(amount) FROM public.wallet_transactions WHERE type='TOP_UP' AND status='COMPLETED' AND created_at::date BETWEEN p_from AND p_to),0),
    'cashouts', v_cashout, 'payouts_completed', v_payouts,
    'days', COALESCE(v_days, '[]'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_finance_report(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_finance_report(date, date) TO authenticated;

-- ─── owner_finance_report — kendi sahası, tarih aralığı + gün kırılımı ───────
CREATE OR REPLACE FUNCTION public.owner_finance_report(p_pitch_id uuid, p_from date, p_to date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
DECLARE v_owner uuid; v_days jsonb; v_totals jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT owner_id INTO v_owner FROM public.pitches WHERE id = p_pitch_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Saha bulunamadı.'; END IF;
  IF v_owner IS DISTINCT FROM auth.uid() AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Yalnız kendi sahanın raporunu görebilirsin.';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN RAISE EXCEPTION 'INVALID_RANGE'; END IF;
  IF (p_to - p_from) > 366 THEN RAISE EXCEPTION 'RANGE_TOO_LARGE'; END IF;

  WITH days AS (SELECT generate_series(p_from, p_to, interval '1 day')::date AS day),
  pi AS (SELECT created_at::date d, SUM(amount) gross, SUM(commission_amount) comm, SUM(owner_amount) owner_s, count(*) cnt
         FROM public.payment_intents WHERE pitch_id = p_pitch_id AND status IN ('CAPTURED','PAID') AND created_at::date BETWEEN p_from AND p_to GROUP BY 1),
  rf AS (SELECT created_at::date d, SUM(amount) refunded FROM public.payment_intents WHERE pitch_id = p_pitch_id AND status='REFUNDED' AND created_at::date BETWEEN p_from AND p_to GROUP BY 1)
  SELECT jsonb_agg(jsonb_build_object(
    'day', day, 'gross', COALESCE(pi.gross,0), 'commission', COALESCE(pi.comm,0),
    'owner_net', COALESCE(pi.owner_s,0), 'refunded', COALESCE(rf.refunded,0), 'count', COALESCE(pi.cnt,0)) ORDER BY day)
  INTO v_days FROM days LEFT JOIN pi ON pi.d=day LEFT JOIN rf ON rf.d=day;

  SELECT jsonb_build_object(
    'gross_captured', COALESCE(SUM(amount) FILTER (WHERE status IN ('CAPTURED','PAID')),0),
    'commission',     COALESCE(SUM(commission_amount) FILTER (WHERE status IN ('CAPTURED','PAID')),0),
    'owner_net',      COALESCE(SUM(owner_amount) FILTER (WHERE status IN ('CAPTURED','PAID')),0),
    'refunded',       COALESCE(SUM(amount) FILTER (WHERE status='REFUNDED'),0),
    'count',          COALESCE(COUNT(*) FILTER (WHERE status IN ('CAPTURED','PAID')),0)::int
  ) INTO v_totals FROM public.payment_intents WHERE pitch_id = p_pitch_id AND created_at::date BETWEEN p_from AND p_to;

  RETURN jsonb_build_object('pitch_id', p_pitch_id, 'from', p_from, 'to', p_to,
    'totals', v_totals, 'days', COALESCE(v_days, '[]'::jsonb));
END;
$$;
REVOKE ALL ON FUNCTION public.owner_finance_report(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_finance_report(uuid, date, date) TO authenticated;
