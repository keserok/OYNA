-- ============================================================
-- F5.6 — Admin MFA kurtarma yolu (cihaz kaybı kilidini önler)
-- ============================================================
-- Tespit düzeltmesi: "Admin MFA yok" iddiası YANLIŞTI — TOTP enroll/challenge,
-- aal2 kapısı ve oturum-restore koruması AdminAuthGate/AdminMfaGate'te uçtan
-- uca yazılmış durumda. Gerçek eksik: app_config.admin_mfa_required anahtarı
-- canlıda HİÇ YOK (get_config_bool varsayılanı false → MFA kapalı) ve cihaz
-- kaybında kurtarma yolu bulunmuyor.
--
-- Bu migration kurtarma altyapısını kurar. Bayrağı AÇMAZ — açma kararı ürün
-- kararıdır ve şu sırayı gerektirir (ADMIN_PANEL_KARARLAR Soru 27):
--   1) bu migration + UI deploy edilir,
--   2) en az bir SUPER_ADMIN enroll olup kurtarma kodlarını indirir,
--   3) ancak ondan sonra admin_mfa_required=true yapılır (ayrı migration).
-- Sıra bozulursa tek admin'in telefon kaybı platformu kilitler.

-- ------------------------------------------------------------
-- 1) Kurtarma kodu tablosu (yalnız hash saklanır)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_mfa_recovery_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_mfa_recovery_user
  ON public.admin_mfa_recovery_codes(user_id) WHERE used_at IS NULL;

ALTER TABLE public.admin_mfa_recovery_codes ENABLE ROW LEVEL SECURITY;

-- Doğrudan erişim YOK: kodlar yalnız SECURITY DEFINER RPC'lerle üretilir/tüketilir.
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'admin_mfa_recovery_codes'
      AND policyname = 'admin_mfa_recovery_no_direct_access'
  ) THEN
    CREATE POLICY admin_mfa_recovery_no_direct_access
      ON public.admin_mfa_recovery_codes
      FOR ALL TO public
      USING (false) WITH CHECK (false);
  END IF;
END
$do$;

REVOKE ALL ON public.admin_mfa_recovery_codes FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- 2) Kod üretimi — düz metin YALNIZ BİR KEZ döner
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_mfa_generate_recovery_codes(p_count int DEFAULT 8)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_codes text[] := '{}';
  v_code text;
  i int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF p_count < 4 OR p_count > 16 THEN RAISE EXCEPTION 'INVALID_COUNT'; END IF;

  -- Yeniden üretim eskileri geçersiz kılar (tek aktif set)
  DELETE FROM public.admin_mfa_recovery_codes WHERE user_id = v_uid AND used_at IS NULL;

  FOR i IN 1..p_count LOOP
    -- 10 hane, karışık karakter yok (0/O, 1/I hariç): XXXXX-XXXXX
    v_code := upper(
      substr(translate(encode(extensions.gen_random_bytes(8), 'base64'), '+/=OI01lo', 'ABCDEFGHJ'), 1, 5)
      || '-' ||
      substr(translate(encode(extensions.gen_random_bytes(8), 'base64'), '+/=OI01lo', 'KMNPQRSTU'), 1, 5)
    );
    INSERT INTO public.admin_mfa_recovery_codes (user_id, code_hash)
    VALUES (v_uid, extensions.crypt(v_code, extensions.gen_salt('bf')));
    v_codes := array_append(v_codes, v_code);
  END LOOP;

  PERFORM public.log_admin_action('MFA_RECOVERY_CODES_GENERATED', 'user', v_uid, NULL,
    NULL, jsonb_build_object('count', p_count));

  RETURN v_codes;
END; $function$;

