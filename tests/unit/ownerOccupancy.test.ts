import { describe, it, expect } from 'vitest';
import {
  buildHourlyOccupancyGrid,
  computeCourtDailyStats,
  computeOverallOccupancy,
} from '../../services/pitchOwnerService';
import type { PitchBookingFull } from '../../types';

// B4: saat-bazlı doluluk — çok-saatlik rezervasyon kapladığı TÜM saatleri işaretler,
// doluluk yüzdesi rezervasyon SAYISI değil kapladığı SAAT toplamıdır.

function booking(partial: Partial<PitchBookingFull>): PitchBookingFull {
  return {
    id: 'b',
    court_id: 'c1',
    start_time: '20:00',
    end_time: '22:00',
    status: 'CONFIRMED',
    source: 'OWNER_MANUAL',
    price: 1000,
    paid_amount: 0,
    ...partial,
  } as PitchBookingFull;
}

describe('buildHourlyOccupancyGrid (B4)', () => {
  it('20:00-22:00 rezervasyon hem 20 hem 21 hücresini doldurur, 22 boş kalır', () => {
    const grid = buildHourlyOccupancyGrid([booking({})], [{ id: 'c1', name: 'A' }]);
    const at = (h: number) => grid[h].pitches[0];
    expect(at(19)).toBeNull();
    expect(at(20)).toBe('DAILY');
    expect(at(21)).toBe('DAILY');
    expect(at(22)).toBeNull();
  });

  it("gece yarısı bitişi (23:00-00:00) yalnız 23'ü doldurur", () => {
    const grid = buildHourlyOccupancyGrid(
      [booking({ start_time: '23:00', end_time: '00:00' })],
      [{ id: 'c1', name: 'A' }],
    );
    expect(grid[23].pitches[0]).toBe('DAILY');
    expect(grid[22].pitches[0]).toBeNull();
  });

  it('iptal edilen rezervasyon doluluğa sayılmaz', () => {
    const grid = buildHourlyOccupancyGrid(
      [booking({ status: 'CANCELLED' })],
      [{ id: 'c1', name: 'A' }],
    );
    expect(grid[20].pitches[0]).toBeNull();
  });

  it('abonelik SUB olarak işaretlenir', () => {
    const grid = buildHourlyOccupancyGrid(
      [booking({ source: 'SUBSCRIPTION' })],
      [{ id: 'c1', name: 'A' }],
    );
    expect(grid[20].pitches[0]).toBe('SUB');
  });
});

describe('computeOverallOccupancy (B4)', () => {
  it('2 saatlik tek rezervasyon 2 saat sayılır (16 saat pencere → %13)', () => {
    expect(computeOverallOccupancy([booking({})], 1, 16)).toBe(13);
  });

  it('rezervasyon SAYISI değil SAAT toplamı — iki 1 saatlik = iki 2 saatlik değil', () => {
    const oneHourA = booking({ id: 'a', start_time: '20:00', end_time: '21:00' });
    const oneHourB = booking({ id: 'b', start_time: '21:00', end_time: '22:00' });
    // 2 saat / 16 = %13 (eski kod 2 rezervasyon/16 ile aynı çıkardı ama 2 saatlik
    // tek rezervasyonda ESKİ kod %6, YENİ kod %13 verir — asıl düzeltme orada)
    expect(computeOverallOccupancy([oneHourA, oneHourB], 1, 16)).toBe(13);
  });

  it('iptal sayılmaz', () => {
    expect(computeOverallOccupancy([booking({ status: 'CANCELLED' })], 1, 16)).toBe(0);
  });
});

describe('computeCourtDailyStats (B4)', () => {
  it('bookedHours kapladığı saat toplamıdır (rezervasyon sayısı değil)', () => {
    const stats = computeCourtDailyStats([booking({})], [{ id: 'c1', name: 'A' }], 16);
    expect(stats[0].bookedHours).toBe(2);
    expect(stats[0].occupancyPercent).toBe(13);
  });
});
