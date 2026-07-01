-- ==============================================================================
-- user_reports — Kullanıcı-kullanıcı şikayet/moderasyon kuyruğu (YENİ)
-- ------------------------------------------------------------------------------
-- Amaç: Sohbet/profil içindeki "Şikayet Et" aksiyonu şu ana kadar hiçbir yere
-- kayıt yapmıyor, kullanıcıya sahte "şikayetin alındı" mesajı gösteriliyordu.
-- Bu tablo, şikayetleri gerçek bir moderasyon kuyruğuna yazar; adminler (OPERASYON/
-- SUPER_ADMIN) inceleyip durumunu günceller. blockUser (user_blocks) deseniyle
-- simetriktir: kullanıcı yalnız kendi şikayetini oluşturur/görür, admin hepsini yönetir.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.user_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reported_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  context_type TEXT NOT NULL DEFAULT 'CHAT' CHECK (context_type IN ('CHAT','PROFILE','MATCH')),
  context_id   TEXT,                    -- ilgili konuşma/maç/profil id'si (opsiyonel)
  reason       TEXT NOT NULL DEFAULT 'OTHER'
    CHECK (reason IN ('SPAM','HARASSMENT','FAKE_PROFILE','CHEATING','OTHER')),
  note         TEXT,                    -- kullanıcının serbest metin açıklaması (opsiyonel)
  status       TEXT NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN','REVIEWED','DISMISSED')),
  resolution_notes TEXT,
  resolved_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  -- Aynı kullanıcının aynı hedefi kısa sürede spam'lemesini önlemek için
  -- (reporter, reported, context_id) üçlüsünde OPEN kaydı tekilleştir.
  CONSTRAINT user_reports_no_self CHECK (reporter_id <> reported_id)
);

CREATE INDEX IF NOT EXISTS idx_user_reports_status   ON public.user_reports(status);
CREATE INDEX IF NOT EXISTS idx_user_reports_reported ON public.user_reports(reported_id);
CREATE INDEX IF NOT EXISTS idx_user_reports_reporter ON public.user_reports(reporter_id);

ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;

-- Adminler tüm şikayetleri yönetir (okuma + güncelleme/çözümleme).
DROP POLICY IF EXISTS "Admins manage user_reports" ON public.user_reports;
CREATE POLICY "Admins manage user_reports" ON public.user_reports FOR ALL
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

-- Kullanıcı yalnız kendi oluşturduğu şikayetleri görür.
DROP POLICY IF EXISTS "Reporters view own reports" ON public.user_reports;
CREATE POLICY "Reporters view own reports" ON public.user_reports FOR SELECT
USING (reporter_id = auth.uid());

-- Kullanıcı yalnız kendi adına şikayet oluşturur (kendini şikayet edemez — CHECK constraint).
DROP POLICY IF EXISTS "Users create own reports" ON public.user_reports;
CREATE POLICY "Users create own reports" ON public.user_reports FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL AND reporter_id = auth.uid());
