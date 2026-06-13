-- Veritabanı bağlantı testi
-- Bu sorgu veritabanı sürümünü ve temel bilgileri gösterir

SELECT 
  version() as database_version,
  current_database() as database_name,
  current_user as current_user,
  now() as current_timestamp;
