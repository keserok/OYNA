-- ════════════════════════════════════════════════════════════════════════════
-- APPLE APP STORE REVIEW UYUMU — GUIDELINE 4 & 5.1.1(v)
-- ════════════════════════════════════════════════════════════════════════════
-- 1) Guideline 4 (Sign in with Apple):
--    Apple ile giriş yapan kullanıcıdan tekrar ad/soyad veya e-posta istenemez.
--    İkinci ve sonraki Apple girişlerinde Authentication Services ad döndürmez;
--    bu nedenle `apply_onboarding` içinde `NAME_REQUIRED` / `INVALID_NAME`
--    hatası fırlatılması kaldırılmıştır. Geçerli ad varsa yazılır; yoksa mevcut
--    profil adı veya 'Oyuncu' korunur.
--
-- 2) Guideline 5.1.1(v) (Data Minimization — Age & Gender):
--    Yaş ve cinsiyet zorunluluğu kaldırılmıştır. `p_age_range` ve `p_gender`
--    boş geldiğinde mevcut değer korunur, `is_minor` = false ve
--    `guardian_consent_status` = 'NONE' olarak kalır.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_given text := NULLIF(btrim(COALESCE(NEW.raw_user_meta_data->>'given_name', '')), '');
  v_family text := NULLIF(btrim(COALESCE(NEW.raw_user_meta_data->>'family_name', '')), '');
  v_combined text := NULLIF(btrim(COALESCE(v_given, '') || ' ' || COALESCE(v_family, '')), '');
  v_ad text := NULLIF(btrim(COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    v_combined,
    ''
  )), '');
BEGIN
  INSERT INTO public.profiles (
    id, name, full_name, first_name, last_name, email, avatar_url, role, roles, created_at, updated_at
  )
  VALUES (
    NEW.id,
    COALESCE(v_ad, 'Oyuncu'),
    COALESCE(v_ad, 'Oyuncu'),
    v_given,
    v_family,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', ''),
    'PLAYER',
    '["PLAYER"]'::jsonb,
    now(),
    now()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$;

DROP FUNCTION IF EXISTS public.apply_onboarding(text, text, text, text, text, text, boolean);

CREATE OR REPLACE FUNCTION public.apply_onboarding(
  p_age_range text, p_first_name text, p_last_name text,
  p_gender text, p_position text, p_play_style text,
  p_completed boolean DEFAULT true,
  p_self_skill smallint DEFAULT NULL
)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid  uuid := (SELECT auth.uid());
  v_done boolean;
  v_full text;
  v_in_f text; v_in_l text;
  v_cur  RECORD;
  v_eff_f text; v_eff_l text;
  v_eff_skill smallint;
  v_parts text[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  SELECT has_completed_onboarding INTO v_done FROM public.profiles WHERE id = v_uid;
  IF COALESCE(v_done, false) THEN
    RETURN json_build_object('ok', true, 'skipped', true);
  END IF;

  v_in_f := btrim(regexp_replace(COALESCE(p_first_name, ''), '\s+', ' ', 'g'));
  v_in_l := btrim(regexp_replace(COALESCE(p_last_name,  ''), '\s+', ' ', 'g'));

  IF p_self_skill IS NOT NULL AND p_self_skill NOT BETWEEN 1 AND 10 THEN
    RAISE EXCEPTION 'INVALID_SELF_SKILL: Seviye 1 ile 10 arasında olmalı.';
  END IF;

  SELECT first_name, last_name, full_name, name, self_skill INTO v_cur
  FROM public.profiles WHERE id = v_uid;

  -- Forward-only birleşim: boş gelen alan mevcut değeri SİLMEZ.
  v_eff_f := COALESCE(NULLIF(v_in_f, ''), NULLIF(btrim(COALESCE(v_cur.first_name, '')), ''));
  v_eff_l := COALESCE(NULLIF(v_in_l, ''), NULLIF(btrim(COALESCE(v_cur.last_name,  '')), ''));
  v_eff_skill := COALESCE(p_self_skill, v_cur.self_skill);

  IF v_eff_f IS NULL OR v_eff_l IS NULL THEN
    v_parts := string_to_array(
      btrim(regexp_replace(COALESCE(v_cur.full_name, v_cur.name, ''), '\s+', ' ', 'g')), ' ');
    IF array_length(v_parts, 1) >= 2 THEN
      v_eff_f := COALESCE(v_eff_f, array_to_string(v_parts[1:array_length(v_parts,1)-1], ' '));
      v_eff_l := COALESCE(v_eff_l, v_parts[array_length(v_parts,1)]);
    END IF;
  END IF;

  -- Beyan edilen seviye (1-10) zorunludur.
  IF p_completed AND v_eff_skill IS NULL THEN
    RAISE EXCEPTION 'SELF_SKILL_REQUIRED: Profilini tamamlamak için seviyeni seç.';
  END IF;

  v_full := NULLIF(btrim(COALESCE(v_eff_f, '') || ' ' || COALESCE(v_eff_l, '')), '');
  IF v_full IS NULL OR lower(v_full) = 'oyna oyuncusu' THEN
    v_full := COALESCE(NULLIF(btrim(COALESCE(v_cur.full_name, '')), ''), NULLIF(btrim(COALESCE(v_cur.name, '')), ''), 'Oyuncu');
  END IF;

  UPDATE public.profiles SET
    age_range  = COALESCE(NULLIF(trim(COALESCE(p_age_range, '')),  ''), age_range),
    first_name = COALESCE(NULLIF(v_eff_f, 'Oyna'), first_name),
    last_name  = COALESCE(NULLIF(v_eff_l, 'Oyuncusu'), last_name),
    full_name  = COALESCE(v_full, full_name, 'Oyuncu'),
    name       = COALESCE(v_full, name, 'Oyuncu'),
    gender     = COALESCE(NULLIF(p_gender, ''), gender),
    position   = COALESCE(NULLIF(trim(COALESCE(p_position, '')),   ''), position),
    play_style = COALESCE(NULLIF(p_play_style, ''), play_style),
    self_skill = COALESCE(p_self_skill, self_skill),
    is_minor   = false,
    guardian_consent_status = 'NONE',
    has_completed_onboarding = CASE WHEN p_completed THEN true ELSE has_completed_onboarding END,
    updated_at = now()
  WHERE id = v_uid;

  RETURN json_build_object(
    'ok', true,
    'completed', p_completed,
    'is_minor', false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_onboarding(text, text, text, text, text, text, boolean, smallint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_onboarding(text, text, text, text, text, text, boolean, smallint) TO authenticated;

-- 3) Guideline 2.3.6 & 5.1.1(v) — Mevcut profillerde reşit-olmama / veli onayı
--    kilidi kalmışsa (ör. önceki incelemede 13-17 seçilmiş incelemeci hesabı)
--    tümünü temizle:
UPDATE public.profiles
SET is_minor = false,
    guardian_consent_status = 'NONE'
WHERE is_minor = true
   OR guardian_consent_status IS DISTINCT FROM 'NONE';

-- 4) Eski maç kayıtlarındaki 404 dönen Unsplash görselini çalışan URL ile güncelle:
UPDATE public.matches
SET image = 'https://images.unsplash.com/photo-1575361204480-aadea25e6e68?q=80&w=600'
WHERE image LIKE '%photo-1575361204480-aadea2559ee2%';

