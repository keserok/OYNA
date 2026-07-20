import { describe, it, expect } from 'vitest';
import { mapDemandError } from '../../services/demandService';

describe('mapDemandError — cold-start talep sinyali hataları dürüst Türkçe', () => {
  it('saha adı eksik → net yönlendirme', () => {
    expect(mapDemandError({ message: 'PITCH_NAME_REQUIRED: önerilen saha adı gerekli.' }))
      .toMatch(/saha.*ad/i);
  });
  it('yetki yok → giriş yönlendirmesi', () => {
    expect(mapDemandError({ message: 'UNAUTHORIZED: giriş gerekli.' })).toMatch(/giriş/i);
  });
  it('geçersiz tür → genel geçersiz istek', () => {
    expect(mapDemandError({ message: 'INVALID_TYPE: geçersiz sinyal türü.' })).toMatch(/geçersiz/i);
  });
  it('ağ hatası → bağlantı uyarısı (tekrar denenebilir)', () => {
    expect(mapDemandError(new TypeError('Failed to fetch'))).toMatch(/bağlantı|internet/i);
    expect(mapDemandError({ message: 'NetworkError when attempting to fetch' })).toMatch(/bağlantı|internet/i);
  });
  it('bilinmeyen → güvenli genel mesaj (asla boş/undefined değil)', () => {
    const msg = mapDemandError(null);
    expect(msg.length).toBeGreaterThan(0);
    expect(msg).toMatch(/tekrar dene/i);
  });
});
