// ============================================================================
// VİTRİN FİLTRE MOTORU — saf (framework'süz) fonksiyonlar
// ----------------------------------------------------------------------------
// PitchDiscovery bileşenindeki filtre/sıralama/seçenek-türetme mantığı buraya
// çıkarıldı: (1) birim testlerle kilitlenebilir, (2) tek doğru davranış kaynağı.
// Tüm seçenekler GERÇEK saha verisinden türetilir; uydurma seçenek üretilmez.
// ============================================================================
import type { LucideIcon } from 'lucide-react';
import type { Pitch } from '../types';
import { normalizeAmenity, getAmenityDef } from '../shared/amenities';
import { TURKEY_REGIONS } from '../data/turkeyRegions';
import { getHaversineDistance } from '../utils/geo';

export type PitchSortOrder = 'DEFAULT' | 'PRICE_ASC' | 'RATING_DESC' | 'DISTANCE_ASC';

export interface PitchFilterCriteria {
  district: string; // 'Tümü' veya ilçe adı
  minRating: number;
  maxPrice: number | null; // null → üst sınır yok
  hasAmenities: string[]; // kanonik olanak değerleri (VE-kesişimi)
  type: 'Tümü' | 'Kapalı' | 'Açık';
}

export interface SelectedRegion {
  city: string;
  district: string | null;
}

export interface FilterAndSortInput {
  pitches: Pitch[];
  searchQuery: string;
  filters: PitchFilterCriteria;
  sortOrder: PitchSortOrder;
  favorites: Set<string>;
  favOnly: boolean;
  onlyDiscounted: boolean;
  selectedRegions: SelectedRegion[];
  mapCenter: [number, number];
  userLocation: { lat: number; lng: number } | null;
}

export interface DistrictOption {
  name: string;
  count: number;
}
export interface AmenityOption {
  value: string;
  count: number;
  icon: LucideIcon | null;
}
export interface PitchFilterOptions {
  districtOptions: DistrictOption[];
  priceBounds: { min: number; max: number } | null;
  amenityOptions: AmenityOption[];
  typeCounts: { Kapalı: number; Açık: number };
  discountCount: number;
}

/** Türkçe-doğru küçük harf: "IŞIK" → "ışık", "İSTANBUL" → "istanbul". */
const trLower = (s: string): string => s.toLocaleLowerCase('tr-TR');

const pitchDistanceKm = (p: Pitch, center: [number, number]): number | null => {
  if (p.coordinates?.lat != null && p.coordinates?.lng != null) {
    return getHaversineDistance(center[0], center[1], p.coordinates.lat, p.coordinates.lng);
  }
  return null;
};

/**
 * Saha, seçili bölgelerden en az birinin kapsamında mı?
 * İlçe seçiliyse ilçe adı eşleşir; aynı adlı ilçe farklı illerde çakışmasın diye
 * her iki tarafta da şehir biliniyorsa şehir de doğrulanır. İl geneli seçiliyse
 * saha o ile ait (şehir alanı ya da TURKEY_REGIONS ilçe listesi üzerinden).
 */
export function pitchInSelectedRegions(
  p: { city?: string | null; district: string },
  regions: SelectedRegion[],
): boolean {
  if (regions.length === 0) return true;
  return regions.some((r) => {
    if (r.district) {
      if (p.district !== r.district) return false;
      if (p.city && r.city) return p.city === r.city;
      return true;
    }
    if (p.city) return p.city === r.city;
    const cityDistricts = TURKEY_REGIONS.find((t) => t.city === r.city)?.districts ?? [];
    return cityDistricts.includes(p.district);
  });
}

