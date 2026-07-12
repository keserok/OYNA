# OYNA — Mağaza Gönderim Rehberi (Google Play + App Store)

> **Tarih:** 12 Temmuz 2026 · **Branch:** `claude/app-store-submission-f4kn1i`
> Bu rehber, mağazalara **gönderilecek paketlerin nasıl üretildiğini** ve kalan
> KURUCU adımlarını anlatır. Strateji/plan için: `STORE_LANSMAN_PLANI.md`.

---

## 1. Bu branch'te yapılanlar (kod tarafı)

### UI / WebView sertleştirmesi (her iki platform)
- **Fontlar yerelleştirildi:** Google Fonts CDN kaldırıldı; Inter + Space Grotesk
  artık `@fontsource` paketlerinden gömülü geliyor (latin + latin-ext = Türkçe
  karakterler). Çevrimdışı/yavaş ağda ilk açılışta yazı tipi bozulmaz — App
  Review uçak modunda test eder.
- `overscroll-behavior-y: none` → WebView'de sayfa kenarı sekmesi/pull-to-refresh
  kazaları kapatıldı (uygulama içi scroll alanları etkilenmez).
- `-webkit-text-size-adjust: 100%` → iOS otomatik font şişmesi engellendi.
- `touch-action: manipulation` (buton/link) → çift dokunma zoom'u ve 300ms
  dokunma gecikmesi kaldırıldı.
- `-webkit-touch-callout: none` (gövde) → iOS uzun basış balonu kapatıldı;
  metin girişlerinde seçim/kopyalama açık bırakıldı.
- `format-detection: telephone=no` → iOS'un rastgele sayıları telefon linkine
  çevirmesi engellendi.
- Mevcut safe-area (çentik/home-indicator) altyapısı doğrulandı:
  `viewport-fit=cover` + `env(safe-area-inset-*)` yardımcı sınıfları BottomNav
  ve başlıklarda kullanılıyor.

### Store uyumluluğu
- **Android `READ_CONTACTS` izni eklendi** — Rehber eşleştirme özelliği
  (contactsService) izinsiz çağrıda çöküyordu.
- **iOS `NSContactsUsageDescription` eklendi** — bu metin olmadan rehber izni
  istendiği anda uygulama **crash** olur = kesin App Store reddi.
- **iOS Podfile'a `CapacitorCommunityContacts` pod'u eklendi** (`cap sync ios`).
- **`PrivacyInfo.xcprivacy` oluşturuldu ve Xcode projesine bağlandı** — Apple'ın
  Mayıs 2024'ten beri zorunlu tuttuğu gizlilik manifestosu (toplanan veri
  türleri + erişilen API kategorileri). App Store Connect "App Privacy"
  formuyla tutarlı tutulmalı.
- **`ITSAppUsesNonExemptEncryption = false`** — her gönderimde sorulan ihracat
  uyumluluğu sorusunu otomatik geçer (yalnız standart HTTPS kullanılıyor).
- **Android `uses-feature` bildirimleri** (kamera/konum `required=false`) —
  kamerasız tablet vb. cihazlar Play'de gereksiz filtrelenmez.
- `npx cap sync android` (11 plugin) + `npx cap sync ios` temiz.

### Paket üretim altyapısı
- `.github/workflows/android-release.yml` — CI'da imzalı AAB üretimi.
- `.github/workflows/ios-release.yml` — macOS koşucusunda (Xcode 26) .ipa
  üretimi + opsiyonel TestFlight yüklemesi.

---

## 2. Google Play paketi (.aab)

### Yerel üretim
```bash
npm ci && npm run build && npx cap sync android
cd android
# key.properties + oyna-upload.keystore hazır olmalı (aşağıya bak)
./gradlew bundleRelease
# Çıktı: android/app/build/outputs/bundle/release/app-release.aab
```

