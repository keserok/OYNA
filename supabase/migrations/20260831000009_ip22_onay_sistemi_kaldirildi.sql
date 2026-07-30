-- IP-22 — Rezervasyon onay sistemi ve tesis başvuru/onay sistemi kaldırıldı.
--
-- KARAR (kullanıcı):
--   1) "otomatik onay onaylama sistemini kaldır yapılan rezervasyonlar anında düşsün"
--   2) "admin panelinden ve uygulamadan yapılan her rezervasyon anında"
--   3) "tesislerin onaylanmaması ve tesis başvurusu gibi yapma sistemleri kaldır"
--  17b) auto_approve kolonları tamamen silinsin
--  18a) bekleyen tek rezervasyon onaylanmış sayılsın
--
-- SIRA ÖNEMLİ: kolonları okuyan fonksiyonlar ÖNCE yeniden yazılır, kolonlar
-- SONRA düşürülür. Tersi olursa fonksiyonlar çalışma anında patlar.
--
-- Çifte rezervasyon koruması bu değişiklikten etkilenmez: pitch_bookings
-- üzerindeki EXCLUDE kısıtı (court_id + slot_range, status <> 'CANCELLED')
-- aynı saati ikinci kez satmayı veritabanı seviyesinde engelliyor.

-- ---------------------------------------------------------------------------
-- 1) Bildirimler: artık PENDING diye bir rezervasyon durumu üretilmiyor.
--    Bu fonksiyon İLK sırada güncellenir; aşağıdaki veri düzeltmesi (adım 6)
--    "Rezervasyonun Onaylandı" bildirimini geçmişe dönük tetiklemesin diye.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_booking_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_owner uuid; v_pitch_name text; v_when text;
BEGIN
  SELECT owner_id, name INTO v_owner, v_pitch_name FROM public.pitches WHERE id = NEW.pitch_id;
  v_when := to_char(NEW.booking_date, 'DD.MM.YYYY') || ' ' || to_char(NEW.start_time, 'HH24:MI');
  IF TG_OP = 'INSERT' THEN
    IF NEW.source IN ('APP_BOOKING', 'APP_MATCH') AND v_owner IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, body, type_key, payload, action_required)
      VALUES (
        v_owner,
        'Yeni Rezervasyon ✅',
        COALESCE(v_pitch_name, 'Tesisiniz') || ' — ' || v_when || ' rezervasyonu oluşturuldu.',
        'owner_new_booking',
        jsonb_build_object('booking_id', NEW.id, 'pitch_id', NEW.pitch_id),
        false
      );
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'CANCELLED' AND OLD.status <> 'CANCELLED'
      AND NEW.cancelled_by IS NOT NULL AND NEW.cancelled_by = NEW.user_id
      AND v_owner IS NOT NULL
      AND public._notification_pref_enabled(v_owner, 'owner_cancellation') THEN
      INSERT INTO public.notifications (user_id, title, body, type_key, payload)
      VALUES (
        v_owner,
        'Rezervasyon İptal Edildi ❌',
        COALESCE(v_pitch_name, 'Tesisiniz') || ' — ' || v_when || ' rezervasyonu oyuncu tarafından iptal edildi.',
        'owner_cancellation',
        jsonb_build_object('booking_id', NEW.id, 'pitch_id', NEW.pitch_id)
      );
    ELSIF NEW.status = 'CANCELLED' AND OLD.status <> 'CANCELLED'
      AND NEW.user_id IS NOT NULL
      AND (NEW.cancelled_by IS NULL OR NEW.cancelled_by <> NEW.user_id) THEN
      INSERT INTO public.notifications (user_id, title, body, type_key, payload)
      VALUES (
        NEW.user_id,
        'Rezervasyonun İptal Edildi',
        COALESCE(v_pitch_name, 'Saha') || ' — ' || v_when || ' rezervasyonun tesis tarafından iptal edildi.' ||
          COALESCE(' Sebep: ' || NULLIF(NEW.cancellation_reason, ''), ''),
        'BOOKING_REJECTED',
        jsonb_build_object('booking_id', NEW.id, 'pitch_id', NEW.pitch_id)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2) Rezervasyon oluşturma: kaynak ne olursa olsun anında kesinleşir.
