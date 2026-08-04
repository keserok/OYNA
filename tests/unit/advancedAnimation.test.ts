import { describe, it, expect } from 'vitest';
import { computeSeqMap } from '../../views/studio/pitchGeometry';
import { getPlayerCssAnimation } from '../../views/studio/AdvancedAnimationModule';
import type { DrawingLine } from '../../views/studio/types';

// ─── Oyuncu koşu animasyonu — CSS @keyframes üretimi ─────────────────────────
//
// 2026-08-04: Oyuncular framer-motion yerine topla AYNI motorla (CSS keyframes)
// sürülüyor. Sebep: framer-motion'da "olduğu yerde dondur" yok — DURDUR'a
// basınca top donuyor, oyuncular yürümeye devam ediyordu. Ayrıca oyuncular
// rotayı iki tur yürürken top ve bitiş sayacı bir tur koşuyordu.
//
// Bu testler zamanlamanın doğruluğunu kilitler: SIRALI'da çizgi yalnız kendi
// penceresinde ilerler, EŞZAMANLI'da rota eşit dağılır, süre bir turdur.

const mkLine = (id: string, seqStep: number, type: DrawingLine['type'] = 'line'): DrawingLine => ({
    id,
    points: [{ x: 10, y: 90 }, { x: 30, y: 60 }, { x: 50, y: 30 }],
    color: '#39FF14',
    type,
    seqStep,
});

/** "12.5%{left:30%;top:60%}" → { at: 12.5, left: '30%', top: '60%' } */
const parseFrames = (css: string) => {
    const body = css.slice(css.indexOf('{') + 1, css.lastIndexOf('}'));
    return Array.from(body.matchAll(/([\d.]+)%\{left:([^;]+);top:([^}]+)\}/g)).map(m => ({
        at: Number(m[1]), left: m[2], top: m[3],
    }));
};

describe('getPlayerCssAnimation — genel', () => {
    it('iki noktadan az rotada animasyon yoktur (null)', () => {
        const one: DrawingLine = { ...mkLine('l1', 1), points: [{ x: 10, y: 90 }] };
        const { seqMap, totalSeqDuration } = computeSeqMap([one]);
        expect(getPlayerCssAnimation(one, 'SEQ', seqMap.get('l1')!, totalSeqDuration)).toBeNull();
    });

    it('@keyframes adı CSS kimliği olarak güvenlidir ve rakamla başlamaz', () => {
        const line: DrawingLine = { ...mkLine('l-17:44', 1) };
        const { seqMap, totalSeqDuration } = computeSeqMap([line]);
        const a = getPlayerCssAnimation(line, 'SYNC', seqMap.get('l-17:44')!, totalSeqDuration)!;
        expect(a.name).toMatch(/^[A-Za-z][A-Za-z0-9]*$/);
        expect(a.css.startsWith(`@keyframes ${a.name}{`)).toBe(true);
    });

    it('başlangıç noktası rotanın ilk noktasıdır (markör sıçramasın)', () => {
        const drawings = [mkLine('l1', 1)];
        const { seqMap, totalSeqDuration } = computeSeqMap(drawings);
        const a = getPlayerCssAnimation(drawings[0], 'SYNC', seqMap.get('l1')!, totalSeqDuration)!;
        expect(a.startX).toBe(10);
        expect(a.startY).toBe(90);
    });

    it('kareler yüzde sırasına göre artan ve 0-100 aralığındadır', () => {
        const drawings = [mkLine('l1', 1), mkLine('l2', 2), mkLine('l3', 3)];
        const { seqMap, totalSeqDuration } = computeSeqMap(drawings);
        const a = getPlayerCssAnimation(drawings[1], 'SEQ', seqMap.get('l2')!, totalSeqDuration)!;
        const frames = parseFrames(a.css);
        expect(frames.length).toBeGreaterThan(1);
        for (const f of frames) { expect(f.at).toBeGreaterThanOrEqual(0); expect(f.at).toBeLessThanOrEqual(100); }
        const ats = frames.map(f => f.at);
        expect([...ats].sort((x, y) => x - y)).toEqual(ats);
    });
});

