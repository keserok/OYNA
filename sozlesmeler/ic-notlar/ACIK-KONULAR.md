# İç Notlar — Açık Uyum Konuları (YAYINLANMAZ)

> **BU DOSYA ASLA YAYINLANMAZ.**
> Buradaki notlar şirketin kendi uyum takibi içindir. Daha önce bu notlar
> `sozlesmeler/oyuncu/*.md` dosyalarının içinde duruyordu ve oradan
> `public/*.html` sayfalarına, oradan da uygulama paketine sızıyordu.
> Yayınlanan bir sözleşmenin altında "şunu henüz değerlendirmedik" yazması,
> şikâyet veya rakip için hazır delil demektir. O yüzden notlar buraya taşındı.
>
> `scripts/build-legal-pages.mjs` yalnızca `sozlesmeler/oyuncu/` klasöründen
> okur ve bu klasörü hiçbir koşulda okumaz (script içinde sert kontrol var).

---

## A1 — 6563 s. Kanun: ETBİS / aracı hizmet sağlayıcı bildirimi

**Nereden geldi:** `sozlesmeler/oyuncu/05-mesafeli-satis-iptal-iade.md` (yayından kaldırıldı, 17.08.2026)

İşlem hacmi / satıcı (tesis) sayısı belli eşikleri aşarsa, 6563 sayılı Kanun
kapsamında "elektronik ticaret aracı hizmet sağlayıcısı" bildiriminin
Ticaret Bakanlığı'na yapılması gerekebilir. Bu henüz değerlendirilmedi.
(Bkz. uyum takip paneli, madde E2.)

**Durum:** Açık — hukukçu değerlendirmesi bekliyor.

---

## A2 — İYS (İleti Yönetim Sistemi) kaydı

**Nereden geldi:** `sozlesmeler/oyuncu/04-kvkk-acik-riza-metni.md` (yayından kaldırıldı, 17.08.2026)

Açık rıza metnindeki 3. madde (ticari elektronik ileti izni), OYNA fiilen
kampanya/pazarlama mesajı gönderiyor olsun ya da olmasın, özellik ileride
etkinleşirse gereken izni önceden tanımlar.

Kampanyalar fiilen başladığında, 6563 sayılı Kanun kapsamında ayrıca **İYS
(İleti Yönetim Sistemi)** kaydı gerekip gerekmediği teyit edilmelidir — bu,
KVKK açık rızasından bağımsız, ayrı bir mevzuat yükümlülüğüdür.

**Durum:** Açık — kampanya özelliği açılmadan önce netleşmeli.

---

## A3 — public/cerez-politikasi.html tarihi

`public/cerez-politikasi.html` elle tutulan bir sayfadır; `build:legal`
tarafından üretilmez. Sayfada hâlâ **12.07.2026** yazıyor; kanonik metin
(`sozlesmeler/oyuncu/06-cerez-politikasi.md`) ve uygulama içi metin
(`shared/legalVersion.ts` → `LEGAL_UPDATED_TR`) **15.07.2026** diyor.

**Durum:** Açık — tek satırlık elle düzeltme gerekiyor.
