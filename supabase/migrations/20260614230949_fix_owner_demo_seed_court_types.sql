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
  VALUES (v_pitch_id, 'OYNA Demo Arena', 'İstanbul', 'Beşiktaş', 'Demo Mahallesi, Spor Sk. No:1', 'OYNA demo tesis', NULL, 'approved', true, true, 3200, 35, 10, '["Otopark","Duş","Kafe"]'::jsonb, '[]'::jsonb, 4.8, '{"online": true, "deposit": false, "cash": true}'::jsonb);
  INSERT INTO public.courts (id, pitch_id, name, court_type, size, is_active, sort_order) VALUES
    (v_court1, v_pitch_id, 'Merkez Saha', 'OPEN', '30x50', true, 0),
    (v_court2, v_pitch_id, 'Yan Saha', 'OPEN', '28x48', true, 1),
    (v_court3, v_pitch_id, 'Kapalı Saha', 'CLOSED', '25x45', true, 2);
  INSERT INTO public.pitch_tariffs (pitch_id, name, tariff_type, applies_to_days, start_time, end_time, price_per_hour, deposit_amount, sort_order) VALUES
    (v_pitch_id, 'Gündüz', 'WEEKDAY', ARRAY[1,2,3,4,5], '08:00', '17:00', 2000, 500, 0),
    (v_pitch_id, 'Akşam', 'WEEKDAY', ARRAY[1,2,3,4,5], '17:00', '00:00', 3200, 1000, 1);
  INSERT INTO public.pitch_bank_accounts (id, pitch_id, bank_name, account_holder, iban, is_primary) VALUES
    ('d8888888-8888-4888-8888-888888888888', v_pitch_id, 'Ziraat Bankası', 'OYNA Demo Arena', 'TR000000000000000000000000', true);
  INSERT INTO public.pitch_staff_members (id, pitch_id, name, role_title, status, avatar_url, sort_order) VALUES
    (v_staff1, v_pitch_id, 'Murat S.', 'Tesis Müdürü', 'ON_DUTY', 'https://i.pravatar.cc/150?u=murat', 0),
    (v_staff2, v_pitch_id, 'Sinan K.', 'Saha Sorumlusu', 'ON_DUTY', 'https://i.pravatar.cc/150?u=sinan', 1);
  INSERT INTO public.pitch_staff_tasks (pitch_id, title, assigned_to, assigned_name, priority, status, due_time) VALUES
    (v_pitch_id, 'Aydınlatma Kontrolü', v_staff2, 'Sinan K.', 'HIGH', 'PENDING', '18:00');
  INSERT INTO public.pitch_bookings (pitch_id, court_id, customer_name, customer_phone, booking_date, start_time, end_time, status, source, price, paid_amount, payment_status, title)
  VALUES (v_pitch_id, v_court1, 'Ahmet Y.', '5321112233', v_today, '17:00', '18:00', 'CONFIRMED', 'APP_BOOKING', 3200, 3200, 'PAID', 'Akşam Maçı'),
         (v_pitch_id, v_court2, 'Vadi Gücü FC', '5354445566', v_today, '21:00', '22:00', 'PENDING', 'APP_BOOKING', 3200, 0, 'PENDING', 'Onay Bekliyor');
  INSERT INTO public.pitch_expenses (pitch_id, category, title, amount, expense_date) VALUES (v_pitch_id, 'Fatura', 'Elektrik', 4500, v_today - 1);
  INSERT INTO public.pitch_debtors (pitch_id, name, phone, amount_owed, last_match_date, is_resolved) VALUES (v_pitch_id, 'Ahmet Y.', '5321112233', 400, v_today - 2, false);
  RETURN v_pitch_id;
END;
$$;
