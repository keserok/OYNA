import { describe, it, expect } from 'vitest';
import {
  processCancellationPenalty,
  check90MinAutoCancel,
} from '../../utils/gameRules';
import type { MatchListing } from '../../types';

// ─── processCancellationPenalty ────────────────────────────────────────────────
//
// İş kuralı:
//   • Maç başlangıcına 0-3 saat kala iptal → -10 puan ceza
//   • 3 saatten fazla kala iptal → ceza yok
//   • Yeni puan ≤70 → ban (7 gün)
//   • Puan 0'ın altına düşmez

describe('processCancellationPenalty — ceza yok', () => {
  it('kickoff 4 saat sonra → ceza 0, ban yok', () => {
    const kickoff = new Date(Date.now() + 4 * 60 * 60 * 1000);
    const result = processCancellationPenalty(kickoff, 90);
    expect(result.penaltyAmount).toBe(0);
    expect(result.newScore).toBe(90);
    expect(result.isBanned).toBe(false);
    expect(result.banUntil).toBeNull();
  });

  it('kickoff tam 3 saat sonra → sınırda: ceza uygulanır (diffHours === 3)', () => {
    const kickoff = new Date(Date.now() + 3 * 60 * 60 * 1000);
    const result = processCancellationPenalty(kickoff, 90);
    // diffHours <= 3 → ceza 10
    expect(result.penaltyAmount).toBe(10);
  });

  it('kickoff geçmiş (negatif diff) → ceza yok (diffHours < 0)', () => {
    const kickoff = new Date(Date.now() - 1 * 60 * 60 * 1000);
    const result = processCancellationPenalty(kickoff, 90);
    expect(result.penaltyAmount).toBe(0);
  });
});

describe('processCancellationPenalty — ceza uygulanır', () => {
  it('1 saat kala iptal, puan 100 → 90, ban yok', () => {
    const kickoff = new Date(Date.now() + 60 * 60 * 1000);
    const result = processCancellationPenalty(kickoff, 100);
    expect(result.penaltyAmount).toBe(10);
    expect(result.newScore).toBe(90);
    expect(result.isBanned).toBe(false);
    expect(result.banUntil).toBeNull();
  });

  it('puan 80 → 70 → BAN tetiklenir (≤70)', () => {
    const kickoff = new Date(Date.now() + 1 * 60 * 60 * 1000);
    const result = processCancellationPenalty(kickoff, 80);
    expect(result.newScore).toBe(70);
    expect(result.isBanned).toBe(true);
    expect(result.banUntil).not.toBeNull();
    // 7 gün sonrası (yaklaşık)
    const diffDays = (result.banUntil!.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThan(6.9);
    expect(diffDays).toBeLessThan(7.1);
  });

  it('puan 71 → 61 → BAN (< 70)', () => {
    const kickoff = new Date(Date.now() + 30 * 60 * 1000);
    const { isBanned, newScore } = processCancellationPenalty(kickoff, 71);
    expect(newScore).toBe(61);
    expect(isBanned).toBe(true);
  });

  it('puan 72 → 62 → BAN (62 ≤ 70)', () => {
    const kickoff = new Date(Date.now() + 30 * 60 * 1000);
    const { isBanned, newScore } = processCancellationPenalty(kickoff, 72);
    expect(newScore).toBe(62);
    expect(isBanned).toBe(true);
  });
});

describe('processCancellationPenalty — puan 0 altına düşmez', () => {
  it('puan 5, ceza 10 → newScore 0 (Math.max koruması)', () => {
    const kickoff = new Date(Date.now() + 1 * 60 * 60 * 1000);
    const result = processCancellationPenalty(kickoff, 5);
    expect(result.newScore).toBe(0);
  });

  it('varsayılan puan 100 → geçerli sonuç', () => {
    const kickoff = new Date(Date.now() + 1 * 60 * 60 * 1000);
    const result = processCancellationPenalty(kickoff);
    expect(result.newScore).toBe(90);
  });
});

// ─── check90MinAutoCancel ──────────────────────────────────────────────────────
//
// İş kuralı:
//   • Maça ≤90 dk kala + dolu slot oranı < %70 → true
//   • CANCELLED maç → daima false
//   • Eşik doluysa → false

/** Şimdiden N dakika sonrasını "HH:MM" formatında verir. */
function minutesFromNow(n: number): string {
  const d = new Date(Date.now() + n * 60 * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function makeMatch(overrides: Partial<MatchListing>): MatchListing {
  return {
    id: 'm1', title: 'Test Maç', date: 'Bugün',
    time: minutesFromNow(45), // 45 dk kala (< 90)
    status: 'ACTIVE', format: '7v7',
    slots: Array.from({ length: 14 }, (_, i) => ({
      id: `s${i}`, role: 'MID', status: i < 5 ? 'TAKEN' : 'EMPTY', // 5/14 dolu ≈ %36
    })),
    ...overrides,
  } as unknown as MatchListing;
}

describe('check90MinAutoCancel', () => {
  it('CANCELLED maç → false (iş kuralı)', () => {
    const m = makeMatch({ status: 'CANCELLED' });
    expect(check90MinAutoCancel(m)).toBe(false);
  });

  it('90 dk içinde + doluluk < %70 → true', () => {
    expect(check90MinAutoCancel(makeMatch({}))).toBe(true);
  });

  it('90 dk içinde + doluluk ≥ %70 → false', () => {
    const slots = Array.from({ length: 14 }, (_, i) => ({
      id: `s${i}`, role: 'MID', status: i < 10 ? 'TAKEN' : 'EMPTY', // 10/14 ≈ %71
    }));
    expect(check90MinAutoCancel(makeMatch({ slots } as any))).toBe(false);
  });

  it('maç 91 dk sonraya ayarlanmış → false (pencere dışı)', () => {
    const m = makeMatch({ time: minutesFromNow(91) });
    expect(check90MinAutoCancel(m)).toBe(false);
  });

  it('slot listesi yok → varsayılan 14 slot; 0 dolu → true', () => {
    const m = makeMatch({ slots: undefined as any });
    expect(check90MinAutoCancel(m)).toBe(true);
  });
});

// ─── Yarış Koşulları: processCancellationPenalty ──────────────────────────────
//
// "Yarış koşulu" riski: iki eşzamanlı iptal çağrısı aynı anda yapılabilir.
// Bu fonksiyon PURE (yan etkisiz) olduğundan her çağrı bağımsızdır — yani
// deterministik çıktı garanti edilir. Aşağıdaki test bunu belgelemektedir.

describe('processCancellationPenalty — eşzamanlı çağrı deterministizmi', () => {
  it('aynı argümanlarla eşzamanlı N çağrı hep aynı sonucu üretir', () => {
    const kickoff = new Date(Date.now() + 1 * 60 * 60 * 1000);
    const results = Array.from({ length: 100 }, () => processCancellationPenalty(kickoff, 80));
    const first = results[0];
    for (const r of results) {
      expect(r.newScore).toBe(first.newScore);
      expect(r.isBanned).toBe(first.isBanned);
      expect(r.penaltyAmount).toBe(first.penaltyAmount);
    }
  });
});
