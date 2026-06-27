-- ============================================================================
-- FAZ 7 — Güvenlik · Bildirim · Altyapı uçtan uca testi
-- set_active_role (çoklu rol geçişi) · get_nearby_matches (earthdistance) ·
-- admin_override_match_score (audit'li) · send_match_reminders (1s/24s + idempotency)
-- İzole: BEGIN/ROLLBACK. auth.uid() set_config ile taklit edilir.
--
-- > Bu testin yakaladığı GERÇEK üretim hataları (uygulamadan önce giderildi):
-- >  (1) protect_profile_sensitive_fields trigger'ı NEW.role değişimini her
-- >      non-admin için RAISE ediyor ve app.bypass_role_protection bayrağını
-- >      ONURLANDIRMIYORDU → set_active_role her normal kullanıcıda çöküyordu
-- >      (Faz 5 rating_recompute ile aynı sınıf). Yalnız `role` alanı için bypass
-- >      tanınarak düzeltildi (roles/is_admin/wallet/ban korumaları aynen sürer).
-- >  (2) admin_override_match_score → log_admin_action'a 3. argümanı p_match_id::text
-- >      (uuid beklenen p_target_id'ye text) geçiriyordu → çalışma anında tip
-- >      uyuşmazlığıyla çöküyordu. p_target_id=uuid + old/new jsonb ile düzeltildi.
-- ============================================================================
BEGIN;
CREATE TEMP TABLE _r(test text, ok boolean, got text) ON COMMIT DROP;
DO $$
DECLARE
  mr  uuid := 'a7000000-0000-0000-0000-0000000000a1'; -- çoklu rol (PLAYER+GOALKEEPER)
  adm uuid := 'a7000000-0000-0000-0000-0000000000a2'; -- platform admin
  pl  uuid := 'a7000000-0000-0000-0000-0000000000a3'; -- düz oyuncu
  p1  uuid := 'a7000000-0000-0000-0000-0000000000e1';
  p2  uuid := 'a7000000-0000-0000-0000-0000000000e2';
  pnear uuid := 'a7000000-0000-0000-0000-0000000000c1';
  pfar  uuid := 'a7000000-0000-0000-0000-0000000000c2';
  m_near uuid := 'a7000000-0000-0000-0000-0000000000d1';
  m_far  uuid := 'a7000000-0000-0000-0000-0000000000d2';
  m_priv uuid := 'a7000000-0000-0000-0000-0000000000d3';
  m_rem  uuid := 'a7000000-0000-0000-0000-0000000000d4';
  m_score uuid := 'a7000000-0000-0000-0000-0000000000d5';
  j jsonb; n int; v_cnt int; v_flag boolean; v_ids uuid[]; v_txt text;
BEGIN
  -- ── setup (auth.uid() NULL → protect trigger'ları bypass) ──
  INSERT INTO auth.users(id) VALUES (mr),(adm),(pl),(p1),(p2);
  UPDATE public.profiles SET roles='["PLAYER","GOALKEEPER"]'::jsonb, role='PLAYER' WHERE id=mr;
  UPDATE public.profiles SET is_admin=true WHERE id=adm;
  INSERT INTO public.pitches(id,name,address,latitude,longitude) VALUES
    (pnear,'YakınSaha','Kadıköy',41.0082,28.9784),
    (pfar,'UzakSaha','Ankara',39.9334,32.8597);
  INSERT INTO public.matches(id,title,status,visibility,pitch_id,starts_at,date) VALUES
    (m_near,'YakınMaç','ACTIVE','OPEN',pnear, now()+interval '3 hours','2026-07-01'),
    (m_far,'UzakMaç','ACTIVE','OPEN',pfar, now()+interval '3 hours','2026-07-01'),
    (m_priv,'ÖzelMaç','ACTIVE','PRIVATE',pnear, now()+interval '3 hours','2026-07-01');
  INSERT INTO public.matches(id,title,status,visibility,pitch_id,starts_at,date,slots,"awaySlots") VALUES
    (m_rem,'HatırlatMaç','ACTIVE','OPEN',pnear, now()+interval '45 minutes','2026-07-01',
      jsonb_build_array(jsonb_build_object('status','TAKEN','player',jsonb_build_object('id',p1,'paymentStatus','PAID'))),
      jsonb_build_array(jsonb_build_object('status','TAKEN','player',jsonb_build_object('id',p2,'paymentStatus','PAID'))));
  INSERT INTO public.matches(id,title,status,visibility,pitch_id,starts_at,date) VALUES
    (m_score,'SkorMaç','ACTIVE','OPEN',pnear, now()-interval '2 hours','2026-07-01');

  -- ════ 1) set_active_role — çoklu rol geçişi ════
  PERFORM set_config('request.jwt.claims', json_build_object('sub',mr,'role','authenticated')::text, true);
  v_txt := public.set_active_role('GOALKEEPER');
  SELECT role INTO v_txt FROM public.profiles WHERE id=mr;
  INSERT INTO _r VALUES ('FAZ7_role_switch_ok', v_txt='GOALKEEPER', 'role='||v_txt);
  BEGIN PERFORM public.set_active_role('OWNER');  -- sahip olunmayan rol
    INSERT INTO _r VALUES ('FAZ7_role_not_owned_blocked', false, 'izin verdi');
  EXCEPTION WHEN others THEN INSERT INTO _r VALUES ('FAZ7_role_not_owned_blocked', position('ROLE_NOT_OWNED' in SQLERRM)>0, 'ok'); END;
  BEGIN PERFORM public.set_active_role('WIZARD');  -- geçersiz rol
    INSERT INTO _r VALUES ('FAZ7_role_invalid_blocked', false, 'izin verdi');
  EXCEPTION WHEN others THEN INSERT INTO _r VALUES ('FAZ7_role_invalid_blocked', position('INVALID_ROLE' in SQLERRM)>0, 'ok'); END;

  -- ════ 2) get_nearby_matches — yakındaki açık maçlar ════
  PERFORM set_config('request.jwt.claims', json_build_object('sub',pl,'role','authenticated')::text, true);
  SELECT array_agg(id) INTO v_ids FROM public.get_nearby_matches(41.0082, 28.9784, 25);
  INSERT INTO _r VALUES ('FAZ7_nearby_includes_near', m_near = ANY(v_ids), 'near in set');
  INSERT INTO _r VALUES ('FAZ7_nearby_excludes_far', NOT (m_far = ANY(v_ids)), '~350km hariç');
  INSERT INTO _r VALUES ('FAZ7_nearby_excludes_private', NOT (m_priv = ANY(v_ids)), 'PRIVATE hariç');

  -- ════ 3) admin_override_match_score — audit'li skor düzeltme ════
  BEGIN PERFORM public.admin_override_match_score(m_score, 5, 2, 'hile');  -- pl admin değil
    INSERT INTO _r VALUES ('FAZ7_override_nonadmin_blocked', false, 'izin verdi');
  EXCEPTION WHEN others THEN INSERT INTO _r VALUES ('FAZ7_override_nonadmin_blocked', position('FORBIDDEN' in SQLERRM)>0, 'ok'); END;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  j := public.admin_override_match_score(m_score, 4, 1, 'düzeltme');
  SELECT "homeScore","awayScore" INTO n, v_cnt FROM public.matches WHERE id=m_score;
  INSERT INTO _r VALUES ('FAZ7_override_sets_score', n=4 AND v_cnt=1, 'skor='||n||'-'||v_cnt);
  SELECT count(*) INTO v_cnt FROM public.admin_audit_log WHERE action='MATCH_SCORE_OVERRIDE' AND target_id=m_score;
  INSERT INTO _r VALUES ('FAZ7_override_audited', v_cnt=1, 'audit='||v_cnt);
  BEGIN PERFORM public.admin_override_match_score(m_score, -1, 0, NULL);
    INSERT INTO _r VALUES ('FAZ7_override_negative_blocked', false, 'izin verdi');
  EXCEPTION WHEN others THEN INSERT INTO _r VALUES ('FAZ7_override_negative_blocked', position('INVALID_SCORE' in SQLERRM)>0, 'ok'); END;

  -- ════ 4) send_match_reminders — 1s hatırlatma + idempotency ════
  PERFORM set_config('request.jwt.claims', '', true);  -- service_role bağlamı
  j := public.send_match_reminders();
  SELECT count(*) INTO v_cnt FROM public.notifications WHERE match_id=m_rem AND type_key='MATCH_REMINDER';
  INSERT INTO _r VALUES ('FAZ7_reminder_notifies_participants', v_cnt=2, 'notif='||v_cnt);
  SELECT reminder_1h_sent INTO v_flag FROM public.matches WHERE id=m_rem;
  INSERT INTO _r VALUES ('FAZ7_reminder_flag_set', v_flag, '1h_sent='||v_flag);
  PERFORM public.send_match_reminders();  -- ikinci çağrı
  SELECT count(*) INTO v_cnt FROM public.notifications WHERE match_id=m_rem AND type_key='MATCH_REMINDER';
  INSERT INTO _r VALUES ('FAZ7_reminder_idempotent', v_cnt=2, 'notif tekrar='||v_cnt);
END $$;
SELECT test, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, got FROM _r ORDER BY test;
ROLLBACK;
