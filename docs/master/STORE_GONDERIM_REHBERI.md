# OYNA — Mağazaya Gönderim Rehberi (Kod Bilmeyenler İçin, Sıfırdan)

> Bu rehber, daha önce hiç uygulama yayınlamamış birine göre yazıldı. Teknik bir
> terim geçtiğinde hemen yanında parantez içinde ne demek olduğunu açıkladım.
> Acele etme, **sırayla** git, her adımı bitirdikçe kutucuğu `[x]` yap.
>
> Takıldığın her yerde en alttaki **"Sık takılınan yerler"** ve **"Sözlük"**
> bölümlerine bak.

---

## 0. Önce büyük resmi anla (2 dakika)

Uygulaman iki ayrı yerde yayınlanacak:

- **Google Play** → Android telefonlar için (Samsung, Xiaomi, Oppo…)
- **App Store** → iPhone'lar için

Her mağaza senden **üç şey** ister:

1. **Uygulamanın kurulum dosyası.**
   - Android için bunu **ben senin için derledim** — elinde `OYNA-3.0.0-release.aab`
     dosyası var, hazır.
   - iPhone için bir **Mac bilgisayar** gerekir (Apple böyle zorunlu tutuyor).
     Senin Mac'in olmasına gerek yok; bunu **internette otomatik yaptıracak**
     bir düzenek kurdum. Aşağıda tıkla-tıkla anlatıyorum.
2. **Bir hesap + üyelik ücreti.** Apple yılda **99 $**, Google **tek seferlik 25 $**.
3. **Mağaza sayfası malzemeleri.** Ekran görüntüleri, açıklama yazısı, gizlilik
   politikası linki, birkaç form.

### Yol haritan (kabaca)

```
1. Alan adı + gizlilik sayfası + destek e-postası hazır olsun   (yarım gün)
2. Hesapları aç — onay birkaç gün sürebilir, İLK GÜN başla       (1-2 hafta bekleme)
3. "İnceleme hesabı" oluştur (Apple/Google içeri girebilsin)     (10 dakika)
4. Android'i yükle — en kolayı, ısınmak için buradan başla       (yarım gün)
5. iPhone'u yükle                                                (yarım–1 gün)
6. Ekran görüntüsü + metin + formları hazırla                    (1-2 gün)
7. Yayına gönder, Apple/Google incelesin                         (1-7 gün bekleme)
```

> **En önemli tavsiye:** 2. adımdaki hesap açma işini **bugün** başlat. Ücret
> ödedikten sonra Apple/Google hesabı onaylaması bazen 1-2 gün, kurumsal
> hesapta 1-2 hafta sürebilir. Beklerken diğer adımları hazırlarsın.

---

## 1. Ben senin için neleri hallettim (bunlarla uğraşma)

- ✅ **Android kurulum dosyası** (`.aab`) derlendi ve imzalandı — yüklemeye hazır.
- ✅ **iPhone paketini otomatik üreten düzenek** kuruldu (GitHub Actions —
  aşağıda anlatıyorum).
- ✅ **Uygulama içi tüm mağaza engelleri** giderildi: eksik izin metinleri
  (bunlar olmadan uygulama açılışta çöküyordu = kesin ret), Apple'ın zorunlu
  gizlilik dosyası, güvenlik açığı (mağaza sürümünde "şifresiz demo giriş"
  herkese açıktı — kapatıldı).
- ✅ **Google'ın 31 Ağustos 2026 kuralı** (yeni Android sürümü zorunluluğu)
  şimdiden karşılandı.
- ✅ Yazı tipleri uygulamanın içine gömüldü (internet olmadan da düzgün açılır —
  Apple incelemeci uçak modunda test eder).

Kısacası: **kod tarafında yapılacak iş kalmadı.** Bundan sonrası hesap açmak,
form doldurmak ve "yükle" düğmesine basmak.

---

## 2. Hazırlık — bunlar olmadan başlama (Adım 0)

Her iki mağaza da bunları **zorunlu** ister. Yarım günde halledilir:

