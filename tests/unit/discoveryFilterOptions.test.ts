import { describe, it, expect } from 'vitest';
import {
  deriveDiscoveryFilterOptions,
  roleHasOpenSlot,
  hasOpenSlot,
  matchInBudget,
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

// ─── GERÇEK SLOT VERİSİ ───────────────────────────────────────────────────────
//
// REGRESYON: pozisyon filtresi yalnız `missingPositions` okuyordu. O kolon
// kayıtlarda BOŞ ([]) ve Top Oyna listesi onu her maç için boş diziyle
// eziyordu → filtre hiçbir zaman seçenek üretmiyor, dropdown hep pasif
// kalıyordu. Gerçek roller `slots`/`awaySlots` içinde 'GK'|'DEF'|'MID'|'FWD'
// kodlarıyla duruyor.

describe('pozisyon — GERÇEK slot verisinden okunur', () => {
  const slot = (role: string, status = 'OPEN') => ({ id: `s-${role}-${status}`, role, status });

  it("veritabanı kodları ('GK'|'DEF'|'MID'|'FWD') doğru role çevrilir", () => {
    expect(roleHasOpenSlot({ slots: [slot('GK')] }, 'KL')).toBe(true);
    expect(roleHasOpenSlot({ slots: [slot('DEF')] }, 'SAV')).toBe(true);
    expect(roleHasOpenSlot({ slots: [slot('MID')] }, 'ORT')).toBe(true);
    expect(roleHasOpenSlot({ slots: [slot('FWD')] }, 'HÜC')).toBe(true);
  });

  it('DOLU slot açık sayılmaz', () => {
    expect(roleHasOpenSlot({ slots: [slot('GK', 'TAKEN')] }, 'KL')).toBe(false);
  });

  it('deplasman kadrosundaki açık slot da sayılır', () => {
    expect(roleHasOpenSlot({ slots: [slot('GK', 'TAKEN')], awaySlots: [slot('FWD')] }, 'HÜC')).toBe(true);
  });

  it('başka rolün açık slotu istenen rolü açmaz', () => {
    expect(roleHasOpenSlot({ slots: [slot('GK')] }, 'HÜC')).toBe(false);
  });

  it('slot varken seçenek listesi gerçekten dolar (eskiden hep boştu)', () => {
    const o = deriveDiscoveryFilterOptions([
      { format: '7v7', difficulty: 'Ciddi', slots: [slot('GK'), slot('DEF', 'TAKEN')], awaySlots: [slot('FWD')] },
    ]);
    expect(o.roles).toEqual(['KL', 'HÜC']);
  });

  it('slot verisi varsa missingPositions yedeğine düşülmez', () => {
    const m = { slots: [slot('GK', 'TAKEN')], missingPositions: [{ role: 'KALECİ', count: 3 }] };
    expect(roleHasOpenSlot(m, 'KL')).toBe(false);
  });
});

// ─── CİNSİYET / YAŞ / SÜRE / ÜCRET — SABİT LİSTE DEĞİL, VERİDEN ──────────────
//
// REGRESYON: yaş filtresi '10-14 … 35+' sunuyordu ama kayıtlardaki değer
// '18-35'ti; seçilen hiçbir yaş hiçbir maçla eşleşmiyordu.

describe('cinsiyet / yaş / süre / ücret seçenekleri veriden türer', () => {
  it("veritabanında ne varsa o listelenir ('18-35' dahil)", () => {
    const o = deriveDiscoveryFilterOptions([
      { ageGroup: '18-35', gender: 'Karma', durationMinutes: 60, price: 120 },
      { ageGroup: '18-22', gender: 'Erkek', durationMinutes: 90, price: 0 },
    ]);
    expect(o.ageGroups).toEqual(['18-22', '18-35']);
    expect(o.genders).toEqual(['Erkek', 'Karma']);
    expect(o.durations).toEqual([60, 90]);
  });

  it("'Tümü' bir kısıt değildir — yaş seçeneği olarak sunulmaz", () => {
    const o = deriveDiscoveryFilterOptions([{ ageGroup: 'Tümü' }, { ageGroup: '23-27' }]);
    expect(o.ageGroups).toEqual(['23-27']);
  });

  it('boş/eksik alanlar seçenek üretmez', () => {
    const o = deriveDiscoveryFilterOptions([{ gender: null, ageGroup: '', durationMinutes: null }]);
    expect(o.genders).toEqual([]);
    expect(o.ageGroups).toEqual([]);
    expect(o.durations).toEqual([]);
  });

  it('yalnız içinde maç OLAN ücret kovaları sunulur', () => {
    const o = deriveDiscoveryFilterOptions([{ price: 0 }, { price: 500 }]);
    expect(o.budgets.map((b) => b.id)).toEqual(['free', 'o350']);
  });

  it('ücret kovaları sınırları doğru ayırır', () => {
    expect(matchInBudget({ price: 0 }, 'free')).toBe(true);
    expect(matchInBudget({ price: 1 }, 'free')).toBe(false);
    // Ücretsiz maç "150 ve altı" kovasına düşmez — ayrı bir dildir.
    expect(matchInBudget({ price: 0 }, 'u150')).toBe(false);
    expect(matchInBudget({ price: 150 }, 'u150')).toBe(true);
    expect(matchInBudget({ price: 300 }, '250-350')).toBe(true);
    expect(matchInBudget({ price: 400 }, 'o350')).toBe(true);
    expect(matchInBudget({ price: 100 }, 'o350')).toBe(false);
  });
});

describe('hasOpenSlot — boş kontenjan filtresi', () => {
  it('iki taraftan birinde açık slot varsa doğru', () => {
    expect(hasOpenSlot({ slots: [{ status: 'TAKEN' }], awaySlots: [{ status: 'OPEN' }] })).toBe(true);
    expect(hasOpenSlot({ slots: [{ status: 'TAKEN' }], awaySlots: [{ status: 'TAKEN' }] })).toBe(false);
    expect(hasOpenSlot({})).toBe(false);
  });
});
