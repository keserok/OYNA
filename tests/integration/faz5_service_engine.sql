-- ============================================================================
-- FAZ 5 — Kaleci & Hakem hizmet motoru uçtan uca testi
-- talep → kabul → (çakışma) → maç onayında tahsil → 1-10 değerlendirme → anında
-- payout; TC kimlik kapısı, self-rating guard, maç iptalinde void/iade.
-- İzole: BEGIN/ROLLBACK. auth.uid() set_config ile taklit edilir.
-- ============================================================================
BEGIN;
CREATE TEMP TABLE _r(test text, ok boolean, got text) ON COMMIT DROP;
DO $$
DECLARE
  o   uuid := 'a5000000-0000-0000-0000-0000000000a1';  -- owner + kaptan/creator
  gk  uuid := 'a5000000-0000-0000-0000-0000000000c2';  -- kaleci sağlayıcı
  p1  uuid := 'a5000000-0000-0000-0000-0000000000f1';  -- katılımcı (rater)
  p2  uuid := 'a5000000-0000-0000-0000-0000000000f2';  -- katılımcı
  adm uuid := 'a5000000-0000-0000-0000-0000000000ad';  -- admin
  pitch uuid := 'a5000000-0000-0000-0000-0000000000e1';
  m1  uuid := 'a5100000-0000-0000-0000-000000000001';  -- ana yaşam döngüsü
  m2  uuid := 'a5100000-0000-0000-0000-000000000002';  -- iptal/iade
  m3  uuid := 'a5100000-0000-0000-0000-000000000003';  -- çakışma (m1 ile aynı saat)
  ts  timestamptz := now() + interval '5 hours';
  j jsonb; v_status text; n numeric; v_bool boolean; v_req uuid; v_req2 uuid; v_intent uuid; slots2 jsonb;
