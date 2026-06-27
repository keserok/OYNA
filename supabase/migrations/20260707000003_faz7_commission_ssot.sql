-- ==============================================================================
-- FAZ 7 — Komisyon TEK-KAYNAK (SSOT) + Model B + tam admin-yönetimi
-- ------------------------------------------------------------------------------
-- PROBLEM (denetimde yakalandı):
--   • create_payment_intent (doğrudan rezervasyon) komisyonu commission_config
--     motorundan DEĞİL, pitches.platform_commission_rate'ten (default %10) okuyordu
--     → §4.2 SSOT ihlali + yeni sahalar %15 yerine %10 kesiyordu (gizli eksik tahsilat).
--   • Model B (saha %95 / OYNA %5 + %20 markup) hiç seed edilmemişti, calculate_commission
--     model seçilemiyordu (satır modeli sabit).
--
-- ÇÖZÜM:
--   1) calculate_commission MODEL-BİLİNÇLİ hale gelir (p_model param + model-bazlı fallback).
--   2) create_payment_intent motora bağlanır → TEK komisyon kaynağı: commission_config.
--   3) Model B GLOBAL kuralı seed edilir (%5 + %20).
--   4) matches.commission_model: maç başına model (owner-organize → MODEL_B).
--   5) commission_config'e aktif-tekillik index'i → admin çelişkili kural giremez.
--   Tüm oranlar admin panelinden (commission_config, RLS: is_platform_admin) yönetilir.
-- ==============================================================================

-- ── 1) calculate_commission — model-bilinçli, tek fonksiyon (overload yok) ─────
-- Eski 3-arg imza DROP edilir; yeni 4-arg (hepsi default) tüm mevcut çağrıları
-- (2-arg/3-arg) karşılar → "function is not unique" belirsizliği oluşmaz.
DROP FUNCTION IF EXISTS public.calculate_commission(numeric, text, uuid);

