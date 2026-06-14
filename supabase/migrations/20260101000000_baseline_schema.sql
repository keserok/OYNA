-- =============================================================================
-- OYNA — BASELINE SCHEMA (public)
-- Canli prod (iikvzgyccvgcybzdfwlv) public semasinin 2026-06-14 anlik goruntusu.
--
-- Uretim: pg_dump 18.4 --schema-only --no-owner --schema=public
-- Temizlik: psql meta-komutlari (\restrict/\unrestrict) ve "CREATE SCHEMA public"
--           kaldirildi (migration runner psql degil); replay icin gereken
--           public-sema extension'lari asagiya eklendi.
-- Eski dagink/replay-edilemeyen migration dosyalari: supabase/_archive_migrations/
-- Ayrinti: supabase/MIGRATIONS.md
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS cube WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS earthdistance WITH SCHEMA public;

-- ----------------------------------------------------------------------------
-- pg_dump (temizlenmis) baslangic
-- ----------------------------------------------------------------------------
--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.4

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: auto_approve_pending_bookings(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auto_approve_pending_bookings() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_count integer;
  v_now_tr timestamp := (now() AT TIME ZONE 'Europe/Istanbul');
BEGIN
  WITH upd AS (
    UPDATE public.pitch_bookings b
    SET status = 'CONFIRMED', auto_approved_at = now()
    FROM public.pitches p
    WHERE p.id = b.pitch_id
      AND b.status = 'PENDING'
      AND b.source IN ('APP_BOOKING', 'APP_MATCH')
      AND COALESCE(p.auto_approve_enabled, true)
      AND COALESCE(p.auto_approve_minutes, 35) > 0
      AND b.created_at + make_interval(mins => COALESCE(p.auto_approve_minutes, 35)) <= now()
      AND (b.booking_date + b.start_time) > v_now_tr  -- geçmişteki rezervasyonu onaylama
    RETURNING b.id
  )
  SELECT count(*) INTO v_count FROM upd;
  RETURN v_count;
END;
$$;


--
-- Name: cancel_app_booking(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_app_booking(p_booking_id uuid, p_reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  b RECORD;
  v_start timestamp;
  v_now_tr timestamp := (now() AT TIME ZONE 'Europe/Istanbul');
  v_refund numeric := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Giris gerekli.';
  END IF;

  SELECT * INTO b FROM public.pitch_bookings WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Rezervasyon bulunamadi.';
  END IF;
  IF b.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Bu rezervasyon size ait degil.';
  END IF;
  IF b.source NOT IN ('APP_BOOKING', 'APP_MATCH') THEN
    RAISE EXCEPTION 'INVALID_SOURCE: Bu rezervasyon uygulamadan iptal edilemez.';
  END IF;
  IF b.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'ALREADY_CANCELLED: Rezervasyon zaten iptal edilmis.';
  END IF;

  v_start := (b.booking_date + b.start_time)::timestamp;
  IF v_start <= v_now_tr THEN
    RAISE EXCEPTION 'ALREADY_STARTED: Gecmis veya baslamis rezervasyon iptal edilemez.';
  END IF;
  IF v_start - v_now_tr < interval '48 hours' THEN
    RAISE EXCEPTION 'CANCEL_WINDOW_CLOSED: Rezervasyon saatine 48 saatten az kaldigi icin uygulamadan iptal edilemez. Lutfen tesisle iletisime gecin.';
  END IF;

  -- %90 iade kurali (odeme entegrasyonu geldiginde gercek para iadesi burada tetiklenecek)
  v_refund := round(COALESCE(b.paid_amount, 0) * 0.90, 2);

  UPDATE public.pitch_bookings SET
    status = 'CANCELLED',
    cancelled_at = now(),
    cancelled_by = auth.uid(),
    cancellation_reason = COALESCE(p_reason, 'Oyuncu iptali (48 saat kurali icinde)'),
    payment_status = CASE WHEN COALESCE(paid_amount, 0) > 0 THEN 'REFUNDED' ELSE payment_status END
  WHERE id = p_booking_id;

  RETURN jsonb_build_object(
    'booking_id', p_booking_id,
    'refund_percent', 90,
    'refund_amount', v_refund,
    'paid_amount', COALESCE(b.paid_amount, 0)
  );
END;
$$;


--
-- Name: cancel_subscription(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_subscription(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.pitch_subscriptions s
        JOIN public.pitches p ON p.id = s.pitch_id
        WHERE s.id = p_id
          AND (p.owner_id = auth.uid()
               OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('ADMIN', 'SUPER_ADMIN'))
    ) THEN
        RAISE EXCEPTION 'Yetkisiz: bu abonman size ait degil';
    END IF;

    UPDATE public.pitch_subscriptions SET status = 'CANCELLED' WHERE id = p_id;
    DELETE FROM public.pitch_bookings
     WHERE subscription_id = p_id AND booking_date >= CURRENT_DATE;
END;
$$;


--
-- Name: check_match_conflict(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_match_conflict() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
    conflict_count INT;
BEGIN
    -- Only check if the status is changing to 'ACCEPTED'
    IF NEW.status = 'ACCEPTED' AND (OLD.status IS NULL OR OLD.status != 'ACCEPTED') THEN
        
        -- Check if there's already an accepted offer for the same provider, date, and time
        SELECT COUNT(*)
        INTO conflict_count
        FROM service_offers
        WHERE provider_id = NEW.provider_id
          AND id != NEW.id
          AND status = 'ACCEPTED'
          AND offer_date = NEW.offer_date
          AND offer_time = NEW.offer_time;

        -- If a conflict is found, abort the transaction and raise an exception
        IF conflict_count > 0 THEN
            RAISE EXCEPTION 'CONFLICT_DETECTED: Kullanıcının bu tarih ve saatte zaten onaylanmış bir maçı bulunmaktadır.';
        END IF;

    END IF;

    RETURN NEW;
END;
$$;


--
-- Name: cleanup_expired_holds(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cleanup_expired_holds() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$ BEGIN DELETE FROM public.pitch_slot_holds WHERE expires_at < NOW(); END; $$;


--
-- Name: create_pitch_booking(uuid, uuid, date, time without time zone, time without time zone, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_pitch_booking(p_pitch_id uuid, p_court_id uuid, p_booking_date date, p_start_time time without time zone, p_end_time time without time zone, p_source text DEFAULT 'OWNER_MANUAL'::text, p_customer_name text DEFAULT NULL::text, p_customer_phone text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_title text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_booking_id UUID;
  v_tariff_id UUID;
  v_price NUMERIC;
  v_deposit NUMERIC;
  v_is_blocked BOOLEAN;
  v_is_owner BOOLEAN;
  v_is_admin BOOLEAN;
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

  SELECT EXISTS(SELECT 1 FROM public.pitches WHERE id = p_pitch_id AND owner_id = auth.uid()) INTO v_is_owner;
  SELECT ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'ADMIN') INTO v_is_admin;
  IF p_source = 'OWNER_MANUAL' AND NOT (v_is_owner OR v_is_admin) THEN
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

  -- TARIFE ZORUNLULUGU: uygulamadan rezervasyonda aktif tarife sart (0 TL olabilir)
  IF p_source IN ('APP_BOOKING', 'APP_MATCH') AND v_tariff_id IS NULL THEN
    RAISE EXCEPTION 'NO_TARIFF: Bu saha icin tarife tanimlanmamis. Rezervasyon alinamiyor.';
  END IF;

  SELECT auto_approve_minutes, COALESCE(auto_approve_enabled, true)
    INTO v_auto_minutes, v_auto_enabled
  FROM public.pitches WHERE id = p_pitch_id;

  IF p_source = 'OWNER_MANUAL' THEN
    v_status := 'CONFIRMED';
  ELSIF v_auto_enabled AND COALESCE(v_auto_minutes, 35) = 0 THEN
    -- 0 dakika = aninda onay
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
$$;


--
-- Name: enforce_tariff_before_open(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_tariff_before_open() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NEW.is_open = true AND COALESCE(OLD.is_open, false) = false THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.pitch_tariffs t
      WHERE t.pitch_id = NEW.id AND t.is_active = true
    ) THEN
      RAISE EXCEPTION 'NO_TARIFF: Saha yayina alinmadan once en az bir aktif tarife girilmelidir (0 TL olabilir).';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: get_court_occupancy(uuid, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_court_occupancy(p_court_id uuid, p_date date) RETURNS integer
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
    v_pitch_id UUID;
    v_open TIME; v_close TIME; v_slot INT;
    v_open_m INT; v_close_m INT; v_span INT;
    v_busy_m NUMERIC;
BEGIN
    SELECT pitch_id INTO v_pitch_id FROM public.courts WHERE id = p_court_id;
    IF v_pitch_id IS NULL THEN RETURN 0; END IF;

    SELECT COALESCE((working_hours->>'open')::TIME, TIME '10:00'),
           COALESCE((working_hours->>'close')::TIME, TIME '02:00'),
           COALESCE((working_hours->>'slot_duration')::INT, 60)
      INTO v_open, v_close, v_slot
      FROM public.pitches WHERE id = v_pitch_id;

    v_open_m  := EXTRACT(HOUR FROM v_open) * 60  + EXTRACT(MINUTE FROM v_open);
    v_close_m := EXTRACT(HOUR FROM v_close) * 60 + EXTRACT(MINUTE FROM v_close);
    IF v_close_m <= v_open_m THEN v_close_m := v_close_m + 1440; END IF;
    v_span := v_close_m - v_open_m;
    IF v_span <= 0 THEN RETURN 0; END IF;

    SELECT COALESCE(SUM(
        CASE WHEN end_time <= start_time
             THEN (EXTRACT(HOUR FROM end_time)*60 + EXTRACT(MINUTE FROM end_time) + 1440)
                - (EXTRACT(HOUR FROM start_time)*60 + EXTRACT(MINUTE FROM start_time))
             ELSE (EXTRACT(HOUR FROM end_time)*60 + EXTRACT(MINUTE FROM end_time))
                - (EXTRACT(HOUR FROM start_time)*60 + EXTRACT(MINUTE FROM start_time))
        END
    ), 0)
      INTO v_busy_m
      FROM public.pitch_bookings
     WHERE court_id = p_court_id AND booking_date = p_date AND status <> 'CANCELLED';

    RETURN LEAST(ROUND(v_busy_m / v_span * 100)::INT, 100);
END;
$$;


--
-- Name: get_current_tariff_price(uuid, date, time without time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_current_tariff_price(p_pitch_id uuid, p_booking_date date, p_start_time time without time zone) RETURNS TABLE(tariff_id uuid, price numeric, deposit numeric)
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$ DECLARE v_dow INTEGER; BEGIN v_dow := EXTRACT(ISODOW FROM p_booking_date); RETURN QUERY SELECT t.id, t.price_per_hour, t.deposit_amount FROM public.pitch_tariffs t WHERE t.pitch_id = p_pitch_id AND t.is_active = true AND v_dow = ANY(t.applies_to_days) AND p_start_time >= t.start_time AND (p_start_time < t.end_time OR t.end_time = '00:00:00') ORDER BY CASE t.tariff_type WHEN 'HOLIDAY' THEN 1 WHEN 'WEEKEND' THEN 2 WHEN 'WEEKDAY' THEN 3 ELSE 4 END LIMIT 1; END; $$;


--
-- Name: get_or_create_match_score_token(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_or_create_match_score_token(p_match_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$ DECLARE v_token TEXT; v_allowed BOOLEAN; BEGIN IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF; SELECT (EXISTS (SELECT 1 FROM public.matches m WHERE m.id = p_match_id AND (m.captain_id = auth.uid() OR m."creatorId" = auth.uid() OR m."refereeId" = auth.uid())) OR EXISTS (SELECT 1 FROM public.pitch_bookings pb JOIN public.pitches p ON p.id = pb.pitch_id WHERE pb.match_id = p_match_id AND p.owner_id = auth.uid()) OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'ADMIN') INTO v_allowed; IF NOT v_allowed THEN RAISE EXCEPTION 'UNAUTHORIZED: QR yetkisi yok.'; END IF; INSERT INTO public.match_score_tokens (match_id) VALUES (p_match_id) ON CONFLICT (match_id) DO UPDATE SET expires_at = NOW() + INTERVAL '4 hours', used_at = NULL, used_by = NULL RETURNING token INTO v_token; RETURN v_token; END; $$;


--
-- Name: get_pitch_availability(uuid, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_pitch_availability(p_pitch_id uuid, p_date_from date, p_date_to date) RETURNS TABLE(court_id uuid, booking_date date, start_time time without time zone, end_time time without time zone, status text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT b.court_id, b.booking_date, b.start_time, b.end_time, b.status::text
  FROM public.pitch_bookings b
  WHERE b.pitch_id = p_pitch_id
    AND b.status <> 'CANCELLED'
    AND b.booking_date BETWEEN p_date_from AND LEAST(p_date_to, p_date_from + 31)
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, avatar_url, role, created_at, updated_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(COALESCE(NEW.email,''), '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', ''),
    'PLAYER',
    now(),
    now()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;


--
-- Name: has_role(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(check_role text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = (SELECT auth.uid())
      AND (role = check_role OR roles ? check_role)
  );
$$;


--
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = (SELECT auth.uid())
      AND (role IN ('ADMIN','SUPER_ADMIN')
           OR roles ?| array['ADMIN','SUPER_ADMIN'])
  );
$$;


--
-- Name: is_super_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_super_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = (SELECT auth.uid())
      AND (role = 'SUPER_ADMIN' OR roles ? 'SUPER_ADMIN')
  );
$$;


--
-- Name: join_match_slot(uuid, uuid, character varying, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.join_match_slot(p_match_id uuid, p_user_id uuid, p_slot_id character varying, p_slot_role character varying) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_capacity INT;
    v_current_count INT;
    v_status VARCHAR;
    v_is_banned BOOLEAN;
BEGIN
    -- YETKİ KONTROLÜ: yalnızca kişinin kendisi, admin veya sunucu tarafı
    IF auth.uid() IS NOT NULL
       AND auth.uid() <> p_user_id
       AND COALESCE((SELECT role FROM public.profiles WHERE id = auth.uid()), '') NOT IN ('ADMIN','SUPER_ADMIN') THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Başka bir kullanıcı adına maça kayıt yapamazsınız.';
    END IF;

    -- Ban kontrolü
    SELECT is_banned INTO v_is_banned FROM profiles WHERE id = p_user_id;
    IF v_is_banned THEN RAISE EXCEPTION 'Kullanıcı banlı!'; END IF;

    -- Eşzamanlılık kilidi (Pessimistic Lock)
    SELECT status, total_capacity INTO v_status, v_capacity
    FROM individual_matches WHERE id = p_match_id FOR UPDATE;

    IF v_status != 'GATHERING' THEN RAISE EXCEPTION 'Maç aktif değil!'; END IF;

    -- Slot mükerrerlik kontrolü
    IF EXISTS (SELECT 1 FROM match_registrations WHERE match_id = p_match_id AND slot_id = p_slot_id) THEN
        RAISE EXCEPTION 'Slot doldu!';
    END IF;

    -- Kullanıcı mükerrerlik kontrolü
    IF EXISTS (SELECT 1 FROM match_registrations WHERE match_id = p_match_id AND user_id = p_user_id) THEN
        RAISE EXCEPTION 'Zaten maça kayıtlısınız!';
    END IF;

    SELECT COUNT(*) INTO v_current_count FROM match_registrations WHERE match_id = p_match_id;

    IF v_current_count >= v_capacity THEN
        INSERT INTO waitlist (match_id, user_id) VALUES (p_match_id, p_user_id);
    ELSE
        INSERT INTO match_registrations (match_id, user_id, slot_id, slot_role, payment_status)
        VALUES (p_match_id, p_user_id, p_slot_id, p_slot_role, 'HELD');
    END IF;
END;
$$;


--
-- Name: materialize_subscriptions(integer, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.materialize_subscriptions(p_horizon_weeks integer DEFAULT 12, p_sub_id uuid DEFAULT NULL::uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
    sub RECORD;
    v_start DATE; v_end DATE; v_date DATE;
    v_created INT := 0;
BEGIN
    IF p_sub_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.pitch_subscriptions s
            JOIN public.pitches p ON p.id = s.pitch_id
            WHERE s.id = p_sub_id
              AND (p.owner_id = auth.uid()
                   OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('ADMIN', 'SUPER_ADMIN'))
        ) THEN
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
        IF sub.end_date IS NOT NULL AND sub.end_date < v_end THEN v_end := sub.end_date; END IF;

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
$$;


--
-- Name: notify_booking_events(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_booking_events() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_owner uuid;
  v_pitch_name text;
  v_when text;
BEGIN
  SELECT owner_id, name INTO v_owner, v_pitch_name FROM public.pitches WHERE id = NEW.pitch_id;
  v_when := to_char(NEW.booking_date, 'DD.MM.YYYY') || ' ' || to_char(NEW.start_time, 'HH24:MI');

  IF TG_OP = 'INSERT' THEN
    -- Uygulamadan gelen yeni talep → tesis sahibine bildir
    IF NEW.source IN ('APP_BOOKING', 'APP_MATCH') AND v_owner IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, body, type_key, payload, action_required)
      VALUES (
        v_owner,
        CASE WHEN NEW.status = 'PENDING' THEN 'Yeni Rezervasyon Talebi ⏳' ELSE 'Yeni Rezervasyon ✅' END,
        COALESCE(v_pitch_name, 'Tesisiniz') || ' — ' || v_when ||
          CASE WHEN NEW.status = 'PENDING' THEN ' için onay bekleyen talep var.' ELSE ' rezervasyonu oluşturuldu.' END,
        'BOOKING_REQUEST',
        jsonb_build_object('booking_id', NEW.id, 'pitch_id', NEW.pitch_id),
        NEW.status = 'PENDING'
      );
    END IF;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Onaylandı (manuel veya otomatik) → oyuncuya bildir
    IF OLD.status = 'PENDING' AND NEW.status = 'CONFIRMED' AND NEW.user_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, body, type_key, payload)
      VALUES (
        NEW.user_id,
        'Rezervasyonun Onaylandı ✅',
        COALESCE(v_pitch_name, 'Saha') || ' — ' || v_when || ' rezervasyonun onaylandı. İyi oyunlar!',
        'BOOKING_CONFIRMED',
        jsonb_build_object('booking_id', NEW.id, 'pitch_id', NEW.pitch_id)
      );
    -- Oyuncu kendi iptal etti → tesis sahibine bildir
    ELSIF NEW.status = 'CANCELLED' AND OLD.status <> 'CANCELLED'
      AND NEW.cancelled_by IS NOT NULL AND NEW.cancelled_by = NEW.user_id
      AND v_owner IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, body, type_key, payload)
      VALUES (
        v_owner,
        'Rezervasyon İptal Edildi ❌',
        COALESCE(v_pitch_name, 'Tesisiniz') || ' — ' || v_when || ' rezervasyonu oyuncu tarafından iptal edildi.',
        'BOOKING_CANCELLED_BY_PLAYER',
        jsonb_build_object('booking_id', NEW.id, 'pitch_id', NEW.pitch_id)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: notify_match_cancelled(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_match_cancelled() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_template RECORD;
  v_participant RECORD;
  v_title TEXT;
  v_body TEXT;
  v_vars JSONB;
BEGIN
  IF NEW.status = 'CANCELLED' AND (OLD.status IS NULL OR OLD.status <> 'CANCELLED') THEN

    SELECT * INTO v_template
      FROM public.notification_templates
     WHERE type_key = 'match_cancelled';

    IF NOT FOUND THEN RETURN NEW; END IF;

    v_vars := jsonb_build_object(
      'match_date', COALESCE(NEW.date, 'Belirtilmedi'),
      'match_time', COALESCE(NEW.time, ''),
      'pitch_name', COALESCE(NEW.location, 'Belirtilmemiş Saha')
    );
    v_title := replace_template_vars(v_template.title_tr, v_vars);
    v_body  := replace_template_vars(v_template.body_tr, v_vars);

    -- Tüm onaylı katılımcılara bildirim gönder
    FOR v_participant IN
      SELECT DISTINCT user_id
        FROM public.match_participants
       WHERE match_id = NEW.id
         AND status = 'CONFIRMED'
    LOOP
      INSERT INTO public.notifications
        (user_id, title, body, type, type_key, match_id, action_required, deep_link, is_read, is_active)
      VALUES (
        v_participant.user_id,
        v_title, v_body,
        'MATCH_CANCELLED', 'match_cancelled',
        NEW.id, false,
        'oyna://match/' || NEW.id::TEXT,
        false, true
      );
    END LOOP;

    -- Kaptana da ayrıca bildirim gönder (match_participants'ta olmayabilir)
    IF NEW."creatorId" IS NOT NULL THEN
      INSERT INTO public.notifications
        (user_id, title, body, type, type_key, match_id, action_required, deep_link, is_read, is_active)
      SELECT
        NEW."creatorId", v_title, v_body,
        'MATCH_CANCELLED', 'match_cancelled',
        NEW.id, false,
        'oyna://match/' || NEW.id::TEXT,
        false, true
      -- Kaptan zaten match_participants'ta varsa ekleme
      WHERE NOT EXISTS (
        SELECT 1 FROM public.notifications
         WHERE user_id = NEW."creatorId"
           AND match_id = NEW.id
           AND type_key = 'match_cancelled'
      );
    END IF;

  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: notify_match_joined(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_match_joined() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_captain_id UUID;
  v_match_date TEXT;
  v_location TEXT;
  v_template RECORD;
  v_player_name TEXT;
BEGIN
  -- Kaptanın rolü ise bildirim gönderme
  IF NEW.role = 'CAPTAIN' THEN
    RETURN NEW;
  END IF;

  -- Maçtan sadece gerekli alanları al (creatorId, date, location)
  SELECT "creatorId", date, location
    INTO v_captain_id, v_match_date, v_location
    FROM public.matches
   WHERE id = NEW.match_id;

  -- Maç yoksa veya creatorId yoksa çık
  IF v_captain_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Oyuncu adını al
  SELECT COALESCE(name, 'Bir Oyuncu')
    INTO v_player_name
    FROM public.profiles
   WHERE id = NEW.user_id;

  -- Şablonu al
  SELECT * INTO v_template
    FROM public.notification_templates
   WHERE type_key = 'match_joined';

  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Kaptana bildirim ekle
  INSERT INTO public.notifications
    (user_id, title, body, type, type_key, match_id, sender_id, action_required, deep_link, is_read, is_active)
  VALUES (
    v_captain_id,
    replace_template_vars(v_template.title_tr, jsonb_build_object(
      'player_name', v_player_name,
      'match_date', COALESCE(v_match_date, 'Tarih belirtilmedi'),
      'pitch_name', COALESCE(v_location, 'Saha')
    )),
    replace_template_vars(v_template.body_tr, jsonb_build_object(
      'player_name', v_player_name,
      'match_date', COALESCE(v_match_date, 'Tarih belirtilmedi'),
      'pitch_name', COALESCE(v_location, 'Saha')
    )),
    'MATCH_JOINED', 'match_joined',
    NEW.match_id, NEW.user_id, false,
    'oyna://match/' || NEW.match_id::TEXT,
    false, true
  );

  RETURN NEW;
END;
$$;


--
-- Name: notify_ref_status_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_ref_status_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_template RECORD;
  v_applicant_id UUID;
  v_applicant_name TEXT;
  v_type_key TEXT;
  v_vars JSONB;
BEGIN

  -- ── HAKEM DEĞİŞİMİ ──
  IF NEW."refereeId" IS DISTINCT FROM OLD."refereeId" THEN
    IF NEW."refereeId" IS NOT NULL THEN
      v_type_key := 'ref_accepted';
      v_applicant_id := NEW."refereeId";
    ELSE
      v_type_key := 'ref_rejected';
      v_applicant_id := OLD."refereeId";
    END IF;

    IF v_applicant_id IS NOT NULL THEN
      SELECT COALESCE(name, 'Hakem')
        INTO v_applicant_name
        FROM public.profiles WHERE id = v_applicant_id;

      SELECT * INTO v_template
        FROM public.notification_templates WHERE type_key = v_type_key;

      IF FOUND THEN
        v_vars := jsonb_build_object(
          'ref_name', v_applicant_name,
          'match_date', COALESCE(NEW.date, 'Belirtilmedi'),
          'pitch_name', COALESCE(NEW.location, 'Saha')
        );

        -- Kaptana bildir (eğer creatorId varsa)
        IF NEW."creatorId" IS NOT NULL THEN
          INSERT INTO public.notifications
            (user_id, title, body, type, type_key, match_id, sender_id, action_required, deep_link, is_read, is_active)
          VALUES (
            NEW."creatorId",
            replace_template_vars(v_template.title_tr, v_vars),
            replace_template_vars(v_template.body_tr, v_vars),
            UPPER(v_type_key), v_type_key,
            NEW.id, v_applicant_id, false,
            'oyna://match/' || NEW.id::TEXT,
            false, true
          );
        END IF;

        -- Hakeme bildir
        INSERT INTO public.notifications
          (user_id, title, body, type, type_key, match_id, action_required, deep_link, is_read, is_active)
        VALUES (
          v_applicant_id,
          replace_template_vars(v_template.title_tr, v_vars),
          CASE WHEN v_type_key = 'ref_accepted' THEN 'Maça hakem olarak onaylandınız!' ELSE 'Hakem başvurunuz reddedildi.' END,
          UPPER(v_type_key), v_type_key,
          NEW.id, false,
          'oyna://match/' || NEW.id::TEXT,
          false, true
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: notify_send_push_webhook(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.notify_send_push_webhook() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$ DECLARE request_id bigint; BEGIN SELECT net.http_post(url := 'https://iikvzgyccvgcybzdfwlv.supabase.co/functions/v1/send-push', headers := '{"Content-Type": "application/json"}'::jsonb, body := row_to_json(NEW)::jsonb) INTO request_id; RETURN NEW; END; $$;


--
-- Name: pitch_bookings_set_slot_range(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pitch_bookings_set_slot_range() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.slot_range := tsrange(
    (NEW.booking_date + NEW.start_time),
    CASE WHEN NEW.end_time <= NEW.start_time
         THEN (NEW.booking_date + 1 + NEW.end_time)
         ELSE (NEW.booking_date + NEW.end_time) END,
    '[)'
  );
  RETURN NEW;
END;
$$;


--
-- Name: process_match_payment(uuid, uuid, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.process_match_payment(p_user_id uuid, p_match_id uuid, p_amount numeric) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE v_current_balance numeric;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Başka bir kullanıcının cüzdanından ödeme yapamazsınız.';
  END IF;
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'GECERSIZ_TUTAR: Ödeme tutarı pozitif olmalıdır.';
  END IF;
  SELECT wallet_balance INTO v_current_balance FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF v_current_balance IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND: Kullanıcı bulunamadı.';
  END IF;
  IF v_current_balance < p_amount THEN
    RAISE EXCEPTION 'Yetersiz bakiye. Gerekli: % ₺, Mevcut: % ₺', p_amount, v_current_balance;
  END IF;
  UPDATE public.profiles SET wallet_balance = wallet_balance - p_amount, updated_at = NOW() WHERE id = p_user_id;
  INSERT INTO public.wallet_transactions (user_id, match_id, amount, type, description)
  VALUES (p_user_id, p_match_id, -p_amount, 'MATCH_FEE', 'Maç katılım ücreti');
  RETURN TRUE;
END;
$$;


--
-- Name: process_match_refund(uuid, uuid, numeric); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.process_match_refund(p_user_id uuid, p_match_id uuid, p_amount numeric) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_paid     numeric;
  v_refunded numeric;
BEGIN
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Başka bir kullanıcının cüzdanına iade yapamazsınız.';
  END IF;
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'GECERSIZ_TUTAR: İade tutarı pozitif olmalıdır.';
  END IF;

  -- Bu maç için bu kullanıcının ödediği toplam (MATCH_FEE negatif kayıtlı)
  SELECT COALESCE(SUM(-amount), 0) INTO v_paid
  FROM public.wallet_transactions
  WHERE user_id = p_user_id AND match_id = p_match_id AND type = 'MATCH_FEE';
  IF v_paid <= 0 THEN
    RAISE EXCEPTION 'ODEME_YOK: Bu maç için bu kullanıcıya ait ödeme bulunamadı.';
  END IF;

  -- Daha önce iade yapıldı mı?
  SELECT COALESCE(SUM(amount), 0) INTO v_refunded
  FROM public.wallet_transactions
  WHERE user_id = p_user_id AND match_id = p_match_id AND type = 'REFUND';
  IF v_refunded > 0 THEN
    RAISE EXCEPTION 'ZATEN_IADE: Bu maç için zaten iade yapılmış.';
  END IF;

  -- Tutar eşleşmesi
  IF p_amount <> v_paid THEN
    RAISE EXCEPTION 'TUTAR_UYUSMUYOR: İade tutarı % ödenen tutarla % eşleşmiyor.', p_amount, v_paid;
  END IF;

  UPDATE public.profiles SET wallet_balance = wallet_balance + p_amount, updated_at = NOW() WHERE id = p_user_id;
  INSERT INTO public.wallet_transactions (user_id, match_id, amount, type, description)
  VALUES (p_user_id, p_match_id, p_amount, 'REFUND', 'Maç iptali / Ayrılma iadesi');
  RETURN TRUE;
END;
$$;


--
-- Name: protect_profile_columns(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.protect_profile_columns() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF (SELECT auth.uid()) IS NULL
     OR auth.role() = 'service_role'
     OR public.is_admin() THEN
    RETURN NEW;
  END IF;
  -- Admin değilse: admin'in elle düzenlediği kolonlar eski değerine döner
  NEW.role           := OLD.role;
  NEW.roles          := OLD.roles;
  NEW.is_banned      := OLD.is_banned;
  NEW.ban_expires_at := OLD.ban_expires_at;
  NEW.is_verified    := OLD.is_verified;
  RETURN NEW;
END;
$$;


--
-- Name: protect_provider_sensitive_fields(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.protect_provider_sensitive_fields() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF (SELECT role FROM public.profiles WHERE id = auth.uid()) <> 'ADMIN' OR auth.uid() IS NULL THEN
    IF NEW.is_elite <> OLD.is_elite OR NEW.rating <> OLD.rating THEN
      RAISE EXCEPTION 'UNAUTHORIZED: Elite statüsü ve rating sadece yöneticiler (Admin) tarafından güncellenebilir.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: replace_template_vars(text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.replace_template_vars(template text, vars jsonb) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  result TEXT := template;
  key TEXT;
  val TEXT;
BEGIN
  IF template IS NULL THEN RETURN ''; END IF;
  FOR key, val IN SELECT * FROM jsonb_each_text(vars)
  LOOP
    result := REPLACE(result, '{{' || key || '}}', COALESCE(val, ''));
  END LOOP;
  RETURN result;
END;
$$;


--
-- Name: send_match_invite(uuid, uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.send_match_invite(p_match_id uuid, p_target_user_id uuid, p_sender_id uuid, p_team_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_match_date TEXT;
  v_location TEXT;
  v_sender_name TEXT;
  v_team_name TEXT;
  v_template RECORD;
  v_type_key TEXT;
  v_vars JSONB;
  v_notification_id UUID;
BEGIN
  -- YETKİ KONTROLÜ: davet ancak kişinin kendi adına gönderilebilir
  IF auth.uid() IS NOT NULL
     AND auth.uid() <> p_sender_id
     AND COALESCE((SELECT role FROM public.profiles WHERE id = auth.uid()), '') NOT IN ('ADMIN','SUPER_ADMIN') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Başka bir kullanıcı adına davet gönderemezsiniz.';
  END IF;

  SELECT date, location
    INTO v_match_date, v_location
    FROM public.matches WHERE id = p_match_id;

  SELECT COALESCE(name, 'Bir Oyuncu')
    INTO v_sender_name
    FROM public.profiles WHERE id = p_sender_id;

  IF p_team_id IS NOT NULL THEN
    v_type_key := 'team_invite';
    SELECT name INTO v_team_name FROM public.teams WHERE id = p_team_id;
    v_vars := jsonb_build_object(
      'team_name', COALESCE(v_team_name, 'Takım'),
      'sender_name', v_sender_name,
      'match_date', COALESCE(v_match_date, 'Belirtilmedi'),
      'pitch_name', COALESCE(v_location, 'Saha')
    );
  ELSE
    v_type_key := 'match_invite';
    v_vars := jsonb_build_object(
      'sender_name', v_sender_name,
      'match_date', COALESCE(v_match_date, 'Belirtilmedi'),
      'pitch_name', COALESCE(v_location, 'Saha')
    );
  END IF;

  SELECT * INTO v_template
    FROM public.notification_templates WHERE type_key = v_type_key;

  INSERT INTO public.notifications
    (user_id, title, body, type, type_key, match_id, team_id, sender_id,
     action_required, deep_link, is_read, is_active)
  VALUES (
    p_target_user_id,
    replace_template_vars(v_template.title_tr, v_vars),
    replace_template_vars(v_template.body_tr, v_vars),
    UPPER(v_type_key), v_type_key,
    p_match_id, p_team_id, p_sender_id,
    true,
    'oyna://match/' || p_match_id::TEXT,
    false, true
  )
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$$;


--
-- Name: submit_match_score(text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.submit_match_score(p_token text, p_home_score integer, p_away_score integer) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$ DECLARE v_match_id UUID; v_captain UUID; v_creator UUID; BEGIN IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF; IF p_home_score IS NULL OR p_away_score IS NULL OR p_home_score < 0 OR p_away_score < 0 OR p_home_score > 50 OR p_away_score > 50 THEN RAISE EXCEPTION 'INVALID_SCORE'; END IF; SELECT match_id INTO v_match_id FROM public.match_score_tokens WHERE token = p_token AND expires_at > NOW() AND used_at IS NULL FOR UPDATE; IF v_match_id IS NULL THEN RAISE EXCEPTION 'INVALID_TOKEN: QR kodu gecersiz veya suresi dolmus.'; END IF; UPDATE public.matches SET "homeScore" = p_home_score, "awayScore" = p_away_score, status = 'COMPLETED', "scoreEnteredAt" = NOW() WHERE id = v_match_id; UPDATE public.match_score_tokens SET used_at = NOW(), used_by = auth.uid() WHERE token = p_token; SELECT captain_id, "creatorId" INTO v_captain, v_creator FROM public.matches WHERE id = v_match_id; INSERT INTO public.notifications (user_id, title, body, type_key, match_id, action_required) SELECT uid, 'Mac skoru girildi', format('Mac skoru girildi: %s-%s. Onaylar misin?', p_home_score, p_away_score), 'MATCH_SCORE_CONFIRM', v_match_id, true FROM (SELECT DISTINCT uid FROM unnest(ARRAY[v_captain, v_creator]) AS uid WHERE uid IS NOT NULL) q; RETURN v_match_id; END; $$;


--
-- Name: update_booking_paid_amount(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_booking_paid_amount() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$ DECLARE v_paid NUMERIC; v_total NUMERIC; BEGIN SELECT COALESCE(SUM(amount), 0) INTO v_paid FROM public.booking_payments WHERE booking_id = NEW.booking_id; SELECT COALESCE(price, 0) INTO v_total FROM public.pitch_bookings WHERE id = NEW.booking_id; UPDATE public.pitch_bookings SET paid_amount = v_paid, payment_status = CASE WHEN v_total > 0 AND v_paid >= v_total THEN 'PAID' WHEN v_paid > 0 THEN 'PARTIAL' ELSE 'PENDING' END WHERE id = NEW.booking_id; RETURN NEW; END; $$;


--
-- Name: update_player_diamond(uuid, boolean, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_player_diamond(p_user_id uuid, p_is_win boolean, p_flat_modifier integer DEFAULT 0) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_current_wins INTEGER;
  v_current_total INTEGER;
  v_new_wins INTEGER;
  v_new_total INTEGER;
  v_win_rate NUMERIC;
  v_new_diamond INTEGER;
  v_card JSONB;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Oyuncu istatistikleri yalnızca sistem tarafından güncellenebilir.';
  END IF;

  SELECT win_count, total_matches, player_card
    INTO v_current_wins, v_current_total, v_card
  FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Kullanıcı profili bulunamadı.';
  END IF;

  v_current_wins  := COALESCE(v_current_wins, 0);
  v_current_total := COALESCE(v_current_total, 0);
  v_card          := COALESCE(v_card, '{}'::jsonb);

  v_new_total := v_current_total + 1;
  IF p_is_win THEN v_new_wins := v_current_wins + 1; ELSE v_new_wins := v_current_wins; END IF;

  IF v_new_total > 0 THEN v_win_rate := v_new_wins::NUMERIC / v_new_total::NUMERIC; ELSE v_win_rate := 0; END IF;
  v_new_diamond := ROUND(POWER(v_new_wins, 2) * v_win_rate * 1000) + p_flat_modifier;
  IF v_new_diamond < 0 THEN v_new_diamond := 0; END IF;

  v_card := jsonb_set(v_card, '{diamondValue}', to_jsonb(v_new_diamond));
  v_card := jsonb_set(v_card, '{winCount}', to_jsonb(v_new_wins));
  v_card := jsonb_set(v_card, '{totalMatches}', to_jsonb(v_new_total));
  IF p_flat_modifier <> 0 THEN
    v_card := jsonb_set(v_card, '{flatModifier}', to_jsonb(p_flat_modifier));
  END IF;

  UPDATE public.profiles
  SET win_count = v_new_wins, total_matches = v_new_total, diamonds = v_new_diamond,
      match_count = v_new_total, player_card = v_card, updated_at = NOW()
  WHERE id = p_user_id;
END;
$$;


--
-- Name: update_user_location(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_user_location(p_user_id uuid, p_point_str text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  -- YETKİ KONTROLÜ
  IF auth.uid() <> p_user_id AND (SELECT role FROM public.profiles WHERE id = auth.uid()) <> 'ADMIN' THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Başka bir kullanıcının konumunu güncelleyemezsiniz.';
  END IF;

  UPDATE public.profiles
  SET last_location = ST_GeomFromText(p_point_str, 4326)
  WHERE id = p_user_id;
END;
$$;


--
-- Name: update_user_skill_rating(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_user_skill_rating() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_rater_ts FLOAT;
    v_weighted_rating FLOAT;
BEGIN
    SELECT trust_score INTO v_rater_ts FROM profiles WHERE id = NEW.rater_id;
    v_weighted_rating := ((NEW.skill_score * 0.7 + NEW.fair_play_score * 0.3) * (v_rater_ts / 5.0));

    UPDATE profiles
    SET ratings_history = array_append(ratings_history, jsonb_build_object('rater_ts', v_rater_ts, 'score', v_weighted_rating))
    WHERE id = NEW.ratee_id;
    
    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    admin_id uuid NOT NULL,
    action text NOT NULL,
    target_id uuid,
    details text,
    "timestamp" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: booking_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id uuid NOT NULL,
    amount numeric NOT NULL,
    payment_method text NOT NULL,
    note text,
    recorded_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT booking_payments_payment_method_check CHECK ((payment_method = ANY (ARRAY['CASH'::text, 'CARD'::text, 'BANK_TRANSFER'::text, 'OYNA_WALLET'::text])))
);


--
-- Name: courts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.courts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pitch_id uuid NOT NULL,
    name character varying(100) NOT NULL,
    court_type character varying(20) DEFAULT 'CLOSED'::character varying,
    size character varying(20),
    price numeric(10,2),
    images jsonb DEFAULT '[]'::jsonb,
    description text,
    is_active boolean DEFAULT true,
    lighting_grade character varying(1),
    grass_grade character varying(1),
    locker_grade character varying(1),
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    capacity integer DEFAULT 14,
    CONSTRAINT courts_court_type_check CHECK (((court_type)::text = ANY ((ARRAY['OPEN'::character varying, 'CLOSED'::character varying])::text[]))),
    CONSTRAINT courts_grass_grade_check CHECK (((grass_grade)::text = ANY ((ARRAY['A'::character varying, 'B'::character varying, 'C'::character varying])::text[]))),
    CONSTRAINT courts_lighting_grade_check CHECK (((lighting_grade)::text = ANY ((ARRAY['A'::character varying, 'B'::character varying, 'C'::character varying])::text[]))),
    CONSTRAINT courts_locker_grade_check CHECK (((locker_grade)::text = ANY ((ARRAY['A'::character varying, 'B'::character varying, 'C'::character varying])::text[])))
);


--
-- Name: friendships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.friendships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sender_id uuid,
    receiver_id uuid,
    status text DEFAULT 'PENDING'::text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: goalkeepers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.goalkeepers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    height text,
    age integer,
    rating numeric DEFAULT 0,
    fee numeric DEFAULT 0,
    "matchCount" integer DEFAULT 0,
    avatar text,
    "recentAwards" text,
    style text,
    bio text,
    "preferredZones" jsonb DEFAULT '[]'::jsonb,
    "isElite" boolean DEFAULT false,
    coordinates jsonb,
    stats jsonb,
    skills jsonb,
    equipment jsonb,
    reviews jsonb DEFAULT '[]'::jsonb,
    geohash text
);


--
-- Name: individual_matches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.individual_matches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pitch_id uuid,
    title character varying(150) NOT NULL,
    match_datetime timestamp with time zone NOT NULL,
    total_capacity integer DEFAULT 14 NOT NULL,
    min_capacity integer DEFAULT 10 NOT NULL,
    cost_per_player numeric(10,2) NOT NULL,
    status character varying(30) DEFAULT 'GATHERING'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT individual_matches_status_check CHECK (((status)::text = ANY ((ARRAY['GATHERING'::character varying, 'CONFIRMED'::character varying, 'PLAYING'::character varying, 'COMPLETED'::character varying, 'CANCELLED'::character varying])::text[])))
);


--
-- Name: match_disputes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.match_disputes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    match_id uuid NOT NULL,
    raised_by uuid NOT NULL,
    home_claimed_score text,
    away_claimed_score text,
    evidence_urls jsonb DEFAULT '[]'::jsonb,
    status text DEFAULT 'OPEN'::text,
    resolution_notes text,
    resolved_by uuid,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT match_disputes_status_check CHECK ((status = ANY (ARRAY['OPEN'::text, 'UNDER_REVIEW'::text, 'RESOLVED'::text, 'DISMISSED'::text])))
);


--
-- Name: match_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.match_participants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    match_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'PLAYER'::text,
    status text DEFAULT 'CONFIRMED'::text,
    joined_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);


--
-- Name: match_registrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.match_registrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    match_id uuid,
    user_id uuid,
    slot_id character varying(50) NOT NULL,
    slot_role character varying(20) NOT NULL,
    payment_status character varying(30) DEFAULT 'HELD'::character varying,
    registered_at timestamp with time zone DEFAULT now(),
    CONSTRAINT match_registrations_payment_status_check CHECK (((payment_status)::text = ANY ((ARRAY['HELD'::character varying, 'CAPTURED'::character varying, 'REFUNDED'::character varying])::text[])))
);


--
-- Name: match_score_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.match_score_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    match_id uuid NOT NULL,
    token text DEFAULT encode(extensions.gen_random_bytes(32), 'hex'::text) NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    expires_at timestamp with time zone DEFAULT (now() + '04:00:00'::interval),
    used_at timestamp with time zone,
    used_by uuid
);


--
-- Name: match_tactics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.match_tactics (
    id text NOT NULL,
    formation text NOT NULL,
    slots text NOT NULL,
    "editorName" text,
    "updatedAt" bigint NOT NULL
);


--
-- Name: matches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.matches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    location text,
    "time" text,
    date text,
    price numeric DEFAULT 0,
    difficulty text,
    "minRating" numeric DEFAULT 0,
    image text,
    badges jsonb DEFAULT '[]'::jsonb,
    "missingPositions" jsonb DEFAULT '[]'::jsonb,
    slots jsonb DEFAULT '[]'::jsonb,
    status text DEFAULT 'DRAFT'::text,
    "creatorId" uuid,
    "communityId" text,
    format text,
    duration text,
    gender text,
    "ageGroup" text,
    "refereeId" uuid,
    "homeTeamId" uuid,
    "awayTeamId" uuid,
    "homeScore" integer,
    "awayScore" integer,
    "scoreEnteredAt" timestamp with time zone,
    captain_id uuid
);


--
-- Name: notification_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type_key text NOT NULL,
    label_tr text NOT NULL,
    title_tr text NOT NULL,
    body_tr text NOT NULL,
    title_en text,
    body_en text,
    category text DEFAULT 'MATCH'::text,
    is_mandatory boolean DEFAULT false,
    can_user_disable boolean DEFAULT true,
    sound text DEFAULT 'default'::text,
    badge_increment boolean DEFAULT true,
    sort_order integer DEFAULT 99,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    title character varying(100),
    body text,
    payload jsonb,
    is_read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    type_key text DEFAULT 'system'::text NOT NULL,
    match_id uuid,
    team_id uuid,
    sender_id uuid,
    deep_link text,
    push_sent boolean DEFAULT false,
    push_sent_at timestamp with time zone,
    push_error text,
    action_required boolean DEFAULT false,
    action_taken text
);


--
-- Name: pitch_bookings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pitch_bookings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pitch_id uuid NOT NULL,
    match_id uuid,
    user_id uuid,
    title character varying(150),
    booking_date date NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    status character varying(30) DEFAULT 'CONFIRMED'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    court_id uuid NOT NULL,
    subscription_id uuid,
    source character varying(20) DEFAULT 'OWNER_MANUAL'::character varying,
    payment_status character varying(20) DEFAULT 'PENDING'::character varying,
    price numeric(10,2) DEFAULT 0,
    paid_amount numeric(10,2) DEFAULT 0,
    customer_name character varying(150),
    customer_phone character varying(30),
    slot_range tsrange,
    tariff_id uuid,
    deposit_amount numeric DEFAULT 0,
    note text,
    cancelled_at timestamp with time zone,
    cancelled_by uuid,
    cancellation_reason text,
    auto_approved_at timestamp with time zone,
    CONSTRAINT pitch_bookings_payment_status_check CHECK (((payment_status)::text = ANY ((ARRAY['PENDING'::character varying, 'PARTIAL'::character varying, 'PAID'::character varying, 'REFUNDED'::character varying, 'WAIVED'::character varying])::text[]))),
    CONSTRAINT pitch_bookings_source_check CHECK (((source)::text = ANY ((ARRAY['OWNER_MANUAL'::character varying, 'APP_BOOKING'::character varying, 'SUBSCRIPTION'::character varying, 'APP_MATCH'::character varying])::text[]))),
    CONSTRAINT pitch_bookings_status_check CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'CONFIRMED'::character varying, 'CANCELLED'::character varying])::text[])))
);


--
-- Name: pitches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pitches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(150) NOT NULL,
    latitude double precision,
    longitude double precision,
    address text NOT NULL,
    is_active boolean DEFAULT true,
    owner_id uuid,
    district character varying(100),
    image text,
    images jsonb DEFAULT '[]'::jsonb,
    description text,
    amenities jsonb DEFAULT '[]'::jsonb,
    price_per_person numeric(10,2),
    total_price numeric(10,2),
    working_hours jsonb DEFAULT '{"open": "10:00", "close": "02:00", "slot_duration": 60}'::jsonb,
    settings jsonb DEFAULT '{}'::jsonb,
    rating numeric DEFAULT 5.0,
    verification_status text DEFAULT 'pending'::text,
    verification_notes text,
    is_open boolean DEFAULT true,
    auto_approve_minutes integer DEFAULT 35,
    pricing_mode text DEFAULT 'FULL'::text,
    cancellation_policy jsonb DEFAULT '{"before_0h_refund_percent": 0, "before_12h_refund_percent": 50, "before_24h_refund_percent": 100}'::jsonb,
    iban text,
    platform_commission_rate numeric DEFAULT 10.0,
    google_rating numeric DEFAULT 0,
    google_review_count integer DEFAULT 0,
    city text,
    price_per_match numeric,
    auto_approve_enabled boolean DEFAULT true NOT NULL,
    CONSTRAINT pitches_pricing_mode_check CHECK ((pricing_mode = ANY (ARRAY['FULL'::text, 'PER_PERSON'::text]))),
    CONSTRAINT pitches_verification_status_check CHECK ((verification_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: COLUMN pitches.auto_approve_enabled; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pitches.auto_approve_enabled IS 'true: PENDING rezervasyonlar auto_approve_minutes sonunda otomatik CONFIRMED olur. false: yalnız manuel onay.';


--
-- Name: owner_daily_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.owner_daily_summary WITH (security_invoker='true') AS
 SELECT id AS pitch_id,
    name AS pitch_name,
    owner_id,
    CURRENT_DATE AS summary_date,
    ( SELECT count(*) AS count
           FROM public.pitch_bookings pb
          WHERE ((pb.pitch_id = p.id) AND (pb.booking_date = CURRENT_DATE))) AS total_bookings_today,
    ( SELECT count(*) AS count
           FROM public.pitch_bookings pb
          WHERE ((pb.pitch_id = p.id) AND (pb.booking_date = CURRENT_DATE) AND ((pb.status)::text = 'CONFIRMED'::text))) AS confirmed_today,
    ( SELECT count(*) AS count
           FROM public.pitch_bookings pb
          WHERE ((pb.pitch_id = p.id) AND (pb.booking_date = CURRENT_DATE) AND ((pb.status)::text = 'PENDING'::text))) AS pending_today,
    ( SELECT COALESCE(sum(pb.price), (0)::numeric) AS "coalesce"
           FROM public.pitch_bookings pb
          WHERE ((pb.pitch_id = p.id) AND (pb.booking_date = CURRENT_DATE) AND ((pb.status)::text = 'CONFIRMED'::text))) AS expected_revenue_today,
    ( SELECT COALESCE(sum(pb.paid_amount), (0)::numeric) AS "coalesce"
           FROM public.pitch_bookings pb
          WHERE ((pb.pitch_id = p.id) AND (pb.booking_date = CURRENT_DATE))) AS collected_today,
    ( SELECT count(*) AS count
           FROM public.courts c
          WHERE (c.pitch_id = p.id)) AS total_courts,
    ( SELECT count(*) AS count
           FROM public.courts c
          WHERE ((c.pitch_id = p.id) AND (c.is_active = true))) AS active_courts
   FROM public.pitches p;


--
-- Name: owner_withdrawal_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.owner_withdrawal_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pitch_id uuid NOT NULL,
    owner_id uuid NOT NULL,
    amount numeric NOT NULL,
    iban text NOT NULL,
    iban_photo_url text,
    status text DEFAULT 'PENDING'::text,
    admin_notes text,
    processed_at timestamp with time zone,
    processed_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT owner_withdrawal_requests_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'APPROVED'::text, 'PROCESSING'::text, 'COMPLETED'::text, 'REJECTED'::text])))
);


--
-- Name: pitch_availability_exceptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pitch_availability_exceptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pitch_id uuid NOT NULL,
    court_id uuid,
    exception_date date,
    day_of_week integer,
    start_time time without time zone,
    end_time time without time zone,
    reason text,
    exception_type text DEFAULT 'MAINTENANCE'::text,
    is_recurring boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT pitch_availability_exceptions_day_of_week_check CHECK (((day_of_week >= 1) AND (day_of_week <= 7))),
    CONSTRAINT pitch_availability_exceptions_exception_type_check CHECK ((exception_type = ANY (ARRAY['MAINTENANCE'::text, 'PRIVATE_EVENT'::text, 'HOLIDAY'::text, 'EMERGENCY'::text, 'OTHER'::text])))
);


--
-- Name: pitch_debtors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pitch_debtors (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pitch_id uuid NOT NULL,
    oyna_user_id uuid,
    name text NOT NULL,
    phone text,
    amount_owed numeric DEFAULT 0,
    last_match_date date,
    notes text,
    last_reminded_at timestamp with time zone,
    is_resolved boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: pitch_expenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pitch_expenses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pitch_id uuid NOT NULL,
    category text NOT NULL,
    title text NOT NULL,
    amount numeric NOT NULL,
    expense_date date DEFAULT CURRENT_DATE,
    note text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: pitch_flash_deals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pitch_flash_deals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pitch_id uuid NOT NULL,
    court_id uuid,
    booking_date date NOT NULL,
    start_time time without time zone NOT NULL,
    discount_percent integer NOT NULL,
    original_price numeric NOT NULL,
    deal_price numeric GENERATED ALWAYS AS ((original_price * ((1)::numeric - ((discount_percent)::numeric / (100)::numeric)))) STORED,
    expires_at timestamp with time zone NOT NULL,
    is_claimed boolean DEFAULT false,
    claimed_by uuid,
    claimed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT pitch_flash_deals_discount_percent_check CHECK (((discount_percent >= 5) AND (discount_percent <= 80)))
);


--
-- Name: pitch_slot_holds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pitch_slot_holds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pitch_id uuid NOT NULL,
    court_id uuid,
    booking_date date NOT NULL,
    start_time time without time zone NOT NULL,
    held_by uuid NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:10:00'::interval) NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: pitch_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pitch_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    court_id uuid NOT NULL,
    pitch_id uuid NOT NULL,
    customer_name character varying(150),
    customer_phone character varying(30),
    weekday integer NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    price numeric(10,2) DEFAULT 0,
    status character varying(20) DEFAULT 'ACTIVE'::character varying,
    start_date date DEFAULT CURRENT_DATE,
    end_date date,
    materialized_until date,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    user_id uuid,
    auto_renew boolean DEFAULT true,
    renewal_reminder_sent_at timestamp with time zone,
    CONSTRAINT pitch_subscriptions_status_check CHECK (((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'PAUSED'::character varying, 'CANCELLED'::character varying])::text[]))),
    CONSTRAINT pitch_subscriptions_weekday_check CHECK (((weekday >= 0) AND (weekday <= 6)))
);


--
-- Name: pitch_tariffs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pitch_tariffs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pitch_id uuid NOT NULL,
    court_id uuid,
    name text NOT NULL,
    tariff_type text DEFAULT 'WEEKDAY'::text,
    applies_to_days integer[] DEFAULT ARRAY[1, 2, 3, 4, 5],
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    price_per_hour numeric NOT NULL,
    deposit_amount numeric DEFAULT 0,
    is_active boolean DEFAULT true,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT pitch_tariffs_tariff_type_check CHECK ((tariff_type = ANY (ARRAY['WEEKDAY'::text, 'WEEKEND'::text, 'HOLIDAY'::text, 'SPECIAL'::text]))),
    CONSTRAINT valid_tariff_time CHECK (((start_time < end_time) OR (end_time = '00:00:00'::time without time zone)))
);


--
-- Name: player_ratings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.player_ratings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    match_id uuid,
    rater_id uuid,
    ratee_id uuid,
    skill_score integer,
    fair_play_score integer,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT player_ratings_fair_play_score_check CHECK (((fair_play_score >= 1) AND (fair_play_score <= 5))),
    CONSTRAINT player_ratings_skill_score_check CHECK (((skill_score >= 1) AND (skill_score <= 5)))
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    name character varying(100) NOT NULL,
    avatar_url text,
    role character varying DEFAULT 'PLAYER'::character varying,
    trust_score double precision DEFAULT 5.0,
    skill_rating double precision DEFAULT 4.0,
    ratings_history jsonb[] DEFAULT '{}'::jsonb[],
    reliability_score integer DEFAULT 100,
    is_verified boolean DEFAULT false,
    is_banned boolean DEFAULT false,
    join_date timestamp with time zone DEFAULT now(),
    push_token text,
    push_token_platform text,
    push_token_updated_at timestamp with time zone,
    notification_preferences jsonb DEFAULT '{"gk_accepted": {"enabled": true, "mandatory": true}, "gk_rejected": {"enabled": true, "mandatory": true}, "team_invite": {"enabled": true, "mandatory": true}, "match_invite": {"enabled": true, "mandatory": true}, "match_joined": {"enabled": true, "mandatory": true}, "nearby_match": {"enabled": false, "mandatory": false}, "promo_offers": {"enabled": false, "mandatory": false}, "ref_accepted": {"enabled": true, "mandatory": true}, "ref_rejected": {"enabled": true, "mandatory": true}, "weekly_summary": {"enabled": true, "mandatory": false}, "match_cancelled": {"enabled": true, "mandatory": true}, "match_reminder_1h": {"enabled": true, "mandatory": false}, "match_reminder_24h": {"enabled": true, "mandatory": false}}'::jsonb,
    last_location jsonb,
    wallet_balance numeric DEFAULT 0.0,
    updated_at timestamp with time zone DEFAULT now(),
    email text,
    phone text,
    rating numeric DEFAULT 5.0,
    is_pro boolean DEFAULT false,
    match_count integer DEFAULT 0,
    wallet numeric DEFAULT 0.0,
    ban_expires_at timestamp with time zone,
    communities jsonb DEFAULT '[]'::jsonb,
    player_card jsonb DEFAULT '{}'::jsonb,
    oyna_id text,
    friends jsonb DEFAULT '[]'::jsonb,
    is_looking_for_team boolean DEFAULT false,
    is_available boolean DEFAULT true,
    diamonds integer DEFAULT 0,
    win_count integer DEFAULT 0,
    total_matches integer DEFAULT 0,
    roles jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    CONSTRAINT profiles_reliability_score_check CHECK (((reliability_score >= 0) AND (reliability_score <= 100))),
    CONSTRAINT profiles_role_check CHECK (((role)::text = ANY (ARRAY['PLAYER'::text, 'GOALKEEPER'::text, 'REFEREE'::text, 'ADMIN'::text, 'SUPER_ADMIN'::text, 'OWNER'::text]))),
    CONSTRAINT profiles_roles_check CHECK (((roles IS NULL) OR ((jsonb_typeof(roles) = 'array'::text) AND (roles <@ '["PLAYER", "GOALKEEPER", "REFEREE", "ADMIN", "SUPER_ADMIN", "OWNER"]'::jsonb)))),
    CONSTRAINT profiles_skill_rating_check CHECK (((skill_rating >= (1.0)::double precision) AND (skill_rating <= (5.0)::double precision))),
    CONSTRAINT profiles_trust_score_check CHECK (((trust_score >= (0.0)::double precision) AND (trust_score <= (5.0)::double precision))),
    CONSTRAINT profiles_wallet_balance_non_negative CHECK ((wallet_balance >= (0)::numeric))
);


--
-- Name: push_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    notification_id uuid,
    user_id uuid NOT NULL,
    push_token text NOT NULL,
    platform text NOT NULL,
    status text DEFAULT 'pending'::text,
    apns_message_id text,
    fcm_message_id text,
    error_code text,
    error_message text,
    retry_count integer DEFAULT 0,
    sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);


--
-- Name: referees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.referees (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "authUid" uuid,
    name text NOT NULL,
    level text,
    "matchCount" integer DEFAULT 0,
    fee numeric DEFAULT 0,
    avatar text,
    rating numeric DEFAULT 0,
    style text,
    bio text,
    "preferredZones" jsonb DEFAULT '[]'::jsonb,
    "isElite" boolean DEFAULT false,
    coordinates jsonb,
    stats jsonb,
    reviews jsonb DEFAULT '[]'::jsonb,
    geohash text
);


--
-- Name: service_offers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_offers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    match_id uuid NOT NULL,
    provider_id uuid NOT NULL,
    captain_id uuid NOT NULL,
    amount integer NOT NULL,
    status text DEFAULT 'PENDING'::text,
    created_at timestamp with time zone DEFAULT now(),
    offer_date date,
    offer_time time without time zone
);


--
-- Name: settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.settings (
    id text DEFAULT 'main'::text NOT NULL,
    "appName" text DEFAULT 'OYNA'::text,
    "maintenanceMode" boolean DEFAULT false,
    "registrationOpen" boolean DEFAULT true,
    "proPrice" numeric DEFAULT 199,
    "commissionRate" numeric DEFAULT 10,
    "minRatingToPlay" numeric DEFAULT 2.5,
    "maxMatchsPerDay" integer DEFAULT 3,
    "featuredPitchId" text,
    "announcementBanner" text,
    "showAnnouncementBanner" boolean DEFAULT true,
    "payoutMode" text,
    "tacticStudio" boolean DEFAULT true,
    "motmReveal" boolean DEFAULT true,
    "aiCoach" boolean DEFAULT true,
    "scoutSystem" boolean DEFAULT true
);


--
-- Name: tactics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tactics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    "userId" uuid NOT NULL,
    mode text,
    name text NOT NULL,
    "teamName" text,
    size text,
    formation text,
    slots text,
    subs text,
    "captainId" text,
    notes text,
    opponents text,
    mentality text,
    tempo text,
    identity text,
    drawings text,
    "createdAt" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: team_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_id uuid NOT NULL,
    user_id uuid NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: teams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.teams (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    logo text,
    colors jsonb DEFAULT '[]'::jsonb,
    wins integer DEFAULT 0,
    losses integer DEFAULT 0,
    "playStyle" text,
    roster jsonb DEFAULT '[]'::jsonb,
    formation jsonb,
    level text,
    distance text,
    "winRate" text,
    "fairPlay" text,
    "avgAge" text,
    matches integer DEFAULT 0,
    pitch text,
    "time" text,
    date text,
    weather jsonb,
    "matchHistory" jsonb DEFAULT '[]'::jsonb,
    coordinates jsonb,
    stats jsonb,
    "shortName" text,
    location text,
    color1 text,
    color2 text,
    crest text,
    players jsonb DEFAULT '[]'::jsonb,
    captains jsonb DEFAULT '[]'::jsonb,
    captain uuid,
    "teamValue" text,
    rating numeric DEFAULT 0,
    "karatScore" integer DEFAULT 0,
    "teamWins" integer DEFAULT 0,
    "teamTotalMatches" integer DEFAULT 0,
    geohash text,
    captain_id uuid
);


--
-- Name: texts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.texts (
    id text DEFAULT 'global'::text NOT NULL,
    data jsonb DEFAULT '{}'::jsonb
);


--
-- Name: waitlist; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.waitlist (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    match_id uuid,
    user_id uuid,
    registered_at timestamp with time zone DEFAULT now(),
    status character varying(30) DEFAULT 'WAITING'::character varying,
    expires_at timestamp with time zone,
    CONSTRAINT waitlist_status_check CHECK (((status)::text = ANY ((ARRAY['WAITING'::character varying, 'PENDING'::character varying, 'CONFIRMED'::character varying, 'EXPIRED'::character varying, 'CANCELLED'::character varying])::text[])))
);


--
-- Name: wallet_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wallet_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    match_id uuid,
    amount numeric NOT NULL,
    type text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: booking_payments booking_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_payments
    ADD CONSTRAINT booking_payments_pkey PRIMARY KEY (id);


--
-- Name: courts courts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courts
    ADD CONSTRAINT courts_pkey PRIMARY KEY (id);


--
-- Name: friendships friendships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_pkey PRIMARY KEY (id);


--
-- Name: friendships friendships_sender_id_receiver_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_sender_id_receiver_id_key UNIQUE (sender_id, receiver_id);


--
-- Name: goalkeepers goalkeepers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goalkeepers
    ADD CONSTRAINT goalkeepers_pkey PRIMARY KEY (id);


--
-- Name: individual_matches individual_matches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.individual_matches
    ADD CONSTRAINT individual_matches_pkey PRIMARY KEY (id);


--
-- Name: match_disputes match_disputes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.match_disputes
    ADD CONSTRAINT match_disputes_pkey PRIMARY KEY (id);


--
-- Name: match_participants match_participants_match_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.match_participants
    ADD CONSTRAINT match_participants_match_id_user_id_key UNIQUE (match_id, user_id);


--
-- Name: match_participants match_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.match_participants
    ADD CONSTRAINT match_participants_pkey PRIMARY KEY (id);


--
-- Name: match_registrations match_registrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.match_registrations
    ADD CONSTRAINT match_registrations_pkey PRIMARY KEY (id);


--
-- Name: match_score_tokens match_score_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.match_score_tokens
    ADD CONSTRAINT match_score_tokens_pkey PRIMARY KEY (id);


--
-- Name: match_score_tokens match_score_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.match_score_tokens
    ADD CONSTRAINT match_score_tokens_token_key UNIQUE (token);


--
-- Name: match_tactics match_tactics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.match_tactics
    ADD CONSTRAINT match_tactics_pkey PRIMARY KEY (id);


--
-- Name: matches matches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_pkey PRIMARY KEY (id);


--
-- Name: notification_templates notification_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_templates
    ADD CONSTRAINT notification_templates_pkey PRIMARY KEY (id);


--
-- Name: notification_templates notification_templates_type_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_templates
    ADD CONSTRAINT notification_templates_type_key_key UNIQUE (type_key);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: match_score_tokens one_token_per_match; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.match_score_tokens
    ADD CONSTRAINT one_token_per_match UNIQUE (match_id);


--
-- Name: owner_withdrawal_requests owner_withdrawal_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.owner_withdrawal_requests
    ADD CONSTRAINT owner_withdrawal_requests_pkey PRIMARY KEY (id);


--
-- Name: pitch_availability_exceptions pitch_availability_exceptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pitch_availability_exceptions
    ADD CONSTRAINT pitch_availability_exceptions_pkey PRIMARY KEY (id);


--
-- Name: pitch_bookings pitch_bookings_no_overlap; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pitch_bookings
    ADD CONSTRAINT pitch_bookings_no_overlap EXCLUDE USING gist (court_id WITH =, slot_range WITH &&) WHERE (((status)::text <> 'CANCELLED'::text));


--
-- Name: pitch_bookings pitch_bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pitch_bookings
    ADD CONSTRAINT pitch_bookings_pkey PRIMARY KEY (id);


--
-- Name: pitch_debtors pitch_debtors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pitch_debtors
    ADD CONSTRAINT pitch_debtors_pkey PRIMARY KEY (id);


--
-- Name: pitch_expenses pitch_expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pitch_expenses
    ADD CONSTRAINT pitch_expenses_pkey PRIMARY KEY (id);


--
-- Name: pitch_flash_deals pitch_flash_deals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pitch_flash_deals
    ADD CONSTRAINT pitch_flash_deals_pkey PRIMARY KEY (id);


--
-- Name: pitch_slot_holds pitch_slot_holds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pitch_slot_holds
    ADD CONSTRAINT pitch_slot_holds_pkey PRIMARY KEY (id);


--
-- Name: pitch_subscriptions pitch_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pitch_subscriptions
    ADD CONSTRAINT pitch_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: pitch_tariffs pitch_tariffs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pitch_tariffs
    ADD CONSTRAINT pitch_tariffs_pkey PRIMARY KEY (id);


--
-- Name: pitches pitches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pitches
    ADD CONSTRAINT pitches_pkey PRIMARY KEY (id);


--
-- Name: player_ratings player_ratings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_ratings
    ADD CONSTRAINT player_ratings_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_oyna_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_oyna_id_key UNIQUE (oyna_id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: push_log push_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_log
    ADD CONSTRAINT push_log_pkey PRIMARY KEY (id);


--
-- Name: referees referees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referees
    ADD CONSTRAINT referees_pkey PRIMARY KEY (id);


--
-- Name: service_offers service_offers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_offers
    ADD CONSTRAINT service_offers_pkey PRIMARY KEY (id);


--
-- Name: settings settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (id);


--
-- Name: tactics tactics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tactics
    ADD CONSTRAINT tactics_pkey PRIMARY KEY (id);


--
-- Name: team_members team_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_pkey PRIMARY KEY (id);


--
-- Name: team_members team_members_team_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_team_id_user_id_key UNIQUE (team_id, user_id);


--
-- Name: teams teams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_pkey PRIMARY KEY (id);


--
-- Name: texts texts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.texts
    ADD CONSTRAINT texts_pkey PRIMARY KEY (id);


--
-- Name: player_ratings unique_rating_per_match; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_ratings
    ADD CONSTRAINT unique_rating_per_match UNIQUE (match_id, rater_id, ratee_id);


--
-- Name: pitch_slot_holds unique_slot_hold; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pitch_slot_holds
    ADD CONSTRAINT unique_slot_hold UNIQUE (pitch_id, court_id, booking_date, start_time);


--
-- Name: match_registrations unique_slot_per_match; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.match_registrations
    ADD CONSTRAINT unique_slot_per_match UNIQUE (match_id, slot_id);


--
-- Name: match_registrations unique_user_per_match; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.match_registrations
    ADD CONSTRAINT unique_user_per_match UNIQUE (match_id, user_id);


--
-- Name: waitlist waitlist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waitlist
    ADD CONSTRAINT waitlist_pkey PRIMARY KEY (id);


--
-- Name: wallet_transactions wallet_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_transactions
    ADD CONSTRAINT wallet_transactions_pkey PRIMARY KEY (id);


--
-- Name: courts_pitch_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX courts_pitch_id_idx ON public.courts USING btree (pitch_id);


--
-- Name: idx_booking_payments_booking; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_booking_payments_booking ON public.booking_payments USING btree (booking_id);


--
-- Name: idx_fk_audit_logs_admin_id_fkey; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fk_audit_logs_admin_id_fkey ON public.audit_logs USING btree (admin_id);


--
-- Name: idx_fk_booking_payments_recorded_by_fkey; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fk_booking_payments_recorded_by_fkey ON public.booking_payments USING btree (recorded_by);


--
-- Name: idx_fk_friendships_receiver_id_fkey; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fk_friendships_receiver_id_fkey ON public.friendships USING btree (receiver_id);


--
-- Name: idx_fk_individual_matches_pitch_id_fkey; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fk_individual_matches_pitch_id_fkey ON public.individual_matches USING btree (pitch_id);


--
-- Name: idx_fk_match_disputes_match_id_fkey; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fk_match_disputes_match_id_fkey ON public.match_disputes USING btree (match_id);


--
-- Name: idx_fk_match_disputes_raised_by_fkey; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fk_match_disputes_raised_by_fkey ON public.match_disputes USING btree (raised_by);


--
-- Name: idx_fk_match_disputes_resolved_by_fkey; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fk_match_disputes_resolved_by_fkey ON public.match_disputes USING btree (resolved_by);


--
-- Name: idx_fk_match_participants_user_id_fkey; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fk_match_participants_user_id_fkey ON public.match_participants USING btree (user_id);


--
-- Name: idx_fk_match_registrations_user_id_fkey; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fk_match_registrations_user_id_fkey ON public.match_registrations USING btree (user_id);


--
-- Name: idx_fk_match_score_tokens_used_by_fkey; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fk_match_score_tokens_used_by_fkey ON public.match_score_tokens USING btree (used_by);


--
-- Name: idx_fk_matches_captain_id_fkey; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fk_matches_captain_id_fkey ON public.matches USING btree (captain_id);


--
-- Name: idx_fk_notifications_match_id_fkey; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fk_notifications_match_id_fkey ON public.notifications USING btree (match_id);


--
-- Name: idx_fk_notifications_sender_id_fkey; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fk_notifications_sender_id_fkey ON public.notifications USING btree (sender_id);


--
-- Name: idx_fk_notifications_team_id_fkey; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fk_notifications_team_id_fkey ON public.notifications USING btree (team_id);


--
-- Name: idx_fk_notifications_user_id_fkey; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fk_notifications_user_id_fkey ON public.notifications USING btree (user_id);


--
-- Name: idx_fk_owner_withdrawal_requests_pitch_id_fkey; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fk_owner_withdrawal_requests_pitch_id_fkey ON public.owner_withdrawal_requests USING btree (pitch_id);


--
-- Name: idx_fk_owner_withdrawal_requests_processed_by_fkey; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fk_owner_withdrawal_requests_processed_by_fkey ON public.owner_withdrawal_requests USING btree (processed_by);


--
-- Name: idx_fk_pitch_availability_exceptions_court_id_fkey; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fk_pitch_availability_exceptions_court_id_fkey ON public.pitch_availability_exceptions USING btree (court_id);


--
-- Name: idx_fk_pitch_bookings_cancelled_by_fkey; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fk_pitch_bookings_cancelled_by_fkey ON public.pitch_bookings USING btree (cancelled_by);


--
-- Name: idx_fk_pitch_bookings_match_id_fkey; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fk_pitch_bookings_match_id_fkey ON public.pitch_bookings USING btree (match_id);


--
-- Name: idx_fk_pitch_bookings_tariff_id_fkey; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fk_pitch_bookings_tariff_id_fkey ON public.pitch_bookings USING btree (tariff_id);


--
-- Name: idx_fk_pitch_bookings_user_id_fkey; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fk_pitch_bookings_user_id_fkey ON public.pitch_bookings USING btree (user_id);


--
-- Name: idx_fk_pitch_debtors_oyna_user_id_fkey; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fk_pitch_debtors_oyna_user_id_fkey ON public.pitch_debtors USING btree (oyna_user_id);


--
-- Name: idx_fk_pitch_expenses_created_by_fkey; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fk_pitch_expenses_created_by_fkey ON public.pitch_expenses USING btree (created_by);


--
-- Name: idx_fk_pitch_flash_deals_claimed_by_fkey; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fk_pitch_flash_deals_claimed_by_fkey ON public.pitch_flash_deals USING btree (claimed_by);


--
-- Name: idx_fk_pitch_flash_deals_court_id_fkey; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fk_pitch_flash_deals_court_id_fkey ON public.pitch_flash_deals USING btree (court_id);


--
-- Name: idx_fk_pitch_slot_holds_court_id_fkey; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fk_pitch_slot_holds_court_id_fkey ON public.pitch_slot_holds USING btree (court_id);


--
-- Name: idx_fk_pitch_slot_holds_held_by_fkey; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fk_pitch_slot_holds_held_by_fkey ON public.pitch_slot_holds USING btree (held_by);


--
-- Name: idx_fk_pitch_subscriptions_user_id_fkey; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fk_pitch_subscriptions_user_id_fkey ON public.pitch_subscriptions USING btree (user_id);


--
-- Name: idx_fk_pitch_tariffs_court_id_fkey; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fk_pitch_tariffs_court_id_fkey ON public.pitch_tariffs USING btree (court_id);


--
-- Name: idx_fk_player_ratings_ratee_id_fkey; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fk_player_ratings_ratee_id_fkey ON public.player_ratings USING btree (ratee_id);


--
-- Name: idx_fk_player_ratings_rater_id_fkey; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fk_player_ratings_rater_id_fkey ON public.player_ratings USING btree (rater_id);


--
-- Name: idx_fk_push_log_notification_id_fkey; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fk_push_log_notification_id_fkey ON public.push_log USING btree (notification_id);


--
-- Name: idx_fk_service_offers_captain_id_fkey; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fk_service_offers_captain_id_fkey ON public.service_offers USING btree (captain_id);


--
-- Name: idx_fk_service_offers_match_id_fkey; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fk_service_offers_match_id_fkey ON public.service_offers USING btree (match_id);


--
-- Name: idx_fk_service_offers_provider_id_fkey; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fk_service_offers_provider_id_fkey ON public.service_offers USING btree (provider_id);


--
-- Name: idx_fk_tactics_userId_fkey; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx_fk_tactics_userId_fkey" ON public.tactics USING btree ("userId");


--
-- Name: idx_fk_team_members_user_id_fkey; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fk_team_members_user_id_fkey ON public.team_members USING btree (user_id);


--
-- Name: idx_fk_teams_captain_id_fkey; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fk_teams_captain_id_fkey ON public.teams USING btree (captain_id);


--
-- Name: idx_fk_waitlist_user_id_fkey; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fk_waitlist_user_id_fkey ON public.waitlist USING btree (user_id);


--
-- Name: idx_fk_wallet_transactions_match_id_fkey; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fk_wallet_transactions_match_id_fkey ON public.wallet_transactions USING btree (match_id);


--
-- Name: idx_fk_wallet_transactions_user_id_fkey; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_fk_wallet_transactions_user_id_fkey ON public.wallet_transactions USING btree (user_id);


--
-- Name: idx_flash_deals_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_flash_deals_active ON public.pitch_flash_deals USING btree (pitch_id, expires_at) WHERE (is_claimed = false);


--
-- Name: idx_match_disputes_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_match_disputes_status ON public.match_disputes USING btree (status);


--
-- Name: idx_pitch_bookings_pitch_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pitch_bookings_pitch_date ON public.pitch_bookings USING btree (pitch_id, booking_date);


--
-- Name: idx_pitch_bookings_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pitch_bookings_status ON public.pitch_bookings USING btree (status);


--
-- Name: idx_pitch_debtors_pitch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pitch_debtors_pitch ON public.pitch_debtors USING btree (pitch_id) WHERE (is_resolved = false);


--
-- Name: idx_pitch_exceptions_pitch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pitch_exceptions_pitch ON public.pitch_availability_exceptions USING btree (pitch_id, exception_date);


--
-- Name: idx_pitch_expenses_pitch_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pitch_expenses_pitch_date ON public.pitch_expenses USING btree (pitch_id, expense_date);


--
-- Name: idx_pitch_tariffs_pitch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pitch_tariffs_pitch ON public.pitch_tariffs USING btree (pitch_id);


--
-- Name: idx_pitches_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pitches_owner ON public.pitches USING btree (owner_id);


--
-- Name: idx_pitches_verification_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pitches_verification_status ON public.pitches USING btree (verification_status);


--
-- Name: idx_push_log_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_push_log_created_at ON public.push_log USING btree (created_at DESC);


--
-- Name: idx_push_log_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_push_log_status ON public.push_log USING btree (status);


--
-- Name: idx_push_log_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_push_log_user_id ON public.push_log USING btree (user_id);


--
-- Name: idx_slot_holds_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_slot_holds_lookup ON public.pitch_slot_holds USING btree (pitch_id, court_id, booking_date, start_time);


--
-- Name: idx_withdrawals_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_withdrawals_owner ON public.owner_withdrawal_requests USING btree (owner_id);


--
-- Name: idx_withdrawals_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_withdrawals_status ON public.owner_withdrawal_requests USING btree (status);


--
-- Name: pitch_bookings_court_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pitch_bookings_court_date_idx ON public.pitch_bookings USING btree (court_id, booking_date);


--
-- Name: pitch_bookings_subscription_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pitch_bookings_subscription_idx ON public.pitch_bookings USING btree (subscription_id);


--
-- Name: pitch_subscriptions_court_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pitch_subscriptions_court_idx ON public.pitch_subscriptions USING btree (court_id);


--
-- Name: pitch_subscriptions_pitch_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pitch_subscriptions_pitch_idx ON public.pitch_subscriptions USING btree (pitch_id);


--
-- Name: pitches_geo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pitches_geo_idx ON public.pitches USING gist (public.ll_to_earth(latitude, longitude));


--
-- Name: unique_active_waitlist; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX unique_active_waitlist ON public.waitlist USING btree (match_id, user_id) WHERE ((status)::text = ANY ((ARRAY['WAITING'::character varying, 'PENDING'::character varying, 'CONFIRMED'::character varying])::text[]));


--
-- Name: matches on_match_cancelled; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_match_cancelled AFTER UPDATE OF status ON public.matches FOR EACH ROW EXECUTE FUNCTION public.notify_match_cancelled();


--
-- Name: match_participants on_match_participant_joined; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_match_participant_joined AFTER INSERT ON public.match_participants FOR EACH ROW EXECUTE FUNCTION public.notify_match_joined();


--
-- Name: matches on_match_ref_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_match_ref_change AFTER UPDATE OF "refereeId" ON public.matches FOR EACH ROW EXECUTE FUNCTION public.notify_ref_status_change();


--
-- Name: player_ratings on_player_rating_added; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_player_rating_added AFTER INSERT ON public.player_ratings FOR EACH ROW EXECUTE FUNCTION public.update_user_skill_rating();


--
-- Name: notifications send_push_on_notification; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER send_push_on_notification AFTER INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.notify_send_push_webhook();


--
-- Name: service_offers trg_check_match_conflict; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_check_match_conflict BEFORE UPDATE ON public.service_offers FOR EACH ROW EXECUTE FUNCTION public.check_match_conflict();


--
-- Name: pitches trg_enforce_tariff_before_open; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_tariff_before_open BEFORE UPDATE OF is_open ON public.pitches FOR EACH ROW EXECUTE FUNCTION public.enforce_tariff_before_open();


--
-- Name: pitch_bookings trg_notify_booking_ins; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_booking_ins AFTER INSERT ON public.pitch_bookings FOR EACH ROW EXECUTE FUNCTION public.notify_booking_events();


--
-- Name: pitch_bookings trg_notify_booking_upd; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notify_booking_upd AFTER UPDATE OF status ON public.pitch_bookings FOR EACH ROW EXECUTE FUNCTION public.notify_booking_events();


--
-- Name: pitch_bookings trg_pitch_bookings_slot_range; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pitch_bookings_slot_range BEFORE INSERT OR UPDATE ON public.pitch_bookings FOR EACH ROW EXECUTE FUNCTION public.pitch_bookings_set_slot_range();


--
-- Name: goalkeepers trg_protect_gk_fields; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_protect_gk_fields BEFORE UPDATE ON public.goalkeepers FOR EACH ROW EXECUTE FUNCTION public.protect_provider_sensitive_fields();


--
-- Name: profiles trg_protect_profile_columns; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_protect_profile_columns BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.protect_profile_columns();


--
-- Name: referees trg_protect_ref_fields; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_protect_ref_fields BEFORE UPDATE ON public.referees FOR EACH ROW EXECUTE FUNCTION public.protect_provider_sensitive_fields();


--
-- Name: booking_payments trg_update_booking_paid; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_update_booking_paid AFTER INSERT ON public.booking_payments FOR EACH ROW EXECUTE FUNCTION public.update_booking_paid_amount();


--
-- Name: audit_logs audit_logs_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: booking_payments booking_payments_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_payments
    ADD CONSTRAINT booking_payments_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.pitch_bookings(id) ON DELETE CASCADE;


--
-- Name: booking_payments booking_payments_recorded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_payments
    ADD CONSTRAINT booking_payments_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: courts courts_pitch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courts
    ADD CONSTRAINT courts_pitch_id_fkey FOREIGN KEY (pitch_id) REFERENCES public.pitches(id) ON DELETE CASCADE;


--
-- Name: friendships friendships_receiver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_receiver_id_fkey FOREIGN KEY (receiver_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: friendships friendships_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.friendships
    ADD CONSTRAINT friendships_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: individual_matches individual_matches_pitch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.individual_matches
    ADD CONSTRAINT individual_matches_pitch_id_fkey FOREIGN KEY (pitch_id) REFERENCES public.pitches(id) ON DELETE RESTRICT;


--
-- Name: match_disputes match_disputes_match_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.match_disputes
    ADD CONSTRAINT match_disputes_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE CASCADE;


--
-- Name: match_disputes match_disputes_raised_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.match_disputes
    ADD CONSTRAINT match_disputes_raised_by_fkey FOREIGN KEY (raised_by) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: match_disputes match_disputes_resolved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.match_disputes
    ADD CONSTRAINT match_disputes_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: match_participants match_participants_match_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.match_participants
    ADD CONSTRAINT match_participants_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE CASCADE;


--
-- Name: match_participants match_participants_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.match_participants
    ADD CONSTRAINT match_participants_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: match_registrations match_registrations_match_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.match_registrations
    ADD CONSTRAINT match_registrations_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.individual_matches(id) ON DELETE CASCADE;


--
-- Name: match_registrations match_registrations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.match_registrations
    ADD CONSTRAINT match_registrations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: match_score_tokens match_score_tokens_match_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.match_score_tokens
    ADD CONSTRAINT match_score_tokens_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE CASCADE;


--
-- Name: match_score_tokens match_score_tokens_used_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.match_score_tokens
    ADD CONSTRAINT match_score_tokens_used_by_fkey FOREIGN KEY (used_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: matches matches_captain_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.matches
    ADD CONSTRAINT matches_captain_id_fkey FOREIGN KEY (captain_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: notifications notifications_match_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE SET NULL;


--
-- Name: notifications notifications_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: notifications notifications_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE SET NULL;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: owner_withdrawal_requests owner_withdrawal_requests_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.owner_withdrawal_requests
    ADD CONSTRAINT owner_withdrawal_requests_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: owner_withdrawal_requests owner_withdrawal_requests_pitch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.owner_withdrawal_requests
    ADD CONSTRAINT owner_withdrawal_requests_pitch_id_fkey FOREIGN KEY (pitch_id) REFERENCES public.pitches(id) ON DELETE CASCADE;


--
-- Name: owner_withdrawal_requests owner_withdrawal_requests_processed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.owner_withdrawal_requests
    ADD CONSTRAINT owner_withdrawal_requests_processed_by_fkey FOREIGN KEY (processed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: pitch_availability_exceptions pitch_availability_exceptions_court_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pitch_availability_exceptions
    ADD CONSTRAINT pitch_availability_exceptions_court_id_fkey FOREIGN KEY (court_id) REFERENCES public.courts(id) ON DELETE CASCADE;


--
-- Name: pitch_availability_exceptions pitch_availability_exceptions_pitch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pitch_availability_exceptions
    ADD CONSTRAINT pitch_availability_exceptions_pitch_id_fkey FOREIGN KEY (pitch_id) REFERENCES public.pitches(id) ON DELETE CASCADE;


--
-- Name: pitch_bookings pitch_bookings_cancelled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pitch_bookings
    ADD CONSTRAINT pitch_bookings_cancelled_by_fkey FOREIGN KEY (cancelled_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: pitch_bookings pitch_bookings_court_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pitch_bookings
    ADD CONSTRAINT pitch_bookings_court_id_fkey FOREIGN KEY (court_id) REFERENCES public.courts(id) ON DELETE CASCADE;


--
-- Name: pitch_bookings pitch_bookings_match_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pitch_bookings
    ADD CONSTRAINT pitch_bookings_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE SET NULL;


--
-- Name: pitch_bookings pitch_bookings_pitch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pitch_bookings
    ADD CONSTRAINT pitch_bookings_pitch_id_fkey FOREIGN KEY (pitch_id) REFERENCES public.pitches(id) ON DELETE CASCADE;


--
-- Name: pitch_bookings pitch_bookings_subscription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pitch_bookings
    ADD CONSTRAINT pitch_bookings_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.pitch_subscriptions(id) ON DELETE CASCADE;


--
-- Name: pitch_bookings pitch_bookings_tariff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pitch_bookings
    ADD CONSTRAINT pitch_bookings_tariff_id_fkey FOREIGN KEY (tariff_id) REFERENCES public.pitch_tariffs(id) ON DELETE SET NULL;


--
-- Name: pitch_bookings pitch_bookings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pitch_bookings
    ADD CONSTRAINT pitch_bookings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: pitch_debtors pitch_debtors_oyna_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pitch_debtors
    ADD CONSTRAINT pitch_debtors_oyna_user_id_fkey FOREIGN KEY (oyna_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: pitch_debtors pitch_debtors_pitch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pitch_debtors
    ADD CONSTRAINT pitch_debtors_pitch_id_fkey FOREIGN KEY (pitch_id) REFERENCES public.pitches(id) ON DELETE CASCADE;


--
-- Name: pitch_expenses pitch_expenses_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pitch_expenses
    ADD CONSTRAINT pitch_expenses_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: pitch_expenses pitch_expenses_pitch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pitch_expenses
    ADD CONSTRAINT pitch_expenses_pitch_id_fkey FOREIGN KEY (pitch_id) REFERENCES public.pitches(id) ON DELETE CASCADE;


--
-- Name: pitch_flash_deals pitch_flash_deals_claimed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pitch_flash_deals
    ADD CONSTRAINT pitch_flash_deals_claimed_by_fkey FOREIGN KEY (claimed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: pitch_flash_deals pitch_flash_deals_court_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pitch_flash_deals
    ADD CONSTRAINT pitch_flash_deals_court_id_fkey FOREIGN KEY (court_id) REFERENCES public.courts(id) ON DELETE CASCADE;


--
-- Name: pitch_flash_deals pitch_flash_deals_pitch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pitch_flash_deals
    ADD CONSTRAINT pitch_flash_deals_pitch_id_fkey FOREIGN KEY (pitch_id) REFERENCES public.pitches(id) ON DELETE CASCADE;


--
-- Name: pitch_slot_holds pitch_slot_holds_court_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pitch_slot_holds
    ADD CONSTRAINT pitch_slot_holds_court_id_fkey FOREIGN KEY (court_id) REFERENCES public.courts(id) ON DELETE CASCADE;


--
-- Name: pitch_slot_holds pitch_slot_holds_held_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pitch_slot_holds
    ADD CONSTRAINT pitch_slot_holds_held_by_fkey FOREIGN KEY (held_by) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: pitch_slot_holds pitch_slot_holds_pitch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pitch_slot_holds
    ADD CONSTRAINT pitch_slot_holds_pitch_id_fkey FOREIGN KEY (pitch_id) REFERENCES public.pitches(id) ON DELETE CASCADE;


--
-- Name: pitch_subscriptions pitch_subscriptions_court_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pitch_subscriptions
    ADD CONSTRAINT pitch_subscriptions_court_id_fkey FOREIGN KEY (court_id) REFERENCES public.courts(id) ON DELETE CASCADE;


--
-- Name: pitch_subscriptions pitch_subscriptions_pitch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pitch_subscriptions
    ADD CONSTRAINT pitch_subscriptions_pitch_id_fkey FOREIGN KEY (pitch_id) REFERENCES public.pitches(id) ON DELETE CASCADE;


--
-- Name: pitch_subscriptions pitch_subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pitch_subscriptions
    ADD CONSTRAINT pitch_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: pitch_tariffs pitch_tariffs_court_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pitch_tariffs
    ADD CONSTRAINT pitch_tariffs_court_id_fkey FOREIGN KEY (court_id) REFERENCES public.courts(id) ON DELETE CASCADE;


--
-- Name: pitch_tariffs pitch_tariffs_pitch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pitch_tariffs
    ADD CONSTRAINT pitch_tariffs_pitch_id_fkey FOREIGN KEY (pitch_id) REFERENCES public.pitches(id) ON DELETE CASCADE;


--
-- Name: pitches pitches_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pitches
    ADD CONSTRAINT pitches_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: player_ratings player_ratings_match_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_ratings
    ADD CONSTRAINT player_ratings_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.individual_matches(id) ON DELETE CASCADE;


--
-- Name: player_ratings player_ratings_ratee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_ratings
    ADD CONSTRAINT player_ratings_ratee_id_fkey FOREIGN KEY (ratee_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: player_ratings player_ratings_rater_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.player_ratings
    ADD CONSTRAINT player_ratings_rater_id_fkey FOREIGN KEY (rater_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: push_log push_log_notification_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_log
    ADD CONSTRAINT push_log_notification_id_fkey FOREIGN KEY (notification_id) REFERENCES public.notifications(id) ON DELETE CASCADE;


--
-- Name: push_log push_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_log
    ADD CONSTRAINT push_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: service_offers service_offers_captain_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_offers
    ADD CONSTRAINT service_offers_captain_id_fkey FOREIGN KEY (captain_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: service_offers service_offers_match_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_offers
    ADD CONSTRAINT service_offers_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.matches(id) ON DELETE CASCADE;


--
-- Name: service_offers service_offers_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_offers
    ADD CONSTRAINT service_offers_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: tactics tactics_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tactics
    ADD CONSTRAINT "tactics_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: team_members team_members_team_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE CASCADE;


--
-- Name: team_members team_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: teams teams_captain_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teams
    ADD CONSTRAINT teams_captain_id_fkey FOREIGN KEY (captain_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: waitlist waitlist_match_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waitlist
    ADD CONSTRAINT waitlist_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.individual_matches(id) ON DELETE CASCADE;


--
-- Name: waitlist waitlist_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.waitlist
    ADD CONSTRAINT waitlist_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: wallet_transactions wallet_transactions_match_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_transactions
    ADD CONSTRAINT wallet_transactions_match_id_fkey FOREIGN KEY (match_id) REFERENCES public.matches(id);


--
-- Name: wallet_transactions wallet_transactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_transactions
    ADD CONSTRAINT wallet_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: notification_templates Anyone authenticated can read templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone authenticated can read templates" ON public.notification_templates FOR SELECT TO authenticated USING (true);


--
-- Name: service_offers Anyone can view their own offers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Anyone can view their own offers" ON public.service_offers FOR SELECT USING (((( SELECT auth.uid() AS uid) = provider_id) OR (( SELECT auth.uid() AS uid) = captain_id)));


--
-- Name: service_offers Captains can create offers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Captains can create offers" ON public.service_offers FOR INSERT WITH CHECK ((( SELECT auth.uid() AS uid) = captain_id));


--
-- Name: courts Courts viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Courts viewable by everyone" ON public.courts FOR SELECT USING (true);


--
-- Name: pitch_availability_exceptions Exceptions publicly viewable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Exceptions publicly viewable" ON public.pitch_availability_exceptions FOR SELECT USING (true);


--
-- Name: pitch_flash_deals Flash deals publicly viewable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Flash deals publicly viewable" ON public.pitch_flash_deals FOR SELECT USING (true);


--
-- Name: referees Herkes hakemleri görebilir; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Herkes hakemleri görebilir" ON public.referees FOR SELECT USING (true);


--
-- Name: goalkeepers Herkes kalecileri görebilir; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Herkes kalecileri görebilir" ON public.goalkeepers FOR SELECT USING (true);


--
-- Name: match_tactics Herkes maç taktiklerini görebilir; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Herkes maç taktiklerini görebilir" ON public.match_tactics FOR SELECT USING (true);


--
-- Name: texts Herkes metinleri görebilir; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Herkes metinleri görebilir" ON public.texts FOR SELECT USING (true);


--
-- Name: team_members Herkes takım üyelerini görebilir; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Herkes takım üyelerini görebilir" ON public.team_members FOR SELECT USING (true);


--
-- Name: pitch_slot_holds Holds are viewable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Holds are viewable by everyone" ON public.pitch_slot_holds FOR SELECT USING (true);


--
-- Name: individual_matches Matches are viewable by everyone.; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Matches are viewable by everyone." ON public.individual_matches FOR SELECT USING (true);


--
-- Name: service_offers Providers can update their offers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Providers can update their offers" ON public.service_offers FOR UPDATE USING ((( SELECT auth.uid() AS uid) = provider_id));


--
-- Name: match_registrations Registrations are viewable by everyone.; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Registrations are viewable by everyone." ON public.match_registrations FOR SELECT USING (true);


--
-- Name: notifications Service role can insert notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can insert notifications" ON public.notifications FOR INSERT TO service_role WITH CHECK (true);


--
-- Name: notification_templates Service role can manage templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage templates" ON public.notification_templates TO service_role USING (true) WITH CHECK (true);


--
-- Name: notifications Service role can update push status; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can update push status" ON public.notifications FOR UPDATE TO service_role USING (true) WITH CHECK (true);


--
-- Name: match_participants Service role manages all participants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role manages all participants" ON public.match_participants TO service_role USING (true) WITH CHECK (true);


--
-- Name: profiles Service role manages all profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role manages all profiles" ON public.profiles TO service_role USING (true) WITH CHECK (true);


--
-- Name: push_log Service role manages push logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role manages push logs" ON public.push_log TO service_role USING (true) WITH CHECK (true);


--
-- Name: pitch_tariffs Tariffs are publicly viewable; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Tariffs are publicly viewable" ON public.pitch_tariffs FOR SELECT USING (true);


--
-- Name: goalkeepers Users can insert their own goalkeeper profile.; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own goalkeeper profile." ON public.goalkeepers FOR INSERT WITH CHECK ((( SELECT auth.uid() AS uid) = id));


--
-- Name: referees Users can insert their own referee profile.; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert their own referee profile." ON public.referees FOR INSERT WITH CHECK ((( SELECT auth.uid() AS uid) = id));


--
-- Name: goalkeepers Users can update their own goalkeeper profile.; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own goalkeeper profile." ON public.goalkeepers FOR UPDATE USING ((( SELECT auth.uid() AS uid) = id));


--
-- Name: referees Users can update their own referee profile.; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update their own referee profile." ON public.referees FOR UPDATE USING ((( SELECT auth.uid() AS uid) = id));


--
-- Name: match_participants Users can view match participants; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view match participants" ON public.match_participants FOR SELECT TO authenticated USING (true);


--
-- Name: push_log Users can view own push logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own push logs" ON public.push_log FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: waitlist Waitlist viewable by everyone.; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Waitlist viewable by everyone." ON public.waitlist FOR SELECT USING (true);


--
-- Name: audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_logs audit_logs_insert_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_logs_insert_admin ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (public.is_admin());


--
-- Name: audit_logs audit_logs_select_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_logs_select_admin ON public.audit_logs FOR SELECT TO authenticated USING (public.is_admin());


--
-- Name: booking_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.booking_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: booking_payments booking_payments_manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY booking_payments_manage ON public.booking_payments TO authenticated USING (((EXISTS ( SELECT 1
   FROM (public.pitch_bookings pb
     JOIN public.pitches p ON ((p.id = pb.pitch_id)))
  WHERE ((pb.id = booking_payments.booking_id) AND (p.owner_id = ( SELECT auth.uid() AS uid))))) OR public.is_admin())) WITH CHECK (((EXISTS ( SELECT 1
   FROM (public.pitch_bookings pb
     JOIN public.pitches p ON ((p.id = pb.pitch_id)))
  WHERE ((pb.id = booking_payments.booking_id) AND (p.owner_id = ( SELECT auth.uid() AS uid))))) OR public.is_admin()));


--
-- Name: courts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.courts ENABLE ROW LEVEL SECURITY;

--
-- Name: courts courts_write_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY courts_write_delete ON public.courts FOR DELETE TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.pitches p
  WHERE ((p.id = courts.pitch_id) AND (p.owner_id = ( SELECT auth.uid() AS uid))))) OR public.is_admin()));


--
-- Name: courts courts_write_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY courts_write_insert ON public.courts FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1
   FROM public.pitches p
  WHERE ((p.id = courts.pitch_id) AND (p.owner_id = ( SELECT auth.uid() AS uid))))) OR public.is_admin()));


--
-- Name: courts courts_write_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY courts_write_update ON public.courts FOR UPDATE TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.pitches p
  WHERE ((p.id = courts.pitch_id) AND (p.owner_id = ( SELECT auth.uid() AS uid))))) OR public.is_admin())) WITH CHECK (((EXISTS ( SELECT 1
   FROM public.pitches p
  WHERE ((p.id = courts.pitch_id) AND (p.owner_id = ( SELECT auth.uid() AS uid))))) OR public.is_admin()));


--
-- Name: friendships fr_delete_participant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fr_delete_participant ON public.friendships FOR DELETE USING (((( SELECT auth.uid() AS uid) = sender_id) OR (( SELECT auth.uid() AS uid) = receiver_id)));


--
-- Name: friendships fr_insert_sender; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fr_insert_sender ON public.friendships FOR INSERT WITH CHECK ((( SELECT auth.uid() AS uid) = sender_id));


--
-- Name: friendships fr_select_participant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fr_select_participant ON public.friendships FOR SELECT USING (((( SELECT auth.uid() AS uid) = sender_id) OR (( SELECT auth.uid() AS uid) = receiver_id)));


--
-- Name: friendships fr_update_participant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY fr_update_participant ON public.friendships FOR UPDATE USING (((( SELECT auth.uid() AS uid) = sender_id) OR (( SELECT auth.uid() AS uid) = receiver_id)));


--
-- Name: friendships; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

--
-- Name: goalkeepers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.goalkeepers ENABLE ROW LEVEL SECURITY;

--
-- Name: individual_matches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.individual_matches ENABLE ROW LEVEL SECURITY;

--
-- Name: individual_matches individual_matches_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY individual_matches_delete_admin ON public.individual_matches FOR DELETE TO authenticated USING (public.is_admin());


--
-- Name: individual_matches individual_matches_insert_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY individual_matches_insert_admin ON public.individual_matches FOR INSERT TO authenticated WITH CHECK (public.is_admin());


--
-- Name: individual_matches individual_matches_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY individual_matches_update_admin ON public.individual_matches FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: match_disputes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.match_disputes ENABLE ROW LEVEL SECURITY;

--
-- Name: match_disputes match_disputes_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY match_disputes_delete_admin ON public.match_disputes FOR DELETE TO authenticated USING (public.is_admin());


--
-- Name: match_disputes match_disputes_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY match_disputes_insert ON public.match_disputes FOR INSERT TO authenticated WITH CHECK (((raised_by = ( SELECT auth.uid() AS uid)) OR public.is_admin()));


--
-- Name: match_disputes match_disputes_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY match_disputes_select ON public.match_disputes FOR SELECT TO authenticated USING (((raised_by = ( SELECT auth.uid() AS uid)) OR public.is_admin()));


--
-- Name: match_disputes match_disputes_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY match_disputes_update_admin ON public.match_disputes FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: match_participants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.match_participants ENABLE ROW LEVEL SECURITY;

--
-- Name: match_participants match_participants_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY match_participants_delete ON public.match_participants FOR DELETE TO authenticated USING (((( SELECT auth.uid() AS uid) = user_id) OR (EXISTS ( SELECT 1
   FROM public.matches m
  WHERE ((m.id = match_participants.match_id) AND (m."creatorId" = ( SELECT auth.uid() AS uid)))))));


--
-- Name: match_participants match_participants_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY match_participants_insert ON public.match_participants FOR INSERT TO authenticated WITH CHECK (((( SELECT auth.uid() AS uid) = user_id) OR (EXISTS ( SELECT 1
   FROM public.matches m
  WHERE ((m.id = match_participants.match_id) AND (m."creatorId" = ( SELECT auth.uid() AS uid)))))));


--
-- Name: match_participants match_participants_update_captain; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY match_participants_update_captain ON public.match_participants FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.matches m
  WHERE ((m.id = match_participants.match_id) AND (m."creatorId" = ( SELECT auth.uid() AS uid)))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.matches m
  WHERE ((m.id = match_participants.match_id) AND (m."creatorId" = ( SELECT auth.uid() AS uid))))));


