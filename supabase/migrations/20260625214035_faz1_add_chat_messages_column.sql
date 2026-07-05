
-- Faz 1: matches tablosuna eksik chatMessages kolonu eklendi.
-- player_update_match RPC bu kolona yazıyor ancak kolon yoktu;
-- her player_update_match çağrısı (status güncelleme, skor, vb.) "column does not exist" hatası veriyordu.
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS "chatMessages" JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Realtime channel sorgularında kullanılan status kolonuna index
CREATE INDEX IF NOT EXISTS idx_matches_status ON public.matches (status);
-- Tarih+status birlikte sık sorgulanıyor (MatchDiscovery filtresi)
CREATE INDEX IF NOT EXISTS idx_matches_date_status ON public.matches (date, status);
