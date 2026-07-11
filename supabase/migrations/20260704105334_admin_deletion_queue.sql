-- Silme Kuyruğu ekranı (Kararlar Soru 20): hesap silme talepleri panelden
-- görünür ve yönetilir. Bekleme süresi app_config.account_deletion_wait_days
-- (tek kaynak). İşleme admin_process_account_deletion (MODERATOR kapılı, audit);
-- aktif rezervasyon/ödeme guard'ı zaten o RPC ve DB trigger'ında zorlanır.

CREATE OR REPLACE FUNCTION public.admin_fetch_deletion_queue()
 RETURNS TABLE(
   user_id uuid, full_name text, email text, requested_at timestamptz,
   eligible_at timestamptz, is_eligible boolean, wait_days int
 )
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_wait int;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT COALESCE((value)::int, 7) INTO v_wait FROM public.app_config WHERE key = 'account_deletion_wait_days';
  v_wait := COALESCE(v_wait, 7);

  RETURN QUERY
  SELECT
    p.id,
    p.full_name::text,
    -- PII maskeli (Karar #39); ham değer Kullanıcı 360'ta audit'li
    CASE WHEN p.email IS NULL OR position('@' in p.email) = 0 THEN p.email::text
         ELSE left(split_part(p.email,'@',1),2) || '•••@' || left(split_part(p.email,'@',2),1) || '•••'
              || CASE WHEN position('.' in split_part(p.email,'@',2))>0
                      THEN '.' || split_part(split_part(p.email,'@',2),'.',-1) ELSE '' END
    END AS email,
    p.account_deletion_requested_at AS requested_at,
    (p.account_deletion_requested_at + (v_wait || ' days')::interval) AS eligible_at,
    (now() >= p.account_deletion_requested_at + (v_wait || ' days')::interval) AS is_eligible,
    v_wait AS wait_days
  FROM public.profiles p
  WHERE p.account_deletion_requested_at IS NOT NULL
  ORDER BY p.account_deletion_requested_at ASC;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_fetch_deletion_queue() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_fetch_deletion_queue() TO authenticated;