--
-- Name: match_registrations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.match_registrations ENABLE ROW LEVEL SECURITY;

--
-- Name: match_registrations match_registrations_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY match_registrations_delete_admin ON public.match_registrations FOR DELETE TO authenticated USING (public.is_admin());


--
-- Name: match_registrations match_registrations_insert_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY match_registrations_insert_admin ON public.match_registrations FOR INSERT TO authenticated WITH CHECK (public.is_admin());


--
-- Name: match_registrations match_registrations_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY match_registrations_update_admin ON public.match_registrations FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: match_score_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.match_score_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: match_score_tokens match_score_tokens_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY match_score_tokens_select ON public.match_score_tokens FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.matches m
  WHERE ((m.id = match_score_tokens.match_id) AND ((m.captain_id = ( SELECT auth.uid() AS uid)) OR (m."creatorId" = ( SELECT auth.uid() AS uid)) OR (m."refereeId" = ( SELECT auth.uid() AS uid)))))) OR (EXISTS ( SELECT 1
   FROM (public.pitch_bookings pb
     JOIN public.pitches p ON ((p.id = pb.pitch_id)))
  WHERE ((pb.match_id = match_score_tokens.match_id) AND (p.owner_id = ( SELECT auth.uid() AS uid))))) OR public.is_admin()));


