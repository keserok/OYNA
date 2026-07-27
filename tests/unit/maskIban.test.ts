// F5.4 PII regresyon kilidi: CSV dışa aktarımlarında IBAN asla ham yazılmaz.
// (Karar #39'un e-posta maskesiyle aynı politika; payout CSV'si muhasebeye
// gider ama tam IBAN yalnız FINANCE yetkili ekranda görünür.)
import { describe, it, expect } from 'vitest';
import { maskIban } from '../../admin-panel/utils/exportCsv';

describe('maskIban (F5.4 PII)', () => {
  it('TR IBAN maskesinde yalnız ilk 4 + son 4 hane kalır', () => {
    const masked = maskIban('TR330006100519786457841326');
    expect(masked.startsWith('TR33')).toBe(true);
    expect(masked.endsWith('1326')).toBe(true);
    expect(masked).not.toContain('0006100519786457');
    expect(masked).toContain('*');
  });

  it('boşluklu girişte de ortadaki haneler sızmaz', () => {
    const masked = maskIban('TR33 0006 1005 1978 6457 8413 26');
    expect(masked).not.toMatch(/0006|1005|1978|6457|8413/);
  });

  it('boş/undefined güvenli', () => {
    expect(maskIban('')).toBe('');
    expect(maskIban(undefined)).toBe('');
    expect(maskIban(null)).toBe('');
  });

  it('kısa değerler tamamen maskelenir (uzunluk sızıntısı hariç)', () => {
    expect(maskIban('12345678')).toBe('1***');
  });
});
