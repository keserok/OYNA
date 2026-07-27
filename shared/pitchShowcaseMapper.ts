/**
 * Saha Vitrini eşleyicisi — TEK KAYNAK.
 * Canlı saha satırını (pitches + courts + pitch_tariffs) UI Pitch tipine
 * dönüştürür. Oyuncu Saha Keşfet vitrini ve admin PitchStudio "Canlı Ayna"sı
 * AYNI select dizesini ve AYNI dönüşümü kullanır — iki ayrı model / drift yok.
 */
import { Pitch, Court } from '../types';
import { getAverageTariffPrice, mapDbTariffsToPitchTariffs } from '../services/tariffService';

// ── Owner module: canlı saha verisini UI Pitch tipine dönüştürme ──────────────
export interface DbTariff {
  id: string;
  name?: string;
  applies_to_days: number[] | null;
  start_time: string;
  end_time: string;
  price_per_hour: number;
  deposit_amount?: number | null;
  is_active: boolean | null;
  tariff_type: string;
  sort_order?: number | null;
  /** Tarih-özel tarife (takvimden girilen özel fiyat) — yalnız bu tarihte geçerli. */
  valid_on?: string | null;
}

export interface DbCourtRow {
  id: string;
  name: string;
  court_type: string | null;
  surface?: string | null;
  size?: string | null;
  price: number | null;
  is_active: boolean | null;
  description?: string | null;
  images?: string[] | null;
  lighting_grade?: string | null;
  grass_grade?: string | null;
  locker_grade?: string | null;
  grades_status?: string | null;
  capacity?: number | null;
  min_capacity?: number | null;
  max_capacity?: number | null;
  sort_order?: number | null;
  features?: string[] | null;
}

export interface DbPitchRow {
  id: string;
  name: string;
  city: string | null;
  district: string | null;
  address: string | null;
  rating: number | null;
  rating_count: number | null;
  google_rating: number | null;
  google_review_count: number | null;
  price_per_person: number | null;
  total_price: number | null;
  price_per_match: number | null;
  image: string | null;
  images: string[] | null;
  description: string | null;
  amenities: string[] | null;
  latitude: number | null;
  longitude: number | null;
  owner_id?: string | null;
  is_published?: boolean | null;
  is_featured?: boolean | null;
  flash_deals_enabled?: boolean | null;
  show_availability_badge?: boolean | null;
  map_label?: string | null;
  booking_disabled_by_admin?: boolean | null;
  working_hours?: { open?: string; close?: string; slot_duration?: number; slotDuration?: number } | null;
  courts?: DbCourtRow[];
  pitch_tariffs?: DbTariff[];
}

/**
 * Vitrin liste/ayna sorgusunun select dizesi — oyuncu (PitchDiscovery) ve
 * admin (PitchStudio Canlı Ayna) birebir bu ifadeyi kullanır.
 */
export const PITCH_SHOWCASE_SELECT =
  '*, courts(id, name, court_type, surface, size, price, is_active, description, images, lighting_grade, grass_grade, locker_grade, grades_status, capacity, min_capacity, max_capacity, sort_order, features), pitch_tariffs(*)';

export const gradeToScore = (g?: string | null): number => {
  if (g === 'A+') return 98;
  if (g === 'A') return 95;
  if (g === 'B') return 80;
  if (g === 'C') return 65;
  return 0;
};

// Saha zemini etiketleri artık tek kaynaktan (shared/courtSurface) gelir —
// oyuncu, owner (PitchManager) ve admin paneli birebir aynı sözlüğü kullanır.

/** capacity=14 → "7v7"; tek sayıysa "13 oyuncu" */
export const formatCapacity = (capacity?: number): string | null => {
  if (!capacity || capacity <= 0) return null;
  if (capacity % 2 === 0) return `${capacity / 2}v${capacity / 2}`;
  return `${capacity} oyuncu`;
};

/**
 * Kortun oynanabilir format aralığı rozeti: min 6 & maks 8 → "6v6–8v8";
 * min=maks → tek format ("7v7"); yalnız biri varsa "6v6+" / "≤8v8";
 * aralık yoksa legacy capacity'ye düşer.
 *
 * BİRİM: min/max TAKIM BAŞINA oyuncudur (7 → 7v7) — courts.min_capacity /
 * max_capacity SSOT'u budur. Yalnız fallback 'capacity' TOPLAM kişidir
 * (14 → 7v7), o yüzden ona formatCapacity uygulanır.
 */
export const formatCapacityRange = (
  min?: number | null,
  max?: number | null,
  fallbackCapacity?: number | null,
): string | null => {
  const f = (n: number) => `${n}v${n}`;
  if (min && max) return min === max ? f(min) : `${f(min)}–${f(max)}`;
  if (min) return `${f(min)}+`;
  if (max) return `≤${f(max)}`;
  return formatCapacity(fallbackCapacity ?? undefined);
};

