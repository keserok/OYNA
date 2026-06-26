-- ============================================================================
-- FAZ 2 — Ödeme motoru: blokaj→tahsil→owner kazanç, cüzdan özeti, payout
-- İzole: BEGIN/ROLLBACK. auth.uid() set_config ile taklit edilir.
-- ============================================================================
BEGIN;
CREATE TEMP TABLE _r(test text, ok boolean, got text) ON COMMIT DROP;
DO $$
DECLARE
  v_owner uuid := 'a0000000-0000-0000-0000-000000000001';
  v_player uuid := 'b0000000-0000-0000-0000-000000000002';
  v_poor uuid := 'c0000000-0000-0000-0000-000000000003';
  v_pitch uuid := 'd0000000-0000-0000-0000-000000000004';
  v_match uuid := 'e0000000-0000-0000-0000-000000000005';
  v_intent uuid; v_status text; j jsonb; n numeric; v_owner_amt numeric;
BEGIN
  INSERT INTO auth.users(id) VALUES (v_owner),(v_player),(v_poor);
  UPDATE public.profiles SET role='OWNER', name='Owner', wallet_balance=0 WHERE id=v_owner;
  UPDATE public.profiles SET role='PLAYER', name='Player', wallet_balance=0 WHERE id=v_player;
  UPDATE public.profiles SET role='OWNER', name='Poor', wallet_balance=0 WHERE id=v_poor;
  INSERT INTO public.pitches(id,name,address,city,district,owner_id,is_active)
    VALUES (v_pitch,'Test Saha','Altınordu','Ordu','Altınordu',v_owner,true);
  INSERT INTO public.matches(id,title,status,pitch_id,price,slots,"awaySlots","creatorId",captain_id,starts_at,visibility)
    VALUES (v_match,'Test Maç','ACTIVE',v_pitch,200,'[]'::jsonb,'[]'::jsonb,v_player,v_player,now()+interval '10 hours','OPEN');

  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_player,'role','authenticated')::text, true);

  SELECT id, status, owner_amount INTO v_intent, v_status, v_owner_amt FROM public.create_match_preauth(v_match, 200);
  INSERT INTO _r VALUES ('FAZ2_preauth_creates_PENDING', v_status='PENDING', 'status='||v_status);
  INSERT INTO _r VALUES ('FAZ2_preauth_commission_net170', v_owner_amt=170, 'owner_amount='||v_owner_amt);

  DECLARE v_intent2 uuid;
  BEGIN
    SELECT id INTO v_intent2 FROM public.create_match_preauth(v_match, 200);
    INSERT INTO _r VALUES ('FAZ2_preauth_idempotent', v_intent2=v_intent, 'ayni='||(v_intent2=v_intent)::text);
  END;

  BEGIN
    PERFORM public.create_match_preauth(v_match, 500);
    INSERT INTO _r VALUES ('FAZ2_preauth_rejects_over_price', false, 'HATA: kabul');
  EXCEPTION WHEN others THEN
    INSERT INTO _r VALUES ('FAZ2_preauth_rejects_over_price', position('AMOUNT_EXCEEDS' in SQLERRM)>0, SQLERRM);
  END;

  j := public.apply_preauth_block(v_intent, 'iyz_token_x', 'conv_x');
  INSERT INTO _r VALUES ('FAZ2_apply_block_BLOCKED', j->>'status'='BLOCKED', 'status='||(j->>'status'));

  j := public.capture_preauth(v_intent, 'prov_ref', NULL);
  INSERT INTO _r VALUES ('FAZ2_capture_CAPTURED', j->>'status'='CAPTURED', 'status='||(j->>'status'));
  SELECT COALESCE(SUM(amount),0) INTO n FROM public.wallet_transactions
   WHERE user_id=v_owner AND type='MATCH_EARNING' AND balance_type='EARNINGS' AND reference_id=v_intent;
  INSERT INTO _r VALUES ('FAZ2_capture_writes_owner_earning_170', n=170, 'owner_earning='||n);

  INSERT INTO public.wallet_transactions(user_id,amount,type,balance_type,status,description)
    VALUES (v_owner,500,'MATCH_EARNING','EARNINGS','COMPLETED','seed');
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_owner,'role','authenticated')::text, true);
  j := public.get_wallet_summary();
  INSERT INTO _r VALUES ('FAZ2_wallet_earnings_500_pending_excluded',
    (j->>'earnings_balance')::numeric=500, 'earnings='||(j->>'earnings_balance')||' reserved='||(j->>'reserved_balance'));

  PERFORM public.request_payout(300,'TR000000000000000000000000','Owner','MANUAL');
  j := public.get_wallet_summary();
  INSERT INTO _r VALUES ('FAZ2_payout_reserves_balance',
    (j->>'earnings_balance')::numeric=200 AND (j->>'reserved_balance')::numeric=300,
    'earnings='||(j->>'earnings_balance')||' reserved='||(j->>'reserved_balance'));

  BEGIN
    PERFORM public.request_payout(100,'TR000000000000000000000000','Owner','MANUAL');
    INSERT INTO _r VALUES ('FAZ2_payout_blocks_second_pending', false, 'HATA: kabul');
  EXCEPTION WHEN others THEN
    INSERT INTO _r VALUES ('FAZ2_payout_blocks_second_pending', position('PENDING_PAYOUT' in SQLERRM)>0, SQLERRM);
  END;

  INSERT INTO public.wallet_transactions(user_id,amount,type,balance_type,status,description)
    VALUES (v_poor,50,'MATCH_EARNING','EARNINGS','COMPLETED','seed');
  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_poor,'role','authenticated')::text, true);
  BEGIN
    PERFORM public.request_payout(100,'TR000000000000000000000000','Poor','MANUAL');
    INSERT INTO _r VALUES ('FAZ2_payout_insufficient_blocked', false, 'HATA: kabul');
  EXCEPTION WHEN others THEN
    INSERT INTO _r VALUES ('FAZ2_payout_insufficient_blocked', position('INSUFFICIENT' in SQLERRM)>0, SQLERRM);
  END;

  DECLARE v_match2 uuid := 'e0000000-0000-0000-0000-000000000099'; v_int2 uuid;
  BEGIN
    INSERT INTO public.matches(id,title,status,pitch_id,price,slots,"awaySlots","creatorId",captain_id,starts_at,visibility)
      VALUES (v_match2,'Test Maç 2','ACTIVE',v_pitch,200,'[]'::jsonb,'[]'::jsonb,v_player,v_player,now()+interval '10 hours','OPEN');
    PERFORM set_config('request.jwt.claims', json_build_object('sub',v_player,'role','authenticated')::text, true);
    SELECT id INTO v_int2 FROM public.create_match_preauth(v_match2, 200);
    PERFORM public.void_preauth(v_int2, 'USER_CANCELLED');
    SELECT status INTO v_status FROM public.payment_intents WHERE id=v_int2;
    INSERT INTO _r VALUES ('FAZ2_void_preauth_VOIDED', v_status='VOIDED', 'status='||v_status);
  END;
END $$;
SELECT test, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, got FROM _r ORDER BY test;
ROLLBACK;
