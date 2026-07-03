-- ============================================================================
-- Kalite notu kolonları varchar(1) idi — 'A+' değeri hiç kaydedilemiyordu
-- (admin panelindeki A+ seçeneği sessizce 22001 hatası veriyordu).
-- text'e genişlet + geçerli değer kümesini CHECK ile sabitle.
-- ============================================================================
ALTER TABLE public.courts
  ALTER COLUMN lighting_grade TYPE text,
  ALTER COLUMN grass_grade TYPE text,
  ALTER COLUMN locker_grade TYPE text;

ALTER TABLE public.courts DROP CONSTRAINT IF EXISTS courts_lighting_grade_check;
ALTER TABLE public.courts
  ADD CONSTRAINT courts_lighting_grade_check CHECK (lighting_grade IS NULL OR lighting_grade IN ('A+', 'A', 'B', 'C'));
ALTER TABLE public.courts DROP CONSTRAINT IF EXISTS courts_grass_grade_check;
ALTER TABLE public.courts
  ADD CONSTRAINT courts_grass_grade_check CHECK (grass_grade IS NULL OR grass_grade IN ('A+', 'A', 'B', 'C'));
ALTER TABLE public.courts DROP CONSTRAINT IF EXISTS courts_locker_grade_check;
ALTER TABLE public.courts
  ADD CONSTRAINT courts_locker_grade_check CHECK (locker_grade IS NULL OR locker_grade IN ('A+', 'A', 'B', 'C'));
