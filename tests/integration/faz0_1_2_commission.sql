-- ============================================================================
-- FAZ 0 (rol temizliği) + FAZ 1 (Ordu seed) + FAZ 2 (komisyon motoru)
-- İzole: BEGIN/ROLLBACK — canlı veride kalıntı bırakmaz.
-- ============================================================================
BEGIN;
CREATE TEMP TABLE _r(test text, ok boolean, got text) ON COMMIT DROP;
DO $$
DECLARE
  v_uid uuid := '11111111-1111-1111-1111-111111111111';
  v_scope_id uuid := '33333333-3333-3333-3333-333333333333';
  v_role text; j jsonb; n int;
BEGIN
  -- auth.users insert → profil trigger'ı otomatik profil yaratır
  INSERT INTO auth.users(id) VALUES (v_uid);
  SELECT count(*) INTO n FROM public.profiles WHERE id=v_uid;
  INSERT INTO _r VALUES ('FAZ0_trigger_autocreates_profile', n=1, 'profil='||n);

  -- FAZ 0: CAPTAIN / COMMUNITY_ADMIN rol CHECK ile reddedilmeli
  BEGIN
    UPDATE public.profiles SET role='CAPTAIN' WHERE id=v_uid;
    INSERT INTO _r VALUES ('FAZ0_role_rejects_CAPTAIN', false, 'HATA: kabul');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO _r VALUES ('FAZ0_role_rejects_CAPTAIN', true, 'CHECK reddetti');
  END;
  BEGIN
    UPDATE public.profiles SET role='COMMUNITY_ADMIN' WHERE id=v_uid;
    INSERT INTO _r VALUES ('FAZ0_role_rejects_COMMUNITY_ADMIN', false, 'HATA: kabul');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO _r VALUES ('FAZ0_role_rejects_COMMUNITY_ADMIN', true, 'CHECK reddetti');
  END;
  UPDATE public.profiles SET role='PLAYER' WHERE id=v_uid;
  SELECT role INTO v_role FROM public.profiles WHERE id=v_uid;
  INSERT INTO _r VALUES ('FAZ0_role_accepts_PLAYER', v_role='PLAYER', 'role='||v_role);
  UPDATE public.profiles SET role='OWNER' WHERE id=v_uid;
  SELECT role INTO v_role FROM public.profiles WHERE id=v_uid;
  INSERT INTO _r VALUES ('FAZ0_role_accepts_OWNER', v_role='OWNER', 'role='||v_role);

  -- FAZ 1: Ordu lansman tesisleri + tarife + kort
  SELECT count(*) INTO n FROM public.pitches
   WHERE city='Ordu' AND name IN ('Capo Arena','Olimpiyat','VIP Arena','Ahmet Kuru Tesisleri');
  INSERT INTO _r VALUES ('FAZ1_ordu_4_pitches', n=4, 'bulunan='||n);
  SELECT count(*) INTO n FROM public.pitches p
   WHERE p.city='Ordu' AND NOT EXISTS (SELECT 1 FROM public.pitch_tariffs t WHERE t.pitch_id=p.id);
  INSERT INTO _r VALUES ('FAZ1_ordu_all_have_tariff', n=0, 'tarifesiz='||n);
  SELECT count(*) INTO n FROM public.pitches p
   WHERE p.city='Ordu' AND NOT EXISTS (SELECT 1 FROM public.courts c WHERE c.pitch_id=p.id);
  INSERT INTO _r VALUES ('FAZ1_ordu_all_have_court', n=0, 'kortsuz='||n);

  -- FAZ 2: komisyon motoru
  j := public.calculate_commission(1000, 'GLOBAL', NULL);
  INSERT INTO _r VALUES ('FAZ2_comm_global_15pct',
    (j->>'commission_amt')::numeric=150 AND (j->>'net_amount')::numeric=850, 'komisyon='||(j->>'commission_amt'));
  j := public.calculate_commission(1000, 'SERVICE_GK', NULL);
  INSERT INTO _r VALUES ('FAZ2_comm_gk_10pct', (j->>'commission_amt')::numeric=100, 'komisyon='||(j->>'commission_amt'));
  j := public.calculate_commission(1000, 'SERVICE_REF', NULL);
  INSERT INTO _r VALUES ('FAZ2_comm_ref_10pct', (j->>'commission_amt')::numeric=100, 'komisyon='||(j->>'commission_amt'));
  -- scope precedence: scope_id verilse de NULL-scope GK default'u (10%) uygulanır
  j := public.calculate_commission(1000, 'SERVICE_GK', gen_random_uuid());
  INSERT INTO _r VALUES ('FAZ2_comm_scope_precedence_gk', (j->>'commission_amt')::numeric=100, 'komisyon='||(j->>'commission_amt'));
  -- scope_id'ye özel satır NULL-scope default'u ezer
  INSERT INTO public.commission_config(scope, scope_id, model, rate_pct, is_active)
  VALUES ('SERVICE_GK', v_scope_id, 'MODEL_A', 5.0, true);
  j := public.calculate_commission(1000, 'SERVICE_GK', v_scope_id);
  INSERT INTO _r VALUES ('FAZ2_comm_scope_specific_override', (j->>'commission_amt')::numeric=50, 'komisyon='||(j->>'commission_amt'));
  -- Model B markup (rate 5 + markup 10 => 1000 üzerinde 50+100=150)
  INSERT INTO public.commission_config(scope, scope_id, model, rate_pct, markup_pct, is_active)
  VALUES ('PITCH', v_scope_id, 'MODEL_B', 5.0, 10.0, true);
  j := public.calculate_commission(1000, 'PITCH', v_scope_id);
  INSERT INTO _r VALUES ('FAZ2_comm_modelB_markup',
    (j->>'commission_amt')::numeric=150 AND (j->>'markup_amt')::numeric=100, 'komisyon='||(j->>'commission_amt')||' markup='||(j->>'markup_amt'));
END $$;
SELECT test, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, got FROM _r ORDER BY test;
ROLLBACK;
