# 01 · Tasarım Sistemi

> Sayısal değerlerin **tek doğru kaynağı** `stil/theme.css` dosyasıdır. Bu belge
> o değerlerin ne anlama geldiğini ve nerede kullanılacağını anlatır. Bir ölçü
> burada yoksa, tasarımda da yoktur — önce token olarak eklenir.

---

## 0 · Çerçeve

| | |
|---|---|
| **Tema** | Yalnız koyu. Açık tema yok, tema değiştirici yok. |
| **Hedef** | Telefon önce. İçerik genişliği ~402px, tek sütun, dikey kaydırma. |
| **Teknoloji** | React 19 + Tailwind CSS v4 (`@theme` token'ları) + framer-motion + lucide ikonları |
| **Dil** | Türkçe. Ekranlarda İngilizce kelime kullanılmaz. |
| **Kabuk** | Uygulama telefonda Capacitor ile çalışır: çentik/ana ekran çubuğu payı (güvenli alan) her ekranda hesaba katılır. |

---

## 1 · Renk — ton değil **rol**

Renk seçimi "hangi yeşil daha güzel" sorusu değildir. Her rengin bir işi vardır
ve o işin dışında kullanılmaz.

### 1.1 · Birincil eylem

| Token | Değer | Kural |
|---|---|---|
| `--color-primary` | `#39FF14` | Ekranda **en fazla bir** dolu blok |
| `--color-on-primary` | `#0A0E14` | Yeşil zeminde daima bu renk (kontrast 14.26:1) |

**Neon yeşil YALNIZCA:** (1) ekranın tek birincil eylem dolgusu, (2) gezinti ve
seçim aktif durumu, (3) onaylanmış durumun ikonu + metni, (4) kullanıcıya
**dönen** para (iade, bakiye, kazanç), (5) marka logosu.

**Neon yeşil ASLA:** takım kimliği, dekoratif parıltı/blur, etkileşimsiz kart
kenarı, ikinci veya üçüncü buton, üzerine beyaz metin.

### 1.2 · Yüzey ölçeği — yükseldikçe açılır

| Token | Değer | Nerede |
|---|---|---|
| `--color-bg` | `#0A0E14` | Uygulama zemini |
| `--color-surface-1` | `#161B22` | Kart |
| `--color-surface-2` | `#1C2230` | Alt sayfa (sheet), diyalog, yükseltilmiş panel |
| `--color-line` | `rgba(255,255,255,.08)` | Normal çizgi |
| `--color-line-strong` | `rgba(255,255,255,.16)` | Vurgulu çizgi |

Çizgi ölçeğinin **iki** basamağı vardır; üçüncüsü icat edilmez.

### 1.3 · Mürekkep merdiveni (metin renkleri)

Dört basamağın tamamı en zor zeminde (`#161B22` kart) WCAG AA eşiğini geçer.

| Token | Değer | Kontrast | Kullanım |
|---|---|---|---|
| `--color-ink` | `#FFFFFF` | 17.30:1 | Başlık, birincil metin, rakam |
| `--color-ink-2` | `#C9D1D9` | 11.21:1 | İkincil metin, açıklama |
| `--color-ink-3` | `#A9B4C0` | 8.22:1 | Üçüncül, yardım metni, birim etiketi |
| `--color-ink-4` | `#8B949E` | 5.62:1 | **En soluk izinli** — altına inilmez |

Daha soluk bir ton eklenmez. `text-gray-500` (4.00:1), `text-white/40` (3.79:1)
gibi tonlar tam da bu yüzden sistemden çıkarıldı.

### 1.4 · Durum dili

| Anlam | Renk | Zemin | Kural |
|---|---|---|---|
| Onaylandı / tamamlandı | `--color-success` `#39FF14` | `--color-success-bg` | Birincille **aynı ton**; ayrım renkte değil biçimdedir: birincil = dolu blok, başarı = ikon + metin |
| Bekliyor / senin sıran | `--color-warning` `#FACC15` | `--color-warning-bg` | **Asla buton dolgusu değil** (yeşille kontrastı 1.13:1 — yan yana ayırt edilemez) |
| Hata | `--color-error` `#F87171` | `--color-error-bg` | Metin rengi |
| Yıkıcı buton dolgusu | `--color-error-fill` `#DC2626` | — | Yalnız dolgu; **metin olarak kullanılmaz** |
| Bilgi | `--color-info` `#60A5FA` | `--color-info-bg` | Metin rengi (`--color-info-fill` dolgu içindir) |

> **Her durum göstergesi üç şeyi birden taşır: renk + ikon + Türkçe kelime.**
> Renk tek başına anlam taşımaz — renk körlüğü ve düşük parlaklık bunu gerektirir.

`#FFFF00` ve `#FFC107` kullanılmaz (yeşille kontrastları 1.26:1 ve 1.20:1).

### 1.5 · Kategori aksanları (yalnız ana sayfa)

Ana sayfadaki kartların kimlik renkleri. Kullanıcı ekranı okumadan "hangi kutu
neydi" hatırlasın diye vardır — **anlam taşımazlar**, yalnız kimliktir.

| Token | Değer | Kart |
|---|---|---|
| `--color-cat-play` | `#FACC15` | Top Oyna |
| `--color-cat-pitch` | `#10B981` | Saha Kirala |
| `--color-cat-create` | `#FF7A00` | Maç Kur |
| `--color-cat-keeper` | `#39FF14` | Kaleci |
| `--color-cat-ref` | `#60A5FA` | Hakem |
| `--color-cat-studio` | `#FF0000` | Taktik Stüdyo |

Kullanım alanı üç yerle sınırlıdır: kartın üst ışık çizgisi (2px), ikon
halkasının kenarı + ikonun kendisi, bölüm etiketi. Buton dolgusu, gövde metni
rengi ya da başka ekranların durum göstergesi olamazlar.

### 1.6 · Para

| Token | Değer | Anlam |
|---|---|---|
| `--color-money-balance` | `#00FFA5` | Cüzdan **bakiyesi** |

Birincil yeşilden ayrı bir tondur: `#39FF14` "para döndü" **olayını** anlatır,
bakiye ise sürekli ekranda duran bir **durumdur**. Aynı tonda olsalardı her
bakış "para geldi" gibi okunurdu.

---

## 2 · Tipografi

### 2.1 · Yazı tipleri

| Token | Yazı tipi | Nerede |
|---|---|---|
| `--font-sans` | **Inter** (100–900, gerçek italik) | Varsayılan — ana sayfa dışındaki her ekran |
| `--font-display` | **Montserrat** | Onaylı ana sayfa tasarımının başlıkları |
| `--font-body` | **Lora** (400–700) | Ana sayfa gövde/etiket + Profil ekranı |
| `--font-accent` | **Open Sans** | Ana sayfada **tek** yer: Taktik Stüdyo şeridi |
| `.font-numeric` sınıfı | **Space Grotesk** + `tabular-nums` | Tutar, kart numarası, IBAN, sayaç |

Kurallar:

- Yazı tipleri **kendi sunucumuzdan** gelir (`public/fonts`), CDN yoktur.
  Çevrimdışıyken arayüz sistem fontuna düşmez.
- `font-synthesis: none` açıktır: üreticinin çizmediği bir ağırlık/italik
  **sahte** üretilmez — yanlışlık görünür olur.
- Space Grotesk'in italik yüzü **yoktur**; italikle birlikte kullanılmaz.
- Türkçe kapsama zorunlu: `ı` latin altkümesinde, `İ ğ Ğ ş Ş ₺` latin-ext'te.
  İkisi birden yüklenir.

### 2.2 · Punto ölçeği (18 basamak)

Kaynak: `temel/type.ts`. Değerler `rem` tabanlıdır — kullanıcı telefonunun yazı
boyutunu büyüttüğünde arayüz de büyür (WCAG 1.4.4).

| Basamak | px | Nerede |
|---|---|---|
| `microLabel` | 10 | **Yalnız** büyük harf + harf aralığı: rozet, birim etiketi, bölüm üst başlığı |
| `caption` | 11 | Okunur metnin **alt sınırı** — yardım satırı |
| `captionLg` | 11.5 | Ana sayfa: geri sayım |
| `footnote` | 12 | Dipnot, meta bilgi, liste alt satırı |
| `footnoteLg` | 12.5 | Ana sayfa: maç kartı alt satırı |
| `body` | 13 | Yoğun listelerde gövde |
| `bodyLg` | 14 | **Birincil gövde metni** |
| `bodyXl` | 15 | Ana sayfa: profil yaşı, maç saati |
| `title` | 16 | Kart başlığı, satır başlığı |
| `titleLg` | 18 | Bölüm başlığı |
| `titleXl` | 21 | Ana sayfa: kullanıcı adı |
| `headline` | 22 | Ekran başlığı |
| `headlineLg` | 25 | Ana sayfa: "SAHA KİRALA" |
| `amount` | 26 | Ana sayfa: cüzdan bakiyesi |
| `headlineXl` | 27 | Ana sayfa: "TOP OYNA" |
| `display` | 28 | Vurgulu tutar/rakam, boş durum başlığı |
| `amountLg` | 34 | Ana sayfa: büyük bakiye |
| `displayLg` | 40 | Geri sayım rakamı, skor |

Kurallar:

- Ekranda **serbest punto yoktur**. Tabloda yoksa tabloya eklenir.
- Punto büyüdükçe satır aralığı oransal olarak **küçülür**; büyük puntolarda
  harf aralığı negatif, büyük harf etiketlerde pozitiftir.
- 10px yalnız büyük harf + `tracking` bağlamında meşrudur, cümle içinde asla.
- Ağırlıklar: başlık 900, etiket 700–800, gövde 600–700.

---

## 3 · Boşluk · köşe · yükseklik

Üçü de 4 pikselin katlarıdır. Aynı ölçü bir ekranın altı ayrı yerinde tekrar
eder; ikinci kez elle yazılan ölçü er geç sapar.

| Boşluk | | Köşe | | Kart yüksekliği | |
|---|---|---|---|---|---|
| `--oy-space-1` | 4px | `--oy-radius-sm` | 14px | `--oy-card-strip` | 64px |
| `--oy-space-2` | 8px | `--oy-radius-md` | 20px | `--oy-card-duo` | 92px |
| `--oy-space-3` | 12px | `--oy-radius-lg` | 24px | `--oy-card-row` | 104px |
| `--oy-space-4` | 16px | `--oy-radius-xl` | 32px | `--oy-card-hero` | 118px |
| `--oy-space-6` | 24px (sayfa kenarı) | `--oy-radius-pill` | 999px | `--oy-card-wide` | 136px |
| `--oy-space-8` | 32px (bölümler arası) | | | `--oy-card-tall` | 176px |

Sabit ölçüler: `--oy-header-h` 83px · `--oy-avatar` 56px · `--oy-tap-min` **48px**
(en küçük dokunma hedefi) · `--oy-matchcard-w` 190px · `--oy-matchphoto-h` 86px.

---

## 4 · Yerleşim kabuğu

- **Güvenli alan:** `--safe-top/bottom/left/right` = `env(safe-area-inset-*)`.
  Başlıklar `pt-safe`, alt çubuklar `pb-safe` türevleriyle çizilir. Çentikli
  cihazda başlık çentiğin altına girmez.
- **"Tam ekran" = kap, viewport değil.** `100vh` kullanılmaz; ekranlar `100%`
  ile kendi kaplarına oturur. Sebep: her ekran, alt menü ve güvenli alan payı
  düşülmüş bir kaydırıcının içinde yaşar — `100vh` ile altta ölü bir bant kalır.
- **Kaydırma:** kaydırması istenen kutu `flex-1 min-h-0 overflow-y-auto`
  olmalıdır; `min-h-0` unutulursa kaydırma hiç devreye girmez (bu hata üç kez
  yaşandı, artık `index.css` içinde ağ var).
- **Alt gezinti** beş sekmedir ve ortadaki (Maçlarım) büyük tuştur. Ana sayfada
  alt çubuk **çizilmez**.
- **Çevrimdışı şeridi** açıldığında üstteki her şey aşağı kayar; şerit içeriği
  örtmez.

---

## 5 · Hareket ve dokunma

| Konu | Kural |
|---|---|
| Basma (kart) | 90ms'de %96,5'e iner, bırakılınca 420ms'de yerine oturur (`[data-tap]`) |
| Basma (buton) | `filter: brightness(0.78)` — hareket değil parlaklık; azaltılmış hareket ayarında da çalışır |
| Odak çerçevesi | Kartlarda **yok** (bilinçli); erişilebilirlik `role="button"` + `aria-label` ile sağlanır |
| Titreşim | Sıradan dokunuşta **yok**; yalnız sonuç (başarı/hata) ve seçim anlarında |
| Azaltılmış hareket | `prefers-reduced-motion` altında ölçek animasyonları ve ambient ışımalar tamamen kapanır |
| Giriş animasyonları | Modal/sheet/toast için `tw-animate-css` sınıfları (fade/zoom/slide) |
| Yumuşama eğrisi | `cubic-bezier(0.16, 1, 0.3, 1)` — sistemin standart eğrisi |

---

## 6 · Sık kullanılan görsel imzalar

- **CTA parıltısı:** `0 0 24–30px rgba(57,255,20,.22–.28)`
- **Kart gölgesi:** `0 10–20px 24–50px rgba(0,0,0,.3–.5)`
- **Cam yüzey (GlassModal):** koyu buzlu zemin + ince parlak kenar + üstten
  süzülen ışık; neon yalnız içerideki etkileşim öğelerinde kalır
- **Katman sırası:** alt gezinti `z-50` · sheet `z-[55]` · cam pencere `z-[58]`
  · onay diyaloğu `z-[60]`
- **Rakamlar:** `.font-numeric` — eşit genişlikli rakamlar, alt alta tutarlar
  hizalanır, sayaç değişirken yatay zıplama olmaz
