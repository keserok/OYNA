-- ─── FI-2 — Veresiye hareket defteri (v2) + rezervasyon→veresiye köprüsü ──────
-- pitch_debtors artık TEK sayı değil: pitch_debtor_entries defterinden hesaplanan
-- bakiye. DEBT (borç) ve PAYMENT (ödeme) hareketleri → amount_owed = ΣDEBT−ΣPAYMENT.
-- Kısmi ödeme, hareket geçmişi ve rezervasyon-bağı (çift-saymı önler) buradan.

CREATE TABLE IF NOT EXISTS public.pitch_debtor_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debtor_id uuid NOT NULL REFERENCES public.pitch_debtors(id) ON DELETE CASCADE,
  pitch_id uuid NOT NULL REFERENCES public.pitches(id) ON DELETE CASCADE,
  entry_type text NOT NULL CHECK (entry_type IN ('DEBT', 'PAYMENT')),
  amount numeric NOT NULL CHECK (amount > 0),
  payment_method text,
  note text,
  booking_id uuid REFERENCES public.pitch_bookings(id) ON DELETE SET NULL,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_debtor_entries_debtor ON public.pitch_debtor_entries(debtor_id);
-- Bir rezervasyon en fazla bir kez borç olarak yazılabilir (çift-yazım engeli).
CREATE UNIQUE INDEX IF NOT EXISTS uq_debtor_entries_booking_debt
  ON public.pitch_debtor_entries(booking_id) WHERE entry_type = 'DEBT' AND booking_id IS NOT NULL;

ALTER TABLE public.pitch_debtor_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS debtor_entries_manage ON public.pitch_debtor_entries;
CREATE POLICY debtor_entries_manage ON public.pitch_debtor_entries FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.pitches p WHERE p.id = pitch_debtor_entries.pitch_id
            AND ((p.owner_id = (SELECT auth.uid())) OR (p.is_demo AND has_role('OWNER')))) OR is_admin()
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.pitches p WHERE p.id = pitch_debtor_entries.pitch_id
            AND ((p.owner_id = (SELECT auth.uid())) OR (p.is_demo AND has_role('OWNER')))) OR is_admin()
  );

-- Defter değişince pitch_debtors.amount_owed + is_resolved yeniden hesaplanır.
CREATE OR REPLACE FUNCTION public.recompute_debtor_balance() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE
  v_debtor uuid := COALESCE(NEW.debtor_id, OLD.debtor_id);
  v_bal numeric;
BEGIN
  SELECT COALESCE(SUM(CASE WHEN entry_type = 'DEBT' THEN amount ELSE -amount END), 0)
    INTO v_bal FROM public.pitch_debtor_entries WHERE debtor_id = v_debtor;
  UPDATE public.pitch_debtors
    SET amount_owed = GREATEST(v_bal, 0),
        is_resolved = (v_bal <= 0)
    WHERE id = v_debtor;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_recompute_debtor_balance ON public.pitch_debtor_entries;
CREATE TRIGGER trg_recompute_debtor_balance
  AFTER INSERT OR UPDATE OR DELETE ON public.pitch_debtor_entries
  FOR EACH ROW EXECUTE FUNCTION public.recompute_debtor_balance();

-- Mevcut açık veresiyelere açılış borcu (defter tek kaynak olsun). Prod'da 0 kayıt.
INSERT INTO public.pitch_debtor_entries (debtor_id, pitch_id, entry_type, amount, note, created_at)
SELECT d.id, d.pitch_id, 'DEBT', d.amount_owed, 'Açılış bakiyesi', COALESCE(d.created_at, now())
FROM public.pitch_debtors d
WHERE d.is_resolved IS NOT TRUE AND COALESCE(d.amount_owed, 0) > 0
  AND NOT EXISTS (SELECT 1 FROM public.pitch_debtor_entries e WHERE e.debtor_id = d.id);

-- ── RPC: yeni veresiye (kişi + açılış borcu) ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.debtor_create(
  p_pitch_id uuid, p_name text, p_phone text, p_amount numeric, p_note text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE v_uid uuid := auth.uid(); v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM public.pitches p WHERE p.id = p_pitch_id AND p.owner_id = v_uid) OR is_admin()) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: bu tesise erisim yok.';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;
  IF COALESCE(trim(p_name), '') = '' THEN RAISE EXCEPTION 'INVALID_NAME'; END IF;

  INSERT INTO public.pitch_debtors (pitch_id, name, phone, amount_owed, is_resolved, is_demo)
  VALUES (p_pitch_id, trim(p_name), NULLIF(trim(p_phone), ''), 0, false, false)
  RETURNING id INTO v_id;

  INSERT INTO public.pitch_debtor_entries (debtor_id, pitch_id, entry_type, amount, note)
  VALUES (v_id, p_pitch_id, 'DEBT', p_amount, p_note);

  RETURN v_id;
END;
$function$;