-- ---------------------------------------------------------------------------
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
      -- Onay adimi kaldirildi: rezervasyon olusur olusmaz kesinlesir.
      'CONFIRMED', p_source, v_tariff_id, COALESCE(v_price, 0), COALESCE(v_deposit, 0),
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

-- ---------------------------------------------------------------------------
-- 3) Tesis takvimi: iki otomatik onay alanı sözleşmeden çıktı.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_facility_schedule(p_pitch_id uuid, p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
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
                'working_hours', p.working_hours)
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

-- ---------------------------------------------------------------------------
-- 4) Demo tesis üreticisi: kaldırılan kolonu yazmayı bırakır, "onay bekleyen"
--    demo rezervasyonu artık kesinleşmiş olarak kurulur.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_owner_demo()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pitch_id UUID := 'd1111111-1111-4111-8111-111111111111';
  v_court1 UUID := 'd2222222-2222-4222-8222-222222222222';
  v_court2 UUID := 'd3333333-3333-4333-8333-333333333333';
  v_court3 UUID := 'd4444444-4444-4444-8444-444444444444';
  v_staff1 UUID := 'd6666666-6666-4666-8666-666666666666';
  v_staff2 UUID := 'd7777777-7777-4777-8777-777777777777';
  v_today DATE := CURRENT_DATE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  PERFORM public.purge_owner_demo();
  INSERT INTO public.pitches (id, name, city, district, address, description, owner_id, verification_status, is_open, is_demo, price_per_match, platform_commission_rate, amenities, working_hours, rating, payment_options)
  VALUES (v_pitch_id, 'OYNA Demo Arena', 'İstanbul', 'Beşiktaş', 'Demo Mahallesi, Spor Sk. No:1', 'OYNA demo tesis', NULL, 'approved', true, true, 3200, 10, '["Otopark","Duş","Kafe"]'::jsonb, '[]'::jsonb, 4.8, '{"online": true, "deposit": false, "cash": true}'::jsonb);
  INSERT INTO public.courts (id, pitch_id, name, court_type, size, is_active, sort_order) VALUES
    (v_court1, v_pitch_id, 'Merkez Saha', 'OPEN', '30x50', true, 0),
    (v_court2, v_pitch_id, 'Yan Saha', 'OPEN', '28x48', true, 1),
    (v_court3, v_pitch_id, 'Kapalı Saha', 'CLOSED', '25x45', true, 2);
  INSERT INTO public.pitch_tariffs (pitch_id, name, tariff_type, applies_to_days, start_time, end_time, slot_price, deposit_amount, sort_order) VALUES
    (v_pitch_id, 'Gündüz', 'WEEKDAY', ARRAY[1,2,3,4,5], '08:00', '17:00', 2000, 500, 0),
    (v_pitch_id, 'Akşam', 'WEEKDAY', ARRAY[1,2,3,4,5], '17:00', '00:00', 3200, 1000, 1);
  INSERT INTO public.pitch_bank_accounts (id, pitch_id, bank_name, account_holder, iban, is_primary) VALUES
    ('d8888888-8888-4888-8888-888888888888', v_pitch_id, 'Ziraat Bankası', 'OYNA Demo Arena', 'TR000000000000000000000000', true);
  INSERT INTO public.pitch_staff_members (id, pitch_id, name, role_title, status, avatar_url, sort_order) VALUES
    (v_staff1, v_pitch_id, 'Murat S.', 'Tesis Müdürü', 'ON_DUTY', 'https://i.pravatar.cc/150?u=murat', 0),
    (v_staff2, v_pitch_id, 'Saha Sorumlusu', 'Saha Sorumlusu', 'ON_DUTY', 'https://i.pravatar.cc/150?u=sinan', 1);
  INSERT INTO public.pitch_staff_tasks (pitch_id, title, assigned_to, assigned_name, priority, status, due_time) VALUES
    (v_pitch_id, 'Aydınlatma Kontrolü', v_staff2, 'Sinan K.', 'HIGH', 'PENDING', '18:00');
  INSERT INTO public.pitch_bookings (pitch_id, court_id, customer_name, customer_phone, booking_date, start_time, end_time, status, source, price, paid_amount, payment_status, title)
  VALUES (v_pitch_id, v_court1, 'Ahmet Y.', '5321112233', v_today, '17:00', '18:00', 'CONFIRMED', 'APP_BOOKING', 3200, 3200, 'PAID', 'Akşam Maçı'),
         (v_pitch_id, v_court2, 'Vadi Gücü FC', '5354445566', v_today, '21:00', '22:00', 'CONFIRMED', 'APP_BOOKING', 3200, 3200, 'PAID', 'Akşam Maçı');
  INSERT INTO public.pitch_expenses (pitch_id, category, title, amount, expense_date) VALUES (v_pitch_id, 'Fatura', 'Elektrik', 4500, v_today - 1);
  INSERT INTO public.pitch_debtors (pitch_id, name, phone, amount_owed, last_match_date, is_resolved) VALUES (v_pitch_id, 'Ahmet Y.', '5321112233', 400, v_today - 2, false);
  RETURN v_pitch_id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 5) Dakikada bir çalışan otomatik onay işi ve elle onay çağrısı kaldırıldı.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto_approve_bookings') THEN
    PERFORM cron.unschedule('auto_approve_bookings');
  END IF;
