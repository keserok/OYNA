/**
 * Standart tesis olanağı kataloğu (Karar #16).
 * Kanonik değer = Türkçe etiket (pitches.amenities jsonb'siyle birebir uyumlu;
 * migration 20260707000001 eski serbest girdileri bu kataloğa eşledi).
 * Katalogda olmayan girdiler arayüzde "Diğer" bölümünde ikonsuz gösterilir.
 */
import {
  Car, Droplets, DoorOpen, Coffee, Camera, Wifi, Users, Moon,
  Thermometer, Wind, Bus, Footprints, ShowerHead, Shirt, Baby, CircleParking,
  type LucideIcon,
} from 'lucide-react';

export interface AmenityDef {
  value: string;      // DB'de saklanan kanonik değer
  icon: LucideIcon;
}

export const AMENITY_CATALOG: AmenityDef[] = [
  { value: 'Otopark', icon: Car },
  { value: 'Duş', icon: ShowerHead },
  { value: 'Soyunma Odası', icon: DoorOpen },
  { value: 'Kafeterya', icon: Coffee },
  { value: 'Kamera Kaydı', icon: Camera },
  { value: 'WiFi', icon: Wifi },
  { value: 'Tribün', icon: Users },
  { value: 'Gece Aydınlatması', icon: Moon },
  { value: 'Isıtma', icon: Thermometer },
  { value: 'Klima', icon: Wind },
  { value: 'Servis', icon: Bus },
  { value: 'Krampon Kiralama', icon: Footprints },
  { value: 'Forma Kiralama', icon: Shirt },
  { value: 'Mescit', icon: Baby },
  { value: 'Kapalı Otopark', icon: CircleParking },
  { value: 'İçme Suyu', icon: Droplets },
];

const CATALOG_MAP = new Map(AMENITY_CATALOG.map((a) => [a.value, a]));

/** Eski/serbest yazımları kanonik değere çevirir (migration ile aynı eşleme). */
const LEGACY_ALIASES: Record<string, string> = {
  'Dus': 'Duş',
  'Soyunma Odasi': 'Soyunma Odası',
  'Wifi': 'WiFi',
  'Kafe': 'Kafeterya',
  'Büfe': 'Kafeterya',
  'Kamera': 'Kamera Kaydı',
};

export const normalizeAmenity = (raw: string): string => LEGACY_ALIASES[raw] ?? raw;

export const getAmenityDef = (value: string): AmenityDef | undefined =>
  CATALOG_MAP.get(normalizeAmenity(value));

/** Bir olanak listesini katalogda olan (ikonlu) / olmayan (Diğer) olarak ayırır. */
export const splitAmenities = (values: string[]): { known: AmenityDef[]; other: string[] } => {
  const known: AmenityDef[] = [];
  const other: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const canonical = normalizeAmenity(raw);
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    const def = CATALOG_MAP.get(canonical);
    if (def) known.push(def);
    else other.push(canonical);
  }
  return { known, other };
};
