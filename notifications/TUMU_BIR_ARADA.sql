-- ═══════════════════════════════════════════════════════════════════
-- OYNA APP — Push Notification Veritabanı Şema Eklemeleri (v2 — Düzeltilmiş)
-- Supabase Dashboard → SQL Editor → RUN
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- 1. PROFILES — Yeni Sütunlar
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS push_token TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS push_token_platform TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS push_token_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS last_location JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{
    "match_joined":       { "enabled": true,  "mandatory": true  },
    "match_cancelled":    { "enabled": true,  "mandatory": true  },
    "match_invite":       { "enabled": true,  "mandatory": true  },
    "team_invite":        { "enabled": true,  "mandatory": true  },
    "gk_accepted":        { "enabled": true,  "mandatory": true  },
    "gk_rejected":        { "enabled": true,  "mandatory": true  },
    "ref_accepted":       { "enabled": true,  "mandatory": true  },
    "ref_rejected":       { "enabled": true,  "mandatory": true  },
    "match_reminder_1h":  { "enabled": true,  "mandatory": false },
    "match_reminder_24h": { "enabled": true,  "mandatory": false },
    "nearby_match":       { "enabled": false, "mandatory": false },
    "promo_offers":       { "enabled": false, "mandatory": false },
    "weekly_summary":     { "enabled": true,  "mandatory": false }
  }'::jsonb;


-- ─────────────────────────────────────────────────────────────────
-- 2. NOTIFICATIONS — Yeni Sütunlar (NOT NULL olmadan — mevcut verilerle uyumlu)
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS type_key TEXT DEFAULT 'system',
  ADD COLUMN IF NOT EXISTS match_id UUID REFERENCES public.matches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sender_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deep_link TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS push_sent BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS push_sent_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS push_error TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS action_required BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS action_taken TEXT DEFAULT NULL;