EXCEPTION
  WHEN undefined_table THEN NULL;  -- pg_cron kurulu değilse sessizce geç
END $$;

DROP FUNCTION IF EXISTS public.auto_approve_pending_bookings();
DROP FUNCTION IF EXISTS public.staff_approve_booking(uuid);

DELETE FROM public.app_config WHERE key = 'app_booking_auto_approve_minutes';

-- ---------------------------------------------------------------------------
-- 6) Bekleyen rezervasyonlar kesinleşmiş sayılır (karar 18a).
--    Adım 1 sayesinde bu güncelleme geriye dönük bildirim üretmez.
-- ---------------------------------------------------------------------------
UPDATE public.pitch_bookings SET status = 'CONFIRMED' WHERE status = 'PENDING';

-- ---------------------------------------------------------------------------
-- 7) Otomatik onay kolonları düşürülür (karar 17b).
-- ---------------------------------------------------------------------------
ALTER TABLE public.pitches DROP COLUMN IF EXISTS auto_approve_enabled;
ALTER TABLE public.pitches DROP COLUMN IF EXISTS auto_approve_minutes;

-- ---------------------------------------------------------------------------
-- 8) Tesis onay/başvuru sistemi kaldırıldı.
--    Kolon YERİNDE BIRAKILIYOR: get_nearby_pitches, get_showcase_availability
--    ve admin sorguları hâlâ okuyor. Varsayılanı 'approved' yapıp mevcut tüm
--    satırları onaylı hâle getirmek, bu okumaları bozmadan "onaysız tesis"
--    kavramını ortadan kaldırır. Kolonun tamamen kalkması admin paneli
--    ekranlarıyla birlikte ele alınacak.
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_notify_admins_pitch_verification_request ON public.pitches;
DROP FUNCTION IF EXISTS public.notify_admins_pitch_verification_request();

DROP TRIGGER IF EXISTS trg_notify_pitch_verification ON public.pitches;
DROP FUNCTION IF EXISTS public.notify_on_pitch_verification();

ALTER TABLE public.pitches ALTER COLUMN verification_status SET DEFAULT 'approved';
UPDATE public.pitches
   SET verification_status = 'approved', verification_notes = NULL
 WHERE verification_status IS DISTINCT FROM 'approved';
