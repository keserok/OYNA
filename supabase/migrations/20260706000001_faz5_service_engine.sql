-- ==============================================================================
-- FAZ 5 — Kaleci & Hakem Hizmet Motoru 🧤
-- ------------------------------------------------------------------------------
-- 5.1  Başvuru + doğrulama + profil:
--        - provider_applications: kimlik fotoğrafı + telefon + niyet mektubu
--          (admin OPERASYON onayı; lisans belgesi yerine bu üçlü — iş kararı)
--        - provider-docs (private) storage bucket: kimlik fotoğrafları (KVKK)
-- 5.2  Tek "talep" modeli + eşleştirme + ödeme:
--        - service_requests: JobListing/DirectOffer/IncomingBid karmaşası → tek model
--        - find_providers_for_match: müsait + (yakın) + yüksek puanlı SIRALI öneri
--        - create/respond/cancel/capture: blokaj→tahsil yaşam döngüsü (Faz 2 motoru)
--        - sabit ücret + %10 komisyon (commission_config SERVICE_GK/REF)
--        - maç onayında (T-8s) kabul edilmiş hizmetler otomatik tahsil
--        - service_ratings: maç sonu 1-10 + otomatik rating + payout SERBEST kapısı
--        - PROVIDER_INSTANT payout: değerlendirme sonrası ANINDA (owner 2 hafta ≠)
--        - provider_identities: ilk payout öncesi TC kimlik doğrulaması (kapı)
-- ==============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 0. matches: atanmış kaleci kolonu (hakem zaten "refereeId" ile mevcut)
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS gk_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. provider_applications — kaleci/hakem onboarding başvurusu (admin onaylı)
--    Lisans belgesi yerine: kimlik fotoğrafı + telefon + niyet mektubu (iş kararı)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.provider_applications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role          text NOT NULL CHECK (role IN ('GOALKEEPER','REFEREE')),
  id_photo_path text NOT NULL,                 -- provider-docs bucket içindeki yol
  phone         text NOT NULL,
  intent_letter text NOT NULL,                 -- niyet mektubu
  level         text,                          -- hakem için seviye beyanı (opsiyonel)
  status        text NOT NULL DEFAULT 'PENDING'
                  CHECK (status IN ('PENDING','APPROVED','REJECTED')),
  admin_notes   text,
  reviewed_by   uuid REFERENCES public.profiles(id),
  reviewed_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_provider_apps_user   ON public.provider_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_provider_apps_status ON public.provider_applications(status) WHERE status = 'PENDING';

ALTER TABLE public.provider_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own provider_applications" ON public.provider_applications;
CREATE POLICY "Users view own provider_applications"
  ON public.provider_applications FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.is_platform_admin());

DROP POLICY IF EXISTS "Users create own provider_applications" ON public.provider_applications;
CREATE POLICY "Users create own provider_applications"
  ON public.provider_applications FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND status = 'PENDING');

DROP POLICY IF EXISTS "Admin manages provider_applications" ON public.provider_applications;
CREATE POLICY "Admin manages provider_applications"
  ON public.provider_applications FOR ALL TO authenticated
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());

