# Handoff: OYNA — Ödeme & Cüzdan

## Genel Bakış
Bu paket, OYNA (halı saha / maç organizasyon uygulaması) için **ödeme akışı** ve **cüzdan** deneyiminin onaylanmış tasarımlarını içerir. İki ana parça vardır:

1. **Tek Ödeme Ekranı (varyasyon 1b)** — üç bağlamda çalışan tek, uyarlanabilir ödeme ekranı: (a) saha vitrininden kapora, (b) maça katılım ödemesi, (c) maç oluştururken saha kaporası. Tam etkileşimli prototip.
2. **Cüzdan** — role göre iki farklı yapı: **Oyuncu cüzdanı** (para yükleme var, kazanç yok) ve **Kaleci & Hakem cüzdanı** (kazanç + IBAN'a çekim var, para yükleme yok). Ayrıca para yükleme (top-up), kart yönetimi ve işlem geçmişi akışları.

## Tasarım Dosyaları Hakkında (ÖNEMLİ)
Bu paketteki dosyalar **HTML ile üretilmiş tasarım referanslarıdır** — nihai görünüm ve davranışı gösteren prototiplerdir, doğrudan kopyalanacak production kodu **değildir**. Görev, bu HTML tasarımları **hedef kod tabanının mevcut ortamında yeniden oluşturmaktır** (React Native, Flutter, SwiftUI, native, vb.) — o ortamın yerleşik bileşen, kütüphane ve desenlerini kullanarak. Uygulamanın mevcut tasarım sistemi/komponent kütüphanesi varsa ona uyarlayın; yoksa proje için en uygun çerçeveyi seçip bu tasarımları orada uygulayın.

> Not: Prototipler bir iPhone çerçevesi (`ios-frame.jsx`) içinde sunulmuştur. Bu çerçeve yalnızca sunum içindir — **uygulamada telefon bezeli yoktur**; ekranın kendisi (status bar altından başlayan içerik) hedeftir.

## Fidelity: Yüksek (hi-fi)
Tüm ekranlar piksel-hassas mockup'lardır: nihai renkler, tipografi, boşluk ve etkileşimler içerir. Geliştirici UI'ı, kod tabanının mevcut kütüphaneleriyle **piksel-hassas** yeniden oluşturmalıdır. Aşağıdaki "Tasarım Tokenları" bölümü tüm değerleri verir.

## App Store / Google Play Uyumluluğu (kritik bağlam)
Bu tasarımın ödeme mimarisi bilinçli olarak store politikalarına uygundur:
- OYNA'da satılan her şey **fiziksel/gerçek dünya hizmetidir** (saha kiralama, kaleci/hakem kiralama, maça katılım payı). Dijital ürün (coin, premium abonelik, kozmetik) **satılmaz**.
- Bu nedenle Apple **IAP (In-App Purchase) muafiyeti** geçerlidir (App Store Review Guideline 3.1.5(a) — fiziksel hizmetler). Ödemeler kredi/banka kartı ile alınır (iyzico), IAP zorunlu değildir.
- **Cüzdana yüklenen bakiye yalnızca fiziksel hizmetlere harcanabilir** — bu, yüklenen bakiyeyi "dijital ürün" konumuna sokmaz ve muafiyeti korur.
- Uygulama yapılırken bu ayrım korunmalıdır: cüzdan bakiyesi ile **dijital içerik satışı yapılmamalıdır**; aksi halde her iki store da IAP zorunlu kılar.

---

## Ekranlar / Görünümler

### 1) Ödeme Ekranı (1b) — `OYNA Ödeme - 1b Prototip.dc.html`
Tek ekran, üç bağlam. Bağlam yalnızca **başlık**, **bağlam rozeti** ve **tutar etiketini** değiştirir; düzen sabittir.

- **Amaç:** Kullanıcı bir maça katılırken / saha kiralarken / maç oluştururken tutarı OYNA bakiyesi + kart ile öder.
- **Düzen (yukarıdan aşağıya):**
  1. **Header** — geri oku (44px daire), başlık + alt başlık. Başlık bağlama göre: `ÖDEME` (katılım) / `KAPORA ÖDEMESİ` (saha & maç oluşturma).
  2. **Bağlam özet kartı** — 20px radius, ikon + rozet (`MAÇA KATILIM · 2 slot` / `SAHA KİRALAMA` / `MAÇ OLUŞTUR`) + başlık + yer/saat.
  3. **Tutar** — ortalanmış, büyük rakam (44px, Space Grotesk, 900). Alt satır açıklama (`2 slot × 150₺`).
  4. **Ödeme Yöntemi karuseli** — yatay kaydırılan kartlar (158px genişlik): [OYNA Bakiyesi toggle] [kayıtlı kartlar…] [Yeni kart ekle].
  5. **Bilgi notu** — bakiye/kart dağılımını açıklayan yeşil kutu.
  6. **Sabit footer** — dağılım satırı (`150₺ bakiye + 150₺ kart`) + toplam; birincil buton `300₺ ÖDE`.
- **Tutar mantığı (katılım):** Kullanıcı **rezerve ettiği slot** sayısı kadar öder (ör. 2 slot × 150₺ = 300₺). Kişi başı slot ücreti = saha payı.
- **Kapora dili:** "Blokaj/ön-provizyon" terimi KULLANILMAZ. Saha kiralama/maç oluşturmada **"kapora"**, maça katılımda **"ödeme"** denir. Kapora için kısa güven notu: *"Maç dolmazsa otomatik iade edilir."*
- **Hizmet bedeli (%15):** Toplam tutarın içine gömülüdür; ayrı satır olarak GÖSTERİLMEZ.

**Alt ekranlar (aynı dosyada, state ile):**
- **Yeni Kart Ekle** (ayrı tam ekran): canlı kart önizlemesi + form (Kart No / Kart Sahibi / Son Kullanma / CVV) + "kaydet" toggle. Kaydedince kart listeye eklenir ve otomatik seçilir.
- **İşleniyor:** ortalanmış dönen halka + kart ikonu, başlık `ÖDEME İŞLENİYOR` (saha bağlamında `KAPORA İŞLENİYOR`), `iyzico ile güvenli bağlantı` notu. ~2.2 sn.
- **Onay (başarılı):** yeşil onay dairesi (pop animasyonu) + başlık **bağlama göre**: `Katılımın Onaylandı!` / `Kapora Onaylandı!` / `Ödemen Onaylandı!` + özet kartı (maç, yer/saat, ödeme dağılımı, işlem no) + bilgilendirme + `MAÇ DETAYINI GÖR`.

### 2) Oyuncu Cüzdanı — `OYNA Cüzdan.dc.html` (varyasyon **2a**, onaylanan)
- **Amaç:** Oyuncu bakiyesini görür, para yükler, kartlarını yönetir, geçmişe bakar.
- **Düzen:**
  1. **Header** — geri / `CÜZDAN` / saat (geçmiş) ikonu.
  2. **Hero bakiye kartı** — yeşil gradient (140deg, #0f3d24→#0a1712), 26px radius. `YÜKLENEN BAKİYE` etiketi + büyük rakam (40px, `450,00₺`) + sağ üstte `OYNA` monogram. Altında mavi chip: `İade Kredisi 300,00₺`.
  3. **Eylem hapları (3'lü satır):** `Para Yükle` (birincil yeşil), `Kart Yönet`, `Geçmiş` (ikon + etiket, dikey).
  4. **Kayıtlı Kartlar** — yatay karusel (200×120px gerçekçi kart görselleri, banka gradientleri) + ekle kutusu.
  5. **Son İşlemler** — liste (para yükleme +, maça katılım −, iade kredisi +).
- **Kural:** Oyuncuda **"Kazanç" bakiyesi YOKTUR.** Sadece *Yüklenen Bakiye* + *İade Kredisi*.
- **Alternatif (2b):** Aynı dosyada iki-bakiye-panolu bir alternatif de var; **onaylanan 2a'dır**, 2b yok sayılabilir (yalnızca referans).

### 3) Kaleci & Hakem Cüzdanı — `OYNA Cüzdan.dc.html`
- **Amaç:** Kaleci/hakem kazancını görür ve IBAN'a çeker.
- **Düzen:**
  1. **Header** — `CÜZDAN` + rol rozeti (`Kaleci` / `Hakem`, altın renk).
  2. **Hero kazanç kartı** — altın gradient (140deg, #3d3400→#0a1712). `ÇEKİLEBİLİR KAZANÇ` + büyük rakam (`1.250,00₺`) + iki istatistik kutusu (`Bu ay 8 maç`, `Kazanç +1.250₺`).
  3. **Eylemler:** `IBAN'a Çek` (birincil, geniş) + `Geçmiş`. **`Para Yükle` YOKTUR.**
  4. **Kayıtlı IBAN** satırı (banka + maskeli IBAN + Değiştir).
  5. **Kazanç Geçmişi** — maç kazançları (+) ve IBAN çekimleri (−, "Beklemede" rozetiyle).
- **Kural:** Kaleci/hakemde **para yükleme YOKTUR.** Sadece kazanç + IBAN çekimi.
- **IBAN'a Çek ekranı** (aynı dosyada): çekilecek tutar (hızlı: 500/1.000/Tümü) + hedef IBAN seçimi + "1–2 iş günü, ücretsiz" notu + `ÇEKİM TALEP ET`.

### 4) Para Yükle (Top-up) — `OYNA Cüzdan.dc.html`
- Büyük seçili tutar (`500₺`) + `Yeni bakiye: 950,00₺` önizleme.
- **Hazır tutar ızgarası:** `300 / 500 / 750 / 1.000 / 1.500 / Özel` (3 sütun). Seçili olan yeşil çerçeveli.
- **Minimum yükleme 300₺** — açık not olarak yazılı. 300 altındaki tutarlar seçilemez.
- **Bonus/teşvik YOKTUR** (sade tutar).
- Ödeme yöntemi (varsayılan kart) + `500₺ YÜKLE` butonu.

### 5) Kart Yönetimi — `OYNA Cüzdan.dc.html`
- Varsayılan kart büyük gerçekçi kart görseli (`Varsayılan` rozeti).
- Diğer kartlar satır halinde: `Varsayılan yap` + sil (çöp) butonu.
- Altta `YENİ KART EKLE`.

### 6) İşlem Geçmişi — `OYNA Cüzdan.dc.html`
- Üstte filtre çipleri: `Tümü / Yükleme / Ödeme / İade` (yatay kaydırılır, seçili yeşil).
- Tarihe göre gruplu liste (`9 Temmuz`, `8 Temmuz`…). Her satır: ikon + başlık + alt bilgi + tutar (renk kodlu).

---

## Etkileşimler & Davranış

### Ödeme ekranı state makinesi (1b prototip — gerçekten çalışır)
- **Ekranlar:** `pay` → `add` (kart ekle) → `pay`; `pay` → `processing` → `success`.
- **Bakiye toggle:** OYNA Bakiyesi kartına dokununca uygulanan tutar = `min(bakiye, tutar)`. Kalan tutar (`remaining = tutar − uygulanan`) karttan tahsil edilir. Footer dağılımı ve bilgi notu **canlı** güncellenir.
  - Bakiye tutarı tamamen karşılarsa: "Tamamı OYNA bakiyenden — kart gerekmez."
  - Kısmi: "Bakiyen … karşılıyor; kalan …₺ seçtiğin karttan tahsil edilir."
  - Bakiye kapalı: "Tutarın tamamı seçtiğin karttan tahsil edilir."
- **Kart seçimi:** Kayıtlı kartlar arasında tekli seçim (yalnızca karta ihtiyaç varken aktif). Seçili kartta yeşil çerçeve + onay rozeti.
- **Kart ekleme:** Ayrı ekran. Girişte canlı formatlama:
  - Kart No: rakamlar 4'lü gruplanır, maks 16 hane.
  - Son Kullanma: `AA/YY` (2 haneden sonra otomatik `/`).
  - Kart Sahibi: otomatik BÜYÜK HARF.
  - CVV: maks 3 hane.
  - Canlı kart önizlemesi girildikçe güncellenir.
  - **Kaydet butonu** yalnızca geçerliyken aktif (No ≥ 12 hane, SKT ≥ 4, CVV ≥ 3, İsim > 1). Kaydedince yeni kart listeye eklenir, seçilir, `pay` ekranına dönülür.
- **Ödeme:** `ÖDE` → `processing` (~2200ms, dönen halka) → `success` (pop + rise animasyonları).
- **Onay başlığı bağlama göre** değişir (yukarıda).

### Hata durumu (kritik davranış — ayrı hata ekranı YOK)
Ödeme başarısız olursa **ayrı bir hata ekranı gösterilmez**. Kullanıcı **cüzdan ana ekranına** döner ve orada:
- Üstte **kırmızı uyarı şeridi (banner):** başlık `Ödeme başarısız` + **sebep** (ör. "Kartının limiti yetersiz…") + `Tekrar dene` butonu.
- İşlem listesinde **kırmızı "Başarısız" satırı** + sebep + üzeri çizili tutar.
(Bu davranış "Tek Ekran" referans dosyasındaki cüzdan+hata karesinde gösterilmiştir.)

### Animasyonlar
- **İşleniyor halkası:** `spin` 1.1s linear infinite (SVG stroke-dashoffset).
- **Onay dairesi:** `oynaPop` 0.5s cubic-bezier(.2,.9,.3,1.2).
- **Onay içeriği:** `oynaRise` 0.4s ease, kademeli gecikme (0.12/0.18/0.24s).
- **Yükleme noktaları / pulse:** `oynaPulse` 1.2–1.4s ease-in-out.
- Kart/yöntem seçimi geçişi: `border .15s, box-shadow .15s`.

### Responsive / dokunma
- Hedef genişlik: iPhone içerik alanı ~**402px** (ios-frame.jsx). Tasarım tek sütun, dikey kaydırma.
- Dokunma hedefleri ≥ 44px (header butonları 42–44px daire, CTA 16px dikey padding).

---

## State Yönetimi (ödeme ekranı)
Gerekli state değişkenleri (prototipte kullanılan):
- `screen`: `'pay' | 'add' | 'processing' | 'success'`
- `useBalance`: boolean — OYNA bakiyesi uygulanacak mı
- `selectedCard`: string — seçili kart id
- `cards`: dizi — `{ id, brand, last4, exp, gradient }`
- Kart ekleme formu: `fNum, fName, fExp, fCvv, fSave`
- Sabitler: `amount` (ödenecek tutar), `balance` (kullanılabilir OYNA bakiyesi)

Türetilen (hesaplanan) değerler:
- `balanceApplied = useBalance ? min(balance, amount) : 0`
- `remaining = amount − balanceApplied`
- `needsCard = remaining > 0`

Cüzdan için gerekli veri:
- Oyuncu: `yuklenenBakiye`, `iadeKredisi`, `kartlar[]`, `islemler[]`
- Kaleci/Hakem: `cekilebilirKazanc`, `buAyMacSayisi`, `buAyKazanc`, `kayitliIban`, `kazancGecmisi[]`
- Rol bayrağı cüzdan tipini belirler: `role: 'player' | 'keeper' | 'referee'`.

Veri çekme: Kartlar, bakiyeler ve işlemler backend'den gelir. Kart saklama/işleme **iyzico** üzerinden (kart verisi cihazda saklanmaz). Kapora için para maç kesinleşince tahsil edilir, dolmazsa iade edilir (backend iş kuralı).

---

## Tasarım Tokenları

### Renkler
| Rol | Hex |
|---|---|
| Uygulama arka planı (koyu lacivert) | `#0A0E14` |
| Yüzey / kart | `#161B22` |
| İkincil yüzey / input arka planı (koyu) | `#0f1419`, `#0f172a` |
| **Birincil neon yeşil** (CTA, başarı, oyuncu bakiye) | `#39FF14` |
| Yeşil (yumuşak metin) | `#8fe87a`, `#70ff56` |
| **Altın/sarı** (kapora, kaleci-hakem kazanç) | `#FACC15` |
| Altın (yumuşak metin) | `#e8d27a` |
| **Mavi** (iade kredisi / bilgi) | `#60A5FA`, `#93c5fd` |
| **Kırmızı** (hata) | `#F87171`, `#EF4444` |
| Metin — birincil | `#FFFFFF` |
| Metin — ikincil | `#D1D5DB`, `#9CA3AF` |
| Metin — soluk / caption | `#6B7280`, `#4B5563` |
| Kenarlık (ince) | `rgba(255,255,255,0.05 – 0.08)` |

### Kart görseli gradientleri
- Visa: `linear-gradient(135deg,#7c3aed,#2563eb)` · hero: `linear-gradient(135deg,#4c1d95,#2563eb)`
- Mastercard: `linear-gradient(135deg,#059669,#0f766e)` / `linear-gradient(135deg,#065f46,#0f766e)`
- Yeni kart (varsayılan): `linear-gradient(135deg,#0ea5e9,#6366f1)`
- Oyuncu hero: `linear-gradient(140deg,#0f3d24,#0a1712)`
- Kaleci hero: `linear-gradient(140deg,#3d3400,#0a1712)`
- Kart çipi: `linear-gradient(135deg,#facc15,#ca8a04)`

### Tipografi
- **Gövde / UI:** `Inter` (300–900). Ağırlıklar: başlıklar 900, etiketler 700–800, gövde 600–700.
- **Rakamlar / tutar / IBAN / kart no:** `Space Grotesk` (400–700).
- Ölçek:
  - Büyük tutar / bakiye: **40–46px / 900** (Space Grotesk)
  - Kart başlığı: 20–21px / 900
  - Ekran başlığı (header): 16–17px / 900, `text-transform:uppercase`, `letter-spacing:0.16em`
  - Bölüm etiketi: 11px / 900, uppercase, `letter-spacing:0.14em`, `#6B7280`
  - Gövde: 12–14px
  - Caption: 10–11px, `#4B5563`/`#6B7280`
- **Türkçe büyük harf:** `text-transform:uppercase` kullanılan her yerde kök elemana `lang="tr"` verilmiştir; yoksa Türkçe "i" harfi "I" olur ("İŞLENİYOR" yerine "IŞLENIYOR"). Uygulamada da bunu koruyun (native'de doğru Türkçe locale casing).

### Radius
- Butonlar: `16px` · küçük butonlar: `10–14px`
- Kartlar / özet: `20–28px`
- Hero kart: `26px`
- Input: `12–14px`
- Pill / rozet / daire: `9999px`

### Boşluk
- Ekran yatay padding: `20px`
- Header üst padding: `56px` (status bar için)
- Footer padding: `14px 20px 30px`
- Kart iç padding: `16–24px`
- Liste öğe aralığı (`gap`): `9–12px`
- Bölümler arası: `16–22px`

### Gölge / efekt
- CTA glow: `0 0 24–30px rgba(57,255,20,0.22–0.28)`
- Kart gölgesi: `0 10–20px 24–50px rgba(0,0,0,0.3–0.5)`
- Seçili yöntem glow: `0 0 18–22px rgba(57,255,20,0.12–0.18)`
- Arka plan blur ışıkları: `filter: blur(50–120px)` renkli daireler

---

## Assets
- **İkonlar:** [Lucide](https://lucide.dev) v0.469.0 (CDN: `unpkg.com/lucide`). Kullanılan başlıcalar: `arrow-left, wallet, credit-card, plus, check, lock, users, store, plus-circle, shield-check, shield, info, gift, trending-up, rotate-ccw, list, clock, refresh-cw, landmark, arrow-up-right, chevron-down, chevron-right, trash-2, pencil, wifi, x, alert-triangle, bell, zap, map-pin, calendar, check-circle`. Uygulamada kendi ikon setinizin (ör. lucide-react-native) eşdeğerlerini kullanın.
- **Fontlar:** Google Fonts — `Inter`, `Space Grotesk`. Uygulamaya paketleyin.
- **Görsel/logo yok:** Saha görselleri prototipte placeholder desenle temsil edilmiştir; gerçek uygulamada saha fotoğrafları/CDN kullanılır. OYNA logosu metin monogram (`OYNA`) olarak gösterilmiştir.
- **iPhone çerçevesi:** `ios-frame.jsx` yalnızca sunum içindir, uygulamada kullanılmaz.

---

## Dosyalar
Bu pakette:
- `OYNA Ödeme - 1b Prototip.dc.html` — **Ödeme ekranı (1b), tam etkileşimli.** Ana ödeme referansı. State makinesi + kart ekleme + kısmi ödeme mantığı burada.
- `OYNA Cüzdan.dc.html` — **Cüzdan:** Oyuncu (2a onaylı) + Kaleci/Hakem + Para Yükle + Kart Yönetimi + IBAN'a Çek + İşlem Geçmişi.
- `OYNA Ödeme - Tek Ekran (uc-baglam referansi).dc.html` — Üç bağlam uyarlaması (Kapora/Ödeme), ortak akış ve **cüzdanda hata banner'ı** karesi için görsel referans.
- `ios-frame.jsx`, `support.js` — prototipleri tarayıcıda canlandırmak için runtime (uygulamaya taşınmaz).

### Dosyalar nasıl açılır (görsel inceleme için)
`.dc.html` dosyaları tasarım prototipi çalışma zamanına (`support.js`) bağlıdır ve en iyi bu proje içinden önizlenir. Salt görsel inceleme için ekran görüntüsü isteyebilirsiniz (aşağıya bakın). Claude Code entegrasyonu için önemli olan, dosyaların **kaynak HTML işaretlemesidir** — tüm stiller satır-içi (inline) yazılmıştır, bu yüzden her ekranın kesin renk/boşluk/tipografi değerleri doğrudan okunabilir.

## Uygulama Sırası (öneri)
1. Tasarım tokenlarını (renk, tipografi, radius, boşluk) hedef koda taşıyın.
2. Ödeme ekranını (1b) state makinesiyle kurun: yöntem seçimi + kısmi bakiye hesabı + kart ekleme + işleniyor/onay.
3. Cüzdanı role göre kurun (oyuncu / kaleci-hakem) — koşullu bakiye ve eylemler.
4. Para yükle, kart yönetimi, işlem geçmişi akışlarını bağlayın.
5. Hata davranışını cüzdan banner'ı olarak uygulayın (ayrı hata ekranı yok).
6. iyzico entegrasyonu + kapora tahsil/iade iş kurallarını backend ile bağlayın.
7. Store uyumluluğunu koruyun: cüzdan bakiyesi yalnız fiziksel hizmete harcanır; dijital ürün satışı yok.
