-- ════════════════════════════════════════════════════════════════════════
-- Sağlayıcı-başlatan maç başvurusu + iki-taraflı onayla tahsis (escrow)
-- ------------------------------------------------------------------------
-- Mevcut FAZ5 hizmet motorunu (service_requests + payment_intents + wallet)
-- TERS YÖNDE genişletir:
--   • Kaleci/Hakem, bölgesindeki açık bir maça BAŞVURUR      → status='APPLIED' (para yok)
--   • Kaptan başvuruyu KABUL eder                            → ücret kaptanda BLOKE (payment_intent)
--   • Maç CONFIRMED olunca (mevcut trigger) kazanç PENDING'e yazılır
--   • Maç sonunda İKİ TARAF DA onaylayınca payout SERBEST    → çekilebilir
--
-- Tasarım: service_requests'i yeniden kullanır (tüm alt-motor: capture-on-confirm
-- trigger'ı, cüzdan, payout, TC kimlik kapısı aynen çalışır). 'APPLIED' durumu
-- benzersiz-aktif indeksinin (PENDING/ACCEPTED/CAPTURED) DIŞINDA olduğundan aynı
-- maça birden çok sağlayıcı başvurabilir; kaptan birini kabul edince o ACCEPTED'a
-- geçer (indeks tekilliği devreye girer) ve diğer başvurular reddedilir.
-- Tüm yazımlar SECURITY DEFINER RPC üzerinden (tablo RLS'i doğrudan yazmayı kapatır).
-- ════════════════════════════════════════════════════════════════════════

-- ─── Şema genişletmeleri (additive, idempotent) ────────────────────────────
ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS initiated_by       text NOT NULL DEFAULT 'CAPTAIN',
  ADD COLUMN IF NOT EXISTS provider_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS captain_confirmed  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS applied_at         timestamptz;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'service_requests_initiated_by_check') THEN
    ALTER TABLE public.service_requests
      ADD CONSTRAINT service_requests_initiated_by_check CHECK (initiated_by IN ('CAPTAIN','PROVIDER'));
  END IF;
END $$;

-- 'APPLIED' durumunu CHECK'e ekle (mevcut kısıtı düşür, yenisini kur).
ALTER TABLE public.service_requests DROP CONSTRAINT IF EXISTS service_requests_status_check;
ALTER TABLE public.service_requests ADD CONSTRAINT service_requests_status_check
  CHECK (status IN ('APPLIED','PENDING','ACCEPTED','REJECTED','CAPTURED','COMPLETED','CANCELLED','EXPIRED'));

CREATE INDEX IF NOT EXISTS idx_service_requests_applied
  ON public.service_requests(match_id, provider_type) WHERE status = 'APPLIED';

