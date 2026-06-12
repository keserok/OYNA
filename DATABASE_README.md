# OYNA Veritabanı Yönetim Sistemi

Supabase veritabanı için kapsamlı yönetim araçları ve dökümantasyon.

## 🎯 Özellikler

- ✅ **MCP Authentication** - Cursor Agent ile doğrudan veritabanı erişimi
- ✅ **SQL Query Interface** - İnteraktif sorgu araçları
- ✅ **Migration Management** - Kolay migration oluşturma ve yönetimi
- ✅ **RLS Policy Generator** - Güvenlik policy'leri otomatik üretimi
- ✅ **Performance Monitoring** - Supabase Advisors entegrasyonu
- ✅ **Security Reports** - Otomatik güvenlik raporları
- ✅ **Data Operations** - Seed ve maintenance scriptleri

## 🚀 Hızlı Başlangıç

### 1. Bağlantı Testi

```bash
# Veritabanı bağlantısını test et
npx tsx scripts/db-query.ts --file scripts/db-queries/test-connection.sql
```

### 2. RLS Kontrolü

```bash
# Hangi tablolarda RLS aktif kontrol et
npx tsx scripts/db-query.ts --file scripts/db-queries/check-rls.sql
```

### 3. Güvenlik Raporu

```bash
# Son güvenlik raporunu gör
cat reports/db-advisors/security-report-2026-06-03.md
```

## 📁 Proje Yapısı

```
.
├── scripts/
│   ├── db-query.ts                 # İnteraktif SQL query tool
│   ├── generate-rls-policy.ts      # RLS policy generator
│   ├── check-performance.ts        # Performans kontrol
│   ├── db-queries/                 # Hazır SQL sorguları
│   │   ├── test-connection.sql
│   │   ├── check-rls.sql
│   │   ├── user-stats.sql
│   │   └── match-stats.sql
│   ├── migrations/                 # Migration utilities
│   │   ├── create-migration.sh
│   │   └── apply-migration.sh
│   ├── seeds/                      # Test data seeding
│   │   └── seed-all.ts
│   └── maintenance/                # DB maintenance
│       ├── vacuum.sql
│       └── cleanup-old-data.sql
├── reports/
│   └── db-advisors/                # Otomatik güvenlik raporları
│       └── security-report-*.md
├── docs/
│   ├── db-workflow.md              # Kapsamlı workflow kılavuzu
│   └── db-commands.md              # Komut referansı
└── supabase/
    ├── migrations/                 # Migration dosyaları
    └── config.toml                 # Supabase config
```

## 🛠️ Kullanım

### SQL Sorguları

```bash
# Tek satır sorgu
npx tsx scripts/db-query.ts "SELECT COUNT(*) FROM users"

# Dosyadan sorgu
npx tsx scripts/db-query.ts --file scripts/db-queries/user-stats.sql

# Yardım
npx tsx scripts/db-query.ts --help
```

### Migration Oluşturma

```bash
# İnteraktif migration creator
./scripts/migrations/create-migration.sh

# Supabase CLI ile manuel
supabase migration new add_feature_name
```

### RLS Policy Oluşturma

```bash
# İnteraktif policy generator
npx tsx scripts/generate-rls-policy.ts

# Adım adım:
# 1. Tablo seç
# 2. Policy tipi seç (SELECT/INSERT/UPDATE/DELETE)
# 3. Auth kuralı seç (public/authenticated/owner/admin)
# 4. Oluşturulan SQL'i migration'a ekle
```

### Cursor Agent ile Kullanım

Agent'a doğrudan komut verebilirsiniz:

```
"users tablosunda kaç kayıt var?"
"Son 10 maçı listele"
"Güvenlik kontrolü yap"
"RLS durumunu kontrol et"
"Performans önerilerini getir"
```

## 📊 Veritabanı Durumu

### Mevcut Schema

- **24 tablo** (users, profiles, matches, teams, pitches, vb.)
- **RLS aktif** tüm tablolarda ✅
- **PostgreSQL 17.6** 
- **Bölge:** ap-southeast-1
- **Status:** ACTIVE_HEALTHY

### Güvenlik Durumu

Son güvenlik taraması: **3 Haziran 2026**

**Kritik Sorunlar:**
- ⚠️ 2 tabloda RLS policy eksik (player_ratings, wallet_transactions)
- ⚠️ 36 RLS policy aşırı permissive (USING true)
- ⚠️ 8 SECURITY DEFINER function anon'a açık
- ⚠️ profiles_public view SECURITY DEFINER

**Detaylar:** `reports/db-advisors/security-report-2026-06-03.md`

## 🔒 Güvenlik Best Practices

1. **Her public tabloda RLS enable olmalı**
2. **Service role key client'ta kullanılmamalı**
3. **SECURITY DEFINER functions dikkatli kullanılmalı**
4. **user_metadata JWT claims için güvenli değil**
5. **View'lar security_invoker kullanmalı**

Detaylı güvenlik kılavuzu: `docs/db-workflow.md`

## 📚 Dökümantasyon

- [Workflow Kılavuzu](docs/db-workflow.md) - Kapsamlı veritabanı yönetim kılavuzu
- [Komut Referansı](docs/db-commands.md) - Sık kullanılan SQL komutları
- [Güvenlik Raporu](reports/db-advisors/security-report-2026-06-03.md) - Son güvenlik taraması

## 🤝 Agent ile Çalışma

Bu araçlar Cursor Agent ile tam entegre çalışır:

**MCP Bağlantısı:** ✅ Aktif  
**Project:** iikvzgyccvgcybzdfwlv (OYNA)

Agent şunları yapabilir:
- SQL sorguları çalıştır
- Tablo yapısını incele
- Güvenlik taraması yap
- Performans önerileri sun
- Migration yönetimi
- RLS policy oluşturma yardımı

## ⚙️ Gereksinimler

- Node.js 18+
- npm
- Supabase CLI 2.104.0+
- tsx (TypeScript execution)

## 🐛 Sorun Giderme

### "Permission Denied" Hatası

RLS policy'lerini kontrol edin:
```bash
npx tsx scripts/db-query.ts --file scripts/db-queries/check-rls.sql
```

### Slow Queries

Performance monitoring çalıştırın:
```bash
npx tsx scripts/check-performance.ts
```

veya Agent'a sorun:
```
"Performans sorunlarını kontrol et"
```

### Migration Hataları

Migration history'yi kontrol edin:
```bash
supabase migration list --project-ref iikvzgyccvgcybzdfwlv
```

## 📞 Destek

- [Supabase Docs](https://supabase.com/docs)
- [Database Linter](https://supabase.com/docs/guides/database/database-linter)
- [RLS Guide](https://supabase.com/docs/guides/auth/row-level-security)

## 📄 Lisans

Bu araçlar OYNA projesi için geliştirilmiştir.

---

**Son Güncelleme:** 3 Haziran 2026  
**Proje:** OYNA (iikvzgyccvgcybzdfwlv)  
**Database Version:** PostgreSQL 17.6
