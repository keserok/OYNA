import { describe, it, expect } from 'vitest';
import { buildFacilityDayGrid, windowHours } from '../../shared/facilityScheduleModel';
import type {
  FacilitySchedule, ScheduleBooking, ScheduleClosure, ScheduleHold, ScheduleCourt,
} from '../../services/facilitySchedule';

// 2026-07-20 = Pazartesi (ISODOW 1)
const MON = '2026-07-20';

const court = (id: string, name: string): ScheduleCourt => ({ id, name, court_type: 'OPEN' });

const booking = (over: Partial<ScheduleBooking>): ScheduleBooking => ({
  id: over.id ?? 'b1', court_id: over.court_id ?? 'c1',
  booking_date: over.booking_date ?? MON,
  start_time: over.start_time ?? '20:00', end_time: over.end_time ?? '21:00',
  status: over.status ?? 'CONFIRMED', source: over.source ?? 'OWNER_MANUAL',
  price: 1000, paid_amount: 0, payment_status: 'PENDING',
  customer_name: over.customer_name ?? 'Müşteri', customer_phone: null, title: null,
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

const cellAt = (grid: ReturnType<typeof buildFacilityDayGrid>, courtId: string, hour: number) =>
  grid.courts.find((c) => c.courtId === courtId)!.cells.find((c) => c.hour === hour)!;

describe('windowHours', () => {
  it('normal pencere 08:00-00:00 → 8..23', () => {
    expect(windowHours('08:00', '00:00')).toEqual([8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23]);
  });
  it('gece-taşan 08:00-02:00 → 8..23,0,1', () => {
    const h = windowHours('08:00', '02:00');
    expect(h[0]).toBe(8); expect(h[h.length - 1]).toBe(1);
    expect(h).toContain(0); expect(h).toContain(1);
  });
});

describe('buildFacilityDayGrid — rezervasyon', () => {
  it('tek saat rezervasyon → başlangıçta BOOKED, continuation değil', () => {
    const g = buildFacilityDayGrid(mk({ bookings: [booking({ start_time: '20:00', end_time: '21:00' })] }), MON);
    expect(cellAt(g, 'c1', 20).status).toBe('BOOKED');
    expect(cellAt(g, 'c1', 20).isContinuation).toBe(false);
    expect(cellAt(g, 'c1', 21).status).toBe('AVAILABLE');
  });

  it('çok-saat rezervasyon 20:00-22:00 → 20 başlangıç, 21 continuation, 22 boş', () => {
    const g = buildFacilityDayGrid(mk({ bookings: [booking({ start_time: '20:00', end_time: '22:00' })] }), MON);
    expect(cellAt(g, 'c1', 20).isContinuation).toBe(false);
    expect(cellAt(g, 'c1', 21).status).toBe('BOOKED');
    expect(cellAt(g, 'c1', 21).isContinuation).toBe(true);
    expect(cellAt(g, 'c1', 22).status).toBe('AVAILABLE');
  });

  it('PENDING rezervasyon → PENDING hücre', () => {
    const g = buildFacilityDayGrid(mk({ bookings: [booking({ status: 'PENDING', start_time: '19:00', end_time: '20:00' })] }), MON);
    expect(cellAt(g, 'c1', 19).status).toBe('PENDING');
  });

  it('gece-taşan rezervasyon 23:00-01:00 (pencere 08:00-02:00) → 23 ve 0 dolu, 1 boş', () => {
    const g = buildFacilityDayGrid(
      mk({ pitch: { working_hours: { open: '08:00', close: '02:00' } } as any,
           bookings: [booking({ start_time: '23:00', end_time: '01:00' })] }), MON);
    expect(cellAt(g, 'c1', 23).status).toBe('BOOKED');
    expect(cellAt(g, 'c1', 0).status).toBe('BOOKED');
    expect(cellAt(g, 'c1', 0).isContinuation).toBe(true);
    expect(cellAt(g, 'c1', 1).status).toBe('AVAILABLE');
  });
});

describe('buildFacilityDayGrid — çok-kort', () => {
  const threeCourts = [court('c1', 'K1'), court('c2', 'K2'), court('c3', 'K3')];

  it('bir kortta rezervasyon diğer kortları etkilemez', () => {
    const g = buildFacilityDayGrid(mk({ courts: threeCourts, bookings: [booking({ court_id: 'c1', start_time: '20:00', end_time: '21:00' })] }), MON);
    expect(cellAt(g, 'c1', 20).status).toBe('BOOKED');
    expect(cellAt(g, 'c2', 20).status).toBe('AVAILABLE');
    expect(cellAt(g, 'c3', 20).status).toBe('AVAILABLE');
  });
});

describe('buildFacilityDayGrid — kapanışlar', () => {
  const threeCourts = [court('c1', 'K1'), court('c2', 'K2'), court('c3', 'K3')];
  const closure = (over: Partial<ScheduleClosure>): ScheduleClosure => ({
    id: over.id ?? 'e1', court_id: over.court_id ?? null,
    is_recurring: over.is_recurring ?? false,
    exception_date: over.exception_date ?? MON, day_of_week: over.day_of_week ?? null,
    start_time: over.start_time ?? null, end_time: over.end_time ?? null, reason: null,
  });

  it('tüm-gün kapanış (start null, court null) → tüm kortlar tüm saatler CLOSED', () => {
    const g = buildFacilityDayGrid(mk({ courts: threeCourts, closures: [closure({ start_time: null })] }), MON);
    for (const c of ['c1','c2','c3']) for (const h of [10, 20, 23]) expect(cellAt(g, c, h).status).toBe('CLOSED');
  });

  it('tek-kort kapanışı yalnız o korta uygulanır (yanlış-negatif yok)', () => {
    const g = buildFacilityDayGrid(mk({ courts: threeCourts, closures: [closure({ court_id: 'c2', start_time: '20:00', end_time: '21:00' })] }), MON);
    expect(cellAt(g, 'c2', 20).status).toBe('CLOSED');
    expect(cellAt(g, 'c1', 20).status).toBe('AVAILABLE');
    expect(cellAt(g, 'c3', 20).status).toBe('AVAILABLE');
  });

  it('tesis-geneli (court null) saat kapanışı tüm kortları o saatte kapatır', () => {
    const g = buildFacilityDayGrid(mk({ courts: threeCourts, closures: [closure({ court_id: null, start_time: '20:00', end_time: '21:00' })] }), MON);
    for (const c of ['c1','c2','c3']) expect(cellAt(g, c, 20).status).toBe('CLOSED');
    expect(cellAt(g, 'c1', 19).status).toBe('AVAILABLE');
  });

  it('tekrarlayan kapanış yalnız eşleşen day_of_week gününde (Pzt=1)', () => {
    const recMon = mk({ closures: [closure({ is_recurring: true, day_of_week: 1, exception_date: null, start_time: '20:00', end_time: '21:00' })] });
    expect(cellAt(buildFacilityDayGrid(recMon, MON), 'c1', 20).status).toBe('CLOSED'); // Pazartesi
    expect(cellAt(buildFacilityDayGrid(recMon, '2026-07-21'), 'c1', 20).status).toBe('AVAILABLE'); // Salı
  });
});

describe('buildFacilityDayGrid — hold + doluluk + kapalı gün', () => {
  it('canlı hold → HOLD hücre', () => {
    const holds: ScheduleHold[] = [{ court_id: 'c1', booking_date: MON, start_time: '20:00', is_mine: false }];
    const g = buildFacilityDayGrid(mk({ holds }), MON);
    expect(cellAt(g, 'c1', 20).status).toBe('HOLD');
  });

  it('doluluk %: 3 kort × 16 saat = 48 slot; 2 saatlik rezervasyon = 2 dolu → 4%', () => {
    const g = buildFacilityDayGrid(mk({
      courts: [court('c1','K1'), court('c2','K2'), court('c3','K3')],
      bookings: [booking({ court_id: 'c1', start_time: '20:00', end_time: '22:00' })],
    }), MON);
    expect(g.openHours).toBe(16);
    expect(g.bookedHours).toBe(2);
    expect(g.occupancyPercent).toBe(Math.round((2 / 48) * 100)); // 4
  });

  it('kapalı gün → hours boş, closed true, doluluk 0', () => {
    const g = buildFacilityDayGrid(mk({ pitch: { working_hours: [{ name: 'Pazartesi', closed: true }] } as any }), MON);
    expect(g.closed).toBe(true);
    expect(g.hours).toHaveLength(0);
    expect(g.occupancyPercent).toBe(0);
  });
});