### İmzalama (upload key)
- `android/key.properties` (repoya GİRMEZ — .gitignore'da):
  ```properties
  storeFile=../oyna-upload.keystore
  storePassword=***
  keyAlias=oyna-upload
  keyPassword=***
  ```
- Keystore yoksa üret:
  ```bash
  keytool -genkeypair -v -keystore android/oyna-upload.keystore \
    -alias oyna-upload -keyalg RSA -keysize 2048 -validity 10950 \
    -dname "CN=OYNA, OU=Mobile, O=OYNA, L=Istanbul, C=TR"
  ```
- Play Console'da **Play App Signing**'e kaydol (Google asıl imzalama anahtarını
  yönetir; senin anahtarın yalnız "upload key" olur — kaybolursa sıfırlanabilir).
- ⚠️ Keystore + parolayı **şifre kasasında** sakla; repoya/mesajlaşmaya koyma.

### Yükleme öncesi kontrol listesi
- [ ] `android/app/google-services.json` koyuldu mu? (FCM push — yoksa derlenir
      ama push çalışmaz)
- [ ] `versionCode` bir öncekinden büyük mü? (`android/app/build.gradle` — ilk
      gönderim için `1` doğru)
- [ ] Play Console → Data Safety formu dolduruldu mu? (konum, e-posta, ad,
      fotoğraf, rehber-hash, cihaz ID, analitik, çökme verisi)
- [ ] Gizlilik politikası URL'i girildi mi? (`https://<domain>/gizlilik.html`)
- [ ] Kişisel hesapsa: 12 tester × 14 gün kapalı test şartı (kurumsal hesapta yok)

---

## 3. App Store paketi (.ipa)

Linux'ta Xcode çalışmadığı için iki yol var:

### Yol A — GitHub Actions (önerilen)
1. App Store Connect → Users and Access → Integrations → **API Key** üret
   (App Manager rolü yeterli). `.p8` dosyasını indir.
2. Repo secrets'a ekle: `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_API_KEY_P8`
   (p8 dosyasının içeriği).
3. Actions → **iOS Release (App Store)** → Run workflow.
   - `upload_to_testflight=true` → doğrudan TestFlight'a yüklenir.
   - `false` → .ipa artefakt olarak iner, Transporter app ile yüklersin.
4. Cloud-managed imzalama otomatik çalışır (`-allowProvisioningUpdates`);
   kendi Distribution sertifikanı kullanmak istersen `IOS_DIST_CERT_P12`
   (base64) + `IOS_DIST_CERT_PASSWORD` secrets'larını ekle.

### Yol B — Yerel macOS
```bash
npm ci && npm run build && npx cap sync ios
cd ios/App && pod install
open App.xcworkspace   # Xcode 26+
# Signing & Capabilities → Team seç → Product → Archive → Distribute App
```

### Yükleme öncesi kontrol listesi
- [ ] Apple Developer'da `com.oyna.app` App ID'sinde **Push Notifications** +
      **Sign in with Apple** capability'leri açık mı?
- [ ] APNs Auth Key (.p8) üretilip Supabase edge secrets'a girildi mi?
      (`APNS_KEY_ID/TEAM_ID/PRIVATE_KEY/BUNDLE_ID/PRODUCTION`)
- [ ] App Store Connect'te uygulama kaydı (`com.oyna.app`) açıldı mı?
- [ ] App Privacy etiketleri `PrivacyInfo.xcprivacy` ile tutarlı dolduruldu mu?
- [ ] App Review notu: ödeme **fiziksel hizmet** (halı saha kiralama) olduğu
      için IAP muaf — Guideline 3.1.5(a); demo/test hesabı bilgisi eklendi mi?
      (OTP'siz girilebilen reviewer hesabı şart)
- [ ] Ekran görüntüleri: iPhone 6.9" + 6.5" (zorunlu)

---

## 4. Sürüm stratejisi

| Alan | Değer | Nerede |
|---|---|---|
| Sürüm adı | `3.0.0` | `package.json`, `android/app/build.gradle` (versionName), Xcode `MARKETING_VERSION` |
| Android `versionCode` | `1` → her Play yüklemesinde +1 | `android/app/build.gradle` |
| iOS `CURRENT_PROJECT_VERSION` | `1` → her TestFlight yüklemesinde +1 (CI'da `manageAppVersionAndBuildNumber` otomatik artırır) | Xcode project |

---

## 5. Kalan KURUCU (kod dışı) adımlar

1. **Firebase:** `google-services.json` → `android/app/` (push için zorunlu).
2. **APNs .p8** anahtarı + Supabase secrets (iOS push).
3. **Mağaza hesapları:** Apple Developer ($99/yıl), Play Console ($25 — kurumsal
   hesap önerilir: 12-tester/14-gün şartından muaf).
4. **Yasal:** avukat onaylı metinler + `[ŞİRKET ÜNVANI]` doldurma; herkese açık
   gizlilik politikası URL'i (`public/gizlilik.html` Vercel'de yayında olmalı).
5. **iyzico** canlı anahtarlar (veya ödemeyi feature-flag ile gizleyip ödemesiz
   lansman — bkz. STORE_LANSMAN_PLANI Faz D karar noktası).
6. **Marka içerikleri:** ekran görüntüleri, feature graphic (1024×500), mağaza
   metinleri.
7. **Gerçek cihaz QA:** izin reddi senaryoları, çentikli cihazda safe-area,
   push teslimatı (simülatörde olmaz).
