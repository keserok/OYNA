-- ============================================================================
-- ÖDEME MODU SİSTEMİ — Nakit Mod / Online Mod, iki katmanlı on-off
-- ============================================================================
-- AMAÇ
--   OYNA'nın para akışını tek bir yerden, deploy'suz ve denetlenebilir biçimde
--   yönetmek. İki katman vardır:
--
--     1) GLOBAL (platform admini)  → app_config.payment_mode_global
--     2) TESİS  (saha sahibi)      → pitches.payment_mode
--
--   GLOBAL bir TAVAN'dır: tesis kendi tercihini saklayabilir ama global mod
--   izin vermiyorsa etkin (effective) mod aşağı çekilir. Böylece platform
--   admini tek anahtarla tüm online ödemeyi durdurabilir.
--
-- GÜVENLİK KİLİDİ (en önemli madde)
--   payment_provider = 'SIMULATION' iken online ödeme HİÇBİR KOŞULDA
--   açılamaz. Bugün create-payment fail-open davranıyor (sağlayıcı yoksa
--   simülasyona düşüp niyeti PAID işaretliyor); bu fonksiyon o yolu
--   kullanıcı arayüzüne hiç çıkarmayarak kapatır. Sağlayıcı canlı değilse
--   etkin mod her zaman CASH_ONLY olur.
--
-- MODLAR
--   CASH_ONLY   — Uygulama içinde para hareketi yok. Rezervasyon bir TALEP'tir,
--                 ödeme tesiste yapılır. (v1 lansman duruşu)
--   ONLINE_ONLY — Ödeme uygulama içinde zorunlu.
--   HYBRID      — Global'de "tesis karar versin", tesiste "oyuncu seçsin".
-- ============================================================================

-- ─── 1) Global anahtar ──────────────────────────────────────────────────────
-- Varsayılan CASH_ONLY: fail-safe. Anahtar hiç kurulmamışsa bile para akmaz.
INSERT INTO public.app_config (key, value, value_type, category, label, description, is_public, min_value, max_value) VALUES
  ('payment_mode_global', '"CASH_ONLY"'::jsonb, 'text', 'ODEME',
   'Platform Ödeme Modu',
   'CASH_ONLY: uygulama içinde hiç para alınmaz, rezervasyon taleptir ve ödeme tesiste yapılır. ONLINE_ONLY: ödeme uygulama içinde zorunludur. HYBRID: her tesis kendi modunu seçer. NOT: Ödeme Sağlayıcısı SIMULATION iken online ödeme hiçbir koşulda açılmaz.',
   false, NULL, NULL)
ON CONFLICT (key) DO NOTHING;

-- ─── 2) Tesis düzeyi kolonlar ───────────────────────────────────────────────
ALTER TABLE public.pitches
  ADD COLUMN IF NOT EXISTS payment_mode text NOT NULL DEFAULT 'CASH_ONLY';

ALTER TABLE public.pitches
  ADD COLUMN IF NOT EXISTS payment_mode_locked_by_admin boolean NOT NULL DEFAULT false;

ALTER TABLE public.pitches
  ADD COLUMN IF NOT EXISTS payment_mode_updated_at timestamptz;

ALTER TABLE public.pitches
  ADD COLUMN IF NOT EXISTS payment_mode_updated_by uuid REFERENCES public.profiles(id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pitches_payment_mode_check'
  ) THEN
    ALTER TABLE public.pitches
      ADD CONSTRAINT pitches_payment_mode_check
      CHECK (payment_mode IN ('CASH_ONLY','ONLINE_ONLY','HYBRID'));
  END IF;
END $$;

COMMENT ON COLUMN public.pitches.payment_mode IS
  'Tesisin ödeme modu TERCİHİ. Etkin mod resolve_payment_mode() ile hesaplanır; global mod bir tavandır.';
COMMENT ON COLUMN public.pitches.payment_mode_locked_by_admin IS
  'true iken saha sahibi modu değiştiremez (platform admini kilitlemiştir).';

