-- Eski verileri temizleme
-- Dikkat: Bu script veri SİLER! Yedek aldıktan sonra çalıştırın.

-- 1 yıldan eski notifications
DELETE FROM notifications 
WHERE created_at < NOW() - INTERVAL '1 year'
  AND is_read = true;

-- 6 aydan eski push logs
DELETE FROM push_log
WHERE created_at < NOW() - INTERVAL '6 months'
  AND status IN ('sent', 'failed');

-- Tamamlanmış ve 3 aydan eski maçlar
UPDATE matches 
SET status = 'ARCHIVED'
WHERE status = 'COMPLETED' 
  AND date < NOW() - INTERVAL '3 months';

-- İptal edilmiş ve 1 aydan eski maçlar
DELETE FROM matches
WHERE status = 'CANCELLED'
  AND "createdAt" < NOW() - INTERVAL '1 month';

-- Sonuç raporu
SELECT 
  'Cleanup completed' as status,
  NOW() as timestamp;
