# Veritabanı Komut Referansı

Hızlı referans için yaygın kullanılan veritabanı komutları.

## 🔍 Sorgulama

```bash
# Tablo listesi
SELECT tablename FROM pg_tables WHERE schemaname = 'public';

# Kayıt sayısı
SELECT COUNT(*) FROM users;

# Son kayıtlar
SELECT * FROM matches ORDER BY "createdAt" DESC LIMIT 10;

# Filtreleme
SELECT * FROM users WHERE "isBanned" = false AND rating > 4.0;

# Join örneği
SELECT m.title, u.name as creator
FROM matches m
JOIN users u ON m."creatorId" = u.id
WHERE m.status = 'OPEN';
```

## 🛠️ Schema İşlemleri

```bash
# Tablo bilgisi
\d public.users

# Kolon listesi
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'users';

# Foreign keyler
SELECT
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name 
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY';

# Indexler
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'users';
```

## 📊 İstatistikler

```bash
# Tablo boyutları
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

# Kayıt sayıları
SELECT 
    schemaname,
    tablename,
    n_tup_ins as inserts,
    n_tup_upd as updates,
    n_tup_del as deletes
FROM pg_stat_user_tables
WHERE schemaname = 'public';

# Aktif bağlantılar
SELECT 
    datname,
    usename,
    COUNT(*)
FROM pg_stat_activity
GROUP BY datname, usename;
```

## 🔒 RLS ve Security

```bash
# RLS durumu
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public';

# Policy listesi
SELECT
    schemaname,
    tablename,
    policyname,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

# Kullanıcı rolleri
SELECT usename, usesuper, usecreatedb
FROM pg_user;

# Grant kontrol
SELECT
    grantee,
    table_schema,
    table_name,
    privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'public'
ORDER BY table_name, grantee;
```

## ⚡ Performans

```bash
# Slow query detection
SELECT
    query,
    calls,
    mean_exec_time,
    max_exec_time,
    total_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

# Cache hit ratio (>99% olmalı)
SELECT
    sum(heap_blks_read) as heap_read,
    sum(heap_blks_hit)  as heap_hit,
    sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read)) as cache_ratio
FROM pg_statio_user_tables;

# Index kullanım oranı
SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan as scans,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;

# Unused indexes
SELECT
    schemaname,
    tablename,
    indexname,
    pg_size_pretty(pg_relation_size(indexrelid)) as size
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND schemaname = 'public'
ORDER BY pg_relation_size(indexrelid) DESC;
```

## 🧹 Bakım

```bash
# Vacuum stats
SELECT
    schemaname,
    tablename,
    last_vacuum,
    last_autovacuum,
    n_dead_tup,
    n_live_tup
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY n_dead_tup DESC;

# Analyze stats
SELECT
    schemaname,
    tablename,
    last_analyze,
    last_autoanalyze
FROM pg_stat_user_tables
WHERE schemaname = 'public';

# Bloat estimation
SELECT
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
    pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - 
                   pg_relation_size(schemaname||'.'||tablename)) as indexes_size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

## 📝 CRUD İşlemleri

```bash
# Insert
INSERT INTO users (id, name, email, role)
VALUES (gen_random_uuid(), 'Test User', 'test@example.com', 'PLAYER');

# Update
UPDATE users 
SET rating = rating + 0.1
WHERE id = 'user-uuid' AND rating < 5.0;

# Delete (dikkatli!)
DELETE FROM notifications
WHERE created_at < NOW() - INTERVAL '1 year'
  AND is_read = true;

# Upsert
INSERT INTO settings (id, value)
VALUES ('feature_flag', true)
ON CONFLICT (id) 
DO UPDATE SET value = EXCLUDED.value;
```

## 🔧 Utility Functions

```bash
# UUID generate
SELECT gen_random_uuid();

# Timestamp
SELECT NOW(), CURRENT_TIMESTAMP, timezone('utc', NOW());

# JSON operations
SELECT 
    playerCard->>'position' as position,
    playerCard->'stats'->>'goals' as goals
FROM users
WHERE playerCard IS NOT NULL;

# Array operations
SELECT 
    name,
    cardinality(friends) as friend_count
FROM users
WHERE 'friend-uuid' = ANY(friends);

# Text search
SELECT * FROM matches
WHERE title ILIKE '%halı saha%';

# Distance (earthdistance extension)
SELECT
    name,
    earth_distance(
        ll_to_earth(latitude, longitude),
        ll_to_earth(41.0082, 28.9784)
    ) / 1000 as distance_km
FROM pitches
ORDER BY distance_km
LIMIT 10;
```

## 🚨 Acil Durum Komutları

```bash
# Tüm aktif sorguları durdur (dikkatli!)
SELECT pg_cancel_backend(pid)
FROM pg_stat_activity
WHERE state = 'active' AND query NOT LIKE '%pg_stat_activity%';

# Long running queries kill
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state = 'active'
  AND query_start < NOW() - INTERVAL '10 minutes';

# Lock'ları göster
SELECT 
    locktype,
    relation::regclass,
    mode,
    granted,
    pid
FROM pg_locks
WHERE NOT granted;

# Deadlock detection
SELECT * FROM pg_stat_database WHERE deadlocks > 0;
```

---

**Kaynak:** PostgreSQL 17.6 Documentation  
**Proje:** OYNA Veritabanı  
**Not:** Bu komutlar Supabase Postgres ortamında test edilmiştir.