- [ ] **Bir alan adı (domain).** Örn. `oyna.app`. Yoksa Namecheap/GoDaddy'den al.
- [ ] **Gizlilik politikası sayfası — herkese açık bir link.** Uygulamanın içinde
      `public/gizlilik.html` ve `public/hesap-silme.html` dosyaları hazır.
      Bunlar siten yayınlanınca otomatik olarak şu adreslerde açılır:
      `https://oyna.app/gizlilik.html` ve `https://oyna.app/hesap-silme.html`.
      - ⚠️ İçlerinde `[ŞİRKET ÜNVANI]` gibi **boş yerler** var. Bunları gerçek
        bilgilerinle doldur. Yasal metin olduğu için ideal olan bir **avukata**
        bir kez baktırmak (özellikle KVKK).
- [ ] **Bir destek e-postası.** Örn. `destek@oyna.app`. Mağazalar "kullanıcı
      sana nasıl ulaşır?" diye soruyor.

> **Neden önemli?** Gizlilik linki alanı boş bırakılamaz; mağaza formu seni
> geçirmez. Sayfanın gerçekten açılıyor olması da gerekiyor (inceleme tıklar).

---

## 3. Hesapları aç (Adım 1) — BUGÜN başlat

### 3.1 Google Play Console (Android için)

1. `https://play.google.com/console` adresine git.
2. Google hesabınla giriş yap, **"Create developer account"** de.
3. **Tek seferlik 25 $** öde.
4. Hesap türü sorulunca:
   - **Kişisel hesap** seçersen: Google, uygulamayı yayına almadan önce
     **en az 12 kişinin 14 gün boyunca kesintisiz test etmesini** zorunlu tutar
     (arkadaşlarına telefonlarına kurdurup 2 hafta açık tutmaları gibi).
   - **Şirket (kurumsal) hesabı** seçersen bu 14 günlük test şartı **yoktur**.
   - 👉 **Tavsiye:** Şirketin varsa kurumsal aç, 2 haftadan kurtul. Yoksa kişisel
     de olur ama takvimine bu 14 günü ekle.

### 3.2 Apple Developer (iPhone için)

1. `https://developer.apple.com/programs/enroll` adresine git.
2. Apple ID'nle giriş yap, **"Enroll"** de.
3. **Yıllık 99 $** öde.
4. Hesap türü:
   - **Bireysel:** Mağazada uygulamanın yanında **senin adın soyadın** görünür.
   - **Şirket:** Şirket adı görünür, ama **D-U-N-S numarası** ister (ücretsiz ama
     alması 1-2 hafta sürebilir — `https://developer.apple.com/duns-lookup`).
   - 👉 **Tavsiye:** Hızlı başlamak istersen bireysel aç; sonra şirkete taşınabilir.

> Bu iki hesap onayı beklerken 4, 5 ve 6. adımların hazırlığına geç.

---

## 4. "İnceleme hesabı" oluştur (Adım 2) — 10 dakika

**Neden gerekli?** Apple ve Google, uygulamanı yayınlamadan önce bir çalışan
görevlendirip **kendisi içeri girip** test eder. Giremezse **direkt reddeder**
("we were unable to sign in"). Senin uygulaman e-posta + şifre ile giriş
yapabildiği için bu kolay:

1. Kendi telefonunda uygulamayı aç (veya test sürümünde).
2. **"Hesabın yok mu? Kayıt ol"** ile yeni bir hesap oluştur:
   - E-posta: örn. `inceleme@oyna.app` (sana ait, erişebildiğin bir adres olsun)
   - Şifre: tahmin edilmesi zor bir şey belirle, bir yere **not al**.
3. E-posta onayı isterse, gelen linke tıklayıp hesabı onayla.
4. Bu **e-posta + şifreyi** ilerideki 7. adımda Apple/Google'ın gizli
   "inceleme notu" alanına yazacaksın. İncelemeci **"GİRİŞ YAP"** (şifreli giriş)
   butonuyla bu hesapla girecek.

