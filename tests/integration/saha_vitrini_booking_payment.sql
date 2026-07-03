-- ============================================================================
-- SAHA VİTRİNİ — Rezervasyon yarışı, kapora kaydı ve owner bildirim testi
-- Çifte rezervasyon (pitch_bookings_no_overlap EXCLUDE + SLOT_TAKEN) ·
-- record_app_deposit_payment (sahiplik, aşım koruması, booking_payments +
-- paid_amount/payment_status) · doğrulama / kalite notu onayı / change-request
-- kararı bildirimleri (notify_pitch_owner).
-- İzole: BEGIN/ROLLBACK. Canlı projede 8/8 PASS doğrulandı (2026-07-03).
-- ============================================================================
BEGIN;
CREATE TEMP TABLE _r(test text, ok boolean, got text) ON COMMIT DROP;
GRANT ALL ON _r TO authenticated;
DO $$
DECLARE
  own uuid:='52000000-0000-0000-0000-0000000000a1';
  ply uuid:='52000000-0000-0000-0000-0000000000a2';
  ply2 uuid:='52000000-0000-0000-0000-0000000000a3';
  adm uuid:='52000000-0000-0000-0000-0000000000a4';
  pt uuid:='52000000-0000-0000-0000-0000000000b1';
  ct uuid:='52000000-0000-0000-0000-0000000000c1';
  v_booking uuid; v_paid numeric; v_pstat text; v_cnt int; v_txt text;
BEGIN
  INSERT INTO auth.users(id) VALUES (own),(ply),(ply2),(adm);
  UPDATE public.profiles SET is_admin=true, role='SUPER_ADMIN' WHERE id=adm;
  INSERT INTO public.pitches(id, owner_id, name, address, city, district, verification_status, is_demo, auto_approve_minutes, auto_approve_enabled)
    VALUES (pt, own, 'Yarış Arena', 'Adres 1', 'Ordu', 'Altınordu', 'pending', false, 0, true);
  INSERT INTO public.courts(id, pitch_id, name, court_type, surface) VALUES (ct, pt, 'Kort A', 'OPEN', 'TURF');
  INSERT INTO public.pitch_tariffs(pitch_id, name, tariff_type, applies_to_days, start_time, end_time, price_per_hour, deposit_amount, is_active)
    VALUES (pt, 'Standart', 'WEEKDAY', ARRAY[1,2,3,4,5,6,7], '09:00', '23:59', 1000, 300, true);

  -- ── Yarış: iki oyuncu aynı saati almaya çalışır ──
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',ply,'role','authenticated')::text, true);
  v_booking := public.create_pitch_booking(pt, ct, (now()::date + 1), '20:00', '21:00', 'APP_BOOKING', NULL, NULL, NULL, 'Oyuncu1');
  INSERT INTO _r VALUES ('RACE_first_booking_ok', v_booking IS NOT NULL, 'id ok');

  PERFORM set_config('request.jwt.claims', json_build_object('sub',ply2,'role','authenticated')::text, true);
  BEGIN
    PERFORM public.create_pitch_booking(pt, ct, (now()::date + 1), '20:00', '21:00', 'APP_BOOKING', NULL, NULL, NULL, 'Oyuncu2');
    INSERT INTO _r VALUES ('RACE_second_booking_blocked', false, 'izin verdi!');
  EXCEPTION WHEN others THEN
    INSERT INTO _r VALUES ('RACE_second_booking_blocked', position('SLOT_TAKEN' in SQLERRM)>0, SQLERRM);
  END;

  -- ── Kapora kaydı: sahibi işler, yabancı işleyemez, aşım engellenir ──
  BEGIN
    PERFORM public.record_app_deposit_payment(v_booking, 300);
    INSERT INTO _r VALUES ('PAY_stranger_blocked', false, 'izin verdi!');
  EXCEPTION WHEN others THEN
    INSERT INTO _r VALUES ('PAY_stranger_blocked', position('UNAUTHORIZED' in SQLERRM)>0, 'ok');
  END;

  PERFORM set_config('request.jwt.claims', json_build_object('sub',ply,'role','authenticated')::text, true);
  PERFORM public.record_app_deposit_payment(v_booking, 300);
  EXECUTE 'RESET ROLE';
  SELECT paid_amount, payment_status INTO v_paid, v_pstat FROM public.pitch_bookings WHERE id=v_booking;
  SELECT count(*) INTO v_cnt FROM public.booking_payments WHERE booking_id=v_booking;
  INSERT INTO _r VALUES ('PAY_deposit_recorded', v_paid=300 AND v_pstat='PARTIAL' AND v_cnt=1, 'paid='||v_paid||' st='||v_pstat||' n='||v_cnt);

  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM set_config('request.jwt.claims', json_build_object('sub',ply,'role','authenticated')::text, true);
    PERFORM public.record_app_deposit_payment(v_booking, 5000);
    INSERT INTO _r VALUES ('PAY_overpay_blocked', false, 'izin verdi!');
  EXCEPTION WHEN others THEN
    INSERT INTO _r VALUES ('PAY_overpay_blocked', position('AMOUNT_EXCEEDS_PRICE' in SQLERRM)>0, 'ok');
  END;
  EXECUTE 'RESET ROLE';

  -- ── Bildirimler ──
  PERFORM set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  UPDATE public.pitches SET verification_status='approved' WHERE id=pt;
  SELECT count(*) INTO v_cnt FROM public.notifications WHERE user_id=own AND type_key='pitch_verification_result';
  INSERT INTO _r VALUES ('NOTIF_verification', v_cnt=1, 'n='||v_cnt);

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',own,'role','authenticated')::text, true);
  UPDATE public.courts SET lighting_grade='A', grass_grade='B' WHERE id=ct;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  UPDATE public.courts SET grades_status='approved' WHERE id=ct;
  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO v_cnt FROM public.notifications WHERE user_id=own AND type_key='pitch_grades_approved';
  INSERT INTO _r VALUES ('NOTIF_grades', v_cnt=1, 'n='||v_cnt);

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',own,'role','authenticated')::text, true);
  INSERT INTO public.pitch_change_requests(id, pitch_id, requested_by, changes)
    VALUES ('52000000-0000-0000-0000-0000000000d1', pt, own, '{"name":"Yarış Arena 2"}'::jsonb);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  PERFORM public.review_pitch_change_request('52000000-0000-0000-0000-0000000000d1', true, NULL);
  EXECUTE 'RESET ROLE';
  SELECT count(*) INTO v_cnt FROM public.notifications WHERE user_id=own AND type_key='pitch_change_request_result';
  SELECT name INTO v_txt FROM public.pitches WHERE id=pt;
  INSERT INTO _r VALUES ('NOTIF_change_request', v_cnt=1 AND v_txt='Yarış Arena 2', 'n='||v_cnt||' name='||v_txt);
END $$;

SELECT test, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, got FROM _r ORDER BY test;
ROLLBACK;