--
-- Name: match_tactics; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.match_tactics ENABLE ROW LEVEL SECURITY;

--
-- Name: matches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

--
-- Name: matches matches_delete_creator_or_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY matches_delete_creator_or_admin ON public.matches FOR DELETE TO authenticated USING (((( SELECT auth.uid() AS uid) = captain_id) OR public.is_admin()));


--
-- Name: matches matches_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY matches_insert_own ON public.matches FOR INSERT TO authenticated WITH CHECK ((captain_id = ( SELECT auth.uid() AS uid)));


--
-- Name: matches matches_select_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY matches_select_public ON public.matches FOR SELECT USING (true);


--
-- Name: matches matches_update_creator_or_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY matches_update_creator_or_admin ON public.matches FOR UPDATE TO authenticated USING (((( SELECT auth.uid() AS uid) = captain_id) OR public.is_admin())) WITH CHECK (((( SELECT auth.uid() AS uid) = captain_id) OR public.is_admin()));


--
-- Name: match_tactics mt_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mt_delete ON public.match_tactics FOR DELETE USING ((( SELECT auth.role() AS role) = 'authenticated'::text));


--
-- Name: match_tactics mt_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mt_insert ON public.match_tactics FOR INSERT WITH CHECK ((( SELECT auth.role() AS role) = 'authenticated'::text));


