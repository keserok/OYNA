-- ════════════════════════════════════════════════════════════════════════
-- STAFF-2b — YETKİ MATRİSİ (RPC yetkilendirme + denetimli personel RPC'leri)
-- ------------------------------------------------------------------------
-- Mevcut sahip-kapılı RPC'lerin yetki kapısı tek-kaynak yardımcılara devredilir:
--   • Yönetim (can_manage_pitch): finans özeti, rez. iptal, abonman.
--   • Kasa (can_staff_pitch): manuel rezervasyon, veresiye, takvim.
-- Personelin PARA/REZERVASYON YAZMASI yalnız denetimli RPC'lerden geçer;
-- recorded_by/cancelled_by sunucuda damgalanır (kimse başkası adına yazamaz).
-- Büyük gövdeler BİREBİR korunur — yalnız yetki satırı değişir.
-- ════════════════════════════════════════════════════════════════════════

-- ── İçerik yönetimi: müdür de düzenleyebilsin (sahip=müdür) ─────────────────
CREATE OR REPLACE FUNCTION public.can_manage_pitch_content(p_pitch_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ SELECT public.can_manage_pitch(p_pitch_id); $function$;

-- ── VERESİYE (kasa: can_staff) ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.debtor_create(p_pitch_id uuid, p_name text, p_phone text, p_amount numeric, p_note text DEFAULT NULL::text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF NOT public.can_staff_pitch(p_pitch_id) THEN
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

CREATE OR REPLACE FUNCTION public.debtor_add_payment(p_debtor_id uuid, p_amount numeric, p_method text DEFAULT 'CASH'::text, p_note text DEFAULT NULL::text)
 RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_pitch uuid; v_bal numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT d.pitch_id, GREATEST(COALESCE(d.amount_owed, 0), 0) INTO v_pitch, v_bal
  FROM public.pitch_debtors d WHERE d.id = p_debtor_id;
  IF v_pitch IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF NOT public.can_staff_pitch(v_pitch) THEN
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

CREATE OR REPLACE FUNCTION public.booking_to_debtor(p_booking_id uuid, p_name text DEFAULT NULL::text, p_phone text DEFAULT NULL::text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
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
  IF NOT public.can_staff_pitch(v_pitch) THEN
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

-- ── ABONMAN (yönetim: can_manage) ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cancel_subscription(p_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_pitch uuid;
BEGIN
  SELECT s.pitch_id INTO v_pitch FROM public.pitch_subscriptions s WHERE s.id = p_id;
  IF v_pitch IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF NOT public.can_manage_pitch(v_pitch) THEN
    RAISE EXCEPTION 'Yetkisiz: bu abonman size ait degil';
  END IF;
  UPDATE public.pitch_subscriptions SET status = 'CANCELLED' WHERE id = p_id;
  DELETE FROM public.pitch_bookings
   WHERE subscription_id = p_id AND booking_date >= CURRENT_DATE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.materialize_subscriptions(p_horizon_weeks integer DEFAULT 12, p_sub_id uuid DEFAULT NULL::uuid)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    sub RECORD;
    v_start DATE; v_end DATE; v_date DATE;
    v_created INT := 0;
    v_pitch uuid;
BEGIN
    IF p_sub_id IS NOT NULL THEN
        SELECT s.pitch_id INTO v_pitch FROM public.pitch_subscriptions s WHERE s.id = p_sub_id;
        IF v_pitch IS NULL OR NOT public.can_manage_pitch(v_pitch) THEN
            RAISE EXCEPTION 'Yetkisiz: bu abonman size ait degil';
        END IF;
    ELSE
        -- TOPLU İŞLEM: yalnızca admin veya sunucu tarafı
        IF auth.uid() IS NOT NULL
           AND COALESCE((SELECT role FROM public.profiles WHERE id = auth.uid()), '') NOT IN ('ADMIN','SUPER_ADMIN') THEN
            RAISE EXCEPTION 'UNAUTHORIZED: Toplu abonelik işlemi yalnızca yöneticiler tarafından çalıştırılabilir.';
        END IF;
    END IF;

    FOR sub IN
        SELECT * FROM public.pitch_subscriptions
        WHERE status = 'ACTIVE' AND (p_sub_id IS NULL OR id = p_sub_id)
    LOOP
        v_start := GREATEST(COALESCE(sub.materialized_until + 1, sub.start_date), sub.start_date, CURRENT_DATE);
        v_end := CURRENT_DATE + (p_horizon_weeks * 7);
        IF sub.end_date IS NOT NULL AND COALESCE(sub.auto_renew, true) = false AND sub.end_date < v_end THEN
            v_end := sub.end_date;
        END IF;

        v_date := v_start;
        WHILE v_date <= v_end LOOP
            IF (EXTRACT(ISODOW FROM v_date)::INT - 1) = sub.weekday THEN
                BEGIN
                    INSERT INTO public.pitch_bookings
                        (pitch_id, court_id, subscription_id, source, booking_date, start_time, end_time,
                         status, title, customer_name, customer_phone, price, payment_status)
                    VALUES
                        (sub.pitch_id, sub.court_id, sub.id, 'SUBSCRIPTION', v_date, sub.start_time, sub.end_time,
                         'CONFIRMED', COALESCE(NULLIF(sub.customer_name, ''), 'Abonman'),
                         sub.customer_name, sub.customer_phone, sub.price, 'PENDING');
                    v_created := v_created + 1;
                EXCEPTION WHEN exclusion_violation THEN
                    NULL;
                END;
            END IF;
            v_date := v_date + 1;
        END LOOP;

        UPDATE public.pitch_subscriptions SET materialized_until = v_end WHERE id = sub.id;
    END LOOP;

    RETURN v_created;
END;
$function$;

-- ── TAKVİM (kasa: can_staff — personel takvimi görür) ───────────────────────
CREATE OR REPLACE FUNCTION public.get_facility_schedule(p_pitch_id uuid, p_from date, p_to date)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN
    RAISE EXCEPTION 'INVALID_RANGE';
  END IF;
  IF (p_to - p_from) > 31 THEN
    RAISE EXCEPTION 'RANGE_TOO_WIDE: en fazla 31 gunluk pencere.';
  END IF;

  IF NOT public.can_staff_pitch(p_pitch_id) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: bu tesise erisim yok.';
  END IF;

  SELECT jsonb_build_object(
    'pitch', (SELECT jsonb_build_object(
                'id', p.id, 'name', p.name,
                'working_hours', p.working_hours,
                'auto_approve_enabled', COALESCE(p.auto_approve_enabled, true),
                'auto_approve_minutes', COALESCE(p.auto_approve_minutes, 35))
              FROM public.pitches p WHERE p.id = p_pitch_id),

    'courts', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                'id', c.id, 'name', c.name, 'court_type', c.court_type)
                ORDER BY c.name)
              FROM public.courts c
              WHERE c.pitch_id = p_pitch_id AND c.is_active IS NOT FALSE), '[]'::jsonb),

    'bookings', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                  'id', b.id, 'court_id', b.court_id, 'booking_date', b.booking_date,
                  'start_time', to_char(b.start_time,'HH24:MI'),
                  'end_time', to_char(b.end_time,'HH24:MI'),
                  'status', b.status, 'source', b.source,
                  'price', b.price, 'paid_amount', b.paid_amount,
                  'payment_status', b.payment_status,
                  'customer_name', b.customer_name, 'customer_phone', b.customer_phone,
                  'title', b.title))
                FROM public.pitch_bookings b
                WHERE b.pitch_id = p_pitch_id
                  AND b.booking_date BETWEEN p_from AND p_to
                  AND b.status <> 'CANCELLED'), '[]'::jsonb),

    'closures', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                  'id', e.id, 'court_id', e.court_id,
                  'is_recurring', COALESCE(e.is_recurring, false),
                  'exception_date', e.exception_date,
                  'day_of_week', e.day_of_week,
                  'start_time', CASE WHEN e.start_time IS NULL THEN NULL ELSE to_char(e.start_time,'HH24:MI') END,
                  'end_time', CASE WHEN e.end_time IS NULL THEN NULL ELSE to_char(e.end_time,'HH24:MI') END,
                  'reason', e.reason))
                FROM public.pitch_availability_exceptions e
                WHERE e.pitch_id = p_pitch_id
                  AND (
                    (COALESCE(e.is_recurring,false) = false AND e.exception_date BETWEEN p_from AND p_to)
                    OR COALESCE(e.is_recurring,false) = true
                  )), '[]'::jsonb),

    'holds', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                'court_id', h.court_id, 'booking_date', h.booking_date,
                'start_time', to_char(h.start_time,'HH24:MI'),
                'is_mine', (h.held_by = v_uid)))
              FROM public.pitch_slot_holds h
              WHERE h.pitch_id = p_pitch_id
                AND h.booking_date BETWEEN p_from AND p_to
                AND h.expires_at > now()), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