CREATE OR REPLACE FUNCTION public.calculate_commission(
  p_amount   numeric,
  p_scope    text DEFAULT 'GLOBAL',
  p_scope_id uuid DEFAULT NULL,
  p_model    text DEFAULT 'MODEL_A'
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE
  v_cfg RECORD; v_rate numeric; v_markup numeric; v_comm numeric; v_markup_amt numeric; v_net numeric;
BEGIN
  -- En özel kapsam önce: (scope, scope_id) tam eşleşme → (scope, NULL) kapsam-varsayılanı
  SELECT rate_pct, markup_pct INTO v_cfg
  FROM public.commission_config
  WHERE is_active = true AND model = p_model AND scope = p_scope
    AND (scope_id = p_scope_id OR scope_id IS NULL)
  ORDER BY (scope_id = p_scope_id) DESC NULLS LAST
  LIMIT 1;

  -- Kapsamda kural yoksa GLOBAL'a düş
  IF NOT FOUND THEN
    SELECT rate_pct, markup_pct INTO v_cfg
    FROM public.commission_config
    WHERE is_active = true AND model = p_model AND scope = 'GLOBAL' AND scope_id IS NULL
    LIMIT 1;
  END IF;

  -- Config hiç yoksa bile PRENSİP oranıyla fallback: Model A=%15/0, Model B=%5/%20
  v_rate   := COALESCE(v_cfg.rate_pct,   CASE WHEN p_model = 'MODEL_B' THEN 5.0  ELSE 15.0 END);
  v_markup := COALESCE(v_cfg.markup_pct, CASE WHEN p_model = 'MODEL_B' THEN 20.0 ELSE 0.0  END);

  v_comm       := round(p_amount * v_rate / 100.0, 2);
  v_markup_amt := CASE WHEN p_model = 'MODEL_B' THEN round(p_amount * v_markup / 100.0, 2) ELSE 0 END;
  v_comm       := v_comm + v_markup_amt;
  v_net        := p_amount - v_comm;

  RETURN jsonb_build_object(
    'amount',         p_amount,
    'commission_pct', v_rate,
    'markup_pct',     v_markup,
    'markup_amt',     v_markup_amt,
    'commission_amt', v_comm,
    'net_amount',     v_net,
    'model',          p_model
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.calculate_commission(numeric, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calculate_commission(numeric, text, uuid, text) TO authenticated, service_role;

-- ── 2) Tekillik index'lerini MODEL-bilinçli yap ──────────────────────────────
-- Eski tasarım (scope) / (scope,scope_id) üzerinde tekildi → bir kapsamda yalnız
-- TEK model olabiliyordu (GLOBAL Model A + Model B birlikte İMKANSIZ; per-saha tek
-- model). Model boyutu eklenir: aynı kapsamda hem A hem B + per-saha override mümkün.
DROP INDEX IF EXISTS public.uq_commission_config_default;
DROP INDEX IF EXISTS public.uq_commission_config_scoped;
CREATE UNIQUE INDEX uq_commission_config_default
  ON public.commission_config (scope, model) WHERE scope_id IS NULL;
CREATE UNIQUE INDEX uq_commission_config_scoped
  ON public.commission_config (scope, scope_id, model) WHERE scope_id IS NOT NULL;

-- ── 3) Model B GLOBAL kuralını seed et (idempotent) ──────────────────────────
INSERT INTO public.commission_config (scope, scope_id, model, rate_pct, markup_pct, is_active, notes)
SELECT 'GLOBAL', NULL, 'MODEL_B', 5.0, 20.0, true,
       'Model B: saha sahibi/OYNA-organize maç — OYNA %5 + %20 markup (admin ayarlı)'
WHERE NOT EXISTS (
  SELECT 1 FROM public.commission_config WHERE scope='GLOBAL' AND model='MODEL_B' AND scope_id IS NULL
);

-- ── 4) create_payment_intent → komisyonu MOTORDAN al (SSOT; %10 bug'ı biter) ──
CREATE OR REPLACE FUNCTION public.create_payment_intent(p_booking_id uuid, p_provider text DEFAULT 'SIMULATION'::text)
RETURNS payment_intents LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE
  b RECORD;
  v_amount numeric;
  v_comm jsonb;
  v_commission numeric;
  v_existing public.payment_intents;
  v_intent public.payment_intents;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED: Giris gerekli.'; END IF;

  SELECT * INTO b FROM public.pitch_bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Rezervasyon bulunamadi.'; END IF;
  IF b.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Bu rezervasyon size ait degil.';
  END IF;
  IF b.status = 'CANCELLED' THEN RAISE EXCEPTION 'CANCELLED: Iptal edilmis rezervasyon odenemez.'; END IF;

  v_amount := COALESCE(b.deposit_amount, 0);
  IF v_amount <= 0 THEN RAISE EXCEPTION 'NO_DEPOSIT: Bu rezervasyon icin online kapora gerekmiyor.'; END IF;

  IF EXISTS (SELECT 1 FROM public.payment_intents WHERE booking_id = p_booking_id AND status = 'PAID') THEN
    RAISE EXCEPTION 'ALREADY_PAID: Bu rezervasyonun kaporasi zaten odenmis.';
  END IF;

  SELECT * INTO v_existing FROM public.payment_intents
    WHERE booking_id = p_booking_id AND status = 'PENDING'
    ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN RETURN v_existing; END IF;

  -- TEK KAYNAK: doğrudan rezervasyon = Model A; oran commission_config'ten (PITCH→GLOBAL→%15).
  v_comm := public.calculate_commission(v_amount, 'PITCH', b.pitch_id, 'MODEL_A');
  v_commission := (v_comm->>'commission_amt')::numeric;

  INSERT INTO public.payment_intents (booking_id, user_id, pitch_id, amount, provider, commission_amount, owner_amount, commission_model)
  VALUES (p_booking_id, auth.uid(), b.pitch_id, v_amount, p_provider, v_commission, v_amount - v_commission, 'MODEL_A')
  RETURNING * INTO v_intent;

  RETURN v_intent;
END;
$function$;
REVOKE ALL ON FUNCTION public.create_payment_intent(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_payment_intent(uuid, text) TO authenticated, service_role;

-- pitches.platform_commission_rate ARTIK OKUNMUYOR (deprecated; per-saha override
-- için admin commission_config'e PITCH-kapsam kuralı ekler). Kolon geriye-uyum için kalır.
COMMENT ON COLUMN public.pitches.platform_commission_rate IS
  'DEPRECATED (Faz 7 SSOT): komisyon artık commission_config''ten okunur. Per-saha override = commission_config PITCH kapsamı.';

-- ── 5) matches.commission_model — maç başına model (owner-organize → MODEL_B) ──
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS commission_model text NOT NULL DEFAULT 'MODEL_A'
  CHECK (commission_model IN ('MODEL_A','MODEL_B'));

-- create_match_preauth → maçın modelini calculate_commission'a geçir
CREATE OR REPLACE FUNCTION public.create_match_preauth(p_match_id uuid, p_amount numeric, p_provider text DEFAULT 'IYZICO'::text)
RETURNS payment_intents LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_match    RECORD;
  v_pitch_id uuid;
  v_scope    text;
  v_model    text;
  v_comm     jsonb;
  v_intent   public.payment_intents;
  v_existing public.payment_intents;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;

  SELECT id, pitch_id, price, commission_model INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: Maç bulunamadı.'; END IF;

  IF v_match.price IS NOT NULL AND p_amount > v_match.price THEN
    RAISE EXCEPTION 'AMOUNT_EXCEEDS_PRICE: Blokaj tutarı maç fiyatını aşamaz.';
  END IF;

  v_pitch_id := v_match.pitch_id;

  SELECT * INTO v_existing FROM public.payment_intents
  WHERE match_id = p_match_id AND user_id = v_uid
    AND status IN ('PENDING','BLOCKED') ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN RETURN v_existing; END IF;

  v_scope := CASE WHEN v_pitch_id IS NOT NULL THEN 'PITCH' ELSE 'GLOBAL' END;
  v_model := COALESCE(v_match.commission_model, 'MODEL_A');
  v_comm  := public.calculate_commission(p_amount, v_scope, v_pitch_id, v_model);

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

-- NOT (go-live): process_match_at_deadline da kapora tahsilinde komisyonu hesaplar;
-- owner Model-B maç oluşturma akışı devreye girince oradaki calculate_commission
-- çağrısı da m.commission_model geçecek şekilde güncellenmeli. Şu an tüm maçlar
-- MODEL_A (varsayılan) olduğundan mevcut davranış doğru.
--
-- ── go-live Model B kontrol listesi (adversarial denetim notları) ──
-- (1) NET DAĞITIM: Model B'de fonksiyon net = amount - (rate+markup) hesaplar →
--     owner amount'un %75'ini alır. Prensip "owner taban fiyatın %95'ini alır,
--     markup oyuncuya EK olarak biner" diyor. Owner-organize Model B akışı
--     açılmadan ÖNCE markup-üstüne semantiği netleştirilip net hesabı düzeltilmeli
--     (taban → owner %95; markup oyuncu ödemesine eklenir; OYNA = %5 + markup).
--     Bugün üretimde Model B intent üreten yol YOK → canlı risk yok.
-- (2) DEĞİŞMEZLİK: 2-arg calculate_commission çağrıları (faz5 service engine,
--     process_match_at_deadline) p_model'i MODEL_A varsayar. SERVICE_GK/SERVICE_REF
--     ve maç-deadline kapsamlarında DAİMA bir MODEL_A kuralı bulunmalı; aksi halde
--     o kapsamdaki yalnız-MODEL_B kural sessizce atlanıp GLOBAL'a düşer.
