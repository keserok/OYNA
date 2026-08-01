-- ============================================================================
-- FAZ 3 Para Akışı Düzeltmeleri (Round 3 & 4) — adversarial denetim bulguları
-- Kapsam:
--   SEC : wallet_balance doğrudan istemci UPDATE'i hâlâ bloklanır (güvenlik korunur)
--   GAP3: cancel_app_booking → %90 REFUND_CREDIT cüzdana GERÇEKTEN yazılır
--   GAP4: pay_public_match_deposit → çift ödeme ALREADY_PAID ile engellenir
--   GAP5: leave_public_match_slot → ödeyen oyuncu ayrılınca kapora iade edilir
--   F3  : player_update_match → OPEN→PRIVATE geçişinde private_code üretir
-- Round4 kritik: app.wallet_ctx GUC bayrağı olmadan tüm cüzdan ödemesi kırıktı.
-- İzole: BEGIN/ROLLBACK. auth.uid() set_config ile taklit edilir.
-- ============================================================================
BEGIN;
CREATE TEMP TABLE _r(test text, ok boolean, got text) ON COMMIT DROP;
DO $$
DECLARE
  o uuid := 'c0000000-0000-0000-0000-0000000000a1';
  u uuid := 'c0000000-0000-0000-0000-0000000000b1';
  pitch uuid := 'c0000000-0000-0000-0000-0000000000c1';
  court uuid := 'c0000000-0000-0000-0000-0000000000d1';
  bk uuid := 'c0000000-0000-0000-0000-0000000000e1';
  m1 uuid := 'c1000000-0000-0000-0000-000000000001';
  m2 uuid := 'c1000000-0000-0000-0000-000000000002';
  j jsonb; n numeric; v_code text; v_vis text; v_bal numeric;
BEGIN
  INSERT INTO auth.users(id) VALUES (o),(u);
  UPDATE public.profiles SET role='OWNER', name='Owner' WHERE id=o;
  PERFORM set_config('app.wallet_ctx','on',true);
  UPDATE public.profiles SET name='User', wallet_balance=300 WHERE id=u;
  PERFORM set_config('app.wallet_ctx','',true);
  INSERT INTO public.pitches(id,name,address,city,district,owner_id,is_active)
    VALUES (pitch,'R3 Saha','Altınordu','Ordu','Altınordu',o,true);
  INSERT INTO public.courts(id,pitch_id,name) VALUES (court,pitch,'Kort 1');

  PERFORM set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, true);

  -- GÜVENLİK: bayrak yokken doğrudan wallet_balance UPDATE bloklanmalı
  BEGIN
    UPDATE public.profiles SET wallet_balance = 99999 WHERE id=u;
    INSERT INTO _r VALUES ('SEC_direct_wallet_update_blocked', false, 'HATA: geçti');
  EXCEPTION WHEN others THEN
    INSERT INTO _r VALUES ('SEC_direct_wallet_update_blocked', position('wallet_balance' in SQLERRM)>0, 'bloklandı');
  END;

  -- GAP-3 (FAZ 7 kademeli iade: current_date+5 = ~120s ≥ 24s → %100, PSP varsayılan 0)
  INSERT INTO public.pitch_bookings(id,pitch_id,court_id,user_id,booking_date,start_time,end_time,source,status,price,deposit_amount,paid_amount,payment_status)
    VALUES (bk,pitch,court,u,(current_date+5),'20:00','21:00','APP_BOOKING','CONFIRMED',200,100,100,'PAID');
  j := public.cancel_app_booking(bk, 'test');
  INSERT INTO _r VALUES ('GAP3_cancel_returns_full', (j->>'refund_amount')::numeric=100, 'refund='||(j->>'refund_amount'));
  SELECT COALESCE(SUM(amount),0) INTO n FROM public.wallet_transactions
   WHERE user_id=u AND balance_type='REFUND_CREDIT' AND reference_id=bk;
  INSERT INTO _r VALUES ('GAP3_refund_credit_written_full', n=100, 'refund_credit='||n);

  -- GAP-4
  INSERT INTO public.matches(id,title,status,pitch_id,price,slots,"awaySlots","creatorId",captain_id,starts_at)
    VALUES (m1,'R3 Maç','ACTIVE',pitch,50,
      jsonb_build_array(jsonb_build_object('status','TAKEN','player',jsonb_build_object('id',u,'paymentStatus','UNPAID'))),
      '[]'::jsonb,u,u,now()+interval '10 hours');
  PERFORM public.pay_public_match_deposit(m1, u, 50);
  SELECT wallet_balance INTO v_bal FROM public.profiles WHERE id=u;
  INSERT INTO _r VALUES ('GAP4_first_pay_deducts_250', v_bal=250, 'wallet='||v_bal);
  BEGIN
    PERFORM public.pay_public_match_deposit(m1, u, 50);
    INSERT INTO _r VALUES ('GAP4_second_pay_blocked', false, 'HATA: ikinci geçti');
  EXCEPTION WHEN others THEN
    SELECT wallet_balance INTO v_bal FROM public.profiles WHERE id=u;
    INSERT INTO _r VALUES ('GAP4_second_pay_blocked', position('ALREADY_PAID' in SQLERRM)>0 AND v_bal=250, 'wallet='||v_bal);
  END;

  -- GAP-5
  PERFORM public.leave_public_match_slot(m1, u);
  SELECT wallet_balance INTO v_bal FROM public.profiles WHERE id=u;
  INSERT INTO _r VALUES ('GAP5_leave_refunds_to_300', v_bal=300, 'wallet='||v_bal);
  SELECT count(*) INTO n FROM public.wallet_transactions WHERE user_id=u AND match_id=m1 AND type='MATCH_REFUND';
  INSERT INTO _r VALUES ('GAP5_leave_refund_tx', n=1, 'refund_tx='||n);

  -- F3
  INSERT INTO public.matches(id,title,status,visibility,"creatorId",captain_id,slots,"awaySlots",starts_at)
    VALUES (m2,'F3 Maç','ACTIVE','OPEN',u,u,'[]'::jsonb,'[]'::jsonb,now()+interval '10 hours');
  PERFORM public.player_update_match(m2, '{"visibility":"PRIVATE"}'::jsonb);
  SELECT visibility, private_code INTO v_vis, v_code FROM public.matches WHERE id=m2;
  INSERT INTO _r VALUES ('F3_update_to_PRIVATE_gen_code', v_vis='PRIVATE' AND length(COALESCE(v_code,''))=6, 'vis='||v_vis||' code_len='||length(COALESCE(v_code,'')));
END $$;
SELECT test, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, got FROM _r ORDER BY test;
ROLLBACK;
