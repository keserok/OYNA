-- [DB GEÇMİŞİNDEN KURTARILDI 2026-07-11] Bu migration canlı veritabanına uygulanmıştı ancak repoda dosyası yoktu; supabase_migrations.schema_migrations.statements kolonundan geri çıkarıldı.

-- get_court_occupancy → SECURITY DEFINER (Faz 2 oyuncu tarafı RLS'siz doluluk okuyabilsin; yalnız int döner)
CREATE OR REPLACE FUNCTION public.get_court_occupancy(p_court_id UUID, p_date DATE)
RETURNS INT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_pitch_id UUID;
    v_open TIME; v_close TIME; v_slot INT;
    v_open_m INT; v_close_m INT; v_span INT;
    v_busy_m NUMERIC;
BEGIN
    SELECT pitch_id INTO v_pitch_id FROM public.courts WHERE id = p_court_id;
    IF v_pitch_id IS NULL THEN RETURN 0; END IF;

    SELECT COALESCE((working_hours->>'open')::TIME, TIME '10:00'),
           COALESCE((working_hours->>'close')::TIME, TIME '02:00'),
           COALESCE((working_hours->>'slot_duration')::INT, 60)
      INTO v_open, v_close, v_slot
      FROM public.pitches WHERE id = v_pitch_id;

    v_open_m  := EXTRACT(HOUR FROM v_open) * 60  + EXTRACT(MINUTE FROM v_open);
    v_close_m := EXTRACT(HOUR FROM v_close) * 60 + EXTRACT(MINUTE FROM v_close);
    IF v_close_m <= v_open_m THEN v_close_m := v_close_m + 1440; END IF;
    v_span := v_close_m - v_open_m;
    IF v_span <= 0 THEN RETURN 0; END IF;

    SELECT COALESCE(SUM(
        CASE WHEN end_time <= start_time
             THEN (EXTRACT(HOUR FROM end_time)*60 + EXTRACT(MINUTE FROM end_time) + 1440)
                - (EXTRACT(HOUR FROM start_time)*60 + EXTRACT(MINUTE FROM start_time))
             ELSE (EXTRACT(HOUR FROM end_time)*60 + EXTRACT(MINUTE FROM end_time))
                - (EXTRACT(HOUR FROM start_time)*60 + EXTRACT(MINUTE FROM start_time))
        END
    ), 0)
      INTO v_busy_m
      FROM public.pitch_bookings
     WHERE court_id = p_court_id AND booking_date = p_date AND status <> 'CANCELLED';

    RETURN LEAST(ROUND(v_busy_m / v_span * 100)::INT, 100);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_court_occupancy(UUID, DATE) TO anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.materialize_subscriptions(INT, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_subscription(UUID) FROM PUBLIC;
