-- ============================================================================
-- FAZ 7 — Kademeli iade motorunun gerçek çağırıcıya bağlanması (admin cockpit)
-- admin_refund_intent → process_tiered_refund (FULL/CREDIT/VOID) + audit.
-- İzole: BEGIN/ROLLBACK. auth.uid() set_config ile taklit edilir.
-- ============================================================================
BEGIN;
CREATE TEMP TABLE _r(test text, ok boolean, got text) ON COMMIT DROP;
DO $$
DECLARE
  a uuid := 'a9000000-0000-0000-0000-0000000000a1';
  u uuid := 'a9000000-0000-0000-0000-0000000000a2';
  p uuid := 'a9000000-0000-0000-0000-0000000000c1';
  m uuid := 'a9000000-0000-0000-0000-0000000000d1';
  i1 uuid := 'a9000000-0000-0000-0000-0000000000e1';
  i2 uuid := 'a9000000-0000-0000-0000-0000000000e2';
  j jsonb; v_credit numeric;
BEGIN
  INSERT INTO auth.users(id) VALUES (a),(u);
  UPDATE public.profiles SET is_admin=true WHERE id=a;
  INSERT INTO public.pitches(id,name,address) VALUES (p,'S','Ordu');
  INSERT INTO public.matches(id,title,status,visibility,pitch_id,starts_at,date)
    VALUES (m,'M','ACTIVE','OPEN',p,now()+interval '10 hours','2026-07-01');
  INSERT INTO public.payment_intents(id,user_id,match_id,amount,currency,status) VALUES
    (i1,u,m,100,'TRY','CAPTURED'),
    (i2,u,m,100,'TRY','PENDING');

  -- non-admin → FORBIDDEN
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, true);
  BEGIN PERFORM public.admin_refund_intent(i1);
    INSERT INTO _r VALUES ('FAZ7R_nonadmin_blocked', false, 'izin verdi');
  EXCEPTION WHEN others THEN INSERT INTO _r VALUES ('FAZ7R_nonadmin_blocked', position('FORBIDDEN' in SQLERRM)>0, 'ok'); END;

  -- admin: CAPTURED + 10s (>=8 free) → FULL_REFUND, 100 OYNA kredisi
  PERFORM set_config('request.jwt.claims', json_build_object('sub',a,'role','authenticated')::text, true);
  j := public.admin_refund_intent(i1, 'dispute');
  SELECT COALESCE(SUM(amount),0) INTO v_credit FROM public.wallet_transactions WHERE reference_id=i1 AND balance_type='REFUND_CREDIT';
  INSERT INTO _r VALUES ('FAZ7R_captured_full_refund', j->>'tier'='FULL_REFUND' AND v_credit=100, 'tier='||(j->>'tier')||' credit='||v_credit);

  -- admin: PENDING (pre-capture) → VOID
  j := public.admin_refund_intent(i2);
  INSERT INTO _r VALUES ('FAZ7R_pending_voided', j->>'tier'='VOID' AND (SELECT status FROM public.payment_intents WHERE id=i2)='VOIDED', 'tier='||(j->>'tier'));

  -- audit
  INSERT INTO _r VALUES ('FAZ7R_audited', EXISTS(SELECT 1 FROM public.admin_audit_log WHERE action='FORCE_REFUND' AND target_id=i1), 'audit');
END $$;
SELECT test, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, got FROM _r ORDER BY test;
ROLLBACK;
