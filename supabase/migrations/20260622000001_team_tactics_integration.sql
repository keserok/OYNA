-- ==============================================================================
-- OYNA: Team Tactics Integration Migration
-- ==============================================================================

-- 1. tactics tablosuna yeni entegrasyon kolonlarını ekleme
ALTER TABLE public.tactics 
ADD COLUMN IF NOT EXISTS "teamId" UUID REFERENCES public.teams(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS "status" VARCHAR(30) DEFAULT 'APPROVED' CHECK ("status" IN ('APPROVED', 'PENDING_APPROVAL', 'REJECTED')),
ADD COLUMN IF NOT EXISTS "proposedBy" UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS "priority" INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS "votes" JSONB DEFAULT '[]'::jsonb;

-- 2. RLS Politikası: Takım üyelerinin kendi takımlarına ait taktikleri görebilmesi
DROP POLICY IF EXISTS "tactics_team_read" ON public.tactics;
CREATE POLICY "tactics_team_read" ON public.tactics 
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.team_members 
    WHERE team_id = "teamId" AND player_id = auth.uid()
  )
);
