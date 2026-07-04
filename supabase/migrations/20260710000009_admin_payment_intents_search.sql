-- Genel ödeme müdahale ekranı (Kararlar Soru 73): maç kokpiti dışında da her
-- ödeme intent'i aranıp force capture/void/refund yapılabilsin. Müdahale
-- RPC'leri (admin_force_capture/void/refund_intent) zaten FINANCE kapılı;
-- burada yalnız arama/listeleme eklenir.

CREATE OR REPLACE FUNCTION public.admin_fetch_payment_intents(
  p_search text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
 RETURNS TABLE(
   id uuid, user_id uuid, user_name text, pitch_id uuid, pitch_name text,
   match_id uuid, related_entity_type text, amount numeric, commission_amount numeric,
   owner_amount numeric, status text, provider text, provider_ref text,
   created_at timestamptz, total_count bigint
 )
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  RETURN QUERY
  SELECT
    pi.id, pi.user_id,
    COALESCE(pr.full_name, pr.name, pr.email)::text AS user_name,
    pi.pitch_id, p.name::text AS pitch_name,
    pi.match_id, pi.related_entity_type,
    pi.amount, pi.commission_amount, pi.owner_amount,
    pi.status, pi.provider, pi.provider_ref,
    pi.created_at,
    COUNT(*) OVER() AS total_count
  FROM public.payment_intents pi
  LEFT JOIN public.profiles pr ON pr.id = pi.user_id
  LEFT JOIN public.pitches p ON p.id = pi.pitch_id
  WHERE
    (p_status IS NULL OR p_status = '' OR p_status = 'all' OR upper(pi.status) = upper(p_status))
    AND (
      p_search IS NULL OR p_search = '' OR
      pi.id::text ILIKE '%' || p_search || '%' OR
      pi.provider_ref ILIKE '%' || p_search || '%' OR
      pr.full_name ILIKE '%' || p_search || '%' OR
      pr.email ILIKE '%' || p_search || '%' OR
      p.name ILIKE '%' || p_search || '%'
    )
  ORDER BY pi.created_at DESC
  LIMIT GREATEST(p_limit, 1)
  OFFSET GREATEST(p_offset, 0);
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_fetch_payment_intents(text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_fetch_payment_intents(text, text, integer, integer) TO authenticated;
