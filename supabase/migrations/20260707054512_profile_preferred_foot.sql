-- ==============================================================================
-- Profil ekranı yenilemesi — preferred_foot kolonu
-- Oyuncunun kullandığı ayak; profil kimlik rozetlerinde gösterilir.
-- ==============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS preferred_foot text
  CHECK (preferred_foot IS NULL OR preferred_foot IN ('SAG', 'SOL', 'CIFT'));
