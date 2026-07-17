-- ─── FI-1 — Tek kaynak finans özeti RPC'si ───────────────────────────────────
-- get_pitch_finance_summary(pitch, 'YYYY-MM') → dönemin tüm finans özeti tek çağrıda.
-- Yetki: owner-VEYA-admin (get_facility_schedule kalıbı). Böylece admin paneli de
-- aynı RPC'yle bir tesisin finansını salt-okuma gözetler (OW-E "admin bağlantısı").
--
-- Para dürüstlüğü:
--   • collected_total = Σ paid_amount (owner'ın gördüğü tahsilat; tarihsel hero kaynağı)
--   • by_method       = booking_payments kırılımı + "UNSPECIFIED" kova = collected − Σpayments
--     → yöntemler DAİMA collected_total'a toplanır; hiçbir para gizlenmez.
--   • mismatch_count  = paid_amount ≠ Σpayments olan rezervasyon sayısı (denetim sayacı).
-- Dönem GÜN (booking_date) bazlı — mevcut haftalık/aylık mantıkla tutarlı.

CREATE OR REPLACE FUNCTION public.get_pitch_finance_summary(p_pitch_id uuid, p_month text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_owner boolean;
  v_start date;
  v_end date;
  v_prev_start date;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_month IS NULL OR p_month !~ '^\d{4}-\d{2}$'
     OR substring(p_month, 6, 2)::int NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION 'INVALID_MONTH: YYYY-MM (ay 01-12) bekleniyor.';
  END IF;
  v_start := to_date(p_month || '-01', 'YYYY-MM-DD');
  v_end := (v_start + interval '1 month')::date;
  v_prev_start := (v_start - interval '1 month')::date;

  SELECT EXISTS(SELECT 1 FROM public.pitches WHERE id = p_pitch_id AND owner_id = v_uid)
    INTO v_is_owner;
  IF NOT (v_is_owner OR public.is_admin()) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: bu tesise erisim yok.';
  END IF;

  WITH pb AS (
    SELECT b.id, b.booking_date, b.start_time, b.court_id, b.source, b.customer_name,
           COALESCE(b.price, 0) AS price, COALESCE(b.paid_amount, 0) AS paid
    FROM public.pitch_bookings b
    WHERE b.pitch_id = p_pitch_id
      AND b.booking_date >= v_start AND b.booking_date < v_end
      AND b.status <> 'CANCELLED'
  ),
  pay AS (
    SELECT bp.id, COALESCE(bp.amount, 0) AS amount, COALESCE(bp.payment_method, 'CASH') AS method,
           bp.created_at, bp.booking_id
    FROM public.booking_payments bp
    JOIN pb ON pb.id = bp.booking_id
  ),
  paysum AS (
    SELECT booking_id, SUM(amount) AS psum FROM pay GROUP BY booking_id
  )
  SELECT jsonb_build_object(
    'period', jsonb_build_object('month', p_month, 'start', v_start, 'end', (v_end - 1)),
    'income', jsonb_build_object(
      'collected_total', (SELECT COALESCE(SUM(paid), 0) FROM pb),
      'billed_total',    (SELECT COALESCE(SUM(price), 0) FROM pb),
      'pending_total',   (SELECT COALESCE(SUM(GREATEST(price - paid, 0)), 0) FROM pb),
      'by_method', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('method', method, 'amount', amount, 'count', cnt) ORDER BY amount DESC), '[]'::jsonb)
        FROM (
          SELECT method, SUM(amount) AS amount, count(*) AS cnt FROM pay GROUP BY method
          UNION ALL
          -- Atfedilmemiş = REZERVASYON BAZINDA paid − Σ(o rezervasyonun ödemeleri), pozitif kısım.
          -- Global netleme yerine per-booking: bir rezervasyonun fazla-kaydı, diğerinin
          -- gerçek atfedilmemiş parasını gizlemez.
          SELECT 'UNSPECIFIED', v_un.amt, 0
          FROM (
            SELECT COALESCE(SUM(GREATEST(pb.paid - COALESCE(ps.psum, 0), 0)), 0) AS amt
            FROM pb LEFT JOIN paysum ps ON ps.booking_id = pb.id
          ) v_un
          WHERE v_un.amt > 0
        ) m
      ),
      'by_source', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('source', source, 'amount', amount) ORDER BY amount DESC), '[]'::jsonb)
        FROM (SELECT source, SUM(paid) AS amount FROM pb GROUP BY source HAVING SUM(paid) > 0) s
      ),
      'daily', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('date', d, 'collected', amount) ORDER BY d), '[]'::jsonb)
        FROM (SELECT booking_date AS d, SUM(paid) AS amount FROM pb GROUP BY booking_date) dd
      ),
      'pending_bookings', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'id', id, 'date', booking_date, 'time', to_char(start_time, 'HH24:MI'),
          'court', (SELECT name FROM public.courts c WHERE c.id = pb.court_id),
          'customer_name', customer_name, 'price', price, 'paid', paid, 'balance', price - paid
        ) ORDER BY booking_date, start_time), '[]'::jsonb)
        FROM pb WHERE price - paid > 0
      ),
      'recent_payments', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'id', p.id, 'amount', p.amount, 'method', p.method, 'at', p.created_at,
          'customer_name', b.customer_name, 'booking_date', b.booking_date
        ) ORDER BY p.created_at DESC), '[]'::jsonb)
        FROM (SELECT * FROM pay ORDER BY created_at DESC LIMIT 20) p
        JOIN pb b ON b.id = p.booking_id
      ),
      'mismatch_count', (
        SELECT count(*) FROM pb LEFT JOIN paysum ON paysum.booking_id = pb.id
        WHERE pb.paid <> COALESCE(paysum.psum, 0)
      )
    ),
    'expenses', jsonb_build_object(
      'total', (SELECT COALESCE(SUM(amount), 0) FROM public.pitch_expenses e
                WHERE e.pitch_id = p_pitch_id AND e.expense_date >= v_start AND e.expense_date < v_end),
      'by_category', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('category', category, 'amount', amount, 'count', cnt) ORDER BY amount DESC), '[]'::jsonb)
        FROM (SELECT COALESCE(category, 'Diğer') AS category, SUM(amount) AS amount, count(*) AS cnt
              FROM public.pitch_expenses e
              WHERE e.pitch_id = p_pitch_id AND e.expense_date >= v_start AND e.expense_date < v_end
              GROUP BY COALESCE(category, 'Diğer')) c
      )
    ),
    'debt', jsonb_build_object(
      'open_total', (SELECT COALESCE(SUM(amount_owed), 0) FROM public.pitch_debtors d
                     WHERE d.pitch_id = p_pitch_id AND d.is_resolved IS NOT TRUE),
      'debtor_count', (SELECT count(*) FROM public.pitch_debtors d
                       WHERE d.pitch_id = p_pitch_id AND d.is_resolved IS NOT TRUE)
    ),
    'prev', jsonb_build_object(
      'collected_total', (SELECT COALESCE(SUM(paid_amount), 0) FROM public.pitch_bookings b
                          WHERE b.pitch_id = p_pitch_id AND b.booking_date >= v_prev_start
                            AND b.booking_date < v_start AND b.status <> 'CANCELLED'),
      'expense_total', (SELECT COALESCE(SUM(amount), 0) FROM public.pitch_expenses e
                        WHERE e.pitch_id = p_pitch_id AND e.expense_date >= v_prev_start AND e.expense_date < v_start)
    )
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_pitch_finance_summary(uuid, text) TO authenticated;
