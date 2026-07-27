import { describe, it, expect } from 'vitest';
import {
  allowedSquadSizesForCourt, allowedSquadSizesForCourts, formatCapacity,
  formatCapacityRange, formatCapacityRangeForCourts, isSquadSizeAllowedForCourt,
} from '../../shared/pitchShowcaseMapper';

describe('formatCapacityRange — kort format aralığı rozeti', () => {
  it('min+maks → aralık', () => {
    expect(formatCapacityRange(12, 16)).toBe('6v6–8v8');
  });
  it('min=maks → tek format', () => {
    expect(formatCapacityRange(14, 14)).toBe('7v7');
  });
  it('yalnız min → alt sınır', () => {
    expect(formatCapacityRange(12, null)).toBe('6v6+');
  });
  it('yalnız maks → üst sınır', () => {
    expect(formatCapacityRange(null, 16)).toBe('≤8v8');
  });
  it('aralık yok → legacy capacity fallback', () => {
    expect(formatCapacityRange(null, null, 14)).toBe('7v7');
    expect(formatCapacityRange(undefined, undefined, undefined)).toBeNull();
  });
  it('formatCapacity tek değer davranışı korunur', () => {
    expect(formatCapacity(10)).toBe('5v5');
    expect(formatCapacity(7)).toBe('7 oyuncu');
    expect(formatCapacity(0)).toBeNull();
  });
});

describe('allowedSquadSizesForCourt — kortun oynanabilir format listesi', () => {
  it('min+maks → aralık içindekiler', () => {
    expect(allowedSquadSizesForCourt(12, 16)).toEqual(['6v6', '7v7', '8v8']);
  });
  it('min=maks → tek format', () => {
    expect(allowedSquadSizesForCourt(14, 14)).toEqual(['7v7']);
  });
  it('yalnız min → alt sınırın üstü', () => {
    expect(allowedSquadSizesForCourt(18, null)).toEqual(['9v9', '10v10', '11v11']);
  });
  it('aralık yok → legacy capacity KISIT SAYILMAZ (canlıda hepsi varsayılan 14)', () => {
    expect(allowedSquadSizesForCourt(null, null, 14)).toHaveLength(10);
  });
  it('hiç veri yok → tüm formatlar (kısıt bilinmiyor)', () => {
    expect(allowedSquadSizesForCourt(null, null, null)).toHaveLength(10);
  });
  it('isSquadSizeAllowedForCourt tekil kontrol', () => {
    expect(isSquadSizeAllowedForCourt('7v7', 12, 16)).toBe(true);
    expect(isSquadSizeAllowedForCourt('11v11', 12, 16)).toBe(false);
  });
});

describe('allowedSquadSizesForCourts — tesis düzeyi (en az bir kort sığdırır)', () => {
  it('aralıklar birleşir ama boşluk KORUNUR (9v9 hiçbir korta sığmıyor)', () => {
    expect(allowedSquadSizesForCourts([
      { minCapacity: 12, maxCapacity: 16 },
      { minCapacity: 20, maxCapacity: 22 },
    ])).toEqual(['6v6', '7v7', '8v8', '10v10', '11v11']);
  });
  it('kort yoksa tüm formatlar', () => {
    expect(allowedSquadSizesForCourts([])).toHaveLength(10);
  });
  it('rozet: kısıt yoksa null, varsa uçların aralığı', () => {
    expect(formatCapacityRangeForCourts([])).toBeNull();
    expect(formatCapacityRangeForCourts([{ minCapacity: null, maxCapacity: null, capacity: null }])).toBeNull();
    expect(formatCapacityRangeForCourts([{ minCapacity: 12, maxCapacity: 16 }])).toBe('6v6–8v8');
  });
});
