-- Taktik Stüdyo tanıtımı: kullanıcı-başına "bir kez göster" bayrağı.
-- localStorage cihaz-başınadır; bu kolon kullanıcı hangi cihazdan girerse girsin
-- (ve uygulama silinip kurulsa da) tanıtımın bir kez görünmesini sağlar.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS studio_intro_seen boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.studio_intro_seen IS
  'Taktik Stüdyo ilk-kullanım tanıtımı bu kullanıcıya gösterildi mi (kullanıcı-başına bir kez).';
