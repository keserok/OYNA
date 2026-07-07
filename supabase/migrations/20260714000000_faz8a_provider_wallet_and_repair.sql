-- ==============================================================================
-- FAZ 8A — Kaleci & Hakem: cüzdan + pazaryeri onarımı
-- (docs/master/KALECI_HAKEM_PAZARYERI_PLANI.md — 8A.2/8A.3/8A.4/8A.5)
-- ------------------------------------------------------------------------------
-- 1) payout_methods: kayıtlı ödeme yöntemleri (IBAN + kart) — kart no ASLA açık
--    saklanmaz (yalnız son 4 hane + simülasyon token'ı; PSP tokenizasyonu göç yolu).
-- 2) request_payout_with_method: kayıtlı yöntemle çekim (TC kimlik kapısı korunur).
-- 3) provider_update_own_profile: sağlayıcı self-servis profil/müsaitlik kaydı
--    (admin_update_goalkeeper/referee'nin sağlayıcıda UNAUTHORIZED vermesi ve
--    working_hours/settings alanlarını yok sayması bu RPC ile çözülür).
-- 4) Talep bildirimleri: create/respond/expire → notifications INSERT (push,
--    mevcut send-push webhook'u ile otomatik tetiklenir).
-- 5) Dinamik TTL + expire_service_requests süpürücüsü (EXPIRED ölü alanı canlanır;
--    blokajlı intent void edilir).
-- NOT: goalkeepers/referees canlı kolonları camelCase ("preferredZones") +
--      working_hours/settings snake_case — mevcut RPC'lerle aynı gerçeklik.
-- ==============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 0. Şema sapması onarımı: canlı goalkeepers/referees tablolarında working_hours
--    ve settings kolonları YOK (migration dosyası 20260530000000 tanımlamıştı ama
--    canlı şema camelCase yeniden kurulumunda bu kolonlar düşmüş). Sağlayıcının
--    müsaitlik saatleri ve ayarları bu kolonlarda yaşayacak.
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.goalkeepers
  ADD COLUMN IF NOT EXISTS working_hours jsonb,
  ADD COLUMN IF NOT EXISTS settings jsonb;
