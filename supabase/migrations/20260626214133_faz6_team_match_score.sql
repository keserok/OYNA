-- ==============================================================================
-- FAZ 6 — Takım-vs-Takım skor kaydı (oyuncu-hepsi-onaylar) · DB Temeli (2/2)
-- ------------------------------------------------------------------------------
-- 8.1/6: Kayıtlı takım maçında bir oyuncu skor önerir → TÜM katılımcılar onaylarsa
-- maç skoru kesinleşir ve İKİ takımın geçmişine (W/L + matchHistory) işlenir.
-- (Hakem skoru zaten Faz 5'te resmi; saha sahibi bildirimi hızlı takip.)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.match_score_proposals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id    uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  proposed_by uuid NOT NULL REFERENCES public.profiles(id),
  home_score  integer NOT NULL CHECK (home_score >= 0),
  away_score  integer NOT NULL CHECK (away_score >= 0),
  status      text NOT NULL DEFAULT 'PENDING'
                CHECK (status IN ('PENDING','APPROVED','REJECTED','SUPERSEDED')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_score_proposal_active
  ON public.match_score_proposals(match_id) WHERE status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_score_proposal_match ON public.match_score_proposals(match_id);

CREATE TABLE IF NOT EXISTS public.match_score_approvals (
  proposal_id uuid NOT NULL REFERENCES public.match_score_proposals(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (proposal_id, user_id)
);

ALTER TABLE public.match_score_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_score_approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants read score proposals" ON public.match_score_proposals;
CREATE POLICY "Participants read score proposals" ON public.match_score_proposals FOR SELECT TO authenticated
  USING (public._is_match_participant(match_id, (SELECT auth.uid())) OR public.is_platform_admin());
DROP POLICY IF EXISTS "Read score approvals" ON public.match_score_approvals;
CREATE POLICY "Read score approvals" ON public.match_score_approvals FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.match_score_proposals p WHERE p.id = proposal_id
           AND public._is_match_participant(p.match_id, (SELECT auth.uid()))) OR public.is_platform_admin());

-- Yardımcı: maçın katılımcı (TAKEN slot oyuncuları) id'leri
CREATE OR REPLACE FUNCTION public._match_participant_ids(p_match_id uuid)
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(array_agg(DISTINCT pid), '{}')
  FROM (
    SELECT (slot->'player'->>'id')::uuid AS pid
    FROM public.matches m
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(m.slots,'[]'::jsonb) || COALESCE(m."awaySlots",'[]'::jsonb)) AS slot
    WHERE m.id = p_match_id AND slot->>'status' = 'TAKEN' AND (slot->'player'->>'id') IS NOT NULL
  ) s;
$$;
REVOKE ALL ON FUNCTION public._match_participant_ids(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._match_participant_ids(uuid) TO authenticated, service_role;

-- Yardımcı (internal): skoru kesinleştir + iki takımın geçmişini güncelle
CREATE OR REPLACE FUNCTION public._finalize_team_match_score(p_match_id uuid, p_home int, p_away int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE m RECORD; v_home_res text; v_away_res text; v_date text; v_home_name text; v_away_name text;
BEGIN
  SELECT * INTO m FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  UPDATE public.matches SET
    "homeScore" = p_home, "awayScore" = p_away,
    "scoreEnteredAt" = now(),
    status = CASE WHEN status IN ('CONFIRMED','LIVE','ACTIVE') THEN 'COMPLETED' ELSE status END,
    is_successful = CASE WHEN cancel_reason IS NULL THEN true ELSE is_successful END
  WHERE id = p_match_id;

  -- Yalnız kayıtlı takım maçında (iki takım da var) takım geçmişi işlenir
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

-- RPC: skor öner (katılımcı). Mevcut PENDING varsa supersede; öneren otomatik onaylar.
CREATE OR REPLACE FUNCTION public.propose_match_score(p_match_id uuid, p_home int, p_away int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := auth.uid(); v_prop uuid; v_parts uuid[];
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_home < 0 OR p_away < 0 THEN RAISE EXCEPTION 'INVALID_SCORE'; END IF;
  IF NOT public._is_match_participant(p_match_id, v_uid) AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'NOT_PARTICIPANT: Yalniz maca katilanlar skor onerebilir.'; END IF;

  -- Önceki bekleyen öneriyi geçersiz kıl
  UPDATE public.match_score_proposals SET status='SUPERSEDED', resolved_at=now()
  WHERE match_id = p_match_id AND status='PENDING';

  INSERT INTO public.match_score_proposals (match_id, proposed_by, home_score, away_score)
  VALUES (p_match_id, v_uid, p_home, p_away) RETURNING id INTO v_prop;
  -- Öneren otomatik onaylar
  INSERT INTO public.match_score_approvals (proposal_id, user_id) VALUES (v_prop, v_uid)
  ON CONFLICT DO NOTHING;

  v_parts := public._match_participant_ids(p_match_id);
  -- Tek katılımcı varsa (veya yoksa) hemen kesinleşir
  IF array_length(v_parts,1) IS NULL OR array_length(v_parts,1) <= 1 THEN
    PERFORM public._finalize_team_match_score(p_match_id, p_home, p_away);
    UPDATE public.match_score_proposals SET status='APPROVED', resolved_at=now() WHERE id=v_prop;
    RETURN jsonb_build_object('proposal_id', v_prop, 'status', 'APPROVED', 'finalized', true);
  END IF;
  RETURN jsonb_build_object('proposal_id', v_prop, 'status', 'PENDING',
    'approvals', 1, 'needed', array_length(v_parts,1));
END; $$;
REVOKE ALL ON FUNCTION public.propose_match_score(uuid, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.propose_match_score(uuid, int, int) TO authenticated;

-- RPC: skoru onayla (katılımcı). Tüm katılımcılar onaylayınca kesinleşir.
CREATE OR REPLACE FUNCTION public.approve_match_score(p_proposal_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := auth.uid(); p public.match_score_proposals; v_parts uuid[]; v_approvals int; v_needed int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT * INTO p FROM public.match_score_proposals WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF p.status <> 'PENDING' THEN RAISE EXCEPTION 'INVALID_STATE: Oneri % durumunda.', p.status; END IF;
  IF NOT public._is_match_participant(p.match_id, v_uid) THEN
    RAISE EXCEPTION 'NOT_PARTICIPANT: Yalniz maca katilanlar onaylayabilir.'; END IF;

  INSERT INTO public.match_score_approvals (proposal_id, user_id) VALUES (p_proposal_id, v_uid)
  ON CONFLICT DO NOTHING;

  v_parts := public._match_participant_ids(p.match_id);
  v_needed := COALESCE(array_length(v_parts,1), 1);
  SELECT count(DISTINCT a.user_id) INTO v_approvals
  FROM public.match_score_approvals a WHERE a.proposal_id = p_proposal_id
    AND a.user_id = ANY(v_parts);

  IF v_approvals >= v_needed THEN
    PERFORM public._finalize_team_match_score(p.match_id, p.home_score, p.away_score);
    UPDATE public.match_score_proposals SET status='APPROVED', resolved_at=now() WHERE id=p_proposal_id;
    RETURN jsonb_build_object('proposal_id', p_proposal_id, 'status', 'APPROVED', 'finalized', true);
  END IF;
  RETURN jsonb_build_object('proposal_id', p_proposal_id, 'status', 'PENDING',
    'approvals', v_approvals, 'needed', v_needed);
END; $$;
REVOKE ALL ON FUNCTION public.approve_match_score(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_match_score(uuid) TO authenticated;