> Not: Uygulamada eskiden olan "şifre gerekmez, demo giriş" kolaylığını mağaza
> sürümünde **güvenlik için kapattım**. O yüzden incelemeciye yukarıdaki gibi
> **gerçek bir hesap** vermen gerekiyor — bu zaten Apple/Google'ın istediği
> standart yöntem.

---

## 5. ANDROID'i yükle (Adım 3) — en kolayı

Elinde zaten imzalı `OYNA-3.0.0-release.aab` dosyası var (sana gönderdim).

1. `https://play.google.com/console` → **"Create app"**.
2. Formu doldur: uygulama adı **OYNA**, dil Türkçe, tür **App**, ücretsiz.
3. Sol menüden ilerleyip şu bölümleri doldur (Play seni elinden tutar):
   - **App content → Privacy policy:** `https://oyna.app/gizlilik.html`
   - **App content → Data safety (Veri güvenliği formu):** Bkz. Adım 6.
   - **App content → App access:** "Tüm işlevler giriş ister" de ve **Adım 2'deki
     inceleme hesabının e-posta + şifresini** buraya gir.
   - **Content rating:** Kısa bir anket; spor + sosyal + mesajlaşma → işaretle.
4. **Testing → Closed testing** (kapalı test):
   - `.aab` dosyasını buraya yükle.
   - Kişisel hesapsa: en az **12 test kullanıcısı** ekle (e-posta listesi),
     **14 gün** açık kalsın. (Kurumsal hesapta bu şart yok, doğrudan Production'a
     geçebilirsin.)
5. 14 gün dolunca (veya kurumsalsan hemen) **Production → Create new release** →
   aynı `.aab`'yi yükle → **Send for review**.
6. Google inceler (ilk seferde birkaç gün sürebilir), onaylayınca yayında.

> **İleride yeni sürüm çıkarırken:** her yeni yüklemede `versionCode` bir
> büyümeli. Bunu `android/app/build.gradle` içinde `versionCode 1` → `2` → `3`
> diye elle artırırsın (veya bana söyle, otomatikleştiririm).

---

## 6. iPHONE'u (iOS) yükle (Adım 4) — adım adım

### 6.1 Önce "neden farklı?" — kafan netleşsin

Apple, iPhone uygulamalarının **sadece bir Mac bilgisayarda**, Apple'ın **Xcode**
adlı programıyla paketlenmesine izin verir. Senin bilgisayarın Windows olabilir
veya hiç Mac'in olmayabilir. Sorun değil — **üç yolun** var:

| Yol | Kime uygun | Maliyet |
|-----|------------|---------|
| **A) GitHub'da otomatik (kurdum)** | Mac'i olmayan, kod bilmeyen | Ücretsiz |
| **B) Kiralık bulut Mac** | Kendi elinle denemek isteyen | Saatlik ~2-5 $ |
| **C) Birine yaptır** | Hiç uğraşmak istemeyen | Tek sefer ~20-50 $ |

Aşağıda **A yolunu** tıkla-tıkla anlatıyorum (en ucuz ve Mac gerektirmeyen).
C yolunu da en altta özetledim.

### 6.2 YOL A — GitHub'da otomatik paketleme (önerilen)

