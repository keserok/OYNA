CREATE TABLE IF NOT EXISTS public.password_reset_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text NOT NULL,
  code_hash   text NOT NULL,
  expires_at  timestamptz NOT NULL,
  used        boolean NOT NULL DEFAULT false,
  attempts    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prc_email_created
  ON public.password_reset_codes (lower(email), created_at DESC);

ALTER TABLE public.password_reset_codes ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.purge_expired_reset_codes()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  DELETE FROM public.password_reset_codes
  WHERE expires_at < now() - interval '1 day';
$$;

REVOKE ALL ON FUNCTION public.purge_expired_reset_codes() FROM PUBLIC, anon, authenticated;