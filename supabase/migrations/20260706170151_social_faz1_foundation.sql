-- ================================================================
-- SOSYAL AŞAMA 1.1 — TEMEL: pg_trgm, normalize_tr, config, oyna_id
-- Foundation Spec §5 / Aşama 1. Tamamen ekleyici (kırıcı değil).
-- ================================================================

-- 1) Türkçe-normalize ad araması için trigram uzantısı
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- 2) Türkçe normalizasyon (IMMUTABLE → index'te kullanılabilir).
--    Not: Spec'te anılan `unaccent` uzantısına gerek kalmadı — gereken
--    tüm karakterler translate ile karşılanıyor (İ/ı sorunu dahil).
CREATE OR REPLACE FUNCTION public.normalize_tr(input text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT lower(translate(coalesce(input, ''),
    'İIıŞşĞğÜüÖöÇçÂâÎîÛû',
    'iiissgguuooccaaiiuu'));
$$;

-- 3) Config: sosyal limitler koda gömülmez (Spec §8)
CREATE TABLE IF NOT EXISTS public.social_config (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);
ALTER TABLE public.social_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS social_config_read ON public.social_config;
CREATE POLICY social_config_read ON public.social_config
  FOR SELECT TO authenticated USING (true);
-- Yazma politikası bilinçli olarak yok: yalnız admin/migration günceller.

INSERT INTO public.social_config (key, value) VALUES
  ('friend_request_daily_limit',  '20'),
  ('friend_request_pending_max',  '50'),
  ('friend_reject_cooldown_hours','72'),
  ('friend_lists_max',            '20'),
  ('team_membership_max',         '5'),
  ('team_captaincy_max',          '3'),
  ('team_roster_max',             '20'),
  ('team_join_pending_max',       '10'),
  ('team_invite_ttl_days',        '14'),
  ('match_list_invite_batch_max', '50'),
  ('contact_hash_daily_max',      '5000')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public._social_config_int(p_key text, p_default integer)
RETURNS integer LANGUAGE sql STABLE
SET search_path = 'public','pg_temp' AS $$
  SELECT coalesce(
    (SELECT (value #>> '{}')::integer FROM public.social_config WHERE key = p_key),
    p_default);
$$;
REVOKE EXECUTE ON FUNCTION public._social_config_int(text,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._social_config_int(text,integer) TO authenticated, service_role;

-- 4) Genel oran-kullanım sayacı (rehber hash kotası vb. — Spec B3)
CREATE TABLE IF NOT EXISTS public.social_rate_usage (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  bucket  text NOT NULL,
  day     date NOT NULL DEFAULT (timezone('utc', now()))::date,
  count   integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, bucket, day)
);
ALTER TABLE public.social_rate_usage ENABLE ROW LEVEL SECURITY;
-- Politika yok: yalnız SECURITY DEFINER RPC'ler dokunur.

-- 5) oyna_id: format kısıtı + case-insensitive benzersizlik + üretim + backfill
--    (Canlı bulgu 2026-07-06: 31 profilin 31'inde oyna_id NULL — B1 kararı)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='profiles_oyna_id_format_check') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_oyna_id_format_check
      CHECK (oyna_id IS NULL OR oyna_id ~ '^[a-z0-9_]{3,20}$');
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_oyna_id_lower_key
  ON public.profiles (lower(oyna_id)) WHERE oyna_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.generate_oyna_id(p_name text)
RETURNS text LANGUAGE plpgsql VOLATILE
SET search_path = 'public','pg_temp' AS $$
DECLARE
  v_base      text;
  v_candidate text;
  v_i         int := 0;
BEGIN
  v_base := regexp_replace(public.normalize_tr(coalesce(p_name, '')), '[^a-z0-9_]', '', 'g');
  v_base := left(v_base, 12);
  IF length(v_base) < 3 THEN v_base := 'oyuncu'; END IF;
  LOOP
    v_i := v_i + 1;
    v_candidate := v_base || (floor(random() * 9000) + 1000)::int::text;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE lower(oyna_id) = lower(v_candidate));
    IF v_i > 20 THEN
      v_candidate := left(v_base || replace(gen_random_uuid()::text, '-', ''), 20);
      EXIT;
    END IF;
  END LOOP;
  RETURN left(v_candidate, 20);
END $$;
REVOKE EXECUTE ON FUNCTION public.generate_oyna_id(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_oyna_id(text) TO authenticated, service_role;

-- Backfill: mevcut kullanıcılara otomatik kimlik
UPDATE public.profiles
SET oyna_id = public.generate_oyna_id(coalesce(full_name, name::text))
WHERE oyna_id IS NULL OR oyna_id = '';

-- Yeni kayıtlar: BEFORE INSERT tetikleyicisi
CREATE OR REPLACE FUNCTION public.profiles_set_oyna_id()
RETURNS trigger LANGUAGE plpgsql
SET search_path = 'public','pg_temp' AS $$
BEGIN
  IF NEW.oyna_id IS NULL OR NEW.oyna_id = '' THEN
    NEW.oyna_id := public.generate_oyna_id(coalesce(NEW.full_name, NEW.name::text));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_profiles_set_oyna_id ON public.profiles;
CREATE TRIGGER trg_profiles_set_oyna_id
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_set_oyna_id();

-- 6) Türkçe-normalize trigram indeksleri (kullanıcı + takım adı araması)
CREATE INDEX IF NOT EXISTS idx_profiles_fullname_trgm
  ON public.profiles USING gin (public.normalize_tr(full_name) extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_teams_name_trgm
  ON public.teams USING gin (public.normalize_tr(name) extensions.gin_trgm_ops);