-- ── FİNANS ÖZETİ (yönetim: can_manage — personel tam finans GÖRMEZ) ─────────
CREATE OR REPLACE FUNCTION public.get_pitch_finance_summary(p_pitch_id uuid, p_month text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
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

  IF NOT public.can_manage_pitch(p_pitch_id) THEN
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

-- ── MANUEL REZERVASYON (kasa: can_staff — personel rezervasyon açar) ────────
CREATE OR REPLACE FUNCTION public.create_pitch_booking(p_pitch_id uuid, p_court_id uuid, p_booking_date date, p_start_time time without time zone, p_end_time time without time zone, p_source text DEFAULT 'OWNER_MANUAL'::text, p_customer_name text DEFAULT NULL::text, p_customer_phone text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_title text DEFAULT NULL::text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_booking_id UUID;
  v_tariff_id UUID;
  v_price NUMERIC;
  v_deposit NUMERIC;
  v_is_blocked BOOLEAN;
  v_start_ts TIMESTAMP;
  v_end_ts TIMESTAMP;
  v_status TEXT;
  v_auto_minutes INTEGER;
  v_auto_enabled BOOLEAN;
  v_user_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Giris gerekli.';
  END IF;
  IF p_source NOT IN ('OWNER_MANUAL', 'APP_BOOKING', 'SUBSCRIPTION', 'APP_MATCH') THEN
    RAISE EXCEPTION 'INVALID_SOURCE';
  END IF;

  -- Manuel (tesis içi) rezervasyon: sahip/müdür/personel (kasa) açabilir.
  IF p_source = 'OWNER_MANUAL' AND NOT public.can_staff_pitch(p_pitch_id) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: yetki yok.';
  END IF;

  v_start_ts := (p_booking_date + p_start_time)::timestamp;
  v_end_ts := (p_booking_date + p_end_time)::timestamp;
  IF v_end_ts <= v_start_ts THEN
    v_end_ts := v_end_ts + INTERVAL '1 day';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.pitch_availability_exceptions ex
    WHERE ex.pitch_id = p_pitch_id
      AND (ex.court_id = p_court_id OR ex.court_id IS NULL)
      AND (
        (COALESCE(ex.is_recurring, false) = false AND ex.exception_date = p_booking_date
          AND (ex.start_time IS NULL OR (ex.start_time <= p_start_time AND ex.end_time > p_start_time)))
        OR (ex.is_recurring = true AND ex.day_of_week = EXTRACT(ISODOW FROM p_booking_date)::int
          AND (ex.start_time IS NULL OR (ex.start_time <= p_start_time AND ex.end_time > p_start_time)))
      )
  ) INTO v_is_blocked;
  IF v_is_blocked THEN
    RAISE EXCEPTION 'SLOT_UNAVAILABLE: Bu saat dilimi kapalidir.';
  END IF;

  SELECT t.tariff_id, t.price, t.deposit INTO v_tariff_id, v_price, v_deposit
  FROM public.get_current_tariff_price(p_pitch_id, p_booking_date, p_start_time) t;

  IF p_source IN ('APP_BOOKING', 'APP_MATCH') AND v_tariff_id IS NULL THEN
    RAISE EXCEPTION 'NO_TARIFF: Bu saha icin tarife tanimlanmamis. Rezervasyon alinamiyor.';
  END IF;

  SELECT auto_approve_minutes, COALESCE(auto_approve_enabled, true)
    INTO v_auto_minutes, v_auto_enabled
  FROM public.pitches WHERE id = p_pitch_id;

  IF p_source = 'OWNER_MANUAL' THEN
    v_status := 'CONFIRMED';
  ELSIF v_auto_enabled AND COALESCE(v_auto_minutes, 35) = 0 THEN
    v_status := 'CONFIRMED';
  ELSE
    v_status := 'PENDING';
  END IF;

  IF p_source IN ('APP_BOOKING', 'APP_MATCH') THEN
    v_user_id := auth.uid();
  ELSE
    v_user_id := NULL;
  END IF;

  DELETE FROM public.pitch_slot_holds
  WHERE pitch_id = p_pitch_id AND court_id = p_court_id
    AND booking_date = p_booking_date AND start_time = p_start_time
    AND held_by = auth.uid();

  BEGIN
    INSERT INTO public.pitch_bookings (
      pitch_id, court_id, user_id, title, customer_name, customer_phone,
      booking_date, start_time, end_time, slot_range, status, source,
      tariff_id, price, deposit_amount, paid_amount, payment_status, note
    ) VALUES (
      p_pitch_id, p_court_id, v_user_id, p_title, p_customer_name, p_customer_phone,
      p_booking_date, p_start_time, p_end_time, tsrange(v_start_ts, v_end_ts, '[)'),
      v_status, p_source, v_tariff_id, COALESCE(v_price, 0), COALESCE(v_deposit, 0),
      0, 'PENDING', p_note
    ) RETURNING id INTO v_booking_id;
  EXCEPTION
    WHEN exclusion_violation THEN
      RAISE EXCEPTION 'SLOT_TAKEN: Bu saat dilimi zaten rezerve edilmistir.';
    WHEN unique_violation THEN
      RAISE EXCEPTION 'SLOT_TAKEN: Bu saat dilimi zaten rezerve edilmistir.';
  END;

  RETURN v_booking_id;
END;
$function$;

-- ── ONAYLANMIŞ REZERVASYON İPTAL (yönetim: can_manage — personel iptal EDEMEZ)
CREATE OR REPLACE FUNCTION public.owner_cancel_confirmed_booking(p_booking_id uuid, p_reason text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_booking RECORD;
  v_refund_amount NUMERIC;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  SELECT
    b.id, b.pitch_id, b.user_id, b.match_id, b.paid_amount, b.price,
    b.payment_status, b.status, p.owner_id, p.is_demo
  INTO v_booking
  FROM public.pitch_bookings b
  JOIN public.pitches p ON p.id = b.pitch_id
  WHERE b.id = p_booking_id
  FOR UPDATE OF b;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;

  IF v_booking.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'ALREADY_CANCELLED';
  END IF;

  IF NOT public.can_manage_pitch(v_booking.pitch_id) THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  v_refund_amount := COALESCE(v_booking.paid_amount, 0);

  UPDATE public.pitch_bookings
  SET status = 'CANCELLED',
      cancellation_reason = NULLIF(TRIM(p_reason), ''),
      cancelled_at = NOW(),
      cancelled_by = v_uid,
      payment_status = CASE WHEN v_refund_amount > 0 THEN 'REFUNDED' ELSE payment_status END
  WHERE id = p_booking_id;

  PERFORM public.reverse_booking_earnings(p_booking_id);

  IF v_booking.user_id IS NOT NULL AND v_refund_amount > 0 THEN
    PERFORM public.process_match_refund(v_booking.user_id, v_booking.match_id, v_refund_amount);
  END IF;

  IF v_booking.user_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, body, type_key)
    VALUES (
      v_booking.user_id,
      'Rezervasyonunuz İptal Edildi',
      CASE WHEN v_refund_amount > 0 THEN
        'Rezervasyonunuz iptal edildi. ' || v_refund_amount::text || '₺ cüzdanınıza iade edildi.'
      ELSE 'Rezervasyonunuz tesis tarafından iptal edildi.' END,
      'BOOKING_CANCELLED'
    );
  END IF;
END;
$function$;

-- ════════════════════════════════════════════════════════════════════════
-- YENİ DENETİMLİ PERSONEL RPC'LERİ (kasa/roster) — recorded_by SUNUCUDA DAMGALI
-- ════════════════════════════════════════════════════════════════════════

-- Bekleyen rezervasyonu ONAYLA (kasa)
CREATE OR REPLACE FUNCTION public.staff_approve_booking(p_booking_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_pitch uuid; v_status text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT b.pitch_id, b.status INTO v_pitch, v_status
  FROM public.pitch_bookings b WHERE b.id = p_booking_id FOR UPDATE;
  IF v_pitch IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF NOT public.can_staff_pitch(v_pitch) THEN RAISE EXCEPTION 'UNAUTHORIZED: bu tesise erisim yok.'; END IF;
  IF v_status <> 'PENDING' THEN RAISE EXCEPTION 'NOT_PENDING: yalnız bekleyen rezervasyon onaylanır.'; END IF;
  UPDATE public.pitch_bookings
  SET status = 'CONFIRMED', auto_approved_at = now()
  WHERE id = p_booking_id;
END;
$$;

-- Bekleyen rezervasyonu REDDET (kasa) — yalnız PENDING; iptal (refund) DEĞİL
CREATE OR REPLACE FUNCTION public.staff_reject_pending(p_booking_id uuid, p_reason text DEFAULT NULL::text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_uid uuid := auth.uid(); v_pitch uuid; v_status text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT b.pitch_id, b.status INTO v_pitch, v_status
  FROM public.pitch_bookings b WHERE b.id = p_booking_id FOR UPDATE;
  IF v_pitch IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF NOT public.can_staff_pitch(v_pitch) THEN RAISE EXCEPTION 'UNAUTHORIZED: bu tesise erisim yok.'; END IF;
  IF v_status <> 'PENDING' THEN RAISE EXCEPTION 'NOT_PENDING: yalnız bekleyen rezervasyon reddedilir.'; END IF;
  UPDATE public.pitch_bookings
  SET status = 'CANCELLED', cancellation_reason = NULLIF(TRIM(p_reason), ''),
      cancelled_at = now(), cancelled_by = v_uid
  WHERE id = p_booking_id;
END;
$$;

-- Rezervasyona TAHSİLAT işle (kasa) — recorded_by sunucuda, aşırı tahsilat korumalı
CREATE OR REPLACE FUNCTION public.staff_record_payment(p_booking_id uuid, p_amount numeric, p_method text DEFAULT 'CASH'::text, p_note text DEFAULT NULL::text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_uid uuid := auth.uid(); v_pitch uuid; v_price numeric; v_paid numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT b.pitch_id, COALESCE(b.price,0), COALESCE(b.paid_amount,0)
    INTO v_pitch, v_price, v_paid
  FROM public.pitch_bookings b WHERE b.id = p_booking_id;
  IF v_pitch IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF NOT public.can_staff_pitch(v_pitch) THEN RAISE EXCEPTION 'UNAUTHORIZED: bu tesise erisim yok.'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;
  -- Fiyatlı rezervasyonda kalan bakiyeyi aşamaz (fat-finger koruması).
  IF v_price > 0 AND p_amount > GREATEST(v_price - v_paid, 0) + 0.001 THEN
    RAISE EXCEPTION 'OVER_PAYMENT: kalan bakiyeden fazla tahsilat alınamaz.';
  END IF;
  INSERT INTO public.booking_payments (booking_id, amount, payment_method, note, recorded_by, source)
  VALUES (p_booking_id, p_amount, COALESCE(NULLIF(p_method,''),'CASH'), p_note, v_uid, 'OWNER_MANUAL');
END;
$$;

-- Nöbet durumu (yönetim) — ON_DUTY/OFF_DUTY/LEAVE
CREATE OR REPLACE FUNCTION public.staff_set_duty(p_member_id uuid, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_pitch uuid; v_st text := upper(coalesce(nullif(trim(p_status),''),''));
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF v_st NOT IN ('ON_DUTY','OFF_DUTY','LEAVE') THEN RAISE EXCEPTION 'INVALID_STATUS'; END IF;
  SELECT pitch_id INTO v_pitch FROM public.pitch_staff_members WHERE id = p_member_id;
  IF v_pitch IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF NOT public.can_manage_pitch(v_pitch) THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  UPDATE public.pitch_staff_members SET status = v_st WHERE id = p_member_id;
END;
$$;

-- Görünüm kartı ekle/düzenle (yönetim) — LOGIN sütunlarına DOKUNMAZ
CREATE OR REPLACE FUNCTION public.staff_upsert_roster(p_pitch_id uuid, p_member_id uuid DEFAULT NULL::uuid, p_name text DEFAULT NULL::text, p_role_title text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_sort_order integer DEFAULT 0)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_id uuid; v_existing_pitch uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF NOT public.can_manage_pitch(p_pitch_id) THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_member_id IS NOT NULL THEN
    SELECT pitch_id INTO v_existing_pitch FROM public.pitch_staff_members WHERE id = p_member_id;
    IF v_existing_pitch IS DISTINCT FROM p_pitch_id THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    UPDATE public.pitch_staff_members
    SET name = COALESCE(NULLIF(trim(p_name),''), name),
        role_title = COALESCE(NULLIF(trim(p_role_title),''), role_title),
        phone = NULLIF(trim(p_phone),''),
        sort_order = COALESCE(p_sort_order, sort_order)
    WHERE id = p_member_id RETURNING id INTO v_id;
    RETURN v_id;
  END IF;
  IF NULLIF(trim(p_name),'') IS NULL THEN RAISE EXCEPTION 'NAME_REQUIRED'; END IF;
  INSERT INTO public.pitch_staff_members (pitch_id, name, role_title, phone, status, sort_order, staff_role, account_status)
  VALUES (p_pitch_id, trim(p_name), COALESCE(NULLIF(trim(p_role_title),''),'Personel'),
          NULLIF(trim(p_phone),''), 'OFF_DUTY', COALESCE(p_sort_order,0), 'STAFF', 'ROSTER')
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- Görünüm kartı sil (yönetim) — YALNIZ login'siz ROSTER kartı; hesap→sahip
CREATE OR REPLACE FUNCTION public.staff_delete_roster(p_member_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_pitch uuid; v_uid_col uuid; v_status text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT pitch_id, user_id, account_status INTO v_pitch, v_uid_col, v_status
  FROM public.pitch_staff_members WHERE id = p_member_id;
  IF v_pitch IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF NOT public.can_manage_pitch(v_pitch) THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF v_uid_col IS NOT NULL OR v_status IN ('INVITED','ACTIVE','PASSIVE') THEN
    RAISE EXCEPTION 'LOGIN_ACCOUNT: Giriş yetkili personel yalnız sahip tarafından kaldırılır.';
  END IF;
  DELETE FROM public.pitch_staff_members WHERE id = p_member_id;
END;
$$;

-- Görev tamamla/geri al (kasa) — personel kendi görevini işaretler
CREATE OR REPLACE FUNCTION public.staff_toggle_task(p_task_id uuid, p_completed boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_pitch uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT pitch_id INTO v_pitch FROM public.pitch_staff_tasks WHERE id = p_task_id;
  IF v_pitch IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF NOT public.can_staff_pitch(v_pitch) THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  UPDATE public.pitch_staff_tasks
  SET status = CASE WHEN p_completed THEN 'COMPLETED' ELSE 'PENDING' END
  WHERE id = p_task_id;
END;
$$;

-- Ekip listesi (kasa) — davet kodu YALNIZ yöneticiye görünür
CREATE OR REPLACE FUNCTION public.get_pitch_team(p_pitch_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_can_manage boolean; v_result jsonb;
BEGIN
  IF NOT public.can_staff_pitch(p_pitch_id) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: bu tesise erisim yok.';
  END IF;
  v_can_manage := public.can_manage_pitch(p_pitch_id);
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id, 'name', s.name, 'role_title', s.role_title, 'status', s.status,
    'avatar_url', s.avatar_url, 'phone', s.phone, 'sort_order', s.sort_order,
    'staff_role', s.staff_role, 'account_status', s.account_status, 'is_demo', s.is_demo,
    'invite_code', CASE WHEN v_can_manage THEN s.invite_code ELSE NULL END,
    'invite_expires_at', CASE WHEN v_can_manage THEN s.invite_code_expires_at ELSE NULL END
  ) ORDER BY s.sort_order, s.name), '[]'::jsonb)
  INTO v_result
  FROM public.pitch_staff_members s
  WHERE s.pitch_id = p_pitch_id AND s.account_status <> 'PASSIVE';
  RETURN v_result;
END;
$$;

-- ── İZİNLER ─────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.staff_approve_booking(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_reject_pending(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_record_payment(uuid, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_set_duty(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_upsert_roster(uuid, uuid, text, text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_delete_roster(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_toggle_task(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pitch_team(uuid) TO authenticated;
