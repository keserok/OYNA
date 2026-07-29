// IP-08 Aşama 2 — SÜPÜRME BEKÇİSİ
//
// Aşama 2, oyuncu ekranlarındaki 1509 punto ve 844 metin rengini düzeltti.
// Bu test o kazanımın geri sızmasını engeller: yarın biri ekrana bir tane
// `text-[9px]` ya da `text-gray-500` eklerse, PR burada kırmızıya döner.
//
// KAPSAM: karar S19 gereği yalnız OYUNCU ekranları. Tesis paneli (views/owner)
// bilinçli olarak dışarıda — tasarım sistemi oraya sonra uygulanacak.
//
// AÇIK ZEMİN İSTİSNASI: Üç ekranın zemini beyaz/açık. Mürekkep merdiveni koyu
// zemin için ölçüldü; oralarda `text-ink-4` kontrastı BOZAR. Bu yüzden onlar
// kendi koyu tonlarıyla düzeltildi ve renk kuralının dışında tutuluyor.

import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/** Oyuncu kapsamı: views + components (owner hariç) + App.tsx */
const oyuncuDosyalari = (): string[] =>
  execSync("find views components -name '*.tsx' -not -path '*/owner/*'; echo App.tsx", {
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .filter(Boolean);

/** Zemini açık olan ekranlar — renk kuralı bunlarda ayrı işler. */
const ACIK_ZEMIN = new Set([
  'views/GuardianConsentForm.tsx',
  'views/MatchTicket.tsx',
  'views/ServiceSettings.tsx',
]);

const ihlaller = (re: RegExp, hariç: Set<string> = new Set()) => {
  const bulunan: string[] = [];
  for (const yol of oyuncuDosyalari()) {
    if (hariç.has(yol)) continue;
    let s: string;
    try { s = readFileSync(yol, 'utf8'); } catch { continue; }
    s.split('\n').forEach((satir, i) => {
      const m = satir.match(re);
      if (m) bulunan.push(`${yol}:${i + 1}  ${m[0]}`);
    });
  }
  return bulunan;
};

describe('IP-08 bekçisi — punto', () => {
  it('11px altında SABİT PİKSEL punto kalmadı', () => {
    // 10px meşrudur ama rem cinsinden yazılır (kullanıcı yazı boyutu ayarı
    // çalışsın diye). Sabit px hiçbir boyutta kabul edilmez.
    const bulunan = ihlaller(/text-\[(?:[0-9]|10)(?:\.\d+)?px\]/);
    expect(bulunan, `sabit küçük punto:\n${bulunan.slice(0, 20).join('\n')}`).toEqual([]);
  });

  it('OYUNCU ekranlarında hiç sabit piksel punto kalmadı (hepsi rem)', () => {
    const bulunan = ihlaller(/text-\[\d+(?:\.\d+)?px\]/);
    expect(bulunan, `rem'e çevrilmemiş:\n${bulunan.slice(0, 20).join('\n')}`).toEqual([]);
  });

  it('her punto TAM piksele oturur (yarım piksel yok)', () => {
    // rem doğrudan okunamaz: 2.5rem = 40px meşru bir basamaktır, 0.71875rem
    // = 11.5px değildir. Kural: rem × 16 tam sayı olmalı.
    const bulunan: string[] = [];
    for (const yol of oyuncuDosyalari()) {
      let s: string;
      try { s = readFileSync(yol, 'utf8'); } catch { continue; }
      s.split('\n').forEach((satir, i) => {
        for (const m of satir.matchAll(/text-\[([0-9.]+)rem\]/g)) {
          const px = Number(m[1]) * 16;
          if (!Number.isInteger(Math.round(px * 1000) / 1000) || px % 1 !== 0) {
            bulunan.push(`${yol}:${i + 1}  ${m[0]} = ${px}px`);
          }
        }
      });
    }
    expect(bulunan, bulunan.join('\n')).toEqual([]);
  });

  it('rem punto tabanı 0.625rem (10px) — altına inen yok', () => {
    const bulunan: string[] = [];
    for (const yol of oyuncuDosyalari()) {
      let s: string;
      try { s = readFileSync(yol, 'utf8'); } catch { continue; }
      s.split('\n').forEach((satir, i) => {
        for (const m of satir.matchAll(/text-\[([0-9.]+)rem\]/g)) {
          if (Number(m[1]) * 16 < 10) bulunan.push(`${yol}:${i + 1}  ${m[0]}`);
        }
      });
    }
    expect(bulunan, bulunan.join('\n')).toEqual([]);
  });
});

describe('IP-08 bekçisi — kontrast', () => {
  it('AA eşiğinin altında kalan metin sınıfları kalmadı', () => {
    // Ölçülmüş oranlar (kart zemini #161B22):
    //   gray-500 4.00 · gray-600 2.56 · gray-700 1.88 · slate-500 4.06
    //   white/45 4.50 · /40 3.79 · /35 3.16 · /30 2.63 · /25 2.17 · /20 1.80 · /15 1.50
    const re = /(?<![\w-])text-(?:gray-(?:500|600|700)|slate-(?:500|600))(?![\w-])|(?<![\w-])text-white\/(?:15|20|25|30|35|40|45)(?![\w-/])/;
    const bulunan = ihlaller(re, ACIK_ZEMIN);
    expect(bulunan, `AA altında metin rengi:\n${bulunan.slice(0, 20).join('\n')}`).toEqual([]);
  });

  it('açık zeminli ekranlarda AA altı AÇIK tonlar kalmadı', () => {
    // Beyaz/slate zeminde gray-400 (2.54) ve slate-400 (2.56) okunmaz;
    // orada güvenli aralık 600 ve üstüdür.
    const bulunan: string[] = [];
    for (const yol of ACIK_ZEMIN) {
      const s = readFileSync(yol, 'utf8');
      s.split('\n').forEach((satir, i) => {
        // MatchTicket'ın KOYU bölümlerinde gray-400 meşrudur (7.62:1);
        // bu yüzden yalnız tam-açık ekranlarda katı davranıyoruz.
        if (yol === 'views/MatchTicket.tsx') return;
        const m = satir.match(/(?<![\w-])text-(?:gray|slate)-400(?![\w-])/);
        if (m) bulunan.push(`${yol}:${i + 1}  ${m[0]}`);
      });
    }
    expect(bulunan, bulunan.join('\n')).toEqual([]);
  });

  it('ServiceSettings iki temada da çalışır — soluk ton sabitlenmemiş', () => {
    const s = readFileSync('views/ServiceSettings.tsx', 'utf8');
    // Zemin moda göre dönüyorsa soluk ton da dönmeli; sabit gri ikisinde
    // birden AA geçemez.
    expect(s).toMatch(/--ayar-soluk/);
    expect(s).not.toMatch(/(?<![\w-])text-gray-(?:400|500|600)(?![\w-])/);
  });
});

describe('IP-08 bekçisi — Türkçe şapkaları', () => {
  it('kırpan kapsayıcıda leading-none YOK (şapkalar kesilir)', () => {
    // ÖLÇÜLDÜ: 11px'te `line-height:1` + `overflow:hidden` birleşimi Ü ve Ö
    // üzerindeki iki noktayı KESİYOR — "TÜMÜ" ekranda sessizce "TUMU",
    // "ÖĞÜŞ" ise "OĞUŞ" oluyordu. Tarayıcıda basamak basamak ölçüldü:
    //   1.00 kesiyor · 1.05 kesiyor · 1.10 İLK GÜVENLİ · 1.20 kullanılan değer
    // Bu yüzden metni kırpan her kapsayıcıda satır aralığı 1.1'in üstünde olmalı.
    const kirpan = /\btruncate\b|\bline-clamp-\d+\b|\boverflow-hidden\b/;
    const bulunan: string[] = [];
    for (const yol of oyuncuDosyalari()) {
      let s: string;
      try { s = readFileSync(yol, 'utf8'); } catch { continue; }
      for (const m of s.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{'([^']*)'\})/gs)) {
        const c = m[1] ?? m[2] ?? m[3] ?? '';
        if (/\bleading-none\b/.test(c) && kirpan.test(c)) {
          const satir = s.slice(0, m.index).split('\n').length;
          bulunan.push(`${yol}:${satir}`);
        }
      }
    }
    expect(bulunan, `şapka kırpan birleşim:\n${bulunan.join('\n')}`).toEqual([]);
  });

  it('uygulama Türkçe olarak işaretli — büyük harf i→İ doğru dönsün', () => {
    // lang="tr" olmadan CSS uppercase "istanbul" → "ISTANBUL" yapar (İ değil I).
    for (const f of ['index.html', 'admin-panel/admin.html']) {
      expect(readFileSync(f, 'utf8'), f).toMatch(/<html[^>]*lang="tr"/);
    }
  });
});
