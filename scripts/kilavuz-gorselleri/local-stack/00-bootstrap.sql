-- OYNA yerel yığın — Supabase uyumluluk katmanı
-- Boş bir PostgreSQL 16 kümesini, depo migration'larının beklediği Supabase
-- ortamına yaklaştırır: roller, şemalar, eklentiler, auth/storage yüzeyi ve
-- bulutta olup yerelde olmayan eklentiler (pg_cron, pg_net, vault) için sahteler.
--
-- Amaç YALNIZCA kılavuz ekran görüntüsü üretmektir; üretimle ilgisi yoktur.

-- ---------------------------------------------------------------- roller ----
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
    CREATE ROLE authenticator LOGIN NOINHERIT PASSWORD 'postgres';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin') THEN
    CREATE ROLE supabase_admin NOLOGIN SUPERUSER;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_auth_admin') THEN
    CREATE ROLE supabase_auth_admin NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_storage_admin') THEN
    CREATE ROLE supabase_storage_admin NOLOGIN;
  END IF;
END $$;

GRANT anon, authenticated, service_role TO authenticator;
GRANT anon, authenticated, service_role TO postgres;

-- --------------------------------------------------------------- şemalar ----
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE SCHEMA IF NOT EXISTS graphql_public;
CREATE SCHEMA IF NOT EXISTS realtime;
CREATE SCHEMA IF NOT EXISTS vault;
CREATE SCHEMA IF NOT EXISTS cron;
CREATE SCHEMA IF NOT EXISTS net;
CREATE SCHEMA IF NOT EXISTS supabase_migrations;

GRANT USAGE ON SCHEMA public, extensions, auth, storage, graphql_public
  TO anon, authenticated, service_role;

-- ------------------------------------------------------------- eklentiler ---
-- Buluttaki yerleşimle aynı: pgcrypto `extensions` şemasında.
CREATE EXTENSION IF NOT EXISTS pgcrypto   WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm    WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS cube       WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS earthdistance WITH SCHEMA extensions;

-- gen_random_uuid/crypt/gen_salt public'ten de görünsün (migration'lar şemasız çağırıyor)
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET search_path TO %s',
                 current_database(), '"$user", public, extensions');
END $$;

-- ------------------------------------- pg_cron sahtesi (yerelde yok) --------
-- Migration'lar cron.schedule/unschedule çağırıyor. Yerelde zamanlayıcıya
-- ihtiyaç yok; çağrıları kaydedip no-op dönüyoruz.
CREATE TABLE IF NOT EXISTS cron.job (
  jobid    bigserial PRIMARY KEY,
  schedule text,
  command  text,
  nodename text DEFAULT 'localhost',
  nodeport int  DEFAULT 5432,
  database text DEFAULT 'postgres',
  username text DEFAULT 'postgres',
  active   boolean DEFAULT true,
  jobname  text UNIQUE
);

