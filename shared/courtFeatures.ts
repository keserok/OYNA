/**
 * Saha (court) bazlı özellik rozetleri — tek doğruluk kaynağı (Faz 3).
 * Owner panelinde seçilir (courts.features jsonb), oyuncu vitrininde rozet
 * olarak gösterilir. İkon eşlemesi bileşen tarafında lucide ile yapılır.
 */
export interface CourtFeatureDef {
  value: string;
  label: string;
  /** lucide ikon adı (bileşen tarafında eşlenir) */
  icon: string;
}

export const COURT_FEATURES: CourtFeatureDef[] = [
  { value: 'heating', label: 'Isıtmalı', icon: 'Thermometer' },
  { value: 'tribune', label: 'Tribün', icon: 'Users' },
  { value: 'camera', label: 'Kamera Kaydı', icon: 'Video' },
  { value: 'shoe_rental', label: 'Ayakkabı Kiralama', icon: 'Footprints' },
  { value: 'scoreboard', label: 'Skorboard', icon: 'Gauge' },
];

const BY_VALUE = new Map(COURT_FEATURES.map((f) => [f.value, f]));

export function courtFeatureLabel(value: string): string {
  return BY_VALUE.get(value)?.label ?? value;
}

/** Ham jsonb değerini güvenli string[]'e çevirir. */
export function normalizeCourtFeatures(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === 'string');
}
