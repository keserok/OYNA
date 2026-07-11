# OYNA Harita Master Planı — Değer-Önce Sıralama

> **Karar tarihi:** 2026-07-11 · 10 soruluk analiz turu + 10 ajanlık araştırma/çekişmeli-doğrulama iş akışı ile revize edildi.
> **İlke:** Pin verisi dürüstlüğü > görsel cila. Yanlış konum göstermektense gizle.
> **Yön (revize):** Hedef "anlık, sürtünmesiz, **mükemmel konumlandırma**"dır. Doğrulandı ki konumlandırma doğruluğu MapLibre'den DEĞİL, pin-veri dürüstlüğü + gerçek konum + fallback'ten gelir. Bu yüzden en değerli/en düşük-riskli iş öne alınır; MapLibre motor değişimi **opsiyonel görsel-cila** track'ine indirilir.
> **Ölçek penceresi:** Canlıda 4 saha / 9 maç.

## 0. Mevcut durum bulguları (kanıt — doğrulandı)

| # | Bulgu | Yer |
|---|-------|-----|
| 1 | CARTO dark_all raster + `attribution=""` + CSS ile atıf gizleme (**bugün mevcut ToS/atıf ihlali**) | PitchDiscovery:280, OwnerFacilitySettingsModal:443, MatchJoin:2908, PitchStudio:530 |
| 2 | Koordinatsız sahalara sahte Ordu-merkez koordinatı basılıyor (yalancı pinler) | `admin-panel/utils/pitchMapper.ts:25` (`?? 40.9839 / ?? 37.8764`) |
| 3 | "Buradasın" mavi noktası kullanıcı konumuna değil harita merkezine çiziliyor | `PitchDiscovery.tsx:285-316` Circle center={center}; userLocation null→ORDU_CENTER (716,730) |
| 4 | Onboarding'de pin adımı yok, yalnız serbest metin adres; geocoding yok | `views/PartnerOnboarding.tsx` |
| 5 | ORDU_CENTER fallback tüketici ekranlarında sürüyor (MatchJoin hariç — düzeltildi) | PitchDiscovery:716,730; ServiceProfile:81 |
| 6 | Pin tap → küçük Leaflet Popup; Airbnb tarzı alt karusel yok | PitchDiscovery MapViewComponent |
| 7 | Harita kaydırma listeyi değiştirmiyor; "bu alanda ara" yok | UI bağlı değil |
| 8 | `map.setView` zıplıyor (flyTo/easeTo yok); divIcon her render'da yeniden üretiliyor; kümeleme yok | PitchDiscovery:268, createPitchPin |
| 9 | Yol tarifi yalnız MatchJoin'de ve yalnız Google; kartlarda mesafe yok | MatchJoin popup |
| 10 | 5 kopya harita implementasyonu; AIRBNB_MAP_CSS 2 kopya, ChangeView/Resizer kopya | 5 ekran |

**Zaten hazır altyapı (yeniden yazım GEREKMEZ):**
- `get_nearby_pitches` RPC canlıda mevcut ve çalışıyor (migration `20260709000001:118` — approved + is_open + demo-olmayan + koordinatlı filtre, `distance_km` döndürür).
- `getHaversineDistance` `utils/geo.ts:40`'ta hazır — mesafe rozeti için yeni motor gerekmez.

## 0.5. Doğrulanmış maliyet & risk (10 ajanlık araştırma sonucu)

