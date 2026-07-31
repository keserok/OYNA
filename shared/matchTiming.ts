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

// ── MAÇIN BAŞLANGIÇ ANI ──────────────────────────────────────────────────
// SSOT: `matches.starts_at` (timestamptz). `date`/`time` serbest METİN
// kolonlarıdır ve veritabanında ISO ('2026-08-01') tutulur; ama eski/uydurma
// kayıtlarda 'Bugün' / 'Yarın' / 'Cumartesi' gibi etiketler de görülebilir.
//
// Neden burada: Top Oyna gün filtresi, kart geri sayımı ve "bugünkü maç"
// sayısı aynı tarihi çözmek zorunda. Ayrı ayrı çözülüyordu ve METİN çözücü
// ISO tarihi TANIMIYORDU: '2026-08-01' hiçbir kalıba uymadığı için sessizce
// BUGÜNE düşüyordu — yani her maç "bugün" sanılıyordu.

const WEEKDAY_INDEX: Record<string, number> = {
  pazar: 0, pazartesi: 1, salı: 2, sali: 2, çarşamba: 3, carsamba: 3,
  perşembe: 4, persembe: 4, cuma: 5, cumartesi: 6,
};

/** 'HH:MM' ya da '22:00 - 23:00' → [saat, dakika]; okunamazsa [0, 0]. */
function parseClock(timeStr: unknown): [number, number] {
  const m = String(timeStr ?? '').match(/(\d{1,2}):(\d{2})/);
  if (!m) return [0, 0];
  const h = Number(m[1]);
  const min = Number(m[2]);
  return [h >= 0 && h <= 23 ? h : 0, min >= 0 && min <= 59 ? min : 0];
}

/**
 * Maçın başlangıç anı (ms). Sırayla dener:
 *   1. ISO `date`/`rawDate` ('2026-08-01') + `time` ('21:00') — CİHAZ SAATİYLE
 *   2. `starts_at` / `startsAt` (timestamp)
 *   3. Eski metin etiketleri: 'Bugün' / 'Yarın' / gün adı + `time`
 * Hiçbiri çözülemezse null — çağıran uydurma tarih göstermek yerine alanı çizmez.
 *
 * NEDEN `date` + `time` İLK SIRADA:
 * Bu ikisi kartta YAZAN değerdir. Gün şeridi, kart tarihi ve gün sayaçları
 * aynı kaynaktan beslendiği için hepsi her zaman aynı şeyi söyler; kullanıcı
 * cihazının saat dilimi ne olursa olsun "20:00 maçı" 20:00 olarak görünür.
 *
 * `starts_at` ise maçın MUTLAK anıdır ve sunucu tarafının otoritesidir
 * (hatırlatma, iade, otomatik iptal, görevli eşleştirme onu okur). Bir dönem
 * yanlış saat dilimiyle yazıldığı (İstanbul duvar saati UTC sanılıyordu, 3
 * saat sapma) için burada bilerek ikinci sıradaydı; o sapma
 * 20260903000000_mac_saati_istanbul_saat_dilimi ile giderildi. Sıralamanın
 * korunma sebebi artık sapma değil, yukarıdaki EKRAN TUTARLILIĞIDIR.
 */
export function matchStartMs(
  match: Record<string, any> | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!match) return null;

  // `rawDate`: admin eşleyicisi `date`i 'Bugün'/'5 Ağu' etiketine çevirirken
  // ham ISO tarihi bu alanda saklar (admin-panel/utils/matchMapper).
  const raw = String(match.rawDate ?? match.date ?? '').trim();
  const [hours, minutes] = parseClock(match.time);

  // ISO: 2026-08-01 (veritabanının fiilen yazdığı biçim)
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), hours, minutes, 0, 0);
    if (Number.isFinite(d.getTime())) return d.getTime();
  }

  const stamp = match.starts_at ?? match.startsAt;
  if (stamp) {
    const t = new Date(stamp).getTime();
    if (Number.isFinite(t)) return t;
  }

  if (!raw) return null;

  // Eski serbest metin etiketleri
  const label = raw.toLocaleLowerCase('tr-TR');
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0);
  if (label === 'bugün') return base.getTime();
  if (label === 'yarın') { base.setDate(base.getDate() + 1); return base.getTime(); }

  const target = WEEKDAY_INDEX[label];
  if (target !== undefined) {
    let diff = target - now.getDay();
    if (diff <= 0) diff += 7; // bir sonraki aynı gün
    base.setDate(base.getDate() + diff);
    return base.getTime();
  }

  return null;
}

/** Maçın başlangıç günü, yerel saatle gece yarısına yuvarlanmış (gün filtresi için). */
export function matchStartDayMs(
  match: Record<string, any> | null | undefined,
  now: Date = new Date(),
): number | null {
  const ms = matchStartMs(match, now);
  if (ms === null) return null;
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
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
