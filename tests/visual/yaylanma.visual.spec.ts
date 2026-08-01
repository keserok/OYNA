import { test, expect, type Page } from '@playwright/test';
import { hazirla } from './harness';

// ─── Yaylanma motoru — gerçek tarayıcı, gerçek parmak ────────────────────────
//
// `tests/unit/kaydirmaSistemi.test.ts` motorun KARAR mantığını kilitler (hangi
// kaydırıcı hareketi alır, esneme eğrisi nasıl davranır). Ama parmağın kendisi
// — TouchEvent zinciri, tarayıcının kaydırmayı ne zaman devraldığı — jsdom'da
// taklit EDİLEMEZ. O boşluk buradan kapanır.
//
// Motor `document` üzerinde capture ile dinlediği için sayfaya enjekte edilen
// gerçek bir kaydırıcı, uygulamanın kullandığı kod yolunun AYNISINI sürer.
// Böylece test uygulamanın o anki verisine/ekranına bağlı kalmaz.
//
// İki eksen de sınanır: yaylanma yalnız dikey listelerde değil yatay şeritlerde
// de çalışmalı (gün seçici, saha kartları) — kullanıcı kararı: uygulamanın her
// yeri aynı hissetsin.

// Yaylanma `prefers-reduced-motion` altında BİLEREK kurulmaz (hareket
// duyarlılığı olan kullanıcı için rahatsızlık kaynağı). Görsel config 'reduce'
// veriyor, bu yüzden burada kapatılır. Dokunma da şart: motor dokunmatik
// olmayan cihazda hiç kurulmaz (masaüstünde yaylanacak parmak yok).
test.use({
  contextOptions: { reducedMotion: 'no-preference', hasTouch: true, isMobile: true },
  hasTouch: true,
  isMobile: true,
});

interface Sonuc {
  /** Parmak uçtan dışarı çekerken yazılan esneme (CSS `translate`). */
  cekerken: string;
  /** Uçtaki kaydırma konumu — çakılı kalmalı, içerik boşluğa kaymamalı. */
  konum: number;
  /** Parmak kalkıp yaylanma bittikten sonraki esneme — tamamen silinmeli. */
  birakinca: string;
}

/**
 * Enjekte edilen kaydırıcının BAŞ ucundan dışarı doğru çekip bırakır.
 * `eksen: 'v'` dikey liste, `'h'` yatay şerit kurar.
 */
async function ucundanCek(page: Page, eksen: 'v' | 'h'): Promise<Sonuc> {
  return page.evaluate(async (yon) => {
    const dikey = yon === 'v';
    const kutu = document.createElement('div');
    kutu.style.cssText = dikey
      ? 'position:absolute;top:120px;left:0;width:390px;height:300px;overflow-y:auto;overflow-x:hidden;z-index:99999;background:#111'
      : 'position:absolute;top:300px;left:0;width:390px;height:90px;overflow-x:auto;overflow-y:hidden;display:flex;z-index:99999;background:#111';
    for (let i = 0; i < 12; i++) {
      const kart = document.createElement('div');
      kart.style.cssText = dikey
        ? 'height:120px;margin-bottom:8px;background:#39FF14'
        : 'flex:0 0 120px;height:80px;margin-right:8px;background:#39FF14';
      kutu.appendChild(kart);
    }
    document.body.appendChild(kutu);
    // Baş uçtayız — buradan dışarı çekiş esnemeyi tetiklemeli.
    if (dikey) kutu.scrollTop = 0; else kutu.scrollLeft = 0;

    // Sabit eksen: dikeyde X, yatayda Y. Değişen eksende parmağı ilerletiriz.
    const sabit = dikey ? 200 : 345;
    const dokun = (tip: string, d: number) => {
      const t = new Touch({
        identifier: 1,
        target: kutu,
        clientX: dikey ? sabit : d,
        clientY: dikey ? d : sabit,
      });
      kutu.dispatchEvent(
        new TouchEvent(tip, {
          touches: tip === 'touchend' ? [] : [t],
          targetTouches: tip === 'touchend' ? [] : [t],
          changedTouches: [t],
          bubbles: true,
          cancelable: true,
        }),
      );
    };
    const kare = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

    // 1. dokunuş → 2. hareket yönü kilitler → 3. uçtan dışarı çekiş devralır
    // → 4. daha da çekince esneme büyür.
    dokun('touchstart', 200);
    await kare();
    dokun('touchmove', 220);
    await kare();
    dokun('touchmove', 260);
    await kare();
    dokun('touchmove', 330);
    await kare();

    const cekerken = kutu.style.translate;
    const konum = dikey ? kutu.scrollTop : kutu.scrollLeft;

    dokun('touchend', 330);
    await new Promise((r) => setTimeout(r, 600)); // SPRING_MS 380ms + pay
    const birakinca = kutu.style.translate;

    kutu.remove();
    return { cekerken, konum, birakinca };
  }, eksen);
}

test.describe('Uçta yaylanma — iki eksen de aynı hisseder', () => {
  test('dikey listede yaylanır', async ({ page }) => {
    await hazirla(page);
    const s = await ucundanCek(page, 'v');

    // Dikeyde esneme Y eksenine yazılır: "0px 42.66px".
    expect(s.cekerken, `çekerken translate: "${s.cekerken}"`).toMatch(/^0(px)? [\d.]+px$/);
    expect(parseFloat(s.cekerken.split(' ')[1])).toBeGreaterThan(5);
    expect(s.konum, 'içerik uçta çakılı kalmalı').toBe(0);
    expect(s.birakinca, 'bırakınca yerine dönmeli').toBe('');
  });

  test('yatay şeritte de yaylanır', async ({ page }) => {
    await hazirla(page);
    const s = await ucundanCek(page, 'h');

    // Yatayda esneme X eksenine yazılır. Tarayıcı "42.66px 0" yazımını
    // "42.66px" diye sadeleştirir (Y varsayılanı 0).
    expect(s.cekerken, `çekerken translate: "${s.cekerken}"`).toMatch(/^[\d.]+px( 0)?$/);
    expect(parseFloat(s.cekerken)).toBeGreaterThan(5);
    expect(s.konum, 'içerik uçta çakılı kalmalı').toBe(0);
    expect(s.birakinca, 'bırakınca yerine dönmeli').toBe('');
  });
});
