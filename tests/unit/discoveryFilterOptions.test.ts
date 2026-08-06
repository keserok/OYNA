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
import { matchOnDay, startOfDayMs } from '../../utils/discoveryDays';

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

// ─── GÜN KAPSAMI × FİLTRE SEÇENEKLERİ ────────────────────────────────────────
//
// Kullanıcı bildirimi (2026-08-06): "format tuşuna bastığımda 5v5 maç
// olmamasına rağmen 5v5 filtresi çıkıyor". Sebep: seçenekler TÜM günlerin
// maçlarından türetiliyor, liste ise SEÇİLİ GÜNE göre daralıyordu. Yarınki 5v5
// maç, bugünün format listesinde görünüyor; seçilince liste bomboş kalıyordu.
//
// Kural: Top Oyna ekranı seçenekleri gün kapsamı UYGULANDIKTAN sonra türetir.
// Aşağıdaki testler o bileşimi (matchOnDay → deriveDiscoveryFilterOptions)
// ekrandaki sırayla doğrular.
describe('gün kapsamı — seçenekler yalnız o günün maçlarından türer', () => {
  const gun = 86_400_000;
  const bugun = startOfDayMs(new Date());
  const iso = (ms: number) => {
    const d = new Date(ms);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };
  const gunSecenekleri = (list: any[], dayMs: number | null) =>
    deriveDiscoveryFilterOptions(list.filter((m) => matchOnDay(m, dayMs)));

  const liste = [
    match({ format: '4v4', difficulty: 'Rahat', date: iso(bugun), time: '20:00' }),
    match({ format: '8v8', difficulty: 'Taktiksel', date: iso(bugun), time: '21:00' }),
    match({ format: '5v5', difficulty: 'Ciddi', date: iso(bugun + gun), time: '20:00' }),
  ];

  it('bugünde yalnız bugünün formatları sunulur (yarınki 5v5 sızmaz)', () => {
    expect(gunSecenekleri(liste, bugun).formats).toEqual(['4v4', '8v8']);
  });

  it('mentalite de aynı kapsamdan türer — yarınki "Ciddi" bugün sunulmaz', () => {
    expect(gunSecenekleri(liste, bugun).mentalities).toEqual(['Taktiksel', 'Rahat']);
  });

  it('yarına geçilince seçenekler yarınla değişir', () => {
    const o = gunSecenekleri(liste, bugun + gun);
    expect(o.formats).toEqual(['5v5']);
    expect(o.mentalities).toEqual(['Ciddi']);
  });

  it('"Tüm Günler" (null) seçiliyken kapsam yoktur — hepsi sunulur', () => {
    const o = gunSecenekleri(liste, null);
    expect(o.formats).toEqual(['4v4', '5v5', '8v8']);
    expect(o.mentalities).toEqual(['Ciddi', 'Taktiksel', 'Rahat']);
  });

  it('maçsız günde hiçbir seçenek sunulmaz (dropdownlar disabled)', () => {
    const o = gunSecenekleri(liste, bugun + 5 * gun);
    expect(o.formats).toEqual([]);
    expect(o.mentalities).toEqual([]);
  });
});

describe('hasOpenSlot — boş kontenjan filtresi', () => {
  it('iki taraftan birinde açık slot varsa doğru', () => {
    expect(hasOpenSlot({ slots: [{ status: 'TAKEN' }], awaySlots: [{ status: 'OPEN' }] })).toBe(true);
    expect(hasOpenSlot({ slots: [{ status: 'TAKEN' }], awaySlots: [{ status: 'TAKEN' }] })).toBe(false);
    expect(hasOpenSlot({})).toBe(false);
  });
});
