# 🍎 OYNA — iOS'a Çıkış Rehberi (Kurucu için, sıfırdan yayına)

> **Kimin için:** Kod bilgisi olmayan kurucu. Her adım "nereye tıkla, ne yaz, ne görmelisin" düzeyinde anlatılmıştır.
> **Ön koşul:** Apple Developer Program üyeliği (✅ alındı).
> **Doğrulama notu:** Bu rehberdeki Apple kuralları (Xcode 26 zorunluluğu, tek ekran görüntüsü boyutu,
> yeni yaş derecelendirmesi 13+/16+/18+) ve Supabase anahtar isimleri **22 Temmuz 2026'da tek tek doğrulanmıştır.**
> Anahtar isimleri koddaki `send-push` fonksiyonuyla birebir aynıdır — farklı yazarsan push çalışmaz.

---

## 🗺️ Yol haritası — tek bakışta

| Aşama | Ne yapılıyor | Nerede | Süre | Mac gerekir mi? |
|---|---|---|---|---|
| **1** | Apple + Supabase panel hazırlığı (push anahtarı, ayarlar) | Tarayıcı | ~45 dk | ❌ Hayır — **bugün yapılabilir** |
| **2** | Mac'i hazırlama (Xcode + araçlar + projeyi indirme) | Mac | ~1,5 saat (çoğu bekleme) | ✅ |
| **3** | Uygulamayı derleyip **kendi iPhone'unda** çalıştırma | Mac + iPhone | ~45 dk | ✅ |
| **4** | App Store Connect'te uygulama kaydı + formlar | Tarayıcı | ~30 dk | ❌ (Aşama 1.5 yapıldıysa) |
| **5** | Ekran görüntüleri + mağazaya yükleme (Archive) | Mac | ~45 dk | ✅ |
| **6** | TestFlight ile gerçek test (push dahil) | iPhone + tarayıcı | ~30 dk | ❌ |
| **7** | İncelemeye gönderme | Tarayıcı | ~30 dk | ❌ |
| **8** | Onay → yayın → ilk hafta takibi | Tarayıcı | — | ❌ |

**Gerçekçi takvim:** Aşama 1'i bugün yap → Mac'e eriştiğin gün Aşama 2–5 biter → Apple incelemesi genelde 24–48 saat → **Mac'li günden ~3-4 gün sonra App Store'dasın.**

---

## 0. Kod tarafında hazır olanlar (senin bir şey yapmana gerek yok)

| Konu | Durum |
|---|---|
| Uygulama kimliği (`com.oyna.app`), sürüm 3.0.0, yalnız iPhone + dikey mod | ✅ |
| OYNA markalı uygulama ikonu (1024×1024) ve açılış ekranı | ✅ |
| Türkçe izin açıklamaları: konum, kamera, fotoğraflar, rehber | ✅ |
| Push bildirim altyapısı (APNs token köprüsü dahil — onarıldı) | ✅ |
| Apple ile Giriş (native) + Google + e-posta girişi | ✅ |
| Derin bağlantılar (`oyna://` — bildirime tıklayınca doğru ekran açılır) | ✅ |
| Çentik/Dynamic Island boşlukları, klavye davranışı, lastik-bant esnemesi kapalı | ✅ |
| Şifreleme/ihracat sorusu baştan cevaplandı — yüklemede form çıkmaz | ✅ |
| Hesap silme akışı (Apple zorunlu şartı) + yasal sayfalar (`/gizlilik` vb.) | ✅ |
| Sağlık: tip denetimi temiz · 488/488 test · üretim derlemesi · iOS senkronu (12 eklenti) | ✅ |

---

## 1. İhtiyaç listesi

