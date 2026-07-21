import { describe, it, expect } from 'vitest';
import { validateTrIban, normalizeIban, formatIban } from '../../utils/iban';

describe('validateTrIban', () => {
  it('geçerli TR IBAN (mod-97 = 1) kabul edilir', () => {
    expect(validateTrIban('TR330006100519786457841326').valid).toBe(true);
    expect(validateTrIban('TR320010009999901234567890').valid).toBe(true);
  });

  it('boşluklu ve küçük harfli girişi normalize edip kabul eder', () => {
    expect(validateTrIban('tr33 0006 1005 1978 6457 8413 26').valid).toBe(true);
  });

  it('checksum bozuksa reddedilir', () => {
    expect(validateTrIban('TR330006100519786457841327').valid).toBe(false);
  });

  it('TR ile başlamayan reddedilir', () => {
    const r = validateTrIban('DE89370400440532013000');
    expect(r.valid).toBe(false);
    expect(r.reason).toContain('TR');
  });

  it('yanlış uzunluk reddedilir', () => {
    expect(validateTrIban('TR3300061005').valid).toBe(false);
  });

  it('harf içeren gövde reddedilir', () => {
    expect(validateTrIban('TR3300061005197864578413AB').valid).toBe(false);
  });

  it('boş giriş reddedilir', () => {
    expect(validateTrIban('').valid).toBe(false);
  });
});

describe('normalizeIban / formatIban', () => {
  it('normalize boşlukları siler ve büyük harfe çevirir', () => {
    expect(normalizeIban('tr33 0006 1005')).toBe('TR3300061005');
  });
  it('format 4erli gruplar', () => {
    expect(formatIban('TR330006100519786457841326')).toBe('TR33 0006 1005 1978 6457 8413 26');
  });
});
