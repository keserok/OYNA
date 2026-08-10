// IP-23 bekçisi — Taktik Stüdyo akışı ve yerel (native) diyalogların kaldırılması.
//
// Kilitlenen sözler:
//   1. Uygulamada tek bir çıplak sistem penceresi (confirm/alert/prompt) kalmaz.
//   2. Ortak onay/sheet altyapısı paylaşılan katmanda yaşar; oyuncu tarafı
//      `views/owner/`den import etmez.
//   3. TESİS PANELİNİN ARAYÜZÜNE DOKUNULMAZ (kullanıcı kuralı) — eski import
//      yolları yönlendirme dosyalarıyla korunur.
//   4. Oyuncu seçme paneli her seçimde kapanıp aramayı silmez.
//   5. Hat eşleşmesi ham mevki metniyle değil, tek eşleyiciyle yapılır.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

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
  gez('hooks');
  return out;
}

describe('çıplak sistem penceresi kalmadı', () => {
  it('window.confirm / alert / prompt çağrısı yok', () => {
    // Markalı arayüzden çıkıp "localhost diyor ki" kutusu gösteriyorlardı;
    // iOS WebView'de prompt zaten güvenilir çalışmıyor.
    const YASAK = /(^|[^.\w])(alert|prompt)\s*\(|window\.(confirm|alert|prompt)\s*\(|(^|[^.\w])confirm\s*\(\s*['"`]/;
    const ihlal: string[] = [];
    for (const yol of [...kaynaklar(), 'App.tsx']) {
      oku(yol).split('\n').forEach((satir, i) => {
        const t = satir.trim();
        // Yorum satırları (JSX yorumu dâhil) kapsam dışı.
        if (/^(\/\/|\*|\/\*|\{\/\*)/.test(t)) return;
        if (YASAK.test(satir)) ihlal.push(`${yol}:${i + 1} → ${t.slice(0, 80)}`);
      });
    }
    expect(ihlal, `markalı pencere kullan:\n${ihlal.join('\n')}`).toEqual([]);
  });

  it('Stüdyo plan silme markalı onay soruyor', () => {
    const s = oku('views/Studio.tsx');
    expect(s).toContain("import { useConfirmSheet } from '../components/ui/useConfirmSheet';");
    expect(s).toContain('const { confirm, confirmElement } = useConfirmSheet();');
    expect(s).toContain("title: 'Planı sil?'");
    expect(s).toContain('destructive: true');
    // Onay penceresi gerçekten çiziliyor mu? (Eksikse confirm() sonsuza kadar bekler.)
    expect(s).toContain('{confirmElement}');
  });

  it('tesis şikâyeti klavye-farkındalıklı sheet ile alınıyor', () => {
    const s = oku('views/PitchDiscovery.tsx');
    expect(s).toContain("import { ActionSheet } from '../components/ui/ActionSheet';");
    expect(s).toContain('<ActionSheet');
    expect(s).toContain('<textarea');
    expect(s).toContain('Bildirimi gönder');
    // ActionSheet klavyeyi hesaba katıyor — CTA klavye arkasında kalmaz.
    expect(oku('components/ui/ActionSheet.tsx')).toContain('visualViewport');
  });

  it('yetki uyarısı artık alert\'e düşemez — notify zorunlu', () => {
    const s = oku('hooks/useOwnerEntitlements.ts');
    expect(s).toContain('notify: OwnerNotifyFn,');
    expect(s).not.toContain('notify?: OwnerNotifyFn');
  });
});

describe('ortak altyapı paylaşılan katmanda', () => {
  it.each([
    'components/ui/ActionSheet.tsx',
    'components/ui/ConfirmSheet.tsx',
    'components/ui/useConfirmSheet.tsx',
    'components/ui/OwnerIconButton.tsx',
  ])('%s taşındı', (yol) => {
    expect(existsSync(join(KOK, yol))).toBe(true);
  });

  it('oyuncu tarafındaki IconButton SİLİNMEDİ — üzerine yazılmadı', () => {
    // Planın önerdiği `git mv` bu dosyayı yok edecekti; iki dosya farklıydı.
    const s = oku('components/ui/IconButton.tsx');
    expect(s.length).toBeGreaterThan(1000);
    expect(oku('components/ui/OwnerIconButton.tsx')).not.toBe(s);
  });

  it('oyuncu ekranları views/owner/ altından import etmiyor', () => {
    const ihlal: string[] = [];
    for (const yol of kaynaklar()) {
      if (yol.startsWith('views/owner/') || yol === 'views/OwnerPanel.tsx') continue;
      oku(yol).split('\n').forEach((satir, i) => {
        if (/from\s+['"][^'"]*views\/owner\//.test(satir) || /from\s+['"]\.\/owner\//.test(satir)) {
          ihlal.push(`${yol}:${i + 1}`);
        }
      });
    }
    expect(ihlal, `paylaşılan katmandan import et:\n${ihlal.join('\n')}`).toEqual([]);
  });

  it('ActionSheet yığın katmanı ayarlanabilir — varsayılan değişmedi', () => {
    const s = oku('components/ui/ActionSheet.tsx');
    expect(s).toContain("zClassName = 'z-[55]'");
    expect(s).toContain('${zClassName}');
  });

  it('geriye uyum adı korundu — tesis paneli aynı adla import ediyor', () => {
    expect(oku('components/ui/ActionSheet.tsx')).toContain('export const OwnerBottomSheet = ActionSheet;');
  });
});

describe('TESİS PANELİNE DOKUNULMADI (kullanıcı kuralı)', () => {
  const YONLENDIRME = [
    'views/owner/components/IconButton.tsx',
    'views/owner/components/OwnerBottomSheet.tsx',
    'views/owner/components/ConfirmSheet.tsx',
    'views/owner/components/useConfirmSheet.tsx',
  ];

  it('eski yollar duruyor — import satırları değiştirilmedi', () => {
    for (const yol of YONLENDIRME) {
      expect(existsSync(join(KOK, yol)), yol).toBe(true);
    }
  });

  it('eski yollar YALNIZ yönlendirme — ikinci uygulama yok', () => {
    for (const yol of YONLENDIRME) {
      const s = oku(yol);
      expect(s, `${yol} hâlâ bileşen içeriyor`).not.toContain('React.FC');
      expect(s, `${yol} yönlendirme değil`).toContain("from '../../../components/ui/");
    }
  });

  it('tesis paneli ekranları eski adlarıyla import etmeye devam ediyor', () => {
    // Bu ekranlarda TEK KARAKTER değişmedi; görsel testleri de yok (24 görsel
    // testin 0'ı tesis panelini kapsıyor), o yüzden dokunmamak tek güvenli yol.
    expect(oku('views/OwnerPanel.tsx')).toContain("from './owner/components/useConfirmSheet'");
    expect(oku('views/owner/OwnerBookingDetailModal.tsx')).toContain("from './components/OwnerBottomSheet'");
  });
});

describe('oyuncu seçme paneli', () => {
  const s = oku('views/Studio.tsx');

  it('seçimden sonra kapanmıyor, sıradaki boş mevkiye geçiyor', () => {
    // 5 kişilik kadro için 5 kez aç-ara-kapa gerekiyordu.
    expect(s).toContain('const sonrakiBos = newSlots.find(s => !s.player);');
    expect(s).toContain("setShowPlayerSelect({ type: 'slot', slotId: sonrakiBos.id })");
  });

  it('son mevki dolunca kendiliğinden kapanıyor', () => {
    const blok = s.slice(s.indexOf('const sonrakiBos'), s.indexOf('const sonrakiBos') + 300);
    expect(blok).toContain('else closePlayerSelect();');
  });

  it('arama ve filtre panel açıkken korunuyor', () => {
    // Sıfırlama AÇILIŞTAN kapanışa taşındı.
    const kapat = s.slice(s.indexOf('const closePlayerSelect'), s.indexOf('const closePlayerSelect') + 220);
    expect(kapat).toContain("setPlayerSearch('')");
    expect(kapat).toContain("setSelectedGroup('Tümü')");
    // Açılış efektinde artık sıfırlama YOK.
    const acilis = s.slice(s.indexOf('const panelAcik'), s.indexOf('const closePlayerSelect'));
    expect(acilis).not.toContain("setPlayerSearch('')");
    expect(acilis).not.toContain("setSelectedGroup('Tümü')");
  });

  it('hat eşleşmesi tek eşleyiciden geçiyor', () => {
    // Ham `player.role` ('ST'/'CM') slot rolüyle ('FWD'/'MID') hiç tutmuyordu;
    // herkes ilk boş slota düşüyordu. posToLine dosyada zaten vardı.
    expect(s).toContain('const hat = posToLine(player.role);');
    expect(s).not.toContain("s.role === player.role");
  });

  it('"Oyuncu Ekle" girişi 44px ve etiketli', () => {
    // Eskiden 32px, metinsiz, erişilebilir adsız bir artı ikonuydu.
    expect(s).toContain('aria-label="Oyuncu ekle"');
    // #39FF14 → `primary` token'ına taşındı (değer birebir aynı).
    expect(s).toContain('min-h-11 px-3.5 rounded-full bg-primary/20');
    expect(s).not.toContain('className="w-8 h-8 rounded-full bg-primary/20');
  });

  it('çıkış tuşu kaç mevkinin dolduğunu söylüyor', () => {
    expect(s).toContain('dizili');
  });
});

describe('eski formasyon adı okunurken çevriliyor', () => {
  it('kayıttan gelen taktik normalize ediliyor', () => {
    const s = oku('views/Studio.tsx');
    expect(s).toContain('formation: resolveFormation(d.size, d.formation)');
  });
});
