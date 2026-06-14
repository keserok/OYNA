-- ============================================================
-- FAZ 1 — Oyuncu rezervasyon akışı (in-app booking)
-- Canlıya 2026-06-13'te apply_migration ile uygulandı: faz1_player_booking_flow
--
-- 1. public_profiles SECURITY DEFINER view kaldırılır (advisor ERROR, kodda kullanılmıyor)
-- 2. pitches.auto_approve_enabled opsiyonu (onay modeli aç/kapa)
-- 3. Oyuncu kendi rezervasyonlarını görebilir (RLS SELECT)
-- 4. get_pitch_availability RPC (yalnız saat+durum, kişisel veri sızdırmaz)
-- 5. Rezervasyon bildirimleri (sahibine talep, oyuncuya onay, sahibine oyuncu iptali)
-- 6. Otomatik onay: süre dolunca PENDING → CONFIRMED (pg_cron, dakikada bir)
-- 7. cancel_app_booking RPC (48 saat kuralı / %90 iade)
-- 8. Tarife zorunluluğu (APP rezervasyonunda NO_TARIFF + sahayı yayına alma kapısı)
-- ============================================================

-- 1) Kullanılmayan SECURITY DEFINER view
DROP VIEW IF EXISTS public.public_profiles;

-- 2) Otomatik onay opsiyonu
ALTER TABLE public.pitches
  ADD COLUMN IF NOT EXISTS auto_approve_enabled boolean NOT NULL DEFAULT true;
COMMENT ON COLUMN public.pitches.auto_approve_enabled IS
  'true: PENDING rezervasyonlar auto_approve_minutes sonunda otomatik CONFIRMED olur. false: yalnız manuel onay.';

-- 3) Oyuncu kendi rezervasyonlarını görebilsin
DROP POLICY IF EXISTS "Players view own bookings" ON public.pitch_bookings;
CREATE POLICY "Players view own bookings"
  ON public.pitch_bookings FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- 4) Müsaitlik RPC — kişisel veri içermez (müşteri adı/telefonu yok)
CREATE OR REPLACE FUNCTION public.get_pitch_availability(
  p_pitch_id uuid,
  p_date_from date,
  p_date_to date
)
RETURNS TABLE(court_id uuid, booking_date date, start_time time, end_time time, status text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT b.court_id, b.booking_date, b.start_time, b.end_time, b.status::text
  FROM public.pitch_bookings b
  WHERE b.pitch_id = p_pitch_id
    AND b.status <> 'CANCELLED'
    AND b.booking_date BETWEEN p_date_from AND LEAST(p_date_to, p_date_from + 31)
$$;
REVOKE ALL ON FUNCTION public.get_pitch_availability(uuid, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_pitch_availability(uuid, date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_pitch_availability(uuid, date, date) TO authenticated;

-- 5) Rezervasyon bildirim tetikleyicisi
-- NOT: Owner panelindeki rejectBooking servisi oyuncuya bildirimi kendisi attığı için
-- burada "sahibin reddi → oyuncu" bildirimi YOK (çift bildirim olmasın).
CREATE OR REPLACE FUNCTION public.notify_booking_events()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
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

DROP TRIGGER IF EXISTS trg_notify_booking_ins ON public.pitch_bookings;
CREATE TRIGGER trg_notify_booking_ins
  AFTER INSERT ON public.pitch_bookings
  FOR EACH ROW EXECUTE FUNCTION public.notify_booking_events();

DROP TRIGGER IF EXISTS trg_notify_booking_upd ON public.pitch_bookings;
CREATE TRIGGER trg_notify_booking_upd
  AFTER UPDATE OF status ON public.pitch_bookings
  FOR EACH ROW EXECUTE FUNCTION public.notify_booking_events();

-- 6) Otomatik onay fonksiyonu + pg_cron
CREATE OR REPLACE FUNCTION public.auto_approve_pending_bookings()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
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
REVOKE ALL ON FUNCTION public.auto_approve_pending_bookings() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auto_approve_pending_bookings() FROM anon;
REVOKE ALL ON FUNCTION public.auto_approve_pending_bookings() FROM authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto_approve_bookings') THEN
    PERFORM cron.unschedule('auto_approve_bookings');
  END IF;
  PERFORM cron.schedule('auto_approve_bookings', '* * * * *', 'SELECT public.auto_approve_pending_bookings()');
END;
$$;

-- 7) Oyuncu iptali: 48 saat kuralı + %90 iade
CREATE OR REPLACE FUNCTION public.cancel_app_booking(
  p_booking_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
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
REVOKE ALL ON FUNCTION public.cancel_app_booking(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_app_booking(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_app_booking(uuid, text) TO authenticated;

-- 8a) create_pitch_booking: APP rezervasyonlarında tarife zorunlu + auto_approve_enabled entegrasyonu
CREATE OR REPLACE FUNCTION public.create_pitch_booking(
  p_pitch_id uuid,
  p_court_id uuid,
  p_booking_date date,
  p_start_time time without time zone,
  p_end_time time without time zone,
  p_source text DEFAULT 'OWNER_MANUAL'::text,
  p_customer_name text DEFAULT NULL::text,
  p_customer_phone text DEFAULT NULL::text,
  p_note text DEFAULT NULL::text,
  p_title text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
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

-- 8b) Saha, aktif tarife olmadan yayına alınamaz
CREATE OR REPLACE FUNCTION public.enforce_tariff_before_open()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
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

DROP TRIGGER IF EXISTS trg_enforce_tariff_before_open ON public.pitches;
CREATE TRIGGER trg_enforce_tariff_before_open
  BEFORE UPDATE OF is_open ON public.pitches
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tariff_before_open();
