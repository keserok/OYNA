-- ============================================================================
-- SAHA ÖZELLİK ROZETLERİ (courts.features)
-- Saha bazlı ek özellikler (ısıtma, tribün, kamera kaydı...) — owner girer,
-- oyuncu kartında rozet olarak görünür. jsonb string[] (ör. ["heating","camera"]).
-- Tesis geneli 'amenities' (pitches.amenities) tesisin geneli içindir; bu alan
-- SAHA (court) düzeyindedir → farklı sahalar farklı özelliklere sahip olabilir.
-- ============================================================================

ALTER TABLE public.courts
  ADD COLUMN IF NOT EXISTS features jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.courts.features IS
  'Saha bazlı özellik anahtarları (string[]): heating, tribune, camera, ... Owner panelinden girilir, oyuncu vitrininde rozet olarak gösterilir.';
