-- ============================================================================
-- FAZ 6 — Sosyal & Taktik motoru uçtan uca testi
-- Mesajlaşma (arkadaş/engel kapısı) · Taktik sosyal (oylama/yetki/favori/kopya/
-- vitrin) · Takım yönetimi (kaptan devri) · Takım-vs-takım skor onayı (oyuncu-
-- hepsi-onaylar → W/L + idempotency).
-- İzole: BEGIN/ROLLBACK. auth.uid() set_config ile taklit edilir.
-- ============================================================================
BEGIN;
CREATE TEMP TABLE _r(test text, ok boolean, got text) ON COMMIT DROP;
DO $$
DECLARE
  cap uuid:='a6000000-0000-0000-0000-0000000000a1'; m1 uuid:='a6000000-0000-0000-0000-0000000000b1';
  nm  uuid:='a6000000-0000-0000-0000-0000000000d1'; p1 uuid:='a6000000-0000-0000-0000-0000000000e1';
  p2  uuid:='a6000000-0000-0000-0000-0000000000e2';
  T uuid:='a6000000-0000-0000-0000-0000000000f1'; Ta uuid:='a6000000-0000-0000-0000-0000000000f2'; Tb uuid:='a6000000-0000-0000-0000-0000000000f3';
  tk uuid:='a6100000-0000-0000-0000-000000000001'; ms uuid:='a6100000-0000-0000-0000-000000000002';
  j jsonb; n numeric; v_bool boolean; v_txt text; v_conv uuid; v_prop uuid; v_new uuid;
