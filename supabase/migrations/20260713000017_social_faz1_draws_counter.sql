-- ================================================================
-- SOSYAL AŞAMA 1.17 — draws sayacı skor kesinleştirmeye bağlanır
-- (000013 başlığındaki bilinçli erteleme kapanıyor.)
-- teams.draws 000009'da eklendi ama _finalize_team_match_score yalnız
-- wins/losses artırıyordu; beraberlik sayaçta kayboluyordu (dürüst
-- veri ilkesi ihlali). Fonksiyon draws artışıyla yeniden yazılır;
-- gövdenin kalanı 20260706000009 ile birebir aynıdır.
-- ================================================================

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
      wins   = COALESCE(wins,0)   + CASE WHEN v_home_res='WIN'  THEN 1 ELSE 0 END,
      draws  = COALESCE(draws,0)  + CASE WHEN v_home_res='DRAW' THEN 1 ELSE 0 END,
      losses = COALESCE(losses,0) + CASE WHEN v_home_res='LOSS' THEN 1 ELSE 0 END,
      "matchHistory" = COALESCE("matchHistory",'[]'::jsonb) || jsonb_build_array(
        jsonb_build_object('matchId',p_match_id,'opponent',v_away_name,'score',p_home||'-'||p_away,'result',v_home_res,'date',v_date))
    WHERE id = m."homeTeamId";

    UPDATE public.teams SET
      wins   = COALESCE(wins,0)   + CASE WHEN v_away_res='WIN'  THEN 1 ELSE 0 END,
      draws  = COALESCE(draws,0)  + CASE WHEN v_away_res='DRAW' THEN 1 ELSE 0 END,
      losses = COALESCE(losses,0) + CASE WHEN v_away_res='LOSS' THEN 1 ELSE 0 END,
      "matchHistory" = COALESCE("matchHistory",'[]'::jsonb) || jsonb_build_array(
        jsonb_build_object('matchId',p_match_id,'opponent',v_home_name,'score',p_away||'-'||p_home,'result',v_away_res,'date',v_date))
    WHERE id = m."awayTeamId";
  END IF;
END; $$;
