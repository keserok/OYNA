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

## 5. Sırada ne var — ölçülmüş etkiye göre sıralı

Aşağıdakiler **yapılmadı**; her biri ayrı bir görev olarak verilmelidir.
Sıralama tahmine değil, yukarıdaki ölçümlere dayanır.

### 5.1 İki ayrı harita kütüphanesi taşınıyor — **en büyük tek kazanç**

Uygulama aynı anda iki harita yığını paketliyor:

| Kütüphane | Boyut | Kullanan ekranlar |
|---|---:|---|
| `maplibre-gl` (+ `react-map-gl`) | 803 KB | `PitchDiscovery` |
| `leaflet` (+ `react-leaflet`) | ~150 KB + 16 KB CSS | `MatchJoin`, `ServiceProfile`, `OwnerFacilitySettingsModal`, admin `PitchStudio` |

Tek yığına indirmek ~800 KB'lık kodu ortadan kaldırır. Ayrıca `maplibre-gl`
WebGL kullanır; zayıf telefonlarda hem yavaştır hem de bellek tüketimiyle
çökmeyi doğrudan besler. **Risk:** harita davranışı 5 ekranı ilgilendirir, görsel
regresyon riski gerçektir — ayrı görev, ayrı doğrulama ister.

### 5.2 CSS'i telefon ve admin için ayırmak — ölçüldü: 38 KB

`index.css` içindeki `@source "./admin-panel/**"` satırları, admin panelinde
kullanılan tüm sınıfların telefonun CSS'ine girmesine yol açıyor. Deneme
derlemesiyle ölçüldü: **302 KB → 264 KB**.

**Neden hemen yapılmadı:** `admin-panel/admin.html` aynı `/index.css` dosyasını
kullanıyor. Satırı silmek admin panelinin stillerini bozar. Doğru çözüm, admin'e
kendi CSS girişini vermektir — bu, admin panelini de test etmeyi gerektirir.

### 5.3 Kullanılmayan bağımlılıklar

- `pdfkit` — kodda **hiç** kullanılmıyor (pakete de girmiyor, yalnız
  `package.json` ve kurulum süresi yükü).
- `react-map-gl` / `maplibre-gl` — 5.1 ile birlikte değerlendirilmeli.

### 5.4 Android `minifyEnabled` (R8) kapalı

`android/app/build.gradle` içinde `release { minifyEnabled false }`. Açmak APK
boyutunu ve DEX yükleme süresini düşürür.

**Neden hemen yapılmadı:** R8, yansıma (reflection) ile çağrılan Capacitor
eklenti sınıflarını eleyebilir ve bu **yalnız gerçek cihazda, çalışma anında**
belli olur — derleme yeşil kalır, özellik sessizce ölür. Gerçek telefonda
uçtan uca test edilmeden açılmamalı.

### 5.5 Yazı tipleri

`public/fonts/` içinde ~800 KB woff2 var (Inter, Montserrat, Lora, Space
Grotesk — normal + italik). Hepsi APK'nın içinde. `unicode-range` sayesinde
tarayıcı yalnız gerekeni okur, ama dosyalar yine de pakette taşınır. Gerçekten
kullanılan aileler/eksenler gözden geçirilebilir.

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
