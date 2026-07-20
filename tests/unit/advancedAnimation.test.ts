import { describe, it, expect } from 'vitest';
import { computeSeqMap } from '../../views/studio/pitchGeometry';
import { getAnimationProps } from '../../views/studio/AdvancedAnimationModule';
import type { DrawingLine } from '../../views/studio/types';

// ─── getAnimationProps — top görünürlük penceresi (fadeOutsideWindow) ─────────
//
// SIRALI oynatmada top yalnız kendi pas penceresinde görünür (sahada tek top
// hissi); oyuncu markörleri bayrağı geçmediği için görünür kalır.

describe('getAnimationProps — SIRALI modda top pencere dışında gizlenir', () => {
    const mkLine = (id: string, seqStep: number): DrawingLine => ({
        id,
        points: [{ x: 10, y: 90 }, { x: 30, y: 60 }, { x: 50, y: 30 }],
        color: '#39FF14',
        type: 'arrow',
        seqStep,
    });

    it('orta adımdaki pas: opacity pencere öncesi/sonrası 0, pencere içinde 1', () => {
        const drawings = [mkLine('l1', 1), mkLine('l2', 2), mkLine('l3', 3)];
        const { seqMap, totalSeqDuration } = computeSeqMap(drawings);
        const anim = getAnimationProps(drawings[1], true, 'SEQ', seqMap.get('l2')!, totalSeqDuration, true);
        const opacity = (anim.animate as { opacity?: number[] }).opacity;
        expect(opacity).toBeDefined();
        expect(opacity![0]).toBe(0);                       // döngü başı: görünmez
        expect(opacity![opacity!.length - 1]).toBe(0);     // adımı bitince: görünmez (son adım değil)
        expect(opacity).toContain(1);                      // kendi penceresinde: görünür
        // Keyframe dizileri hizalı (framer-motion şartı)
        const a = anim.animate as { left: string[]; top: string[]; opacity: number[] };
        const t = (anim.transition as { times: number[] }).times;
        expect(a.left.length).toBe(t.length);
        expect(a.top.length).toBe(t.length);
        expect(a.opacity.length).toBe(t.length);
    });

    it('oyuncu markörü (bayrak yok): opacity anahtarı üretilmez', () => {
        const drawings = [mkLine('l1', 1), mkLine('l2', 2)];
        const { seqMap, totalSeqDuration } = computeSeqMap(drawings);
        const anim = getAnimationProps(drawings[1], true, 'SEQ', seqMap.get('l2')!, totalSeqDuration);
        expect((anim.animate as { opacity?: number[] }).opacity).toBeUndefined();
    });

    it('simülasyon kapalıyken boş animasyon döner', () => {
        const drawings = [mkLine('l1', 1)];
        const { seqMap, totalSeqDuration } = computeSeqMap(drawings);
        const anim = getAnimationProps(drawings[0], false, 'SEQ', seqMap.get('l1')!, totalSeqDuration, true);
        expect(anim.animate).toEqual({});
    });
});