describe('getPlayerCssAnimation — EŞZAMANLI (SYNC)', () => {
    it('rota kendi süresi boyunca eşit aralıklarla kat edilir (0 → 50 → 100)', () => {
        const drawings = [mkLine('l1', 1)];
        const { seqMap, totalSeqDuration } = computeSeqMap(drawings);
        const info = seqMap.get('l1')!;
        const a = getPlayerCssAnimation(drawings[0], 'SYNC', info, totalSeqDuration)!;

        expect(a.duration).toBe(info.duration);           // bir tur = çizginin kendi süresi
        const frames = parseFrames(a.css);
        expect(frames.map(f => f.at)).toEqual([0, 50, 100]);
        expect(frames[0]).toMatchObject({ left: '10%', top: '90%' });
        expect(frames[2]).toMatchObject({ left: '50%', top: '30%' });
    });
});

describe('getPlayerCssAnimation — SIRALI (SEQ)', () => {
    it('bir tur = TOPLAM sekans süresi (tüm çizgiler ortak saati paylaşır)', () => {
        const drawings = [mkLine('l1', 1), mkLine('l2', 2)];
        const { seqMap, totalSeqDuration } = computeSeqMap(drawings);
        for (const id of ['l1', 'l2']) {
            const line = drawings.find(d => d.id === id)!;
            const a = getPlayerCssAnimation(line, 'SEQ', seqMap.get(id)!, totalSeqDuration)!;
            expect(a.duration).toBe(totalSeqDuration);
        }
    });

    it('ilk adım 0%tan başlar; penceresi bitince bitiş noktasında 100%e kadar bekler', () => {
        const drawings = [mkLine('l1', 1), mkLine('l2', 2)];
        const { seqMap, totalSeqDuration } = computeSeqMap(drawings);
        const a = getPlayerCssAnimation(drawings[0], 'SEQ', seqMap.get('l1')!, totalSeqDuration)!;
        const frames = parseFrames(a.css);

        expect(frames[0].at).toBe(0);
        expect(frames[0]).toMatchObject({ left: '10%', top: '90%' });   // rotanın başı
        const last = frames[frames.length - 1];
        expect(last.at).toBe(100);
        expect(last).toMatchObject({ left: '50%', top: '30%' });        // bitişte bekler
    });

    it('sonraki adım penceresi açılana dek BAŞLANGIÇ noktasında bekler', () => {
        const drawings = [mkLine('l1', 1), mkLine('l2', 2)];
        const { seqMap, totalSeqDuration } = computeSeqMap(drawings);
        const info = seqMap.get('l2')!;
        const a = getPlayerCssAnimation(drawings[1], 'SEQ', info, totalSeqDuration)!;
        const frames = parseFrames(a.css);

        // 0%'da hâlâ rotanın başındadır (henüz sırası gelmedi)
        expect(frames[0].at).toBe(0);
        expect(frames[0]).toMatchObject({ left: '10%', top: '90%' });
        // Hareket, kendi penceresinin başladığı yüzdede başlar
        const startPct = (info.startTime / totalSeqDuration) * 100;
        expect(frames.some(f => Math.abs(f.at - startPct) < 0.01)).toBe(true);
        // Pencere başlangıcından ÖNCE yer değiştirme yok
        for (const f of frames) {
            if (f.at < startPct - 0.01) expect(f).toMatchObject({ left: '10%', top: '90%' });
        }
    });

    it('adımlar birbirini takip eder: 1. adımın penceresi 2. adımdan önce biter', () => {
        const drawings = [mkLine('l1', 1), mkLine('l2', 2)];
        const { seqMap, totalSeqDuration } = computeSeqMap(drawings);
        const i1 = seqMap.get('l1')!, i2 = seqMap.get('l2')!;
        expect(i1.startTime + i1.duration).toBeLessThanOrEqual(i2.startTime + 1e-9);
        expect(totalSeqDuration).toBeGreaterThanOrEqual(i2.startTime + i2.duration - 1e-9);
    });
});