-- ── RPC: kısmi/tam ödeme al ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.debtor_add_payment(
  p_debtor_id uuid, p_amount numeric, p_method text DEFAULT 'CASH', p_note text DEFAULT NULL
) RETURNS numeric
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE v_uid uuid := auth.uid(); v_pitch uuid; v_bal numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT d.pitch_id, GREATEST(COALESCE(d.amount_owed, 0), 0) INTO v_pitch, v_bal
  FROM public.pitch_debtors d WHERE d.id = p_debtor_id;
  IF v_pitch IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM public.pitches p WHERE p.id = v_pitch AND p.owner_id = v_uid) OR is_admin()) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: bu tesise erisim yok.';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;
  IF p_amount > v_bal + 0.001 THEN RAISE EXCEPTION 'OVER_PAYMENT: bakiyeden fazla ödeme alınamaz.'; END IF;

  INSERT INTO public.pitch_debtor_entries (debtor_id, pitch_id, entry_type, amount, payment_method, note)
  VALUES (p_debtor_id, v_pitch, 'PAYMENT', p_amount, p_method, p_note);

  SELECT GREATEST(COALESCE(amount_owed, 0), 0) INTO v_bal FROM public.pitch_debtors WHERE id = p_debtor_id;
  RETURN v_bal;
END;
$function$;

-- ── RPC: bekleyen rezervasyon bakiyesini veresiyeye taşı ─────────────────────
-- Telefonla eşleşen açık veresiye varsa ona ekler; yoksa yeni kişi açar.
-- Rezervasyon-bağı sayesinde çift-yazım (unique index) ve çift-saymı (RPC pending
-- bu bağı hariç tutar) engellenir.
CREATE OR REPLACE FUNCTION public.booking_to_debtor(
  p_booking_id uuid, p_name text DEFAULT NULL, p_phone text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE
  v_uid uuid := auth.uid(); v_pitch uuid; v_bal numeric;
  v_cust text; v_phone text; v_debtor uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT b.pitch_id, GREATEST(COALESCE(b.price, 0) - COALESCE(b.paid_amount, 0), 0),
         b.customer_name, b.customer_phone
    INTO v_pitch, v_bal, v_cust, v_phone
  FROM public.pitch_bookings b WHERE b.id = p_booking_id;
  IF v_pitch IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF NOT (EXISTS (SELECT 1 FROM public.pitches p WHERE p.id = v_pitch AND p.owner_id = v_uid) OR is_admin()) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: bu tesise erisim yok.';
  END IF;
  IF v_bal <= 0 THEN RAISE EXCEPTION 'NO_BALANCE: rezervasyonda bekleyen tutar yok.'; END IF;

  v_cust := COALESCE(NULLIF(trim(p_name), ''), NULLIF(trim(v_cust), ''), 'Müşteri');
  v_phone := COALESCE(NULLIF(trim(p_phone), ''), NULLIF(trim(v_phone), ''));

  IF v_phone IS NOT NULL THEN
    SELECT id INTO v_debtor FROM public.pitch_debtors
    WHERE pitch_id = v_pitch AND phone = v_phone AND is_resolved IS NOT TRUE
    ORDER BY created_at DESC LIMIT 1;
  END IF;
  IF v_debtor IS NULL THEN
    INSERT INTO public.pitch_debtors (pitch_id, name, phone, amount_owed, is_resolved, is_demo)
    VALUES (v_pitch, v_cust, v_phone, 0, false, false) RETURNING id INTO v_debtor;
  END IF;

  INSERT INTO public.pitch_debtor_entries (debtor_id, pitch_id, entry_type, amount, note, booking_id)
  VALUES (v_debtor, v_pitch, 'DEBT', v_bal, 'Rezervasyon bakiyesi', p_booking_id);

  RETURN v_debtor;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.debtor_create(uuid, text, text, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.debtor_add_payment(uuid, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.booking_to_debtor(uuid, text, text) TO authenticated;

-- get_pitch_finance_summary: veresiyeye taşınmış rezervasyonları BEKLEYEN'den düş.
-- Bir rezervasyon booking_to_debtor ile deftere yazılınca (DEBT + booking_id),
-- artık "bekleyen tahsilat" değil "veresiye" olarak izlenir → çift-saymı biter.
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
           COALESCE(b.price, 0) AS price, COALESCE(b.paid_amount, 0) AS paid,
           EXISTS (SELECT 1 FROM public.pitch_debtor_entries de
                   WHERE de.booking_id = b.id AND de.entry_type = 'DEBT') AS in_debt
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
      'pending_total',   (SELECT COALESCE(SUM(GREATEST(price - paid, 0)), 0) FROM pb WHERE NOT in_debt),
      'by_method', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object('method', method, 'amount', amount, 'count', cnt) ORDER BY amount DESC), '[]'::jsonb)
        FROM (
          SELECT method, SUM(amount) AS amount, count(*) AS cnt FROM pay GROUP BY method
          UNION ALL
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
        FROM pb WHERE price - paid > 0 AND NOT in_debt
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
