CREATE TABLE IF NOT EXISTS public.user_reports (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reported_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  context_type TEXT NOT NULL DEFAULT 'CHAT' CHECK (context_type IN ('CHAT','PROFILE','MATCH')),
  context_id   TEXT,
  reason       TEXT NOT NULL DEFAULT 'OTHER'
    CHECK (reason IN ('SPAM','HARASSMENT','FAKE_PROFILE','CHEATING','OTHER')),
  note         TEXT,
  status       TEXT NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN','REVIEWED','DISMISSED')),
  resolution_notes TEXT,
  resolved_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT user_reports_no_self CHECK (reporter_id <> reported_id)
);

CREATE INDEX IF NOT EXISTS idx_user_reports_status   ON public.user_reports(status);
CREATE INDEX IF NOT EXISTS idx_user_reports_reported ON public.user_reports(reported_id);
CREATE INDEX IF NOT EXISTS idx_user_reports_reporter ON public.user_reports(reporter_id);

ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage user_reports" ON public.user_reports;
CREATE POLICY "Admins manage user_reports" ON public.user_reports FOR ALL
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "Reporters view own reports" ON public.user_reports;
CREATE POLICY "Reporters view own reports" ON public.user_reports FOR SELECT
USING (reporter_id = auth.uid());

DROP POLICY IF EXISTS "Users create own reports" ON public.user_reports;
CREATE POLICY "Users create own reports" ON public.user_reports FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND reporter_id = auth.uid());