Senin için repoya bir "otomatik iş" (workflow) ekledim. Bu iş, GitHub'ın bulutta
verdiği bir Mac'te çalışıp iPhone paketini üretir ve doğrudan **TestFlight'a**
(Apple'ın test ortamı) yükler. Tek yapman gereken ona 3 tane "anahtar" vermek.

**Bu anahtarlar ne?** GitHub'ın senin adına Apple'a giriş yapabilmesi için gereken
bir tür özel şifre. Şöyle üretilir:

#### Adım 6.2.1 — App Store Connect'te uygulamayı oluştur
1. `https://appstoreconnect.apple.com` → **My Apps → +** → **New App**.
2. Platform **iOS**, ad **OYNA**, dil Türkçe.
3. **Bundle ID** olarak `com.oyna.app` seç. (Listede yoksa önce
   `https://developer.apple.com/account/resources/identifiers` → **+** ile
   `com.oyna.app` kimliğini oluştur; **Push Notifications** ve **Sign in with
   Apple** kutucuklarını işaretle.)

#### Adım 6.2.2 — 3 anahtarı üret (API Key)
1. `https://appstoreconnect.apple.com` → sağ üstten **Users and Access**.
2. Üst sekmelerden **Integrations** (veya "Keys") → **App Store Connect API**.
3. **Generate API Key** → bir isim ver (örn. "GitHub"), rol **App Manager** seç.
4. Oluşunca:
   - **"Key ID"** yazan kodu not al → bu **ASC_KEY_ID**.
   - Sayfanın üstündeki **"Issuer ID"** kodunu not al → bu **ASC_ISSUER_ID**.
   - **"Download API Key"** ile `.p8` uzantılı dosyayı indir.
     ⚠️ Bu dosya **yalnızca bir kez** indirilebilir, kaybetme.

#### Adım 6.2.3 — Anahtarları GitHub'a gir
1. GitHub'da repoya git: `https://github.com/keserok/OYNA`
2. **Settings → Secrets and variables → Actions → New repository secret**.
3. Sırayla üç tane ekle (isimleri **birebir** bu şekilde olmalı):
   - İsim `ASC_KEY_ID`, değer: not aldığın Key ID.
   - İsim `ASC_ISSUER_ID`, değer: not aldığın Issuer ID.
   - İsim `ASC_API_KEY_P8`, değer: indirdiğin **`.p8` dosyasını bir metin
     düzenleyiciyle (Not Defteri) aç**, içindeki **her şeyi** (`-----BEGIN...`
     satırından `-----END...` satırına kadar) kopyalayıp buraya yapıştır.

#### Adım 6.2.4 — Paketi üret ve TestFlight'a yükle
1. GitHub'da repoda üstteki **Actions** sekmesine tıkla.
2. Soldaki listeden **"iOS Release (App Store)"**'u seç.
3. Sağdaki **"Run workflow"** düğmesine bas.
4. Açılan küçük kutuda **"TestFlight'a otomatik yükle"** seçeneğini **işaretle**
   ve **"Run workflow"** de.
5. ~15-25 dakika bekle. Yeşil bir tik ✅ görünce iPhone paketin **TestFlight'a**
   yüklenmiş demektir.
   - Kırmızı ❌ olursa: tike tıkla, hangi adımda durduğuna bak; genelde bir
     anahtar yanlış yapıştırılmıştır. En alttaki SSS'ye bak veya bana yaz.

#### Adım 6.2.5 — Test et ve yayına gönder
1. `https://appstoreconnect.apple.com` → uygulaman → **TestFlight** sekmesi.
   Kendi iPhone'una **TestFlight** uygulamasını kurup buradan test edebilirsin.
2. Hazır olunca: uygulaman → **Distribution / App Store** sekmesi → yeni sürüm
   oluştur, az önce yüklenen paketi (build) seç.
3. **Adım 6.3'teki** ekran görüntüsü + metin + formları doldur.
4. **Add for Review → Submit**. Apple genelde 24-48 saatte inceler.

> **İmzalama sertifikası derdi yok:** normalde iPhone paketlemede "sertifika,
> provisioning profili" gibi baş ağrıtan şeyler olur. Kurduğum düzenek bunları
> **API anahtarıyla otomatik** üretir; sen uğraşmazsın.

### 6.3 App Store'da doldurulacaklar (Apple'a özel)
- [ ] **App Privacy** (gizlilik etiketleri): Bkz. Adım 6 formları.
- [ ] **App Review Information → Sign-In required:** açık bırak ve **Adım 2'deki
      inceleme hesabının e-posta + şifresini** buraya yaz.
- [ ] **Review Notes** (gizli not) alanına şunu ekle (kopyala-yapıştır):
      > OYNA halı saha kiralama uygulamasıdır. Ödeme, gerçek dünyada verilen
      > fiziksel bir hizmet (saha kiralama) içindir; bu nedenle Apple IAP'a tabi
      > değildir (Guideline 3.1.5(a)). Giriş için: e-posta `inceleme@oyna.app`,
      > şifre `<belirlediğin şifre>`. "GİRİŞ YAP" butonunu kullanın.
- [ ] **Ekran görüntüleri:** iPhone 6.9 inç ve 6.5 inç zorunlu (aşağıda).

### 6.4 YOL C — Hiç uğraşmak istemezsen
Fiverr veya Bionluk'ta **"iOS app store submission"** hizmeti veren birini bul.
Ona şunları verirsin: Apple Developer hesabına davet + bu repo. Genelde tek
seferlik 20-50 $'a paketleyip yükler. (Yol A'yı bir kez kurarsan sonraki
sürümlerde bu masraf olmaz.)

