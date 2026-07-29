-- ÜRETİMDEN GERİ ÇEKİLDİ (defter sapması onarımı, 2026-07-28)
-- _format_allowed_for_pitch: takım-başına semantik
-- (courts.min/max_capacity TAKIM BAŞINA sayıdır — SSOT)
CREATE OR REPLACE FUNCTION public._format_allowed_for_pitch(p_pitch_id uuid, p_format text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  RETURN EXISTS (
    SELECT 1 FROM public.courts c
    WHERE c.pitch_id = p_pitch_id
      AND c.is_active = true
      AND v_per >= COALESCE(c.min_capacity, 0)
      AND v_per <= COALESCE(c.max_capacity, 32767)
  );
END;
$function$;
