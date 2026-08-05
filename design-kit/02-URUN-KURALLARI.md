# 02 · Ürün Kuralları

> Bunlar üslup tercihi değil, **karar**dır. Her biri bir kez yanlış yapıldığı
> için yazıya geçti. Bir tasarımı ilk bakışta yanlış yapan maddeler burada.

---

## 1 · Türkçe

- **Büyük harf kullanılan her kök öğeye `lang="tr"` verilir.** Yoksa tarayıcı
  "İLERİ" kelimesini "ILERI" diye çizer; `i → İ` dönüşümü yalnız Türkçe dil
  etiketiyle doğru çalışır. Bu **zorunludur**, süs değildir.
- Ekranlarda İngilizce kelime kullanılmaz ("escrow", "slot", "booking" gibi
  terimler kullanıcıya gösterilmez).
- **Üç nokta daima tek karakterdir:** `…` — `...` kullanılmaz.
  Bekleme metinleri sabittir: `Yükleniyor…` `Kaydediliyor…` `Gönderiliyor…`
  `Aranıyor…` `Hazırlanıyor…`
- Kullanıcıya gösterilmeyen kelimeler: **"blokaj", "ön provizyon", "escrow"**.
  Rahat maçta dil "ödeme"dir; kapora dili yalnız saha kiralamada kullanılır.
- **Hizmet bedeli / komisyon ayrı satır olarak gösterilmez** — tutara gömülüdür.

## 2 · Para biçimi (tek kanonik yazım)

| Durum | Yazım |
|---|---|
| Tam sayı | `2.000₺` — sembol **sonda**, **boşluksuz**, ondalık **yok** |
| Kuruşlu | `299,90₺` — kuruş varsa iki hane |
| Sıfır | `Ücretsiz` — "0₺" bedavayı anlatmaz |
| Değer yok | `—` — "0₺" yazmak yalan olur; bilinmiyor ile sıfır aynı şey değil |

Rakamlar `.font-numeric` ile çizilir (Space Grotesk + eşit genişlikli rakam):
alt alta gelen tutarlar hizalanır, sayaç değişirken yatay zıplama olmaz.

## 3 · Uydurma veri yasağı

**Bir alanın verisi yoksa o öğe hiç çizilmez.** Varsayılan/temsilî değer
basılmaz: "—" yerine tahmini süre, olmayan koordinat yerine boş harita,
bilinmeyen mesafe yerine "yakında" yazılmaz.

Pratikte: koordinat yoksa harita kartı **tamamen** yoktur; süre bilgisi yoksa
süre etiketi yoktur; fotoğraf yoksa karusel yerine düz gradient + tesis baş
harfi durur.

## 4 · Değişebilen sayılar → yer tutucu

Onay penceresi (saat), kadro yeter sayısı (oran) ve iade kademeleri
(tam/yarım/oran) **admin ve tesis tarafından değiştirilebilir.** Tasarımda bu
değerler sabit yazılmaz; `{SAAT}`, `{TAM}`, `{ORAN}` gibi yer tutucu olarak
görünür. Kullanıcıya yüzde göstermek de tasarım kararı değildir — ürün kararı
gereği bazı oranlar hiç gösterilmez.

## 5 · Ekran adları tek kaynaktan

Bir ekranın adı bir kez yazılır; sekme etiketi, ekran başlığı ve metin içindeki
atıflar aynı sabitten beslenir (`temel/labels.ts`). Kullanıcı sekmede ne
gördüyse onu arar.

| Ekran | Ad | Ana sayfa kartı |
|---|---|---|
| Ana sayfa | **Ana Sayfa** | — |
| Maç keşfi | **Top Oyna** | Top Oyna |
| Maçlarım | **Maçlarım** | — |
| Saha keşfi | **Saha Kirala** | Saha Kirala |
| Maç kurma | **Maç Kur** | Maç Kur |
| Kaleci pazarı | **Kaleci Bul** | Kaleci |
| Hakem pazarı | **Hakem Kirala** | Hakem |
| Taktik stüdyo | **Taktik Stüdyo** | Taktik Stüdyo |
| Diğer | Profil · Sosyal · Mesajlar · Cüzdan · Ayarlar | — |

