import { describe, it, expect } from 'vitest';
import { DEFAULT_TEMPO, normalizeTempo, tempoSpeedFactor } from '../../views/studio/types';
import { computeSeqMap } from '../../views/studio/pitchGeometry';
import type { DrawingLine } from '../../views/studio/types';

// ─── Tempo (1-10) — normalizasyon + oynatma hızı sözleşmesi ───────────────────
//
//   • Eski kayıtlar: Slow→3, Normal→5, Fast→8.
//   • Sayısal değerler 1-10'a kıskaçlanır ve yuvarlanır; bozuk değer → 5.
//   • Hız çarpanı: 0.5 + tempo × 0.1 (5 = 1.0x); tüm sekans süreleri bölünür.

describe('normalizeTempo', () => {
    it('eski string kayıtları eşler', () => {
        expect(normalizeTempo('Slow')).toBe(3);
        expect(normalizeTempo('Normal')).toBe(5);
        expect(normalizeTempo('Fast')).toBe(8);
    });

    it('sayı ve sayısal string 1-10 aralığına kıskaçlanır', () => {
        expect(normalizeTempo(7)).toBe(7);
        expect(normalizeTempo('7')).toBe(7);
        expect(normalizeTempo(0)).toBe(1);
        expect(normalizeTempo(-3)).toBe(1);
        expect(normalizeTempo(99)).toBe(10);
        expect(normalizeTempo(6.6)).toBe(7);
    });

    it('bozuk/boş değer varsayılana düşer', () => {
        expect(normalizeTempo(undefined)).toBe(DEFAULT_TEMPO);
        expect(normalizeTempo(null)).toBe(DEFAULT_TEMPO);
        expect(normalizeTempo('hızlı')).toBe(DEFAULT_TEMPO);
        expect(normalizeTempo(NaN)).toBe(DEFAULT_TEMPO);
    });
});

describe('tempoSpeedFactor', () => {
    it('5 = temel hız (1.0x); uçlar 0.6x ve 1.5x', () => {
        expect(tempoSpeedFactor(5)).toBeCloseTo(1.0);
        expect(tempoSpeedFactor(1)).toBeCloseTo(0.6);
        expect(tempoSpeedFactor(10)).toBeCloseTo(1.5);
    });

    it('eski string tempo da doğru çarpana gider', () => {
        expect(tempoSpeedFactor('Fast' as unknown as number)).toBeCloseTo(1.3); // 8 → 0.5 + 0.8
    });
});

describe('computeSeqMap — hız çarpanı', () => {
    const mkLine = (id: string, seqStep: number): DrawingLine => ({
        id,
        // yol uzunluğu 60 birim → temel süre 60/30 = 2 sn
        points: [{ x: 10, y: 90 }, { x: 10, y: 30 }],
        color: '#39FF14',
        type: 'line',
        seqStep,
    });

    it('speed=1 mevcut davranışı korur', () => {
        const { seqMap, totalSeqDuration } = computeSeqMap([mkLine('a', 1), mkLine('b', 2)]);
        expect(seqMap.get('a')!.duration).toBeCloseTo(2);
        expect(seqMap.get('b')!.startTime).toBeCloseTo(2);
        expect(totalSeqDuration).toBeCloseTo(4);
    });

    it('speed=2 tüm süreleri yarılar (başlangıç zamanları dahil)', () => {
        const { seqMap, totalSeqDuration } = computeSeqMap([mkLine('a', 1), mkLine('b', 2)], 2);
        expect(seqMap.get('a')!.duration).toBeCloseTo(1);
        expect(seqMap.get('b')!.startTime).toBeCloseTo(1);
        expect(totalSeqDuration).toBeCloseTo(2);
    });

    it('yavaş tempo süreleri uzatır (speed=0.6)', () => {
        const { totalSeqDuration } = computeSeqMap([mkLine('a', 1)], 0.6);
        expect(totalSeqDuration).toBeCloseTo(2 / 0.6);
    });
});