-- ─── 1) Sağlayıcı başvurusu: kaleci/hakem bir maça başvurur ────────────────
CREATE OR REPLACE FUNCTION public.apply_to_match_as_provider(
  p_match_id      uuid,
  p_provider_type text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_match  RECORD;
  v_fee    numeric;
  v_scope  text;
  v_comm   jsonb;
  v_comm_amt numeric;
  v_prov_amt numeric;
  v_captain uuid;
  v_req    public.service_requests;
  v_expiry numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_provider_type NOT IN ('GK','REF') THEN RAISE EXCEPTION 'INVALID_TYPE'; END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_match.status IN ('CANCELLED','COMPLETED') THEN
    RAISE EXCEPTION 'INVALID_MATCH_STATE: Maç % durumunda.', v_match.status;
  END IF;

  -- Slot boş olmalı (o rol henüz doldurulmamış)
  IF p_provider_type = 'GK' AND v_match.gk_id IS NOT NULL THEN
    RAISE EXCEPTION 'SLOT_FILLED: Bu maçın kalecisi zaten atanmış.';
  END IF;
  IF p_provider_type = 'REF' AND v_match."refereeId" IS NOT NULL THEN
    RAISE EXCEPTION 'SLOT_FILLED: Bu maçın hakemi zaten atanmış.';
  END IF;

  -- Kaptan (ödemeyi yapacak taraf)
  v_captain := COALESCE(v_match."creatorId", v_match.captain_id);
  IF v_captain IS NULL THEN RAISE EXCEPTION 'NO_CAPTAIN: Maçın sahibi bulunamadı.'; END IF;
  IF v_captain = v_uid THEN RAISE EXCEPTION 'SELF_APPLY: Kendi maçına başvuramazsın.'; END IF;

  -- Onaylı sağlayıcı + ücret (kendi ilan ücreti)
  IF p_provider_type = 'GK' THEN
    SELECT g.fee INTO v_fee FROM public.goalkeepers g
    JOIN public.profiles p ON p.id = g.id
    WHERE g.id = v_uid AND p.verification_status = 'approved';
    v_scope := 'SERVICE_GK';
  ELSE
    SELECT r.fee INTO v_fee FROM public.referees r
    JOIN public.profiles p ON p.id = r.id
    WHERE r.id = v_uid AND p.verification_status = 'approved';
    v_scope := 'SERVICE_REF';
  END IF;
  IF v_fee IS NULL THEN RAISE EXCEPTION 'NOT_APPROVED: Onaylı %s profilin yok.', p_provider_type; END IF;

  -- Zaman çakışması (PENDING/ACCEPTED dahil)
  IF public._provider_has_conflict(v_uid, v_match.starts_at, p_match_id) THEN
    RAISE EXCEPTION 'PROVIDER_CONFLICT: Bu saatte başka bir maçın var.';
  END IF;

  -- Aynı maça mükerrer başvuru engeli
  IF EXISTS (
    SELECT 1 FROM public.service_requests
    WHERE match_id = p_match_id AND provider_id = v_uid
      AND status IN ('APPLIED','PENDING','ACCEPTED','CAPTURED')
  ) THEN
    RAISE EXCEPTION 'ALREADY_APPLIED: Bu maça zaten başvurdun.';
  END IF;

  v_comm     := public.calculate_commission(v_fee, v_scope);
  v_comm_amt := (v_comm->>'commission_amt')::numeric;
  v_prov_amt := (v_comm->>'net_amount')::numeric;

  SELECT COALESCE(service_request_expiry_hours, 48) INTO v_expiry FROM public.settings LIMIT 1;

  -- APPLIED: ödeme niyeti YOK (blokaj kaptanın kabulünde oluşur)
  INSERT INTO public.service_requests (
    match_id, provider_id, provider_type, requested_by, fee,
    commission_amount, provider_amount, status, initiated_by, applied_at, expires_at
  ) VALUES (
    p_match_id, v_uid, p_provider_type, v_captain, v_fee,
    v_comm_amt, v_prov_amt, 'APPLIED', 'PROVIDER', now(),
    now() + make_interval(hours => COALESCE(v_expiry,48)::int)
  )
  RETURNING * INTO v_req;

  -- Kaptana bildirim
  INSERT INTO public.notifications (user_id, title, body, type_key, match_id)
  VALUES (v_captain,
    CASE WHEN p_provider_type='GK' THEN 'Yeni kaleci başvurusu' ELSE 'Yeni hakem başvurusu' END,
    'Maçına bir ' || CASE WHEN p_provider_type='GK' THEN 'kaleci' ELSE 'hakem' END ||
      ' başvurdu. Kabul edersen ücret bloke edilir.',
    'service_request_applied', p_match_id);

  RETURN jsonb_build_object('request_id', v_req.id, 'status', 'APPLIED',
    'fee', v_fee, 'provider_amount', v_prov_amt);
END;
$$;
REVOKE ALL ON FUNCTION public.apply_to_match_as_provider(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_to_match_as_provider(uuid, text) TO authenticated;

-- ─── 2) Kaptan başvuruyu KABUL eder → ücret bloke (payment_intent) ─────────
CREATE OR REPLACE FUNCTION public.accept_provider_application(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_req    public.service_requests;
  v_match  RECORD;
  v_comm   jsonb;
  v_intent public.payment_intents;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT * INTO v_req FROM public.service_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_req.status <> 'APPLIED' OR v_req.initiated_by <> 'PROVIDER' THEN
    RAISE EXCEPTION 'INVALID_STATE: Başvuru % durumunda.', v_req.status;
  END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = v_req.match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  -- Yalnız maç sahibi/kaptan kabul edebilir
  IF v_req.requested_by IS DISTINCT FROM v_uid
     AND v_match."creatorId" IS DISTINCT FROM v_uid
     AND v_match.captain_id IS DISTINCT FROM v_uid
     AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Yalnız maç sahibi kabul edebilir.';
  END IF;
  IF v_match.status IN ('CANCELLED','COMPLETED') THEN
    RAISE EXCEPTION 'INVALID_MATCH_STATE';
  END IF;
  -- Slot hâlâ boş olmalı
  IF v_req.provider_type = 'GK' AND v_match.gk_id IS NOT NULL THEN
    RAISE EXCEPTION 'SLOT_FILLED: Kaleci zaten atanmış.';
  END IF;
  IF v_req.provider_type = 'REF' AND v_match."refereeId" IS NOT NULL THEN
    RAISE EXCEPTION 'SLOT_FILLED: Hakem zaten atanmış.';
  END IF;
  IF public._provider_has_conflict(v_req.provider_id, v_match.starts_at, v_req.match_id) THEN
    RAISE EXCEPTION 'PROVIDER_CONFLICT: Sağlayıcının bu saatte başka maçı var.';
  END IF;

  -- Ödeme niyeti (blokaj) — create_service_request ile aynı desen
  v_comm := public.calculate_commission(v_req.fee,
              CASE WHEN v_req.provider_type='GK' THEN 'SERVICE_GK' ELSE 'SERVICE_REF' END);
  INSERT INTO public.payment_intents (
    user_id, match_id, amount, currency, status, provider,
    commission_amount, owner_amount, service_provider_amount,
    commission_model, related_entity_type
  ) VALUES (
    v_uid, v_req.match_id, v_req.fee, 'TRY', 'PENDING', 'IYZICO',
    v_req.commission_amount, 0, v_req.provider_amount,
    v_comm->>'model',
    CASE WHEN v_req.provider_type='GK' THEN 'GK_SERVICE' ELSE 'REF_SERVICE' END
  )
  RETURNING * INTO v_intent;

  UPDATE public.service_requests
    SET status = 'ACCEPTED', accepted_at = now(), payment_intent_id = v_intent.id
    WHERE id = p_request_id;

  -- Aynı maç+tip için diğer bekleyen başvuruları reddet
  UPDATE public.service_requests
    SET status = 'REJECTED', cancelled_at = now()
    WHERE match_id = v_req.match_id AND provider_type = v_req.provider_type
      AND id <> p_request_id AND status = 'APPLIED';

  -- Sağlayıcıya bildirim
  INSERT INTO public.notifications (user_id, title, body, type_key, match_id)
  VALUES (v_req.provider_id, 'Başvurun kabul edildi',
    'Maç kesinleştiğinde ücretin cüzdanına işlenecek.', 'service_request_accepted', v_req.match_id);

  RETURN jsonb_build_object('request_id', p_request_id, 'status', 'ACCEPTED',
    'intent_id', v_intent.id, 'fee', v_req.fee);
END;
$$;
REVOKE ALL ON FUNCTION public.accept_provider_application(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_provider_application(uuid) TO authenticated;

-- ─── 3) Kaptan başvuruyu reddeder ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.decline_provider_application(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_uid uuid := auth.uid(); v_req public.service_requests; v_match RECORD;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT * INTO v_req FROM public.service_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_req.status <> 'APPLIED' THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
  SELECT * INTO v_match FROM public.matches WHERE id = v_req.match_id;
  IF v_req.requested_by IS DISTINCT FROM v_uid
     AND v_match."creatorId" IS DISTINCT FROM v_uid
     AND v_match.captain_id IS DISTINCT FROM v_uid
     AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  UPDATE public.service_requests SET status='REJECTED', cancelled_at=now() WHERE id=p_request_id;
  INSERT INTO public.notifications (user_id, title, body, type_key, match_id)
  VALUES (v_req.provider_id, 'Başvurun kabul edilmedi', 'Kaptan başka bir tercih yaptı.',
    'service_request_declined', v_req.match_id);
  RETURN jsonb_build_object('request_id', p_request_id, 'status', 'REJECTED');
END;
$$;
REVOKE ALL ON FUNCTION public.decline_provider_application(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decline_provider_application(uuid) TO authenticated;

-- ─── 4) Sağlayıcı kendi başvurusunu geri çeker (APPLIED iken) ───────────────
CREATE OR REPLACE FUNCTION public.withdraw_provider_application(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_uid uuid := auth.uid(); v_req public.service_requests;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT * INTO v_req FROM public.service_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_req.provider_id IS DISTINCT FROM v_uid THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF v_req.status <> 'APPLIED' THEN RAISE EXCEPTION 'INVALID_STATE: Yalnız bekleyen başvuru geri çekilebilir.'; END IF;
  UPDATE public.service_requests SET status='CANCELLED', cancelled_at=now() WHERE id=p_request_id;
  RETURN jsonb_build_object('request_id', p_request_id, 'status', 'CANCELLED');
END;
$$;
REVOKE ALL ON FUNCTION public.withdraw_provider_application(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_provider_application(uuid) TO authenticated;

-- ─── 5) İki-taraflı maç sonu onayı → payout serbest ────────────────────────
-- _release_service_payout'a iki-taraflı kapı: PROVIDER-başlatan taleplerde payout
-- yalnız HER İKİ taraf da onayladığında serbest kalır (CAPTAIN-başlatanda değişmez).
CREATE OR REPLACE FUNCTION public._release_service_payout(p_match_id uuid, p_provider_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_req public.service_requests;
BEGIN
  SELECT * INTO v_req FROM public.service_requests
  WHERE match_id = p_match_id AND provider_id = p_provider_id
    AND status = 'CAPTURED' AND payout_released = false
  ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;

  -- İki-taraflı kapı (yalnız sağlayıcı-başlatan başvurular için)
  IF v_req.initiated_by = 'PROVIDER'
     AND NOT (v_req.provider_confirmed AND v_req.captain_confirmed) THEN
    RETURN;  -- her iki onay tamamlanmadan serbest bırakma
  END IF;

  -- Bekleyen kazancı çekilebilir yap
  UPDATE public.wallet_transactions
    SET status = 'COMPLETED'
    WHERE reference_id = v_req.payment_intent_id
      AND balance_type = 'EARNINGS' AND status = 'PENDING';

  UPDATE public.service_requests
    SET status = 'COMPLETED', completed_at = now(), payout_released = true
    WHERE id = v_req.id;
END;
$$;
REVOKE ALL ON FUNCTION public._release_service_payout(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._release_service_payout(uuid, uuid) TO authenticated, service_role;

-- Sağlayıcı "maçı oynadım" onayı
CREATE OR REPLACE FUNCTION public.provider_confirm_service(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_uid uuid := auth.uid(); v_req public.service_requests;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT * INTO v_req FROM public.service_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_req.provider_id IS DISTINCT FROM v_uid THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF v_req.status NOT IN ('CAPTURED') THEN
    RAISE EXCEPTION 'INVALID_STATE: Onay için maçın tahsil edilmiş (oynanmış) olması gerekir.';
  END IF;
  UPDATE public.service_requests SET provider_confirmed = true WHERE id = p_request_id;
  PERFORM public._release_service_payout(v_req.match_id, v_req.provider_id);
  RETURN jsonb_build_object('request_id', p_request_id, 'provider_confirmed', true);
END;
$$;
REVOKE ALL ON FUNCTION public.provider_confirm_service(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provider_confirm_service(uuid) TO authenticated;

-- Kaptan "sağlayıcı geldi / maç oynandı" onayı
CREATE OR REPLACE FUNCTION public.captain_confirm_service(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_uid uuid := auth.uid(); v_req public.service_requests; v_match RECORD;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT * INTO v_req FROM public.service_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  SELECT * INTO v_match FROM public.matches WHERE id = v_req.match_id;
  IF v_req.requested_by IS DISTINCT FROM v_uid
     AND v_match."creatorId" IS DISTINCT FROM v_uid
     AND v_match.captain_id IS DISTINCT FROM v_uid
     AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF v_req.status NOT IN ('CAPTURED') THEN
    RAISE EXCEPTION 'INVALID_STATE: Onay için maçın tahsil edilmiş olması gerekir.';
  END IF;
  UPDATE public.service_requests SET captain_confirmed = true WHERE id = p_request_id;
  PERFORM public._release_service_payout(v_req.match_id, v_req.provider_id);
  RETURN jsonb_build_object('request_id', p_request_id, 'captain_confirmed', true);
END;
$$;
REVOKE ALL ON FUNCTION public.captain_confirm_service(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.captain_confirm_service(uuid) TO authenticated;
