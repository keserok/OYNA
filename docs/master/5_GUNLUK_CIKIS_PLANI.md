# OYNA — 5 Günlük App Store & Google Play Çıkış Planı

> **Tarih:** 28 Temmuz 2026
> **Kaynak:** 10 boyutlu otomatik kod denetimi (129 bulgu) + düşman gözlü doğrulama
> (41 engelleyici iddiadan 15'i doğrulandı, 15'i çürütüldü) + güncel mağaza kuralları doğrulaması
> **Karar girdisi:** Kurucuya sorulan 7 soruya verilen cevaplar (§1)

---

## 0. Önce dürüst takvim

**"5 günde her iki mağazada yayında olmak" mümkün değil.** Sebebi kod değil, Google'ın kuralı:

| Mağaza | 5 günde nereye kadar? | Gerçek yayın tarihi |
|---|---|---|
| **App Store** | ✅ **Submit edilebilir** | ~8–12. gün (yeni uygulama incelemesi 2–5 gün) |
| **Google Play** | ⚠️ Kapalı test **başlatılabilir**, production **edilemez** | ~26. gün (14 gün test + ≤7 gün production başvurusu) |

Play Console hesabınız **Personal** tipinde. 13 Kasım 2023'ten sonra açılmış kişisel hesaplar
production'a çıkmadan önce **en az 12 tester ile 14 kesintisiz gün** kapalı test yapmak
zorunda. Bu bir kod problemi değil, aşılamaz bir hesap kuralı.

### Bu kısıtın planı değiştiren üç sonucu

1. **14 günlük sayaç, release onaylanıp 12 tester katıldığı anda başlar.**
   Yani sayacı 5. günde değil, **1. günün ilk saatinde** başlatmalıyız.
2. **Yeni build yüklemek sayacı sıfırlamaz.** Kusurlu bir ilk AAB ile başlayıp
   5 gün boyunca cilalamaya devam edebiliriz. Sayaç arka planda işler.
3. **Tester sayısı 12'nin altına bir an bile düşerse sayaç sıfırlanır.**
   12 değil, **16–18 tester** toplayın; fire payı şart.

Bu üç maddeyi uygularsak Play lansmanı ~40 günden ~26 güne iner.

> **Alternatif:** Organization tipi hesap bu şarttan muaf. Şahıs şirketiniz için D-U-N-S
> numarası alınabilir ama D&B süreci 1–4 hafta. 5 güne sığmaz ve yeni hesap = sıfırdan
> başlangıç demek. **Öneri: Personal hesapla devam edin, kapalı testi hemen başlatın.**

### Bu planın gerçek hedefi

> **5. günün sonunda:** iOS App Review'a submit edilmiş; Play kapalı testi 5 gündür
> çalışıyor, 12+ tester içeride, sayaç 9 gün kaldı. **~12. gün iOS'ta, ~26. gün Play'de yayında.**

---

## 1. Belirlenen uygulama: "OYNA v1 — Nakit Mod"

Sorulara verdiğiniz cevaplar ürünü şu şekilde tanımladı:

| Karar | Cevap | Etkisi |
|---|---|---|
| Mağaza hesapları | İkisi de açık ve onaylı | Gün 1'de yüklemeye başlanabilir |
| Mac erişimi | Var | iOS gerçekten çıkabilir |
| Ödeme | **Ödemesiz sürüm** | 15 doğrulanmış engelleyicinin 6'sı doğrudan siliniyor |
| Tüzel kişilik | Şahıs şirketi | Play Personal → 14 gün kuralı |
| İçerik | 1–2 gerçek saha kesin | Apple 4.2 riski yönetilebilir |
| Roller | Oyuncu + Saha sahibi + Kaleci/Hakem + Stüdyo | Hepsi v1'de |

### "Nakit Mod" ne demek?

Uygulama içinde **hiçbir para hareketi olmaz**. Kart girilmez, cüzdan yoktur, bakiye yüklenmez.

