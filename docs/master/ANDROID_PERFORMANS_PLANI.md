# 📱 Android Performans — Ölçüm, Kök Nedenler ve Yol Haritası

> **Sorun (kullanıcı bildirimi):** APK bazı Android telefonlarda yavaş açılıyor,
> arayüz tutuk/yavaş çalışıyor, uygulama kendini kapatıyor.
>
> **Bu belgenin amacı:** tahmin değil ÖLÇÜM kaydetmek. Aşağıdaki her sayı, bu
> repoda `npx vite build` çıktısı üzerinden ölçülmüştür; tekrar üretilebilir.
>
> **Son güncelleme:** 2026-08-02

---

## 1. Neden yavaş? — Üç ayrı sorun, üç ayrı sebep

Kullanıcının gördüğü üç şikâyetin teknik karşılığı birbirinden farklıdır. Aynı
ilaç üçüne birden çare olmaz; bu yüzden ayrı ayrı ele alınır.

| Şikâyet | Teknik sebep | Nerede çözülür |
|---|---|---|
| "Yavaş açılıyor" | İlk ekran boyanmadan önce işlenmesi gereken kod+stil miktarı | Paket ayrımı (`vite.config.ts`) |
| "Tutuk, takılıyor" | Her karede yeniden çizilen pahalı cam/bulanıklık efektleri | Cihaz gücü sınıfı (`utils/perfTier.ts` + `index.css`) |
| "Kendini kapatıyor" | Android'in belleği azalınca WebView'ı öldürmesi | Native çökme koruması (`MainActivity.java`) |

---

## 2. Açılış yavaşlığı — ölçüm

Telefon, ilk ekranı boyamadan **önce** `dist/index.html` içinde listelenen her
dosyayı okumak ve derlemek zorundadır. Ölçülen hâli:

**ÖNCE — 1.509.841 bayt (403 KB sıkıştırılmış)**

| Dosya | Ham boyut | İçindekiler |
|---|---:|---|
| `ui-vendor` | 574 KB | framer-motion + lucide-react + **recharts** + React |
| CSS (tek dosya) | 302 KB | Tailwind çıktısı — çizimi bloke eder |
| ortak uygulama kodu | 252 KB | store, types, servisler |
| `supabase-vendor` | 212 KB | |
| `main` | 161 KB | |
| `react-vendor` | **1 bayt** | ← boş; ayrım hiç çalışmamış |

İki sessiz hata vardı:

1. **`react-vendor` boştu.** `manualChunks` liste biçimindeydi ve kural
   eşleşmiyordu; React `ui-vendor` içine karışmıştı. Amaçlanan ayrım hiç
   gerçekleşmiyordu.
2. **`recharts` telefona iniyordu.** Grafik çizim kütüphanesi yalnızca admin
   panelinde tek bir sayfada kullanılıyor
   (`admin-panel/views/pages/DashboardPage.tsx`). Buna rağmen telefondaki
   `index.html` onu açılışta yüklüyordu — her kullanıcı hiç görmeyeceği
   grafikler için 338 KB kod indirip derliyordu.

**SONRA — 1.172.814 bayt (301 KB sıkıştırılmış)**
→ **337 KB ham / 101 KB sıkıştırılmış azalma (%22 / %25).**

> Bu, giriş seviyesi bir telefonda saniye mertebesinde bir kazançtır: bu
> cihazlarda darboğaz indirme değil, kodun **derlenmesi**dir (CPU işi).

---

## 3. Tutukluk — kök neden: `backdrop-filter`

Uygulamada **191 yerde** `backdrop-blur` (arkasını bulanıklaştıran cam efekti)
kullanılıyor. Bu, mobil GPU'daki en pahalı efekttir: efekti taşıyan her kutu
için tarayıcı ayrı bir çizim katmanı açar, arkasındaki görüntüyü kopyalar ve
bulandırır — **her karede yeniden**. Bir liste kaydırılırken ekrandaki tüm
kartlar bunu aynı anda tetikler.

Güçlü telefon bunu yutar; giriş seviyesi telefon yutamaz.

