-- ==============================================================================
-- OYNA: Tesis Sahibi & Doluluk — TEK KAYNAK Mimarisi (Faz 1)
-- ------------------------------------------------------------------------------
-- Doluluğu tek kaynağa indirir: pitches (TESİS) -> courts (SAHA) -> pitch_bookings
-- (SLOT/REZERVASYON = tek kaynak). Yüzde % türetilir, ayrı tutulmaz.
-- Abonmanlar pitch_subscriptions'ta tutulur ve pitch_bookings'e materialize edilir.
-- Görünürlük ayrımı: pitch_bookings yalnız sahibe açık; oyuncuya court_availability
-- view'ı ile yalnız güvenli kolonlar (müşteri/ödeme gizli) açılır.
-- Idempotent: canlıda migration takibi yok, şema elle kurulu (IF NOT EXISTS / DROP IF EXISTS).
-- ==============================================================================

-- 1. SAHA (COURTS) TABLOSU --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.courts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pitch_id UUID NOT NULL REFERENCES public.pitches(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    court_type VARCHAR(20) DEFAULT 'CLOSED' CHECK (court_type IN ('OPEN', 'CLOSED')),
    size VARCHAR(20),                       -- örn "5v5", "7v7" (opsiyonel)
    price NUMERIC(10,2),                    -- saha-bazlı taban saatlik ücret
    images JSONB DEFAULT '[]',
    description TEXT,
    is_active BOOLEAN DEFAULT true,         -- "Bakımda (Gizli)" toggle
    lighting_grade VARCHAR(1) CHECK (lighting_grade IN ('A', 'B', 'C')),
    grass_grade VARCHAR(1) CHECK (grass_grade IN ('A', 'B', 'C')),
    locker_grade VARCHAR(1) CHECK (locker_grade IN ('A', 'B', 'C')),
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS courts_pitch_id_idx ON public.courts(pitch_id);

-- 2. ABONMAN (SUBSCRIPTIONS) TABLOSU ---------------------------------------------
-- weekday: 0=Pazartesi ... 6=Pazar (OwnerPanel days[] ile hizalı)
CREATE TABLE IF NOT EXISTS public.pitch_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    court_id UUID NOT NULL REFERENCES public.courts(id) ON DELETE CASCADE,
    pitch_id UUID NOT NULL REFERENCES public.pitches(id) ON DELETE CASCADE,
    customer_name VARCHAR(150),
    customer_phone VARCHAR(30),
    weekday INT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    price NUMERIC(10,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED', 'CANCELLED')),
    start_date DATE DEFAULT CURRENT_DATE,
    end_date DATE,                          -- null = süresiz
    materialized_until DATE,                -- yalnız İLERİ doldurma için ufuk işareti
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pitch_subscriptions_court_idx ON public.pitch_subscriptions(court_id);
CREATE INDEX IF NOT EXISTS pitch_subscriptions_pitch_idx ON public.pitch_subscriptions(pitch_id);

-- 3. PITCH_BOOKINGS GENİŞLETME (TEK KAYNAK) --------------------------------------
ALTER TABLE public.pitch_bookings ADD COLUMN IF NOT EXISTS court_id UUID REFERENCES public.courts(id) ON DELETE CASCADE;
ALTER TABLE public.pitch_bookings ADD COLUMN IF NOT EXISTS subscription_id UUID REFERENCES public.pitch_subscriptions(id) ON DELETE CASCADE;
ALTER TABLE public.pitch_bookings ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'OWNER_MANUAL';
ALTER TABLE public.pitch_bookings ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'PENDING';
ALTER TABLE public.pitch_bookings ADD COLUMN IF NOT EXISTS price NUMERIC(10,2) DEFAULT 0;
ALTER TABLE public.pitch_bookings ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(10,2) DEFAULT 0;
ALTER TABLE public.pitch_bookings ADD COLUMN IF NOT EXISTS customer_name VARCHAR(150);
ALTER TABLE public.pitch_bookings ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(30);

-- CHECK kısıtları (idempotent: drop + add)
ALTER TABLE public.pitch_bookings DROP CONSTRAINT IF EXISTS pitch_bookings_source_check;
ALTER TABLE public.pitch_bookings ADD CONSTRAINT pitch_bookings_source_check
    CHECK (source IN ('OWNER_MANUAL', 'APP_BOOKING', 'SUBSCRIPTION', 'APP_MATCH'));
ALTER TABLE public.pitch_bookings DROP CONSTRAINT IF EXISTS pitch_bookings_payment_status_check;
ALTER TABLE public.pitch_bookings ADD CONSTRAINT pitch_bookings_payment_status_check
    CHECK (payment_status IN ('PAID', 'PARTIAL', 'PENDING'));

-- Saha artık doluluğun birimi → court_id zorunlu (tablo boş, güvenli)
ALTER TABLE public.pitch_bookings ALTER COLUMN court_id SET NOT NULL;

-- Eski tesis-bazlı tekil kısıt kaldırılır (saha bazlı çakışma kısıtı gelecek)
ALTER TABLE public.pitch_bookings DROP CONSTRAINT IF EXISTS unique_pitch_booking_time;

-- Çakışma önleme (race-safe, DB seviyesi): aynı sahada zaman aralıkları örtüşemez.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- slot_range: gece yarısını geçen saatleri doğru ele alır (kapanış 00:00/02:00 vb.)
ALTER TABLE public.pitch_bookings ADD COLUMN IF NOT EXISTS slot_range TSRANGE
    GENERATED ALWAYS AS (
        tsrange(
            (booking_date + start_time),
            CASE WHEN end_time <= start_time
                 THEN (booking_date + 1 + end_time)
                 ELSE (booking_date + end_time) END
        )
    ) STORED;

ALTER TABLE public.pitch_bookings DROP CONSTRAINT IF EXISTS pitch_bookings_no_overlap;
ALTER TABLE public.pitch_bookings ADD CONSTRAINT pitch_bookings_no_overlap
    EXCLUDE USING gist (court_id WITH =, slot_range WITH &&)
    WHERE (status <> 'CANCELLED');

CREATE INDEX IF NOT EXISTS pitch_bookings_court_date_idx ON public.pitch_bookings(court_id, booking_date);
CREATE INDEX IF NOT EXISTS pitch_bookings_subscription_idx ON public.pitch_bookings(subscription_id);

-- 4. DOLULUK TÜRETME FONKSİYONU --------------------------------------------------
-- Bir sahanın belirli gündeki doluluk yüzdesi = dolu dakika / çalışma süresi.
CREATE OR REPLACE FUNCTION public.get_court_occupancy(p_court_id UUID, p_date DATE)
RETURNS INT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER   -- oyuncu tarafı (Faz 2) RLS olmadan doluluk okuyabilsin; yalnız int döner, veri sızmaz
SET search_path = public
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
    IF v_close_m <= v_open_m THEN v_close_m := v_close_m + 1440; END IF;  -- gece yarısı sonrası kapanış
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

-- 5. ABONMAN MATERIALIZE & İPTAL FONKSİYONLARI -----------------------------------
-- p_sub_id NULL ise tüm ACTIVE abonmanlar (cron); doluysa tek abonman (app, sahiplik kontrollü).
-- Yalnız İLERİ doldurur (materialized_until) → silinen bir slot kalıcı istisna olur.
CREATE OR REPLACE FUNCTION public.materialize_subscriptions(p_horizon_weeks INT DEFAULT 12, p_sub_id UUID DEFAULT NULL)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
            RAISE EXCEPTION 'Yetkisiz: bu abonman size ait değil';
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
            -- ISODOW: 1=Pzt..7=Paz  →  (ISODOW-1) = 0=Pzt..6=Paz
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
                    NULL;  -- slot zaten dolu → atla (istisna/çakışma)
                END;
            END IF;
            v_date := v_date + 1;
        END LOOP;

        UPDATE public.pitch_subscriptions SET materialized_until = v_end WHERE id = sub.id;
    END LOOP;

    RETURN v_created;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_subscription(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.pitch_subscriptions s
        JOIN public.pitches p ON p.id = s.pitch_id
        WHERE s.id = p_id
          AND (p.owner_id = auth.uid()
               OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('ADMIN', 'SUPER_ADMIN'))
    ) THEN
        RAISE EXCEPTION 'Yetkisiz: bu abonman size ait değil';
    END IF;

    UPDATE public.pitch_subscriptions SET status = 'CANCELLED' WHERE id = p_id;
    DELETE FROM public.pitch_bookings
     WHERE subscription_id = p_id AND booking_date >= CURRENT_DATE;
END;
$$;

-- 6. RLS & GÖRÜNÜRLÜK ------------------------------------------------------------

-- COURTS: herkes okur, sahibi yönetir, admin yönetir
ALTER TABLE public.courts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Courts viewable by everyone" ON public.courts;
CREATE POLICY "Courts viewable by everyone" ON public.courts FOR SELECT USING (true);
DROP POLICY IF EXISTS "Owners manage their courts" ON public.courts;
CREATE POLICY "Owners manage their courts" ON public.courts FOR ALL
    USING (EXISTS (SELECT 1 FROM public.pitches p WHERE p.id = courts.pitch_id AND p.owner_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM public.pitches p WHERE p.id = courts.pitch_id AND p.owner_id = auth.uid()));
DROP POLICY IF EXISTS "Admins manage courts" ON public.courts;
CREATE POLICY "Admins manage courts" ON public.courts FOR ALL
    USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('ADMIN', 'SUPER_ADMIN'));

-- PITCH_SUBSCRIPTIONS: yalnız sahibi/admin (müşteri verisi içerir, public YOK)
ALTER TABLE public.pitch_subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owners manage their subscriptions" ON public.pitch_subscriptions;
CREATE POLICY "Owners manage their subscriptions" ON public.pitch_subscriptions FOR ALL
    USING (EXISTS (SELECT 1 FROM public.pitches p WHERE p.id = pitch_subscriptions.pitch_id AND p.owner_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM public.pitches p WHERE p.id = pitch_subscriptions.pitch_id AND p.owner_id = auth.uid()));
DROP POLICY IF EXISTS "Admins manage subscriptions" ON public.pitch_subscriptions;
CREATE POLICY "Admins manage subscriptions" ON public.pitch_subscriptions FOR ALL
    USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('ADMIN', 'SUPER_ADMIN'));

