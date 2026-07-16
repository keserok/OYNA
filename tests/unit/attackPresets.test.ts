import { describe, it, expect } from 'vitest';
import { ATTACK_PRESETS, outfieldCount } from '../../views/studio/attackPresets';
import { FORMATIONS, SQUAD_SIZES } from '../../utils/formations';
import type { SquadSize } from '../../utils/formations';
import { computeSeqMap } from '../../views/studio/pitchGeometry';
import { getAnimationProps } from '../../views/studio/AdvancedAnimationModule';
import type { Slot, DrawingLine } from '../../views/studio/types';

// ─── Atak Kütüphanesi (attackPresets) ─────────────────────────────────────────
//
// Sözleşme:
//   • Şablon, verilen dizilişe uyarlanır ve DrawingLine[] üretir.
//   • koşu='line' (attachedTo oyuncuyu taşır), pas='arrow' (top bu yolda oynar).
//   • Tüm noktalar saha içinde (0–100), sekans adımları 1'den bitişik ilerler.
//   • Bir oyuncuya en fazla BİR koşu bağlanır (çekirdek find ile ilkini oynatır).
//   • Kadro yetersizse şablon fırlatmaz; null döner.

const STUDIO_SIZES = SQUAD_SIZES.filter(s => s !== '2v2') as SquadSize[];

const slotsOf = (size: SquadSize, formation: string): Slot[] =>
    JSON.parse(JSON.stringify(FORMATIONS[size][formation]));

describe('ATTACK_PRESETS — her boyut ve formasyonda geçerli çizim üretir', () => {
    for (const preset of ATTACK_PRESETS) {
        for (const size of STUDIO_SIZES) {
            for (const formation of Object.keys(FORMATIONS[size])) {
                const slots = slotsOf(size, formation);
                if (outfieldCount(slots) < preset.minOutfield) continue; // UI bu eşikte kilitler

                it(`${preset.id} @ ${size} ${formation}`, () => {
                    const drawings = preset.build(slots, 'test');
                    expect(drawings).not.toBeNull();
                    const d = drawings as DrawingLine[];
                    expect(d.length).toBeGreaterThan(0);

                    // Kimlikler benzersiz
                    expect(new Set(d.map(l => l.id)).size).toBe(d.length);

                    // Tüm noktalar saha sınırları içinde
                    for (const l of d) {
                        expect(l.points.length).toBeGreaterThanOrEqual(2);
                        for (const p of l.points) {
                            expect(p.x).toBeGreaterThanOrEqual(0);
                            expect(p.x).toBeLessThanOrEqual(100);
                            expect(p.y).toBeGreaterThanOrEqual(0);
                            expect(p.y).toBeLessThanOrEqual(100);
                        }
                    }

                    // attachedTo daima sahadaki bir slota işaret eder
                    const slotIds = new Set(slots.map(s => s.id));
                    for (const l of d) {
                        expect(l.attachedTo).toBeTruthy();
                        expect(slotIds.has(l.attachedTo!)).toBe(true);
                    }

                    // Oyuncu başına en fazla bir koşu ('line')
                    const runsPerSlot = new Map<string, number>();
                    d.filter(l => l.type === 'line').forEach(l => {
                        runsPerSlot.set(l.attachedTo!, (runsPerSlot.get(l.attachedTo!) || 0) + 1);
                    });
                    for (const count of runsPerSlot.values()) expect(count).toBe(1);

                    // En az bir pas ve en az bir koşu var (atak = pas + hareket)
                    expect(d.some(l => l.type === 'arrow')).toBe(true);
                    expect(d.some(l => l.type === 'line')).toBe(true);

                    // Sekans adımları 1'den bitişik (SIRALI oynatma boş adım bırakmaz)
                    const steps = Array.from(new Set(d.map(l => l.seqStep))).sort((a, b) => a - b);
                    expect(steps[0]).toBe(1);
                    expect(steps).toEqual(Array.from({ length: steps.length }, (_, i) => i + 1));
                    expect(steps.length).toBe(preset.steps);

                    // Atak kaleye bağlanır: son adımda kale ağzında biten bir pas (şut) var
                    const lastStep = steps[steps.length - 1];
                    const shot = d.find(l => l.seqStep === lastStep && l.type === 'arrow');
                    expect(shot).toBeTruthy();
                    const end = shot!.points[shot!.points.length - 1];
                    expect(end.y).toBeLessThanOrEqual(6);
                });
            }
        }
    }
});

describe('ATTACK_PRESETS — kenar durumlar', () => {
    it('aynı girdi + aynı idPrefix → deterministik çıktı', () => {
        const slots = slotsOf('7v7', '2-3-1');
        for (const preset of ATTACK_PRESETS) {
            const a = preset.build(slotsOf('7v7', '2-3-1'), 'sabit');
            const b = preset.build(slots, 'sabit');
            expect(a).toEqual(b);
        }
    });

    it('rol eksikken (2-0-1: MID/FWD yok) seçici geri düşer, şablon yine üretir', () => {
        const slots = slotsOf('3v3', '2-0-1'); // GK + 2 DEF
        const verkac = ATTACK_PRESETS.find(p => p.id === 'VERKAC')!;
        const kontra = ATTACK_PRESETS.find(p => p.id === 'KONTRA')!;
        expect(verkac.build(slots, 't')).not.toBeNull();
        expect(kontra.build(slots, 't')).not.toBeNull();
    });

    it('kadro yetersizse fırlatmaz; null döner', () => {
        const slots = slotsOf('3v3', '1-1-1'); // 2 saha oyuncusu
        const ucgen = ATTACK_PRESETS.find(p => p.id === 'UCGEN')!; // 4 oyuncu ister
        expect(outfieldCount(slots)).toBeLessThan(ucgen.minOutfield);
        expect(() => ucgen.build(slots, 't')).not.toThrow();
        expect(ucgen.build(slots, 't')).toBeNull();
    });

    it('outfieldCount kaleciyi saymaz', () => {
        expect(outfieldCount(slotsOf('7v7', '2-3-1'))).toBe(6);
    });
});

// ─── getAnimationProps — top görünürlük penceresi (fadeOutsideWindow) ─────────

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
