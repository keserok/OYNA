# Supabase Migrations — Baseline & Reconciliation

## Durum (2026-06-14)

Repo'daki `supabase/migrations/` dosyaları canlı prod ile **desync** olmuştu ve
sıfırdan **replay edilemiyordu** (Supabase PR preview check kırmızı). Sebepler:

- Eski dosyalar prod'a elle/parça parça uygulanmış, dosya sırası bozulmuştu
  (örn. bir trigger, bağımlı olduğu tablo oluşmadan önce kuruluyordu).
- Prod migration history'de olup repo'da **dosya olarak bulunmayan** ~20 migration
  vardı (`roles_phase*`, `faz1_player_booking_flow`, `optimize_rls_initplan`,
  `consolidate_multiple_permissive_policies`, `economy_phase5_hardening`, …).

## Çözüm: tek temiz baseline

`supabase/migrations/20260101000000_baseline_schema.sql`, canlı prod
(`iikvzgyccvgcybzdfwlv`) **public** şemasının 2026-06-14 anlık görüntüsüdür.

- Üretim: `pg_dump 18.4 --schema-only --no-owner --schema=public`
- Temizlik (migration runner psql olmadığı için):
  - `\restrict` / `\unrestrict` psql meta-komutları kaldırıldı
  - `CREATE SCHEMA public;` kaldırıldı (hedef DB'de zaten var)
  - replay için gereken public-şema extension'ları başa eklendi:
    `btree_gist` (pitch_bookings EXCLUDE çakışma kısıtı),
    `cube` + `earthdistance` (`ll_to_earth` coğrafi index)
- `extensions.*`, `auth.*`, `anon`/`authenticated`/`service_role` rolleri Supabase
  platformunda hazır geldiği için baseline onları **oluşturmaz** (sadece referans alır).

Eski dosyalar silinmedi; `supabase/_archive_migrations/` altına taşındı (tarihsel referans).

## Prod migration history'yi hizalama (PROD'A DOKUNAN — bu PR kapsamı DIŞINDA)

Bu PR yalnızca repo/CI tarafını düzeltir; **canlı prod'a hiçbir şey uygulanmadı**.
Prod'un `supabase_migrations.schema_migrations` tablosu hâlâ eski 29 sürümü içeriyor.
Repo ile prod history'yi tam hizalamak istenirse (CLI ile, dikkatlice):

```bash
# Baseline'ı "uygulanmış" işaretle, eski dağınık sürümleri geri al:
supabase migration repair --status applied   20260101000000
supabase migration repair --status reverted  20260606112849 20260606113339 ... # eski sürümler
supabase migration list   # repo ↔ remote tek satıra inmeli
```

> Not: `repair` yalnızca history tablosunu günceller, şemayı değiştirmez. Prod şeması
> baseline ile birebir aynı olduğundan veri/şema riski yoktur, ama yine de bir
> bakım penceresinde yapılması önerilir.

## Bundan sonra

Yeni değişiklikler normal akışla: `supabase migration new <ad>` → SQL yaz →
PR → preview check artık baseline'ı temiz replay edip **yeşil** olmalı.
