import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  stripServerErrorPrefix, humanizePaymentError, rawErrorMessage,
} from '../../services/paymentService';

/**
 * IP-03 — Ödeme şeffaflığı davranış kilidi.
 *
 * Kapsanan bulgular:
 *   BULGU-092 — sağlayıcı adı ("iyzico") ve ham İngilizce sağlayıcı metni
 *               kullanıcıya ASLA gösterilmez.
 *   BULGU-083 — maça katılım ödemesinde iade cümlesi bulunur.
 *   BULGU-088 — iade kademesi ödeme bağlamındaki tesisten okunur.
 *   BULGU-093 — 3DS kesintisinde "Durumu Kontrol Et" düğmesi vardır ve durum
 *               sunucudan sorulur; ekran hiçbir durumu uydurmaz.
 */

const kokDizin = path.resolve(__dirname, '../..');
const oku = (goreli: string) => readFileSync(path.join(kokDizin, goreli), 'utf-8');

describe('stripServerErrorPrefix — sağlayıcı adı sızıntısı (BULGU-092)', () => {
  it('küçük harfli sağlayıcı önekini keser', () => {
    expect(stripServerErrorPrefix('iyzico: Insufficient funds'))
      .toBe('Insufficient funds');
  });

  it('BÜYÜK harfli sağlayıcı önekini keser', () => {
    expect(stripServerErrorPrefix('IYZICO: Kart reddedildi')).toBe('Kart reddedildi');
  });

  it('kod önekini keser, ardındaki Türkçe cümleyi bırakır', () => {
    expect(stripServerErrorPrefix('CARD_SAVE_FAILED: Kart kaydedilemedi. Kart bilgilerini kontrol edip tekrar dene.'))
      .toBe('Kart kaydedilemedi. Kart bilgilerini kontrol edip tekrar dene.');
  });

  it('zincirlenmiş önekleri soldan soyar', () => {
    expect(stripServerErrorPrefix('iyzico: PAYMENT_FAILED: Kart reddedildi'))
      .toBe('Kart reddedildi');
  });

  it('sıradan Türkçe cümleye DOKUNMAZ', () => {
    const cumle = 'Kartından ödeme alınamadı. Farklı bir kart deneyebilirsin.';
    expect(stripServerErrorPrefix(cumle)).toBe(cumle);
  });

  it('"Param:" ile başlayan Türkçe cümlenin ilk kelimesini YUTMAZ', () => {
    // 'param' bilinçli olarak sağlayıcı listesinde değil (Türkçe kelime çakışması).
    expect(stripServerErrorPrefix('Param: nerede?')).toBe('Param: nerede?');
  });

  it('boş/undefined girdide patlamaz', () => {
    expect(stripServerErrorPrefix('')).toBe('');
    expect(stripServerErrorPrefix(undefined as unknown as string)).toBe('');
  });
});