--
-- Name: match_tactics mt_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY mt_update ON public.match_tactics FOR UPDATE USING ((( SELECT auth.role() AS role) = 'authenticated'::text)) WITH CHECK ((( SELECT auth.role() AS role) = 'authenticated'::text));


--
-- Name: notification_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_templates notification_templates_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notification_templates_delete_admin ON public.notification_templates FOR DELETE TO authenticated USING (public.is_admin());


--
-- Name: notification_templates notification_templates_insert_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notification_templates_insert_admin ON public.notification_templates FOR INSERT TO authenticated WITH CHECK (public.is_admin());


--
-- Name: notification_templates notification_templates_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notification_templates_update_admin ON public.notification_templates FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications notifications_delete_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_delete_own ON public.notifications FOR DELETE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: notifications notifications_insert_own_sender; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_insert_own_sender ON public.notifications FOR INSERT TO authenticated WITH CHECK ((sender_id = ( SELECT auth.uid() AS uid)));


--
-- Name: notifications notifications_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_select_own ON public.notifications FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: notifications notifications_update_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_update_own ON public.notifications FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: owner_withdrawal_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.owner_withdrawal_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: pitch_availability_exceptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pitch_availability_exceptions ENABLE ROW LEVEL SECURITY;

--
-- Name: pitch_bookings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pitch_bookings ENABLE ROW LEVEL SECURITY;

