# 03 · Bileşen Kataloğu

Buradaki dosyalar uygulamanın **gerçek** bileşenleridir (salt okunur kopya).
Yeni bir ekran tasarlanırken önce bu listeye bakılır: iş görecek bir parça
varsa yenisi çizilmez.

---

## Kabuk ve yerleşim

| Dosya | Ne yapar | Ne zaman |
|---|---|---|
| `bilesenler/common/PageLayout.tsx` | Ekran kabuğu: güvenli alanlı başlık + geri oku + kaydırılan gövde | Neredeyse her alt ekran |
| `bilesenler/BottomNav.tsx` | Beş sekmeli alt gezinti; ortadaki (Maçlarım) büyük tuş | Kapı ekranlarında; **ana sayfada çizilmez** |

## Alt sayfalar ve pencereler

| Dosya | Ne yapar | Ne zaman |
|---|---|---|
| `bilesenler/ui/ActionSheet.tsx` | Kanonik alt sayfa: sürükle-kapat, yapışkan başlık + alt CTA, klavye farkındalığı (CTA klavyenin arkasında kalmaz) | Form ya da uzun içerik taşıyan alt sayfalar |
| `bilesenler/ui/BottomSheet.tsx` | Sade alt sayfa tabanı | Kısa seçim listeleri, profil önizleme |
| `bilesenler/ui/GlassModal.tsx` | Ekran ortasında buzlu cam pencere; alt çubukla çakışmaz | Odak isteyen kısa akışlar |
| `bilesenler/ui/ConfirmSheet.tsx` | Markalı onay sayfası; işlem sürerken butonu kilitler ve yanlışlıkla kapanmayı engeller | **Geri alınamaz** her işlem |
| `bilesenler/ui/useConfirmSheet.tsx` | `ConfirmSheet`in söz (promise) hâli — `window.confirm` yerine | Kod içinden onay beklerken |
| `bilesenler/ui/ConfirmDialog.tsx` | Küçük yıkıcı onay diyaloğu | Arkadaşlıktan çıkar, engelle, takımı dağıt |

> `window.confirm` **kullanılmaz**: stil dışıdır ve mobilde doğru davranmaz.

## Girdi ve seçim

| Dosya | Ne yapar | Ne zaman |
|---|---|---|
| `bilesenler/AnimatedButton.tsx` | Ana buton: `primary` / `secondary` / `danger` / `ghost` × `sm` / `md` / `lg` | Metinli her buton |
| `bilesenler/ui/IconButton.tsx` | Oyuncu tarafının tek ikon-buton primitifi; `label` TypeScript'çe **zorunlu**, taban 44px | Sadece ikon taşıyan her buton |
| `bilesenler/ui/OwnerIconButton.tsx` | Tesis panelinin aynı primitifi (odak halkası mavi — bilerek ayrı tema) | Yalnız tesis paneli |
| `bilesenler/ui/Chip.tsx` | Filtre/liste çipi; uzun basışla yönetim menüsü | Filtre satırları, etiketler |
| `bilesenler/ui/FilterDropdown.tsx` | Yukarıdan açılan filtre menüsü; "aptal" bileşen — açık/kapalı durumu ebeveyndedir | Top Oyna filtreleri |
| `bilesenler/ui/SegmentedTabs.tsx` | Hap biçimli alt sekmeler (≥44px) | Bir ekranın içindeki alt görünümler |

## Durum ve geri bildirim

| Dosya | Ne yapar | Ne zaman |
|---|---|---|
| `bilesenler/ui/SkeletonList.tsx` | İskelet yükleme (`card` / `line`) | Liste yüklenirken — spinner yerine |
| `bilesenler/ui/Spinner.tsx` | Kuyruklu yıldız yükleme halkası | Nokta atışı bekleme (buton içi, küçük alan) |
| `bilesenler/ui/EmptyState.tsx` | Zengin boş durum: ikon + başlık + açıklama + en çok 2 CTA | Liste boşken |
| `bilesenler/common/StatusState.tsx` | Yükleniyor / hata / boş üçlüsü bir arada | Ekran seviyesinde durum |
| `bilesenler/common/Toast.tsx` | Kısa bildirim (`success` / `error`); ekran okuyucuya doğru öncelikle duyurur | Geri **alınabilir** işlemler |

## Kimlik ve marka

| Dosya | Ne yapar | Ne zaman |
|---|---|---|
| `bilesenler/ui/Avatar.tsx` | Paylaşılan avatar: fotoğraf → yoksa baş harf, çevrimiçi noktası | Başka kullanıcılar |
| `bilesenler/common/UserAvatar.tsx` | Oturum sahibinin avatarı — ana sayfa ile profil birebir aynı görünür | Kendi kullanıcın |
| `bilesenler/OynaLogo.tsx` | Marka amblemi, tek vektör yol; uygulama simgesiyle birebir aynı çizim | Logo gereken her yer |
| `bilesenler/dashboard/OynaMarks.tsx` | Ana sayfanın özel amblemleri (top+oynat, saha pini, kaleci eldiveni, hakem düdüğü) | Ana sayfa ve alt gezinti |

## Kartlar ve galeriler

| Dosya | Ne yapar | Ne zaman |
|---|---|---|
| `bilesenler/MatchJoinCard.tsx` | Maç kartı + mini saha çizimi (diziliş gösteren maçlar için) | Maç listeleri |
| `bilesenler/BookingCard.tsx` | Rezervasyon kartı; para altın renkte, rakamlar Space Grotesk | Maçlarım · rezervasyonlar |
| `bilesenler/common/PhotoCarousel.tsx` | Tesis galerisi: parmakla geçiş, gerçek konumu izleyen noktalar, "3 / 8" sayacı, tam ekran görüntüleyici | Tesis/kort fotoğrafları |
| `bilesenler/dashboard/HomePieces.tsx` | Ana sayfanın tekrar eden parçaları: aksan çizgisi, fotoğraf bandı, iskelet, dokunma sarmalayıcı | Ana sayfa |

---

## Örnek ekranlar

| Dosya | Neyi gösterir |
|---|---|
| `ekranlar/Dashboard.tsx` | **Onaylı ana sayfa tasarımı.** Token kullanımının en iyi örneği: kart merdiveni, kategori aksanları, sabit yükseklikler, kaydırma davranışı |
| `ekranlar/MatchDiscovery.tsx` | Liste + filtre + kart dili, boş/yükleniyor hâlleri |
| `ekranlar/ProfileScreen.tsx` | Profil düzeni, "İnce Neon" stili, ambient ışıma |

---

## İkonlar

Tümü **lucide** setinden (`lucide-react`). Sık kullanılanlar: `arrow-left`, `x`,
`share`, `map-pin`, `calendar`, `clock`, `users`, `user-plus`, `shirt`,
`banknote`, `navigation`, `info`, `lock`, `check`, `check-circle`,
`chevron-right`, `star`, `alert-triangle`, `ticket`, `wallet`, `bell`.

Ana sayfanın dört amblemi lucide'de yoktur; `bilesenler/dashboard/OynaMarks.tsx`
içindeki özel çizimlerdir.
