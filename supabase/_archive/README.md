# Arşiv — ÇALIŞTIRMAYIN

Bu klasördeki SQL dosyaları 2026-07-11 SQL denetiminde aktif klasörlerden çıkarıldı.
Tarihsel referans için saklanıyorlar; **hiçbiri canlı veritabanına uygulanmamalıdır.**
İçlerinde bugünkü şemayla çelişen tablo tanımları ve güvenlik açısından tehlikeli
grant'ler (ör. `anon`'a SECURITY DEFINER fonksiyon yetkisi) vardır.

## `unapplied_migrations/`

`supabase/migrations/` içinde duran ama canlı DB'nin migration geçmişinde
(`supabase_migrations.schema_migrations`) **hiç kaydı olmayan** 22 dosya:

- **Proje öncesi/başlangıç dönemi (Mayıs–Haziran):** `plei_fubles_schema`, `rls_complete`,
  `security_hardening`, `wallet_transactions`, `owner_pitches`, `communities_system`,
  `conflict_prevention`, `service_integration`, `consolidate_user_tables_and_security`,
  `pitch_booking_integration`, `pitch_bookings_realtime` vb. — İlk şema bu dönemde
  SQL Editor'den elle kuruldu; bu dosyaların etkileri (kısmen) canlıda var ama migration
  kaydı yok. İçerikleri bugünkü şemanın gerisinde kaldığı için güvenilmezler.
- **Farklı adla uygulananlar:** ör. `fix_nearby_matches_open_status` →
  canlıda `get_nearby_matches_canonical_open_status`; `faz8_harden_player_slot_rpcs` →
  `harden_player_slot_rpcs_revoke_public`; `verification_sla_config` → etkisi
  `pgcrypto_guard_and_sla_seed` içinde. Uygulanan gerçek SQL, `migrations/` klasöründe
  DB'den kurtarılan dosyalardadır.

## `legacy_sql/`

Migration sistemi kurulmadan önce elle çalıştırılmış gevşek dosyalar:

- `root_supabase_migration.sql` (repo kökünde duruyordu) — `teams.team_roles` kolonu +
  `sbremoveplayerfromteam` RPC'si; `anon`'a SECURITY DEFINER EXECUTE veriyor (bugünkü
  güvenlik standardına aykırı).
- `supabase_schema.sql`, `supabase_wallet_update.sql`, `supabase_location_update.sql`
  (eski `supabase/sql/` klasörü) — ilk kurulum betikleri; şema bugün çok daha ileride.
