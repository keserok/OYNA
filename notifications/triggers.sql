-- ═══════════════════════════════════════════════════════════════════
-- OYNA APP — PostgreSQL Trigger'ları (v3 — Uyumlu)
-- creatorId, refereeId, location ve text tabanlı tarih uyumu sağlandı.
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- YARDIMCI FONKSİYON: Şablon değişkenlerini doldur
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION replace_template_vars(
  template TEXT,
  vars JSONB
) RETURNS TEXT AS $$
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
$$ LANGUAGE plpgsql IMMUTABLE;


-- ─────────────────────────────────────────────────────────────────
-- TRIGGER 1: Maça Oyuncu Katıldığında → Kaptana Bildirim
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION notify_match_joined()
RETURNS TRIGGER AS $$
DECLARE
  v_captain_id UUID;
  v_match_date TEXT;
  v_location TEXT;
  v_template RECORD;
  v_player_name TEXT;
BEGIN
  -- Kaptanın rolü ise bildirim gönderme
  IF NEW.role = 'CAPTAIN' THEN
    RETURN NEW;
  END IF;

  -- Maçtan sadece gerekli alanları al (creatorId, date, location)
  SELECT "creatorId", date, location
    INTO v_captain_id, v_match_date, v_location
    FROM public.matches
   WHERE id = NEW.match_id;

  -- Maç yoksa veya creatorId yoksa çık
  IF v_captain_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Oyuncu adını al
  SELECT COALESCE(name, 'Bir Oyuncu')
    INTO v_player_name
    FROM public.profiles
   WHERE id = NEW.user_id;

  -- Şablonu al
  SELECT * INTO v_template
    FROM public.notification_templates
   WHERE type_key = 'match_joined';

  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Kaptana bildirim ekle
  INSERT INTO public.notifications
    (user_id, title, body, type, type_key, match_id, sender_id, action_required, deep_link, is_read, is_active)
  VALUES (
    v_captain_id,
    replace_template_vars(v_template.title_tr, jsonb_build_object(
      'player_name', v_player_name,
      'match_date', COALESCE(v_match_date, 'Tarih belirtilmedi'),
      'pitch_name', COALESCE(v_location, 'Saha')
    )),
    replace_template_vars(v_template.body_tr, jsonb_build_object(
      'player_name', v_player_name,
      'match_date', COALESCE(v_match_date, 'Tarih belirtilmedi'),
      'pitch_name', COALESCE(v_location, 'Saha')
    )),
    'MATCH_JOINED', 'match_joined',
    NEW.match_id, NEW.user_id, false,
    'oyna://match/' || NEW.match_id::TEXT,
    false, true
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_match_participant_joined ON public.match_participants;
CREATE TRIGGER on_match_participant_joined
  AFTER INSERT ON public.match_participants
  FOR EACH ROW
  EXECUTE FUNCTION notify_match_joined();


-- ─────────────────────────────────────────────────────────────────
-- TRIGGER 2: Maç İptal Edildiğinde → Tüm Katılımcılara Bildirim
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION notify_match_cancelled()
RETURNS TRIGGER AS $$
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

    -- Tüm onaylı katılımcılara bildirim gönder
    FOR v_participant IN
      SELECT DISTINCT user_id
        FROM public.match_participants
       WHERE match_id = NEW.id
         AND status = 'CONFIRMED'
    LOOP
      INSERT INTO public.notifications
        (user_id, title, body, type, type_key, match_id, action_required, deep_link, is_read, is_active)
      VALUES (
        v_participant.user_id,
        v_title, v_body,
        'MATCH_CANCELLED', 'match_cancelled',
        NEW.id, false,
        'oyna://match/' || NEW.id::TEXT,
        false, true
      );
    END LOOP;

    -- Kaptana da ayrıca bildirim gönder (match_participants'ta olmayabilir)
    IF NEW."creatorId" IS NOT NULL THEN
      INSERT INTO public.notifications
        (user_id, title, body, type, type_key, match_id, action_required, deep_link, is_read, is_active)
      SELECT
        NEW."creatorId", v_title, v_body,
        'MATCH_CANCELLED', 'match_cancelled',
        NEW.id, false,
        'oyna://match/' || NEW.id::TEXT,
        false, true
      -- Kaptan zaten match_participants'ta varsa ekleme
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_match_cancelled ON public.matches;
CREATE TRIGGER on_match_cancelled
  AFTER UPDATE OF status ON public.matches
  FOR EACH ROW
  EXECUTE FUNCTION notify_match_cancelled();


-- ─────────────────────────────────────────────────────────────────
-- TRIGGER 3: Hakem Durumu Değiştiğinde → Bildirim
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION notify_ref_status_change()
RETURNS TRIGGER AS $$
DECLARE
  v_template RECORD;
  v_applicant_id UUID;
  v_applicant_name TEXT;
  v_type_key TEXT;
  v_vars JSONB;
BEGIN

  -- ── HAKEM DEĞİŞİMİ ──
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

        -- Kaptana bildir (eğer creatorId varsa)
        IF NEW."creatorId" IS NOT NULL THEN
          INSERT INTO public.notifications
            (user_id, title, body, type, type_key, match_id, sender_id, action_required, deep_link, is_read, is_active)
          VALUES (
            NEW."creatorId",
            replace_template_vars(v_template.title_tr, v_vars),
            replace_template_vars(v_template.body_tr, v_vars),
            UPPER(v_type_key), v_type_key,
            NEW.id, v_applicant_id, false,
            'oyna://match/' || NEW.id::TEXT,
            false, true
          );
        END IF;

        -- Hakeme bildir
        INSERT INTO public.notifications
          (user_id, title, body, type, type_key, match_id, action_required, deep_link, is_read, is_active)
        VALUES (
          v_applicant_id,
          replace_template_vars(v_template.title_tr, v_vars),
          CASE WHEN v_type_key = 'ref_accepted' THEN 'Maça hakem olarak onaylandınız!' ELSE 'Hakem başvurunuz reddedildi.' END,
          UPPER(v_type_key), v_type_key,
          NEW.id, false,
          'oyna://match/' || NEW.id::TEXT,
          false, true
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_match_ref_change ON public.matches;
CREATE TRIGGER on_match_ref_change
  AFTER UPDATE OF "refereeId" ON public.matches
  FOR EACH ROW
  EXECUTE FUNCTION notify_ref_status_change();


-- ─────────────────────────────────────────────────────────────────
-- RPC FONKSİYONU: Maç / Takım Daveti Gönder
-- Frontend'den çağrılır: supabase.rpc('send_match_invite', {...})
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION send_match_invite(
  p_match_id UUID,
  p_target_user_id UUID,
  p_sender_id UUID,
  p_team_id UUID DEFAULT NULL
) RETURNS UUID AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;
