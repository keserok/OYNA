-- ÜRETİMDEN GERİ ÇEKİLDİ (defter sapması onarımı, 2026-07-28)
-- Tesis sahibi finans raporu: kart işlem bedeli ciroya karışmasın diye ayrı
-- kalem olarak raporlanır (gross = amount - card_fee_amount).
CREATE OR REPLACE FUNCTION public.owner_finance_report(p_pitch_id uuid, p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE v_owner uuid; v_days jsonb; v_totals jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT owner_id INTO v_owner FROM public.pitches WHERE id = p_pitch_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Saha bulunamadı.'; END IF;
  IF v_owner IS DISTINCT FROM auth.uid() AND NOT public.is_platform_admin() THEN RAISE EXCEPTION 'FORBIDDEN: Yalnız kendi sahanın raporunu görebilirsin.'; END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN RAISE EXCEPTION 'INVALID_RANGE'; END IF;
  IF (p_to - p_from) > 366 THEN RAISE EXCEPTION 'RANGE_TOO_LARGE'; END IF;
  WITH days AS (SELECT generate_series(p_from, p_to, interval '1 day')::date AS day),
  pi AS (SELECT created_at::date d,
                SUM(amount - COALESCE(card_fee_amount,0)) gross,
                SUM(COALESCE(card_fee_amount,0)) card_fees,
                SUM(commission_amount) comm, SUM(owner_amount) owner_s, count(*) cnt
         FROM public.payment_intents WHERE pitch_id = p_pitch_id AND status IN ('CAPTURED','PAID') AND created_at::date BETWEEN p_from AND p_to GROUP BY 1),
  rf AS (SELECT created_at::date d, SUM(amount - COALESCE(card_fee_amount,0)) refunded
         FROM public.payment_intents WHERE pitch_id = p_pitch_id AND status='REFUNDED' AND created_at::date BETWEEN p_from AND p_to GROUP BY 1)
  SELECT jsonb_agg(jsonb_build_object('day', day, 'gross', COALESCE(pi.gross,0), 'commission', COALESCE(pi.comm,0),
    'owner_net', COALESCE(pi.owner_s,0), 'card_fees', COALESCE(pi.card_fees,0),
    'refunded', COALESCE(rf.refunded,0), 'count', COALESCE(pi.cnt,0)) ORDER BY day)
  INTO v_days FROM days LEFT JOIN pi ON pi.d=day LEFT JOIN rf ON rf.d=day;
  SELECT jsonb_build_object('gross_captured', COALESCE(SUM(amount - COALESCE(card_fee_amount,0)) FILTER (WHERE status IN ('CAPTURED','PAID')),0),
    'commission', COALESCE(SUM(commission_amount) FILTER (WHERE status IN ('CAPTURED','PAID')),0),
    'owner_net', COALESCE(SUM(owner_amount) FILTER (WHERE status IN ('CAPTURED','PAID')),0),
    'card_fees', COALESCE(SUM(COALESCE(card_fee_amount,0)) FILTER (WHERE status IN ('CAPTURED','PAID')),0),
    'refunded', COALESCE(SUM(amount - COALESCE(card_fee_amount,0)) FILTER (WHERE status='REFUNDED'),0),
    'count', COALESCE(COUNT(*) FILTER (WHERE status IN ('CAPTURED','PAID')),0)::int)
  INTO v_totals FROM public.payment_intents WHERE pitch_id = p_pitch_id AND created_at::date BETWEEN p_from AND p_to;
  RETURN jsonb_build_object('pitch_id', p_pitch_id, 'from', p_from, 'to', p_to, 'totals', v_totals, 'days', COALESCE(v_days, '[]'::jsonb));
END; $fn$;
