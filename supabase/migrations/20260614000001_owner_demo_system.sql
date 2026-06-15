-- ==============================================================================
-- OYNA — Saha Sahibi Demo Tesis Sistemi (tek kayıt, purge edilebilir)
-- is_demo = true olan tesis satış/demo deneyimi içindir.
-- purge_owner_demo() ile tek komutta silinir.
-- ==============================================================================

ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_pitches_is_demo ON public.pitches(is_demo) WHERE is_demo = true;

-- Demo tesisi: tüm OWNER rolündeki kullanıcılar yönetebilir (yalnızca is_demo=true)
DROP POLICY IF EXISTS "Owners manage demo pitches" ON public.pitches;
CREATE POLICY "Owners manage demo pitches" ON public.pitches FOR ALL
USING (
  is_demo = true
  AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'OWNER'
)
WITH CHECK (
  is_demo = true
  AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'OWNER'
);

DROP POLICY IF EXISTS "Owners manage demo pitch bookings" ON public.pitch_bookings;
CREATE POLICY "Owners manage demo pitch bookings" ON public.pitch_bookings FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.pitches p
    WHERE p.id = pitch_bookings.pitch_id AND p.is_demo = true
  )
  AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'OWNER'
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.pitches p
    WHERE p.id = pitch_bookings.pitch_id AND p.is_demo = true
  )
  AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'OWNER'
);

-- Sabit demo tesis UUID (purge/seed idempotent)
-- pitch_id: d1111111-1111-4111-8111-111111111111

