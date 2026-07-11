-- Önyüz (App.tsx, supabaseAuth, PendingVerificationView, admin onay sekmeleri, PartnerOnboarding,
-- userService) profiles üzerinde bu kolonları bekliyor ama migration hiç uygulanmamıştı →
-- giriş akışı kırıktı. Kolonlar additive olarak eklendi. Canlıya uygulandı: add_profile_verification_columns

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'approved'
    CHECK (verification_status IN ('pending','approved','rejected')),
  ADD COLUMN IF NOT EXISTS verification_notes text,
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_active_at timestamptz;

UPDATE public.profiles
  SET is_admin = true
  WHERE role IN ('ADMIN','SUPER_ADMIN') OR (roles ?| array['ADMIN','SUPER_ADMIN']);

COMMENT ON COLUMN public.profiles.verification_status IS
  'pending: admin onayı bekliyor (yeni owner/kaleci/hakem). approved: aktif. rejected: reddedildi.';

CREATE INDEX IF NOT EXISTS idx_profiles_pending_verification
  ON public.profiles (verification_status)
  WHERE verification_status = 'pending';
