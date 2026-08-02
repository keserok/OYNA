// ════════════════════════════════════════════════════════════════════════
// OYNA HARİTA TEMELİ — TEK KAYNAK (SSOT)
// ------------------------------------------------------------------------
// Tüm Leaflet haritaları (keşif, lobi, owner, admin) BU modülden beslenir:
// tile sağlayıcı + zorunlu atıf, kalite/akıcılık ayarları, Android/iOS
// WebView'da mükemmel çalışma parametreleri, ve EN ÖNEMLİSİ pin sabitliği
// (zoom sırasında pinlerin kaymasını önleyen CSS + doğru anchor'lı pin
// fabrikası). Amaç: pinler koordinata ÇİVİLENİR, zoom/pan'de titremez.
// ════════════════════════════════════════════════════════════════════════
import L from 'leaflet';
import type { Pitch } from '../../types';
import { formatTRYShort } from '../../utils/formatTRY';
import { perfTierFrom, readDeviceSignals } from '../../views/studio/perf';

// "Leaflet" ön-ekini TÜM haritalardan kaldır — bu kütüphane kredisidir, yasal
// zorunluluk değildir. Yasal OSM+CARTO veri atıfı görünür kalır. Tek yerden,
// tüm ekranlar için (mapBase her harita ekranınca import edilir).
L.Control.Attribution.prototype.options.prefix = false;

// ════════════════════════════════════════════════════════════════════════════
// KARO BELLEĞİ — zayıf telefonlarda kapanmanın en güçlü adaylarından biri
// ----------------------------------------------------------------------------
// Harita karoları (tile) ekranda birer <img> düğümüdür ve tarayıcı bunları
// AÇILMIŞ (decode edilmiş) hâlde bellekte tutar. Maliyet ham dosya boyutu
// değildir; açılmış bir görüntü "en × boy × 4 bayt" yer kaplar:
//
//   • normal karo   256×256 → 262.144 bayt  (~0,26 MB)
//   • retina karo   512×512 → 1.048.576 bayt (~1,05 MB)   ← DÖRT KAT
//
// Kaç karo bellekte durur? Leaflet, görünen alanın `keepBuffer` kadar dışındaki
// karoları da atmadan saklar. 360×640 bir ekranda görünen karo ~12'dir; ama
// kullanıcı haritayı gezdirdikçe saklanan karo sayısı hızla büyür:
//
//   keepBuffer = 8 → en kötü hâlde (3+16) × (4+16) = 380 karo
//                    380 × 1,05 MB ≈ 400 MB   ← 4 GB'lık telefon için ölümcül
//   keepBuffer = 1 → en kötü hâlde  (3+2) × (4+2) =  30 karo
//                     30 × 0,26 MB ≈ 8 MB
//
// Yani zayıf cihazda YALNIZ harita yüzünden yüzlerce MB tüketilebiliyordu.
// Android bellek daralınca en çok yer tutan uygulamayı öldürür — kullanıcının
// gördüğü şey "uygulama kendi kendine kapandı" olur.
//
// KARAR: ayrım cihaza göre yapılır, herkese aynı ceza kesilmez.
//   • Güçlü telefon → eskisi gibi: retina karolar + geniş tampon (kalite)
//   • Zayıf telefon → normal karolar + dar tampon (ayakta kalmak)
// Zayıf cihazda harita bir tık daha az keskin görünür; buna karşılık bellek
// tüketimi ~50 kat düşer.
// ════════════════════════════════════════════════════════════════════════════

/**
 * Cihaz zayıf mı? Kararı `views/studio/perf.ts` verir (tek kaynak, test edilmiş).
 * Kurulum beklenmeden doğrudan tarayıcı sinyallerinden okunur: bu dosya tembel
 * yüklenen ekranlarca çekiliyor ve kurulum sırasına bağlı kalmak istemiyoruz.
 */
const zayifCihaz: boolean = (() => {
  try {
    const azHareket =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false;
    return perfTierFrom(readDeviceSignals(azHareket)) === 'lite';
  } catch {
    return false; // sinyal okunamadı → güçlü varsay (iyi telefon kalite kaybetmesin)
  }
})();

// ── Tile sağlayıcı + ZORUNLU atıf ─────────────────────────────────────────
// {r} → retina (@2x) karolar. Zayıf cihazda BİLEREK yok: aynı karo dörtte bir
// bellek tutar (yukarıdaki hesap).
export const OYNA_TILE_URL = zayifCihaz
  ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'
  : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

