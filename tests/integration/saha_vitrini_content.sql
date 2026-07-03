-- ============================================================================
-- SAHA VİTRİNİ — İçerik yönetimi güvenlik & bütünlük testi
-- pitch_media RLS (sahiplik) · media→images senkron trigger'ı · pitch_favorites
-- RLS · kalite notu onay trigger'ı (owner beyan→pending, self-approve engeli) ·
-- ad/konum kimlik koruması + change request onay akışı · get_pitch_engagement yetkisi.
-- İzole: BEGIN/ROLLBACK. auth.uid() set_config ile, RLS 'SET LOCAL ROLE authenticated' ile.
-- ============================================================================
BEGIN;
CREATE TEMP TABLE _r(test text, ok boolean, got text) ON COMMIT DROP;
GRANT ALL ON _r TO authenticated; -- SET ROLE authenticated altında da sonuç yazılabilsin
DO $$
DECLARE
  own uuid:='51000000-0000-0000-0000-0000000000a1'; -- tesis sahibi
  str uuid:='51000000-0000-0000-0000-0000000000a2'; -- yabancı oyuncu
  adm uuid:='51000000-0000-0000-0000-0000000000a3'; -- platform admin
  pt  uuid:='51000000-0000-0000-0000-0000000000b1'; -- tesis
  ct  uuid:='51000000-0000-0000-0000-0000000000c1'; -- kort
  v_txt text; v_cnt int; v_status text; v_img text; j jsonb;