- [ ] **Mac** — zorunlu; Apple, iOS uygulamalarının yalnız Mac'te paketlenmesine izin verir.
  - Uygun Mac: **M serisi işlemcili (M1/M2/M3/M4)** ve **macOS 15.6 veya daha yenisini** çalıştırabilen bir Mac
    (Xcode 26'nın şartı). En az **40 GB boş disk** olsun.
  - Kendi Mac'in yoksa: yakınından yarım günlüğüne ödünç al **veya** kiralık bulut Mac
    (MacinCloud, MacStadium — aylık ~30-50 $, tarayıcıdan bağlanırsın).
- [ ] **Apple Developer hesabın** (developer.apple.com'a girebildiğin Apple ID + şifre; telefonunda
  Apple'ın iki adımlı onay kodları gelecek — telefonun yanında olsun).
- [ ] **iPhone + kablo** (gerçek test için; herhangi bir model olur).
- [ ] **GitHub hesabın** (keserok/OYNA deposuna erişimi olan).

---

# AŞAMA 1 — Tarayıcıdan hazırlık (Mac gerekmez, bugün yap · ~45 dk)

Bu aşamanın tamamı web tarayıcısında yapılır. Sonunda: bildirim anahtarın üretilmiş,
Supabase'e tanıtılmış ve Apple ile Giriş etkinleştirilmiş olacak.

## 1.1 APNs push anahtarı üret (~10 dk)

APNs = Apple'ın bildirim gönderme servisi. OYNA'nın sunucusu bildirimleri bu anahtarla imzalayıp Apple'a verir.

1. Tarayıcıda **developer.apple.com** → sağ üstten **Account** → Apple ID'nle gir.
2. **Certificates, Identifiers & Profiles** kutusuna tıkla → sol menüden **Keys** → mavi **(+)** düğmesi.
3. **Key Name** alanına `OYNA APNs` yaz.
4. Listeden **Apple Push Notifications service (APNs)** satırının kutusunu işaretle → sağ üst **Continue** → **Register**.
5. **Download** düğmesiyle dosyayı indir. Dosya adı `AuthKey_XXXXXXXXXX.p8` biçimindedir.
   - ⚠️ **BU DOSYA YALNIZ BİR KEZ İNDİRİLEBİLİR.** Hemen güvenli iki yere yedekle (ör. iCloud Drive + e-postana gönder).
6. Aynı sayfada görünen **Key ID**'yi not al (10 haneli, örn. `ABC123DEFG` — dosya adındaki XXXXXXXXXX ile aynıdır).
7. **Team ID**'ni not al: sayfanın sağ üstünde adının altında yazar (10 haneli). Göremezsen:
   **Account → Membership details** sayfasında "Team ID" satırı.

> ✅ **Kontrol:** Elinde 3 şey olmalı: `.p8` dosyası + Key ID + Team ID.

## 1.2 Anahtarı Supabase'e tanıt (~10 dk)

1. **supabase.com/dashboard** → OYNA projesine gir.
2. Sol menüden **Edge Functions** → üstte **Secrets** (bazı sürümlerde: Project Settings → Edge Functions → Secrets).
3. **Add new secret** ile şu 5 kaydı **tek tek, isimleri BİREBİR bu şekilde** ekle:

| Name (isim) | Value (değer) |
|---|---|
| `APNS_KEY_ID` | 1.1'de not ettiğin Key ID (örn. `ABC123DEFG`) |
| `APNS_TEAM_ID` | Team ID (10 haneli) |
| `APNS_PRIVATE_KEY` | `.p8` dosyasını **TextEdit/Not Defteri ile aç**, İÇİNDEKİ HER ŞEYİ kopyala-yapıştır (`-----BEGIN PRIVATE KEY-----` ve `-----END PRIVATE KEY-----` satırları DAHİL) |
| `APNS_BUNDLE_ID` | `com.oyna.app` |
| `APNS_PRODUCTION` | `true` |

> ✅ **Kontrol:** Secrets listesinde 5 yeni satır görünmeli. İsimlerde boşluk/küçük harf olmamalı.

## 1.3 Bildirim güvenlik şifresi: `WEBHOOK_SECRET` (~5 dk — atlanırsa push HİÇ çalışmaz)

OYNA'da bir bildirim doğduğunda veritabanı, push gönderen fonksiyonu bir "web kancasıyla" dürter.
Bu kancanın yetkisiz kullanılamaması için ortak bir gizli şifre gerekir. **Aynı değer iki yere girilir:**

1. Uzun, rastgele bir şifre üret (örn. iPhone'da Şifreler uygulamasından ya da 30+ karakterlik anlamsız bir dizi yaz). Not al.
2. **Birinci yer** — Supabase → **Edge Functions → Secrets** → yeni secret:
   - Name: `WEBHOOK_SECRET` · Value: ürettiğin şifre.
3. **İkinci yer** — Supabase → sol menü **Database → Webhooks** → listede `notifications` tablosunun
   **INSERT** webhook'una tıkla → **Edit** → **HTTP Headers** bölümüne yeni başlık ekle:
   - Header name: `Authorization`
   - Header value: `Bearer ürettiğin-şifre`  ← `Bearer` kelimesi + bir boşluk + şifre. Kaydet.

> ✅ **Kontrol:** Secrets'ta `WEBHOOK_SECRET` var VE webhook'un başlıklarında `Authorization` görünüyor.
> İkisindeki şifre birebir aynı olmalı.

## 1.4 Apple ile Giriş'i Supabase'e tanıt (~3 dk)

1. Supabase → sol menü **Authentication** → **Sign In / Providers** (eski adı: Providers).
2. Listeden **Apple**'a tıkla → **Enable** anahtarını aç.
3. **Client IDs** (Authorized Client IDs) alanına şunu yaz: `com.oyna.app` → **Save**.
   - "Secret Key" alanını BOŞ bırakabilirsin — o yalnız web sitesinden Apple girişi için gerekir; iOS uygulaması için gerekmez.

> ✅ **Kontrol:** Apple satırı "Enabled" görünmeli. Bu yapılmazsa uygulamada Apple ile Giriş
> "Unacceptable audience" hatası verir.

## 1.5 Uygulama kimliğini (App ID) Apple'a kaydet (~5 dk)

Bu kayıt, `com.oyna.app` kimliğini Apple sisteminde resmileştirir. (Xcode bunu otomatik de yapabilir
ama elle yaparsan Aşama 4'ü Mac beklemeden tamamlayabilirsin.)

1. **developer.apple.com → Account → Certificates, Identifiers & Profiles** → sol menü **Identifiers** → **(+)**.
2. **App IDs** seç → Continue → tür olarak **App** seç → Continue.
3. Doldur:
   - **Description:** `OYNA`
   - **Bundle ID:** **Explicit** seçili olsun ve tam olarak şunu yaz: `com.oyna.app`
4. **Capabilities** listesinde şu ikisinin kutusunu işaretle:
   - ✅ **Push Notifications**
   - ✅ **Sign in with Apple**
5. **Continue → Register**.

> ✅ **Kontrol:** Identifiers listesinde `com.oyna.app` görünmeli.
> ⚠️ Bundle ID'de yazım hatası yapma — sonradan değiştirilemez, birebir `com.oyna.app` olmalı.

---

# AŞAMA 2 — Mac'i hazırla (bir kereliğine · ~1,5 saat, çoğu bekleme)

## 2.1 Xcode'u kur (~1 saat, indirme hızına bağlı)

Xcode = Apple'ın resmi uygulama derleme programı. Ücretsizdir.

1. Mac'te **App Store** uygulamasını aç → **"Xcode"** ara → **Yükle / Get**. (~10 GB, sabır ☕)
2. Kurulunca Xcode'u **bir kez aç**:
   - Lisans sözleşmesi çıkarsa **Agree**.
   - "Install additional components?" sorarsa **Install** (Mac şifreni ister).
   - **iOS platform desteği** indirmek isterse onayla (birkaç GB daha).
3. Xcode menüsü → **Settings → Accounts** → sol alttaki **(+)** → **Apple Account** → geliştirici Apple ID'nle gir.

> ✅ **Kontrol:** Xcode → Settings → Accounts'ta Apple ID'n ve altında takım adın (Team) görünmeli.
> ⚠️ **Sürüm şartı:** Xcode **26 veya üstü** olmalı (Xcode menüsü → About Xcode'dan bak). Apple,
> 28 Nisan 2026'dan beri mağaza yüklemelerinde bunu zorunlu tutuyor. App Store zaten en yenisini kurar;
> güncelleme uyarısı görürsen kur.

## 2.2 Terminal araçlarını kur (~15 dk)

**Terminal**'i aç (⌘+boşluk → "Terminal" yaz → Enter). Aşağıdaki komutları **sırayla** kopyala-yapıştır,
her birinin bitmesini bekle. (Şifre sorarsa Mac oturum şifreni yaz — ekranda görünmez, normaldir.)

```bash
# 1) Homebrew — Mac için program yükleyici
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```
> Kurulum sonunda "Next steps" başlığı altında 1-2 komut gösterirse onları da kopyalayıp çalıştır
> (genelde `eval "$(/opt/homebrew/bin/brew shellenv)"` benzeri). Sonra Terminal'i kapatıp yeniden aç.

```bash
# 2) Node.js (uygulamanın web katmanını derler) + CocoaPods (iOS eklentilerini bağlar)
brew install node cocoapods
```

> ✅ **Kontrol:** `node --version` yazınca `v2x.x.x` gibi bir sürüm, `pod --version` yazınca `1.x` görmelisin.

## 2.3 Projeyi Mac'e indir (~5 dk)

```bash
cd ~/Desktop
git clone https://github.com/keserok/OYNA.git
cd OYNA
```

- GitHub kullanıcı adı/şifre sorarsa: şifre alanına normal şifren DEĞİL, "token" gerekir:
  github.com → profil fotoğrafın → **Settings → Developer settings → Personal access tokens →
  Tokens (classic) → Generate new token** → "repo" kutusunu işaretle → üret → çıkan uzun metni
  şifre yerine yapıştır.
- Daha kolayı: **GitHub Desktop** uygulamasını kur (desktop.github.com), oradan "Clone repository" ile
  keserok/OYNA'yı indir, sonra Terminal'de `cd` ile klasörüne gir.

> ✅ **Kontrol:** `ls` yazınca aralarında `package.json`, `ios`, `android` olan dosya listesi görünmeli.
> (Tüm iOS hazırlıkları `main` dalında birleşik — ekstra dal değiştirmene gerek yok.)

---

# AŞAMA 3 — Derle ve KENDİ iPhone'unda çalıştır (~45 dk)

## 3.1 Derleme komutları (~10 dk)

Terminal'de, OYNA klasörünün içindeyken sırayla:

```bash
npm install          # bağımlılıkları indirir (birkaç dakika)
npm run build        # uygulamanın web katmanını üretir (≈15 sn)
npx cap sync ios     # üretileni iOS projesine kopyalar
cd ios/App
pod install          # iOS eklentilerini bağlar (ilk seferde birkaç dakika)
cd ../..
npx cap open ios     # Xcode'da projeyi açar
```

> ✅ **Kontrol:** `pod install` sonunda "Pod installation complete! ... 12 total pods installed." benzeri
> bir satır görmelisin. Son komut Xcode'u otomatik açar.
> ⚠️ Xcode'da SOL üstte **App.xcworkspace** yazmalı (App.xcodeproj değil) — `npx cap open ios` doğrusunu açar.

## 3.2 İmzalama — Team seç (ilk seferde bir kez, ~3 dk)

"İmzalama", uygulamanın senin hesabınla mühürlenmesi demek. Apple imzasız uygulama çalıştırmaz.

1. Xcode'da sol paneldeki dosya listesinin EN ÜSTÜNDEKİ mavi **App** simgesine tıkla.
2. Orta alanda **TARGETS** altındaki **App**'i seç → üst sekmelerden **Signing & Capabilities**.
3. **Team** açılır listesinden **kendi adını/hesabını** seç.
   - Listede yoksa: Xcode → Settings → Accounts'tan Apple ID ekle (2.1 adım 3), sonra tekrar dene.
   - Projede önceki bir geliştirici takımı seçili kalmış olabilir — senin seçimin onu düzeltir.
4. **Automatically manage signing** işaretli kalsın.

> ✅ **Kontrol:** Birkaç saniye içinde kırmızı hata kaybolur; "Signing Certificate: Apple Development ..."
> yazısı görünür. Capabilities bölümünde **Push Notifications** ve **Sign in with Apple** zaten listelidir.

## 3.3 iPhone'a yükle ve aç (~10 dk)

1. iPhone'u kabloyla Mac'e bağla. Telefonda **"Bu Bilgisayara Güvenilsin mi?" → Güven** (şifreni girer).
2. Xcode'un üst-orta kısmındaki cihaz seçiciden (şerit üzerinde simülatör adı yazar) **kendi iPhone'unu** seç.
3. Sol üstteki **▶ (çalıştır)** düğmesine bas. İlk derleme 2–5 dk sürer.
4. **Karşına çıkabilecek iki telefon ayarı** (ikisi de bir kere yapılır):
   - **"Developer Mode gerekli"** uyarısı: iPhone'da **Ayarlar → Gizlilik ve Güvenlik → Geliştirici Modu**
     → aç → telefon yeniden başlar → açılışta onayla. Sonra Xcode'da tekrar ▶.
   - **"Güvenilmeyen Geliştirici"** uyarısı: iPhone'da **Ayarlar → Genel → VPN ve Aygıt Yönetimi** →
     geliştirici hesabın → **Güven**.

> ✅ **Kontrol:** OYNA telefonunda açılmış olmalı. 🎉 Bu senin uygulamanın gerçek iPhone'da ilk çalışması.

## 3.4 İlk kontrol turu (~10 dk)

Telefonda uygulamayı gez ve şunları işaretle:

- [ ] Açılış → kayıt/giriş ekranı düzgün; yazılar çentiğin/adanın altında kalmıyor.
- [ ] Yeni hesapla kaydol veya var olanla gir; klavye açılınca yazdığın alan görünür kalıyor.
- [ ] Saha keşfi → konum izni **Türkçe açıklamayla** soruluyor; harita açılıyor.
- [ ] Sosyal → arkadaş ekle → rehber izni Türkçe metinle soruluyor.
- [ ] Maç/bilet ekranında QR görünüyor; kamera izni sorunsuz.
- [ ] Denetim Merkezi'nden uçak moduna al → uygulama çökmüyor, "bağlantı yok" şeridi çıkıyor → uçak modunu kapat.
- [ ] **Not:** Bu kurulumda push bildirimi ve Apple ile Giriş tam ÇALIŞMAYABİLİR — normaldir; gerçek test
  Aşama 6'da (TestFlight) yapılır. (Xcode, geliştirme kurulumunda bildirim ortamını otomatik "test" moduna alır.)

Sorun görürsen ekran görüntüsü al, not et — kod tarafına geliştiricin (ya da Claude) bakar.

---

# AŞAMA 4 — App Store Connect'te uygulama kaydı (~30 dk, tarayıcı)

App Store Connect = mağaza yönetim panelin. (Aşama 1.5'i yaptıysan Mac'ten bağımsız, istediğin an yapabilirsin.)

## 4.1 Kayıt oluştur

1. **appstoreconnect.apple.com** → gir → **Apps (Uygulamalarım)** → **(+) → New App**.
2. Formu doldur:
   - **Platforms:** iOS
   - **Name:** `OYNA`  (alınmışsa: `OYNA — Halı Saha & Maç` gibi bir varyasyon)
   - **Primary Language:** Turkish
   - **Bundle ID:** listeden **com.oyna.app** seç (listede yoksa → Aşama 1.5'i yap, sayfayı yenile)
   - **SKU:** `oyna-app` (senin iç kodun; kullanıcı görmez)
   - **User Access:** Full Access
3. **Create**.

> ✅ **Kontrol:** Uygulama sayfan açılır; sol üstte OYNA + "3.0.0 Prepare for Submission" görünür.

## 4.2 App Information (sol menü)

- **Category:** Primary **Sports** · Secondary **Social Networking** (isteğe bağlı).
- **Content Rights:** "does not contain third-party content" seç (üçüncü taraf lisanslı içerik yok).
- **Age Rating → Edit:** Anketi **dürüst** doldur. Apple'ın YENİ sistemi (2026) 4+/9+/13+/16+/18+ kademelerini kullanır.
  OYNA için kritik cevaplar: kullanıcılar arası **mesajlaşma VAR**, kullanıcı içeriği VAR, konum özellikleri VAR;
  şiddet/kumar/alkol YOK. Beklenen sonuç: **13+**. (Anket farklı sorular gösterirse şaşırma — 2026'da yenilendi;
  dürüst cevapla, sonuç ne çıkarsa odur.)

## 4.3 App Privacy (gizlilik beyanı — sol menüde "App Privacy")

1. **Privacy Policy URL:** `https://<alan-adın>/gizlilik`
   (Uygulamanın Vercel yayını bu sayfayı otomatik sunar. Özel alan adın yoksa Vercel'in verdiği
   `https://xxx.vercel.app/gizlilik` adresi de kabul edilir — yeter ki tarayıcıda açılıyor olsun. Kontrol et.)
2. **Get Started** ile veri anketine başla. Şunları **"topluyoruz"** olarak işaretle ve her biri için amaç sor(ul)duğunda
   **App Functionality** seç, **"Used for Tracking" sorusuna HEPSINDE Hayır** de:

| Apple kategorisi | OYNA'daki karşılığı | "Linked to identity?" |
|---|---|---|
| Contact Info → Name, Email, Phone Number | Profil bilgileri | Yes |
| Location → Precise Location | Yakındaki saha/maç bulma | Yes |
| Contacts | Rehberden arkadaş bulma (isteğe bağlı; numaralar cihazda şifrelenir) | **No** |
| User Content → Photos | Profil fotoğrafı | Yes |
| Identifiers → User ID, Device ID | Hesap + bildirim adresi (push token) | Yes |
| Usage Data → Product Interaction | Kullanım analitiği | Yes |
| Diagnostics → Crash Data | Çökme raporları | No |
| Financial Info → Payment Info | Ödeme (iyzico'ya iletilir, bizde saklanmaz) | Yes |

> ✅ **Kontrol:** Özet ekranında "Data Used to Track You" bölümü **BOŞ** olmalı; "Data Linked to You" dolu olabilir.

## 4.4 Fiyat ve ülkeler

- Sol menü **Pricing and Availability** → **Price:** `0 (Free)`.
- **Availability:** ilk sürüm için önerim **yalnız Türkiye** (listeden diğerlerini kaldır).
  - Bunun bonusu: Avrupa ülkeleri kapalıyken AB'nin "Trader Status" (esnaf/tacir beyanı) zorunluluğu
    seni engellemez. İleride Avrupa'yı açarsan bu beyan istenecek — o gün ayrıca bakarız.

---

# AŞAMA 5 — Ekran görüntüleri + mağazaya yükleme (Mac · ~45 dk)

## 5.1 Ekran görüntüleri (~20 dk)

**İyi haber:** Apple artık **tek boyut** istiyor: 6.9 inç, **1320 × 2868 piksel (dikey)**. Diğer tüm
telefon boyutlarına Apple kendisi ölçekler. En az 3, ideali 5 görüntü.

**En kolay yöntem — Xcode simülatörü** (elinde Pro Max olmasa da doğru boyutu verir):

1. Xcode'da üstteki cihaz seçiciden **iPhone 17 Pro Max** (simülatör) seç → **▶**.
   (İlk açılış yavaştır; sahte bir iPhone ekranı açılır ve OYNA içinde çalışır.)
2. Simülatörde uygulamada gez, giriş yap ve şu 5 ekranı hazırla:
   **Panel (FUT kartı) · Saha haritası · Maç lobisi · Taktik stüdyosu · Maç bileti (QR)**.
3. Her ekranda **⌘+S** bas — görüntü Masaüstü'ne tam 1320×2868 boyutunda kaydedilir.
   - Simülatörde Apple girişi/push çalışmaz — görüntü almak için e-posta hesabıyla gir, sorun değil.
4. App Store Connect → uygulaman → **App Store** sekmesi → 3.0.0 sürümü → **App Previews and Screenshots**
   → dosyaları sürükleyip bırak.

## 5.2 Mağaza metinleri (~10 dk)

Aynı 3.0.0 sayfasında, **Ek A'daki hazır metinleri** ilgili alanlara yapıştır:
**Promotional Text** · **Description** · **Keywords** · **Support URL** (⚠️ gerçek bir web adresi olmalı,
e-posta adresi KABUL EDİLMEZ — `https://<alan-adın>` ya da `https://xxx.vercel.app` yaz) ·
**Copyright:** `2026 Miraç Kerem Çürüksulu`.

## 5.3 Derlemeyi App Store'a yükle (Archive, ~15 dk)

1. Xcode'da üstteki cihaz seçiciden **Any iOS Device (arm64)** seç (telefon/simülatör DEĞİL).
2. Menü çubuğu → **Product → Archive**. Derleme bitince **Organizer** penceresi açılır.
3. Sağdan **Distribute App** → **App Store Connect** → **Upload** → çıkan her ekranda varsayılanları
   kabul ederek ilerle → **Upload**.
   - "Manage Version and Build Number" gibi bir öneri çıkarsa kabul et (numaraları Xcode yönetsin).
4. "Upload Successful" ✅ gördükten sonra 10–30 dk bekle: derleme, App Store Connect →
   **TestFlight** sekmesinde "Ready to Test" olarak belirir (e-posta da gelir).

> ✅ **Kontrol:** TestFlight sekmesinde `3.0.0 (1)` satırı görünüyor.
> Şifreleme sorusu çıkmadıysa şaşırma — cevabını uygulamanın içine gömdük.
> ⚠️ İleride **aynı sürümü ikinci kez yüklersen** "build already exists" hatası alırsın → Xcode'da
> mavi App → General → **Build** sayısını 1 artır (1→2), tekrar Archive.

---

# AŞAMA 6 — TestFlight: mağaza sürümünü kendi telefonunda dene (~30 dk)

TestFlight = Apple'ın resmi deneme uygulaması. Mağazaya çıkacak sürümün BİREBİR aynısını test edersin.
**Push bildirimlerinin gerçek testi ancak burada yapılır.**

1. App Store Connect → **TestFlight** sekmesi → sol menü **Internal Testing** → **(+)** ile grup oluştur
   (adı: `İç Test`) → **Testers (+)** → kendi Apple ID e-postanı ekle.
2. iPhone'una App Store'dan **TestFlight** uygulamasını indir → sana gelen davet e-postasındaki
   **View in TestFlight**'a bas → OYNA'yı **Install** ile kur.
3. **Gerçek doğrulama listesi:**
   - [ ] Uygulama açılır, bildirim izni sorar → **İzin Ver**.
   - [ ] OPanel/GodView → Kampanyalar'dan kendine test bildirimi gönder → **telefona bildirim düştü mü?**
     (Gelmiyorsa: Aşama 1.2, 1.3'ü ve panelde "Gerçek Push Aktif" anahtarını kontrol et — bkz. Sorun Giderme.)
   - [ ] Bildirime dokun → uygulama **doğru ekranda** açılıyor mu? (derin bağlantı testi)
   - [ ] **Apple ile Giriş** dene — hem normal, hem "E-postamı Gizle" seçeneğiyle.
   - [ ] 3.4'teki kontrol turunu baştan yap.

> ✅ **Kontrol:** Push + Apple girişi + tur listesi tamamsa uygulaman incelemeye hazır demektir.

---

# AŞAMA 7 — İncelemeye gönder (~30 dk, tarayıcı)

## 7.1 İnceleme (demo) hesabı hazırla

Apple'ın incelemecisi uygulamaya girip bakacak; ona hazır bir hesap vermen zorunlu:

1. Supabase → **Authentication → Users → Add user → Create new user**:
   - Email: `review@oyna.app` (ya da herhangi bir gerçek adres) · Password: güçlü bir şifre üret, not al.
   - **Auto Confirm User** işaretli olsun (incelemeci e-posta onayı yapamaz).
2. İstersen bu hesapla bir kez girip profil kur — incelemeci dolu bir uygulama görür.

## 7.2 Gönderim formu

App Store Connect → uygulaman → **App Store** sekmesi → **3.0.0** sürüm sayfasında:

1. **Build** bölümü → **(+)** → TestFlight'a yüklediğin `3.0.0 (1)` derlemesini seç.
2. **App Review Information** bölümü:
   - **Sign-In Information:** ✅ "Sign-in required" işaretle → Username: inceleme hesabı e-postası ·
     Password: şifresi.
   - **Contact Information:** kendi adın, e-postan ve **telefonun** (Apple takılırsa arar/yazar).
   - **Notes:** **Ek B'deki İngilizce notu** aynen yapıştır (ödemenin fiziksel hizmet olduğu ve
     komisyon/IAP muafiyeti — reddedilmemenin anahtarı bu nottur).
3. **Version Release:** **"Manually release this version"** seç → onaydan sonra yayına NE ZAMAN
   çıkacağına sen karar verirsin.
4. Sağ üst **Add for Review / Submit** → varsa son sorular:
   - **Advertising Identifier (IDFA):** **No** (uygulamada reklam yok).
5. **Submit to App Review**. 🎉

**Bekleme:** Çoğu inceleme **24–48 saat**. Durum e-postayla ve panelden izlenir.
**Reddedilirse:** Panik yok — ilk gönderimde yaygındır ve çoğu tek düzeltmeyle geçer.
**Resolution Center**'daki mesajın ekran görüntüsünü geliştiricine/Claude'a ilet; cevap veya düzeltmeyle
yeniden gönderilir (yeniden incelemeler genelde daha hızlıdır).

---

# AŞAMA 8 — Onay sonrası: yayın ve ilk hafta

- [ ] Onay e-postası gelince: App Store Connect → sürüm sayfası → **Release This Version** → uygulama
  1-2 saat içinde App Store'da aranabilir olur.
- [ ] Yayın öncesi son anahtar kontrolü: `demo_mode_enabled = KAPALI` · demo verileri temiz ·
  `push_live_enabled = AÇIK` · Finans "Go-Live Ön-Uçuş" yeşil.
- [ ] İlk hafta her gün 5 dk: çökme raporları (Sentry) · mağaza yorumları · push teslimat logu (`push_log`).
- [ ] Sonraki güncellemelerde (3.0.1+): aynı Aşama 5.3 → 6 → 7 döngüsü. Güncellemelerde
  **Phased Release** (7 güne yayılan kademeli dağıtım) seçeneğini açık tut — ilk sürümde bu seçeneğin
  etkisi yoktur, güncellemelerde vardır.

---

## Ek A — Mağaza metinleri (kopyala-yapıştır)

**Subtitle (30 karakter):** `Halı Saha, Maç ve Kadro Kur`

**Promotional Text:**
`Maç bul, sahanı kirala, kadronu kur. Kalecin mi eksik? Dakikalar içinde kirala. Halı saha futbolunun tamamı tek uygulamada.`

**Description:**
```
OYNA, amatör futbolun tüm ihtiyaçlarını tek çatıda toplar: maç bul veya kur,
halı sahanı haritadan seç ve kirala, takımını yönet, kadronu tamamla.

⚡ MAÇ BUL & KUR
Çevrendeki açık maçlara katıl ya da kendi maçını aç; eksik kadroyu OYNA tamamlasın.

🗺️ HARİTADA SAHA KEŞFİ
Yakınındaki halı sahaları fiyatlarıyla haritada gör, uygun saati seç, yerini ayırt.

🧤 KALECİ & HAKEM KİRALA
Lisanslı kaleci ve hakemleri maçına davet et; maç sonu 1–10 puanla.

📊 FUT TARZI OYUNCU KARTI
Her maç istatistiklerini işler; kartını geliştir, formunu arkadaşlarına göster.

⚔️ TAKIM & TAKTİK STÜDYOSU
Kulübünü kur, sürükle-bırak taktik tahtasında dizilişini çiz, rakip bul.

🎟️ QR BİLETLİ REZERVASYON
Rezervasyonun dijital biletle cebinde; girişte okut, oyna.

Saha sahibi misin? OYNA İşletme paneliyle takvimini, fiyatlarını ve
rezervasyonlarını tek ekrandan yönet.

Destek: destek@oyna.app
```

**Keywords (100 karakter, virgülle):**
`halı saha,maç,futbol,kadro,rezervasyon,kaleci,hakem,takım,saha kirala,fut kart,taktik,turnuva`

---

## Ek B — App Review notu (İngilizce; 7.2'de "Notes" alanına)

```
REVIEWER ACCESS
- Demo account (pre-verified): see App Review sign-in fields.
- The app organizes real-world amateur football (soccer) in Turkey: finding
  matches, renting physical football pitches, and hiring licensed
  goalkeepers/referees who physically attend the match.

PAYMENTS — Guideline 3.1.5(a) / 3.1.3(e)
- All paid features are REAL-WORLD, physical services consumed OUTSIDE the app:
  renting a physical football pitch for a specific date/time (deposit), and
  hiring a goalkeeper/referee for a real match.
- No digital content or digital subscriptions are sold to consumers, so
  payments use a licensed Turkish payment provider (iyzico) by credit card,
  consistent with guideline 3.1.5(a) — not In-App Purchase.
- Note: in the current build the payment flow runs in a clearly-labeled
  simulation/sandbox mode; no real charges occur.

OTHER
- Sign in with Apple is offered alongside Google and e-mail login.
- Account deletion is available in-app: Settings → "Hesabı Sil"
  (also documented at https://<your-domain>/hesap-silme).
- Contacts access is optional (friend discovery); phone numbers are hashed
  on-device (SHA-256) and never uploaded in plain form.
```

---

## Sorun giderme (belirti → çözüm)

| Belirti | Çözüm |
|---|---|
| `brew` / `pod` komutu "command not found" | Terminal'i kapat-aç. Olmadıysa 2.2'deki "Next steps" komutlarını çalıştırmamışsındır — Homebrew kurulum çıktısındaki komutları uygula. |
| `pod install` hata veriyor | Önce `npx cap sync ios` çalıştı mı? Sonra `cd ios/App && pod install` tekrar. Devam ederse hata metnini geliştiriciye/Claude'a ilet. |
| Xcode: "Signing for App requires a development team" | 3.2 — Team seçilmemiş. |
| Xcode: profil/bundle hatası ("No profiles for com.oyna.app…") | Signing sayfasında "Automatically manage signing"i kapat-aç; Team'i yeniden seç. İnternete bağlı ol. |
| Telefon: "Developer Mode" istiyor | 3.3 — Ayarlar → Gizlilik ve Güvenlik → Geliştirici Modu → aç, yeniden başlat. |
| Telefon: "Güvenilmeyen Geliştirici" | 3.3 — Ayarlar → Genel → VPN ve Aygıt Yönetimi → Güven. |
| Xcode ▶ ile kurulan uygulamada push gelmiyor | **Normaldir** — geliştirme kurulumunda Apple bildirimleri "test" ortamından akar. Gerçek push testi TestFlight'ta (Aşama 6). Mutlaka geliştirme kurulumunda deneyeceksen Supabase'de `APNS_PRODUCTION=false` yap, testi bitirince **geri `true` yap**. |
| TestFlight'ta da push gelmiyor | Sırayla: (1) 1.2'deki 5 secret isim/değer doğru mu? (2) 1.3 `WEBHOOK_SECRET` + webhook `Authorization: Bearer …` başlığı birebir aynı mı? (3) Panel → Sistem Parametreleri → "Gerçek Push Aktif" AÇIK mı? (4) Telefonda bildirim izni verilmiş mi? |
| Apple ile Giriş "audience/client" hatası | 1.4 — Supabase Apple sağlayıcısında Client IDs alanına `com.oyna.app` yazılmamış. |
| Upload sonrası derleme TestFlight'ta görünmüyor | 30 dk bekle; e-postanda "ITMS-…" uyarısı var mı bak; Xcode → Window → Organizer'dan tekrar Upload. |
| "Build already exists" | Xcode → mavi App → General → **Build** sayısını artır (1→2) → yeniden Archive. |
| Xcode "iOS 26 SDK / Xcode 26 gerekli" uyarısı | Mac App Store → Updates → Xcode'u güncelle. macOS 15.6+ değilse önce  → Sistem Ayarları → Genel → Yazılım Güncelleme. |
| App Store Connect'te "agreement" uyarı bandı | developer.apple.com → Account veya ASC → Business/Agreements'ta güncellenen sözleşmeyi **Accept** et (ara sıra çıkar, normaldir). |
| İzin diyalogları İngilizce görünüyor | Telefon dili İngilizce'yse normaldir; metinlerimiz Türkçe cihazda Türkçe çıkar. |

> **Altın kural:** Takıldığın her yerde ekran görüntüsü al ve geliştiricine/Claude'a yaz. Hata mesajları
> bizim için yol haritasıdır; senin çözmen gerekmez.
