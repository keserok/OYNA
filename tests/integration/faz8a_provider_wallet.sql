-- ============================================================================
-- FAZ 8A — Kaleci/Hakem cüzdan + pazaryeri onarımı uçtan uca testi
-- payout_methods CRUD → kayıtlı yöntemle çekim (TC kapısı) → admin sonuçlandırma
-- → bildirim; provider_update_own_profile yetki matrisi; dinamik TTL +
-- expire_service_requests süpürücüsü (EXPIRED + void + iki tarafa bildirim).
-- İzole: BEGIN/ROLLBACK. auth.uid() set_config ile taklit edilir.
-- ============================================================================
BEGIN;
CREATE TEMP TABLE _r(test text, ok boolean, got text) ON COMMIT DROP;
DO $$
DECLARE
  o    uuid := 'a8000000-0000-0000-0000-0000000000a1';  -- kaptan/creator
  gk   uuid := 'a8000000-0000-0000-0000-0000000000c2';  -- kaleci sağlayıcı
  gk2  uuid := 'a8000000-0000-0000-0000-0000000000c3';  -- ikinci kaleci (yetki testi)
  adm  uuid := 'a8000000-0000-0000-0000-0000000000ad';  -- admin
  pitch uuid := 'a8000000-0000-0000-0000-0000000000e1';
  m1   uuid := 'a8100000-0000-0000-0000-000000000001';  -- uzak maç (>24h)
  m2   uuid := 'a8100000-0000-0000-0000-000000000002';  -- yakın maç (<24h)
  ts_far  timestamptz := now() + interval '3 days';
  ts_near timestamptz := now() + interval '5 hours';
  j jsonb; v_status text; v_txt text; n numeric; v_bool boolean;
  v_req uuid; v_exp timestamptz; v_method uuid; v_method_card uuid; v_payout uuid; v_cnt int;
