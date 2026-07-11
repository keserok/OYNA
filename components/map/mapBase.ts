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

// ── Tile sağlayıcı + ZORUNLU atıf ─────────────────────────────────────────
// {r} → retina (@2x) karoları otomatik; koyu bazemap markayla uyumlu.
export const OYNA_TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

// OSM + CARTO atıfı YASAL ZORUNLULUK — asla gizlenmez (yalnız markayla stillenir).
export const OYNA_TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO</a>';

// TileLayer'a spread edilecek kalite/akıcılık ayarları (Android/iOS WebView dostu).
export const oynaTileProps = {
  attribution: OYNA_TILE_ATTRIBUTION,
  crossOrigin: true as const,      // tainted-canvas önler (WebView'da tile hataları)
  keepBuffer: 6,                    // hızlı pan'de gri boşluk olmasın
  updateWhenIdle: false,            // pan sırasında karolar canlı yüklensin
  maxZoom: 20,
  maxNativeZoom: 20,
};

// MapContainer'a spread edilecek platform-optimize ayarlar.
// zoomSnap=1 → tam-sayı zoom = karo netliği (kalite önceliği); pinch yine akıcı.
export const oynaMapProps = {
  zoomControl: false,
  attributionControl: true,         // atıf kontrolü AÇIK (yasal)
  zoomSnap: 1,
  zoomDelta: 1,
  wheelDebounceTime: 40,
  wheelPxPerZoomLevel: 100,
  bounceAtZoomLimits: false,
  tap: true,                        // iOS/Android dokunma
  tapTolerance: 18,                 // parmak dokunuşu toleransı (mobil)
  maxZoom: 19,
  preferCanvas: false,              // divIcon pinler DOM ister
};

// ── Ortak temel CSS ───────────────────────────────────────────────────────
// Atıf GÖRÜNÜR (yalnız markayla stillenir), zoom kontrolü gizli, ve pin
// sabitliğinin kalbi: zoom animasyonu sırasında TÜM marker geçişleri kapatılır
// → pinler zoom'da kaymaz/titremez.
export const OYNA_MAP_CSS = `
  .leaflet-container { background: #060B12 !important; font-family: inherit; -webkit-tap-highlight-color: transparent; }
  .leaflet-tile-pane { filter: brightness(0.92) saturate(0.62); }
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
  /* Karusel: scrollbar gizle (WebKit dahil) */
  .oyna-map-carousel { scrollbar-width: none; -ms-overflow-style: none; }
  .oyna-map-carousel::-webkit-scrollbar { display: none; }
`;

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

/**
 * Fiyat baloncuklu saha pini. Anchor koordinata sabittir (zoom'da kaymaz).
 * Sonuç L.DivIcon; çağıran taraf (id, isSelected, fiyat) değişmedikçe
 * yeniden üretmemeli (memoize) — marker DOM'unun boşuna rebuild olmaması için.
 */
export const createPitchPin = (pitch: Pitch, isSelected: boolean): L.DivIcon => {
  const priceLabel = pitch.totalPrice ? `~${pitch.totalPrice}₺` : (pitch.name.split(' ')[0] || 'Saha');
  const originalLabel = pitch.originalPrice
    ? `<span style="text-decoration:line-through;color:#888;font-size:8px;margin-right:2px;">₺${pitch.originalPrice}</span>`
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
