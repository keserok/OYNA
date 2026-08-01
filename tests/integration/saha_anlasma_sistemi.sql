-- ============================================================================
-- SAHA ANLAŞMA SİSTEMİ — fiyat, komisyon, hakediş ve iptal saati
--
-- Bu dosya "panelden girilen sayı gerçekten para akışını değiştiriyor mu?"
-- sorusunu sınar. Ekranın bir sayı göstermesi YETMEZ; oyuncunun ödediği tutar
-- ve saha sahibinin kazancı o sayıdan türemiş olmalıdır.
--
-- Her bölüm kendi hata kalkanında: biri patlarsa diğerleri yine ölçülür.
-- İzole: BEGIN/ROLLBACK.
-- ============================================================================
BEGIN;
CREATE TEMP TABLE _r(test text, ok boolean, got text) ON COMMIT DROP;
GRANT ALL ON _r TO authenticated;
DO $$
DECLARE
  o     uuid := 'ac000000-0000-0000-0000-0000000000a1';  -- tesis sahibi
  kap   uuid := 'ac000000-0000-0000-0000-0000000000c1';  -- kaptan
  per   uuid := 'ac000000-0000-0000-0000-0000000000c2';  -- personel (STAFF)
  pit   uuid := 'ac000000-0000-0000-0000-0000000000e1';
  kort  uuid := 'ac000000-0000-0000-0000-0000000000f1';
  m1    uuid; m2 uuid;
  j jsonb; a RECORD; n numeric; v_st text; v_pay text; v_cnt numeric;
  v_tarih date := (now() + interval '3 days')::date;
