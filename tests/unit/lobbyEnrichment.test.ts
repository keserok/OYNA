import { describe, it, expect } from 'vitest';
import {
  inferSquadSize,
  enrichSlots,
  applyCanonicalCoords,
  normalizeRole,
  avatarFor,
  resolveGkVisibility,
  findHiredGkSlotId,
} from '../../shared/lobbyEnrichment';
import type { PositionSlot } from '../../types';

// ─── normalizeRole ────────────────────────────────────────────────────────────
//
// Tüketici ve admin tarafının ORTAK kanonik rol normalizer'ı.
// Hem köklü Türkçe kısaltmalar ('KL', 'HÜC', 'SAV', 'ORT') hem de
// İngilizce kısaltmalar ('CB', 'LB', 'RB', 'ST', 'CF', 'LW', 'RW') desteklenmeli.

describe('normalizeRole — lobbyEnrichment', () => {
  it('GK ve Türkçe eşdeğerleri → GK', () => {
    expect(normalizeRole('GK')).toBe('GK');
    expect(normalizeRole('KL')).toBe('GK');
    expect(normalizeRole('K')).toBe('GK');
    expect(normalizeRole('kaleci')).toBe('GK');
  });

  it('DEF eşdeğerleri → DEF', () => {
    expect(normalizeRole('DEF')).toBe('DEF');
    expect(normalizeRole('SAV')).toBe('DEF');
    expect(normalizeRole('STP')).toBe('DEF');
    expect(normalizeRole('STOPER')).toBe('DEF');
    expect(normalizeRole('CB')).toBe('DEF');
    expect(normalizeRole('LB')).toBe('DEF');
    expect(normalizeRole('RB')).toBe('DEF');
  });

  it('FWD eşdeğerleri → FWD', () => {
    expect(normalizeRole('FWD')).toBe('FWD');
    expect(normalizeRole('HÜC')).toBe('FWD');
    expect(normalizeRole('ST')).toBe('FWD');
    expect(normalizeRole('CF')).toBe('FWD');
    expect(normalizeRole('LW')).toBe('FWD');
    expect(normalizeRole('RW')).toBe('FWD');
  });

  it('tanınmayan → MID (güvenli varsayılan)', () => {
    expect(normalizeRole('ORT')).toBe('MID');
    expect(normalizeRole('MID')).toBe('MID');
    expect(normalizeRole('')).toBe('MID');
    expect(normalizeRole(undefined)).toBe('MID');
    expect(normalizeRole('BEKLENMEYENROL')).toBe('MID');
  });
});

// ─── inferSquadSize ───────────────────────────────────────────────────────────

describe('inferSquadSize', () => {
  it('format string önceliklidir', () => {
    expect(inferSquadSize(10, '7v7')).toBe('7v7');
    expect(inferSquadSize(2, '11v11')).toBe('11v11');
  });

  it('geçersiz format string → slot sayısına döner', () => {
    expect(inferSquadSize(7, 'invalid')).toBe('7v7');
  });

  it('slot sayısından çıkarım: ≤5 → 5v5', () => {
    expect(inferSquadSize(5)).toBe('5v5');
    expect(inferSquadSize(3)).toBe('5v5');
  });

  it('slot sayısından çıkarım: 6 → 6v6', () => {
    expect(inferSquadSize(6)).toBe('6v6');
  });

  it('slot sayısından çıkarım: 7 → 7v7', () => {
    expect(inferSquadSize(7)).toBe('7v7');
  });

  it('slot sayısından çıkarım: 11 ve üstü → 11v11', () => {
    expect(inferSquadSize(11)).toBe('11v11');
    expect(inferSquadSize(14)).toBe('11v11');
  });
});

// ─── applyCanonicalCoords ─────────────────────────────────────────────────────

describe('applyCanonicalCoords', () => {
  it('boş slot dizisi → boş döner', () => {
    expect(applyCanonicalCoords([])).toEqual([]);
  });

  it('her slota x ve y atanır (geçerli aralık 0-100)', () => {
    const slots: PositionSlot[] = Array.from({ length: 7 }, (_, i) => ({
      id: `s${i}`,
      role: 'MID',
      status: 'EMPTY',
    } as PositionSlot));
    const result = applyCanonicalCoords(slots, '7v7');
    for (const s of result) {
      expect(s.x).toBeGreaterThanOrEqual(0);
      expect(s.x).toBeLessThanOrEqual(100);
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(s.y).toBeLessThanOrEqual(100);
    }
  });

  it('slot sayısı korunur', () => {
    const slots: PositionSlot[] = Array.from({ length: 11 }, (_, i) => ({
      id: `s${i}`,
      role: 'MID',
      status: 'EMPTY',
    } as PositionSlot));
    const result = applyCanonicalCoords(slots, '11v11');
    expect(result).toHaveLength(11);
  });
});