// OSM + CARTO atıfı YASAL ZORUNLULUK — asla gizlenmez (yalnız markayla stillenir).
export const OYNA_TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO</a>';

// TileLayer'a spread edilecek kalite/akıcılık ayarları (Android/iOS WebView dostu).
export const oynaTileProps = {
  attribution: OYNA_TILE_ATTRIBUTION,
  crossOrigin: true as const,      // tainted-canvas önler (WebView'da tile hataları)
  // Görünen alanın kaç karo dışına kadar saklanacağı. 8, pan sırasında gri
  // boşluk görünmesin diye seçilmişti; bedeli yukarıdaki bellek hesabıdır.
  // Zayıf cihazda 1'e indirilir (Leaflet'in kendi varsayılanı 2). Güçlü
  // cihazda 8 KORUNUR — orada bellek sıkıntısı yok, akıcılık kazancı gerçek.
  keepBuffer: zayifCihaz ? 1 : 8,
  // Zayıf cihazda pan BİTENE kadar yeni karo isteme: gezinme sırasında yüzlerce
  // karo açıp hemen atmak hem belleği hem işlemciyi boşuna yorar.
  updateWhenIdle: zayifCihaz,
  updateWhenZooming: false,         // zoom animasyonu bitene kadar karo yükleme (jank↓)
  maxZoom: 20,
  maxNativeZoom: 20,
};

/**
 * Dokunmatik mi? (telefon/tablet) — fare varsa `false`.
 * Harita parmak paylaşımı YALNIZ dokunmatikte devreye girer; admin panelinde
 * ve masaüstü tarayıcıda fare ile sürükleme aynen çalışmaya devam eder.
 */
const isCoarsePointer =
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(pointer: coarse)').matches
    : false;

// MapContainer'a spread edilecek platform-optimize ayarlar.
// zoomSnap=1 → tam-sayı zoom = karo netliği (kalite önceliği); pinch yine akıcı.
export const oynaMapProps = {
  zoomControl: false,
  attributionControl: true,         // atıf kontrolü AÇIK (yasal) — "Leaflet" ön-eki kapalı
  zoomSnap: 1,
  zoomDelta: 1,
  wheelDebounceTime: 40,
  wheelPxPerZoomLevel: 100,
  bounceAtZoomLimits: false,
  fadeAnimation: false,             // karoların TEK TEK "fade" ile gelmesini kapatır
                                    // → "parça parça akma" biter, karolar anında oturur
  tap: true,                        // iOS/Android dokunma
  tapTolerance: 18,                 // parmak dokunuşu toleransı (mobil)
  maxZoom: 19,
  preferCanvas: false,              // divIcon pinler DOM ister

  // ── PARMAK PAYLAŞIMI (harita mı sayfa mı kayacak?) ─────────────────────
  // Sorun: harita bir sayfanın ORTASINDA büyük bir alan kaplıyor. Harita tek
  // parmağı kendine alırsa kullanıcı o bölgeden sayfayı kaydıramaz — yalnız
  // haritanın sağında/solunda kalan ince kenarlar çalışır.
  //
  // Çözüm (Google Haritalar'ın gömülü haritada yaptığının aynısı):
  //   • TEK parmak  → sayfa kayar (harita karışmaz)
  //   • İKİ parmak  → harita gezinir ve yakınlaşır
  //
  // `dragging:false` bunu TEK BAŞINA sağlar: Leaflet sürükleme kapalıyken
  // haritanın kabına `touch-action: pan-x pan-y` yazar (leaflet.css), yani
  // tek parmağı tarayıcıya bırakır; iki parmaklı pinch işleyicisi ise hem
  // yakınlaştırır HEM kaydırır. Kullanıcıya ipucu OYNA_MAP_CSS'teki katmanla
  // gösterilir (utils/scrollSystem.ts tetikler).
  //
  // Fare varken (admin paneli, masaüstü) sürükleme AÇIK kalır — orada
  // paylaşılacak bir kaydırma sorunu yok.
  dragging: !isCoarsePointer,
  touchZoom: true,
};

