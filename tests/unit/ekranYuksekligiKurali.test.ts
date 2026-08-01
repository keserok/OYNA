// Ekran yüksekliği bekçisi — "kendi içinde kayan ekranın boyu BELLİ olmalı".
//
// NEDEN VAR (2026-08-01):
//   Kullanıcı iki kez aynı şikâyeti getirdi: önce "Sahalar ekranında kaydırma
//   çalışmıyor", sonra "taktiksel ve ciddi maç lobilerinde de kaydırma bozuk".
//   İkisinin de sebebi TEK bir yerleşim hatasıydı ve o hata 14 ekrana yayılmıştı.
//
//   Bu ekranlar dikey bir yığındır: üstte sabit başlık, altta kendi içinde kayan
//   liste (`flex-1` + `overflow-y-auto`). Çocuğun "kalan alanı doldur, taşarsan
//   kaydır" davranışı ancak ANA KUTUNUN yüksekliği BELLİ olduğunda çalışır.
//   `min-h-screen` yalnız bir TABAN verir, yüksekliği serbest bırakır: kutu
//   içerikle uzar, `flex-1` sınırlanacak bir alan bulamaz ve listenin kendi
//   kaydırması HİÇ DEVREYE GİRMEZ. Doğrusu `h-full`.
//
// BU TEST NE YAPAR:
//   Kaynakta "gerilebilir kök + iç kaydırıcı" birlikteliğini arar. Yeni bir
//   ekran bu ikiliyi getirirse burada kırmızı yanar — telefonda fark edilmeden
//   önce.
//
// ÇALIŞAN ÖLÇÜM NEREDE: tests/visual/icKaydirma.visual.spec.ts gerçek
// Chromium'da 15 ekranı yük altında ölçer. Bu test onun statik tamamlayıcısıdır:
// oraya tohumlanamayan ekranları (takım detayı, kart ekleme, başvuru formu…) da
// kapsar.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const KOK = process.cwd();
const ATLA = new Set(['node_modules', '.git', 'dist', 'android', 'ios', 'coverage', '.vite', 'tests']);

/**
 * BİLEREK MUAF.
 *
 * `views/Studio.tsx` sayfa boyu akan bir ekrandır: kökü İÇERİKLE UZAR ve
 * kaydırmayı dıştaki görünüm kaydırıcısı yapar (iç kaydırıcısı yoktur). İçindeki
 * `flex-1 overflow-y-auto` kutuların hepsi `fixed inset-0` kaplamaların
 * (modal/panel) içindedir — onların yüksekliği zaten ekrana sabitlidir.
 */
const MUAF = new Set(['views/Studio.tsx']);

function tsxDosyalari(dizin: string, biriktir: string[] = []): string[] {
  for (const ad of readdirSync(dizin)) {
    if (ATLA.has(ad)) continue;
    const tam = join(dizin, ad);
    if (statSync(tam).isDirectory()) tsxDosyalari(tam, biriktir);
    else if (ad.endsWith('.tsx')) biriktir.push(tam);
  }
  return biriktir;
}

/** className="…" ve className={`…`} değerlerini çıkar. */
function sinifDegerleri(kaynak: string): string[] {
  return [...kaynak.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)]
    .map((m) => m[1] ?? m[2] ?? '');
}

/**
 * "Gerilebilir kök": dikey yığın kurar ama yüksekliğini serbest bırakır.
 * `max-h-screen` bir TAVAN koyduğu için muaf; `fixed`/`absolute` kutular da
 * yüksekliğini konumlanmadan alır.
 */
const gerilebilirKok = (c: string) =>
  /\bmin-h-screen\b/.test(c) &&
  /\bflex-col\b/.test(c) &&
  !/\bmax-h-screen\b/.test(c) &&
  !/\b(fixed|absolute)\b/.test(c);

/** "İç kaydırıcı": kalan alanı doldurup kendi içinde kaydırması beklenen kutu. */
const icKaydirici = (c: string) =>
  /\boverflow-y-(auto|scroll)\b/.test(c) && (/\bflex-1\b/.test(c) || /\bh-full\b/.test(c));

describe('Ekran yüksekliği kuralı', () => {
  it('kendi içinde kayan hiçbir ekranın kökü serbest yükseklikte olmamalı', () => {
    const suclular: string[] = [];

    for (const dosya of tsxDosyalari(KOK)) {
      const yol = relative(KOK, dosya).split(sep).join('/');
      if (MUAF.has(yol)) continue;

      const siniflar = sinifDegerleri(readFileSync(dosya, 'utf8'));
      const kokler = siniflar.filter(gerilebilirKok);
      if (kokler.length === 0) continue;
      if (!siniflar.some(icKaydirici)) continue;

      suclular.push(`${yol} → ${kokler.length} adet: "${kokler[0].slice(0, 70)}…"`);
    }

    expect(
      suclular,
      'Bu dosyalarda "yüksekliği serbest kök" + "kendi içinde kayan liste" bir arada:\n' +
      `${suclular.join('\n')}\n\n` +
      'Kökteki `min-h-screen` yerine `h-full` kullan; yoksa listenin kendi ' +
      'kaydırması HİÇ çalışmaz ve ekran parmakla kaydırılamaz.',
    ).toEqual([]);
  });

  it('kural gerçekten bir şey yakalıyor (bekçinin kendi sınavı)', () => {
    // Bozuk desen yakalanmalı…
    expect(gerilebilirKok('min-h-screen bg-[#0A0E14] flex flex-col')).toBe(true);
    expect(icKaydirici('flex-1 overflow-y-auto px-4')).toBe(true);
    // …doğru desenler ve bilinen istisnalar yakalanmamalı.
    expect(gerilebilirKok('h-full bg-[#0A0E14] flex flex-col')).toBe(false);
    expect(gerilebilirKok('min-h-screen max-h-screen flex flex-col')).toBe(false);
    expect(gerilebilirKok('fixed inset-0 min-h-screen flex flex-col')).toBe(false);
  });
});
