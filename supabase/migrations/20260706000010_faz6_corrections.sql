-- ==============================================================================
-- FAZ 6 — Düzeltmeler (adversarial denetim bulguları)
-- ------------------------------------------------------------------------------
-- KRİTİK 1: skor finalize idempotent değildi + tek-katılımcı kısa yolu takım
--   maçında istismar ediliyordu → idempotency + iki-taraf onayı şartı
-- YÜKSEK 2: copy_tactic kaynak okuma yetkisi yoktu → kaynak üyeliği şartı
-- ORTA 3: teams.captains/captain/matchHistory savunmacı kolonlar (fresh deploy)
-- ORTA 4: tactics_select RLS is_active filtresi yoktu → ayrılan üye okuyabiliyordu
-- ORTA 5: doğrudan UPDATE ile is_active set edilip "yalnız yönetici" atlatılıyordu
-- DÜŞÜK 6: leave_team primary kaptan ayrılınca captain_id NULL kalıyordu → otomatik devir
-- ==============================================================================

-- ── 3. teams savunmacı kolonlar (canlıda var; fresh deploy/CI için) ──────────
ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS captains jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS captain uuid,
  ADD COLUMN IF NOT EXISTS "matchHistory" jsonb DEFAULT '[]'::jsonb;

-- ── KRİTİK 1a: _finalize_team_match_score — idempotency (çift W/L önle) ──────
CREATE OR REPLACE FUNCTION public._finalize_team_match_score(p_match_id uuid, p_home int, p_away int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE m RECORD; v_home_res text; v_away_res text; v_date text; v_home_name text; v_away_name text;
BEGIN
  SELECT * INTO m FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  -- Zaten kesinleşmişse tekrar W/L yazma (idempotent)
  IF m."scoreEnteredAt" IS NOT NULL THEN RETURN; END IF;

  UPDATE public.matches SET
    "homeScore" = p_home, "awayScore" = p_away, "scoreEnteredAt" = now(),
    status = CASE WHEN status IN ('CONFIRMED','LIVE','ACTIVE') THEN 'COMPLETED' ELSE status END,
    is_successful = CASE WHEN cancel_reason IS NULL THEN true ELSE is_successful END
  WHERE id = p_match_id;

  IF m."homeTeamId" IS NOT NULL AND m."awayTeamId" IS NOT NULL THEN
    v_home_res := CASE WHEN p_home > p_away THEN 'WIN' WHEN p_home < p_away THEN 'LOSS' ELSE 'DRAW' END;
    v_away_res := CASE WHEN p_away > p_home THEN 'WIN' WHEN p_away < p_home THEN 'LOSS' ELSE 'DRAW' END;
    v_date := COALESCE(m.date, to_char(now(),'YYYY-MM-DD'));
    SELECT name INTO v_home_name FROM public.teams WHERE id = m."homeTeamId";
    SELECT name INTO v_away_name FROM public.teams WHERE id = m."awayTeamId";
    UPDATE public.teams SET
      wins = COALESCE(wins,0) + CASE WHEN v_home_res='WIN' THEN 1 ELSE 0 END,
      losses = COALESCE(losses,0) + CASE WHEN v_home_res='LOSS' THEN 1 ELSE 0 END,
      "matchHistory" = COALESCE("matchHistory",'[]'::jsonb) || jsonb_build_array(
        jsonb_build_object('matchId',p_match_id,'opponent',v_away_name,'score',p_home||'-'||p_away,'result',v_home_res,'date',v_date))
    WHERE id = m."homeTeamId";
    UPDATE public.teams SET
      wins = COALESCE(wins,0) + CASE WHEN v_away_res='WIN' THEN 1 ELSE 0 END,
      losses = COALESCE(losses,0) + CASE WHEN v_away_res='LOSS' THEN 1 ELSE 0 END,
      "matchHistory" = COALESCE("matchHistory",'[]'::jsonb) || jsonb_build_array(
        jsonb_build_object('matchId',p_match_id,'opponent',v_home_name,'score',p_away||'-'||p_home,'result',v_away_res,'date',v_date))
    WHERE id = m."awayTeamId";
  END IF;
END; $$;
REVOKE ALL ON FUNCTION public._finalize_team_match_score(uuid, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._finalize_team_match_score(uuid, int, int) TO service_role;

-- Yardımcı: iki tarafın da katılımcısı var mı? (takım maçında tek-taraf istismarını önler)
CREATE OR REPLACE FUNCTION public._match_both_sides_present(p_match_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT (SELECT count(*) FROM public.matches m
            CROSS JOIN LATERAL jsonb_array_elements(COALESCE(m.slots,'[]'::jsonb)) s
            WHERE m.id = p_match_id AND s->>'status'='TAKEN') >= 1
     AND (SELECT count(*) FROM public.matches m
            CROSS JOIN LATERAL jsonb_array_elements(COALESCE(m."awaySlots",'[]'::jsonb)) s
            WHERE m.id = p_match_id AND s->>'status'='TAKEN') >= 1;
$$;
REVOKE ALL ON FUNCTION public._match_both_sides_present(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._match_both_sides_present(uuid) TO authenticated, service_role;

-- ── KRİTİK 1b: propose_match_score — anlık finalize yalnız TAKIM-DIŞI maçta ──
CREATE OR REPLACE FUNCTION public.propose_match_score(p_match_id uuid, p_home int, p_away int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := auth.uid(); v_prop uuid; v_parts uuid[]; v_is_team boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_home < 0 OR p_away < 0 THEN RAISE EXCEPTION 'INVALID_SCORE'; END IF;
  IF NOT public._is_match_participant(p_match_id, v_uid) AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'NOT_PARTICIPANT: Yalniz maca katilanlar skor onerebilir.'; END IF;
  SELECT ("homeTeamId" IS NOT NULL AND "awayTeamId" IS NOT NULL) INTO v_is_team FROM public.matches WHERE id = p_match_id;
  UPDATE public.match_score_proposals SET status='SUPERSEDED', resolved_at=now()
  WHERE match_id = p_match_id AND status='PENDING';
  INSERT INTO public.match_score_proposals (match_id, proposed_by, home_score, away_score)
  VALUES (p_match_id, v_uid, p_home, p_away) RETURNING id INTO v_prop;
  INSERT INTO public.match_score_approvals (proposal_id, user_id) VALUES (v_prop, v_uid) ON CONFLICT DO NOTHING;
  v_parts := public._match_participant_ids(p_match_id);
  -- Anlık kesinleşme YALNIZ takım-dışı (pickup) maçta + tek katılımcıda
  IF NOT v_is_team AND (array_length(v_parts,1) IS NULL OR array_length(v_parts,1) <= 1) THEN
    PERFORM public._finalize_team_match_score(p_match_id, p_home, p_away);
    UPDATE public.match_score_proposals SET status='APPROVED', resolved_at=now() WHERE id=v_prop;
    RETURN jsonb_build_object('proposal_id', v_prop, 'status', 'APPROVED', 'finalized', true);
  END IF;
  RETURN jsonb_build_object('proposal_id', v_prop, 'status', 'PENDING', 'approvals', 1,
    'needed', GREATEST(COALESCE(array_length(v_parts,1),1), CASE WHEN v_is_team THEN 2 ELSE 1 END));
END; $$;
REVOKE ALL ON FUNCTION public.propose_match_score(uuid, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.propose_match_score(uuid, int, int) TO authenticated;

-- ── KRİTİK 1c: approve_match_score — takım maçında iki taraf + tüm katılımcı ──
CREATE OR REPLACE FUNCTION public.approve_match_score(p_proposal_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := auth.uid(); p public.match_score_proposals; v_parts uuid[]; v_approvals int; v_needed int; v_is_team boolean; v_both boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT * INTO p FROM public.match_score_proposals WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF p.status <> 'PENDING' THEN RAISE EXCEPTION 'INVALID_STATE: Oneri % durumunda.', p.status; END IF;
  IF NOT public._is_match_participant(p.match_id, v_uid) THEN
    RAISE EXCEPTION 'NOT_PARTICIPANT: Yalniz maca katilanlar onaylayabilir.'; END IF;
  INSERT INTO public.match_score_approvals (proposal_id, user_id) VALUES (p_proposal_id, v_uid) ON CONFLICT DO NOTHING;
  SELECT ("homeTeamId" IS NOT NULL AND "awayTeamId" IS NOT NULL) INTO v_is_team FROM public.matches WHERE id = p.match_id;
  v_parts := public._match_participant_ids(p.match_id);
  v_needed := COALESCE(array_length(v_parts,1), 1);
  SELECT count(DISTINCT a.user_id) INTO v_approvals
  FROM public.match_score_approvals a WHERE a.proposal_id = p_proposal_id AND a.user_id = ANY(v_parts);
  v_both := public._match_both_sides_present(p.match_id);
  -- Takım maçında: her iki tarafın katılımcısı olmalı VE tüm katılımcılar onaylamalı (en az 2)
  IF v_approvals >= v_needed AND (NOT v_is_team OR (v_both AND v_needed >= 2)) THEN
    PERFORM public._finalize_team_match_score(p.match_id, p.home_score, p.away_score);
    UPDATE public.match_score_proposals SET status='APPROVED', resolved_at=now() WHERE id=p_proposal_id;
    RETURN jsonb_build_object('proposal_id', p_proposal_id, 'status', 'APPROVED', 'finalized', true);
  END IF;
  RETURN jsonb_build_object('proposal_id', p_proposal_id, 'status', 'PENDING', 'approvals', v_approvals, 'needed', v_needed);
END; $$;
REVOKE ALL ON FUNCTION public.approve_match_score(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_match_score(uuid) TO authenticated;

-- ── YÜKSEK 2: copy_tactic — kaynak taktik okuma yetkisi şartı ────────────────
CREATE OR REPLACE FUNCTION public.copy_tactic(p_tactic_id uuid, p_team_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := auth.uid(); src public.tactics; v_target uuid; v_new uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT * INTO src FROM public.tactics WHERE id = p_tactic_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  -- Kaynağa erişim: sahibi veya kaynağın takım üyesi olmalı (gizli taktik sızıntısını önler)
  IF NOT (src."userId" = v_uid OR (src."teamId" IS NOT NULL AND public._is_team_member(src."teamId", v_uid))) THEN
    RAISE EXCEPTION 'FORBIDDEN_SOURCE: Bu taktige erisimin yok.'; END IF;
  v_target := COALESCE(p_team_id, src."teamId");
  IF v_target IS NULL OR NOT public._is_team_member(v_target, v_uid) THEN
    RAISE EXCEPTION 'FORBIDDEN: Hedef takim uyesi degilsin.'; END IF;
  INSERT INTO public.tactics ("userId","teamId", name, "teamName", size, formation, slots, subs, notes,
    opponents, mentality, tempo, identity, drawings, status, "proposedBy", priority, is_active, "createdAt","updatedAt")
  SELECT v_uid, v_target, COALESCE(src.name,'Taktik')||' (kopya)', src."teamName", src.size, src.formation,
    src.slots, src.subs, src.notes, src.opponents, src.mentality, src.tempo, src.identity, src.drawings,
    'PENDING_APPROVAL', v_uid, 0, false, now(), now()
  RETURNING id INTO v_new;
  RETURN v_new;
END; $$;
REVOKE ALL ON FUNCTION public.copy_tactic(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.copy_tactic(uuid, uuid) TO authenticated;

-- ── DÜŞÜK 6: leave_team — primary kaptan ayrılınca otomatik devir ────────────
CREATE OR REPLACE FUNCTION public.leave_team(p_team_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := auth.uid(); v_caps jsonb; v_primary uuid; v_active_members int; v_remaining_admins int; v_next uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT COALESCE(captains,'[]'::jsonb), captain_id INTO v_caps, v_primary FROM public.teams WHERE id = p_team_id;
  IF v_caps IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  UPDATE public.team_members SET is_active = false WHERE team_id = p_team_id AND user_id = v_uid;
  IF v_caps ? v_uid::text THEN
    v_caps := (SELECT COALESCE(jsonb_agg(x),'[]'::jsonb) FROM jsonb_array_elements_text(v_caps) x WHERE x <> v_uid::text);
    -- Primary kaptan ayrılıyorsa kalan ilk yöneticiye otomatik devret
    v_next := CASE WHEN v_primary = v_uid AND jsonb_array_length(v_caps) > 0
                   THEN (v_caps->>0)::uuid ELSE NULL END;
    UPDATE public.teams SET captains = v_caps,
      captain_id = CASE WHEN captain_id = v_uid THEN v_next ELSE captain_id END,
      captain    = CASE WHEN captain = v_uid THEN v_next ELSE captain END
    WHERE id = p_team_id;
  END IF;
  SELECT count(*) INTO v_active_members FROM public.team_members WHERE team_id = p_team_id AND is_active = true;
  SELECT jsonb_array_length(COALESCE(captains,'[]'::jsonb)) INTO v_remaining_admins FROM public.teams WHERE id = p_team_id;
  IF v_remaining_admins = 0 OR v_active_members = 0 THEN
    UPDATE public.teams SET is_archived = true, archived_at = now() WHERE id = p_team_id;
    RETURN jsonb_build_object('team_id', p_team_id, 'archived', true);
  END IF;
  RETURN jsonb_build_object('team_id', p_team_id, 'archived', false);
END; $$;
REVOKE ALL ON FUNCTION public.leave_team(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_team(uuid) TO authenticated;

-- ── ORTA 4: tactics_select — yalnız AKTİF üye (ayrılan üye sızıntısı kapat) ──
DROP POLICY IF EXISTS tactics_select ON public.tactics;
CREATE POLICY tactics_select ON public.tactics FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = "userId"
      OR (("teamId" IS NOT NULL) AND public._is_team_member("teamId", (SELECT auth.uid())))
      OR public.is_platform_admin());

-- ── ORTA 5: is_active doğrudan UPDATE/INSERT ile set edilemesin (yalnız RPC) ─
CREATE OR REPLACE FUNCTION public.protect_tactic_active()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF current_setting('app.tactic_mgmt', true) = 'true' OR public.is_platform_admin() THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.is_active := false;          -- istemci INSERT'i aktif taktik oluşturamaz
  ELSIF TG_OP = 'UPDATE' AND NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    NEW.is_active := OLD.is_active;  -- istemci UPDATE'i is_active değiştiremez
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_protect_tactic_active ON public.tactics;
CREATE TRIGGER trg_protect_tactic_active
  BEFORE INSERT OR UPDATE ON public.tactics
  FOR EACH ROW EXECUTE FUNCTION public.protect_tactic_active();

-- set_active_tactic: trigger bypass bayrağı ile (yalnız bu RPC is_active set eder)
CREATE OR REPLACE FUNCTION public.set_active_tactic(p_tactic_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := auth.uid(); v_team uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT "teamId" INTO v_team FROM public.tactics WHERE id = p_tactic_id;
  IF v_team IS NULL THEN RAISE EXCEPTION 'NOT_TEAM_TACTIC'; END IF;
  IF NOT public._is_team_admin(v_team, v_uid) THEN RAISE EXCEPTION 'FORBIDDEN: Yalniz takim yoneticisi.'; END IF;
  PERFORM set_config('app.tactic_mgmt', 'true', true);
  UPDATE public.tactics SET is_active = false WHERE "teamId" = v_team AND is_active = true;
  UPDATE public.tactics SET is_active = true, status = 'APPROVED' WHERE id = p_tactic_id;
  PERFORM set_config('app.tactic_mgmt', 'false', true);
END; $$;
REVOKE ALL ON FUNCTION public.set_active_tactic(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_active_tactic(uuid) TO authenticated;

-- Trigger fonksiyonu yalnız trigger bağlamında çalışır; doğrudan RPC çağrısına kapat
REVOKE ALL ON FUNCTION public.protect_tactic_active() FROM PUBLIC, anon, authenticated;
