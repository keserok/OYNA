# OYNA — APPLE GUIDELINE 5.6 RET ÇÖZÜM PLANI

> **Tarih:** 22 Ağustos 2026 · **Durum:** YÜRÜRLÜKTE · **Sahibi:** kurucu
> **Kapsam:** Apple'ın 5.6 (Developer Code of Conduct) reddinin kökten
> kapatılması ve ikinci bir ret sebebinin bırakılmaması.
>
> Bu dosya `MAGAZA_GONDERIM.md`'yi **geçersiz kılmaz**, onun üstüne biner.
> Çelişki çıkarsa **bu dosya geçerlidir** (daha yeni ve canlı denetime dayanıyor).

---

## 0 · YARGI — tek paragraf

22 Ağustos'ta reddin **bilinen** sebebi (`VITE_MAGAZA_INCELEME` inceleme paketi)
söküldü ve doğru söküldü. Ama bugün **canlı sistemde** aynı ihlalin üç örneği
daha duruyor; en ağırı **sunucuda**, yani yeni bir paket göndermek onu
düzeltmiyor. Bu hâliyle gönderilirse ikinci ret beklenmelidir: bir uygulama 5.6
aldıktan sonra Apple aynı uygulamaya **özellikle** bu açıdan bakar.

Aşağıdaki üç bulgu kapatılmadan gönderim yapılmamalıdır.

---

## 1 · CANLIDA OLAN KANITLAR

Bulgular 22 Ağustos 2026'da **üretim veritabanına** (`iikvzgyccvgcybzdfwlv`)
sorgu atılarak doğrulandı. Tahmin değil, ölçüm.

### BULGU 1 — Sunucu, incelemeciye başka bir uygulama servis ediyor · **AĞIR · 5.6**

`get_nearby_providers` fonksiyonunun **canlıdaki** tanımı hâlâ
`_cagiran_demo_mu()` kapısını taşıyor. Yani kaleci/hakem vitrini
**çağıranın kim olduğuna göre** farklı cevap veriyor.

Aynı fonksiyon, aynı koordinat (Ordu), aynı an:

| Çağıran | Kaleci | Hakem |
|---|---|---|
| **Demo hesap** — incelemecinin gireceği hesap | **2** | **3** |
| **Gerçek kullanıcı hesabı** | **0** | **0** |

Ve onaylı 6 sağlayıcının **6'sı da demo**. Yani gerçek bir kullanıcı için bu
pazaryeri **her zaman boş**; yalnız demo hesapla girene dolu görünüyor.

Apple'ın cümlesi buydu: *"features that appear to have been intentionally
hidden during the review process."* Bu, o cümlenin birebir karşılığıdır —
üstelik tersinden: özellik incelemeciye **açılıyor**, kullanıcıdan
**gizleniyor**.

**Neden 22 Ağustos düzeltmesi bunu yakalamadı:** düzeltme paket tarafını
(`VITE_MAGAZA_INCELEME`, demo seçici, "APP REVIEW" afişi) söktü. Bu kapı
**sunucuda**. Depodaki `20260905000012` göçü kapıyı kaldırmış görünüyor ama
canlıda kapılı sürüm duruyor — göçler sıra dışı uygulanmış. Depo ile canlı
**ayrışmış** durumda.

### BULGU 2 — Ödeme ekranı, gerçekleşmeyen bir tahsilatı vaat ediyor · **AĞIR · 5.6 + 2.3.1**

Canlı ayarlar:

| Anahtar | Değer |
|---|---|
| `payment_provider` | `SIMULATION` |
| `simulation_counts_as_live` | `true` |
| `payment_mode_global` | `ONLINE_ONLY` |
| Tesislerin ödeme modu | 6/6 `ONLINE_ONLY` |

Ödeme ekranının kullanıcıya yazdığı cümle
(`views/PaymentScreen.tsx`):

> "Yukarıdaki tutarın tamamı seçtiğin karttan tek seferde tahsil edilir."

Gerçekte olan: **hiçbir kart çekilmiyor, her kart numarası kabul ediliyor.**

İncelemeci rezervasyon akışını denerken kart bilgisi girecek, "başarılı"
görecek, ekstresinde hiçbir şey olmayacak. Bu iki şeydir: (a) yanıltıcı
davranış — 5.6'nın "manipulative and misleading" kısmı; (b) yanlış beyanla
kart verisi toplama. `simulation_counts_as_live` anahtarının **kendi
açıklaması** zaten şunu diyor: *"gerçek para alınmaya başlamadan ÖNCE
kapatılmalıdır."*

