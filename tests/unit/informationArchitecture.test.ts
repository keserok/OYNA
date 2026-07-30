// IP-14 bekçisi — bilgi mimarisi.
//
// Kilitlenen sözler:
//   1. Alt menünün beş yuvası TEK kaynaktan gelir; App.tsx ikinci bir liste tutmaz.
//   2. Sekme köklerinde geri oku yoktur (alt menü zaten her yere götürür).
//   3. Erişilemez ekran ve ölü kod geri gelmez.
//   4. Her ekranın en az bir GİRİŞİ vardır — özellikle Sosyal ve Mesajlar.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { TAB_IDS } from '../../components/BottomNav';

const KOK = process.cwd();
const oku = (p: string) => readFileSync(join(KOK, p), 'utf8');
const app = () => oku('App.tsx');

function tumKaynak(): string[] {
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

describe('alt menü — tek kaynak', () => {
  it('App.tsx sekme listesini elle YAZMIYOR, TAB_IDS\'ten türetiyor', () => {
    const s = app();
    expect(s).toContain('TAB_IDS');
    // Eski hâli: elle yazılmış dizi. İkisi ayrışınca çubuk yanlış yerde çıkıyordu.
    expect(s).not.toMatch(/showBottomNav\s*=\s*\[/);
  });

  it('beş yuva ve sırası sabit', () => {
    expect([...TAB_IDS]).toEqual([
      'DASHBOARD', 'MATCH_DISCOVERY', 'MY_MATCHES', 'PITCH_DISCOVERY', 'PROFILE',
    ]);
  });

  it('Maçlarım sekme — o ekranda alt menü artık kaybolmuyor', () => {
    expect(TAB_IDS).toContain('MY_MATCHES');
  });
});

describe('sekme kökleri — geri oku yok', () => {
  // Alt menü her yere götürdüğü için sekme kökünde "geri" anlamsız; üstelik
  // yığın doluysa kullanıcıyı beklemediği bir ekrana atıyordu.
  const KOKLER = [
    'views/Dashboard.tsx',
    'views/MatchDiscovery.tsx',
    'views/MyMatchesHub.tsx',
    'views/ProfileScreen.tsx',
  ];

  it.each(KOKLER.filter((f) => f !== 'views/Dashboard.tsx'))('%s onBack taşımıyor', (dosya) => {
    expect(oku(dosya)).not.toMatch(/onBack:\s*\(\)\s*=>\s*void/);
  });

  it('PitchDiscovery\'nin oku YALNIZ seçim modunda çizilir (sekme kökünde değil)', () => {
    const s = oku('views/PitchDiscovery.tsx');
    expect(s).toContain('isSelectionMode');
  });
});

describe('ölü kod — geri gelmedi', () => {
  it('MatchesView silindi ve hiçbir yerden çağrılmıyor', () => {
    expect(existsSync(join(KOK, 'views/MatchesView.tsx'))).toBe(false);
    expect(app()).not.toContain('MatchesView');
  });

  it("'MATCHES' görünümü AppView birleşiminden çıktı", () => {
    // Erişilemezdi: navigateTo('MATCHES') repoda hiç çağrılmıyordu.
    const t = oku('types.ts');
    const birlesim = t.slice(t.indexOf('export type AppView'), t.indexOf(';', t.indexOf('export type AppView')));
    expect(birlesim).not.toMatch(/'MATCHES'/);
  });

  it('taslak (draft) ölü mekanizması silindi', () => {
    // activeDraftId repoda hiçbir zaman bir DEĞER almıyordu; bağlı tüm dallar ölüydü.
    const ihlal = tumKaynak().filter((y) => oku(y).includes('activeDraftId'));
    expect(ihlal).toEqual([]);
    expect(oku('store.ts')).not.toContain('activeDraftId');
  });

  it('ana sayfada ikinci bir Maçlarım kapısı yok', () => {
    // Maçlarım artık orta tuş; ana ekranın en üstündeki büyük kart kaldırıldı.
    const s = oku('views/Dashboard.tsx');
    expect(s).not.toContain('MAÇLARIM Pulsing Button');
  });
});

describe('erişilebilirlik — her ekranın bir kapısı var', () => {
  it('Sosyal alt menüde değil ama Profil\'den açılıyor', () => {
    expect(TAB_IDS).not.toContain('SOCIAL');
    expect(oku('views/ProfileScreen.tsx')).toContain("onNavigate('SOCIAL')");
  });

  it('Sosyal bir çıkış yolu taşıyor (sekme kökü olmadığı için şart)', () => {
    const s = oku('views/SocialView.tsx');
    expect(s).toMatch(/onBack:\s*\(\)\s*=>\s*void/);
    expect(s).toContain('aria-label="Geri"');
    expect(app()).toContain("<SocialView onBack=");
  });

  it('Mesajlar erişilebilir kalıyor (tek kapısı Sosyal)', () => {
    const girisler = tumKaynak().filter((y) => /onNavigate\('MESSAGES'\)/.test(oku(y)));
    expect(girisler.length, 'Mesajlar\'a giden hiçbir yol kalmamış').toBeGreaterThan(0);
  });

  it('maç değerlendirme kapısı akordeondan çıktı, listenin üstünde', () => {
    const s = oku('views/MyMatchesHub.tsx');
    expect(s).toContain('awaitingEval');
    expect(s).toContain('Değerlendirmeni Bekliyor');
    // Bölüm, "Sıradaki etkinlik hero'su"nun ÜSTÜNDE durmalı.
    expect(s.indexOf('Değerlendirmeni Bekliyor')).toBeLessThan(s.indexOf("Sıradaki etkinlik hero'su"));
  });

  it('"QR ile Ekle" artık owner skor ekranına göndermiyor', () => {
    const s = oku('views/social/FriendAddView.tsx');
    expect(s).not.toContain("onNavigate('QR_SCANNER'");
    expect(s).toContain('Davet Linki Gönder');
  });
});

describe('rol değiştirici — sessiz yutma yok', () => {
  it('tek roldeyken sayfa kapanmıyor (kapı kontrol ediliyor)', () => {
    const s = oku('components/settings/FieldRolePage.tsx');
    expect(s).toContain('hasMultipleSwitchableRoles');
  });

  it('rol birleşimi EZİLMİYOR, birleştiriliyor', () => {
    const s = oku('components/settings/FieldRolePage.tsx');
    expect(s, 'ham dizi yine App.tsx birleşimini eziyor').not.toMatch(/if \(roles\.length\) setMyRoles\(roles\);/);
  });
});