CREATE OR REPLACE FUNCTION cron.schedule(p_jobname text, p_schedule text, p_command text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_id bigint;
BEGIN
  INSERT INTO cron.job (jobname, schedule, command) VALUES (p_jobname, p_schedule, p_command)
  ON CONFLICT (jobname) DO UPDATE SET schedule = EXCLUDED.schedule, command = EXCLUDED.command
  RETURNING jobid INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION cron.schedule(p_schedule text, p_command text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_id bigint;
BEGIN
  INSERT INTO cron.job (jobname, schedule, command)
  VALUES ('job_' || md5(p_command), p_schedule, p_command)
  ON CONFLICT (jobname) DO UPDATE SET schedule = EXCLUDED.schedule
  RETURNING jobid INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION cron.unschedule(p_jobname text)
RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN DELETE FROM cron.job WHERE jobname = p_jobname; RETURN true; END $$;

CREATE OR REPLACE FUNCTION cron.unschedule(p_jobid bigint)
RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN DELETE FROM cron.job WHERE jobid = p_jobid; RETURN true; END $$;

-- --------------------------------------- pg_net sahtesi (yerelde yok) -------
CREATE TABLE IF NOT EXISTS net.http_request_queue (
  id bigserial PRIMARY KEY, url text, body jsonb, headers jsonb, created_at timestamptz DEFAULT now()
);

CREATE OR REPLACE FUNCTION net.http_post(
  url text, body jsonb DEFAULT '{}'::jsonb, params jsonb DEFAULT '{}'::jsonb,
  headers jsonb DEFAULT '{}'::jsonb, timeout_milliseconds int DEFAULT 5000
) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_id bigint;
BEGIN
  INSERT INTO net.http_request_queue (url, body, headers) VALUES (url, body, headers) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- ----------------------------------------------- vault sahtesi --------------
CREATE TABLE IF NOT EXISTS vault.secrets (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  name text UNIQUE, secret text, created_at timestamptz DEFAULT now()
);
CREATE OR REPLACE VIEW vault.decrypted_secrets AS
  SELECT id, name, secret AS decrypted_secret, created_at FROM vault.secrets;

-- ------------------------------------------------------ auth yüzeyi --------
CREATE TABLE IF NOT EXISTS auth.users (
  instance_id uuid,
  id uuid PRIMARY KEY,
  aud varchar(255),
  role varchar(255),
  email varchar(255) UNIQUE,
  encrypted_password varchar(255),
  email_confirmed_at timestamptz,
  invited_at timestamptz,
  confirmation_token varchar(255) DEFAULT '',
  confirmation_sent_at timestamptz,
  recovery_token varchar(255) DEFAULT '',
  recovery_sent_at timestamptz,
  email_change_token_new varchar(255) DEFAULT '',
  email_change varchar(255) DEFAULT '',
  email_change_sent_at timestamptz,
  last_sign_in_at timestamptz,
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb,
  is_super_admin boolean,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  phone text UNIQUE DEFAULT NULL,
  phone_confirmed_at timestamptz,
  phone_change text DEFAULT '',
  phone_change_token varchar(255) DEFAULT '',
  phone_change_sent_at timestamptz,
  confirmed_at timestamptz GENERATED ALWAYS AS (LEAST(email_confirmed_at, phone_confirmed_at)) STORED,
  email_change_token_current varchar(255) DEFAULT '',
  email_change_confirm_status smallint DEFAULT 0,
  banned_until timestamptz,
  reauthentication_token varchar(255) DEFAULT '',
  reauthentication_sent_at timestamptz,
  is_sso_user boolean DEFAULT false NOT NULL,
  deleted_at timestamptz,
  is_anonymous boolean DEFAULT false NOT NULL
);

CREATE TABLE IF NOT EXISTS auth.identities (
  provider_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  identity_data jsonb NOT NULL,
  provider text NOT NULL,
  last_sign_in_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  email text,
  id uuid DEFAULT extensions.gen_random_uuid() PRIMARY KEY,
  UNIQUE (provider_id, provider)
);

CREATE TABLE IF NOT EXISTS auth.mfa_factors (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  friendly_name text,
  factor_type text NOT NULL,
  status text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  secret text
);

CREATE TABLE IF NOT EXISTS auth.sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  aal text
);

-- JWT'den okuyan yardımcılar (PostgREST request.jwt.claims'i set eder)
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim', true), ''),
    NULLIF(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.sub', true), ''),
    (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

CREATE OR REPLACE FUNCTION auth.email() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.email', true), ''),
    (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email')
  )::text
$$;

GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT SELECT ON auth.users TO authenticated, service_role;

-- --------------------------------------------------- storage yüzeyi --------
CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL,
  owner uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  public boolean DEFAULT false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  bucket_id text REFERENCES storage.buckets(id),
  name text,
  owner uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  last_accessed_at timestamptz DEFAULT now(),
  metadata jsonb,
  path_tokens text[] GENERATED ALWAYS AS (string_to_array(name, '/')) STORED,
  version text,
  owner_id text
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION storage.foldername(name text)
RETURNS text[] LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE _parts text[];
BEGIN
  SELECT string_to_array(name, '/') INTO _parts;
  RETURN _parts[1 : array_length(_parts, 1) - 1];
END $$;

CREATE OR REPLACE FUNCTION storage.filename(name text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE _parts text[];
BEGIN
  SELECT string_to_array(name, '/') INTO _parts;
  RETURN _parts[array_length(_parts, 1)];
END $$;

CREATE OR REPLACE FUNCTION storage.extension(name text)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE _parts text[]; _fn text;
BEGIN
  SELECT string_to_array(name, '/') INTO _parts;
  SELECT _parts[array_length(_parts, 1)] INTO _fn;
  RETURN reverse(split_part(reverse(_fn), '.', 1));
END $$;

GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
GRANT ALL ON storage.objects, storage.buckets TO authenticated, service_role, anon;

-- ------------------------------------------- realtime yayını ---------------
-- Migration'lar `ALTER PUBLICATION supabase_realtime ADD TABLE ...` çağırıyor;
-- bulutta bu yayın hazır gelir, boş kümede elle oluşturmak gerekir.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

-- --------------------------------------------- migration defteri -----------
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
  version text PRIMARY KEY,
  statements text[],
  name text,
  created_by text,
  idempotency_key text
);

-- Varsayılan yetkiler: migration'lar public'te tablo/fonksiyon üretecek
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
