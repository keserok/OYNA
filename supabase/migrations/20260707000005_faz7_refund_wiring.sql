-- ==============================================================================
-- FAZ 7 — Kademeli iade motorunu GERÇEK çağırıcıya bağla (admin cockpit)
-- ------------------------------------------------------------------------------
-- process_tiered_refund yazılıydı ama yalnız testlerde çağrılıyordu (§8.6 "force
-- refund" + §3.3/§4.4 kademeli iade). admin_refund_intent: admin paneli Maç Kontrol
-- Paneli'nden bir ödeme niyetine kademeli iade uygular (politika gereği FULL/CREDIT/
-- NONE veya pre-capture VOID), audit'ler. SIMULATION-güvenli (iyzico gerekmez; iade
-- OYNA kredisine yazılır). Karta iade = go-live'da refund-payment edge (iyzico).
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.admin_refund_intent(p_intent_id uuid, p_notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_intent public.payment_intents;
  v_hours  numeric;
  v_start  timestamptz;
  v_res    jsonb;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  SELECT * INTO v_intent FROM public.payment_intents WHERE id = p_intent_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  -- Maça/rezervasyona kalan saati hesapla (kademe seçimi için)
  IF v_intent.match_id IS NOT NULL THEN
    SELECT starts_at INTO v_start FROM public.matches WHERE id = v_intent.match_id;
  ELSIF v_intent.booking_id IS NOT NULL THEN
    SELECT (booking_date + start_time)::timestamptz INTO v_start
    FROM public.pitch_bookings WHERE id = v_intent.booking_id;
  END IF;
  v_hours := CASE WHEN v_start IS NULL THEN 999
                  ELSE GREATEST(0, EXTRACT(EPOCH FROM (v_start - now())) / 3600.0) END;

  -- Kademeli iade motoru (admin auth.uid() → process_tiered_refund yetki kapısını geçer)
  v_res := public.process_tiered_refund(p_intent_id, v_hours);

  PERFORM public.log_admin_action('FORCE_REFUND', 'payment_intent', p_intent_id, NULL,
    jsonb_build_object('status', v_intent.status, 'amount', v_intent.amount),
    jsonb_build_object('result', v_res, 'hours_to_match', round(v_hours,2), 'notes', p_notes));

  RETURN v_res;
END; $$;
REVOKE ALL ON FUNCTION public.admin_refund_intent(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_refund_intent(uuid, text) TO authenticated;
