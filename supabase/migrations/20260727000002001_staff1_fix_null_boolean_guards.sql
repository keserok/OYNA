-- ════════════════════════════════════════════════════════════════════════
-- STAFF-1 DÜZELTME — NULL boolean yetki sızıntısı (KRİTİK)
-- ------------------------------------------------------------------------
-- pitch_access_level yabancı bir kullanıcı için NULL döner. Üçlü-değer mantığı:
--   NULL = 'OWNER'          → NULL   (false DEĞİL)
--   NULL IN ('OWNER',…)     → NULL
-- Guard'lardaki "IF NOT is_pitch_owner(...) THEN RAISE" dalı, NULL girişte
-- ATLANIR (IF NULL ≡ IF FALSE) → yetkisiz kullanıcı davet/işlem yapabilir.
-- Canlı impersonation testinde yakalandı (yabancı davet edebildi).
-- Düzeltme: üç yardımcı da COALESCE(..., false) ile kesin boolean döner.
-- ════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.can_manage_pitch(p_pitch_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT COALESCE(public.pitch_access_level(p_pitch_id) IN ('OWNER','MANAGER'), false); $$;

CREATE OR REPLACE FUNCTION public.can_staff_pitch(p_pitch_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT COALESCE(public.pitch_access_level(p_pitch_id) IN ('OWNER','MANAGER','STAFF'), false); $$;

CREATE OR REPLACE FUNCTION public.is_pitch_owner(p_pitch_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT COALESCE(public.pitch_access_level(p_pitch_id) = 'OWNER', false); $$;
