-- ==============================================================================
-- FAZ 7 — Model B net dağıtım (USER kararı: markup oyuncuya EKlenir, owner %95)
-- ------------------------------------------------------------------------------
-- Önceki formül: net = amount - (rate+markup) → owner %75 (YANLIŞ).
-- Doğru semantik (§4): saha sahibi tabanın %95'ini alır; markup oyuncu ödemesine
-- EK biner ve tamamı OYNA'ya gider.
--   owner_net    = base × (1 - rate%)            (markup owner'ı etkilemez; ikisinde de)
--   oyna_take    = base × rate% + base × markup% (markup yalnız Model B)
--   player_total = base + base × markup%         (markup yalnız Model B; oyuncu öder)
-- Model B tetikleyici: saha sahibi KENDİ sahasında maç açarsa → MODEL_B (otomatik).
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.calculate_commission(
  p_amount   numeric,
  p_scope    text DEFAULT 'GLOBAL',
  p_scope_id uuid DEFAULT NULL,
  p_model    text DEFAULT 'MODEL_A'
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE
  v_cfg RECORD; v_rate numeric; v_markup numeric;
  v_rate_amt numeric; v_markup_amt numeric; v_oyna_take numeric; v_owner_net numeric; v_player_total numeric;
BEGIN
  SELECT rate_pct, markup_pct INTO v_cfg
  FROM public.commission_config
  WHERE is_active = true AND model = p_model AND scope = p_scope
    AND (scope_id = p_scope_id OR scope_id IS NULL)
  ORDER BY (scope_id = p_scope_id) DESC NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    SELECT rate_pct, markup_pct INTO v_cfg
    FROM public.commission_config
    WHERE is_active = true AND model = p_model AND scope = 'GLOBAL' AND scope_id IS NULL
    LIMIT 1;
  END IF;

  v_rate   := COALESCE(v_cfg.rate_pct,   CASE WHEN p_model = 'MODEL_B' THEN 5.0  ELSE 15.0 END);
  v_markup := COALESCE(v_cfg.markup_pct, CASE WHEN p_model = 'MODEL_B' THEN 20.0 ELSE 0.0  END);

  v_rate_amt     := round(p_amount * v_rate   / 100.0, 2);
  v_markup_amt   := CASE WHEN p_model = 'MODEL_B' THEN round(p_amount * v_markup / 100.0, 2) ELSE 0 END;
  v_owner_net    := p_amount - v_rate_amt;            -- markup owner'ı ETKİLEMEZ → owner %95
  v_oyna_take    := v_rate_amt + v_markup_amt;        -- OYNA: rate + markup
  v_player_total := p_amount + v_markup_amt;          -- markup oyuncuya EKlenir

  RETURN jsonb_build_object(
    'amount',         p_amount,
    'base',           p_amount,
    'commission_pct', v_rate,
    'markup_pct',     v_markup,
    'markup_amt',     v_markup_amt,
    'commission_amt', v_oyna_take,     -- geriye-uyum: OYNA toplam payı
    'net_amount',     v_owner_net,     -- geriye-uyum: owner net (artık doğru %95)
    'owner_net',      v_owner_net,
    'oyna_take',      v_oyna_take,
    'player_total',   v_player_total,
    'model',          p_model
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.calculate_commission(numeric, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calculate_commission(numeric, text, uuid, text) TO authenticated, service_role;

-- create_match_preauth: Model B'de oyuncudan player_total (taban+markup) bloke edilir;
-- owner owner_net (%95), OYNA oyna_take alır.
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
      v_uid, p_match_id, v_pitch_id,
      (v_comm->>'player_total')::numeric,    -- oyuncudan tahsil (Model B: taban+markup)
      'TRY', 'PENDING', p_provider,
      (v_comm->>'oyna_take')::numeric,
      (v_comm->>'owner_net')::numeric,
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

-- ── Model B tetikleyici: saha sahibi KENDİ sahasında maç açtıysa otomatik MODEL_B ──
-- (Yalnız yükseltir; açıkça verilen modeli düşürmez → testler/özel akışlar bozulmaz.)
CREATE OR REPLACE FUNCTION public._set_match_commission_model()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_owner uuid;
BEGIN
  IF NEW.pitch_id IS NOT NULL AND NEW."creatorId" IS NOT NULL THEN
    SELECT owner_id INTO v_owner FROM public.pitches WHERE id = NEW.pitch_id;
    IF v_owner IS NOT NULL AND v_owner = NEW."creatorId" THEN
      NEW.commission_model := 'MODEL_B';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public._set_match_commission_model() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_set_match_commission_model ON public.matches;
CREATE TRIGGER trg_set_match_commission_model
  BEFORE INSERT ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public._set_match_commission_model();
