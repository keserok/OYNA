-- FAZ 9 — Kokpit Ödeme sekmesi: maça bağlı ödeme niyetlerini (payment_intents) getir.
CREATE OR REPLACE FUNCTION public.admin_fetch_match_intents(p_match_id uuid)
RETURNS TABLE(id uuid, user_id uuid, user_name text, amount numeric, status text,
              commission_amount numeric, owner_amount numeric, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  RETURN QUERY
    SELECT pi.id, pi.user_id, COALESCE(pr.full_name, pr.email, '—') AS user_name,
           pi.amount, pi.status, pi.commission_amount, pi.owner_amount, pi.created_at
    FROM public.payment_intents pi
    LEFT JOIN public.profiles pr ON pr.id = pi.user_id
    WHERE pi.match_id = p_match_id
    ORDER BY pi.created_at DESC;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_fetch_match_intents(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_fetch_match_intents(uuid) TO authenticated;
