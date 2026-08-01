// Top Oyna gün şeridi — kaydırılabilir gün seçici için saf yardımcılar.
// (Birim testleri: tests/unit/discoveryDays.test.ts)
//
// Gün "yerel gün" demektir: gece yarısına yuvarlanmış yerel tarih. Maçın günü
// shared/matchTiming → matchStartDayMs ile çözülür (starts_at tek doğru kaynak).

import { matchStartMs } from '../shared/matchTiming';

/** Şeritte kaç gün gösterilir (bugün dahil). */
export const DAY_STRIP_LENGTH = 14;

export interface DiscoveryDay {
  /** Yerel gece yarısına yuvarlanmış zaman damgası — seçim kimliği. */
  ms: number;
  /** 'PZT' · 'SAL' … — kısa gün adı, büyük harf. */
  weekday: string;
  /** Ayın günü: 1, 2, … 31. */
  dayNum: number;
  /** 'AĞU' — kısa ay adı, büyük harf. */
  month: string;
  isToday: boolean;
  isTomorrow: boolean;
  /** O güne düşen maç sayısı. */
  count: number;
}

/** Yerel gece yarısı (gün kimliği). */
export function startOfDayMs(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Bu saatten önce başlayan maç "bir önceki günün gecesi" sayılır. */
export const GECE_SINIRI_SAAT = 6;

/**
 * Maçın görüneceği gün(ler).
 *
 * Gece maçları İKİ güne birden yazılır: Cuma gecesi 00:30 maçı hem Cuma'da
 * (oyuncu "Cuma akşamı maçım var" der) hem Cumartesi'de (takvimdeki gerçek
 * günü) görünür. Böylece hangi güne bakarsa baksın kullanıcı maçı bulur.
 * Bunun bedeli: gün sayaçlarında o maç iki kez sayılır — bilinçli seçim.
 */
export function matchDayKeys(match: any, now: Date = new Date()): number[] {
  const ms = matchStartMs(match, now);
  if (ms === null) return [];
  const d = new Date(ms);
  const gercekGun = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  if (d.getHours() >= GECE_SINIRI_SAAT) return [gercekGun];
  return [gercekGun - 86_400_000, gercekGun];
}

const WEEKDAYS = ['PAZ', 'PZT', 'SAL', 'ÇAR', 'PER', 'CUM', 'CMT'];
const MONTHS = ['OCA', 'ŞUB', 'MAR', 'NİS', 'MAY', 'HAZ', 'TEM', 'AĞU', 'EYL', 'EKİ', 'KAS', 'ARA'];

/**
 * Bugünden başlayan `length` günlük şerit; her güne o gündeki maç sayısı yazılır.
 * İLK gün her zaman içinde bulunulan gündür (varsayılan seçim de odur).
 */
export function buildDayStrip(
  matches: any[],
  now: Date = new Date(),
  length: number = DAY_STRIP_LENGTH,
): DiscoveryDay[] {
  const todayMs = startOfDayMs(now);

  // Maçları güne göre say. Gece maçı iki güne birden yazılır (matchDayKeys).
  const counts = new Map<number, number>();
  (matches ?? []).forEach((m) => {
    matchDayKeys(m, now).forEach((dayMs) => {
      counts.set(dayMs, (counts.get(dayMs) ?? 0) + 1);
    });
  });

  const days: DiscoveryDay[] = [];
  for (let i = 0; i < length; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const ms = d.getTime();
    days.push({
      ms,
      weekday: WEEKDAYS[d.getDay()],
      dayNum: d.getDate(),
      month: MONTHS[d.getMonth()],
      isToday: ms === todayMs,
      isTomorrow: i === 1,
      count: counts.get(ms) ?? 0,
    });
  }
  return days;
}

/**
 * Seçili gün için kısa etiket: 'BUGÜN' · 'YARIN' · '5 AĞU'.
 * Şeritten bağımsız çalışır — gece yarısını geçince seçim şeritten düşse bile
 * başlıkta doğru tarih yazar.
 */
export function formatDayLabel(dayMs: number, now: Date = new Date()): string {
  const todayMs = startOfDayMs(now);
  const gun = 86_400_000;
  if (dayMs === todayMs) return 'BUGÜN';
  if (dayMs === todayMs + gun) return 'YARIN';
  const d = new Date(dayMs);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** Maç seçili güne mi düşüyor? `dayMs === null` → gün filtresi kapalı (tümü). */
export function matchOnDay(match: any, dayMs: number | null, now: Date = new Date()): boolean {
  if (dayMs === null) return true;
  return matchDayKeys(match, now).includes(dayMs);
}

/**
 * Maç, seçili günün GECESİNE mi taşıyor? (ör. Cuma seçili, maç Cumartesi 00:30)
 * Kartta küçük bir "GECE" işareti göstermek için — kullanıcı Cuma'da gördüğü
 * maçın saatinin gece yarısını geçtiğini anlasın.
 */
export function isGeceMaci(match: any, dayMs: number | null, now: Date = new Date()): boolean {
  if (dayMs === null) return false;
  const keys = matchDayKeys(match, now);
  // İki anahtarı varsa gece maçıdır; seçili gün İLK anahtarsa (önceki gün) taşar.
  return keys.length === 2 && keys[0] === dayMs;
}
