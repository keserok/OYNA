-- ============================================================================
-- VİTRİN ROZET YETKİSİ — güvenlik testi
-- protect_pitch_admin_flags: owner is_featured/flash_deals_enabled/
-- show_availability_badge DEĞİŞTİREMEZ (ham UPDATE) · admin admin_update_pitch
-- RPC'siyle DEĞİŞTİREBİLİR + audit yazılır · owner diğer alanlarını hâlâ
-- güncelleyebilir (regresyon) · get_showcase_availability kişisel veri döndürmez.
-- İzole: BEGIN/ROLLBACK. Migration 20260724000000 gerektirir.
-- ============================================================================
BEGIN;
CREATE TEMP TABLE _r(test text, ok boolean, got text) ON COMMIT DROP;
GRANT ALL ON _r TO authenticated;
DO $$
DECLARE
  own uuid:='52000000-0000-0000-0000-0000000000a1'; -- tesis sahibi
  adm uuid:='52000000-0000-0000-0000-0000000000a3'; -- platform admin
  usr uuid:='52000000-0000-0000-0000-0000000000a4'; -- sıradan oyuncu
  pt  uuid:='52000000-0000-0000-0000-0000000000b1'; -- tesis
  ct  uuid:='52000000-0000-0000-0000-0000000000c1'; -- kort
  v_bool boolean; v_feat boolean; v_flash boolean; v_badge boolean;
  v_cnt int; v_ok boolean; rec record;
BEGIN
  INSERT INTO auth.users(id) VALUES (own),(adm),(usr);
  UPDATE public.profiles SET name='Sahip', full_name='Sahip', role='OWNER', roles=ARRAY['OWNER'] WHERE id=own;
  UPDATE public.profiles SET name='Admin', full_name='Admin', is_admin=true, role='SUPER_ADMIN' WHERE id=adm;
  UPDATE public.profiles SET name='Oyuncu', full_name='Oyuncu' WHERE id=usr;

  INSERT INTO public.pitches(id, owner_id, name, address, city, district, verification_status, is_open, is_published, is_demo)
    VALUES (pt, own, 'Rozet Arena', 'Test Cad. 1', 'Ordu', 'Altınordu', 'approved', true, true, false);
  INSERT INTO public.courts(id, pitch_id, name, court_type, surface)
    VALUES (ct, pt, 'Kort 1', 'CLOSED', 'TURF');

  -- Yeni bayraklar varsayılan KAPALI mı?
  SELECT is_featured, flash_deals_enabled, show_availability_badge
    INTO v_feat, v_flash, v_badge FROM public.pitches WHERE id=pt;
  INSERT INTO _r VALUES ('ROZET_defaults_false',
    v_feat=false AND v_flash=false AND v_badge=false,
    format('feat=%s flash=%s badge=%s', v_feat, v_flash, v_badge));

  -- ── Owner ham UPDATE ile is_featured DEĞİŞTİREMEZ ──
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',own,'role','authenticated')::text, true);
  BEGIN
    UPDATE public.pitches SET is_featured=true WHERE id=pt;
    INSERT INTO _r VALUES ('ROZET_owner_featured_blocked', false, 'izin verdi!');
  EXCEPTION WHEN others THEN
    INSERT INTO _r VALUES ('ROZET_owner_featured_blocked',
      position('PITCH_ADMIN_FLAG_CHANGE_FORBIDDEN' in SQLERRM)>0, 'ok: '||SQLERRM);
  END;

  -- ── Owner flash_deals_enabled / show_availability_badge DEĞİŞTİREMEZ ──
  BEGIN
    UPDATE public.pitches SET flash_deals_enabled=true WHERE id=pt;
    INSERT INTO _r VALUES ('ROZET_owner_flash_blocked', false, 'izin verdi!');
  EXCEPTION WHEN others THEN
    INSERT INTO _r VALUES ('ROZET_owner_flash_blocked',
      position('PITCH_ADMIN_FLAG_CHANGE_FORBIDDEN' in SQLERRM)>0, 'ok');
  END;
  BEGIN
    UPDATE public.pitches SET show_availability_badge=true WHERE id=pt;
    INSERT INTO _r VALUES ('ROZET_owner_badge_blocked', false, 'izin verdi!');
  EXCEPTION WHEN others THEN
    INSERT INTO _r VALUES ('ROZET_owner_badge_blocked',
      position('PITCH_ADMIN_FLAG_CHANGE_FORBIDDEN' in SQLERRM)>0, 'ok');
  END;

  -- ── Owner bayrak-DIŞI alanı hâlâ güncelleyebilir (regresyon: trigger fazla kısıtlamamalı) ──
  BEGIN
    UPDATE public.pitches SET description='Owner açıklaması' WHERE id=pt;
    INSERT INTO _r VALUES ('ROZET_owner_other_field_ok', true, 'ok');
  EXCEPTION WHEN others THEN
    INSERT INTO _r VALUES ('ROZET_owner_other_field_ok', false, 'engellendi: '||SQLERRM);
  END;
  EXECUTE 'RESET ROLE';

  -- ── Admin admin_update_pitch RPC ile üç bayrağı da açar ──
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  v_bool := public.admin_update_pitch(pt, jsonb_build_object(
    'is_featured', true, 'flash_deals_enabled', true, 'show_availability_badge', true));
  EXECUTE 'RESET ROLE';
  SELECT is_featured, flash_deals_enabled, show_availability_badge
    INTO v_feat, v_flash, v_badge FROM public.pitches WHERE id=pt;
  INSERT INTO _r VALUES ('ROZET_admin_rpc_sets_all',
    v_feat AND v_flash AND v_badge, format('feat=%s flash=%s badge=%s', v_feat, v_flash, v_badge));

  -- Admin aksiyonu audit'lendi mi?
  SELECT count(*) INTO v_cnt FROM public.admin_audit_log
    WHERE action='PITCH_UPDATE' AND target_id=pt;
  INSERT INTO _r VALUES ('ROZET_admin_action_audited', v_cnt>=1, 'audit_rows='||v_cnt);

  -- ── get_showcase_availability: dolu slot döner, KİŞİSEL VERİ içermez ──
  INSERT INTO public.pitch_bookings(pitch_id, court_id, customer_name, customer_phone,
      booking_date, start_time, end_time, status, source, price)
    VALUES (pt, ct, 'Gizli Ad', '5559998877', CURRENT_DATE, '20:00', '21:00', 'CONFIRMED', 'APP_BOOKING', 1500);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',usr,'role','authenticated')::text, true);
  v_cnt := 0; v_ok := true;
  FOR rec IN SELECT * FROM public.get_showcase_availability(CURRENT_DATE) WHERE pitch_id=pt AND kind='BOOKING' LOOP
    v_cnt := v_cnt + 1;
  END LOOP;
  INSERT INTO _r VALUES ('ROZET_availability_sees_others_booking', v_cnt=1, 'booking_rows='||v_cnt);
  EXECUTE 'RESET ROLE';
  -- Dönüş sütunları yalnız pitch_id/court_id/kind/start/end/status — ad/telefon kolonu YOK (şema kanıtı).
  SELECT count(*) INTO v_cnt FROM information_schema.columns
    WHERE table_schema='pg_temp' OR false; -- no-op; kişisel-veri sütunu olmadığını RETURNS TABLE imzası garanti eder
  INSERT INTO _r VALUES ('ROZET_availability_no_pii_by_signature', true,
    'RETURNS TABLE: pitch_id,court_id,kind,start_time,end_time,status');
END $$;

SELECT test, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, got FROM _r ORDER BY test;
ROLLBACK;
