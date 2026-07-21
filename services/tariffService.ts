import type { PitchTariff } from '../types';

export interface TariffLike {
  id?: string;
  name?: string;
  tariff_type: string;
  applies_to_days: number[] | null;
  start_time: string;
  end_time: string;
  price_per_hour: number;
  deposit_amount?: number | null;
  is_active?: boolean | null;
  sort_order?: number | null;
  /** null/undefined = tesis geneli; dolu = yalnız o sahaya (court) özel tarife. */
  court_id?: string | null;
}

const TARIFF_PRIORITY: Record<string, number> = {
  HOLIDAY: 1,
  WEEKEND: 2,
  WEEKDAY: 3,
  SPECIAL: 4,
};

function normalizeTime(t: string): string {
  const raw = t.trim().replace('.', ':');
  const parts = raw.split(':');
  const h = parts[0]?.padStart(2, '0') ?? '00';
  const m = (parts[1] ?? '00').padStart(2, '0');
  return `${h}:${m}`;
}

/** ISO weekday: 1 = Pazartesi … 7 = Pazar */
export function isoDayOfWeek(dateISO: string): number {
  const [y, m, d] = dateISO.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return ((date.getDay() + 6) % 7) + 1;
}

function timeMatchesTariff(startTime: string, tariff: TariffLike): boolean {
  const hhmm = normalizeTime(startTime);
  const start = tariff.start_time.slice(0, 5);
  const end = tariff.end_time.slice(0, 5);
  return hhmm >= start && (hhmm < end || end === '00:00');
}

/** Owner tarifelerinin ortalama saatlik ücreti (liste kartları için). */
export function getAverageTariffPrice(tariffs: TariffLike[] | null | undefined): number | null {
  const active = (tariffs ?? []).filter((t) => t.is_active !== false);
  if (active.length === 0) return null;
  const sum = active.reduce((acc, t) => acc + Number(t.price_per_hour), 0);
  return Math.round(sum / active.length);
}

export interface SlotTariffQuote {
  price: number;
  deposit: number;
  tariffId?: string;
}

/**
 * Belirli tarih + saat dilimi için geçerli tarife. Sunucudaki
 * get_current_tariff_price ile BİREBİR aynı mantık: saha-özel tarife
 * (court_id = courtId) tesis-geneline (court_id null) üstün gelir; aynı kapsam
 * içinde tarife tipi önceliği (HOLIDAY>WEEKEND>WEEKDAY>SPECIAL) uygulanır.
 * courtId verilmezse yalnız tesis-geneli tarifeler dikkate alınır.
 */
export function resolveTariffForSlot(
  tariffs: TariffLike[] | null | undefined,
  bookingDateISO: string,
  startTime: string,
  courtId?: string | null
): SlotTariffQuote | null {
  if (!tariffs?.length) return null;
  const dow = isoDayOfWeek(bookingDateISO);
  const isCourtSpecific = (t: TariffLike) => t.court_id != null && t.court_id === courtId;
  const matches = tariffs
    .filter((t) => t.is_active !== false)
    .filter((t) => t.court_id == null || (courtId != null && t.court_id === courtId))
    .filter((t) => (t.applies_to_days ?? []).includes(dow))
    .filter((t) => timeMatchesTariff(startTime, t))
    .sort((a, b) => {
      // 1) Saha-özel önce, 2) tarife tipi önceliği, 3) deterministik tiebreak (id).
      const courtRank = (isCourtSpecific(a) ? 0 : 1) - (isCourtSpecific(b) ? 0 : 1);
      if (courtRank !== 0) return courtRank;
      const typeRank = (TARIFF_PRIORITY[a.tariff_type] ?? 9) - (TARIFF_PRIORITY[b.tariff_type] ?? 9);
      if (typeRank !== 0) return typeRank;
      return String(a.id ?? '').localeCompare(String(b.id ?? ''));
    });

  if (matches.length === 0) return null;
  const hit = matches[0];
  return {
    price: Number(hit.price_per_hour),
    deposit: Number(hit.deposit_amount ?? 0),
    tariffId: hit.id,
  };
}

export function mapDbTariffsToPitchTariffs(rows: TariffLike[] | null | undefined): PitchTariff[] {
  return (rows ?? []).map((t, idx) => ({
    id: t.id ?? `tariff-${idx}`,
    pitch_id: '',
    court_id: t.court_id ?? null,
    name: t.name ?? 'Tarife',
    tariff_type: (t.tariff_type as PitchTariff['tariff_type']) ?? 'WEEKDAY',
    applies_to_days: t.applies_to_days ?? [],
    start_time: t.start_time,
    end_time: t.end_time,
    price_per_hour: Number(t.price_per_hour),
    deposit_amount: Number(t.deposit_amount ?? 0),
    is_active: t.is_active !== false,
    sort_order: t.sort_order ?? idx,
  }));
}