DROP POLICY IF EXISTS "Authenticated users can view demo pitches" ON public.pitches;
CREATE POLICY "Authenticated users can view demo pitches" ON public.pitches FOR SELECT
USING (is_demo = true AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can view demo pitch bookings" ON public.pitch_bookings;
CREATE POLICY "Authenticated users can view demo pitch bookings" ON public.pitch_bookings FOR SELECT
USING (
  EXISTS (SELECT 1 FROM public.pitches p WHERE p.id = pitch_bookings.pitch_id AND p.is_demo = true)
  AND auth.uid() IS NOT NULL
);

CREATE OR REPLACE FUNCTION public.purge_owner_demo()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.pitches WHERE is_demo = true;
END;
$$;

CREATE OR REPLACE FUNCTION public.seed_owner_demo()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pitch_id UUID := 'd1111111-1111-4111-8111-111111111111';
  v_court1 UUID := 'd2222222-2222-4222-8222-222222222222';
  v_court2 UUID := 'd3333333-3333-4333-8333-333333333333';
  v_court3 UUID := 'd4444444-4444-4444-8444-444444444444';
  v_sub_id UUID := 'd5555555-5555-4555-8555-555555555555';
  v_today DATE := CURRENT_DATE;
  v_booking_id UUID;
BEGIN
  PERFORM public.purge_owner_demo();

  INSERT INTO public.pitches (
    id, name, city, district, address, description,
    owner_id, verification_status, is_open, is_demo,
    price_per_match, auto_approve_minutes, platform_commission_rate,
    amenities, working_hours, rating
  ) VALUES (
    v_pitch_id,
    'OYNA Demo Arena',
    'İstanbul',
    'Beşiktaş',
    'Demo Mahallesi, Spor Sk. No:1',
    'OYNA İşletme panelini deneyimlemek için oluşturulmuş demo tesis. Gerçek veri değildir.',
    NULL,
    'approved',
    true,
    true,
    3200,
    35,
    10,
    '["Otopark","Duş","Kafe","WiFi","Soyunma Odası"]'::jsonb,
    '[
      {"name":"Pazartesi","open":"08:00","close":"00:00"},
      {"name":"Salı","open":"08:00","close":"00:00"},
      {"name":"Çarşamba","open":"08:00","close":"00:00"},
      {"name":"Perşembe","open":"08:00","close":"00:00"},
      {"name":"Cuma","open":"08:00","close":"02:00"},
      {"name":"Cumartesi","open":"08:00","close":"02:00"},
      {"name":"Pazar","open":"08:00","close":"00:00"}
    ]'::jsonb,
    4.8
  );

  INSERT INTO public.courts (id, pitch_id, name, court_type, size, is_active, sort_order) VALUES
    (v_court1, v_pitch_id, 'Merkez Saha', 'OPEN', '30x50', true, 0),
    (v_court2, v_pitch_id, 'Yan Saha', 'OPEN', '28x48', true, 1),
    (v_court3, v_pitch_id, 'Kapalı Saha', 'CLOSED', '25x45', true, 2);

  INSERT INTO public.pitch_tariffs (pitch_id, name, tariff_type, applies_to_days, start_time, end_time, price_per_hour, deposit_amount, sort_order) VALUES
    (v_pitch_id, 'Gündüz Tarifesi', 'WEEKDAY', ARRAY[1,2,3,4,5], '08:00', '17:00', 2000, 500, 0),
    (v_pitch_id, 'Akşam Tarifesi', 'WEEKDAY', ARRAY[1,2,3,4,5], '17:00', '00:00', 3200, 1000, 1),
    (v_pitch_id, 'Hafta Sonu', 'WEEKEND', ARRAY[6,7], '08:00', '00:00', 3500, 1200, 2);

  -- Bugünkü rezervasyonlar
  INSERT INTO public.pitch_bookings (
    pitch_id, court_id, customer_name, customer_phone, booking_date, start_time, end_time,
    status, source, price, paid_amount, payment_status, title
  ) VALUES
    (v_pitch_id, v_court1, 'Ahmet Yılmaz', '5321112233', v_today, '17:00', '18:00', 'CONFIRMED', 'APP_BOOKING', 3200, 3200, 'PAID', 'Akşam Maçı'),
    (v_pitch_id, v_court1, 'Mehmet Demir', '5332223344', v_today, '18:00', '19:00', 'CONFIRMED', 'OWNER_MANUAL', 3200, 800, 'PARTIAL', 'Telefon Rezervasyon'),
    (v_pitch_id, v_court2, 'Kaplanlar FC', '5343334455', v_today, '19:00', '20:00', 'CONFIRMED', 'SUBSCRIPTION', 3200, 3200, 'PAID', 'Abone Maçı'),
    (v_pitch_id, v_court2, 'Vadi Gücü FC', '5354445566', v_today, '21:00', '22:00', 'PENDING', 'APP_BOOKING', 3200, 0, 'PENDING', 'Onay Bekliyor'),
    (v_pitch_id, v_court3, 'Gece Kuşları', '5365556677', v_today, '20:00', '21:00', 'CONFIRMED', 'APP_BOOKING', 3500, 3500, 'PAID', 'Prime Time');

  -- Dün + haftalık trend için ek kayıtlar
  INSERT INTO public.pitch_bookings (
    pitch_id, court_id, customer_name, booking_date, start_time, end_time,
    status, source, price, paid_amount, payment_status
  )
  SELECT
    v_pitch_id, v_court1, 'Demo Takım ' || g.i,
    v_today - ((g.i % 7) + 1),
    (17 + (g.i % 3))::text || ':00',
    (18 + (g.i % 3))::text || ':00',
    'CONFIRMED', 'OWNER_MANUAL', 2800 + (g.i * 100), 2800 + (g.i * 100), 'PAID'
  FROM generate_series(1, 12) AS g(i);

  INSERT INTO public.pitch_expenses (pitch_id, category, title, amount, expense_date, note) VALUES
    (v_pitch_id, 'Fatura', 'Elektrik Faturası', 4500, v_today - 1, 'Demo gider'),
    (v_pitch_id, 'Bakım', 'Granül Bakım', 1200, v_today - 3, 'Demo gider'),
    (v_pitch_id, 'Personel', 'Personel Avans', 2000, v_today - 5, 'Demo gider');

  INSERT INTO public.pitch_debtors (pitch_id, name, phone, amount_owed, last_match_date, notes, is_resolved) VALUES
    (v_pitch_id, 'Ahmet Yılmaz', '5321112233', 400, v_today - 2, 'Kalan ödeme', false),
    (v_pitch_id, 'Vadi Gücü FC', '5354445566', 1200, v_today - 4, 'Veresiye', false);

  INSERT INTO public.pitch_subscriptions (
    id, pitch_id, court_id, customer_name, weekday, start_time, end_time, price, status, start_date
  ) VALUES (
    v_sub_id, v_pitch_id, v_court2, 'Kaplanlar FC', 3, '19:00', '20:00', 3200, 'ACTIVE', v_today - 30
  );

  -- Ödeme kayıtları (finans sekmesi)
  FOR v_booking_id IN
    SELECT id FROM public.pitch_bookings
    WHERE pitch_id = v_pitch_id AND paid_amount > 0
    LIMIT 8
  LOOP
    INSERT INTO public.booking_payments (booking_id, amount, payment_method, note)
    SELECT v_booking_id, pb.paid_amount,
      CASE (random() * 3)::int
        WHEN 0 THEN 'CASH'
        WHEN 1 THEN 'CARD'
        ELSE 'BANK_TRANSFER'
      END,
      'Demo tahsilat'
    FROM public.pitch_bookings pb WHERE pb.id = v_booking_id;
  END LOOP;

  RETURN v_pitch_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_owner_demo_pitch_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.pitches WHERE is_demo = true LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.purge_owner_demo() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.seed_owner_demo() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_owner_demo() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.seed_owner_demo() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_owner_demo_pitch_id() TO authenticated, service_role;

-- Kaldırılan CRM / UI Builder tabloları (varsa)
DROP TABLE IF EXISTS public.crm_users CASCADE;
DROP TABLE IF EXISTS public.role_appearance_rules CASCADE;
DROP TABLE IF EXISTS public.facility_ui_configs CASCADE;
