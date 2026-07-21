-- ============================================================================
-- SAHA (KORT) BAZLI TARİFE — get_current_tariff_price'a court_id parametresi
-- ----------------------------------------------------------------------------
-- DRIFT ONARIMI NOTU (2026-07-21): Bu migration 2026-07-21'de canlıya MCP ile
-- uygulanmış ancak repoya hiç commit'lenmemişti (ters drift). İçerik, canlı
-- ledger'daki (supabase_migrations.schema_migrations) statements kaydından
-- BİREBİR aktarılmıştır. Canlıda zaten uygulandığı için ledger'da "applied"
-- işaretlidir; sıfırdan replay'lerde (preview branch) normal sırayla koşar.
-- Sıra notu: admin_booking_toggle'dan SONRA uygulanmıştır — buradaki
-- create_pitch_booking canlıdaki NİHAİ tanımdır (admin guard + 4-arg tarife).
-- ============================================================================

DROP FUNCTION IF EXISTS public.get_current_tariff_price(uuid, date, time without time zone);

CREATE OR REPLACE FUNCTION public.get_current_tariff_price(
  p_pitch_id uuid,
  p_booking_date date,
  p_start_time time without time zone,
  p_court_id uuid DEFAULT NULL
)
RETURNS TABLE(tariff_id uuid, price numeric, deposit numeric)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_dow INTEGER;
BEGIN
  v_dow := EXTRACT(ISODOW FROM p_booking_date);
  RETURN QUERY
  SELECT t.id, t.price_per_hour, t.deposit_amount
  FROM public.pitch_tariffs t
  WHERE t.pitch_id = p_pitch_id
    AND t.is_active = true
    AND v_dow = ANY(t.applies_to_days)
    AND p_start_time >= t.start_time
    AND (p_start_time < t.end_time OR t.end_time = '00:00:00')
    AND (t.court_id IS NULL OR t.court_id = p_court_id)
  ORDER BY
    CASE WHEN t.court_id IS NOT NULL AND t.court_id = p_court_id THEN 0 ELSE 1 END,
    CASE t.tariff_type WHEN 'HOLIDAY' THEN 1 WHEN 'WEEKEND' THEN 2 WHEN 'WEEKDAY' THEN 3 ELSE 4 END
  LIMIT 1;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_current_tariff_price(uuid, date, time without time zone, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_current_tariff_price(uuid, date, time without time zone, uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_pitch_booking(p_pitch_id uuid, p_court_id uuid, p_booking_date date, p_start_time time without time zone, p_end_time time without time zone, p_source text DEFAULT 'OWNER_MANUAL'::text, p_customer_name text DEFAULT NULL::text, p_customer_phone text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_title text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
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
  IF p_source = 'OWNER_MANUAL' AND NOT public.can_staff_pitch(p_pitch_id) THEN
    RAISE EXCEPTION 'UNAUTHORIZED: yetki yok.';
  END IF;
  IF p_source IN ('APP_BOOKING', 'APP_MATCH') AND EXISTS (
    SELECT 1 FROM public.pitches
    WHERE id = p_pitch_id AND booking_disabled_by_admin
  ) THEN
    RAISE EXCEPTION 'BOOKING_DISABLED: Bu tesis icin online rezervasyon gecici olarak kapatilmistir.';
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
  FROM public.get_current_tariff_price(p_pitch_id, p_booking_date, p_start_time, p_court_id) t;
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
