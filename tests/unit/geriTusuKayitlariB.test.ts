/**
 * GERİ TUŞU KAYITLARI · B GRUBU — geri sökülmesin (BULGU-020/021/132)
 *
 * Android donanım geri tuşu ve Esc yalnız merkezî overlay kaydını
 * (useBackDismiss → pushOverlay) okur. Kayıtsız bir sheet/modal açıkken
 * geri tuşu katmanı kapatmak yerine arkadaki ekranı değiştiriyordu.
 * Bu dosya B grubundaki altı yüzeyin kayıtlı KALDIĞINI bekler:
 *
 *   1) RahatMatchLobby — elle çizilmiş 'reserve' (sheet, 0) ve 'leave'
 *      (ONAY diyaloğu, priority 10) katmanları.
 *   2) RahatJoinSheet — busy iken kapatma kilitli (yarım ödeme kalmasın).
 *   3) MatchSquadPicker — koşullu mount → open sabit true.
 *   4) ProviderOfferPicker — koşullu mount → open sabit true.
 *   5) LocationPickerSheet — geri tuşu sheet'i (durum sıfırlamalı close ile) kapatır.
 *   6) DeleteAccountModal — yıkıcı onay, priority 10; loading iken kilitli.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const oku = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

const DOSYALAR = [
  'views/match/RahatMatchLobby.tsx',
  'components/match/RahatJoinSheet.tsx',
  'components/social/MatchSquadPicker.tsx',
  'components/social/ProviderOfferPicker.tsx',
  'components/location/LocationPickerSheet.tsx',
  'components/common/DeleteAccountModal.tsx',
] as const;

describe('B grubu — altı yüzeyin tamamı geri-tuşu kaydına yazar', () => {
  for (const dosya of DOSYALAR) {
    it(`${dosya} useBackDismiss import eder ve çağırır`, () => {
      const s = oku(dosya);
      expect(s).toMatch(/import \{ useBackDismiss \} from '[./]+hooks\/useBackDismiss'/);
      expect(s).toMatch(/useBackDismiss\(/);
    });
  }
});

describe('RahatMatchLobby — elle çizilmiş katmanlar', () => {
  const s = () => oku('views/match/RahatMatchLobby.tsx');

  it("'reserve' sheet olarak kayıtlı (varsayılan öncelik)", () => {
    expect(s()).toMatch(/useBackDismiss\(sheet === 'reserve',[\s\S]{0,60}'rahat-reserve-sheet'\)/);
  });

  it("'leave' bir ONAY diyaloğu → priority 10 (sheet üstünde önce o kapanır)", () => {
    expect(s()).toMatch(/useBackDismiss\(sheet === 'leave',[\s\S]{0,60}'rahat-leave-confirm', 10\)/);
  });

  it("'join' burada DEĞİL RahatJoinSheet içinde kayıtlı (çifte kayıt olmasın)", () => {
    expect(s()).not.toMatch(/useBackDismiss\(sheet === 'join'/);
  });
});

describe('RahatJoinSheet — ödeme akışı korumalı kapanır', () => {
  it('open ile kayıtlı, busy iken kapatma kilitli', () => {
    const kaynak = oku('components/match/RahatJoinSheet.tsx');
    expect(kaynak).toMatch(
      /useBackDismiss\(open, \(\) => \{ if \(!busy\) onClose\(\); \}, 'rahat-join-sheet'\)/,
    );
  });
});

describe('Koşullu mount edilen seçiciler — open sabit true', () => {
  it('MatchSquadPicker kendi içinde kayıtlı', () => {
    expect(oku('components/social/MatchSquadPicker.tsx'))
      .toMatch(/useBackDismiss\(true, onClose, 'match-squad-picker'\)/);
  });

  it('ProviderOfferPicker kendi içinde kayıtlı', () => {
    expect(oku('components/social/ProviderOfferPicker.tsx'))
      .toMatch(/useBackDismiss\(true, onClose, 'provider-offer-picker'\)/);
  });
});

describe('LocationPickerSheet — geri tuşu sheet\'i kapatır', () => {
  it('kayıt open ile yapılır ve durum sıfırlamalı close kullanılır', () => {
    expect(oku('components/location/LocationPickerSheet.tsx'))
      .toMatch(/useBackDismiss\(open, close, 'location-picker'\)/);
  });
});

describe('DeleteAccountModal — yıkıcı onay akışı', () => {
  const s = () => oku('components/common/DeleteAccountModal.tsx');

  it('priority 10 ile kayıtlı (onay diyaloğu kuralı)', () => {
    expect(s()).toMatch(/useBackDismiss\([\s\S]{0,220}'delete-account-modal',\s*10,?\s*\)/);
  });

  it('silme isteği işlenirken geri tuşu modalı KAPATMAZ', () => {
    expect(s()).toMatch(/if \(!loading && toast\?\.variant !== 'success'\) onClose\(\);/);
  });
});
