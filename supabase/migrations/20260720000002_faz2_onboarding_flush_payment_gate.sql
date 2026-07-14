-- ================================================================
-- FAZ 2: Onboarding flush RPC + reşit olmayan ödeme kapısı (trigger)
-- ================================================================
-- (1) apply_onboarding: kayıt sonrası, onboarding taslağını profile
--     yazan SUNUCU-OTORİTER RPC. is_minor ve guardian_consent_status
--     yalnızca burada (sunucuda) hesaplanır — client bu gate-kritik
--     alanları doğrudan yazamaz (aksi halde küçük kendini "onaylı"
--     yapabilirdi). Yalnızca daha önce tamamlanmamışsa yazar (üzerine
--     yazma yok — mevcut kullanıcı korunur).
-- (2) payment_intents üzerinde BEFORE INSERT trigger: ödeme kaydı
--     oluşurken ödeyen reşit VE aktif veli onayı yoksa engeller. Tüm
--     ödeme RPC'leri (player_buy_slots_v2, record_app_deposit_payment,
--     vb.) buraya yazdığı için tek merkezi kapı yeterli.
-- ================================================================

-- ── (1) apply_onboarding ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.apply_onboarding(
  p_age_range  text,
  p_first_name text,
  p_last_name  text,
  p_gender     text,
  p_position   text,
  p_play_style text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid  uuid := (SELECT auth.uid());
  v_done boolean;
  v_full text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  SELECT has_completed_onboarding INTO v_done FROM public.profiles WHERE id = v_uid;
  IF COALESCE(v_done, false) THEN
    -- Zaten tamamlanmış → üzerine yazma (mevcut kullanıcı korunur)
    RETURN json_build_object('ok', true, 'skipped', true);
  END IF;

  v_full := NULLIF(trim(COALESCE(p_first_name, '') || ' ' || COALESCE(p_last_name, '')), '');

  UPDATE public.profiles SET
    age_range  = p_age_range,
    first_name = NULLIF(trim(COALESCE(p_first_name, '')), ''),
    last_name  = NULLIF(trim(COALESCE(p_last_name, '')), ''),
    full_name  = COALESCE(v_full, full_name),
    name       = COALESCE(v_full, name),              -- name NOT NULL
    gender     = NULLIF(p_gender, ''),
    position   = COALESCE(NULLIF(trim(COALESCE(p_position, '')), ''), position),
    play_style = NULLIF(p_play_style, ''),
    is_minor   = public.compute_is_minor(birthdate, p_age_range),
    guardian_consent_status = CASE
      WHEN public.compute_is_minor(birthdate, p_age_range) THEN 'PENDING'
      ELSE guardian_consent_status END,
    has_completed_onboarding = true,
    updated_at = now()
  WHERE id = v_uid;

  RETURN json_build_object(
    'ok', true,
    'is_minor', public.compute_is_minor(
      (SELECT birthdate FROM public.profiles WHERE id = v_uid), p_age_range)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_onboarding(text,text,text,text,text,text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.apply_onboarding(text,text,text,text,text,text) TO authenticated;

-- ── (2) Ödeme kapısı trigger'ı ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_payment_intents_minor_gate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Ödeyen reşit ve aktif veli onayı yoksa assert_can_transact hata
  -- fırlatır → INSERT reddedilir. Reşit olmayan 18'e bastığında (birthdate
  -- yazılınca) is_user_minor false döner → kapı otomatik kalkar.
  IF NEW.user_id IS NOT NULL THEN
    PERFORM public.assert_can_transact(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payment_intents_minor_gate ON public.payment_intents;
CREATE TRIGGER payment_intents_minor_gate
  BEFORE INSERT ON public.payment_intents
  FOR EACH ROW EXECUTE FUNCTION public.tg_payment_intents_minor_gate();

COMMENT ON FUNCTION public.apply_onboarding(text,text,text,text,text,text) IS
  'Onboarding taslağını profile yazar; is_minor/guardian_consent_status sunucuda hesaplanır, yalnızca ilk kez (üzerine yazmaz).';
COMMENT ON FUNCTION public.tg_payment_intents_minor_gate() IS
  'payment_intents INSERT öncesi reşit-olmayan ödeme kapısı (assert_can_transact).';
