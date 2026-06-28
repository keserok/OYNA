-- ============================================================
-- FAZ 8 — Genel rate-limit altyapısı (Postgres token-bucket)
--
-- Tek tablo + tek SECURITY DEFINER fonksiyon. Hassas RPC/edge çağrılarının
-- başında `SELECT public.rl_consume('booking:'||uid, 10, 10.0/3600, 1)` ile kullanılır.
-- Tablo RLS açık + HİÇBİR policy yok → anon/authenticated doğrudan EREMEZ; yalnız
-- service_role (edge) ve owner (DEFINER fn) yazar. Yeni objeler → mevcut akışı bozmaz.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
  bucket_key text PRIMARY KEY,
  tokens     numeric     NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;  -- policy YOK → kullanıcı erişimi kapalı

-- Klasik token-bucket: kovada p_capacity jeton, saniyede p_refill_per_sec dolar.
-- p_cost kadar jeton varsa düşer ve TRUE; yoksa FALSE döner (istek reddedilmeli).
CREATE OR REPLACE FUNCTION public.rl_consume(
  p_key           text,
  p_capacity      numeric,
  p_refill_per_sec numeric,
  p_cost          numeric DEFAULT 1
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tokens  numeric;
  v_updated timestamptz;
  v_now     timestamptz := clock_timestamp();
BEGIN
  INSERT INTO public.rate_limit_buckets(bucket_key, tokens, updated_at)
  VALUES (p_key, p_capacity, v_now)
  ON CONFLICT (bucket_key) DO NOTHING;

  SELECT tokens, updated_at INTO v_tokens, v_updated
  FROM public.rate_limit_buckets WHERE bucket_key = p_key FOR UPDATE;

  -- zaman geçtikçe doldur (capacity tavanıyla)
  v_tokens := least(p_capacity, v_tokens + extract(epoch FROM (v_now - v_updated)) * p_refill_per_sec);

  IF v_tokens < p_cost THEN
    UPDATE public.rate_limit_buckets SET tokens = v_tokens, updated_at = v_now WHERE bucket_key = p_key;
    RETURN false;  -- limit aşıldı
  END IF;

  UPDATE public.rate_limit_buckets SET tokens = v_tokens - p_cost, updated_at = v_now WHERE bucket_key = p_key;
  RETURN true;
END;
$$;

-- Yalnız sistem/edge (service_role) çağırabilir; son kullanıcıya kapalı.
REVOKE ALL ON FUNCTION public.rl_consume(text, numeric, numeric, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rl_consume(text, numeric, numeric, numeric) TO service_role;

-- Eski/atıl kovaları periyodik temizle (cron varsa) — tablo şişmesin.
CREATE OR REPLACE FUNCTION public.cleanup_rate_limit_buckets()
RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH d AS (DELETE FROM public.rate_limit_buckets WHERE updated_at < now() - interval '1 day' RETURNING 1)
  SELECT count(*)::int FROM d;
$$;
REVOKE ALL ON FUNCTION public.cleanup_rate_limit_buckets() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_rate_limit_buckets() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup_rate_limit_buckets') THEN
      PERFORM cron.unschedule('cleanup_rate_limit_buckets');
    END IF;
    PERFORM cron.schedule('cleanup_rate_limit_buckets', '17 * * * *',
      'SELECT public.cleanup_rate_limit_buckets()');
  END IF;
END;
$$;
