// IP-10 bekçisi — dokunma hedefi ve erişilebilir ad.
//
// Bu test üç sözü kilitler:
//   1. Ham `navigator.vibrate` çağrısı YOKTUR. Tek kaynak utils/haptics.ts —
//      aksi hâlde titreşim iPhone'da yine sessizce ölür (WKWebView desteklemez).
//   2. Sahada tek elle basılan hedefler 44px altına DÜŞMEZ.
//   3. Sadece-ikon butonların Türkçe erişilebilir adı vardır.
//
// Kapsam: oyuncu tarafı + paylaşılan bileşenler. Tesis paneli (views/owner)
// kendi temasını korur (karar E7) ama dokunma hedefi kuralı ORADA DA geçerlidir —
// bu yüzden ölçülen owner dosyaları da listede.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const KOK = process.cwd();
const oku = (p: string) => readFileSync(join(KOK, p), 'utf8');

/** views/ + components/ altındaki tüm .tsx/.ts dosyaları. */
function taranacakDosyalar(): string[] {
  const out: string[] = [];
  const gez = (dizin: string) => {
    for (const ad of readdirSync(join(KOK, dizin))) {
      const rel = `${dizin}/${ad}`;
      const st = statSync(join(KOK, rel));
      if (st.isDirectory()) gez(rel);
      else if (/\.tsx?$/.test(ad)) out.push(rel);
    }
  };
  gez('views');
  gez('components');
  return out;
}

describe('titreşim — tek kaynak', () => {
  it('views/ ve components/ altında ham navigator.vibrate YOK', () => {
    const ihlal: string[] = [];
    for (const yol of taranacakDosyalar()) {
      const s = oku(yol);
      s.split('\n').forEach((satir, i) => {
        if (/navigator\.vibrate\s*\(/.test(satir)) ihlal.push(`${yol}:${i + 1}`);
      });
    }
    expect(
      ihlal,
      `Ham web titreşimi iOS'ta çalışmaz. utils/haptics.ts kullan:\n${ihlal.join('\n')}`,
    ).toEqual([]);
  });

  it('titreşim çağıran her dosya tek modülden besleniyor', () => {
    for (const yol of taranacakDosyalar()) {
      const s = oku(yol);
      // select()/success()/error() çağıran bir dosya modülü içe aktarmalı.
      const cagiriyor = /(^|[^.\w])(select|success|hapticError)\(\)/m.test(s);
      if (cagiriyor) {
        expect(s, `${yol} titreşim çağırıyor ama modülü içe aktarmamış`).toContain('utils/haptics');
      }
    }
  });
});

describe('dokunma hedefi — 44px tabanı', () => {
  // IP-10 ölçümünde 44px altında bulunup düzeltilen noktalar. Bu sınıflar bu
  // dosyalarda TEKRAR belirirse, düzeltme geri alınmış demektir.
  const YASAK: Array<{ dosya: string; sinif: RegExp; neydi: string }> = [
    { dosya: 'views/MatchJoin.tsx', sinif: /w-9 h-9 flex items-center justify-center bg-white\/5 rounded-full/, neydi: 'lobi geri oku 36px' },
    { dosya: 'views/MatchJoin.tsx', sinif: /top-4 right-4 w-8 h-8 rounded-full/, neydi: 'sheet kapatma X 32px' },
    { dosya: 'views/MessagesView.tsx', sinif: /w-9 h-9 rounded-xl bg-white\/6/, neydi: 'geri/menü 36px' },
    { dosya: 'views/PostMatchEval.tsx', sinif: /className="p-1 relative overflow-visible"/, neydi: 'yıldız butonu 36-42px' },
    { dosya: 'views/PitchDiscovery.tsx', sinif: /w-7 h-7 rounded-xl bg-white\/5/, neydi: 'yol tarifi 28px' },
    { dosya: 'components/ui/GlassModal.tsx', sinif: /w-9 h-9 -mr-1 rounded-xl/, neydi: 'kapatma X 36px' },
    { dosya: 'views/owner/calendar/FinancialCalendarView.tsx', sinif: /w-8 h-8 rounded-lg bg-white\/5 border border-white\/10/, neydi: 'ay okları 32px' },
    { dosya: 'views/owner/components/OwnerKpiGrid.tsx', sinif: /shrink-0 px-3 py-1\.5 rounded-full/, neydi: 'komut şeridi çipi ~28px' },
  ];

  it.each(YASAK)('$dosya — $neydi geri gelmedi', ({ dosya, sinif }) => {
    expect(sinif.test(oku(dosya))).toBe(false);
  });

  it('AnimatedButton her boyutta 44px tabanını tutuyor', () => {
    const s = oku('components/AnimatedButton.tsx');
    for (const m of s.matchAll(/min-h-\[(\d+)px\]/g)) {
      expect(Number(m[1]), `min-h-[${m[1]}px] tabanın altında`).toBeGreaterThanOrEqual(44);
    }
  });
});

describe('erişilebilir ad — sadece-ikon butonlar', () => {
  // IP-10'da etiketlenen 23 buton. Ekran okuyucu bunları "düğme" diye değil,
  // adıyla okumalı.
  const ETIKETLI: Array<[string, string]> = [
    ['views/MatchJoin.tsx', 'Geri'],
    ['views/MatchJoin.tsx', 'Kapat'],
    ['views/PitchDiscovery.tsx', 'Geri'],
    ['views/PitchDiscovery.tsx', 'Kapat'],
    ['views/PitchDiscovery.tsx', 'Favorilere ekle'],
    ['views/MatchDiscovery.tsx', 'Geri'],
    ['views/MatchDiscovery.tsx', 'Kapat'],
    ['views/ProfileScreen.tsx', 'Geri'],
    ['views/ProfileScreen.tsx', 'Ayarlar'],
    ['views/MessagesView.tsx', 'Geri'],
    ['views/MessagesView.tsx', 'Menü'],
    ['views/MatchDiaryDetail.tsx', 'Geri'],
    ['views/MatchDiaryDetail.tsx', 'Paylaş'],
    ['views/GuardianConsentChild.tsx', 'Geri'],
    ['views/GuardianConsentForm.tsx', 'Geri'],
    ['views/LegalScreen.tsx', 'Geri'],
    ['views/PostMatchEval.tsx', 'Geri'],
    ['views/owner/calendar/FinancialCalendarView.tsx', 'Abonman işlemleri'],
  ];

  it.each(ETIKETLI)('%s içinde "%s" etiketi var', (dosya, etiket) => {
    expect(oku(dosya)).toContain(`aria-label="${etiket}"`);
  });

  it('etiketler Türkçe — İngilizce sızıntı yok', () => {
    const ingilizce = /aria-label="(Back|Close|Share|Settings|Menu|Next|Previous)"/;
    for (const yol of taranacakDosyalar()) {
      expect(ingilizce.test(oku(yol)), `${yol} İngilizce etiket taşıyor`).toBe(false);
    }
  });
});