| Konu | Bulgu | Sonuç |
|------|-------|-------|
| MapLibre kütüphane lisansı | BSD-3-Clause, ticari serbest, App Store/WebView serbest | **Maliyet yok** ✓ |
| Tile/basemap sağlayıcı | MapTiler & Stadia **ücretsiz katmanı canlı ticari kullanımı yasaklar**; OYNA gelir amaçlı ürün → hacim ne olursa olsun ~**$20–30/ay** ücretli plan gerekir. Alternatif: OpenFreeMap (garantisiz, "her an kapatabilirim" ToS — ticari bağımlılık riski) veya self-host Protomaps (~$2,67/ay + 111GB + bakım) | **Gerçek maliyet — hacimde değil lisansta** |
| Geocoding | Kamu Nominatim'i ticari üründe ana geocoder olarak kullanmak ToS ihlali + IP ban riski. LocationIQ ücretsiz 5k/gün ama zorunlu atıf linki; self-host = 95GB disk + yüksek RAM | **Gerçek maliyet/kısıt** |
| Bundle | maplibre-gl gzip ~268KB vs leaflet ~42KB → **+226KB gzip** (6,4×), bundlephobia'dan doğrulandı | **Açılış yükü artışı** |
| WebGL | MapLibre WebGL'siz başlamıyor, **dahili fallback yok**; zayıf/eski Android WebView'da context kaybı/init çökmesi belgeli (düşük-uç GPU riski; modern WebView genelde destekler) | **Kendi fallback'in yazılmalı** |
| Regresyon yüzeyi | 5 ekran Leaflet; biri **rezervasyon-kritik** MatchJoin | **Orta iş, düşük-orta risk** |
| **Acil ToS sorunu** | CARTO tile'ları atıf gizlenerek kullanılıyor — MapLibre'den bağımsız, **bugün** var | **Tek satırla hemen kapatılmalı** |

## 1. Revize kararlar

- **Konumlandırma doğruluğu** → pin-veri dürüstlüğü + gerçek konum + fallback (motor-bağımsız). ÖNCE bunlar.
- **Atıf ihlali** → acil, bugün Leaflet'te düzeltilir; motoru beklemez.
- **Mavi nokta** → yalnız gerçek `userLocation` + accuracy halkası; "konumuma dön" FAB; izin yoksa nokta yok.
- **Fallback zinciri** → gerçek konum → activeRegion şehir merkezi (regionResolver) → sonuç pinlerine fitBounds. ORDU_CENTER tüketici ekranlarından çıkar.
- **Keşif UX** → alt kart karuseli + çift yönlü pin senkronu; "Bu alanda ara" mevcut `get_nearby_pitches`'e bağlanır; mesafe rozeti mevcut haversine'le. **Bunların hiçbiri MapLibre gerektirmez — Leaflet'te yapılır.**
- **MapLibre GL** → hedef için **zorunlu değil**; opsiyonel görsel-cila track'i. Ölçek/talep büyüyünce, tile lisans maliyeti + WebGL fallback + 5 ekran taşıması birlikte değerlendirilir.
- **Kümeleme** → 4 saha ölçeğinde ertelenir (kodda yok, erken özellik).
- **Geocoding** → onboarding pin adımı eklenir; geocoder olarak kamu Nominatim'i DEĞİL, toS-uyumlu bir çözüm (LocationIQ atıflı ücretsiz katman veya self-host) seçilir; her hâlükârda sürükle-onayla pin akışı isabetsizliği telafi eder.

## 2. Dalga planı (değer-önce)

### Dalga 1 — Dürüstlük dilimi (Leaflet üzerinde, ~sıfır maliyet / düşük risk)
- [ ] **Atıf düzeltmesi (acil):** 4 dosyada `attribution=""` ve atıf-gizleyen CSS kaldırılır; CARTO/OSM zorunlu atıfı görünür yapılır. Tek başına merge edilebilir.
- [ ] **Sahte koordinat kaldırma:** `pitchMapper.ts:25` `?? 40.9839/37.8764` → `coordinates: null` dürüstlüğü (tip güncellemesi); koordinatsız saha haritada gösterilmez.
- [ ] **Gerçek mavi nokta + FAB:** konum noktası yalnız `userLocation`'da; accuracy halkası; "konumuma dön" FAB; izin reddinde nazik açıklama.
- [ ] **Fallback zinciri:** gerçek konum → activeRegion → fitBounds; ORDU_CENTER sabiti PitchDiscovery + ServiceProfile'dan çıkar.
- [ ] **Admin kuyruğu:** pin'siz sahalara "pin eksik" rozeti.
- **Kabul:** Yalancı pin yok; atıf görünür; mavi nokta doğru; konum yoksa yanlış yer gösterilmiyor.

