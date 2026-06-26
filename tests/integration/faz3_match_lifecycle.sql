-- ============================================================================
-- FAZ 3 — Maç yaşam döngüsü: quorum onay/iptal-iade, finalize başarı sinyali,
-- status whitelist, özel maç kod akışı, kademeli iade.
-- İzole: BEGIN/ROLLBACK. auth.uid() set_config ile taklit edilir.
-- ============================================================================
BEGIN;
CREATE TEMP TABLE _r(test text, ok boolean, got text) ON COMMIT DROP;
DO $$
DECLARE
  o uuid := 'a0000000-0000-0000-0000-0000000000a1';
  p1 uuid:='b0000000-0000-0000-0000-0000000000b1'; p2 uuid:='b0000000-0000-0000-0000-0000000000b2';
  p3 uuid:='b0000000-0000-0000-0000-0000000000b3'; p4 uuid:='b0000000-0000-0000-0000-0000000000b4';
  c1 uuid:='b0000000-0000-0000-0000-0000000000c1'; c2 uuid:='b0000000-0000-0000-0000-0000000000c2';
  f1 uuid:='b0000000-0000-0000-0000-0000000000f1'; f2 uuid:='b0000000-0000-0000-0000-0000000000f2';
  w  uuid:='b0000000-0000-0000-0000-0000000000d1';
  pitch uuid:='d0000000-0000-0000-0000-0000000000e1';
  m_conf uuid:='10000000-0000-0000-0000-000000000001';
  m_canc uuid:='10000000-0000-0000-0000-000000000002';
  m_fin  uuid:='10000000-0000-0000-0000-000000000003';
  m_white uuid:='10000000-0000-0000-0000-000000000004';
  m_lock uuid:='10000000-0000-0000-0000-000000000005';
  j jsonb; v_status text; n numeric; v_code text; v_mid uuid; v_cnt0 numeric; v_cnt1 numeric; v_cnt2 numeric; v_bool boolean;