## 6 · Yıkıcı işlemler

- Geri **alınamaz** işlem onay ister (alt sayfa/diyalog); geri alınabilir işlem
  onay istemez, `toast` ile geçer.
- Güvenli buton daima **"Vazgeç"**.
- Yıkıcı buton **fiili söyler**: "Maçtan Ayrıl", "Rezervasyonu İptal Et",
  "Hesabı Sil". **"Evet," ön eki kullanılmaz** — Türkçede "Evet, İptal Et" ile
  "Vazgeç" yan yana durunca hangisinin yıkıcı olduğu anlaşılmıyordu.
- Yıkıcı buton dolgusu `--color-error-fill`, üzerindeki metin beyazdır.

## 7 · Erişilebilirlik

| Kural | Ölçü |
|---|---|
| En küçük dokunma hedefi | **48px** (`--oy-tap-min`); ikon butonlarda taban 44px |
| Metin kontrastı | Dört mürekkep basamağının tamamı kart zemininde AA geçer |
| Sadece ikon taşıyan buton | `aria-label` **zorunlu** — etiketsizi derlenmez |
| Durum bildirimi | Renk + ikon + kelime; renk tek başına anlam taşımaz |
| Azaltılmış hareket | `prefers-reduced-motion` altında ölçek animasyonu ve ambient ışıma kapanır |
| Yazı boyutu | Ölçek `rem` tabanlı; kullanıcı telefon ayarını büyütünce arayüz büyür |
| Form alanları | Telefonda en az 16px — küçüğünde iOS odaklanınca sayfayı yakınlaştırır |

## 8 · Her listenin üç hâli vardır

Yeni bir liste/ekran tasarlanırken üçü birden çizilir:

1. **Yükleniyor** — spinner değil **iskelet** (içerik silüeti)
2. **Boş** — ikon + başlık + açıklama + en çok 2 eylem (biri birincil)
3. **Hata** — ne olduğu + tekrar deneme yolu

Ayrıca yarış durumu: kullanıcı karar verirken veri değiştiyse ayrı hata ekranı
açılmaz; aynı yüzeyde şerit + tazelenmiş sayılar gösterilir.

## 9 · Sökülmekte olan desenler — yeni tasarımda **kullanma**

- ❌ **Oyuncu puanı / OVR sayısı / gold-silver-bronze kart seviyesi.** Sistemden
  çıkarılıyor. Oyuncunun yanında yalnız seviye bandı durur:
  `BAŞLANGIÇ` (mavi) · `ORTA` (altın) · `İLERİ` (yeşil).
- ❌ **Minimum puan barajı.** "Bu maç en az 4.0 puan istiyor" gibi çip, kilit
  veya uyarı yoktur — eşleştirme yumuşaktır, sert baraj yoktur.
- ❌ **Ham seviye sayısı kadro listesinde gösterilmez** (`7/10` yalnız kişinin
  kendi beyan ekranlarında görünür).

Korunan puanlar (bunlar **kalır**): saha puanı, kaleci/hakem puanı, güvenilirlik
puanı.

## 10 · Zaman ve konum

- Tek geçerli saat dilimi **Türkiye saatidir**; saha bazlı saat dilimi yoktur.
- Kapsama **ilçe bazlıdır**: yalnız anlaşması olan ilçeler açıktır.
- Konum izni yoksa ülke geneli liste gösterilmez — önce konum izni istenir,
  verilmezse ilçe seçtirilir.

## 11 · Telefon önce

- İçerik genişliği ~402px, tek sütun, dikey kaydırma.
- **Telefon çerçevesi/beze çizilmez** — hedef ekranın kendisidir.
- Çentik ve ana ekran çubuğu payı her ekranda hesaba katılır.
- Uygulama çevrimdışı kalabilir: şebekesizken arayüz sistem fontuna düşmez,
  üstte çevrimdışı şeridi belirir ve içeriği örtmeden yer açar.
