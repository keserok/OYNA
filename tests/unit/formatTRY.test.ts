import { describe, it, expect } from 'vitest';
import { formatTRY } from '../../utils/formatTRY';

describe('formatTRY', () => {
  it('kanonik: binlik ayraç + iki ondalık + ₺', () => {
    expect(formatTRY(1500)).toBe('1.500,00₺');
    expect(formatTRY(0)).toBe('0,00₺');
    expect(formatTRY(1234567.5)).toBe('1.234.567,50₺');
  });
  it('null/undefined/NaN → —', () => {
    expect(formatTRY(null)).toBe('—');
    expect(formatTRY(undefined)).toBe('—');
    expect(formatTRY(NaN)).toBe('—');
  });
  it('decimals:false ondalık gizler', () => {
    expect(formatTRY(1500, { decimals: false })).toBe('1.500₺');
  });
  it('symbol:false ₺ eklemez', () => {
    expect(formatTRY(1500, { symbol: false })).toBe('1.500,00');
  });
  it('kuruş yuvarlama', () => {
    expect(formatTRY(19.999)).toBe('20,00₺');
    expect(formatTRY(19.994)).toBe('19,99₺');
  });
});
