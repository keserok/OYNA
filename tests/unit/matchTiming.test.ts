import { describe, it, expect } from 'vitest';
import {
  matchDurationMinutes,
  matchEndMs,
  hasMatchEnded,
  realMatchMinutes,
  formatMatchDuration,
  DEFAULT_MATCH_MINUTES,
} from '../../shared/matchTiming';

// ─── KARTLARDA GÖSTERİLEN SÜRE — gerçek veri, uydurma yedek YOK ─────────────

describe('realMatchMinutes / formatMatchDuration (kart + mac kurallari)', () => {
  it('camelCase ve snake_case alanlarin ikisini de okur', () => {
    expect(realMatchMinutes({ durationMinutes: 90 })).toBe(90);
    expect(realMatchMinutes({ duration_minutes: 120 })).toBe(120);
  });

  it('veri yoksa null doner — UYDURMA 60 BASMAZ', () => {
    expect(realMatchMinutes(null)).toBeNull();
    expect(realMatchMinutes(undefined)).toBeNull();
    expect(realMatchMinutes({})).toBeNull();
    expect(realMatchMinutes({ durationMinutes: null })).toBeNull();
    // Serbest metin `duration` BİLEREK okunmaz (sunucu SSOT'u degil).
    expect(realMatchMinutes({ duration: '90 Dakika' } as never)).toBeNull();
  });

  it('aralik disi deger gosterilmez (null) — zaman kapisindan farkli davranis', () => {
    expect(realMatchMinutes({ durationMinutes: 0 })).toBeNull();
    expect(realMatchMinutes({ durationMinutes: 4 })).toBeNull();
    expect(realMatchMinutes({ durationMinutes: 301 })).toBeNull();
    // Karsilastirma: zaman kapisi ayni girdide varsayilana duser.
    expect(matchDurationMinutes(0)).toBe(DEFAULT_MATCH_MINUTES);
  });

  it('etiket tek bicimdir: "90 dakika" (italik yok — karar S17)', () => {
    expect(formatMatchDuration({ durationMinutes: 90 })).toBe('90 dakika');
    expect(formatMatchDuration({ durationMinutes: 60 })).toBe('60 dakika');
    expect(formatMatchDuration({ duration_minutes: 120 })).toBe('120 dakika');
  });

  it('veri yoksa etiket de null — cagiran alani hic cizmez', () => {
    expect(formatMatchDuration({})).toBeNull();
    expect(formatMatchDuration(null)).toBeNull();
  });
});

describe('matchDurationMinutes', () => {
  it('serbest metinden dakikayi cikarir', () => {
    expect(matchDurationMinutes('60 Dakika')).toBe(60);
    expect(matchDurationMinutes('90 Dakika')).toBe(90);
    expect(matchDurationMinutes('120 Dakika')).toBe(120);
  });

  it('sayi verilirse oldugu gibi kullanir', () => {
    expect(matchDurationMinutes(75)).toBe(75);
  });

  it('okunamayan degerlerde varsayilana duser', () => {
    for (const bad of [null, undefined, '', 'Dakika', {}, NaN]) {
      expect(matchDurationMinutes(bad)).toBe(DEFAULT_MATCH_MINUTES);
    }
  });

  it('aralik disi degerleri varsayilana ceker', () => {
    // '1 saat' -> 1 dakika okunurdu; zaman kapisini aninda acardi.
    expect(matchDurationMinutes('1 saat')).toBe(DEFAULT_MATCH_MINUTES);
    expect(matchDurationMinutes(4)).toBe(DEFAULT_MATCH_MINUTES);
    expect(matchDurationMinutes(301)).toBe(DEFAULT_MATCH_MINUTES);
    // Sinirlar gecerli kalir.
    expect(matchDurationMinutes(5)).toBe(5);
    expect(matchDurationMinutes(300)).toBe(300);
  });
});

describe('matchEndMs', () => {
  const start = Date.UTC(2026, 6, 28, 17, 0, 0); // 28 Tem 2026 20:00 (+03)

  it('bitisi baslangic + sure olarak hesaplar', () => {
    expect(matchEndMs(start, '90 Dakika')).toBe(start + 90 * 60_000);
    expect(matchEndMs(start, '60 Dakika')).toBe(start + 60 * 60_000);
  });

  it('baslangic yoksa null doner', () => {
    expect(matchEndMs(null, '60 Dakika')).toBeNull();
    expect(matchEndMs(undefined, '60 Dakika')).toBeNull();
  });
});

describe('hasMatchEnded', () => {
  const start = Date.UTC(2026, 6, 28, 17, 0, 0);
  const end60 = start + 60 * 60_000;

  it('mac devam ederken bitmis saymaz', () => {
    expect(hasMatchEnded(start, '60 Dakika', start)).toBe(false);
    expect(hasMatchEnded(start, '60 Dakika', end60 - 1)).toBe(false);
  });

  it('bitis aninda ve sonrasinda bitmis sayar', () => {
    expect(hasMatchEnded(start, '60 Dakika', end60)).toBe(true);
    expect(hasMatchEnded(start, '60 Dakika', end60 + 1)).toBe(true);
  });

  it('90 dakikalik mac 60. dakikada bitmis sayilmaz', () => {
    // Eski "starts_at + 3 saat" sezgisinin tersi yonde hatasi da burada kapanir.
    expect(hasMatchEnded(start, '90 Dakika', end60)).toBe(false);
    expect(hasMatchEnded(start, '90 Dakika', start + 90 * 60_000)).toBe(true);
  });

  it('baslangici cozulemeyen mac bitmis SAYILMAZ (kapi kapali kalir)', () => {
    expect(hasMatchEnded(null, '60 Dakika')).toBe(false);
  });
});
