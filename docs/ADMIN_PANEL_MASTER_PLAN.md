# OYNA OS — Admin Panel Tam Kontrol Master Planı

> **Amaç:** Admin web panelinden uygulamanın tam operasyonel kontrolünü sağlamak.  
> **Durum:** Analiz tamamlandı — 10 adımlık uygulama planı.  
> **Son güncelleme:** 2026-06-18

---

## Mevcut Durum Özeti

Panel **iki katmanlı** çalışıyor:

| Katman | Modüller | Durum |
|--------|----------|-------|
| **Yeni (DB/RPC)** | Finans, İhtilaflar, Komuta Merkezi, Topluluklar, Promo, ACL, CMS, Kampanyalar | Büyük ölçüde çalışır |
| **Eski (Store + Mock)** | Kullanıcılar, Sahalar, Maçlar, Kaleci/Hakem | `constants.ts` mock fallback; doğrudan Supabase yazımı; audit RPC bypass |

### Kritik Sorunlar (işe yaramayan / yanıltıcı)

1. **Mock veri flash** — DB yüklenemezse `PITCHES`, `MATCH_LISTINGS` vb. gösterilir; hata UI yok
2. **Yavaş boot** — Giriş öncesi tüm veri yüklenir; 3–4s timeout'lar sessizce başarısız olur
3. **Embedded admin eksik bootstrap** — `AdminPanel.tsx` `initApp` çağırmaz; saha/maç mock kalır
4. **Ban/silme audit bypass** — `admin_ban_user` / `admin_process_account_deletion` RPC'leri UI'da kullanılmıyor
5. **Sahte kullanıcı oluşturma** — `AddUserModal` rastgele ID üretir; Auth kaydı yok
6. **Ghost mode kısmi** — `?ghost=userId` sadece local state; `logImpersonation` çağrılmıyor
7. **Dashboard sahte metrikler** — Gelir grafiği `adminMatches.length * 1500` heuristiği
8. **ACL revoke yok** — Rol verilebilir, geri alınamaz
9. **Orphan UI** — `MatchNotifTabs.NotificationsTab` route'a bağlı değil
10. **Playwright smoke only** — 2 test; operasyonel E2E yok

---

## 10 Adımlık Uygulama Planı

### Adım 1 — Veri Bütünlüğü & Birleşik Bootstrap ✅ (uygulanıyor)

**Hedef:** Admin panelde tek veri kaynağı = Supabase DB. Mock fallback kaldırılır.

**Yapılacaklar:**
- [x] `bootstrapAdminPlatform()` — standalone + embedded ortak yükleme
- [x] Giriş öncesi yalnızca oturum kontrolü (veri yükleme sonraya)
- [x] `clearAdminMockState()` — boot başında mock temizleme
- [x] Timeout'larda hata fırlatma (sessiz null dönme yok)
- [x] Boot hata ekranı + yeniden dene butonu
- [x] `setAdminInventoryData()` — saha/maç/takım/GK/hakem DB'den

**Dosyalar:** `services/adminBootstrap.ts`, `AdminApp.tsx`, `views/admin/AdminPanel.tsx`, `store.ts`, `views/admin/AdminBootShell.tsx`

**Başarı kriteri:** Admin girişinden sonra tüm envanter sayfaları DB verisi gösterir; mock flash yok; hata durumunda kullanıcı bilgilendirilir.

---

### Adım 2 — Denetimli Kritik İşlemler (Ban, Silme, Ayarlar)

**Hedef:** Tüm yıkıcı admin aksiyonları audited RPC üzerinden geçsin.

**Yapılacaklar:**
- [ ] `DeepEditModals` ban toggle → `banUserAdmin` RPC
- [ ] `UsersPage` silme → `admin_process_account_deletion` RPC
- [ ] `store.updateUser` ban path → RPC'ye yönlendir
- [ ] `settingsToDbPayload` → `payoutMode` dahil tüm alanlar
- [ ] Audit log'da gerçek `adminId` (session'dan), `'ADMIN_CURRENT'` kaldır

**Dosyalar:** `DeepEditModals.tsx`, `UsersPage.tsx`, `store.ts`, `services/adminService.ts`

**Başarı kriteri:** Ban ve hesap silme `admin_audit_log`'a düşer; doğrudan `profiles` DELETE yok.

---

### Adım 3 — Kullanıcı Oluşturma & Profil Yönetimi

**Hedef:** Admin panelden oluşturulan kullanıcılar gerçek Auth + profile kaydı olsun.

**Yapılacaklar:**
- [ ] `admin_create_user` RPC (veya edge function) — Auth + profiles insert
- [ ] `AddUserModal` → RPC çağrısı; rastgele ID kaldır
- [ ] Kullanıcı listesi pagination (500 limit kaldır)
- [ ] PRO/ban/verify işlemleri tek modal akışında

**Başarı kriteri:** Yeni kullanıcı oluşturulunca giriş yapılabilir; listede görünür.

---

### Adım 4 — Ghost Mode & Impersonation

**Hedef:** Admin, kullanıcı adına consumer app'i inceleyebilsin; işlem denetlenebilir olsun.

**Yapılacaklar:**
- [ ] `App.tsx` ghost handler → hedef profil fetch + `logImpersonation` RPC
- [ ] `CommandCenterPage` ghost arama → profil önizleme paneli
- [ ] Ghost banner consumer app'te görünür kalsın
- [ ] Dokümantasyon: gerçek auth swap değil, read-only impersonation

**Başarı kriteri:** Ghost link tıklanınca audit log'a düşer; hedef kullanıcı profili yüklenir.

---

### Adım 5 — ACL Tam Yetki (Grant + Revoke)

**Hedef:** Platform admin rolleri tam yönetilebilir olsun.