REVOKE ALL ON FUNCTION public.admin_mfa_generate_recovery_codes(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_mfa_generate_recovery_codes(int) TO authenticated;

-- ------------------------------------------------------------
-- 3) Kod tüketimi — cihaz kaybında MFA faktörünü sıfırlamayı yetkilendirir
--    (Supabase TOTP'de kurtarma kodu doğrudan aal2 vermez; kod doğrulanınca
--    faktör silinir ve kullanıcı yeniden enroll olur.)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_mfa_consume_recovery_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.admin_mfa_recovery_codes;
  v_remaining int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  SELECT * INTO v_row
  FROM public.admin_mfa_recovery_codes
  WHERE user_id = v_uid AND used_at IS NULL
    AND code_hash = extensions.crypt(btrim(upper(p_code)), code_hash)
  LIMIT 1;

  IF NOT FOUND THEN
    PERFORM public.log_admin_action('MFA_RECOVERY_FAILED', 'user', v_uid, NULL, NULL, NULL);
    RAISE EXCEPTION 'INVALID_RECOVERY_CODE: Kurtarma kodu geçersiz veya kullanılmış.';
  END IF;

  UPDATE public.admin_mfa_recovery_codes SET used_at = now() WHERE id = v_row.id;
  SELECT count(*) INTO v_remaining
  FROM public.admin_mfa_recovery_codes WHERE user_id = v_uid AND used_at IS NULL;

  PERFORM public.log_admin_action('MFA_RECOVERY_USED', 'user', v_uid, NULL,
    NULL, jsonb_build_object('remaining', v_remaining));

  RETURN jsonb_build_object('ok', true, 'remaining', v_remaining);
END; $function$;

REVOKE ALL ON FUNCTION public.admin_mfa_consume_recovery_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_mfa_consume_recovery_code(text) TO authenticated;

-- ------------------------------------------------------------
-- 4) Kalan kod sayısı (UI uyarısı: "2 kodun kaldı")
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_mfa_recovery_status()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT jsonb_build_object(
    'remaining', (SELECT count(*) FROM public.admin_mfa_recovery_codes
                  WHERE user_id = auth.uid() AND used_at IS NULL),
    'generated_at', (SELECT max(created_at) FROM public.admin_mfa_recovery_codes
                     WHERE user_id = auth.uid()));
$$;

REVOKE ALL ON FUNCTION public.admin_mfa_recovery_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_mfa_recovery_status() TO authenticated;

-- ------------------------------------------------------------
-- 5) SUPER_ADMIN tarafından MFA sıfırlama (self-reset YASAK)
--    Not: auth.mfa_factors satırının silinmesi Supabase Auth şemasına
--    dokunur; bu yüzden yalnız "sıfırlama talebi" kaydı + audit tutulur ve
--    gerçek faktör silme işlemi service_role ile yapılır (admin panel).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_reset_mfa(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_deleted int := 0; v_name text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  PERFORM public.require_admin_role(ARRAY['SUPER_ADMIN']);
  IF p_user_id = v_uid THEN
    RAISE EXCEPTION 'SELF_RESET_FORBIDDEN: Kendi MFA''nızı sıfırlayamazsınız (başka bir SUPER_ADMIN yapmalı).';
  END IF;

  SELECT COALESCE(name, full_name, email) INTO v_name FROM public.profiles WHERE id = p_user_id;

  DELETE FROM auth.mfa_factors WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- Eski kurtarma kodları da geçersizleşir
  DELETE FROM public.admin_mfa_recovery_codes WHERE user_id = p_user_id;

  PERFORM public.log_admin_action('MFA_RESET', 'user', p_user_id, v_name,
    NULL, jsonb_build_object('factors_removed', v_deleted));

  RETURN jsonb_build_object('ok', true, 'factors_removed', v_deleted);
END; $function$;

REVOKE ALL ON FUNCTION public.admin_reset_mfa(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reset_mfa(uuid) TO authenticated;

-- ------------------------------------------------------------
-- 6) Bayrak kaydı (KAPALI doğar — açma ayrı ve bilinçli bir adımdır)
-- ------------------------------------------------------------
INSERT INTO public.app_config (key, value, value_type, category, label, description, is_public)
VALUES ('admin_mfa_required', 'false'::jsonb, 'boolean', 'GUVENLIK',
        'Panel 2FA (İki Adımlı Doğrulama) Zorunlu',
        'Açmadan önce: en az bir SUPER_ADMIN enroll olmalı ve kurtarma kodlarını indirmiş olmalı. Aksi halde cihaz kaybı paneli kilitler.',
        true)
ON CONFLICT (key) DO UPDATE SET is_public = true, description = EXCLUDED.description;
