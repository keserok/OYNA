-- ==============================================================================
-- OYNA — Saha Sahibi Panel Tamamlama (Abonelik planı hariç)
-- pitch_staff_members, pitch_staff_tasks, pitch_bank_accounts
-- pitches.payment_options + Param alanları
-- ==============================================================================

-- Ödeme ayarları (pitches)
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS payment_options JSONB DEFAULT '{"online": true, "deposit": false, "cash": true}'::jsonb;
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS param_merchant_id TEXT;
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS param_client_id TEXT;
ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS param_api_key TEXT;

COMMENT ON COLUMN public.pitches.payment_options IS 'online/deposit/cash ödeme yöntemi tercihleri';
COMMENT ON COLUMN public.pitches.param_api_key IS 'Param API anahtarı — yalnızca tesis sahibi RLS ile erişir';

-- Banka hesapları
CREATE TABLE IF NOT EXISTS public.pitch_bank_accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pitch_id UUID NOT NULL REFERENCES public.pitches(id) ON DELETE CASCADE,
  bank_name TEXT NOT NULL,
  account_holder TEXT NOT NULL,
  iban TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pitch_bank_accounts_pitch ON public.pitch_bank_accounts(pitch_id);

ALTER TABLE public.pitch_bank_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners manage pitch bank accounts" ON public.pitch_bank_accounts;
CREATE POLICY "Owners manage pitch bank accounts" ON public.pitch_bank_accounts FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.pitches p
    WHERE p.id = pitch_bank_accounts.pitch_id
      AND (
        p.owner_id = auth.uid()
        OR (p.is_demo = true AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'OWNER')
      )
  )
  OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'ADMIN'
);

-- Personel
CREATE TABLE IF NOT EXISTS public.pitch_staff_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pitch_id UUID NOT NULL REFERENCES public.pitches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role_title TEXT NOT NULL DEFAULT 'Personel',
  status TEXT NOT NULL DEFAULT 'OFF_DUTY'
    CHECK (status IN ('ON_DUTY', 'OFF_DUTY', 'LEAVE')),
  avatar_url TEXT,
  phone TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pitch_staff_members_pitch ON public.pitch_staff_members(pitch_id);

ALTER TABLE public.pitch_staff_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners manage pitch staff" ON public.pitch_staff_members;
CREATE POLICY "Owners manage pitch staff" ON public.pitch_staff_members FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.pitches p
    WHERE p.id = pitch_staff_members.pitch_id
      AND (
        p.owner_id = auth.uid()
        OR (p.is_demo = true AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'OWNER')
      )
  )
  OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'ADMIN'
);

-- Görevler
CREATE TABLE IF NOT EXISTS public.pitch_staff_tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pitch_id UUID NOT NULL REFERENCES public.pitches(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  assigned_to UUID REFERENCES public.pitch_staff_members(id) ON DELETE SET NULL,
  assigned_name TEXT,
  priority TEXT NOT NULL DEFAULT 'MEDIUM'
    CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH')),
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'COMPLETED', 'CANCELLED')),
  due_time TEXT,
  due_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pitch_staff_tasks_pitch ON public.pitch_staff_tasks(pitch_id, status);

ALTER TABLE public.pitch_staff_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners manage pitch tasks" ON public.pitch_staff_tasks;
CREATE POLICY "Owners manage pitch tasks" ON public.pitch_staff_tasks FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.pitches p
    WHERE p.id = pitch_staff_tasks.pitch_id
      AND (
        p.owner_id = auth.uid()
        OR (p.is_demo = true AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'OWNER')
      )
  )
  OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'ADMIN'
);

-- Demo seed: mevcut fonksiyona personel + banka + ödeme ayarları ekle
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
  v_staff1 UUID := 'd6666666-6666-4666-8666-666666666666';
  v_staff2 UUID := 'd7777777-7777-4777-8777-777777777777';
  v_today DATE := CURRENT_DATE;
  v_booking_id UUID;