### Dalga 2 — Keşif deneyimi (Leaflet üzerinde, motor swap yok)
- [ ] Alt kart karuseli (foto/puan/ilçe/mesafe/fiyat/CTA) + çift yönlü pin senkronu; Popup söküldü.
- [ ] "Bu alanda ara" chip'i → mevcut `get_nearby_pitches` RPC'sine bağlanır (bbox/yarıçap).
- [ ] Mesafe rozetleri (mevcut `getHaversineDistance`, konum izniyle) kart + karuselde.
- [ ] "Yol Tarifi" platform seçici (iOS: Apple/Google bottom-sheet; Android: Google intent).
- [ ] `map.setView` → yumuşak `flyTo`/panTo; divIcon fabrikası memoize.
- **Kabul:** Pin↔karusel senkron; alan değişince sonuç yenileniyor; mesafe + tarif her kartta; geçişler akıcı.

### Dalga 3 — OPSİYONEL: MapLibre görsel-cila track'i (ölçek/talep tetiklerse)
> Yalnızca Dalga 1-2 ship edildikten ve gerçek bir ihtiyaç (görsel akıcılık talebi / pin yoğunluğu) doğduktan sonra. Bu dalga bir maliyet+risk kararıdır, otomatik değil.
- [ ] Tile sağlayıcı lisans kararı: MapTiler/Stadia ücretli (~$20-30/ay) VEYA self-host (Protomaps/OpenFreeMap risk kabulü).
- [ ] Tek `components/map/OynaMap.tsx` (maplibre-gl + react-map-gl/maplibre); WebGL desteği yoksa **Leaflet/statik görsel fallback** içerir.
- [ ] 5 ekran sırayla OynaMap varyantlarına taşınır (keşif / tekil-pin / pin-seçici); metre-yarıçaplı Circle turf.js/GeoJSON ile yeniden yazılır; divIcon → HTML marker.
- [ ] Kümeleme (30+ pin) burada devreye girer.
- [ ] Leaflet/react-leaflet package.json'dan sökülür.
- **Kabul:** WebGL yoksa uygulama çökmüyor (fallback); rezervasyon-kritik MatchJoin regresyonsuz; tek harita implementasyonu.

### (İsteğe bağlı) Onboarding pin adımı
Dalga 1 veya 2 içinde: OwnerFacilitySettingsModal'daki mevcut pin seçici PartnerOnboarding'e taşınır; ToS-uyumlu geocoder'dan ön-tahmin + sürükle-onayla. Motor-bağımsız; Leaflet'te de yapılabilir.

## 3. Riskler ve önlemler
- **Tile lisans maliyeti:** Dalga 3'e kadar CARTO yerine atıflı OSM/uyumlu raster kullanılır; ücret yalnız MapLibre track'i açılırsa gündeme gelir.
- **WebGL/WebView (yalnız Dalga 3):** OynaMap içinde WebGL kontrolü + Leaflet/statik fallback zorunlu.
- **Nominatim ToS:** kamu sunucusu ana geocoder olarak KULLANILMAZ; LocationIQ atıflı ücretsiz katman veya self-host; istekler debounce'lu ve yalnız onboarding'de.
- **Rezervasyon-kritik MatchJoin:** motor taşıması en sona (Dalga 3) bırakıldı; Dalga 1-2 bu ekrana dokunmaz.

## 4. Tasarım promptu
Görsel dil promptu `docs/master/HARITA_TASARIM_PROMPTU.md`'dedir. Not: Dalga 1-2 Leaflet üzerinde mevcut görsel dille ilerler; tasarım mockup'ları esas olarak Dalga 2 karuseli ve (açılırsa) Dalga 3 MapLibre stili için kullanılır.
