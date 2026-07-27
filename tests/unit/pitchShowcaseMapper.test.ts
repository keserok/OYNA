import { describe, it, expect } from 'vitest';
import { formatCapacity, formatCapacityRange } from '../../shared/pitchShowcaseMapper';

// BİRİM SÖZLEŞMESİ: courts.min_capacity/max_capacity TAKIM BAŞINA oyuncudur
// (6 → 6v6); yalnız legacy courts.capacity TOPLAM kişidir (14 → 7v7).
// create_match_atomic, format bekçisi ve Maç Kur ekranı bu birimi kullanır.
describe('formatCapacityRange — kort format aralığı rozeti (takım başına)', () => {
  it('min+maks → aralık', () => {
    expect(formatCapacityRange(6, 8)).toBe('6v6–8v8');
  });
  it('min=maks → tek format', () => {
    expect(formatCapacityRange(7, 7)).toBe('7v7');
  });
  it('yalnız min → alt sınır', () => {
    expect(formatCapacityRange(6, null)).toBe('6v6+');
  });
  it('yalnız maks → üst sınır', () => {
    expect(formatCapacityRange(null, 8)).toBe('≤8v8');
  });
  it('aralık yok → legacy capacity (TOPLAM kişi) fallback', () => {
    expect(formatCapacityRange(null, null, 14)).toBe('7v7');
    expect(formatCapacityRange(undefined, undefined, undefined)).toBeNull();
  });
  it('formatCapacity yalnız TOPLAM kişi için kullanılır', () => {
    expect(formatCapacity(10)).toBe('5v5');
    expect(formatCapacity(7)).toBe('7 oyuncu');
    expect(formatCapacity(0)).toBeNull();
  });
});