---

## 7. Mağaza sayfası malzemeleri (Adım 5)

Her iki mağaza için de lazım. Bir öğleden sonrada hazırlanır:

- [ ] **Ekran görüntüleri.** Uygulamanın en güzel 5 ekranı: Ana sayfa (Dashboard),
      harita/saha keşfi, oyuncu kartı, maç ekranı, taktik stüdyosu.
      - iPhone için: **6.9 inç** (1290×2796) ve **6.5 inç** (1242×2688) boyutları.
      - Android için: telefon ekran görüntüleri (en az 2 tane).
      - 👉 Kolay yol: uygulamayı telefonunda aç, ekran görüntüsü al. Ya da bana
        söyle, tarayıcıda telefon boyutunda açıp senin için çekeyim.
- [ ] **Uygulama açıklaması** (mağaza sayfasında görünen tanıtım yazısı).
      - Play: kısa açıklama (80 karakter) + uzun açıklama (4000 karakter).
      - App Store: alt başlık (30 karakter) + açıklama + anahtar kelimeler.
- [ ] **Feature graphic (yalnız Play):** 1024×500 piksel bir kapak görseli.
- [ ] **Uygulama ikonu:** Zaten uygulamanın içinde OYNA ikonu var; mağaza ayrıca
      1024×1024 bir kopya isteyebilir (`assets/icon-only.png` kullanılabilir).

---

## 8. Formlar: Veri Güvenliği / Gizlilik Etiketleri (Adım 6)

Her iki mağaza da "uygulaman hangi verileri topluyor?" diye sorar. OYNA için
**aynı cevapları** ikisine de verirsin. İşaretlemen gerekenler:

| Veri | Neden topluyorsun |
|------|-------------------|
| Ad | Profil |
| E-posta | Giriş |
| Telefon numarası | Giriş / iletişim |
| Konum (yaklaşık + kesin) | Yakındaki sahaları göstermek |
| Fotoğraf | Profil fotoğrafı |
| Rehber | Arkadaş bulma (sadece şifreli/hash, ham numara sunucuya gitmez) |
| Ödeme bilgisi | Saha kiralama ücreti (ödeme sağlayıcıya gider) |
| Cihaz kimliği | Bildirim göndermek |
| Kullanım / çökme verisi | Uygulamayı iyileştirmek |

- **Önemli:** "Verileri **reklam/izleme (tracking)** için kullanıyor musun?" →
  **Hayır.** (Reklam ağı veya veri satışı yok.) Bu sayede Apple'da ekstra
  "izin isteme" ekranı gerekmez.
- Bu envanter, uygulamanın içindeki `PrivacyInfo.xcprivacy` dosyasıyla **uyumlu**
  hazırlandı — çelişki çıkmaz.

---

## 9. Push bildirimleri (Adım 7) — sonraya bırakılabilir

Uygulama bildirimleri (maç hatırlatması vb.) yayına engel **değil**; sonra da
açabilirsin. Açmak istediğinde iki anahtar gerekir:

- **Android (Firebase):** `google-services.json` adlı dosyayı Firebase'den alıp
  `android/app/` klasörüne koyman gerekir (bana verirsen entegre ederim).
- **iPhone (Apple):** Apple'dan bir **APNs anahtarı** (`.p8`) üretip sunucu
  ayarlarına eklemek gerekir.

Bunlar olmadan uygulama **sorunsuz çalışır**, sadece bildirim gelmez.

---

## 10. Sık takılınan yerler (SSS)

