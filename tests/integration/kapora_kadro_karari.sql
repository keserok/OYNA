-- ============================================================================
-- KAPORA + KADRO KARARI — söz tutuluyor mu?
--
-- Ekranda oyuncuya "maç dolmazsa kaporanın tamamı iade" deniyor. Bu dosya o
-- sözün ARKASINDAKİ para hareketini sınar; niyetin 'VOIDED' işaretlenmesi
-- YETMEZ, tutarın cüzdana GERİ KONMUŞ olması gerekir.
--
-- Her bölüm kendi hata kalkanında: biri patlarsa diğerleri yine ölçülür ve
-- rapor TEK koşumda tüm kırıkları gösterir.
--
-- İzole: BEGIN/ROLLBACK. auth.uid() set_config ile taklit edilir.
-- ============================================================================
BEGIN;
CREATE TEMP TABLE _r(test text, ok boolean, got text) ON COMMIT DROP;
DO $$
DECLARE
  o     uuid := 'aa000000-0000-0000-0000-0000000000a1';  -- tesis sahibi
  kap1  uuid := 'aa000000-0000-0000-0000-0000000000c1';  -- kadro yetişmez senaryosu
  kap2  uuid := 'aa000000-0000-0000-0000-0000000000c2';  -- kadro tutar senaryosu
  kap3  uuid := 'aa000000-0000-0000-0000-0000000000c3';  -- son çağrı senaryosu
  pitch uuid := 'aa000000-0000-0000-0000-0000000000e1';
  m_bos uuid := 'aa000000-0000-0000-0000-000000000b01';
  m_dol uuid := 'aa000000-0000-0000-0000-000000000b02';
  m_cag uuid := 'aa000000-0000-0000-0000-000000000b03';
  j jsonb; n numeric; v_status text; v_dep text; v_cnt numeric; v_min int; v_filled int;
