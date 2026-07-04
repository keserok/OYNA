# OYNA — Google Play & App Store Lansman Planı

> **Tarih:** 2 Temmuz 2026 · **Kaynak:** Kod tabanının uçtan uca analizi (frontend, Supabase backend, Android/iOS native katman)
> **Hedef:** OYNA'yı (com.oyna.app) Google Play Store ve Apple App Store'da yayına almak.

> ## ✅ UYGULAMA DURUMU (2 Temmuz 2026 — bu branch'te tamamlandı)
> Kod tarafında çözülebilir maddelerin tamamı bu branch'te uygulandı:
> - **Android:** `colors.xml` eklendi (derleme engeli kalktı) · konum/kamera/bildirim izinleri + portre kilidi + `oyna://` intent-filter eklendi · `versionName 3.0.0` · `key.properties` tabanlı koşullu release imzalama · `ic_stat_oyna` bildirim ikonu.
> - **iOS:** bundle ID `com.oyna.app` yapıldı (pbxproj + Apple Sign-In clientId) · Podfile `node_modules`'a düzeltildi ve 12 pod'un tamamı eklendi · `App.entitlements` (Push + Sign in with Apple) oluşturulup projeye bağlandı · `MARKETING_VERSION 3.0.0` · yalnız iPhone + portre · `armv7→arm64` · `config 2.xml` silindi. (macOS'ta `pod install` + Xcode 26 derlemesi gerektirir.)
> - **Güvenlik:** `admin-broadcast` fail-closed yapıldı · auth'suz legacy `push-notification` fonksiyonu ve bayat `notifications/edge-function` kopyası silindi (Supabase'den **undeploy KURUCU aksiyonu**) · `IS_LOCAL_DEV` artık yalnızca `VITE_DEV_MODE=true` ile açılıyor.
> - **Ürün:** Geliştirici Konsolu kaldırıldı · KVKK "6379"→"6698" · hesap silme süresi 7 güne eşitlendi · iletişim `destek@oyna.app`'e birleştirildi · çevrimdışı uyarı şeridi eklendi.
> - **Deep link:** `@capacitor/app` kuruldu, `appUrlOpen` dinleyicisi bağlandı, iOS `CFBundleURLTypes` + Android intent-filter eklendi.
> - **Marka:** OYNA markalı ikon/splash üretildi ve tüm Android/iOS boyutlarına uygulandı (Capacitor robotu gitti). `assets/` altındaki master'lar tasarımcı tarafından nihai logoyla değiştirilebilir.
> - **Yasal:** `/gizlilik` ve `/hesap-silme` statik sayfaları eklendi (Vercel'de otomatik yayınlanır) — şirket ünvanı yer tutucusu ve **avukat onayı hâlâ gerekli**.
> - **Temizlik:** `arsiv/` silindi · `metadata.json` adı düzeltildi · `.gitignore` yeniden düzenlendi (native kaynaklar takipte; keystore/google-services/p8/p12 asla commit'lenmez).
> - **Doğrulama:** `tsc` temiz · production build başarılı · 70/70 birim testi geçti · `cap sync android` 10 plugin ile temiz.
>
> **Hâlâ açık (kod dışı / KURUCU):** iyzico sözleşme+entegrasyon anahtarları, PaymentScreen gerçek tahsilat bağlantısı (Faz D), APNs/FCM anahtarları + `google-services.json`, edge secret'ları (`ADMIN_EDGE_SECRET`, `WEBHOOK_SECRET`, CORS), mağaza hesapları/formları, avukat onaylı metinler + şirket ünvanı, profiles PII daraltması (mobil sürümle koordineli), gerçek cihaz QA.

---

## 0. Yönetici Özeti

Uygulamanın **web/ürün katmanı büyük ölçüde hazır**: TypeScript tip kontrolü temiz, production build başarılı (9.9 sn), 70/70 birim testi geçiyor, RLS ağırlıklı güvenlik mimarisi ve admin paneli (MFA'lı) yerinde. Ödeme (iyzico) ve push altyapısı kod olarak üretim kalitesinde yazılmış ancak **SİMÜLASYON modunda** bekliyor.

Buna karşılık **native (mobil) katman mağazaya çıkamaz durumda**. Öne çıkan engeller:

| # | Engel | Platform | Ciddiyet |
|---|-------|----------|----------|
| 1 | `colors.xml` eksik → **Android release derlemesi başarısız olur** | Android | 🔴 Derleme engeli |
| 2 | iOS bundle ID `com.oyna.app.kerem` (kişisel dev ID) — config `com.oyna.app` ile uyumsuz | iOS | 🔴 |
| 3 | iOS Podfile ölü yola işaret ediyor (`.gemini/antigravity/...`), 9 plugin'den yalnızca 2'sinin pod'u var → Apple Sign-In, kamera, konum iOS'ta linklenmez | iOS | 🔴 |
| 4 | iOS entitlements dosyası yok → Push ve Sign in with Apple çalışmaz | iOS | 🔴 |
| 5 | AndroidManifest'te yalnızca `INTERNET` izni var (LOCATION, CAMERA, POST_NOTIFICATIONS eksik) | Android | 🔴 |
| 6 | Android release imzalama (keystore) ve `google-services.json` yok | Android | 🔴 |
| 7 | Uygulama ikonu & splash **varsayılan Capacitor yer tutucusu** (mavi robot X) | Her ikisi | 🔴 Mağaza reddi |
| 8 | Yasal metinlerde `[ŞİRKET ÜNVANI]` gibi doldurulmamış yer tutucular + **barındırılan (public URL) gizlilik politikası yok** | Her ikisi | 🔴 Mağaza reddi |
| 9 | Ödeme simülasyonda: kart formu hiçbir yere gönderilmiyor, "BLOKE ET" her zaman başarılı | Her ikisi | 🔴 İş engeli |
| 10 | `admin-broadcast` edge fonksiyonu secret set edilmediyse **fail-open** (herkes platform geneli bildirim atabilir); legacy `push-notification` fonksiyonu tamamen auth'suz | Backend | 🔴 Güvenlik |

**Gerçekçi takvim:** Kod/yapılandırma düzeltmeleri ~1-2 hafta; asıl kritik yol **kod dışı** süreçler — iyzico sözleşme/KYC, avukat onaylı yasal metinler, Apple/Google geliştirici hesapları ve (kişisel Google hesabıysa) **12 testerlı 14 günlük zorunlu kapalı test**. Uçtan uca **6–10 hafta** öngörülmeli.

---

## 1. Mevcut Durum Analizi

### 1.1 Mimari ve teknoloji

- **Frontend:** React 19 + Vite 6 + TailwindCSS v4 + Zustand. Router yok; `App.tsx` içinde `view` state'ine göre dev bir switch (lazy-loaded ~40 ekran). Tek üst seviye ErrorBoundary + Sentry/PostHog entegrasyonu (env boşsa no-op).
- **Backend:** Supabase (Auth, PostgreSQL + 126 migration + ~73 tablo, Realtime, Storage, 10 Edge Function). RLS yaygın şekilde uygulanmış, art arda hardening migration'ları mevcut.
- **Mobil:** Capacitor 8 (12 plugin). Android platformu senkron, iOS platformu **bayat/bozuk**.
- **Roller:** Herkes PLAYER kaydolur; GOALKEEPER/REFEREE (ServiceApplication) ve OWNER (PartnerOnboarding) admin onaylı opt-in. Çoklu rolde RoleSwitcher. Admin paneli ayrı SPA (`/admin`), Supabase Auth + zorunlu MFA (AAL2).
- **Auth:** E-posta OTP (şifresiz), Google OAuth, Apple Sign-In (native plugin), misafir modu. Hesap silme akışı mevcut (`request_account_deletion` RPC) — her iki mağazanın da zorunlu şartı ✅.

### 1.2 Sağlık kontrolleri (bu analizde çalıştırıldı)

| Kontrol | Sonuç |
|---|---|
| `npm run lint` (tsc --noEmit) | ✅ Temiz |
| `npm run build` (production) | ✅ 9.9 sn (en büyük chunk 553 KB — kabul edilebilir) |
| `npm run test:unit` | ✅ 70/70 geçti |
| `npx cap sync android` | ✅ 9 plugin senkron |
| iOS `pod install` | ❌ Çalışmaz (Podfile ölü yol) |
| Android release derleme | ❌ Çalışmaz (`colors.xml` eksik) |

### 1.3 Güncel mağaza gereksinimleri (Temmuz 2026 itibarıyla doğrulandı)

- **Google Play:** Yeni uygulamalar şu an targetSdk **35** ile kabul ediliyor; **31 Ağustos 2026'dan itibaren API 36 (Android 16) zorunlu**. Proje targetSdk 35 → şimdi çıkılabilir, ama planın içinde 36'ya yükseltme olmalı. ([Kaynak](https://support.google.com/googleplay/android-developer/answer/11926878))
- **App Store:** **28 Nisan 2026'dan beri** tüm gönderimler **Xcode 26 / iOS 26 SDK** ile derlenmek zorunda (deployment target eski kalabilir; proje iOS 15.0). ([Kaynak](https://developer.apple.com/news/upcoming-requirements/))
- Her iki mağaza da **hesap silme akışı** (✅ var) ve **herkese açık gizlilik politikası URL'i** (❌ yok) ister.
- Google Play **veri güvenliği formu** (Data Safety), Apple **App Privacy "nutrition labels"** doldurulmalı.
- **Ödeme kuralı (kritik avantaj):** Halı saha kiralama **fiziksel/gerçek dünya hizmeti** olduğundan Apple IAP **zorunlu değildir** (Guideline 3.1.5(a)) — iyzico ile kart tahsilatı serbest. Saha sahibi SaaS aboneliği de B2B hizmet olarak IAP dışıdır; App Review notlarında açıkça belirtilmeli.

---

## 2. Faz Planı

Fazlar mümkün olduğunca paralel yürütülür. **[GELİŞTİRİCİ]** = kod işi, **[KURUCU]** = hesap/sözleşme/secret işi.

### FAZ A — Native Katman Onarımı (1. hafta) [GELİŞTİRİCİ]

**Android:**
- [ ] `android/app/src/main/res/values/colors.xml` oluştur (`colorPrimary`, `colorPrimaryDark`, `colorAccent` — styles.xml:7-9 referans veriyor, tanım yok → derleme engeli).
- [ ] `AndroidManifest.xml`'e izinleri ekle: `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `CAMERA`, `POST_NOTIFICATIONS` (Android 13+ push izni bu olmadan hiç sorulmaz).
- [ ] `versionCode`/`versionName` stratejisi belirle (öneri: `versionName "3.0.0"`, `versionCode` her yüklemede artan; CI'da otomatikleştir).
- [ ] Release imzalama: **upload keystore üret**, `signingConfigs.release` ekle, keystore'u repo DIŞINDA tut. Play App Signing'e kayıt ol (Google imzalama anahtarını yönetir).
- [ ] `.gitignore`'a açıkça ekle: `*.keystore`, `*.jks`, `google-services.json`, `GoogleService-Info.plist`, `*.p8`, `*.p12`, `key.properties`.
- [ ] `minifyEnabled true` + R8 değerlendir (opsiyonel ama önerilir; proguard-rules hazır).
- [ ] Bildirim ikonu: `ic_stat_oyna` drawable üret (capacitor.config.ts bunu bekliyor, dosya yok).
- [ ] Portre kilidi kararı: telefon UI'ı portre tasarımlıysa `android:screenOrientation="portrait"` ekle.

**iOS:**
- [ ] Bundle ID'yi `com.oyna.app.kerem` → `com.oyna.app` düzelt (project.pbxproj, 2 yer) ve `supabaseAuth.ts`'teki Apple Sign-In `clientId`'sini son karara eşitle.
- [ ] iOS platformunu yeniden üret veya onar: Podfile'daki ölü `.gemini/antigravity/...` yollarını `../../node_modules/...` yap, `npx cap sync ios` + `pod install` (9 plugin'in tamamı linklenmeli). Gerekirse `ios/` klasörünü `npx cap add ios` ile sıfırdan üretmek daha temiz.
- [ ] `App.entitlements` oluştur: **Push Notifications (aps-environment)** + **Sign in with Apple** capability'leri. Xcode'da Signing & Capabilities'ten ekle.
- [ ] `MARKETING_VERSION = 3.0.0`, `CURRENT_PROJECT_VERSION` artan yap.
- [ ] iPad kararı: UI telefon-portre tasarımlı → ya iPad orientation'larını daralt/`TARGETED_DEVICE_FAMILY = 1` (yalnız iPhone) yap ya da iPad düzenini gerçekten test et. (App Review iPad'de test eder; bozuk layout = red.)
- [ ] `UIRequiredDeviceCapabilities` `armv7` → `arm64` güncelle; `ios/App/App/config 2.xml` çöp dosyasını sil.
- [ ] Xcode 26 / iOS 26 SDK ile derlendiğini doğrula (zorunlu şart).

**Ortak temizlik:**
- [ ] `arsiv/` klasörünü repodan çıkar (2.2 MB; eski Firebase config/rules dahil — `firebase-applet-config.json` gerçek apiKey içeriyor, hijyen için silinmeli).
- [ ] `metadata.json` adını düzelt ("Remix: Remix: Oyna Oyuncu Tasarım 4" → "OYNA").
- [ ] Kullanılmayan plugin'leri karara bağla: `@capacitor/camera`, `haptics`, `local-notifications` JS'te hiç kullanılmıyor (QR taraması `html5-qrcode` ile web'den). Ya kullan ya kaldır — kaldırmak iOS izin beyanlarını sadeleştirir.
- [ ] Derin bağlantı (deep link) altyapısı: `@capacitor/app` plugin'i ekle (şu an `oyna://` yönlendirmesi yalnızca push tıklamasında çalışıyor); lansman sonrası için `assetlinks.json` + AASA (universal links) planla.

**Çıktı:** Her iki platformda imzalı release derlemesi alınabiliyor (`.aab` + `.ipa`).

### FAZ B — Güvenlik Sertleştirme (1. hafta, Faz A ile paralel) [GELİŞTİRİCİ + KURUCU]

- [ ] **`admin-broadcast` fail-open düzeltmesi:** `ADMIN_EDGE_SECRET` set değilse istek REDDEDİLMELİ (şu an guard atlanıyor → herkes platform geneli bildirim atabilir). Kod fail-closed'a çevrilmeli + secret set edilmeli.
- [ ] **Legacy `push-notification` fonksiyonunu sil/undeploy et** — auth kontrolü yok ve deprecated FCM legacy API kullanıyor; `send-push` zaten üretim kalitesinde.
- [ ] Edge CORS: `ALLOWED_ORIGIN`, `ADMIN_ALLOWED_ORIGIN` secret'larını gerçek domainlere ayarla (varsayılan `*`).
- [ ] **profiles PII (KVKK riski):** Oyuncular birbirinin e-posta/telefon/konumunu okuyabiliyor. `public_profiles` görünümüne geçiş **mobil sürümle koordineli** yapılmalı — mağaza sürümü tam bu koordinasyon fırsatı; lansman sürümüne dahil et.
- [ ] Canlı `pg_policies` denetimi: 13 dosyada kalan `USING (true)` policy'lerinin sonraki hardening migration'larca gerçekten ezildiğini üretim DB'de doğrula (`check-rls.sql` yalnız on/off bakıyor, policy kalitesine bakmıyor).
- [ ] `IS_LOCAL_DEV` sertleştirme: `!VITE_SUPABASE_URL` → dev-mode fallback'i kaldır (env enjeksiyonu bozulursa üretim build'i sessizce mock moda düşüyor; üstelik hardcoded prod fallback ile gerçek backend'e bağlı kalıyor). Env eksikse **hata fırlat**.
- [ ] Üretim Supabase Auth'ta demo hesapları (`*@oyna.app`, şifre `password123`) olmadığını/devre dışı olduğunu doğrula.
- [ ] Supabase `get_advisors` (security + performance) raporu çek ve bulguları kapat.

### FAZ C — Ürün İçi Eksikler & Uyum Düzeltmeleri (1.–2. hafta) [GELİŞTİRİCİ]

- [ ] **Settings'teki "Geliştirici Konsolu"nu kaldır** — tüm kullanıcılara görünüyor, "Seed DB" butonu ölü stub ve metni hâlâ "Firebase bulutuna" diyor (SettingsScreen.tsx:556-576).
- [ ] **KVKK kanun numarası düzeltmesi:** AuthScreen.tsx:102 "6379 sayılı" → **"6698 sayılı"**.
- [ ] **Hesap silme süresi tutarsızlığı:** UI "30 gün" diyor, backend varsayılanı 7 gün — tek bir değere eşitle.
- [ ] İletişim e-postası tutarlılığı: `iletisim@oyna.app` vs `destek@oyna.app` — tek adres seç, alan adı e-postasını gerçekten kur.
- [ ] Misafir modu RLS zarafeti: oturumsuz gezinmede tüm ekranların hata patlatmadan "kaydol" değer kapısına yönlendirdiğini test et.
- [ ] Çevrimdışı durumu: en azından `navigator.onLine` dinleyip nazik bir "bağlantı yok" durumu göster (mağaza incelemesinde uçak modu denenir).
- [ ] Safe-area: çentikli cihazlarda ve home-indicator bölgesinde `env(safe-area-inset-*)` uygulamasını gerçek cihazda doğrula.

### FAZ D — Ödeme Go-Live (2.–4. hafta; **kritik yol**) [KURUCU + GELİŞTİRİCİ]

Sözleşme süreci uzun sürer — **bu faza hemen başlanmalı.**

- [ ] **[KURUCU]** iyzico marketplace/pazaryeri sözleşmesi + KYC + canlı API anahtarları (şirket kuruluşu gerekiyorsa en uzun kalem budur).
- [ ] **[GELİŞTİRİCİ]** `PaymentScreen.tsx`'te gerçek akışı bağla: şu an `create_payment_intent` sonrası adım hard-coded `BLOCKED` (satır 136-138), kart verisi hiçbir yere gitmiyor. iyzico Checkout Form'a yönlendirme/embed tamamlanmalı.
- [ ] **[GELİŞTİRİCİ]** Maç katılımı → gerçek pre-auth blokaj; T-8s `pg_net` → `capture-payment`/`void-payment` tetiklemesi; iptal → `refund-payment` kart iadesi (docs/master/OYNA_GO_LIVE_IYZICO.md §70-79'daki bekleyen üç kalem).
- [ ] Sandbox'ta uçtan uca test: blokaj → capture → payout → kademeli iade.
- [ ] Secrets: `PAYMENT_PROVIDER=IYZICO`, `IYZICO_API_KEY/SECRET_KEY/BASE_URL`, `PAYMENT_EDGE_SECRET`; panel `payment_provider=IYZICO`; **Finans → Go-Live Ön-Uçuş tüm satırlar yeşil**.
- [ ] Küçük tutarlı gerçek kartla canlı test + iade.
- [ ] `create-payment`'taki hard-coded placeholder alıcı bilgisini (buyer) gerçek kullanıcı verisiyle doldur (fatura/KYC gereksinimi).

> **Karar noktası:** İlk mağaza sürümü ödemesiz ("keşfet + rezervasyon talebi") çıkarılıp ödeme sonraki sürüme mi bırakılsın? Bu, mağaza lansmanını iyzico sözleşmesinden ayrıştırır. Önerim: iyzico gecikirse lansmanı bloklamasın — simülasyon modu kullanıcıya "yakında" olarak sunulamaz ama ödeme akışı feature-flag ile gizlenebilir.

### FAZ E — Push Bildirim Go-Live (2.–3. hafta) [KURUCU + GELİŞTİRİCİ]

- [ ] **[KURUCU]** Apple Developer'da APNs Auth Key (.p8) üret → `APNS_KEY_ID/TEAM_ID/PRIVATE_KEY/BUNDLE_ID/PRODUCTION` secret'ları.
- [ ] **[KURUCU]** Firebase projesi (veya mevcut `oyna-app-28ea4`'ü doğrula) → `google-services.json`'u `android/app/`'e koy (repoya COMMIT ETME) → `GOOGLE_SERVICE_ACCOUNT_KEY/PROJECT_ID` secret'ları.
- [ ] `WEBHOOK_SECRET` set et + Supabase Database Webhook'una `Authorization: Bearer` header'ı ekle (GO_LIVE_CHECKLIST §B).
- [ ] Panel: `push_live_enabled = AÇIK`; kendi cihazına test push; sessiz saat + saatlik limit ayarla.
- [ ] iOS gerçek cihazda push izni + teslimat testi (simülatörde olmaz).

### FAZ F — Yasal & KVKK (1.–3. hafta; **kritik yol**) [KURUCU]

- [ ] **Avukat incelemesi:** LegalScreen'deki 4 şablon metin (Kullanım Şartları, Gizlilik, KVKK Aydınlatma, Mesafeli Satış & İade) taslak; `[ŞİRKET ÜNVANI]` ve `[iletisim@oyna.app]` yer tutucuları kullanıcıya aynen görünüyor. Şirket ünvanı, MERSİS, adres doldurulmalı.
- [ ] **Herkese açık gizlilik politikası URL'i** yayınla (ör. `https://oyna.app/gizlilik`) — her iki mağazada zorunlu alan. Basit statik sayfa yeterli (mevcut Vercel dağıtımına eklenebilir).
- [ ] Hesap silme için **web'den erişilebilir yol/açıklama sayfası** (Google Play veri güvenliği formu "silme talep URL'i" ister).
- [ ] KVKK: VERBİS kaydı gerekip gerekmediğini teyit et; profiles PII daraltması (Faz B) ile aydınlatma metnini uyumla.
- [ ] 18 yaş altı akışı: reşit olmayan onay akışı kodda var — yasal metinlerde ebeveyn onayı bölümüyle eşleştiğini doğrula; mağaza yaş derecelendirmesini buna göre işaretle.

### FAZ G — Marka Varlıkları & Mağaza İçerikleri (2.–3. hafta) [KURUCU + TASARIM]

- [ ] **Uygulama ikonu:** Şu an her iki platformda varsayılan Capacitor robotu. OYNA markalı 1024×1024 master ikon → `@capacitor/assets` aracıyla tüm boyutları üret (adaptive icon dahil).
- [ ] **Splash:** Markalı 2732×2732 master → tüm yoğunluklar (Android splash şu an 480×320 yer tutucu).
- [ ] **Ekran görüntüleri:** iPhone 6.9" + 6.5" (zorunlu), iPad 13" (iPad destekleniyorsa); Android telefon + 7"/10" tablet. Öneri: Dashboard, harita/saha keşfi, FUT kartı, maç lobisi, taktik stüdyosu — en güçlü 5 ekran.
- [ ] **Play Store:** feature graphic 1024×500, kısa açıklama (80), uzun açıklama (4000).
- [ ] **App Store:** ad (30), alt başlık (30), açıklama, anahtar kelimeler (100), tanıtım metni.
- [ ] Destek URL'i + pazarlama URL'i (oyna.app landing page).
- [ ] "OYNA" adının her iki mağazada müsaitliğini kontrol et; marka tescili değerlendir.

### FAZ H — Mağaza Hesapları & Formlar (1.–2. hafta; **hemen başla**) [KURUCU]

- [ ] **Apple Developer Program** ($99/yıl). Şirket hesabı için **D-U-N-S numarası** gerekir (alması 1-2 hafta sürebilir — bireysel hesapla başlanıp sonra şirkete taşınabilir ama isim "şirket ünvanı" yerine kişi adı görünür).
- [ ] **Google Play Console** ($25 tek seferlik). ⚠️ **Kişisel hesaplarda zorunlu kapalı test:** üretime erişim için **en az 12 tester ile kesintisiz 14 gün** kapalı test şartı var. Kurumsal (organization) hesapta bu şart yok — **şirket hesabı açılması şiddetle önerilir** ve takvimde bu 2 hafta hesaba katılmalı.
- [ ] **Google Play Veri Güvenliği formu:** toplanan veriler — konum (yaklaşık+kesin), e-posta, ad, fotoğraf, ödeme bilgisi (iyzico'ya), cihaz ID (push token), kullanım analitiği (PostHog), çökme verisi (Sentry). Hepsi beyan edilmeli.
- [ ] **Apple App Privacy etiketleri:** aynı envanterle doldur. Sentry/PostHog "tracking" sayılmıyorsa ATT gerekmez (üçüncü taraf reklam/veri satışı yok) — "Data Linked to You" olarak beyan.
- [ ] İçerik derecelendirme anketleri (IARC / Apple yaş derecesi) — spor/sosyal, kullanıcılar arası etkileşim + mesajlaşma var → bunu işaretle (muhtemelen 12+/Teen).
- [ ] App Review notları hazırla: **demo hesap bilgileri** (OTP'siz girilebilen test hesabı — şifresiz OTP akışı reviewer için sorun; Apple'a "review modu" test hesabı veya OTP bypass mekanizması sun), ödemenin fiziksel hizmet olduğu (IAP muafiyeti, Guideline 3.1.5(a)) açıklaması, misafir modu.

### FAZ I — QA & Beta (3.–5. hafta) [HERKES]

- [ ] Gerçek cihaz matrisi: düşük-orta segment Android (API 23 min destekleniyor — eski cihazda performans!), güncel Android 16, iPhone (çentikli + Face ID), mümkünse iPad.
- [ ] Kritik akış regresyonu: kayıt (OTP) → konum izni → saha keşfi → maç oluştur/katıl → (sandbox) ödeme → QR bilet → maç sonu puanlama → hesap silme.
- [ ] Rol akışları: kaleci/hakem başvuru + hizmet paneli; saha sahibi onboarding + OPanel; admin ghost mode.
- [ ] İzin reddi senaryoları: konum/bildirim/kamera reddedilince uygulama kırılmamalı (App Review test eder).
- [ ] **TestFlight** internal → external beta (external için de mini Apple incelemesi olur — sorunları erken yakalar).
- [ ] **Play Internal testing** → Closed testing (kişisel hesapsa zorunlu 12 tester × 14 gün burada koşar).
- [ ] Sentry DSN + PostHog anahtarlarını girip beta'da crash/analitik doğrula; Supabase **PITR** aç; uptime izleme bağla (RUNBOOK §3-5).

### FAZ J — Yayın & Sonrası (5.–6. hafta+)

- [ ] Sürüm: `3.0.0 (1)` her iki platformda; release notları (TR).
- [ ] **Play:** Staged rollout %10 → %50 → %100 (crash oranına bakarak).
- [ ] **App Store:** "Manuel yayınlama" seçeneğiyle onay sonrası kontrollü çıkış; Phased Release aç.
- [ ] İnceleme süreleri: Apple genelde 24-48 saat (ilk gönderimde red-düzelt döngüsü olası — 1 hafta ayır); Play yeni geliştirici hesabında ilk inceleme günler sürebilir.
- [ ] Lansman günü kontrolü: `demo_mode_enabled=KAPALI`, demo verisi purge, `payment_provider` ve `push_live_enabled` istenen konumda, Go-Live Ön-Uçuş yeşil.
- [ ] İzleme rutini: Sentry crash oranı, mağaza yorumları, Supabase advisors, push teslimat logu (`push_log`).
- [ ] **31 Ağustos 2026 öncesi:** targetSdk 36 (Android 16) yükseltmesi + davranış değişikliği testi — ilk güncelleme sürümüne planla.
- [ ] Sonraki sürüm adayları: universal links (assetlinks.json + AASA), gerçek payout API'si, İngilizce yerelleştirme, çevrimdışı iyileştirmeleri.

---

## 3. Zaman Çizelgesi (özet)

```
Hafta 1   ████ FAZ A native onarım          ████ FAZ B güvenlik
          ████ FAZ H hesaplar (başvurular)  ████ FAZ F avukat süreci başlar
Hafta 2   ████ FAZ C ürün düzeltmeleri      ████ FAZ E push go-live
          ████ FAZ D iyzico (sözleşme sürüyor)  ████ FAZ G marka varlıkları
Hafta 3   ████ FAZ G ekran görüntüleri/metinler  ████ FAZ F yasal metin final
Hafta 3-5 ████ FAZ I QA + TestFlight + Play kapalı test (kişisel hesapsa min. 14 gün)
Hafta 5-6 ████ FAZ J gönderim → inceleme → kademeli yayın
```

**Kritik yol:** iyzico sözleşme/KYC ve (kişisel Play hesabıysa) 12-tester/14-gün şartı. İkisi de kod dışı — ilk gün başlatılmalı.

---

## 4. Tam Engel Envanteri (kod referanslı)

### 🔴 P0 — Mağazaya çıkışı bloklar

| Sorun | Konum |
|---|---|
| `colors.xml` yok, styles.xml tanımsız renklere referans veriyor | `android/app/src/main/res/values/styles.xml:7-9` |
| iOS bundle ID `com.oyna.app.kerem` | `ios/App/App.xcodeproj/project.pbxproj:375,397` |
| Podfile ölü yol + 6 plugin pod'u eksik | `ios/App/Podfile:1,11-14` |
| iOS entitlements yok (Push + Apple Sign-In) | `ios/App/App/` (dosya yok) |
| Android izinleri eksik (konum/kamera/bildirim) | `android/app/src/main/AndroidManifest.xml:40-41` |
| Release keystore/imzalama yok | `android/app/build.gradle:19-24` |
| Varsayılan Capacitor ikon + splash | `android/.../mipmap-*`, `drawable-*/splash.png` |
| Yasal metin yer tutucuları + hosted privacy URL yok | `views/LegalScreen.tsx:15-16` |
| Ödeme UI simülasyonu (kart verisi gönderilmiyor) | `views/PaymentScreen.tsx:136-138` |
| `admin-broadcast` fail-open | `supabase/functions/admin-broadcast/index.ts:18-21` |
| Legacy `push-notification` auth'suz + deprecated FCM API | `supabase/functions/push-notification/index.ts:68-73` |

### 🟡 P1 — Lansman sürümünde düzeltilmeli

| Sorun | Konum |
|---|---|
| Geliştirici Konsolu tüm kullanıcılara açık (ölü Seed butonu, "Firebase" metni) | `views/SettingsScreen.tsx:306,556-576` |
| KVKK kanun no hatası "6379" (doğrusu 6698) | `views/AuthScreen.tsx:102` |
| Hesap silme 30 gün (UI) vs 7 gün (backend) | `views/SettingsScreen.tsx:39,84` vs migration `20260708000001` |
| `IS_LOCAL_DEV` env yoksa sessizce dev moda düşüyor | `store.ts:74-76`, `services/pitchBookingService.ts:14-16` |
| profiles PII herkese okunur (KVKK) | GO_LIVE_CHECKLIST.md §D.3 |
| Edge CORS `*` | tüm edge fonksiyonları |
| `ic_stat_oyna` bildirim ikonu yok | `capacitor.config.ts:35` |
| iPad tüm orientation'ları destekliyor iddiası, portre kilidi yok | `ios/App/App/Info.plist` |
| versionCode/Name yer tutucu (1.0/1 vs uygulama v3.0.0) | her iki platform |
| Kalan `USING (true)` policy'lerin canlı denetimi | 13 migration dosyası |
| `.gitignore`'da keystore/google-services girdileri yok | `.gitignore` |

### 🟢 P2 — Lansman sonrası

- `arsiv/` temizliği, `config 2.xml`, `metadata.json` adı (hızlıysa lansman öncesi de olur)
- Universal links / App Links (`@capacitor/app` + assetlinks.json + AASA)
- Kullanılmayan Capacitor plugin'lerinin (camera/haptics/local-notifications) kaldırılması veya kullanımı
- targetSdk 36 yükseltmesi (31 Ağustos 2026 sınırı)
- İngilizce i18n, çevrimdışı deneyim, gerçek payout API, CI'da native build doğrulaması

---

## 5. Kod Dışı Gereksinim Özeti (KURUCU yapılacaklar listesi)

1. **Şirket/vergi:** iyzico sözleşmesi ve mağaza kurumsal hesapları için şirket ünvanı gerekiyor — yasal metinlerdeki `[ŞİRKET ÜNVANI]` de buna bağlı.
2. **Apple Developer** ($99/yıl) — şirketse D-U-N-S.
3. **Google Play Console** ($25) — **kurumsal hesap** (12-tester şartından muaf olmak için).
4. **iyzico** canlı anahtarlar + KYC.
5. **Firebase** projesi (FCM için) + APNs .p8 anahtarı.
6. **Alan adı & e-posta:** oyna.app landing + `/gizlilik` + `/hesap-silme` sayfaları; `iletisim@`/`destek@` posta kutuları.
7. **Avukat:** 4 yasal metin + KVKK/VERBİS değerlendirmesi.
8. **Tasarımcı:** ikon, splash, ekran görüntüleri, feature graphic.
9. **Secrets seti** (Supabase Edge): `PAYMENT_*`, `IYZICO_*`, `APNS_*`, `GOOGLE_*`, `WEBHOOK_SECRET`, `ADMIN_EDGE_SECRET`, `ALLOWED_ORIGIN`, `ADMIN_ALLOWED_ORIGIN`, `RESEND_API_KEY` (e-posta), `VITE_SENTRY_DSN`, `VITE_POSTHOG_KEY`.

---

## 6. Kaynaklar

- [Google Play target API gereksinimi](https://support.google.com/googleplay/android-developer/answer/11926878) — 31.08.2026'dan itibaren yeni uygulamalar API 36
- [Apple Upcoming Requirements](https://developer.apple.com/news/upcoming-requirements/) — 28.04.2026'dan beri iOS 26 SDK/Xcode 26 zorunlu
- Repo içi: `docs/master/GO_LIVE_CHECKLIST.md`, `docs/master/OYNA_GO_LIVE_IYZICO.md`, `docs/master/OYNA_YOL_HARITASI.md` (Faz 7.5 mağaza hazırlığı)
