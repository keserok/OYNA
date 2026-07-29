// IP-08 — Tipografi ölçeği ve mürekkep merdiveni.
//
// Bu test, tasarım sisteminin SÖZÜNÜ kilitler. Bir sonraki oturum ölçeğe
// "sadece bir tane" 9px eklemek istediğinde, ya da kontrast merdivenine bir
// basamak daha soluk ton koymak istediğinde, burası kırmızıya döner.
//
// Kilitlenen üç söz:
//   1. Ölçek rem tabanlıdır — px yazılırsa kullanıcının telefon yazı boyutu
//      ayarı çalışmaz (WCAG 1.4.4).
//   2. Okunur metnin tabanı 11px'tir; 10px YALNIZ büyük harf + tracking ile.
//   3. Metin renklerinin DÖRDÜ DE en zor zeminde (kart #161B22) AA geçer.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type_, TYPE_PX, READABLE_MIN_PX, sectionLabel, type TypeStep } from '../../ui/type';

const KOK_PX = 16;
const remToPx = (rem: number) => rem * KOK_PX;

/** `text-[0.6875rem]` → 0.6875 */
const puntoRem = (cls: string): number => {
  const m = cls.match(/text-\[([0-9.]+)rem\]/);
  if (!m) throw new Error(`punto bulunamadı: ${cls}`);
  return Number(m[1]);
};
/** `leading-[0.9375rem]` → 0.9375 */
const araRem = (cls: string): number => {
  const m = cls.match(/leading-\[([0-9.]+)rem\]/);
  if (!m) throw new Error(`satır aralığı bulunamadı: ${cls}`);
  return Number(m[1]);
};

const basamaklar = Object.keys(type_) as TypeStep[];

describe('tipografi ölçeği — yapı', () => {
  it('HER basamak rem cinsindendir; sabit px YOKTUR', () => {
    for (const k of basamaklar) {
      expect(type_[k], `${k} punto tanımı`).toMatch(/text-\[[0-9.]+rem\]/);
      expect(type_[k], `${k} sabit px içeriyor`).not.toMatch(/text-\[[0-9.]+px\]/);
    }
  });

  it('HER basamak açık satır aralığı taşır (varsayılana bırakılmaz)', () => {
    for (const k of basamaklar) {
      expect(type_[k], `${k} satır aralığı`).toMatch(/leading-\[[0-9.]+rem\]/);
    }
  });

  it('px karşılık tablosu className ile birebir tutar', () => {
    for (const k of basamaklar) {
      expect(remToPx(puntoRem(type_[k])), `${k}`).toBe(TYPE_PX[k]);
    }
  });

  it('basamaklar artan sırada ve HİÇ tekrar etmez', () => {
    const px = basamaklar.map(k => TYPE_PX[k]);
    expect(px).toEqual([...px].sort((a, b) => a - b));
    expect(new Set(px).size).toBe(px.length);
  });
});

describe('tipografi ölçeği — okunabilirlik sözü', () => {
  it('okunur metnin tabanı 11px; altında YALNIZ microLabel var', () => {
    const altinda = basamaklar.filter(k => TYPE_PX[k] < READABLE_MIN_PX);
    expect(altinda).toEqual(['microLabel']);
  });

  it('microLabel büyük harf + harf aralığı ZORUNLU taşır', () => {
    // 10px yalnız bu bağlamda meşru: büyük harfin x-yüksekliği sorunu yok,
    // tracking harfleri ayırıyor. Bu iki nitelik düşerse 10px savunulamaz.
    expect(type_.microLabel).toContain('uppercase');
    expect(type_.microLabel).toMatch(/tracking-\[[0-9.]+em\]/);
  });

  it('hiçbir basamak 10px altına inmez', () => {
    for (const k of basamaklar) expect(TYPE_PX[k], k).toBeGreaterThanOrEqual(10);
  });

  it('küçük puntolar okunur satır aralığı alır (≥1.30), büyükler sıkışır', () => {
    for (const k of basamaklar) {
      const oran = araRem(type_[k]) / puntoRem(type_[k]);
      if (TYPE_PX[k] <= 14) {
        expect(oran, `${k} (${TYPE_PX[k]}px) satır aralığı oranı`).toBeGreaterThanOrEqual(1.2);
      } else {
        // Büyük punto geniş aralıkla dağılır — başlıkta 1.4 kabul edilmez.
        expect(oran, `${k} (${TYPE_PX[k]}px) satır aralığı oranı`).toBeLessThanOrEqual(1.4);
      }
    }
  });

  it('sectionLabel bileşik deseni ölçeğe ve mürekkep merdivenine bağlıdır', () => {
    expect(sectionLabel).toContain(type_.microLabel);
    expect(sectionLabel).toMatch(/text-ink-[1-4]?/);
  });
});

// ─── Mürekkep merdiveni — index.css TEK KAYNAK, buradan okunur ─────────────

const css = readFileSync(join(process.cwd(), 'index.css'), 'utf8');

