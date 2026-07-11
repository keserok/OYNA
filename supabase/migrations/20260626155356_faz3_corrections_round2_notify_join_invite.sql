-- [DB GEÇMİŞİNDEN KURTARILDI 2026-07-11] Bu migration canlı veritabanına uygulanmıştı ancak repoda dosyası yoktu; supabase_migrations.schema_migrations.statements kolonundan geri çıkarıldı.


CREATE OR REPLACE FUNCTION public.notify_match_joined()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_captain_id UUID;
  v_match_date TEXT;
  v_location TEXT;
  v_template RECORD;
  v_player_name TEXT;
BEGIN
  IF NEW.role = 'CAPTAIN' THEN
    RETURN NEW;
  END IF;

  SELECT "creatorId", date, location
    INTO v_captain_id, v_match_date, v_location
    FROM public.matches WHERE id = NEW.match_id;

  IF v_captain_id IS NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(name, 'Bir Oyuncu') INTO v_player_name
    FROM public.profiles WHERE id = NEW.user_id;

  SELECT * INTO v_template
    FROM public.notification_templates WHERE type_key = 'match_joined';
  IF NOT FOUND THEN RETURN NEW; END IF;

  INSERT INTO public.notifications
    (user_id, title, body, type_key, match_id, sender_id, action_required, deep_link, is_read)
  VALUES (
    v_captain_id,
    replace_template_vars(v_template.title_tr, jsonb_build_object(
      'player_name', v_player_name, 'match_date', COALESCE(v_match_date, 'Tarih belirtilmedi'), 'pitch_name', COALESCE(v_location, 'Saha'))),
    replace_template_vars(v_template.body_tr, jsonb_build_object(
      'player_name', v_player_name, 'match_date', COALESCE(v_match_date, 'Tarih belirtilmedi'), 'pitch_name', COALESCE(v_location, 'Saha'))),
    'match_joined', NEW.match_id, NEW.user_id, false,
    'oyna://match/' || NEW.match_id::TEXT, false
  );

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.send_match_invite(p_match_id uuid, p_target_user_id uuid, p_sender_id uuid, p_team_id uuid DEFAULT NULL::uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
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
  IF auth.uid() IS NOT NULL
     AND auth.uid() <> p_sender_id
     AND COALESCE((SELECT role FROM public.profiles WHERE id = auth.uid()), '') NOT IN ('ADMIN','SUPER_ADMIN') THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Başka bir kullanıcı adına davet gönderemezsiniz.';
  END IF;

  SELECT date, location INTO v_match_date, v_location FROM public.matches WHERE id = p_match_id;
  SELECT COALESCE(name, 'Bir Oyuncu') INTO v_sender_name FROM public.profiles WHERE id = p_sender_id;

  IF p_team_id IS NOT NULL THEN
    v_type_key := 'team_invite';
    SELECT name INTO v_team_name FROM public.teams WHERE id = p_team_id;
    v_vars := jsonb_build_object('team_name', COALESCE(v_team_name, 'Takım'), 'sender_name', v_sender_name,
      'match_date', COALESCE(v_match_date, 'Belirtilmedi'), 'pitch_name', COALESCE(v_location, 'Saha'));
  ELSE
    v_type_key := 'match_invite';
    v_vars := jsonb_build_object('sender_name', v_sender_name,
      'match_date', COALESCE(v_match_date, 'Belirtilmedi'), 'pitch_name', COALESCE(v_location, 'Saha'));
  END IF;

  SELECT * INTO v_template FROM public.notification_templates WHERE type_key = v_type_key;

  INSERT INTO public.notifications
    (user_id, title, body, type_key, match_id, team_id, sender_id, action_required, deep_link, is_read)
  VALUES (
    p_target_user_id,
    replace_template_vars(v_template.title_tr, v_vars),
    replace_template_vars(v_template.body_tr, v_vars),
    v_type_key, p_match_id, p_team_id, p_sender_id,
    true, 'oyna://match/' || p_match_id::TEXT, false
  )
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$function$;
