# OYNA Harita Master Planı — Airbnb/Uber Standardına Geçiş

> **Karar tarihi:** 2026-07-11 · 10 soruluk analiz turu kullanıcıyla birlikte tamamlandı.
> **İlke:** Pin verisi dürüstlüğü > görsel cila. Yanlış konum göstermektense gizle.
> **Ölçek penceresi:** Canlıda 4 saha / 9 maç — geçiş için ideal an (az veri, az kırılma yüzeyi).

## 0. Mevcut durum bulguları (kanıt)

| # | Bulgu | Yer |
|---|-------|-----|
| 1 | CARTO dark_all raster + `attribution=""` (lisans ihlali, kesilme riski) | 4 dosya: PitchDiscovery, MatchJoin, OwnerFacilitySettingsModal, PitchStudio |
| 2 | Koordinatsız sahalara sahte Ordu-merkez koordinatı basılıyor | `admin-panel/utils/pitchMapper.ts:25` |
| 3 | Onboarding'de pin adımı yok, yalnız serbest metin adres; geocoding yok | `views/PartnerOnboarding.tsx` |
| 4 | "Buradasın" mavi noktası kullanıcı konumuna değil HARİTA MERKEZİNE çiziliyor | `PitchDiscovery.tsx` Circle center={center} |
| 5 | ORDU_CENTER fallback tüketici ekranlarında sürüyor (MatchJoin hariç — düzeltildi) | PitchDiscovery:716,730; ServiceProfile:81 |
| 6 | Pin tap → küçük Leaflet Popup; Airbnb tarzı alt karusel yok | PitchDiscovery MapViewComponent |
| 7 | Harita kaydırma listeyi değiştirmiyor; "bu alanda ara" yok (earthdistance + RPC altyapısı hazır) | `get_nearby_matches` RPC mevcut |
| 8 | divIcon her render'da yeniden üretiliyor; kümeleme yok; setView zıplıyor (flyTo yok) | createPitchPin |
| 9 | Yol tarifi yalnız MatchJoin'de ve yalnız Google; kartlarda mesafe yok (haversine `utils/geo.ts`'te hazır) | MatchJoin popup |
| 10 | 5 kopya harita implementasyonu; her hata 5 kez düzeltiliyor | 5 ekran |

## 1. Alınan kararlar (10 soru → 10 cevap)

1. **Motor:** MapLibre GL vektöre geçilir (MapTiler/Stadia anahtarı + atıf; markaya özel koyu stil).
2. **Pin verisi:** Onboarding'e "haritada işaretle" adımı + Nominatim ön-tahmini + sürükle-onayla; `pitchMapper` sahte varsayılanı kaldırılır; pin'siz saha haritada gösterilmez, admin kuyruğunda "pin eksik" uyarısı.
3. **Keşif UX:** Popup kaldırılır → alt kart karuseli + çift yönlü pin senkronu (flyTo).
4. **Alanda ara:** Kaydırma durunca "Bu alanda ara" chip'i; `get_nearby_pitches` RPC'si eklenir.
5. **Mavi nokta:** Yalnız gerçek `userLocation`'da + accuracy halkası; "konumuma dön" FAB; izin reddinde nokta yok, FAB nazik izin açıklaması gösterir.
6. **Fallback zinciri:** gerçek konum → activeRegion şehir merkezi (regionResolver) → sonuç pinlerine fitBounds. ORDU_CENTER tüketici ekranlarından tamamen çıkar.
7. **Performans:** Geçişle birlikte marker memo + flyTo/easeTo + 30+ pin eşiğinde MapLibre yerleşik kümeleme (fiyat-rozetli küme baloncukları).
8. **Mesafe/tarif:** Haversine mesafe rozeti (kart + karusel); "Yol Tarifi" platform seçici — iOS: Apple/Google, Android: Google deep link. Gerçek ETA API'si lansman sonrası.
9. **Mimari:** Tek `<OynaMap>` bileşeni (stil, marker fabrikası, konum noktası, FAB'lar, hata/iskelet durumları) + üç varyant: `keşif`, `tekil-pin`, `pin-seçici`.
10. **Rollout:** 3 dalga, her dalga ayrı PR + build + canlı test. Önce tasarım promptu ile görsel dil netleştirilir (bkz. §4).

## 2. Üç dalga

### Dalga 1 — Temel (motor + veri dürüstlüğü)
- [ ] MapTiler/Stadia hesabı + anahtar (kullanıcı aksiyonu); anahtar `.env` + Vercel secret.
- [ ] Markaya özel koyu vektör stili (bkz. tasarım promptu §4; stil JSON repoya girer).
- [ ] `components/map/OynaMap.tsx`: maplibre-gl + react-map-gl/maplibre; props: variant, markers, selectedId, onSelect, onMoveEnd, center/bounds; içinde atıf, konum noktası, FAB, iskelet/hata durumu.
- [ ] Pin fabrikası: fiyat baloncuğu (mevcut divIcon görsel dili korunur), seçili durum, küme baloncuğu.
- [ ] `pitchMapper.ts` sahte varsayılan kaldırılır → `coordinates: null` dürüstlüğü (tip güncellemesi dahil).
- [ ] PartnerOnboarding'e pin adımı: OwnerFacilitySettingsModal seçicisi OynaMap `pin-seçici` varyantına taşınır; Nominatim ile adresten ön-tahmin; sahibi sürükleyip onaylar (`latitude/longitude` insert'e eklenir).
- [ ] Admin onay kuyruğunda "pin eksik" rozeti.
- [ ] PitchDiscovery haritası OynaMap'e geçer; mavi nokta gerçek konuma; fallback zinciri (konum → activeRegion → fitBounds); ORDU_CENTER çıkar.
- **Kabul:** Keşif haritası MapLibre'de akıcı; pin'siz saha haritada yok; onboarding pin'le bitiyor; atıf görünür.

