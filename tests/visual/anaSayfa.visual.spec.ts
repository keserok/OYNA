// ════════════════════════════════════════════════════════════════════════════
// ANA SAYFA — onaylı tasarımın KABUL KRİTERLERİ
// ════════════════════════════════════════════════════════════════════════════
//
// Bu dosya ekran görüntüsü KARŞILAŞTIRMAZ; ölçü alır. Sebep: tasarımın kabul
// kriterleri "şuna benzesin" değil, ölçülebilir sözler —
//
//   • 360px genişlikte (Galaxy A serisi) hiçbir YATAY TAŞMA yok.
//   • 430px genişlikte (iPhone Pro Max) kartlar orantılı büyür, şerit hizada.
//   • Kaydırırken başlığın YANINDAN ya da KÖŞESİNDEN içerik geçmez.
//   • Tüm dokunma hedefleri ≥48dp.
//
// Referans görüntüye bağlanmadıkları için bu testler yazı tipi rasterizasyonu
// ya da bir pikselik gölge farkı yüzünden kırmızıya dönmez — yalnız gerçek
// bir düzen bozukluğunda patlar.

import { test, expect } from '@playwright/test';
import { hazirla, ekranaGit, oturmasiniBekle } from './harness';

test.describe('Ana Sayfa — düzen sözleri', () => {
  test.beforeEach(async ({ page }) => {
    await hazirla(page);
    await ekranaGit(page, 'DASHBOARD');
    await oturmasiniBekle(page);
  });

  test('yatay taşma YOK', async ({ page }) => {
    // Belge genişliği görüntü alanını aşarsa sayfa yana kayar. 360px'lik
    // cihazda profil kartı + 128px'lik cüzdan kolonu tam sınırda duruyor;
    // bir kartın `min-width: 0` unutulması bu testi kırar.
    const tasma = await page.evaluate(() => ({
      belge: document.documentElement.scrollWidth,
      gorunum: document.documentElement.clientWidth,
    }));
    expect(tasma.belge, `belge ${tasma.belge}px, görünüm ${tasma.gorunum}px`)
      .toBeLessThanOrEqual(tasma.gorunum);
  });

  test('hiçbir öğe ekranın sağından taşmıyor', async ({ page }) => {
    // Yalnız belge genişliğine bakmak yetmez: `overflow: hidden` bir taşmayı
    // gizleyebilir ama içerik yine de kesilmiş olur. Kartların gerçek
    // sınırlarını ölçüyoruz.
    const tasanlar = await page.evaluate(() => {
      const w = document.documentElement.clientWidth;
      const out: string[] = [];
      document.querySelectorAll('[data-tap]').forEach((el) => {
        const r = el.getBoundingClientRect();
        // Yatay şerit kartları KASITLI olarak kenardan taşar (tasarım:
        // "kartlar ekranın kenarından taşarak kaybolur"). Onları eliyoruz.
        if (el.closest('[data-oy-strip]')) return;
        if (r.right > w + 1 || r.left < -1) {
          out.push(`${el.getAttribute('aria-label')} → ${Math.round(r.left)}..${Math.round(r.right)} (ekran ${w})`);
        }
      });
      return out;
    });
    expect(tasanlar, tasanlar.join('\n')).toEqual([]);
  });

  test('kaydırılan içerik başlığın altından geçer, yanından değil', async ({ page }) => {
    // Başlık kaydırıcının KARDEŞİdir. Çocuğu olsaydı içerik köşe kavisinin
    // içinden görünürdü. Ölçü: kaydırıcının üst kenarı başlığın alt kenarının
    // altında mı?
    const olcu = await page.evaluate(() => {
      const basl = document.querySelector('.dash-safe-top') as HTMLElement | null;
      const kaydirici = document.querySelector('[data-oy-scroll]') as HTMLElement | null;
      if (!basl || !kaydirici) return null;
      return { baslikAlt: basl.getBoundingClientRect().bottom, kayUst: kaydirici.getBoundingClientRect().top };
    });
    expect(olcu, 'başlık ya da kaydırıcı bulunamadı').not.toBeNull();
    expect(olcu!.kayUst).toBeGreaterThanOrEqual(olcu!.baslikAlt - 0.5);
  });

  test('kaydırdıktan sonra da başlık üstte kalır', async ({ page }) => {
    const kaydirici = page.locator('[data-oy-scroll]');
    await kaydirici.evaluate((el) => { el.scrollTop = 400; });
    await page.waitForTimeout(120);
    const olcu = await page.evaluate(() => {
      const basl = document.querySelector('.dash-safe-top') as HTMLElement | null;
      return basl ? basl.getBoundingClientRect().top : null;
    });
    // Başlık `flex: none` — kaydırma onu yerinden oynatmamalı.
    expect(olcu).not.toBeNull();
    expect(Math.abs(olcu!)).toBeLessThan(80); // güvenli alan payı kadar tolerans
  });

  test('tüm dokunma hedefleri 48dp tabanını tutuyor', async ({ page }) => {
    const kucukler = await page.evaluate(() => {
      const out: string[] = [];
      document.querySelectorAll('[data-tap]').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) return; // çizilmemiş
        if (r.height < 48 || r.width < 48) {
          out.push(`${el.getAttribute('aria-label')} → ${Math.round(r.width)}×${Math.round(r.height)}`);
        }
      });
      return out;
    });
    expect(kucikNormalize(kucukler), kucukler.join('\n')).toEqual([]);
  });

  test('her basılabilir öğe ad taşıyor (ekran okuyucu)', async ({ page }) => {
    const adsizlar = await page.evaluate(() => {
      const out: number[] = [];
      document.querySelectorAll('[data-tap]').forEach((el, i) => {
        if (!el.getAttribute('aria-label')?.trim()) out.push(i);
      });
      return out;
    });
    expect(adsizlar).toEqual([]);
  });
});

/** Yardımcı: boş dizi karşılaştırmasını okunur tutar. */
function kucikNormalize(list: string[]): string[] { return list; }