describe('humanizePaymentError — sabit Türkçe metin (BULGU-092)', () => {
  it('CARD_DECLINED → sabit kart reddi cümlesi, ham metin sızmaz', () => {
    const msg = humanizePaymentError(new Error('CARD_DECLINED: Kartından ödeme alınamadı.'));
    expect(msg).toBe('Kartından ödeme alınamadı. Farklı bir kart deneyebilir veya kartının internete açık olup olmadığını bankandan sorabilirsin.');
  });

  it('ham iyzico metni verilse bile kullanıcıya İngilizce/sağlayıcı adı gitmez', () => {
    const msg = humanizePaymentError(new Error('iyzico: Do not honour (10051) insufficient funds'));
    expect(msg.toLowerCase()).not.toContain('iyzico');
    expect(msg).not.toContain('Do not honour');
    expect(msg).not.toContain('10051');
  });

  it('PROVIDER_ERROR → sağlayıcıya ulaşılamadı cümlesi', () => {
    const msg = humanizePaymentError(new Error('PROVIDER_ERROR: Ödeme sağlayıcısına ulaşılamadı. Lütfen birazdan tekrar dene.'));
    expect(msg).toBe('Ödeme sağlayıcısına ulaşılamadı. Lütfen birazdan tekrar dene.');
  });

  it('CARD_NOT_FOUND genel kart reddi dalından ÖNCE eşleşir (sıralama kilidi)', () => {
    expect(humanizePaymentError(new Error('CARD_NOT_FOUND')))
      .toContain('Seçtiğin kart bulunamadı');
  });

  it('CARD_NEEDS_REVALIDATION genel kart reddi dalına düşmez', () => {
    expect(humanizePaymentError(new Error('CARD_NEEDS_REVALIDATION')))
      .toContain('eski sistemden kalma');
  });

  it('iade metinleri KAPALI çekim özelliğini vaat etmez (karar S6)', () => {
    for (const kod of ['SLOT_TAKEN_REFUNDED', 'BOOKING_CLOSED_REFUNDED']) {
      const msg = humanizePaymentError(new Error(kod));
      expect(msg).toContain('cüzdanına eklendi');
      expect(msg).not.toContain('hesabına çekebilirsin');
    }
  });

  it('PostgrestError gibi düz nesnelerden de ham mesajı okur', () => {
    expect(rawErrorMessage({ message: 'SLOT_TAKEN' })).toBe('SLOT_TAKEN');
    expect(rawErrorMessage({ details: 'NO_TARIFF' })).toBe('NO_TARIFF');
    expect(humanizePaymentError({ message: 'SLOT_TAKEN' })).toContain('az önce dolmuş');
  });

  it('bilinmeyen hata → boş metin bırakmaz', () => {
    expect(humanizePaymentError(new Error(''))).toContain('Ödeme tamamlanamadı');
  });
});

