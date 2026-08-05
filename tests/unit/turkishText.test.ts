// IP-13 bekçisi — Türkçe metin, ton ve adlandırma tekliği.
//
// Kilitlenen sözler:
//   1. Türkçe metin `toUpperCase()` ile büyütülmez — `İ/ı` bozulur.
//   2. Teknik alanlar (IBAN, kod, hex id, enum) tr-TR locale'i KULLANMAZ.
//   3. Bir ekranın tek adı vardır; sekme etiketi = ekran başlığı.
//   4. Yıkıcı buton fiili söyler, güvenli buton "Vazgeç"tir.
//   5. Üç nokta tek karakter: `…`.
//   6. Arayüz SEN kipindedir; HUKUKİ metinler bilerek SİZ kalır.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { trUpper, trLower, trCapitalize, trInitials } from '../../utils/trUpper';
import { SCREEN, WAIT, CONFIRM } from '../../ui/labels';
import { TAB_IDS } from '../../components/BottomNav';

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


/** Hukuki metinler — kullanıcı kararı gereği SİZ kipinde KALIR. */
const HUKUKI = [
  'views/LegalScreen.tsx',
  'views/GuardianConsentForm.tsx',
  'components/common/LegalModal.tsx', // KVKK aydınlatma metni
];

describe('trUpper — Türkçe büyütme', () => {
  it.each([
    ['Gizlilik Politikası', 'GİZLİLİK POLİTİKASI'],
    ['KVKK Aydınlatma Metni', 'KVKK AYDINLATMA METNİ'],
    ['Çiğli', 'ÇİĞLİ'],
    ['Nisan', 'NİSAN'],
    ['Doksanlık', 'DOKSANLIK'],
    ['irem', 'İREM'],
  ])('%s → %s', (giren, bekle) => {
    expect(trUpper(giren)).toBe(bekle);
    // Düz toUpperCase bunların hepsini bozuyordu.
    if (giren !== 'Doksanlık') expect(giren.toUpperCase()).not.toBe(bekle);
  });

  it('boş/null girdide patlamaz', () => {
    expect(trUpper(null)).toBe('');
    expect(trUpper(undefined)).toBe('');
  });

  it('trLower noktalı/noktasız ayrımını korur', () => {
    expect(trLower('IRMAK')).toBe('ırmak');
    expect(trLower('İREM')).toBe('irem');
  });

  it('trCapitalize ilk harfi Türkçe kuralıyla büyütür', () => {
    expect(trCapitalize('ısrarlı')).toBe('Israrlı');
    expect(trCapitalize('ciddi')).toBe('Ciddi');
  });

  it('trInitials baş harf rozetini doğru üretir', () => {
    expect(trInitials('irem yılmaz')).toBe('İY');
    expect(trInitials('ahmet')).toBe('A');
    expect(trInitials('')).toBe('?');
  });
});

describe('toUpperCase kullanımı — yalnız teknik alanlarda', () => {
  // Türkçe metinde düz toUpperCase 'İ/ı' ayrımını bozar. Teknik alanlarda ise
  // tr-TR locale ZARARLIDIR: 'i' → 'İ' ASCII değildir, doğrulamayı bozar.
  // Bu yüzden kalan çağrılar bilerek düz toUpperCase'tir.
  const IZINLI = [
    'views/WalletScreen.tsx',            // IBAN
    'views/PaymentScreen.tsx',           // işlem numarası (hex)
    'views/MatchTicket.tsx',             // rezervasyon id + ödeme durumu enum
    'views/MatchDiscovery.tsx',          // özel maç kodu
    'views/QRScannerView.tsx',           // manuel kod
    'views/GuardianConsentForm.tsx',     // veli kodu
    'views/MatchJoin.tsx',               // sonuç enum karşılaştırması
    'views/Studio.tsx',                  // pozisyon enum
    'components/MatchJoinCard.tsx',      // rol enum
    'components/payment/CardBrandMark.tsx', // kart markası enum
  ];

  it('izinli liste dışında düz toUpperCase kalmadı', () => {
    const ihlal: string[] = [];
    for (const yol of kaynaklar()) {
      if (IZINLI.includes(yol)) continue;
      oku(yol).split('\n').forEach((satir, i) => {
        if (satir.includes('.toUpperCase()')) ihlal.push(`${yol}:${i + 1}`);
      });
    }
    expect(ihlal, `Türkçe metin için trUpper kullan:\n${ihlal.join('\n')}`).toEqual([]);
  });

  it('trUpper tek yerde tanımlı — ikinci kopya yok', () => {
    const tanimlayanlar = kaynaklar().filter((y) =>
      /export const trUpper\s*=/.test(oku(y)));
    expect(tanimlayanlar, 'trUpper kopyası').toEqual([]);
  });
});

