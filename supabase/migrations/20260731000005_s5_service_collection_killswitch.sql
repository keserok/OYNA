-- ════════════════════════════════════════════════════════════════════════════
-- [S5] HİZMET TAHSİLATI KILL-SWITCH — kaleci/hakem ücret akışı acil durdurma
-- ────────────────────────────────────────────────────────────────────────────
-- Kaleci/hakem hizmet ücreti emanet (escrow) akışı FAZ 4'te (20260723000000)
-- kill-switch'ten ÖNCE kurulmuştu ve canlıya bağlıydı. DoD disiplini gereği her
-- para akışı tek anahtarla kapatılabilir olmalı → fund_service_request'e (paranın
-- emanete girdiği tek nokta) service_collection_enabled kapısı eklenir.
--
-- Mevcut+bağlı akış olduğu için AÇIK doğar (yeni akış değil; acil durdurma valfi).
-- Kapatılınca yeni fonlama durur; süregelen talepler etkilenmez (yalnız giriş kapanır).
-- Gövde 20260723000000 ile BİREBİR; yalnız tek IF kapısı eklendi.
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO public.app_config (key, value, value_type, category, label, description, is_public, min_value, max_value) VALUES
  ('service_collection_enabled', 'true'::jsonb, 'boolean', 'HIZMET',
   'Hizmet Tahsilatı Açık',
   'AÇIK iken kaptan kaleci/hakem hizmet ücretini cüzdandan fonlayabilir (emanet). KAPALI iken yeni hizmet fonlaması durur (acil durdurma); süregelen talepler etkilenmez.',
   false, NULL, NULL)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.fund_service_request(p_request_id uuid, p_source text DEFAULT 'WALLET')
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_req public.service_requests; v_intent public.payment_intents;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  -- [S5] Kill-switch: kapalıysa yeni fonlama durur (acil durdurma).
  IF NOT public.get_config_bool('service_collection_enabled', true) THEN
    RAISE EXCEPTION 'SERVICE_COLLECTION_DISABLED: Hizmet ödemesi şu an geçici olarak kapalı.';
  END IF;

  IF p_source NOT IN ('WALLET','CARD') THEN RAISE EXCEPTION 'INVALID_SOURCE'; END IF;
  SELECT * INTO v_req FROM public.service_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_req.requested_by IS DISTINCT FROM v_uid AND NOT public.is_platform_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF v_req.status <> 'PENDING' THEN RAISE EXCEPTION 'INVALID_STATE: Yalnız bekleyen talep fonlanır (mevcut: %).', v_req.status; END IF;
  SELECT * INTO v_intent FROM public.payment_intents WHERE id = v_req.payment_intent_id FOR UPDATE;
  IF v_intent.status = 'BLOCKED' THEN
    RETURN jsonb_build_object('request_id', p_request_id, 'status', 'ALREADY_FUNDED', 'source', v_req.funding_source);
  END IF;
  IF p_source = 'WALLET' THEN
    PERFORM public.wallet_spend_balance(v_uid, v_req.fee, 'MATCH', v_req.match_id, v_req.match_id,
      'Kaleci/hakem hizmet ödemesi (emanet)');
  END IF;
  UPDATE public.payment_intents
    SET status = 'BLOCKED', provider = (CASE WHEN p_source = 'CARD' THEN 'IYZICO' ELSE 'WALLET' END)
    WHERE id = v_req.payment_intent_id;
  UPDATE public.service_requests SET funding_source = p_source WHERE id = p_request_id;
  RETURN jsonb_build_object('request_id', p_request_id, 'status', 'FUNDED', 'source', p_source, 'amount', v_req.fee);
END; $function$;
GRANT EXECUTE ON FUNCTION public.fund_service_request(uuid, text) TO authenticated;
