import { describe, it, expect, vi, afterEach } from 'vitest';
import { isUserOnline, formatLastSeen, ONLINE_THRESHOLD_MS } from '../../utils/lastSeen';

// Sabit bir "şimdiki zaman" kullanarak Date.now() deterministik hale getiriyoruz.
// Böylece testler saat dilimine veya CI zamanına bağımlı olmaz.
const FIXED_NOW = new Date('2026-07-11T20:00:00.000Z').getTime();

afterEach(() => {
  vi.restoreAllMocks();
});

function freeze(ms = FIXED_NOW) {
  vi.spyOn(Date, 'now').mockReturnValue(ms);
}

function isoAgo(ms: number): string {
  return new Date(FIXED_NOW - ms).toISOString();
}

// ─── isUserOnline ──────────────────────────────────────────────────────────────

describe('isUserOnline', () => {
  it('null/undefined → false (veri yok)', () => {
    expect(isUserOnline(null)).toBe(false);
    expect(isUserOnline(undefined)).toBe(false);
  });

  it('bozuk tarih string → false (NaN)', () => {
    expect(isUserOnline('geçersiz-tarih')).toBe(false);
    expect(isUserOnline('')).toBe(false);
  });

  it('eşikten 1 ms önce → çevrimiçi', () => {
    freeze();
    const ts = isoAgo(ONLINE_THRESHOLD_MS - 1);
    expect(isUserOnline(ts)).toBe(true);
  });

  it('tam eşik anı → çevrimiçi DEĞİL (< değil <=)', () => {
    freeze();
    const ts = isoAgo(ONLINE_THRESHOLD_MS);
    // diff = ONLINE_THRESHOLD_MS; < kontrolü geçemez
    expect(isUserOnline(ts)).toBe(false);
  });

  it('eşikten 1 ms sonra → çevrimiçi değil', () => {
    freeze();
    const ts = isoAgo(ONLINE_THRESHOLD_MS + 1);
    expect(isUserOnline(ts)).toBe(false);
  });

  it('gelecek tarih → çevrimiçi (diff negatif, < eşik)', () => {
    // Saat kaymasıyla gelen geleceğe ait timestamp — yine de çevrimiçi sayılmalı
    freeze();
    const futureTs = new Date(FIXED_NOW + 1000).toISOString();
    expect(isUserOnline(futureTs)).toBe(true);
  });
});

// ─── formatLastSeen ────────────────────────────────────────────────────────────

describe('formatLastSeen', () => {
  it('null/undefined → boş string', () => {
    expect(formatLastSeen(null)).toBe('');
    expect(formatLastSeen(undefined)).toBe('');
  });

  it('bozuk tarih → boş string', () => {
    expect(formatLastSeen('abc')).toBe('');
  });

  it('< 5 dk → "Şimdi aktif"', () => {
    freeze();
    expect(formatLastSeen(isoAgo(1 * 60 * 1000))).toBe('Şimdi aktif');
    expect(formatLastSeen(isoAgo(4 * 60 * 1000))).toBe('Şimdi aktif');
  });

  it('5-59 dk arası → "X dk önce"', () => {
    freeze();
    const msg = formatLastSeen(isoAgo(10 * 60 * 1000));
    expect(msg).toMatch(/^10 dk önce$/);
  });

  it('59 dk → "59 dk önce" (saat eşiği öncesi)', () => {
    freeze();
    expect(formatLastSeen(isoAgo(59 * 60 * 1000))).toBe('59 dk önce');
  });

  it('1 sa → "1 sa önce"', () => {
    freeze();
    expect(formatLastSeen(isoAgo(60 * 60 * 1000))).toBe('1 sa önce');
  });

  it('23 sa → "23 sa önce" (gün eşiği öncesi)', () => {
    freeze();
    expect(formatLastSeen(isoAgo(23 * 60 * 60 * 1000))).toBe('23 sa önce');
  });

  it('24 sa → "Dün"', () => {
    freeze();
    expect(formatLastSeen(isoAgo(24 * 60 * 60 * 1000))).toBe('Dün');
  });

  it('2-6 gün arası → "X gün önce"', () => {
    freeze();
    expect(formatLastSeen(isoAgo(3 * 24 * 60 * 60 * 1000))).toBe('3 gün önce');
    expect(formatLastSeen(isoAgo(6 * 24 * 60 * 60 * 1000))).toBe('6 gün önce');
  });

  it('7 gün ve üstü → tarih formatı (gün + ay kısa adı)', () => {
    freeze();
    const result = formatLastSeen(isoAgo(8 * 24 * 60 * 60 * 1000));
    // "3 Tem" veya "3 Haz" gibi bir şey içermeli (Türkçe locale)
    expect(result).toMatch(/\d+\s+\w+/);
    // dk/sa/gün kelimelerini içermemeli
    expect(result).not.toMatch(/dk|sa|gün/);
  });

  it('sınır: tam 7 gün → tarih formatı (< 7 değil)', () => {
    freeze();
    const result = formatLastSeen(isoAgo(7 * 24 * 60 * 60 * 1000));
    expect(result).not.toMatch(/dk|sa|gün|Dün/);
  });
});