-- ─────────────────────────────────────────────────────────────────
-- 3. MATCH_PARTICIPANTS — Yeni Tablo
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.match_participants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'PLAYER',
  status TEXT DEFAULT 'CONFIRMED',
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  UNIQUE(match_id, user_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND tablename = 'match_participants'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.match_participants;
  END IF;
END$$;


-- ─────────────────────────────────────────────────────────────────
-- 4. PUSH_LOG Tablosu
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.push_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  notification_id UUID REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  push_token TEXT NOT NULL,
  platform TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  apns_message_id TEXT DEFAULT NULL,
  fcm_message_id TEXT DEFAULT NULL,
  error_code TEXT DEFAULT NULL,
  error_message TEXT DEFAULT NULL,
  retry_count INTEGER DEFAULT 0,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

CREATE INDEX IF NOT EXISTS idx_push_log_user_id ON public.push_log(user_id);
CREATE INDEX IF NOT EXISTS idx_push_log_status ON public.push_log(status);
CREATE INDEX IF NOT EXISTS idx_push_log_created_at ON public.push_log(created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND tablename = 'push_log'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.push_log;
  END IF;
END$$;


-- ─────────────────────────────────────────────────────────────────
-- 5. NOTIFICATION_TEMPLATES Tablosu
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notification_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type_key TEXT UNIQUE NOT NULL,
  label_tr TEXT NOT NULL,
  title_tr TEXT NOT NULL,
  body_tr TEXT NOT NULL,
  title_en TEXT DEFAULT NULL,
  body_en TEXT DEFAULT NULL,
  category TEXT DEFAULT 'MATCH',
  is_mandatory BOOLEAN DEFAULT false,
  can_user_disable BOOLEAN DEFAULT true,
  sound TEXT DEFAULT 'default',
  badge_increment BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 99,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

INSERT INTO public.notification_templates
  (type_key, label_tr, title_tr, body_tr, category, is_mandatory, can_user_disable, sort_order)
VALUES
  ('match_joined',       'Maça Oyuncu Katıldı',           '⚽ Yeni Oyuncu!',          '{{player_name}}, {{match_date}} tarihli maçına katıldı.',              'MATCH', true,  false, 1),
  ('match_cancelled',    'Maç İptal Edildi',               '❌ Maç İptal',             '{{match_date}} tarihli {{pitch_name}} maçı iptal edildi.',             'MATCH', true,  false, 2),
  ('match_invite',       'Kişisel Maç Daveti',             '📩 Maç Daveti',            '{{sender_name}} seni {{match_date}} maçına davet etti!',               'MATCH', true,  false, 3),
  ('team_invite',        'Takım Maç Daveti',               '🛡️ Takım Daveti',          '{{team_name}} takımından {{match_date}} maçına davet aldın.',           'TEAM',  true,  false, 4),
  ('gk_accepted',        'Kaleci Kabul Etti',              '🧤 Kaleci Onayladı!',      '{{gk_name}}, {{match_date}} maçını kabul etti.',                       'MATCH', true,  false, 5),
  ('gk_rejected',        'Kaleci Reddetti',                '🧤 Kaleci Reddetti',       '{{gk_name}}, {{match_date}} maçına katılamayacağını bildirdi.',        'MATCH', true,  false, 6),
  ('ref_accepted',       'Hakem Kabul Etti',               '🟡 Hakem Onayladı!',       '{{ref_name}}, {{match_date}} maçını kabul etti.',                      'MATCH', true,  false, 7),
  ('ref_rejected',       'Hakem Reddetti',                 '🟡 Hakem Reddetti',        '{{ref_name}}, {{match_date}} maçına katılamayacağını bildirdi.',       'MATCH', true,  false, 8),
  ('match_reminder_1h',  '1 Saat Hatırlatıcı',            '⏰ Maç 1 Saat Kaldı!',    '{{pitch_name}} maçına 1 saat kaldı. Hazır ol!',                        'MATCH', false, true,  9),
  ('match_reminder_24h', '24 Saat Hatırlatıcı',           '📅 Yarın Maç Var!',        'Yarın {{match_time}} saatinde {{pitch_name}} maçın var.',              'MATCH', false, true,  10),
  ('nearby_match',       'Yakında Maç',                    '📍 Yakında Maç!',          '{{distance}} km yakınında açık bir maç var. Hemen katıl!',             'MATCH', false, true,  11),
  ('promo_offers',       'Özel Kampanyalar',               '🎁 Özel Fırsat!',          '{{promo_text}}',                                                       'PROMO', false, true,  12),
  ('weekly_summary',     'Haftalık Performans Özeti',      '📊 Haftalık Özet',         'Bu hafta {{match_count}} maç oynadın. Puan ortalaması: {{rating}}',    'SYSTEM',false, true,  13)
ON CONFLICT (type_key) DO UPDATE SET
  label_tr   = EXCLUDED.label_tr,
  title_tr   = EXCLUDED.title_tr,
  body_tr    = EXCLUDED.body_tr,
  updated_at = NOW();


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


-- ═══════════════════════════════════════════════════════════════════
-- OYNA APP — Row Level Security (RLS) Politikaları (v2 — Yeniden Oluşturulmuş)
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- NOTIFICATIONS Tablosu
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Service role can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "Only service role can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can mark own notifications read" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notification read status" ON public.notifications;
DROP POLICY IF EXISTS "Service role can update push status" ON public.notifications;
DROP POLICY IF EXISTS "Users can delete own notifications" ON public.notifications;

CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert notifications"
  ON public.notifications FOR INSERT TO service_role
  WITH CHECK (true);

CREATE POLICY "Users can mark own notifications read"
  ON public.notifications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role can update push status"
  ON public.notifications FOR UPDATE TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Users can delete own notifications"
  ON public.notifications FOR DELETE TO authenticated
  USING (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────────
-- PUSH_LOG Tablosu
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.push_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own push logs" ON public.push_log;
DROP POLICY IF EXISTS "Service role manages push logs" ON public.push_log;

CREATE POLICY "Users can view own push logs"
  ON public.push_log FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages push logs"
  ON public.push_log FOR ALL TO service_role
  USING (true) WITH CHECK (true);


-- ─────────────────────────────────────────────────────────────────
-- NOTIFICATION_TEMPLATES Tablosu
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone authenticated can read templates" ON public.notification_templates;
DROP POLICY IF EXISTS "Admins can manage templates" ON public.notification_templates;
DROP POLICY IF EXISTS "Only admins can modify templates" ON public.notification_templates;
DROP POLICY IF EXISTS "Service role can manage templates" ON public.notification_templates;

CREATE POLICY "Anyone authenticated can read templates"
  ON public.notification_templates FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can manage templates"
  ON public.notification_templates FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('ADMIN', 'SUPER_ADMIN')
    )
  );

CREATE POLICY "Service role can manage templates"
  ON public.notification_templates FOR ALL TO service_role
  USING (true) WITH CHECK (true);


-- ─────────────────────────────────────────────────────────────────
-- MATCH_PARTICIPANTS Tablosu
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.match_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view match participants" ON public.match_participants;
DROP POLICY IF EXISTS "Users can join matches" ON public.match_participants;
DROP POLICY IF EXISTS "Users can leave matches" ON public.match_participants;
DROP POLICY IF EXISTS "Captains can manage their match participants" ON public.match_participants;
DROP POLICY IF EXISTS "Captains can manage participants" ON public.match_participants;
DROP POLICY IF EXISTS "Service role manages all participants" ON public.match_participants;

CREATE POLICY "Users can view match participants"
  ON public.match_participants FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Users can join matches"
  ON public.match_participants FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can leave matches"
  ON public.match_participants FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Captains can manage their match participants"
  ON public.match_participants FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id = match_participants.match_id
        AND m."creatorId" = auth.uid()
    )
  );

CREATE POLICY "Service role manages all participants"
  ON public.match_participants FOR ALL TO service_role
  USING (true) WITH CHECK (true);


-- ─────────────────────────────────────────────────────────────────
-- PROFILES Tablosu (Push Token Güvenliği)
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Service role manages all profiles" ON public.profiles;

CREATE POLICY "Users can view all profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Service role manages all profiles"
  ON public.profiles FOR ALL TO service_role
  USING (true) WITH CHECK (true);


-- ─────────────────────────────────────────────────────────────────
-- Güvenli Profil View (push_token gizlenir)
-- ─────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.profiles_public;
CREATE OR REPLACE VIEW public.profiles_public AS
  SELECT
    id, name, avatar_url, role, trust_score, skill_rating,
    reliability_score, is_verified, is_banned, join_date,
    notification_preferences,
    last_location
  FROM public.profiles;

GRANT SELECT ON public.profiles_public TO authenticated;
