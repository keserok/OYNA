# OYNA Admin RPC — Yetki Envanteri (Wave 8)

> **Amaç:** Her durum-değiştiren admin RPC'sinin sunucu-taraflı yetki kapısını tek yerde belgelemek (Kararlar Soru 16, 21-22).
> **Son güncelleme kaynağı:** canlı `pg_proc` taraması (46 RPC guard'lı doğrulandı).
> **Kapı fonksiyonu:** `require_admin_role(p_allowed text[])` — fail-closed.

## Kapı semantiği

`require_admin_role(allowed)` şu sırayla değerlendirir:
1. `is_platform_admin()` değilse → **UNAUTHORIZED**.
2. Çağıranın `admin_team_members.admin_role`'ü NULL (kurucu) veya `SUPER_ADMIN`/`ADMIN` ise → **geçer** (tam yetki).
3. Aksi halde rol `allowed` listesinde olmalı; değilse → **FORBIDDEN**.

Yani `allowed=[]` = yalnız ADMIN/SUPER_ADMIN; `allowed=['FINANCE']` = FINANCE + ADMIN/SUPER_ADMIN.

## Sarmalayıcı deseni

Çoğu RPC `<ad>__core` (kapısız çekirdek, `authenticated`'a EXECUTE **kapalı**) + aynı imzalı kapılı sarmalayıcı olarak kuruludur. **Davranış değişikliği `__core` üzerinde yapılmalı; sarmalayıcıyı `CREATE OR REPLACE` ile ezmeyin** (kapı kaybolur). Saha RPC'leri (`admin_create_pitch`, `admin_update_pitch`) ve yeni RPC'ler (`admin_start_ghost`) kapıyı inline taşır.

## Rol → RPC matrisi

### FİNANS (FINANCE + ADMIN/SUPER_ADMIN)
Para hareketi taşıyan tüm işlemler:
- `admin_process_payout`, `admin_reverse_payout`, `admin_process_withdrawal`, `admin_release_service_payout`
- `admin_refund_intent`, `admin_force_capture_intent`, `admin_force_void_intent`
- `admin_update_owner_account`

### OPERASYON (MODERATOR + ADMIN/SUPER_ADMIN)
Kullanıcı / tesis / maç / sağlayıcı yönetimi:
- Kullanıcı: `admin_ban_user`, `admin_verify_user`, `admin_update_user_profile`, `admin_upsert_user_profile`, `admin_process_account_deletion`, `admin_set_player_card`, `admin_set_player_card_data`
- Tesis: `admin_create_pitch`, `admin_update_pitch` (owner_id devri **yalnız SUPER_ADMIN**), `admin_delete_pitch`, `admin_moderate_pitch`
- Maç: `admin_create_match`, `admin_update_match`, `admin_delete_match`, `admin_cancel_match`, `admin_set_match_status`, `admin_override_match_score`, `admin_assign_to_slot`, `admin_kick_from_slot`, `admin_swap_slots`, `admin_assign_match_referee`, `admin_assign_match_goalkeeper`, `admin_notify_match_roster`
- Sağlayıcı: `admin_create_goalkeeper`, `admin_update_goalkeeper`, `admin_delete_goalkeeper`, `admin_create_referee`, `admin_update_referee`, `admin_delete_referee`, `admin_review_provider_application`, `admin_verify_provider_identity`

### OPERASYON + DESTEK (MODERATOR + SUPPORT + ADMIN/SUPER_ADMIN)
- `admin_start_ghost` (ghost mode; zorunlu sebep + 30 dk TTL)

### FİNANS + OPERASYON (FINANCE + MODERATOR + ADMIN/SUPER_ADMIN)
- `admin_resolve_dispute` (ihtilaf ikisini de ilgilendirir)

### YALNIZ ADMIN / SUPER_ADMIN (allowed=[])
Platform ayarları ve toplu iletişim:
- `admin_update_settings`, `admin_set_config`, `admin_set_feature_flag`, `admin_update_texts`, `admin_broadcast_notification`
- `admin_upsert_home_banner`, `admin_delete_home_banner` — ana sayfa bant görselinin
  bölgeye (il/ilçe) göre atanması. `admin_update_texts` ile aynı sınıfta: bir
  BÖLGEDEKİ HERKESİN gördüğü sunum içeriği.

### YALNIZ SUPER_ADMIN
- `admin_set_platform_role`, `admin_revoke_platform_role` (son SUPER_ADMIN düşürülemez, self-revoke yasak, SUPER_ADMIN atama yalnız SUPER_ADMIN)
- `admin_update_pitch` ile **owner_id devri** (tesis sahipliği devri)

## PII & KVKK

- `admin_fetch_profiles` → email/telefon **maskeli** döner; arama ham kolonda çalışır.
- `admin_reveal_pii(user, field)` → ham değeri döndürür **ve** aynı çağrıda `PII_REVEAL` audit'i yazar (log düşmeden değer dönmez).
- `admin_start_ghost` / `admin_end_ghost` → `admin_ghost_sessions` + `GHOST_START`/`GHOST_END` audit.

## Admin OLMAYAN ama kapılı RPC'ler

Bunlar `require_admin_role` kullanmaz; kapıları başka bir sahiplik kuralıdır.
Burada duruyorlar ki "kapısız" sanılmasınlar.

- `record_image_variants(...)` — yükleme anında üretilen görsel boylarını kaydeder.
  Kapı: çağıran, ilgili `storage.objects` nesnesinin **sahibi** olmalıdır
  (`owner = auth.uid()`); admin muaftır. Kapı olmasaydı giriş yapmış herhangi
  bir kullanıcı, başkasının görselinin varyant adreslerini kendi yüklediğiyle
  değiştirebilirdi — ekranda görünen fotoğrafı sessizce değiştirmek.
- `home_banner_for_region(...)` — salt okuma, `anon` dahil herkese açık.
  Ana sayfa giriş yapılmadan da çizilebilmeli.

## Bakım kuralları

1. Yeni durum-değiştiren admin RPC'si eklerken **mutlaka** `require_admin_role(...)` ile başlat ve bu belgeye ekle.
2. Var olan bir RPC'yi güncellerken kapıyı koru (sarmalayıcı deseninde `__core`'u düzenle).
3. Tüm admin RPC'lerinden `PUBLIC, anon` EXECUTE izni alınır; yalnız `authenticated`'a verilir.
4. CI, bu envanteri kod ile karşılaştıran bir lint kapısıyla ileride sıkılaştırılabilir (Soru 16 kalanı).