--
-- Name: pitch_bookings pitch_bookings_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pitch_bookings_delete ON public.pitch_bookings FOR DELETE TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.pitches p
  WHERE ((p.id = pitch_bookings.pitch_id) AND (p.owner_id = ( SELECT auth.uid() AS uid))))) OR public.is_admin()));


--
-- Name: pitch_bookings pitch_bookings_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pitch_bookings_insert ON public.pitch_bookings FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1
   FROM public.pitches p
  WHERE ((p.id = pitch_bookings.pitch_id) AND (p.owner_id = ( SELECT auth.uid() AS uid))))) OR public.is_admin()));


--
-- Name: pitch_bookings pitch_bookings_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pitch_bookings_select ON public.pitch_bookings FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.pitches p
  WHERE ((p.id = pitch_bookings.pitch_id) AND (p.owner_id = ( SELECT auth.uid() AS uid))))) OR public.is_admin()));


--
-- Name: pitch_bookings pitch_bookings_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pitch_bookings_update ON public.pitch_bookings FOR UPDATE TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.pitches p
  WHERE ((p.id = pitch_bookings.pitch_id) AND (p.owner_id = ( SELECT auth.uid() AS uid))))) OR public.is_admin())) WITH CHECK (((EXISTS ( SELECT 1
   FROM public.pitches p
  WHERE ((p.id = pitch_bookings.pitch_id) AND (p.owner_id = ( SELECT auth.uid() AS uid))))) OR public.is_admin()));