| Akış | Bugün (SIMULATION) | v1 (Nakit Mod) |
|---|---|---|
| Saha rezervasyonu | Kapora → sahte kart çekimi | **Talep** → tesis onaylar → **ödeme sahada** |
| Maça katılım | Cüzdandan bloke | Katılım ücretsiz, kaptan sahada toplar |
| Kaleci/hakem | "Kartla" butonu → hayalet ödeme | **Eşleştirme** → ücret sahada nakit |
| Cüzdan / çekim | Var ama tek yönlü | **Tamamen kaldırılır** |

**Bu tek karar neyi çözüyor:** Denetimde doğrulanan en tehlikeli engelleyiciler para
katmanındaydı — hayalet kart ödemesi, karta iade vaadi ile kodun çelişmesi, bakiye yüzünden
kilitlenen hesap silme, lisanssız saklı-değer cüzdanı, PCI-DSS kapsamı, Apple 3.1.1 sorgusu.
Para akışını çıkarmak bunların **tamamını** aynı anda ortadan kaldırıyor. Ödeme, iyzico
sözleşmesi tamamlandığında v1.1 ile açılır.

> ⚠️ **Kritik:** Ödemeyi "gizlemek" yetmez. `PAYMENT_PROVIDER` varsayılanı `SIMULATION` ve
> **fail-open** — env verilmezse sahte kartla harcanabilir bakiye üretilebiliyor
> (`supabase/functions/create-payment/index.ts:19`). Yol **kapatılmalı**, saklanmamalı.

---

## 2. Doğrulanmış engelleyiciler (düşman gözlü denetimden geçenler)

129 bulgudan 41'i "engelleyici" iddia edildi; bağımsız doğrulayıcılar **15'ini çürüttü**.
Aşağıdakiler çürütülemeyenler — plan bunların üzerine kurulu.

| # | Engelleyici | Kanıt | Gün |
|---|---|---|---|
| 1 | **Demo hesap seçici üretimde varsayılan AÇIK** — 29 hesap + `password123`, opt-out mantığı | `supabaseAuth.ts:364-366` | 2 |
| 2 | **Hayalet kart ödemesi:** "Kartla" butonu kart formu/3DS olmadan sağlayıcıya gerçek kazanç yazıyor | `views/MatchJoin.tsx:1655-1662` | 1 |
| 3 | **Hesap silme kilitli:** bakiye > 0 ise silinemiyor, çekim de kapalı → Apple 5.1.1(v) | `migrations/20260809000002:61-66` | 1 |
| 4 | **İade politikası kodla çelişiyor:** metin "karta iade edilir" diyor, kod karta iade yapmıyor | `sozlesmeler/oyuncu/05-*.md:24`, `LegalScreen.tsx:376` | 1 |
| 5 | **Ödeme sağlayıcısı fail-open:** varsayılan `SIMULATION`, iyzico çağrılmadan intent PAID | `functions/create-payment/index.ts:19,285-310` | 1 |
| 6 | **IBAN + hesap sahibi adı toplanıyor** ama gizlilik politikasında beyan edilmemiş | `PartnerOnboarding.tsx:77,111` | 2 |
| 7 | **Android imzalama tamamen koşullu** — `key.properties` yoksa AAB sessizce imzasız çıkar | `android/app/build.gradle:27-43` | 0 |
| 8 | **iOS `PrivacyInfo.xcprivacy` yok** → ITMS-91053 ile yükleme takılır | `ios/App/` | 3 |
| 9 | **Hiçbir mağaza ekran görüntüsü yok** — her iki mağazanın mutlak ön koşulu | depo taraması | 4 |
| 10 | **Play feature graphic / 512 ikon / mağaza metinleri yok** | depo taraması | 4 |
| 11 | **App Review notları kodla çelişiyor** — "simülasyon modunda" beyanı | `docs/master/APP_REVIEW_NOTLARI.md` | 4 |
| 12 | **Play Personal hesap → 12 tester × 14 gün** | Play politikası | 0 |