BEGIN
  INSERT INTO auth.users(id) VALUES (cap),(m1),(nm),(p1),(p2);
  UPDATE public.profiles SET name='Cap', full_name='Cap' WHERE id=cap;
  UPDATE public.profiles SET name='M1',  full_name='M1'  WHERE id=m1;
  UPDATE public.profiles SET name='NM',  full_name='NM'  WHERE id=nm;
  INSERT INTO public.teams(id,name,captain_id,captains,wins,losses,is_demo) VALUES
    (T,'TakimT',cap,jsonb_build_array(cap::text),0,0,false),
    (Ta,'TakimA',p1,jsonb_build_array(p1::text),0,0,false),
    (Tb,'TakimB',p2,jsonb_build_array(p2::text),0,0,false);
  INSERT INTO public.team_members(team_id,user_id,is_active) VALUES (T,cap,true),(T,m1,true);
  INSERT INTO public.tactics(id,"userId","teamId",name,formation,size,slots,status,"proposedBy",priority,is_active,"createdAt")
    VALUES (tk,cap,T,'4-4-2 Plan','4-4-2','7v7','[]','APPROVED',cap,0,false,now());
  INSERT INTO public.friendships(id,sender_id,receiver_id,status) VALUES (gen_random_uuid(),cap,m1,'ACCEPTED');

  -- ── Mesajlaşma ──
  PERFORM set_config('request.jwt.claims', json_build_object('sub',cap,'role','authenticated')::text, true);
  v_conv := public.get_or_create_conversation(m1);
  INSERT INTO _r VALUES ('FAZ6_conversation_created', v_conv IS NOT NULL, 'conv_ok');
  PERFORM public.send_message(v_conv, 'Selam');
  PERFORM set_config('request.jwt.claims', json_build_object('sub',m1,'role','authenticated')::text, true);
  j := public.get_my_conversations();
  INSERT INTO _r VALUES ('FAZ6_unread_count_1', (j->0->>'unread_count')::int=1, 'unread='||COALESCE(j->0->>'unread_count','?'));
  PERFORM set_config('request.jwt.claims', json_build_object('sub',cap,'role','authenticated')::text, true);
  BEGIN PERFORM public.get_or_create_conversation(nm);
    INSERT INTO _r VALUES ('FAZ6_nonfriend_blocked', false, 'izin verdi');
  EXCEPTION WHEN others THEN INSERT INTO _r VALUES ('FAZ6_nonfriend_blocked', position('NOT_FRIENDS' in SQLERRM)>0, 'ok'); END;
  INSERT INTO public.user_blocks(blocker_id,blocked_id) VALUES (cap,m1);
  BEGIN PERFORM public.send_message(v_conv,'x');
    INSERT INTO _r VALUES ('FAZ6_block_stops_message', false, 'izin verdi');
  EXCEPTION WHEN others THEN INSERT INTO _r VALUES ('FAZ6_block_stops_message', position('BLOCKED' in SQLERRM)>0, 'ok'); END;
  DELETE FROM public.user_blocks WHERE blocker_id=cap AND blocked_id=m1;

  -- ── Taktik sosyal ──
  PERFORM set_config('request.jwt.claims', json_build_object('sub',m1,'role','authenticated')::text, true);
  PERFORM public.vote_tactic(tk, 80);
  SELECT avg(percent) INTO n FROM public.tactic_votes WHERE tactic_id=tk;
  INSERT INTO _r VALUES ('FAZ6_vote_recorded_80', n=80, 'avg='||n);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',nm,'role','authenticated')::text, true);
  BEGIN PERFORM public.vote_tactic(tk,50);
    INSERT INTO _r VALUES ('FAZ6_nonmember_vote_blocked', false, 'izin verdi');
  EXCEPTION WHEN others THEN INSERT INTO _r VALUES ('FAZ6_nonmember_vote_blocked', position('FORBIDDEN' in SQLERRM)>0, 'ok'); END;
  -- Üye olmayan, kaynak takımın gizli taktiğini kopyalayamaz (FORBIDDEN_SOURCE)
  BEGIN PERFORM public.copy_tactic(tk, NULL);
    INSERT INTO _r VALUES ('FAZ6_nonmember_copy_blocked', false, 'izin verdi');
  EXCEPTION WHEN others THEN INSERT INTO _r VALUES ('FAZ6_nonmember_copy_blocked', position('FORBIDDEN' in SQLERRM)>0, 'ok'); END;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',m1,'role','authenticated')::text, true);
  BEGIN PERFORM public.set_active_tactic(tk);
    INSERT INTO _r VALUES ('FAZ6_nonadmin_active_blocked', false, 'izin verdi');
  EXCEPTION WHEN others THEN INSERT INTO _r VALUES ('FAZ6_nonadmin_active_blocked', position('FORBIDDEN' in SQLERRM)>0, 'ok'); END;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',cap,'role','authenticated')::text, true);
  PERFORM public.set_active_tactic(tk);
  SELECT is_active INTO v_bool FROM public.tactics WHERE id=tk;
  INSERT INTO _r VALUES ('FAZ6_captain_sets_active', v_bool, 'active='||v_bool);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',m1,'role','authenticated')::text, true);
  v_bool := public.toggle_tactic_favorite(tk);
  INSERT INTO _r VALUES ('FAZ6_favorite_toggle', v_bool, 'fav='||v_bool);
  PERFORM public.comment_tactic(tk,'Güzel taktik');
  v_new := public.copy_tactic(tk, NULL);
  SELECT status INTO v_txt FROM public.tactics WHERE id=v_new;
  INSERT INTO _r VALUES ('FAZ6_copy_proposes_pending', v_txt='PENDING_APPROVAL', 'status='||v_txt);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',cap,'role','authenticated')::text, true);
  j := public.get_team_tactics_showcase(T);
  INSERT INTO _r VALUES ('FAZ6_showcase_lists_tactics', jsonb_array_length(j) >= 2, 'len='||jsonb_array_length(j));

  -- ── Takım yönetimi ──
  PERFORM public.transfer_captaincy(T, m1);
  SELECT captain_id INTO v_txt FROM public.teams WHERE id=T;
  INSERT INTO _r VALUES ('FAZ6_transfer_captaincy', v_txt=m1::text, 'captain='||v_txt);

  -- ── Takım-vs-takım skor onayı ──
  INSERT INTO public.matches(id,title,status,slots,"awaySlots","creatorId",captain_id,"homeTeamId","awayTeamId",starts_at,date)
    VALUES (ms,'TakimMac','ACTIVE',
      jsonb_build_array(jsonb_build_object('status','TAKEN','player',jsonb_build_object('id',p1,'paymentStatus','PAID'))),
      jsonb_build_array(jsonb_build_object('status','TAKEN','player',jsonb_build_object('id',p2,'paymentStatus','PAID'))),
      p1,p1,Ta,Tb,now()+interval '2 hours','2026-07-01');
  PERFORM set_config('request.jwt.claims', json_build_object('sub',p1,'role','authenticated')::text, true);
  j := public.propose_match_score(ms,3,1); v_prop:=(j->>'proposal_id')::uuid;
  INSERT INTO _r VALUES ('FAZ6_propose_needs_all', j->>'status'='PENDING' AND (j->>'needed')::int=2, j::text);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',p2,'role','authenticated')::text, true);
  j := public.approve_match_score(v_prop);
  INSERT INTO _r VALUES ('FAZ6_all_approve_finalizes', j->>'status'='APPROVED' AND (j->>'finalized')::bool, j::text);
  SELECT wins INTO n FROM public.teams WHERE id=Ta;
  INSERT INTO _r VALUES ('FAZ6_home_team_win', n=1, 'Ta.wins='||n);
  SELECT losses INTO n FROM public.teams WHERE id=Tb;
  INSERT INTO _r VALUES ('FAZ6_away_team_loss', n=1, 'Tb.losses='||n);
  SELECT "homeScore" INTO n FROM public.matches WHERE id=ms;
  INSERT INTO _r VALUES ('FAZ6_match_score_written', n=3, 'homeScore='||n);
  -- Idempotency: skor tekrar finalize edilse takım W/L çift artmaz
  PERFORM public._finalize_team_match_score(ms, 3, 1);
  SELECT wins INTO n FROM public.teams WHERE id=Ta;
  INSERT INTO _r VALUES ('FAZ6_finalize_idempotent', n=1, 'Ta.wins='||n);
  BEGIN PERFORM public.approve_match_score(v_prop);
    INSERT INTO _r VALUES ('FAZ6_reapprove_blocked', false, 'izin verdi');
  EXCEPTION WHEN others THEN INSERT INTO _r VALUES ('FAZ6_reapprove_blocked', position('INVALID_STATE' in SQLERRM)>0, 'ok'); END;
END $$;
SELECT test, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, got FROM _r ORDER BY test;
ROLLBACK;