ALTER TABLE public.referees
  ADD COLUMN IF NOT EXISTS working_hours jsonb,
  ADD COLUMN IF NOT EXISTS settings jsonb;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. payout_methods — kayıtlı ödeme yöntemleri
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payout_methods (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('IBAN','CARD')),
  label        text,
  holder_name  text NOT NULL,
  iban         text,
  card_last4   text,
  card_brand   text,
  card_token   text,          -- PSP token (şimdilik simülasyon; PAN asla saklanmaz)
  is_default   boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payout_methods_kind_fields CHECK (
    (kind = 'IBAN' AND iban IS NOT NULL) OR
    (kind = 'CARD' AND card_last4 IS NOT NULL AND card_token IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_payout_methods_user ON public.payout_methods(user_id);
-- Kullanıcı başına tek varsayılan yöntem
CREATE UNIQUE INDEX IF NOT EXISTS uq_payout_methods_default
  ON public.payout_methods(user_id) WHERE is_default = true;

ALTER TABLE public.payout_methods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own payout methods" ON public.payout_methods;
CREATE POLICY "Users view own payout methods"
  ON public.payout_methods FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.is_platform_admin());
-- Yazma yalnız SECURITY DEFINER RPC'lerle (ev stili) — INSERT/UPDATE/DELETE policy yok.

-- payout_requests: kayıtlı yöntem izi (nullable — geriye uyumlu)
ALTER TABLE public.payout_requests
  ADD COLUMN IF NOT EXISTS payout_method_id uuid REFERENCES public.payout_methods(id),
  ADD COLUMN IF NOT EXISTS method_kind text CHECK (method_kind IN ('IBAN','CARD'));

-- ── add_payout_method ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.add_payout_method(
  p_kind        text,
  p_holder_name text,
  p_label       text DEFAULT NULL,
  p_iban        text DEFAULT NULL,
  p_card_number text DEFAULT NULL,
  p_card_brand  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_iban   text;
  v_digits text;
  v_row    public.payout_methods;
  v_count  int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_kind NOT IN ('IBAN','CARD') THEN RAISE EXCEPTION 'INVALID_KIND'; END IF;
  IF p_holder_name IS NULL OR length(trim(p_holder_name)) < 3 THEN
    RAISE EXCEPTION 'NAME_REQUIRED: Hesap/kart sahibinin adı gerekli.';
  END IF;

  SELECT count(*) INTO v_count FROM public.payout_methods WHERE user_id = v_uid;
  IF v_count >= 5 THEN
    RAISE EXCEPTION 'METHOD_LIMIT: En fazla 5 ödeme yöntemi kaydedebilirsin.';
  END IF;

  IF p_kind = 'IBAN' THEN
    v_iban := upper(regexp_replace(COALESCE(p_iban,''), '\s', '', 'g'));
    IF v_iban !~ '^TR[0-9]{24}$' THEN
      RAISE EXCEPTION 'INVALID_IBAN: IBAN "TR" ile başlamalı ve 26 karakter olmalı.';
    END IF;
    INSERT INTO public.payout_methods (user_id, kind, label, holder_name, iban, is_default)
    VALUES (v_uid, 'IBAN', NULLIF(trim(COALESCE(p_label,'')),''), trim(p_holder_name), v_iban, v_count = 0)
    RETURNING * INTO v_row;
  ELSE
    v_digits := regexp_replace(COALESCE(p_card_number,''), '\s', '', 'g');
    IF v_digits !~ '^[0-9]{12,19}$' THEN
      RAISE EXCEPTION 'INVALID_CARD: Kart numarası 12-19 haneli olmalı.';
    END IF;
    -- PAN saklanmaz: yalnız son 4 hane + tokenizasyon (simülasyon; iyzico'da kart token'ı yazılacak)
    INSERT INTO public.payout_methods (user_id, kind, label, holder_name, card_last4, card_brand, card_token, is_default)
    VALUES (v_uid, 'CARD', NULLIF(trim(COALESCE(p_label,'')),''), trim(p_holder_name),
            right(v_digits, 4),
            COALESCE(NULLIF(trim(COALESCE(p_card_brand,'')),''),
                     CASE left(v_digits,1) WHEN '4' THEN 'VISA' WHEN '5' THEN 'MASTERCARD' ELSE 'KART' END),
            'SIM_' || replace(gen_random_uuid()::text, '-', ''),
            v_count = 0)
    RETURNING * INTO v_row;
  END IF;

  RETURN jsonb_build_object('id', v_row.id, 'kind', v_row.kind, 'is_default', v_row.is_default);
END;
$$;
REVOKE ALL ON FUNCTION public.add_payout_method(text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_payout_method(text, text, text, text, text, text) TO authenticated;

-- ── delete_payout_method ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_payout_method(p_method_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.payout_methods;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT * INTO v_row FROM public.payout_methods WHERE id = p_method_id AND user_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF EXISTS (SELECT 1 FROM public.payout_requests
             WHERE payout_method_id = p_method_id AND status IN ('PENDING','PROCESSING')) THEN
    RAISE EXCEPTION 'METHOD_IN_USE: Bu yöntemle bekleyen bir çekim talebin var.';
  END IF;
  DELETE FROM public.payout_methods WHERE id = p_method_id;
  -- Varsayılan silindiyse kalan en eski yöntemi varsayılan yap
  IF v_row.is_default THEN
    UPDATE public.payout_methods SET is_default = true
    WHERE id = (SELECT id FROM public.payout_methods WHERE user_id = v_uid ORDER BY created_at LIMIT 1);
  END IF;
  RETURN jsonb_build_object('deleted', p_method_id);
END;
$$;
REVOKE ALL ON FUNCTION public.delete_payout_method(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_payout_method(uuid) TO authenticated;

-- ── set_default_payout_method ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_default_payout_method(p_method_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.payout_methods WHERE id = p_method_id AND user_id = v_uid) THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  UPDATE public.payout_methods SET is_default = false WHERE user_id = v_uid AND is_default = true;
  UPDATE public.payout_methods SET is_default = true WHERE id = p_method_id;
  RETURN jsonb_build_object('default', p_method_id);
END;
$$;
REVOKE ALL ON FUNCTION public.set_default_payout_method(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_default_payout_method(uuid) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. request_payout_with_method — kayıtlı yöntemle çekim
--    request_payout ile AYNI kapılar: TC kimlik (sağlayıcı), bakiye, tek PENDING.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.request_payout_with_method(
  p_amount    numeric,
  p_method_id uuid
)
RETURNS public.payout_requests
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_method      public.payout_methods;
  v_wallet      jsonb;
  v_balance     numeric;
  v_payout      public.payout_requests;
  v_role        text;
  v_roles       jsonb;
  v_idstat      text;
  v_is_provider boolean;
  v_iban_disp   text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT: Tutar sifirdan buyuk olmali.'; END IF;

  SELECT * INTO v_method FROM public.payout_methods WHERE id = p_method_id AND user_id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'METHOD_NOT_FOUND: Kayitli odeme yontemi bulunamadi.'; END IF;

  SELECT role, roles INTO v_role, v_roles FROM public.profiles WHERE id = v_uid;
  v_is_provider := v_role IN ('GOALKEEPER','REFEREE')
                   OR (COALESCE(v_roles,'[]'::jsonb) ? 'GOALKEEPER')
                   OR (COALESCE(v_roles,'[]'::jsonb) ? 'REFEREE');
  IF v_is_provider THEN
    SELECT status INTO v_idstat FROM public.provider_identities WHERE user_id = v_uid;
    IF v_idstat IS DISTINCT FROM 'VERIFIED' THEN
      RAISE EXCEPTION 'IDENTITY_REQUIRED: Odeme almadan once TC kimlik dogrulamasi gerekli.';
    END IF;
  END IF;

  v_wallet  := public.get_wallet_summary();
  v_balance := (v_wallet->>'earnings_balance')::numeric;
  IF v_balance < p_amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE: Bakiye yetersiz. Mevcut: %', v_balance;
  END IF;
  IF EXISTS (SELECT 1 FROM public.payout_requests WHERE user_id = v_uid AND status = 'PENDING') THEN
    RAISE EXCEPTION 'PENDING_PAYOUT: Bekleyen odeme talebiniz mevcut.';
  END IF;

  -- Admin panel iban alanını gösterir: kart yönteminde maskeli referans yazılır
  v_iban_disp := CASE WHEN v_method.kind = 'IBAN' THEN v_method.iban
                      ELSE 'KART **** ' || v_method.card_last4 || ' (' || COALESCE(v_method.card_brand,'KART') || ')' END;

  INSERT INTO public.payout_requests
    (user_id, amount, iban, iban_holder_name, payout_type, payout_method_id, method_kind)
  VALUES
    (v_uid, p_amount, v_iban_disp, v_method.holder_name,
     CASE WHEN v_is_provider THEN 'PROVIDER_INSTANT' ELSE 'MANUAL' END,
     v_method.id, v_method.kind)
  RETURNING * INTO v_payout;

  INSERT INTO public.wallet_transactions (user_id, amount, type, balance_type, status, reference_type, reference_id, description)
  VALUES (v_uid, p_amount, 'WITHDRAWAL', 'EARNINGS', 'PENDING', 'PAYOUT', v_payout.id,
          CASE WHEN v_method.kind = 'IBAN' THEN 'IBAN''a çekim talebi' ELSE 'Kayıtlı karta çekim talebi' END);

  RETURN v_payout;
END;
$$;
REVOKE ALL ON FUNCTION public.request_payout_with_method(numeric, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_payout_with_method(numeric, uuid) TO authenticated;

-- ── payout sonuç bildirimi (admin_process_payout RBAC sarmalayıcısına DOKUNMADAN) ─
CREATE OR REPLACE FUNCTION public._notify_payout_result()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'COMPLETED' AND OLD.status IS DISTINCT FROM 'COMPLETED' THEN
    INSERT INTO public.notifications (user_id, title, body, type_key)
    VALUES (NEW.user_id, 'Ödemen gönderildi 💸',
            NEW.amount || '₺ ' || CASE WHEN NEW.method_kind = 'CARD' THEN 'kayıtlı kartına' ELSE 'IBAN hesabına' END || ' aktarıldı.',
            'payout_completed');
  ELSIF NEW.status IN ('FAILED','CANCELLED') AND OLD.status NOT IN ('FAILED','CANCELLED') THEN
    INSERT INTO public.notifications (user_id, title, body, type_key)
    VALUES (NEW.user_id, 'Çekim talebin sonuçlanamadı',
            NEW.amount || '₺ tutarındaki çekim talebin ' ||
            CASE WHEN NEW.status = 'FAILED' THEN 'başarısız oldu' ELSE 'iptal edildi' END ||
            '. Bakiyen tekrar kullanılabilir.',
            'payout_failed');
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._notify_payout_result() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notify_payout_result ON public.payout_requests;
CREATE TRIGGER trg_notify_payout_result
  AFTER UPDATE OF status ON public.payout_requests
  FOR EACH ROW EXECUTE FUNCTION public._notify_payout_result();

-- ────────────────────────────────────────────────────────────────────────────
-- 3. provider_update_own_profile — sağlayıcı self-servis kayıt yolu
--    (kırık yol onarımı: admin_update_* sağlayıcıda UNAUTHORIZED veriyordu ve
--     working_hours/is_available/settings alanlarını yok sayıyordu)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.provider_update_own_profile(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_is_gk  boolean;
  v_is_ref boolean;
  v_fee    numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN RAISE EXCEPTION 'INVALID_PAYLOAD'; END IF;

  -- Korunan alanlar yalnız admin/sistem yollarından değişir (sessizce yutma yok)
  IF p_payload ?| ARRAY['rating','isElite','is_elite','matchCount','match_count','isDemo','verification_status','level'] THEN
    RAISE EXCEPTION 'PROTECTED_FIELD: rating/elite/maç sayısı/seviye alanları bu yoldan güncellenemez.';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.goalkeepers WHERE id = v_uid) INTO v_is_gk;
  SELECT EXISTS (SELECT 1 FROM public.referees    WHERE id = v_uid) INTO v_is_ref;
  IF NOT v_is_gk AND NOT v_is_ref THEN
    RAISE EXCEPTION 'NOT_PROVIDER: Sağlayıcı profili bulunamadı.';
  END IF;

  IF p_payload ? 'fee' THEN
    v_fee := (p_payload->>'fee')::numeric;
    IF v_fee IS NULL OR v_fee < 50 OR v_fee > 10000 THEN
      RAISE EXCEPTION 'INVALID_FEE: Ücret 50₺ ile 10.000₺ arasında olmalı.';
    END IF;
  END IF;

  IF v_is_gk THEN
    UPDATE public.goalkeepers SET
      name             = COALESCE(NULLIF(trim(p_payload->>'name'),''), name),
      bio              = CASE WHEN p_payload ? 'bio'   THEN p_payload->>'bio'   ELSE bio   END,
      fee              = COALESCE(v_fee, fee),
      style            = CASE WHEN p_payload ? 'style' THEN p_payload->>'style' ELSE style END,
      avatar           = CASE WHEN p_payload ? 'avatar' THEN p_payload->>'avatar' ELSE avatar END,
      height           = CASE WHEN p_payload ? 'height' THEN p_payload->>'height' ELSE height END,
      age              = CASE WHEN p_payload ? 'age' THEN (p_payload->>'age')::int ELSE age END,
      "preferredZones" = CASE WHEN p_payload ? 'preferredZones' THEN p_payload->'preferredZones' ELSE "preferredZones" END,
      coordinates      = CASE WHEN p_payload ? 'coordinates' THEN p_payload->'coordinates' ELSE coordinates END,
      working_hours    = CASE WHEN p_payload ? 'workingHours' THEN p_payload->'workingHours' ELSE working_hours END,
      settings         = CASE WHEN p_payload ? 'settings' THEN p_payload->'settings' ELSE settings END
    WHERE id = v_uid;
  END IF;

  IF v_is_ref THEN
    UPDATE public.referees SET
      name             = COALESCE(NULLIF(trim(p_payload->>'name'),''), name),
      bio              = CASE WHEN p_payload ? 'bio'   THEN p_payload->>'bio'   ELSE bio   END,
      fee              = COALESCE(v_fee, fee),
      style            = CASE WHEN p_payload ? 'style' THEN p_payload->>'style' ELSE style END,
      avatar           = CASE WHEN p_payload ? 'avatar' THEN p_payload->>'avatar' ELSE avatar END,
      "preferredZones" = CASE WHEN p_payload ? 'preferredZones' THEN p_payload->'preferredZones' ELSE "preferredZones" END,
      coordinates      = CASE WHEN p_payload ? 'coordinates' THEN p_payload->'coordinates' ELSE coordinates END,
      working_hours    = CASE WHEN p_payload ? 'workingHours' THEN p_payload->'workingHours' ELSE working_hours END,
      settings         = CASE WHEN p_payload ? 'settings' THEN p_payload->'settings' ELSE settings END
    WHERE id = v_uid;
  END IF;

  -- Müsaitlik tek kaynak: profiles.is_available (eşleştirme motoru burayı okur)
  IF p_payload ? 'isAvailable' THEN
    UPDATE public.profiles SET is_available = (p_payload->>'isAvailable')::boolean WHERE id = v_uid;
  END IF;

  RETURN jsonb_build_object('updated', true, 'provider_id', v_uid,
                            'is_gk', v_is_gk, 'is_ref', v_is_ref);
END;
$$;
REVOKE ALL ON FUNCTION public.provider_update_own_profile(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provider_update_own_profile(jsonb) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Dinamik TTL parametreleri (app_config — admin panelden ayarlanır)
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO public.app_config (key, value, value_type, category, label, description, is_public, min_value, max_value) VALUES
  ('service_ttl_far_hours', '4'::jsonb, 'number', 'HIZMET',
   'Hizmet Talebi Süresi (uzak maç, saat)',
   'Maça 24 saatten fazla varken kaleci/hakem talebinin yanıt süresi (saat). Süre dolunca talep otomatik EXPIRED olur ve blokaj iade edilir.',
   false, 1, 48),
  ('service_ttl_near_minutes', '60'::jsonb, 'number', 'HIZMET',
   'Hizmet Talebi Süresi (yakın maç, dakika)',
   'Maça 24 saatten az varken talebin yanıt süresi (dakika).',
   false, 15, 240),
  ('service_ttl_floor_minutes', '30'::jsonb, 'number', 'HIZMET',
   'Talep Son Sınırı (maç öncesi, dakika)',
   'Talep en geç maç başlangıcından bu kadar dakika önce sona erer.',
   false, 10, 120)
ON CONFLICT (key) DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. create_service_request v3 — dinamik TTL + sağlayıcıya bildirim
--    (20260706000007 kanonik gövde + 8A eklemeleri; advisory lock korunur)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_service_request(p_match_id uuid, p_provider_id uuid, p_provider_type text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := auth.uid(); v_match RECORD; v_fee numeric; v_scope text; v_comm jsonb;
  v_prov_amt numeric; v_comm_amt numeric; v_intent public.payment_intents; v_req public.service_requests;
  v_far_h numeric; v_near_m numeric; v_floor_m numeric; v_expires timestamptz;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_provider_type NOT IN ('GK','REF') THEN RAISE EXCEPTION 'INVALID_TYPE'; END IF;
  -- Aynı sağlayıcı için eşzamanlı talepleri serialize et (çakışma yarışını önler)
  PERFORM pg_advisory_xact_lock(hashtext('svc_provider:' || p_provider_id::text));
  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_match."creatorId" IS DISTINCT FROM v_uid AND v_match.captain_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'FORBIDDEN: Yalniz mac sahibi/kaptan hizmet talep edebilir.'; END IF;
  IF v_match.status IN ('CANCELLED','COMPLETED') THEN RAISE EXCEPTION 'INVALID_MATCH_STATE: Mac % durumunda.', v_match.status; END IF;
  IF p_provider_type = 'GK' THEN
    SELECT g.fee INTO v_fee FROM public.goalkeepers g JOIN public.profiles p ON p.id = g.id
    WHERE g.id = p_provider_id AND p.verification_status = 'approved'; v_scope := 'SERVICE_GK';
  ELSE
    SELECT r.fee INTO v_fee FROM public.referees r JOIN public.profiles p ON p.id = r.id
    WHERE r.id = p_provider_id AND p.verification_status = 'approved'; v_scope := 'SERVICE_REF';
  END IF;
  IF v_fee IS NULL THEN RAISE EXCEPTION 'PROVIDER_UNAVAILABLE: Onayli saglayici bulunamadi.'; END IF;
  IF public._provider_has_conflict(p_provider_id, v_match.starts_at, p_match_id) THEN
    RAISE EXCEPTION 'PROVIDER_CONFLICT: Saglayicinin bu saatte baska bir maci var.'; END IF;
  v_comm := public.calculate_commission(v_fee, v_scope);
  v_comm_amt := (v_comm->>'commission_amt')::numeric; v_prov_amt := (v_comm->>'net_amount')::numeric;
  INSERT INTO public.payment_intents (user_id, match_id, amount, currency, status, provider,
    commission_amount, owner_amount, service_provider_amount, commission_model, related_entity_type)
  VALUES (v_uid, p_match_id, v_fee, 'TRY', 'PENDING', 'IYZICO', v_comm_amt, 0, v_prov_amt, v_comm->>'model',
    CASE WHEN p_provider_type = 'GK' THEN 'GK_SERVICE' ELSE 'REF_SERVICE' END) RETURNING * INTO v_intent;

  -- 8A.5 — Dinamik TTL: uzak maç 4s / yakın maç 60dk; en geç maça 30dk kala
  v_far_h   := public.get_config_number('service_ttl_far_hours', 4);
  v_near_m  := public.get_config_number('service_ttl_near_minutes', 60);
  v_floor_m := public.get_config_number('service_ttl_floor_minutes', 30);
  IF v_match.starts_at IS NULL THEN
    v_expires := now() + make_interval(hours => v_far_h::int);
  ELSIF v_match.starts_at - now() > interval '24 hours' THEN
    v_expires := LEAST(now() + make_interval(hours => v_far_h::int),
                       v_match.starts_at - make_interval(mins => v_floor_m::int));
  ELSE
    v_expires := LEAST(now() + make_interval(mins => v_near_m::int),
                       v_match.starts_at - make_interval(mins => v_floor_m::int));
  END IF;
  IF v_expires <= now() THEN v_expires := now() + interval '15 minutes'; END IF;

  INSERT INTO public.service_requests (match_id, provider_id, provider_type, requested_by, fee,
    commission_amount, provider_amount, payment_intent_id, expires_at)
  VALUES (p_match_id, p_provider_id, p_provider_type, v_uid, v_fee, v_comm_amt, v_prov_amt, v_intent.id, v_expires)
  RETURNING * INTO v_req;

  -- 8A.4 — Sağlayıcıya anında bildirim (send-push webhook'u otomatik tetiklenir)
  INSERT INTO public.notifications (user_id, title, body, type_key, match_id, deep_link)
  VALUES (p_provider_id,
          CASE WHEN p_provider_type = 'GK' THEN 'Yeni kaleci talebi 🧤' ELSE 'Yeni hakem talebi ⚖️' END,
          COALESCE(v_match.title, 'Bir maç') || ' için ' || v_fee || '₺ (net ' || v_prov_amt ||
          '₺) teklif var. Son yanıt: ' || to_char(v_expires AT TIME ZONE 'Europe/Istanbul', 'DD.MM HH24:MI'),
          'service_request_new', p_match_id, 'oyna://match/' || p_match_id);

  RETURN jsonb_build_object('request_id', v_req.id, 'intent_id', v_intent.id, 'status', 'PENDING',
    'fee', v_fee, 'commission', v_comm_amt, 'provider_amount', v_prov_amt,
    'expires_at', v_expires);
END; $$;
REVOKE ALL ON FUNCTION public.create_service_request(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_service_request(uuid, uuid, text) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. respond_service_request v3 — kaptana kabul/ret bildirimi
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.respond_service_request(p_request_id uuid, p_accept boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := auth.uid(); v_req public.service_requests; v_match_status text; v_name text; v_result jsonb;
BEGIN
  SELECT * INTO v_req FROM public.service_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_req.provider_id IS DISTINCT FROM v_uid AND NOT public.is_platform_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF v_req.status <> 'PENDING' THEN RAISE EXCEPTION 'INVALID_STATE: Talep % durumunda.', v_req.status; END IF;

  SELECT COALESCE(name, full_name, 'Sağlayıcı') INTO v_name FROM public.profiles WHERE id = v_req.provider_id;

  IF p_accept THEN
    UPDATE public.service_requests SET status = 'ACCEPTED', accepted_at = now() WHERE id = p_request_id;
    -- Maç ZATEN onaylıysa (onay sonrası ekleme): anında tahsil et (SECURITY DEFINER → yetkili)
    SELECT status INTO v_match_status FROM public.matches WHERE id = v_req.match_id;
    IF v_match_status IN ('CONFIRMED','LIVE') THEN
      PERFORM public.capture_service_request(p_request_id);
      v_result := jsonb_build_object('request_id', p_request_id, 'status', 'CAPTURED');
    ELSE
      v_result := jsonb_build_object('request_id', p_request_id, 'status', 'ACCEPTED');
    END IF;
    INSERT INTO public.notifications (user_id, title, body, type_key, match_id, deep_link)
    VALUES (v_req.requested_by, 'Talebin kabul edildi 🎉',
            v_name || ' maçın için talebini kabul etti.',
            'service_request_accepted', v_req.match_id, 'oyna://match/' || v_req.match_id);
    RETURN v_result;
  ELSE
    UPDATE public.service_requests SET status = 'REJECTED', cancelled_at = now() WHERE id = p_request_id;
    -- ÖN-MEVCUT BUG ONARIMI: void_preauth çağıranın intent sahibi olmasını ister,
    -- oysa reddeden taraf SAĞLAYICIDIR (intent kaptana ait) → UNAUTHORIZED atıyordu.
    -- Blokaj, _void_services_on_match_cancel ile aynı desenle doğrudan serbest bırakılır.
    IF v_req.payment_intent_id IS NOT NULL THEN
      UPDATE public.payment_intents
      SET status = 'VOIDED', voided_at = now(), void_reason = 'SERVICE_REJECTED'
      WHERE id = v_req.payment_intent_id AND status IN ('PENDING','BLOCKED');
    END IF;
    INSERT INTO public.notifications (user_id, title, body, type_key, match_id, deep_link)
    VALUES (v_req.requested_by, 'Talebin reddedildi',
            v_name || ' talebini reddetti. Blokajın iade edildi — başka bir sağlayıcı seçebilirsin.',
            'service_request_rejected', v_req.match_id, 'oyna://match/' || v_req.match_id);
    RETURN jsonb_build_object('request_id', p_request_id, 'status', 'REJECTED');
  END IF;
END; $$;
REVOKE ALL ON FUNCTION public.respond_service_request(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_service_request(uuid, boolean) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 7. expire_service_requests — TTL süpürücüsü (EXPIRED ölü alanı canlanır)
--    Süresi geçen PENDING talep → EXPIRED + blokaj void + iki tarafa bildirim.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.expire_service_requests()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE r RECORD; v_count int := 0;
BEGIN
  FOR r IN
    SELECT sr.*, m.title AS match_title
    FROM public.service_requests sr
    LEFT JOIN public.matches m ON m.id = sr.match_id
    WHERE sr.status = 'PENDING' AND sr.expires_at IS NOT NULL AND sr.expires_at < now()
    FOR UPDATE OF sr SKIP LOCKED
  LOOP
    UPDATE public.service_requests SET status = 'EXPIRED', cancelled_at = now() WHERE id = r.id;
    IF r.payment_intent_id IS NOT NULL THEN
      UPDATE public.payment_intents
      SET status = 'VOIDED', voided_at = now(), void_reason = 'SERVICE_EXPIRED'
      WHERE id = r.payment_intent_id AND status IN ('PENDING','BLOCKED');
    END IF;
    -- Kaptana: alternatif önerisiyle
    INSERT INTO public.notifications (user_id, title, body, type_key, match_id, deep_link)
    VALUES (r.requested_by, 'Talep yanıtsız kaldı ⏳',
            COALESCE(r.match_title,'Maçın') || ' için gönderdiğin ' ||
            CASE WHEN r.provider_type = 'GK' THEN 'kaleci' ELSE 'hakem' END ||
            ' talebi süresi doldu. Blokajın iade edildi — sana uygun diğer sağlayıcılara göz at.',
            'service_request_expired', r.match_id, 'oyna://match/' || r.match_id);
    -- Sağlayıcıya: kaçırdığı iş bilgisi (yanıt hızı davranışını besler)
    INSERT INTO public.notifications (user_id, title, body, type_key, match_id, deep_link)
    VALUES (r.provider_id, 'Bir talebi kaçırdın',
            COALESCE(r.match_title,'Bir maç') || ' için gelen ' || r.fee ||
            '₺ tutarındaki talep yanıtlanmadığı için süresi doldu.',
            'service_request_expired', r.match_id, 'oyna://match/' || r.match_id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.expire_service_requests() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_service_requests() TO service_role;

CREATE INDEX IF NOT EXISTS idx_service_requests_pending_expiry
  ON public.service_requests(expires_at) WHERE status = 'PENDING';

-- pg_cron: 5 dakikada bir süpür (mevcut auto_process_matches deseni)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('expire_service_requests');
    EXCEPTION WHEN OTHERS THEN NULL;  -- ilk kurulumda job yok
    END;
    PERFORM cron.schedule('expire_service_requests', '*/5 * * * *',
      'SELECT public.expire_service_requests()');
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 8. Bildirim şablonları (tablo canlıda notifications kurulumundan gelir;
--    migration-only ortamlarda yoksa sessizce atla)
-- ────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.notification_templates') IS NOT NULL THEN
    INSERT INTO public.notification_templates (type_key, label_tr, title_tr, body_tr, category, is_mandatory, can_user_disable, sort_order)
    VALUES
      ('service_request_new',      'Yeni hizmet talebi',    'Yeni talep 🧤', '{{match}} için {{fee}}₺ teklif var.', 'MATCH', true,  false, 60),
      ('service_request_accepted', 'Talep kabul edildi',    'Talebin kabul edildi 🎉', '{{provider}} talebini kabul etti.', 'MATCH', true,  false, 61),
      ('service_request_rejected', 'Talep reddedildi',      'Talebin reddedildi', '{{provider}} talebini reddetti.', 'MATCH', true,  false, 62),
      ('service_request_expired',  'Talep süresi doldu',    'Talep yanıtsız kaldı ⏳', '{{match}} talebinin süresi doldu.', 'MATCH', true,  false, 63),
      ('payout_completed',         'Ödeme gönderildi',      'Ödemen gönderildi 💸', '{{amount}}₺ hesabına aktarıldı.', 'SYSTEM', true, false, 64),
      ('payout_failed',            'Ödeme sonuçlanamadı',   'Çekim talebin sonuçlanamadı', 'Çekim talebin iptal edildi/başarısız oldu.', 'SYSTEM', true, false, 65)
    ON CONFLICT (type_key) DO NOTHING;
  END IF;
END $$;
