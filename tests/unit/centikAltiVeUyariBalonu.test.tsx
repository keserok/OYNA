/**
 * ÇENTİK ALTINDA KALAN YÜZEYLER + GÖRÜNMEYEN UYARI BALONLARI
 * (mağaza gönderimi öncesi son tarama, 2026-08-17)
 *
 * Dördü de "uygulama çöküyor" cinsinden DEĞİL, "kullanıcı yapmak istediğini
 * yapamıyor / gerçeği göremiyor" cinsindendi:
 *
 *  1) Tam ekran katmanların (Stüdyo · Taktik Paylaş, Bildirimler · Davet)
 *     kapat/geri düğmesi Dynamic Island'lı iPhone'da durum çubuğunun ALTINDA
 *     kalıyordu → pencere kapatılamıyordu.
 *  2) Stüdyo kendi uyarı balonunu `bottom-32` ile çiviliyordu; ortak
 *     `.uyari-balonu` düzeltmesi oraya ulaşmamıştı. Dosya kaydetme
 *     dürüstleştirmesinin "Görsel bu cihazda kaydedilemedi." mesajı tam olarak
 *     bu balondan çıkıyor: görünmeyen dürüst hata = kullanıcı düğmeyi bozuk sanır.
 *  3) Balonu alt menünün üstüne kaldıran kural yalnız OYUNCU menüsünü tanıyordu;
 *     kaleci/hakem ve işletme menüleri etiketsizdi → geri bildirim menünün
 *     arkasında kalıyordu.
 *  4) Çevrimdışı (uçak modu) kırmızı şeridinin telafisi yalnız SINIF tabanlı
 *     başlıklara uygulanıyordu; satır içi `pt-[calc(var(--safe-top)+…)]` yazan
 *     başlıklarda geri düğmesinin üstü şeridin altında kalıyordu.
 *
 * TEST NASIL ÖLÇÜYOR: metinde sınıf adı aramakla yetinmiyor — index.css'teki
 * gerçek kuralları ayrıştırıp jsdom'a "bu öğe bu kurala giriyor mu?" diye
 * soruyor, sonra kuralın değerini SEÇİLEN CİHAZ İÇİN piksele çeviriyor
 * (Dynamic Island = 59px güvenli alan). Yani "başlık çentiğin altında mı"
 * sorusunu sayıyla cevaplıyor. Düzeltme geri alınırsa sayı küçülür ve test kırılır.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { render, screen } from '@testing-library/react';
import { OwnerBottomNav } from '../../views/owner/components/OwnerBottomNav';

const oku = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

const cssHam = oku('index.css');
/** Yorumlar ölçüme karışmasın (açıklamalarda örnek CSS geçiyor). */
const css = cssHam.replace(/\/\*[\s\S]*?\*\//g, '');

// ─── index.css'i kurallara ayır ──────────────────────────────────────────────
// Yalnız EN ÜST düzey kurallar: @media/@layer/@theme blokları atlanır, çünkü
// buradaki güvenli alan yardımcıları bilinçli olarak katmansız yazılmıştır
// (katmansız kural Tailwind yardımcılarını ezer — index.css'teki not).
type Kural = { secici: string; govde: string };
const kurallariAyristir = (metin: string): Kural[] => {
  const out: Kural[] = [];
  let i = 0;
  while (i < metin.length) {
    const acilis = metin.indexOf('{', i);
    if (acilis === -1) break;
    const onsoz = metin.slice(i, acilis).trim();
    // Blok sonunu dengeli parantezle bul.
    let derinlik = 0, j = acilis;
    for (; j < metin.length; j++) {
      if (metin[j] === '{') derinlik++;
      else if (metin[j] === '}') { derinlik--; if (derinlik === 0) break; }
    }
    if (!onsoz.startsWith('@')) out.push({ secici: onsoz, govde: metin.slice(acilis + 1, j) });
    i = j + 1;
  }
  return out;
};
const KURALLAR = kurallariAyristir(css);

// ─── Küçük CSS uzunluk motoru ────────────────────────────────────────────────
// calc() / max() / min() / var() / rem / px içeren bir ifadeyi piksele çevirir.
const REM = 16;
const varCoz = (ifade: string, degerler: Record<string, string>): string => {
  let s = ifade, tur = 0;
  while (s.includes('var(') && tur++ < 40) {
    s = s.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*?))?\s*\)/,
      (_m, ad: string, yedek?: string) => degerler[ad] ?? yedek ?? '0px');
  }
  return s;
};
const piksel = (ifade: string, degerler: Record<string, string> = {}): number => {
  let s = varCoz(ifade, degerler).trim()
    .replace(/env\([^()]*\)/g, '0px')            // env() jsdom'da yok; cihaz değeri --safe-* ile verilir
    .replace(/\bcalc\(/g, '(')
    .replace(/\bmax\(/g, 'M.max(')
    .replace(/\bmin\(/g, 'M.min(')
    .replace(/(-?[\d.]+)rem\b/g, (_m, n: string) => String(parseFloat(n) * REM))
    .replace(/(-?[\d.]+)px\b/g, (_m, n: string) => n);
  const kalan = s.replace(/M\.(max|min)/g, '');
  if (/[a-zA-Z]/.test(kalan)) throw new Error(`Çözülemeyen CSS ifadesi: ${ifade} → ${s}`);
  // eslint-disable-next-line no-new-func
  return Function('M', `"use strict";return (${s});`)(Math);
};

// Şerit yüksekliği ve menü yüksekliği DOSYADAN okunur — sayı elle yazılırsa
// index.css değişince test sessizce yanlış ölçer.
const SERIT_IFADESI = css.match(/body\.offline-banner-on\s*\{\s*--offline-banner-h:\s*([^;]+);/)![1];
const NAV_IFADESI = css.match(/--oy-nav-h:\s*([^;]+);/)![1];

type Ortam = {
  /** Cihazın üst güvenli alanı: Dynamic Island 59px, çentiksiz Android 0px. */
  safeTop?: number;
  safeBottom?: number;
  /** Klavyenin örttüğü yükseklik (services/keyboardManager.ts · --kb-height). */
  kb?: number;
  /** Uçak modu: kırmızı çevrimdışı şeridi açık. */
  offline?: boolean;
  /** DOM'da alt menü var mı — varsa bu erişilebilirlik etiketiyle. */
  nav?: string | null;
};

const degiskenler = (o: Ortam): Record<string, string> => {
  const temel = {
    '--safe-top': `${o.safeTop ?? 0}px`,
    '--safe-bottom': `${o.safeBottom ?? 0}px`,
    '--kb-height': `${o.kb ?? 0}px`,
    '--oy-nav-h': NAV_IFADESI,
  };
  return { ...temel, '--offline-banner-h': o.offline ? `${piksel(SERIT_IFADESI, temel)}px` : '0px' };
};
const seritYuksekligi = (safeTop: number) => piksel(SERIT_IFADESI, { '--safe-top': `${safeTop}px` });

/** Kaynaktaki `className="…"` metnini sınıf jetonlarına böler (şablon değişkenleri elenir). */
const jetonlar = (sinifListesi: string): string[] =>
  sinifListesi.split(/[\s`'"{}$?:]+/).filter(t => /^[a-zA-Z][\w./[\]()<>,+%-]*$/.test(t));

/** Tailwind ölçeği: `pt-6` → 1.5rem, `bottom-32` → 8rem, `pt-[ifade]` → ifade. */
const tailwindDegeri = (jeton: string, onek: string): string | null => {
  if (!jeton.startsWith(onek + '-')) return null;
  const kuyruk = jeton.slice(onek.length + 1);
  if (kuyruk.startsWith('[') && kuyruk.endsWith(']')) return kuyruk.slice(1, -1);
  if (/^\d+(\.\d+)?$/.test(kuyruk)) return `${parseFloat(kuyruk) * 0.25}rem`;
  return null;
};

/**
 * Bir öğenin GERÇEKTE aldığı değeri hesaplar.
 * Önce index.css'in katmansız kuralları (Tailwind'i ezerler), yoksa satır içi
 * Tailwind yardımcısı. Kuralın uygulanıp uygulanmadığı `el.matches()` ile
 * DOM'a sorulur — böylece seçici başka biçimde yazılsa da test davranışı ölçer.
 */
const olc = (ozellik: 'padding-top' | 'top' | 'bottom', sinifListesi: string, o: Ortam = {}): number => {
  document.body.innerHTML = '';
  document.body.className = o.offline ? 'offline-banner-on' : '';
  if (o.nav) {
    const n = document.createElement('nav');
    n.setAttribute('aria-label', o.nav);
    document.body.appendChild(n);
  }
  const el = document.createElement('div');
  const js = jetonlar(sinifListesi);
  for (const t of js) { try { el.classList.add(t); } catch { /* geçersiz jeton */ } }
  document.body.appendChild(el);

  const desen = ozellik === 'padding-top'
    ? /(?:^|;)\s*padding-top\s*:\s*([^;}]+)/g
    : new RegExp(`(?:^|;)\\s*${ozellik}\\s*:\\s*([^;}]+)`, 'g');

  let ifade: string | null = null;
  for (const k of KURALLAR) {
    const eslesmeler = [...k.govde.matchAll(desen)];
    if (!eslesmeler.length) continue;
    const uyuyor = k.secici.split(',').some(s => { try { return el.matches(s.trim()); } catch { return false; } });
    if (uyuyor) ifade = eslesmeler[eslesmeler.length - 1][1].trim();
  }
  if (ifade === null) {
    const onekler = ozellik === 'padding-top' ? ['pt', 'p'] : [ozellik];
    for (const on of onekler) {
      for (const j of js) {
        const d = tailwindDegeri(j, on);
        if (d) { ifade = d; break; }
      }
      if (ifade) break;
    }
  }
  if (ifade === null) return 0; // hiçbir kural yok → boşluk yok (kusurun kendisi)
  return piksel(ifade, degiskenler(o));
};

/** Kaynak dosyadan, içinde `ipucu` geçen sınıf listesi satırını döndürür. */
const sinifSatiri = (dosya: string, ipucu: string): string => {
  const satir = oku(dosya).split('\n').find(s => s.includes(ipucu) && s.includes('className'));
  expect(satir, `${dosya} · "${ipucu}" içeren className satırı bulunamadı`).toBeTruthy();
  return satir!;
};

/** Kaynaktaki <nav> açılış etiketinden aria-label'ı çeker. */
const navEtiketi = (dosya: string): string | null => {
  const acilis = oku(dosya).match(/<(?:motion\.)?nav\b[^>]*>/s);
  expect(acilis, `${dosya} · <nav> açılış etiketi bulunamadı`).not.toBeNull();
  return acilis![0].match(/aria-label="([^"]+)"/)?.[1] ?? null;
};

// Dynamic Island'lı iPhone (14 Pro ve üstü): üst güvenli alan 59px, alt 34px.
const ADA = 59;
const ALT = 34;
// Güvenli alanı BİLDİRMEYEN cihaz (çentiksiz Android / tarayıcı): tasarım aynen korunmalı.
const DUZ = 0;

beforeEach(() => { document.body.className = ''; document.body.innerHTML = ''; });

// ─────────────────────────────────────────────────────────────────────────────
describe('1 · tam ekran katmanların kapat/geri düğmesi durum çubuğunun altında kalmaz', () => {
  const studioDis = sinifSatiri('views/Studio.tsx', 'min-h-screen w-full flex flex-col items-center');
  const studioBaslik = sinifSatiri('views/Studio.tsx', 'w-full max-w-sm flex items-center justify-between mb-8');
  const bildirimKapat = sinifSatiri('views/Notifications.tsx', 'rounded-full bg-white/10 backdrop-blur-md');

  it('Stüdyo · Taktik Paylaş: üst boşluk güvenli alanı AŞAR (eskiden 24px < 59px)', () => {
    const bosluk = olc('padding-top', studioDis, { safeTop: ADA });
    expect(bosluk).toBeGreaterThanOrEqual(ADA);
    // Eski hâl (`p-6` tek başına) burada 24px verirdi — kaydedilen taktiği
    // paylaşan kullanıcı geri düğmesine basamıyordu.
    expect(bosluk).toBeGreaterThan(24);
  });

  it('Stüdyo · başlık kaydırınca da çentiğin altına girmez (yapışkan dayanak)', () => {
    // `sticky top-0` kaydırma sırasında ekranın TEPESİNE yapışır: dolgu bunu
    // kurtarmaz, üst dayanağın kendisi güvenli alana taşınmalıdır.
    expect(olc('top', studioBaslik, { safeTop: ADA })).toBeGreaterThanOrEqual(ADA);
    // Şerit açıkken kırmızı bandın da altına iner.
    expect(olc('top', studioBaslik, { safeTop: ADA, offline: true }))
      .toBeGreaterThanOrEqual(ADA + seritYuksekligi(ADA));
  });

  it('Bildirimler · davet penceresinin KAPAT düğmesi çentiğin altında', () => {
    const ust = olc('top', bildirimKapat, { safeTop: ADA });
    expect(ust).toBeGreaterThanOrEqual(ADA);
    expect(ust).toBeGreaterThan(48); // eski `top-12` = 48px, Dynamic Island'ın içinde kalıyordu
  });

  it('güvenli alan YOKKEN tasarım birebir korunur (yeni boşluk açılmadı)', () => {
    expect(olc('padding-top', studioDis, { safeTop: DUZ })).toBe(24);   // p-6
    expect(olc('top', studioBaslik, { safeTop: DUZ })).toBe(0);         // eski top-0
    expect(olc('top', bildirimKapat, { safeTop: DUZ })).toBe(48);       // eski top-12
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('2 · Stüdyo\u2019nun kendi uyarı balonu ortak konumlandırmayı kullanır', () => {
  const balon = sinifSatiri('views/Studio.tsx', 'min-w-[280px]');

  it('sabit konum kaldırıldı, ortak sınıf takıldı', () => {
    expect(balon).toContain('uyari-balonu');
    // Herhangi bir Tailwind `bottom-*` yardımcısı geri gelirse konumu yine çiviler.
    expect(balon).not.toMatch(/\bbottom-\d/);
  });

  it('klavye açıkken balon klavyenin ÜSTÜNDE kalır (eski 128px yetmiyordu)', () => {
    const KLAVYE = 300;
    const dip = olc('bottom', balon, { safeTop: ADA, safeBottom: ALT, kb: KLAVYE });
    expect(dip).toBeGreaterThanOrEqual(KLAVYE);
    // Kusurun ölçüsü: `bottom-32` = 8rem = 128px, klavyenin 300px'inin ALTINDA.
    expect(piksel('8rem')).toBeLessThan(KLAVYE);
  });

  it('klavye kapalıyken ana ekran çubuğunun üstünde durur', () => {
    expect(olc('bottom', balon, { safeTop: ADA, safeBottom: ALT })).toBeGreaterThan(ALT);
  });

  it('yatay ortalama transform’a BAĞLI DEĞİL (framer transform’u kendi yazıyor)', () => {
    // framer-motion `y` canlandırdığı öğenin `style.transform` değerini kendisi
    // yazar (animasyon bitince "none"); satır içi stil sınıfı her zaman ezer.
    // Yani `-translate-x-1/2` sessizce düşer ve 280px'lik balon ekranın
    // ortasından sağa taşıp KESİLİRDİ — mesajın yarısı görünmezdi.
    // (Bu, jsdom'da ölçülemez: framer stil yazımı burada hiç çalışmıyor.
    //  Bu yüzden kural kaynakta kilitleniyor.)
    const studio = oku('views/Studio.tsx');
    const i = studio.indexOf('uyari-balonu fixed');
    const blok = studio.slice(studio.lastIndexOf('<motion.div', i), i);
    expect(blok, 'balon y ekseninde canlandırılmıyor mu? kural gözden geçirilmeli')
      .toMatch(/animate=\{\{[^}]*\by:/);
    expect(balon, 'transform tabanlı ortalama framer tarafından ezilir').not.toMatch(/-translate-x-/);
    expect(balon).toContain('mx-auto');
    expect(balon).toContain('w-fit');
    expect(balon).toMatch(/\bleft-0\b/);
    expect(balon).toMatch(/\bright-0\b/);
  });

  it('"kaydedilemedi" dürüst mesajı gerçekten bu balondan çıkıyor', () => {
    // NEDEN burada: balon görünmezse dosya kaydetme dürüstleştirmesi de görünmez
    // olur ve kullanıcı yine "düğme bozuk" sanır.
    const studio = oku('views/Studio.tsx');
    expect(studio).toContain('kaydedilemedi');
    expect(studio).toMatch(/setToast\(/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('3 · balonu menünün üstüne kaldıran kural ÜÇ alt menüyü de tanır', () => {
  const menuluKural = KURALLAR.find(k => k.secici.includes(':has(') && k.secici.includes('.uyari-balonu'));

  it('kural gerçekten alt menü farkındalı ve menü yüksekliğini ekliyor', () => {
    expect(menuluKural, 'alt menü farkındalı .uyari-balonu kuralı bulunamadı').toBeTruthy();
    expect(menuluKural!.govde).toContain('var(--oy-nav-h)');
  });

  it.each([
    ['oyuncu', 'components/BottomNav.tsx'],
    ['kaleci/hakem', 'views/ServiceDashboard.tsx'],
    ['işletme', 'views/owner/components/OwnerBottomNav.tsx'],
  ])('%s menüsü kuralın kapsamına giriyor', (_ad, dosya) => {
    const etiket = navEtiketi(dosya);
    expect(etiket, `${dosya} · <nav> erişilebilirlik etiketi taşımıyor`).toBeTruthy();
    // Etiketle kurulan gerçek DOM, CSS seçicisine giriyor mu?
    document.body.innerHTML = '';
    const nav = document.createElement('nav');
    nav.setAttribute('aria-label', etiket!);
    const b = document.createElement('div');
    b.className = 'uyari-balonu';
    document.body.append(nav, b);
    expect(b.matches(menuluKural!.secici)).toBe(true);
  });

  it('işletme menüsü GERÇEKTEN çizildiğinde de kapsanır (bileşen render edilir)', () => {
    render(createElement(OwnerBottomNav, { activeTab: 'HOME', onSelect: () => {} }));
    // Ekran okuyucu tarafı: bölge "Ana Gezinti" adıyla duyurulur.
    const nav = screen.getByRole('navigation', { name: 'Ana Gezinti' });
    expect(nav).toBeTruthy();
    const b = document.createElement('div');
    b.className = 'uyari-balonu';
    document.body.appendChild(b);
    expect(b.matches(menuluKural!.secici)).toBe(true);
  });

  it('menü varken balon menü yüksekliği kadar YUKARI çıkar', () => {
    const sinif = 'uyari-balonu fixed left-1/2';
    const menusuz = olc('bottom', sinif, { safeBottom: ALT });
    const menulu = olc('bottom', sinif, { safeBottom: ALT, nav: 'Ana Gezinti' });
    expect(menulu).toBeGreaterThan(menusuz);
    expect(menulu - menusuz).toBeGreaterThanOrEqual(piksel(NAV_IFADESI) - 12);
  });

  it('menüsüz ekranlarda boşuna pay ayrılmaz (balon boşluğa itilmez)', () => {
    const menusuz = olc('bottom', 'uyari-balonu fixed', { safeBottom: ALT });
    expect(menusuz).toBeLessThan(piksel(NAV_IFADESI));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('4 · çevrimdışı şeridi telafisi satır içi başlıkları da kapsar', () => {
  // Bu gece güvenli alana bağlanan başlıklar. Hepsi `sticky` — şerit açıkken
  // kırmızı bant üstlerine biniyordu.
  // [ad, dosya, etiket ipucu, kaçıncı eşleşme] — LegalScreen'de İKİ başlık var
  // (belge görünümü ve liste görünümü); ikisi de ayrı ayrı ölçülür.
  const basliklar: [string, string, string, number][] = [
    ['Ayarlar', 'views/SettingsScreen.tsx', '<header', 0],
    ['Yasal · belge', 'views/LegalScreen.tsx', '<header', 0],
    ['Yasal · liste', 'views/LegalScreen.tsx', '<header', 1],
    ['Servis ayarları', 'views/ServiceSettings.tsx', 'sticky top-0 z-30 px-4', 0],
    ['Kaleci/hakem paneli', 'views/ServiceDashboard.tsx', 'bg-transparent sticky top-0 z-20', 0],
    ['Bildirimler', 'views/Notifications.tsx', 'sticky top-0 z-20 px-5', 0],
  ];

  const satirBul = (dosya: string, ipucu: string, sira: number): string => {
    const eslesen = oku(dosya).split('\n').filter(s => s.includes(ipucu) && s.includes('className'));
    expect(eslesen.length, `${dosya} · "${ipucu}" için ${sira + 1}. başlık bulunamadı`).toBeGreaterThan(sira);
    return eslesen[sira];
  };

  it.each(basliklar)('%s başlığı şerit açılınca aşağı iner', (_ad, dosya, ipucu, sira) => {
    const sinif = satirBul(dosya, ipucu, sira);
    const kapali = olc('padding-top', sinif, { safeTop: ADA });
    const acik = olc('padding-top', sinif, { safeTop: ADA, offline: true });
    // Telafi TAM şerit yüksekliği kadar olmalı: eksik kalırsa geri düğmesinin
    // üstü şeridin altında kalır, fazlası tasarımı bozar.
    expect(acik - kapali).toBe(seritYuksekligi(ADA));
    // Asıl söz: içerik şeridin bittiği yerin altında başlar.
    expect(acik).toBeGreaterThanOrEqual(seritYuksekligi(ADA));
  });

  it.each(basliklar)('%s başlığının mevcut boşluğu DEĞİŞMEDİ', (_ad, dosya, ipucu, sira) => {
    const sinif = satirBul(dosya, ipucu, sira);
    // Çentikli cihazda: güvenli alan + ekranın kendi payı (pay ekrandan ekrana
    // farklı; sınıfa çevirirken hiçbiri oynatılmadı).
    const bosluk = olc('padding-top', sinif, { safeTop: ADA });
    expect(bosluk).toBeGreaterThanOrEqual(ADA);
    // Güvenli alan bildirmeyen cihazda eski ölçüler birebir:
    const duz = olc('padding-top', sinif, { safeTop: DUZ });
    expect(duz).toBeGreaterThan(0);
    expect(duz).toBeLessThanOrEqual(48);
  });

  it('bu dosyalarda satır içi güvenli alan hesabı KALMADI (telafi dışında kalan yok)', () => {
    for (const dosya of ['views/SettingsScreen.tsx', 'views/LegalScreen.tsx', 'views/ServiceSettings.tsx',
                         'views/ServiceDashboard.tsx', 'views/Notifications.tsx']) {
      const kod = oku(dosya).replace(/\{\/\*[\s\S]*?\*\/\}/g, ''); // JSX yorumları hariç
      expect(kod, `${dosya} · başlık dolgusu hâlâ satır içi yazılmış`)
        .not.toMatch(/\bpt-\[[^\]]*var\(--safe-top/);
    }
  });

  it('telafi listesi ile tanımlı sınıflar ayrışmaz (biri eklenip diğeri unutulmaz)', () => {
    const tanimli = [...css.matchAll(/^\.(pt-safe[\w-]*)\s*\{/gm)].map(m => m[1]);
    const telafili = [...css.matchAll(/body\.offline-banner-on\s+\.(pt-safe[\w-]*)\s*\{/g)].map(m => m[1]);
    expect(tanimli.length).toBeGreaterThan(0);
    for (const s of tanimli) expect(telafili, `${s} için çevrimdışı telafisi yazılmamış`).toContain(s);
  });
});
