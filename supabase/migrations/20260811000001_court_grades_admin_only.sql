-- ============================================================================
-- KALİTE NOTLARI YALNIZ ADMİN (Karar: Sahalarım'dan kalite standardı değişmez)
-- ----------------------------------------------------------------------------
-- Eski davranış: owner notları değiştirebiliyor, değişiklik 'pending'e düşüyor,
-- admin onaylıyordu. Yeni davranış:
--   • Admin dışı (owner/müdür/personel) not DEĞİŞTİREMEZ — UPDATE'te eski değer
--     korunur, INSERT'te notlar boş başlar. (UI zaten salt-okunur; bu trigger
--     doğrudan API çağrılarına karşı sunucu garantisidir.)
--   • Admin not değişikliği ayrıca onay istemez: doğrudan 'approved'.
--   • Servis rolü / migration bağlamı (auth.uid() IS NULL) serbesttir (seed'ler).
--   • Eski 'pending' kayıtlar admin onayıyla (approve_court_grades) 'approved'
--     olmaya devam eder.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.enforce_court_grade_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Servis rolü / migration / seed bağlamı: kısıt uygulanmaz.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF is_admin() THEN
    -- Admin, kalite notlarının tek yetkilisi: not değişikliği doğrudan onaylıdır.
    IF TG_OP = 'INSERT' THEN
      IF NEW.lighting_grade IS NOT NULL OR NEW.grass_grade IS NOT NULL OR NEW.locker_grade IS NOT NULL THEN
        NEW.grades_status := 'approved';
      ELSE
        NEW.grades_status := 'none';
      END IF;
    ELSIF NEW.lighting_grade IS DISTINCT FROM OLD.lighting_grade
       OR NEW.grass_grade   IS DISTINCT FROM OLD.grass_grade
       OR NEW.locker_grade  IS DISTINCT FROM OLD.locker_grade THEN
      IF NEW.lighting_grade IS NULL AND NEW.grass_grade IS NULL AND NEW.locker_grade IS NULL THEN
        NEW.grades_status := 'none';
      ELSE
        NEW.grades_status := 'approved';
      END IF;
    END IF;
    -- Not değişmediyse grades_status'a dokunulmaz (approve_court_grades 'approved' yazabilir).
    RETURN NEW;
  END IF;

  -- Admin olmayan: kalite notlarına dokunamaz — sessizce eski değer korunur.
  IF TG_OP = 'INSERT' THEN
    NEW.lighting_grade := NULL;
    NEW.grass_grade := NULL;
    NEW.locker_grade := NULL;
    NEW.grades_status := 'none';
  ELSE
    NEW.lighting_grade := OLD.lighting_grade;
    NEW.grass_grade := OLD.grass_grade;
    NEW.locker_grade := OLD.locker_grade;
    NEW.grades_status := OLD.grades_status;
  END IF;
  RETURN NEW;
END;
$function$;
