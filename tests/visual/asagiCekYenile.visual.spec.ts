import { test, expect } from '@playwright/test';
import { hazirla, ekranaGit, oturmasiniBekle } from './harness';

// ─── AŞAĞI ÇEKİP YENİLE — gerçek parmakla, her ekranda ──────────────────────
//
// Kullanıcı kararı (4 Ağustos 2026): "Çoğu ekran aşağıya çekilip yenilensin;
// tesis sahibi, kaleci ve hakem arayüzleri de dâhil."
//
// NEDEN GÖRSEL TEST: Jest üç katmanın birlikte çalışmasına bağlı —
//   1) kaydırma motoru parmağı uçta devralacak (utils/scrollSystem.ts)
//   2) esneme eşiği aşılacak (oransal; bkz. REFRESH_PULL_RATIO)
//   3) ekran kaydolmuş VE göstergeyi çiziyor olacak
// Üçünden biri kopunca jest sessizce ölür. Birim testi bunu göremez.
//
// BU TEST YAZILIRKEN YAKALANAN ÜÇ GERÇEK HATA (hepsi buradan çıktı):
//   • Eşik SABİT piksel (78px) idi — kısa kaydırıcılarda tavan 84px olduğu için
//     sönümlemeyle asla ulaşılamıyordu. Oransal yapıldı.
//   • Oran önce 0.72 seçildi — gereken parmak yolu 339px, yani bir ekran
//     boyundan uzun. Dokuz ekranın DOKUZUNDA da jest ölmüştü. 0.5 yapıldı.
//   • Ana sayfada gösterge `!loading` kapısının arkasındaydı; Profil'de ise
//     bileşen import edilip ÇİZİLMEMİŞTİ.

test.use({
  contextOptions: { reducedMotion: 'no-preference', hasTouch: true, isMobile: true },
  hasTouch: true,
  isMobile: true,
});

/** Kullanıcının istediği kapsam: oyuncu ekranları + üç panel. */
const EKRANLAR: { gorunum: string; ad: string }[] = [
  { gorunum: 'DASHBOARD',         ad: 'Ana sayfa' },
  { gorunum: 'MATCH_DISCOVERY',   ad: 'Top Oyna' },
  { gorunum: 'PITCH_DISCOVERY',   ad: 'Sahalar' },
  { gorunum: 'MY_MATCHES',        ad: 'Maçlarım' },
  // Cüzdan kaldırıldı: lansmanda kapalı (shared/featureFlags.ts).
  { gorunum: 'PROFILE',           ad: 'Profil' },
  { gorunum: 'SOCIAL',            ad: 'Sosyal' },
  { gorunum: 'SERVICE_DASHBOARD', ad: 'Kaleci/hakem paneli' },
  { gorunum: 'OWNER_PANEL',       ad: 'Saha sahibi paneli' },
];

/** Ekranın üst kısmından aşağı doğru gerçek bir çekiş yapar. */
async function asagiCek(page: import('@playwright/test').Page): Promise<boolean> {
  return page.evaluate(async () => {
    const x = Math.round(window.innerWidth / 2);
    const y0 = Math.round(window.innerHeight * 0.35);
    const hedef = document.elementFromPoint(x, y0);
    if (!hedef) return false;
    const dokun = (tip: string, y: number) => {
      const t = new Touch({ identifier: 1, target: hedef, clientX: x, clientY: y });
      hedef.dispatchEvent(new TouchEvent(tip, {
        touches: tip === 'touchend' ? [] : [t],
        targetTouches: tip === 'touchend' ? [] : [t],
        changedTouches: [t], bubbles: true, cancelable: true, composed: true,
      }));
    };
    // 240px: gerçek bir "aşağı çek" hareketi. Eşik oransaldır (tavanın yarısı),
    // 132px tavanda ~132px yol yeter; 240px rahat bir pay bırakır.
    dokun('touchstart', y0);
    for (let i = 1; i <= 12; i++) dokun('touchmove', y0 + i * 20);
    dokun('touchend', y0 + 240);
    await new Promise((r) => setTimeout(r, 220));
    return !!document.querySelector('[data-oyna-yenileniyor]');
  });
}

test.describe('Aşağı çekip yenile', () => {
  for (const e of EKRANLAR) {
    test(e.ad, async ({ page }) => {
      await hazirla(page);
      await ekranaGit(page, e.gorunum);
      await page.waitForTimeout(1200);
      await oturmasiniBekle(page).catch(() => {});

      const cikti = await asagiCek(page);
      expect(
        cikti,
        `"${e.ad}" ekranında parmakla aşağı çekildi ama "YENİLENİYOR" göstergesi ` +
        'ÇIKMADI. Üç sebepten biri: (a) ekran useAsagiCekYenile ile kaydolmamış, ' +
        '(b) YenileniyorSeridi çizilmiyor ya da bir koşulun arkasında kalmış, ' +
        '(c) kaydırma motoru bu ekranda parmağı devralmıyor.',
      ).toBe(true);
    });
  }
});