--
-- Name: pitch_debtors; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pitch_debtors ENABLE ROW LEVEL SECURITY;

--
-- Name: pitch_debtors pitch_debtors_manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pitch_debtors_manage ON public.pitch_debtors TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.pitches
  WHERE ((pitches.id = pitch_debtors.pitch_id) AND (pitches.owner_id = ( SELECT auth.uid() AS uid))))) OR public.is_admin())) WITH CHECK (((EXISTS ( SELECT 1
   FROM public.pitches
  WHERE ((pitches.id = pitch_debtors.pitch_id) AND (pitches.owner_id = ( SELECT auth.uid() AS uid))))) OR public.is_admin()));


--
-- Name: pitch_availability_exceptions pitch_exceptions_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pitch_exceptions_delete ON public.pitch_availability_exceptions FOR DELETE TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.pitches
  WHERE ((pitches.id = pitch_availability_exceptions.pitch_id) AND (pitches.owner_id = ( SELECT auth.uid() AS uid))))) OR public.is_admin()));


--
-- Name: pitch_availability_exceptions pitch_exceptions_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pitch_exceptions_insert ON public.pitch_availability_exceptions FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1
   FROM public.pitches
  WHERE ((pitches.id = pitch_availability_exceptions.pitch_id) AND (pitches.owner_id = ( SELECT auth.uid() AS uid))))) OR public.is_admin()));


