import { describe, it, expect } from 'vitest';
import { detectCardBrand, pickCardGradient } from '../../services/walletService';
import { parseSocialError } from '../../services/socialService';

// ─── detectCardBrand ──────────────────────────────────────────────────────────
//
// İş kuralı (görsel amaçlı, gerçek kart doğrulaması değil):
//   • 9792, 65, ya da 9xxx (9792 olmayan) → TROY
//   • 4xxx → VISA
//   • 51-55 veya 22-27 ile başlayan → MASTERCARD
//   • 34xx / 37xx → AMEX
//   • diğerleri → 'KART'

describe('detectCardBrand', () => {
  it('TROY — 9792 başlangıcı', () => {
    expect(detectCardBrand('9792000000000000')).toBe('TROY');
  });

  it('TROY — 65 ile başlayan', () => {
    expect(detectCardBrand('6500000000000000')).toBe('TROY');
  });

  it('TROY — 9 ile başlayan ama 9792 değil', () => {
    expect(detectCardBrand('9100000000000000')).toBe('TROY');
  });

  it('VISA — 4 ile başlayan', () => {
    expect(detectCardBrand('4000000000000000')).toBe('VISA');
    expect(detectCardBrand('4111 1111 1111 1111')).toBe('VISA'); // boşluklu format
  });

  it('MASTERCARD — 51-55 ile başlayan', () => {
    expect(detectCardBrand('5100000000000000')).toBe('MASTERCARD');
    expect(detectCardBrand('5500000000000000')).toBe('MASTERCARD');
  });

  it('MASTERCARD — 22-27 ile başlayan (yeni BIN)', () => {
    expect(detectCardBrand('2200000000000000')).toBe('MASTERCARD');
    expect(detectCardBrand('2700000000000000')).toBe('MASTERCARD');
  });

  it('AMEX — 34xx', () => {
    expect(detectCardBrand('340000000000000')).toBe('AMEX');
  });

  it('AMEX — 37xx', () => {
    expect(detectCardBrand('370000000000000')).toBe('AMEX');
  });

  it('bilinmeyen → "KART"', () => {
    expect(detectCardBrand('6011000000000000')).toBe('KART'); // Discover
    expect(detectCardBrand('')).toBe('KART');
  });

  it('kart numarasından önce rakam dışı karakterler temizlenir', () => {
    // boşluk ve tire ile verilen numara
    expect(detectCardBrand('4111-1111-1111-1111')).toBe('VISA');
  });
});

// ─── pickCardGradient ─────────────────────────────────────────────────────────

describe('pickCardGradient', () => {
  it('geçerli last4 → dizi içinde bir gradient döner', () => {
    const GRADIENTS = [
      'from-purple-700 to-blue-600',
      'from-emerald-600 to-teal-700',
      'from-sky-500 to-indigo-500',
      'from-orange-600 to-rose-600',
    ];
    const g = pickCardGradient('1234');
    expect(GRADIENTS).toContain(g);
  });

  it('farklı last4 değerleri → 4 farklı gradientten birini verir (modulo güvenli)', () => {
    // 100 farklı değer test et; hiçbiri undefined/crash
    for (let i = 0; i < 100; i++) {
      const last4 = String(i).padStart(4, '0');
      const g = pickCardGradient(last4);
      expect(typeof g).toBe('string');
      expect(g.length).toBeGreaterThan(5);
    }
  });

  it('sayı olmayan last4 → NaN → mod 0 → ilk gradient', () => {
    // Number('abcd') = NaN; NaN || 0 = 0; 0 % 4 = 0
    const g = pickCardGradient('abcd');
    expect(g).toBe('from-purple-700 to-blue-600');
  });
});

// ─── parseSocialError ─────────────────────────────────────────────────────────

describe('parseSocialError', () => {
  const cases: [string, string][] = [
    ['COOLDOWN', 'tekrar istek gönderemezsin'],
    ['DAILY_LIMIT', 'Günlük istek sınırına'],
    ['PENDING_LIMIT', 'bekleyen isteğin'],
    ['NOT_FOUND', 'bulunamadı'],
    ['INVALID_TARGET', 'yapılamaz'],
    ['NOT_PENDING', 'zaten yanıtlanmış'],
    ['LIST_LIMIT', 'Liste sınırına'],
    ['NOT_FRIENDS', 'yalnız arkadaşlar'],
    ['CANNOT_ADD_SELF', 'Kendini ekleyemezsin'],
    ['BATCH_TOO_LARGE', 'çok fazla kayıt'],
    ['QUOTA', 'Günlük kota'],
    ['NOT_PARTICIPANT', 'katılımcısı olmalısın'],
    ['UNAUTHORIZED', 'yetkin yok'],
  ];

  for (const [code, fragment] of cases) {
    it(`${code} → "${fragment}" içerir`, () => {
      const msg = parseSocialError({ message: `RPC hatası: ${code}: açıklama` });
      expect(msg.toLowerCase()).toContain(fragment.toLowerCase());
    });
  }

  it('bilinmeyen hata → genel fallback mesajı', () => {
    const msg = parseSocialError({ message: 'SOME_UNKNOWN_ERROR' });
    expect(msg).toMatch(/ters gitti|tekrar/i);
  });

  it('mesajsız nesne → fallback', () => {
    const msg = parseSocialError({});
    expect(msg.length).toBeGreaterThan(5);
  });

  it('string olmayan hata (null, sayı) → çökmez', () => {
    expect(() => parseSocialError(null)).not.toThrow();
    expect(() => parseSocialError(42)).not.toThrow();
  });

  // Yarış koşulu: eşzamanlı parseSocialError (pure fonksiyon)
  it('eşzamanlı 500 çağrı deterministik sonuç', () => {
    const err = { message: 'COOLDOWN' };
    const results = Array.from({ length: 500 }, () => parseSocialError(err));
    const first = results[0];
    for (const r of results) expect(r).toBe(first);
  });
});
