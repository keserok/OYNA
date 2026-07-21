import { describe, it, expect } from 'vitest';
import { perfTierFrom, liteGate } from '../../views/studio/perf';

// ─── Stüdyo performans katmanı — cihaz sınıfı kararı ──────────────────────────
//
// Kural: içerik değişmez; yalnız süs efektleri zayıf cihazda kısılır. Bilinmeyen
// sinyaller GÜÇLÜ sayılır (modern cihaz varsayımı) — iyi telefon kalite kaybetmez.

describe('perfTierFrom', () => {
    it('reduced-motion → lite', () => {
        expect(perfTierFrom({ reduceMotion: true, cores: 16, memory: 16 })).toBe('lite');
    });

    it('az RAM (≤4GB) → lite', () => {
        expect(perfTierFrom({ memory: 4 })).toBe('lite');
        expect(perfTierFrom({ memory: 2 })).toBe('lite');
    });

    it('az çekirdek (≤4) → lite', () => {
        expect(perfTierFrom({ cores: 4 })).toBe('lite');
        expect(perfTierFrom({ cores: 2 })).toBe('lite');
    });

    it('güçlü cihaz → full', () => {
        expect(perfTierFrom({ cores: 8, memory: 8 })).toBe('full');
    });

    it('bilinmeyen sinyaller → full (modern cihaz varsayımı)', () => {
        expect(perfTierFrom({})).toBe('full');
        expect(perfTierFrom({ cores: 0, memory: 0 })).toBe('full');
    });

    it('güçlü çekirdek ama az RAM → lite (herhangi biri zayıfsa)', () => {
        expect(perfTierFrom({ cores: 8, memory: 3 })).toBe('lite');
    });
});

describe('liteGate', () => {
    it('lite pahalı sınıfı boşaltır; full korur', () => {
        expect(liteGate('lite', 'shadow-xl blur-md')).toBe('');
        expect(liteGate('full', 'shadow-xl blur-md')).toBe('shadow-xl blur-md');
    });
});
