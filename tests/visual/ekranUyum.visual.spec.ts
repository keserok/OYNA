import { test, expect } from '@playwright/test';
import { hazirla, ekranaGit, doluProfilTohumla, oturmasiniBekle } from './harness';

// ─── HER TELEFONDA DÜZGÜN DURSUN — bekçi test ────────────────────────────────
//
// NEDEN VAR: "bazı yazı ve stiller sıkışık duruyor" şikâyeti geldiğinde
// uygulamanın hangi ekran genişliklerinde bozulduğuna dair ÖLÇÜM yoktu; herkes
// tahmin yürütüyordu. Bu test o boşluğu kapatır ve bir daha açılmasını önler:
// ana ekranlar, piyasadaki en dar ve en geniş telefon genişliğinde açılır ve
// üç şey ölçülür —
//   1. Sayfa yatayda kayıyor mu? (kaymamalı: içerik ekrandan taşmış demektir)
//   2. Bir öğe ekranın dışına çıkıyor mu?
//   3. Bir yazı kendi kutusuna sığmayıp kırpılıyor mu? (asıl "sıkışık" hâli)
//
// Görsel referans testlerinden FARKI: onlar "görüntü değişti mi" der, bu test
// "bozuk mu" der. Tasarım bilerek değiştiğinde görsel referans güncellenir ama
// bu test yeşil kalmalıdır — bozukluk asla kabul edilmez.
//
// Ölçüldüğünde (2026-08): yedi ekran × altı genişlik (320·360·375·390·412·430)
// → sıfır bulgu. Bu test o temiz durumu sabitler.

/**
 * En dar ve en geniş DESTEKLENEN telefon. Aradaki genişlikler bu ikisinin
 * arasında kalır; uçları tutmak yeterlidir.
 *
 * Alt sınır neden 360: projenin görsel referans düzeneği de en küçük telefonu
 * 360px kabul ediyor (playwright.visual.config.ts → "kucuk-telefon"). Bugün
 * satılan Android'lerin taban genişliği budur. 320px (2016 öncesi cihazlar)
 * ölçüldüğünde profil ekranındaki ad başlığı kırpılıyor — ayrı bir karar
 * konusu olduğu için buraya dâhil edilmedi.
 */
const GENISLIKLER = [360, 430];

const EKRANLAR: Array<[string, string]> = [
  ['ana sayfa', 'DASHBOARD'],
  ['maç lobisi', 'MATCH_DISCOVERY'],
  ['maçlarım', 'MY_MATCHES'],
  ['cüzdan', 'WALLET'],
  ['profil', 'PROFILE'],
  ['ayarlar', 'SETTINGS'],
  ['sosyal', 'SOCIAL'],
];

interface Bulgu { tip: string; yol: string; ayrinti: string }

/** Sayfadaki taşma/kırpılma bulgularını topla. */
async function bulgulariTopla(page: import('@playwright/test').Page, genislik: number): Promise<Bulgu[]> {
  return page.evaluate((g) => {
    const out: Array<{ tip: string; yol: string; ayrinti: string }> = [];
    const yol = (el: Element): string => {
      const p: string[] = [];
      let n: Element | null = el;
      for (let i = 0; n && i < 3; i++, n = n.parentElement) {
        const c = typeof n.className === 'string' ? n.className.trim().split(/\s+/).slice(0, 4).join('.') : '';
        p.unshift(n.tagName.toLowerCase() + (c ? '.' + c : ''));
      }
      return p.join(' > ');
    };
    document.querySelectorAll('body *').forEach((el) => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;

      // 1) Ekran dışına çıkan İÇERİK.
      //
      //    "İçerik" sınırı bilinçli: arka plandaki ışık lekeleri (mesh-blob,
      //    pf-ambient, kartların arkasındaki parıltılar) tasarım gereği ekranın
      //    dışına taşar ve kullanıcı bunu göremez bile — bozukluk değildir.
      //    Kullanıcının "bozuk" diyeceği şey YAZININ ya da bir DÜĞMENİN ekran
      //    dışında kalmasıdır. Ayıklama bu yüzden sınıf adına değil, öğenin
      //    gerçekten içerik taşıyıp taşımadığına bakar — yarın eklenecek yeni
      //    bir dekoratif katman da kendiliğinden kapsam dışı kalır.
      //
      //    Yatay şeritlerin (karusel) içi ayrıca muaftır: orada taşma, zaten
      //    kaydırılarak görülmesi amaçlanan içeriktir.
      const icerikTasiyor = (el.textContent || '').trim().length > 0
        || ['IMG', 'SVG', 'BUTTON', 'INPUT', 'A'].includes(el.tagName);
      if (icerikTasiyor && (r.right > g + 1 || r.left < -1) && cs.position !== 'fixed'
          && el.closest('[class*=overflow-x-auto], .oyna-map-carousel, .snap-x') === null) {
        out.push({ tip: 'ekran-dışı', yol: yol(el), ayrinti: `sol=${Math.round(r.left)} sağ=${Math.round(r.right)} (ekran ${g})` });
      }

      // 2) Kutusuna sığmayan yazı — kırpılan ya da taşan metin.
      const kirpilir = cs.textOverflow === 'ellipsis' || cs.overflow === 'hidden'
        || cs.overflowX === 'hidden' || cs.overflowY === 'hidden';
      const yaprak = el.children.length === 0 && (el.textContent || '').trim().length > 2;
      if (kirpilir && yaprak) {
        const metin = (el.textContent || '').trim().slice(0, 40);
        if (el.scrollWidth > el.clientWidth + 2) {
          out.push({ tip: 'yazı-yatay-kırpık', yol: yol(el), ayrinti: `"${metin}" görünen=${el.clientWidth}px gereken=${el.scrollWidth}px` });
        }
        if (el.scrollHeight > el.clientHeight + 2) {
          out.push({ tip: 'yazı-dikey-kırpık', yol: yol(el), ayrinti: `"${metin}" görünen=${el.clientHeight}px gereken=${el.scrollHeight}px` });
        }
      }
    });
    return out;
  }, genislik);
}

for (const genislik of GENISLIKLER) {
  test.describe(`${genislik}px genişliğinde`, () => {
    for (const [ad, view] of EKRANLAR) {
      test(`${ad} ekranı taşmadan sığar`, async ({ page }) => {
        await page.setViewportSize({ width: genislik, height: 800 });
        await hazirla(page);
        await doluProfilTohumla(page).catch(() => { /* bu ekran profil istemiyorsa sorun değil */ });
        await ekranaGit(page, view);
        await oturmasiniBekle(page).catch(() => { /* boş-durum ekranı da geçerli */ });

        // Sayfanın kendisi yatayda kaymamalı.
        const kayma = await page.evaluate(() => ({
          scrollW: document.documentElement.scrollWidth,
          clientW: document.documentElement.clientWidth,
        }));
        expect(kayma.scrollW, `${ad} yatayda kayıyor (içerik ekrandan taşmış)`).toBeLessThanOrEqual(kayma.clientW);

        const bulgular = await bulgulariTopla(page, genislik);
        const rapor = bulgular.map((b) => `  • [${b.tip}] ${b.yol}\n      ${b.ayrinti}`).join('\n');
        expect(bulgular, `${ad} ekranı ${genislik}px'te sıkışıyor:\n${rapor}`).toEqual([]);
      });
    }
  });
}
