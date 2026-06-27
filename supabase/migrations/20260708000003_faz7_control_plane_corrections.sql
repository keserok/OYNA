-- ============================================================================
-- FAZ 7 — Kontrol Merkezi düzeltmeleri (advisor temizliği)
-- ----------------------------------------------------------------------------
-- get_config* ve is_feature_enabled okuma yardımcıları SECURITY DEFINER yerine
-- SECURITY INVOKER olur. Böylece anon/auth çağrısında app_config/feature_flags
-- RLS'i (is_public / public-read) uygulanır (en az ayrıcalık) ve Supabase
-- "anon can execute SECURITY DEFINER function" uyarısı düşer.
-- SECURITY DEFINER bir RPC içinden çağrıldıklarında definer ayrıcalığıyla
-- çalışırlar → tüm config'i okurlar (Wave 3 kural-okuma için doğru davranış).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_config(p_key text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
  SELECT value FROM public.app_config WHERE key = p_key;
$$;

CREATE OR REPLACE FUNCTION public.get_config_number(p_key text, p_default numeric DEFAULT NULL)
RETURNS numeric LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
  SELECT COALESCE((SELECT (value #>> '{}')::numeric FROM public.app_config WHERE key = p_key), p_default);
$$;

CREATE OR REPLACE FUNCTION public.get_config_bool(p_key text, p_default boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
  SELECT COALESCE((SELECT (value #>> '{}')::boolean FROM public.app_config WHERE key = p_key), p_default);
$$;

CREATE OR REPLACE FUNCTION public.is_feature_enabled(p_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public, pg_temp AS $$
  SELECT COALESCE((SELECT enabled FROM public.feature_flags WHERE key = p_key), false);
$$;

-- Trigger fonksiyonu doğrudan çağrılabilir olmasın (yalnız trigger ile tetiklenir)
REVOKE ALL ON FUNCTION public.prevent_audit_log_mutation() FROM PUBLIC;
