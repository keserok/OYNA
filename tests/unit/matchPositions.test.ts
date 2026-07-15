import { describe, it, expect } from 'vitest';
import { deriveMissingPositions } from '../../utils/matchPositions';

describe('deriveMissingPositions', () => {
  it('yalnız OPEN slotları sayar, role göre gruplar', () => {
    const slots = [
      { status: 'OPEN', role: 'ORT' },
      { status: 'OPEN', role: 'ORT' },
      { status: 'TAKEN', role: 'ORT' },
      { status: 'OPEN', role: 'KL' },
      { status: 'INVITED', role: 'SAV' },
    ];
    expect(deriveMissingPositions(slots)).toEqual([
      { role: 'ORT', count: 2 },
      { role: 'KL', count: 1 },
    ]);
  });
  it('dolu maçta BOŞ dizi (sahte ARANIYOR rozeti imkânsız)', () => {
    expect(deriveMissingPositions([
      { status: 'TAKEN', role: 'ORT' },
      { status: 'TAKEN', role: 'KL' },
    ])).toEqual([]);
  });
  it('rol yoksa OYUNCU; null/eksik slot güvenli', () => {
    expect(deriveMissingPositions([
      { status: 'OPEN' }, null, undefined, { status: 'OPEN', role: '' },
    ])).toEqual([{ role: 'OYUNCU', count: 2 }]);
  });
  it('deterministik sıra: önce yüksek sayı, eşitse TR alfabetik', () => {
    const out = deriveMissingPositions([
      { status: 'OPEN', role: 'SAV' },
      { status: 'OPEN', role: 'HÜC' },
      { status: 'OPEN', role: 'HÜC' },
      { status: 'OPEN', role: 'ORT' },
    ]);
    expect(out[0]).toEqual({ role: 'HÜC', count: 2 });
    expect(out.map(p => p.role)).toEqual(['HÜC', 'ORT', 'SAV']);
  });
});
