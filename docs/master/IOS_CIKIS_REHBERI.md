# 🍎 OYNA — iOS'a Çıkış Rehberi (Kurucu için, sıfırdan yayına)

> **Kimin için:** Kod bilgisi olmayan kurucu. Her adım "nereye tıkla, ne yaz" düzeyinde anlatılmıştır.
> **Ön koşul:** Apple Developer Program üyeliği (✅ alındı).
> **Kod durumu:** Uygulamanın iOS tarafı bu depoda **hazır** — ikonlar, izin metinleri, push altyapısı,
> Apple ile Giriş, derin bağlantılar tamamlandı ve doğrulandı (bkz. §0).
> **Tahmini takvim:** Mac kurulumu + ilk telefon testi: yarım gün · TestFlight: 1 gün · Apple incelemesi: 1–3 gün.

---

## 0. Kod tarafında hazır olanlar (senin bir şey yapmana gerek yok)

| Konu | Durum |
|---|---|
| Uygulama kimliği (`com.oyna.app`), sürüm 1.0.0, yalnız iPhone + dikey mod | ✅ |
| OYNA markalı uygulama ikonu (1024×1024) ve açılış ekranı görselleri | ✅ |
| Türkçe izin açıklamaları: konum, kamera, fotoğraflar, **rehber** (bu oturumda eklendi) | ✅ |
| Push bildirim altyapısı (APNs token köprüsü **bu oturumda onarıldı** — eksik olsaydı push hiç çalışmayacaktı) | ✅ |
| Apple ile Giriş (native) + Google + e-posta girişi | ✅ |
| Derin bağlantılar (`oyna://` — bildirime tıklayınca doğru ekrana gider) | ✅ |
| Çentik/Dynamic Island güvenli alanları, klavye davranışı, 16px yazı (iOS'un otomatik yakınlaşmasını önler) | ✅ |
| İhracat/şifreleme sorusu otomatik cevaplandı (`ITSAppUsesNonExemptEncryption`) — her yüklemede soru çıkmaz | ✅ |
| Sağlık kontrolleri: tip denetimi temiz · 1685 birim testi · üretim derlemesi · iOS senkronu (13 eklenti) | ✅ |
| Supabase bağlantısı derlemeye **gömülü** — `.env` dosyası oluşturmana gerek yok (§3.1 notu) | ✅ |
| Hesap silme akışı (Apple zorunlu şartı) ve yasal sayfalar (`/gizlilik` vb.) | ✅ |

**Senden beklenenler (bu rehberin konusu):** bir Mac'te derleme + Apple panellerinde 30–40 dakikalık ayar + mağaza formları.

---

## 1. İhtiyaç listesi

- [ ] **Bir Mac** (zorunlu — Apple, iOS uygulamalarının yalnız Mac'te derlenmesine izin verir).
  Kendi Mac'in yoksa: bir yakınından birkaç saatliğine ödünç al **veya** aylık kiralık bulut Mac
  (MacinCloud / MacStadium, ~30–50 $/ay) kullan. M1/M2/M3/M4 işlemcili ve **güncel macOS** olan her Mac olur.
- [ ] **Apple Developer hesabın** ve şifren (developer.apple.com'a girebiliyor olmalısın).
- [ ] **Bir iPhone + kablosu** (gerçek testler için; simülatörde push ve Apple girişi tam test edilemez).
- [ ] GitHub hesabın (bu depoya erişimi olan).

---

## 2. Mac'i bir kereliğine hazırla (~1 saat, çoğu bekleme)

### 2.1 Xcode'u kur
1. Mac'te **App Store**'u aç, **"Xcode"** ara, **Yükle**'ye bas (büyük indirme, ~10 GB — sabır ☕).
2. **Önemli:** Sürüm **Xcode 26 veya üstü** olmalı. (Apple, Nisan 2026'dan beri mağaza gönderimlerinde
   bunu zorunlu tutuyor. App Store her zaman en güncelini kurar; sadece eski bir Xcode'la devam etmemeye dikkat et.)
3. Xcode'u ilk kez aç; ek bileşen kurmayı önerirse **Install**'a bas. Sana Apple ID sorarsa gir.

### 2.2 Terminal araçlarını kur
**Terminal** uygulamasını aç (Spotlight'a ⌘+boşluk "Terminal" yaz) ve şu komutları **sırayla** yapıştırıp Enter'a bas.
(Her biri bitince yenisini yapıştır. Şifre sorarsa Mac oturum şifreni yaz — yazarken görünmez, normaldir.)

```bash
# 1) Homebrew — Mac için program yükleyici
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# 2) Node.js (uygulamanın web katmanını derler) ve CocoaPods (iOS parçalarını birbirine bağlar)
brew install node cocoapods
```

> Homebrew kurulumunun sonunda "Next steps" altında 2 satır komut gösterirse, onları da kopyalayıp çalıştır
> (brew'i tanıtır). Emin olamazsan Terminal'i kapatıp yeniden açman da genelde yeterlidir.

### 2.3 Projeyi Mac'e indir
```bash
cd ~/Desktop
git clone https://github.com/keserok/OYNA.git
cd ~/Desktop/OYNA
```
> ⚠️ Bu üçünü de **tek tek** yapıştır (bkz. §3.1 uyarısı). Toplu yapıştırma satırları birleştirip
> `cd: string not in pwd: OYNAnpm` gibi hatalara yol açıyor.
GitHub şifre sorarsa: github.com → sağ üst profil → Settings → Developer settings → Personal access tokens'tan
bir token üretip şifre yerine onu kullan. (Kolay alternatif: **GitHub Desktop** uygulamasıyla klonla.)

> **Not (2026-08-06 itibarıyla):** Her şey `main` dalındadır — dal değiştirmene gerek YOK.
> Yukarıdaki `git clone` seni doğrudan `main`'e getirir. İleride tekrar derleyeceksen, klasörün
> içindeyken önce `git pull` yapman yeterli.

---

## 3. Uygulamayı derle ve KENDİ iPhone'unda çalıştır (~30 dk)

### 3.1 Derleme

> ⚠️ **KOMUTLARI TEK TEK YAPIŞTIR.** Hepsini birden kopyalayınca satırlar birbirine yapışıyor
> (`cd OYNA` + `npm install` → `cd OYNAnpm install`) ve komutlar YANLIŞ KLASÖRDE çalışıyor.
> Belirti: `npm error path /Users/<sen>/package.json` ve `cd: no such file or directory: ios/App`.
> Her komuttan sonra Enter'a bas, **bitmesini bekle** (`%` işareti geri gelir), sonra diğerine geç.

**Önce doğru klasörde olduğunu doğrula:**
```bash
cd ~/Desktop/OYNA
```
```bash
pwd
```
Ekranda `/Users/<kullanıcı-adın>/Desktop/OYNA` yazmalı. Yazmıyorsa devam etme.

**Sonra sırayla (her biri ayrı):**
```bash
npm install
```
```bash
npm run build
```
```bash
npx cap sync ios
```
```bash
cd ~/Desktop/OYNA/ios/App
```
```bash
pod install
```
```bash
cd ~/Desktop/OYNA
```
```bash
npx cap open ios
```

Ne beklemeli: `npm run build` sonunda `✓ built in …` · `npx cap sync ios` sonunda `Sync finished` ·
son komut **Xcode'u açar**.

> `cd` komutları bilerek TAM ADRESLE yazıldı (`~/Desktop/OYNA` gibi). Böylece satırlar yapışsa
> ya da başka bir klasörde olsan bile doğru yere gider.

> **`.env` dosyası oluşturmana GEREK YOK.** Uygulamanın canlı Supabase adresi ve herkese açık
> (anon) anahtarı derlemenin içine gömülüdür (`supabaseClient.ts`). Yani yukarıdaki dört komut
> yeterli; hiçbir gizli anahtar girmen gerekmiyor. (Depodaki `.env.example` yalnız yerel
> geliştirme ve sunucu tarafı anahtarları içindir — telefona derleme için kullanılmaz.)

### 3.2 Xcode'da imzalama (ilk seferde bir kez)
1. Xcode açıldığında sol paneldeki en üstte **mavi "App"** simgesine tıkla.
2. Orta alanda **TARGETS → App**'i seç, üstten **Signing & Capabilities** sekmesine gel.
3. **Team** açılır listesinden **kendi Apple Developer hesabını** seç.
   - Listede yoksa: Xcode menüsü → **Settings → Accounts → +** ile Apple ID'ni ekle, sonra tekrar seç.
   - Projede önceki bir geliştiriciye ait takım kimliği kalmış olabilir; senin seçimin onu düzeltir.
4. "Automatically manage signing" işaretli kalsın. Birkaç saniyede hata kaybolur ve
   Apple paneline **com.oyna.app** kimliği otomatik kaydolur.

### 3.3 Telefonda çalıştır
1. iPhone'u kabloyla Mac'e bağla ("Bu bilgisayara güvenilsin mi?" → **Güven**).
2. Xcode'un üst ortasındaki cihaz listesinden **kendi iPhone'unu** seç.
3. Soldaki **▶ (Play)** düğmesine bas. İlk seferde 2–5 dk derler ve uygulama telefonda açılır.
4. Telefon "Güvenilmeyen Geliştirici" derse: iPhone'da **Ayarlar → Genel → VPN ve Cihaz Yönetimi →**
   geliştirici profilin → **Güven**.

### 3.4 Telefonda ilk kontrol turu (5 dk)
- [ ] Açılış ekranı ve giriş ekranı düzgün (çentik/ada altında kalan yazı yok).
- [ ] Kayıt/giriş çalışıyor; klavye açılınca alanlar görünür kalıyor.
- [ ] Konum izni istenince **Türkçe açıklama** çıkıyor; harita/saha keşfi açılıyor.
- [ ] Sosyal → arkadaş ekle → rehber izni Türkçe metinle soruyor.
- [ ] QR bilet ekranı / kamera izni sorunsuz.
- [ ] Uçak moduna al → uygulama kırılmıyor, "bağlantı yok" şeridi çıkıyor.

Sorun görürsen not al (ekran görüntüsü en iyisi) — kod tarafına ben bakarım.

---

## 4. Apple panelinde push anahtarı üret (~10 dk) — bildirimlerin çalışması için

1. **developer.apple.com** → giriş yap → **Account** → **Certificates, Identifiers & Profiles** → soldan **Keys** → **+ (mavi)**.
2. İsim: `OYNA APNs` yaz. **Apple Push Notifications service (APNs)** kutusunu işaretle → **Continue → Register**.
3. **Download** ile `.p8` dosyasını indir. ⚠️ **Bu dosya YALNIZ BİR KEZ indirilebilir** — güvenli bir yere yedekle.
4. Aynı sayfadaki **Key ID**'yi not al (10 haneli). Sağ üstteki **Team ID**'yi de not al (10 haneli).

### 4.1 Anahtarı Supabase'e tanıt
Supabase Dashboard → OYNA projesi → **Edge Functions → Secrets** (veya Project Settings → Functions → Secrets) →
şu 5 kaydı ekle:

| İsim | Değer |
|---|---|
| `APNS_KEY_ID` | 3. adımda not ettiğin Key ID |
| `APNS_TEAM_ID` | Team ID |
| `APNS_PRIVATE_KEY` | `.p8` dosyasını **Not Defteri/TextEdit ile açıp** İÇERİĞİNİN TAMAMINI yapıştır (`-----BEGIN PRIVATE KEY-----` dahil) |
| `APNS_BUNDLE_ID` | `com.oyna.app` |
| `APNS_PRODUCTION` | `true` |

> Push testini **TestFlight'tan kurulan** uygulamada yap (§7). Xcode'un ▶ ile yüklediği geliştirme
> sürümünde push gelmeyebilir — bu normaldir; kusur değil. (Gelmesini istersen geçici olarak
> `APNS_PRODUCTION=false` yap, testi bitirince `true`'ya döndür.)

### 4.2 Apple ile Giriş'i Supabase'e tanıt (~3 dk)
Supabase Dashboard → **Authentication → Sign In / Up → Apple** → **Enable** et ve
**Authorized Client IDs** alanına `com.oyna.app` yaz → kaydet. (Bu olmadan Apple ile Giriş
"Unacceptable audience" hatası verir.)

---

## 5. App Store Connect'te uygulama kaydı aç (~20 dk)

1. **appstoreconnect.apple.com** → **My Apps** → **+ → New App**.
2. Doldur: Platform **iOS** · Name **OYNA** (alınmışsa "OYNA — Halı Saha & Maç" gibi bir varyasyon) ·
   Primary Language **Turkish** · Bundle ID listeden **com.oyna.app** · SKU `oyna-app` → **Create**.
3. **App Information:** Category **Sports** (ikincil: Social Networking). Content rights: üçüncü taraf içerik yok.
4. **Age Rating** anketi: dürüst cevapla — kullanıcılar arası **mesajlaşma VAR**, konum paylaşımı VAR,
   şiddet/kumar YOK → sonuç genelde **12+** çıkar. **ÖNEMLİ (Guideline 2.3.6):** "In-App Controls / Parental Controls" ve "Age Assurance" sorularını kesinlikle **"None" (Yok / Hayır)** olarak işaretle! (Aksi halde Apple, uygulama içinde ebeveyn kontrolü bulamadığı için 2.3.6 reddi verir.)
5. **App Privacy** → Privacy Policy URL: `https://<alan-adın>/gizlilik` (uygulamanın Vercel yayını bu
   sayfayı otomatik sunar; alan adın yoksa Vercel'in verdiği `https://….vercel.app/gizlilik` adresi de geçerlidir).
   Veri beyanı (Data Collection) — şunları "Yes, we collect" olarak işaretle, tümü **App Functionality**
   amacıyla, **hiçbiri Tracking DEĞİL**:
   - Contact Info: Name, Email Address, Phone Number
   - Location: Precise Location (yakındaki saha/maçlar için)
   - User Content: Photos (profil fotoğrafı)
   - Identifiers: User ID, Device ID (push token)
   - Usage Data: Product Interaction (analitik)
   - Diagnostics: Crash Data
   - Financial Info: Payment Info ("ödeme iyzico tarafından işlenir, kart verisi bizde saklanmaz")
   - Contacts: yalnız eşleştirme amaçlı, şifrelenmiş özet gönderilir → "Contacts" işaretle,
     "Linked to user: No", açıklamada hash'lendiğini belirt.
6. **Pricing:** Free · tüm bölgeler veya yalnız Türkiye (önerim: ilk sürümde yalnız **Türkiye**).

---

## 6. Uygulamayı mağazaya yükle (Archive, ~15 dk)

1. Xcode'da üstteki cihaz listesinden **Any iOS Device (arm64)** seç (kendi telefonun DEĞİL).
2. Menü: **Product → Archive**. Derleme bitince **Organizer** penceresi açılır.
3. **Distribute App → App Store Connect → Upload** → hepsinde varsayılanları kabul et → **Upload**.
4. 10–30 dk sonra App Store Connect → **TestFlight** sekmesinde derleme "Ready to Test" olur
   (e-posta da gelir). Şifreleme sorusu sorulmaz — cevabı uygulamanın içine gömdük.

> Hata alırsan: en sık ikisi "Team seçilmemiş" (bkz. §3.2) ve internet kesintisidir. Hata metninin
> ekran görüntüsünü bana getir, çözümünü söylerim.

---

## 7. TestFlight — kendi telefonunda mağaza sürümünü dene (~30 dk)

1. App Store Connect → **TestFlight** → soldan **Internal Testing → +** ile grup oluştur, kendi
   Apple ID e-postanı ekle.
2. iPhone'una App Store'dan **TestFlight** uygulamasını indir; gelen davet e-postasını kabul et;
   OYNA'yı TestFlight içinden kur.
3. **Gerçek doğrulama listesi:**
   - [ ] Bildirim izni ver → OPanel/GodView'den kendine test bildirimi gönder → bildirim geldi mi?
   - [ ] Bildirime tıkla → doğru ekran açıldı mı? (derin bağlantı)
   - [ ] **Apple ile Giriş** dene (ilk kez → "e-postamı gizle" seçeneğiyle de dene).
   - [ ] §3.4'teki kontrol turunu tekrarla.

---

## 8. İncelemeye gönder (~30 dk form doldurma)

App Store Connect → uygulaman → soldan **App Store** sekmesi → **1.0.0 Prepare for Submission**:

1. **Ekran görüntüleri** (zorunlu). Önce vitrindeki fotoğraflara bak, sonra çek:

   ```
   npm run vitrin:gorseller   # canlıdaki her saha/kort fotoğrafı tek sayfada
   npm run dev                # ayrı kabukta
   npm run magaza:ekran       # 6 ekran · 1290×2796 (Apple'ın istediği ölçü)
   ```

   `vitrin:gorseller` adımını atlama. 25 Ağu 2026'da ilk kez bakıldığında vitrinde bir FIFA
   Dünya Kupası renderı ve çocukların özel fotoğrafları bulundu — ikisi de aylardır oradaydı
   (`OLAY-2026-08-25-VITRIN-GORSELLERI.md`). Yer tutucu görüyorsan çekim mağazaya konmaz;
   fotoğraflar üçüncü taraf sunucuda olduğu için o sunucuya erişemeyen makinede boş çıkarlar.

   iPhone 6.9" (1290×2796) şarttır; `magaza:ekran` tam o ölçüde üretir.
2. **Metinler:** Ek A'daki hazır taslakları yapıştır (Description, Keywords, Promotional Text,
   Support URL: `https://<alan-adın>` veya `mailto:mirackeremcuruksulu@gmail.com`).
3. **Build:** "+" ile TestFlight'a yüklediğin derlemeyi seç.
4. **App Review Information:**
   - Sign-in required → **inceleme hesabı** ver. Oluşturma: Supabase Dashboard → Authentication →
     Users → **Add User** → e-posta `review@oyna.app` benzeri + güçlü şifre → **Auto Confirm User
     işaretli** olsun. Bu e-posta/şifreyi forma yaz. (Ayrıntılı şablon: `docs/master/APP_REVIEW_NOTLARI.md`.)
   - **Notes** alanına Ek B'deki İngilizce notu yapıştır (ödemenin fiziksel hizmet olduğu ve
     IAP muafiyeti — reddedilmemenin anahtarı budur).
5. **Age Rating ve App Privacy formları:** cevaplar hazır ve koddan çıkarıldı —
   **`docs/master/APP_STORE_CONNECT_FORMLARI.md`**. Tahminle doldurma: yaş sınırını yanlış
   vermek 2.3.1, veri beyanını manifestoyla ayrıştırmak 5.1.1(ii) altında ret sebebidir.
6. **Version Release:** **"Manually release this version"** seç (onaydan sonra yayına NE ZAMAN
   çıkacağına sen karar verirsin).
7. **Submit for Review**'a bas. 🎉

**Bekleme:** Çoğu inceleme 24–48 saat. Sonuç e-postayla gelir.
**Reddedilirse:** Panik yok — ilk gönderimlerde yaygındır. Resolution Center'daki mesajın ekran
görüntüsünü bana getir; cevabını/düzeltmesini birlikte göndeririz.

---

## 9. Onay sonrası

- [ ] **Release This Version** ile yayına al (Phased Release açık kalsın — 7 günde kademeli dağıtır).
- [ ] Lansman anahtarları: `demo_mode_enabled=KAPALI`, demo verisi temiz, `push_live_enabled=AÇIK`.
- [ ] İlk hafta günlük bak: çökme raporları (Sentry), mağaza yorumları, push teslimat logu.
- [ ] Ödeme (iyzico) canlıya geçince sürüm 1.0.1 olarak aynı §6–§8 adımlarıyla güncelleme gönderilir.

---

## Ek A — Mağaza metinleri (kopyala-yapıştır taslak)

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

Destek: mirackeremcuruksulu@gmail.com
```

**Keywords (100 karakter, virgülle):**
`halı saha,maç,futbol,kadro,rezervasyon,kaleci,hakem,takım,saha kirala,fut kart,taktik,turnuva`

---

## Ek B — App Review notu (İngilizce, "Notes" alanına)

```
REVIEWER ACCESS
- Demo account (pre-verified): see App Review sign-in fields.
- The app is for organizing real-world amateur football (soccer) matches in
  Turkey: finding matches, renting physical football pitches, hiring licensed
  goalkeepers/referees for a match.

PAYMENTS — Guideline 3.1.5(a) / 3.1.3(e)
- All paid features are REAL-WORLD, physical services consumed OUTSIDE the app:
  renting a physical football pitch for a specific date/time (deposit), and
  hiring a goalkeeper/referee who physically attends the match.
- No digital content, no digital subscriptions are sold to consumers.
  Therefore payments use a licensed Turkish payment provider (iyzico) with
  credit card, not In-App Purchase, consistent with guideline 3.1.5(a).
- Note: In the current build the payment flow runs in a clearly-labeled
  simulation/sandbox mode; no real charges occur.

OTHER
- Sign in with Apple is offered alongside Google and e-mail login.
- Account deletion is available in-app: Settings → "Hesabı Sil" (also
  documented at https://<your-domain>/hesap-silme).
- Contacts access is optional (friend discovery); phone numbers are hashed
  on-device (SHA-256) and never uploaded in plain form.
```

---

## Sorun giderme (sık karşılaşılanlar)

| Belirti | Çözüm |
|---|---|
| `pod install` hata veriyor | `brew install cocoapods` kurulu mu? Sonra `cd ios/App && pod install` tekrar. Yine olmazsa hatayı bana getir. |
| "Signing for App requires a development team" | §3.2 — Team seçilmemiş. |
| Telefonda "Güvenilmeyen Geliştirici" | §3.3 adım 4. |
| Push, Xcode'dan (▶) kurulan uygulamada gelmiyor | Normal. TestFlight sürümünde test et (§7) veya geçici `APNS_PRODUCTION=false`. |
| Apple ile Giriş "audience/client" hatası | §4.2 — Supabase Apple sağlayıcısında `com.oyna.app` Authorized Client IDs'e eklenmemiş. |
| Derleme App Store Connect'te görünmüyor | 30 dk bekle; Apple'dan gelen e-postada uyarı var mı bak; Xcode → Organizer → yeniden Upload. |
| Xcode "iOS 26 SDK required" benzeri uyarı | Mac'te App Store → Updates'ten Xcode'u güncelle (26+). |
| Rehber/konum/kamera izni İngilizce çıkıyor | Çıkmaz — metinler Türkçe gömülü. Görürsen bana bildir. |

> **Altın kural:** Herhangi bir adımda takılırsan ekran görüntüsü al ve bana yaz. Hata mesajları
> benim için yol haritasıdır; senin çözmen gerekmez.
