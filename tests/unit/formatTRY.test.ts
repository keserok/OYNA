// IP-19 bekçisi — para biçimi ve bakiye tekliği.
//
// Kilitlenen sözler:
//   1. Kanonik biçim `2.000₺`: sembol SONDA, boşluksuz, binlik ayraçlı.
//   2. Tam sayıda ondalık YOK; kuruş varsa TAM İKİ hane.
//   3. Sıfır FİYAT "Ücretsiz", sıfır TUTAR "0₺" — ikisi aynı şey değil.
//   4. Değer yoksa `—`. "0₺" göstermek yalan olur.
//   5. Ekranlarda elle para dizmek YASAK: `₺` yalnız biçimleyicide ve
//      giriş alanı süsünde geçer.
//   6. Cüzdan TEK sayı, TEK isim: Profil · Cüzdan · Ödeme aynı alanı okur.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  formatTRY,
  formatTRYInt,
  formatTRYShort,
  formatTRYAmount,
  formatTRYSigned,
} from '../../utils/formatTRY';

const KOK = process.cwd();
const oku = (p: string) => readFileSync(join(KOK, p), 'utf8');

function kaynaklar(): string[] {
  const out: string[] = [];
  const gez = (d: string) => {
    for (const ad of readdirSync(join(KOK, d))) {
      const rel = `${d}/${ad}`;
      if (statSync(join(KOK, rel)).isDirectory()) gez(rel);
      else if (/\.tsx?$/.test(ad)) out.push(rel);
    }
  };
  gez('views');
  gez('components');
  return out;
}

describe('formatTRY / formatTRYInt — çıplak gövde (₺ YOK)', () => {
  it('binlik ayraç + iki ondalık', () => {
    expect(formatTRY(1500)).toBe('1.500,00');
    expect(formatTRY(0)).toBe('0,00');
    expect(formatTRY(1234567.5)).toBe('1.234.567,50');
  });

  it('geçersiz sayı → 0,00', () => {
    expect(formatTRY(NaN)).toBe('0,00');
  });

  it('kuruş yuvarlama', () => {
    expect(formatTRY(19.999)).toBe('20,00');
    expect(formatTRY(19.994)).toBe('19,99');
  });

  it('tam sayı biçimi ondalıksız', () => {
    expect(formatTRYInt(1500)).toBe('1.500');
    expect(formatTRYInt(1234567)).toBe('1.234.567');
  });
});

describe('formatTRYShort — KANONİK gösterim (fiyat bağlamı)', () => {
  it.each([
    [2000, '2.000₺'],
    [1234567, '1.234.567₺'],
    [150, '150₺'],
    [299.9, '299,90₺'],
    [0.5, '0,50₺'],
  ])('%s → %s', (giren, bekle) => {
    expect(formatTRYShort(giren)).toBe(bekle);
  });

  it('sıfır fiyat rakamla değil kelimeyle', () => {
    expect(formatTRYShort(0)).toBe('Ücretsiz');
  });

  it('değer yoksa — ("0₺" değil: bilinmiyor ile sıfır aynı şey değil)', () => {
    expect(formatTRYShort(null)).toBe('—');
    expect(formatTRYShort(undefined)).toBe('—');
    expect(formatTRYShort(NaN)).toBe('—');
    expect(formatTRYShort(Infinity)).toBe('—');
  });

  it('kayan nokta artığı kuruş sayılmaz', () => {
    // 0.1 + 0.2 = 0.30000000000000004 — "300,00₺" değil "300₺" yazmalı.
    expect(formatTRYShort(300 + (0.1 + 0.2 - 0.3))).toBe('300₺');
  });

  it('sıfır etiketi çağıran tarafça değiştirilebilir', () => {
    expect(formatTRYShort(0, { sifirEtiketi: '0₺' })).toBe('0₺');
  });
});

describe('formatTRYAmount — muhasebe bağlamı', () => {
  it('sıfır bakiye "Ücretsiz" değil "0₺"', () => {
    // Bir saha ücretsiz olabilir; bir cüzdan olamaz.
    expect(formatTRYAmount(0)).toBe('0₺');
    expect(formatTRYShort(0)).not.toBe(formatTRYAmount(0));
  });

  it('sıfır dışında formatTRYShort ile birebir aynı', () => {
    for (const n of [1, 150, 2000, 299.9, 1234567]) {
      expect(formatTRYAmount(n)).toBe(formatTRYShort(n));
    }
  });

  it('değer yoksa yine —', () => {
    expect(formatTRYAmount(null)).toBe('—');
  });
});

