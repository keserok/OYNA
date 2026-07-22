-- ============================================================================
-- APP REZERVASYONLARINDA OYUNCU ADI SNAPSHOT'I
-- ----------------------------------------------------------------------------
-- Sorun: APP_BOOKING / APP_MATCH kaynaklı rezervasyonlarda customer_name boş
-- kalıyordu. Owner, oyuncu profilini RLS gereği okuyamadığı için takvim,
-- doluluk analizi ve rezervasyon detayında "Misafir" görünüyordu.
--
-- Çözüm: create_pitch_booking, rezervasyon anında oyuncunun profil adını
-- (full_name → name) customer_name'e yazar. Mevcut kayıtlar backfill edilir.
-- Ad bir SNAPSHOT'tır: profil sonradan değişse bile rezervasyondaki ad kalır
-- (finansal kayıtla tutarlı).
--
-- GERİ KAZANIM NOTU (Faz 2c ek): Bu migration canlıya PR-hattı DIŞINDA (eşzamanlı
-- oturum) doğrudan uygulanmıştı; ledger'da 20260722182110 kayıtlı, statements
-- doluydu. Deploy tutarlılığı için canlının ledger'ından birebir repoya alındı.
-- Canlıda zaten uygulanmış → merge'de ATLANIR (NO-OP).
-- ============================================================================

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
  v_customer_name TEXT;
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
  v_customer_name := p_customer_name;
  IF p_source IN ('APP_BOOKING', 'APP_MATCH') THEN
    v_user_id := auth.uid();
    -- Oyuncu adi rezervasyona SNAPSHOT olarak yazilir: owner, profiles'i RLS
    -- geregi okuyamaz; takvim/doluluk/detay ekranlari adi rezervasyondan gosterir.
    IF v_customer_name IS NULL OR TRIM(v_customer_name) = '' THEN
      SELECT COALESCE(NULLIF(TRIM(pr.full_name), ''), NULLIF(TRIM(pr.name), ''))
        INTO v_customer_name
      FROM public.profiles pr
      WHERE pr.id = v_user_id;
    END IF;
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
      p_pitch_id, p_court_id, v_user_id, p_title, v_customer_name, p_customer_phone,
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

-- Mevcut APP kaynaklı rezervasyonlarda boş kalan müşteri adlarını backfill et.
UPDATE public.pitch_bookings b
SET customer_name = src.display_name
FROM (
  SELECT p.id,
         COALESCE(NULLIF(TRIM(p.full_name), ''), NULLIF(TRIM(p.name), '')) AS display_name
  FROM public.profiles p
) src
WHERE b.user_id = src.id
  AND (b.customer_name IS NULL OR TRIM(b.customer_name) = '')
  AND src.display_name IS NOT NULL;