// ─── avatarFor ────────────────────────────────────────────────────────────────

describe('avatarFor — yerel ve saydam baş harf (kurucu kararı, 20 Ağu 2026)', () => {
  it('dış servise gitmez: data-URI SVG döner', () => {
    const url = avatarFor('user123', 'Ali Veli');
    expect(url.startsWith('data:image/svg+xml')).toBe(true);
    expect(url).not.toContain('ui-avatars.com'); // eski dünya geri gelmesin
  });

  it('zemin SAYDAM, harfler opak: dolgu yok, beyaz metin var', () => {
    const svg = decodeURIComponent(avatarFor('u0', 'Ali Veli'));
    expect(svg).toContain('fill="none"');      // dairenin içi boş
    expect(svg).toContain('fill="#FFFFFF"');   // baş harfler opak
    expect(svg).toContain('>AV<');             // Ali Veli → AV
  });

  it('isim yoksa "Oyuncu" varsayılanının baş harfi kullanılır', () => {
    const svg = decodeURIComponent(avatarFor('u1'));
    expect(svg).toContain('>O<');
  });

  it('Türkçe baş harfler doğru büyütülür (İ/Ş kaybolmaz)', () => {
    const svg = decodeURIComponent(avatarFor('u2', 'şafak ismail'));
    expect(svg).toContain('>Şİ<');
  });

  it('aynı isim her çağrıda aynı yuvarlağı verir (tek görsel dil)', () => {
    expect(avatarFor('a', 'Ali Veli')).toBe(avatarFor('b', 'Ali Veli'));
  });
});

// ─── enrichSlots — birleşik entegrasyon ─────────────────────────────────────

describe('enrichSlots', () => {
  const users = [
    { id: 'u1', name: 'Ali', avatar: 'https://ali.jpg' },
    { id: 'u2', name: 'Veli', avatar: undefined },
  ];

  const makeSlots = (n: number, takenByIds: string[] = []): PositionSlot[] =>
    Array.from({ length: n }, (_, i) => ({
      id: `s${i}`,
      role: i === 0 ? 'GK' : 'MID',
      status: i < takenByIds.length ? 'TAKEN' : 'EMPTY',
      player: i < takenByIds.length ? { id: takenByIds[i], name: '', avatar: '' } as any : undefined,
    } as PositionSlot));

  it('EMPTY slotlar değişmez (player eklenmez)', () => {
    const slots = makeSlots(7);
    const result = enrichSlots(slots, users, '7v7');
    for (const s of result.filter(s => s.status === 'EMPTY')) {
      expect(s.player).toBeUndefined();
    }
  });

  it('TAKEN slot — kullanıcı listede varsa player.name doldurulur', () => {
    const slots = makeSlots(7, ['u1']);
    const result = enrichSlots(slots, users, '7v7');
    const taken = result.find(s => s.status === 'TAKEN');
    expect(taken?.player?.name).toBe('Ali');
    expect(taken?.player?.avatar).toBe('https://ali.jpg');
  });

  it('TAKEN slot — kullanıcı listede yoksa avatar oto-üretilir (yerel saydam SVG)', () => {
    const slots = makeSlots(7, ['unknown-user']);
    const result = enrichSlots(slots, users, '7v7');
    const taken = result.find(s => s.status === 'TAKEN');
    expect(taken?.player?.avatar).toContain('data:image/svg');
  });

  it('slot sayısı enrichSlots sonrası değişmez', () => {
    const slots = makeSlots(7, ['u1', 'u2']);
    const result = enrichSlots(slots, users, '7v7');
    expect(result).toHaveLength(7);
  });
});

// ─── resolveGkVisibility + findHiredGkSlotId ─────────────────────────────────
//
// İki taraflı kiralık kaleci görünürlüğü: taraf, HANGİ matches kolonunun dolu
// olduğundan okunur (gk_id = ev sahibi, away_gk_id = deplasman). Kaleci YALNIZ
// kendi takımının üyelerine görünür; rakip ve dış izleyici görmez. Hakem bu
// politikanın dışında (iki takıma da görünür). Taraflar bağımsız değerlenir.

