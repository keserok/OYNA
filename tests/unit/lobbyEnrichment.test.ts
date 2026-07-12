import { describe, it, expect } from 'vitest';
import {
  inferSquadSize,
  enrichSlots,
  applyCanonicalCoords,
  normalizeRole,
  avatarFor,
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

describe('avatarFor', () => {
  it('seed + isimden geçerli URL döner', () => {
    const url = avatarFor('user123', 'Ali Veli');
    expect(url).toContain('ui-avatars.com');
    expect(url).toContain('name=');
    expect(url).toContain('seed=');
  });

  it('isim yoksa "Oyuncu" varsayılanı kullanılır', () => {
    const url = avatarFor('u1');
    expect(url).toContain(encodeURIComponent('Oyuncu'));
  });

  it('özel karakterler URL-encode edilir', () => {
    const url = avatarFor('u2', 'Şafak Öz');
    // URL içinde encode edilmiş Türkçe karakter olmalı
    expect(url).toContain('%');
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

  it('TAKEN slot — kullanıcı listede yoksa avatar oto-üretilir (ui-avatars)', () => {
    const slots = makeSlots(7, ['unknown-user']);
    const result = enrichSlots(slots, users, '7v7');
    const taken = result.find(s => s.status === 'TAKEN');
    expect(taken?.player?.avatar).toContain('ui-avatars.com');
  });

  it('slot sayısı enrichSlots sonrası değişmez', () => {
    const slots = makeSlots(7, ['u1', 'u2']);
    const result = enrichSlots(slots, users, '7v7');
    expect(result).toHaveLength(7);
  });
});