BEGIN
  -- ══ 0) ZEMİN: saha + kort + tarife (saat 2000₺) ══════════════════════════
  BEGIN
    INSERT INTO auth.users(id) VALUES (o),(kap),(per);
    UPDATE public.profiles SET role='OWNER', name='Sahip' WHERE id=o;
    UPDATE public.profiles SET full_name='Kaptan' WHERE id=kap;
    UPDATE public.profiles SET full_name='Personel' WHERE id=per;
    INSERT INTO public.pitches(id,name,address,city,district,owner_id,is_active,is_published,latitude,longitude)
      VALUES (pit,'Anlaşma Saha','Altınordu','Ordu','Altınordu',o,true,true,40.98,37.87);
    -- SIRA ÖNEMLİ: tarifesiz saha AKTİF edilemiyor (enforce_court_tariff_before_activate).
    -- Önce pasif kort, sonra tarife, sonra aktifleştirme.
    INSERT INTO public.courts(id,pitch_id,name,is_active,min_capacity,max_capacity)
      VALUES (kort,pit,'Kort 1',false,3,11);
    -- applies_to_days ISODOW'dur (1=Pazartesi … 7=Pazar) — 0..6 DEĞİL.
    INSERT INTO public.pitch_tariffs(pitch_id,court_id,name,tariff_type,applies_to_days,
                                     start_time,end_time,slot_price,deposit_amount,is_active,slot_minutes)
      VALUES (pit,kort,'Standart','WEEKDAY',ARRAY[1,2,3,4,5,6,7],
              time '00:00', time '23:59', 2000, 400, true, 60);
    UPDATE public.courts SET is_active = true WHERE id = kort;
    INSERT INTO public.wallet_transactions(user_id,amount,type,balance_type,status,description)
      VALUES (kap, 20000, 'TOP_UP','TOP_UP','COMPLETED','test');
    PERFORM public._sync_wallet_mirror(kap);
    INSERT INTO _r VALUES ('ANL_0_zemin', true, 'ok');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _r VALUES ('ANL_0_zemin', false, SQLERRM);
  END;

  -- ══ 1) ANLAŞMA ÇÖZÜMÜ: saha özel yoksa global ════════════════════════════
  BEGIN
    SELECT * INTO a FROM public._pitch_agreement(pit);
    INSERT INTO _r VALUES ('ANL_1a_varsayilan_global_A',
      a.model='MODEL_A' AND a.rate_pct=15 AND a.markup_pct=5,
      format('model=%s oran=%s markup=%s', a.model, a.rate_pct, a.markup_pct));
    -- Gömülü %5 artık ayarda: bugünkü fiyat korunuyor mu?
    INSERT INTO _r VALUES ('ANL_1b_gomulu_yuzde5_ayara_tasindi',
      public._markup_tutari(2000, a.markup_pct, a.markup_amount) = 100,
      'markup=' || public._markup_tutari(2000, a.markup_pct, a.markup_amount));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _r VALUES ('ANL_1_cozum', false, SQLERRM);
  END;

  -- ══ 2) FİYAT: global anlaşmayla kurulan maç (bugünkü davranış korunmalı) ═
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub',kap,'role','authenticated')::text, true);
    j := public.create_match_atomic(kort, v_tarih, time '20:00', '5v5', 'OPEN',
           jsonb_build_object('title','Global Maç'), NULL, NULL);
    m1 := (j->>'match_id')::uuid;
    -- 2000 + %5 = 2100 → 10 slot → kişi başı 210. ESKİ FORMÜLLE AYNI.
    INSERT INTO _r VALUES ('ANL_2a_fiyat_bugunku_gibi_210',
      (j->>'per_person')::numeric = 210 AND (j->>'player_total')::numeric = 2100,
      format('kisi_basi=%s oyuncu_toplam=%s markup=%s',
             j->>'per_person', j->>'player_total', j->>'markup'));
    SELECT commission_model, commission_rate_pct, commission_markup_pct
      INTO v_st, n, v_cnt FROM public.matches WHERE id=m1;
    INSERT INTO _r VALUES ('ANL_2b_anlasma_maca_donduruldu',
      v_st='MODEL_A' AND n=15 AND v_cnt=5,
      format('model=%s oran=%s markup=%s', v_st, n, v_cnt));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _r VALUES ('ANL_2_global_fiyat', false, SQLERRM);
  END;

  -- ══ 3) SAHAYA ÖZEL ANLAŞMA: 2000'e kirala, oyuncuya 2400'e sat ═══════════
  BEGIN
    -- is_admin'i kullanıcı kendisi değiştiremez (protect_profile_sensitive_fields).
    -- Test için "oturum yok" durumuna düşüp sistem olarak yetki veriyoruz.
    PERFORM set_config('request.jwt.claims', '', true);
    UPDATE public.profiles SET is_admin = true WHERE id = o;
    PERFORM set_config('request.jwt.claims', json_build_object('sub',o,'role','authenticated')::text, true);
    j := public.admin_set_pitch_agreement(pit, 'MODEL_B', 5, 20, NULL, 'Test anlaşması');
    INSERT INTO _r VALUES ('ANL_3a_admin_anlasma_yazdi',
      (j->>'model')='MODEL_B' AND (j->>'sahaya_ozel')::boolean
      AND (j->>'ornek_sahaya')::numeric = 1900 AND (j->>'ornek_oyuncudan')::numeric = 2400,
      format('sahaya=%s oyuncudan=%s', j->>'ornek_sahaya', j->>'ornek_oyuncudan'));

    PERFORM set_config('request.jwt.claims', json_build_object('sub',kap,'role','authenticated')::text, true);
    j := public.create_match_atomic(kort, v_tarih, time '22:00', '5v5', 'OPEN',
           jsonb_build_object('title','Model B Maç'), NULL, NULL);
    m2 := (j->>'match_id')::uuid;
    -- 2000 + %20 = 2400 → 10 slot → kişi başı 240.
    INSERT INTO _r VALUES ('ANL_3b_model_b_fiyat_240',
      (j->>'per_person')::numeric = 240 AND (j->>'player_total')::numeric = 2400,
      format('kisi_basi=%s oyuncu_toplam=%s', j->>'per_person', j->>'player_total'));
    SELECT commission_model INTO v_st FROM public.matches WHERE id=m2;
    INSERT INTO _r VALUES ('ANL_3c_model_sahadan_geldi', v_st='MODEL_B', 'model='||v_st);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _r VALUES ('ANL_3_model_b', false, SQLERRM);
  END;

  -- ══ 4) SABİT TUTAR markup yüzdeyi EZER ═══════════════════════════════════
  BEGIN
    INSERT INTO _r VALUES ('ANL_4_sabit_tutar_yuzdeyi_ezer',
      public._markup_tutari(2000, 20, 400) = 400 AND public._markup_tutari(2000, 20, 0) = 400,
      format('sabit=%s yuzde=%s', public._markup_tutari(2000,20,400), public._markup_tutari(2000,20,0)));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _r VALUES ('ANL_4_sabit_tutar_yuzdeyi_ezer', false, SQLERRM);
  END;

  -- ══ 5) DONDURMA: anlaşma değişse bile kurulmuş maç etkilenmez ════════════
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub',o,'role','authenticated')::text, true);
    PERFORM public.admin_set_pitch_agreement(pit, 'MODEL_A', 40, 0, NULL, 'Sonradan değişti');
    SELECT commission_model, commission_rate_pct INTO v_st, n FROM public.matches WHERE id=m2;
    INSERT INTO _r VALUES ('ANL_5_anlasma_degisti_mac_degismedi',
      v_st='MODEL_B' AND n=5, format('model=%s oran=%s', v_st, n));
    -- Eski hâle döndür (sonraki bölümler MODEL_B bekliyor).
    PERFORM public.admin_set_pitch_agreement(pit, 'MODEL_B', 5, 20, NULL, 'Geri alındı');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _r VALUES ('ANL_5_dondurma', false, SQLERRM);
  END;

  -- ══ 6) KESİNLEŞME: CONFIRMED + hakediş + rezervasyon ödendi ══════════════
  BEGIN
    -- Kadroyu eşiğe getir (10 slot → eşik 8; kaptan zaten 1 koltukta).
    UPDATE public.matches SET
      slots = (SELECT jsonb_agg(CASE WHEN s->>'status'='OPEN'
                THEN s || jsonb_build_object('status','TAKEN','purchasedBy',kap::text) ELSE s END)
               FROM jsonb_array_elements(slots) s),
      "awaySlots" = (SELECT jsonb_agg(CASE WHEN t.ord <= 3
                THEN t.s || jsonb_build_object('status','TAKEN','purchasedBy',kap::text) ELSE t.s END ORDER BY t.ord)
               FROM jsonb_array_elements("awaySlots") WITH ORDINALITY AS t(s,ord))
    WHERE id = m2;

    SELECT status, is_successful::text INTO v_st, v_pay FROM public.matches WHERE id=m2;
    INSERT INTO _r VALUES ('ANL_6a_tek_durum_CONFIRMED', v_st='CONFIRMED', 'durum='||v_st);
    INSERT INTO _r VALUES ('ANL_6b_is_successful_yazilmadi',
      v_pay IS DISTINCT FROM 'true', 'is_successful='||COALESCE(v_pay,'NULL'));

    -- Hakediş: 2000 − %5 = 1900 (MODEL_B, dondurulmuş oran).
    SELECT COALESCE(sum(amount),0) INTO n FROM public.wallet_transactions
     WHERE match_id=m2 AND type='MATCH_EARNING' AND user_id=o;
    INSERT INTO _r VALUES ('ANL_6c_saha_hakedisi_1900', n=1900, 'hakedis='||n);
    SELECT status INTO v_st FROM public.wallet_transactions
     WHERE match_id=m2 AND type='MATCH_EARNING' LIMIT 1;
    INSERT INTO _r VALUES ('ANL_6d_hakedis_beklemede', v_st='PENDING', 'durum='||COALESCE(v_st,'YOK'));

    SELECT payment_status, paid_amount INTO v_pay, n FROM public.pitch_bookings WHERE match_id=m2;
    INSERT INTO _r VALUES ('ANL_6e_rezervasyon_odendi',
      v_pay='PAID' AND n=2000, format('durum=%s odenen=%s', v_pay, n));

    -- İkinci kez tetiklenirse ikinci hakediş YAZILMAZ.
    PERFORM public._match_confirm_settle(m2);
    SELECT count(*) INTO v_cnt FROM public.wallet_transactions
     WHERE match_id=m2 AND type='MATCH_EARNING';
    INSERT INTO _r VALUES ('ANL_6f_hakedis_tek_kez', v_cnt=1, 'adet='||v_cnt);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _r VALUES ('ANL_6_kesinlesme', false, SQLERRM);
  END;

  -- ══ 7) İPTAL SAATİ SAHADAN — geç iptalde hakediş KALIR ═══════════════════
  BEGIN
    -- Sahanın serbest iptal saati 48 olsun; maça ~3 gün (72 saat) var.
    PERFORM set_config('request.jwt.claims', json_build_object('sub',o,'role','authenticated')::text, true);
    j := public.admin_set_pitch_cancel_policy(pit, 48, 12, 40);
    INSERT INTO _r VALUES ('ANL_7a_admin_iptal_saati_yazdi',
      (j->>'full_hours')::numeric = 48, 'saat='||(j->>'full_hours'));

    j := public.match_cancel_policy(m2);
    INSERT INTO _r VALUES ('ANL_7b_oyuncuya_dogru_saat',
      (j->>'full_hours')::numeric = 48 AND (j->>'half_hours')::numeric = 12
      AND (j->>'half_pct')::numeric = 40, 'j='||j::text);

    -- Maçı 30 saat sonraya al → 48'den AZ kaldı → GEÇ iptal.
    UPDATE public.matches SET starts_at = now() + interval '30 hours' WHERE id=m2;
    PERFORM set_config('request.jwt.claims', json_build_object('sub',kap,'role','authenticated')::text, true);
    j := public.match_cancel_by_captain(m2);
    INSERT INTO _r VALUES ('ANL_7c_gec_iptal_saha_saatine_gore',
      (j->>'outcome')='NO_REFUND_PENALTY' AND (j->>'free_hours')::numeric=48,
      format('sonuc=%s saat=%s', j->>'outcome', j->>'free_hours'));
    SELECT status INTO v_st FROM public.wallet_transactions
     WHERE match_id=m2 AND type='MATCH_EARNING' LIMIT 1;
    INSERT INTO _r VALUES ('ANL_7d_gec_iptalde_hakedis_kalir',
      v_st='PENDING', 'hakedis_durumu='||COALESCE(v_st,'YOK'));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _r VALUES ('ANL_7_gec_iptal', false, SQLERRM);
  END;

  -- ══ 8) ERKEN İPTAL: hakediş geri alınır ══════════════════════════════════
  BEGIN
    -- m1 (global anlaşmalı maç) kadroyu doldur → kesinleşsin.
    UPDATE public.matches SET
      slots = (SELECT jsonb_agg(CASE WHEN s->>'status'='OPEN'
                THEN s || jsonb_build_object('status','TAKEN','purchasedBy',kap::text) ELSE s END)
               FROM jsonb_array_elements(slots) s),
      "awaySlots" = (SELECT jsonb_agg(CASE WHEN t.ord <= 3
                THEN t.s || jsonb_build_object('status','TAKEN','purchasedBy',kap::text) ELSE t.s END ORDER BY t.ord)
               FROM jsonb_array_elements("awaySlots") WITH ORDINALITY AS t(s,ord))
    WHERE id = m1;
    -- Maça 100 saat var (48'den fazla) → ERKEN iptal.
    UPDATE public.matches SET starts_at = now() + interval '100 hours' WHERE id=m1;
    PERFORM set_config('request.jwt.claims', json_build_object('sub',kap,'role','authenticated')::text, true);
    j := public.match_cancel_by_captain(m1);
    INSERT INTO _r VALUES ('ANL_8a_erken_iptal_iade',
      (j->>'outcome')='REFUNDED', 'sonuc='||(j->>'outcome'));
    SELECT status INTO v_st FROM public.wallet_transactions
     WHERE match_id=m1 AND type='MATCH_EARNING' LIMIT 1;
    INSERT INTO _r VALUES ('ANL_8b_erken_iptalde_hakedis_iptal',
      v_st='CANCELLED', 'hakedis_durumu='||COALESCE(v_st,'YOK'));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _r VALUES ('ANL_8_erken_iptal', false, SQLERRM);
  END;

  -- ══ 9) YETKİ: anlaşmayı YALNIZ SAHİBİ görür, personel GÖREMEZ ════════════
  BEGIN
    PERFORM set_config('request.jwt.claims', '', true);
    UPDATE public.profiles SET is_admin = false WHERE id = o;
    INSERT INTO public.pitch_staff_members(pitch_id,user_id,name,staff_role,account_status)
      VALUES (pit, per, 'Personel', 'STAFF', 'ACTIVE');

    PERFORM set_config('request.jwt.claims', json_build_object('sub',o,'role','authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    BEGIN
      j := public.my_pitch_agreement(pit);
      INSERT INTO _r VALUES ('ANL_9a_sahibi_gorur',
        (j->>'model')='MODEL_B' AND (j->>'iptal_saati')::numeric=48, 'j='||j::text);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO _r VALUES ('ANL_9a_sahibi_gorur', false, SQLERRM);
    END;
    RESET ROLE;

    PERFORM set_config('request.jwt.claims', json_build_object('sub',per,'role','authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    BEGIN
      PERFORM public.my_pitch_agreement(pit);
      INSERT INTO _r VALUES ('ANL_9b_personel_goremez', false, 'HATA: personel görebildi!');
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO _r VALUES ('ANL_9b_personel_goremez',
        position('FORBIDDEN' in SQLERRM) > 0, SQLERRM);
    END;
    RESET ROLE;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    INSERT INTO _r VALUES ('ANL_9_yetki', false, SQLERRM);
  END;
END $$;
SELECT test, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS sonuc, got FROM _r ORDER BY test;
ROLLBACK;
