-- FAZ 4.4 — Admin payout yönetimi: payout_requests listeleme (is_platform_admin korumalı).
-- İşleme için mevcut admin_process_payout RPC'si kullanılır.
CREATE OR REPLACE FUNCTION public.admin_fetch_payouts(p_status text DEFAULT 'PENDING', p_limit integer DEFAULT 100)
 RETURNS SETOF public.payout_requests
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  RETURN QUERY
    SELECT * FROM public.payout_requests
    WHERE (p_status = 'ALL' OR status = p_status)
    ORDER BY created_at DESC
    LIMIT GREATEST(p_limit, 1);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_fetch_payouts(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_fetch_payouts(text, integer) TO authenticated;
