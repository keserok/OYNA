-- ═══════════════════════════════════════════════════════════════════
-- OYNA APP — Row Level Security (RLS) Politikaları (v3 — Uyumlu)
-- creatorId, name ve diğer profiller tablosu uyumu sağlandı.
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