BEGIN
  INSERT INTO auth.users(id) VALUES (o),(p1),(p2),(p3),(p4),(c1),(c2),(f1),(f2),(w);
  UPDATE public.profiles SET role='OWNER', name='Owner', wallet_balance=0 WHERE id=o;
  UPDATE public.profiles SET wallet_balance=0 WHERE id IN (p1,p2,p3,p4,c1,c2,f1,f2,w);
  INSERT INTO public.pitches(id,name,address,city,district,owner_id,is_active,verification_status)
    VALUES (pitch,'Lifecycle Saha','Altınordu','Ordu','Altınordu',o,true,'approved');

  -- match_fill_stats + quorum CONFIRM (4 slot PAID → onay + owner net 170)
  INSERT INTO public.matches(id,title,status,pitch_id,price,slots,"awaySlots","creatorId",captain_id,starts_at)
   VALUES (m_conf,'Confirm','ACTIVE',pitch,200,
     jsonb_build_array(
       jsonb_build_object('status','TAKEN','player',jsonb_build_object('id',p1,'paymentStatus','PAID')),
       jsonb_build_object('status','TAKEN','player',jsonb_build_object('id',p2,'paymentStatus','PAID')),
       jsonb_build_object('status','TAKEN','player',jsonb_build_object('id',p3,'paymentStatus','PAID')),
       jsonb_build_object('status','TAKEN','player',jsonb_build_object('id',p4,'paymentStatus','PAID'))
     ),'[]'::jsonb,o,o,now()+interval '5 hours');
  j := public.match_fill_stats(m_conf);
  INSERT INTO _r VALUES ('FAZ3_fill_stats_ratio_1_0',(j->>'paid_ratio')::numeric=1.0,'ratio='||(j->>'paid_ratio'));
  INSERT INTO public.wallet_transactions(user_id,match_id,amount,type,description)
   VALUES (p1,m_conf,50,'MATCH_FEE','x'),(p2,m_conf,50,'MATCH_FEE','x'),(p3,m_conf,50,'MATCH_FEE','x'),(p4,m_conf,50,'MATCH_FEE','x');
  j := public.process_match_at_deadline(m_conf);
  SELECT status, confirmed_at IS NOT NULL INTO v_status, v_bool FROM public.matches WHERE id=m_conf;
  INSERT INTO _r VALUES ('FAZ3_quorum_CONFIRMED', v_status='CONFIRMED' AND v_bool, 'status='||v_status);
  SELECT COALESCE(SUM(amount),0) INTO n FROM public.wallet_transactions
   WHERE user_id=o AND type='MATCH_EARNING' AND match_id=m_conf AND status='PENDING';
  INSERT INTO _r VALUES ('FAZ3_confirm_owner_earning_170', n=170, 'owner_earning='||n);

  -- quorum CANCEL + iade (1/4 PAID → iptal + wallet_balance iade + idempotent)
  INSERT INTO public.matches(id,title,status,pitch_id,price,slots,"awaySlots","creatorId",captain_id,starts_at)
   VALUES (m_canc,'Cancel','ACTIVE',pitch,200,
     jsonb_build_array(
       jsonb_build_object('status','TAKEN','player',jsonb_build_object('id',c1,'paymentStatus','PAID')),
       jsonb_build_object('status','TAKEN','player',jsonb_build_object('id',c2,'paymentStatus','PENDING')),
       jsonb_build_object('status','OPEN'), jsonb_build_object('status','OPEN')
     ),'[]'::jsonb,o,o,now()+interval '5 hours');
  INSERT INTO public.wallet_transactions(user_id,match_id,amount,type,description)
   VALUES (c1,m_canc,50,'MATCH_FEE','x'),(c2,m_canc,50,'MATCH_FEE','x');
  j := public.process_match_at_deadline(m_canc);
  SELECT status INTO v_status FROM public.matches WHERE id=m_canc;
  INSERT INTO _r VALUES ('FAZ3_quorum_CANCELLED', v_status='CANCELLED','status='||v_status);
  SELECT wallet_balance INTO n FROM public.profiles WHERE id=c1;
  INSERT INTO _r VALUES ('FAZ3_cancel_refunds_wallet_c1', n=50, 'c1_wallet='||n);
  SELECT count(*) INTO n FROM public.wallet_transactions WHERE match_id=m_canc AND type='MATCH_REFUND';
  INSERT INTO _r VALUES ('FAZ3_cancel_refund_tx_count_2', n=2, 'refund_tx='||n);
  j := public.process_match_at_deadline(m_canc);
  SELECT count(*) INTO n FROM public.wallet_transactions WHERE match_id=m_canc AND type='MATCH_REFUND';
  INSERT INTO _r VALUES ('FAZ3_cancel_refund_idempotent', n=2 AND (j->>'idempotent')='true', 'refund_tx='||n);

  -- finalize: confirmed maç → is_successful + ödül (idempotent)
  INSERT INTO public.matches(id,title,status,pitch_id,price,slots,"awaySlots","creatorId",captain_id,starts_at,confirmed_at)
   VALUES (m_fin,'Finalize','CONFIRMED',pitch,200,
     jsonb_build_array(
       jsonb_build_object('status','TAKEN','player',jsonb_build_object('id',f1,'paymentStatus','PAID')),
       jsonb_build_object('status','TAKEN','player',jsonb_build_object('id',f2,'paymentStatus','PAID'))
     ),'[]'::jsonb,o,o,now()-interval '4 hours', now()-interval '12 hours');
  SELECT COALESCE(match_count,0) INTO v_cnt0 FROM public.profiles WHERE id=f1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',o,'role','authenticated')::text, true);
  j := public.finalize_match(m_fin, 3, 2);
  SELECT is_successful INTO v_bool FROM public.matches WHERE id=m_fin;
  INSERT INTO _r VALUES ('FAZ3_finalize_is_successful', v_bool AND (j->>'is_successful')='true', 'is_successful='||v_bool);
  SELECT COALESCE(match_count,0) INTO v_cnt1 FROM public.profiles WHERE id=f1;
  INSERT INTO _r VALUES ('FAZ3_finalize_awards_once', v_cnt1=v_cnt0+1, 'before='||v_cnt0||' after='||v_cnt1);
  j := public.finalize_match(m_fin);
  SELECT COALESCE(match_count,0) INTO v_cnt2 FROM public.profiles WHERE id=f1;
  INSERT INTO _r VALUES ('FAZ3_finalize_idempotent_award', v_cnt2=v_cnt1, 'after2='||v_cnt2);

  -- status whitelist: ACTIVE→CONFIRMED yazılamaz; ACTIVE→CANCELLED izinli; CONFIRMED kilitli
  INSERT INTO public.matches(id,title,status,"creatorId",captain_id,slots,"awaySlots",starts_at)
   VALUES (m_white,'White','ACTIVE',w,w,'[]'::jsonb,'[]'::jsonb,now()+interval '5 hours');
  PERFORM set_config('request.jwt.claims', json_build_object('sub',w,'role','authenticated')::text, true);
  PERFORM public.player_update_match(m_white, '{"status":"CONFIRMED"}'::jsonb);
  SELECT status INTO v_status FROM public.matches WHERE id=m_white;
  INSERT INTO _r VALUES ('FAZ3_whitelist_blocks_CONFIRMED', v_status='ACTIVE', 'status='||v_status);
  PERFORM public.player_update_match(m_white, '{"status":"CANCELLED"}'::jsonb);
  SELECT status INTO v_status FROM public.matches WHERE id=m_white;
  INSERT INTO _r VALUES ('FAZ3_whitelist_allows_CANCELLED', v_status='CANCELLED', 'status='||v_status);
  INSERT INTO public.matches(id,title,status,"creatorId",captain_id,slots,"awaySlots",starts_at,confirmed_at)
   VALUES (m_lock,'Lock','CONFIRMED',w,w,'[]'::jsonb,'[]'::jsonb,now()+interval '5 hours',now());
  PERFORM public.player_update_match(m_lock, '{"status":"ACTIVE"}'::jsonb);
  SELECT status INTO v_status FROM public.matches WHERE id=m_lock;
  INSERT INTO _r VALUES ('FAZ3_whitelist_locks_system_state', v_status='CONFIRMED', 'status='||v_status);

  -- özel maç: PRIVATE kod üretir, resolve çözer; OPEN kod üretmez
  PERFORM set_config('request.jwt.claims', json_build_object('sub',p1,'role','authenticated')::text, true);
  v_mid := public.player_create_match('{"title":"Özel","visibility":"PRIVATE","date":"2026-07-01","time":"20:00"}'::jsonb);
  SELECT private_code INTO v_code FROM public.matches WHERE id=v_mid;
  INSERT INTO _r VALUES ('FAZ3_create_PRIVATE_gen_code', v_code IS NOT NULL AND length(v_code)=6, 'code_len='||length(COALESCE(v_code,'')));
  j := public.resolve_private_match(v_code);
  INSERT INTO _r VALUES ('FAZ3_resolve_private_match', (j->>'match_id')::uuid=v_mid, 'resolved_ok');
  BEGIN
    PERFORM public.resolve_private_match('ZZZZZZ');
    INSERT INTO _r VALUES ('FAZ3_resolve_wrong_code_404', false,'HATA: bulundu');
  EXCEPTION WHEN others THEN
    INSERT INTO _r VALUES ('FAZ3_resolve_wrong_code_404', position('NOT_FOUND' in SQLERRM)>0, 'NOT_FOUND ok');
  END;
  v_mid := public.player_create_match('{"title":"Açık","visibility":"OPEN","date":"2026-07-01","time":"20:00"}'::jsonb);
  SELECT private_code INTO v_code FROM public.matches WHERE id=v_mid;
  INSERT INTO _r VALUES ('FAZ3_create_OPEN_no_code', v_code IS NULL, 'code='||COALESCE(v_code,'NULL'));

  -- kademeli iade: CAPTURED intent → T-10h tam / T-5h kredi / T-1h iadesiz
  PERFORM set_config('request.jwt.claims', json_build_object('sub',p1,'role','authenticated')::text, true);
  INSERT INTO public.payment_intents(id,user_id,match_id,pitch_id,amount,currency,status,provider,captured_at,related_entity_type)
   VALUES ('20000000-0000-0000-0000-000000000001',p1,m_conf,pitch,100,'TRY','CAPTURED','IYZICO',now(),'MATCH'),
          ('20000000-0000-0000-0000-000000000002',p1,m_conf,pitch,100,'TRY','CAPTURED','IYZICO',now(),'MATCH'),
          ('20000000-0000-0000-0000-000000000003',p1,m_conf,pitch,100,'TRY','CAPTURED','IYZICO',now(),'MATCH');
  j := public.process_tiered_refund('20000000-0000-0000-0000-000000000001', 10);
  INSERT INTO _r VALUES ('FAZ3_refund_tier_FULL_8h', j->>'tier'='FULL_REFUND','tier='||(j->>'tier'));
  j := public.process_tiered_refund('20000000-0000-0000-0000-000000000002', 5);
  INSERT INTO _r VALUES ('FAZ3_refund_tier_CREDIT_3h', j->>'tier'='CREDIT','tier='||(j->>'tier'));
  j := public.process_tiered_refund('20000000-0000-0000-0000-000000000003', 1);
  INSERT INTO _r VALUES ('FAZ3_refund_tier_NONE_under3h', j->>'tier'='NO_REFUND' AND (j->>'refund')::numeric=0,'tier='||(j->>'tier'));
END $$;
SELECT test, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, got FROM _r ORDER BY test;
ROLLBACK;
