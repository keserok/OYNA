import type { Pitch } from '../types';
import { resolveTariffForSlot } from './tariffService';
import { resolveWorkingHoursForDate } from '../shared/workingHours';

export type SlotAvailabilityStatus = 'available' | 'booked' | 'closed' | 'pending';

export interface TimeSlotAvailability {
  label: string;
  startTime: string;
  endTime: string;
  status: SlotAvailabilityStatus;
  bookingId?: string;
  price?: number;
  deposit?: number;
}

export interface PitchBookingRow {
  id: string;
  pitch_id: string;
  court_id?: string | null;
  user_id?: string | null;
  title?: string | null;
  booking_date: string;
  start_time: string;
  end_time: string;
  status: string;
  source?: string | null;
  payment_status?: string | null;
  price?: number | null;
  metadata?: Record<string, unknown> | null;
}

const DEFAULT_WORKING_HOURS = { open: '08:00', close: '02:00', slotDuration: 60 };

export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

/** Haftalık takvim: 0 = Pazartesi … 6 = Pazar */
export function getWeekDateISO(dayIndex: number, base = new Date()): string {
  const day = base.getDay();
  const mondayDiff = day === 0 ? -6 : 1 - day;
  const monday = new Date(base);
  monday.setDate(base.getDate() + mondayDiff);
  const target = new Date(monday);
  target.setDate(monday.getDate() + dayIndex);
  return toISODate(target);
}

export function getWeekDayNumber(dayIndex: number, base = new Date()): number {
  const iso = getWeekDateISO(dayIndex, base);
  return parseInt(iso.split('-')[2], 10);
}

export function normalizeTime(t: string): string {
  const raw = t.trim().replace('.', ':');
  const parts = raw.split(':');
  const h = parts[0]?.padStart(2, '0') ?? '00';
  const m = (parts[1] ?? '00').padStart(2, '0');
  return `${h}:${m}`;
}

export function parseSlotLabel(label: string): { startTime: string; endTime: string } {
  const [start, end] = label.split('-').map(s => s.trim());
  return { startTime: normalizeTime(start), endTime: normalizeTime(end) };
}

export function formatSlotLabel(startTime: string, endTime: string): string {
  return `${normalizeTime(startTime)} - ${normalizeTime(endTime)}`;
}

function timeToMinutes(t: string): number {
  const [h, m] = normalizeTime(t).split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function isWithinWorkingHours(
  slotStartMins: number,
  open: string,
  close: string
): boolean {
  const openM = timeToMinutes(open);
  let closeM = timeToMinutes(close);
  if (closeM <= openM) closeM += 24 * 60;
  let slotM = slotStartMins;
  if (slotM < openM) slotM += 24 * 60;
  return slotM >= openM && slotM < closeM;
}

export function generateSlotRanges(
  workingHours?: { open?: string; close?: string; slotDuration?: number }
): { startTime: string; endTime: string }[] {
  const wh = { ...DEFAULT_WORKING_HOURS, ...workingHours };
  const duration = wh.slotDuration || 60;
  const ranges: { startTime: string; endTime: string }[] = [];
  const openM = timeToMinutes(wh.open);
  let closeM = timeToMinutes(wh.close);
  if (closeM <= openM) closeM += 24 * 60;

  for (let m = openM; m + duration <= closeM; m += duration) {
    const startTime = minutesToTime(m);
    const endTime = minutesToTime(m + duration);
    ranges.push({ startTime, endTime });
  }
  return ranges;
}

function bookingOverlapsSlot(
  booking: PitchBookingRow,
  slotStart: string,
  slotEnd: string
): boolean {
  const bStart = normalizeTime(String(booking.start_time).slice(0, 5));
  const bEnd = normalizeTime(String(booking.end_time).slice(0, 5));
  const s = timeToMinutes(slotStart);
  const e = timeToMinutes(slotEnd);
  const bs = timeToMinutes(bStart);
  const be = timeToMinutes(bEnd);
  return s < be && e > bs;
}

export function buildAvailabilitySlots(
  pitch: Pitch,
  bookingDate: string,
  bookings: PitchBookingRow[],
  courtId?: string | null
): TimeSlotAvailability[] {
  // TEK KAYNAK: ham working_hours'tan rezervasyon GÜNÜNE göre pencere çözümle
  // (owner gün-bazlı dizi kaydeder; eski tek-nesne şekli de desteklenir).
  const resolved = resolveWorkingHoursForDate(
    (pitch as { workingHoursRaw?: unknown }).workingHoursRaw ?? pitch.workingHours,
    bookingDate,
  );
  const wh = resolved.closed ? { open: resolved.open, close: resolved.open, slotDuration: resolved.slotDuration } : resolved;
  // Gün tamamen kapalıysa hiç bookable slot yok.
  const ranges = resolved.closed ? [] : generateSlotRanges(wh);
  const pitchBookings = bookings.filter(
    b =>
      b.pitch_id === pitch.id &&
      b.booking_date === bookingDate &&
      (b.status === 'CONFIRMED' || b.status === 'PENDING') &&
      (!courtId || !b.court_id || b.court_id === courtId)
  );

  return ranges.map(({ startTime, endTime }) => {
    const label = formatSlotLabel(startTime, endTime);
    const open = wh.open || DEFAULT_WORKING_HOURS.open;
    const close = wh.close || DEFAULT_WORKING_HOURS.close;

    if (!isWithinWorkingHours(timeToMinutes(startTime), open, close)) {
      return { label, startTime, endTime, status: 'closed' as const };
    }

    const quote = resolveTariffForSlot(pitch.tariffs, bookingDate, startTime);
    const slotPrice = quote?.price ?? pitch.totalPrice;
    const slotDeposit = quote?.deposit ?? 0;

    const hit = pitchBookings.find(b => bookingOverlapsSlot(b, startTime, endTime));
    if (!hit) {
      return {
        label,
        startTime,
        endTime,
        status: 'available' as const,
        price: slotPrice,
        deposit: slotDeposit,
      };
    }

    const status: SlotAvailabilityStatus =
      hit.status === 'PENDING' ? 'pending' : 'booked';

    return {
      label,
      startTime,
      endTime,
      status,
      bookingId: hit.id,
      price: hit.price ?? slotPrice,
      deposit: slotDeposit,
    };
  });
}

export function filterSlotsByDayNight(
  slots: TimeSlotAvailability[],
  mode: 'DAY' | 'NIGHT'
): TimeSlotAvailability[] {
  return slots.filter(s => {
    const hour = parseInt(s.startTime.split(':')[0], 10);
    if (mode === 'DAY') return hour >= 6 && hour < 18;
    return hour >= 18 || hour < 6;
  });
}

/** Owner takvim: "17.00" → DB start/end */
export function ownerHourToBookingTimes(hourLabel: string): {
  start_time: string;
  end_time: string;
} {
  const normalized = hourLabel.replace('.', ':');
  const hour = parseInt(normalized.split(':')[0], 10);
  const start = `${String(hour).padStart(2, '0')}:00:00`;
  const end = `${String((hour + 1) % 24).padStart(2, '0')}:00:00`;
  return { start_time: start, end_time: end };
}

export function dbTimeToOwnerHour(t: string): string {
  const h = normalizeTime(String(t).slice(0, 5)).split(':')[0];
  return `${h}.00`;
}

export function dbTimeToDisplayHour(t: string): string {
  return normalizeTime(String(t).slice(0, 5));
}

export const LOCAL_BOOKINGS_EVENT = 'oyna-pitch-bookings-changed';

export const notifyLocalBookingsChanged = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(LOCAL_BOOKINGS_EVENT));
  }
};