**Çözüm:** projede zaten var olan ve test edilmiş cihaz sınıflandırması
(`views/studio/perf.ts` — o güne dek yalnız Stüdyo'da kullanılıyordu) uygulama
geneline taşındı. Zayıf cihazda `<html>` etiketine `oyna-lite` sınıfı eklenir,
`index.css` içindeki **tek** kural bulanıklığı kapatır. 191 bileşene tek tek
dokunmak gerekmez, kural tek yerden geri alınabilir.

### ⚠️ Buradaki tuzak — tekrar düşmemek için

İlk yazılan kural şuydu ve **sessizce çalışmıyordu**:

```css
html.oyna-lite [class*="backdrop-blur"] {
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}
```

CSS küçültücü (lightningcss) bu iki satırı aynı özellik sayıp **standart olanı
atıyor**; derlenmiş çıktıda yalnız `-webkit-` öneki kalıyor. Android WebView ise
öneksiz olanı okur — yani kural tam da hedeflediği telefonlarda hiçbir işe
yaramazdı. Derlenmiş CSS'e bakılmasa fark edilmezdi.

**Çalışan hâli**, Tailwind'in kendi değişkenini boşaltmaktır:

```css
--tw-backdrop-blur: initial;
```

Gerçek Chromium'da doğrulandı (Android WebView ile aynı motor):
`oyna-lite` kapalıyken `blur(24px)`, açıkken `none`.

> **Kural:** bu tür "efekti kapat" düzeltmelerinde derlenmiş `dist/assets/*.css`
> çıktısına bakmadan "oldu" denmez.

### Ne değişir, ne değişmez

- **Değişir:** yalnız bulanıklık ve neon ışıma — ve yalnız zayıf cihazlarda.
- **Değişmez:** içerik, yerleşim, renk, saydamlık, hangi bilgi/buton görünüyorsa
  aynen görünür. Cam yüzeylerin neredeyse tamamı zaten koyu ve %60–95 opak
  (`bg-black/70`, `bg-black/85` gibi), bu yüzden okunabilirlik korunur.
- **Değişmez:** animasyonlar. O karar `hooks/useLowMotion.ts` içinde ayrıca
  verilmiştir ve bilinçli olarak yalnız kullanıcının sistem tercihine bağlıdır.
- **Güçlü telefonlar hiçbir şey kaybetmez** — sınıf onlara eklenmez.

**Elle deneme:** `localStorage['oyna.perfTier'] = 'lite'` yazıp uygulamayı
yeniden açmak, güçlü bir telefonda zayıf cihaz modunu simüle eder.

---

## 4. Kendini kapatma — kök neden: WebView render süreci

OYNA'nın arayüzü Android'in WebView'i içinde çalışır. WebView, arayüzü
uygulamanın **kendi** sürecinde değil, ayrı bir "render" sürecinde çizer.
Telefonun belleği daralınca (2–3 GB RAM'li cihazlarda çok sık) Android bu render
sürecini öldürür.

Android'in **varsayılan** davranışı: render süreci ölünce uygulamanın süreci de
anında öldürülür. Kullanıcının gördüğü şey, uygulamanın hiçbir hata mesajı
vermeden bir anda kapanmasıdır. "Uygulama kendini kapattı" şikâyetinin teknik
karşılığı tam olarak budur.

`MainActivity.java` içindeki `onRenderProcessGone` geçersiz kılması bu zinciri
kırar: ölü WebView temizlenir ve uygulama temiz şekilde yeniden başlatılır.
`true` döndürmek Android'e "bu durumu ben ele aldım, sürecimi öldürme" der.

> Bu, çökmenin **sonucunu** düzeltir (sessiz kapanma → yeniden açılma).
> Çökmenin **sıklığını** düşürmek bellek tüketimini azaltmakla olur — 2. ve 3.
> bölümdeki düzeltmeler ve aşağıdaki 5. bölüm doğrudan buna hizmet eder.
>
> Not: `onRenderProcessGone` Android 8.0 (API 26) ile geldi. Uygulamanın tabanı
> API 24 olduğu için sürüm kontrolü vardır; API 24–25'te davranış eskisi gibidir.

---

## 5. İkinci tur — kullanıcı kararlarıyla yapılanlar

Aşağıdaki üç madde bir önceki turda "yapılmadı" diye kaydedilmişti. Kullanıcı
her biri için ayrı ayrı karar verdi ve maddeler o kararlara göre uygulandı.

### 5.1 İki ayrı harita kütüphanesi → TEK kütüphane (Leaflet) ✅ YAPILDI

Uygulama aynı anda iki harita yığını paketliyordu:

| Kütüphane | Boyut | Kullanan ekranlar |
|---|---:|---|
| `maplibre-gl` (+ `react-map-gl`) | 803 KB | yalnız `PitchDiscovery` |
| `leaflet` (+ `react-leaflet`) | ~150 KB + 16 KB CSS | `MatchJoin`, `ServiceProfile`, `OwnerFacilitySettingsModal`, admin `PitchStudio` |

**Kullanıcı kararı:** Leaflet'te birleş (5 ekranda zaten o var, 1 ekranda
maplibre). Saha Keşfi haritasının görünümünün bir miktar değişmesi kabul edildi.

`views/PitchDiscovery.tsx` react-leaflet'e taşındı. Pin biçimleri, seçim
davranışı, zoom'a bağlı ölçekleme ve iki-parmak jesti korundu; pinler
Leaflet'in 0×0 anchor deseniyle koordinata çivilendi (`components/map/mapBase.ts`).

**Ölçüldü — Saha Keşfi ekranını açmanın maliyeti:**

| | önce | sonra | kazanç |
|---|---:|---:|---:|
| ekranın indirdiği kod+stil | 1.108.968 B | 238.332 B | **−870.636 B (%78,5)** |
| uygulamanın toplam boyutu | 5.115.368 B | 4.224.465 B | **−890.903 B (%17,4)** |

Açılış yükü değişmedi (1.172.841 → 1.172.776 B): keşif ekranı zaten talep
üzerine yüklendiği için maplibre açılışta değil, o ekran açılırken iniyordu.

**Ek kazanç — çökme ve kapsama:** MapLibre çizim için WebGL zorunlu kılıyordu;
kart WebGL veremediğinde ekran "harita bu cihazda desteklenmiyor" diyor ve
harita hiç açılmıyordu. Leaflet raster karo çizer, WebGL istemez → o nazik
teslim ekranı KALDIRILDI, harita artık en zayıf telefonda da açılır. Belleği
dar cihazlarda WebGL bağlamının düşürülmesi kaynaklı çökme riski de ortadan
kalkar.

**Doğrulama:** `tests/visual/haritaDuman.visual.spec.ts` — harita gerçek
Chromium'da kurulur, karo katmanı bağlanır, yasal atıf görünür, pinler saha
adıyla basılır, pin kökü 0×0 kalır (koordinata çivili), pine dokununca seçim
ve alt karusel açılır, konsol temiz.

### 5.2 CSS'i telefon ve admin için ayırmak ✅ YAPILDI — ölçüldü: 38 KB

`index.css` içindeki `@source "./admin-panel/**"` satırları, admin panelinde
kullanılan tüm sınıfların telefonun CSS'ine girmesine yol açıyordu.

**Kullanıcı kararı:** yapılsın, ama dikkatli olunsun.

Admin'e kendi giriş dosyası verildi (`admin-panel/admin.css`): telefonun
`index.css`ini import eder, ÜSTÜNE yalnız `admin-panel/` klasörünü tarar.
Panel telefonun tüm stillerini almaya devam eder; telefon panelinkileri
taşımaz.

**Ölçüldü:** telefonun stil dosyası **302.646 B → 264.508 B (−38.138 B, %12,6)**.

**Doğrulama:** admin kaynağındaki 762 benzersiz sınıfın **762'si de** admin
CSS'inde üretiliyor (eksik yok); bunların 233'ü telefondan çıkarıldı, 529'u
ortak. Panel gerçek tarayıcıda açılıp kendi CSS'ini yüklediği, gövde rengi,
yazı tipi ve yalnız-admin sınıfları (`max-w-4xl`, `bg-amber-950/60`)
çalıştığı doğrulandı.

### 5.3 Kullanılmayan bağımlılıklar ✅ YAPILDI

`pdfkit` kodda **hiç** kullanılmıyordu (yalnız `package.json`'da duruyordu).
`maplibre-gl` ve `react-map-gl` ile birlikte kaldırıldı — üçü ve bağımlılıkları
toplam **77 paket**.

### 5.4 Android `minifyEnabled` (R8) kapalı — KULLANICI KARARIYLA KAPALI KALDI

`android/app/build.gradle` içinde `release { minifyEnabled false }`. Açmak APK
boyutunu ve DEX yükleme süresini düşürür.

**Neden yapılmadı:** R8, yansıma (reflection) ile çağrılan Capacitor eklenti
sınıflarını eleyebilir ve bu **yalnız gerçek cihazda, çalışma anında** belli
olur — derleme yeşil kalır, özellik sessizce ölür (bildirim gitmez, ödeme
açılmaz gibi). Kullanıcıya risk anlatıldı; **kullanıcı kararı: şimdilik kapalı
kalsın.** İleride açılırsa gerçek telefonda giriş, harita, kamera/QR, bildirim
ve ödeme akışları tek tek denenmelidir.

### 5.5 Yazı tipleri

`public/fonts/` içinde ~800 KB woff2 var (Inter, Montserrat, Lora, Space
Grotesk — normal + italik). Hepsi APK'nın içinde. `unicode-range` sayesinde
tarayıcı yalnız gerekeni okur, ama dosyalar yine de pakette taşınır. Gerçekten
kullanılan aileler/eksenler gözden geçirilebilir.

### 5.6 Zayıf cihaz eşiği — "4-6 GB telefonlar da kapsansın"

Kullanıcı sorunu 4-6 GB RAM'li telefonlarda yaşadığını bildirdi; eşiğin bunları
kapsayıp kapsamadığı soruldu.

**Bulgu:** `navigator.deviceMemory` gerçek RAM'i vermez. Standart, parmak izi
çıkarmayı zorlaştırmak için değeri ikinin kuvvetlerine yuvarlar ve 8'de keser —
izin verilen TEK değerler: `0.25 · 0.5 · 1 · 2 · 4 · 8`. Yani 5, 6 ya da 7
**asla** dönmez. 6 GB'lık bir Android'in çekirdek payı düşülmüş gerçek belleği
~5,5–5,9 GB'dır ve 4 ile 8 arasındaki orta nokta 6 GB olduğundan tarayıcı bunu
**4** diye bildirir.

**Sonuç:** var olan `memory <= 4` eşiği 4 GB ve 6 GB telefonların İKİSİNİ de
zaten kapsıyordu. Eşik `LITE_MEMORY_MAX_GB = 6` olarak yeniden yazıldı —
davranış DEĞİŞMEDİ, kullanıcının kararı kayda geçti ki ileride biri 4'ü görüp
"6 GB'lıklar dışarıda kalmış" diye yanlış bir düzeltme yapmasın. Birim testi
izin verilen altı değerin tamamını sabitliyor (`tests/unit/studioPerf.test.ts`).

### 5.7 "Yazılar sıkışık duruyor" — telefonun yazı boyutu ayarı

Kullanıcı bazı yazı ve stillerin sıkışık/saçma durduğunu bildirdi.

**Ölçüm önce yapıldı, tahmin sonra:** yedi ana ekran altı gerçek telefon
genişliğinde (320 · 360 · 375 · 390 · 412 · 430) açılıp taranan üç şey —
sayfanın yatayda kayması, ekran dışına çıkan içerik, kutusuna sığmayan yazı —
**hepsinde sıfır bulgu** verdi. Yani sorun ekran GENİŞLİĞİ değil.

**Kalan sebep:** Android WebView'ında kullanıcı telefon ayarlarından yazı
boyutunu büyüttüğünde tarayıcı "metin otomatik büyütme" uygular. Bu özellik
YALNIZ yazı puntosunu büyütür; yazının içinde durduğu kutuyu, dolguyu, satır
yüksekliğini ve buton boyunu büyütmez → yazılar kutularına sığmaz, satırlar
biner, kartlar sıkışık görünür. Bu tam olarak tarif edilen belirtidir.

`index.css` → `html { text-size-adjust: 100% }` ile bu otomatik büyütme
kapatıldı. Özelliğin devrede OLMADIĞI cihazlarda kural hiçbir şeyi değiştirmez.

**Erişilebilirlik:** Android'in "Görüntü boyutu" (display size) ayarı aynen
çalışmaya devam eder — o ayar CSS pikselinin kendisini büyütür, yazı ve kutu
birlikte orantılı büyür, yerleşim bozulmaz. Az gören kullanıcının doğru yolu
budur.

**Bekçi test:** `tests/visual/ekranUyum.visual.spec.ts` — yedi ekran, en dar
(360) ve en geniş (430) telefon genişliğinde taşma/kırpılma olmadığını sabitler.
Görsel referans testlerinden farkı: onlar "görüntü değişti mi" der, bu test
"bozuk mu" der. Tasarım bilerek değişince referans güncellenir, bu test yeşil
kalmalıdır.

---

## 6. Gerçek telefonda nasıl ölçülür?

Bu belgedeki sayılar derleme çıktısındandır. **Kesin sonuç** gerçek cihazda
ölçülür:

1. **Açılış süresi** — uygulamayı kapat, tekrar aç, ilk ekranın göründüğü ana
   kadar geçen süreyi kronometreyle ölç. Aynı telefonda eski ve yeni APK ile
   ayrı ayrı, üçer kez.
2. **Kaydırma akıcılığı** — maç listesini hızlıca kaydır. Takılma hissi
   düzeldiyse `backdrop-filter` düzeltmesi tutmuş demektir.
3. **Çökme** — uygulamayı açık bırakıp arka planda birkaç ağır uygulama aç, sonra
   OYNA'ya dön. Eskiden sessizce kapanırdı; artık yeniden açılmalı.

> **En değerli test cihazı, şikâyetin geldiği telefonun kendisidir.** Mümkünse
> ölçüm o cihazda yapılmalı.

---

## 7. Bu turda dokunulan dosyalar

| Dosya | Ne yapıldı |
|---|---|
| `vite.config.ts` | Paket ayrımı düzeltildi; recharts telefondan çıkarıldı |
| `utils/perfTier.ts` | **yeni** — cihaz gücü sınıfını uygulama geneline kurar |
| `index.tsx` | Açılışta `installPerfTier()` çağrısı (React boyamadan önce) |
| `index.css` | `html.oyna-lite` bloğu — zayıf cihazda cam/ışıma efektleri kapalı |
| `android/.../MainActivity.java` | WebView render süreci ölünce sessiz kapanma yerine yeniden başlatma |
| `tests/unit/perfTier.test.ts` | **yeni** — 10 test |

**Doğrulama:** `npm run lint` temiz · `npm run test:unit` 103 dosya / 1436 test
yeşil · `oyna-lite` kuralı gerçek Chromium'da doğrulandı.

**Doğrulanamayan:** `MainActivity.java` bu ortamda derlenemedi (Android SDK yok).
Java değişikliği yalnız Capacitor'ın resmî `Bridge.setWebViewClient` API'sini ve
standart Android sınıflarını kullanır; derlenmesi
`.github/workflows/android-release.yml` iş akışında gerçekleşir.

---

## 8. Üçüncü tur — "uygulama hâlâ kendi kendine kapanıyor"

İlk turdaki `onRenderProcessGone` koruması APK'ya girdi ve **sorun devam etti.**
Buradan çıkan ders, çözümün kendisinden daha önemli: *kapanmanın tek bir sebebi
yok ve dışarıdan hepsi aynı görünüyor.* İkinci kez tahmin yürütmek yerine
sebebin ÖLÇÜLMESİ gerekiyordu.

### 8.1 Sebebi tahmin etme — telefona sor

Android 11'den beri sistem, uygulamanın önceki kapanışlarının sebebini kendisi
tutuyor (`ActivityManager.getHistoricalProcessExitReasons`). Olası sebepler ve
ilaçları birbirinden tamamen farklı:

| Sistem sebebi | Anlamı | Doğru ilaç |
|---|---|---|
| `REASON_LOW_MEMORY` | Telefonun belleği doldu | Bellek tüketimini düşür |
| `REASON_SIGNALED` | Sistem/üretici yazılımı zorla kapattı | Pil koruma ayarı, bellek |
| `REASON_CRASH` | Java tarafında hata | Yığın izini oku, hatayı düzelt |
| `REASON_CRASH_NATIVE` | WebView/sistem kütüphanesinde derin çökme | WebView sürümü, GPU |
| `REASON_ANR` | Uygulama dondu, sistem kapattı | Ana iş parçacığını boşalt |
| `REASON_FREEZER` | Arka planda dondurulmuşken sonlandırıldı | Genelde normaldir |

`MainActivity.java` açılışta bu kaydı okur, sade Türkçeye çevirir ve
`@capacitor/preferences` eklentisinin kullandığı `SharedPreferences` dosyasına
(`CapacitorStorage`) yazar. Böylece **ayrı bir Capacitor eklentisi yazmadan** JS
tarafı bilgiyi `Preferences.get()` ile okuyabilir.

Kullanıcı **Ayarlar → Destek** altında "Son kapanma sebebi" kartını görür:
sebep, zaman, o andaki bellek kullanımı ve *kapanma anında uygulamayı kullanıp
kullanmadığı*. Son ayrım kritik — ön planda kapanma gerçek bir arızadır; arka
planda kapanma Android'in normal bellek geri alımı olabilir (kullanıcı geri
döndüğünde uygulama baştan açılır ve bu da "kendi kendine kapandı" hissettirir
ama sebebi bambaşkadır).

Kart yalnız Android'de ve kayıt varsa çizilir; bilgi telefonda kalır, hiçbir
yere gönderilmez.

### 8.2 Ölçülen somut bellek kaçağı: harita karoları

Sebebi beklerken bulunan ve tek başına ciddi olan bir tüketim:

Harita karoları ekranda birer `<img>`'dir ve tarayıcı bunları **açılmış** hâlde
tutar; maliyet dosya boyutu değil `en × boy × 4 bayt`tır:

* normal karo 256×256 → **0,26 MB**
* retina karo 512×512 → **1,05 MB** (dört katı)

Leaflet ayrıca görünen alanın `keepBuffer` kadar dışındaki karoları da atmadan
saklıyordu. Projedeki ayar `keepBuffer: 8` + retina karolardı:

```
en kötü hâl: (3+16) × (4+16) = 380 karo × 1,05 MB ≈ 400 MB
```

4 GB'lık bir telefon için ölümcül — ve Android bellek daralınca en çok yer
tutan uygulamayı öldürür. Karşılaştırma için: saha fotoğrafları zaten
`utils/imageTransform.ts` ile 320/640/1280 piksele küçültülüyor ve `lazy`
yükleniyor; yani görseller disiplinliydi, **karolar disiplinsizdi.**

Karar cihaza göre ayrıldı (herkese aynı ceza kesilmedi):

| | Güçlü telefon | Zayıf telefon |
|---|---|---|
| karo çözünürlüğü | retina (keskin) | normal |
| `keepBuffer` | 8 (akıcı) | 1 |
| gezinirken karo isteme | anında | gezinme bitince |
| en kötü hâl bellek | ~400 MB | **~8 MB** |

### 8.3 Bellek baskısında önce yedeklenebileni bırak

Android bellek daralınca uygulamalara "elindekini bırak" diye haber verir
(`onTrimMemory`) ve **bırakmayanı öldürür.** OYNA bu çağrıya hiç cevap
vermiyordu. Artık ciddi baskı seviyelerinde WebView'ın bellekteki görüntü
önbelleği boşaltılır — içerik kaybolmaz, yalnızca yeniden indirilir.

### 8.4 Test yazarken düşülen tuzak (kayda değer)

Karo koruması için önce bir tarayıcı testi yazıldı ve **yeşil geçti — ama
korumayı kapatınca da yeşil geçti.** Yani test hiçbir şey kanıtlamıyordu.
İki sebebi vardı:

1. Görsel test ortamı `deviceScaleFactor: 1` ile çalışıyor; o durumda Leaflet
   retina karo zaten hiç istemez.
2. Pencere boyutunu değiştirmek haritayı gezdirmediği için saklanan karo sayısı
   hiç büyümüyordu.

Test birim testine taşındı (`tests/unit/haritaKaroBellek.test.ts`): cihaz
sinyalleri doğrudan verilir, modül yeniden yüklenir, sonuç ölçülür. **Negatif
kontrol yapıldı** — koruma kapatıldığında 6 testin 3'ü kırmızıya döndü.

> **KURAL:** Bir koruma için yazılan test, koruma kapatıldığında KIRILDIĞI
> görülmeden "geçti" sayılmaz. Yeşil test, çalışan test demek değildir.

### 8.5 Sırada ne var

Kapanma kaydı okunduğunda sebep kesinleşecek ve düzeltme ona göre yapılacak.
Sebebe göre yol haritası:

* **LOW_MEMORY / SIGNALED** → bellek işi doğru yolda; sonraki adımlar: aynı anda
  bellekte duran ekran sayısını sınırlamak, uzun listelerde pencereleme.
* **CRASH_NATIVE** → cihazın WebView sürümü ve GPU sürücüsü; yazılım tarafında
  donanım hızlandırmayı sınırlamak gündeme gelir.
* **ANR** → ana iş parçacığını bloklayan iş aranır.
* **CRASH** → yığın izi doğrudan satırı gösterir.
