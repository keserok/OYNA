-- [DB GEÇMİŞİNDEN KURTARILDI 2026-07-11] Bu migration canlı veritabanına uygulanmıştı ancak repoda dosyası yoktu; supabase_migrations.schema_migrations.statements kolonundan geri çıkarıldı.

-- BLOK 1: Kalan fonksiyonların güvenliği

-- 1) send_match_invite: kimlik kontrolü eklendi
-- Gönderen, işlemi yapan kişinin kendisi olmak zorunda (veya admin/sunucu).
CREATE OR REPLACE FUNCTION public.send_match_invite(p_match_id uuid, p_target_user_id uuid, p_sender_id uuid, p_team_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_match_date TEXT;
  v_location TEXT;
  v_sender_name TEXT;
  v_team_name TEXT;
  v_template RECORD;
  v_type_key TEXT;
  v_vars JSONB;
  v_notification_id UUID;
BEGIN
  -- YETKİ KONTROLÜ: davet ancak kişinin kendi adına gönderilebilir
  IF auth.uid() IS NOT NULL
     AND auth.uid() <> p_sender_id
     AND COALESCE((SELECT role FROM public.profiles WHERE id = auth.uid()), '') NOT IN ('ADMIN','SUPER_ADMIN') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Başka bir kullanıcı adına davet gönderemezsiniz.';
  END IF;

  SELECT date, location
    INTO v_match_date, v_location
    FROM public.matches WHERE id = p_match_id;

  SELECT COALESCE(name, 'Bir Oyuncu')
    INTO v_sender_name
    FROM public.profiles WHERE id = p_sender_id;

  IF p_team_id IS NOT NULL THEN
    v_type_key := 'team_invite';
    SELECT name INTO v_team_name FROM public.teams WHERE id = p_team_id;
    v_vars := jsonb_build_object(
      'team_name', COALESCE(v_team_name, 'Takım'),
      'sender_name', v_sender_name,
      'match_date', COALESCE(v_match_date, 'Belirtilmedi'),
      'pitch_name', COALESCE(v_location, 'Saha')
    );
  ELSE
    v_type_key := 'match_invite';
    v_vars := jsonb_build_object(
      'sender_name', v_sender_name,
      'match_date', COALESCE(v_match_date, 'Belirtilmedi'),
      'pitch_name', COALESCE(v_location, 'Saha')
    );
  END IF;

  SELECT * INTO v_template
    FROM public.notification_templates WHERE type_key = v_type_key;

  INSERT INTO public.notifications
    (user_id, title, body, type, type_key, match_id, team_id, sender_id,
     action_required, deep_link, is_read, is_active)
  VALUES (
    p_target_user_id,
    replace_template_vars(v_template.title_tr, v_vars),
    replace_template_vars(v_template.body_tr, v_vars),
    UPPER(v_type_key), v_type_key,
    p_match_id, p_team_id, p_sender_id,
    true,
    'oyna://match/' || p_match_id::TEXT,
    false, true
  )
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$function$;

-- 2) materialize_subscriptions: parametresiz (toplu) çalıştırma yalnızca admin/sunucu
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
        IF sub.end_date IS NOT NULL AND sub.end_date < v_end THEN v_end := sub.end_date; END IF;

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

-- 3) Yetki düzeni: PUBLIC/anon erişimleri kaldır, açıkça ver
REVOKE EXECUTE ON FUNCTION public.send_match_invite(uuid, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.send_match_invite(uuid, uuid, uuid, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.materialize_subscriptions(integer, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.materialize_subscriptions(integer, uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.cancel_subscription(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.cancel_subscription(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_court_occupancy(uuid, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_court_occupancy(uuid, date) TO authenticated, service_role;

-- 4) Tetikleyici fonksiyon dışarıdan çağrılamasın (tetikleyici olarak çalışmaya devam eder)
REVOKE EXECUTE ON FUNCTION public.update_user_skill_rating() FROM PUBLIC, anon, authenticated;
