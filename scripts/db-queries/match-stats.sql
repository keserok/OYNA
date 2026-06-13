-- Maç istatistikleri
-- Sistemdeki maçların durum özeti

SELECT 
  status,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM matches
GROUP BY status
ORDER BY count DESC;
