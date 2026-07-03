-- Kullanıcı 360 / KVKK (Karar #38-39): PII varsayılan maskeli gösterilir;
-- admin "göster"e tıkladığında bu RPC zorunlu audit kaydı düşer.
-- Böylece "verilerime kim erişti" sorusuna admin_audit_log'dan yanıt verilebilir.

CREATE OR REPLACE FUNCTION public.admin_log_pii_reveal(p_target_user_id uuid, p_field text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  PERFORM public.log_admin_action(
    'PII_REVEAL', 'user', p_target_user_id, p_field,
    NULL, jsonb_build_object('field', p_field)
  );
END;
$function$;
GRANT EXECUTE ON FUNCTION public.admin_log_pii_reveal(uuid, text) TO authenticated;
