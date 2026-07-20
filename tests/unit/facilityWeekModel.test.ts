import { describe, it, expect } from 'vitest';
import { buildFacilityWeekGrid, weekStartISO, addDaysISO } from '../../shared/facilityWeekModel';
import type { FacilitySchedule, ScheduleBooking, ScheduleCourt } from '../../services/facilitySchedule';

// 2026-07-20 = Pazartesi (ISODOW 1); hafta 20→26 Tem
const MON = '2026-07-20';

const court = (id: string, name: string): ScheduleCourt => ({ id, name, court_type: 'OPEN' });

const booking = (over: Partial<ScheduleBooking>): ScheduleBooking => ({
  id: over.id ?? 'b1', court_id: over.court_id ?? 'c1',
  booking_date: over.booking_date ?? MON,
  start_time: over.start_time ?? '20:00', end_time: over.end_time ?? '21:00',
  status: over.status ?? 'CONFIRMED', source: over.source ?? 'OWNER_MANUAL',
  price: 1000, paid_amount: 0, payment_status: 'PENDING',
  customer_name: 'X', customer_phone: null, title: null,
});

const mk = (over: Partial<FacilitySchedule>): FacilitySchedule => ({
  pitch: {
    id: 'p1', name: 'Tesis',
    working_hours: over.pitch?.working_hours ?? { open: '08:00', close: '00:00' },
    auto_approve_enabled: true, auto_approve_minutes: 35,
  },
  courts: over.courts ?? [court('c1', 'Kort 1')],
  bookings: over.bookings ?? [],
  closures: over.closures ?? [],
  holds: over.holds ?? [],
});

describe('addDaysISO / weekStartISO', () => {
  it('addDaysISO ay sınırını aşar', () => {
    expect(addDaysISO('2026-07-31', 1)).toBe('2026-08-01');
    expect(addDaysISO('2026-01-01', -1)).toBe('2025-12-31');
  });
  it('weekStartISO her günü o haftanın Pazartesi’sine indirger', () => {
    expect(weekStartISO('2026-07-20')).toBe('2026-07-20'); // Pzt
    expect(weekStartISO('2026-07-22')).toBe('2026-07-20'); // Çar
    expect(weekStartISO('2026-07-26')).toBe('2026-07-20'); // Paz
    expect(weekStartISO('2026-07-27')).toBe('2026-07-27'); // sonraki Pzt
  });
});

describe('buildFacilityWeekGrid', () => {
  it('7 gün üretir, doğru dow + tarih sırası', () => {
    const g = buildFacilityWeekGrid(mk({}), MON);
    expect(g.days).toHaveLength(7);
    expect(g.days[0].dateISO).toBe('2026-07-20');
    expect(g.days[0].dow).toBe(1);
    expect(g.days[6].dateISO).toBe('2026-07-26');
    expect(g.days[6].dow).toBe(7);
  });

  it('rezervasyonu doğru güne + korta yazar; diğer günler boş', () => {
    const g = buildFacilityWeekGrid(mk({
      courts: [court('c1', 'K1'), court('c2', 'K2')],
      bookings: [booking({ court_id: 'c1', booking_date: '2026-07-22', start_time: '20:00', end_time: '22:00' })],
    }), MON);
    const wed = g.days.find((d) => d.dateISO === '2026-07-22')!;
    expect(wed.bookedHours).toBe(2);
    const c1 = wed.courts.find((c) => c.courtId === 'c1')!;
    const c2 = wed.courts.find((c) => c.courtId === 'c2')!;
    expect(c1.bookedHours).toBe(2);
    expect(c2.bookedHours).toBe(0);
    // Pazartesi boş
    expect(g.days.find((d) => d.dateISO === '2026-07-20')!.bookedHours).toBe(0);
  });

  it('busiestDayISO en dolu günü işaret eder', () => {
    const g = buildFacilityWeekGrid(mk({
      bookings: [
        booking({ booking_date: '2026-07-21', start_time: '20:00', end_time: '21:00' }),      // 1 saat
        booking({ booking_date: '2026-07-23', start_time: '18:00', end_time: '22:00' }),      // 4 saat
      ],
    }), MON);
    expect(g.busiestDayISO).toBe('2026-07-23');
  });

  it('hiç rezervasyon yoksa busiestDayISO null', () => {
    const g = buildFacilityWeekGrid(mk({}), MON);
    expect(g.busiestDayISO).toBeNull();
  });

  it('kort başına doluluk % açık saate göre hesaplanır', () => {
    // pencere 08:00-00:00 = 16 saat; 4 saat dolu → 25%
    const g = buildFacilityWeekGrid(mk({
      bookings: [booking({ court_id: 'c1', booking_date: MON, start_time: '18:00', end_time: '22:00' })],
    }), MON);
    const mon = g.days[0];
    const c1 = mon.courts.find((c) => c.courtId === 'c1')!;
    expect(c1.bookedHours).toBe(4);
    expect(c1.occupancyPercent).toBe(25);
  });
});
