-- ================================================================
-- FAZ: Onboarding + Yaş Kısıtlaması / Veli Onayı — Veri Modeli
-- ================================================================
-- Bu migration üç işi bir arada kurar:
--   (1) Onboarding'in topladığı yeni profil alanları (yaş aralığı,
--       oyun stili, cinsiyet, ad/soyad, onboarding tamamlandı bayrağı).
--   (2) Reşit olmayan kullanıcılar için "sınırlı mod" + veli onayı
--       altyapısı (guardian_consents) — kod ile eşleştirme, TC hash,
--       18+ teyidi, tek aktif onay, denetlenebilir kayıt, geri alma.
--   (3) Genel KVKK/sözleşme rıza denetim kaydı (user_consents).
--
-- Tasarım kararları (kullanıcı onaylı):
--   • Yaş aşamalı: onboarding'de aralık (13-17 = reşit değil), kesin
--     kimlik yalnızca veli onayı anında TC ile alınır.
--   • Kod çocukta üretilir, veli kendi oturumunda girer.
--   • Veli OTP'siz onaylar (onay zaten velinin doğrulanmış oturumundan
--     gelir) — 18+ teyidi velinin beyan ettiği doğum tarihinden yapılır.
--   • Çocuğun doğum tarihi veli formunda alınıp profiles.birthdate'e
--     yazılır → çocuk 18'e basınca kapı OTOMATİK kalkar (canlı hesap).
--   • TC asla düz metin saklanmaz: SHA-256, kullanıcı-id ile tuzlanır
--     (mevcut provider_identities deseni + rainbow-table sertleştirmesi).
--
-- Not: TC hash'i için ileride Supabase Vault tabanlı bir "pepper"
-- eklenmesi önerilir (bkz. aşağıdaki _tc_hash yorumu).
-- ================================================================

-- ── 1) profiles: onboarding + veli onayı kolonları ──────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS age_range               text,
  ADD COLUMN IF NOT EXISTS gender                  text,
  ADD COLUMN IF NOT EXISTS play_style              text,
  ADD COLUMN IF NOT EXISTS first_name              text,
  ADD COLUMN IF NOT EXISTS last_name               text,
  ADD COLUMN IF NOT EXISTS has_completed_onboarding boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_minor                boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS guardian_consent_status text NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS guardian_user_id        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS guardian_link_code      text;