describe('formatTRYSigned — cüzdan hareketi', () => {
  it('giren para +, çıkan para matematiksel eksi (U+2212)', () => {
    expect(formatTRYSigned(500, true)).toBe('+500₺');
    expect(formatTRYSigned(500, false)).toBe('−500₺');
    expect(formatTRYSigned(-500, false)).toBe('−500₺');
  });

  it('kısa çizgi DEĞİL — hizalama ve okunurluk için U+2212', () => {
    expect(formatTRYSigned(500, false).charCodeAt(0)).toBe(0x2212);
  });

  it('sıfır hareket "Ücretsiz" demez', () => {
    expect(formatTRYSigned(0, true)).toBe('+0₺');
  });

  it('değer yoksa işaret de yok', () => {
    expect(formatTRYSigned(null, true)).toBe('—');
  });
});

describe('tek biçim — ikinci yazım üretilemez', () => {
  it('"1.500,00₺" üreten bir dışa aktarım kalmadı', () => {
    // formatTRYWithSymbol silindi: tam sayıda ondalık gösteren İKİNCİ görünür
    // biçimdi ve kullanıcı aynı akışta iki yazımı yan yana görüyordu.
    const s = oku('utils/formatTRY.ts');
    expect(s).not.toMatch(/export const formatTRYWithSymbol/);
  });

  it('para biçimleyicinin ikinci kopyası yok', () => {
    const kopya = kaynaklar().filter((y) =>
      /const (fmtTL|formatTRY\w*)\s*=\s*\(/.test(oku(y)));
    expect(kopya, 'para biçimleyici tek kaynakta durmalı').toEqual([]);
  });

  it('financeUi.money tek kaynağa alias — gövdesi yok', () => {
    const s = oku('views/owner/finance/financeUi.tsx');
    expect(s).toContain('export const money = formatTRYAmount;');
  });
});

describe('ekranlarda elle para dizilmiyor', () => {
  // `₺` yalnız iki yerde meşrudur: sayı GİRİŞ alanının yanındaki süs karakteri
  // ve hukuki metin. Bunun dışında her para biçimleyiciden geçer.
  const SUS_ALANI = [
    'views/WalletScreen.tsx',
    'views/ServiceProfile.tsx',
    'views/ServiceDashboard.tsx',
    'views/ServiceApplication.tsx',
    'views/MatchJoin.tsx',
    'views/owner/OwnerBookingDetailModal.tsx',
    'views/owner/OwnerSpecialPriceModal.tsx',
    'views/owner/OwnerFlashDealModal.tsx',
    'views/owner/OwnerSubscriptionModal.tsx',
    'views/owner/finance/FinanceCollectTab.tsx',
    'views/owner/calendar/FinancialCalendarView.tsx',
  ];
  /** Avukat onaylı metin — dokunulmadı (IP-13'teki HUKUKI kararıyla aynı). */
  const HUKUKI = ['views/LegalScreen.tsx'];
  /** Bütçe süzgeci seçenekleri: hem etiket hem eşitlik anahtarı. */
  const SUZGEC = ['views/MatchDiscovery.tsx'];

  it('şablon/JSX içinde çıplak ₺ kalmadı', () => {
    const ihlal: string[] = [];
    for (const yol of kaynaklar()) {
      if (SUS_ALANI.includes(yol) || HUKUKI.includes(yol) || SUZGEC.includes(yol)) continue;
      oku(yol).split('\n').forEach((satir, i) => {
        const t = satir.trim();
        if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
        if (satir.includes('₺')) ihlal.push(`${yol}:${i + 1} → ${t.slice(0, 90)}`);
      });
    }
    expect(ihlal, `formatTRYShort/formatTRYAmount kullan:\n${ihlal.join('\n')}`).toEqual([]);
  });

  it('süs alanı listesindeki ₺ gerçekten TEK karakter (sayıya yapışık değil)', () => {
    const ihlal: string[] = [];
    for (const yol of [...SUS_ALANI]) {
      oku(yol).split('\n').forEach((satir, i) => {
        const t = satir.trim();
        if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
        if (!satir.includes('₺')) return;
        // Süs: >₺< ya da (₺) gibi tek başına. İhlal: ₺{...} veya {...}₺
        if (/₺\s*\{|\}\s*₺|\d\s*₺|₺\s*\$\{/.test(satir)) ihlal.push(`${yol}:${i + 1} → ${t.slice(0, 90)}`);
      });
    }
    expect(ihlal, `bu ₺ süs değil, para dizimi:\n${ihlal.join('\n')}`).toEqual([]);
  });

  it('para için elle toLocaleString çağrılmıyor', () => {
    const ihlal: string[] = [];
    for (const yol of kaynaklar()) {
      oku(yol).split('\n').forEach((satir, i) => {
        const t = satir.trim();
        if (t.startsWith('//') || t.startsWith('*')) return;
        // Tarih/saat biçimleme meşru; para olanı ₺ ya da price/fee/amount ele verir.
        if (!/toLocaleString\('tr-TR'\)/.test(satir)) return;
        if (/price|fee|amount|balance|deposit|penalty|revenue|collected|Price|Fee|Amount|Balance/.test(satir))
          ihlal.push(`${yol}:${i + 1} → ${t.slice(0, 90)}`);
      });
    }
    expect(ihlal, `para biçimleyiciden geçmeli:\n${ihlal.join('\n')}`).toEqual([]);
  });
});

describe('cüzdan tek sayı, tek isim', () => {
  it('cüzdan toplamı ekranda yeniden hesaplanmıyor', () => {
    // Eskiden WalletScreen `topupBalance + refundBalance` diye kendi toplamını
    // tutuyordu; Profil ve Ödeme sunucunun `spendable_balance`ını okuyordu.
    const s = oku('views/WalletScreen.tsx');
    expect(s).toContain('const walletBalance = summary?.spendableBalance ?? 0;');
    expect(s).not.toMatch(/walletBalance = topupBalance \+ refundBalance/);
  });

  it('sunucu iki alanı da aynı toplamdan türetiyor', () => {
    // profiles.wallet_balance (Profil kısayolu) ile spendable_balance (Cüzdan,
    // Ödeme) aynı iki kovanın toplamıdır — sayı tek.
    const m = oku('supabase/migrations/20260717000002_wallet_topup_bucket.sql');
    expect(m).toContain('topup_balance + v_buckets.refund_credit_balance');
    expect(m).toContain('wallet_balance = v_b.topup_balance + v_b.refund_credit_balance');
  });

  it('ikinci bakiye adı ("OYNA Bakiyesi") kalmadı', () => {
    const ihlal = kaynaklar().filter((y) => /OYNA [Bb]akiye/.test(oku(y)));
    expect(ihlal, 'cüzdanın tek adı "Cüzdan"').toEqual([]);
  });

  it('ayrı "İade Kredisi" çipi yok — tek bakiye', () => {
    const ihlal = kaynaklar().filter((y) => /İade Kredisi/.test(oku(y)));
    expect(ihlal, 'iade ayrı bir para türü değil').toEqual([]);
  });

  it('profil kısayolu bakiyeyi biçimleyiciden geçiriyor', () => {
    const s = oku('views/ProfileScreen.tsx');
    expect(s).toContain("label: 'Cüzdan'");
    expect(s).toContain('value: formatTRYAmount(profile?.walletBalance ?? 0)');
  });
});

describe('gösterilen sayı ile hesaba giren sayı aynı', () => {
  it('maç kurmada bakiye yuvarlanmıyor', () => {
    // `Math.round(n)` ile biçimlenen bakiye 299,60₺'yi "300₺" yazıyor, eksik
    // hesabı ham değerden yapılıyordu: ekranda "bakiyen 300₺" ve "1₺ eksik".
    const s = oku('views/MatchCreate.tsx');
    expect(s).not.toMatch(/Math\.round\(n\)\.toLocaleString/);
    expect(s).toContain('const money = formatTRYAmount;');
  });

  it('kuruşlu bakiye ile eksik tutarı çelişmiyor', () => {
    const bakiye = 299.6;
    const kapora = 300;
    const eksik = Math.max(0, Math.ceil(kapora - bakiye));
    expect(formatTRYAmount(bakiye)).toBe('299,60₺');
    expect(eksik).toBe(1);
    // Yuvarlanmış gösterimde "300₺ bakiye, 1₺ eksik" çelişkisi doğuyordu.
    expect(formatTRYAmount(bakiye)).not.toBe('300₺');
  });
});

describe('hizalama — tabular-nums', () => {
  it('font-numeric sınıfı tabular-nums taşıyor', () => {
    const css = oku('index.css');
    const blok = css.slice(css.indexOf('.font-numeric'));
    expect(blok.slice(0, 200)).toContain('tabular-nums');
  });

  it('font-numeric ile birlikte gereksiz tabular-nums yazılmamış', () => {
    const ihlal: string[] = [];
    for (const yol of kaynaklar()) {
      oku(yol).split('\n').forEach((satir, i) => {
        if (satir.includes('font-numeric') && satir.includes('tabular-nums'))
          ihlal.push(`${yol}:${i + 1}`);
      });
    }
    expect(ihlal, `font-numeric zaten tabular-nums taşıyor:\n${ihlal.join('\n')}`).toEqual([]);
  });
});

describe('katılma tuşu — tutar tek başına okunuyor', () => {
  it('iki katman: büyük tutar üstte, slot + eylem altta', () => {
    const s = oku('views/MatchJoin.tsx');
    expect(s).toContain('{money(total)}');
    expect(s).toMatch(/\{selectedSlotIds\.length\} slot · Öde ve katıl/);
    // Eski tek satır: "2 SLOT · ₺600 · ÖDE VE KATIL" — göz tutarı bulamıyordu.
    expect(s).not.toMatch(/SLOT · ₺\{total/);
  });

  it('ölü buton kopyaları silindi', () => {
    const s = oku('views/MatchJoin.tsx');
    expect(s).not.toContain('if (false) {');
  });
});
