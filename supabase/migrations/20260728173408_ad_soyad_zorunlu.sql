-- S8 — "Kayıtta ad soyad zorunlu."
--
-- İstemci tarafı kapıları (AuthScreen kayıt formu + Onboarding 2. adım)
-- shared/personName.ts kurallarını uygular. Bu migration o kuralların SUNUCU
-- İKİZİDİR: istemci atlansa/eskise bile profil geçersiz adla "tamamlandı"
-- işaretlenemez.
--
-- Kapatılan gerçek delik: handle_new_user, ad gelmediğinde e-postanın @ öncesini
-- (örn. "mirackeremcuruksulu") isim olarak yazıyordu. Kod ile giriş / Google
-- girişi bu yoldan geçiyordu, kullanıcı soyadsız kalıyordu.

-- ── Tek harf/kelime kuralı (shared/personName.ts NAME_PART_RE ikizi) ─────────
CREATE OR REPLACE FUNCTION public._name_part_ok(p text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO 'pg_temp'
AS $$
  SELECT p IS NOT NULL
     AND length(p) BETWEEN 2 AND 24
     AND p ~ '^[A-Za-zÇĞİIÖŞÜçğıiöşüÂÎÛâîû]+([''’-][A-Za-zÇĞİIÖŞÜçğıiöşüÂÎÛâîû]+)*$';
$$;

-- ── Ad + soyad kuralı (shared/personName.ts validateFirstLast ikizi) ─────────
CREATE OR REPLACE FUNCTION public.is_valid_person_name(p_first text, p_last text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_f text; v_l text; w text;
BEGIN
  v_f := btrim(regexp_replace(COALESCE(p_first, ''), '\s+', ' ', 'g'));
  v_l := btrim(regexp_replace(COALESCE(p_last,  ''), '\s+', ' ', 'g'));
  IF v_f = '' OR v_l = '' THEN RETURN false; END IF;
  IF length(v_f || ' ' || v_l) > 60 THEN RETURN false; END IF;
  IF NOT public._name_part_ok(v_l) THEN RETURN false; END IF;   -- soyad tek kelime
  FOREACH w IN ARRAY string_to_array(v_f, ' ') LOOP             -- ad çok kelimeli olabilir
    IF NOT public._name_part_ok(w) THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.is_valid_person_name(text, text) IS
  'S8: shared/personName.ts validateFirstLast fonksiyonunun SQL ikizi. Biri değişirse diğeri de değişmeli.';

-- ── Onboarding kapısı ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.apply_onboarding(
  p_age_range text, p_first_name text, p_last_name text,
  p_gender text, p_position text, p_play_style text,
  p_completed boolean DEFAULT true
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

  -- Girilen ad/soyad varsa kurala uymak ZORUNDA — atlamada bile çöp isim yazılmaz.
  IF (v_in_f <> '' OR v_in_l <> '') AND NOT public.is_valid_person_name(v_in_f, v_in_l) THEN
    RAISE EXCEPTION 'INVALID_NAME: Ad ve soyad zorunludur; yalnız harflerden oluşmalı ve soyad tek kelime olmalıdır.';
  END IF;

  SELECT first_name, last_name, full_name, name INTO v_cur
  FROM public.profiles WHERE id = v_uid;

  -- Forward-only birleşim: boş gelen alan mevcut değeri silmez.
  v_eff_f := COALESCE(NULLIF(v_in_f, ''), NULLIF(btrim(COALESCE(v_cur.first_name, '')), ''));
  v_eff_l := COALESCE(NULLIF(v_in_l, ''), NULLIF(btrim(COALESCE(v_cur.last_name,  '')), ''));

  -- first_name/last_name hiç yazılmamış eski kayıtlar: tek alandaki addan türet
  -- (son kelime = soyad), böylece kayıt sırasında ad soyad verenler yeniden sorulmaz.
  IF v_eff_f IS NULL OR v_eff_l IS NULL THEN
    v_parts := string_to_array(
      btrim(regexp_replace(COALESCE(v_cur.full_name, v_cur.name, ''), '\s+', ' ', 'g')), ' ');
    IF array_length(v_parts, 1) >= 2 THEN
      v_eff_f := COALESCE(v_eff_f, array_to_string(v_parts[1:array_length(v_parts,1)-1], ' '));
      v_eff_l := COALESCE(v_eff_l, v_parts[array_length(v_parts,1)]);
    END IF;
  END IF;

  -- TAMAMLANDI kapısı: geçerli ad soyad olmadan profil tamamlanmış sayılamaz.
  IF p_completed AND NOT public.is_valid_person_name(v_eff_f, v_eff_l) THEN
    RAISE EXCEPTION 'NAME_REQUIRED: Profilini tamamlamak için ad ve soyadını gir.';
  END IF;

  v_full := NULLIF(btrim(COALESCE(v_eff_f, '') || ' ' || COALESCE(v_eff_l, '')), '');

  UPDATE public.profiles SET
    age_range  = COALESCE(NULLIF(trim(COALESCE(p_age_range, '')),  ''), age_range),
    first_name = COALESCE(v_eff_f, first_name),
    last_name  = COALESCE(v_eff_l, last_name),
    full_name  = COALESCE(v_full, full_name),
    name       = COALESCE(v_full, name),
    gender     = COALESCE(NULLIF(p_gender, ''), gender),
    position   = COALESCE(NULLIF(trim(COALESCE(p_position, '')),   ''), position),
    play_style = COALESCE(NULLIF(p_play_style, ''), play_style),
    is_minor   = CASE
      WHEN NULLIF(trim(COALESCE(p_age_range, '')), '') IS NOT NULL
        THEN public.compute_is_minor(birthdate, p_age_range)
      ELSE is_minor END,
    guardian_consent_status = CASE
      WHEN NULLIF(trim(COALESCE(p_age_range, '')), '') IS NOT NULL
       AND public.compute_is_minor(birthdate, p_age_range)
       AND guardian_consent_status = 'NONE'
        THEN 'PENDING'
      ELSE guardian_consent_status END,
    has_completed_onboarding = CASE WHEN p_completed THEN true ELSE has_completed_onboarding END,
    updated_at = now()
  WHERE id = v_uid;

  RETURN json_build_object(
    'ok', true,
    'completed', p_completed,
    'is_minor', (SELECT is_minor FROM public.profiles WHERE id = v_uid)
  );
END;
$function$;