BEGIN
  INSERT INTO auth.users(id) VALUES (o),(gk),(p1),(p2),(adm);
  UPDATE public.profiles SET role='OWNER', name='Owner', wallet_balance=0 WHERE id=o;
  UPDATE public.profiles SET role='GOALKEEPER', roles='["GOALKEEPER"]'::jsonb,
         verification_status='approved', is_available=true, name='Kaleci', wallet_balance=0 WHERE id=gk;
  UPDATE public.profiles SET name='Oyuncu1', wallet_balance=0 WHERE id=p1;
  UPDATE public.profiles SET name='Oyuncu2', wallet_balance=0 WHERE id=p2;
  UPDATE public.profiles SET is_admin=true, role='SUPER_ADMIN', name='Admin' WHERE id=adm;
  INSERT INTO public.pitches(id,name,address,city,district,owner_id,is_active,verification_status)
    VALUES (pitch,'Servis Saha','Altınordu','Ordu','Altınordu',o,true,'approved');
  INSERT INTO public.goalkeepers(id,name,fee,rating,"matchCount","preferredZones","isDemo")
    VALUES (gk,'Kaleci',200,0,0,'[]'::jsonb,false);
  slots2 := jsonb_build_array(
    jsonb_build_object('status','TAKEN','player',jsonb_build_object('id',p1,'paymentStatus','PAID')),
    jsonb_build_object('status','TAKEN','player',jsonb_build_object('id',p2,'paymentStatus','PAID')));
  INSERT INTO public.matches(id,title,status,pitch_id,price,slots,"awaySlots","creatorId",captain_id,starts_at)
    VALUES (m1,'Servis Maçı','ACTIVE',pitch,200,slots2,'[]'::jsonb,o,o,ts);

  -- T1/T2: create_service_request (kaptan) → PENDING + GK_SERVICE intent + %10 komisyon
  PERFORM set_config('request.jwt.claims', json_build_object('sub',o,'role','authenticated')::text, true);
  j := public.create_service_request(m1, gk, 'GK');
  v_req := (j->>'request_id')::uuid; v_intent := (j->>'intent_id')::uuid;
  INSERT INTO _r VALUES ('FAZ5_commission_10pct',
    (j->>'commission')::numeric=20 AND (j->>'provider_amount')::numeric=180 AND (j->>'fee')::numeric=200,
    'comm='||(j->>'commission')||' net='||(j->>'provider_amount'));
  SELECT related_entity_type, service_provider_amount INTO v_status, n FROM public.payment_intents WHERE id=v_intent;
  INSERT INTO _r VALUES ('FAZ5_intent_GK_SERVICE', v_status='GK_SERVICE' AND n=180, 'type='||v_status||' net='||n);

  -- T3: respond accept (sağlayıcı) → ACCEPTED (maç henüz onaylı değil)
  PERFORM set_config('request.jwt.claims', json_build_object('sub',gk,'role','authenticated')::text, true);
  j := public.respond_service_request(v_req, true);
  INSERT INTO _r VALUES ('FAZ5_respond_ACCEPTED', j->>'status'='ACCEPTED', 'status='||(j->>'status'));

  -- T4: çakışma — m1 talebi AKTİF (ACCEPTED) iken aynı saatte ikinci talep engellenir
  INSERT INTO public.matches(id,title,status,pitch_id,price,slots,"awaySlots","creatorId",captain_id,starts_at)
    VALUES (m3,'Çakışma','ACTIVE',pitch,200,'[]'::jsonb,'[]'::jsonb,o,o,ts);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',o,'role','authenticated')::text, true);
  BEGIN
    PERFORM public.create_service_request(m3, gk, 'GK');
    INSERT INTO _r VALUES ('FAZ5_conflict_blocked', false, 'HATA: izin verdi');
  EXCEPTION WHEN others THEN
    INSERT INTO _r VALUES ('FAZ5_conflict_blocked', position('PROVIDER_CONFLICT' in SQLERRM)>0, 'blocked ok');
  END;

  -- T5/T6: maç onayı (process_match_at_deadline) → trigger ile hizmet CAPTURED + atama
  j := public.process_match_at_deadline(m1);
  SELECT status INTO v_status FROM public.service_requests WHERE id=v_req;
  INSERT INTO _r VALUES ('FAZ5_capture_on_confirm', v_status='CAPTURED', 'req_status='||v_status);
  SELECT gk_id::text INTO v_status FROM public.matches WHERE id=m1;
  INSERT INTO _r VALUES ('FAZ5_match_gk_assigned', v_status=gk::text, 'gk_id='||COALESCE(v_status,'NULL'));

  -- T7: sağlayıcı SERVICE_EARNING PENDING = 180 (değerlendirmeye dek beklemede)
  SELECT COALESCE(SUM(amount),0) INTO n FROM public.wallet_transactions
   WHERE user_id=gk AND type='SERVICE_EARNING' AND status='PENDING';
  INSERT INTO _r VALUES ('FAZ5_earning_pending_180', n=180, 'pending='||n);

  -- T8/T9/T10: katılımcı 1-10 puanlama → rating + COMPLETED + payout serbest
  PERFORM set_config('request.jwt.claims', json_build_object('sub',p1,'role','authenticated')::text, true);
  j := public.submit_service_rating(m1, gk, 'GK', 9, 'İyi kaleci');
  SELECT rating INTO n FROM public.goalkeepers WHERE id=gk;
  INSERT INTO _r VALUES ('FAZ5_rating_updates_provider', n=9, 'rating='||n);
  SELECT status, payout_released INTO v_status, v_bool FROM public.service_requests WHERE id=v_req;
  INSERT INTO _r VALUES ('FAZ5_request_COMPLETED', v_status='COMPLETED' AND v_bool, 'status='||v_status||' released='||v_bool);
  SELECT status INTO v_status FROM public.wallet_transactions
   WHERE user_id=gk AND type='SERVICE_EARNING' ORDER BY created_at DESC LIMIT 1;
  INSERT INTO _r VALUES ('FAZ5_earning_released', v_status='COMPLETED', 'earning_status='||v_status);

  -- T11: get_wallet_summary (sağlayıcı) earnings_balance = 180 (çekilebilir)
  PERFORM set_config('request.jwt.claims', json_build_object('sub',gk,'role','authenticated')::text, true);
  j := public.get_wallet_summary();
  INSERT INTO _r VALUES ('FAZ5_wallet_earnings_180', (j->>'earnings_balance')::numeric=180, 'earnings='||(j->>'earnings_balance'));

  -- T12: request_payout kimlik doğrulaması yokken IDENTITY_REQUIRED
  BEGIN
    PERFORM public.request_payout(180, 'TR000000000000000000000000', 'Kaleci');
    INSERT INTO _r VALUES ('FAZ5_payout_blocked_no_identity', false, 'HATA: izin verdi');
  EXCEPTION WHEN others THEN
    INSERT INTO _r VALUES ('FAZ5_payout_blocked_no_identity', position('IDENTITY_REQUIRED' in SQLERRM)>0, 'blocked ok');
  END;

  -- T13: kimlik gönder + admin onayla → payout başarılı
  PERFORM public.submit_provider_identity('12345678901', 'Kaleci Adam', 1990);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  PERFORM public.admin_verify_provider_identity(gk, true, NULL);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',gk,'role','authenticated')::text, true);
  PERFORM public.request_payout(180, 'TR000000000000000000000000', 'Kaleci Adam');
  SELECT count(*) INTO n FROM public.payout_requests WHERE user_id=gk AND status='PENDING';
  INSERT INTO _r VALUES ('FAZ5_payout_after_identity', n=1, 'payout_rows='||n);

  -- T14: self-rating guard (sağlayıcı kendini puanlayamaz)
  BEGIN
    PERFORM public.submit_service_rating(m1, gk, 'GK', 10, NULL);
    INSERT INTO _r VALUES ('FAZ5_self_rating_blocked', false, 'HATA: izin verdi');
  EXCEPTION WHEN others THEN
    INSERT INTO _r VALUES ('FAZ5_self_rating_blocked', position('CANNOT_RATE_SELF' in SQLERRM)>0, 'blocked ok');
  END;

  -- T15/T16/T17: maç iptalinde CAPTURED hizmet void/iade (trigger)
  INSERT INTO public.matches(id,title,status,pitch_id,price,slots,"awaySlots","creatorId",captain_id,starts_at)
    VALUES (m2,'İptal Maçı','ACTIVE',pitch,200,slots2,'[]'::jsonb,o,o, now() + interval '30 hours');
  PERFORM set_config('request.jwt.claims', json_build_object('sub',o,'role','authenticated')::text, true);
  j := public.create_service_request(m2, gk, 'GK'); v_req2 := (j->>'request_id')::uuid;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',gk,'role','authenticated')::text, true);
  PERFORM public.respond_service_request(v_req2, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',o,'role','authenticated')::text, true);
  PERFORM public.process_match_at_deadline(m2);  -- CONFIRMED → hizmet CAPTURED
  UPDATE public.matches SET status='CANCELLED' WHERE id=m2;  -- → _void_services_on_cancel trigger
  SELECT status INTO v_status FROM public.service_requests WHERE id=v_req2;
  INSERT INTO _r VALUES ('FAZ5_cancel_voids_request', v_status='CANCELLED', 'status='||v_status);
  SELECT status INTO v_status FROM public.payment_intents WHERE id=(SELECT payment_intent_id FROM public.service_requests WHERE id=v_req2);
  INSERT INTO _r VALUES ('FAZ5_cancel_refunds_intent', v_status='REFUNDED', 'intent='||v_status);
  SELECT gk_id::text INTO v_status FROM public.matches WHERE id=m2;
  INSERT INTO _r VALUES ('FAZ5_cancel_clears_gk', v_status IS NULL, 'gk_id='||COALESCE(v_status,'NULL'));
END $$;
SELECT test, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, got FROM _r ORDER BY test;
ROLLBACK;
