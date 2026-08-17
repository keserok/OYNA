/**
 * YERLEŞİM VE KLAVYE KUSURLARI (denetim B2, B3, B5, B6)
 *
 * Dört kusur da "uygulama çöküyor" cinsinden değil, "kullanıcı yapmak
 * istediğini YAPAMIYOR" cinsindendi. Hepsi tek tek geri gelebilecek türden
 * (bir CSS seçicisini daraltmak, bir sınıf adını değiştirmek, bir sayıyı
 * elle yazmak yeter) — bu yüzden kilitleniyorlar.
 *
 * B2 · iOS, yazı boyutu 16px'in ALTINDA olan alana odaklanınca sayfayı
 *      kendiliğinden yakınlaştırır. Kural yalnız `type` YAZILMIŞ alanları
 *      sayıyordu; kart numarası alanının `type`ı yok ve yazısı 15px →
 *      ödeme ekranı odakta zıplıyor, "ÖDE" düğmesi ekrandan kayıyordu.
 * B3 · Onay kutusunun görünmez dokunma alanı 44px'ti; projenin (ve
 *      Google'ın) standardı 48px. Sınıf adı da ölçüyü içeriyordu.
 * B5 · Uyarı balonu `bottom: 24px` ile çivilenmişti → klavyenin ve alt
 *      menünün arkasında kalıyor, kullanıcı "X gerekli" uyarısını hiç
 *      görmüyordu.
 * B6 · Ödeme ekranının alt boşluğu 160px'e çivilenmişti → alt çubuk
 *      büyüyünce "Mesafeli satış ve iptal/iade koşulları" bağlantısı
 *      çubuğun altında kalıyor, mevzuatın şart koştuğu erişim kayboluyordu.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { render, cleanup } from '@testing-library/react';
import { odemeGovdeAltBoslugu, ODEME_CUBUK_PAYI } from '../../views/PaymentScreen';
import { Toast } from '../../components/common/Toast';

const oku = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

const css = oku('index.css');

/**
 * Bir CSS bildiriminin ÖNÜNDEKİ seçici listesini çıkarır ve tek tek seçicilere
 * böler. Metinde `.toContain('input:not([type])')` aramak yerine gerçek
 * seçiciyi çıkarıp jsdom'a "bu öğe bu kurala giriyor mu?" diye soruyoruz —
 * böylece seçici başka bir şekilde yazılsa da (sıra değişse, `:not()` zinciri
 * kullanılsa) test DAVRANIŞI ölçer, yazımı değil.
 */