// ── Ortak temel CSS ───────────────────────────────────────────────────────
// Atıf GÖRÜNÜR (yalnız markayla stillenir), zoom kontrolü gizli, ve pin
// sabitliğinin kalbi: zoom animasyonu sırasında TÜM marker geçişleri kapatılır
// → pinler zoom'da kaymaz/titremez.
export const OYNA_MAP_CSS = `
  .leaflet-container { background: #060B12 !important; font-family: inherit; -webkit-tap-highlight-color: transparent; }
  /* NOT: tile-pane'e CSS 'filter' UYGULANMAZ — hareket eden katmana filter,
     mobil WebView'da her karede yeniden boyama (jank) demektir. dark_all
     basemap zaten koyu; ekstra filtre gereksiz ve pahalıydı → kaldırıldı.
     Karo geçiş animasyonu da kapatıldı (anında otursun, akıcı hissetsin). */
  .leaflet-tile { transition: none !important; }
  .leaflet-fade-anim .leaflet-tile { will-change: auto; }
  .leaflet-control-zoom { display: none !important; }
  .leaflet-popup-content-wrapper { background: transparent !important; padding: 0 !important; box-shadow: none !important; border: none !important; }
  .leaflet-popup-tip-container { display: none !important; }
  .leaflet-popup-content { margin: 0 !important; }
  /* Atıf: yasal olarak görünür, markayla uyumlu ve göze batmadan */
  .leaflet-control-attribution {
    background: rgba(10,14,20,0.55) !important;
    color: rgba(255,255,255,0.38) !important;
    font-size: 9px !important; line-height: 1.4 !important;
    padding: 2px 6px !important; border-radius: 8px 0 0 0 !important;
    backdrop-filter: blur(4px);
  }
  .leaflet-control-attribution a { color: rgba(57,255,20,0.55) !important; text-decoration: none !important; }
  /* PIN SABİTLİĞİ: zoom animasyonunda marker geçişleri donar → kayma yok */
  .leaflet-zoom-anim .leaflet-marker-icon,
  .leaflet-zoom-anim .oyna-pin-root,
  .leaflet-zoom-anim .oyna-pin-root * { transition: none !important; }
  /* SÜRÜKLENEBİLİR PİN: harita tek parmağı sayfaya bıraktığı için kabın
     touch-action'ı 'pan-x pan-y'. Pin bundan MUAF olmalı, yoksa pini
     sürüklemeye çalışan parmak sayfayı kaydırır ve pin yerinden oynamaz. */
  .leaflet-marker-draggable { touch-action: none !important; }
  /* İKİ PARMAK İPUCU: tek parmakla haritayı gezdirmeye çalışan kullanıcıya
     ne yapması gerektiğini söyler. Sınıfı utils/scrollSystem.ts ekler/siler;
     burada yalnız görünüşü tarif edilir (DOM'a düğüm eklenmez). */
  .leaflet-container::after {
    content: 'Haritayı gezdirmek için iki parmak kullan';
    position: absolute; inset: 0; z-index: 900;
    display: grid; place-items: center; text-align: center;
    padding: 0 24px;
    font-family: inherit; font-size: 12px; font-weight: 800; line-height: 1.4;
    color: #fff; background: rgba(6,11,18,0.62);
    opacity: 0; pointer-events: none;
    transition: opacity .18s ease;
  }
  .leaflet-container.oyna-hint-on::after { opacity: 1; }
  /* Fare kullanan cihazda tek parmak sorunu yok — ipucu hiç çıkmasın. */
  @media (pointer: fine) { .leaflet-container::after { content: none; } }
  /* Karusel: scrollbar gizle (WebKit dahil) */
  .oyna-map-carousel { scrollbar-width: none; -ms-overflow-style: none; }
  .oyna-map-carousel::-webkit-scrollbar { display: none; }
`;