/** Filtre sheet'i için TÜM seçenekleri gerçek saha listesinden türetir. */
export function derivePitchFilterOptions(pitches: Pitch[]): PitchFilterOptions {
  const districtCounts = new Map<string, number>();
  pitches.forEach((p) => {
    if (!p.district) return;
    districtCounts.set(p.district, (districtCounts.get(p.district) ?? 0) + 1);
  });
  const districtOptions = Array.from(districtCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));

  const prices = pitches.map((p) => p.totalPrice).filter((v) => v > 0);
  let priceBounds: { min: number; max: number } | null = null;
  if (prices.length > 0) {
    const min = Math.floor(Math.min(...prices) / 50) * 50;
    const max = Math.ceil(Math.max(...prices) / 50) * 50;
    priceBounds = { min, max: max > min ? max : min + 50 };
  }

  const amenityCounts = new Map<string, number>();
  pitches.forEach((p) => {
    const seen = new Set<string>();
    (p.amenities ?? []).forEach((raw) => {
      const v = normalizeAmenity(raw);
      if (seen.has(v)) return;
      seen.add(v);
      amenityCounts.set(v, (amenityCounts.get(v) ?? 0) + 1);
    });
  });
  const amenityOptions = Array.from(amenityCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([value, count]) => ({ value, count, icon: getAmenityDef(value)?.icon ?? null }));

  const typeCounts = {
    Kapalı: pitches.filter((p) => p.courts?.some((c) => c.type === 'CLOSED')).length,
    Açık: pitches.filter((p) => p.courts?.some((c) => c.type === 'OPEN')).length,
  };
  const discountCount = pitches.filter((p) => p.flashDiscount).length;

  return { districtOptions, priceBounds, amenityOptions, typeCounts, discountCount };
}

/**
 * Filtreler + arama + bölge kapsamı uygulanır, sonra sıralanır.
 * "Önerilen" (DEFAULT): konum varsa yakınlık, yoksa alfabetik (tr-TR).
 * Öne Çıkan artık YALNIZ görsel bir admin rozetidir — sıralamayı ETKİLEMEZ.
 */
export function filterAndSortPitches(input: FilterAndSortInput): Pitch[] {
  const {
    pitches, searchQuery, filters, sortOrder,
    favorites, favOnly, onlyDiscounted, selectedRegions, mapCenter, userLocation,
  } = input;
  const q = trLower(searchQuery.trim());

  const result = pitches
    .filter((p) => {
      if (p.isApproved === false) return false;
      if (favOnly && !favorites.has(p.id)) return false;
      if (onlyDiscounted && !p.flashDiscount) return false;
      if (!pitchInSelectedRegions(p, selectedRegions)) return false;

      const matchesSearch = q === '' || trLower(p.name).includes(q) || trLower(p.district).includes(q);
      const matchesDistrict = filters.district === 'Tümü' || p.district === filters.district;
      // V-2: puansız saha (ratingCount=0, Google yorumu da yok) puan filtresine
      // GİRMEZ — sahte 5.0 default ile "4.5+" filtresine sızmasın. minRating=0/yok
      // ise herkes geçer (filtre kapalı sayılır).
      const hasRealRating = p.ratingCount > 0 || p.googleReviews > 0;
      const matchesRating =
        !filters.minRating || filters.minRating <= 0
          ? true
          : hasRealRating && p.rating >= filters.minRating;
      // maxPrice=null → limit yok. Fiyatı bilinmeyen (0₺) saha limitten elenmez.
      const matchesPrice = filters.maxPrice == null || p.totalPrice <= filters.maxPrice;

      let matchesAmenities = true;
      if (filters.hasAmenities.length > 0) {
        const set = new Set((p.amenities ?? []).map(normalizeAmenity));
        matchesAmenities = filters.hasAmenities.every((a) => set.has(a));
      }

      let matchesType = true;
      if (filters.type === 'Kapalı') matchesType = p.courts?.some((c) => c.type === 'CLOSED') || false;
      else if (filters.type === 'Açık') matchesType = p.courts?.some((c) => c.type === 'OPEN') || false;

      return matchesSearch && matchesDistrict && matchesRating && matchesPrice && matchesType && matchesAmenities;
    })
    .map((p) => {
      const km = pitchDistanceKm(p, mapCenter);
      return km == null ? p : { ...p, distance: `${km.toFixed(1)} km` };
    });

  const distKm = (p: Pitch): number => {
    const km = pitchDistanceKm(p, mapCenter);
    return km == null ? Infinity : km; // koordinatsız → sona
  };

  if (sortOrder === 'PRICE_ASC') {
    result.sort((a, b) => a.totalPrice - b.totalPrice);
  } else if (sortOrder === 'RATING_DESC') {
    result.sort((a, b) => b.rating - a.rating);
  } else if (sortOrder === 'DISTANCE_ASC') {
    result.sort((a, b) => distKm(a) - distKm(b));
  } else {
    // DEFAULT "Önerilen"
    if (userLocation) result.sort((a, b) => distKm(a) - distKm(b));
    else result.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  }

  return result;
}