const seciciler = (bildirim: RegExp): string[] => {
  const m = css.match(bildirim);
  expect(m, `Bildirim index.css içinde bulunamadı: ${bildirim}`).not.toBeNull();
  return m![1]
    .split(',')
    .map(s => s.replace(/\/\*[\s\S]*?\*\//g, '').trim())
    .filter(Boolean);
};

/** Verilen öğe, seçici listesindeki kurallardan en az birine giriyor mu? */
const kapsiyorMu = (liste: string[], el: Element) => liste.some(s => el.matches(s));

const alanYap = (nitelikler: Record<string, string>): HTMLElement => {
  const etiket = nitelikler.__etiket ?? 'input';
  const el = document.createElement(etiket);
  for (const [k, v] of Object.entries(nitelikler)) {
    if (k !== '__etiket') el.setAttribute(k, v);
  }
  return el;
};

// ─────────────────────────────────────────────────────────────────────────────
describe('B2 · iOS odak yakınlaştırması: 16px kuralı type YAZILMAYAN alanları da kapsar', () => {
  // Mobil kural: `font-size: 16px !important` bildiriminin seçici listesi.
  const mobil = seciciler(/([^{}]+)\{\s*font-size:\s*16px\s*!important;\s*\}/);
  // Masaüstü telefon çerçevesi: `#root ...` önekli, !important'sız ikizi.
  const cerceve = seciciler(/([^{}]+)\{\s*font-size:\s*16px;\s*\}/);

  it('type niteliği HİÇ yazılmamış input kurala girer (asıl kusur)', () => {
    // Kart numarası alanı böyle yazılmıştır: type yok, yazı 15px.
    const kartNo = alanYap({ inputmode: 'numeric', autocomplete: 'cc-number' });
    expect(kapsiyorMu(mobil, kartNo)).toBe(true);
    expect(kapsiyorMu(cerceve, kartNo.cloneNode() as Element)).toBe(false); // #root gerekli
  });

  it('telefon çerçevesindeki (#root) ikiz kural da type\u2019sız alanı kapsar', () => {
    const kok = document.createElement('div');
    kok.id = 'root';
    const kartNo = alanYap({ inputmode: 'numeric' });
    kok.appendChild(kartNo);
    expect(kapsiyorMu(cerceve, kartNo)).toBe(true);
  });

  it('metin girilen diğer alanlar da kapsamda kalır', () => {
    for (const nit of [
      { type: 'text' }, { type: 'number' }, { type: 'email' }, { type: 'tel' },
      { type: 'search' }, { type: 'password' },
      { __etiket: 'textarea' }, { __etiket: 'select' },
    ] as Record<string, string>[]) {
      expect(kapsiyorMu(mobil, alanYap(nit)), JSON.stringify(nit)).toBe(true);
    }
  });

  it('metin GİRİLMEYEN denetimler kapsam DIŞI kalır (tasarım bozulmasın)', () => {
    // Bunlar zaten yakınlaştırma tetiklemez; 16px yazmak yalnız görünen
    // ölçülerini bozardı. Kural `input, textarea, select` diye genişletilirse
    // bu test kırılır — kasıt buydu.
    for (const t of ['checkbox', 'radio', 'range', 'file', 'button', 'submit', 'date', 'time']) {
      expect(kapsiyorMu(mobil, alanYap({ type: t })), t).toBe(false);
    }
  });

  it('kural yalnız dar/dokunmatik ekranda geçerlidir (media sorgusunun içinde)', () => {
    const i = css.indexOf('font-size: 16px !important');
    const oncesi = css.slice(0, i);
    // Bildirimden hemen önceki en yakın media sorgusu max-width kısıtlı olmalı.
    expect(oncesi.lastIndexOf('@media (max-width: 768px)'))
      .toBeGreaterThan(oncesi.lastIndexOf('@media') - 1);
  });

  it('kusurun kaynağı hâlâ oradadır: kart numarası alanı type YAZMADAN, 16px ALTINDA', () => {
    // Bu iddia düşerse (alana type eklendiyse) kural yine de gerekli kalır —
    // kaynakta type\u2019sız onlarca alan var. Testin amacı NEDEN\u2019i canlı tutmak.
    const kart = oku('components/payment/AddCardScreen.tsx');
    const acilis = kart.slice(kart.indexOf('<input'), kart.indexOf('/>', kart.indexOf('<input')));
    expect(acilis).not.toContain('type=');
    expect(acilis).toContain('text-[0.9375rem]'); // 15px < 16px → iOS yakınlaştırır
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('B3 · onay kutusu dokunma hedefi projenin standardıyla (48px) hizalı', () => {
  const kural = css.match(/\.dokunma-hedefi::before\s*\{([\s\S]*?)\}/);

  it('görünmez dokunma katmanı --oy-tap-min okur, sabit sayı yazmaz', () => {
    expect(kural, '.dokunma-hedefi::before bulunamadı').not.toBeNull();
    expect(kural![1]).toContain('width: var(--oy-tap-min)');
    expect(kural![1]).toContain('height: var(--oy-tap-min)');
    // Ölçü elle yazılırsa iki standart oluşur; 44 geri gelmesin.
    expect(kural![1]).not.toMatch(/\b44px\b/);
  });

  it('--oy-tap-min 48px (Google 48dp; Apple 44pt bunun içinde kalır)', () => {
    expect(css).toMatch(/--oy-tap-min:\s*48px/);
  });

  it('sınıf adı ölçü içermez ve eski .hit-44 hiçbir yerde kalmaz', () => {
    for (const dosya of ['index.css', 'views/AuthScreen.tsx', 'views/ServiceApplication.tsx']) {
      expect(oku(dosya), dosya).not.toContain('hit-44');
    }
  });

  it('iki çağrı yeri de yeni sınıfı kullanır', () => {
    expect(oku('views/AuthScreen.tsx')).toContain('className="dokunma-hedefi"');
    expect(oku('views/ServiceApplication.tsx')).toContain('className="dokunma-hedefi mt-0.5 w-5 h-5');
  });

  it('GÖRÜNEN kutu 20px kalır — büyüyen yalnız dokunma alanıdır', () => {
    // AuthScreen kutusu satır içi stille 20×20; ServiceApplication w-5 h-5 (=20px).
    expect(oku('views/AuthScreen.tsx')).toContain('width: 20, height: 20');
    expect(oku('views/ServiceApplication.tsx')).toContain('dokunma-hedefi mt-0.5 w-5 h-5');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('B5 · uyarı balonu klavyenin ve alt menünün ÖNÜNDE durur', () => {
  const toast = oku('components/common/Toast.tsx');
  const taban = css.match(/\.uyari-balonu\s*\{([\s\S]*?)\}/);
  const menuliKural = css.match(/body:has\(nav\[aria-label="Ana Gezinti"\]\)\s*\.uyari-balonu\s*\{([\s\S]*?)\}/);

  it('balon konumu artık sabit değil, hesaplanan bir değerdir', () => {
    // Yalnız gerçekten uygulanan sınıf listesine bakılır; açıklama satırlarında
    // geçen eski `bottom-6` kod sanılırsa test yanlış yerden kırılır.
    const sinifSatiri = toast.split('\n').find(s => s.includes('className={`uyari-balonu'));
    expect(sinifSatiri, 'balonun sınıf listesi bulunamadı').toBeTruthy();
    // Sabit `bottom-6` geri gelirse Tailwind yardımcı sınıfı konumu yine çiviler.
    expect(sinifSatiri!).not.toMatch(/\bbottom-\d/);
  });

  it('taban kural güvenli alanı VE klavye telafisini toplar', () => {
    expect(taban, '.uyari-balonu kuralı bulunamadı').not.toBeNull();
    expect(taban![1]).toContain('var(--safe-bottom');
    // --kb-height "web katmanının telafi etmesi gereken miktar"dır; kabuk
    // zaten küçüldüyse 0'dır, bu yüzden eklemek çift telafi yaratmaz.
    expect(taban![1]).toContain('var(--kb-height');
  });

  it('iOS resize:Body tuzağı: pencereye göre ölçülen örtüşme de hesaba katılır', () => {
    // iOS'ta body kısalır → --kb-height DOĞRU biçimde 0 olur; ama balon
    // `position: fixed`, yani pencereye yerleşir ve klavyenin altında kalırdı.
    // İki ölçünün BÜYÜĞÜ alınır — toplanırsa çift telafi olurdu.
    expect(taban![1]).toContain('max(var(--kb-height, 0px), var(--balon-klavye, 0px))');
    expect(menuliKural![1]).toContain('max(var(--kb-height, 0px), var(--balon-klavye, 0px))');
    // Ölçen taraf: balonun kendisi.
    expect(toast).toContain("'--balon-klavye'");
    expect(toast).toContain('window.innerHeight - vv.height - vv.offsetTop');
  });

  it('alt menü çizildiğinde menü yüksekliği de eklenir', () => {
    expect(menuliKural, 'alt menü farkındalı kural bulunamadı').not.toBeNull();
    expect(menuliKural![1]).toContain('var(--oy-nav-h)');
    expect(menuliKural![1]).toContain('var(--safe-bottom');
    expect(menuliKural![1]).toContain('var(--kb-height');
  });

  it('alt menü yüksekliği TEK yerde tanımlıdır (pb-safe-nav ile ayrışamaz)', () => {
    expect(css).toMatch(/--oy-nav-h:\s*7\.5rem/);
    expect(css).toContain('.pb-safe-nav { padding-bottom: calc(var(--safe-bottom) + var(--oy-nav-h)); }');
  });

  it('alt menü seçicisi gerçek nav ile eşleşir (App.tsx + BottomNav.tsx)', () => {
    // Seçici DOM'dan kopmuşsa kural sessizce ölür — bu yüzden kaynağa bakıyoruz.
    expect(oku('components/BottomNav.tsx')).toContain('aria-label="Ana Gezinti"');
    const nav = document.createElement('nav');
    nav.setAttribute('aria-label', 'Ana Gezinti');
    expect(nav.matches('nav[aria-label="Ana Gezinti"]')).toBe(true);
  });

  it('klavye açıkken ölçülen örtüşme balona GERÇEKTEN yazılır', () => {
    // Klavyeli telefon taklidi: pencere 844, görünür alan 544 → 300px örtülü.
    // (iOS `resize: Body` senaryosunda --kb-height 0 kalır; balonu kurtaran
    // tek şey bu ölçümdür.)
    const gercekVV = (window as any).visualViewport;
    Object.defineProperty(window, 'innerHeight', { value: 844, configurable: true });
    Object.defineProperty(window, 'visualViewport', {
      value: { height: 544, offsetTop: 0, addEventListener: () => {}, removeEventListener: () => {} },
      configurable: true,
    });
    try {
      const { container } = render(createElement(Toast, { message: 'Saha adı gerekli' }));
      const balon = container.firstElementChild as HTMLElement;
      expect(balon.className).toContain('uyari-balonu');
      // Değişken stile yazılmazsa (ör. animasyon kitaplığı özel özelliği
      // düşürürse) kural 0px okur ve balon yine klavyenin altında kalır.
      expect(balon.style.getPropertyValue('--balon-klavye')).toBe('300px');
    } finally {
      cleanup();
      Object.defineProperty(window, 'visualViewport', { value: gercekVV, configurable: true });
    }
  });

  it('üstte açılan tesis balonları çentik payını zaten okur', () => {
    // Alt balon düzeltilirken üsttekinin unutulmadığının kaydı.
    expect(oku('views/owner/components/useOwnerToast.tsx')).toContain("calc(var(--safe-top)");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('B6 · ödeme ekranında sözleşme bağlantısı alt çubuğun altında kalmaz', () => {
  const ps = oku('views/PaymentScreen.tsx');

  it('ölçüm yokken yedek boşluk güvenli alanı da içerir (sıfıra düşmez)', () => {
    expect(odemeGovdeAltBoslugu(null)).toBe('calc(var(--safe-bottom, 0px) + 160px)');
    // Ölçüm anlamsızsa (0 / NaN) yine yedeğe düşülür — bağlantı asla çubuğun
    // altında kalmaz.
    expect(odemeGovdeAltBoslugu(0)).toContain('--safe-bottom');
    expect(odemeGovdeAltBoslugu(Number.NaN)).toContain('--safe-bottom');
  });

  it('çubuk büyüdükçe boşluk büyür — 160px\u2019e çivilenmez', () => {
    expect(odemeGovdeAltBoslugu(140)).toBe(`${140 + ODEME_CUBUK_PAYI}px`);
    // Asıl kusur: çubuk 160px\u2019i aştığında eski kod bağlantıyı gizliyordu.
    const buyuk = odemeGovdeAltBoslugu(196);
    expect(parseInt(buyuk, 10)).toBeGreaterThan(160);
    expect(parseInt(odemeGovdeAltBoslugu(240), 10))
      .toBeGreaterThan(parseInt(buyuk, 10));
  });

  it('gövde sabit pb-40 yerine ölçülen boşluğu kullanır', () => {
    // Ödeme özetini taşıyan kaydırıcı: sınıf listesinde sabit alt boşluk KALMAZ.
    const govde = ps.split('\n').find(s => s.includes('<main') && s.includes('space-y-[18px]'));
    expect(govde, 'ödeme gövdesi <main> bulunamadı').toBeTruthy();
    expect(govde!).not.toMatch(/\bpb-\d/);
    expect(govde!).toContain('style={{ paddingBottom: govdeAltBosluk }}');
    expect(ps).toContain('odemeGovdeAltBoslugu(footerH)');
  });

  it('çubuk yüksekliği GERÇEKTEN ölçülür (tahmin edilmez)', () => {
    expect(ps).toContain('new ResizeObserver');
    expect(ps).toContain('ref={footerRef}');
  });

  it('sözleşme bağlantısı hâlâ ödeme ÖNCESİ ekranda durur', () => {
    expect(ps).toContain('Mesafeli satış ve iptal/iade koşulları');
  });
});
