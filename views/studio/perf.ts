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
 * `navigator.deviceMemory`nin ÜST SINIRI — bu değere kadar olan cihaz zayıf sayılır.
 *
 * DİKKAT — buradaki 6 rakamı "6 GB RAM" DEĞİLDİR ve öyle okunmamalıdır.
 * `navigator.deviceMemory` gerçek RAM'i vermez; tarayıcı onu parmak izi
 * çıkarmayı zorlaştırmak için ikinin kuvvetlerine yuvarlar ve 8'de keser.
 * Standart yalnız şu altı değere izin verir: 0.25 · 0.5 · 1 · 2 · 4 · 8.
 * Yani 5, 6 ya da 7 ASLA dönmez.
 *
 * Pratikte: 6 GB'lık bir Android'in çekirdeğe ayrılan pay düşüldükten sonraki
 * gerçek belleği ~5,5–5,9 GB'dır; 4 ile 8 arasındaki orta nokta 6 GB olduğu
 * için tarayıcı bunu 4 diye bildirir. Sonuç: 4 GB ve 6 GB telefonların İKİSİ
 * de bu eşiğin altında kalır, 8 GB ve üstü kalmaz.
 *
 * Eşiği 4 yerine 6 yazmak bu yüzden davranışı DEĞİŞTİRMEZ; niyeti kayda geçirir
 * ("6 GB'a kadar zayıf sayılsın" kararı) ki ileride biri 4'ü görüp "6 GB'lıklar
 * dışarıda kalmış" diye yanlış bir düzeltme yapmasın.
 */
export const LITE_MEMORY_MAX_GB = 6;

/** Zayıf sayılan çekirdek üst sınırı (dahil). */
export const LITE_CORES_MAX = 4;

/**
 * Cihaz sinyallerinden performans sınıfını türetir. Zayıf sinyal (az çekirdek /
 * az RAM) ya da reduced-motion → 'lite'. Bilinmeyen sinyaller güçlü sayılır
 * (modern cihaz varsayımı) ki iyi telefonlar tam kaliteyi kaybetmesin.
 */
export const perfTierFrom = (s: DeviceSignals): PerfTier => {
    if (s.reduceMotion) return 'lite';
    if (typeof s.memory === 'number' && s.memory > 0 && s.memory <= LITE_MEMORY_MAX_GB) return 'lite';
    if (typeof s.cores === 'number' && s.cores > 0 && s.cores <= LITE_CORES_MAX) return 'lite';
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