describe('ekran adı tekliği', () => {
  it('sekme etiketleri tek kaynaktan geliyor', () => {
    const s = oku('components/BottomNav.tsx');
    expect(s).toContain("from '../ui/labels'");
    expect(s).toContain('SCREEN.pitchDiscovery');
  });

  it('sekme sayısı ile etiket sayısı tutuyor', () => {
    expect(TAB_IDS.length).toBe(5);
  });

  it('eski adlar kalmadı — ekranın tek adı "Saha Kirala"', () => {
    // Ad geçmişi: "Saha Vitrini" → "Sahalar" → "Saha Kirala" (onaylı ana
    // sayfa tasarımı). Yeni ad eylemi söyler; kullanıcı listelemeye değil
    // kiralamaya giriyor. Eskilerin ikisi de kaynakta kalmamalı.
    expect(SCREEN.pitchDiscovery).toBe('Saha Kirala');
    const ihlal = kaynaklar().filter((y) => oku(y).includes('Saha Vitrini'));
    expect(ihlal, 'ekranın ikinci adı hâlâ duruyor').toEqual([]);
  });

  it('metin içi atıflar sabitten türer, elle yazılmaz', () => {
    // Drift koruması: atıf metni SCREEN'den şablonla kurulmalı. Elle yazılan
    // ad, sabit değişince geride kalır — bu ekranda tam olarak iki kez oldu.
    const s = oku('views/MyMatchesHub.tsx');
    expect(s).not.toContain("Saha Vitrini'nden");
    expect(s).not.toContain("Sahalar'dan");
    expect(s).toContain('${SCREEN.pitchDiscovery}\'dan');
  });
});

