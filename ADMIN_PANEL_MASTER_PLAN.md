# OYNA Admin Paneli — Canlıya Çıkış Master Planı

> **Amaç:** Admin panelini canlıya çıkışta kusursuz çalışan, veritabanından %100 gerçek
> veriyle beslenen, bilgisayardan bağımsız yönetilebilen, "milyar dolarlık" kalitede bir
> operasyon merkezi haline getirmek.
>
> **Bu belge nasıl hazırlandı:** Kod tabanının tamamı (admin-panel/, supabase/functions/,
> supabase/migrations/, ana uygulama görselleri) satır satır analiz edildi; canlı Supabase
> projesi (`OYNA`, `iikvzgyccvgcybzdfwlv`) üzerinden deploy edilmiş edge fonksiyonları ve
> 346 güvenlik denetim bulgusu doğrulandı. Aşağıdaki her bulgu dosya:satır referanslıdır.
>
> **Tarih:** 2026-07-17

---

## İÇİNDEKİLER

- [Bölüm 0 — Yönetici Özeti: En Kritik 10 Bulgu](#bölüm-0)
- [Bölüm 1 — Veritabanı Beslenmesi: Mevcut Durum Analizi](#bölüm-1)
- [Bölüm 2 — Edge Fonksiyonları: Envanter, Sorunlar ve Çözüm Planı](#bölüm-2)
- [Bölüm 3 — Fotoğraf Yükleme: Oran Zorunluluğu + Kırpma Fonksiyonu Planı](#bölüm-3)
- [Bölüm 4 — UI/UX: Milyar Dolarlık Panel Tasarım Planı](#bölüm-4)
- [Bölüm 5 — Bilgisayardan Yönetim: Standalone Dağıtım Planı](#bölüm-5)
- [Bölüm 6 — Güvenlik Sertleştirme (Canlı DB Denetim Bulguları)](#bölüm-6)
- [Bölüm 7 — Operasyonel Süreçler: Basitleştirirken Güçlendirme](#bölüm-7)
- [Bölüm 8 — Uygulama Yol Haritası: Fazlar, Sıra ve Kabul Kriterleri](#bölüm-8)

---

<a id="bölüm-0"></a>
## BÖLÜM 0 — YÖNETİCİ ÖZETİ: EN KRİTİK 10 BULGU

| # | Bulgu | Önem | Bölüm |
|---|-------|------|-------|
| 1 | `auto-cancel-matches` edge fonksiyonu repo'da var ama **canlıda deploy edilmemiş**; cron kurulumu GUC ayarlanmadıysa **sessizce devre dışı** | 🔴 Blocker | 2 |
| 2 | Panelde **hiçbir yerde fotoğraf kırpma / oran zorlaması yok**; kapak fotoğrafları uygulamada yatay (≈16:7), panelde dikey (3:4) gösteriliyor — özneler kesiliyor | 🔴 Blocker | 3 |
| 3 | `imageCompression.ts` **EXIF yönünü işlemiyor** → telefonla çekilen dikey fotoğraflar yan dönmüş kaydediliyor | 🔴 Blocker | 3 |
| 4 | Canlı DB'de **1 kritik güvenlik hatası** (`public_profiles` SECURITY DEFINER view) + **12 anon-erişimli SECURITY DEFINER fonksiyon** + sızmış parola koruması kapalı | 🔴 Blocker | 6 |
| 5 | Finans/dashboard RPC'leri hata verirse panel **sessizce sıfır/boş veri** gösteriyor — patron "bugün ciro 0₺" sanabilir | 🟠 Yüksek | 1 |
| 6 | `supabaseClient.ts:11-13` içine **prod URL + anon key gömülü** — yanlışlıkla eski build bile prod'a bağlanır; panel taşınırken bilinçli yönetilmeli | 🟠 Yüksek | 5 |
| 7 | Çoğu liste sayfasında **sayfalama yok** (sabit 50/100 limit) → kayıt sayısı büyüyünce veriye erişilemez | 🟠 Yüksek | 4 |
| 8 | `capture/void/refund-payment` + `send-email` + `admin-broadcast` edge fonksiyonları **hiçbir yerden çağrılmıyor** (ölü kod / go-live'da devreye alınmamış) | 🟠 Yüksek | 2 |
| 9 | Pitch payload'ına **sabit Ordu koordinatları (40.98, 37.87) ve uydurma 4.5 puan** yazılıyor; Unsplash stok görseli fallback | 🟠 Yüksek | 1 |
| 10 | MFA zorunluluğu `admin_mfa_required` **varsayılan false (fail-open)**; toplu işlem, klavye navigasyonu, tablo sıralama yok | 🟡 Orta | 4, 6 |

---

<a id="bölüm-1"></a>
## BÖLÜM 1 — VERİTABANI BESLENMESİ: MEVCUT DURUM ANALİZİ

### 1.1 Genel Değerlendirme: Panel gerçek veriyle mi besleniyor? → **Evet, büyük oranda.**

Panel 100+ `admin_*` RPC'si üzerinden gerçek veritabanına bağlı (envanter:
`admin-panel/services/adminService.ts`). Mock veri bilinçli olarak gösterilmiyor:
`AdminBootShell.tsx:107` ("Mock veri gösterilmiyor") ve `store.ts:1163` (`clearAdminMockState`)
boot'ta tüm admin dizilerini sıfırlıyor. Dashboard ve Kontrol Merkezi **gerçek** RPC'lerden
besleniyor (`admin_dashboard_stats`, `admin_ops_queue`, `admin_fetch_revenue_trend`).

### 1.2 Tespit Edilen Sahte/Sabit Veri Noktaları (temizlenecek)

| Konum | Sorun | Çözüm |
|-------|-------|-------|
| `admin-panel/utils/pitchMapper.ts:13-17` | DB null ise uydurma `4.5` puan, `200₺` fiyat, Unsplash stok görseli | Null'u null olarak göster; "veri yok" rozeti; stok görsel yerine nötr placeholder |
| `adminService.ts:2115-2119, 2157-2161` | Payload'a sabit Ordu koordinatı + `4.5` google_rating yazımı | Koordinat zorunlu alan yap (harita pin seçici); rating hiç yazma |
| `admin-panel/views/layout/Sidebar.tsx:171` | `i.pravatar.cc` sahte admin avatarı (+ ui-avatars.com bağımlılıkları) | Gerçek profil avatarı; offline çalışan lokal harf-avatar üret |
| `admin-panel/utils/matchMapper.ts:93-113` | Görüntü fallback'leri (`'20:00'`, `7v7`, `İsimsiz Maç`) | Kabul edilebilir; sadece "—" gösterimiyle netleştir |

### 1.3 Sessiz Veri Düşüşü (silent degradation) — En Riskli Bağlantı Sorunu

RPC eksik/yetkisiz olduğunda panel hata yerine **boş/sıfır** gösteriyor:

- `countRows` her hatada `0` döner (`adminService.ts:543`)
- `fetchFinanceStats` → tümü sıfır `FinanceStats` (`adminService.ts:968-975`)
- `fetchBookingPayments`, `fetchRevenueTrend`, `fetchOwnerBillingEvents`,
  `fetchBroadcastCampaigns` → `[]`
- `loadAdminInventoryFromRpc` → her başarısız kaynak sessizce boş dizi + sarı uyarı

**Çözüm planı (P1):**
1. Her sayfaya **üç durumlu veri rozeti**: 🟢 canlı veri / 🟡 yedek okuma modu / 🔴 kaynak hatası.
   Sıfır değer ile "okunamadı" ASLA aynı görünmesin — `null` döndür, UI'da "—" + kırmızı rozet.
2. `AdminStatusBar`'ı genişlet: RPC sağlık taraması boot'ta tüm kritik RPC'leri
   (`admin_dashboard_stats`, `admin_finance_stats`, `admin_fetch_matches`, `admin_ops_queue`,
   `admin_fetch_payouts`) probe etsin; eksik olanları isim isim listelesin.
3. Legacy fallback'leri (`supabaseMutations` dinamik import'ları: `adminService.ts:1803, 2327,
   2384, 2397, 2410, 2423, 2629, 2641`) canlıya çıkışta **kaldır veya telemetriyle işaretle** —
   fallback'e düşmek bir migration'ın deploy edilmediğinin kanıtıdır, gizlenmemeli.

### 1.4 Doğrudan Tablo Erişimleri → RPC'ye Taşınacaklar

Panel bazı yerlerde RLS'e tabi doğrudan `from()` sorguları kullanıyor (`profiles`,
`admin_team_members`, `settings`, `admin_audit_log`, `wallet_transactions`, `communities`,
`teams`, `tournaments`, `promo_codes`, `service_requests`, `provider_identities`…).
Bunlar iki nedenle RPC'ye taşınmalı:
- RLS politikası değişince panel sessizce boş veri görür (ör. `listOwnerCandidatesAdmin`,
  `fetchTeamsFromDb` → RLS engellerse `[]`).
- `teams`/`tournaments` insert/delete işlemleri (`adminService.ts:1743-1773`) audit-log'suz.

**Yapılacak:** `admin_fetch_teams`, `admin_manage_team`, `admin_fetch_tournaments`,
`admin_manage_tournament` RPC'leri (audit log + rol denetimi içeride) + panelin bunlara geçişi.

### 1.5 Kurulabilecek Yeni Bağlantılar (öneri envanteri)

1. **Push teslimat gözlemi:** `push_log` tablosu var ama panelde ekranı yok →
   Kampanyalar sayfasına "teslimat raporu" sekmesi (`admin_fetch_push_log` RPC).
2. **Edge fonksiyon sağlığı:** `sweep-stale-payments` ve `auto-cancel-matches`'in son çalışma
   zamanı ve sonucu panelde görünmüyor → `cron_run_log` tablosu + Kontrol Merkezi'ne
   "Otomasyon Sağlığı" kartı (bkz. Bölüm 2.4).
3. **Ödeme mutabakatı:** `admin_reconciliation_summary` RPC'si çağrılıyor ama tek kart;
   iyzico canlıya geçince günlük mutabakat ekranı (intent ↔ iyzico kaydı eşleşmesi).
4. **Realtime kapsamı genişletme:** `useAdminRealtimeBadges` 6 tabloyu izliyor
   (`payout_requests`, `profiles`, `pitches`, `match_disputes`, `provider_applications`,
   `provider_identities`); `matches` (iptal/anlık durum) ve `payment_intents` (takılı ödeme)
   eklenmeli.
5. **Sistem konfig denetimi:** `admin_set_config` değişiklikleri audit'e düşüyor mu doğrula;
   Ayarlar sayfasına "son 10 konfig değişikliği" bloğu.

---

<a id="bölüm-2"></a>
## BÖLÜM 2 — EDGE FONKSİYONLARI: ENVANTER, SORUNLAR VE ÇÖZÜM PLANI

### 2.1 Envanter ve Canlı Durum Karşılaştırması

Repo'da 14 fonksiyon var; canlıda 13'ü deploy edilmiş. **`auto-cancel-matches` canlıda YOK.**

| Fonksiyon | Kimlik doğrulama | Çağıran | Canlıda? | Durum |
|-----------|------------------|---------|----------|-------|
| `admin-create-user` | Çağıran JWT + `is_platform_admin()` | Admin panel (`adminService.ts:1483`) | ✅ | Çalışıyor; rollback korumalı |
| `admin-broadcast` | `x-admin-secret` (fail-closed) | **Kimse** — panel RPC'yi doğrudan çağırıyor | ✅ | Ölü kod → karar gerekli |
| `auto-cancel-matches` | `Bearer WEBHOOK_SECRET` | pg_cron (5 dk) | ❌ **DEPLOY EDİLMEMİŞ** | 🔴 Blocker |
| `sweep-stale-payments` | `Bearer WEBHOOK_SECRET` | pg_cron (saatlik) | ✅ | GUC kurulumu doğrulanmalı |
| `send-push` | `Bearer WEBHOOK_SECRET` | DB webhook (notifications INSERT) | ✅ | Webhook dashboard'da — repo'da kayıt yok |
| `create-payment` | Kullanıcı JWT | Mobil uygulama | ✅ | CORS `*` sabit (tutarsızlık) |
| `iyzico-3ds-callback` | İmzalı iyzico doğrulaması | iyzico | ✅ | Doğru tasarım |
| `payment-webhook` | İmzalı iyzico doğrulaması | iyzico (legacy form) | ✅ | `SIMULATION_WEBHOOK_ALLOW` canlıda kapalı olmalı |
| `capture-payment` | `x-payment-secret` | **Kimse (go-live'da sistem)** | ✅ | Kart modunda devreye alınacak |
| `void-payment` | `x-payment-secret` | **Kimse (go-live'da sistem)** | ✅ | Kart modunda devreye alınacak |
| `refund-payment` | `x-payment-secret` | **Kimse (go-live'da sistem)** | ✅ | Kart modunda devreye alınacak |
| `send-email` | `x-email-secret` | **Kimse** | ✅ | Ölü kod → sağlayıcı kararı bekliyor |
| `password-reset-request` | Public + rate limit | Mobil uygulama | ✅ | Anti-enumeration doğru |
| `password-reset-confirm` | Public + deneme limiti | Mobil uygulama | ✅ | Doğru |

### 2.2 Tespit Edilen Sorunlar

1. **Cron sessiz devre dışı kalma riski:** İki cron migration'ı da
   (`20260719000001_c4_auto_cancel_cron.sql`, `20260726000001_sweep_stale_payments_cron.sql`)
   `app.settings.functions_base_url` ve `app.settings.webhook_secret` GUC'ları boşsa cron'u
   **kurmadan** sadece NOTICE basıyor. Prod'da bu iki `ALTER DATABASE` komutunun çalıştığı
   doğrulanmamış. Ek olarak sweeper'ın `app_config.sweeper_enabled` kill-switch'i var.
2. **`verify_jwt` deploy bayrağı repo'da kayıtlı değil:** `config.toml`'da fonksiyon başına
   `verify_jwt` girdisi yok. Webhook/cron fonksiyonları (`payment-webhook`,
   `iyzico-3ds-callback`, `send-push`, `auto-cancel-matches`, `sweep-stale-payments`) yanlış
   bayrakla deploy edilirse gateway daha handler çalışmadan isteği reddeder.
3. **`create-payment` CORS `*` sabit** (`create-payment/index.ts:22`) — diğerleri
   `ALLOWED_ORIGIN` okuyor.
4. **`RESET_CODE_PEPPER` service-role key'e düşüyor** (`password-reset-request:51`) — key
   rotasyonu tüm bekleyen sıfırlama kodlarını geçersiz kılar.
5. **`capture-payment` legacy yolunda hata mesajı regex'i** ("already captured" metin eşleşmesi,
   `capture-payment:53-55`) — iyzico mesaj değişirse kırılgan.
6. **`send-push` hata logunda `user_id: ''`** (`send-push:507`) — denetlenebilirlik kaybı.
7. **`admin-create-user` rate-limit'siz.**

### 2.3 Çözüm Planı

**P0 (canlıya çıkmadan zorunlu):**
- [ ] `auto-cancel-matches`'i deploy et (`--no-verify-jwt`); prod'da GUC'ları
  (`functions_base_url`, `webhook_secret`) ayarla; `cron.job` tablosundan iki işin kurulu
  olduğunu SQL ile doğrula.
- [ ] Tüm fonksiyonlar için `supabase/config.toml`'a fonksiyon-başına `verify_jwt` blokları
  ekle (repo = tek doğruluk kaynağı); `admin:deploy` script'i bu bayrakları config'den okusun.
- [ ] `send-push` DB webhook tanımını migration'a taşı (`supabase_functions.hooks` /
  `pg_net` trigger) — dashboard'a bağımlılığı kaldır.
- [ ] `payment-webhook`'ta `SIMULATION_WEBHOOK_ALLOW`'un canlıda unset olduğunu doğrula.

**P1 (go-live haftası):**
- [ ] Karar: `admin-broadcast` — ya paneli edge fonksiyona bağla (tercih: kampanya gönderimi
  sunucu sırasına girer, retry + rapor kazanır) ya da fonksiyonu sil. Öneri: **bağla**;
  büyük segment gönderimlerinde browser-RPC zaman aşımına açık.
- [ ] iyzico canlı anahtarları geldiğinde `capture/void/refund-payment`'ı sistem
  bağlamından (cron/RPC-tetikli `pg_net`) devreye al — `matchLifecycleService.ts:13-17`'deki
  tasarım notuna sadık kal: `PAYMENT_EDGE_SECRET` asla tarayıcıya inmez.
- [ ] `create-payment` CORS'unu `ALLOWED_ORIGIN` okumaya geçir.
- [ ] `RESET_CODE_PEPPER`'a bağımsız secret ata.
- [ ] `admin-create-user`'a basit rate limit (IP+admin başına dakikada N).

**P2 (go-live sonrası ilk ay):**
- [ ] Her cron fonksiyonu çalışma sonucunu `cron_run_log` tablosuna yazsın
  (`function, started_at, finished_at, ok, detail`); Kontrol Merkezi'ne "Otomasyon Sağlığı"
  kartı: son çalışma > beklenen aralık ×2 ise kırmızı.
- [ ] `send-push` hata lognun `user_id` düzeltmesi; `capture-payment` regex yerine iyzico
  hata kodu eşleşmesi.

---

<a id="bölüm-3"></a>
## BÖLÜM 3 — FOTOĞRAF YÜKLEME: ORAN ZORUNLULUĞU + KIRPMA FONKSİYONU PLANI

### 3.1 Mevcut Durum

Tüm admin yüklemeleri tek public bucket'a (`images`) gidiyor; iki boru hattı var:

| Yükleme noktası | Bileşen | Klasör | Mevcut doğrulama |
|-----------------|---------|--------|------------------|
| Tesis/kort fotoğrafları | `PhotoManager` (PitchStudio.tsx:824, PitchManager.tsx:348) | `pitches/{id}/…` | 10MB, min 800px, 12/8 adet sınırı |
| Kullanıcı avatarı | `PhotoUploadZone` (DeepEditModals.tsx:52-82) | `users/` | ⚠️ min 800px (avatar için fazla agresif) |
| Kaleci/hakem avatarı | `PhotoUploadZone` (DeepEditModals.tsx:496) | `providers/` | aynı |
| Maç kapak görseli | `MatchFormModal.tsx:181` | `matches/` | varsayılanlar |
| Topluluk kapağı / kampanya banner'ı | **YOK** | — | eksik özellik |

**Gösterim uyumsuzluğu (kırpmanın hedefleyeceği oranlar):**
- Keşif kartı: `h-52` tam genişlik, `object-cover` → **yatay ~16:9/16:7** (`PitchDiscovery.tsx:664`)
- Detay galerisi: `h-[35vh]` tam genişlik → **yatay** (`PitchDiscovery.tsx:1708`)
- Panel küçük görseli: `w-28 h-36` → **dikey 3:4** (`PhotoManager.tsx:171`) ← tutarsız
- Avatarlar: daire/`rounded-3xl` → **kare 1:1**
- Maç posteri: tam genişlik `object-cover` → **yatay 16:9**

**Kritik hatalar:**
1. **EXIF yönü işlenmiyor** — `imageCompression.ts:16` `createImageBitmap(file)`'i
   `{ imageOrientation: 'from-image' }` olmadan çağırıyor → dikey telefon fotoğrafları yan yatıyor.
2. `ServiceProfile.tsx:159-168` yüklemesi sahte (base64 local state, storage'a gitmiyor).
3. `serviceRequestService.uploadProviderIdPhoto` ham dosyayı sıkıştırmasız yüklüyor.
4. HEIC bucket'ta izinli ama tarayıcı render edemiyor → bozuk görsel riski.
5. CDN transform (`/render/image`) kapsamı eksik: `MatchDiscovery.tsx:1224` ve çoğu avatar ham
   URL servis ediyor.

### 3.2 Karar: Oran Zorunluluğu VE Kırpma — İkisi Birden

Kullanıcının sorusu "oran iste ve/veya kırpma ekle" idi. **Öneri: ikisi birden, tek akışta.**
Sadece oran zorlamak (yanlış oranı reddetmek) admin'i harici araçlara mahkûm eder; sadece
serbest kırpma ise tutarlılığı garanti etmez. Doğru desen: **yükleme anında, hedef orana
kilitli zorunlu kırpma adımı** — admin fotoğrafı seçer → kırpma ekranı hedef oranda açılır →
onaylamadan yükleme gerçekleşmez. Böylece her fotoğraf yayına doğru oranda çıkar, admin de
neyin görüneceğini yüklerken görür.

### 3.3 Uygulama Planı

**Adım 1 — Oran sözleşmesi (tek doğruluk kaynağı):** `shared/imagePresets.ts`

```ts
export const IMAGE_PRESETS = {
  pitchCover:   { aspect: 16/9, minWidth: 1280, maxBytes: 10*1024*1024, out: 'jpeg' },
  pitchGallery: { aspect: 16/9, minWidth: 1280 },   // galeri de kapakla aynı oran
  matchCover:   { aspect: 16/9, minWidth: 1280 },
  avatar:       { aspect: 1,    minWidth: 320  },    // 800px zorunluluğu kaldırılır
  communityCover: { aspect: 3/1, minWidth: 1280 },   // yeni özellik
  campaignBanner: { aspect: 2/1, minWidth: 1080 },   // yeni özellik
} as const;
```

**Adım 2 — Kırpma bileşeni:** `admin-panel/views/components/ImageCropModal.tsx`
- Bağımlılıksız, `<canvas>` tabanlı (mevcut `imageCompression.ts` altyapısını genişletir;
  yeni npm paketi istenmez — bundle küçük kalır, standalone dağıtımda dış bağımlılık olmaz).
- Özellikler: sürükle-taşı + tekerlek/çimdik zoom, orana kilitli çerçeve, karanlık maske,
  "uygulamada böyle görünecek" canlı önizleme şeridi (keşif kartı + detay + küçük görsel),
  9-bölge ızgara çizgileri.
- Çıktı: `canvas.toBlob('image/jpeg', 0.85)` → mevcut `compressImageForUpload`'a girer.

**Adım 3 — EXIF düzeltmesi (bağımsız, hemen yapılabilir):**
`imageCompression.ts:16` → `createImageBitmap(file, { imageOrientation: 'from-image' })` +
desteklemeyen tarayıcılar için fallback. Kırpmadan bağımsız P0 hata düzeltmesidir.

**Adım 4 — Boru hattı entegrasyonu:**
- `useImageUpload(folder, preset)` imzasına preset ekle; `PhotoUploadZone`, `MatchFormModal`,
  `PhotoManager` kırpma modalını dosya seçiminden hemen sonra açar.
- `PhotoManager` küçük görsellerini 3:4'ten hedef orana (16:9) çevir → panel, uygulamadaki
  görünümün aynısını gösterir (tutarsızlık #2 çözülür).
- Sunucu tarafı savunma: `pitch_media` insert trigger'ına genişlik/yükseklik oranı denetimi
  eklemek yerine (istemci kırptığı için gereksiz maliyet), bucket MIME listesinden
  `image/heic|heif`'i çıkar; kabul edilen formatlar jpeg/png/webp.
- `uploadProviderIdPhoto`'ya `compressImageForUpload` ekle (kırpma değil — kimlik belgesi
  kesilemez, sadece sıkıştırma + EXIF düzeltme).
- `ServiceProfile.tsx` sahte yüklemesini gerçek pipeline'a bağla veya alanı kaldır.

**Adım 5 — Görüntüleme optimizasyonu:**
- `transformedImageUrl` kullanımını `MatchDiscovery.tsx:1224` ve avatar bileşenlerine yay
  (`components/ui/Avatar.tsx` merkezi noktadır).
- Topluluk kapağı + kampanya banner'ı yükleme alanlarını (`CommunityFormModal`,
  `CampaignsPage`) preset'lerle ekle — bugün hiç yoklar.

**Kabul kriterleri:**
- [ ] Panelden yüklenen her fotoğraf türü kırpma adımından geçmeden yüklenemiyor.
- [ ] Dikey çekilmiş telefon fotoğrafı doğru yönde kaydediliyor (EXIF testi).
- [ ] Keşif kartında ve panel küçük görselinde aynı kadraj görünüyor.
- [ ] 10MB üstü, 1280px altı (kapak) ve HEIC dosyalar anlaşılır Türkçe hata mesajıyla reddediliyor.
- [ ] Avatar yüklemede 800px engeli kalkmış, 320px yeterli.

---

<a id="bölüm-4"></a>
## BÖLÜM 4 — UI/UX: MİLYAR DOLARLIK PANEL TASARIM PLANI

### 4.1 Korunacak Güçlü Temeller

Mevcut mimari sağlam — sıfırdan yazım YOK, hedefli yükseltme VAR:
- Tek kaynaklı rota kaydı (`adminRoutes.ts`) → sidebar/palet/meta otomatik türetiliyor ✅
- 5 rollü RBAC + feature-flag kapıları merkezi ✅
- Realtime rozetler + 60sn poll yedeği ✅
- PII maskeleme + audit'li gösterim (`User360Drawer`) ✅
- Dashboard sahte KPI göstermiyor, eksik veriyi dürüstçe söylüyor ✅

### 4.2 Yükseltme Planı — 6 İş Paketi

**UX-1: Tablo altyapısını tek primitife indirge (etkisi en yüksek iş)**
- `DataTable`'ın kullanılmayan hazır sayfalayıcısını (L213-243) devreye al; Users/Pitches/
  Matches'teki 3 kopya "Önceki/Sonraki" barını sil.
- Sayfalaması OLMAYAN listelere (Finance, AuditLog, Disputes, ServiceDisputes, PromoCodes,
  Communities) sunucu taraflı cursor sayfalama ekle — RPC'lere `p_cursor` parametresi.
- Sütun sıralama (`aria-sort` ile), sütun görünürlüğü (bugün sadece Users'ta) ve CSV
  dışa aktarımı tüm listelerde standartlaştır.
- El yazması `<table>` kullanan Commission (`CommissionPage.tsx:137`) ve GuardianConsents
  sayfalarını `DataTable`'a taşı.

**UX-2: Legacy sayfaları tasarım sistemine getir**
`OwnerAccountsPage`, `ModerationPage`, `ProviderIdentitiesPage`, `PendingVerificationsPage`
eski `*Tab.tsx` bileşenlerine sarmalayıcı — bunları `PageShell + DataTable + Drawer` desenine
taşı. Panelin "iki farklı ürün gibi" görünen tek bölgesi burası.

**UX-3: Klavye-öncelikli kullanım**
- Komut paletine ok tuşu navigasyonu + Enter seçimi + fuzzy sıralama (bugün yalnızca fare).
- Global kısayollar: `g d` dashboard, `g u` kullanıcılar, `g f` finans; tablolarda `j/k`
  satır gezinme, `Enter` detay çekmecesi, `e` CSV.
- `window.confirm` (Sidebar.tsx:184) → `ConfirmDialog`; modallara odak tuzağı + odak iadesi.

**UX-4: Paylaşılabilir durum (URL adresleme)**
Filtre/arama/sayfa/çekmece durumunu query string'e yaz (bugün sadece `route`/`matchId`/
`communityId` var). "Şu kullanıcıya bak" diye link atılabilmeli:
`admin.html?route=USERS&q=ahmet&drawer=user:123`.

**UX-5: Toplu işlem katmanı**
Satır çokseçim + toplu onay/ban/bildirim; her toplu işlem `ActionConfirmModal`'da etki özeti
("14 kullanıcıya push gidecek") + audit-log'a tek grup kaydı. Öncelik sırası:
Doğrulama Merkezi (başvuru onayı) → Kullanıcılar → Finans (payout işaretleme).

**UX-6: Görsel sadeleştirme ve operatör konforu**
- 8-11px `font-black uppercase` mikro-tipografiyi bilgi hiyerarşisine göre seyrelt; gövde
  metnini 13-14px'e çıkar (uzun mesai gözü yormasın). Neon-yeşil vurguyu yalnız kuzey-yıldızı
  KPI'da bırak.
- Dashboard'daki sparkline hatasını düzelt: kullanıcı kartı ciro verisi gösteriyor
  (`DashboardPage.tsx:162-164`).
- Hata bildirimi: 3.2sn'de kaybolan toast yerine kalıcı "Sorun Merkezi" paneli — son 50
  başarısız işlem, tekrar dene düğmesiyle (Bölüm 7 ile birleşir).
- Mobil: 64px ikon rayı yerine overlay çekmece; tablet yatay kullanım birincil hedef
  (patron kullanım senaryosu).
- Google Fonts / ui-avatars / pravatar dış bağımlılıklarını kaldır, fontu bundle'a göm
  (standalone/offline dayanıklılığı — Bölüm 5 ile birleşir).

**Kabul kriterleri:**
- [ ] Her liste sayfasında: arama + filtre + sıralama + sayfalama + CSV + boş durum + iskelet.
- [ ] Panel fare hiç kullanılmadan (yalnız klavye) uçtan uca yönetilebiliyor.
- [ ] Dört legacy sayfa tasarım sistemiyle birebir aynı görünüyor.
- [ ] Herhangi bir ekran durumu URL ile paylaşılabiliyor.

---

<a id="bölüm-5"></a>
## BÖLÜM 5 — BİLGİSAYARDAN YÖNETİM: STANDALONE DAĞITIM PLANI

Hedef senaryo: uygulama canlıdayken admin paneli dosyası patronun bilgisayarına kurulur,
uygulama oradan yönetilir.

### 5.1 Bugün Kopyalasan Ne Kırılır? (analiz sonucu)

1. **Mutlak asset yolları:** `vite.config.ts`'de `base` yok → build `/assets/…` üretir;
   `file://` ile açmak veya alt klasörden servis etmek her şeyi 404 yapar.
2. **Build-time env:** `VITE_SUPABASE_URL/ANON_KEY` derlemede gömülür. Özellikle
   `createAuthAccountViaEdge` (`adminService.ts:1488`) anon key'i **fallback'siz** okur —
   env'siz build'de kullanıcı oluşturma kırılır.
3. **CORS:** `admin-create-user`'a fetch yeni origin'den yapılır; edge tarafında
   `ALLOWED_ORIGIN`/`ADMIN_ALLOWED_ORIGIN` yeni origin'i tanımalı.
4. **Auth ayarları:** Supabase Site URL / redirect allow-list yeni origin'i içermeli
   (parola+TOTP girişi redirect'siz çalışır; yine de eklenmeli).
5. **Dış CDN'ler:** Google Fonts, ui-avatars, pravatar, Unsplash → offline'da kozmetik bozulma.
6. **Gömülü prod anahtarı:** `supabaseClient.ts:11-13`'teki sabit prod URL+anon key sayesinde
   panel env'siz bile prod'a bağlanır — bu "çalışıyor" demek ama **kontrolsüz**: hangi build'in
   hangi projeye konuştuğu görünmez olur.

### 5.2 Çözüm: "Admin Paneli Paketi" (tek klasör, çift tıkla çalışır)

**Mimari karar:** Electron'a gerek yok. `dist-admin/` klasörü + minicik yerel sunucu yeterli;
panel zaten tarayıcıda mükemmel çalışıyor.

1. **Ayrık build hedefi:** `npm run build:admin` → `vite build --config vite.admin.config.ts`
   - `base: './'` (göreli yollar), yalnız `admin.html` girdisi, çıktı `dist-admin/`.
   - Font ve tüm statikler bundle'a gömülü; dış CDN referansı sıfır.
   - Build sırasında `VITE_SUPABASE_URL/ANON_KEY` zorunlu — yoksa build **hata verir**
     (gömülü fallback'e güvenme); `VITE_APP_VERSION` + build tarihi panelin alt barında görünür.
2. **Başlatıcı:** `dist-admin/oyna-admin-baslat.mjs` (Node tek dosya) veya paketlenmiş
   küçük ikili: `127.0.0.1:4173`'te servis eder, varsayılan tarayıcıyı açar. Windows için
   `oyna-admin.bat`, macOS için `.command` sarmalayıcı. → Patron deneyimi: klasörü kopyala,
   çift tıkla, panel açılır.
3. **Origin kilidi (güvenlik güçlendirmesi):** Panel artık sabit origin'den çalışacağı için
   `ADMIN_ALLOWED_ORIGIN` dormant modundan çıkarılıp **aktif** edilir; ayrıca
   `admin_mfa_required = true` yapılır (Bölüm 6). Yerel panel = tek yetkili origin.
4. **Sürüm/güncelleme akışı:** panel boot'ta `admin_fetch_config` içinden beklenen minimum
   sürümü okur; eskiyse kırmızı bant "Yeni panel paketi indirin". Paket üretimi
   `admin:package` script'iyle tek komut (build + zip + sürüm damgası).
5. **Doğrulama scripti:** mevcut `admin:verify` genişletilir: paket içinden çalıştırılınca
   (a) Supabase erişimi, (b) kritik RPC sağlığı, (c) edge fonksiyon CORS'u, (d) realtime WSS
   testini yapar; sonuç yeşil/kırmızı raporlanır. Kurulum günü tek komutla sağlama.

**Kabul kriterleri:**
- [ ] İnternet bağlantısı olan temiz bir bilgisayarda zip aç → çift tıkla → giriş yap → tüm
  sayfalar veri gösteriyor (dış CDN'siz).
- [ ] `admin-create-user` (kullanıcı oluşturma) yeni origin'den çalışıyor.
- [ ] Yanlış/eksik env ile build almak mümkün değil.
- [ ] Panel hangi projeye (prod/staging) bağlı olduğunu üst barda gösteriyor.

---

<a id="bölüm-6"></a>
## BÖLÜM 6 — GÜVENLİK SERTLEŞTİRME (CANLI DB DENETİM BULGULARI)

Canlı projeden (`iikvzgyccvgcybzdfwlv`) alınan denetim: **346 bulgu** —
1 ERROR, 340 WARN, 5 INFO.

| Bulgu | Adet | Aksiyon |
|-------|------|---------|
| 🔴 `public_profiles` view'ı SECURITY DEFINER | 1 | `security_invoker = true`'ya çevir veya RLS'li tabanla değiştir — **P0** |
| 🟠 `anon` rolüyle çalıştırılabilir SECURITY DEFINER fonksiyonlar | 12 | `REVOKE EXECUTE FROM anon` — özellikle `fund_service_request`, `respond_service_request`, `captain_report_no_show`, `provider_dispute_no_show` para/akış fonksiyonları. (Repo'da `20260713000016_admin_rpc_anon_revoke.sql` deseni var; kapsamı genişlet) — **P0** |
| 🟠 `authenticated` rolüyle çalıştırılabilir SECURITY DEFINER (113'ü `admin_*`) | 323 | `admin_*` fonksiyonlar içeride `is_platform_admin` denetliyor (tasarım gereği); yine de trigger fonksiyonları (`tg_*`, `_trg_*`) ve `_` öneki iç yardımcılardan EXECUTE'u kaldır — bunların REST'ten çağrılabilir olması gereksiz yüzey — **P1** |
| 🟠 Sızmış parola koruması (HaveIBeenPwned) kapalı | 1 | Auth ayarından aç — **P0, tek tık** |
| 🟡 RLS açık ama politikasız tablolar (`guardian_lookup_attempts`, `password_reset_codes`, `profile_contact_hash`, `social_rate_usage`, `team_invite_links`) | 5 | Bilinçliyse (yalnız service-role erişimi) migration'a açıklayıcı yorum; değilse politika yaz — **P1** |
| 🟡 `public` şemasında `cube`, `earthdistance`, `btree_gist` uzantıları + `touch_region_coverage` mutable search_path | 4 | `extensions` şemasına taşı; fonksiyona `SET search_path` — **P2** |

**Panele özgü ek sertleştirme:**
- [ ] `admin_mfa_required` varsayılanını `true` yap (bugün fail-open false —
  `adminService.ts:207-218`). Canlıda MFA'sız admin girişi olmamalı.
- [ ] Ghost/impersonation oturumları Kontrol Merkezi'nde canlı listelensin
  (kim, ne zamandır, hangi kullanıcıda) — `admin_ghost_sessions` tablosu zaten var.
- [ ] Audit zinciri doğrulaması (`admin_verify_audit_chain`) haftalık cron'a bağlansın,
  kırık zincir push bildirimi üretsin.

---

<a id="bölüm-7"></a>
## BÖLÜM 7 — OPERASYONEL SÜREÇLER: BASİTLEŞTİRİRKEN GÜÇLENDİRME

Hedef: patronun günlük işini **3 ekrana** indirmek, geri kalan her şeyi istisna-tabanlı yönetmek.

### 7.1 "Sabah Turu" Modeli (günlük operasyonun tek giriş kapısı)

Kontrol Merkezi'ni gerçek bir görev kuyruğuna dönüştür:
- Yedi canlı kuyruk zaten var (onaylar, çekimler, ihtilaflar, KVKK, topluluk). Eklenecek:
  **her kuyruk kartına "sıradaki işi aç" düğmesi** → ilgili kaydın çekmecesi doğrudan açılır,
  onay/red sonrası kuyruktaki bir sonraki kayda geçer (inbox-zero akışı).
- Kuyruk SLA rozetleri: 24 saatten eski bekleyen başvuru = sarı, 72 saat = kırmızı.
- Gün sonunda otomatik özet: "Bugün 12 onay, 3 red, 2 iade işlendi" (audit log'dan türetilir).

### 7.2 İstisna-Tabanlı İzleme (bakılmayan şey bildirsin)

- **Otomasyon Sağlığı kartı** (Bölüm 2.4): cron'lar, push teslimatı, ödeme sweeper'ı —
  hepsi yeşilse tek satır; biri gecikirse kart kırmızı + panele girişte banner.
- **Eşik alarmları** `admin_fetch_config` üzerinden ayarlanabilir: bekleyen çekim > X,
  başarısız ödeme oranı > %Y, doğrulama kuyruğu > Z gün → panel bildirimi (+ P2'de e-posta).
- **Sorun Merkezi** (UX-6): başarısız admin işlemleri kaybolmaz, tekrar denenebilir listede durur.

### 7.3 Güçlendirme: Dört Göz ve Geri Alma

- **Kritik işlem sınıfı** (iade, cüzdan düzeltme, toplu bildirim, kullanıcı silme):
  `ActionConfirmModal`'a "etki önizlemesi" (kaç kayıt, kaç TL) + yazarak onay
  ("SİL" yaz) standardı.
- **Geri alınabilirlik:** ban/moderasyon işlemlerinde 5 dakikalık "geri al" toast'u
  (işlem anında yapılır, karşı-işlem hazır tutulur).
- **Rol disiplini:** günlük kullanım için `ADMIN` yerine kısıtlı rollerin (FINANCE, MODERATOR)
  gerçekten kullanılması; `SUPER_ADMIN` yalnız kurulum/acil durum. ACL sayfasına "son 30 günde
  bu rolle yapılmış işlem sayısı" ekle — kullanılmayan yetki görünür olsun.

### 7.4 Dokümantasyon Uyumu

`admin_panel_kullanim_kilavuzu.md` ("Patronun El Kitabı") bu plandaki her değişiklikle
güncellenir; kılavuzdaki ekran adları `adminRoutes.ts` etiketlerinden script'le türetilip
senkron tutulur (`admin:verify` bunu da denetler).

---

<a id="bölüm-8"></a>
## BÖLÜM 8 — UYGULAMA YOL HARİTASI

### FAZ 0 — Canlıya Çıkış Blocker'ları (1. hafta) 🔴
| İş | Kaynak |
|----|--------|
| `auto-cancel-matches` deploy + cron GUC kurulumu + `cron.job` doğrulaması | Bölüm 2.3 |
| `verify_jwt` bayraklarını config.toml'a yaz | Bölüm 2.3 |
| EXIF yön düzeltmesi (`imageCompression.ts`) | Bölüm 3.3 |
| `public_profiles` SECURITY DEFINER düzeltmesi + 12 anon REVOKE + HIBP açma | Bölüm 6 |
| `admin_mfa_required = true` | Bölüm 6 |
| Sessiz sıfır/boş veri → üç durumlu rozet (en azından Finans + Dashboard) | Bölüm 1.3 |
| `SIMULATION_WEBHOOK_ALLOW` prod kontrolü | Bölüm 2.3 |

### FAZ 1 — Fotoğraf Sistemi + Standalone Paket (2.-3. hafta) 🟠
| İş | Kaynak |
|----|--------|
| `IMAGE_PRESETS` + `ImageCropModal` + tüm yükleme noktalarına entegrasyon | Bölüm 3.3 |
| PhotoManager küçük görsel oranı düzeltmesi; HEIC'i bucket'tan çıkar | Bölüm 3.3 |
| `vite.admin.config.ts` + `build:admin` + başlatıcı + `admin:package` | Bölüm 5.2 |
| `ADMIN_ALLOWED_ORIGIN` aktifleştirme + Supabase redirect listesi | Bölüm 5.2 |
| `admin:verify` paket-içi sağlık taraması | Bölüm 5.2 |
| Sahte veri temizliği (Ordu koordinatı, 4.5 rating, Unsplash, pravatar) | Bölüm 1.2 |

### FAZ 2 — UI/UX Yükseltmesi (4.-6. hafta) 🟡
| İş | Kaynak |
|----|--------|
| UX-1 tablo altyapısı (sayfalama/sıralama/CSV her listede) | Bölüm 4.2 |
| UX-2 dört legacy sayfanın taşınması | Bölüm 4.2 |
| UX-3 klavye navigasyonu + palet yükseltmesi | Bölüm 4.2 |
| UX-4 URL adreslenebilir durum | Bölüm 4.2 |
| Teams/tournaments doğrudan erişimlerinin RPC'ye taşınması | Bölüm 1.4 |
| `admin-broadcast` edge entegrasyonu | Bölüm 2.3 |

### FAZ 3 — Operasyon Mükemmelliği (7.-8. hafta) 🟢
| İş | Kaynak |
|----|--------|
| Sabah Turu / inbox-zero kuyruk akışı + SLA rozetleri | Bölüm 7.1 |
| Otomasyon Sağlığı kartı + `cron_run_log` | Bölüm 2.4, 7.2 |
| UX-5 toplu işlemler + dört-göz onay standardı | Bölüm 4.2, 7.3 |
| Push teslimat raporu ekranı; realtime kapsam genişletme | Bölüm 1.5 |
| Eşik alarmları + Sorun Merkezi | Bölüm 7.2 |
| iyzico canlı geçişinde `capture/void/refund-payment` devreye alma + mutabakat ekranı | Bölüm 2.3, 1.5 |

### Genel Kabul Kriteri (tanım: "canlıya hazır panel")
1. Panelde görünen her sayı ya gerçek DB verisidir ya da açıkça "okunamadı" der — sessiz sıfır yok.
2. Tüm cron/webhook otomasyonları kuruludur ve sağlıkları panelden izlenir.
3. Yüklenen her fotoğraf hedef oranda kırpılmıştır ve uygulamada kadrajı bozulmadan görünür.
4. Panel paketi temiz bir bilgisayarda çift tıkla çalışır ve yalnız MFA'lı admin girebilir.
5. Canlı DB güvenlik denetiminde ERROR seviyesi bulgu sayısı sıfırdır.
6. Günlük operasyon Kontrol Merkezi'nden istisna-tabanlı yürür; kritik işlemler etki
   önizlemeli ve denetim izlidir.