**Yapılacaklar:**
- [ ] `admin_revoke_platform_role` RPC (migration)
- [ ] `ACLPage` → üye kaldırma / rol düşürme UI
- [ ] Sidebar ACL badge düzeltmesi (deletion_requests sayısı kaldır)
- [ ] `adminSession` avatar/sidebar'da gerçek admin bilgisi

**Başarı kriteri:** Verilen admin rolü geri alınabilir; sidebar doğru badge gösterir.

---

### Adım 6 — Finans Modülü Tamamlama

**Hedef:** Finans sayfası tüm para akışını göstersin.

**Yapılacaklar:**
- [ ] Ledger'da `user_id` → profil adı çözümleme
- [ ] `owner_billing_events` tablosu UI sekmesi
- [ ] Export CSV (ledger + payments)
- [ ] Pagination (80–100 limit artırımı)

**Başarı kriteri:** Finans sayfasında isimler görünür; owner billing events okunabilir.

---

### Adım 7 — Dashboard Gerçek Metrikler

**Hedef:** Genel bakış sayfası sahte heuristik yerine RPC verisi kullansın.

**Yapılacaklar:**
- [ ] Gelir grafiği → `admin_finance_stats` / `admin_fetch_booking_payments`
- [ ] Tarih filtresi düzeltmesi (`date.includes` kaldır)
- [ ] KPI kartları → `admin_dashboard_stats` (zaten kısmen var)
- [ ] Mock maç sayısına bağlı hesaplamalar kaldır

**Başarı kriteri:** Dashboard rakamları finans RPC ile tutarlı.

---

### Adım 8 — Canlı Operasyon (Realtime & Konsolidasyon)

**Hedef:** Komuta merkezi ve pazarlama modülleri operasyonel hız kazansın.

**Yapılacaklar:**
- [ ] `CommandCenterPage` → Supabase realtime veya 30s poll
- [ ] `CampaignsPage` + `SegmentationPage` birleştirme (tek sayfa: önizleme + gönder)
- [ ] `CommandPalette` → tüm route'lar (FINANCE, DISPUTES, ACL, PROMO)
- [ ] Orphan `NotificationsTab` kaldır veya legacy route'a taşı

**Başarı kriteri:** Komuta merkezi kuyruk otomatik güncellenir; tek kampanya sayfası var.

---

### Adım 9 — Sahalar & Maçlar DB-First CRUD

**Hedef:** Legacy store CRUD'u audited admin RPC'lere taşı.

**Yapılacaklar:**
- [ ] Saha oluşturma/güncelleme → `admin_moderate_pitch` veya dedicated RPC
- [ ] Maç CRUD → `matches` tablosu şema uyumu (slots UI-only ayrımı)
- [ ] `PitchesPage` / `MatchesPage` doğrudan sayfa-local fetch (store bypass opsiyonel)
- [ ] Demo seed paneli yalnızca dev ortamında

**Başarı kriteri:** Saha/maç değişiklikleri audit log'a düşer; şema uyumsuzluğu yok.

---

### Adım 10 — E2E Test & Production Checklist

**Hedef:** Regresyon koruması ve deploy güvenilirliği.

**Yapılacaklar:**
- [ ] Playwright: login → her modül navigasyon → kritik aksiyon assert
- [ ] CI'da `npm run test:admin` gate
- [ ] `ADMIN_DEPLOY_CHECKLIST.md` — migration, RPC, env değişkenleri
- [ ] `VITE_ADMIN_DEV_BYPASS` kaldır veya gerçek dev-only bypass (opsiyonel)

**Başarı kriteri:** CI green; deploy öncesi checklist tamamlanır.

---

## Uygulama Sırası & Bağımlılıklar

```
Adım 1 (Bootstrap) ──► Adım 2 (Audit RPC) ──► Adım 3 (User create)
        │                      │
        └──────────────────────┴──► Adım 7 (Dashboard)
Adım 4 (Ghost) ──► Adım 5 (ACL)
Adım 6 (Finance) ──► Adım 7
Adım 8 (Realtime) ── bağımsız
Adım 9 (CRUD) ──► Adım 2'ye bağlı
Adım 10 (E2E) ── tüm adımlar sonrası
```

---

## İlerleme Takibi

| Adım | Başlık | Durum |
|------|--------|-------|
| 1 | Veri Bütünlüğü & Bootstrap | ✅ Tamamlandı |
| 2 | Denetimli Kritik İşlemler | ✅ Tamamlandı |
| 3 | Kullanıcı Oluşturma | ✅ Tamamlandı |
| 4 | Ghost Mode | ✅ Tamamlandı |
| 5 | ACL Tam Yetki | ✅ Tamamlandı |
| 6 | Finans Tamamlama | ✅ Tamamlandı |
| 7 | Dashboard Gerçek Metrikler | ✅ Tamamlandı |
| 8 | Canlı Operasyon | ✅ Tamamlandı |
| 9 | Sahalar & Maçlar CRUD | ✅ Tamamlandı |
| 10 | E2E & Deploy | ✅ Tamamlandı (6 smoke test) |

---

## Son Cila (2026-06-18)

- Command palette: tüm route'lar + kategori grupları
- Audit log: admin adı, arama, aksiyon filtreleri
- Dashboard: gerçek trend sparkline, boş grafik uyarısı, yükleme durumu
- Finans: billing CSV, tab araması, RPC uyarı bandı
- ACL: ConfirmDialog + aranabilir kullanıcı seçici
- Boot: hata sonrası oturum korunur, yeniden dene
- TopBar: bildirim zili → Komuta Merkezi (ops sayacı)

**Kalan (deploy sonrası):** `npm run admin:deploy` — remote RPC migration
