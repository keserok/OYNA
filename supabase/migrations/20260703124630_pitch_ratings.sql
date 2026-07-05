ALTER TABLE public.pitches ADD COLUMN IF NOT EXISTS rating_count integer DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.pitch_ratings (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  pitch_id   uuid NOT NULL REFERENCES public.pitches(id) ON DELETE CASCADE,
  match_id   uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  rater_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  score      integer NOT NULL CHECK (score BETWEEN 1 AND 5),
  tags       text[] DEFAULT '{}',
  comment    text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (match_id, rater_id)
);
CREATE INDEX IF NOT EXISTS idx_pitch_ratings_pitch ON public.pitch_ratings(pitch_id);

ALTER TABLE public.pitch_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read pitch_ratings" ON public.pitch_ratings;
CREATE POLICY "Anyone can read pitch_ratings" ON public.pitch_ratings FOR SELECT
USING (true);

CREATE OR REPLACE FUNCTION public._recompute_pitch_rating(p_pitch_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_avg numeric; v_cnt integer;
BEGIN
  SELECT round(avg(score)::numeric, 2), count(*) INTO v_avg, v_cnt
  FROM public.pitch_ratings WHERE pitch_id = p_pitch_id;
  IF v_avg IS NULL THEN RETURN; END IF;
  UPDATE public.pitches SET rating = v_avg, rating_count = v_cnt WHERE id = p_pitch_id;
END;
$$;
REVOKE ALL ON FUNCTION public._recompute_pitch_rating(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._recompute_pitch_rating(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.submit_pitch_rating(
  p_match_id uuid,
  p_score    integer,
  p_tags     text[] DEFAULT '{}',
  p_comment  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_pitch uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF NOT public._is_match_participant(p_match_id, v_uid) AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'NOT_PARTICIPANT: Yalniz maca katilanlar sahayi degerlendirebilir.';
  END IF;

  SELECT pitch_id INTO v_pitch FROM public.matches WHERE id = p_match_id;
  IF v_pitch IS NULL THEN RAISE EXCEPTION 'NO_PITCH: Maca bagli saha yok.'; END IF;

  INSERT INTO public.pitch_ratings (pitch_id, match_id, rater_id, score, tags, comment)
  VALUES (v_pitch, p_match_id, v_uid, LEAST(5, GREATEST(1, p_score)), COALESCE(p_tags, '{}'), p_comment)
  ON CONFLICT (match_id, rater_id) DO UPDATE SET
    score = EXCLUDED.score, tags = EXCLUDED.tags, comment = EXCLUDED.comment;

  PERFORM public._recompute_pitch_rating(v_pitch);

  RETURN jsonb_build_object('pitch_id', v_pitch, 'match_id', p_match_id, 'score', p_score);
END;
$$;
REVOKE ALL ON FUNCTION public.submit_pitch_rating(uuid, integer, text[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_pitch_rating(uuid, integer, text[], text) TO authenticated;