-- PITCH_BOOKINGS: public SELECT KALDIRILIR (müşteri/ödeme sızdırıyor); yalnız sahibi/admin.
-- (INSERT/UPDATE/DELETE owner policy'leri owner_pitches migration'ından gelir; pitch_id korunduğu için geçerli.)
-- Not: canlıdaki politika ismi noktasız; iki varyantı da DROP ediyoruz
DROP POLICY IF EXISTS "Public pitch bookings are viewable by everyone." ON public.pitch_bookings;
DROP POLICY IF EXISTS "Public pitch bookings are viewable by everyone" ON public.pitch_bookings;
DROP POLICY IF EXISTS "Owners view their bookings" ON public.pitch_bookings;
CREATE POLICY "Owners view their bookings" ON public.pitch_bookings FOR SELECT
    USING (EXISTS (SELECT 1 FROM public.pitches p WHERE p.id = pitch_bookings.pitch_id AND p.owner_id = auth.uid()));
DROP POLICY IF EXISTS "Admins manage bookings" ON public.pitch_bookings;
CREATE POLICY "Admins manage bookings" ON public.pitch_bookings FOR ALL
    USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('ADMIN', 'SUPER_ADMIN'));

-- PITCHES: sahibi kendi tesisini oluşturabilsin (mevcut owner UPDATE + public SELECT korunur)
DROP POLICY IF EXISTS "Owners can insert their own pitches" ON public.pitches;
CREATE POLICY "Owners can insert their own pitches" ON public.pitches FOR INSERT
    WITH CHECK (owner_id = auth.uid());

