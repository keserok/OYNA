-- ==============================================================================
-- OYNA — FAZ 1.4: Ordu Lansman Tesisleri (gerçek veri, demo DEĞİL)
-- Lansman şehri Ordu / Altınordu. 4 tesis, kortları ve fiyatlarıyla.
-- Idempotent: sabit UUID + ON CONFLICT; tekrar çalıştırılabilir.
-- Kaynak: docs/OYNA_MASTER_PRENSIPLER.md §9.
-- ==============================================================================

DO $$
DECLARE
  v_capo   UUID := 'a0000001-0001-4001-8001-000000000001';
  v_olimp  UUID := 'a0000002-0002-4002-8002-000000000002';
  v_vip    UUID := 'a0000003-0003-4003-8003-000000000003';
  v_akuru  UUID := 'a0000004-0004-4004-8004-000000000004';
  v_wh JSONB := '[
    {"name":"Pazartesi","open":"09:00","close":"00:00"},
    {"name":"Salı","open":"09:00","close":"00:00"},
    {"name":"Çarşamba","open":"09:00","close":"00:00"},
    {"name":"Perşembe","open":"09:00","close":"00:00"},
    {"name":"Cuma","open":"09:00","close":"02:00"},
    {"name":"Cumartesi","open":"09:00","close":"02:00"},
    {"name":"Pazar","open":"09:00","close":"00:00"}
  ]'::jsonb;
BEGIN
  -- ── Tesisler (pitches) ──────────────────────────────────────────────────────
  -- owner_id NULL: admin-kurulumlu tesis; bir saha sahibi sahiplenene kadar boş.
  INSERT INTO public.pitches (
    id, name, city, district, address, description,
    owner_id, verification_status, is_open, is_demo,
    price_per_match, total_price, price_per_person,
    auto_approve_minutes, platform_commission_rate,
    amenities, working_hours, rating, latitude, longitude
  ) VALUES
    (v_capo,  'Capo Arena',            'Ordu', 'Altınordu', 'Altınordu, Ordu',
     'Ordu''nun merkezinde 3 kortlu halı saha tesisi.',
     NULL, 'approved', true, false, 3200, 3200, 40, 15, 15,
     '["Otopark","Duş","Kafe","Soyunma Odası"]'::jsonb, v_wh, 4.7, 40.9861, 37.8790),
    (v_olimp, 'Olimpiyat',             'Ordu', 'Altınordu', 'Altınordu, Ordu',
     '3 kortlu, sabit fiyatlı modern halı saha kompleksi.',
     NULL, 'approved', true, false, 3000, 3000, 38, 15, 15,
     '["Otopark","Duş","Kafe"]'::jsonb, v_wh, 4.6, 40.9805, 37.8702),
    (v_vip,   'VIP Arena',             'Ordu', 'Altınordu', 'Altınordu, Ordu',
     'Premium zemin ve aydınlatmaya sahip 3 kortlu tesis.',
     NULL, 'approved', true, false, 3200, 3200, 40, 15, 15,
     '["Otopark","Duş","Kafe","WiFi","Soyunma Odası"]'::jsonb, v_wh, 4.8, 40.9912, 37.8845),
    (v_akuru, 'Ahmet Kuru Tesisleri',  'Ordu', 'Altınordu', 'Altınordu, Ordu',
     '4 kortlu, farklı fiyat seçenekleri sunan geniş tesis.',
     NULL, 'approved', true, false, 1200, 3200, 30, 15, 15,
     '["Otopark","Duş","Kafe","Soyunma Odası","Tribün"]'::jsonb, v_wh, 4.5, 40.9778, 37.8650)
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    city = EXCLUDED.city,
    district = EXCLUDED.district,
    verification_status = EXCLUDED.verification_status,
    is_open = EXCLUDED.is_open,
    is_demo = false,
    amenities = EXCLUDED.amenities,
    working_hours = EXCLUDED.working_hours,
    rating = EXCLUDED.rating,
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude;

  -- ── Kortlar (courts) — kort başı fiyatlar spec §9'a göre ────────────────────
  DELETE FROM public.courts WHERE pitch_id IN (v_capo, v_olimp, v_vip, v_akuru);

  INSERT INTO public.courts (pitch_id, name, court_type, size, price, is_active, sort_order) VALUES
    -- Capo Arena: 2000 · 3200 · 3200
    (v_capo,  '1. Saha', 'OPEN', '30x50', 2000, true, 0),
    (v_capo,  '2. Saha', 'OPEN', '30x50', 3200, true, 1),
    (v_capo,  '3. Saha', 'OPEN', '30x50', 3200, true, 2),
    -- Olimpiyat: 3000 · 3000 · 3000
    (v_olimp, '1. Saha', 'OPEN', '30x50', 3000, true, 0),
    (v_olimp, '2. Saha', 'OPEN', '30x50', 3000, true, 1),
    (v_olimp, '3. Saha', 'OPEN', '30x50', 3000, true, 2),
    -- VIP Arena: 3200 · 3200 · 3200
    (v_vip,   '1. Saha', 'OPEN', '30x50', 3200, true, 0),
    (v_vip,   '2. Saha', 'OPEN', '30x50', 3200, true, 1),
    (v_vip,   '3. Saha', 'OPEN', '30x50', 3200, true, 2),
    -- Ahmet Kuru: 1200 · 2300 · 3000 · 3200
    (v_akuru, '1. Saha', 'OPEN', '25x45', 1200, true, 0),
    (v_akuru, '2. Saha', 'OPEN', '28x48', 2300, true, 1),
    (v_akuru, '3. Saha', 'OPEN', '30x50', 3000, true, 2),
    (v_akuru, '4. Saha', 'OPEN', '30x50', 3200, true, 3);

  -- ── Temel tarifeler (pitch_tariffs) — kapora = fiyatın ~%30'u ───────────────
  DELETE FROM public.pitch_tariffs WHERE pitch_id IN (v_capo, v_olimp, v_vip, v_akuru);

  INSERT INTO public.pitch_tariffs (pitch_id, name, tariff_type, applies_to_days, start_time, end_time, price_per_hour, deposit_amount, sort_order) VALUES
    (v_capo,  'Hafta İçi', 'WEEKDAY', ARRAY[1,2,3,4,5], '09:00', '17:00', 2000, 600, 0),
    (v_capo,  'Akşam',     'WEEKDAY', ARRAY[1,2,3,4,5], '17:00', '00:00', 3200, 960, 1),
    (v_capo,  'Hafta Sonu','WEEKEND', ARRAY[6,7],       '09:00', '00:00', 3200, 960, 2),
    (v_olimp, 'Tüm Saatler','WEEKDAY',ARRAY[1,2,3,4,5], '09:00', '00:00', 3000, 900, 0),
    (v_olimp, 'Hafta Sonu','WEEKEND', ARRAY[6,7],       '09:00', '00:00', 3000, 900, 1),
    (v_vip,   'Tüm Saatler','WEEKDAY',ARRAY[1,2,3,4,5], '09:00', '00:00', 3200, 960, 0),
    (v_vip,   'Hafta Sonu','WEEKEND', ARRAY[6,7],       '09:00', '00:00', 3200, 960, 1),
    (v_akuru, 'Ekonomik',  'WEEKDAY', ARRAY[1,2,3,4,5], '09:00', '17:00', 1200, 360, 0),
    (v_akuru, 'Akşam',     'WEEKDAY', ARRAY[1,2,3,4,5], '17:00', '00:00', 3000, 900, 1),
    (v_akuru, 'Hafta Sonu','WEEKEND', ARRAY[6,7],       '09:00', '00:00', 3200, 960, 2);
END $$;