// ════════════════════════════════════════════════════════════════════════
// KEŞİF HARİTASI (PitchDiscovery) — pin katmanı
// ------------------------------------------------------------------------
// Burası bir zamanlar MapLibre (vektör/WebGL) kullanıyordu. Uygulamada İKİ
// ayrı harita motoru birden taşınıyordu: MapLibre yalnız bu tek ekranda,
// Leaflet ise diğer beş ekranda. Bunun üç bedeli vardı:
//   1. Telefon, hiç açmayabileceği bir ekran için ~800 KB fazladan kod
//      indiriyor ve ayrıştırıyordu.
//   2. MapLibre çizim için WebGL (ekran kartı) zorunlu kılar. Belleği dar
//      Android'lerde WebGL bağlamı en önce düşürülen kaynaktır; bu, "uygulama
//      kendini kapattı" şikâyetini besleyen etkenlerden biriydi. Kart WebGL'i
//      hiç veremediğinde ise ekran "harita bu cihazda desteklenmiyor" diyordu.
//   3. Aynı işin iki ayrı yerde iki ayrı biçimde bakımı gerekiyordu.
//
// Kullanıcı kararıyla harita motoru TEKE indirildi: Leaflet. Leaflet raster
// karo çizer, WebGL istemez — yani en zayıf telefonda da harita AÇILIR.
// Görünüm bilinçli olarak korunmuştur: aynı koyu bazemap, aynı pin biçimi,
// aynı seçim davranışı ve aynı zoom'a bağlı ölçekleme.
//
// PİN SABİTLİĞİNİN KALBİ: divIcon 0×0 boyutlu ve anchor [0,0] verilir; yani
// pin kökünün orijini TAM koordinata oturur. Görünen parçalar (balon, tip,
// nokta) o orijine göre `position:absolute` + `transform` ile yerleşir.
// Böylece zoom/pan sırasında Leaflet yalnız 0×0 kökü taşır, pin koordinata
// çivili kalır. Bu desen dosyanın altındaki `OYNA_PITCH_PIN_CSS` ile aynıdır
// ve uygulamada zaten kanıtlanmıştır.
// ════════════════════════════════════════════════════════════════════════

/**
 * Pin etiketleri saha adı gibi VERİTABANINDAN gelen metinler taşır ve bu
 * metin `innerHTML` ile yazılır. Kaçırılmazsa bir saha adındaki `<` işareti
 * pini bozar (kötü niyetli hâlde daha fazlasını yapar). Tek satırlık bekçi.
 */
const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string),
  );

/** Kullanıcının gerçek konumu (mavi nokta + nabız). Kullanan iki CSS bloğunda
 *  da AYNI olsun diye tek yerde durur — kopyalanırsa biri güncellenmeden kalır. */
export const OYNA_USER_LOCATION_CSS = `
  /* Kullanıcı konumu (mavi nokta) — Uber tarzı, gerçek konumda */
  .oyna-userloc-root { position: absolute; width: 0; height: 0; }
  .oyna-userloc-dot {
    position: absolute; left: 0; top: 0; transform: translate(-50%, -50%);
    width: 16px; height: 16px; border-radius: 50%;
    background: #00D8FF; border: 2.5px solid #fff;
    box-shadow: 0 0 0 2px rgba(0,216,255,0.35), 0 2px 8px rgba(0,0,0,0.5);
  }
  .oyna-userloc-pulse {
    position: absolute; left: 0; top: 0; transform: translate(-50%, -50%);
    width: 16px; height: 16px; border-radius: 50%;
    background: rgba(0,216,255,0.4);
    animation: oynaUserPulse 2s ease-out infinite;
  }
  @keyframes oynaUserPulse {
    0% { width: 16px; height: 16px; opacity: 0.7; }
    100% { width: 64px; height: 64px; opacity: 0; }
  }
`;

