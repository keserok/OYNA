-- ============================================================================
-- FAZ 7 — İade düzeltmeleri (adversarial denetim bulguları) uçtan uca testi
-- BULGU 4 (KRİTİK): owner kazanç tersine-çevirme — per-intent (capture_preauth)
--   kaydı iptal; aggrege (process_match_at_deadline) yolda telafi negatif → çift ödeme yok.
-- BULGU 1 (ORTA): PSP kesintisi iade edilen GROSS tutara orantılı (kısmi iadede çift ceza yok).
-- İzole: BEGIN/ROLLBACK.
-- ============================================================================
BEGIN;
CREATE TEMP TABLE _r(test text, ok boolean, got text) ON COMMIT DROP;
DO $$
DECLARE
  o uuid:='ab000000-0000-0000-0000-0000000000a1'; u uuid:='ab000000-0000-0000-0000-0000000000a2';
  p uuid:='ab000000-0000-0000-0000-0000000000c1';
  m1 uuid:='ab000000-0000-0000-0000-0000000000d1'; m2 uuid:='ab000000-0000-0000-0000-0000000000d2';
  i1 uuid:='ab000000-0000-0000-0000-0000000000e1'; i2 uuid:='ab000000-0000-0000-0000-0000000000e2'; i3 uuid:='ab000000-0000-0000-0000-0000000000e3';
  j jsonb; v_status text; v_net numeric;
BEGIN
  INSERT INTO auth.users(id) VALUES (o),(u);
  INSERT INTO public.pitches(id,name,address,owner_id) VALUES (p,'S','Ordu',o);
  INSERT INTO public.matches(id,title,status,visibility,pitch_id,starts_at,date) VALUES
    (m1,'M1','ACTIVE','OPEN',p,now()+interval '3 hours','2026-07-01'),
    (m2,'M2','ACTIVE','OPEN',p,now()+interval '3 hours','2026-07-01');

  -- ── BULGU 4 / per-intent yol: +kazanç iptal edilir ──
  INSERT INTO public.payment_intents(id,user_id,pitch_id,match_id,amount,owner_amount,currency,status)
    VALUES (i1,u,p,m1,100,80,'TRY','CAPTURED');
  INSERT INTO public.wallet_transactions(user_id,amount,type,balance_type,status,reference_type,reference_id,description)
    VALUES (o,80,'MATCH_EARNING','EARNINGS','PENDING','PAYMENT_INTENT',i1,'per-intent kazanc');
  j := public.process_tiered_refund(i1,10,'MATCH');
  SELECT status INTO v_status FROM public.wallet_transactions WHERE reference_type='PAYMENT_INTENT' AND reference_id=i1 AND type='MATCH_EARNING';
  INSERT INTO _r VALUES ('FAZ7RC_perintent_earning_cancelled', v_status='CANCELLED', 'status='||v_status);

  -- ── BULGU 4 / aggrege yol: telafi negatif kazanç → net 0 ──
  INSERT INTO public.payment_intents(id,user_id,pitch_id,match_id,amount,owner_amount,currency,status)
    VALUES (i2,u,p,m2,100,80,'TRY','CAPTURED');
  INSERT INTO public.wallet_transactions(user_id,amount,type,balance_type,status,reference_type,reference_id,description)
    VALUES (o,80,'MATCH_EARNING','EARNINGS','PENDING','MATCH',m2,'aggrege kazanc');
  j := public.process_tiered_refund(i2,10,'MATCH');
  SELECT COALESCE(SUM(amount),0) INTO v_net FROM public.wallet_transactions
   WHERE user_id=o AND type='MATCH_EARNING' AND status='PENDING' AND reference_id IN (m2,i2);
  INSERT INTO _r VALUES ('FAZ7RC_aggregate_owner_net_zero', v_net=0, 'net='||v_net);

  -- ── BULGU 1: PSP kısmi iadede orantılı (50% → gross 50, psp 5, net 45) ──
  UPDATE public.settings SET refund_psp_fee_pct=10;
  INSERT INTO public.payment_intents(id,user_id,amount,currency,status) VALUES (i3,u,100,'TRY','CAPTURED');
  j := public.process_tiered_refund(i3,10,'BOOKING');
  INSERT INTO _r VALUES ('FAZ7RC_psp_proportional_partial',
    (j->>'gross')::numeric=50 AND (j->>'psp_fee')::numeric=5 AND (j->>'refund')::numeric=45,
    'gross='||(j->>'gross')||' psp='||(j->>'psp_fee')||' net='||(j->>'refund'));
END $$;
SELECT test, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, got FROM _r ORDER BY test;
ROLLBACK;
