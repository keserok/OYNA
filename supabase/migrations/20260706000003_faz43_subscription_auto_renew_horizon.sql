-- FAZ 4.3 — Abonelik otomatik yenileme: materialize_subscriptions artık auto_renew'i onurlandırır.
-- auto_renew=true (varsayılan): end_date geçilse bile üretim 12 haftalık ufka kadar sürer (kendiliğinden uzar).
-- auto_renew=false: üretim end_date'te durur. PAUSED/CANCELLED abonelikler zaten işlenmez (status='ACTIVE' filtresi).
-- NOT: Otomatik üretim çekirdeği (materialize_subscriptions + materialize_subs_daily cron'u) zaten
-- mevcuttu; bu migration yalnız auto_renew davranışını ekler (önceki sürümde end_date her zaman üst sınırdı).
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
BEGIN
    IF p_sub_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.pitch_subscriptions s
            JOIN public.pitches p ON p.id = s.pitch_id
            WHERE s.id = p_sub_id
              AND (p.owner_id = auth.uid()
                   OR (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('ADMIN', 'SUPER_ADMIN'))
        ) THEN
            RAISE EXCEPTION 'Yetkisiz: bu abonman size ait degil';
        END IF;
    ELSE
        -- TOPLU İŞLEM: yalnızca admin veya sunucu tarafı
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
        -- auto_renew=false ise end_date'te dur; true (varsayılan) ise ufka kadar üret (kendiliğinden uzar)
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