BEGIN
  -- ── Zemin ────────────────────────────────────────────────────────────────
  BEGIN
    INSERT INTO auth.users(id) VALUES (o),(kap1),(kap2),(kap3);
    UPDATE public.profiles SET role='OWNER', name='Owner' WHERE id=o;
    UPDATE public.profiles SET full_name='Kaptan Bir' WHERE id=kap1;
    UPDATE public.profiles SET full_name='Kaptan İki' WHERE id=kap2;
    UPDATE public.profiles SET full_name='Kaptan Üç'  WHERE id=kap3;
    INSERT INTO public.pitches(id,name,address,city,district,owner_id,is_active)
      VALUES (pitch,'Kapora Saha','Altınordu','Ordu','Altınordu',o,true);
    INSERT INTO public.wallet_transactions(user_id,amount,type,balance_type,status,description)
      VALUES (kap1,5000,'TOP_UP','TOP_UP','COMPLETED','test'),
             (kap2,5000,'TOP_UP','TOP_UP','COMPLETED','test');
    PERFORM public._sync_wallet_mirror(kap1);
    PERFORM public._sync_wallet_mirror(kap2);
    INSERT INTO _r VALUES ('KAP_0_zemin', true, 'ok');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _r VALUES ('KAP_0_zemin', false, SQLERRM);
  END;

  -- ══ 1) TEK EŞİK: her kadro boyu için TOPLAM − 2 ═══════════════════════════
  -- 20 kişilik maç → 18 (yani 9+9). İstenen kural budur.
  BEGIN
    INSERT INTO public.matches(id,title,status,pitch_id,price,slots,"awaySlots","creatorId",captain_id,starts_at,deposit_status)
     VALUES (m_bos,'Kadro yetişmez','ACTIVE',pitch,300,
       (SELECT jsonb_agg(jsonb_build_object('id','s'||i,'role','OYUNCU','status','OPEN')) FROM generate_series(0,9) i),
       (SELECT jsonb_agg(jsonb_build_object('id','a'||i,'role','OYUNCU','status','OPEN')) FROM generate_series(0,9) i),
       kap1,kap1,now()+interval '5 hours','NONE');
    SELECT min_players, filled_slots INTO v_min, v_filled FROM public._match_player_counts(m_bos);
    INSERT INTO _r VALUES ('KAP_1_esik_20_kisilik_18', v_min=18, 'esik='||v_min);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _r VALUES ('KAP_1_esik_20_kisilik_18', false, SQLERRM);
  END;

  -- ══ 2) KAPORA BLOKE → KAPTAN KADROYA OTURUR + CÜZDANDA BLOKE GÖRÜNÜR ═════
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub',kap1,'role','authenticated')::text, true);
    j := public.match_block_deposit(m_bos, 1200, '[]'::jsonb);
    INSERT INTO _r VALUES ('KAP_2a_bloke_ok', (j->>'ok')::boolean AND j->>'deposit_status'='BLOCKED', 'j='||j::text);
    INSERT INTO _r VALUES ('KAP_2b_kaptan_koltuga_oturdu',
      (j->>'captain_seated')::boolean AND (j->>'filled_slots')::int=1,
      'oturdu='||(j->>'captain_seated')||' dolu='||(j->>'filled_slots'));
    SELECT count(*) INTO v_cnt FROM public.match_participants WHERE match_id=m_bos AND user_id=kap1;
    INSERT INTO _r VALUES ('KAP_2c_kaptan_katilimci_kaydi', v_cnt=1, 'katilimci='||v_cnt);
    j := public.get_wallet_summary();
    INSERT INTO _r VALUES ('KAP_2d_harcanabilir_3800', (j->>'spendable_balance')::numeric=3800,
                           'harcanabilir='||(j->>'spendable_balance'));
    INSERT INTO _r VALUES ('KAP_2e_bloke_1200',
      (j->>'blocked_balance')::numeric=1200 AND (j->>'blocked_match_count')::int=1,
      'bloke='||(j->>'blocked_balance')||' n='||(j->>'blocked_match_count'));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _r VALUES ('KAP_2_bloke_bolumu', false, SQLERRM);
  END;

  -- ══ 3) KADRO YETİŞMEZ → İPTAL + KAPORANIN TAMAMI CÜZDANA ═════════════════
  -- ASIL SINAV. Eskiden niyet 'VOIDED' oluyor ama para geri gelmiyordu.
  BEGIN
    j := public.process_match_at_deadline(m_bos);
    SELECT status, deposit_status INTO v_status, v_dep FROM public.matches WHERE id=m_bos;
    INSERT INTO _r VALUES ('KAP_3a_yetersiz_iptal', v_status='CANCELLED' AND v_dep='VOIDED',
                           'durum='||v_status||' kapora='||v_dep);
    SELECT COALESCE(SUM(amount),0) INTO n FROM public.wallet_transactions
     WHERE user_id=kap1 AND balance_type='REFUND_CREDIT' AND reference_type='PAYMENT_INTENT';
    INSERT INTO _r VALUES ('KAP_3b_kapora_cuzdana_dondu_1200', n=1200, 'iade='||n);
    PERFORM set_config('request.jwt.claims', json_build_object('sub',kap1,'role','authenticated')::text, true);
    j := public.get_wallet_summary();
    INSERT INTO _r VALUES ('KAP_3c_bakiye_geri_5000', (j->>'spendable_balance')::numeric=5000,
                           'harcanabilir='||(j->>'spendable_balance'));
    INSERT INTO _r VALUES ('KAP_3d_bloke_sifirlandi', (j->>'blocked_balance')::numeric=0,
                           'bloke='||(j->>'blocked_balance'));
    SELECT count(*) INTO v_cnt FROM public.notifications
     WHERE user_id=kap1 AND match_id=m_bos AND type_key='match_deposit_released';
    INSERT INTO _r VALUES ('KAP_3e_iade_bildirimi', v_cnt=1, 'bildirim='||v_cnt);
    j := public.process_match_at_deadline(m_bos);
    SELECT COALESCE(SUM(amount),0) INTO n FROM public.wallet_transactions
     WHERE user_id=kap1 AND balance_type='REFUND_CREDIT' AND reference_type='PAYMENT_INTENT';
    INSERT INTO _r VALUES ('KAP_3f_iade_idempotent', n=1200 AND (j->>'idempotent')='true', 'iade='||n);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _r VALUES ('KAP_3_iade_bolumu', false, SQLERRM);
  END;

  -- ══ 4) KADRO TUTAR → ANINDA KESİNLEŞİR, PAY DÜŞÜLÜR, FARK İADE ═══════════
  BEGIN
    INSERT INTO public.matches(id,title,status,pitch_id,price,slots,"awaySlots","creatorId",captain_id,starts_at,deposit_status)
     VALUES (m_dol,'Kadro tutar','ACTIVE',pitch,400,
       (SELECT jsonb_agg(jsonb_build_object('id','s'||i,'role','OYUNCU','status','OPEN')) FROM generate_series(0,4) i),
       (SELECT jsonb_agg(jsonb_build_object('id','a'||i,'role','OYUNCU','status','OPEN')) FROM generate_series(0,4) i),
       kap2,kap2,now()+interval '5 hours','NONE');
    PERFORM set_config('request.jwt.claims', json_build_object('sub',kap2,'role','authenticated')::text, true);
    j := public.match_block_deposit(m_dol, 1000, '[]'::jsonb);
    -- Kaptan s0'a oturdu; kalan koltukları doldur → 10 slotta eşik 8'e ulaş.
    UPDATE public.matches SET
      slots = (SELECT jsonb_agg(CASE WHEN s->>'status'='OPEN'
                THEN s || jsonb_build_object('status','TAKEN','purchasedBy',kap2::text) ELSE s END)
               FROM jsonb_array_elements(slots) s),
      "awaySlots" = (SELECT jsonb_agg(CASE WHEN t.ord <= 3
                THEN t.s || jsonb_build_object('status','TAKEN','purchasedBy',kap2::text) ELSE t.s END ORDER BY t.ord)
               FROM jsonb_array_elements("awaySlots") WITH ORDINALITY AS t(s,ord))
    WHERE id=m_dol;
    SELECT min_players, filled_slots INTO v_min, v_filled FROM public._match_player_counts(m_dol);
    INSERT INTO _r VALUES ('KAP_4a_esik_8_dolu_8', v_min=8 AND v_filled=8, 'esik='||v_min||' dolu='||v_filled);
    -- Eşik dolunca kadro tetikleyicisi ANINDA çalışır: karar anını beklemez.
    SELECT status, deposit_status INTO v_status, v_dep FROM public.matches WHERE id=m_dol;
    INSERT INTO _r VALUES ('KAP_4b_aninda_kesinlesir', v_status='LIVE' AND v_dep='CAPTURED',
                           'durum='||v_status||' kapora='||v_dep);
    SELECT COALESCE(SUM(amount),0) INTO n FROM public.wallet_transactions
     WHERE user_id=kap2 AND balance_type='REFUND_CREDIT' AND reference_type='PAYMENT_INTENT';
    INSERT INTO _r VALUES ('KAP_4c_fark_iadesi_600', n=600, 'iade='||n);
    SELECT count(*) INTO v_cnt FROM public.notifications
     WHERE user_id=kap2 AND match_id=m_dol AND type_key='match_deposit_captured';
    INSERT INTO _r VALUES ('KAP_4d_tahsil_bildirimi', v_cnt=1, 'bildirim='||v_cnt);
    j := public.process_match_at_deadline(m_dol);
    INSERT INTO _r VALUES ('KAP_4e_karar_disi', (j->>'idempotent')='true', 'j='||j::text);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _r VALUES ('KAP_4_tahsil_bolumu', false, SQLERRM);
  END;

  -- ══ 5) SON ÇAĞRI: 8 saat kala uyarı gider, maç İPTAL EDİLMEZ ═════════════
  BEGIN
    INSERT INTO public.matches(id,title,status,pitch_id,price,slots,"awaySlots","creatorId",captain_id,starts_at,deposit_status)
     VALUES (m_cag,'Son çağrı','ACTIVE',pitch,200,
       (SELECT jsonb_agg(jsonb_build_object('id','s'||i,'role','OYUNCU','status','OPEN')) FROM generate_series(0,6) i),
       (SELECT jsonb_agg(jsonb_build_object('id','a'||i,'role','OYUNCU','status','OPEN')) FROM generate_series(0,6) i),
       kap3,kap3,now()+interval '4 hours','NONE');
    PERFORM public.auto_process_matches();
    SELECT status INTO v_status FROM public.matches WHERE id=m_cag;
    INSERT INTO _r VALUES ('KAP_5a_son_cagri_iptal_etmez', v_status='ACTIVE', 'durum='||v_status);
    SELECT count(*) INTO v_cnt FROM public.notifications
     WHERE user_id=kap3 AND match_id=m_cag AND type_key='match_last_call';
    INSERT INTO _r VALUES ('KAP_5b_son_cagri_bildirimi', v_cnt=1, 'bildirim='||v_cnt);
    PERFORM public.auto_process_matches();
    SELECT count(*) INTO v_cnt FROM public.notifications
     WHERE user_id=kap3 AND match_id=m_cag AND type_key='match_last_call';
    INSERT INTO _r VALUES ('KAP_5c_son_cagri_tek_sefer', v_cnt=1, 'bildirim='||v_cnt);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _r VALUES ('KAP_5_son_cagri_bolumu', false, SQLERRM);
  END;

  -- ══ 6) KESİN KARAR: 90 dakika kala kadro son kez sayılır ═════════════════
  BEGIN
    UPDATE public.matches SET starts_at = now() + interval '30 minutes' WHERE id=m_cag;
    PERFORM public.auto_process_matches();
    SELECT status INTO v_status FROM public.matches WHERE id=m_cag;
    INSERT INTO _r VALUES ('KAP_6_90dk_karar_verir', v_status='CANCELLED', 'durum='||v_status);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _r VALUES ('KAP_6_90dk_karar_verir', false, SQLERRM);
  END;
END $$;
SELECT test, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, got FROM _r ORDER BY test;
ROLLBACK;
