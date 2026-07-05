# 🧭 Supabase Migration Defteri — Uzlaştırma (Reconciliation) Raporu

> **Tarih:** 2026-07-05 · **Proje:** OYNA (`iikvzgyccvgcybzdfwlv`) · Postgres 17.6 · `ap-southeast-1`
> **Durum:** Üretim **sağlıklı ve eksiksiz**; sorun yalnızca migration **defter kaydında** (bookkeeping).
> Bu belge tek güncel kaynaktır.

---

## 1. Özet (yöneticiler için, tek paragraf)

OYNA veritabanı **çalışıyor ve içerik olarak eksiksiz** — tüm tablolar, fonksiyonlar ve
güvenlik kuralları üretimde mevcut. Sorun şu: değişikliklerin tutulduğu **"inşaat defteri"**
(`supabase/migrations/` klasörü) ile veritabanının kendi tuttuğu **resmî kayıt**
(`schema_migrations`) zamanla birbirinden ayrı düştü. Bu, günlük çalışmayı bozmaz ama
**felaket-kurtarma / birebir kopya kurma** yeteneğini riske atar. Bu belge sorunu, kanıtları,
şimdiye kadar yapılanları ve **tek komutluk kalıcı çözümü** anlatır.

---

## 2. Rakamlarla drift

