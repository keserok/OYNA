-- ============================================================================
-- FAZ 7 — Komisyon TEK-KAYNAK (SSOT) + Model B + admin-yönetimi uçtan uca testi
-- İzole: BEGIN/ROLLBACK. auth.uid() set_config ile taklit edilir.
--
-- > Bu testin doğruladığı KRİTİK düzeltme: create_payment_intent (doğrudan
-- > rezervasyon) komisyonu artık pitches.platform_commission_rate (default %10)
-- > yerine commission_config motorundan (GLOBAL %15) okur → §4.2 SSOT + %10
-- > eksik-tahsilat bug'ı giderildi. cpi_uses_engine_15_not_10 testi bunu kanıtlar.
-- ============================================================================
BEGIN;
CREATE TEMP TABLE _r(test text, ok boolean, got text) ON COMMIT DROP;
DO $$
DECLARE
  u uuid := 'a8000000-0000-0000-0000-0000000000a1';
  p uuid := 'a8000000-0000-0000-0000-0000000000c1';
  c uuid := 'a8000000-0000-0000-0000-0000000000c2';
  b uuid := 'a8000000-0000-0000-0000-0000000000b1';
  m uuid := 'a8000000-0000-0000-0000-0000000000d1';
  j jsonb; pi public.payment_intents;
BEGIN
  INSERT INTO auth.users(id) VALUES (u);
  INSERT INTO public.pitches(id,name,address,platform_commission_rate) VALUES (p,'TestSaha','Ordu',10.0);
  INSERT INTO public.courts(id,pitch_id,name) VALUES (c,p,'Kort1');

  -- ── Motor: Model A GLOBAL = %15 ──
  j := public.calculate_commission(1000,'GLOBAL',NULL,'MODEL_A');
  INSERT INTO _r VALUES ('FAZ7C_modelA_global_15', (j->>'commission_amt')::numeric=150 AND (j->>'commission_pct')::numeric=15, j->>'commission_amt');

  -- ── Motor: Model B GLOBAL = %5 + %20 markup ──
  j := public.calculate_commission(1000,'GLOBAL',NULL,'MODEL_B');
  INSERT INTO _r VALUES ('FAZ7C_modelB_global_5_20',
    (j->>'commission_pct')::numeric=5 AND (j->>'markup_pct')::numeric=20 AND (j->>'markup_amt')::numeric=200 AND (j->>'commission_amt')::numeric=250,
    j::text);

  -- ── Motor: per-saha override (admin PITCH kuralı) ──
  INSERT INTO public.commission_config(scope,scope_id,model,rate_pct,markup_pct,is_active,notes) VALUES ('PITCH',p,'MODEL_A',8.0,0,true,'saha ozel');
  j := public.calculate_commission(1000,'PITCH',p,'MODEL_A');
  INSERT INTO _r VALUES ('FAZ7C_pitch_override_8', (j->>'commission_amt')::numeric=80, j->>'commission_amt');

  -- ── Motor: override'sız saha → GLOBAL %15 ──
  j := public.calculate_commission(1000,'PITCH',gen_random_uuid(),'MODEL_A');
  INSERT INTO _r VALUES ('FAZ7C_pitch_fallback_global_15', (j->>'commission_amt')::numeric=150, j->>'commission_amt');

  -- ── SSOT KRİTİK: create_payment_intent kolonu değil motoru kullanır ──
  DELETE FROM public.commission_config WHERE scope='PITCH' AND scope_id=p;
  INSERT INTO public.pitch_bookings(id,pitch_id,court_id,user_id,booking_date,start_time,end_time,deposit_amount,status)
    VALUES (b,p,c,u,(now()+interval '1 day')::date,'20:00','21:00',1000,'PENDING');
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, true);
  pi := public.create_payment_intent(b,'SIMULATION');
  INSERT INTO _r VALUES ('FAZ7C_cpi_uses_engine_15_not_10', pi.commission_amount=150, 'comm='||pi.commission_amount);

  -- ── Model B maç: create_match_preauth maçın modelini kullanır ──
  PERFORM set_config('request.jwt.claims', '', true);
  INSERT INTO public.matches(id,title,status,visibility,pitch_id,price,commission_model,starts_at,date)
    VALUES (m,'ModelBMac','ACTIVE','OPEN',p,1000,'MODEL_B',now()+interval '3 hours','2026-07-01');
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, true);
  pi := public.create_match_preauth(m,1000,'SIMULATION');
  INSERT INTO _r VALUES ('FAZ7C_matchB_uses_modelB', pi.commission_model='MODEL_B' AND pi.commission_amount=250, 'model='||pi.commission_model||' comm='||pi.commission_amount);

  -- ── Bütünlük: aynı kapsam+model'de ikinci aktif kural engellenir ──
  BEGIN
    INSERT INTO public.commission_config(scope,scope_id,model,rate_pct,markup_pct,is_active) VALUES ('GLOBAL',NULL,'MODEL_A',99,0,true);
    INSERT INTO _r VALUES ('FAZ7C_dup_active_rule_blocked', false, 'izin verdi');
  EXCEPTION WHEN unique_violation THEN INSERT INTO _r VALUES ('FAZ7C_dup_active_rule_blocked', true, 'ok'); END;
END $$;
SELECT test, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, got FROM _r ORDER BY test;
ROLLBACK;
