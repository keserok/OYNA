-- ============================================================================
-- Doğrulama → Pazaryeri kapısı: yalnız ONAYLI sağlayıcılar listelensin
-- ----------------------------------------------------------------------------
-- SORUN: goalkeepers/referees satırları BAŞVURU anında oluşuyordu ve consumer
-- pazaryeri (Marketplace) verification_status'a bakmadan hepsini listeliyordu.
-- Böylece onaylanmamış (pending) VE reddedilmiş (rejected) sağlayıcılar da
-- rezerve edilebiliyordu — yani doğrulama panelinin ana uygulamaya gerçek
-- etkisi yoktu.
--
-- ÇÖZÜM (defense-in-depth):
--   1. goalkeepers/referees'e verification_status kolonu (profiles'tan türer)
--   2. profiles.verification_status değişince katalog satırını senkronla (trigger)
--   3. RLS "Public read" politikasını 'approved' ile kapıla
--   4. Sağlayıcı kendi (henüz onaysız) satırını görebilsin (self policy)
-- ============================================================================

-- 1) Kolonlar -----------------------------------------------------------------
ALTER TABLE public.goalkeepers ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'pending';
ALTER TABLE public.referees    ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'pending';

-- Backfill: demo tohum satırları daima 'approved' (kürlü demo verisi); gerçek
-- sağlayıcılar profiles.verification_status'tan türetilir (yoksa 'pending'=gizli).
UPDATE public.goalkeepers g SET verification_status =
  CASE WHEN g."isDemo" IS TRUE THEN 'approved'
       ELSE COALESCE((SELECT p.verification_status FROM public.profiles p WHERE p.id = g.id), 'pending') END;
UPDATE public.referees r SET verification_status =
  CASE WHEN r."isDemo" IS TRUE THEN 'approved'
       ELSE COALESCE((SELECT p.verification_status FROM public.profiles p WHERE p.id = r.id), 'pending') END;

-- 2) profiles → katalog senkronu ----------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_provider_verification_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.verification_status IS DISTINCT FROM OLD.verification_status THEN
    UPDATE public.goalkeepers SET verification_status = NEW.verification_status WHERE id = NEW.id;
    UPDATE public.referees    SET verification_status = NEW.verification_status WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_sync_provider_verification ON public.profiles;
CREATE TRIGGER trg_sync_provider_verification
  AFTER UPDATE OF verification_status ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sync_provider_verification_status();

-- 3) RLS kapısı: yalnız onaylılar herkese görünür -----------------------------
DROP POLICY IF EXISTS "Public read goalkeepers" ON public.goalkeepers;
CREATE POLICY "Public read goalkeepers" ON public.goalkeepers FOR SELECT
  USING (
    verification_status = 'approved'
    AND (("isDemo" IS NOT TRUE) OR get_config_bool('demo_mode_enabled'))
  );

DROP POLICY IF EXISTS goalkeepers_select_own ON public.goalkeepers;
CREATE POLICY goalkeepers_select_own ON public.goalkeepers FOR SELECT
  USING (id = auth.uid());

DROP POLICY IF EXISTS "Public read referees" ON public.referees;
CREATE POLICY "Public read referees" ON public.referees FOR SELECT
  USING (
    verification_status = 'approved'
    AND (("isDemo" IS NOT TRUE) OR get_config_bool('demo_mode_enabled'))
  );

DROP POLICY IF EXISTS referees_select_own ON public.referees;
CREATE POLICY referees_select_own ON public.referees FOR SELECT
  USING (id = auth.uid());
