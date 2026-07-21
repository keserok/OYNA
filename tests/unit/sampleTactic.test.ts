import { describe, it, expect } from 'vitest';
import { buildSampleTactic } from '../../views/studio/sampleTactic';
import { computeSeqMap } from '../../views/studio/pitchGeometry';
import type { Player } from '../../views/studio/types';

// ─── Örnek taktik üreticisi ───────────────────────────────────────────────────

describe('buildSampleTactic', () => {
    it('7v7 2-3-1: tüm mevkiler dolu, çalışan çizim üretir', () => {
        const t = buildSampleTactic({ id: 'x' });
        expect(t.size).toBe('7v7');
        expect(t.formation).toBe('2-3-1');
        expect(t.slots).toHaveLength(7);
        expect(t.slots.every(s => !!s.player)).toBe(true);
        // Pas + koşu var → OYNAT bir şey oynatır
        expect(t.drawings?.some(d => d.type === 'arrow')).toBe(true);
        expect(t.drawings?.some(d => d.type === 'line')).toBe(true);
    });

    it('çizimler oynatılabilir bir sekans üretir (süre > 0)', () => {
        const t = buildSampleTactic({ id: 'x' });
        const { totalSeqDuration } = computeSeqMap(t.drawings!);
        expect(totalSeqDuration).toBeGreaterThan(0);
    });

    it('gerçek kadro verilirse onları dizer', () => {
        const players: Player[] = Array.from({ length: 7 }, (_, i) => ({
            id: `u-${i}`, name: `Gerçek ${i}`, role: 'MID', rating: 80, jersey: i + 1,
        }));
        const t = buildSampleTactic({ id: 'x', players });
        expect(t.slots[0].player?.id).toBe('u-0');
        expect(t.slots[6].player?.name).toBe('Gerçek 6');
    });

    it('kadro yoksa Türkçe yer-tutucu isimler kullanır', () => {
        const t = buildSampleTactic({ id: 'x' });
        expect(t.slots[0].player?.name).toBe('Kaleci');
        expect(t.slots[1].player?.name).toBe('Emre');
    });

    it('verilen id taşınır', () => {
        expect(buildSampleTactic({ id: 'plan-9' }).id).toBe('plan-9');
    });
});