-- ────────────────────────────────────────────────────────────────────────────
-- 2. provider_identities — anlık payout öncesi TC kimlik doğrulaması (kapı)
--    Karar 4B: ilk PROVIDER_INSTANT payout öncesi tam kimlik doğrulaması zorunlu.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.provider_identities (
  user_id      uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  tc_no_hash   text NOT NULL,                  -- TC kimlik no (hash'lenmiş — açık saklanmaz)
  full_name    text NOT NULL,
  birth_year   integer,
  status       text NOT NULL DEFAULT 'PENDING'
                 CHECK (status IN ('PENDING','VERIFIED','REJECTED')),
  admin_notes  text,
  verified_by  uuid REFERENCES public.profiles(id),
  verified_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.provider_identities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own provider_identity" ON public.provider_identities;
CREATE POLICY "Users view own provider_identity"
  ON public.provider_identities FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.is_platform_admin());

DROP POLICY IF EXISTS "Admin manages provider_identities" ON public.provider_identities;
CREATE POLICY "Admin manages provider_identities"
  ON public.provider_identities FOR ALL TO authenticated
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
-- INSERT yalnız submit_provider_identity RPC üzerinden (aşağıda), doğrudan değil.

-- ────────────────────────────────────────────────────────────────────────────
-- 3. service_requests — TEK talep modeli (JobListing/DirectOffer/IncomingBid →)
--    request_kind: INDIVIDUAL (bir kişi tüm ücreti öder) | SQUAD_VOTE (hızlı takip)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.service_requests (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id          uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  provider_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider_type     text NOT NULL CHECK (provider_type IN ('GK','REF')),
  requested_by      uuid NOT NULL REFERENCES public.profiles(id),
  fee               numeric NOT NULL CHECK (fee >= 0),
  commission_amount numeric NOT NULL DEFAULT 0,
  provider_amount   numeric NOT NULL DEFAULT 0,   -- ücret − komisyon (sağlayıcının eline geçen)
  request_kind      text NOT NULL DEFAULT 'INDIVIDUAL'
                      CHECK (request_kind IN ('INDIVIDUAL','SQUAD_VOTE')),
  status            text NOT NULL DEFAULT 'PENDING'
                      CHECK (status IN ('PENDING','ACCEPTED','REJECTED','CAPTURED','COMPLETED','CANCELLED','EXPIRED')),
  payment_intent_id uuid REFERENCES public.payment_intents(id) ON DELETE SET NULL,
  payout_released   boolean NOT NULL DEFAULT false,
  accepted_at       timestamptz,
  captured_at       timestamptz,
  completed_at      timestamptz,
  cancelled_at      timestamptz,
  expires_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_requests_match     ON public.service_requests(match_id);
CREATE INDEX IF NOT EXISTS idx_service_requests_provider  ON public.service_requests(provider_id, status);
CREATE INDEX IF NOT EXISTS idx_service_requests_requester ON public.service_requests(requested_by);
-- Bir maça aynı tipte yalnız bir aktif talep (PENDING/ACCEPTED/CAPTURED)
CREATE UNIQUE INDEX IF NOT EXISTS uq_service_requests_active_per_match
  ON public.service_requests(match_id, provider_type)
  WHERE status IN ('PENDING','ACCEPTED','CAPTURED');

ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Parties view service_requests" ON public.service_requests;
CREATE POLICY "Parties view service_requests"
  ON public.service_requests FOR SELECT TO authenticated
  USING (provider_id = (SELECT auth.uid())
      OR requested_by = (SELECT auth.uid())
      OR public.is_platform_admin());

DROP POLICY IF EXISTS "Admin manages service_requests" ON public.service_requests;
CREATE POLICY "Admin manages service_requests"
  ON public.service_requests FOR ALL TO authenticated
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
-- Yazma işlemleri RPC'ler (SECURITY DEFINER) üzerinden; doğrudan INSERT/UPDATE yok.

-- ────────────────────────────────────────────────────────────────────────────
-- 4. service_ratings — maç sonu kaleci/hakem 1-10 puanlaması
--    (= katılım kanıtı → payout serbest; düşük puan ödemeyi engellemez)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.service_ratings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id      uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  provider_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider_type text NOT NULL CHECK (provider_type IN ('GK','REF')),
  rater_id      uuid NOT NULL REFERENCES public.profiles(id),
  score         integer NOT NULL CHECK (score BETWEEN 1 AND 10),
  comment       text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_service_ratings_unique
  ON public.service_ratings(match_id, provider_id, rater_id);
CREATE INDEX IF NOT EXISTS idx_service_ratings_provider ON public.service_ratings(provider_id);

ALTER TABLE public.service_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read service_ratings" ON public.service_ratings;
CREATE POLICY "Read service_ratings"
  ON public.service_ratings FOR SELECT TO authenticated
  USING (provider_id = (SELECT auth.uid())
      OR rater_id = (SELECT auth.uid())
      OR public.is_platform_admin());

DROP POLICY IF EXISTS "Admin manages service_ratings" ON public.service_ratings;
CREATE POLICY "Admin manages service_ratings"
  ON public.service_ratings FOR ALL TO authenticated
  USING (public.is_platform_admin()) WITH CHECK (public.is_platform_admin());
-- INSERT yalnız submit_service_rating RPC üzerinden.

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Storage: provider-docs (PRIVATE) — kimlik fotoğrafları (KVKK gereği gizli)
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('provider-docs', 'provider-docs', false)
ON CONFLICT (id) DO NOTHING;

-- Kullanıcı yalnız kendi klasörüne (user_id/...) yükler ve kendi belgesini okur; admin hepsini okur.
DROP POLICY IF EXISTS "Providers upload own docs" ON storage.objects;
CREATE POLICY "Providers upload own docs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'provider-docs'
              AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

DROP POLICY IF EXISTS "Providers read own docs" ON storage.objects;
CREATE POLICY "Providers read own docs"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'provider-docs'
         AND ((storage.foldername(name))[1] = (SELECT auth.uid())::text
              OR public.is_platform_admin()));

-- ────────────────────────────────────────────────────────────────────────────
-- 6. settings: hizmet talebi süresi
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS "service_request_expiry_hours" numeric DEFAULT 24;

-- ────────────────────────────────────────────────────────────────────────────
-- 7. get_wallet_summary — SERVICE_EARNING'i de EARNINGS bakiyesine dahil et
--    (FAZ 2 sürümü yalnız DEPOSIT/MATCH_EARNING/REFERRAL_BONUS sayıyordu)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_wallet_summary()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_earnings numeric;
  v_refund   numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  SELECT COALESCE(SUM(CASE WHEN type IN ('DEPOSIT','MATCH_EARNING','SERVICE_EARNING','REFERRAL_BONUS')
                           THEN amount ELSE -amount END), 0)
  INTO v_earnings
  FROM public.wallet_transactions
  WHERE user_id = v_uid AND balance_type = 'EARNINGS' AND status = 'COMPLETED';

  SELECT COALESCE(SUM(CASE WHEN type = 'DEPOSIT' THEN amount ELSE -amount END), 0)
  INTO v_refund
  FROM public.wallet_transactions
  WHERE user_id = v_uid AND balance_type = 'REFUND_CREDIT' AND status = 'COMPLETED';

  RETURN jsonb_build_object(
    'earnings_balance',      GREATEST(v_earnings, 0),
    'refund_credit_balance', GREATEST(v_refund, 0)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_wallet_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_wallet_summary() TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 8. RPC: submit_provider_application — onboarding belgelerini gönder
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.submit_provider_application(
  p_role          text,
  p_id_photo_path text,
  p_phone         text,
  p_intent_letter text,
  p_level         text DEFAULT NULL
)
RETURNS public.provider_applications
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_app public.provider_applications;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_role NOT IN ('GOALKEEPER','REFEREE') THEN RAISE EXCEPTION 'INVALID_ROLE'; END IF;
  IF p_id_photo_path IS NULL OR length(trim(p_id_photo_path)) = 0 THEN
    RAISE EXCEPTION 'ID_PHOTO_REQUIRED: Kimlik fotoğrafı zorunlu.';
  END IF;
  IF p_intent_letter IS NULL OR length(trim(p_intent_letter)) < 10 THEN
    RAISE EXCEPTION 'INTENT_LETTER_REQUIRED: Niyet mektubu en az 10 karakter olmalı.';
  END IF;

  -- Bekleyen başvuru varsa güncelle (idempotent), yoksa oluştur
  UPDATE public.provider_applications SET
    role = p_role, id_photo_path = p_id_photo_path, phone = p_phone,
    intent_letter = p_intent_letter, level = p_level,
    status = 'PENDING', admin_notes = NULL, reviewed_by = NULL, reviewed_at = NULL,
    created_at = now()
  WHERE user_id = v_uid AND status = 'PENDING'
  RETURNING * INTO v_app;

  IF NOT FOUND THEN
    INSERT INTO public.provider_applications (user_id, role, id_photo_path, phone, intent_letter, level)
    VALUES (v_uid, p_role, p_id_photo_path, p_phone, p_intent_letter, p_level)
    RETURNING * INTO v_app;
  END IF;

  -- Profil doğrulama durumunu "pending" yap (admin onaylayana dek listelenmez)
  PERFORM set_config('app.bypass_role_protection', 'true', true);
  UPDATE public.profiles
     SET verification_status = 'pending', phone = COALESCE(p_phone, phone), updated_at = now()
   WHERE id = v_uid;

  RETURN v_app;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_provider_application(text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_provider_application(text, text, text, text, text) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 9. RPC: admin_review_provider_application — admin onay/red (OPERASYON kuyruğu)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_review_provider_application(
  p_app_id  uuid,
  p_approve boolean,
  p_notes   text DEFAULT NULL
)
RETURNS public.provider_applications
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_app public.provider_applications;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'FORBIDDEN: Yalnız admin.'; END IF;

  SELECT * INTO v_app FROM public.provider_applications WHERE id = p_app_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  UPDATE public.provider_applications SET
    status = CASE WHEN p_approve THEN 'APPROVED' ELSE 'REJECTED' END,
    admin_notes = p_notes, reviewed_by = v_uid, reviewed_at = now()
  WHERE id = p_app_id
  RETURNING * INTO v_app;

  PERFORM set_config('app.bypass_role_protection', 'true', true);
  IF p_approve THEN
    UPDATE public.profiles SET
      role = v_app.role,
      roles = CASE WHEN COALESCE(roles,'[]'::jsonb) ? v_app.role
                   THEN roles ELSE COALESCE(roles,'[]'::jsonb) || jsonb_build_array(v_app.role) END,
      verification_status = 'approved',
      verification_reviewed_by = v_uid, verification_reviewed_at = now(),
      is_available = true, updated_at = now()
    WHERE id = v_app.user_id;
  ELSE
    UPDATE public.profiles SET
      verification_status = 'rejected', verification_notes = p_notes,
      verification_reviewed_by = v_uid, verification_reviewed_at = now(), updated_at = now()
    WHERE id = v_app.user_id;
  END IF;

  RETURN v_app;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_review_provider_application(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_provider_application(uuid, boolean, text) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 10. RPC: submit_provider_identity — TC kimlik doğrulama gönder (payout kapısı)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.submit_provider_identity(
  p_tc_no      text,
  p_full_name  text,
  p_birth_year integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_tc_no IS NULL OR p_tc_no !~ '^[1-9][0-9]{10}$' THEN
    RAISE EXCEPTION 'INVALID_TC: Geçerli bir 11 haneli TC kimlik no girin.';
  END IF;
  IF p_full_name IS NULL OR length(trim(p_full_name)) < 3 THEN
    RAISE EXCEPTION 'NAME_REQUIRED';
  END IF;

  INSERT INTO public.provider_identities (user_id, tc_no_hash, full_name, birth_year, status)
  VALUES (v_uid, encode(extensions.digest(p_tc_no, 'sha256'), 'hex'), trim(p_full_name), p_birth_year, 'PENDING')
  ON CONFLICT (user_id) DO UPDATE SET
    tc_no_hash = EXCLUDED.tc_no_hash, full_name = EXCLUDED.full_name,
    birth_year = EXCLUDED.birth_year,
    status = CASE WHEN public.provider_identities.status = 'VERIFIED'
                  THEN 'VERIFIED' ELSE 'PENDING' END,
    updated_at = now();

  RETURN jsonb_build_object('user_id', v_uid, 'status', 'PENDING');
END;
$$;
REVOKE ALL ON FUNCTION public.submit_provider_identity(text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_provider_identity(text, text, integer) TO authenticated;

-- Admin: kimlik doğrulamayı onayla/reddet
CREATE OR REPLACE FUNCTION public.admin_verify_provider_identity(
  p_user_id uuid,
  p_approve boolean,
  p_notes   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  UPDATE public.provider_identities SET
    status = CASE WHEN p_approve THEN 'VERIFIED' ELSE 'REJECTED' END,
    admin_notes = p_notes, verified_by = v_uid,
    verified_at = CASE WHEN p_approve THEN now() ELSE NULL END, updated_at = now()
  WHERE user_id = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  RETURN jsonb_build_object('user_id', p_user_id,
    'status', CASE WHEN p_approve THEN 'VERIFIED' ELSE 'REJECTED' END);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_verify_provider_identity(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_verify_provider_identity(uuid, boolean, text) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 11. RPC: find_providers_for_match — SIRALI öneri (müsait + yakın + yüksek puan)
--     Karar 3A: sistem öneri listesi sunar, kaptan seçer.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.find_providers_for_match(
  p_match_id      uuid,
  p_provider_type text
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_match  RECORD;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_provider_type NOT IN ('GK','REF') THEN RAISE EXCEPTION 'INVALID_TYPE'; END IF;

  SELECT id, starts_at, status, "creatorId", captain_id
  INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  IF p_provider_type = 'GK' THEN
    SELECT jsonb_agg(row_to_json(t) ORDER BY t.rating DESC, t.match_count DESC, t.fee ASC)
    INTO v_result FROM (
      SELECT g.id, g.name, g.avatar, g.rating, g.fee, g."matchCount" AS match_count,
             g.style, g."preferredZones" AS preferred_zones, g.coordinates, g."isElite" AS is_elite
      FROM public.goalkeepers g
      JOIN public.profiles p ON p.id = g.id
      WHERE p.verification_status = 'approved'
        AND COALESCE(p.is_available, true) = true
        AND COALESCE(g."isDemo", false) = false
        AND NOT public._provider_has_conflict(g.id, v_match.starts_at, p_match_id)
    ) t;
  ELSE
    SELECT jsonb_agg(row_to_json(t) ORDER BY t.rating DESC, t.match_count DESC, t.fee ASC)
    INTO v_result FROM (
      SELECT r.id, r.name, r.avatar, r.rating, r.fee, r."matchCount" AS match_count,
             r.level, r.style, r."preferredZones" AS preferred_zones, r.coordinates, r."isElite" AS is_elite
      FROM public.referees r
      JOIN public.profiles p ON p.id = r.id
      WHERE p.verification_status = 'approved'
        AND COALESCE(p.is_available, true) = true
        AND COALESCE(r."isDemo", false) = false
        AND NOT public._provider_has_conflict(r.id, v_match.starts_at, p_match_id)
    ) t;
  END IF;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.find_providers_for_match(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_providers_for_match(uuid, text) TO authenticated;

-- Yardımcı: sağlayıcı çakışma kontrolü (PENDING dahil, ±2 saat penceresi)
CREATE OR REPLACE FUNCTION public._provider_has_conflict(
  p_provider_id uuid,
  p_starts_at   timestamptz,
  p_exclude_match uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_starts_at IS NULL THEN RETURN false; END IF;
  RETURN EXISTS (
    SELECT 1
    FROM public.service_requests sr
    JOIN public.matches m ON m.id = sr.match_id
    WHERE sr.provider_id = p_provider_id
      AND sr.status IN ('PENDING','ACCEPTED','CAPTURED')
      AND (p_exclude_match IS NULL OR sr.match_id <> p_exclude_match)
      AND m.starts_at IS NOT NULL
      AND m.starts_at BETWEEN p_starts_at - interval '2 hours'
                          AND p_starts_at + interval '2 hours'
  );
END;
$$;
REVOKE ALL ON FUNCTION public._provider_has_conflict(uuid, timestamptz, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._provider_has_conflict(uuid, timestamptz, uuid) TO authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 12. RPC: create_service_request — kadro/kaptan kaleci/hakem talep eder
--     Sabit ücret + %10 komisyon; ödeme niyeti (blokaj) oluşturulur.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_service_request(
  p_match_id      uuid,
  p_provider_id   uuid,
  p_provider_type text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_match   RECORD;
  v_fee     numeric;
  v_scope   text;
  v_comm    jsonb;
  v_prov_amt numeric;
  v_comm_amt numeric;
  v_intent  public.payment_intents;
  v_req     public.service_requests;
  v_expiry  numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_provider_type NOT IN ('GK','REF') THEN RAISE EXCEPTION 'INVALID_TYPE'; END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  -- Yetki: yalnız maç sahibi/kaptan
  IF v_match."creatorId" IS DISTINCT FROM v_uid AND v_match.captain_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'FORBIDDEN: Yalnız maç sahibi/kaptan hizmet talep edebilir.';
  END IF;
  IF v_match.status IN ('CANCELLED','COMPLETED') THEN
    RAISE EXCEPTION 'INVALID_MATCH_STATE: Maç % durumunda.', v_match.status;
  END IF;

  -- Sağlayıcı ücretini ve onay/müsaitlik durumunu doğrula
  IF p_provider_type = 'GK' THEN
    SELECT g.fee INTO v_fee FROM public.goalkeepers g
    JOIN public.profiles p ON p.id = g.id
    WHERE g.id = p_provider_id AND p.verification_status = 'approved';
    v_scope := 'SERVICE_GK';
  ELSE
    SELECT r.fee INTO v_fee FROM public.referees r
    JOIN public.profiles p ON p.id = r.id
    WHERE r.id = p_provider_id AND p.verification_status = 'approved';
    v_scope := 'SERVICE_REF';
  END IF;
  IF v_fee IS NULL THEN RAISE EXCEPTION 'PROVIDER_UNAVAILABLE: Onaylı sağlayıcı bulunamadı.'; END IF;

  -- Çakışma kontrolü (PENDING dahil)
  IF public._provider_has_conflict(p_provider_id, v_match.starts_at, p_match_id) THEN
    RAISE EXCEPTION 'PROVIDER_CONFLICT: Sağlayıcının bu saatte başka bir maçı var.';
  END IF;

  -- Komisyon (%10): sağlayıcı eline net geçer
  v_comm     := public.calculate_commission(v_fee, v_scope);
  v_comm_amt := (v_comm->>'commission_amt')::numeric;
  v_prov_amt := (v_comm->>'net_amount')::numeric;

  -- Ödeme niyeti (blokaj) — iyzico bloğu edge function ile uygulanır
  INSERT INTO public.payment_intents (
    user_id, match_id, amount, currency, status, provider,
    commission_amount, owner_amount, service_provider_amount,
    commission_model, related_entity_type
  ) VALUES (
    v_uid, p_match_id, v_fee, 'TRY', 'PENDING', 'IYZICO',
    v_comm_amt, 0, v_prov_amt,
    v_comm->>'model',
    CASE WHEN p_provider_type = 'GK' THEN 'GK_SERVICE' ELSE 'REF_SERVICE' END
  )
  RETURNING * INTO v_intent;

  SELECT COALESCE(service_request_expiry_hours, 24) INTO v_expiry FROM public.settings LIMIT 1;

  INSERT INTO public.service_requests (
    match_id, provider_id, provider_type, requested_by, fee,
    commission_amount, provider_amount, payment_intent_id, expires_at
  ) VALUES (
    p_match_id, p_provider_id, p_provider_type, v_uid, v_fee,
    v_comm_amt, v_prov_amt, v_intent.id, now() + make_interval(hours => COALESCE(v_expiry,24)::int)
  )
  RETURNING * INTO v_req;

  RETURN jsonb_build_object(
    'request_id', v_req.id, 'intent_id', v_intent.id, 'status', 'PENDING',
    'fee', v_fee, 'commission', v_comm_amt, 'provider_amount', v_prov_amt
  );
END;
$$;
REVOKE ALL ON FUNCTION public.create_service_request(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_service_request(uuid, uuid, text) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 13. RPC: respond_service_request — sağlayıcı kabul/red
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.respond_service_request(
  p_request_id uuid,
  p_accept     boolean
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_req public.service_requests;
BEGIN
  SELECT * INTO v_req FROM public.service_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_req.provider_id IS DISTINCT FROM v_uid AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF v_req.status <> 'PENDING' THEN
    RAISE EXCEPTION 'INVALID_STATE: Talep % durumunda.', v_req.status;
  END IF;

  IF p_accept THEN
    UPDATE public.service_requests SET status = 'ACCEPTED', accepted_at = now()
    WHERE id = p_request_id;
    RETURN jsonb_build_object('request_id', p_request_id, 'status', 'ACCEPTED');
  ELSE
    UPDATE public.service_requests SET status = 'REJECTED', cancelled_at = now()
    WHERE id = p_request_id;
    -- Blokajı serbest bırak
    IF v_req.payment_intent_id IS NOT NULL THEN
      PERFORM public.void_preauth(v_req.payment_intent_id, 'SERVICE_REJECTED');
    END IF;
    RETURN jsonb_build_object('request_id', p_request_id, 'status', 'REJECTED');
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.respond_service_request(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_service_request(uuid, boolean) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 14. RPC: cancel_service_request — talep eden/kaptan veya admin iptal
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cancel_service_request(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_req public.service_requests;
BEGIN
  SELECT * INTO v_req FROM public.service_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_req.requested_by IS DISTINCT FROM v_uid AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF v_req.status IN ('CAPTURED','COMPLETED') THEN
    RAISE EXCEPTION 'INVALID_STATE: Tahsil edilmiş talep iptal edilemez (iade gerekir).';
  END IF;

  UPDATE public.service_requests SET status = 'CANCELLED', cancelled_at = now()
  WHERE id = p_request_id;
  IF v_req.payment_intent_id IS NOT NULL THEN
    PERFORM public.void_preauth(v_req.payment_intent_id, 'SERVICE_CANCELLED');
  END IF;
  RETURN jsonb_build_object('request_id', p_request_id, 'status', 'CANCELLED');
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_service_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_service_request(uuid) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 15. RPC: capture_service_request — hizmet ücretini tahsil et + kazancı yaz
--     Maç onayında otomatik (trigger) ya da onay sonrası ekleme için anında çağrılır.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.capture_service_request(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_req public.service_requests;
BEGIN
  SELECT * INTO v_req FROM public.service_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_req.status = 'CAPTURED' THEN
    RETURN jsonb_build_object('request_id', p_request_id, 'status', 'CAPTURED', 'idempotent', true);
  END IF;
  IF v_req.status <> 'ACCEPTED' THEN
    RAISE EXCEPTION 'INVALID_STATE: Tahsil için ACCEPTED bekleniyor, mevcut: %', v_req.status;
  END IF;

  -- Ödeme niyetini tahsil et (BLOCKED/PENDING → CAPTURED)
  IF v_req.payment_intent_id IS NOT NULL THEN
    UPDATE public.payment_intents
    SET status = 'CAPTURED', captured_at = now()
    WHERE id = v_req.payment_intent_id AND status IN ('BLOCKED','PENDING');
  END IF;

  UPDATE public.service_requests SET status = 'CAPTURED', captured_at = now()
  WHERE id = p_request_id;

  -- Atanmış sağlayıcıyı maça yaz
  IF v_req.provider_type = 'GK' THEN
    UPDATE public.matches SET gk_id = v_req.provider_id WHERE id = v_req.match_id;
  ELSE
    UPDATE public.matches SET "refereeId" = v_req.provider_id WHERE id = v_req.match_id;
  END IF;

  -- Sağlayıcı kazancını EARNINGS'e PENDING olarak yaz (değerlendirmeye dek beklemede)
  INSERT INTO public.wallet_transactions
    (user_id, amount, type, balance_type, status, reference_type, reference_id, description, meta)
  VALUES
    (v_req.provider_id, v_req.provider_amount, 'SERVICE_EARNING', 'EARNINGS', 'PENDING',
     'PAYMENT_INTENT', v_req.payment_intent_id,
     'Hizmet kazancı (değerlendirme sonrası serbest)',
     jsonb_build_object('service_request_id', v_req.id, 'provider_type', v_req.provider_type));

  RETURN jsonb_build_object('request_id', p_request_id, 'status', 'CAPTURED',
    'provider_amount', v_req.provider_amount);
END;
$$;
REVOKE ALL ON FUNCTION public.capture_service_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.capture_service_request(uuid) TO authenticated, service_role;

-- Maç onaylandığında (status → CONFIRMED) kabul edilmiş hizmetleri otomatik tahsil et
CREATE OR REPLACE FUNCTION public._capture_services_on_confirm()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_req RECORD;
BEGIN
  IF NEW.status = 'CONFIRMED' AND COALESCE(OLD.status,'') IS DISTINCT FROM 'CONFIRMED' THEN
    FOR v_req IN
      SELECT id FROM public.service_requests
      WHERE match_id = NEW.id AND status = 'ACCEPTED'
    LOOP
      PERFORM public.capture_service_request(v_req.id);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger fonksiyonu yalnız trigger bağlamında çalışır; doğrudan RPC çağrısına kapat
REVOKE ALL ON FUNCTION public._capture_services_on_confirm() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_capture_services_on_confirm ON public.matches;
CREATE TRIGGER trg_capture_services_on_confirm
  AFTER UPDATE OF status ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public._capture_services_on_confirm();

-- ────────────────────────────────────────────────────────────────────────────
-- 16. RPC: submit_service_rating — maç sonu kaleci/hakem 1-10 + payout serbest
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.submit_service_rating(
  p_match_id      uuid,
  p_provider_id   uuid,
  p_provider_type text,
  p_score         integer,
  p_comment       text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_provider_type NOT IN ('GK','REF') THEN RAISE EXCEPTION 'INVALID_TYPE'; END IF;
  IF NOT public._is_match_participant(p_match_id, v_uid) AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'NOT_PARTICIPANT: Yalnız maça katılanlar değerlendirebilir.';
  END IF;

  INSERT INTO public.service_ratings (match_id, provider_id, provider_type, rater_id, score, comment)
  VALUES (p_match_id, p_provider_id, p_provider_type, v_uid,
          LEAST(10, GREATEST(1, p_score)), p_comment)
  ON CONFLICT (match_id, provider_id, rater_id) DO UPDATE SET
    score = EXCLUDED.score, comment = EXCLUDED.comment;

  -- Sağlayıcı ortalama rating'ini güncelle
  PERFORM public._recompute_provider_rating(p_provider_id, p_provider_type);
  -- Değerlendirme = katılım kanıtı → payout serbest bırak (anında)
  PERFORM public._release_service_payout(p_match_id, p_provider_id);

  RETURN jsonb_build_object('match_id', p_match_id, 'provider_id', p_provider_id, 'score', p_score);
END;
$$;
REVOKE ALL ON FUNCTION public.submit_service_rating(uuid, uuid, text, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_service_rating(uuid, uuid, text, integer, text) TO authenticated;

-- Yardımcı: sağlayıcı ortalama rating'ini yeniden hesapla
CREATE OR REPLACE FUNCTION public._recompute_provider_rating(
  p_provider_id   uuid,
  p_provider_type text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_avg numeric;
BEGIN
  SELECT round(avg(score)::numeric, 2) INTO v_avg
  FROM public.service_ratings WHERE provider_id = p_provider_id;
  IF v_avg IS NULL THEN RETURN; END IF;
  IF p_provider_type = 'GK' THEN
    UPDATE public.goalkeepers SET rating = v_avg WHERE id = p_provider_id;
  ELSE
    UPDATE public.referees SET rating = v_avg WHERE id = p_provider_id;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public._recompute_provider_rating(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._recompute_provider_rating(uuid, text) TO authenticated, service_role;

-- Yardımcı: hizmet payout'unu serbest bırak (PENDING kazancı → COMPLETED = çekilebilir)
CREATE OR REPLACE FUNCTION public._release_service_payout(
  p_match_id    uuid,
  p_provider_id uuid
)
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

  -- Beklemedeki hizmet kazancını çekilebilir yap (anında — owner gibi 2 hafta beklemez)
  UPDATE public.wallet_transactions SET status = 'COMPLETED'
  WHERE user_id = p_provider_id AND type = 'SERVICE_EARNING'
    AND status = 'PENDING' AND reference_id = v_req.payment_intent_id;

  UPDATE public.service_requests SET
    status = 'COMPLETED', completed_at = now(), payout_released = true
  WHERE id = v_req.id;
END;
$$;
REVOKE ALL ON FUNCTION public._release_service_payout(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._release_service_payout(uuid, uuid) TO authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 17. RPC: report_service_attendance — "Sorun Bildir" (değerlendirme yapılmadıysa)
--     Sağlayıcı katılımını teyit eder → admin serbest bırakır.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.report_service_attendance(
  p_request_id uuid,
  p_note       text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_req public.service_requests;
BEGIN
  SELECT * INTO v_req FROM public.service_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_req.provider_id IS DISTINCT FROM v_uid THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF v_req.status <> 'CAPTURED' THEN
    RAISE EXCEPTION 'INVALID_STATE: Yalnız tahsil edilmiş ve ödenmemiş talep bildirilebilir.';
  END IF;

  -- Admin doğrulama kuyruğuna düşürmek için talebe not ekle (admin panelinde görünür)
  UPDATE public.service_requests
  SET expires_at = now()   -- işaretleme: admin dikkatine
  WHERE id = p_request_id;

  RETURN jsonb_build_object('request_id', p_request_id, 'status', 'REPORTED',
    'message', 'Talebiniz admin operasyon ekibine iletildi.');
END;
$$;
REVOKE ALL ON FUNCTION public.report_service_attendance(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.report_service_attendance(uuid, text) TO authenticated;

-- Admin: hizmet payout'unu zorla serbest bırak (Sorun Bildir sonrası)
CREATE OR REPLACE FUNCTION public.admin_release_service_payout(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_req public.service_requests;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  SELECT * INTO v_req FROM public.service_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  PERFORM public._release_service_payout(v_req.match_id, v_req.provider_id);
  RETURN jsonb_build_object('request_id', p_request_id, 'status', 'RELEASED');
END;
$$;
REVOKE ALL ON FUNCTION public.admin_release_service_payout(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_release_service_payout(uuid) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 18. request_payout — sağlayıcılar için TC kimlik doğrulama kapısı eklendi
--     Karar 4B: GOALKEEPER/REFEREE ilk payout öncesi VERIFIED kimlik şart.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.request_payout(
  p_amount           numeric,
  p_iban             text,
  p_iban_holder_name text,
  p_payout_type      text DEFAULT 'MANUAL'
)
RETURNS public.payout_requests
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_balance numeric;
  v_wallet  jsonb;
  v_payout  public.payout_requests;
  v_role    text;
  v_idstat  text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'INVALID_AMOUNT: Tutar sifirdan buyuk olmali.'; END IF;
  IF p_iban IS NULL OR length(trim(p_iban)) < 10 THEN RAISE EXCEPTION 'INVALID_IBAN'; END IF;

  -- FAZ 5: kaleci/hakem ilk payout öncesi TC kimlik doğrulaması zorunlu
  SELECT role INTO v_role FROM public.profiles WHERE id = v_uid;
  IF v_role IN ('GOALKEEPER','REFEREE') THEN
    SELECT status INTO v_idstat FROM public.provider_identities WHERE user_id = v_uid;
    IF v_idstat IS DISTINCT FROM 'VERIFIED' THEN
      RAISE EXCEPTION 'IDENTITY_REQUIRED: Ödeme almadan önce TC kimlik doğrulaması gerekli.';
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

  INSERT INTO public.payout_requests (user_id, amount, iban, iban_holder_name, payout_type)
  VALUES (v_uid, p_amount, p_iban, p_iban_holder_name, p_payout_type)
  RETURNING * INTO v_payout;

  INSERT INTO public.wallet_transactions (user_id, amount, type, balance_type, status, reference_type, reference_id, description)
  VALUES (v_uid, p_amount, 'WITHDRAWAL', 'EARNINGS', 'PENDING', 'PAYOUT', v_payout.id, 'IBAN odeme talebi');

  RETURN v_payout;
END;
$$;
REVOKE ALL ON FUNCTION public.request_payout(numeric, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_payout(numeric, text, text, text) TO authenticated;