### Dalga 2 — Keşif deneyimi
- [ ] Alt kart karuseli (foto/puan/ilçe/mesafe/fiyat/CTA) + çift yönlü pin senkronu; Popup söküldü.
- [ ] "Bu alanda ara" chip'i + `get_nearby_pitches(p_lat,p_lon,p_radius_km)` RPC (earthdistance; yalnız `verification_status='approved'` + koordinatlı sahalar).
- [ ] Mesafe rozetleri (haversine, konum izniyle) kart + karuselde.
- [ ] "Yol Tarifi" platform seçici (iOS bottom-sheet: Apple/Google; Android: Google intent).
- [ ] Kümeleme eşiği aktif (30+ pin), küme tap → easeTo zoom.
- **Kabul:** Pin↔karusel senkron; alan değişince sonuçlar yenileniyor; mesafe ve tarif her kartta.

### Dalga 3 — Yayılma + söküm
- [ ] MatchJoin harita modalı, ServiceProfile, OwnerFacilitySettingsModal, admin PitchStudio → OynaMap varyantlarına taşınır.
- [ ] `AIRBNB_MAP_CSS` kopyaları, kopya ChangeView/Resizer yardımcıları ve `leaflet`/`react-leaflet` bağımlılıkları kaldırılır.
- [ ] ServiceProfile'daki ORDU fallback → fallback zinciri.
- [ ] E2E: /verify ile keşif→pin→karusel→rezervasyon ve lobi→harita akışları.
- **Kabul:** Repoda tek harita implementasyonu; Leaflet package.json'dan silinmiş; tüm ekranlar aynı görsel dilde.

## 3. Riskler ve önlemler
- **MapLibre + Capacitor WebView:** Eski Android WebView'larda WebGL sorunları görülebilir → OynaMap içinde WebGL yoksa statik harita görseli + "haritayı aç" deep link fallback'i.
- **Nominatim kullanım politikası:** 1 istek/sn limit, User-Agent zorunlu → istekler debounce'lu ve yalnız onboarding'de; hacim artarsa MapTiler Geocoding'e geçilir.
- **Anahtar sızıntısı:** MapTiler anahtarı domain kısıtlamalı oluşturulur.
- **Dalga 1 gecikirse:** Dalga 0 olarak yalnız atıf düzeltmesi + pitchMapper dürüstlüğü ayrıca merge edilebilir (yasal riski hemen kapatır).

## 4. Tasarım promptu
Tasarım aracına verilecek prompt `docs/master/HARITA_TASARIM_PROMPTU.md` dosyasındadır; görsel dil onaylanmadan Dalga 1'in stil JSON'u yazılmaz.