### BULGU 3 — İnceleme notu, pakette olmayan bir giriş yolunu tarif ediyor · **AĞIR · 5.6 + 2.1**

`docs/master/APP_REVIEW_NOTLARI.md §1`, App Store Connect'e şu metnin
yapıştırılmasını söylüyor:

> "OYNA signs in with a phone number and a 6-digit SMS code…
> Phone number: `+90 500 000 00 02`"

Ama `1fe8b76` commit'i telefon girişini **tamamen kapattı**
(`shared/phone.ts · SMS_OTP_ENABLED = false`). Giriş ekranında numara alanı,
ayraç ve KOD GÖNDER düğmesi **çizilmiyor bile**. Not dosyası o commit'ten
**önce** yazıldı ve bir daha güncellenmedi (`git log` ile doğrulandı).

Sonuç: incelemeci notu okuyup uygulamayı açtığında tarif edilen giriş yolunu
**bulamayacak**. Bir 5.6 reddinden sonra bunun okunacağı tek bir anlam var.
Bu not bu hâliyle gönderilirse, tek başına ikinci reddi getirebilir.

### BULGU 4 — Vitrindeki içeriğin tamamına yakını sentetik · **ORTA · 2.3 / 3.2.2**

| Ölçüm | Değer |
|---|---|
| Profil | 37 (**30'u demo**) |
| Onaylı kaleci / hakem | 3 / 3 (**tamamı demo**) |
| Gelecek maç | 22 |
| Vitrindeki tesis | 4 (sahipleri demo hesaplar) |
| `demo_mode_enabled` | `true` — kendi açıklaması: *"CANLI ortamda KAPALI olmalı"* |

Tek başına ret sebebi değil; ama 5.6 zaten masadayken "uygulama gerçek gibi
gösterilmiş" algısını besler.

### BULGU 5 — Açık görünen ama çalışmayan özellik · **ORTA · 2.1**

`push_live_enabled = false` → bildirim ayarları ekranı duruyor, kullanıcı
bildirimleri açıyor, **telefona push hiç gitmiyor**.

### BULGU 6 — Gönderim hijyeni · **DÜŞÜK ama engel**

- `npm run magaza:denetim` → **1 engel**: yasal sayfalar bayat (kaynak metin
  değişmiş, `public/*.html` yeniden üretilmemiş — 6 sayfa).
- `ios/App/Podfile.lock` çok eski: Podfile'da 15 eklenti var, kilitte 4;
  üstelik yollar **başka bir makineyi** gösteriyor.

### Doğru olduğu DOĞRULANANLAR (bunlara dokunma)

| Şart | Durum |
|---|---|
| Hesap silme, uygulama içinden — 5.1.1(v) | ✅ `DeleteAccountModal` + sunucu kuyruğu |
| Sign in with Apple — 4.8 | ✅ entitlement + eklenti + Apple üstte |
| Engelleme / şikayet — 1.2 | ✅ sohbet, lobi, saha içeriği |
| İzin gerekçeleri — 5.1.1 | ✅ 5 metin, her birinin koddaki kanıtı Info.plist'te yazılı |
| Gizlilik manifestosu — ITMS-91053 | ✅ 14 veri türü, projeye kayıtlı |
| `minSupportedVersion` = 1.0.0, bakım modu kapalı | ✅ açılışta kilitlenme yok |
| iPad — 2.4.1 | ✅ `TARGETED_DEVICE_FAMILY = 1` (yalnız iPhone; iPad iddiası yok) |
| Fiziksel hizmet → IAP muafiyeti — 3.1.5(a) | ✅ saha kirası/kapora, dijital ürün yok |
| Demo hesap kataloğu üretim paketinde | ✅ derleme zamanı elenir, denetim engel veriyor |

---

## 2 · KÖK NEDEN — ve bir daha delinmeyecek kural

Üç ağır bulgu da **aynı desenin** tekrarı:

> Gerçek bir kısıt (SMS yalnız +90'a gidiyor / gerçek sağlayıcı yok / iyzico
> canlı değil) **herkes için çözülmek yerine**, incelemecinin o kısıtı
> görmemesini sağlayan bir yolla yamandı.

22 Ağustos'ta konan kural doğruydu ama **yarım**:

> ~~Gönderilen paket = kullanıcının indirdiği paket.~~

Kuralın tam hâli:

> ### Gönderilen paket = indirilen paket **VE** sunucunun incelemeciye verdiği cevap = gerçek kullanıcıya verdiği cevap.
>
> İncelemecinin karşılaştığı engel neyse, o engel **herkes için** çözülür.
> Çözülemiyorsa özellik **herkes için** kapatılır ve bu, notta yazılır.
> "İncelemeci görsün diye" başlayan hiçbir cümle bir çözüm değildir.

Sunucu tarafı bu kuralın **dışında tutulamaz**: kullanıcı için uygulama =
paket + sunucunun cevabı.

---

## 3 · SENİN VERMEN GEREKEN İKİ KARAR

Kalan işin tamamı bu iki karara bağlı. Diğer her şeyi ben kapatabilirim.

### KARAR 1 — Kaleci / hakem pazaryeri

Kapı kalkınca sağlayıcı vitrini **herkes için boşalır** (onaylı 6 sağlayıcının
6'sı demo). Boş bir vitrin de 2.1 riskidir. Üç yol var:

| # | Yol | Sonuç | Süre |
|---|---|---|---|
| **A** | **Ordu'da 2–3 gerçek kaleci/hakem kaydet**, demo olanları vitrinden çıkar | Herkes aynı gerçek listeyi görür. Hem 5.6 hem 2.1 kapanır. **En doğru sonuç.** | 3–5 gün (insan işi) |
| **B** | Pazaryerini 1.0'dan **tamamen çıkar** — herkes için, tek bayrakla (`SMS_OTP_ENABLED` deseni). Menü girişi de kalkar | Boş ekran yok, sahte veri yok, incelemeciye özel yol yok. Özellik 1.1'de gerçek sağlayıcılarla döner | Yarım gün (kod) |
| **C** | Demo sağlayıcıları herkese göster | ❌ **Yapma.** Gerçek kullanıcı sahte bir kaleciye talep gönderir, kimse gelmez. 5.6'yı 3.2.2 ile değiştirmek olur | — |

> **Önerim: A, yetişmezse B.** İkisi de dürüst ve herkes için aynı.
> A'yı bu hafta 2 kişiyle bile başlatabilirsen 1.0 tam özellikli çıkar.

### KARAR 2 — Ödeme

`SIMULATION`'ın "canlı" sayıldığı hâliyle **gönderim yapılamaz.** İki yol:

| # | Yol | Sonuç | Ön koşul |
|---|---|---|---|
| **A** | **iyzico'yu canlıya al**: canlı anahtarlar, `iyzico_sandbox_mode=false`, `payment_provider=IYZICO`, `simulation_counts_as_live=false` | Kapora gerçekten çekilir. Uygulamanın ana işi çalışır ve dürüsttür. Fiziksel hizmet → IAP gerekmez (3.1.5(a)) | iyzico üye işyeri **canlı** anahtarları + uçtan uca 1 gerçek işlem testi |
| **B** | Lansmanı **nakit rezervasyona** çevir: `payment_mode_global=CASH_ONLY`, `simulation_counts_as_live=false`; kart akışı hiç çizilmez | Kart bilgisi hiç istenmez. Dürüst ve tutarlı. Ama sunucudaki nakit rezervasyon kapısının açılması gerekir (§2.12'de kapatılmıştı) | Yarım–bir gün kod + yasal metin hizalaması |

> **Önerim: A.** Uçların tamamı hazır (`create-payment`, `capture-payment`,
> `void-payment`, `refund-payment`, `iyzico-3ds-callback`, `payment-webhook`
> yazılmış ve yüklü). Eksik olan **canlı anahtar** ve bir gerçek işlem testi —
> yani kod değil, hesap işi.
> Canlı anahtar bu hafta çıkmıyorsa **B** ile gönder; A'yı 1.1'e bırak.
> **Hiçbir koşulda simülasyonla gönderme.**

---

## 4 · YAPILACAKLAR — sırayla

### FAZ 1 — 5.6'yı kökten kapat (kararlardan bağımsız, hemen)

1. **Sunucudaki incelemeci kapısını kaldır.**
   `_cagiran_demo_mu()` çağrısı `get_nearby_providers`'tan çıkar; fonksiyonun
   kendisi `DROP` edilir. Kapının **hiçbir yerde** okunmadığı sorgu ile
   kanıtlanır.
   → Yeni göç: `20260916000000_incelemeci_kapisi_sokuldu.sql`
   → Kendi kendini doğrulasın: aynı çağrı **demo ve gerçek hesapta aynı
     sayıyı** döndürmezse göç patlasın.

2. **Depo ↔ canlı ayrışmasını kapat.**
   Bulgu 1'in asıl sebebi göçlerin sıra dışı uygulanmış olması. Canlıdaki
   `get_nearby_*` ve ödeme fonksiyonlarının tanımı depodakiyle **birebir**
   karşılaştırılır; fark varsa göçle hizalanır.
   *(Bu yapılmazsa başka kapılar da canlıda duruyor olabilir — tek tek
   bakmak yerine karşılaştırma yapılmalı.)*

3. **İnceleme notunu sıfırdan yaz.** (`APP_REVIEW_NOTLARI.md`)
   Telefon/SMS anlatısı tamamen çıkar. Yeni not §5'te hazır.

4. **`demo_mode_enabled = false`** ve demo ekosistemi `demo_ekosistem_temizle()`
   ile silinir — **KARAR 1 = A ise.** B ise demo içerik durabilir ama
   sağlayıcı vitrini kapalı olduğundan çelişki kalmaz.
   *(Bu, kurucunun "en son bu verileri komple sileceğiz" sözünün yeridir.)*

5. **`push_live_enabled`**: APNs/FCM anahtarları hazırsa **aç**; değilse
   bildirim ayarları ekranına "bildirimler yakında" durumunu **herkes için**
   yaz. Açık görünüp çalışmayan ayar bırakma.

### FAZ 2 — Kararların uygulanması

6. KARAR 1'in gereği (gerçek sağlayıcı kaydı **veya** pazaryeri bayrağı).
7. KARAR 2'nin gereği (iyzico canlı **veya** `CASH_ONLY` + kart akışının
   çizilmemesi). Hangisi olursa olsun `simulation_counts_as_live = false`.

### FAZ 3 — Gönderim hijyeni

8. `node scripts/build-legal-pages.mjs` → 6 yasal sayfa yeniden üretilir.
9. `npm run sync:ios && cd ios/App && pod install` → Podfile.lock tazelenir
   (15 eklenti). **Atlanırsa rehber/konum/kamera/paylaşım eklentileri pakete
   girmez.**
10. Derleme numarası 2 → **3** (`npm run surum:artir`).
11. `npm run magaza:denetim` → **0 engel** olmadan gönderim yok.

### FAZ 4 — İncelemecinin yürüyeceği yolu bizzat yürü

Aşağıdaki senaryo, **yeni bir Apple ID ile, Türkiye dışı bir hesapta**,
gönderilecek paketin üstünde birebir denenir. Her adım ✅ olmadan gönderim yok.

1. Uygulama açılır → tanıtım → **Apple ile Giriş** görünür ve çalışır.
2. Numara ekranı gelirse **ŞİMDİLİK ATLA** çalışır; sonraki açılışta zorlamaz.
3. Ana ekran: konum kapsam dışı → **KONUMU AYARLA** → listenin **tepesinde**
   Ordu / Altınordu → seçilir.
4. Maç listesi dolar. Bir maça katılım denenir.
5. Rezervasyon/ödeme akışı KARAR 2'ye göre **dürüst** davranır.
6. Ayarlar → **Hesabı Sil** çalışır.
7. Sohbet/lobi → **şikayet + engelle** çalışır.
8. Kaleci/hakem: KARAR 1'e göre ya **gerçek liste** ya da **hiç yok**.

---

## 5 · APP STORE CONNECT'E YAPIŞTIRILACAK NOT (hazır, İngilizce)

> **App Review Information → Notes.** Aşağıdaki metin, üç ağır bulgu
> kapatıldıktan **sonra** geçerlidir; önce gönderilirse yine yanlış beyan olur.

```
ABOUT THIS SUBMISSION

This build addresses your Guideline 5.6 rejection. You were right: our
previous submission was compiled with a review-only flag that added a
"demo account" button and an "APP REVIEW" banner which no downloaded copy
of the app contained.

That machinery is gone. We also audited our backend and removed a
server-side rule that returned different marketplace results depending on
which account was calling. Reviewers and users now receive identical
responses from identical code. There is no review-only build, no review
flag, and no review-only server path anywhere in this product.

SIGNING IN
The app signs in with Sign in with Apple or Google only. Please use your
own Apple ID — you will get exactly the same account type, the same
permissions and the same data any user gets. We are not providing a
special reviewer account, by design.
A phone number is optional. You can skip it at sign-in and browse the app.

SEEING CONTENT — PLEASE READ
OYNA is launching in a single city: Ordu, Türkiye. Content is
region-based, so the app will look empty from any other location — for
you and for any user outside Ordu alike.
On first launch, tap "KONUMU AYARLA" (Set location) on the home screen and
pick Ordu / Altınordu. Covered regions are pinned to the top of that list.
Matches and pitches will then load.

PAYMENTS
Payments in OYNA are for physical, real-world services only: a deposit for
renting a football pitch and a share of a match fee. There is no digital
content, no subscription and no unlockable feature, so In-App Purchase
does not apply (Guideline 3.1.5(a)). Our payment provider is iyzico.

ACCOUNT DELETION
Settings → Account → "Hesabı Sil" (Delete account), per Guideline 5.1.1(v).

Thank you for the review — the 5.6 finding was correct and we fixed the
cause, not the symptom.
```

**Sign-In Information alanı:** kullanıcı adı/şifre **verme**. "Sign in with
Apple" kullanıldığı için incelemeci kendi Apple ID'siyle girer; notta bu
açıkça yazıyor. *(Alan zorunlu tutulursa: `Sign-In required: Yes` işaretle ve
kullanıcı adı alanına `Sign in with Apple — use your own Apple ID` yaz.)*

> **Neden incelemeciye özel hesap vermiyoruz:** 5.6'nın sebebi tam olarak
> "incelemeciye özel yol"du. Kendi Apple ID'siyle giren incelemeci, gerçek bir
> kullanıcının gördüğünün **aynısını** görür — ve bu, iddiamızın kendisi
> olur. Verilecek her özel hesap bu iddiayı zayıflatır.

---

## 6 · GÖNDERİM ÖNCESİ KONTROL LİSTESİ

Hepsi ✅ değilse gönderim yok.

**5.6 — kökten kapandı mı**
- [ ] `get_nearby_providers` çağırana göre farklı sonuç **döndürmüyor** (sorguyla kanıtlandı)
- [ ] `_cagiran_demo_mu()` veritabanından **düşürüldü**
- [ ] Canlı fonksiyon tanımları depodaki göçlerle **birebir**
- [ ] Pakette `VITE_MAGAZA_INCELEME` / demo seçici / "DEMO HESABIYLA GİR" **izi yok**
- [ ] İnceleme notu paketin **gerçeğini** anlatıyor (telefon/SMS anlatısı silindi)
- [ ] İncelemeciye özel hesap, bayrak, sunucu anahtarı **yok**

**Dürüstlük**
- [ ] `simulation_counts_as_live = false`
- [ ] Ödeme ekranının vaadi ile gerçek davranış **aynı**
- [ ] `demo_mode_enabled` kararı uygulandı
- [ ] Açık görünüp çalışmayan özellik **yok** (push dahil)

**Hijyen**
- [ ] `npm run magaza:denetim` → **0 engel**
- [ ] Yasal sayfalar taze · [ ] Podfile.lock taze (15 eklenti) · [ ] Build 3
- [ ] FAZ 4'teki 8 adım **gerçek cihazda, yurt dışı Apple ID ile** yürütüldü

---

## 7 · DOĞRULAMA KİLİTLERİ (regresyonu imkânsız kıl)

Bu proje zaten "düzeltmeyi teste bağla" prensibini işletiyor; aynısı burada da:

1. **`tests/unit/incelemeciKapisiYok.test.ts`** — kaynakta ve göç
   klasöründe çağırana bağlı kapı deseni (`_cagiran_demo_mu`,
   `auth.uid()` + `is_demo` birleşimi) arar; bulursa **kırmızı**.
2. **`magaza-denetim.mjs` yeni kapı** — canlı veritabanına sorup
   `get_nearby_*` fonksiyonlarında çağıran bağımlılığı varsa **engel** verir.
3. **`magaza-denetim.mjs` ödeme kapısı** — `simulation_counts_as_live = true`
   iken gönderim **engellenir**.
4. **İnceleme notu tazeliği** — `APP_REVIEW_NOTLARI.md`, `shared/phone.ts`'ten
   daha eskiyse denetim **uyarır**. (Bulgu 3 tam olarak böyle oluştu.)

---

## 8 · TAKVİM

| Gün | İş |
|---|---|
| **1** | FAZ 1 tamamı (kapı söküldü, depo↔canlı hizalandı, not yeniden yazıldı) + kilitler |
| **1** | KARAR 1 ve KARAR 2 verilir *(kurucu)* |
| **2–4** | FAZ 2 — gerçek sağlayıcı kaydı **veya** pazaryeri kapatma; iyzico canlı **veya** `CASH_ONLY` |
| **5** | FAZ 3 hijyen + FAZ 4 uçtan uca yürüyüş (gerçek cihaz, yurt dışı Apple ID) |
| **5** | Gönderim — build 3 |

> **En kısa yol:** KARAR 1 = B, KARAR 2 = B → **2 gün**.
> **En doğru yol:** KARAR 1 = A, KARAR 2 = A → **5 gün**, uygulama tam
> özellikli ve dürüst çıkar. Reddin tekrarlama riski en düşük olan da budur.
