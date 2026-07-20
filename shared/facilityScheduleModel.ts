// ─── OW-E (P4) — Tesis takvimi saf birleştirme modeli ────────────────────────
// get_facility_schedule ham çıktısını (kortlar + rezervasyonlar + kapanışlar +
// hold'lar) belirli bir GÜN için kort×saat ızgarasına çevirir. UI'dan bağımsız,
// unit-testli. Gerçek doluluk %, çok-saat span, gece-taşan rezervasyon, tekrarlayan
// (day_of_week) + tüm-gün + kort-özel kapanış, canlı hold burada çözülür.
import { resolveWorkingHoursForDate } from './workingHours';
import type {
  FacilitySchedule, ScheduleBooking, ScheduleClosure,
} from '../services/facilitySchedule';

export type CellStatus = 'AVAILABLE' | 'BOOKED' | 'PENDING' | 'CLOSED' | 'HOLD';

export interface GridCell {
  hour: number;          // 0-23 (görüntülenen saat)
  time: string;          // 'HH:00'
  status: CellStatus;
  isContinuation: boolean; // çok-saatlik rezervasyonun başlangıç-olmayan saati
  booking?: ScheduleBooking;
}

export interface CourtColumn {
  courtId: string;
  courtName: string;
  cells: GridCell[];
}

export interface FacilityDayGrid {
  dateISO: string;
  closed: boolean;
  hours: number[];       // çalışma penceresi saatleri (gece yarısını aşabilir)
  courts: CourtColumn[];
  occupancyPercent: number;
  bookedHours: number;
  openHours: number;
}

const hourOf = (hm: string): number => parseInt(hm.slice(0, 2), 10);

/** ISODOW: 1=Pazartesi … 7=Pazar (recurring kapanışların day_of_week'iyle aynı). */
function isoDow(dateISO: string): number {
  const d = new Date(dateISO + 'T00:00:00');
  const js = d.getDay(); // 0=Paz … 6=Cmt
  return js === 0 ? 7 : js;
}

/** Çalışma penceresi saat listesi; kapanış açılıştan küçük/eşitse gece yarısını aşar. */
export function windowHours(open: string, close: string): number[] {
  const oh = hourOf(open);
  let ch = hourOf(close);
  if (ch <= oh) ch += 24;
  const out: number[] = [];
  for (let h = oh; h < ch; h++) out.push(h % 24);
  return out;
}

/**
 * Bir zaman aralığının (start,end) belirli bir saati kapsayıp kapsamadığı —
 * çalışma penceresinin açılış saatine göre LİNEER normalize edilerek (gece-taşan
 * rezervasyon ve gece-yarısı sonrası saatler doğru hesaplanır).
 */
function spanCoversHour(startHM: string, endHM: string | null, hour: number, openHour: number): boolean {
  const lin = (h: number) => (h >= openHour ? h : h + 24);
  const sH = hourOf(startHM);
  const eRaw = endHM ? hourOf(endHM) : sH + 1;
  let sLin = lin(sH);
  let eLin = lin(eRaw);
  if (eLin <= sLin) eLin += 24; // aralığın kendi gece-taşması
  const hLin = lin(hour);
  return hLin >= sLin && hLin < eLin;
}

/** Kapanış bu gün + saati kapsıyor mu? (tekrarlayan/tek-seferlik + tüm-gün). */
function closureCoversHour(c: ScheduleClosure, dateISO: string, dow: number, hour: number, openHour: number): boolean {
  if (c.is_recurring) {
    if (c.day_of_week !== dow) return false;
  } else if (c.exception_date !== dateISO) {
    return false;
  }
  if (!c.start_time) return true; // tüm gün kapalı
  return spanCoversHour(c.start_time, c.end_time, hour, openHour);
}

function bookingStatusToCell(status: string): CellStatus {
  return status === 'PENDING' ? 'PENDING' : 'BOOKED';
}

/** Belirli bir GÜN için tesis kort×saat ızgarası. */
export function buildFacilityDayGrid(schedule: FacilitySchedule, dateISO: string): FacilityDayGrid {
  const wh = resolveWorkingHoursForDate(schedule.pitch?.working_hours, dateISO);
  const hours = wh.closed ? [] : windowHours(wh.open, wh.close);
  const openHour = hours.length ? hourOf(wh.open) : 0;
  const dow = isoDow(dateISO);
  const courts = schedule.courts ?? [];

  // Bu güne ait rezervasyonlar (booking_date eşit) — kort bazlı indeksle.
  const dayBookings = (schedule.bookings ?? []).filter((b) => b.booking_date === dateISO);
  const holdsHere = new Set(
    (schedule.holds ?? [])
      .filter((h) => h.booking_date === dateISO)
      .map((h) => `${h.court_id ?? '*'}@${h.start_time}`),
  );

  let bookedHours = 0;

  const courtColumns: CourtColumn[] = courts.map((court) => {
    const cells: GridCell[] = hours.map((hour) => {
      const time = `${String(hour).padStart(2, '0')}:00`;

      // 1) Rezervasyon (kort eşleşen; kort_id null = legacy tek-kort → tüm kortlara say)
      const booking = dayBookings.find(
        (b) => (b.court_id === court.id || b.court_id == null) && spanCoversHour(b.start_time, b.end_time, hour, openHour),
      );
      if (booking) {
        const isStart = hourOf(booking.start_time) === hour;
        return {
          hour, time,
          status: bookingStatusToCell(booking.status),
          isContinuation: !isStart,
          booking,
        };
      }

      // 2) Kapanış (kort-özel veya tesis-geneli court_id null)
      const closed = (schedule.closures ?? []).some(
        (c) => (c.court_id === court.id || c.court_id == null) && closureCoversHour(c, dateISO, dow, hour, openHour),
      );
      if (closed) return { hour, time, status: 'CLOSED', isContinuation: false };

      // 3) Canlı hold (oyuncu tam alırken)
      if (holdsHere.has(`${court.id}@${time}`) || holdsHere.has(`*@${time}`)) {
        return { hour, time, status: 'HOLD', isContinuation: false };
      }

      return { hour, time, status: 'AVAILABLE', isContinuation: false };
    });
    return { courtId: court.id, courtName: court.name, cells };
  });

  // Gerçek doluluk: dolu (rezervasyon) hücre / (kort × açık saat).
  for (const col of courtColumns) {
    for (const cell of col.cells) {
      if (cell.status === 'BOOKED' || cell.status === 'PENDING') bookedHours += 1;
    }
  }
  const openHours = hours.length;
  const totalSlots = courts.length * openHours;
  const occupancyPercent = totalSlots > 0 ? Math.min(100, Math.round((bookedHours / totalSlots) * 100)) : 0;

  return {
    dateISO,
    closed: wh.closed,
    hours,
    courts: courtColumns,
    occupancyPercent,
    bookedHours,
    openHours,
  };
}