BEGIN
  INSERT INTO auth.users(id) VALUES (own),(str),(adm);
  UPDATE public.profiles SET name='Sahip', full_name='Sahip' WHERE id=own;
  UPDATE public.profiles SET name='Oyuncu', full_name='Oyuncu' WHERE id=str;
  UPDATE public.profiles SET name='Admin', full_name='Admin', is_admin=true, role='SUPER_ADMIN' WHERE id=adm;

  INSERT INTO public.pitches(id, owner_id, name, address, city, district, verification_status, is_demo)
    VALUES (pt, own, 'Test Arena', 'Test Cad. 1', 'Ordu', 'Altınordu', 'approved', false);
  INSERT INTO public.courts(id, pitch_id, name, court_type, surface)
    VALUES (ct, pt, 'Kort 1', 'CLOSED', 'TURF');

  -- ── pitch_media RLS: sahip ekleyebilir, yabancı ekleyemez ──
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',own,'role','authenticated')::text, true);
  INSERT INTO public.pitch_media(pitch_id, url, storage_path, sort_order)
    VALUES (pt, 'https://cdn/img1.jpg', 'pitches/'||pt||'/img1.jpg', 0);
  INSERT INTO _r VALUES ('VITRIN_owner_media_insert', true, 'ok');

  PERFORM set_config('request.jwt.claims', json_build_object('sub',str,'role','authenticated')::text, true);
  BEGIN
    INSERT INTO public.pitch_media(pitch_id, url, sort_order) VALUES (pt, 'https://cdn/hack.jpg', 1);
    INSERT INTO _r VALUES ('VITRIN_stranger_media_blocked', false, 'izin verdi!');
  EXCEPTION WHEN others THEN
    INSERT INTO _r VALUES ('VITRIN_stranger_media_blocked', position('row-level security' in SQLERRM)>0, 'ok');
  END;

  -- ── senkron trigger: pitches.image kapak olarak dolar ──
  PERFORM set_config('request.jwt.claims', json_build_object('sub',own,'role','authenticated')::text, true);
  INSERT INTO public.pitch_media(pitch_id, url, storage_path, sort_order)
    VALUES (pt, 'https://cdn/img2.jpg', 'pitches/'||pt||'/img2.jpg', 1);
  EXECUTE 'RESET ROLE';
  SELECT image, jsonb_array_length(images) INTO v_img, v_cnt FROM public.pitches WHERE id=pt;
  INSERT INTO _r VALUES ('VITRIN_media_sync_cover', v_img='https://cdn/img1.jpg' AND v_cnt=2, 'image='||COALESCE(v_img,'?')||' n='||v_cnt);

  -- kapak değişimi: img2 öne alınınca pitches.image güncellenir
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.pitch_media SET sort_order=-1 WHERE pitch_id=pt AND url='https://cdn/img2.jpg';
  EXECUTE 'RESET ROLE';
  SELECT image INTO v_img FROM public.pitches WHERE id=pt;
  INSERT INTO _r VALUES ('VITRIN_media_sync_reorder', v_img='https://cdn/img2.jpg', 'image='||COALESCE(v_img,'?'));

  -- ── pitch_favorites RLS: kendi adına ekler, başkası adına ekleyemez ──
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',str,'role','authenticated')::text, true);
  INSERT INTO public.pitch_favorites(user_id, pitch_id) VALUES (str, pt);
  INSERT INTO _r VALUES ('VITRIN_favorite_insert_own', true, 'ok');
  BEGIN
    INSERT INTO public.pitch_favorites(user_id, pitch_id) VALUES (own, pt);
    INSERT INTO _r VALUES ('VITRIN_favorite_impersonation_blocked', false, 'izin verdi!');
  EXCEPTION WHEN others THEN
    INSERT INTO _r VALUES ('VITRIN_favorite_impersonation_blocked', position('row-level security' in SQLERRM)>0, 'ok');
  END;

  -- ── kalite notu akışı: owner beyanı pending olur, self-approve işlemez ──
  PERFORM set_config('request.jwt.claims', json_build_object('sub',own,'role','authenticated')::text, true);
  UPDATE public.courts SET lighting_grade='A+', grass_grade='A' WHERE id=ct;
  SELECT grades_status INTO v_status FROM public.courts WHERE id=ct;
  INSERT INTO _r VALUES ('VITRIN_grades_owner_pending', v_status='pending', 'status='||v_status);

  UPDATE public.courts SET grades_status='approved' WHERE id=ct; -- self-approve denemesi
  SELECT grades_status INTO v_status FROM public.courts WHERE id=ct;
  INSERT INTO _r VALUES ('VITRIN_grades_self_approve_blocked', v_status='pending', 'status='||v_status);

  PERFORM set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  UPDATE public.courts SET grades_status='approved' WHERE id=ct; -- admin onayı
  SELECT grades_status INTO v_status FROM public.courts WHERE id=ct;
  INSERT INTO _r VALUES ('VITRIN_grades_admin_approve', v_status='approved', 'status='||v_status);

  -- ── kimlik koruması: onaylı tesiste owner adı doğrudan değiştiremez ──
  PERFORM set_config('request.jwt.claims', json_build_object('sub',own,'role','authenticated')::text, true);
  BEGIN
    UPDATE public.pitches SET name='Hacked Arena' WHERE id=pt;
    INSERT INTO _r VALUES ('VITRIN_identity_direct_blocked', false, 'izin verdi!');
  EXCEPTION WHEN others THEN
    INSERT INTO _r VALUES ('VITRIN_identity_direct_blocked', position('PITCH_IDENTITY_CHANGE_REQUIRES_APPROVAL' in SQLERRM)>0, 'ok');
  END;

  -- açıklama gibi güvenli alanlar serbest kalır
  UPDATE public.pitches SET description='Yenilenmiş zemin, tam donanımlı tesis.' WHERE id=pt;
  INSERT INTO _r VALUES ('VITRIN_safe_fields_editable', true, 'ok');

  -- change request → admin onayı → ad uygulanır
  INSERT INTO public.pitch_change_requests(id, pitch_id, requested_by, changes)
    VALUES ('51000000-0000-0000-0000-0000000000d1', pt, own, '{"name":"Yeni Arena"}'::jsonb);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  PERFORM public.review_pitch_change_request('51000000-0000-0000-0000-0000000000d1', true, 'uygun');
  EXECUTE 'RESET ROLE';
  SELECT name INTO v_txt FROM public.pitches WHERE id=pt;
  INSERT INTO _r VALUES ('VITRIN_change_request_applied', v_txt='Yeni Arena', 'name='||v_txt);

  -- ── analitik yetkisi: sahip okur, yabancı okuyamaz ──
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',own,'role','authenticated')::text, true);
  j := public.get_pitch_engagement(pt);
  INSERT INTO _r VALUES ('VITRIN_engagement_owner_reads', (j->>'favorites')::int=1, 'favorites='||COALESCE(j->>'favorites','?'));
  PERFORM set_config('request.jwt.claims', json_build_object('sub',str,'role','authenticated')::text, true);
  BEGIN
    j := public.get_pitch_engagement(pt);
    INSERT INTO _r VALUES ('VITRIN_engagement_stranger_blocked', false, 'izin verdi!');
  EXCEPTION WHEN others THEN
    INSERT INTO _r VALUES ('VITRIN_engagement_stranger_blocked', true, 'ok');
  END;
  EXECUTE 'RESET ROLE';
END $$;

SELECT test, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, got FROM _r ORDER BY test;
ROLLBACK;
