-- ============================================================================
-- SAHA (KORT) ÖZELLİK ROZETLERİ — courts.features
-- ----------------------------------------------------------------------------
-- DRIFT ONARIMI NOTU (2026-07-21): Canlıya MCP ile uygulanmış (ledger:
-- 20260721002631|saha_ozellikleri) ancak repoya commit'lenmemişti. İçerik canlı
-- ledger'daki statements kaydından BİREBİR aktarılmıştır; canlıda uygulandığı
-- için ledger'da "applied" işaretlidir, sıfırdan replay'de normal koşar.
-- ============================================================================

ALTER TABLE public.courts
  ADD COLUMN IF NOT EXISTS features jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.courts.features IS
  'Saha bazlı özellik anahtarları (string[]): heating, tribune, camera, ... Owner panelinden girilir, oyuncu vitrininde rozet olarak gösterilir.';
