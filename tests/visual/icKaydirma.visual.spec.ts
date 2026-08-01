import { test, expect, type Page } from '@playwright/test';
import { hazirla, ekranaGit, oturmasiniBekle } from './harness';

// ─── İÇ KAYDIRICI regresyonu ─────────────────────────────────────────────────
//
// ŞİKÂYET: "Sahalar ekranındaki kaydırma çalışmıyor."
//
// SEBEP bir yerleşim inceliğiydi. Bu ekranlar dikey bir yığındır: üstte sabit
// başlık, altta kendi içinde kayan liste (`flex-1` + `overflow-y-auto`). Bir
// çocuğun "kalan alanı doldur, taşarsan kaydır" davranışı ancak ANA KUTUNUN
// yüksekliği BELLİ olduğunda çalışır. Ekranın kökü `min-h-screen` ile yalnız
// bir TABAN veriyordu, yüksekliği serbest bırakıyordu: kutu içerikle birlikte
// uzuyor, `flex-1` sınırlanacak bir alan bulamıyor ve listenin kendi kaydırması
// HİÇ DEVREYE GİRMİYORDU. Kök `h-full` yapılınca sınır netleşti.
//
// BU TESTİN SINAVI (asıl mesele budur):
//   Ekrana yapay olarak ÇOK uzun bir blok eklenir. Doğru kurulmuş bir iç
//   kaydırıcı bu durumda BOYUNU KORUR ve kaydırılabilir hâle gelir. Bozuk
//   kurulumda ise kaydırıcının kendisi uzar (kaydırma üretmez) ve taşma dışarı
//   çıkar. Sadece "kaydırıcı var mı" diye bakmak yetmez — bozuk hâlde de vardır.

interface Olcum {
  kokSinif: string;
  kokYuk: number;
  kapYuk: number;
  /** Yük altında: kaydırıcının görünen boyu (sabit kalmalı). */
  gorunen: number;
  /** Yük altında: kaydırılabilir mesafe (0'dan büyük olmalı). */
  kaydirilabilir: number;
  /** Yük altında: dış sayfanın kaydırması (0 kalmalı — taşma dışarı çıkmamalı). */
  disKaydirma: number;
}

async function yukAltindaOlc(page: Page, kaydiriciSecici: string): Promise<Olcum> {
  return page.evaluate((secici) => {
    const sc = document.querySelector('[data-oyna-view-scroller]');
    if (!(sc instanceof HTMLElement)) throw new Error('Görünüm kaydırıcısı yok');
    const kok = sc.firstElementChild;
    if (!(kok instanceof HTMLElement)) throw new Error('Ekran kökü yok');
    const ic = kok.querySelector(secici);
    if (!(ic instanceof HTMLElement)) throw new Error(`İç kaydırıcı bulunamadı: ${secici}`);

    const dolgu = document.createElement('div');
    dolgu.style.height = '3000px';
    dolgu.setAttribute('data-test-dolgu', '');
    ic.appendChild(dolgu);
    void ic.offsetHeight; // yerleşimi zorla

    const sonuc = {
      kokSinif: (kok.className || '').slice(0, 60),
      kokYuk: kok.offsetHeight,
      kapYuk: sc.clientHeight,
      gorunen: ic.clientHeight,
      kaydirilabilir: ic.scrollHeight - ic.clientHeight,
      disKaydirma: sc.scrollHeight - sc.clientHeight,
    };
    dolgu.remove();
    return sonuc;
  }, kaydiriciSecici);
}

interface Senaryo {
  gorunum: string;
  capa: RegExp;
  /** Ekranın kendi iç kaydırıcısı. */
  secici: string;
}

const SENARYOLAR: Senaryo[] = [
  { gorunum: 'PITCH_DISCOVERY', capa: /TESİS BULUNDU/i, secici: 'main' },
];

test.describe('İç kaydırıcı — yük altında boyunu korumalı', () => {
  for (const s of SENARYOLAR) {
    test(s.gorunum, async ({ page }) => {
      await hazirla(page);
      await ekranaGit(page, s.gorunum);
      await expect(page.getByText(s.capa).first()).toBeVisible({ timeout: 20_000 });
      await oturmasiniBekle(page);

      const m = await yukAltindaOlc(page, s.secici);

      // 1) Ekranın kökü kabına TAM oturmalı (yükseklik belirsiz kalmamalı).
      expect(
        Math.abs(m.kokYuk - m.kapYuk),
        `"${s.gorunum}" kökü kabına oturmuyor: kök ${m.kokYuk}px, kap ${m.kapYuk}px. ` +
        `Kök sınıfı: "${m.kokSinif}". Yükseklik sabit olmalı (h-full), taban değil (min-h-screen).`,
      ).toBeLessThanOrEqual(1);

      // 2) ASIL SINAV: yük altında kaydırıcı boyunu korumalı ve kaydırma üretmeli.
      expect(
        m.kaydirilabilir,
        `"${s.gorunum}" içindeki "${s.secici}" yük altında kaydırma ÜRETMEDİ ` +
        `(görünen ${m.gorunen}px, kaydırılabilir ${m.kaydirilabilir}px). ` +
        'Kaydırıcı sınırlanmamış demektir — ekran parmakla kaydırılamaz.',
      ).toBeGreaterThan(1000);

      // 3) Taşma dışarı çıkmamalı — sayfanın kendisi uzamamalı.
      expect(
        m.disKaydirma,
        `"${s.gorunum}" yük altında SAYFAYI uzattı (${m.disKaydirma}px). ` +
        'İç kaydırıcı taşmayı kendi içinde tutmalı.',
      ).toBeLessThanOrEqual(1);
    });
  }
});
