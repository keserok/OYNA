import { describe, it, expect } from 'vitest';
import { perfTierFrom, liteGate, LITE_MEMORY_MAX_GB, LITE_CORES_MAX } from '../../views/studio/perf';

// ─── Stüdyo performans katmanı — cihaz sınıfı kararı ──────────────────────────
//
// Kural: içerik değişmez; yalnız süs efektleri zayıf cihazda kısılır. Bilinmeyen
// sinyaller GÜÇLÜ sayılır (modern cihaz varsayımı) — iyi telefon kalite kaybetmez.

describe('perfTierFrom', () => {
    it('reduced-motion → lite', () => {
        expect(perfTierFrom({ reduceMotion: true, cores: 16, memory: 16 })).toBe('lite');
    });

    it('az RAM → lite', () => {
        expect(perfTierFrom({ memory: 4 })).toBe('lite');
        expect(perfTierFrom({ memory: 2 })).toBe('lite');
    });

    // `navigator.deviceMemory` standardı YALNIZ şu değerleri döndürebilir:
    // 0.25 · 0.5 · 1 · 2 · 4 · 8. Sınıflandırmanın gerçek ayrım noktası bu
    // yüzden "4 mü 8 mi" sorusudur — 5/6/7 hiç gelmez. Bu test, kullanıcının
    // "4-6 GB telefonlar zayıf sayılsın" kararının izinli değerlerin
    // TAMAMINDA doğru sonuç verdiğini sabitler.
    it('deviceMemory standardının izin verdiği her değer doğru sınıflanır', () => {
        const izinliDegerler = [0.25, 0.5, 1, 2, 4, 8] as const;
        const beklenen = izinliDegerler.map((m) => (m <= LITE_MEMORY_MAX_GB ? 'lite' : 'full'));
        expect(izinliDegerler.map((m) => perfTierFrom({ memory: m, cores: 8 }))).toEqual(beklenen);
        // 6 GB'lık telefon tarayıcı tarafından 4 diye bildirilir → zayıf sayılır.
        expect(perfTierFrom({ memory: 4, cores: 8 })).toBe('lite');
    });

    it('az çekirdek → lite', () => {
        expect(perfTierFrom({ cores: LITE_CORES_MAX })).toBe('lite');
        expect(perfTierFrom({ cores: 2 })).toBe('lite');
    });

    it('güçlü cihaz → full', () => {
        expect(perfTierFrom({ cores: 8, memory: 8 })).toBe('full');
    });

    it('eşikler ürün kararını taşır (4-6 GB ve altı zayıf, 8 GB güçlü)', () => {
        expect(LITE_MEMORY_MAX_GB).toBe(6);
        expect(LITE_CORES_MAX).toBe(4);
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
