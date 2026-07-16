-- ================================================================
-- Sertleştirme: yardımcı fonksiyonlara sabit search_path
-- ================================================================
-- 20260720000000'daki 4 yardımcı fonksiyon (compute_is_minor, _tc_hash,
-- _req_ip, _req_ua) SET search_path olmadan tanımlanmıştı → Supabase
-- güvenlik advisor'ı "function_search_path_mutable" (WARN) veriyordu.
-- Hepsi ya yalnız built-in ya da şema-nitelikli (extensions.digest) çağrı
-- kullanıyor; yine de tutarlılık ve linter için search_path'i sabitliyoruz.
-- (Append-only migration kuralı: önceki dosyayı düzenlemek yerine ileri
-- yönlü CREATE OR REPLACE.)
-- ================================================================

CREATE OR REPLACE FUNCTION public.compute_is_minor(p_birthdate date, p_age_range text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $fn$
  SELECT CASE
    WHEN p_birthdate IS NOT NULL THEN (p_birthdate > (CURRENT_DATE - INTERVAL '18 years'))
    WHEN p_age_range = '13-17' THEN true ELSE false END;
$fn$;

CREATE OR REPLACE FUNCTION public._tc_hash(p_tc text, p_salt uuid)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, extensions AS $fn$
  SELECT encode(extensions.digest(p_tc || ':' || p_salt::text, 'sha256'), 'hex');
$fn$;

CREATE OR REPLACE FUNCTION public._req_ip()
RETURNS text LANGUAGE sql STABLE SET search_path = public AS $fn$
  SELECT split_part(COALESCE(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1);
$fn$;

CREATE OR REPLACE FUNCTION public._req_ua()
RETURNS text LANGUAGE sql STABLE SET search_path = public AS $fn$
  SELECT COALESCE(current_setting('request.headers', true)::json ->> 'user-agent', '');
$fn$;
