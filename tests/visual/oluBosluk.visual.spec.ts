import { test, expect, type Page } from '@playwright/test';
import { hazirla, ekranaGit, oturmasiniBekle } from './harness';

// ─── ÖLÜ BANT (boşluğa kayan ekran) regresyonu ───────────────────────────────
//
// ŞİKÂYET: bazı ekranlarda parmağını sürükleyince altta İÇERİĞİ OLMAYAN bir
// boşluk açılıyordu.
//
// SEBEP yerleşim değil ÖLÇÜ birimiydi: ekranlar kendi yüksekliğini "telefon
// ekranı kadar" (100vh) diye istiyordu. Oysa içinde yaşadıkları kaydırıcı
// ondan KISA — alt menü ve güvenli alan (çentik / ana ekran çubuğu) payı
// kaydırıcının DOLGUSUNA yazılı. Ekran kabına sığmıyor; aradaki fark
// kaydırılabilir ama bomboş bir bant olarak kalıyordu.
//
// ÇENTİK TAKLİDİ ŞART: masaüstü Chromium'da `env(safe-area-inset-*)` sıfırdır
// ve `100vh` tam olarak kabın yüksekliğine eşit çıkar — hata bu ortamda
// KENDİLİĞİNDEN GÖRÜNMEZ. Gerçek iPhone değerleri enjekte edilmeden bu dosya
// hatayı yakalayamaz. Ölçüldü: taklit yokken 0px; taklitle 9 ekranda tam 50px
// (= 34px güvenli alan + 16px dolgu).
//
// Ekran görüntüsü testleri (screens.visual.spec.ts) yalnız GÖRÜNEN alanı
// karşılaştırır; katlanan yerdeki ölü bandı göremez — bu dosya o boşluğu kapatır.
//
// ÖLÇÜT — kuralın kendisi sınanır (elle ekran listesi tutulmaz):
//   Kaydırıcının içindeki HİÇBİR öğenin "en az şu kadar uzun ol" (min-height)
//   tabanı, kabın iç yüksekliğinden büyük olamaz. min-height bir TABANDIR:
//   içerik ne kadar kısa olursa olsun öğeyi o boya zorlar. Kaptan büyük bir
//   taban, tanımı gereği içeriğin gerektirmediği kaydırma üretir.
//
//   Neden geometri değil de bu: esnek (flex) düzenli köklerde çocuklar gerilen
//   boşluğu doldurur, bu yüzden "içerik kısa" olduğu dışarıdan ANLAŞILMAZ —
//   ölçüldü: geometrik ölçüt 9 bozuk ekranın yalnız 3'ünü yakalıyordu. Taban
//   kontrolü dokuzunu da yakalar ve doğru kurulduğunda tam sıfır verir.
//
//   Akış dışı (position:fixed) öğeler hariç: modal/alt sayfa katmanları
//   kaydırıcının yüksekliğine hiç katılmaz, tam ekran olmaları doğrudur.

/** Gerçek iPhone güvenli alan değerleri (14 Pro sınıfı). */
const CENTIK_ALT = 34;
const CENTIK_UST = 47;

/** Çentikli telefonu taklit et — hata ancak bu koşulda görünür. */
async function centikliTelefon(page: Page) {
  await page.addStyleTag({
    content: `:root { --safe-bottom: ${CENTIK_ALT}px; --safe-top: ${CENTIK_UST}px; }`,
  });
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => r())));
}

interface Ihlal {
  /** Kaptan ne kadar taşıyor (px). */
  tasma: number;
  /** Öğenin "en az şu kadar" tabanı. */
  taban: number;
  sinif: string;
}

interface Olcum {
  kapIc: number;
  ihlaller: Ihlal[];
}

async function olc(page: Page): Promise<Olcum> {
  return page.evaluate(() => {
    const sc = document.querySelector('[data-oyna-view-scroller]');
    if (!(sc instanceof HTMLElement)) throw new Error('Görünüm kaydırıcısı bulunamadı');
    const kok = sc.firstElementChild;
    if (!(kok instanceof HTMLElement) || kok.offsetHeight === 0) {
      throw new Error('Ekran kökü çizilmemiş');
    }

    const scCs = getComputedStyle(sc);
    const sayi = (v: string) => parseFloat(v) || 0;

    // Kabın İÇ yüksekliği: kaydırıcının görünen yüksekliğinden dolguları düş.
    // Ekranlar tam olarak bu boya sığmalı.
    const kapIc = sc.clientHeight - sayi(scCs.paddingTop) - sayi(scCs.paddingBottom);

    const ihlaller: Ihlal[] = [];
    const bak = (el: HTMLElement) => {
      const cs = getComputedStyle(el);
      // Akış dışı katmanlar kaydırıcının yüksekliğine katılmaz.
      if (cs.position === 'fixed') return;
      if (cs.display === 'none') return;
      const taban = sayi(cs.minHeight);
      if (taban > kapIc + 1) {
        ihlaller.push({
          tasma: Math.round(taban - kapIc),
          taban: Math.round(taban),
          sinif: (el.className || el.tagName).slice(0, 70),
        });
      }
      for (const c of Array.from(el.children)) if (c instanceof HTMLElement) bak(c);
    };
    bak(kok);

    return { kapIc, ihlaller };
  });
}

// Kaydırıcının doğrudan içinde yaşayan ekranlar. Tohumlama gerektirmeyenler
// seçildi: boş-durum hâlleri de kabına sığmak zorunda (hata asıl orada çıkar).
// WALLET listeden çıkarıldı: cüzdan lansmanda kapalı — rota ana ekrana düşer.
const GORUNUMLER = [
  'LEGAL', 'SOCIAL', 'FRIEND_ADD', 'MESSAGES', 'QR_SCANNER', 'LOCATION_PROMPT',
  'ROLE_SELECTION', 'GUARDIAN_CHILD', 'MATCH_TICKET', 'SETTINGS',
  'DASHBOARD', 'MY_MATCHES', 'MATCH_DISCOVERY', 'PITCH_DISCOVERY', 'PROFILE',
  'MATCH_CREATE', 'STUDIO',
];

test.describe('Ölü bant — ekranlar kabına sığmalı (çentikli telefon)', () => {
  for (const gorunum of GORUNUMLER) {
    test(gorunum, async ({ page }) => {
      await hazirla(page);
      await ekranaGit(page, gorunum);
      await oturmasiniBekle(page);
      await centikliTelefon(page);

      const m = await olc(page);

      const rapor = m.ihlaller
        .map((i) => `  • ${i.tasma}px taşma (taban ${i.taban}px) — "${i.sinif}"`)
        .join('\n');
      expect(
        m.ihlaller,
        `"${gorunum}" ekranında kabına sığmayan öğe(ler) var. Kabın içi ${m.kapIc}px:\n${rapor}\n` +
        '"Tam ekran" ölçüsü viewport\'a (100vh) değil kaba (%100) bağlanmalı.',
      ).toEqual([]);
    });
  }
});