BEGIN
  INSERT INTO auth.users(id) VALUES (o),(gk),(gk2),(adm);
  UPDATE public.profiles SET role='PLAYER', name='Kaptan', wallet_balance=0 WHERE id=o;
  UPDATE public.profiles SET role='GOALKEEPER', roles='["GOALKEEPER"]'::jsonb,
         verification_status='approved', is_available=true, name='Kaleci', wallet_balance=0 WHERE id=gk;
  UPDATE public.profiles SET role='GOALKEEPER', roles='["GOALKEEPER"]'::jsonb,
         verification_status='approved', is_available=true, name='Kaleci2', wallet_balance=0 WHERE id=gk2;
  UPDATE public.profiles SET is_admin=true, role='SUPER_ADMIN', name='Admin' WHERE id=adm;
  INSERT INTO public.pitches(id,name,address,city,district,owner_id,is_active)
    VALUES (pitch,'F8 Saha','Altınordu','Ordu','Altınordu',o,true);
  INSERT INTO public.goalkeepers(id,name,fee,rating,"matchCount","preferredZones","isDemo")
    VALUES (gk,'Kaleci',200,0,0,'[]'::jsonb,false), (gk2,'Kaleci2',250,0,0,'[]'::jsonb,false);
  INSERT INTO public.matches(id,title,status,pitch_id,price,slots,"awaySlots","creatorId",captain_id,starts_at)
    VALUES (m1,'F8 Uzak Maç','ACTIVE',pitch,200,'[]'::jsonb,'[]'::jsonb,o,o,ts_far),
           (m2,'F8 Yakın Maç','ACTIVE',pitch,200,'[]'::jsonb,'[]'::jsonb,o,o,ts_near);

  -- ── T1: provider_update_own_profile — sağlayıcı kendi kaydını günceller ────
  PERFORM set_config('request.jwt.claims', json_build_object('sub',gk,'role','authenticated')::text, true);
  j := public.provider_update_own_profile(jsonb_build_object(
        'bio','Yeni bio', 'fee', 300,
        'workingHours', jsonb_build_object('activeDays', jsonb_build_array('Pzt','Sal'), 'activeHours','19:00 - 22:00'),
        'settings', jsonb_build_object('notifWeekly', true),
        'isAvailable', false));
  SELECT bio INTO v_txt FROM public.goalkeepers WHERE id=gk;
  INSERT INTO _r VALUES ('F8A_own_profile_bio', v_txt='Yeni bio', 'bio='||v_txt);
  SELECT fee INTO n FROM public.goalkeepers WHERE id=gk;
  INSERT INTO _r VALUES ('F8A_own_profile_fee', n=300, 'fee='||n);
  SELECT (working_hours->>'activeHours') INTO v_txt FROM public.goalkeepers WHERE id=gk;
  INSERT INTO _r VALUES ('F8A_own_profile_hours', v_txt='19:00 - 22:00', 'hours='||COALESCE(v_txt,'NULL'));
  SELECT is_available INTO v_bool FROM public.profiles WHERE id=gk;
  INSERT INTO _r VALUES ('F8A_own_profile_availability', v_bool=false, 'is_available='||v_bool);
  -- müsaitliği geri aç (eşleştirme testleri için)
  PERFORM public.provider_update_own_profile('{"isAvailable": true}'::jsonb);

  -- ── T2: korunan alan reddi (rating self-update yasak) ──────────────────────
  BEGIN
    PERFORM public.provider_update_own_profile('{"rating": 9.9}'::jsonb);
    INSERT INTO _r VALUES ('F8A_own_profile_protected', false, 'exception beklenirdi');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _r VALUES ('F8A_own_profile_protected', SQLERRM LIKE '%PROTECTED_FIELD%', SQLERRM);
  END;

  -- ── T3: sağlayıcı olmayan kullanıcı reddedilir ─────────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub',o,'role','authenticated')::text, true);
  BEGIN
    PERFORM public.provider_update_own_profile('{"bio":"x"}'::jsonb);
    INSERT INTO _r VALUES ('F8A_own_profile_not_provider', false, 'exception beklenirdi');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _r VALUES ('F8A_own_profile_not_provider', SQLERRM LIKE '%NOT_PROVIDER%', SQLERRM);
  END;

  -- ── T4/T5: dinamik TTL — uzak maç ~4 saat, yakın maç ~60 dk ────────────────
  j := public.create_service_request(m1, gk, 'GK');
  v_req := (j->>'request_id')::uuid;
  SELECT expires_at INTO v_exp FROM public.service_requests WHERE id=v_req;
  INSERT INTO _r VALUES ('F8A_ttl_far_4h',
    v_exp BETWEEN now() + interval '3 hours 55 minutes' AND now() + interval '4 hours 5 minutes',
    'expires='||v_exp);
  j := public.create_service_request(m2, gk2, 'GK');
  SELECT expires_at INTO v_exp FROM public.service_requests WHERE id=(j->>'request_id')::uuid;
  INSERT INTO _r VALUES ('F8A_ttl_near_60m',
    v_exp BETWEEN now() + interval '55 minutes' AND now() + interval '65 minutes',
    'expires='||v_exp);

  -- ── T6: talep bildirimi sağlayıcıya düştü ──────────────────────────────────
  SELECT count(*) INTO v_cnt FROM public.notifications
   WHERE user_id=gk AND type_key='service_request_new' AND match_id=m1;
  INSERT INTO _r VALUES ('F8A_notify_request_new', v_cnt=1, 'count='||v_cnt);

  -- ── T7: ret → kaptana bildirim + intent void ───────────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub',gk,'role','authenticated')::text, true);
  PERFORM public.respond_service_request(v_req, false);
  SELECT count(*) INTO v_cnt FROM public.notifications
   WHERE user_id=o AND type_key='service_request_rejected' AND match_id=m1;
  INSERT INTO _r VALUES ('F8A_notify_rejected', v_cnt=1, 'count='||v_cnt);
  -- Ön-mevcut bug onarımı kanıtı: sağlayıcı reddi blokajı gerçekten serbest bırakır
  SELECT status INTO v_status FROM public.payment_intents
   WHERE id=(SELECT payment_intent_id FROM public.service_requests WHERE id=v_req);
  INSERT INTO _r VALUES ('F8A_reject_voids_intent', v_status='VOIDED', 'intent='||v_status);

  -- ── T8: TTL süpürücüsü — süresi geçen PENDING → EXPIRED + void + bildirim ──
  PERFORM set_config('request.jwt.claims', json_build_object('sub',o,'role','authenticated')::text, true);
  j := public.create_service_request(m1, gk, 'GK');
  v_req := (j->>'request_id')::uuid;
  UPDATE public.service_requests SET expires_at = now() - interval '1 minute' WHERE id=v_req;
  PERFORM public.expire_service_requests();
  SELECT status INTO v_status FROM public.service_requests WHERE id=v_req;
  INSERT INTO _r VALUES ('F8A_sweeper_expires', v_status='EXPIRED', 'status='||v_status);
  SELECT status INTO v_status FROM public.payment_intents
   WHERE id=(SELECT payment_intent_id FROM public.service_requests WHERE id=v_req);
  INSERT INTO _r VALUES ('F8A_sweeper_voids_intent', v_status='VOIDED', 'intent='||v_status);
  SELECT count(*) INTO v_cnt FROM public.notifications
   WHERE user_id=o AND type_key='service_request_expired' AND match_id=m1;
  INSERT INTO _r VALUES ('F8A_sweeper_notifies', v_cnt=1, 'count='||v_cnt);

  -- ── T9: payout_methods — IBAN doğrulama + ekleme + varsayılan ──────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub',gk,'role','authenticated')::text, true);
  BEGIN
    PERFORM public.add_payout_method('IBAN','Kaleci Adı',NULL,'GECERSIZ',NULL,NULL);
    INSERT INTO _r VALUES ('F8A_method_invalid_iban', false, 'exception beklenirdi');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _r VALUES ('F8A_method_invalid_iban', SQLERRM LIKE '%INVALID_IBAN%', SQLERRM);
  END;
  j := public.add_payout_method('IBAN','Kaleci Adı','Banka Hesabım','TR12 0001 0002 0003 0004 0005 06',NULL,NULL);
  v_method := (j->>'id')::uuid;
  INSERT INTO _r VALUES ('F8A_method_iban_default', (j->>'is_default')::boolean, j::text);
  j := public.add_payout_method('CARD','Kaleci Adı',NULL,NULL,'4111 1111 1111 4242',NULL);
  v_method_card := (j->>'id')::uuid;
  SELECT card_last4 INTO v_txt FROM public.payout_methods WHERE id=v_method_card;
  INSERT INTO _r VALUES ('F8A_method_card_last4', v_txt='4242', 'last4='||v_txt);
  SELECT count(*) INTO v_cnt FROM public.payout_methods
   WHERE user_id=gk AND card_token IS NOT NULL AND card_token LIKE 'SIM_%';
  INSERT INTO _r VALUES ('F8A_method_card_tokenized', v_cnt=1, 'tokenized='||v_cnt);

  -- ── T10: kayıtlı yöntemle çekim — kimlik yokken IDENTITY_REQUIRED ──────────
  INSERT INTO public.wallet_transactions (user_id, amount, type, balance_type, status, description)
  VALUES (gk, 500, 'SERVICE_EARNING', 'EARNINGS', 'COMPLETED', 'test kazanç');
  BEGIN
    PERFORM public.request_payout_with_method(500, v_method);
    INSERT INTO _r VALUES ('F8A_payout_identity_gate', false, 'exception beklenirdi');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _r VALUES ('F8A_payout_identity_gate', SQLERRM LIKE '%IDENTITY_REQUIRED%', SQLERRM);
  END;

  -- ── T11: kimlik doğrula → karta çekim başarılı + bakiye rezerve ────────────
  PERFORM public.submit_provider_identity('12345678901','Kaleci Adı',1995);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  UPDATE public.provider_identities SET status='VERIFIED' WHERE user_id=gk;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',gk,'role','authenticated')::text, true);
  SELECT id INTO v_payout FROM public.request_payout_with_method(500, v_method_card);
  SELECT method_kind INTO v_txt FROM public.payout_requests WHERE id=v_payout;
  INSERT INTO _r VALUES ('F8A_payout_card_kind', v_txt='CARD', 'kind='||v_txt);
  SELECT iban INTO v_txt FROM public.payout_requests WHERE id=v_payout;
  INSERT INTO _r VALUES ('F8A_payout_card_masked', v_txt LIKE 'KART %4242%', 'iban_disp='||v_txt);
  j := public.get_wallet_summary();
  INSERT INTO _r VALUES ('F8A_payout_reserves_balance',
    (j->>'earnings_balance')::numeric = 0 AND (j->>'reserved_balance')::numeric = 500, j::text);

  -- ── T12: ikinci bekleyen talep engellenir ──────────────────────────────────
  BEGIN
    PERFORM public.request_payout_with_method(1, v_method);
    INSERT INTO _r VALUES ('F8A_payout_single_pending', false, 'exception beklenirdi');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _r VALUES ('F8A_payout_single_pending', SQLERRM LIKE '%PENDING_PAYOUT%' OR SQLERRM LIKE '%INSUFFICIENT%', SQLERRM);
  END;

  -- ── T13: bekleyen çekimin yöntemi silinemez ────────────────────────────────
  BEGIN
    PERFORM public.delete_payout_method(v_method_card);
    INSERT INTO _r VALUES ('F8A_method_in_use_guard', false, 'exception beklenirdi');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _r VALUES ('F8A_method_in_use_guard', SQLERRM LIKE '%METHOD_IN_USE%', SQLERRM);
  END;

  -- ── T14: admin payout'u tamamlar → WITHDRAWAL COMPLETED + bildirim ─────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  PERFORM public.admin_process_payout(v_payout, 'COMPLETED', 'SIM-REF-1', 'test');
  SELECT status INTO v_status FROM public.wallet_transactions
   WHERE reference_type='PAYOUT' AND reference_id=v_payout;
  INSERT INTO _r VALUES ('F8A_payout_completed_tx', v_status='COMPLETED', 'tx='||v_status);
  SELECT count(*) INTO v_cnt FROM public.notifications
   WHERE user_id=gk AND type_key='payout_completed';
  INSERT INTO _r VALUES ('F8A_payout_notify', v_cnt=1, 'count='||v_cnt);
END $$;
SELECT test, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, got FROM _r ORDER BY test;
ROLLBACK;
