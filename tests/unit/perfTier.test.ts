import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ─── Uygulama geneli cihaz gücü sınıfı ───────────────────────────────────────
//
// `utils/perfTier.ts`, zayıf telefonlarda pahalı cam/bulanıklık efektlerini
// kapatan `oyna-lite` sınıfını <html> etiketine ekler. Karar mantığı
// `views/studio/perf.ts` içindedir (orası ayrıca test edilir); burada test
// edilen şey KARARIN DOĞRU UYGULANMASI: doğru cihazda sınıf eklenmeli, güçlü
// cihazda kesinlikle eklenmemeli.
//
// Modül, sınıfı bir kez hesaplayıp içinde saklıyor; bu yüzden her testte
// `resetModules` ile taze alınır.

const tazeModul = async () => {
    vi.resetModules();
    return import('../../utils/perfTier');
};

/** navigator üzerindeki güç sinyallerini test için sahteleyip geri alır. */
const sinyalKur = (cores?: number, memory?: number) => {
    vi.stubGlobal('navigator', {
        ...navigator,
        hardwareConcurrency: cores,
        deviceMemory: memory,
    });
};

const hareketTercihiKur = (azalt: boolean) => {
    vi.stubGlobal('matchMedia', ((query: string) => ({
        matches: azalt && query.includes('prefers-reduced-motion'),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia);
};

beforeEach(() => {
    document.documentElement.className = '';
    localStorage.clear();
    hareketTercihiKur(false);
});

afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.className = '';
    localStorage.clear();
});

describe('installPerfTier', () => {
    it('az RAM (≤4GB) → lite ve <html> sınıfı eklenir', async () => {
        sinyalKur(8, 3);
        const { installPerfTier } = await tazeModul();
        expect(installPerfTier()).toBe('lite');
        expect(document.documentElement.classList.contains('oyna-lite')).toBe(true);
    });

    it('az çekirdek (≤4) → lite', async () => {
        sinyalKur(4, 8);
        const { installPerfTier } = await tazeModul();
        expect(installPerfTier()).toBe('lite');
        expect(document.documentElement.classList.contains('oyna-lite')).toBe(true);
    });

    it('güçlü cihaz → full, sınıf EKLENMEZ (tam görsel kalite korunur)', async () => {
        sinyalKur(8, 8);
        const { installPerfTier } = await tazeModul();
        expect(installPerfTier()).toBe('full');
        expect(document.documentElement.classList.contains('oyna-lite')).toBe(false);
    });

    it('sinyal yoksa güçlü sayılır — iyi telefon kalite kaybetmez', async () => {
        sinyalKur(undefined, undefined);
        const { installPerfTier } = await tazeModul();
        expect(installPerfTier()).toBe('full');
        expect(document.documentElement.classList.contains('oyna-lite')).toBe(false);
    });

    it('kullanıcı "hareketi azalt" diyorsa → lite', async () => {
        sinyalKur(16, 16);
        hareketTercihiKur(true);
        const { installPerfTier } = await tazeModul();
        expect(installPerfTier()).toBe('lite');
    });

    it('elle geçersiz kılma cihaz sinyalini EZER (destek/test için)', async () => {
        sinyalKur(16, 16);
        localStorage.setItem('oyna.perfTier', 'lite');
        const { installPerfTier } = await tazeModul();
        expect(installPerfTier()).toBe('lite');
        expect(document.documentElement.classList.contains('oyna-lite')).toBe(true);
    });

    it('elle "full" denirse zayıf cihazda bile tam kalite verir', async () => {
        sinyalKur(2, 2);
        localStorage.setItem('oyna.perfTier', 'full');
        const { installPerfTier } = await tazeModul();
        expect(installPerfTier()).toBe('full');
        expect(document.documentElement.classList.contains('oyna-lite')).toBe(false);
    });

    it('geçersiz elle değer yoksayılır, cihaz sinyaline dönülür', async () => {
        sinyalKur(2, 2);
        localStorage.setItem('oyna.perfTier', 'saçma');
        const { installPerfTier } = await tazeModul();
        expect(installPerfTier()).toBe('lite');
    });
});

describe('getPerfTier', () => {
    it('kurulmadan önce güçlü cihaz varsayar', async () => {
        const { getPerfTier } = await tazeModul();
        expect(getPerfTier()).toBe('full');
    });

    it('kurulduktan sonra kurulan sınıfı döndürür', async () => {
        sinyalKur(2, 2);
        const { installPerfTier, getPerfTier } = await tazeModul();
        installPerfTier();
        expect(getPerfTier()).toBe('lite');
    });
});
