// ════════════════════════════════════════════════════════════════════════
// MAÇ ZAMANLAMASI — saf yardımcılar (SSOT). Skoru yalnız hakem veya tesis
// sahibi girer ve ancak MAÇ BİTTİKTEN SONRA girebilir; "maç bitti"nin tek
// tanımı burada. Sunucudaki karşılığı matches.duration_minutes / ends_at
// (20260728113125_skor_yetki_zaman_kapisi.sql) ve aynı kuralı uygular.
//
// Neden gerekli: `duration` serbest metindir ('60 Dakika', '90 Dakika') ve
// repo genelinde "maç bitti" için `starts_at + 3 saat` sezgisi kullanılıyordu
// — 60 dakikalık bir maçta bu 2 saat gecikme demekti.
// ════════════════════════════════════════════════════════════════════════

/** Süre sınırları: bu aralık dışındaki her değer varsayılana çekilir. */
export const MIN_MATCH_MINUTES = 5;
export const MAX_MATCH_MINUTES = 300;
export const DEFAULT_MATCH_MINUTES = 60;

/**
 * Serbest metin/sayı süreden dakika çıkarır: '90 Dakika' → 90.
 * Okunamayan, aralık dışı veya eksik değerlerde 60 döner — böylece zaman
 * kapısı asla kilitlenmez ('1 saat' → 1 dakika gibi bir tuzağa düşmez).
 */
export function matchDurationMinutes(duration: unknown): number {
  if (typeof duration === 'number' && Number.isFinite(duration)) {
    return duration >= MIN_MATCH_MINUTES && duration <= MAX_MATCH_MINUTES
      ? Math.floor(duration)
      : DEFAULT_MATCH_MINUTES;
  }
  const parsed = parseInt(String(duration ?? '').match(/\d+/)?.[0] ?? '', 10);
  return Number.isFinite(parsed) && parsed >= MIN_MATCH_MINUTES && parsed <= MAX_MATCH_MINUTES
    ? parsed
    : DEFAULT_MATCH_MINUTES;
}

/** Maçın bitiş anı (ms). Başlangıç bilinmiyorsa null. */
export function matchEndMs(startMs: number | null | undefined, duration: unknown): number | null {
  if (startMs == null || !Number.isFinite(startMs)) return null;
  return startMs + matchDurationMinutes(duration) * 60_000;
}

/**
 * Maç bitti mi? Başlangıcı çözülemeyen maç bitmiş SAYILMAZ — skor kapısının
 * yanlışlıkla açılmasındansa kapalı kalması yeğdir.
 */
export function hasMatchEnded(
  startMs: number | null | undefined,
  duration: unknown,
  now: number = Date.now(),
): boolean {
  const end = matchEndMs(startMs, duration);
  return end != null && end <= now;
}
