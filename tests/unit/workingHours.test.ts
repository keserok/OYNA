import { describe, it, expect } from 'vitest';
import {
  resolveWorkingHoursForDate,
  isHourWithinWorkingHours,
  openHourCount,
} from '../../shared/workingHours';

// 2026-07-13 Pazartesi, 2026-07-18 Cumartesi (kontrol için)
const MON = '2026-07-13';
const SAT = '2026-07-18';

const ownerArray = [
  { name: 'Pazartesi', open: '09:00', close: '00:00', closed: false },
  { name: 'Salı', open: '09:00', close: '00:00', closed: false },
  { name: 'Çarşamba', open: '09:00', close: '00:00', closed: false },
  { name: 'Perşembe', open: '09:00', close: '00:00', closed: false },
  { name: 'Cuma', open: '09:00', close: '02:00', closed: false },
  { name: 'Cumartesi', open: '10:00', close: '02:00', closed: true },
  { name: 'Pazar', open: '09:00', close: '00:00', closed: false },
];

describe('resolveWorkingHoursForDate — owner dizi şekli', () => {
  it('Pazartesi için doğru günün penceresini döndürür', () => {
    const r = resolveWorkingHoursForDate(ownerArray, MON);
    expect(r.open).toBe('09:00');
    expect(r.close).toBe('00:00');
    expect(r.closed).toBe(false);
  });

  it('kapalı günü closed=true olarak işaretler (Cumartesi)', () => {
    const r = resolveWorkingHoursForDate(ownerArray, SAT);
    expect(r.closed).toBe(true);
  });

  it('tek-nesne (eski) şekli de desteklenir', () => {
    const r = resolveWorkingHoursForDate({ open: '08:00', close: '23:00', slotDuration: 90 }, MON);
    expect(r.open).toBe('08:00');
    expect(r.close).toBe('23:00');
    expect(r.slotDuration).toBe(90);
  });

  it('boş/None → varsayılan 08:00-02:00', () => {
    expect(resolveWorkingHoursForDate(null, MON).open).toBe('08:00');
    expect(resolveWorkingHoursForDate([], MON).open).toBe('08:00');
  });
});

describe('isHourWithinWorkingHours', () => {
  it('09:00-00:00 penceresinde 8 dışarıda, 9 ve 23 içeride', () => {
    expect(isHourWithinWorkingHours(8, '09:00', '00:00')).toBe(false);
    expect(isHourWithinWorkingHours(9, '09:00', '00:00')).toBe(true);
    expect(isHourWithinWorkingHours(23, '09:00', '00:00')).toBe(true);
  });

  it('gece yarısını aşan 09:00-02:00: 0 ve 1 içeride, 2 dışarıda', () => {
    expect(isHourWithinWorkingHours(0, '09:00', '02:00')).toBe(true);
    expect(isHourWithinWorkingHours(1, '09:00', '02:00')).toBe(true);
    expect(isHourWithinWorkingHours(2, '09:00', '02:00')).toBe(false);
    expect(isHourWithinWorkingHours(9, '09:00', '02:00')).toBe(true);
  });
});

describe('openHourCount', () => {
  it('09:00-00:00 = 15 saat', () => {
    expect(openHourCount('09:00', '00:00')).toBe(15);
  });
  it('09:00-02:00 = 17 saat (gece yarısını aşar)', () => {
    expect(openHourCount('09:00', '02:00')).toBe(17);
  });
});
