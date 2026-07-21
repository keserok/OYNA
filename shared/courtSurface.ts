// Tek kaynak: saha zemini (surface) etiketleri.
// DB `courts.surface` değeri (TURF/GRASS/PARQUET/TARTAN) oyuncu uygulaması, owner
// paneli (PitchManager → Sahalarım) ve admin panelinde BİREBİR aynı Türkçe etiketle
// gösterilir. Halı saha alanının yerleşik terimi "Halı" (suni çim), doğal çim "Çim".
// Bu sözlük dağılırsa (örn. owner 'Suni Çim' derken oyuncu 'Halı' görürse) veri
// tutarlılığı bozulur — o yüzden tüm paneller buradan import etmeli.
export const SURFACE_LABELS: Record<string, string> = {
  TURF: 'Halı',
  GRASS: 'Çim',
  PARQUET: 'Parke',
  TARTAN: 'Tartan',
};

// Zemin seçiciler (owner/admin dropdown) — etiketlerle aynı kaynaktan beslenir.
export const SURFACE_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'TURF', label: SURFACE_LABELS.TURF },
  { value: 'GRASS', label: SURFACE_LABELS.GRASS },
  { value: 'PARQUET', label: SURFACE_LABELS.PARQUET },
  { value: 'TARTAN', label: SURFACE_LABELS.TARTAN },
];

// Güvenli etiket çözümü: bilinmeyen/boş değerde ham değeri ya da 'Halı' varsayılanını verir.
export const surfaceLabel = (surface?: string | null): string =>
  (surface && SURFACE_LABELS[surface]) || surface || SURFACE_LABELS.TURF;
