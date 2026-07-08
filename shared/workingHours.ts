// ============================================================================
// Çalışma saatleri — TEK KAYNAK çözümleyici
// ----------------------------------------------------------------------------
// Owner paneli çalışma saatlerini 7 GÜNLÜK DİZİ olarak kaydeder
//   [{ name:'Pazartesi', open:'09:00', close:'00:00', closed:false }, ...]
// ama tüketici (PitchDiscovery/availabilityService) eskiden tek NESNE
//   { open, close, slotDuration } bekliyordu → dizi geldiğinde owner'ın gün-bazlı
// saatleri YOK SAYILIP varsayılan 08:00-02:00 kullanılıyordu (tutarsızlık).
// Bu modül her iki şekli de anlayıp verilen tarih için doğru pencereyi döndürür;
// hem owner takvimi hem tüketier slot üretimi aynı kaynaktan okur.
// ============================================================================

export interface ResolvedWorkingHours {
  open: string; // 'HH:MM'
  close: string; // 'HH:MM' (kapanış açılıştan küçük/eşitse ertesi güne taşar)
  slotDuration: number; // dakika
  closed: boolean; // o gün tamamen kapalı mı
}

export interface WorkingHoursDay {
  name?: string;
  day?: number; // 0=Pazartesi .. 6=Pazar (opsiyonel)
  open?: string;
  close?: string;
  closed?: boolean;
}

export type RawWorkingHours =
  | { open?: string; close?: string; slotDuration?: number; slot_duration?: number }
  | WorkingHoursDay[]
  | null
  | undefined;

export const DEFAULT_WORKING_HOURS: ResolvedWorkingHours = {
  open: '08:00',
  close: '02:00',
  slotDuration: 60,
  closed: false,
};

// Owner panelinin kullandığı Türkçe gün adları — Pazartesi başlangıçlı.
const TR_DAY_NAMES = [
  'Pazartesi',
  'Salı',
  'Çarşamba',
  'Perşembe',
  'Cuma',
  'Cumartesi',
  'Pazar',
];

function normHM(t: string | undefined, fallback: string): string {
  if (!t) return fallback;
  const [h, m] = String(t).split(':');
  const hh = (h ?? '00').padStart(2, '0');
  const mm = (m ?? '00').padStart(2, '0');
  return `${hh}:${mm}`;
}

/** Pazartesi=0 .. Pazar=6 (JS getDay Pazar=0'ı Pazartesi-başlangıca çevirir). */
export function isoWeekdayIndex(dateISO: string): number {
  const d = new Date(`${dateISO}T12:00:00`);
  return (d.getDay() + 6) % 7;
}

/**
 * Verilen tarih (YYYY-MM-DD) için çalışma penceresini döndürür.
 * Dizi → o günün girdisi (ad veya sıra ile); nesne → tek pencere; boş → varsayılan.
 */
export function resolveWorkingHoursForDate(
  raw: RawWorkingHours,
  dateISO: string,
): ResolvedWorkingHours {
  if (Array.isArray(raw)) {
    if (raw.length === 0) return { ...DEFAULT_WORKING_HOURS };
    const idx = isoWeekdayIndex(dateISO);
    const byName = raw.find((d) => d && d.name === TR_DAY_NAMES[idx]);
    const byDay = raw.find((d) => d && typeof d.day === 'number' && d.day === idx);
    const entry = byName ?? byDay ?? raw[idx] ?? null;
    if (!entry) return { ...DEFAULT_WORKING_HOURS };
    if (entry.closed) {
      return {
        open: normHM(entry.open, DEFAULT_WORKING_HOURS.open),
        close: normHM(entry.close, DEFAULT_WORKING_HOURS.close),
        slotDuration: 60,
        closed: true,
      };
    }
    return {
      open: normHM(entry.open, DEFAULT_WORKING_HOURS.open),
      close: normHM(entry.close, DEFAULT_WORKING_HOURS.close),
      slotDuration: 60,
      closed: false,
    };
  }

  if (raw && typeof raw === 'object') {
    const o = raw as { open?: string; close?: string; slotDuration?: number; slot_duration?: number };
    return {
      open: normHM(o.open, DEFAULT_WORKING_HOURS.open),
      close: normHM(o.close, DEFAULT_WORKING_HOURS.close),
      slotDuration: o.slotDuration ?? o.slot_duration ?? 60,
      closed: false,
    };
  }

  return { ...DEFAULT_WORKING_HOURS };
}

function toH(t: string): number {
  const [h, m] = normHM(t, '00:00').split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) + (Number.isFinite(m) ? m : 0) / 60;
}

/**
 * Bir saatin (0-23 tam saat) çalışma penceresi içinde olup olmadığı.
 * Kapanış açılıştan küçük/eşitse pencere gece yarısını aşar (ör. 09:00-02:00).
 */
export function isHourWithinWorkingHours(hour: number, open: string, close: string): boolean {
  const openH = toH(open);
  let closeH = toH(close);
  if (closeH === 0) closeH = 24; // '00:00' kapanış = gün sonu
  if (closeH > openH) return hour >= openH && hour < closeH;
  // gece yarısını aşan pencere
  return hour >= openH || hour < closeH;
}

/** Çalışma penceresindeki tam-saat sayısı (doluluk paydası için). */
export function openHourCount(open: string, close: string): number {
  let count = 0;
  for (let h = 0; h < 24; h++) {
    if (isHourWithinWorkingHours(h, open, close)) count++;
  }
  return count || 1;
}
