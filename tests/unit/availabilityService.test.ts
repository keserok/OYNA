import { describe, it, expect } from 'vitest';
import {
  toISODate,
  addDays,
  normalizeTime,
  parseSlotLabel,
  formatSlotLabel,
  generateSlotRanges,
  buildAvailabilitySlots,
  filterSlotsByDayNight,
  ownerHourToBookingTimes,
  dbTimeToOwnerHour,
  dbTimeToDisplayHour,
  PitchBookingRow,
} from '../../services/availabilityService';
import type { Pitch } from '../../types';

describe('toISODate', () => {
  it('tarihi YYYY-MM-DD formatına çevirir', () => {
    const d = new Date(2026, 6, 11); // 11 Temmuz 2026 (ay 0-indeksli)
    expect(toISODate(d)).toBe('2026-07-11');
  });
});

describe('addDays', () => {
  it('tarihe gün ekler', () => {
    const base = new Date(2026, 6, 11);
    const added = addDays(base, 5);
    expect(toISODate(added)).toBe('2026-07-16');
  });

  it('negatif gün çıkarır', () => {
    const base = new Date(2026, 6, 11);
    const subtracted = addDays(base, -2);
    expect(toISODate(subtracted)).toBe('2026-07-09');
  });
});

describe('normalizeTime', () => {
  it('noktalı veya eksik sıfırlı saatleri HH:MM formatına çevirir', () => {
    expect(normalizeTime('9.00')).toBe('09:00');
    expect(normalizeTime('18:30 ')).toBe('18:30');
    expect(normalizeTime('8')).toBe('08:00');
  });
});

describe('parseSlotLabel ve formatSlotLabel', () => {
  it('etiketi ayrıştırır', () => {
    const parsed = parseSlotLabel('09:00 - 10:00');
    expect(parsed.startTime).toBe('09:00');
    expect(parsed.endTime).toBe('10:00');
  });

  it('saat aralığını biçimlendirir', () => {
    expect(formatSlotLabel('9:00', '10:00')).toBe('09:00 - 10:00');
  });
});

describe('generateSlotRanges', () => {
  it('varsayılan saatler ile 1 saatlik aralıklar üretir', () => {
    const ranges = generateSlotRanges({ open: '08:00', close: '11:00', slotDuration: 60 });
    expect(ranges).toHaveLength(3);
    expect(ranges[0]).toEqual({ startTime: '08:00', endTime: '09:00' });
    expect(ranges[2]).toEqual({ startTime: '10:00', endTime: '11:00' });
  });

  it('gece yarısını aşan saatleri destekler', () => {
    const ranges = generateSlotRanges({ open: '23:00', close: '02:00', slotDuration: 60 });
    expect(ranges).toHaveLength(3);
    expect(ranges[0]).toEqual({ startTime: '23:00', endTime: '00:00' });
    expect(ranges[1]).toEqual({ startTime: '00:00', endTime: '01:00' });
    expect(ranges[2]).toEqual({ startTime: '01:00', endTime: '02:00' });
  });
});

describe('filterSlotsByDayNight', () => {
  const slots = [
    { label: '08:00 - 09:00', startTime: '08:00', endTime: '09:00', status: 'available' as const },
    { label: '17:00 - 18:00', startTime: '17:00', endTime: '18:00', status: 'available' as const },
    { label: '18:00 - 19:00', startTime: '18:00', endTime: '19:00', status: 'available' as const },
    { label: '23:00 - 00:00', startTime: '23:00', endTime: '00:00', status: 'available' as const },
  ];

  it('DAY modu (06:00 - 18:00) slotları filtreler', () => {
    const daySlots = filterSlotsByDayNight(slots, 'DAY');
    expect(daySlots).toHaveLength(2);
    expect(daySlots[0].startTime).toBe('08:00');
    expect(daySlots[1].startTime).toBe('17:00');
  });

  it('NIGHT modu (18:00 - 06:00) slotları filtreler', () => {
    const nightSlots = filterSlotsByDayNight(slots, 'NIGHT');
    expect(nightSlots).toHaveLength(2);
    expect(nightSlots[0].startTime).toBe('18:00');
    expect(nightSlots[1].startTime).toBe('23:00');
  });
});

describe('ownerHourToBookingTimes, dbTimeToOwnerHour ve dbTimeToDisplayHour', () => {
  it('saat etiketini rezervasyon başlangıç bitişine çevirir', () => {
    const times = ownerHourToBookingTimes('17.00');
    expect(times.start_time).toBe('17:00:00');
    expect(times.end_time).toBe('18:00:00');
  });

  it('veritabanı saatini owner saatine çevirir', () => {
    expect(dbTimeToOwnerHour('17:00:00')).toBe('17.00');
  });

  it('veritabanı saatini gösterim saatine çevirir', () => {
    expect(dbTimeToDisplayHour('17:00:00')).toBe('17:00');
  });
});

describe('buildAvailabilitySlots', () => {
  const mockPitch = {
    id: 'p1',
    name: 'Saha A',
    totalPrice: 1000,
    workingHours: { open: '09:00', close: '12:00', slotDuration: 60 },
    tariffs: [],
  } as unknown as Pitch;

  it('hiç rezervasyon yoksa tüm slotları available yapar', () => {
    const slots = buildAvailabilitySlots(mockPitch, '2026-07-13', []);
    expect(slots).toHaveLength(3);
    expect(slots[0].status).toBe('available');
    expect(slots[0].price).toBe(1000);
  });

  it('CONFIRMED rezervasyon varsa o slotu booked yapar', () => {
    const bookings: PitchBookingRow[] = [
      {
        id: 'b1',
        pitch_id: 'p1',
        booking_date: '2026-07-13',
        start_time: '10:00:00',
        end_time: '11:00:00',
        status: 'CONFIRMED',
      },
    ];
    const slots = buildAvailabilitySlots(mockPitch, '2026-07-13', bookings);
    expect(slots).toHaveLength(3);
    expect(slots[0].status).toBe('available'); // 09:00 - 10:00
    expect(slots[1].status).toBe('booked');    // 10:00 - 11:00
    expect(slots[1].bookingId).toBe('b1');
    expect(slots[2].status).toBe('available'); // 11:00 - 12:00
  });

  it('PENDING rezervasyon varsa o slotu pending yapar', () => {
    const bookings: PitchBookingRow[] = [
      {
        id: 'b2',
        pitch_id: 'p1',
        booking_date: '2026-07-13',
        start_time: '10:00:00',
        end_time: '11:00:00',
        status: 'PENDING',
      },
    ];
    const slots = buildAvailabilitySlots(mockPitch, '2026-07-13', bookings);
    expect(slots[1].status).toBe('pending');
    expect(slots[1].bookingId).toBe('b2');
  });

  it('saha kapalı ise boş dizi döner', () => {
    const closedPitch = {
      ...mockPitch,
      workingHoursRaw: [{ name: 'Pazartesi', closed: true }],
    } as unknown as Pitch;
    const slots = buildAvailabilitySlots(closedPitch, '2026-07-13', []); // 2026-07-13 is a Monday
    expect(slots).toHaveLength(0);
  });
});