**Çürütülenlerden bazıları** (bunlara vakit harcamayın): Android imzalama config'i aslında
tam ve doğru (eksik olan sadece keystore *dosyası*); `@capacitor/camera` izin sızıntısı
yanlış alarm (yalnız `<queries>` bloğu var); `supabase/config.toml` üretim değil yerel
şablon; admin SPA'nın pakete girmesi ayrı entry point ile yönetiliyor; `google-services.json`
yokluğu push'u öldürür ama yayını engellemez.

---

## 3. Beş günlük plan

Her gün **[K]** = kurucu işi, **[G]** = geliştirici işi. İkisi paralel yürür.

---

### GÜN 0 — Bugün, ilk 3 saat: **Sayacı başlat**

> Bu günün tek amacı var: Play'in 14 günlük sayacını çalıştırmak. Kalite bugün önemli değil,
> **hız önemli.** Her geciken saat, Play lansmanını bir saat öteler.

**[G] Adım 1 — İmzalı AAB üret (2 saat)**
```bash
keytool -genkeypair -v -keystore oyna-upload.keystore \
  -alias oyna -keyalg RSA -keysize 2048 -validity 10000
# android/key.properties oluştur (repoya COMMIT ETME):
#   storeFile=../oyna-upload.keystore
#   storePassword=...  keyAlias=oyna  keyPassword=...
```
- `VITE_DEMO_ACCOUNTS=false` ile build al (demo hesaplar pakete girmesin — engelleyici #1)
- `npm run build && npx cap sync android && ./gradlew bundleRelease`
- ⚠️ `cap sync` mutlaka çalıştırılmalı: `capacitor-browser` native projede kayıtlı **değil**;
  senkronsuz build'de Google ile giriş `disallowed_useragent` ile kırılır.
- **Doğrula:** `jarsigner -verify -verbose app-release.aab` → imzalı olmalı

**[K] Adım 2 — Play Console (1 saat)**
- Uygulama oluştur → **Closed testing** track → AAB yükle
- Mağaza girişini asgari doldur (bu aşamada mükemmel olması gerekmiyor)
- Tester listesi oluştur

**[K] Adım 3 — 16–18 tester topla (gün boyu, en kritik iş)**
- Ordu'daki halı saha topluluğu doğal havuz: ilk gerçek kullanıcılarınız
- Her tester **Google hesabıyla katılmalı ve uygulamayı kurmalı** — sadece davet yetmez
- 12'nin altına düşmek sayacı sıfırlar; **fire payıyla 16+ hedefleyin**
- WhatsApp grubu kurun, 14 gün boyunca kimse uygulamayı kaldırmasın

**[G] Adım 4 — iOS duman testi (2 saat, gizli risk avı)**
> ⚠️ **iOS bu depoda bir kez bile derlenmedi.** `Podfile.lock` başka bir makinenin ölü
> yollarını taşıyor ve 15 pod'un yalnız 4'ünü içeriyor. Gün 3'te patlarsa plan çöker.
> **Bugün Mac'te bir deneme derlemesi yapın** — sorunları 3 gün önceden görün.
```bash
npx cap sync ios && cd ios/App && pod install && open App.xcworkspace
```

---

### GÜN 1 — **Parayı kes: Nakit Mod** [G]

*Engelleyici #2, #3, #4, #5'i kapatır. En yüksek değerli gün.*

1. **Tek kapı ekle (2s):** `VITE_PAYMENTS_ENABLED=false` + merkezi `paymentsEnabled()` yardımcısı.
   Fail-**closed** olsun: env yoksa ödeme KAPALI.
2. **Ödeme yüzeylerini kaldır (3s):** Cüzdan ekranı, bakiye yükleme, kart yönetimi,
   çekim akışı, `PaymentScreen` rotası. Menüden ve derin bağlantılardan da çıkar.
3. **Rezervasyonu talebe çevir (3s):** Veri modeli bunu **zaten destekliyor** —
   `types.ts:1012` `status: 'PENDING'`, `:1018` `payment_status: 'WAIVED'`,
   `:990` `payment_method: 'CASH'`. Yeni tablo/migration gerekmez.
4. **Hayalet ödemeyi yok et (2s):** `MatchJoin.tsx:1655` "Kartla" butonunu kaldır.
   `fundServiceRequest` sağlayıcıya **kazanç yazmamalı** — aksi hâlde OYNA ödeyemeyeceği
   borç biriktirir. Kaleci/hakem = eşleştirme + sahada nakit.
5. **Hesap silme kilidini kaldır (2s):** Ödeme kapalıyken finansal muhafız devre dışı
   (`account_deletion_financial_guard`). Apple 5.1.1(v) için şart.
6. **Sunucu tarafını kapat (1s):** `create-payment` varsayılanı `SIMULATION` → `DISABLED`,
   fail-open değil **fail-closed**. Çağrı gelirse 403 dönsün.
7. **Yasal metinleri gerçeğe uydur (2s):** Mesafeli satış / iptal-iade metinleri
   "uygulama içinde ödeme alınmaz, ödeme tesiste yapılır" gerçeğini yansıtsın.

**Gün sonu kapısı:** Uygulamada kart girilebilecek tek bir ekran kalmamalı. `grep -ri "iyzico\|cüzdan\|bakiye"` ile tüketici yüzeyini tarayın.

---

### GÜN 2 — **İnceleme güvenliği ve gizlilik** [G]

*Engelleyici #1, #6'yı kapatır.*

1. **Demo hesapları fail-closed yap (1s):** `supabaseAuth.ts:364` mantığını ters çevir:
   `!== 'false'` → `=== 'true'`. Env unutulursa demo **kapalı** olsun.
2. **`?demo=1` arka kapısını kaldır (1s)** — canlı web dahil her domainde şifresiz giriş açıyor.
3. **Anonim PII sızıntısı (4s):** Girişsiz kullanıcılar oyuncu ad+avatarını ve kaleci/hakem
   koordinatlarını okuyabiliyor. RLS ile daraltın — KVKK ve her iki mağazanın gizlilik şartı.
4. **Gizlilik metnini gerçek envanterle eşitle (2s):** IBAN + hesap sahibi adı toplanıyor
   ama beyan edilmemiş. Data Safety / Nutrition Label ile birebir tutmalı.
5. **İzin metinlerini temizle (1s):** Kamera kullanılmıyorsa `NSCameraUsageDescription` ve
   manifest `CAMERA` iznini kaldırın. Kullanılmayan izin = Play politika sorgusu.
6. **Apple butonu Android'de gizlensin (1s)** — şu an görünüp kesin hata veriyor.
7. **Saha sahibi hesap silme (3s)** — OWNER menüsünde hesap silme yok.

---

### GÜN 3 — **Native derleme: iki platformda imzalı paket** [G]

1. **Android (3s):** `cap sync` → versionCode otomasyonu → imzalı AAB #2 →
   kapalı teste yükle (sayaç sıfırlanmaz, sadece tazelenir)
2. **iOS (6s, Mac'te):**
   - `Podfile.lock` sil, `npx cap sync ios && pod install` (15 pod'un hepsi linklenmeli)
   - Apple Developer portal: `com.oyna.app` App ID'sinde **Push** + **Sign in with Apple** aç
   - `PrivacyInfo.xcprivacy` ekle (engelleyici #8 — ITMS-91053)
   - `capacitor.config.ts` `ios.scheme='OYNA'` ↔ Info.plist `oyna` çakışmasını çöz
   - `aps-environment` cihaz testi için `development`, submit'te `production`
   - Xcode 26 ile Archive → TestFlight'a yükle
3. **Push kararı (1s):** FCM `google-services.json` (Firebase konsolu ~15 dk) + APNs `.p8`.
   Yetişmezse **v1'de uzak push'u kapatın** — uygulama içi bildirimler zaten çalışıyor,
   yayını bloklamaz.

---

### GÜN 4 — **Mağaza vitrini** [K + G]

*Engelleyici #9, #10, #11'i kapatır. Ekran görüntüsü olmadan submit tuşu aktifleşmez.*

1. **Ekran görüntüleri (4s):** iPhone 6.9" + 6.5" **zorunlu**, Android telefon.
   Önerilen 5 ekran: harita/saha keşfi → maç lobisi → FUT kartı → taktik stüdyosu → takım.
2. **Play görselleri (2s):** feature graphic 1024×500, mağaza ikonu 512×512.
   Adaptive ikon foreground tuvalin yalnız %19–20'sini kaplıyor → launcher'da minicik
   görünüyor, düzeltin.
3. **Mağaza metinleri (3s):** Play kısa (80) + uzun (4000); App Store ad (30) + alt başlık (30)
   + anahtar kelime (100).
4. ⚠️ **EA / FIFA referanslarını temizleyin (2s):** README ve ürün içinde "EA Sports FIFA
   Ultimate Team (FUT)" geçiyor. Mağaza metnine girerse **marka ihlali reddi** alırsınız.
   "FUT kartı" → "OYNA Kartı" gibi kendi dilinize çevirin.
5. **Formlar (2s):** Play Data Safety + Apple Privacy Nutrition Labels. Gün 2'deki gerçek
   envanterle **birebir** aynı olmalı — uyuşmazlık sonradan uygulama kaldırma sebebi.
6. **App Review notlarını yeniden yaz (1s):** Mevcut metin ödemenin "simülasyon modunda"
   olduğunu söylüyor — bu incelemeciye **yanlış beyan**. Yeni metin: "Bu sürümde uygulama
   içi ödeme yoktur; rezervasyon taleptir, ödeme tesiste yapılır."
7. **İncelemeci hesapları (1s):** E-posta + şifre ile giren, e-postası onaylanmış hesap.
   ⚠️ Kaleci/hakem/saha sahibi rolleri **admin onayı** arkasında — incelemeci test edemez.
   Her rol için **önceden onaylanmış** birer hesap hazırlayın.
8. **[K] Gerçek içerik:** 1–2 sahanın fiyat/takvim verisini girin. Boş bölge davranışı
   (`"Bölgende henüz saha yok"`) cilalı olsun — incelemeci Ordu'da değil.
9. **[K] "OYNA" isim müsaitliği** — her iki mağazada kontrol, yedek isim belirleyin.

---

### GÜN 5 — **QA ve submit** [G + K]

1. **Gerçek cihaz matrisi (3s):** Düşük segment Android (minSdk 23!), güncel Android,
   çentikli iPhone. Uçak modu, izin reddi, safe-area — App Review bunları dener.
2. **Kritik akış provası (2s):** Kayıt → konum izni → saha keşfi → maç kur → talep gönder
   → tesis onaylar → maç sonu puanlama → **hesap silme**.
3. **Misafir modu (1s):** Girişsiz gezinme hiçbir ekranda hata patlatmamalı.
4. **iOS: App Review'a submit.** "Manuel yayınlama" seçin — onay gelince kontrollü çıkarsınız.
5. **Play: son build'i kapalı teste yükle**, 12+ tester hâlâ içeride mi doğrulayın.
6. **Lansman anahtarları:** `demo_mode_enabled=KAPALI`, demo verisi purge,
   `VITE_DEMO_ACCOUNTS=false`, `VITE_PAYMENTS_ENABLED=false`.

---

## 4. Paralel kurucu hattı (5 gün boyunca)

| İş | Aciliyet | Not |
|---|---|---|
| **16+ tester toplama ve elde tutma** | 🔴 Gün 0 | Sayaç bunun üzerine kurulu |
| Yasal metinlerin canlı public URL'de yayını | 🔴 Gün 0-1 | Her iki mağaza konsolu erişilebilir URL ister |
| `[ŞİRKET ÜNVANI]` yer tutucularını doldurma | 🔴 Gün 1 | Kullanıcıya aynen görünüyor |
| Avukat incelemesi (4 metin) | 🟡 Gün 1-5 | Ödemesiz sürüm hukuki yükü ciddi azalttı |
| **ETBİS kaydı** (6563 sayılı Kanun) | 🟡 Gün 2 | Aracı hizmet sağlayıcı zorunluluğu |
| APNs `.p8` + Firebase projesi | 🟡 Gün 3 | Push'u v1'de kesersen ertelenebilir |
| iyzico sözleşme/KYC | 🟢 Paralel | v1.1 için; v1'i bloklamıyor |

---

## 5. Riskler ve azaltma

| Risk | Olasılık | Azaltma |
|---|---|---|
| **iOS ilk derlemede patlar** (hiç derlenmemiş) | Yüksek | Gün 0'da duman testi — 3 gün erken uyarı |
| Tester sayısı 12'nin altına düşer, sayaç sıfırlanır | Orta | 16–18 tester + WhatsApp takibi |
| Apple 4.2 "yetersiz içerik" reddi | Orta | Gerçek saha verisi + boş bölge akışı cilası |
| Apple 3.1.1 IAP sorgusu | **Düşük** | Ödemesiz sürümde satılan dijital ürün yok |
| EA/FIFA marka ihlali reddi | Orta | Gün 4'te metin temizliği |
| Data Safety ↔ gerçek toplama uyuşmazlığı | Orta | Gün 2 envanteri tek kaynak |

---

## 6. Kapsam kararı: neyi v1.1'e bırakıyoruz

**v1'de var:** Oyuncu çekirdeği · saha keşfi/harita · maç kurma ve katılım · takım ·
taktik stüdyosu · saha sahibi paneli (talep onay/red) · kaleci-hakem eşleştirme · profil ·
hesap silme · misafir modu

**v1.1'e ertelendi:** Uygulama içi ödeme ve cüzdan (iyzico sonrası) · karta iade ·
IBAN payout · uzak push (Gün 3'te yetişmezse) · Universal Links · QR bilet doğrulayıcı ·
targetSdk 36 yükseltmesi (**31 Ağustos 2026 sınırı** — Play production'a ~26. günde
gideceğiniz için yetişiyor, ama ilk güncellemeye mutlaka koyun)

---

## 7. Ek: doğrulanmış mağaza kuralları (Temmuz 2026)

- Play Personal hesap (13.11.2023 sonrası): **12 tester × 14 kesintisiz gün** kapalı test,
  ardından production başvurusu ≤7 gün. Organization hesaplar muaf.
- Yeni build yüklemek 14 günlük sayacı **sıfırlamaz**; tester sayısı 12'nin altına
  düşerse **sıfırlar**.
- **31 Ağustos 2026**'dan itibaren yeni uygulamalar ve güncellemeler **API 36** hedeflemeli
  (1 Kasım 2026'ya uzatma talep edilebilir). Proje şu an targetSdk 35.
- Apple: **28 Nisan 2026**'dan beri tüm gönderimler **Xcode 26 / iOS 26 SDK** ile derlenmeli.
- App Store incelemesi: ~%90'ı 24 saat içinde, ancak **yeni uygulamalar 2–5 gün**.

**Kaynaklar:**
[Play test şartı](https://support.google.com/googleplay/android-developer/answer/14151465) ·
[Play target API](https://support.google.com/googleplay/android-developer/answer/11926878) ·
[Apple upcoming requirements](https://developer.apple.com/news/upcoming-requirements/)