--
-- Name: pitch_availability_exceptions pitch_exceptions_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pitch_exceptions_update ON public.pitch_availability_exceptions FOR UPDATE TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.pitches
  WHERE ((pitches.id = pitch_availability_exceptions.pitch_id) AND (pitches.owner_id = ( SELECT auth.uid() AS uid))))) OR public.is_admin())) WITH CHECK (((EXISTS ( SELECT 1
   FROM public.pitches
  WHERE ((pitches.id = pitch_availability_exceptions.pitch_id) AND (pitches.owner_id = ( SELECT auth.uid() AS uid))))) OR public.is_admin()));


--
-- Name: pitch_expenses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pitch_expenses ENABLE ROW LEVEL SECURITY;

--
-- Name: pitch_expenses pitch_expenses_manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pitch_expenses_manage ON public.pitch_expenses TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.pitches
  WHERE ((pitches.id = pitch_expenses.pitch_id) AND (pitches.owner_id = ( SELECT auth.uid() AS uid))))) OR public.is_admin())) WITH CHECK (((EXISTS ( SELECT 1
   FROM public.pitches
  WHERE ((pitches.id = pitch_expenses.pitch_id) AND (pitches.owner_id = ( SELECT auth.uid() AS uid))))) OR public.is_admin()));


--
-- Name: pitch_flash_deals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pitch_flash_deals ENABLE ROW LEVEL SECURITY;

--
-- Name: pitch_flash_deals pitch_flash_deals_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pitch_flash_deals_delete ON public.pitch_flash_deals FOR DELETE TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.pitches
  WHERE ((pitches.id = pitch_flash_deals.pitch_id) AND (pitches.owner_id = ( SELECT auth.uid() AS uid))))) OR public.is_admin()));


--
-- Name: pitch_flash_deals pitch_flash_deals_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pitch_flash_deals_insert ON public.pitch_flash_deals FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1
   FROM public.pitches
  WHERE ((pitches.id = pitch_flash_deals.pitch_id) AND (pitches.owner_id = ( SELECT auth.uid() AS uid))))) OR public.is_admin()));


--
-- Name: pitch_flash_deals pitch_flash_deals_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pitch_flash_deals_update ON public.pitch_flash_deals FOR UPDATE TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.pitches
  WHERE ((pitches.id = pitch_flash_deals.pitch_id) AND (pitches.owner_id = ( SELECT auth.uid() AS uid))))) OR public.is_admin())) WITH CHECK (((EXISTS ( SELECT 1
   FROM public.pitches
  WHERE ((pitches.id = pitch_flash_deals.pitch_id) AND (pitches.owner_id = ( SELECT auth.uid() AS uid))))) OR public.is_admin()));


--
-- Name: pitch_slot_holds; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pitch_slot_holds ENABLE ROW LEVEL SECURITY;

--
-- Name: pitch_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pitch_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: pitch_subscriptions pitch_subscriptions_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pitch_subscriptions_delete ON public.pitch_subscriptions FOR DELETE TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.pitches p
  WHERE ((p.id = pitch_subscriptions.pitch_id) AND (p.owner_id = ( SELECT auth.uid() AS uid))))) OR public.is_admin()));


--
-- Name: pitch_subscriptions pitch_subscriptions_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pitch_subscriptions_insert ON public.pitch_subscriptions FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1
   FROM public.pitches p
  WHERE ((p.id = pitch_subscriptions.pitch_id) AND (p.owner_id = ( SELECT auth.uid() AS uid))))) OR public.is_admin()));


--
-- Name: pitch_subscriptions pitch_subscriptions_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pitch_subscriptions_select ON public.pitch_subscriptions FOR SELECT TO authenticated USING (((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.pitches p
  WHERE ((p.id = pitch_subscriptions.pitch_id) AND (p.owner_id = ( SELECT auth.uid() AS uid))))) OR public.is_admin()));


--
-- Name: pitch_subscriptions pitch_subscriptions_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pitch_subscriptions_update ON public.pitch_subscriptions FOR UPDATE TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.pitches p
  WHERE ((p.id = pitch_subscriptions.pitch_id) AND (p.owner_id = ( SELECT auth.uid() AS uid))))) OR public.is_admin())) WITH CHECK (((EXISTS ( SELECT 1
   FROM public.pitches p
  WHERE ((p.id = pitch_subscriptions.pitch_id) AND (p.owner_id = ( SELECT auth.uid() AS uid))))) OR public.is_admin()));


--
-- Name: pitch_tariffs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pitch_tariffs ENABLE ROW LEVEL SECURITY;

--
-- Name: pitch_tariffs pitch_tariffs_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pitch_tariffs_delete ON public.pitch_tariffs FOR DELETE TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.pitches
  WHERE ((pitches.id = pitch_tariffs.pitch_id) AND (pitches.owner_id = ( SELECT auth.uid() AS uid))))) OR public.is_admin()));


--
-- Name: pitch_tariffs pitch_tariffs_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pitch_tariffs_insert ON public.pitch_tariffs FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1
   FROM public.pitches
  WHERE ((pitches.id = pitch_tariffs.pitch_id) AND (pitches.owner_id = ( SELECT auth.uid() AS uid))))) OR public.is_admin()));


--
-- Name: pitch_tariffs pitch_tariffs_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pitch_tariffs_update ON public.pitch_tariffs FOR UPDATE TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.pitches
  WHERE ((pitches.id = pitch_tariffs.pitch_id) AND (pitches.owner_id = ( SELECT auth.uid() AS uid))))) OR public.is_admin())) WITH CHECK (((EXISTS ( SELECT 1
   FROM public.pitches
  WHERE ((pitches.id = pitch_tariffs.pitch_id) AND (pitches.owner_id = ( SELECT auth.uid() AS uid))))) OR public.is_admin()));


--
-- Name: pitches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pitches ENABLE ROW LEVEL SECURITY;

--
-- Name: pitches pitches_delete_owner_or_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pitches_delete_owner_or_admin ON public.pitches FOR DELETE TO authenticated USING (((( SELECT auth.uid() AS uid) = owner_id) OR public.is_admin()));


--
-- Name: pitches pitches_insert_owner_or_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pitches_insert_owner_or_admin ON public.pitches FOR INSERT TO authenticated WITH CHECK (((( SELECT auth.uid() AS uid) = owner_id) OR public.is_admin()));


--
-- Name: pitches pitches_select_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pitches_select_public ON public.pitches FOR SELECT USING (true);


--
-- Name: pitches pitches_update_owner_or_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pitches_update_owner_or_admin ON public.pitches FOR UPDATE TO authenticated USING (((( SELECT auth.uid() AS uid) = owner_id) OR public.is_admin())) WITH CHECK (((( SELECT auth.uid() AS uid) = owner_id) OR public.is_admin()));


--
-- Name: player_ratings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.player_ratings ENABLE ROW LEVEL SECURITY;

--
-- Name: player_ratings player_ratings_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY player_ratings_insert ON public.player_ratings FOR INSERT WITH CHECK ((( SELECT auth.uid() AS uid) = rater_id));


--
-- Name: player_ratings player_ratings_no_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY player_ratings_no_update ON public.player_ratings FOR UPDATE USING (false);


--
-- Name: player_ratings player_ratings_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY player_ratings_select ON public.player_ratings FOR SELECT USING (true);


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_delete_admin ON public.profiles FOR DELETE TO authenticated USING (public.is_admin());


--
-- Name: profiles profiles_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_insert_own ON public.profiles FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = id));


--
-- Name: profiles profiles_select_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_select_authenticated ON public.profiles FOR SELECT TO authenticated USING (true);


--
-- Name: profiles profiles_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_update ON public.profiles FOR UPDATE TO authenticated USING (((( SELECT auth.uid() AS uid) = id) OR public.is_admin())) WITH CHECK (((( SELECT auth.uid() AS uid) = id) OR public.is_admin()));


--
-- Name: push_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.push_log ENABLE ROW LEVEL SECURITY;

--
-- Name: referees; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.referees ENABLE ROW LEVEL SECURITY;

--
-- Name: service_offers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.service_offers ENABLE ROW LEVEL SECURITY;

--
-- Name: settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

--
-- Name: settings settings_delete_superadmin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY settings_delete_superadmin ON public.settings FOR DELETE TO authenticated USING (public.is_super_admin());


--
-- Name: settings settings_insert_superadmin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY settings_insert_superadmin ON public.settings FOR INSERT TO authenticated WITH CHECK (public.is_super_admin());


--
-- Name: settings settings_select_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY settings_select_public ON public.settings FOR SELECT USING (true);


--
-- Name: settings settings_update_superadmin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY settings_update_superadmin ON public.settings FOR UPDATE TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--
-- Name: pitch_slot_holds slot_holds_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY slot_holds_delete ON public.pitch_slot_holds FOR DELETE USING ((held_by = ( SELECT auth.uid() AS uid)));


--
-- Name: pitch_slot_holds slot_holds_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY slot_holds_insert ON public.pitch_slot_holds FOR INSERT WITH CHECK ((held_by = ( SELECT auth.uid() AS uid)));


--
-- Name: pitch_slot_holds slot_holds_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY slot_holds_update ON public.pitch_slot_holds FOR UPDATE USING ((held_by = ( SELECT auth.uid() AS uid))) WITH CHECK ((held_by = ( SELECT auth.uid() AS uid)));


--
-- Name: tactics; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tactics ENABLE ROW LEVEL SECURITY;

--
-- Name: tactics tactics_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tactics_delete ON public.tactics FOR DELETE USING ((( SELECT auth.uid() AS uid) = "userId"));


--
-- Name: tactics tactics_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tactics_insert ON public.tactics FOR INSERT WITH CHECK ((( SELECT auth.uid() AS uid) = "userId"));


--
-- Name: tactics tactics_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tactics_select_own ON public.tactics FOR SELECT USING ((( SELECT auth.uid() AS uid) = "userId"));


--
-- Name: tactics tactics_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tactics_update ON public.tactics FOR UPDATE USING ((( SELECT auth.uid() AS uid) = "userId")) WITH CHECK ((( SELECT auth.uid() AS uid) = "userId"));


--
-- Name: team_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

--
-- Name: teams; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

--
-- Name: teams teams_delete_captain_or_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY teams_delete_captain_or_admin ON public.teams FOR DELETE TO authenticated USING (((( SELECT auth.uid() AS uid) = captain_id) OR public.is_admin()));


--
-- Name: teams teams_insert_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY teams_insert_own ON public.teams FOR INSERT TO authenticated WITH CHECK ((captain_id = ( SELECT auth.uid() AS uid)));


--
-- Name: teams teams_select_public; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY teams_select_public ON public.teams FOR SELECT USING (true);


--
-- Name: teams teams_update_captain_or_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY teams_update_captain_or_admin ON public.teams FOR UPDATE TO authenticated USING (((( SELECT auth.uid() AS uid) = captain_id) OR public.is_admin())) WITH CHECK (((( SELECT auth.uid() AS uid) = captain_id) OR public.is_admin()));


--
-- Name: texts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.texts ENABLE ROW LEVEL SECURITY;

--
-- Name: texts texts_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY texts_delete_admin ON public.texts FOR DELETE TO authenticated USING (public.is_admin());


--
-- Name: texts texts_insert_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY texts_insert_admin ON public.texts FOR INSERT TO authenticated WITH CHECK (public.is_admin());


--
-- Name: texts texts_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY texts_update_admin ON public.texts FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: team_members tm_delete_self_or_captain; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tm_delete_self_or_captain ON public.team_members FOR DELETE USING (((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.teams t
  WHERE ((t.id = team_members.team_id) AND (t.captain_id = ( SELECT auth.uid() AS uid)))))));


--
-- Name: team_members tm_insert_self_or_captain; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tm_insert_self_or_captain ON public.team_members FOR INSERT WITH CHECK (((user_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1
   FROM public.teams t
  WHERE ((t.id = team_members.team_id) AND (t.captain_id = ( SELECT auth.uid() AS uid)))))));


--
-- Name: team_members tm_update_captain; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tm_update_captain ON public.team_members FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.teams t
  WHERE ((t.id = team_members.team_id) AND (t.captain_id = ( SELECT auth.uid() AS uid))))));


--
-- Name: waitlist; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

--
-- Name: waitlist waitlist_delete_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY waitlist_delete_admin ON public.waitlist FOR DELETE TO authenticated USING (public.is_admin());


--
-- Name: waitlist waitlist_insert_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY waitlist_insert_admin ON public.waitlist FOR INSERT TO authenticated WITH CHECK (public.is_admin());


--
-- Name: waitlist waitlist_update_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY waitlist_update_admin ON public.waitlist FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- Name: wallet_transactions wallet_no_direct_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wallet_no_direct_insert ON public.wallet_transactions FOR INSERT WITH CHECK (false);


--
-- Name: wallet_transactions wallet_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY wallet_select_own ON public.wallet_transactions FOR SELECT USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: wallet_transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: owner_withdrawal_requests withdrawals_delete_superadmin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY withdrawals_delete_superadmin ON public.owner_withdrawal_requests FOR DELETE TO authenticated USING (public.is_super_admin());


--
-- Name: owner_withdrawal_requests withdrawals_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY withdrawals_insert ON public.owner_withdrawal_requests FOR INSERT TO authenticated WITH CHECK (((owner_id = ( SELECT auth.uid() AS uid)) OR public.is_super_admin()));


--
-- Name: owner_withdrawal_requests withdrawals_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY withdrawals_select ON public.owner_withdrawal_requests FOR SELECT TO authenticated USING (((owner_id = ( SELECT auth.uid() AS uid)) OR public.is_super_admin()));