describe('create-payment edge fonksiyonu — sağlayıcı adı yanıtta yok (BULGU-092)', () => {
  const kaynak = oku('supabase/functions/create-payment/index.ts');

  it('kullanıcıya dönen hiçbir hata gövdesinde "iyzico" geçmez', () => {
    const sizinti = kaynak
      .split('\n')
      .filter(satir => /(?:error:|new Error\()/.test(satir) && /iyzico/i.test(satir));
    expect(sizinti).toEqual([]);
  });

  it('hata kodlarının ardında Türkçe cümle vardır (yalın kod gösterilmez)', () => {
    for (const kod of ['PROVIDER_ERROR', 'CARD_DECLINED', 'CARD_SAVE_FAILED']) {
      const eslesme = kaynak.match(new RegExp(`${kod}: ([^'\`]+)`));
      expect(eslesme, `${kod} bulunamadı`).toBeTruthy();
      expect(stripServerErrorPrefix(`${kod}: ${eslesme![1]}`).length).toBeGreaterThan(10);
    }
  });
});

describe('Ödeme bağlamı tesis kimliği taşır (BULGU-088)', () => {
  it('PaymentContext tipinde pitchId alanı vardır', () => {
    expect(oku('types.ts')).toMatch(/pitchId\?: string;/);
  });

  it('dört ödeme bağlamının dördü de pitchId geçirir', () => {
    const dosyalar = [
      'views/PitchDiscovery.tsx',   // PITCH_DEPOSIT
      'views/MyMatchesHub.tsx',     // BOOKING_DEPOSIT
      'views/MatchJoin.tsx',        // MATCH_JOIN
      'views/PaymentScreen.tsx',    // legacy PITCH_DEPOSIT yedeği
    ];
    for (const d of dosyalar) {
      expect(oku(d), `${d} pitchId geçirmiyor`).toMatch(/pitchId:/);
    }
  });

  it('iade kademesi ÖNCE bağlamdan, sonra store yedeğinden okunur', () => {
    expect(oku('views/PaymentScreen.tsx'))
      .toMatch(/const pid = ctx\?\.pitchId \|\| \(\(bookingPitch as any\)\?\.id/);
  });
});

describe('Maça katılım ödemesinde iade cümlesi (BULGU-083)', () => {
  const matchJoin = oku('views/MatchJoin.tsx');
  const payment = oku('views/PaymentScreen.tsx');

  it('MATCH_JOIN bağlamı infoNote taşır', () => {
    expect(matchJoin).toMatch(/infoNote: 'Kadro dolmazsa veya maç iptal olursa/);
  });

  it('metin "iade kredisi" DEMEZ — tek bakiye var (karar defteri)', () => {
    const not = matchJoin.match(/infoNote: '([^']+)'/)?.[1] ?? '';
    expect(not).not.toContain('iade kredisi');
    expect(not).toContain('cüzdanına döner');
  });

  it('infoNote artık isDeposit kapısına kilitli değil', () => {
    expect(payment).not.toContain('ctx.isDeposit && ctx.infoNote');
    expect(payment).toContain('{ctx.infoNote && (');
  });
});

describe('3DS kurtarma — Durumu Kontrol Et (BULGU-093)', () => {
  const payment = oku('views/PaymentScreen.tsx');

  it('kapalı süpürücüye bağımlı vaat metni kaldırıldı', () => {
    expect(payment).not.toContain('bakiyen birazdan güncellenir');
  });

  it('durum sorgulama düğmesi ve işleyicisi vardır', () => {
    expect(payment).toContain('Durumu Kontrol Et');
    expect(payment).toContain('handleCheckIntentStatus');
    expect(payment).toContain('getIntentStatus');
  });

  it('her sunucu durumu için ayrı sonuç vardır (uydurma durum yok)', () => {
    expect(payment).toContain("s?.status === 'PAID'");
    expect(payment).toContain("s?.status === 'FAILED'");
    expect(payment).toContain('İşlem hâlâ bankada sürüyor');
    // PAID ama tutar cüzdana geri yazılmışsa "başarı" GÖSTERİLMEZ.
    expect(payment).toContain("s?.status === 'PAID' && s.resultReason");
  });

  it('zaman aşımı VE kullanıcı çıkışı askıda niyeti işaretler', () => {
    const kacKez = payment.match(/setPendingPay\(\{/g) ?? [];
    expect(kacKez.length).toBeGreaterThanOrEqual(2);
  });

  it('sonuç bilinmiyorken şerit "başarısız" DEMEZ', () => {
    expect(payment).toContain("'Ödemenin durumu belirsiz'");
    expect(payment).toContain("setInlineErrorKind('PENDING')");
  });

  it('para düğmeleri en az 44px dokunma hedefi taşır (IP10-2b)', () => {
    const bas = payment.indexOf('{inlineError && (');
    const son = payment.lastIndexOf('Durumu Kontrol Et'); // JSX'teki buton (yorumlar değil)
    expect(bas).toBeGreaterThan(0);
    expect(son).toBeGreaterThan(bas);
    const serit = payment.slice(bas, son);
    // Hata şeridindeki iki para düğmesi (Tekrar Dene + Durumu Kontrol Et).
    expect((serit.match(/min-h-\[44px\]/g) ?? []).length).toBe(2);
  });
});

describe('Para yükleme ekranı çıkış maliyetini yazar (BULGU-086)', () => {
  const wallet = oku('views/WalletScreen.tsx');

  it('çekim önizlemesi TOPUP ekranında da çekilir', () => {
    expect(wallet).toContain("if (view !== 'CASHOUT' && view !== 'TOPUP') return;");
  });

  it('kesinti yüzdesi ve minimum SUNUCUDAN gelir, sabit yazılmaz', () => {
    expect(wallet).toContain('%${cashoutPreview.fee_pct}');
    expect(wallet).toContain('${money(cashoutPreview.min)}');
  });

  it('çekim kapalıyken kapalı olduğu yazılır (karar S6)', () => {
    expect(wallet).toContain("Bakiyenin IBAN'a çekimi şu anda kapalı");
  });

  it('para yükleme hatası paylaşılan kırpıcıdan geçer', () => {
    expect(wallet).toContain('setTopupError(stripServerErrorPrefix(raw)');
  });
});
