import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { computeCardFee } from '../../services/paymentService';

// ═══════════════════════════════════════════════════════════════════════════
// KART ÖDEMESİ — karar kilitleri (kurucu kararları, 17 Ağustos 2026)
//
//   B4 · Kart işlem bedeli kullanıcıya AYRI SATIR olarak gösterilmez;
//        fiyatın içindedir. Kırılım yönetici panelinde durur.
//   B5 · Taksit YOK — tek çekim.
//   B6 · Hiç kimseden TC kimlik numarası istenmez; iyzico'ya nötr yer tutucu
//        gider. Koda gömülü gerçek-biçimli TC numarası bir daha bulunmaz.
// ═══════════════════════════════════════════════════════════════════════════

const KOK = path.resolve(__dirname, '../..');
const oku = (rel: string) => readFileSync(path.join(KOK, rel), 'utf-8');

const odemeEkrani = () => oku('views/PaymentScreen.tsx');
const odemeUcu = () => oku('supabase/functions/create-payment/index.ts');

describe('B4 · kart bedeli fiyatın içinde', () => {
  it('ödeme ekranında büyük rakam TOPLAM tutardır', () => {
    const s = odemeEkrani();
    expect(s).toContain('{money(grandTotal)}');
  });

  it('kullanıcıya "kart işlem bedeli" diye ayrı satır çıkmıyor', () => {
    const s = odemeEkrani();
    // Yorum satırlarında geçebilir; ekrana BASILAN metinde geçmemeli.
    const basilan = s.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'));
    expect(basilan.join('\n')).not.toContain('Kart işlem bedeli (%');
    expect(basilan.join('\n')).not.toContain('label="Kart işlem bedeli"');
  });

  it('kırılım kutusu (hizmet tutarı + bedel + toplam) kaldırıldı', () => {
    expect(odemeEkrani()).not.toContain('Karttan çekilecek');
  });

  it('bilgi notu artık ayrı bir bedel duyurmuyor', () => {
    expect(odemeEkrani()).not.toContain('işlem bedeli eklenir');
  });

  it('hesap yine de sunucunun ikizidir — ekrandaki rakam çekilenle aynı', () => {
    // Kırılımı gizlemek, YANLIŞ rakam göstermek demek değildir.
    expect(odemeEkrani()).toContain('computeCardFee(amount, cardFeePct)');
    expect(odemeEkrani()).toContain('const grandTotal = amount + cardFee');
    expect(computeCardFee(1000, 2.5)).toBe(25);
  });
});

describe('B5 · taksit yok', () => {
  it('iyzico isteğinde taksit listesi tek çekime kilitli', () => {
    expect(odemeUcu()).toContain('enabledInstallments: [1]');
    expect(odemeUcu()).not.toContain('[1, 2, 3, 6]');
  });

  it('3DS isteğinde tek çekim', () => {
    expect(odemeUcu()).toContain('installment: 1');
  });
});

describe('B6 · TC kimlik numarası istenmez', () => {
  it('koda gömülü gerçek-biçimli TC numarası kalmadı', () => {
    expect(odemeUcu()).not.toContain("identityNumber: '74300864791'");
    // Rastgele seçilmiş olsa bile geçerli formatta bir numara birinin olabilir.
    const govde = odemeUcu().split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    expect(govde).not.toMatch(/identityNumber:\s*'[1-9]\d{10}'/);
  });

  it('nötr yer tutucu kullanılıyor', () => {
    expect(odemeUcu()).toContain("const IDENTITY_PLACEHOLDER = '11111111111'");
    expect(odemeUcu()).toContain('identityNumber: IDENTITY_PLACEHOLDER');
  });

  it('hiçbir ekran kullanıcıdan TC istemiyor', () => {
    for (const f of ['views/PaymentScreen.tsx', 'components/payment/AddCardScreen.tsx',
                     'views/AuthScreen.tsx', 'components/settings/ProfileInfoPage.tsx']) {
      const s = oku(f);
      expect(s, f).not.toContain('TC Kimlik');
      expect(s, f).not.toContain('identityNumber');
    }
  });
});

describe('kart verisi sınırı', () => {
  it('kart numarası ve CVV hiçbir yerde saklanmıyor', () => {
    const s = odemeUcu();
    // PAN yalnız iyzico isteğine gömülür; DB'ye/loga gitmez.
    expect(s).toContain('Kart verisi ASLA loglanmaz/saklanmaz');
    for (const satir of s.split('\n')) {
      if (!satir.includes('console.')) continue;
      expect(satir, `kart verisi loglanıyor: ${satir.trim()}`).not.toMatch(/cardNumber|\bcvc\b/);
    }
  });
});