BEGIN
  PERFORM public.purge_owner_demo();

  INSERT INTO public.pitches (
    id, name, city, district, address, description,
    owner_id, verification_status, is_open, is_demo,
    price_per_match, auto_approve_minutes, platform_commission_rate,
    amenities, working_hours, rating, payment_options
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
    4.8,
    '{"online": true, "deposit": false, "cash": true}'::jsonb
  );

  INSERT INTO public.courts (id, pitch_id, name, court_type, size, is_active, sort_order) VALUES
    (v_court1, v_pitch_id, 'Merkez Saha', 'OPEN', '30x50', true, 0),
    (v_court2, v_pitch_id, 'Yan Saha', 'OPEN', '28x48', true, 1),
    (v_court3, v_pitch_id, 'Kapalı Saha', 'CLOSED', '25x45', true, 2);

  INSERT INTO public.pitch_tariffs (pitch_id, name, tariff_type, applies_to_days, start_time, end_time, price_per_hour, deposit_amount, sort_order) VALUES
    (v_pitch_id, 'Gündüz Tarifesi', 'WEEKDAY', ARRAY[1,2,3,4,5], '08:00', '17:00', 2000, 500, 0),
    (v_pitch_id, 'Akşam Tarifesi', 'WEEKDAY', ARRAY[1,2,3,4,5], '17:00', '00:00', 3200, 1000, 1),
    (v_pitch_id, 'Hafta Sonu', 'WEEKEND', ARRAY[6,7], '08:00', '00:00', 3500, 1200, 2);

  INSERT INTO public.pitch_bank_accounts (id, pitch_id, bank_name, account_holder, iban, is_primary) VALUES
    ('d8888888-8888-4888-8888-888888888888', v_pitch_id, 'Ziraat Bankası', 'OYNA Demo Arena', 'TR000000000000000000000000', true);

  INSERT INTO public.pitch_staff_members (id, pitch_id, name, role_title, status, avatar_url, sort_order) VALUES
    (v_staff1, v_pitch_id, 'Murat S.', 'Tesis Müdürü', 'ON_DUTY', 'https://i.pravatar.cc/150?u=murat', 0),
    (v_staff2, v_pitch_id, 'Sinan K.', 'Saha Sorumlusu', 'ON_DUTY', 'https://i.pravatar.cc/150?u=sinan', 1);

  INSERT INTO public.pitch_staff_tasks (pitch_id, title, assigned_to, assigned_name, priority, status, due_time) VALUES
    (v_pitch_id, 'Saha 1 Aydınlatma Kontrolü', v_staff2, 'Sinan K.', 'HIGH', 'PENDING', '18:00'),
    (v_pitch_id, 'Kasa Kapanış Raporu', v_staff1, 'Murat S.', 'HIGH', 'PENDING', '23:30');

  INSERT INTO public.pitch_bookings (
    pitch_id, court_id, customer_name, customer_phone, booking_date, start_time, end_time,
    status, source, price, paid_amount, payment_status, title
  ) VALUES
    (v_pitch_id, v_court1, 'Ahmet Yılmaz', '5321112233', v_today, '17:00', '18:00', 'CONFIRMED', 'APP_BOOKING', 3200, 3200, 'PAID', 'Akşam Maçı'),
    (v_pitch_id, v_court1, 'Mehmet Demir', '5332223344', v_today, '18:00', '19:00', 'CONFIRMED', 'OWNER_MANUAL', 3200, 800, 'PARTIAL', 'Telefon Rezervasyon'),
    (v_pitch_id, v_court2, 'Kaplanlar FC', '5343334455', v_today, '19:00', '20:00', 'CONFIRMED', 'SUBSCRIPTION', 3200, 3200, 'PAID', 'Abone Maçı'),
    (v_pitch_id, v_court2, 'Vadi Gücü FC', '5354445566', v_today, '21:00', '22:00', 'PENDING', 'APP_BOOKING', 3200, 0, 'PENDING', 'Onay Bekliyor'),
    (v_pitch_id, v_court3, 'Gece Kuşları', '5365556677', v_today, '20:00', '21:00', 'CONFIRMED', 'APP_BOOKING', 3500, 3500, 'PAID', 'Prime Time');

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

REVOKE ALL ON FUNCTION public.seed_owner_demo() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_owner_demo() TO authenticated, service_role;
