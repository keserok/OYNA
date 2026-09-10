-- ════════════════════════════════════════════════════════════════════════════
-- YAŞ DEĞİŞİKLİĞİNDE REŞİTLİK DURUMUNU OTOMATİK GÜNCELLEME
-- ----------------------------------------------------------------------------
-- Kullanıcı "Profili Düzenle" ekranından doğum tarihini veya yaş aralığını
-- değiştirdiğinde is_minor bayrağı güncellenmiyordu. Bu trigger ile:
-- 1. Yaş güncellendiğinde is_minor otomatik olarak tekrar hesaplanır.
-- 2. Eğer kullanıcı reşit bir yaşa (ör. 24-30) geçerse, daha önceden PENDING
--    kalan guardian_consent_status durumu otomatik olarak NONE yapılır.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.trg_profiles_update_minor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Yalnızca yaş aralığı veya doğum tarihi değişirse hesapla
  IF NEW.birthdate IS DISTINCT FROM OLD.birthdate OR NEW.age_range IS DISTINCT FROM OLD.age_range THEN
    NEW.is_minor := public.compute_is_minor(NEW.birthdate, NEW.age_range);
    
    IF NEW.is_minor = false THEN
      -- Kullanıcı reşit olduysa veli onayına gerek kalmaz
      NEW.guardian_consent_status := 'NONE';
    ELSIF NEW.is_minor = true AND NEW.guardian_consent_status = 'NONE' THEN
      -- Kullanıcı küçük yaşa düştüyse ve onayı yoksa beklemeye al
      NEW.guardian_consent_status := 'PENDING';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_profile_age_change ON public.profiles;
CREATE TRIGGER on_profile_age_change
  BEFORE UPDATE OF birthdate, age_range
  ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_profiles_update_minor();

-- Gerçekleşmiş hatalı durumları temizle
UPDATE public.profiles
SET is_minor = public.compute_is_minor(birthdate, age_range)
WHERE is_minor IS DISTINCT FROM public.compute_is_minor(birthdate, age_range);

UPDATE public.profiles
SET guardian_consent_status = 'NONE'
WHERE is_minor = false AND guardian_consent_status <> 'NONE';
