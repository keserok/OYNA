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

/**
 * KARTTA GÖSTERİLECEK GERÇEK SÜRE — `matches.duration_minutes` (E6/E1a).
 *
 * `matchDurationMinutes` zaman KAPISI içindir ve okunamayan değerde 60'a düşer;
 * bu kabul zaman kapısı için doğru ama EKRAN için yanlıştır: 60 yazmak kullanıcıya
 * yalan söylemektir. Bu yüzden burada yedek YOKTUR — veri yoksa `null` döner ve
 * arayüz alanı hiç göstermez.
 *
 * Serbest metin `duration` ('90 Dakika') BİLEREK okunmaz: o alan eski/serbest
 * girdidir ve sunucu SSOT'u değildir (create_match_atomic onu düşürür).
 */
export function realMatchMinutes(
  match: { durationMinutes?: number | null; duration_minutes?: number | null } | null | undefined,
): number | null {
  const raw = match?.durationMinutes ?? match?.duration_minutes;
  const n = typeof raw === 'number' ? raw : parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(n)) return null;
  if (n < MIN_MATCH_MINUTES || n > MAX_MATCH_MINUTES) return null;
  return Math.floor(n);
}

/**
 * Süre etiketi — TEK biçim: "90 dakika". İtalik KULLANILMAZ (karar S17: italik
 * yalnız skorda). Veri yoksa null döner; çağıran alanı hiç çizmez.
 */
export function formatMatchDuration(
  match: { durationMinutes?: number | null; duration_minutes?: number | null } | null | undefined,
): string | null {
  const m = realMatchMinutes(match);
  return m == null ? null : `${m} dakika`;
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
