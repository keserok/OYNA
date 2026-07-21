-- ═══════════════════════════════════════════════════════════════════════════
-- BASELINE — yetki-hedefi fonksiyonlar A (canlı pg_get_functiondef, 2026-07-20)
-- 20260607095055/095450 bu fonksiyonlara REVOKE uygular ama CREATE'leri ya çok
-- sonra (materialize_subscriptions→20260706, cancel_subscription→20260727,
-- owner_has_entitlement→20260616) ya da hiçbir migration'da yok
-- (get_court_occupancy). Sonraki CREATE OR REPLACE'ler tarihteki gibi üzerine
-- yazar. ÜRETİMDE: birebir aynı tanım → etkisiz.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.cancel_subscription(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_pitch uuid;
BEGIN
  SELECT s.pitch_id INTO v_pitch FROM public.pitch_subscriptions s WHERE s.id = p_id;
  IF v_pitch IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF NOT public.can_manage_pitch(v_pitch) THEN
    RAISE EXCEPTION 'Yetkisiz: bu abonman size ait degil';
  END IF;
  UPDATE public.pitch_subscriptions SET status = 'CANCELLED' WHERE id = p_id;
  DELETE FROM public.pitch_bookings
   WHERE subscription_id = p_id AND booking_date >= CURRENT_DATE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.materialize_subscriptions(p_horizon_weeks integer DEFAULT 12, p_sub_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    sub RECORD;
    v_start DATE; v_end DATE; v_date DATE;
    v_created INT := 0;
    v_pitch uuid;
BEGIN
    IF p_sub_id IS NOT NULL THEN
        SELECT s.pitch_id INTO v_pitch FROM public.pitch_subscriptions s WHERE s.id = p_sub_id;
        IF v_pitch IS NULL OR NOT public.can_manage_pitch(v_pitch) THEN
            RAISE EXCEPTION 'Yetkisiz: bu abonman size ait degil';
        END IF;
    ELSE
        IF auth.uid() IS NOT NULL
           AND COALESCE((SELECT role FROM public.profiles WHERE id = auth.uid()), '') NOT IN ('ADMIN','SUPER_ADMIN') THEN
            RAISE EXCEPTION 'UNAUTHORIZED: Toplu abonelik işlemi yalnızca yöneticiler tarafından çalıştırılabilir.';
        END IF;
    END IF;

    FOR sub IN
        SELECT * FROM public.pitch_subscriptions
        WHERE status = 'ACTIVE' AND (p_sub_id IS NULL OR id = p_sub_id)
    LOOP
        v_start := GREATEST(COALESCE(sub.materialized_until + 1, sub.start_date), sub.start_date, CURRENT_DATE);
        v_end := CURRENT_DATE + (p_horizon_weeks * 7);
        IF sub.end_date IS NOT NULL AND COALESCE(sub.auto_renew, true) = false AND sub.end_date < v_end THEN
            v_end := sub.end_date;
        END IF;
        v_date := v_start;
        WHILE v_date <= v_end LOOP
            IF (EXTRACT(ISODOW FROM v_date)::INT - 1) = sub.weekday THEN
                BEGIN
                    INSERT INTO public.pitch_bookings
                        (pitch_id, court_id, subscription_id, source, booking_date, start_time, end_time,
                         status, title, customer_name, customer_phone, price, payment_status)
                    VALUES
                        (sub.pitch_id, sub.court_id, sub.id, 'SUBSCRIPTION', v_date, sub.start_time, sub.end_time,
                         'CONFIRMED', COALESCE(NULLIF(sub.customer_name, ''), 'Abonman'),
                         sub.customer_name, sub.customer_phone, sub.price, 'PENDING');
                    v_created := v_created + 1;
                EXCEPTION WHEN exclusion_violation THEN
                    NULL;
                END;
            END IF;
            v_date := v_date + 1;
        END LOOP;
        UPDATE public.pitch_subscriptions SET materialized_until = v_end WHERE id = sub.id;
    END LOOP;
    RETURN v_created;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_court_occupancy(p_court_id uuid, p_date date)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.owner_has_entitlement(p_feature text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_status TEXT; v_ent JSONB;
BEGIN
  SELECT status, entitlements INTO v_status, v_ent FROM public.owner_accounts WHERE owner_user_id = auth.uid();
  IF NOT FOUND THEN RETURN true; END IF;
  IF v_status IN ('suspended', 'cancelled') THEN RETURN false; END IF;
  IF p_feature = 'active' THEN RETURN v_status IN ('trialing', 'active', 'past_due'); END IF;
  RETURN COALESCE((v_ent ->> p_feature)::boolean, true);
END; $function$;
