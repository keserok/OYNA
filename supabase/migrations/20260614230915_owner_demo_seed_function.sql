-- [DB GEÇMİŞİNDEN KURTARILDI 2026-07-11] Bu migration canlı veritabanına uygulanmıştı ancak repoda dosyası yoktu; supabase_migrations.schema_migrations.statements kolonundan geri çıkarıldı.

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
  INSERT INTO public.pitches (id, name, city, district, address, description, owner_id, verification_status, is_open, is_demo, price_per_match, auto_approve_minutes, platform_commission_rate, amenities, working_hours, rating, payment_options)
  VALUES (v_pitch_id, 'OYNA Demo Arena', 'İstanbul', 'Beşiktaş', 'Demo Mahallesi, Spor Sk. No:1', 'OYNA İşletme panelini deneyimlemek için oluşturulmuş demo tesis.', NULL, 'approved', true, true, 3200, 35, 10, '["Otopark","Duş","Kafe","WiFi","Soyunma Odası"]'::jsonb, '[{"name":"Pazartesi","open":"08:00","close":"00:00"},{"name":"Salı","open":"08:00","close":"00:00"},{"name":"Çarşamba","open":"08:00","close":"00:00"},{"name":"Perşembe","open":"08:00","close":"00:00"},{"name":"Cuma","open":"08:00","close":"02:00"},{"name":"Cumartesi","open":"08:00","close":"02:00"},{"name":"Pazar","open":"08:00","close":"00:00"}]'::jsonb, 4.8, '{"online": true, "deposit": false, "cash": true}'::jsonb);
  INSERT INTO public.courts (id, pitch_id, name, court_type, size, is_active, sort_order) VALUES
    (v_court1, v_pitch_id, 'Merkez Saha', 'TURF', '30x50', true, 0),
    (v_court2, v_pitch_id, 'Yan Saha', 'TURF', '28x48', true, 1),
    (v_court3, v_pitch_id, 'Kapalı Saha', 'INDOOR', '25x45', true, 2);
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
  RETURN v_pitch_id;
END;
$$;
REVOKE ALL ON FUNCTION public.seed_owner_demo() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_owner_demo() TO authenticated, service_role;