// Keşif haritası CSS'i: pin biçimleri MapLibre sürümüyle görsel olarak
// birebir aynı; yalnız konumlandırma Leaflet'in 0×0 anchor desenine göre
// yeniden kuruldu. `--oyna-bubble-scale` / `--oyna-dot-scale` değişkenlerini
// zoom sırasında JS set eder (React render'ı olmadan → kaydırmada jank yok).
export const OYNA_DISCOVERY_CSS = `
  ${OYNA_USER_LOCATION_CSS}
  /* ── Ad balonu pini — yakın zoom. Tip (nub) TAM koordinatta durur. ── */
  .oyna-dpin { position: absolute; width: 0; height: 0; cursor: pointer; }
  .oyna-dpin .pin-bubble {
    position: absolute; left: 0; bottom: 11px;
    transform: translateX(-50%) scale(var(--oyna-bubble-scale, 1));
    transform-origin: 50% 100%;
    display: flex; align-items: center; gap: 4px;
    background: #0D111A; border: 1.5px solid rgba(57,255,20,0.35);
    color: #39FF14; font-size: 10px; font-weight: 900; font-family: inherit; line-height: 1;
    padding: 6px 10px; border-radius: 100px; white-space: nowrap;
    box-shadow: 0 4px 22px rgba(0,0,0,0.7), 0 0 12px rgba(57,255,20,0.15);
    transition: background-color .18s ease, color .18s ease, border-color .18s ease, box-shadow .18s ease;
    animation: oynaPinFade .22s ease-out;
  }
  .oyna-dpin .pin-bubble.selected {
    background: #39FF14; color: #000; border-color: #39FF14;
    box-shadow: 0 4px 24px rgba(0,0,0,0.7), 0 0 26px rgba(57,255,20,0.6);
    transform: translateX(-50%) scale(calc(var(--oyna-bubble-scale, 1) * 1.14));
  }
  /* Saha adı: uzun adlar pini şişirmesin — tek satır, kısaltmalı */
  .oyna-dpin .pin-bubble .pin-name {
    max-width: 132px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .oyna-dpin .pin-nub {
    position: absolute; left: 0; bottom: 0;
    width: 9px; height: 9px; border-radius: 50%; background: #39FF14;
    transform: translate(-50%, 50%);
    box-shadow: 0 0 10px rgba(57,255,20,0.85);
    transition: background-color .18s ease, box-shadow .18s ease;
    animation: oynaPinFade .22s ease-out;
  }
  .oyna-dpin .pin-nub.selected { background: #000; box-shadow: 0 0 15px rgba(57,255,20,1); }
  .oyna-dpin .pin-flash {
    position: absolute; left: 0; bottom: 34px; transform: translateX(-50%);
    background: #FF3B30; color: #fff; font-size: 9px; font-weight: 900;
    padding: 2px 6px; border-radius: 100px; white-space: nowrap;
    box-shadow: 0 2px 8px rgba(255,59,48,0.5);
  }
  /* ── Nokta pini — uzak zoom: ad gizli, yalnız konum noktası. Dokunma alanı
     sabit 30px (parmak dostu), koordinatta ortalı; görünen çekirdek
     --oyna-dot-scale ile küçülür. ── */
  .oyna-ddot {
    position: absolute; left: 0; top: 0;
    width: 30px; height: 30px; margin: -15px 0 0 -15px;
    display: flex; align-items: center; justify-content: center; cursor: pointer;
  }
  .oyna-ddot .dot-core {
    width: 13px; height: 13px; border-radius: 50%;
    background: #39FF14; border: 2px solid rgba(6,11,18,0.95);
    box-shadow: 0 0 9px rgba(57,255,20,0.65), 0 1px 4px rgba(0,0,0,0.5);
    transform: scale(var(--oyna-dot-scale, 1));
    transition: box-shadow .15s ease;
    animation: oynaPinFade .22s ease-out;
  }
  /* IP-09: seçili pin eskiden saf sarıydı; seçilmemiş yeşille kontrastı
     1.26:1 — yani seçim gözle ayırt edilemiyordu. Artık beyaz VE %35 büyük:
     işaret yalnız renge değil, boyuta da yaslanıyor. */
  .oyna-ddot.selected .dot-core {
    background: #FFFFFF;
    box-shadow: 0 0 0 4px rgba(255,255,255,0.30), 0 0 14px rgba(255,255,255,0.85);
    transform: scale(calc(var(--oyna-dot-scale, 1) * 1.35));
  }
  @keyframes oynaPinFade { from { opacity: 0; } to { opacity: 1; } }
  .oyna-map-carousel { scrollbar-width: none; -ms-overflow-style: none; }
  .oyna-map-carousel::-webkit-scrollbar { display: none; }
`;

/**
 * Keşif haritası ad pini (yakın zoom). Saha adını taşır; tipi koordinata çivili.
 * `mapLabel` admin tarafından verilmişse o kullanılır, yoksa tam ad.
 */
