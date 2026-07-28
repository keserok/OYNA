import type { PitchTariff } from '../types';
import { normalizeSlotMinutes } from '../shared/slotGrid';

export interface TariffLike {
  id?: string;
  name?: string;
  tariff_type: string;
  applies_to_days: number[] | null;
  start_time: string;
  end_time: string;
  /** Slot başına fiyat. Sunucudaki pitch_tariffs.slot_price. */
  slot_price?: number | null;
  /** @deprecated Eski ad; slot_price yoksa buradan okunur (geriye dönük uyum). */
  price_per_hour?: number | null;
  /** Slot süresi (dakika): 60 | 90 | 120. Yoksa 60 varsayılır. */
  slot_minutes?: number | null;
  deposit_amount?: number | null;
  is_active?: boolean | null;
  sort_order?: number | null;
  /** null/undefined = tesis geneli; dolu = yalnız o sahaya (court) özel tarife. */
  court_id?: string | null;
  /** Dolu ise tarife YALNIZ bu tarihte (YYYY-MM-DD) geçerlidir ve o tarihte
   *  diğer tüm tarifelere üstün gelir (takvimden girilen özel fiyat). */
  valid_on?: string | null;
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

/** Owner tarifelerinin ortalama saatlik ücreti (liste kartları için).
 *  Tarih-özel (valid_on) satırlar tek güne aittir; ortalamayı bozmasın diye hariç. */
export function getAverageTariffPrice(tariffs: TariffLike[] | null | undefined): number | null {
  const active = (tariffs ?? []).filter((t) => t.is_active !== false && t.valid_on == null);
  if (active.length === 0) return null;
  const sum = active.reduce((acc, t) => acc + tariffSlotPrice(t), 0);
  return Math.round(sum / active.length);
}

export interface SlotTariffQuote {
  /** Slot başına fiyat (saatlik değil). */
  price: number;
  deposit: number;
  tariffId?: string;
  /** Bu tarifenin slot süresi (dakika). Maçın süresi buradan gelir. */
  slotMinutes: number;
}

/** slot_price yoksa eski price_per_hour alanından okur. */
export function tariffSlotPrice(t: TariffLike): number {
  return Number(t.slot_price ?? t.price_per_hour ?? 0) || 0;
}

/**
 * Belirli tarih + saat dilimi için geçerli tarife. Sunucudaki
 * get_current_tariff_price ile BİREBİR aynı mantık:
 * 1) Tarih-özel tarife (valid_on = tarih) HER ŞEYE üstün gelir — takvimden
 *    girilen özel fiyat yalnız o gün geçerlidir, diğer günlerde hiç uygulanmaz.
 * 2) Saha-özel tarife (court_id = courtId) tesis-geneline (court_id null) üstün.
 * 3) Aynı kapsamda tarife tipi önceliği (HOLIDAY>WEEKEND>WEEKDAY>SPECIAL).
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
  const isDateSpecific = (t: TariffLike) => t.valid_on != null && t.valid_on !== '';
  const matches = tariffs
    .filter((t) => t.is_active !== false)
    .filter((t) => t.court_id == null || (courtId != null && t.court_id === courtId))
    // Tarih-özel tarife yalnız kendi tarihinde geçerli; diğer günlerde elenir.
    .filter((t) => !isDateSpecific(t) || t.valid_on === bookingDateISO)
    .filter((t) => (t.applies_to_days ?? []).includes(dow))
    .filter((t) => timeMatchesTariff(startTime, t))
    .sort((a, b) => {
      // 1) Tarih-özel önce, 2) saha-özel, 3) tip önceliği, 4) deterministik tiebreak (id).
      const dateRank = (isDateSpecific(a) ? 0 : 1) - (isDateSpecific(b) ? 0 : 1);
      if (dateRank !== 0) return dateRank;
      const courtRank = (isCourtSpecific(a) ? 0 : 1) - (isCourtSpecific(b) ? 0 : 1);
      if (courtRank !== 0) return courtRank;
      const typeRank = (TARIFF_PRIORITY[a.tariff_type] ?? 9) - (TARIFF_PRIORITY[b.tariff_type] ?? 9);
      if (typeRank !== 0) return typeRank;
      return String(a.id ?? '').localeCompare(String(b.id ?? ''));
    });

  if (matches.length === 0) return null;
  const hit = matches[0];
  return {
    price: tariffSlotPrice(hit),
    deposit: Number(hit.deposit_amount ?? 0),
    tariffId: hit.id,
    slotMinutes: normalizeSlotMinutes(hit.slot_minutes),
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
    slot_price: tariffSlotPrice(t),
    slot_minutes: normalizeSlotMinutes(t.slot_minutes),
    deposit_amount: Number(t.deposit_amount ?? 0),
    is_active: t.is_active !== false,
    sort_order: t.sort_order ?? idx,
    valid_on: t.valid_on ?? null,
  }));
}