describe('resolveGkVisibility — iki taraflı kaleci görünürlüğü', () => {
  const HOME_GK = 'gk-home';
  const AWAY_GK = 'gk-away';

  it('kolon boşsa o taraf görünmez', () => {
    const r = resolveGkVisibility({
      homeGkId: null, awayGkId: null,
      viewerIsHomeMember: true, viewerIsAwayMember: true,
    });
    expect(r).toEqual({ canSeeHome: false, canSeeAway: false });
  });

  it('ev sahibi kalecisini yalnız ev sahibi üyesi görür (rakip görmez)', () => {
    const homeViewer = resolveGkVisibility({ homeGkId: HOME_GK, awayGkId: null, viewerIsHomeMember: true, viewerIsAwayMember: false });
    const awayViewer = resolveGkVisibility({ homeGkId: HOME_GK, awayGkId: null, viewerIsHomeMember: false, viewerIsAwayMember: true });
    const outsider  = resolveGkVisibility({ homeGkId: HOME_GK, awayGkId: null, viewerIsHomeMember: false, viewerIsAwayMember: false });
    expect(homeViewer).toEqual({ canSeeHome: true, canSeeAway: false });
    expect(awayViewer).toEqual({ canSeeHome: false, canSeeAway: false });
    expect(outsider).toEqual({ canSeeHome: false, canSeeAway: false });
  });

  it('deplasman kalecisini yalnız deplasman üyesi görür', () => {
    const awayViewer = resolveGkVisibility({ homeGkId: null, awayGkId: AWAY_GK, viewerIsHomeMember: false, viewerIsAwayMember: true });
    const homeViewer = resolveGkVisibility({ homeGkId: null, awayGkId: AWAY_GK, viewerIsHomeMember: true, viewerIsAwayMember: false });
    expect(awayViewer).toEqual({ canSeeHome: false, canSeeAway: true });
    expect(homeViewer).toEqual({ canSeeHome: false, canSeeAway: false });
  });

  it('iki taraf da kiralamışsa: ev sahibi üyesi yalnız kendi kalecisini görür (rakibinkini değil)', () => {
    const homeViewer = resolveGkVisibility({ homeGkId: HOME_GK, awayGkId: AWAY_GK, viewerIsHomeMember: true, viewerIsAwayMember: false });
    const awayViewer = resolveGkVisibility({ homeGkId: HOME_GK, awayGkId: AWAY_GK, viewerIsHomeMember: false, viewerIsAwayMember: true });
    expect(homeViewer).toEqual({ canSeeHome: true, canSeeAway: false });
    expect(awayViewer).toEqual({ canSeeHome: false, canSeeAway: true });
  });

  it('her iki tarafın da üyesi (nadir) her iki kaleciyi de görür', () => {
    const r = resolveGkVisibility({ homeGkId: HOME_GK, awayGkId: AWAY_GK, viewerIsHomeMember: true, viewerIsAwayMember: true });
    expect(r).toEqual({ canSeeHome: true, canSeeAway: true });
  });
});

describe('findHiredGkSlotId — kalede gösterilecek slot', () => {
  const slot = (id: string, role: string, status: 'OPEN' | 'TAKEN' | 'LOCKED'): PositionSlot =>
    ({ id, role, status, x: 50, y: 90 } as PositionSlot);

  it('ilk BOŞ GK slotunu döndürür (KL kısaltması dahil)', () => {
    expect(findHiredGkSlotId([slot('a', 'DEF', 'OPEN'), slot('b', 'GK', 'OPEN')])).toBe('b');
    expect(findHiredGkSlotId([slot('kl1', 'KL', 'OPEN')])).toBe('kl1');
  });

  it('GK slotu gerçek oyuncu tarafından alınmışsa ezmez → null', () => {
    expect(findHiredGkSlotId([slot('g', 'GK', 'TAKEN'), slot('m', 'MID', 'OPEN')])).toBeNull();
  });

  it('GK slotu hiç yoksa veya liste boşsa null', () => {
    expect(findHiredGkSlotId([slot('m', 'MID', 'OPEN')])).toBeNull();
    expect(findHiredGkSlotId([])).toBeNull();
    expect(findHiredGkSlotId([null, undefined])).toBeNull();
  });
});
