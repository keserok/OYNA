// ============================================================
// Türkiye il merkez koordinatları (81 il) + kapsama tablosu
// ------------------------------------------------------------
// Amaç: GPS'ten gelen ham {lat,lng} değerini "hangi il/ilçe?" bilgisine
// ÜCRETSİZ ve internetsiz çevirebilmek (utils/regionResolver.ts kullanır)
// ve haritayı doğru merkeze oturtabilmek.
//
// İlçe merkezleri kademeli doldurulur: şimdilik yalnız Ordu (lansman şehri).
// İl merkezi koordinatları yaklaşık (il merkez ilçesi) değerlerdir; keşif
// ölçeğinde (il/ilçe eşleme + harita merkezleme) fazlasıyla yeterlidir.
// ============================================================

import { ORDU_DISTRICTS } from '../utils/orduData';

export interface LatLng {
  lat: number;
  lng: number;
}

/** 81 il → yaklaşık il merkezi koordinatı. Anahtarlar turkeyRegions ile birebir aynıdır. */
export const PROVINCE_CENTERS: Record<string, LatLng> = {
  'Adana': { lat: 37.0000, lng: 35.3213 },
  'Adıyaman': { lat: 37.7648, lng: 38.2786 },
  'Afyonkarahisar': { lat: 38.7638, lng: 30.5403 },
  'Ağrı': { lat: 39.7191, lng: 43.0503 },
  'Aksaray': { lat: 38.3687, lng: 34.0370 },
  'Amasya': { lat: 40.6499, lng: 35.8353 },
  'Ankara': { lat: 39.9208, lng: 32.8541 },
  'Antalya': { lat: 36.8969, lng: 30.7133 },
  'Ardahan': { lat: 41.1105, lng: 42.7022 },
  'Artvin': { lat: 41.1828, lng: 41.8183 },
  'Aydın': { lat: 37.8560, lng: 27.8416 },
  'Balıkesir': { lat: 39.6484, lng: 27.8826 },
  'Bartın': { lat: 41.6344, lng: 32.3375 },
  'Batman': { lat: 37.8812, lng: 41.1351 },
  'Bayburt': { lat: 40.2552, lng: 40.2249 },
  'Bilecik': { lat: 40.1451, lng: 29.9799 },
  'Bingöl': { lat: 38.8853, lng: 40.4966 },
  'Bitlis': { lat: 38.4006, lng: 42.1095 },
  'Bolu': { lat: 40.7392, lng: 31.6089 },
  'Burdur': { lat: 37.7203, lng: 30.2908 },
  'Bursa': { lat: 40.1826, lng: 29.0665 },
  'Çanakkale': { lat: 40.1553, lng: 26.4142 },
  'Çankırı': { lat: 40.6013, lng: 33.6134 },
  'Çorum': { lat: 40.5506, lng: 34.9556 },
  'Denizli': { lat: 37.7765, lng: 29.0864 },
  'Diyarbakır': { lat: 37.9144, lng: 40.2306 },
  'Düzce': { lat: 40.8438, lng: 31.1565 },
  'Edirne': { lat: 41.6771, lng: 26.5557 },
  'Elazığ': { lat: 38.6810, lng: 39.2264 },
  'Erzincan': { lat: 39.7500, lng: 39.5000 },
  'Erzurum': { lat: 39.9000, lng: 41.2700 },
  'Eskişehir': { lat: 39.7767, lng: 30.5206 },
  'Gaziantep': { lat: 37.0662, lng: 37.3833 },
  'Giresun': { lat: 40.9128, lng: 38.3895 },
  'Gümüşhane': { lat: 40.4603, lng: 39.4814 },
  'Hakkari': { lat: 37.5744, lng: 43.7408 },
  'Hatay': { lat: 36.2025, lng: 36.1606 },
  'Iğdır': { lat: 39.9237, lng: 44.0450 },
  'Isparta': { lat: 37.7648, lng: 30.5566 },
  'İstanbul': { lat: 41.0082, lng: 28.9784 },
  'İzmir': { lat: 38.4237, lng: 27.1428 },
  'Kahramanmaraş': { lat: 37.5753, lng: 36.9228 },
  'Karabük': { lat: 41.2061, lng: 32.6204 },
  'Karaman': { lat: 37.1759, lng: 33.2287 },
  'Kars': { lat: 40.6013, lng: 43.0975 },
  'Kastamonu': { lat: 41.3887, lng: 33.7827 },
  'Kayseri': { lat: 38.7312, lng: 35.4787 },
  'Kırıkkale': { lat: 39.8468, lng: 33.5153 },
  'Kırklareli': { lat: 41.7333, lng: 27.2167 },
  'Kırşehir': { lat: 39.1425, lng: 34.1709 },
  'Kilis': { lat: 36.7184, lng: 37.1212 },
  'Kocaeli': { lat: 40.7654, lng: 29.9408 },
  'Konya': { lat: 37.8746, lng: 32.4932 },
  'Kütahya': { lat: 39.4242, lng: 29.9833 },
  'Malatya': { lat: 38.3552, lng: 38.3095 },
  'Manisa': { lat: 38.6191, lng: 27.4289 },
  'Mardin': { lat: 37.3212, lng: 40.7245 },
  'Mersin': { lat: 36.8121, lng: 34.6415 },
  'Muğla': { lat: 37.2153, lng: 28.3636 },
  'Muş': { lat: 38.7432, lng: 41.5064 },
  'Nevşehir': { lat: 38.6939, lng: 34.6857 },
  'Niğde': { lat: 37.9667, lng: 34.6833 },
  'Ordu': { lat: 40.9839, lng: 37.8764 },
  'Osmaniye': { lat: 37.0682, lng: 36.2614 },
  'Rize': { lat: 41.0201, lng: 40.5234 },
  'Sakarya': { lat: 40.7569, lng: 30.3781 },
  'Samsun': { lat: 41.2928, lng: 36.3313 },
  'Siirt': { lat: 37.9333, lng: 41.9500 },
  'Sinop': { lat: 42.0231, lng: 35.1531 },
  'Sivas': { lat: 39.7477, lng: 37.0179 },
  'Şanlıurfa': { lat: 37.1591, lng: 38.7969 },
  'Şırnak': { lat: 37.5164, lng: 42.4611 },
  'Tekirdağ': { lat: 40.9833, lng: 27.5167 },
  'Tokat': { lat: 40.3167, lng: 36.5500 },
  'Trabzon': { lat: 41.0015, lng: 39.7178 },
  'Tunceli': { lat: 39.1079, lng: 39.5401 },
  'Uşak': { lat: 38.6823, lng: 29.4082 },
  'Van': { lat: 38.4891, lng: 43.4089 },
  'Yalova': { lat: 40.6500, lng: 29.2667 },
  'Yozgat': { lat: 39.8181, lng: 34.8147 },
  'Zonguldak': { lat: 41.4564, lng: 31.7987 },
};

/**
 * Şu an OYNA'nın "aktif" (gerçek verisi olan) illeri.
 * Yeni bir şehri açmak = buraya il adını + DISTRICT_CENTERS'a ilçe merkezlerini eklemek.
 */
export const COVERED_CITIES = new Set<string>(['Ordu']);

/** İl → ilçe merkez koordinatları (kademeli). Şimdilik yalnız Ordu. */
export const DISTRICT_CENTERS: Record<string, Record<string, LatLng>> = {
  Ordu: Object.fromEntries(
    Object.entries(ORDU_DISTRICTS).map(([name, [lat, lng]]) => [name, { lat, lng }]),
  ),
};

/** İl aktif (verisi var) mı? */
export const isCoveredCity = (city: string): boolean => COVERED_CITIES.has(city);

/** İl merkez koordinatı (yoksa null). */
export const provinceCenter = (city: string): LatLng | null => PROVINCE_CENTERS[city] ?? null;

/** İlçe merkez koordinatı (yoksa null → il merkezine düşülür). */
export const districtCenter = (city: string, district: string): LatLng | null =>
  DISTRICT_CENTERS[city]?.[district] ?? null;
