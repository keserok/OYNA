-- ============================================================================
-- ADMIN REZERVASYON ANAHTARI (tesis bazlı)
-- ----------------------------------------------------------------------------
-- DRIFT ONARIMI NOTU (2026-07-21): Bu migration 2026-07-20'de canlıya MCP ile
-- uygulanmış ancak repoya hiç commit'lenmemişti (ters drift). İçerik, canlı
-- ledger'daki (supabase_migrations.schema_migrations) statements kaydından
-- BİREBİR aktarılmıştır. Canlıda zaten uygulandığı için ledger'da "applied"
-- işaretlidir; sıfırdan replay'lerde (preview branch) normal sırayla koşar.
-- ----------------------------------------------------------------------------
-- Admin panelden bir tesisin ONLINE rezervasyonu kapatılıp açılabilir.
--   * booking_disabled_by_admin = true → oyuncu uygulamasından APP_BOOKING /
--     APP_MATCH rezervasyonu SUNUCUDA reddedilir (BOOKING_DISABLED).
--   * OWNER_MANUAL (tesisin kendi telefon kaydı) ve SUBSCRIPTION etkilenmez —
--     admin kapatması tesisin kendi defterini tutmasını engellemez.
--   * Owner'ın kendi is_open anahtarından bilinçli olarak AYRI bir alandır:
--     kimin kapattığı (admin mi tesis mi) her zaman nettir.
-- ============================================================================

ALTER TABLE public.pitches
  ADD COLUMN IF NOT EXISTS booking_disabled_by_admin boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.pitches.booking_disabled_by_admin IS
  'Admin panelden tesis bazlı online rezervasyon kapatma. true iken APP_BOOKING/APP_MATCH sunucuda BOOKING_DISABLED ile reddedilir; owner manuel kayıtları etkilenmez.';

-- ── create_pitch_booking: admin kapatma guard'ı (canlı tanım + tek ek blok) ──
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
  -- Admin rezervasyon anahtarı: yalnız oyuncu-kaynaklı rezervasyonları keser.
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

-- ── admin_update_pitch: payload'a booking_disabled_by_admin eklendi ──────────
CREATE OR REPLACE FUNCTION public.admin_update_pitch(p_pitch_id uuid, p_payload jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_old JSONB;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  PERFORM public.require_admin_role(ARRAY['MODERATOR']);
  IF p_payload ? 'owner_id' AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Tesis sahipliği devri yalnız SUPER_ADMIN tarafından yapılabilir';
  END IF;
  SELECT to_jsonb(p.*) INTO v_old FROM public.pitches p WHERE id = p_pitch_id;
  IF v_old IS NULL THEN RAISE EXCEPTION 'Saha bulunamadı'; END IF;
  UPDATE public.pitches SET
    name = COALESCE(p_payload->>'name', name),
    district = COALESCE(p_payload->>'district', district),
    city = COALESCE(p_payload->>'city', city),
    address = COALESCE(p_payload->>'address', address),
    latitude = COALESCE((p_payload->>'latitude')::double precision, latitude),
    longitude = COALESCE((p_payload->>'longitude')::double precision, longitude),
    price_per_match = COALESCE((p_payload->>'price_per_match')::numeric, price_per_match),
    google_rating = COALESCE((p_payload->>'google_rating')::numeric, google_rating),
    google_review_count = COALESCE((p_payload->>'google_review_count')::int, google_review_count),
    verification_status = COALESCE(p_payload->>'verification_status', verification_status),
    image = COALESCE(p_payload->>'image', image),
    description = CASE WHEN p_payload ? 'description' THEN NULLIF(p_payload->>'description', '') ELSE description END,
    amenities = CASE WHEN p_payload ? 'amenities' THEN p_payload->'amenities' ELSE amenities END,
    working_hours = CASE WHEN p_payload ? 'working_hours' THEN p_payload->'working_hours' ELSE working_hours END,
    is_published = COALESCE((p_payload->>'is_published')::boolean, is_published),
    is_featured = COALESCE((p_payload->>'is_featured')::boolean, is_featured),
    flash_deals_enabled = COALESCE((p_payload->>'flash_deals_enabled')::boolean, flash_deals_enabled),
    show_availability_badge = COALESCE((p_payload->>'show_availability_badge')::boolean, show_availability_badge),
    booking_disabled_by_admin = COALESCE((p_payload->>'booking_disabled_by_admin')::boolean, booking_disabled_by_admin),
    map_label = CASE WHEN p_payload ? 'map_label' THEN NULLIF(p_payload->>'map_label', '') ELSE map_label END,
    is_active = COALESCE((p_payload->>'is_active')::boolean, is_active),
    owner_id = CASE WHEN p_payload ? 'owner_id' THEN NULLIF(p_payload->>'owner_id', '')::uuid ELSE owner_id END
  WHERE id = p_pitch_id;
  PERFORM public.log_admin_action('PITCH_UPDATE', 'pitch', p_pitch_id, p_payload->>'name', v_old, p_payload);
  RETURN TRUE;
END;
$function$;
