// IP-10 bekçisi — dokunma hedefi ve erişilebilir ad.
//
// Bu test üç sözü kilitler:
//   1. Titreşim uygulamada YOKTUR (kullanıcı kararı) ve geri sızmaz.
//   2. Sahada tek elle basılan hedefler 44px altına DÜŞMEZ.
//   3. Sadece-ikon butonların Türkçe erişilebilir adı vardır.
//
// Kapsam: oyuncu tarafı + paylaşılan bileşenler. Tesis paneli (views/owner)
// kendi temasını korur (karar E7) ama dokunma hedefi kuralı ORADA DA geçerlidir —
// bu yüzden ölçülen owner dosyaları da listede.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
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

describe('titreşim — uygulamada YOK (kullanıcı kararı)', () => {
  // Titreşim önce native köprüye taşınmış, sonra kullanıcı kararıyla
  // UYGULAMADAN TAMAMEN KALDIRILMIŞTIR. Bu blok geri sızmasını engeller:
  // ham web API'si, Capacitor eklentisi ve eski yardımcı modül — üçü de yasak.
  it('ham navigator.vibrate çağrısı yok', () => {
    const ihlal: string[] = [];
    for (const yol of taranacakDosyalar()) {
      oku(yol).split('\n').forEach((satir, i) => {
        if (/navigator\.vibrate\s*\(/.test(satir)) ihlal.push(`${yol}:${i + 1}`);
      });
    }
    expect(ihlal, `Titreşim kaldırıldı; geri eklenmemeli:\n${ihlal.join('\n')}`).toEqual([]);
  });

  it('@capacitor/haptics içe aktarılmıyor', () => {
    const ihlal = taranacakDosyalar().filter((y) => oku(y).includes('@capacitor/haptics'));
    expect(ihlal).toEqual([]);
  });

  it('eski utils/haptics modülü geri gelmedi', () => {
    expect(existsSync(join(KOK, 'utils/haptics.ts'))).toBe(false);
    const ihlal = taranacakDosyalar().filter((y) => oku(y).includes('utils/haptics'));
    expect(ihlal).toEqual([]);
  });

  it('native eklenti bağı da koparıldı (paket + iOS + Android)', () => {
    expect(oku('package.json')).not.toContain('@capacitor/haptics');
    expect(oku('ios/App/Podfile')).not.toContain('CapacitorHaptics');
    expect(oku('android/capacitor.settings.gradle')).not.toContain('capacitor-haptics');
  });

  it('görsel basma geri bildirimi DURUYOR — kaldırılan yalnız titreşim', () => {
    // Titreşim gitti diye dokunuşun karşılığı da yok olmamalı.
    expect(oku('index.css')).toMatch(/filter:\s*brightness\(0\.78\)/);
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
    // Top Oyna filtre panelinin kapatma tuşu: panel kendi dosyasına taşındı
    // (DiscoveryFilterSheet). Kural aynı — bekçi yeni evini izliyor.
    ['components/discovery/DiscoveryFilterSheet.tsx', 'Kapat'],
    ['views/ProfileScreen.tsx', 'Ayarlar'],
    ['views/MessagesView.tsx', 'Geri'],
    ['views/MessagesView.tsx', 'Menü'],
    ['views/MatchDiaryDetail.tsx', 'Geri'],
    // IP-18: etiket 'Paylaş' → 'Maç raporunu paylaş'. Tuş artık gerçekten
    // çalışıyor; ekran okuyucu NEYİ paylaştığını da söylüyor.
    ['views/MatchDiaryDetail.tsx', 'Maç raporunu paylaş'],
    ['views/GuardianConsentChild.tsx', 'Geri'],
    ['views/GuardianConsentForm.tsx', 'Geri'],
    ['views/LegalScreen.tsx', 'Geri'],
    ['views/PostMatchEval.tsx', 'Geri'],
    ['views/owner/calendar/FinancialCalendarView.tsx', 'Abonman işlemleri'],
  ];

  it.each(ETIKETLI)('%s içinde "%s" etiketi var', (dosya, etiket) => {
    expect(oku(dosya)).toContain(`aria-label="${etiket}"`);
  });

  // IP-14: sekme köklerinde geri oku YOKTUR — alt menü zaten her yere götürüyor,
  // ok kullanıcıyı yığında geriye atıp şaşırtıyordu. Beş sekme kökü:
  // Dashboard · MatchDiscovery · MyMatchesHub · PitchDiscovery · ProfileScreen.
  // (PitchDiscovery'nin oku YALNIZ seçim modunda çizilir — o sekme kökü değil.)
  it('sekme köklerinde onBack ile çizilen geri oku yok', () => {
    for (const dosya of ['views/MatchDiscovery.tsx', 'views/ProfileScreen.tsx', 'views/MyMatchesHub.tsx']) {
      const src = oku(dosya);
      expect(src, `${dosya} hâlâ onBack prop'u taşıyor`).not.toMatch(/onBack:\s*\(\)\s*=>\s*void/);
      expect(src, `${dosya} içinde onClick={onBack} kalmış`).not.toContain('onClick={onBack}');
    }
  });

  it('etiketler Türkçe — İngilizce sızıntı yok', () => {
    const ingilizce = /aria-label="(Back|Close|Share|Settings|Menu|Next|Previous)"/;
    for (const yol of taranacakDosyalar()) {
      expect(ingilizce.test(oku(yol)), `${yol} İngilizce etiket taşıyor`).toBe(false);
    }
  });
});
