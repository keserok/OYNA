import { describe, it, expect } from 'vitest';
import {
  getHaversineDistance,
  encodeGeohash,
  getSurroundingGeohashes,
  getProximityQueryBounds,
} from '../../utils/geo';

describe('getHaversineDistance', () => {
  it('aynı nokta → 0', () => {
    expect(getHaversineDistance(41.0082, 28.9784, 41.0082, 28.9784)).toBe(0);
  });

  it('İstanbul → Ankara ~350 km', () => {
    const dist = getHaversineDistance(41.0082, 28.9784, 39.9334, 32.8597);
    expect(dist).toBeGreaterThan(340);
    expect(dist).toBeLessThan(360);
  });

  it('simetrik', () => {
    const d1 = getHaversineDistance(41.0082, 28.9784, 39.9334, 32.8597);
    const d2 = getHaversineDistance(39.9334, 32.8597, 41.0082, 28.9784);
    expect(Math.abs(d1 - d2)).toBeLessThan(0.001);
  });
});

describe('encodeGeohash', () => {
  it('precision 1 için string uzunluğu 1', () => {
    expect(encodeGeohash(0, 0, 1)).toHaveLength(1);
  });

  it('varsayılan precision 9 karakter üretir', () => {
    expect(encodeGeohash(41.0082, 28.9784)).toHaveLength(9);
  });

  it('aynı koordinatlar her zaman aynı hash', () => {
    const h1 = encodeGeohash(41.0082, 28.9784, 6);
    const h2 = encodeGeohash(41.0082, 28.9784, 6);
    expect(h1).toBe(h2);
  });

  it('farklı koordinatlar farklı hash', () => {
    const hIstanbul = encodeGeohash(41.0082, 28.9784, 5);
    const hAnkara = encodeGeohash(39.9334, 32.8597, 5);
    expect(hIstanbul).not.toBe(hAnkara);
  });
});

describe('getSurroundingGeohashes', () => {
  it('merkez dahil 9 geohash döndürür', () => {
    const hash = encodeGeohash(41.0082, 28.9784, 5);
    const surrounding = getSurroundingGeohashes(hash);
    expect(surrounding).toHaveLength(9);
    expect(surrounding[0]).toBe(hash);
  });

  it('tüm hash\'ler benzersiz', () => {
    const hash = encodeGeohash(41.0082, 28.9784, 5);
    const surrounding = getSurroundingGeohashes(hash);
    expect(new Set(surrounding).size).toBe(9);
  });
});

describe('getProximityQueryBounds', () => {
  it('9 adet { start, end } çifti döndürür', () => {
    const bounds = getProximityQueryBounds(41.0082, 28.9784, 5);
    expect(bounds).toHaveLength(9);
    bounds.forEach(b => {
      expect(typeof b.start).toBe('string');
      expect(b.end).toContain(b.start);
    });
  });
});
