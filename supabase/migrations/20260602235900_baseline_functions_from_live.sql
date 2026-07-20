-- ═══════════════════════════════════════════════════════════════════════════
-- BASELINE — bildirim/istatistik fonksiyonları (canlı pg_get_functiondef,
-- 2026-07-20). 20260603000001 bu fonksiyonlara ALTER FUNCTION uygular ama
-- CREATE'leri ya çok sonra (20260705) ya da hiçbir migration'da yok.
-- plpgsql gövdeleri CREATE anında doğrulanmaz; sonraki CREATE OR REPLACE'ler
-- tarihteki gibi üzerine yazar. ÜRETİMDE: birebir aynı tanım → etkisiz.
-- Bkz: docs/master/SUPABASE_MIGRATION_RECONCILIATION.md §1.2
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.replace_template_vars(template text, vars jsonb)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  result TEXT := template;
  key TEXT;
  val TEXT;
BEGIN
  IF template IS NULL THEN RETURN ''; END IF;
  FOR key, val IN SELECT * FROM jsonb_each_text(vars)
  LOOP
    result := REPLACE(result, '{{' || key || '}}', COALESCE(val, ''));
  END LOOP;
  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_from_template(p_user_id uuid, p_type_key text, p_vars jsonb DEFAULT '{}'::jsonb, p_deep_link text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_title text; v_body text; k text; v_id uuid;
BEGIN
  SELECT title_tr, body_tr INTO v_title, v_body FROM public.notification_templates WHERE type_key = p_type_key;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bildirim şablonu bulunamadı: %', p_type_key; END IF;
  IF p_vars IS NOT NULL AND jsonb_typeof(p_vars) = 'object' THEN
    FOR k IN SELECT jsonb_object_keys(p_vars) LOOP
      v_title := regexp_replace(v_title, '\{\{\s*' || k || '\s*\}\}', COALESCE(p_vars->>k, ''), 'g');
      v_body  := regexp_replace(v_body,  '\{\{\s*' || k || '\s*\}\}', COALESCE(p_vars->>k, ''), 'g');
    END LOOP;
  END IF;
  INSERT INTO public.notifications (user_id, title, body, type_key, deep_link)
  VALUES (p_user_id, v_title, v_body, p_type_key, p_deep_link) RETURNING id INTO v_id;
  RETURN v_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.notify_match_joined()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
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

CREATE OR REPLACE FUNCTION public.notify_match_cancelled()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_template RECORD;
  v_participant RECORD;
  v_title TEXT;
  v_body TEXT;
  v_vars JSONB;
BEGIN
  IF NEW.status = 'CANCELLED' AND (OLD.status IS NULL OR OLD.status <> 'CANCELLED') THEN

    SELECT * INTO v_template
      FROM public.notification_templates
     WHERE type_key = 'match_cancelled';

    IF NOT FOUND THEN RETURN NEW; END IF;

    v_vars := jsonb_build_object(
      'match_date', COALESCE(NEW.date, 'Belirtilmedi'),
      'match_time', COALESCE(NEW.time, ''),
      'pitch_name', COALESCE(NEW.location, 'Belirtilmemiş Saha')
    );
    v_title := replace_template_vars(v_template.title_tr, v_vars);
    v_body  := replace_template_vars(v_template.body_tr, v_vars);

    FOR v_participant IN
      SELECT DISTINCT user_id
        FROM public.match_participants
       WHERE match_id = NEW.id
         AND status = 'CONFIRMED'
    LOOP
      INSERT INTO public.notifications
        (user_id, title, body, type_key, match_id, action_required, deep_link, is_read)
      VALUES (
        v_participant.user_id, v_title, v_body,
        'match_cancelled', NEW.id, false,
        'oyna://match/' || NEW.id::TEXT, false
      );
    END LOOP;

    IF NEW."creatorId" IS NOT NULL THEN
      INSERT INTO public.notifications
        (user_id, title, body, type_key, match_id, action_required, deep_link, is_read)
      SELECT
        NEW."creatorId", v_title, v_body,
        'match_cancelled', NEW.id, false,
        'oyna://match/' || NEW.id::TEXT, false
      WHERE NOT EXISTS (
        SELECT 1 FROM public.notifications
         WHERE user_id = NEW."creatorId"
           AND match_id = NEW.id
           AND type_key = 'match_cancelled'
      );
    END IF;

  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_ref_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_template RECORD;
  v_applicant_id UUID;
  v_applicant_name TEXT;
  v_type_key TEXT;
  v_vars JSONB;
BEGIN
  IF NEW."refereeId" IS DISTINCT FROM OLD."refereeId" THEN
    IF NEW."refereeId" IS NOT NULL THEN
      v_type_key := 'ref_accepted';
      v_applicant_id := NEW."refereeId";
    ELSE
      v_type_key := 'ref_rejected';
      v_applicant_id := OLD."refereeId";
    END IF;

    IF v_applicant_id IS NOT NULL THEN
      SELECT COALESCE(name, 'Hakem')
        INTO v_applicant_name
        FROM public.profiles WHERE id = v_applicant_id;

      SELECT * INTO v_template
        FROM public.notification_templates WHERE type_key = v_type_key;

      IF FOUND THEN
        v_vars := jsonb_build_object(
          'ref_name', v_applicant_name,
          'match_date', COALESCE(NEW.date, 'Belirtilmedi'),
          'pitch_name', COALESCE(NEW.location, 'Saha')
        );

        IF NEW."creatorId" IS NOT NULL THEN
          INSERT INTO public.notifications
            (user_id, title, body, type_key, match_id, sender_id, action_required, deep_link, is_read)
          VALUES (
            NEW."creatorId",
            replace_template_vars(v_template.title_tr, v_vars),
            replace_template_vars(v_template.body_tr, v_vars),
            v_type_key, NEW.id, v_applicant_id, false,
            'oyna://match/' || NEW.id::TEXT, false
          );
        END IF;

        INSERT INTO public.notifications
          (user_id, title, body, type_key, match_id, action_required, deep_link, is_read)
        VALUES (
          v_applicant_id,
          replace_template_vars(v_template.title_tr, v_vars),
          CASE WHEN v_type_key = 'ref_accepted' THEN 'Maça hakem olarak onaylandınız!' ELSE 'Hakem başvurunuz reddedildi.' END,
          v_type_key, NEW.id, false,
          'oyna://match/' || NEW.id::TEXT, false
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_send_push_webhook()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ DECLARE request_id bigint; BEGIN SELECT net.http_post(url := 'https://iikvzgyccvgcybzdfwlv.supabase.co/functions/v1/send-push', headers := '{"Content-Type": "application/json"}'::jsonb, body := row_to_json(NEW)::jsonb) INTO request_id; RETURN NEW; END; $function$;

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

CREATE OR REPLACE FUNCTION public.update_player_diamond(p_user_id uuid, p_is_win boolean, p_flat_modifier integer DEFAULT 0)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_current_wins INTEGER;
  v_current_total INTEGER;
  v_new_wins INTEGER;
  v_new_total INTEGER;
  v_win_rate NUMERIC;
  v_new_diamond INTEGER;
  v_card JSONB;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Oyuncu istatistikleri yalnızca sistem tarafından güncellenebilir.';
  END IF;

  SELECT win_count, total_matches, player_card
    INTO v_current_wins, v_current_total, v_card
  FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Kullanıcı profili bulunamadı.';
  END IF;

  v_current_wins  := COALESCE(v_current_wins, 0);
  v_current_total := COALESCE(v_current_total, 0);
  v_card          := COALESCE(v_card, '{}'::jsonb);

  v_new_total := v_current_total + 1;
  IF p_is_win THEN v_new_wins := v_current_wins + 1; ELSE v_new_wins := v_current_wins; END IF;

  IF v_new_total > 0 THEN v_win_rate := v_new_wins::NUMERIC / v_new_total::NUMERIC; ELSE v_win_rate := 0; END IF;
  v_new_diamond := ROUND(POWER(v_new_wins, 2) * v_win_rate * 1000) + p_flat_modifier;
  IF v_new_diamond < 0 THEN v_new_diamond := 0; END IF;

  v_card := jsonb_set(v_card, '{diamondValue}', to_jsonb(v_new_diamond));
  v_card := jsonb_set(v_card, '{winCount}', to_jsonb(v_new_wins));
  v_card := jsonb_set(v_card, '{totalMatches}', to_jsonb(v_new_total));
  IF p_flat_modifier <> 0 THEN
    v_card := jsonb_set(v_card, '{flatModifier}', to_jsonb(p_flat_modifier));
  END IF;

  UPDATE public.profiles
  SET win_count = v_new_wins, total_matches = v_new_total, diamonds = v_new_diamond,
      match_count = v_new_total, player_card = v_card, updated_at = NOW()
  WHERE id = p_user_id;
END;
$function$;