**"iOS workflow'u kırmızı ❌ verdi, ne yapayım?"**
Actions'ta kırmızı işe tıkla, en alttaki hata satırına bak. En sık sebep: 3
anahtardan biri yanlış. Özellikle `ASC_API_KEY_P8`'i yapıştırırken `.p8`
dosyasının **tamamını** (BEGIN ve END satırları dahil) kopyaladığından emin ol.

**"Apple 'giriş yapamadık' diye reddetti."**
Adım 2'deki inceleme hesabının e-posta + şifresini App Review Information'a
girmeyi unutmuşsundur ya da hesabın e-posta onayı yapılmamış. Hesabı kendi
telefonunda bir kez "GİRİŞ YAP" ile deneyip çalıştığını gör, sonra o bilgileri
yaz.

**"Apple ödeme yüzünden reddederse?"**
Review Notes'a eklediğin nottaki gibi: saha kiralama **fiziksel hizmet**,
bu yüzden Apple'ın kendi ödeme sistemine (IAP) tabi değil (kural 3.1.5(a)).

**"Android AAB'yi tekrar üretmem gerekirse?"**
İki yol: (1) Sana gönderdiğim keystore'u GitHub'a secret olarak ekleyip
**Actions → "Android Release"** işini çalıştır. (2) Bir Mac/Linux'ta
`cd android && ./gradlew bundleRelease`. İkisi de `docs`'ta anlatıldı.

**"Keystore'u kaybedersem?"**
Sana gönderdiğim `oyna-upload.keystore` + parolasını **mutlaka bir şifre
kasasında** sakla (Bitwarden, 1Password vb.). Play App Signing kullandığın için
kaybolursa Google üzerinden sıfırlanabilir ama uğraştırır. Repoya **asla** koyma.

---

## 11. Küçük sözlük

- **.aab / .ipa:** Uygulamanın mağazaya yüklenen kurulum paketi (Android / iPhone).
- **Keystore:** Android paketini "senin ürettiğini" kanıtlayan dijital mühür.
  Her güncelleme aynı mühürle imzalanmalı.
- **TestFlight:** Apple'ın, uygulamayı yayına vermeden önce test ettiğin ortamı.
- **Bundle ID:** Uygulamanın kimlik numarası — bizde `com.oyna.app`.
- **Secret (GitHub):** GitHub'a güvenli şekilde sakladığın şifre/anahtar.
- **Workflow (GitHub Actions):** GitHub'ın bulutta senin için çalıştırdığı
  otomatik iş (bizde: iPhone/Android paketi üretmek).
- **OTP:** E-posta/SMS ile gelen tek kullanımlık giriş kodu.
- **IAP:** Apple'ın uygulama içi satın alma sistemi. Fiziksel hizmet sattığın
  için sana zorunlu değil.

---

## 12. Kalan işlerin özeti (yapılacaklar listesi)

- [ ] Alan adı + gizlilik/hesap-silme sayfalarını yayınla, boş yerleri doldur (avukat)
- [ ] Google Play Console hesabı aç (25 $)
- [ ] Apple Developer hesabı aç (99 $/yıl)
- [ ] İnceleme hesabı oluştur (`inceleme@oyna.app` + şifre)
- [ ] Android: `.aab`'yi yükle, formları doldur, (kişiselse) 14 gün test, yayına gönder
- [ ] iPhone: 3 anahtarı GitHub'a gir → Actions'tan paketi üret → TestFlight → yayına gönder
- [ ] Ekran görüntüleri + açıklama metinleri + feature graphic hazırla
- [ ] Veri güvenliği / App Privacy formlarını doldur
- [ ] (Sonra) Push bildirimleri: `google-services.json` + APNs anahtarı
- [ ] (Sonra) Ödeme sağlayıcı (iyzico) canlı anahtarları — bkz. `STORE_LANSMAN_PLANI.md` Faz D

> Strateji, takvim ve derinlemesine teknik detay için: bu klasördeki
> **`STORE_LANSMAN_PLANI.md`**. Bu rehber ise "ne yapacağım?"ın adım adım hâli.
