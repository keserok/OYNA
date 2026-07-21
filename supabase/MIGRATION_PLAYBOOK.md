# 🗃️ OYNA Migration Playbook — Ledger Drift'i Bir Daha Yaşamamak İçin

> Bağlam: 2026-07-21'de production ledger'ı (`supabase_migrations.schema_migrations`)
> ile repo dosyaları arasında büyük bir sürüklenme (drift) tespit edildi ve
> "tam ayna sıfırlaması" ile onarıldı (yedekler: `schema_migrations_backup_*`).
> Kök neden: migration'ların bir kısmının MCP/dashboard'dan uygulanması
> (ledger'a uygulanma-anı versiyonuyla yazılır) + dosyaların sonradan yeniden
> numaralandırılması. Bu kurallar nüksü önler.

## Altın Kurallar

1. **Migration'lar YALNIZ repo dosyası + PR + otomatik deploy ile canlıya gider.**
   `mcp apply_migration` / dashboard SQL editor ile production'a DDL uygulamak
   YASAK. (Acil durumda uygulandıysa: aynı gün birebir SQL repo dosyası olarak
   eklenir VE ledger'daki versiyon repo dosya adıyla eşitlenir.)

2. **Var olan migration dosyası ASLA yeniden adlandırılmaz, numaralandırılmaz,
   düzenlenmez veya silinmez.** Dosya adı = ledger sözleşmesidir. Düzeltme
   gerekiyorsa YENİ bir migration eklenir. (CI'daki `migration-immutability`
   kontrolü bunu otomatik reddeder.)

3. **Yeni dosyanın versiyonu her zaman en son dosyadan BÜYÜK olmalı**
   (pratikte: bugünün tarihi ile `YYYYMMDDHHMMSS_isim.sql`). Geriye tarihli
   dosya eklemek `db push`'ta out-of-order hatası üretir.

4. **Her migration idempotent yazılır** (`IF NOT EXISTS`, `CREATE OR REPLACE`,
   `DROP ... IF EXISTS`, `ON CONFLICT DO NOTHING`) — sıfırdan replay (preview
   branch) ve olası tekrar-uygulama güvenli olsun.

5. **Doğrulama sırası:** PR açılır → Supabase Preview (sıfırdan replay) YEŞİL
   olmadan merge edilmez → merge sonrası `main` branch'inin Supabase durumunun
   yeşil kaldığı kontrol edilir (`MIGRATIONS_FAILED` görülürse hemen incelenir,
   üstüne yeni migration bindirilmez).

## Drift Şüphesinde Hızlı Teşhis (salt-okunur)

```sql
-- Ledger'ın son 10 kaydı repo'nun son 10 dosyasıyla birebir aynı mı?
select version, name from supabase_migrations.schema_migrations
order by version desc limit 10;
```

Repo tarafı: `ls supabase/migrations | tail`. Versiyonlar birebir eşleşmiyorsa
drift başlamıştır — büyümeden bu playbook'taki kurallarla düzeltin
(eksik dosyayı repoya al / ledger versiyonunu dosya adıyla eşitle).

## Onarım Yedekleri

- `supabase_migrations.schema_migrations_backup_20260721` — drift onarımı
  öncesi tam ledger kopyaları. Onarım doğrulandıktan ~30 gün sonra
  düşürülebilir (`drop table`).