-- GÖRÜNÜRLÜK AYRIMI: oyuncuya yalnız güvenli müsaitlik kolonları açan view.
-- security_invoker=off → RLS'i bypass eder ama yalnız bu 7 kolon görünür (müşteri/ödeme gizli).
DROP VIEW IF EXISTS public.court_availability;
CREATE VIEW public.court_availability
    WITH (security_invoker = off) AS
    SELECT id, court_id, pitch_id, booking_date, start_time, end_time, status
    FROM public.pitch_bookings
    WHERE status <> 'CANCELLED';
GRANT SELECT ON public.court_availability TO anon, authenticated;

-- 7. FONKSİYON YETKİLERİ ---------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.get_court_occupancy(UUID, DATE) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.materialize_subscriptions(INT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_subscription(UUID) TO authenticated;
-- SECURITY DEFINER fonksiyonlar yalnız authenticated olsun; Postgres'in default PUBLIC grant'ini kaldır
REVOKE EXECUTE ON FUNCTION public.materialize_subscriptions(INT, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_subscription(UUID) FROM PUBLIC;

-- 8. pg_cron: günlük ufuk kaydırma -----------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'materialize_subs_daily') THEN
            PERFORM cron.unschedule('materialize_subs_daily');
        END IF;
        PERFORM cron.schedule('materialize_subs_daily', '5 0 * * *', 'SELECT public.materialize_subscriptions(12)');
    END IF;
END $$;
