// ─── OW-E (P4) — Tesis HAFTA görünümü saf modeli ─────────────────────────────
// get_facility_schedule'ın bir HAFTALIK ham çıktısını (≤31 gün penceresi) alır ve
// kort×7-gün doluluk ızgarasına çevirir. Gün başına ve kort başına gerçek doluluk %
// hesaplar. buildFacilityDayGrid'i tekrar kullanır (tek kaynak) — gün mantığı
// (gece-taşan, çok-saat span, kapanış, hold) orada zaten test edildi.
import { buildFacilityDayGrid } from './facilityScheduleModel';
import type { FacilitySchedule } from '../services/facilitySchedule';

export interface WeekCourtCell {
  courtId: string;
  courtName: string;
  occupancyPercent: number;
  bookedHours: number;
}

export interface WeekDay {
  dateISO: string;
  dow: number;          // ISODOW 1-7
  closed: boolean;
  occupancyPercent: number; // gün geneli (tüm kortlar)
  bookedHours: number;
  openHours: number;
  courts: WeekCourtCell[];
}

export interface FacilityWeekGrid {
  weekStartISO: string;
  courts: { courtId: string; courtName: string }[];
  days: WeekDay[];
  busiestDayISO: string | null;
}

/** dateISO + n gün → yerel takvim ISO (UTC kaymasız). */
export function addDaysISO(dateISO: string, n: number): string {
  const d = new Date(dateISO + 'T00:00:00');
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Verilen günün içinde bulunduğu haftanın Pazartesi'si (ISO hafta başı). */
export function weekStartISO(dateISO: string): string {
  const d = new Date(dateISO + 'T00:00:00');
  const js = d.getDay();           // 0=Paz … 6=Cmt
  const isoDow = js === 0 ? 7 : js; // 1=Pzt … 7=Paz
  return addDaysISO(dateISO, -(isoDow - 1));
}

function isoDowOf(dateISO: string): number {
  const js = new Date(dateISO + 'T00:00:00').getDay();
  return js === 0 ? 7 : js;
}

/** Bir günün kort-bazlı doluluğu (buildFacilityDayGrid çıktısından). */
function perCourtOccupancy(dayGrid: ReturnType<typeof buildFacilityDayGrid>): WeekCourtCell[] {
  const openHours = dayGrid.openHours;
  return dayGrid.courts.map((col) => {
    let booked = 0;
    for (const cell of col.cells) {
      if (cell.status === 'BOOKED' || cell.status === 'PENDING') booked += 1;
    }
    return {
      courtId: col.courtId,
      courtName: col.courtName,
      bookedHours: booked,
      occupancyPercent: openHours > 0 ? Math.min(100, Math.round((booked / openHours) * 100)) : 0,
    };
  });
}

/** weekStart (Pazartesi) 'ten başlayarak 7 günlük kort×gün doluluk ızgarası. */
export function buildFacilityWeekGrid(schedule: FacilitySchedule, weekStart: string): FacilityWeekGrid {
  const days: WeekDay[] = [];
  let busiestDayISO: string | null = null;
  let busiestPct = -1;

  for (let i = 0; i < 7; i++) {
    const dateISO = addDaysISO(weekStart, i);
    const dayGrid = buildFacilityDayGrid(schedule, dateISO);
    const day: WeekDay = {
      dateISO,
      dow: isoDowOf(dateISO),
      closed: dayGrid.closed,
      occupancyPercent: dayGrid.occupancyPercent,
      bookedHours: dayGrid.bookedHours,
      openHours: dayGrid.openHours,
      courts: perCourtOccupancy(dayGrid),
    };
    days.push(day);
    if (!day.closed && day.occupancyPercent > busiestPct) {
      busiestPct = day.occupancyPercent;
      busiestDayISO = dateISO;
    }
  }

  return {
    weekStartISO: weekStart,
    courts: (schedule.courts ?? []).map((c) => ({ courtId: c.id, courtName: c.name })),
    days,
    busiestDayISO: busiestPct > 0 ? busiestDayISO : null,
  };
}
