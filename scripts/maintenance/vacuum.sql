-- Database Maintenance: VACUUM
-- Ölü satırları temizler ve disk alanını optimize eder
-- Kullanım: Periyodik olarak çalıştırılmalı (örn. haftalık)

-- Tüm tabloları vacuum et
VACUUM ANALYZE;

-- Belirli tablolar için detaylı vacuum
VACUUM (VERBOSE, ANALYZE) public.users;
VACUUM (VERBOSE, ANALYZE) public.matches;
VACUUM (VERBOSE, ANALYZE) public.notifications;
VACUUM (VERBOSE, ANALYZE) public.wallet_transactions;

-- VACUUM FULL (dikkatli kullan - tablo kilidi oluşturur)
-- VACUUM FULL public.old_large_table;
