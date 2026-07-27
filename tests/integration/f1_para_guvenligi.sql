-- ============================================================================
-- F1 — Para güvenliği paketi uçtan uca testi (20260816000001-8 migration'ları)
-- Kapsam: iki-taraflı payout kapısı + kaptan onayı serbest bırakma + matchCount,
-- admin zorla-serbest, 48s otomatik serbest bırakma koşulları, gün adı
-- normalizasyonu, süresi dolmuş talep/teklif kapıları + teklif süpürücüsü,
-- no-show karar RPC'si (iki dal), sağlayıcı iş bırakma (cezasız/cezalı/yasak),
-- player_kick_slot (yetki + idempotent iade).
-- İzole: BEGIN/ROLLBACK. auth.uid() set_config ile taklit edilir.
-- NOT: Talep fonlaması testte doğrudan intent UPDATE ile yapılır (ödeme
-- sağlayıcısı simülasyonu kapsam dışı).
-- ============================================================================
BEGIN;
CREATE TEMP TABLE _r(test text, ok boolean, got text) ON COMMIT DROP;
DO $$
DECLARE
  o    uuid := 'f1000000-0000-0000-0000-0000000000a1';
  gk   uuid := 'f1000000-0000-0000-0000-0000000000c2';
  p1   uuid := 'f1000000-0000-0000-0000-0000000000f1';
  p2   uuid := 'f1000000-0000-0000-0000-0000000000f2';
  adm  uuid := 'f1000000-0000-0000-0000-0000000000ad';
  pitch uuid := 'f1000000-0000-0000-0000-0000000000e1';
  m1  uuid := 'f1100000-0000-0000-0000-000000000001';
  m2  uuid := 'f1100000-0000-0000-0000-000000000002';
  m3  uuid := 'f1100000-0000-0000-0000-000000000003';
  m4  uuid := 'f1100000-0000-0000-0000-000000000004';
  m5  uuid := 'f1100000-0000-0000-0000-000000000005';
  m6  uuid := 'f1100000-0000-0000-0000-000000000006';
  m7  uuid := 'f1100000-0000-0000-0000-000000000007';
  m8  uuid := 'f1100000-0000-0000-0000-000000000008';
  m9  uuid := 'f1100000-0000-0000-0000-000000000009';
  m10 uuid := 'f1100000-0000-0000-0000-000000000010';
  m11 uuid := 'f1100000-0000-0000-0000-000000000011';
  ts   timestamptz := now() + interval '5 hours';
  slots2 jsonb; kickslots jsonb;
  j jsonb; v_status text; n numeric; v_bool boolean; v_bool2 boolean;
  v_req uuid; v_req2 uuid; v_req3 uuid; v_req4 uuid; v_req6 uuid; v_req7 uuid;
  v_req8 uuid; v_req9 uuid; v_req10 uuid;
  v_intent uuid; v_offer uuid; v_offer2 uuid; v_cnt int;
BEGIN
  -- ── Fixture ───────────────────────────────────────────────────────────────
  INSERT INTO auth.users(id) VALUES (o),(gk),(p1),(p2),(adm);
  UPDATE public.profiles SET role='OWNER', name='Kaptan', wallet_balance=0 WHERE id=o;
  UPDATE public.profiles SET role='GOALKEEPER', roles='["GOALKEEPER"]'::jsonb,
         verification_status='approved', is_available=true, name='Kaleci', wallet_balance=0 WHERE id=gk;
  UPDATE public.profiles SET name='Oyuncu1', wallet_balance=0 WHERE id=p1;
  UPDATE public.profiles SET name='Oyuncu2', wallet_balance=0 WHERE id=p2;
  UPDATE public.profiles SET is_admin=true, role='SUPER_ADMIN', name='Admin' WHERE id=adm;
  BEGIN
    INSERT INTO public.admin_team_members(user_id, role) VALUES (adm, 'SUPER_ADMIN')
    ON CONFLICT DO NOTHING;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  INSERT INTO public.pitches(id,name,address,city,district,owner_id,is_active,verification_status)
    VALUES (pitch,'F1 Saha','Altınordu','Ordu','Altınordu',o,true,'approved');
  INSERT INTO public.goalkeepers(id,name,fee,rating,"matchCount","preferredZones","isDemo")
    VALUES (gk,'Kaleci',200,0,0,'[]'::jsonb,false);
  slots2 := jsonb_build_array(
    jsonb_build_object('id','s1','status','TAKEN','player',jsonb_build_object('id',p1,'paymentStatus','PAID')),
    jsonb_build_object('id','s2','status','TAKEN','player',jsonb_build_object('id',p2,'paymentStatus','PAID')));
  -- GK teminat bakiyesi (gk_min_balance=500 kapısı + ceza tahsilatları için bol)
  INSERT INTO public.wallet_transactions(user_id, amount, type, balance_type, status, reference_type, description)
    VALUES (gk, 2000, 'TOP_UP', 'TOP_UP', 'COMPLETED', 'TOPUP', 'F1 test teminat');
  PERFORM public._sync_wallet_mirror(gk);

  INSERT INTO public.matches(id,title,status,pitch_id,price,slots,"awaySlots","creatorId",captain_id,starts_at) VALUES
    (m1,'F1 Kaptan Onayı','ACTIVE',pitch,200,slots2,'[]'::jsonb,o,o,ts),
    (m2,'F1 Admin Force','ACTIVE',pitch,200,slots2,'[]'::jsonb,o,o,ts + interval '3 hours'),
    (m3,'F1 Oto-Serbest','CONFIRMED',pitch,200,slots2,'[]'::jsonb,o,o, now() - interval '60 hours'),
    (m4,'F1 Oto-Negatif','CONFIRMED',pitch,200,slots2,'[]'::jsonb,o,o, now() - interval '60 hours'),
    (m5,'F1 Süre Dolmuş','ACTIVE',pitch,200,slots2,'[]'::jsonb,o,o, ts + interval '6 hours'),
    (m6,'F1 NoShow Haklı','CONFIRMED',pitch,200,slots2,'[]'::jsonb,o,o, ts + interval '9 hours'),
    (m7,'F1 NoShow Ceza','CONFIRMED',pitch,200,slots2,'[]'::jsonb,o,o, ts + interval '12 hours'),
    (m8,'F1 Bırak Cezasız','CONFIRMED',pitch,200,slots2,'[]'::jsonb,o,o, now() + interval '48 hours'),
    (m9,'F1 Bırak Cezalı','CONFIRMED',pitch,200,slots2,'[]'::jsonb,o,o, now() + interval '2 hours'),
    (m10,'F1 Bırak Yasak','CONFIRMED',pitch,200,slots2,'[]'::jsonb,o,o, now() - interval '1 hour');

  -- ══ A) Kaptan-başlatan akış: iki-taraflı kapı + kaptan onayı + matchCount ══
  PERFORM set_config('request.jwt.claims', json_build_object('sub',o,'role','authenticated')::text, true);
  j := public.create_service_request(m1, gk, 'GK');
  v_req := (j->>'request_id')::uuid; v_intent := (j->>'intent_id')::uuid;
  SELECT initiated_by INTO v_status FROM public.service_requests WHERE id=v_req;
  INSERT INTO _r VALUES ('F1_A0_initiated_by_captain', v_status='CAPTAIN', 'initiated_by='||v_status);
  UPDATE public.payment_intents SET status='BLOCKED', blocked_at=now() WHERE id=v_intent;

  PERFORM set_config('request.jwt.claims', json_build_object('sub',gk,'role','authenticated')::text, true);
  j := public.respond_service_request(v_req, true, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',o,'role','authenticated')::text, true);
  PERFORM public.process_match_at_deadline(m1);
  SELECT status INTO v_status FROM public.service_requests WHERE id=v_req;
  INSERT INTO _r VALUES ('F1_A1_captured', v_status='CAPTURED', 'status='||v_status);

  PERFORM set_config('request.jwt.claims', json_build_object('sub',gk,'role','authenticated')::text, true);
  PERFORM public.provider_confirm_service(v_req);
  SELECT payout_released INTO v_bool FROM public.service_requests WHERE id=v_req;
  INSERT INTO _r VALUES ('F1_A2_two_sided_gate_holds', v_bool=false, 'released='||v_bool);

  PERFORM set_config('request.jwt.claims', json_build_object('sub',o,'role','authenticated')::text, true);
  PERFORM public.captain_confirm_service(v_req);
  SELECT payout_released, status INTO v_bool, v_status FROM public.service_requests WHERE id=v_req;
  INSERT INTO _r VALUES ('F1_A3_captain_confirm_releases', v_bool AND v_status='COMPLETED', 'released='||v_bool||' status='||v_status);
  SELECT status INTO v_status FROM public.wallet_transactions
    WHERE reference_id=v_intent AND balance_type='EARNINGS' ORDER BY created_at DESC LIMIT 1;
  INSERT INTO _r VALUES ('F1_A4_earning_completed', v_status='COMPLETED', 'earning='||v_status);
  SELECT "matchCount" INTO v_cnt FROM public.goalkeepers WHERE id=gk;
  INSERT INTO _r VALUES ('F1_A5_matchcount_1', v_cnt=1, 'matchCount='||v_cnt);
  PERFORM public._release_service_payout(m1, gk);
  SELECT "matchCount" INTO v_cnt FROM public.goalkeepers WHERE id=gk;
  INSERT INTO _r VALUES ('F1_A6_release_idempotent', v_cnt=1, 'matchCount='||v_cnt);

  -- ══ B) Admin zorla-serbest (hiç onay yokken) ══
  PERFORM set_config('request.jwt.claims', json_build_object('sub',o,'role','authenticated')::text, true);
  j := public.create_service_request(m2, gk, 'GK');
  v_req2 := (j->>'request_id')::uuid;
  UPDATE public.payment_intents SET status='BLOCKED', blocked_at=now() WHERE id=(j->>'intent_id')::uuid;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',gk,'role','authenticated')::text, true);
  PERFORM public.respond_service_request(v_req2, true, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',o,'role','authenticated')::text, true);
  PERFORM public.process_match_at_deadline(m2);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  j := public.admin_release_service_payout__core(v_req2);
  SELECT payout_released INTO v_bool FROM public.service_requests WHERE id=v_req2;
  INSERT INTO _r VALUES ('F1_B1_admin_force_release',
    v_bool AND (j->>'forced_provider_confirm')::boolean AND (j->>'forced_captain_confirm')::boolean,
    'released='||v_bool||' forced='||(j->>'forced_provider_confirm')||'/'||(j->>'forced_captain_confirm'));
  SELECT "matchCount" INTO v_cnt FROM public.goalkeepers WHERE id=gk;
  INSERT INTO _r VALUES ('F1_B2_matchcount_2', v_cnt=2, 'matchCount='||v_cnt);

  -- ══ C) 48s otomatik serbest bırakma ══
  PERFORM set_config('request.jwt.claims', json_build_object('sub',o,'role','authenticated')::text, true);
  j := public.create_service_request(m3, gk, 'GK');
  v_req3 := (j->>'request_id')::uuid;
  UPDATE public.payment_intents SET status='BLOCKED', blocked_at=now() WHERE id=(j->>'intent_id')::uuid;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',gk,'role','authenticated')::text, true);
  PERFORM public.respond_service_request(v_req3, true, true);  -- maç CONFIRMED → anında CAPTURE
  PERFORM public.provider_confirm_service(v_req3);
  PERFORM public.auto_release_service_payouts();
  SELECT payout_released, captain_confirmed INTO v_bool, v_bool2 FROM public.service_requests WHERE id=v_req3;
  INSERT INTO _r VALUES ('F1_C1_auto_release_48h', v_bool AND v_bool2, 'released='||v_bool||' cap_confirmed='||v_bool2);

  PERFORM set_config('request.jwt.claims', json_build_object('sub',o,'role','authenticated')::text, true);
  j := public.create_service_request(m4, gk, 'GK');
  v_req4 := (j->>'request_id')::uuid;
  UPDATE public.payment_intents SET status='BLOCKED', blocked_at=now() WHERE id=(j->>'intent_id')::uuid;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',gk,'role','authenticated')::text, true);
  PERFORM public.respond_service_request(v_req4, true, true);
  -- provider_confirmed=false → oto-serbest DOKUNMAMALI
  PERFORM public.auto_release_service_payouts();
  SELECT payout_released INTO v_bool FROM public.service_requests WHERE id=v_req4;
  INSERT INTO _r VALUES ('F1_C2_auto_requires_provider_confirm', v_bool=false, 'released='||v_bool);
  -- provider onayladı ama Sorun Bildir açık → yine DOKUNMAMALI
  PERFORM public.provider_confirm_service(v_req4);
  UPDATE public.service_requests SET reported_at=now() WHERE id=v_req4;
  PERFORM public.auto_release_service_payouts();
  SELECT payout_released INTO v_bool FROM public.service_requests WHERE id=v_req4;
  INSERT INTO _r VALUES ('F1_C3_auto_skips_reported', v_bool=false, 'released='||v_bool);

  -- ══ D) Gün adı normalizasyonu (2026-07-27 = Pazartesi) ══
  INSERT INTO _r VALUES ('F1_D1_short_day_matches',
    public._provider_serves_schedule('{"activeDays":["Pzt"],"activeHours":"09:00 - 23:00"}'::jsonb,
                                     '2026-07-27 20:00:00+03'::timestamptz) = true, 'Pzt@Pazartesi');
  INSERT INTO _r VALUES ('F1_D2_short_day_filters',
    public._provider_serves_schedule('{"activeDays":["Pzt"]}'::jsonb,
                                     '2026-07-28 20:00:00+03'::timestamptz) = false, 'Pzt@Salı');
  INSERT INTO _r VALUES ('F1_D3_full_day_still_works',
    public._provider_serves_schedule('{"activeDays":["Pazartesi"]}'::jsonb,
                                     '2026-07-27 20:00:00+03'::timestamptz) = true, 'Pazartesi@Pazartesi');
  INSERT INTO _r VALUES ('F1_D4_unknown_token_defensive',
    public._provider_serves_schedule('{"activeDays":["Hafta içi"]}'::jsonb,
                                     '2026-07-26 20:00:00+03'::timestamptz) = true, 'HaftaIci@Pazar');

  -- ══ E) Süresi dolmuş talep/teklif kapıları + teklif süpürücüsü ══
  PERFORM set_config('request.jwt.claims', json_build_object('sub',o,'role','authenticated')::text, true);
  j := public.create_service_request(m5, gk, 'GK');
  UPDATE public.service_requests SET expires_at = now() - interval '1 hour' WHERE id=(j->>'request_id')::uuid;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',gk,'role','authenticated')::text, true);
  BEGIN
    PERFORM public.respond_service_request((j->>'request_id')::uuid, true, true);
    INSERT INTO _r VALUES ('F1_E1_expired_request_blocked', false, 'HATA: izin verdi');
  EXCEPTION WHEN others THEN
    INSERT INTO _r VALUES ('F1_E1_expired_request_blocked', position('REQUEST_EXPIRED' in SQLERRM)>0, left(SQLERRM,60));
  END;

  v_offer := gen_random_uuid();
  INSERT INTO public.match_service_offers(id, match_id, provider_id, provider_type, captain_id, fee, status, expires_at)
    VALUES (v_offer, m5, gk, 'GK', o, 200, 'PENDING', timezone('utc', now()) - interval '1 hour');
  BEGIN
    PERFORM public.respond_match_service_offer(v_offer, true);
    INSERT INTO _r VALUES ('F1_E2_expired_offer_blocked', false, 'HATA: izin verdi');
  EXCEPTION WHEN others THEN
    INSERT INTO _r VALUES ('F1_E2_expired_offer_blocked', position('OFFER_EXPIRED' in SQLERRM)>0, left(SQLERRM,60));
  END;
  SELECT status INTO v_status FROM public.match_service_offers WHERE id=v_offer;
  INSERT INTO _r VALUES ('F1_E3_expired_offer_marked', v_status='EXPIRED', 'offer='||v_status);

  v_offer2 := gen_random_uuid();
  INSERT INTO public.match_service_offers(id, match_id, provider_id, provider_type, captain_id, fee, status, expires_at)
    VALUES (v_offer2, m5, gk, 'GK', o, 200, 'PENDING', timezone('utc', now()) - interval '2 hours');
  PERFORM public.expire_service_requests();
  SELECT status INTO v_status FROM public.match_service_offers WHERE id=v_offer2;
  INSERT INTO _r VALUES ('F1_E4_sweeper_expires_offers', v_status='EXPIRED', 'offer='||v_status);

  -- ══ F) No-show karar RPC'si ══
  -- F-a: sağlayıcı haklı → ceza iadesi + kaptan tazminat/iade geri alımı + EARNINGS açılır
  PERFORM set_config('request.jwt.claims', json_build_object('sub',o,'role','authenticated')::text, true);
  j := public.create_service_request(m6, gk, 'GK');
  v_req6 := (j->>'request_id')::uuid;
  UPDATE public.payment_intents SET status='BLOCKED', blocked_at=now() WHERE id=(j->>'intent_id')::uuid;
  UPDATE public.service_requests SET funding_source='WALLET' WHERE id=v_req6;  -- kaptan iade yolunu da test et
  PERFORM set_config('request.jwt.claims', json_build_object('sub',gk,'role','authenticated')::text, true);
  PERFORM public.respond_service_request(v_req6, true, true);  -- m6 CONFIRMED → CAPTURE
  PERFORM set_config('request.jwt.claims', json_build_object('sub',o,'role','authenticated')::text, true);
  j := public.captain_report_no_show(v_req6, 'gelmedi');
  SELECT status, payout_released INTO v_status, v_bool FROM public.service_requests WHERE id=v_req6;
  INSERT INTO _r VALUES ('F1_F1_noshow_reported', v_status='NOSHOW_REPORTED' AND v_bool,
    'status='||v_status||' penalty_charged='||(j->>'penalty_charged'));
  PERFORM set_config('request.jwt.claims', json_build_object('sub',gk,'role','authenticated')::text, true);
  PERFORM public.provider_dispute_no_show(v_req6, 'oradaydım');
  PERFORM set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  j := public.admin_resolve_noshow_dispute(v_req6, false, 'kanıt fotoğrafı var');
  SELECT status INTO v_status FROM public.service_requests WHERE id=v_req6;
  INSERT INTO _r VALUES ('F1_F2_resolve_provider_right', v_status='COMPLETED' AND (j->>'uphold')='false', 'status='||v_status);
  SELECT count(*) INTO v_cnt FROM public.wallet_transactions
    WHERE user_id=gk AND reference_type='NOSHOW_REVERSAL' AND reference_id=v_req6;
  INSERT INTO _r VALUES ('F1_F3_penalty_reversed', v_cnt=1, 'reversal_rows='||v_cnt);
  SELECT count(*) INTO v_cnt FROM public.wallet_transactions
    WHERE user_id=o AND match_id=m6 AND type='MATCH_REFUND' AND status='CANCELLED';
  INSERT INTO _r VALUES ('F1_F4_captain_comp_clawed', v_cnt=1, 'clawed_rows='||v_cnt);
  -- EARNINGS satırı intent referanslıdır; intent üzerinden kontrol:
  SELECT wt.status INTO v_status FROM public.wallet_transactions wt
    JOIN public.service_requests sr ON sr.payment_intent_id = wt.reference_id
    WHERE sr.id=v_req6 AND wt.balance_type='EARNINGS' ORDER BY wt.created_at DESC LIMIT 1;
  INSERT INTO _r VALUES ('F1_F5_earnings_restored', v_status='COMPLETED', 'earning='||v_status);

  -- F-b: kaptan haklı → NOSHOW_FINALIZED
  PERFORM set_config('request.jwt.claims', json_build_object('sub',o,'role','authenticated')::text, true);
  j := public.create_service_request(m7, gk, 'GK');
  v_req7 := (j->>'request_id')::uuid;
  UPDATE public.payment_intents SET status='BLOCKED', blocked_at=now() WHERE id=(j->>'intent_id')::uuid;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',gk,'role','authenticated')::text, true);
  PERFORM public.respond_service_request(v_req7, true, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',o,'role','authenticated')::text, true);
  PERFORM public.captain_report_no_show(v_req7, NULL);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  PERFORM public.admin_resolve_noshow_dispute(v_req7, true, NULL);
  SELECT status INTO v_status FROM public.service_requests WHERE id=v_req7;
  INSERT INTO _r VALUES ('F1_F6_resolve_captain_right', v_status='NOSHOW_FINALIZED', 'status='||v_status);

  -- ══ G) Sağlayıcı iş bırakma ══
  -- G-a: >24s → cezasız
  PERFORM set_config('request.jwt.claims', json_build_object('sub',o,'role','authenticated')::text, true);
  j := public.create_service_request(m8, gk, 'GK');
  v_req8 := (j->>'request_id')::uuid;
  UPDATE public.payment_intents SET status='BLOCKED', blocked_at=now() WHERE id=(j->>'intent_id')::uuid;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',gk,'role','authenticated')::text, true);
  PERFORM public.respond_service_request(v_req8, true, true);
  j := public.preview_provider_cancel(v_req8);
  INSERT INTO _r VALUES ('F1_G1_preview_free', (j->>'allowed')::boolean AND (j->>'penalty')::numeric=0,
    'allowed='||(j->>'allowed')||' penalty='||(j->>'penalty'));
  j := public.provider_cancel_assignment(v_req8, 'mazeret');
  SELECT status, penalty_amount INTO v_status, n FROM public.service_requests WHERE id=v_req8;
  INSERT INTO _r VALUES ('F1_G2_cancel_free', v_status='CANCELLED' AND n=0, 'status='||v_status||' penalty='||n);
  SELECT gk_id::text INTO v_status FROM public.matches WHERE id=m8;
  INSERT INTO _r VALUES ('F1_G3_cancel_clears_gk', v_status IS NULL, 'gk_id='||COALESCE(v_status,'NULL'));

  -- G-b: <24s → %50 ceza + kaptan tazminatı
  PERFORM set_config('request.jwt.claims', json_build_object('sub',o,'role','authenticated')::text, true);
  j := public.create_service_request(m9, gk, 'GK');
  v_req9 := (j->>'request_id')::uuid;
  UPDATE public.payment_intents SET status='BLOCKED', blocked_at=now() WHERE id=(j->>'intent_id')::uuid;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',gk,'role','authenticated')::text, true);
  PERFORM public.respond_service_request(v_req9, true, true);
  j := public.provider_cancel_assignment(v_req9, NULL);
  INSERT INTO _r VALUES ('F1_G4_cancel_penalty',
    (j->>'penalty')::numeric=100 AND (j->>'penalty_charged')::boolean,
    'penalty='||(j->>'penalty')||' charged='||(j->>'penalty_charged'));
  SELECT count(*) INTO v_cnt FROM public.wallet_transactions
    WHERE user_id=o AND match_id=m9 AND amount=100 AND type='MATCH_REFUND' AND status='COMPLETED';
  INSERT INTO _r VALUES ('F1_G5_captain_compensated', v_cnt=1, 'comp_rows='||v_cnt);

  -- G-c: maç başladı → yasak
  PERFORM set_config('request.jwt.claims', json_build_object('sub',o,'role','authenticated')::text, true);
  j := public.create_service_request(m10, gk, 'GK');
  v_req10 := (j->>'request_id')::uuid;
  UPDATE public.payment_intents SET status='BLOCKED', blocked_at=now() WHERE id=(j->>'intent_id')::uuid;
  -- kabulü geçmiş maçta simüle etmek için statüyü doğrudan kur (kabul kapıları ayrı test edildi)
  UPDATE public.service_requests SET status='ACCEPTED', accepted_at=now() WHERE id=v_req10;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',gk,'role','authenticated')::text, true);
  BEGIN
    PERFORM public.provider_cancel_assignment(v_req10, NULL);
    INSERT INTO _r VALUES ('F1_G6_cancel_blocked_started', false, 'HATA: izin verdi');
  EXCEPTION WHEN others THEN
    INSERT INTO _r VALUES ('F1_G6_cancel_blocked_started', position('MATCH_STARTED' in SQLERRM)>0, left(SQLERRM,50));
  END;

  -- ══ H) player_kick_slot ══
  kickslots := jsonb_build_array(
    jsonb_build_object('id','k1','status','TAKEN','purchasedBy',p1,
                       'player',jsonb_build_object('id',p1,'paymentStatus','PAID')),
    jsonb_build_object('id','k2','status','OPEN'));
  INSERT INTO public.matches(id,title,status,pitch_id,price,slots,"awaySlots","creatorId",captain_id,starts_at)
    VALUES (m11,'F1 Kick','ACTIVE',pitch,200,kickslots,'[]'::jsonb,o,o,ts);
  INSERT INTO public.wallet_transactions(user_id, match_id, amount, type, balance_type, status, reference_type, description)
    VALUES (p1, m11, -200, 'MATCH_FEE', 'TOP_UP', 'COMPLETED', 'MATCH', 'F1 kick ücreti');

  PERFORM set_config('request.jwt.claims', json_build_object('sub',p2,'role','authenticated')::text, true);
  BEGIN
    PERFORM public.player_kick_slot(m11, 'k1');
    INSERT INTO _r VALUES ('F1_H1_kick_captain_only', false, 'HATA: izin verdi');
  EXCEPTION WHEN others THEN
    INSERT INTO _r VALUES ('F1_H1_kick_captain_only', position('FORBIDDEN' in SQLERRM)>0, left(SQLERRM,50));
  END;

  PERFORM set_config('request.jwt.claims', json_build_object('sub',o,'role','authenticated')::text, true);
  j := public.player_kick_slot(m11, 'k1');
  INSERT INTO _r VALUES ('F1_H2_kick_refunds', (j->>'refunded')::numeric=200, 'refunded='||(j->>'refunded'));
  SELECT count(*) INTO v_cnt FROM public.wallet_transactions
    WHERE user_id=p1 AND match_id=m11 AND type='MATCH_REFUND';
  INSERT INTO _r VALUES ('F1_H3_single_refund_row', v_cnt=1, 'refund_rows='||v_cnt);
  SELECT jsonb_path_query_first(slots, '$[*] ? (@.id=="k1").status') #>> '{}' INTO v_status
    FROM public.matches WHERE id=m11;
  INSERT INTO _r VALUES ('F1_H4_slot_opened', v_status='OPEN', 'slot='||COALESCE(v_status,'NULL'));
  BEGIN
    PERFORM public.player_kick_slot(m11, 'k1');
    INSERT INTO _r VALUES ('F1_H5_second_kick_empty', false, 'HATA: izin verdi');
  EXCEPTION WHEN others THEN
    INSERT INTO _r VALUES ('F1_H5_second_kick_empty', position('SLOT_EMPTY' in SQLERRM)>0, left(SQLERRM,50));
  END;
END $$;
SELECT test, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, got FROM _r ORDER BY test;
ROLLBACK;
