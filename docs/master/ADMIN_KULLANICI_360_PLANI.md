# Admin Panel — "Kullanıcı 360" Geliştirme Planı

> Durum: 📋 PLANLANDI (henüz uygulanmadı) · Tarih: 2026-07-16
> Kaynak: Kod taraması (admin UI + oyuncu uygulaması) + CANLI prod DB incelemesi (iikvzgyccvgcybzdfwlv).
> Amaç: Kullanıcı düzenleme ekranını iki mercekle yeniden kurmak —
> **Uygulama Görünümü** (admin, oyuncunun uygulamada gördüğünü birebir görür/düzenler)
> ve **Operasyonel** (tüm moderasyon aksiyonları sebepli + audit'li RPC'lerle).

---

## 1. Mevcut Durum Özeti

### 1.1 Admin UI bugün ne yapabiliyor?
- `UsersPage.tsx` — sunucu sayfalamalı liste (`admin_fetch_profiles`), rol/durum filtreleri,
  satır aksiyonları: 360 drawer, Düzenle, Ban/Unban, Doğrula, satır-içi kart tier seçimi, Ghost, Sil.
- `User360Drawer.tsx` — SALT-OKUNUR: maskeli PII (+audit'li `admin_reveal_pii`), cüzdan son 15 hareket,
  admin işlem geçmişi. Düzenleme yok (bilinçli tasarım: "yeni yetki yolu açılmaz").
- `DeepEditModals.tsx → DeepEditUserModal` — avatar, isim, telefon, rol (tekil), maç sayısı,
  FIFA kart stat slider'ları + tier, cüzdan (mutlak yazım!), cardActive/isVerified/isBanned toggle'ları.
- `AddUserModal.tsx` — `admin-create-user` edge fn ile hesap açma.

### 1.2 Oyuncu uygulaması profili neyi gösteriyor? (uygulama görünümü hedefi)
| Alan | Kaynak | Not |
|---|---|---|
| İsim, avatar, pozisyon, bio, ayak | `profiles.full_name/avatar_url/position/bio/preferred_foot` | Oyuncu kendisi düzenleyebiliyor |
| Yaş | `birthdate`'ten hesap | Ham tarih client'ta |
| Doğrulanmış rozeti | `verification_status='approved'` | Admin'de yalnız `is_verified` bool'u var |
| Güven Puanı (0–100 gösterim) | `trust_score` (0–5) × 20 | Server bakımlı (no-show'da −0.5) |
| Fair-play (lobi kartı) | `reliability_score` (0–100) | AYRI kolon, ayrı skala! |
| Maç sayısı / galibiyet | `matches` tablosundan hesap | `match_count` kolonundan FARKLI |
| Cüzdan | `wallet_balance` | Ledger: `wallet_transactions` (bucket'lı) |
| FIFA kart | `card_active`, `card_tier`, `player_card` jsonb | buildCardData fallback'li |
| Onboarding | `age_range, gender, play_style, is_minor, guardian_consent_status` | Ödeme kapısını besliyor |

### 1.3 Canlı DB gerçeği
- `profiles` = 60+ kolon; canlı `admin_update_user_profile__core` bunların yalnız 13'ünü yazabiliyor:
  `full_name, email(maske korumalı), phone(maske korumalı), avatar_url, role(+roles), is_verified,
  is_pro, wallet_balance, match_count, rating, player_card(merge), card_tier, card_active`.
- Canlıda HAZIR ama UI'sız RPC'ler: `admin_adjust_wallet_balance` (❗repo'da göçü YOK),
  `admin_toggle_user_pro`, `admin_set_player_card_data`, `admin_upsert_user_profile`.

---

## 2. Kritik Bulgular (Faz 0'ın gerekçesi)

| # | Bulgu | Kanıt | Etki |
|---|---|---|---|
| B1 | `admin_fetch_profiles` RPC'si `card_active/card_tier` DÖNDÜRMÜYOR; `mapProfileRow` yine de okuyor → herkes "KART KAPALI" görünüyor | RPC: `20260713000000` · map: `adminService.ts:116-117` | Listede yanlış kart durumu; satır-içi tier seçimi yanıltıcı |
| B2 | `roles[]` EZME: `__core` role yazıldığında `roles = jsonb_build_array(role)` → çoklu-rol (PLAYER+OWNER) kullanıcı rol kaybediyor | canlı `__core` gövdesi | Herhangi bir profil kaydı rol siler — veri kaybı |
| B3 | Cüzdan MUTLAK YAZIM: modal `wallet_balance`'ı ezer, ledger'a satır yazmaz → `_wallet_bucket_balances`/`_sync_wallet_mirror` bucket sistemiyle DESENKRON | `DeepEditModals.tsx:330-343` + `buildUserProfilePayload` | Mali tutarsızlık riski; audit izi yok |
| B4 | PII SIZINTISI: RPC düşünce fallback ham `email, phone` çekiyor (maskesiz) — KVKK Karar #39'a aykırı | `adminService.ts:308-341` | Uyumluluk ihlali |
| B5 | `admin_adjust_wallet_balance` canlıda var (FINANCE kapısı, zorunlu sebep, ±50k limit, ledger + audit) ama repo göçünde YOK ve hiçbir UI çağırmıyor | canlı fn tanımı | Doğru araç hazır, kullanılmıyor; repo/canlı sapması |
| B6 | Ban RPC'si `p_expires_at, p_reason` destekliyor; UI hiçbirini sormuyor | `store.ts:1099-1114` | Sebepsiz/süresiz ban — operasyonel izlenebilirlik zayıf |
| B7 | Drawer "güvenilirlik" değeri `rating*20` ile UYDURULUYOR; gerçek `reliability_score` ve `trust_score` hiç gösterilmiyor | `User360Drawer.tsx:115` | Yanlış metrik gösterimi |
| B8 | `buildUserProfilePayload` `stats` anahtarı gönderiyor; RPC hiç okumuyor (ölü yük) | `adminService.ts:2402-2404` | Payload/RPC sapması |

---

## 3. Fazlar

### Faz 0 — Kritik veri-sadakati düzeltmeleri 🔴 (düşük efor, acil)
1. **Göç:** `admin_fetch_profiles`'a `card_active, card_tier, position, bio, trust_score,
   reliability_score, verification_status` ekle (CANLI gövde okunarak — drift kuralı!). `mapProfileRow` + `AdminUser` tipini eşle.
2. **Göç:** `__core` roles-ezme fix'i — `role` yazımı `roles` dizisini ezmesin; `roles` ayrı opsiyonel anahtar olsun.
3. **UI:** DeepEditUserModal'dan mutlak cüzdan yazımını KALDIR; `buildUserProfilePayload`'dan `wallet_balance` çıkar.
4. **Repo hijyeni:** canlı `admin_adjust_wallet_balance` tanımını repo göçü olarak kaydet (idempotent CREATE OR REPLACE).
5. **UI:** fetch fallback'inde email/phone'u client-side maskele.
6. Temizlik: ölü `stats` payload anahtarı.

### Faz 1 — RPC genişletme (uygulama alanları) 🟠 (~1 göç)
`admin_update_user_profile__core`'a ekle: `position, bio, birthdate, preferred_foot, age_range,
gender, play_style` (hepsi `CASE WHEN p_payload ? '...'` kalıbıyla; mevcut check constraint'lere uyum:
age_range ∈ 13-17/18-23/24-30/31-40/41-50/51+, gender ∈ kadin/erkek, play_style ∈ ciddi/taktiksel/rahat,
preferred_foot ∈ SAG/SOL/CIFT). `trust_score`/`reliability_score` düz update edilmez (server bakımlı) — yalnız gösterim.

### Faz 2 — Düzenleme modalı: sekmeli "uygulama aynası" 🟠 (ana iş)
- **Sekme 1 PROFİL:** avatar (ImageCropModal ile kırpma), isim, pozisyon (app enum'ları), bio,
  doğum tarihi, ayak, yaş aralığı/cinsiyet/oyun stili. Sağda uygulamadaki ProfileHero'nun birebir
  canlı önizlemesi (mevcut FifaCard önizleme kalıbı gibi).
- **Sekme 2 OYUNCU KARTI:** mevcut stat slider'ları + tier; kayıt `admin_set_player_card_data`
  RPC'sine taşınır (canlıda hazır, daha zengin).
- **Sekme 3 OPERASYON:** rol + roles çoklu seçim, PRO toggle (`admin_toggle_user_pro`),
  doğrulama, sebep + süre soran ban akışı (RPC zaten destekliyor).
- **Sekme 4 CÜZDAN:** bakiye + sebepli yükle/düş formu (`admin_adjust_wallet_balance`,
  FINANCE|SUPER_ADMIN görünürlüğü) + son hareketler.

### Faz 3 — User360Drawer operasyonel derinleştirme 🟡
- Sekmeler: Genel / Cüzdan / Maç geçmişi / Şikayetler (`user_reports` — ettiği + aldığı,
  USER_REPORTS sayfasına link) / Veli durumu (`is_minor`, `guardian_consent_status`) / Audit.
- `trust_score` (0–5) ve `reliability_score` (0–100) AYRI, doğru skalalarla (B7 fix).
- SUPER_ADMIN'e drawer'dan platform-rol kısayolu (ACL sayfasına yönlendirme).

### Faz 4 — Opsiyonel 🟢
- Shadow-ban / mute: `profiles`'a kolon YOK (types.ts'te alan var) → göç + RPC + UI gerekir.
- Admin e-posta değişikliği: auth-level edge function gerekir (bilinçli olarak kapalı — Karar).
- Realtime: `useAdminRealtimeBadges` zaten `profiles`'ı izliyor; kullanıcı listesi anlık tazeleme eklenebilir.

---

## 4. Uygulama Kuralları (bu repo için kritik)
1. **Canlı-öncelik:** Davranış değiştiren her RPC göçü, canlı `pg_get_functiondef` çıktısı okunarak
   onun üzerine yazılır (repo kopyası körlemesine uygulanmaz — ADMIN_PANEL_KARARLAR uyarısı;
   bu oturumda `ref_id` ve dashboard drift'i böyle yakalandı).
2. **RBAC deseni:** davranış `__core`'da değişir; `require_admin_role` sarmalayıcıları dokunulmaz.
3. Her aksiyon `log_admin_action` ile audit'lenir; yeni aksiyon kodları `AuditLogPage.ACTION_LABELS`'a eklenir.
4. Her faz sonunda: `tsc` 0 hata + 233 birim testi + build + prod'a `apply_migration` + advisor kontrolü.

## 5. Kabul Kriterleri (özet)
- Listedeki kart/pozisyon/doğrulama bilgisi DB ile birebir (B1 kapandı).
- Çoklu-rol kullanıcıda profil kaydı rol kaybettirmiyor (B2 kapandı).
- Admin cüzdan değişikliği yalnız ledger'lı RPC'den; `wallet_transactions`'ta `ADMIN_ADJUST` satırı oluşuyor (B3/B5 kapandı).
- Oyuncunun uygulamada gördüğü her profil alanı admin'den görülebilir/düzenlenebilir (Faz 1+2).
- Ban her zaman sebep (+opsiyonel süre) ile atılıyor ve audit'te okunur şablonla görünüyor (B6 kapandı).
