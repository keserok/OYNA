# OYNA - Veritabanı Yönetim Kılavuzu

Bu döküman OYNA uygulamasının Supabase veritabanı yönetimi için hazırlanmıştır.

## 📚 İçindekiler

1. [Hızlı Başlangıç](#hızlı-başlangıç)
2. [Veritabanı Bağlantısı](#veritabanı-bağlantısı)
3. [SQL Sorguları Çalıştırma](#sql-sorguları-çalıştırma)
4. [Migration Yönetimi](#migration-yönetimi)
5. [RLS Policy Yönetimi](#rls-policy-yönetimi)
6. [Performans İzleme](#performans-izleme)
7. [Data Operations](#data-operations)
8. [Güvenlik Best Practices](#güvenlik-best-practices)

## 🚀 Hızlı Başlangıç

### Gereksinimler

- Node.js 18+ ve npm
- Supabase hesabı ve proje
- `.env` dosyasında yapılandırılmış VITE_SUPABASE_URL ve VITE_SUPABASE_ANON_KEY

### İlk Kurulum

```bash
# Supabase CLI kurulu mu kontrol et
supabase --version

# Proje initialize edildi mi kontrol et  
ls supabase/config.toml

# Bağlantı testi
npx tsx scripts/db-query.ts --file scripts/db-queries/test-connection.sql
```

## 🔌 Veritabanı Bağlantısı

### MCP ile Agent Bağlantısı (Önerilen)

Cursor Agent'ınız MCP (Model Context Protocol) üzerinden doğrudan Supabase'e bağlıdır:

```
✅ MCP Authentication: Tamamlandı
✅ Project: iikvzgyccvgcybzdfwlv (OYNA)
✅ Erişilebilir Tools: execute_sql, list_tables, get_advisors, vb.
```

Agent'a şunları söyleyebilirsiniz:
- "Veritabanındaki tüm tabloları listele"
- "users tablosunda kaç kayıt var?"
- "Son eklenen 5 maçı göster"
- "Güvenlik kontrolü yap"

### Manuel SQL Sorguları

```bash
# Tek satır sorgu
npx tsx scripts/db-query.ts "SELECT COUNT(*) FROM users"

# Dosyadan sorgu
npx tsx scripts/db-query.ts --file scripts/db-queries/user-stats.sql
```

### Mevcut Hazır Sorgular

```bash
# Bağlantı testi
scripts/db-queries/test-connection.sql

# RLS durumu kontrolü
scripts/db-queries/check-rls.sql

# Kullanıcı istatistikleri
scripts/db-queries/user-stats.sql

# Maç istatistikleri
scripts/db-queries/match-stats.sql
```

## 📋 Migration Yönetimi

### Yeni Migration Oluşturma

```bash
# İnteraktif migration creator
./scripts/migrations/create-migration.sh

# Manuel Supabase CLI
supabase migration new add_user_badges
```

### Migration Workflow

```
1. Development
   ↓
2. SQL yazma/test (MCP execute_sql)
   ↓
3. Migration dosyasına kaydet
   ↓
4. Güvenlik kontrolü (advisors)
   ↓
5. Remote'a uygula
   ↓
6. Git commit
```

### Remote'a Migration Uygulama

```bash
# Uygulanacak değişiklikleri gör
supabase db remote list-changes --project-ref iikvzgyccvgcybzdfwlv

# Uygula
./scripts/migrations/apply-migration.sh

# Manuel
supabase db push --project-ref iikvzgyccvgcybzdfwlv
```

### Migration History

```bash
# Mevcut migrations
supabase migration list --project-ref iikvzgyccvgcybzdfwlv

# Son migration
ls -t supabase/migrations/*.sql | head -1
```

## 🔒 RLS Policy Yönetimi

### Policy Generator Kullanımı

```bash
npx tsx scripts/generate-rls-policy.ts
```

Interaktif olarak:
1. Tablo adı seçin
2. Policy tipi seçin (SELECT/INSERT/UPDATE/DELETE)
3. Yetkilendirme kuralı seçin (public/authenticated/owner/admin)
4. Oluşturulan SQL'i migration'a ekleyin

### Policy Şablonları

#### Public Read
```sql
CREATE POLICY "tablo_public_read" ON public.tablo
  FOR SELECT USING (true);
```

#### Authenticated Only
```sql
CREATE POLICY "tablo_auth_only" ON public.tablo
  FOR SELECT USING (auth.role() = 'authenticated');
```

#### Own Records
```sql
CREATE POLICY "tablo_own_records" ON public.tablo
  FOR ALL USING (auth.uid() = user_id);
```

#### Admin Only
```sql
CREATE POLICY "tablo_admin_only" ON public.tablo
  FOR DELETE USING (
    (SELECT role FROM users WHERE id = auth.uid()) = 'ADMIN'
  );
```

### RLS Kontrol

```bash
# Hangi tablolarda RLS aktif?
npx tsx scripts/db-query.ts --file scripts/db-queries/check-rls.sql

# Agent ile
"RLS durumunu kontrol et"
```

## 📊 Performans İzleme

### Database Advisors

Supabase otomatik olarak güvenlik ve performans önerileri sunar:

```bash
# Agent ile (önerilen)
"Veritabanı güvenlik kontrolü yap"
"Performans önerilerini getir"

# Manuel kontrol
npx tsx scripts/check-performance.ts
```

### Security Report

Otomatik oluşturulan güvenlik raporu:
```
reports/db-advisors/security-report-2026-06-03.md
```

**ÖNEMLİ:** Bu raporlar kritik güvenlik sorunlarını içerebilir. Düzenli kontrol edin!

### Performans Sorunları

Yaygın sorunlar:
- Eksik indexler
- N+1 query problemleri
- Aşırı permissive RLS policies
- Mutable search_path (SQL injection riski)

## 💾 Data Operations

### Test Data Seeding

```bash
# Tüm test data
npx tsx scripts/seeds/seed-all.ts

# Özel seed scriptleri
# scripts/seeds/ klasöründe oluşturabilirsiniz
```

**UYARI:** Production'da seed çalıştırmayın!

### Bakım İşlemleri

```bash
# VACUUM (disk optimizasyonu)
npx tsx scripts/db-query.ts --file scripts/maintenance/vacuum.sql

# Eski veri temizliği
npx tsx scripts/db-query.ts --file scripts/maintenance/cleanup-old-data.sql
```

### Backup

Supabase otomatik backup alır ancak manuel export için:

```bash
supabase db dump --project-ref iikvzgyccvgcybzdfwlv > backup.sql
```

## 🛡️ Güvenlik Best Practices

### Kritik Güvenlik Kuralları

1. **Her public tabloda RLS aktif olmalı**
   ```sql
   ALTER TABLE public.yeni_tablo ENABLE ROW LEVEL SECURITY;
   ```

2. **Service Role Key'i ASLA client'ta kullanma**
   - Sadece anon key frontend'de
   - Service role sadece backend/edge functions

3. **SECURITY DEFINER fonksiyonlar dikkatli**
   - Public schema'da olmamalı
   - Anon role execute yetkisi olmamalı
   - Search path ayarlı olmalı

4. **user_metadata güvenli değil**
   - JWT claims için user_metadata kullanma
   - app_metadata kullan

5. **View'lar için security_invoker**
   ```sql
   CREATE VIEW my_view WITH (security_invoker = true) AS ...
   ```

### Güvenlik Checklist

- [ ] Tüm tablolarda RLS enabled
- [ ] Her tablonun uygun policy'si var
- [ ] SECURITY DEFINER functions gözden geçirildi
- [ ] Extension'lar public schema'da değil
- [ ] Function search_path'ler ayarlı
- [ ] Leaked password protection aktif
- [ ] Test data production'da değil
- [ ] Backup stratejisi mevcut

## 🔧 Troubleshooting

### "Permission Denied" Hatası

```sql
-- RLS aktif mi kontrol et
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename = 'problem_table';

-- Policy var mı?
SELECT * FROM pg_policies 
WHERE tablename = 'problem_table';
```

### "RLS Policy Too Permissive" Uyarısı

```sql
-- Problemi bul
SELECT * FROM pg_policies 
WHERE tablename = 'your_table'
  AND (qual = 'true' OR with_check = 'true');

-- Düzelt
DROP POLICY "old_policy" ON public.your_table;
CREATE POLICY "new_policy" ON public.your_table
  FOR INSERT WITH CHECK (auth.uid() = user_id);
```

### Slow Queries

```sql
-- Aktif sorgular
SELECT pid, usename, state, query, query_start
FROM pg_stat_activity
WHERE state != 'idle' 
ORDER BY query_start;

-- Query plan
EXPLAIN ANALYZE
SELECT * FROM matches WHERE status = 'OPEN';
```

## 📞 Yardım ve Destek

### Dokümantasyon

- [Supabase Docs](https://supabase.com/docs)
- [Database Linter](https://supabase.com/docs/guides/database/database-linter)
- [RLS Guide](https://supabase.com/docs/guides/auth/row-level-security)

### Agent Komutları

Agent'a soru sorun:
- "Tablolarımda kaç kayıt var?"
- "Güvenlik sorunlarını kontrol et"
- "Son migration'ları göster"
- "RLS policy oluşturmama yardım et"

### Script Yardımı

```bash
# Herhangi bir script için yardım
npx tsx scripts/db-query.ts --help
./scripts/migrations/create-migration.sh --help
```

---

**Son Güncelleme:** 3 Haziran 2026  
**Proje:** OYNA (iikvzgyccvgcybzdfwlv)  
**Veritabanı Version:** PostgreSQL 17.6
