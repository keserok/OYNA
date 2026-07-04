import { describe, it, expect } from 'vitest';
import { localDateISO } from '../../views/owner/ownerCalendarHelpers';

describe('localDateISO', () => {
  it('YEREL takvim gününü YYYY-MM-DD verir (UTC kayması yok)', () => {
    // TR (UTC+3) gece yarısını temsil eden yerel bir tarih: 3 Temmuz 00:30.
    // Eski `toISOString().slice(0,10)` bunu UTC'ye çevirip "2026-07-02" (önceki gün)
    // döndürüyordu; localDateISO yerel bileşenlerle doğru günü vermeli.
    const d = new Date(2026, 6, 3, 0, 30, 0); // ay 0-indeksli → 6 = Temmuz
    expect(localDateISO(d)).toBe('2026-07-03');
  });

  it('gün sonuna yakın yerel saatte de doğru gün', () => {
    const d = new Date(2026, 6, 3, 23, 45, 0);
    expect(localDateISO(d)).toBe('2026-07-03');
  });

  it('ay ve günü sıfır-dolgulu verir', () => {
    const d = new Date(2026, 0, 5, 12, 0, 0); // 5 Ocak
    expect(localDateISO(d)).toBe('2026-01-05');
  });

  it('argümansız çağrı bugünü YYYY-MM-DD formatında verir', () => {
    expect(localDateISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
