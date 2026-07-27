-- ============================================================
-- Kort format aralığı: TAKIM BAŞI (per-side) modele geçiş
-- ============================================================
-- KARAR: courts.min_capacity / max_capacity artık TAKIM BAŞI oyuncu tutar
-- (6 → "6v6"). Önceki model toplam oyuncuydu (12 → "6v6").
-- Legacy courts.capacity TOPLAM oyuncu olarak kalır ve yalnız rozet
-- fallback'idir; KISIT DEĞİLDİR.
--
-- Bu dosya canlıda (eşzamanlı bir oturumca) kurulmuş son şemayı repo'ya
-- birebir kayıt altına alır ve diğer ortamlar için idempotent kurar:
--   1) Eski toplam-oyuncu CHECK'i kalkar
--   2) Toplam değerli eski veri takım başına çevrilir (>11 → /2; eski CHECK
--      çift sayı zorunlu kıldığından bölme kayıpsızdır)
--   3) Takım-başı CHECK (her iki uç doluysa 3..11 ve min ≤ maks) kurulur
--   4) Varsayılanlar min=5, maks=7 olur (yeni kort 5v5–7v7 başlar)
--   5) size_label kolonu şemaya işlenir
--   6) _format_allowed_for_pitch takım-başı karşılaştırır (istemcideki
--      shared/pitchShowcaseMapper.allowedSquadSizesForCourt ile birebir)

ALTER TABLE public.courts DROP CONSTRAINT IF EXISTS courts_capacity_range_check;

UPDATE public.courts SET min_capacity = min_capacity / 2
WHERE min_capacity IS NOT NULL AND min_capacity > 11;
UPDATE public.courts SET max_capacity = max_capacity / 2
WHERE max_capacity IS NOT NULL AND max_capacity > 11;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE n.nspname = 'public' AND r.relname = 'courts' AND c.conname = 'courts_capacity_range_chk'
  ) THEN
    ALTER TABLE public.courts ADD CONSTRAINT courts_capacity_range_chk CHECK (
      min_capacity IS NULL OR max_capacity IS NULL
      OR (min_capacity >= 3 AND min_capacity <= 11 AND max_capacity >= min_capacity AND max_capacity <= 11)
    );
  END IF;
END $$;

ALTER TABLE public.courts
  ALTER COLUMN min_capacity SET DEFAULT 5,
  ALTER COLUMN max_capacity SET DEFAULT 7;

ALTER TABLE public.courts ADD COLUMN IF NOT EXISTS size_label text;

-- Sunucu doğrulaması (20260817000000'ın takım-başı sürümü):
--   * YALNIZ açık min/maks kısıt sayılır (legacy capacity asla)
--   * En az bir aktif kort sığdırıyorsa format serbest (boşluklar korunur)
--   * pitch NULL / tanınmayan format / aktif kortu olmayan saha → serbest
CREATE OR REPLACE FUNCTION public._format_allowed_for_pitch(p_pitch_id uuid, p_format text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_per integer;
BEGIN
  IF p_pitch_id IS NULL OR p_format IS NULL OR p_format !~ '^\d{1,2}v\d{1,2}$' THEN
    RETURN true;
  END IF;

  v_per := split_part(p_format, 'v', 1)::int;

  IF NOT EXISTS (
    SELECT 1 FROM public.courts c
    WHERE c.pitch_id = p_pitch_id AND c.is_active = true
  ) THEN
    RETURN true;
  END IF;

  -- min/maks NULL → o yönde sınırsız; ikisi de NULL olan kort her formatı sığdırır
  RETURN EXISTS (
    SELECT 1 FROM public.courts c
    WHERE c.pitch_id = p_pitch_id
      AND c.is_active = true
      AND v_per >= COALESCE(c.min_capacity, 0)
      AND v_per <= COALESCE(c.max_capacity, 32767)
  );
END;
$$;

COMMENT ON FUNCTION public._format_allowed_for_pitch(uuid, text) IS
  'Formatın (örn. 7v7) sahanın aktif kortlarından en az birine sığıp sığmadığını döner. min/max TAKIM BAŞI oyuncudur; yalnız açık değerler kısıt sayılır.';

-- Tetikleyici 20260817000000''da kuruldu; diğer ortamlar için idempotent tazele.
DROP TRIGGER IF EXISTS trg_matches_format_range_guard ON public.matches;
CREATE TRIGGER trg_matches_format_range_guard
  BEFORE INSERT OR UPDATE OF format, pitch_id ON public.matches
  FOR EACH ROW
  EXECUTE FUNCTION public.matches_format_range_guard();
