import { describe, it, expect } from 'vitest';
import { formatCapacity, formatCapacityRange } from '../../shared/pitchShowcaseMapper';

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
