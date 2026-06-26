import { describe, it, expect } from 'vitest';
import { toPrivateMatchErrorMessage } from '../../services/matchService';

describe('toPrivateMatchErrorMessage', () => {
  const cases: [string, string][] = [
    ['INVALID_CODE', 'en az 4'],
    ['NOT_FOUND: Bu koda ait özel maç bulunamadı.', 'bulunamadı'],
    ['UNAUTHORIZED', 'giriş yapman'],
    ['JWT expired', 'giriş yapman'],
  ];

  for (const [code, fragment] of cases) {
    it(`${code} → "${fragment}" içerir`, () => {
      const msg = toPrivateMatchErrorMessage(new Error(code));
      expect(msg.toLowerCase()).toContain(fragment.toLowerCase());
    });
  }

  it('bilinmeyen kod → genel kullanıcı mesajı', () => {
    const msg = toPrivateMatchErrorMessage(new Error('SOME_RANDOM'));
    expect(msg).toMatch(/kod/i);
    expect(msg.length).toBeGreaterThan(5);
  });

  it('string girdi de kabul edilir', () => {
    expect(toPrivateMatchErrorMessage('NOT_FOUND').toLowerCase()).toContain('bulunamadı');
  });

  it('null/undefined → çökmeden genel mesaj döner', () => {
    expect(toPrivateMatchErrorMessage(null).length).toBeGreaterThan(5);
    expect(toPrivateMatchErrorMessage(undefined).length).toBeGreaterThan(5);
  });
});