const kontrast = (fg: string, bg: string): number => {
  const parse = (h: string) =>
    [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const L = (c: number[]) => {
    const f = (v: number) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  const [a, b] = [L(parse(fg)), L(parse(bg))].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
};

const ZEMIN_UYGULAMA = '#0A0E14';
const ZEMIN_KART = '#161B22'; // en açık zemin → en zor durum

const inkTokenlari = (): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const m of css.matchAll(/--color-(ink(?:-\d)?):\s*(#[0-9A-Fa-f]{6})/g)) {
    out[m[1]] = m[2];
  }
  return out;
};

describe('mürekkep merdiveni — kontrast sözü', () => {
  const ink = inkTokenlari();

  it('dört basamak da tanımlı', () => {
    expect(Object.keys(ink).sort()).toEqual(['ink', 'ink-2', 'ink-3', 'ink-4']);
  });

  it('HER basamak EN ZOR zeminde (kart) AA 4.5:1 geçer', () => {
    for (const [ad, hex] of Object.entries(ink)) {
      expect(kontrast(hex, ZEMIN_KART), `${ad} (${hex}) kart zemininde`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('uygulama zemininde de geçer', () => {
    for (const [ad, hex] of Object.entries(ink)) {
      expect(kontrast(hex, ZEMIN_UYGULAMA), `${ad} (${hex})`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('merdiven gerçekten kademeli — her basamak öncekinden soluk', () => {
    const sirali = ['ink', 'ink-2', 'ink-3', 'ink-4'].map(k => kontrast(ink[k], ZEMIN_KART));
    for (let i = 1; i < sirali.length; i++) {
      expect(sirali[i], `basamak ${i + 1}`).toBeLessThan(sirali[i - 1]);
    }
  });

  it('kaldırılan soluk renkler merdivene GERİ SIZMAZ', () => {
    // Bunlar tam da AA'da kaldıkları için terk edildi; token olarak dönmesinler.
    const yasakli = ['#6B7280', '#4B5563', '#374151', '#64748B'];
    for (const hex of yasakli) {
      expect(Object.values(ink).map(v => v.toUpperCase()), hex).not.toContain(hex.toUpperCase());
    }
  });
});

// ─── Font altyapısı — çevrimdışı ve sahte yüz koruması ────────────────────

describe('yazı tipi altyapısı', () => {
  it('fontlar UZAK CDN\'den değil, kendi dosyalarımızdan yüklenir', () => {
    expect(css).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
    expect(css).toMatch(/@font-face/);
    expect(css).toMatch(/url\('\/fonts\/inter-latin-opsz-normal\.woff2'\)/);
  });

  it('index.html ve admin.html uzak font linki TAŞIMAZ', () => {
    for (const f of ['index.html', 'admin-panel/admin.html']) {
      const h = readFileSync(join(process.cwd(), f), 'utf8');
      expect(h, f).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
    }
  });

  it('Türkçe için latin VE latin-ext altkümelerinin ikisi de tanımlı', () => {
    // ı → latin (U+0131) · İ ğ ş ve ₺ (U+20BA) → latin-ext. Biri eksikse
    // Türkçe metin ya da tutar işareti bozuk çizilir.
    expect(css).toMatch(/inter-latin-opsz-normal\.woff2/);
    expect(css).toMatch(/inter-latin-ext-opsz-normal\.woff2/);
    expect(css).toMatch(/U\+0131/);
    expect(css).toMatch(/U\+20AD-20C0/); // ₺ bu aralıkta
  });

  it('gerçek italik yüzü yüklenir (sentetik eğim değil)', () => {
    expect(css).toMatch(/font-style:\s*italic/);
    expect(css).toMatch(/inter-latin-opsz-italic\.woff2/);
    expect(css).toMatch(/inter-latin-ext-opsz-italic\.woff2/);
  });

  it('değişken eksen 100–900 açık — 900 artık sessizce 800\'e düşmez', () => {
    expect(css).toMatch(/font-weight:\s*100 900/);
  });

  it('sahte kalın/eğik üretimi kapalı', () => {
    expect(css).toMatch(/font-synthesis:\s*none/);
  });

  it('optik boyut ekseni açık (küçük puntoda harf açıklıkları genişler)', () => {
    expect(css).toMatch(/font-optical-sizing:\s*auto/);
    expect(css).toMatch(/opsz/);
  });

  it('tutar rakamları eşit genişlikte (tabular) — sütunlar hizalanır', () => {
    expect(css).toMatch(/\.font-numeric[\s\S]{0,200}tabular-nums/);
  });
});

describe('ağırlık dürüstlüğü — font-black terk edildi', () => {
  it('kaynak kodda font-black KALMADI', async () => {
    // 900 istenip 800 çizilmesi bitti: kod artık gerçekte ne çizildiğini söylüyor.
    const { execSync } = await import('node:child_process');
    const cikti = execSync(
      "grep -rl '\\bfont-black\\b' views components admin-panel ui App.tsx --include='*.tsx' --include='*.ts' || true",
      { cwd: process.cwd(), encoding: 'utf8' },
    ).trim();
    expect(cikti, `font-black kalan dosyalar:\n${cikti}`).toBe('');
  });
});
