-- ==============================================================================
-- FAZ 7 — Komisyon MAÇ-kapsamı önceliği (4. seviye: global/saha/hizmet/MAÇ)
-- ------------------------------------------------------------------------------
-- §4: komisyon "global/saha/hizmet/maç" seviyelerinde ayarlanabilir. commission_config
-- MATCH kapsamını destekliyor ve admin paneli MATCH kuralı girebiliyordu, ANCAK
-- create_match_preauth yalnız PITCH kapsamına bakıyordu → admin'in girdiği maç-özel
-- kural sessizce etkisizdi. Öncelik: MAÇ (varsa) → SAHA → GLOBAL.
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.create_match_preauth(p_match_id uuid, p_amount numeric, p_provider text DEFAULT 'IYZICO'::text)
RETURNS payment_intents LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_match    RECORD;
  v_pitch_id uuid;
  v_scope    text;
  v_scope_id uuid;
  v_model    text;
  v_comm     jsonb;
  v_intent   public.payment_intents;
  v_existing public.payment_intents;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;

  SELECT id, pitch_id, price, commission_model INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Mac bulunamadi.'; END IF;

  IF v_match.price IS NOT NULL AND p_amount > v_match.price THEN
    RAISE EXCEPTION 'AMOUNT_EXCEEDS_PRICE: Blokaj tutari mac fiyatini asamaz.';
  END IF;

  v_pitch_id := v_match.pitch_id;
  v_model    := COALESCE(v_match.commission_model, 'MODEL_A');

  SELECT * INTO v_existing FROM public.payment_intents
  WHERE match_id = p_match_id AND user_id = v_uid
    AND status IN ('PENDING','BLOCKED') ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN RETURN v_existing; END IF;

  -- Öncelik: MAÇ-özel kural varsa onu kullan; yoksa SAHA (calculate_commission içinde
  -- GLOBAL'a düşer). Böylece dört seviye (MAÇ/SAHA/GLOBAL) de etkili olur.
  IF EXISTS (SELECT 1 FROM public.commission_config
             WHERE scope='MATCH' AND scope_id=p_match_id AND model=v_model AND is_active) THEN
    v_scope := 'MATCH'; v_scope_id := p_match_id;
  ELSE
    v_scope := CASE WHEN v_pitch_id IS NOT NULL THEN 'PITCH' ELSE 'GLOBAL' END;
    v_scope_id := v_pitch_id;
  END IF;
  v_comm := public.calculate_commission(p_amount, v_scope, v_scope_id, v_model);

  BEGIN
    INSERT INTO public.payment_intents (
      user_id, match_id, pitch_id, amount, currency, status, provider,
      commission_amount, owner_amount, service_provider_amount,
      commission_model, related_entity_type
    ) VALUES (
      v_uid, p_match_id, v_pitch_id, p_amount, 'TRY', 'PENDING', p_provider,
      (v_comm->>'commission_amt')::numeric,
      (v_comm->>'net_amount')::numeric,
      0,
      v_comm->>'model',
      'MATCH'
    )
    RETURNING * INTO v_intent;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_intent FROM public.payment_intents
    WHERE match_id = p_match_id AND user_id = v_uid
      AND status IN ('PENDING','BLOCKED') ORDER BY created_at DESC LIMIT 1;
  END;

  RETURN v_intent;
END;
$function$;
REVOKE ALL ON FUNCTION public.create_match_preauth(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_match_preauth(uuid, numeric, text) TO authenticated, service_role;