-- ─── 3) Etkin mod çözümleyici ───────────────────────────────────────────────
-- Tek doğruluk kaynağı. Hem tüketici uygulaması, hem owner paneli, hem admin
-- paneli, hem de sunucu tarafı doğrulama bu fonksiyonu kullanır.
--
-- p_pitch_id NULL ise yalnızca global duruş döner (uygulama açılışında
-- cüzdan/ödeme yüzeylerinin hiç gösterilip gösterilmeyeceğine karar vermek için).
CREATE OR REPLACE FUNCTION public.resolve_payment_mode(p_pitch_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_global        text;
  v_provider      text;
  v_provider_live boolean;
  v_pitch_mode    text;
  v_locked        boolean;
  v_effective     text;
  v_reason        text;
BEGIN
  v_global   := COALESCE(public.get_config_text('payment_mode_global', 'CASH_ONLY'), 'CASH_ONLY');
  v_provider := COALESCE(public.get_config_text('payment_provider', 'SIMULATION'), 'SIMULATION');

  -- Bilinmeyen bir değer yazılmışsa güvenli tarafa düş.
  IF v_global NOT IN ('CASH_ONLY','ONLINE_ONLY','HYBRID') THEN
    v_global := 'CASH_ONLY';
  END IF;

  -- GÜVENLİK KİLİDİ: sağlayıcı canlı değilse online ödeme teklif edilemez.
  v_provider_live := (v_provider IS NOT NULL AND v_provider <> 'SIMULATION' AND v_provider <> 'DISABLED');

  IF p_pitch_id IS NOT NULL THEN
    SELECT payment_mode, payment_mode_locked_by_admin
      INTO v_pitch_mode, v_locked
    FROM public.pitches
    WHERE id = p_pitch_id;
  END IF;

  v_pitch_mode := COALESCE(v_pitch_mode, 'CASH_ONLY');
  v_locked     := COALESCE(v_locked, false);

  -- Çözümleme: global bir TAVAN'dır.
  IF NOT v_provider_live THEN
    v_effective := 'CASH_ONLY';
    v_reason    := 'PROVIDER_NOT_LIVE';
  ELSIF v_global = 'CASH_ONLY' THEN
    v_effective := 'CASH_ONLY';
    v_reason    := 'GLOBAL_CASH_ONLY';
  ELSIF v_global = 'ONLINE_ONLY' THEN
    v_effective := 'ONLINE_ONLY';
    v_reason    := 'GLOBAL_ONLINE_ONLY';
  ELSE
    -- HYBRID → tesis karar verir
    v_effective := v_pitch_mode;
    v_reason    := CASE WHEN p_pitch_id IS NULL THEN 'GLOBAL_HYBRID' ELSE 'PITCH_CHOICE' END;
  END IF;

  RETURN jsonb_build_object(
    'effective_mode', v_effective,
    'global_mode',    v_global,
    'pitch_mode',     CASE WHEN p_pitch_id IS NULL THEN NULL ELSE v_pitch_mode END,
    'locked',         v_locked,
    'provider',       v_provider,
    'provider_live',  v_provider_live,
    'cash_allowed',   (v_effective IN ('CASH_ONLY','HYBRID')),
    'online_allowed', (v_effective IN ('ONLINE_ONLY','HYBRID')),
    'reason',         v_reason
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.resolve_payment_mode(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_payment_mode(uuid) TO anon, authenticated, service_role;

-- ─── 4) Sunucu tarafı zorlama ───────────────────────────────────────────────
-- İstemciye güvenmeyiz: ödeme yolu açılmadan önce bu çağrılır. Arayüz
-- atlatılıp doğrudan RPC çağrılsa bile yanlış yöntem reddedilir.
CREATE OR REPLACE FUNCTION public.assert_payment_method_allowed(
  p_pitch_id uuid,
  p_method   text          -- 'CASH' | 'ONLINE'
) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v jsonb;
BEGIN
  v := public.resolve_payment_mode(p_pitch_id);

  IF p_method = 'ONLINE' AND NOT (v->>'online_allowed')::boolean THEN
    RAISE EXCEPTION 'PAYMENT_MODE_VIOLATION: Online odeme bu tesiste kapali (%).', v->>'reason';
  END IF;

  IF p_method = 'CASH' AND NOT (v->>'cash_allowed')::boolean THEN
    RAISE EXCEPTION 'PAYMENT_MODE_VIOLATION: Sahada odeme bu tesiste kapali (%).', v->>'reason';
  END IF;

  IF p_method NOT IN ('CASH','ONLINE') THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_METHOD: %', p_method;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.assert_payment_method_allowed(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assert_payment_method_allowed(uuid, text) TO authenticated, service_role;

-- ─── 5) Saha sahibi anahtarı ────────────────────────────────────────────────
-- Sahibi kendi tesisinin TERCİHİNİ yazar. Global tavan izin vermiyorsa tercih
-- saklanır ama etkin mod değişmez; dönen payload bunu arayüze dürüstçe söyler.
CREATE OR REPLACE FUNCTION public.owner_set_payment_mode(
  p_pitch_id uuid,
  p_mode     text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_owner  uuid;
  v_locked boolean;
  v_old    text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  IF p_mode NOT IN ('CASH_ONLY','ONLINE_ONLY','HYBRID') THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_MODE: %', p_mode;
  END IF;

  SELECT owner_id, payment_mode_locked_by_admin, payment_mode
    INTO v_owner, v_locked, v_old
  FROM public.pitches
  WHERE id = p_pitch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Tesis bulunamadi.';
  END IF;

  IF v_owner IS DISTINCT FROM v_uid AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN: Bu tesisin sahibi degilsiniz.';
  END IF;

  IF COALESCE(v_locked, false) AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'MODE_LOCKED: Odeme modu platform yoneticisi tarafindan kilitlenmis.';
  END IF;

  UPDATE public.pitches
     SET payment_mode            = p_mode,
         payment_mode_updated_at = now(),
         payment_mode_updated_by = v_uid
   WHERE id = p_pitch_id;

  RETURN public.resolve_payment_mode(p_pitch_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.owner_set_payment_mode(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.owner_set_payment_mode(uuid, text) TO authenticated;

-- ─── 6) Admin anahtarı (tesis bazlı override + kilit) ───────────────────────
CREATE OR REPLACE FUNCTION public.admin_set_pitch_payment_mode(
  p_pitch_id uuid,
  p_mode     text,
  p_locked   boolean DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_old_mode   text;
  v_old_locked boolean;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  IF p_mode NOT IN ('CASH_ONLY','ONLINE_ONLY','HYBRID') THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_MODE: %', p_mode;
  END IF;

  SELECT payment_mode, payment_mode_locked_by_admin
    INTO v_old_mode, v_old_locked
  FROM public.pitches WHERE id = p_pitch_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Tesis bulunamadi.';
  END IF;

  UPDATE public.pitches
     SET payment_mode                 = p_mode,
         payment_mode_locked_by_admin = COALESCE(p_locked, payment_mode_locked_by_admin),
         payment_mode_updated_at      = now(),
         payment_mode_updated_by      = auth.uid()
   WHERE id = p_pitch_id;

  PERFORM public.log_admin_action(
    'PITCH_PAYMENT_MODE_UPDATE', 'pitch', p_pitch_id, p_mode,
    jsonb_build_object('payment_mode', v_old_mode, 'locked', v_old_locked),
    jsonb_build_object('payment_mode', p_mode,     'locked', COALESCE(p_locked, v_old_locked))
  );

  RETURN public.resolve_payment_mode(p_pitch_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_set_pitch_payment_mode(uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_pitch_payment_mode(uuid, text, boolean) TO authenticated;

-- ─── 7) Admin genel bakış ───────────────────────────────────────────────────
-- Admin panelinde "hangi tesis hangi modda" listesi. Etkin modu da hesaplar ki
-- yönetici tesisin tercihi ile fiilî durumu arasındaki farkı görebilsin.
CREATE OR REPLACE FUNCTION public.admin_list_pitch_payment_modes()
RETURNS TABLE (
  pitch_id       uuid,
  pitch_name     text,
  district       text,
  owner_id       uuid,
  pitch_mode     text,
  effective_mode text,
  locked         boolean,
  updated_at     timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.name::text,
    p.district::text,
    p.owner_id,
    p.payment_mode,
    (public.resolve_payment_mode(p.id) ->> 'effective_mode')::text,
    p.payment_mode_locked_by_admin,
    p.payment_mode_updated_at
  FROM public.pitches p
  ORDER BY p.name;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_list_pitch_payment_modes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_pitch_payment_modes() TO authenticated;
