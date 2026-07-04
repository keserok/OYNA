// ============================================================
// OYNA Ters Konum Çözücü (Reverse Region Resolver)
// ------------------------------------------------------------
// Ham GPS {lat,lng} → OynaLocation ("Ordu · Altınordu", accuracy, isCovered).
// Dış API YOK: 81 il merkezi + Ordu ilçe merkezleri + Haversine ile en yakın.
// Elle seçim de aynı OynaLocation'ı üretir → uygulamanın geri kalanı asla
// "GPS mi elle mi?" diye dallanmaz.
// ============================================================

import type { OynaLocation } from '../types';
import { getHaversineDistance } from './geo';
import {
  PROVINCE_CENTERS,
  DISTRICT_CENTERS,
  isCoveredCity,
  provinceCenter,
  districtCenter,
} from '../data/regionCenters';
import { TURKEY_REGIONS } from '../data/turkeyRegions';

const plateOf = (city: string): number | undefined =>
  TURKEY_REGIONS.find((r) => r.city === city)?.plate;

/** Görünen etiket: "İl · İlçe" ya da yalnız "İl". */
export function makeLabel(city: string, district: string | null): string {
  return district ? `${city} · ${district}` : city;
}

/** Verilen koordinata en yakın ili bulur. */
function nearestCity(lat: number, lng: number): string {
  let best = 'Ordu';
  let bestKm = Infinity;
  for (const [city, c] of Object.entries(PROVINCE_CENTERS)) {
    const km = getHaversineDistance(lat, lng, c.lat, c.lng);
    if (km < bestKm) {
      bestKm = km;
      best = city;
    }
  }
  return best;
}

/** Verilen koordinata, o ilin ilçe merkezleri arasından en yakın ilçeyi bulur (varsa). */
function nearestDistrict(city: string, lat: number, lng: number): string | null {
  const districts = DISTRICT_CENTERS[city];
  if (!districts) return null;
  let best: string | null = null;
  let bestKm = Infinity;
  for (const [name, c] of Object.entries(districts)) {
    const km = getHaversineDistance(lat, lng, c.lat, c.lng);
    if (km < bestKm) {
      bestKm = km;
      best = name;
    }
  }
  return best;
}

/**
 * GPS koordinatını OynaLocation'a çevirir.
 * @param detectedAt zaman damgası (ms) — çağıran taraf verir (store/servis), test edilebilirlik için.
 */
export function resolveFromCoords(
  lat: number,
  lng: number,
  detectedAt?: number,
): OynaLocation {
  const city = nearestCity(lat, lng);
  const district = nearestDistrict(city, lat, lng);
  return {
    city,
    cityPlate: plateOf(city),
    district,
    coordinates: { lat, lng },
    source: 'gps',
    accuracy: 'exact', // gerçek GPS noktası elimizde
    label: makeLabel(city, district),
    isCovered: isCoveredCity(city),
    detectedAt,
  };
}

/**
 * Elle seçilen il/ilçeyi OynaLocation'a çevirir.
 * Koordinat: ilçe merkezi > il merkezi (mesafe sıralaması yine de çalışsın diye).
 */
export function makeManualLocation(
  city: string,
  district: string | null,
  detectedAt?: number,
): OynaLocation {
  const coords =
    (district ? districtCenter(city, district) : null) ?? provinceCenter(city) ?? null;
  return {
    city,
    cityPlate: plateOf(city),
    district,
    coordinates: coords,
    source: 'manual',
    accuracy: district && DISTRICT_CENTERS[city]?.[district] ? 'district' : 'city',
    label: makeLabel(city, district),
    isCovered: isCoveredCity(city),
    detectedAt,
  };
}
