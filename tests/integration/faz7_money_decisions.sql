-- ============================================================================
-- FAZ 7 — Para kararları (USER) uçtan uca testi
-- (1) Rezervasyon iptali kademeli (≥24s %100 · 6–24s %50 · <6s yok)
-- (2) İade karta; ödeme altyapısı (PSP) kesintisi iade tutarından düşülür
-- (3) Zamanında iptalde komisyon DAHİL tam iade
-- (4) Model B: markup oyuncuya eklenir → owner taban %95, OYNA %5+markup, owner-organize trigger
-- İzole: BEGIN/ROLLBACK. auth.uid() set_config ile taklit edilir.
-- ============================================================================
BEGIN;
CREATE TEMP TABLE _r(test text, ok boolean, got text) ON COMMIT DROP;
DO $$
DECLARE
  o uuid:='aa000000-0000-0000-0000-0000000000a1'; u uuid:='aa000000-0000-0000-0000-0000000000a2';
  p uuid:='aa000000-0000-0000-0000-0000000000c1'; c uuid:='aa000000-0000-0000-0000-0000000000c2';
  mo uuid:='aa000000-0000-0000-0000-0000000000d1'; mn uuid:='aa000000-0000-0000-0000-0000000000d2';
  bk uuid:='aa000000-0000-0000-0000-0000000000b1';
  i_b1 uuid:='aa000000-0000-0000-0000-0000000000e1'; i_b2 uuid:='aa000000-0000-0000-0000-0000000000e2'; i_b3 uuid:='aa000000-0000-0000-0000-0000000000e3';
  i_psp uuid:='aa000000-0000-0000-0000-0000000000e4';
  j jsonb; v_cm text;
BEGIN
  INSERT INTO auth.users(id) VALUES (o),(u);
  INSERT INTO public.pitches(id,name,address,owner_id) VALUES (p,'S','Ordu',o);
  INSERT INTO public.courts(id,pitch_id,name) VALUES (c,p,'K');

  -- ── (4) Model B net ──
  j := public.calculate_commission(1000,'GLOBAL',NULL,'MODEL_B');
  INSERT INTO _r VALUES ('FAZ7M_modelB_owner95', (j->>'owner_net')::numeric=950 AND (j->>'oyna_take')::numeric=250 AND (j->>'player_total')::numeric=1200, j::text);
  j := public.calculate_commission(1000,'GLOBAL',NULL,'MODEL_A');
  INSERT INTO _r VALUES ('FAZ7M_modelA_owner85', (j->>'owner_net')::numeric=850 AND (j->>'player_total')::numeric=1000, j::text);

  -- ── (4) Owner-organize tetikleyici ──
  INSERT INTO public.matches(id,title,status,visibility,pitch_id,"creatorId",starts_at,date) VALUES (mo,'M','ACTIVE','OPEN',p,o,now()+interval '3 hours','2026-07-01');
  SELECT commission_model INTO v_cm FROM public.matches WHERE id=mo;
  INSERT INTO _r VALUES ('FAZ7M_owner_match_modelB', v_cm='MODEL_B', 'cm='||v_cm);
  INSERT INTO public.matches(id,title,status,visibility,pitch_id,"creatorId",starts_at,date) VALUES (mn,'M','ACTIVE','OPEN',p,u,now()+interval '3 hours','2026-07-01');
  SELECT commission_model INTO v_cm FROM public.matches WHERE id=mn;
  INSERT INTO _r VALUES ('FAZ7M_player_match_modelA', v_cm='MODEL_A', 'cm='||v_cm);

  -- ── (1) BOOKING kademeleri ──
  INSERT INTO public.payment_intents(id,user_id,amount,currency,status) VALUES (i_b1,u,100,'TRY','CAPTURED'),(i_b2,u,100,'TRY','CAPTURED'),(i_b3,u,100,'TRY','CAPTURED');
  j := public.process_tiered_refund(i_b1,30,'BOOKING'); INSERT INTO _r VALUES ('FAZ7M_book_24h_full', j->>'tier'='FULL_REFUND' AND (j->>'refund')::numeric=100, j::text);
  j := public.process_tiered_refund(i_b2,10,'BOOKING'); INSERT INTO _r VALUES ('FAZ7M_book_6_24h_50', j->>'tier'='PARTIAL_REFUND' AND (j->>'refund')::numeric=50, j::text);
  j := public.process_tiered_refund(i_b3,2,'BOOKING');  INSERT INTO _r VALUES ('FAZ7M_book_under6h_none', j->>'tier'='NO_REFUND' AND (j->>'refund')::numeric=0, j::text);

  -- ── (1) cancel_app_booking kademeli (≥24s → %100, PSP 0) ──
  INSERT INTO public.pitch_bookings(id,pitch_id,court_id,user_id,booking_date,start_time,end_time,source,status,price,deposit_amount,paid_amount,payment_status)
    VALUES (bk,p,c,u,(current_date+2),'20:00','21:00','APP_BOOKING','CONFIRMED',200,100,100,'PAID');
  PERFORM set_config('request.jwt.claims', json_build_object('sub',u,'role','authenticated')::text, true);
  j := public.cancel_app_booking(bk,'test');
  INSERT INTO _r VALUES ('FAZ7M_cancel_booking_tiered', (j->>'refund_amount')::numeric=100 AND (j->>'refund_percent')::numeric=100, j::text);
  PERFORM set_config('request.jwt.claims','',true);

  -- ── (2)+(3) PSP kesintisi düşülür; FULL = komisyon dahil tam tutar − PSP ──
  UPDATE public.settings SET refund_psp_fee_pct=10;
  INSERT INTO public.payment_intents(id,user_id,amount,currency,status) VALUES (i_psp,u,100,'TRY','CAPTURED');
  j := public.process_tiered_refund(i_psp,30,'BOOKING');
  INSERT INTO _r VALUES ('FAZ7M_psp_fee_deducted', (j->>'gross')::numeric=100 AND (j->>'psp_fee')::numeric=10 AND (j->>'refund')::numeric=90, j::text);
END $$;
SELECT test, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, got FROM _r ORDER BY test;
ROLLBACK;
