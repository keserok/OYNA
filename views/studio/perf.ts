// Stüdyo performans katmanı — saf yardımcılar (SSOT).
//
// Amaç: içerik her telefonda AYNI kalsın; yalnız pahalı süs efektleri (gölge,
// blur, glow, layout animasyonu) zayıf cihazlarda kısılsın. İyi telefonlar tam
// görsel kaliteyi alır. Karar tek yerde (test edilebilir) verilir.

export type PerfTier = 'lite' | 'full';

export interface DeviceSignals {
    /** navigator.hardwareConcurrency — mantıksal çekirdek sayısı. */
    cores?: number;
    /** navigator.deviceMemory — yaklaşık RAM (GB). */
    memory?: number;
    /** Kullanıcı "hareketi azalt" tercih ediyor mu (prefers-reduced-motion). */
    reduceMotion?: boolean;
}

/**
 * Cihaz sinyallerinden performans sınıfını türetir. Zayıf sinyal (az çekirdek /
 * az RAM) ya da reduced-motion → 'lite'. Bilinmeyen sinyaller güçlü sayılır
 * (modern cihaz varsayımı) ki iyi telefonlar tam kaliteyi kaybetmesin.
 */
export const perfTierFrom = (s: DeviceSignals): PerfTier => {
    if (s.reduceMotion) return 'lite';
    if (typeof s.memory === 'number' && s.memory > 0 && s.memory <= 4) return 'lite';
    if (typeof s.cores === 'number' && s.cores > 0 && s.cores <= 4) return 'lite';
    return 'full';
};

/** Tarayıcı sinyallerini oku (SSR/eski tarayıcı güvenli). */
export const readDeviceSignals = (reduceMotion?: boolean): DeviceSignals => {
    const nav = (typeof navigator !== 'undefined' ? navigator : {}) as Navigator & { deviceMemory?: number };
    return {
        cores: typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : undefined,
        memory: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : undefined,
        reduceMotion: !!reduceMotion,
    };
};

/** 'lite'te pahalı sınıfı boşa indirger; 'full'de olduğu gibi bırakır. */
export const liteGate = (tier: PerfTier, expensiveClass: string): string =>
    tier === 'lite' ? '' : expensiveClass;