| Ölçüt | Değer |
|-------|-------|
| Canlı defterde kayıtlı migration (`schema_migrations`) | **184** (v20260606112849 … v20260705180150) |
| Her kaydın uygulanan gerçek SQL'i saklı mı? | **Evet — 184/184** (`statements[]` dolu) |
| Repo'daki migration dosyası (temizlik öncesi) | ~148 |
| İsim eşleşmeyen (repo'da var, defterde yok) | 23 |
| İsim eşleşmeyen (defterde var, repo'da yok) | 60 |
| **Sonuç** | Repo, üretimi **birebir yeniden kuramaz** (DR/staging kırık) |

**Kök neden:** Migration'lar zaman zaman MCP `apply_migration` / doğrudan SQL ile uygulanıp
repo'ya dosya olarak yazılmadı; ayrıca repo dosyaları bir noktada yeniden adlandırıldı/
konsolide edildi ama canlı defter orijinal uygulama kayıtlarını korudu. Drift **hâlâ aktif**:
en yeni defter kaydı `password_reset_codes` **bugün** (2026-07-05) uygulandı ve repo'da yoktu.

---

## 3. Üretim eksiksiz — kanıt

Aşağıdaki nesnelerin hepsi canlı DB'de **mevcut** olarak doğrulandı (repo'da karşılık dosyası
olmasa bile içerik üretimde var):

- Çekirdek: `profiles`, `matches`, `pitches`, `pitch_bookings`, `courts`, `goalkeepers`,
  `wallet_transactions`, `communities` → ✅
- RPC'ler: `process_tiered_refund`, `get_nearby_matches`, slot satın-alma/atama fonksiyonları → ✅
- Config: `verification_sla_hours = 48`, exclusion (çakışma önleme) constraint → ✅
- **RLS kapsamı: 80/80 public tablo** — hepsinde RLS açık, politikasız (kilitli) tablo yok → ✅
- Güvenlik danışmanı (advisor): **0 ERROR** seviyesi bulgu → ✅

> Yani drift bir **defter/kayıt** sorunudur, **eksik özellik** sorunu değildir.

---

## 4. Güvenli geri-dönüş noktası (restore point)

Herhangi bir uzlaştırma öncesinde canlı defterin tam yedeği alındı:

```
supabase_migrations.schema_migrations_backup_20260705   -- 184 satır (execute_sql ile, migration olarak kaydedilmedi)
```

Gerektiğinde defter bu tablodan geri yüklenebilir. (İş bitince istenirse düşürülebilir.)

---

## 5. Bu oturumda YAPILANLAR (kalıcı, commit'li)

1. **8 gerçekten-eksik migration repo'ya kurtarıldı** — üretimde olup repo'da hiç olmayan
   NET-YENİ özellikler. Her biri **MD5 ile birebir doğrulandı** (defterdeki SQL'e byte-byte eşit):

   | version | ad | ne getirir |
   |---------|-----|-----------|
   | 20260625214035 | `faz1_add_chat_messages_column` | `matches.chatMessages` kolonu + index'ler |
   | 20260625233459 | `faz4_rls_security_hardening` | `admin_fetch_matches` anon erişimini kaldırır (kritik) |
   | 20260627214637 | `match_slot_multibuy_and_gifting` | çoklu-slot satın alma + arkadaşa atama alanları |
   | 20260628132905 | `faz9_gk_assign_fix2` | kaleci atama RPC sağlamlaştırma |
   | 20260703072311 | `oauth_signin_roles_seed` | Google/Apple girişinde `roles` jsonb doldurma |
   | 20260703124606 | `user_reports` | kullanıcı şikâyet/moderasyon tablosu + RLS |
   | 20260703124630 | `pitch_ratings` | saha puanlama tablosu + `submit_pitch_rating` RPC |
   | 20260705180150 | `password_reset_codes` | şifre sıfırlama kodu tablosu + temizleme fonksiyonu |

2. **2 boş (0-byte) migration dosyası silindi** (defterde yok, tamamen gürültü):
   `20260603163744_consolidate_user_tables_and_security.sql`,
   `20260615115610_godview_platform_foundation.sql`.

3. **`payment-webhook` edge function canlıya alındı** (ayrı iş — bkz. OYNA_OPERASYONEL_DURUM).

---

## 6. KALICI ÇÖZÜM — tek komut (bir geliştiricinin bir kez çalıştırması yeterli)

Defter, her migration'ın gerçek SQL'ini sakladığı için repo'yu **kaynağın kendisinden**
(canlı defter) birebir yeniden üretebiliyoruz. Araç yazıldı:

```
scripts/regenerate-migrations-from-ledger.mjs
```

**Neden burada (bu ortamda) tamamlanmadı?** Bu bulut oturumunda Supabase CLI yok, `pg_dump 16`
Postgres 17 sunucusunu alamaz ve DB parolası ortamda güvenlik gereği yok. Tam yeniden-üretim,
DB'ye doğrudan bağlantı ister; bu yüzden **kimlik bilgisine sahip bir geliştirici** tarafından
çalıştırılacak turnkey (hazır) bir araç olarak paketlendi.

### Çalıştırma (adım adım)
```bash
npm i -D pg
# Supabase Dashboard → Project Settings → Database → Connection string (URI):
export SUPABASE_DB_URL="postgresql://postgres:[PAROLA]@db.iikvzgyccvgcybzdfwlv.supabase.co:5432/postgres"

# 1) Önce prova (hiçbir şey yazmaz, ne yapacağını gösterir):
node scripts/regenerate-migrations-from-ledger.mjs

# 2) Gerçekten uygula (eski dosyalar migrations_archive_<tarih>/ altına taşınır):
node scripts/regenerate-migrations-from-ledger.mjs --confirm

# 3) İncele ve commit et:
git add -A supabase/ && git status
git commit -m "chore(db): migration klasörünü canlı defterden birebir yeniden üret"

# 4) Doğrula (drift kalmadı):
supabase db push        # "no changes" / "Remote database is up to date" demeli
```

Bu çalıştırıldığında `supabase/migrations/` = canlı defter = üretimin gerçek geçmişi olur;
`db reset` boş bir DB'de üretimin aynısını kurar. **Drift biter.**

> Alternatif (CLI'niz varsa): `supabase db pull` şema anlık görüntüsü üretir; ancak
> ledger-mirror (yukarıdaki script) uygulanan geçmişi birebir korur ve tercih edilir.

---

## 7. Bir daha bozulmaması için (tek kural)

> **Her veritabanı değişikliği hem uygulanır HEM de aynı anda repo'ya migration dosyası olarak
> yazılır — ikisi ayrılmaz.** MCP `apply_migration` veya doğrudan SQL ile "hızlı" değişiklik
> yapıp dosyayı unutmak, driftin tek kaynağıydı.

Öneri: değişiklikleri yalnız `supabase/migrations/` dosyaları + `supabase db push` ile uygula;
acil MCP müdahalesi olduysa aynı gün `regenerate-migrations-from-ledger.mjs` ile senkronla.

---

## 8. Ek — repo'da dosyası olmayan 60 defter kaydı (regen bunları da geri getirir)

Büyük kısmı erken/konsolide edilmiş migration'ların yeniden-timestamp'lenmiş halleridir;
içerikleri üretimde mevcuttur. Tam liste (regen script hepsini birebir üretir):

`owner_occupancy_single_source`, `owner_occupancy_harden_function_grants`,
`owner_occupancy_drop_public_bookings_policy`, `fix_update_player_diamond_target_and_auth`,
`join_match_slot_auth_check`, `revoke_anon_from_sensitive_rpcs`,
`wallet_constraint_and_search_path_hardening`, `add_missing_foreign_key_indexes`,
`revoke_public_grant_explicit_roles`, `block1_remaining_function_hardening`,
`create_public_profiles_view`, `roles_phase1_security_foundation`,
`fix_owner_module_slot_range_and_drop_court_availability`, `harden_slot_range_trigger_search_path`,
`roles_phase2_profiles_and_check`, `roles_phase2c_policy_standardization`,
`roles_phase3_hardening`, `roles_phase3_fix_anon_execute`, `fix_notifications_insert_rls_spoofing`,
`optimize_rls_initplan_auth_uid`, `consolidate_multiple_permissive_policies`,
`economy_phase5_hardening`, `owner_demo_seed_function`, `fix_owner_demo_seed_court_types`,
`godview_platform_foundation_a/b/c`, `owner_cancel_rpc_revoke_anon`, `godview_phases_456_tables`,
`godview_phases_456_dashboard`, `godview_complete_system_policies/functions/demo`,
`module_demo_purge_fn`, `module_demo_seed_fn`, `harden_verification_view_grants`,
`align_profiles_role_constraints_with_app_roles`, `match_slot_multibuy_and_gifting`*,
`player_multislot_buy_assign_claim_rpcs`, `harden_player_slot_rpcs_revoke_public`,
`faz9_gk_assign_fix2`*, `lobi_faz0_fetch_matches_fix_refid`, `oauth_signin_roles_seed`*,
`user_reports`*, `pitch_ratings`*, `faz1_add_chat_messages_column`*, `faz4_rls_security_hardening`*,
`get_nearby_matches_canonical_open_status`, `admin_pitch_studio_update_owner`,
`admin_redesign_revoke_anon`, `audit_hash_chain_fix_digest_schema`, `audit_hash_trigger_revoke_anon`,
`password_reset_codes`* (ve diğer re-timestamp kayıtları).

`*` = bu oturumda repo'ya elle kurtarıldı (Bölüm 5).