--
-- Name: owner_withdrawal_requests withdrawals_update_superadmin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY withdrawals_update_superadmin ON public.owner_withdrawal_requests FOR UPDATE TO authenticated USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION auto_approve_pending_bookings(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.auto_approve_pending_bookings() FROM PUBLIC;
GRANT ALL ON FUNCTION public.auto_approve_pending_bookings() TO service_role;


--
-- Name: FUNCTION cancel_app_booking(p_booking_id uuid, p_reason text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cancel_app_booking(p_booking_id uuid, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.cancel_app_booking(p_booking_id uuid, p_reason text) TO authenticated;
GRANT ALL ON FUNCTION public.cancel_app_booking(p_booking_id uuid, p_reason text) TO service_role;


--
-- Name: FUNCTION cancel_subscription(p_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cancel_subscription(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.cancel_subscription(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.cancel_subscription(p_id uuid) TO service_role;


--
-- Name: FUNCTION check_match_conflict(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.check_match_conflict() FROM PUBLIC;
GRANT ALL ON FUNCTION public.check_match_conflict() TO service_role;


--
-- Name: FUNCTION cleanup_expired_holds(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cleanup_expired_holds() FROM PUBLIC;
GRANT ALL ON FUNCTION public.cleanup_expired_holds() TO service_role;


--
-- Name: FUNCTION create_pitch_booking(p_pitch_id uuid, p_court_id uuid, p_booking_date date, p_start_time time without time zone, p_end_time time without time zone, p_source text, p_customer_name text, p_customer_phone text, p_note text, p_title text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.create_pitch_booking(p_pitch_id uuid, p_court_id uuid, p_booking_date date, p_start_time time without time zone, p_end_time time without time zone, p_source text, p_customer_name text, p_customer_phone text, p_note text, p_title text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_pitch_booking(p_pitch_id uuid, p_court_id uuid, p_booking_date date, p_start_time time without time zone, p_end_time time without time zone, p_source text, p_customer_name text, p_customer_phone text, p_note text, p_title text) TO authenticated;
GRANT ALL ON FUNCTION public.create_pitch_booking(p_pitch_id uuid, p_court_id uuid, p_booking_date date, p_start_time time without time zone, p_end_time time without time zone, p_source text, p_customer_name text, p_customer_phone text, p_note text, p_title text) TO service_role;


--
-- Name: FUNCTION enforce_tariff_before_open(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.enforce_tariff_before_open() TO anon;
GRANT ALL ON FUNCTION public.enforce_tariff_before_open() TO authenticated;
GRANT ALL ON FUNCTION public.enforce_tariff_before_open() TO service_role;


--
-- Name: FUNCTION get_court_occupancy(p_court_id uuid, p_date date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_court_occupancy(p_court_id uuid, p_date date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_court_occupancy(p_court_id uuid, p_date date) TO authenticated;
GRANT ALL ON FUNCTION public.get_court_occupancy(p_court_id uuid, p_date date) TO service_role;


--
-- Name: FUNCTION get_current_tariff_price(p_pitch_id uuid, p_booking_date date, p_start_time time without time zone); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_current_tariff_price(p_pitch_id uuid, p_booking_date date, p_start_time time without time zone) TO anon;
GRANT ALL ON FUNCTION public.get_current_tariff_price(p_pitch_id uuid, p_booking_date date, p_start_time time without time zone) TO authenticated;
GRANT ALL ON FUNCTION public.get_current_tariff_price(p_pitch_id uuid, p_booking_date date, p_start_time time without time zone) TO service_role;


--
-- Name: FUNCTION get_or_create_match_score_token(p_match_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_or_create_match_score_token(p_match_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_or_create_match_score_token(p_match_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_or_create_match_score_token(p_match_id uuid) TO service_role;


--
-- Name: FUNCTION get_pitch_availability(p_pitch_id uuid, p_date_from date, p_date_to date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.get_pitch_availability(p_pitch_id uuid, p_date_from date, p_date_to date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_pitch_availability(p_pitch_id uuid, p_date_from date, p_date_to date) TO authenticated;
GRANT ALL ON FUNCTION public.get_pitch_availability(p_pitch_id uuid, p_date_from date, p_date_to date) TO service_role;


--
-- Name: FUNCTION handle_new_user(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;


--
-- Name: FUNCTION has_role(check_role text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.has_role(check_role text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.has_role(check_role text) TO authenticated;
GRANT ALL ON FUNCTION public.has_role(check_role text) TO service_role;


--
-- Name: FUNCTION is_admin(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_admin() TO authenticated;
GRANT ALL ON FUNCTION public.is_admin() TO service_role;


--
-- Name: FUNCTION is_super_admin(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_super_admin() TO authenticated;
GRANT ALL ON FUNCTION public.is_super_admin() TO service_role;


--
-- Name: FUNCTION join_match_slot(p_match_id uuid, p_user_id uuid, p_slot_id character varying, p_slot_role character varying); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.join_match_slot(p_match_id uuid, p_user_id uuid, p_slot_id character varying, p_slot_role character varying) FROM PUBLIC;
GRANT ALL ON FUNCTION public.join_match_slot(p_match_id uuid, p_user_id uuid, p_slot_id character varying, p_slot_role character varying) TO authenticated;
GRANT ALL ON FUNCTION public.join_match_slot(p_match_id uuid, p_user_id uuid, p_slot_id character varying, p_slot_role character varying) TO service_role;


--
-- Name: FUNCTION materialize_subscriptions(p_horizon_weeks integer, p_sub_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.materialize_subscriptions(p_horizon_weeks integer, p_sub_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.materialize_subscriptions(p_horizon_weeks integer, p_sub_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.materialize_subscriptions(p_horizon_weeks integer, p_sub_id uuid) TO service_role;


--
-- Name: FUNCTION notify_booking_events(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.notify_booking_events() FROM PUBLIC;
GRANT ALL ON FUNCTION public.notify_booking_events() TO service_role;


--
-- Name: FUNCTION notify_match_cancelled(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.notify_match_cancelled() FROM PUBLIC;
GRANT ALL ON FUNCTION public.notify_match_cancelled() TO service_role;


--
-- Name: FUNCTION notify_match_joined(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.notify_match_joined() FROM PUBLIC;
GRANT ALL ON FUNCTION public.notify_match_joined() TO service_role;


--
-- Name: FUNCTION notify_ref_status_change(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.notify_ref_status_change() FROM PUBLIC;
GRANT ALL ON FUNCTION public.notify_ref_status_change() TO service_role;


--
-- Name: FUNCTION notify_send_push_webhook(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.notify_send_push_webhook() FROM PUBLIC;
GRANT ALL ON FUNCTION public.notify_send_push_webhook() TO service_role;


--
-- Name: FUNCTION pitch_bookings_set_slot_range(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.pitch_bookings_set_slot_range() TO anon;
GRANT ALL ON FUNCTION public.pitch_bookings_set_slot_range() TO authenticated;
GRANT ALL ON FUNCTION public.pitch_bookings_set_slot_range() TO service_role;


--
-- Name: FUNCTION process_match_payment(p_user_id uuid, p_match_id uuid, p_amount numeric); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.process_match_payment(p_user_id uuid, p_match_id uuid, p_amount numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION public.process_match_payment(p_user_id uuid, p_match_id uuid, p_amount numeric) TO authenticated;
GRANT ALL ON FUNCTION public.process_match_payment(p_user_id uuid, p_match_id uuid, p_amount numeric) TO service_role;


--
-- Name: FUNCTION process_match_refund(p_user_id uuid, p_match_id uuid, p_amount numeric); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.process_match_refund(p_user_id uuid, p_match_id uuid, p_amount numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION public.process_match_refund(p_user_id uuid, p_match_id uuid, p_amount numeric) TO authenticated;
GRANT ALL ON FUNCTION public.process_match_refund(p_user_id uuid, p_match_id uuid, p_amount numeric) TO service_role;


--
-- Name: FUNCTION protect_profile_columns(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.protect_profile_columns() FROM PUBLIC;
GRANT ALL ON FUNCTION public.protect_profile_columns() TO service_role;


--
-- Name: FUNCTION protect_provider_sensitive_fields(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.protect_provider_sensitive_fields() FROM PUBLIC;
GRANT ALL ON FUNCTION public.protect_provider_sensitive_fields() TO service_role;


--
-- Name: FUNCTION replace_template_vars(template text, vars jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.replace_template_vars(template text, vars jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.replace_template_vars(template text, vars jsonb) TO service_role;


--
-- Name: FUNCTION send_match_invite(p_match_id uuid, p_target_user_id uuid, p_sender_id uuid, p_team_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.send_match_invite(p_match_id uuid, p_target_user_id uuid, p_sender_id uuid, p_team_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.send_match_invite(p_match_id uuid, p_target_user_id uuid, p_sender_id uuid, p_team_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.send_match_invite(p_match_id uuid, p_target_user_id uuid, p_sender_id uuid, p_team_id uuid) TO service_role;


--
-- Name: FUNCTION submit_match_score(p_token text, p_home_score integer, p_away_score integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.submit_match_score(p_token text, p_home_score integer, p_away_score integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.submit_match_score(p_token text, p_home_score integer, p_away_score integer) TO authenticated;
GRANT ALL ON FUNCTION public.submit_match_score(p_token text, p_home_score integer, p_away_score integer) TO service_role;


--
-- Name: FUNCTION update_booking_paid_amount(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.update_booking_paid_amount() TO anon;
GRANT ALL ON FUNCTION public.update_booking_paid_amount() TO authenticated;
GRANT ALL ON FUNCTION public.update_booking_paid_amount() TO service_role;


--
-- Name: FUNCTION update_player_diamond(p_user_id uuid, p_is_win boolean, p_flat_modifier integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.update_player_diamond(p_user_id uuid, p_is_win boolean, p_flat_modifier integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_player_diamond(p_user_id uuid, p_is_win boolean, p_flat_modifier integer) TO authenticated;
GRANT ALL ON FUNCTION public.update_player_diamond(p_user_id uuid, p_is_win boolean, p_flat_modifier integer) TO service_role;


--
-- Name: FUNCTION update_user_location(p_user_id uuid, p_point_str text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.update_user_location(p_user_id uuid, p_point_str text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_user_location(p_user_id uuid, p_point_str text) TO authenticated;
GRANT ALL ON FUNCTION public.update_user_location(p_user_id uuid, p_point_str text) TO service_role;


--
-- Name: FUNCTION update_user_skill_rating(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.update_user_skill_rating() FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_user_skill_rating() TO service_role;


--
-- Name: TABLE audit_logs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.audit_logs TO anon;
GRANT ALL ON TABLE public.audit_logs TO authenticated;
GRANT ALL ON TABLE public.audit_logs TO service_role;


--
-- Name: TABLE booking_payments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.booking_payments TO anon;
GRANT ALL ON TABLE public.booking_payments TO authenticated;
GRANT ALL ON TABLE public.booking_payments TO service_role;


--
-- Name: TABLE courts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.courts TO anon;
GRANT ALL ON TABLE public.courts TO authenticated;
GRANT ALL ON TABLE public.courts TO service_role;


--
-- Name: TABLE friendships; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.friendships TO anon;
GRANT ALL ON TABLE public.friendships TO authenticated;
GRANT ALL ON TABLE public.friendships TO service_role;


--
-- Name: TABLE goalkeepers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.goalkeepers TO anon;
GRANT ALL ON TABLE public.goalkeepers TO authenticated;
GRANT ALL ON TABLE public.goalkeepers TO service_role;


--
-- Name: TABLE individual_matches; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.individual_matches TO anon;
GRANT ALL ON TABLE public.individual_matches TO authenticated;
GRANT ALL ON TABLE public.individual_matches TO service_role;


--
-- Name: TABLE match_disputes; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.match_disputes TO anon;
GRANT ALL ON TABLE public.match_disputes TO authenticated;
GRANT ALL ON TABLE public.match_disputes TO service_role;


--
-- Name: TABLE match_participants; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.match_participants TO anon;
GRANT ALL ON TABLE public.match_participants TO authenticated;
GRANT ALL ON TABLE public.match_participants TO service_role;


--
-- Name: TABLE match_registrations; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.match_registrations TO anon;
GRANT ALL ON TABLE public.match_registrations TO authenticated;
GRANT ALL ON TABLE public.match_registrations TO service_role;


--
-- Name: TABLE match_score_tokens; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.match_score_tokens TO anon;
GRANT ALL ON TABLE public.match_score_tokens TO authenticated;
GRANT ALL ON TABLE public.match_score_tokens TO service_role;


--
-- Name: TABLE match_tactics; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.match_tactics TO anon;
GRANT ALL ON TABLE public.match_tactics TO authenticated;
GRANT ALL ON TABLE public.match_tactics TO service_role;


--
-- Name: TABLE matches; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.matches TO anon;
GRANT ALL ON TABLE public.matches TO authenticated;
GRANT ALL ON TABLE public.matches TO service_role;


--
-- Name: TABLE notification_templates; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notification_templates TO anon;
GRANT ALL ON TABLE public.notification_templates TO authenticated;
GRANT ALL ON TABLE public.notification_templates TO service_role;


--
-- Name: TABLE notifications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notifications TO anon;
GRANT ALL ON TABLE public.notifications TO authenticated;
GRANT ALL ON TABLE public.notifications TO service_role;


--
-- Name: TABLE pitch_bookings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pitch_bookings TO anon;
GRANT ALL ON TABLE public.pitch_bookings TO authenticated;
GRANT ALL ON TABLE public.pitch_bookings TO service_role;


--
-- Name: TABLE pitches; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pitches TO anon;
GRANT ALL ON TABLE public.pitches TO authenticated;
GRANT ALL ON TABLE public.pitches TO service_role;


--
-- Name: TABLE owner_daily_summary; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.owner_daily_summary TO anon;
GRANT ALL ON TABLE public.owner_daily_summary TO authenticated;
GRANT ALL ON TABLE public.owner_daily_summary TO service_role;


--
-- Name: TABLE owner_withdrawal_requests; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.owner_withdrawal_requests TO anon;
GRANT ALL ON TABLE public.owner_withdrawal_requests TO authenticated;
GRANT ALL ON TABLE public.owner_withdrawal_requests TO service_role;


--
-- Name: TABLE pitch_availability_exceptions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pitch_availability_exceptions TO anon;
GRANT ALL ON TABLE public.pitch_availability_exceptions TO authenticated;
GRANT ALL ON TABLE public.pitch_availability_exceptions TO service_role;


--
-- Name: TABLE pitch_debtors; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pitch_debtors TO anon;
GRANT ALL ON TABLE public.pitch_debtors TO authenticated;
GRANT ALL ON TABLE public.pitch_debtors TO service_role;


--
-- Name: TABLE pitch_expenses; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pitch_expenses TO anon;
GRANT ALL ON TABLE public.pitch_expenses TO authenticated;
GRANT ALL ON TABLE public.pitch_expenses TO service_role;


--
-- Name: TABLE pitch_flash_deals; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pitch_flash_deals TO anon;
GRANT ALL ON TABLE public.pitch_flash_deals TO authenticated;
GRANT ALL ON TABLE public.pitch_flash_deals TO service_role;


--
-- Name: TABLE pitch_slot_holds; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pitch_slot_holds TO anon;
GRANT ALL ON TABLE public.pitch_slot_holds TO authenticated;
GRANT ALL ON TABLE public.pitch_slot_holds TO service_role;


--
-- Name: TABLE pitch_subscriptions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pitch_subscriptions TO anon;
GRANT ALL ON TABLE public.pitch_subscriptions TO authenticated;
GRANT ALL ON TABLE public.pitch_subscriptions TO service_role;


--
-- Name: TABLE pitch_tariffs; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pitch_tariffs TO anon;
GRANT ALL ON TABLE public.pitch_tariffs TO authenticated;
GRANT ALL ON TABLE public.pitch_tariffs TO service_role;


--
-- Name: TABLE player_ratings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.player_ratings TO anon;
GRANT ALL ON TABLE public.player_ratings TO authenticated;
GRANT ALL ON TABLE public.player_ratings TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.profiles TO anon;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: COLUMN profiles.id; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(id) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.name; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(name) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.avatar_url; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(avatar_url) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.role; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(role) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.ratings_history; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(ratings_history) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.is_verified; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(is_verified) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.is_banned; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(is_banned) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.join_date; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(join_date) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.push_token; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(push_token) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.push_token_platform; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(push_token_platform) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.push_token_updated_at; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(push_token_updated_at) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.notification_preferences; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(notification_preferences) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.last_location; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(last_location) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.updated_at; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(updated_at) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.email; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(email) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.phone; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(phone) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.rating; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(rating) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.is_pro; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(is_pro) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.wallet; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(wallet) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.ban_expires_at; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(ban_expires_at) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.communities; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(communities) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.oyna_id; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(oyna_id) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.friends; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(friends) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.is_looking_for_team; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(is_looking_for_team) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.is_available; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(is_available) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.roles; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(roles) ON TABLE public.profiles TO authenticated;


--
-- Name: COLUMN profiles.created_at; Type: ACL; Schema: public; Owner: -
--

GRANT UPDATE(created_at) ON TABLE public.profiles TO authenticated;


--
-- Name: TABLE push_log; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.push_log TO anon;
GRANT ALL ON TABLE public.push_log TO authenticated;
GRANT ALL ON TABLE public.push_log TO service_role;


--
-- Name: TABLE referees; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.referees TO anon;
GRANT ALL ON TABLE public.referees TO authenticated;
GRANT ALL ON TABLE public.referees TO service_role;


--
-- Name: TABLE service_offers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.service_offers TO anon;
GRANT ALL ON TABLE public.service_offers TO authenticated;
GRANT ALL ON TABLE public.service_offers TO service_role;


--
-- Name: TABLE settings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.settings TO anon;
GRANT ALL ON TABLE public.settings TO authenticated;
GRANT ALL ON TABLE public.settings TO service_role;


--
-- Name: TABLE tactics; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tactics TO anon;
GRANT ALL ON TABLE public.tactics TO authenticated;
GRANT ALL ON TABLE public.tactics TO service_role;


--
-- Name: TABLE team_members; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.team_members TO anon;
GRANT ALL ON TABLE public.team_members TO authenticated;
GRANT ALL ON TABLE public.team_members TO service_role;


--
-- Name: TABLE teams; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.teams TO anon;
GRANT ALL ON TABLE public.teams TO authenticated;
GRANT ALL ON TABLE public.teams TO service_role;


--
-- Name: TABLE texts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.texts TO anon;
GRANT ALL ON TABLE public.texts TO authenticated;
GRANT ALL ON TABLE public.texts TO service_role;


--
-- Name: TABLE waitlist; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.waitlist TO anon;
GRANT ALL ON TABLE public.waitlist TO authenticated;
GRANT ALL ON TABLE public.waitlist TO service_role;


--
-- Name: TABLE wallet_transactions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.wallet_transactions TO anon;
GRANT ALL ON TABLE public.wallet_transactions TO authenticated;
GRANT ALL ON TABLE public.wallet_transactions TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--


