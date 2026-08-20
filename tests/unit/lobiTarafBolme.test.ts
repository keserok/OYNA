import { describe, it, expect } from 'vitest';
import { normalizeMatchSides } from '../../shared/lobbyEnrichment';
import type { PositionSlot } from '../../types';

// ═══════════════════════════════════════════════════════════════════════════
// HAYALET KADRO YASAĞI — karar kilidi (20 Ağustos 2026)
//
// BULGU: iki tarafı tek dizide taşıyan kayıtlarda (slots=10, awaySlots=boş)
// lobi deplasman için şablondan 10 slot uyduruyordu. Ana sayfa kartı DB'ye
// bakıp "6 yer kaldı" derken lobi 20 pozisyonun 14'ünü açık gösteriyordu ve
// uydurma slotu satın almak sunucudan dönüyordu (SLOT_NOT_FOUND).
//
// KURAL: slot UYDURULMAZ. Çift sayılı tek dizi ikiye bölünür; bölünemeyen
// olduğu gibi kalır ve karşı taraf boş görünür.
// ═══════════════════════════════════════════════════════════════════════════

const slot = (id: string, status: 'OPEN' | 'TAKEN' = 'OPEN'): PositionSlot =>
  ({ id, role: 'OYUNCU', status } as unknown as PositionSlot);

const dizi = (n: number, dolu = 0): PositionSlot[] =>
  Array.from({ length: n }, (_, i) => slot(`slot_${i}`, i < dolu ? 'TAKEN' : 'OPEN'));

describe('normalizeMatchSides — tek dizi ikiye bölünür', () => {
  it('kurucunun gördüğü maç: 10 slot (6 dolu) → 5+5, toplam AÇIK sayısı DB ile aynı kalır', () => {
    const { home, away } = normalizeMatchSides(dizi(10, 6), []);
    expect(home).toHaveLength(5);
    expect(away).toHaveLength(5);
    const acik = [...home, ...away].filter((s) => s.status === 'OPEN').length;
    expect(acik).toBe(4); // DB'de 4 açık varsa lobi de 4 gösterir — 14 değil
  });

  it('kimlikler korunur: bölme yeni slot ÜRETMEZ, sırayı bozmaz', () => {
    const { home, away } = normalizeMatchSides(dizi(10), []);
    expect(home.map((s) => s.id)).toEqual(['slot_0', 'slot_1', 'slot_2', 'slot_3', 'slot_4']);
    expect(away.map((s) => s.id)).toEqual(['slot_5', 'slot_6', 'slot_7', 'slot_8', 'slot_9']);
  });

  it('iki taraf zaten ayrıysa dokunulmaz (kanonik 5+5 kayıt)', () => {
    const ev = dizi(5, 2);
    const dep = dizi(5, 1);
    const out = normalizeMatchSides(ev, dep);
    expect(out.home).toBe(ev);
    expect(out.away).toBe(dep);
  });

  it('tek sayılı dizi bölünmez, karşı taraf BOŞ kalır — hayalet slot yok', () => {
    const { home, away } = normalizeMatchSides(dizi(7), []);
    expect(home).toHaveLength(7);
    expect(away).toHaveLength(0);
  });

  it('yarım gerçek takım boyu etmiyorsa (< 4v4) bölünmez', () => {
    const { home, away } = normalizeMatchSides(dizi(6), []);
    expect(home).toHaveLength(6);
    expect(away).toHaveLength(0);
  });

  it('hiç slot yoksa iki taraf da boş döner (şablon kararı çağırana kalır)', () => {
    const out = normalizeMatchSides([], []);
    expect(out.home).toHaveLength(0);
    expect(out.away).toHaveLength(0);
  });

  it('bilinen formatlar: 8→4+4 · 14→7+7 · 16→8+8 · 20→10+10 · 22→11+11', () => {
    for (const [toplam, yarim] of [[8, 4], [14, 7], [16, 8], [20, 10], [22, 11]] as const) {
      const { home, away } = normalizeMatchSides(dizi(toplam), []);
      expect(home, `${toplam} slot`).toHaveLength(yarim);
      expect(away, `${toplam} slot`).toHaveLength(yarim);
    }
  });
});
