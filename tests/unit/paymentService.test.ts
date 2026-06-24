import { describe, it, expect } from 'vitest';
import { toPaymentErrorMessage } from '../../services/paymentService';

describe('toPaymentErrorMessage', () => {
  const cases: [string, string][] = [
    ['ALREADY_PAID', 'zaten ödenmiş'],
    ['NO_DEPOSIT', 'online kapora gerekmiyor'],
    ['CANCELLED', 'İptal edilmiş'],
    ['UNAUTHORIZED', 'giriş yapman gerekiyor'],
    ['NOT_FOUND', 'bulunamadı'],
    ['PROVIDER_NOT_CONFIGURED', 'yapılandırılmadı'],
    ['CONFIRM_DISABLED_IN_LIVE', 'kapalıdır'],
  ];

  for (const [code, fragment] of cases) {
    it(`${code} → Türkçe mesaj içerir "${fragment}"`, () => {
      const msg = toPaymentErrorMessage(new Error(code));
      expect(msg.toLowerCase()).toContain(fragment.toLowerCase());
    });
  }

  it('bilinmeyen hata → genel mesaj', () => {
    const msg = toPaymentErrorMessage(new Error('SOME_UNKNOWN_CODE'));
    expect(msg).toBeTruthy();
    expect(msg.length).toBeGreaterThan(5);
  });

  it('string hata da kabul edilir', () => {
    const msg = toPaymentErrorMessage('ALREADY_PAID');
    expect(msg.toLowerCase()).toContain('zaten ödenmiş'.toLowerCase());
  });
});
