-- ÜRETİMDEN GERİ ÇEKİLDİ (defter sapması onarımı, 2026-07-28)
-- MAÇ KUR inceleme düzeltmeleri — Bölüm A
UPDATE public.courts
   SET max_capacity = GREATEST(COALESCE(max_capacity, 0), min_capacity)
 WHERE min_capacity IS NOT NULL AND max_capacity IS NOT NULL
   AND min_capacity > max_capacity;

CREATE OR REPLACE FUNCTION public.get_court_day_quote(p_court_id uuid, p_date date)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_wh jsonb;
  v_found boolean := false;
  v_dur int;
  v_step int;
  v_today jsonb;
  v_open int; v_close int;
  v_hours int[] := '{}';
  v_night int[] := '{}';
  v_h int;
  v_out jsonb := '[]'::jsonb;
  v_q RECORD;
BEGIN
  SELECT p.working_hours, true INTO v_wh, v_found
  FROM public.courts c JOIN public.pitches p ON p.id = c.pitch_id
  WHERE c.id = p_court_id AND COALESCE(c.is_active, true);
  IF NOT v_found THEN
    RETURN jsonb_build_object('courtId', p_court_id, 'date', p_date, 'slotDuration', 60, 'hours', '[]'::jsonb);
  END IF;
  IF v_wh IS NULL THEN v_wh := '{"open":"09:00","close":"00:00"}'::jsonb; END IF;

  IF jsonb_typeof(v_wh) = 'array' THEN
    v_today := v_wh -> (EXTRACT(ISODOW FROM p_date)::int - 1);
    v_dur   := 60;
  ELSE
    v_today := v_wh;
    v_dur   := COALESCE((v_wh->>'slot_duration')::int, 60);
  END IF;
  v_step := GREATEST(1, CEIL(v_dur / 60.0)::int);

  IF v_today IS NOT NULL AND NOT COALESCE((v_today->>'closed')::boolean, false) THEN
    v_open  := COALESCE(split_part(v_today->>'open', ':', 1)::int, 9);
    v_close := COALESCE(split_part(v_today->>'close', ':', 1)::int, 0);
    v_h := v_open;
    WHILE v_h <= LEAST(CASE WHEN v_close = 0 OR v_close <= v_open THEN 24 ELSE v_close END, 24) - 1 LOOP
      v_hours := v_hours || v_h;
      v_h := v_h + v_step;
    END LOOP;
    IF v_close > 0 AND v_close < v_open THEN
      v_h := 0;
      WHILE v_h <= LEAST(v_close, 6) - 1 LOOP
        v_night := v_night || v_h;
        v_h := v_h + v_step;
      END LOOP;
    END IF;
  END IF;

  FOREACH v_h IN ARRAY (v_hours || v_night) LOOP
    SELECT * INTO v_q FROM public._resolve_court_quote(p_court_id, p_date, make_time(v_h, 0, 0));
    v_out := v_out || jsonb_build_object(
      'time', to_char(make_time(v_h, 0, 0), 'HH24:MI'),
      'night', v_h = ANY(v_night),
      'tariffOk', v_q.tariff_id IS NOT NULL,
      'total', v_q.total,
      'basePrice', v_q.base_price,
      'deal', v_q.deal_id IS NOT NULL,
      'deposit', v_q.deposit
    );
  END LOOP;

  RETURN jsonb_build_object('courtId', p_court_id, 'date', p_date, 'slotDuration', v_dur, 'hours', v_out);
END;
$$;

REVOKE ALL ON FUNCTION public.get_court_day_quote(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_court_day_quote(uuid, date) TO authenticated;
