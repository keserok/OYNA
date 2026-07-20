import { describe, it, expect } from 'vitest';
import { formatTRY, formatTRYInt, formatTRYWithSymbol } from '../../utils/formatTRY';

describe('formatTRY (kanonik, ₺ YOK)', () => {
  it('binlik ayraç + iki ondalık', () => {
    expect(formatTRY(1500)).toBe('1.500,00');
    expect(formatTRY(0)).toBe('0,00');
    expect(formatTRY(1234567.5)).toBe('1.234.567,50');
  });
  it('geçersiz sayı → 0,00 (main davranışı)', () => {
    expect(formatTRY(NaN)).toBe('0,00');
  });
  it('kuruş yuvarlama', () => {
    expect(formatTRY(19.999)).toBe('20,00');
    expect(formatTRY(19.994)).toBe('19,99');
  });
});

describe('formatTRYInt (ondalıksız)', () => {
  it('tam sayı biçimi', () => {
    expect(formatTRYInt(1500)).toBe('1.500');
    expect(formatTRYInt(1234567)).toBe('1.234.567');
  });
});

describe('formatTRYWithSymbol (₺ ekli, null-güvenli)', () => {
  it('₺ soneki ekler', () => {
    expect(formatTRYWithSymbol(1500)).toBe('1.500,00₺');
    expect(formatTRYWithSymbol(0)).toBe('0,00₺');
  });
  it('null/undefined/NaN → — ("—₺" değil)', () => {
    expect(formatTRYWithSymbol(null)).toBe('—');
    expect(formatTRYWithSymbol(undefined)).toBe('—');
    expect(formatTRYWithSymbol(NaN)).toBe('—');
  });
});
