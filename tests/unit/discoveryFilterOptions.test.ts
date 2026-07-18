import { describe, it, expect } from 'vitest';
import {
  deriveDiscoveryFilterOptions,
  roleHasOpenSlot,
  FORMAT_VALUES,
  MENTALITY_VALUES,
  ROLE_IDS,
} from '../../utils/discoveryFilterOptions';

// enhancedMatches biçiminde asgari maç nesnesi üretir (difficulty normalize edilmiş).
const match = (over: Record<string, any> = {}) => ({
  format: '7v7',
  difficulty: 'Rahat',
  missingPositions: [],
  ...over,
});

// ─── deriveDiscoveryFilterOptions ─────────────────────────────────────────────

describe('deriveDiscoveryFilterOptions — yalnız mevcut değerler', () => {
  it('boş liste → tüm seçenek kümeleri boş (dropdownlar disabled)', () => {
    const o = deriveDiscoveryFilterOptions([]);
    expect(o.formats).toEqual([]);
    expect(o.mentalities).toEqual([]);
    expect(o.roles).toEqual([]);
  });

  it('null/undefined girdi patlatmaz', () => {
    const o = deriveDiscoveryFilterOptions(undefined as any);
    expect(o.formats).toEqual([]);
  });

  it('formatlar: yalnız maçlarda bulunanlar, kanonik sırayla', () => {
    const o = deriveDiscoveryFilterOptions([
      match({ format: '11v11' }),
      match({ format: '5v5' }),
      match({ format: '5v5' }),
    ]);
    expect(o.formats).toEqual(['5v5', '11v11']); // FORMAT_VALUES sırası korunur
  });

  it('format karşılaştırması büyük/küçük harfe duyarsız', () => {
    const o = deriveDiscoveryFilterOptions([match({ format: '7V7' })]);
    expect(o.formats).toEqual(['7v7']);
  });

  it('mentaliteler: yalnız maçlarda bulunan normalize değerler', () => {
    const o = deriveDiscoveryFilterOptions([
      match({ difficulty: 'Ciddi' }),
      match({ difficulty: 'Ciddi' }),
      match({ difficulty: 'Rahat' }),
    ]);
    expect(o.mentalities).toEqual(['Ciddi', 'Rahat']);
  });

  it('kanonik listeler dışına çıkılmaz', () => {
    const o = deriveDiscoveryFilterOptions([
      match({ format: '2v2', difficulty: 'Bilinmeyen' }),
    ]);
    expect(o.formats).toEqual([]);
    expect(o.mentalities).toEqual([]);
    expect(FORMAT_VALUES).toContain('7v7');
    expect(MENTALITY_VALUES).toEqual(['Ciddi', 'Taktiksel', 'Rahat']);
    expect(ROLE_IDS).toEqual(['KL', 'SAV', 'ORT', 'HÜC']);
  });
});

// ─── roleHasOpenSlot / pozisyon türetme ───────────────────────────────────────

describe('pozisyon seçenekleri — checkMatchFilters semantiğiyle birebir', () => {
  it('açık slotu olan rol seçenek olur, olmayan olmaz', () => {
    const o = deriveDiscoveryFilterOptions([
      match({ missingPositions: [{ role: 'KALECİ', count: 1 }] }),
      match({ missingPositions: [{ role: 'HÜCUM', count: 2 }] }),
    ]);
    expect(o.roles).toEqual(['KL', 'HÜC']);
  });

  it('count=0 slot seçenek üretmez', () => {
    const o = deriveDiscoveryFilterOptions([
      match({ missingPositions: [{ role: 'SAVUNMA', count: 0 }] }),
    ]);
    expect(o.roles).toEqual([]);
  });

  it("jenerik 'OYUNCU' slotu SAV/ORT/HÜC'ü açar ama KL'yi açmaz", () => {
    const o = deriveDiscoveryFilterOptions([
      match({ missingPositions: [{ role: 'OYUNCU', count: 3 }] }),
    ]);
    expect(o.roles).toEqual(['SAV', 'ORT', 'HÜC']);
    expect(roleHasOpenSlot(match({ missingPositions: [{ role: 'OYUNCU', count: 3 }] }), 'KL')).toBe(false);
  });

  it('missingPositions olmayan maç patlatmaz', () => {
    expect(roleHasOpenSlot({}, 'KL')).toBe(false);
    expect(roleHasOpenSlot(null, 'SAV')).toBe(false);
  });
});
