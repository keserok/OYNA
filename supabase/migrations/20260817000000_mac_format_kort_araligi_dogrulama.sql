-- ============================================================
-- Maç formatı × kort format aralığı — sunucu tarafı doğrulama
-- ============================================================
-- Kural, istemcideki shared/pitchShowcaseMapper.ts ile birebir aynıdır:
--   * YALNIZCA açıkça girilen min_capacity / max_capacity kısıt sayılır.
--     Legacy `capacity` kolonu KISIT DEĞİLDİR (canlıdaki eski kortlar
--     varsayılan 14 değeriyle durduğu için kısıt sayılsaydı 8v8 üstü
--     tüm formatlar her yerde yanlışça engellenirdi).
--   * Saha (tesis) düzeyinde format, EN AZ BİR aktif kort sığdırıyorsa
--     serbesttir; kortlar arası boşluklar korunur.
--   * pitch_id NULL, tanınmayan format, aktif kortu olmayan saha
--     → kısıt uygulanmaz (permissive: eski veriyi asla kilitleme).
--   * Tetikleyici yalnız format/pitch_id GERÇEKTEN değişince denetler;
--     eski maçların diğer alanlarını düzenlemek asla engellenmez.

CREATE OR REPLACE FUNCTION public._format_allowed_for_pitch(p_pitch_id uuid, p_format text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total integer;
BEGIN
  IF p_pitch_id IS NULL OR p_format IS NULL OR p_format !~ '^\d{1,2}v\d{1,2}$' THEN
    RETURN true;
  END IF;

  v_total := split_part(p_format, 'v', 1)::int * 2;

  IF NOT EXISTS (
    SELECT 1 FROM public.courts c
    WHERE c.pitch_id = p_pitch_id AND c.is_active = true
  ) THEN
    RETURN true;
  END IF;

  -- min/max NULL → o yönde sınırsız; ikisi de NULL olan kort her formatı sığdırır
  RETURN EXISTS (
    SELECT 1 FROM public.courts c
    WHERE c.pitch_id = p_pitch_id
      AND c.is_active = true
      AND v_total >= COALESCE(c.min_capacity, 0)
      AND v_total <= COALESCE(c.max_capacity, 32767)
  );
END;
$$;

COMMENT ON FUNCTION public._format_allowed_for_pitch(uuid, text) IS
  'Formatın (örn. 7v7) sahanın aktif kortlarından en az birine sığıp sığmadığını döner. Yalnız açık min/max kısıt sayılır; permissive tasarım.';

CREATE OR REPLACE FUNCTION public.matches_format_range_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.format IS NOT DISTINCT FROM OLD.format
     AND NEW.pitch_id IS NOT DISTINCT FROM OLD.pitch_id THEN
    RETURN NEW;
  END IF;

  IF NOT public._format_allowed_for_pitch(NEW.pitch_id, NEW.format) THEN
    RAISE EXCEPTION 'Seçilen format (%) bu sahanın kort aralığına uymuyor.', NEW.format
      USING ERRCODE = '23514',
            HINT = 'Sahanın kortlarında tanımlı minimum/maksimum format aralığını saha ayarlarından kontrol edin.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_matches_format_range_guard ON public.matches;
CREATE TRIGGER trg_matches_format_range_guard
  BEFORE INSERT OR UPDATE OF format, pitch_id ON public.matches
  FOR EACH ROW
  EXECUTE FUNCTION public.matches_format_range_guard();
