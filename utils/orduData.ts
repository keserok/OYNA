// Tek kanonik Ordu lokasyon kaynağı (SSOT).
// Lansman şehri Ordu; harita merkezi, ilçe koordinatları ve fallback buradan gelir.
// İstanbul'a özgü hiçbir sabit uygulamada kalmamalıdır.

export interface LatLng {
  lat: number;
  lng: number;
}

/** Ordu il merkezi (Altınordu meydanı civarı). */
export const ORDU_CENTER: LatLng = { lat: 40.9839, lng: 37.8764 };

/** Harita başlangıç zoom seviyesi (il merkezi görünümü). */
export const ORDU_DEFAULT_ZOOM = 12;

/** Konum reddedilirse / bilinmiyorsa kullanılacak merkez. */
export const FALLBACK_CENTER: LatLng = ORDU_CENTER;

/** Ordu ilçeleri ve yaklaşık merkez koordinatları. Lansman odağı şehir merkezi + sahil hattı. */
export const ORDU_DISTRICTS: Record<string, [number, number]> = {
  'Altınordu': [40.9839, 37.8764], // İl merkezi
  'Ünye': [41.1296, 37.2855],
  'Fatsa': [41.0297, 37.5031],
  'Perşembe': [41.0586, 37.7708],
  'Gülyalı': [40.9347, 38.0269],
  'Kabadüz': [40.8458, 37.8839],
  'Ulubey': [40.8722, 37.7575],
  'Gölköy': [40.6878, 37.6189],
  'Kumru': [40.8744, 37.2497],
  'Korgan': [40.8233, 37.3414],
};

/** Keşif/filtre için ilçe adı listesi (merkez en başta). */
export const ORDU_DISTRICT_NAMES: string[] = Object.keys(ORDU_DISTRICTS);

/** Şehir görünen adı. */
export const LAUNCH_CITY = 'Ordu';