export const createDiscoveryNamePin = (pitch: Pitch, isSelected: boolean): L.DivIcon => {
  const nameLabel = escapeHtml(pitch.mapLabel || pitch.name || 'Saha');
  const sel = isSelected ? ' selected' : '';
  const flash = pitch.flashDiscount
    ? `<div class="pin-flash">🔥 %${escapeHtml(String(pitch.flashDiscount))}</div>`
    : '';
  const dotFill = isSelected ? '#000' : '#39FF14';
  return L.divIcon({
    className: '',
    html:
      `<div class="oyna-dpin">${flash}` +
      `<div class="pin-bubble${sel}">` +
      `<svg width="8" height="8" viewBox="0 0 8 8" fill="${dotFill}"><circle cx="4" cy="4" r="4"/></svg>` +
      `<span class="pin-name">${nameLabel}</span></div>` +
      `<div class="pin-nub${sel}"></div></div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
};

/** Keşif haritası nokta pini (uzak zoom). Ad gizli; dokununca haritayı yakınlaştırır. */
export const createDiscoveryDotPin = (isSelected: boolean): L.DivIcon =>
  L.divIcon({
    className: '',
    html: `<div class="oyna-ddot${isSelected ? ' selected' : ''}"><div class="dot-core"></div></div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });

// ── Fiyat baloncuklu saha pini (SABİT anchor) ─────────────────────────────
// Anchor [0,0] + 0×0 kök: kökün orijini TAM koordinata oturur; nub (tip)
// orijinde ortalanır, baloncuk tipin üstünde durur. Böylece görsel tip her
// zoom seviyesinde koordinatta sabit kalır (transform ile "sahte" konumlama yok).
export const OYNA_PITCH_PIN_CSS = `
  .oyna-pin-root { position: absolute; width: 0; height: 0; cursor: pointer; }
  .oyna-pin-root .pin-bubble {
    position: absolute; left: 0; bottom: 11px;
    transform: translateX(-50%);
    display: flex; align-items: center; gap: 4px;
    background: #0D111A;
    border: 1.5px solid rgba(57,255,20,0.35);
    color: #39FF14;
    font-size: 10px; font-weight: 900; font-family: inherit; line-height: 1;
    padding: 6px 10px; border-radius: 100px;
    white-space: nowrap;
    box-shadow: 0 4px 22px rgba(0,0,0,0.7), 0 0 12px rgba(57,255,20,0.15);
    transition: background-color .18s ease, color .18s ease, border-color .18s ease, box-shadow .18s ease, transform .18s ease;
  }
  .oyna-pin-root .pin-bubble.selected {
    background: #39FF14; color: #000; border-color: #39FF14;
    box-shadow: 0 4px 24px rgba(0,0,0,0.7), 0 0 26px rgba(57,255,20,0.6);
    transform: translateX(-50%) scale(1.14);
    z-index: 500;
  }
  .oyna-pin-root .pin-nub {
    position: absolute; left: 0; bottom: 0;
    width: 9px; height: 9px; border-radius: 50%;
    background: #39FF14;
    transform: translate(-50%, 50%);
    box-shadow: 0 0 10px rgba(57,255,20,0.85);
    transition: background-color .18s ease, box-shadow .18s ease;
  }
  .oyna-pin-root .pin-nub.selected { background: #000; box-shadow: 0 0 15px rgba(57,255,20,1); }
  .oyna-pin-root .pin-flash {
    position: absolute; left: 0; bottom: 34px; transform: translateX(-50%);
    background: #FF3B30; color: #fff; font-size: 9px; font-weight: 900;
    padding: 2px 6px; border-radius: 100px; white-space: nowrap;
    box-shadow: 0 2px 8px rgba(255,59,48,0.5);
  }
  ${OYNA_USER_LOCATION_CSS}
`;

/**
 * Fiyat baloncuklu saha pini. Anchor koordinata sabittir (zoom'da kaymaz).
 * Sonuç L.DivIcon; çağıran taraf (id, isSelected, fiyat) değişmedikçe
 * yeniden üretmemeli (memoize) — marker DOM'unun boşuna rebuild olmaması için.
 */
export const createPitchPin = (pitch: Pitch, isSelected: boolean): L.DivIcon => {
  const priceLabel = pitch.totalPrice ? `~${formatTRYShort(pitch.totalPrice)}` : (pitch.name.split(' ')[0] || 'Saha');
  const originalLabel = pitch.originalPrice
    ? `<span style="text-decoration:line-through;color:#888;font-size:8px;margin-right:2px;">${formatTRYShort(pitch.originalPrice)}</span>`
    : '';
  const flash = pitch.flashDiscount
    ? `<div class="pin-flash">🔥 %${pitch.flashDiscount}</div>`
    : '';
  const sel = isSelected ? ' selected' : '';
  return L.divIcon({
    className: '',
    html: `<div class="oyna-pin-root">${flash}<div class="pin-bubble${sel}"><svg width="8" height="8" viewBox="0 0 8 8" fill="${isSelected ? '#000' : '#39FF14'}"><circle cx="4" cy="4" r="4"/></svg>${originalLabel}${priceLabel}</div><div class="pin-nub${sel}"></div></div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
};

/** Kullanıcının gerçek konumu için mavi nokta (nabız halkalı). */
export const createUserLocationIcon = (): L.DivIcon =>
  L.divIcon({
    className: '',
    html: `<div class="oyna-userloc-root"><div class="oyna-userloc-pulse"></div><div class="oyna-userloc-dot"></div></div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
