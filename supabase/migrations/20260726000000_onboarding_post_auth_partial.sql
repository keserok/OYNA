-- ================================================================
-- Onboarding'i kayıt SONRASINA taşıma: kısmi (atla) + tam kayıt
-- ================================================================
-- Yeni akış: onboarding artık kayıttan ÖNCE değil, hesap oluştuktan
-- SONRA (kullanıcı girişliyken) çalışır. Bu yüzden apply_onboarding:
--   • p_completed = false ile ATLAMA'da girilen kısmi veriyi yazar ama
--     has_completed_onboarding'i true yapmaz → profilde "tamamlanmadı".
--   • p_completed = true (varsayılan) ile TAM tamamlamada işaretler.
-- Ayrıca "forward-only" yazım: boş/eksik parametreler mevcut değeri
-- SİLMEZ (COALESCE(NULLIF(...), mevcut)). Böylece kullanıcı önce atlayıp
-- bazı alanları doldurduysa, sonraki turda kalanları eklemesi veriyi
-- kaybetmez. is_minor yalnızca age_range verildiğinde yeniden hesaplanır;
-- guardian_consent_status yalnızca NONE iken PENDING'e çekilir (ACTIVE/
-- REVOKED gibi ilerlemiş durumlar korunur).
--
-- p_completed varsayılanı true olduğundan, ESKİ 6 argümanlı çağrılar
-- (varsa) davranışı bozulmadan çalışır (geri uyumlu).
-- ================================================================

-- Eski 6-argümanlı imzayı kaldırıp 7-argümanlı (p_completed) sürümle
-- değiştir. DROP+CREATE tek migration (transaction) içinde atomiktir.
DROP FUNCTION IF EXISTS public.apply_onboarding(text, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.apply_onboarding(
  p_age_range  text,
  p_first_name text,
  p_last_name  text,
  p_gender     text,
  p_position   text,
  p_play_style text,
  p_completed  boolean DEFAULT true
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
    -- forward-only: boş parametre mevcut değeri silmez
    age_range  = COALESCE(NULLIF(trim(COALESCE(p_age_range, '')),  ''), age_range),
    first_name = COALESCE(NULLIF(trim(COALESCE(p_first_name, '')), ''), first_name),
    last_name  = COALESCE(NULLIF(trim(COALESCE(p_last_name, '')),  ''), last_name),
    full_name  = COALESCE(v_full, full_name),
    name       = COALESCE(v_full, name),               -- name NOT NULL
    gender     = COALESCE(NULLIF(p_gender, ''), gender),
    position   = COALESCE(NULLIF(trim(COALESCE(p_position, '')),   ''), position),
    play_style = COALESCE(NULLIF(p_play_style, ''), play_style),
    -- is_minor yalnızca yaş aralığı geldiğinde yeniden hesaplanır
    is_minor   = CASE
      WHEN NULLIF(trim(COALESCE(p_age_range, '')), '') IS NOT NULL
        THEN public.compute_is_minor(birthdate, p_age_range)
      ELSE is_minor END,
    -- yalnız NONE iken PENDING'e çek; ilerlemiş onay durumunu geri alma
    guardian_consent_status = CASE
      WHEN NULLIF(trim(COALESCE(p_age_range, '')), '') IS NOT NULL
       AND public.compute_is_minor(birthdate, p_age_range)
       AND guardian_consent_status = 'NONE'
        THEN 'PENDING'
      ELSE guardian_consent_status END,
    -- yalnızca tam tamamlamada işaretle; atlamada false kalır
    has_completed_onboarding = CASE WHEN p_completed THEN true ELSE has_completed_onboarding END,
    updated_at = now()
  WHERE id = v_uid;

  RETURN json_build_object(
    'ok', true,
    'completed', p_completed,
    'is_minor', (SELECT is_minor FROM public.profiles WHERE id = v_uid)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_onboarding(text, text, text, text, text, text, boolean) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.apply_onboarding(text, text, text, text, text, text, boolean) TO authenticated;

COMMENT ON FUNCTION public.apply_onboarding(text, text, text, text, text, text, boolean) IS
  'Onboarding verisini profile yazar (kayıt sonrası/girişli). p_completed=false kısmi (atla) yazar, has_completed_onboarding''i true yapmaz; forward-only (boş parametre mevcut değeri silmez). is_minor/guardian_consent_status sunucuda hesaplanır. Yalnızca tamamlanmamışsa yazar.';