-- CHECK kısıtları (idempotent — varsa atla)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_age_range_chk') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_age_range_chk
      CHECK (age_range IS NULL OR age_range IN ('13-17','18-23','24-30','31-40','41-50','51+'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_gender_chk') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_gender_chk
      CHECK (gender IS NULL OR gender IN ('kadin','erkek'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_play_style_chk') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_play_style_chk
      CHECK (play_style IS NULL OR play_style IN ('ciddi','taktiksel','rahat'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_guardian_status_chk') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_guardian_status_chk
      CHECK (guardian_consent_status IN ('NONE','PENDING','ACTIVE','REVOKED'));
  END IF;
END$$;

-- guardian_link_code benzersiz (NULL'lar hariç)
CREATE UNIQUE INDEX IF NOT EXISTS profiles_guardian_link_code_uq
  ON public.profiles (guardian_link_code)
  WHERE guardian_link_code IS NOT NULL;

-- ── 2) public_profiles view'ını yeni GÖRÜNÜR alanlarla tazele ───
--    play_style ve gender oyuncu kartında gösterilen alanlardır →
--    public. is_minor / guardian_* / first_name / last_name / age_range
--    HASSAS → view'a ASLA eklenmez.
DROP VIEW IF EXISTS public.public_profiles;
CREATE VIEW public.public_profiles
WITH (security_invoker = false) AS
SELECT
  id, name, full_name, avatar_url, role, roles,
  trust_score, skill_rating, reliability_score, ratings_history,
  is_verified, join_date, rating, is_pro, match_count, win_count,
  total_matches, diamonds, communities, player_card, oyna_id,
  is_looking_for_team, is_available, card_active, card_tier,
  position, bio, preferred_foot,
  play_style,
  gender,
  CASE WHEN show_online_status THEN last_active_at ELSE NULL END AS last_active_at
FROM public.profiles
WHERE is_searchable = true
   OR id = (SELECT auth.uid())
   OR is_admin();

GRANT SELECT ON public.public_profiles TO authenticated;
REVOKE ALL ON public.public_profiles FROM anon, public;

COMMENT ON VIEW public.public_profiles IS
  'Column- and row-filtered public read surface for profiles. Never add email, phone, last_location, wallet_balance, wallet, iyzico_card_user_key, first_name, last_name, age_range, is_minor, guardian_* to this view.';

-- ── 3) guardian_consents: veli onayı denetlenebilir kaydı ───────
CREATE TABLE IF NOT EXISTS public.guardian_consents (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  minor_user_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  guardian_user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  guardian_full_name  text NOT NULL,
  guardian_tc_hash    text NOT NULL,          -- SHA-256(user_id-tuzlu), düz metin saklanmaz
  guardian_birthdate  date,
  minor_full_name     text NOT NULL,
  minor_tc_hash       text NOT NULL,          -- SHA-256(user_id-tuzlu), düz metin saklanmaz
  minor_birthdate     date,
  consent_text_version text NOT NULL,
  status              text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','REVOKED')),
  consented_at        timestamptz NOT NULL DEFAULT now(),
  revoked_at          timestamptz,
  ip_address          text,
  user_agent          text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- Bir çocuk için AYNI ANDA tek aktif onay (tek aktif eşleşme kuralı)
CREATE UNIQUE INDEX IF NOT EXISTS guardian_consents_one_active_per_minor
  ON public.guardian_consents (minor_user_id)
  WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS guardian_consents_guardian_idx
  ON public.guardian_consents (guardian_user_id);

ALTER TABLE public.guardian_consents ENABLE ROW LEVEL SECURITY;

-- Çocuk kendi onay kaydını, veli oluşturduğu kaydı, admin hepsini görür.
-- Yazma YALNIZCA SECURITY DEFINER RPC ile (tablo düzeyinde INSERT/UPDATE
-- politikası bilinçli olarak YOK → doğrudan yazım reddedilir).
DROP POLICY IF EXISTS guardian_consents_select ON public.guardian_consents;
CREATE POLICY guardian_consents_select ON public.guardian_consents
  FOR SELECT TO authenticated
  USING (minor_user_id = (SELECT auth.uid())
      OR guardian_user_id = (SELECT auth.uid())
      OR is_admin());

-- ── 4) user_consents: genel KVKK/sözleşme rıza denetim kaydı ────
CREATE TABLE IF NOT EXISTS public.user_consents (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  document_key     text NOT NULL,              -- 'TERMS' | 'KVKK' | 'RIZA' | 'VELI' ...
  document_version text NOT NULL,
  accepted_at      timestamptz NOT NULL DEFAULT now(),
  ip_address       text,
  user_agent       text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_consents_user_idx ON public.user_consents (user_id);

ALTER TABLE public.user_consents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_consents_select ON public.user_consents;
CREATE POLICY user_consents_select ON public.user_consents
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR is_admin());

-- ── 5) Kod tarama (enumeration) koruması için deneme sayacı ─────
CREATE TABLE IF NOT EXISTS public.guardian_lookup_attempts (
  user_id      uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  window_start timestamptz NOT NULL DEFAULT now(),
  attempts     integer NOT NULL DEFAULT 0
);
ALTER TABLE public.guardian_lookup_attempts ENABLE ROW LEVEL SECURITY;
-- Yalnızca RPC (SECURITY DEFINER) erişir; client politikası yok.

-- ── 6) Yardımcı fonksiyonlar ────────────────────────────────────

-- Reşitlik hesaplama: kesin doğum tarihi varsa ONA göre; yoksa yaş
-- aralığına göre. Böylece veli onayında çocuğun doğum tarihi yazılınca
-- 18'e basıldığı an kapı canlı olarak kendiliğinden kalkar.
CREATE OR REPLACE FUNCTION public.compute_is_minor(p_birthdate date, p_age_range text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_birthdate IS NOT NULL
      THEN (p_birthdate > (CURRENT_DATE - INTERVAL '18 years'))
    WHEN p_age_range = '13-17'
      THEN true
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.is_user_minor(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.compute_is_minor(birthdate, age_range)
  FROM public.profiles WHERE id = p_user_id;
$$;

-- Ödeme/işlem kapısı: reşit VE aktif veli onayı yoksa hata fırlatır.
-- Ödeme RPC'leri (Faz 2) bunu çağırır. Çocuk 18'e bastıysa
-- is_user_minor false döner → onay olmasa da geçer (otomatik kalkma).
CREATE OR REPLACE FUNCTION public.assert_can_transact(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  IF public.is_user_minor(p_user_id) THEN
    SELECT guardian_consent_status INTO v_status FROM public.profiles WHERE id = p_user_id;
    IF v_status IS DISTINCT FROM 'ACTIVE' THEN
      RAISE EXCEPTION 'MINOR_GUARDIAN_CONSENT_REQUIRED'
        USING ERRCODE = 'check_violation',
              HINT = 'Reşit olmayan kullanıcı için veli onayı gerekli.';
    END IF;
  END IF;
END;
$$;

-- TC hash: kullanıcı-id ile tuzlanmış SHA-256. Global rainbow-table'a
-- karşı sertleştirir (TC uzayı küçük olduğundan tuzsuz SHA-256 zayıftır).
-- İleride: current_setting('app.tc_pepper', true) ile bir Vault pepper
-- eklenmesi önerilir.
CREATE OR REPLACE FUNCTION public._tc_hash(p_tc text, p_salt uuid)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT encode(extensions.digest(p_tc || ':' || p_salt::text, 'sha256'), 'hex');
$$;

-- İstek başlıklarından IP/User-Agent (best-effort; bazı bağlamlarda null)
CREATE OR REPLACE FUNCTION public._req_ip()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT split_part(
    COALESCE(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''),
    ',', 1);
$$;
CREATE OR REPLACE FUNCTION public._req_ua()
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('request.headers', true)::json ->> 'user-agent', '');
$$;

-- ── 7) RPC: çocuğun Veli Bağlantı Kodu (üret/getir) ─────────────
CREATE OR REPLACE FUNCTION public.get_or_create_guardian_link_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid  uuid := (SELECT auth.uid());
  v_code text;
  v_alph text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- karışması kolay 0/O/1/I/L yok
  i      int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  SELECT guardian_link_code INTO v_code FROM public.profiles WHERE id = v_uid;
  IF v_code IS NOT NULL THEN
    RETURN v_code;
  END IF;

  LOOP
    v_code := '';
    FOR i IN 1..8 LOOP
      v_code := v_code || substr(v_alph, 1 + floor(random() * length(v_alph))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE guardian_link_code = v_code);
  END LOOP;

  UPDATE public.profiles SET guardian_link_code = v_code WHERE id = v_uid;
  RETURN v_code;
END;
$$;

-- ── 8) RPC: veli, kodu girip çocuğun MASKELİ bilgisini görür ────
--    Enumeration'a karşı: çağıran başına 15 dk'da 10 deneme.
CREATE OR REPLACE FUNCTION public.lookup_minor_by_code(p_code text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      uuid := (SELECT auth.uid());
  v_attempts int;
  v_window   timestamptz;
  v_minor    record;
  v_masked   text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  -- Rate limit (15 dk pencere, 10 deneme)
  INSERT INTO public.guardian_lookup_attempts (user_id, window_start, attempts)
    VALUES (v_uid, now(), 1)
  ON CONFLICT (user_id) DO UPDATE
    SET attempts = CASE WHEN public.guardian_lookup_attempts.window_start < now() - INTERVAL '15 minutes'
                        THEN 1 ELSE public.guardian_lookup_attempts.attempts + 1 END,
        window_start = CASE WHEN public.guardian_lookup_attempts.window_start < now() - INTERVAL '15 minutes'
                        THEN now() ELSE public.guardian_lookup_attempts.window_start END
  RETURNING attempts INTO v_attempts;

  IF v_attempts > 10 THEN
    RAISE EXCEPTION 'RATE_LIMITED' USING HINT = 'Çok fazla deneme. Lütfen sonra tekrar deneyin.';
  END IF;

  SELECT id, name, full_name, first_name, age_range, birthdate, guardian_consent_status
    INTO v_minor
  FROM public.profiles
  WHERE guardian_link_code = upper(trim(p_code));

  -- Bulunamadı / kendisi / reşit / zaten onaylı → sızdırmadan generic yanıt
  IF NOT FOUND
     OR v_minor.id = v_uid
     OR NOT public.compute_is_minor(v_minor.birthdate, v_minor.age_range)
     OR v_minor.guardian_consent_status = 'ACTIVE' THEN
    RETURN json_build_object('found', false);
  END IF;

  -- Maskeli ad: ilk harf + ***
  v_masked := left(COALESCE(NULLIF(v_minor.first_name,''), v_minor.full_name, v_minor.name, '•'), 1) || '***';

  RETURN json_build_object(
    'found', true,
    'masked_name', v_masked,
    'age_range', v_minor.age_range
  );
END;
$$;

-- ── 9) RPC: veli onayını oluştur (asıl işlem) ───────────────────
CREATE OR REPLACE FUNCTION public.create_guardian_consent(
  p_code                text,
  p_guardian_full_name  text,
  p_guardian_tc         text,
  p_guardian_birthdate  date,
  p_minor_full_name     text,
  p_minor_tc            text,
  p_minor_birthdate     date,
  p_consent_text_version text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_guardian uuid := (SELECT auth.uid());
  v_minor_id uuid;
BEGIN
  IF v_guardian IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  -- TC format doğrulaması (mevcut provider_identities deseniyle aynı)
  IF p_guardian_tc !~ '^[1-9][0-9]{10}$' OR p_minor_tc !~ '^[1-9][0-9]{10}$' THEN
    RAISE EXCEPTION 'INVALID_TC' USING HINT = 'TC Kimlik No 11 haneli olmalı.';
  END IF;

  IF COALESCE(trim(p_guardian_full_name),'') = '' OR COALESCE(trim(p_minor_full_name),'') = '' THEN
    RAISE EXCEPTION 'NAME_REQUIRED';
  END IF;

  -- Veli 18+ olmalı (beyan edilen doğum tarihinden)
  IF p_guardian_birthdate IS NULL OR p_guardian_birthdate > (CURRENT_DATE - INTERVAL '18 years') THEN
    RAISE EXCEPTION 'GUARDIAN_NOT_ADULT' USING HINT = 'Onay veren veli 18 yaşından büyük olmalı.';
  END IF;

  -- Kod ile çocuğu bul
  SELECT id INTO v_minor_id FROM public.profiles WHERE guardian_link_code = upper(trim(p_code));
  IF v_minor_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_CODE' USING HINT = 'Veli bağlantı kodu geçersiz.';
  END IF;

  IF v_minor_id = v_guardian THEN
    RAISE EXCEPTION 'SELF_LINK_FORBIDDEN';
  END IF;

  -- Hedef gerçekten reşit değil olmalı (beyan edilen çocuk doğum tarihi
  -- veya kayıtlı aralık üzerinden)
  IF NOT public.compute_is_minor(
        p_minor_birthdate,
        (SELECT age_range FROM public.profiles WHERE id = v_minor_id)) THEN
    RAISE EXCEPTION 'TARGET_NOT_MINOR' USING HINT = 'Bu hesap reşit görünüyor; veli onayı gerekmez.';
  END IF;

  -- Tek aktif onay (partial unique index de korur, burada erken hata verelim)
  IF EXISTS (SELECT 1 FROM public.guardian_consents
             WHERE minor_user_id = v_minor_id AND status = 'ACTIVE') THEN
    RAISE EXCEPTION 'ALREADY_LINKED' USING HINT = 'Bu çocuk için zaten aktif bir veli onayı var.';
  END IF;

  -- Veli kendi doğum tarihini profilinde boşsa doldur (gönüllü beyan)
  UPDATE public.profiles
    SET birthdate = COALESCE(birthdate, p_guardian_birthdate)
    WHERE id = v_guardian;

  -- Çocuğun kesin doğum tarihini yaz → 18'de kapı otomatik kalkar
  UPDATE public.profiles
    SET birthdate = p_minor_birthdate,
        is_minor = public.compute_is_minor(p_minor_birthdate, age_range),
        guardian_consent_status = 'ACTIVE',
        guardian_user_id = v_guardian,
        updated_at = now()
    WHERE id = v_minor_id;

  INSERT INTO public.guardian_consents (
    minor_user_id, guardian_user_id,
    guardian_full_name, guardian_tc_hash, guardian_birthdate,
    minor_full_name, minor_tc_hash, minor_birthdate,
    consent_text_version, status, consented_at, ip_address, user_agent
  ) VALUES (
    v_minor_id, v_guardian,
    trim(p_guardian_full_name), public._tc_hash(p_guardian_tc, v_guardian), p_guardian_birthdate,
    trim(p_minor_full_name),    public._tc_hash(p_minor_tc, v_minor_id),    p_minor_birthdate,
    p_consent_text_version, 'ACTIVE', now(), public._req_ip(), public._req_ua()
  );

  RETURN json_build_object('ok', true, 'minor_user_id', v_minor_id);
END;
$$;

-- ── 10) RPC: veli onayı geri alma (48 saat içinde sınırlı moda döner) ──
CREATE OR REPLACE FUNCTION public.revoke_guardian_consent(p_minor_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_guardian uuid := (SELECT auth.uid());
  v_found    uuid;
BEGIN
  IF v_guardian IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  SELECT id INTO v_found FROM public.guardian_consents
  WHERE minor_user_id = p_minor_user_id
    AND guardian_user_id = v_guardian
    AND status = 'ACTIVE';

  IF v_found IS NULL THEN
    RAISE EXCEPTION 'CONSENT_NOT_FOUND';
  END IF;

  UPDATE public.guardian_consents
    SET status = 'REVOKED', revoked_at = now()
    WHERE id = v_found;

  UPDATE public.profiles
    SET guardian_consent_status = 'REVOKED', updated_at = now()
    WHERE id = p_minor_user_id;

  RETURN json_build_object('ok', true);
END;
$$;

-- ── 11) RPC: genel rıza kaydı (KVKK/sözleşme kabulü) ────────────
CREATE OR REPLACE FUNCTION public.record_user_consent(
  p_document_key text,
  p_document_version text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;
  IF COALESCE(trim(p_document_key),'') = '' OR COALESCE(trim(p_document_version),'') = '' THEN
    RAISE EXCEPTION 'DOCUMENT_REQUIRED';
  END IF;

  INSERT INTO public.user_consents (user_id, document_key, document_version, accepted_at, ip_address, user_agent)
  VALUES (v_uid, upper(trim(p_document_key)), trim(p_document_version), now(), public._req_ip(), public._req_ua());

  RETURN json_build_object('ok', true);
END;
$$;

-- ── 12) Yetkiler: RPC'ler yalnızca authenticated'a ──────────────
REVOKE ALL ON FUNCTION public.get_or_create_guardian_link_code()                FROM anon, public;
REVOKE ALL ON FUNCTION public.lookup_minor_by_code(text)                        FROM anon, public;
REVOKE ALL ON FUNCTION public.create_guardian_consent(text,text,text,date,text,text,date,text) FROM anon, public;
REVOKE ALL ON FUNCTION public.revoke_guardian_consent(uuid)                     FROM anon, public;
REVOKE ALL ON FUNCTION public.record_user_consent(text,text)                    FROM anon, public;

GRANT EXECUTE ON FUNCTION public.get_or_create_guardian_link_code()             TO authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_minor_by_code(text)                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_guardian_consent(text,text,text,date,text,text,date,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_guardian_consent(uuid)                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_user_consent(text,text)                 TO authenticated;

-- assert_can_transact / is_user_minor ödeme RPC'lerinden (SECURITY DEFINER
-- bağlamında) çağrılır; doğrudan client erişimine gerek yok.
REVOKE ALL ON FUNCTION public.assert_can_transact(uuid) FROM anon, public;
REVOKE ALL ON FUNCTION public.is_user_minor(uuid)       FROM anon, public;

COMMENT ON TABLE public.guardian_consents IS
  'Reşit olmayan kullanıcı için veli muvafakati — denetlenebilir kayıt. TC alanları hash''li; yazım yalnızca create_guardian_consent/revoke_guardian_consent RPC''leri ile.';
COMMENT ON TABLE public.user_consents IS
  'KVKK/sözleşme kabullerinin sunucu tarafı denetim kaydı (kim, hangi belge, hangi sürüm, ne zaman, IP/UA).';