describe('yıkıcı / güvenli buton ayrımı', () => {
  it('"Evet," ön ekli yıkıcı buton kalmadı', () => {
    // "Evet, İptal Et" ile "Vazgeç" Türkçede eş anlamlı okunuyordu.
    const ihlal: string[] = [];
    for (const yol of kaynaklar()) {
      oku(yol).split('\n').forEach((satir, i) => {
        if (/['">]\s*Evet,\s/.test(satir)) ihlal.push(`${yol}:${i + 1}`);
      });
    }
    expect(ihlal, `yıkıcı buton fiili söylemeli:\n${ihlal.join('\n')}`).toEqual([]);
  });

  it('sözlükteki yıkıcı etiketler fiil taşıyor, "Evet" taşımıyor', () => {
    for (const [k, v] of Object.entries(CONFIRM)) {
      if (k === 'cancel') continue;
      expect(v, `${k}`).not.toMatch(/^Evet/);
      expect(v.length, `${k} çok kısa`).toBeGreaterThan(4);
    }
    expect(CONFIRM.cancel).toBe('Vazgeç');
  });

  it('ayrılma modalinin güvenli butonu "iptal" demiyor', () => {
    // Eskiden güvenli buton "İPTAL" yazıyordu — yani "vazgeç" demek isteyip
    // "iptal et" yazıyordu; yıkıcı buton ise sadece "AYRIL".
    const s = oku('views/MatchJoin.tsx');
    expect(s).toContain('VAZGEÇ');
    expect(s).toContain('MAÇTAN AYRIL');
  });
});

describe('üç nokta ve bekleme metni', () => {
  it('kullanıcıya görünen metinde "..." kalmadı', () => {
    const ihlal: string[] = [];
    for (const yol of kaynaklar()) {
      oku(yol).split('\n').forEach((satir, i) => {
        // Kod yorumu ve spread hariç: harf ardından gelen üç nokta.
        if (satir.trim().startsWith('//') || satir.trim().startsWith('*')) return;
        if (/[0-9A-Za-zçğıöşüÇĞİÖŞÜ]\.\.\.(?!\.)/.test(satir)) ihlal.push(`${yol}:${i + 1}`);
      });
    }
    expect(ihlal, `tipografik "…" kullan:\n${ihlal.slice(0, 15).join('\n')}`).toEqual([]);
  });

  it('bekleme sözlüğü tek karakter kullanıyor', () => {
    for (const [k, v] of Object.entries(WAIT)) {
      expect(v, `${k}`).toContain('…');
      expect(v, `${k}`).not.toContain('...');
    }
  });
});

describe('hitap kipi', () => {
  it('arayüz metinlerinde SİZ kipi kalmadı (hukuki metinler hariç)', () => {
    // ÇOĞUL "siz ikiniz" (Arkadaşsınız, Arkadaşlığınız) dilbilgisel olarak
    // doğrudur — kapsam dışı.
    const cogul = /Arkadaşsınız|Arkadaşlığınız|birbirinizi|arkadaşsınız/;
    const sizKipi = /\b\w+(iniz|ınız|unuz|ünüz)\b|\bediniz\b|\byapınız\b|\bdeneyiniz\b|\bkontrol edin\b/;
    const ihlal: string[] = [];
    for (const yol of kaynaklar()) {
      if (HUKUKI.includes(yol)) continue;
      oku(yol).split('\n').forEach((satir, i) => {
        if (satir.trim().startsWith('//') || satir.trim().startsWith('*')) return;
        if (cogul.test(satir)) return;
        if (sizKipi.test(satir)) ihlal.push(`${yol}:${i + 1} → ${satir.trim().slice(0, 80)}`);
      });
    }
    expect(ihlal, `SEN kipine çevir:\n${ihlal.slice(0, 15).join('\n')}`).toEqual([]);
  });

  it('hukuki metinler SİZ kipinde BIRAKILDI (kullanıcı kararı)', () => {
    // Avukat onayı bekleyen metinlerin dili bilerek değiştirilmedi.
    const s = oku('views/LegalScreen.tsx');
    expect(/\w+(iniz|ınız|unuz|ünüz)\b/.test(s), 'hukuki metin SEN yapılmış').toBe(true);
  });
});

describe('kod adı sızıntısı', () => {
  // Eskiden tesis şeridi "PitchDiscovery'de görünmez" yazıyordu; düzeltilince
  // "Sahalar'da" oldu. O şerit IP-22 ile kalktı (tesis onayı diye bir şey yok),
  // ama kod adının kullanıcı metnine sızmaması kuralı geçerliliğini koruyor.
  const KOD_ADLARI = ['PitchDiscovery', 'OwnerPanel', 'PendingActions', 'FinancialCalendarView'];

  it.each([
    'views/OwnerPanel.tsx',
    'views/owner/menu/OwnerMenuView.tsx',
    'views/owner/menu/OwnerFacilitySettingsModal.tsx',
  ])('%s — ekranın kod adı Türkçe cümleye girmiyor', (yol) => {
    const s = oku(yol);
    for (const ad of KOD_ADLARI) {
      // "Ad'de / Ad'da / Ad'ye ..." = kod adı cümlenin içinde çekimlenmiş.
      expect(s, `${yol} içinde "${ad}" kullanıcı metnine sızmış`).not.toMatch(
        new RegExp(`${ad}'[a-zçğıöşü]`),
      );
    }
  });
});