export const mapDbPitchToUiPitch = (
  row: DbPitchRow,
): Pitch => {
  const tariffs = mapDbTariffsToPitchTariffs(row.pitch_tariffs);
  const averagePrice =
    getAverageTariffPrice(row.pitch_tariffs) ?? row.total_price ?? row.price_per_match ?? 0;
  const wh = row.working_hours;
  const courts: Court[] = (row.courts ?? [])
    .filter((c) => c.is_active !== false)
    .map((c): Court => ({
      id: c.id,
      name: c.name,
      type: c.court_type === 'CLOSED' ? 'CLOSED' : 'OPEN',
      surface: c.surface ?? 'TURF',
      size: c.size ?? undefined,
      capacity: c.capacity ?? undefined,
      minCapacity: c.min_capacity ?? undefined,
      maxCapacity: c.max_capacity ?? undefined,
      price: c.price ?? averagePrice,
      slots: [],
      description: c.description ?? undefined,
      images: (c.images as string[] | undefined) ?? undefined,
      features: Array.isArray(c.features) ? (c.features as string[]) : undefined,
      lighting: gradeToScore(c.lighting_grade),
      grassQuality: gradeToScore(c.grass_grade),
      lockerRoomQuality: gradeToScore(c.locker_grade),
      lightingGrade: c.lighting_grade ?? null,
      grassGrade: c.grass_grade ?? null,
      gradesStatus: (c.grades_status as Court['gradesStatus']) ?? 'approved',
      sortOrder: c.sort_order ?? 0,
    }))
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  return {
    id: row.id,
    name: row.name,
    city: row.city ?? undefined,
    district: row.district ?? row.city ?? '',
    location: row.address ?? [row.district, row.city].filter(Boolean).join(', '),
    distance: '',
    // V-2: puansız saha sahte "5.0" göstermesin. Platform değerlendirmesi varsa
    // onu, yoksa Google yorumu varsa onu; ikisi de yoksa 0 (kart "Yeni" gösterir).
    // (pitches.rating DEFAULT 5.0 olduğundan rating_count kapısı ŞART.)
    rating: (row.rating_count ?? 0) > 0
      ? (row.rating ?? 0)
      : (row.google_review_count ?? 0) > 0
        ? (row.google_rating ?? 0)
        : 0,
    ratingCount: row.rating_count ?? 0,
    googleRating: row.google_rating ?? 0,
    googleReviews: row.google_review_count ?? 0,
    pricePerPerson: row.price_per_person ?? 0,
    // V-3: flash indirim SLOT-ÖZEL (court_id/booking_date/start_time) bir kampanya;
    // vitrinde tüm sahaya "indirimli fiyat" olarak yansıtmak yanıltıcıydı (rezervasyon
    // TAM tarifeyi alıyordu — yem-değiştir). Kart artık GERÇEK ortalama fiyatı gösterir;
    // doğru slot-özel indirim uygulaması OW-D'de (rezervasyon fiyatına).
    totalPrice: averagePrice,
    originalPrice: undefined,
    image: row.image ?? row.images?.[0] ?? '',
    images: row.images ?? (row.image ? [row.image] : []),
    description: row.description ?? '',
    amenities: row.amenities ?? [],
    lighting: 0,
    grassQuality: 0,
    lockerRoomQuality: 0,
    goalQuality: 0,
    // V-8: puandan uydurma doluluk türetme kaldırıldı; gerçek doluluk keşif
    // tarafında hesaplanmıyor → 0 (bilinmiyor). Sahte veri modelde taşınmaz.
    occupancy: 0,
    // Koordinat yoksa sahte varsayılan basma — undefined bırak (haritada gizlenir).
    coordinates:
      row.latitude != null && row.longitude != null
        ? { lat: row.latitude, lng: row.longitude }
        : undefined,
    slots: [],
    courts,
    isApproved: true,
    ownerId: row.owner_id ?? undefined,
    isPublished: row.is_published !== false,
    isFeatured: row.is_featured === true,
    showAvailabilityBadge: row.show_availability_badge === true,
    mapLabel: row.map_label?.trim() || undefined,
    bookingDisabledByAdmin: row.booking_disabled_by_admin === true,
    // Ham working_hours korunur (dizi ya da nesne); gün-bazlı çözümleme
    // buildAvailabilitySlots içinde rezervasyon tarihine göre yapılır.
    workingHoursRaw: wh ?? null,
    workingHours: wh && !Array.isArray(wh)
      ? {
          open: wh.open ?? '08:00',
          close: wh.close ?? '02:00',
          slotDuration: wh.slot_duration ?? wh.slotDuration ?? 60,
        }
      : { open: '08:00', close: '02:00', slotDuration: 60 },
    // V-3: sahte pitch-geneli indirim rozeti/kimliği kaldırıldı (slot-özel doğru uygulama OW-D).
    flashDiscount: undefined,
    flashDealId: undefined,
    tariffs,
  };
};
