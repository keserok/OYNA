-- ============================================================================
-- PARA ÇEKME (CASHOUT) KAPISI — kill-switch + TR IBAN doğrulaması
-- ----------------------------------------------------------------------------
-- DRIFT ONARIMI NOTU (2026-07-21): Canlıya MCP ile uygulanmış (ledger:
-- 20260721053143|cashout_kapisi) ancak repoya commit'lenmemişti. İçerik canlı
-- ledger'daki statements kaydından BİREBİR aktarılmıştır. request_payout'un
-- buradaki sürümü canlıdaki NİHAİ tanımdır (cashout kill-switch + TR IBAN
-- regex + kimlik kapısı) ve önceki sürümü bilinçli olarak ezer.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_cashout_status()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT jsonb_build_object(
    'enabled', COALESCE((SELECT (value)::text::boolean FROM public.app_config WHERE key = 'wallet_cashout_enabled'), false),
    'min',     COALESCE((SELECT (value)::text::numeric FROM public.app_config WHERE key = 'earnings_payout_min'), 100)
  );
$function$;

REVOKE ALL ON FUNCTION public.get_cashout_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_cashout_status() TO authenticated;

CREATE OR REPLACE FUNCTION public.request_payout(p_amount numeric, p_iban text, p_iban_holder_name text, p_payout_type text DEFAULT 'MANUAL'::text)
 RETURNS payout_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_balance numeric; v_wallet jsonb; v_payout public.payout_requests;
  v_role text; v_roles jsonb; v_idstat text; v_is_provider boolean; v_iban text; v_enabled boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  SELECT COALESCE((value)::text::boolean, false) INTO v_enabled FROM public.app_config WHERE key = 'wallet_cashout_enabled';
  IF NOT COALESCE(v_enabled, false) THEN
    RAISE EXCEPTION 'CASHOUT_DISABLED: Para cekme su an kapali. Yakinda admin onayiyla acilacak.';
  END IF;

  IF p_amount <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT: Tutar sifirdan buyuk olmali.'; END IF;

  v_iban := upper(regexp_replace(COALESCE(p_iban, ''), '\s', '', 'g'));
  IF v_iban !~ '^TR[0-9]{24}$' THEN RAISE EXCEPTION 'INVALID_IBAN: Gecerli bir TR IBAN girin.'; END IF;

  SELECT role, roles INTO v_role, v_roles FROM public.profiles WHERE id = v_uid;
  v_is_provider := v_role IN ('GOALKEEPER','REFEREE') OR (v_roles ? 'GOALKEEPER') OR (v_roles ? 'REFEREE');
  IF v_is_provider THEN
    SELECT status INTO v_idstat FROM public.provider_identities WHERE user_id = v_uid;
    IF v_idstat IS DISTINCT FROM 'VERIFIED' THEN RAISE EXCEPTION 'IDENTITY_REQUIRED: Odeme almadan once TC kimlik dogrulamasi gerekli.'; END IF;
  END IF;
  v_wallet := public.get_wallet_summary(); v_balance := (v_wallet->>'earnings_balance')::numeric;
  IF v_balance < p_amount THEN RAISE EXCEPTION 'INSUFFICIENT_BALANCE: Bakiye yetersiz. Mevcut: %', v_balance; END IF;
  IF EXISTS (SELECT 1 FROM public.payout_requests WHERE user_id = v_uid AND status = 'PENDING') THEN
    RAISE EXCEPTION 'PENDING_PAYOUT: Bekleyen odeme talebiniz mevcut.'; END IF;
  INSERT INTO public.payout_requests (user_id, amount, iban, iban_holder_name, payout_type)
  VALUES (v_uid, p_amount, v_iban, p_iban_holder_name, p_payout_type) RETURNING * INTO v_payout;
  INSERT INTO public.wallet_transactions (user_id, amount, type, balance_type, status, reference_type, reference_id, description)
  VALUES (v_uid, p_amount, 'WITHDRAWAL', 'EARNINGS', 'PENDING', 'PAYOUT', v_payout.id, 'IBAN odeme talebi');
  RETURN v_payout;
END; $function$;
