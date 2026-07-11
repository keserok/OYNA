-- [DB GEÇMİŞİNDEN KURTARILDI 2026-07-11] Bu migration canlı veritabanına uygulanmıştı ancak repoda dosyası yoktu; supabase_migrations.schema_migrations.statements kolonundan geri çıkarıldı.

-- Doğrulama → Pazaryeri kapısı: yalnız ONAYLI sağlayıcılar listelensin
ALTER TABLE public.goalkeepers ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'pending';
ALTER TABLE public.referees    ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'pending';

UPDATE public.goalkeepers g SET verification_status =
  CASE WHEN g."isDemo" IS TRUE THEN 'approved'
       ELSE COALESCE((SELECT p.verification_status FROM public.profiles p WHERE p.id = g.id), 'pending') END;
UPDATE public.referees r SET verification_status =
  CASE WHEN r."isDemo" IS TRUE THEN 'approved'
       ELSE COALESCE((SELECT p.verification_status FROM public.profiles p WHERE p.id = r.id), 'pending') END;

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
