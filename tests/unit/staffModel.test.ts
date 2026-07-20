import { describe, it, expect } from 'vitest';
import { mapStaffError, expiryText, normalizeInviteCode } from '../../shared/staffModel';

describe('mapStaffError — RPC hata mesajı → Türkçe', () => {
  it("'KOD: Türkçe' kalıbında Türkçe kısmı çıkarır", () => {
    expect(mapStaffError({ message: 'INVALID_OR_EXPIRED: Kod geçersiz veya kullanılmış.' }))
      .toBe('Kod geçersiz veya kullanılmış.');
  });
  it('OWNER_CANNOT_JOIN mesajını korur', () => {
    expect(mapStaffError({ message: 'OWNER_CANNOT_JOIN: Kendi sahanıza personel olamazsınız.' }))
      .toBe('Kendi sahanıza personel olamazsınız.');
  });
  it('sadece kod (Türkçe metin yok) → kod bazlı eşleme', () => {
    expect(mapStaffError({ message: 'UNAUTHORIZED' })).toBe('Bu işlem için yetkiniz yok.');
    expect(mapStaffError({ message: 'ALREADY_MEMBER' })).toBe('Bu sahada zaten kayıtlısınız.');
    expect(mapStaffError({ message: 'LIMIT_REACHED' })).toBe('Ekip kaydı üst sınırına ulaşıldı.');
  });
  it('İngilizce-only iki nokta sonrası metni Türkçe eşlemeye düşürür', () => {
    // ': foo' Türkçe harf içermiyor → kod bazlı eşlemeye düşer
    expect(mapStaffError({ message: 'ALREADY_ACTIVE: xx' })).toBe('Bu personelin girişi zaten aktif.');
  });
  it('ağ hatası → bağlantı mesajı', () => {
    expect(mapStaffError(new Error('Failed to fetch'))).toBe('Bağlantı sorunu. Tekrar deneyin.');
  });
  it('bilinmeyen → genel mesaj', () => {
    expect(mapStaffError(null)).toBe('İşlem tamamlanamadı. Lütfen tekrar deneyin.');
    expect(mapStaffError({})).toBe('İşlem tamamlanamadı. Lütfen tekrar deneyin.');
  });
});

describe('expiryText — davet kodu kalan süre (now enjekte)', () => {
  const NOW = 1_700_000_000_000; // sabit referans
  const iso = (msFromNow: number) => new Date(NOW + msFromNow).toISOString();

  it('geçmiş → süresi doldu', () => {
    expect(expiryText(iso(-1000), NOW)).toBe('süresi doldu');
  });
  it('72 saat → 3 gün 0 saat', () => {
    expect(expiryText(iso(72 * 3_600_000), NOW)).toBe('3 gün 0 saat geçerli');
  });
  it('36 saat → 1 gün 12 saat', () => {
    expect(expiryText(iso(36 * 3_600_000), NOW)).toBe('1 gün 12 saat geçerli');
  });
  it('5 saat → 5 saat geçerli', () => {
    expect(expiryText(iso(5 * 3_600_000), NOW)).toBe('5 saat geçerli');
  });
  it('40 dk → 40 dk geçerli', () => {
    expect(expiryText(iso(40 * 60_000), NOW)).toBe('40 dk geçerli');
  });
  it('null/boş → boş string', () => {
    expect(expiryText(null, NOW)).toBe('');
    expect(expiryText(undefined, NOW)).toBe('');
    expect(expiryText('geçersiz-tarih', NOW)).toBe('');
  });
});

describe('normalizeInviteCode — 6 haneye normalize', () => {
  it('rakam-dışı temizler + 6 haneye kırpar', () => {
    expect(normalizeInviteCode(' 824-866 ')).toBe('824866');
    expect(normalizeInviteCode('12 34 56 78')).toBe('123456');
    expect(normalizeInviteCode('abc123def4')).toBe('1234');
    expect(normalizeInviteCode('')).toBe('');
  });
});
