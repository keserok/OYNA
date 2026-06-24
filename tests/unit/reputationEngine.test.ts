import { describe, it, expect } from 'vitest';
import { calculateElmas, calculateTeamKarat } from '../../utils/reputationEngine';

describe('calculateElmas', () => {
  it('dokümandaki örnek: 10 galibiyet / 20 maç = 50.000', () => {
    expect(calculateElmas(10, 20)).toBe(50000);
  });

  it('0 maç → 0', () => {
    expect(calculateElmas(0, 0)).toBe(0);
    expect(calculateElmas(5, 0)).toBe(0);
  });

  it('0 galibiyet → 0', () => {
    expect(calculateElmas(0, 10)).toBe(0);
  });

  it('flatModifier pozitif etki yapar', () => {
    const base = calculateElmas(10, 20);
    expect(calculateElmas(10, 20, 500)).toBe(base + 500);
  });

  it('hesaplanan değer negatif modifier ile 0 altına inmez', () => {
    // Math.max(0, ...) guard is on the computed path only
    expect(calculateElmas(10, 20, -9999999)).toBe(0);
  });

  it('100/100 galibiyet maksimum değer üretir', () => {
    const perfect = calculateElmas(100, 100);
    expect(perfect).toBeGreaterThan(calculateElmas(50, 100));
  });
});

describe('calculateTeamKarat', () => {
  it('kadro yok → 0', () => {
    expect(calculateTeamKarat([], 5, 10)).toBe(0);
  });

  it('0 maç → 0', () => {
    expect(calculateTeamKarat([50000], 5, 0)).toBe(0);
  });

  it('%50 kazanma oranı → ortalama elmas yarısı', () => {
    const karat = calculateTeamKarat([50000, 50000], 5, 10);
    expect(karat).toBe(25000);
  });

  it('%100 kazanma oranı → ortalama elmas', () => {
    const karat = calculateTeamKarat([40000, 60000], 10, 10);
    expect(karat).toBe(50000);
  });
});
