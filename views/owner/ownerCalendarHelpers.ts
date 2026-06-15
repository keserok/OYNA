import type { FlashDeal, PitchAvailabilityException } from '../../types';

export interface TariffLike {
  startTime: string;
  endTime: string;
  price?: number;
  price_per_hour?: number;
}

export function slotKeyToTime(key: string): string {
  return key.replace('.', ':');
}

export function normalizeTime(t: string): string {
  const parts = t.split(':');
  const h = parts[0]?.padStart(2, '0') ?? '00';
  const m = (parts[1] ?? '00').padStart(2, '0');
  return `${h}:${m}`;
}

export function resolveHourlyPrice(hour: number, pricingPolicy?: TariffLike[]): number {
  if (pricingPolicy?.length) {
    const matched = pricingPolicy.find((p) => {
      const startH = parseInt(p.startTime.split(':')[0], 10);
      let endH = parseInt(p.endTime.split(':')[0], 10);
      if (endH === 0) endH = 24;
      if (startH <= endH) return hour >= startH && hour < endH;
      return hour >= startH || hour < endH;
    });
    if (matched) return matched.price ?? matched.price_per_hour ?? 2000;
  }
  if (hour >= 18 && hour < 23) return 3200;
  if (hour >= 13 && hour < 16) return 2000;
  return 2000;
}

export function findFlashDealForSlot(
  timeKey: string,
  courtId: string,
  flashDeals: FlashDeal[],
): FlashDeal | undefined {
  const slotTime = normalizeTime(slotKeyToTime(timeKey));
  return flashDeals.find(
    (d) =>
      (!d.court_id || d.court_id === courtId) &&
      normalizeTime(d.start_time) === slotTime,
  );
}

export function isSlotClosed(
  timeKey: string,
  courtId: string,
  exceptions: PitchAvailabilityException[],
): boolean {
  const hour = parseInt(timeKey.split('.')[0], 10);
  const slotStart = hour * 60;
  const slotEnd = slotStart + 60;

  return exceptions.some((ex) => {
    if (ex.court_id && ex.court_id !== courtId) return false;
    if (!ex.start_time && !ex.end_time) return true;

    const startParts = (ex.start_time ?? '00:00').split(':');
    const endParts = (ex.end_time ?? '23:59').split(':');
    const exStart = parseInt(startParts[0], 10) * 60 + parseInt(startParts[1] ?? '0', 10);
    const exEnd = parseInt(endParts[0], 10) * 60 + parseInt(endParts[1] ?? '0', 10);

    return slotStart < exEnd && slotEnd > exStart;
  });
}

export function addMonthsISO(isoDate: string, months: number): string {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}
