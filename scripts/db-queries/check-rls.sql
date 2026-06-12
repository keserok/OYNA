-- RLS (Row Level Security) durumunu kontrol et
-- Hangi tablolarda RLS aktif/pasif gösterir

SELECT 
  schemaname,
  tablename,
  rowsecurity as rls_enabled,
  CASE 
    WHEN rowsecurity THEN '✅ Aktif'
    ELSE '❌ Pasif'
  END as status
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
