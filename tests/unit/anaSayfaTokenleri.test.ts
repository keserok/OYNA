// ════════════════════════════════════════════════════════════════════════════
// ANA SAYFA — TOKEN DİSİPLİNİ
// ════════════════════════════════════════════════════════════════════════════
//
// Onaylı tasarımın kabul kriteri: "Token dışı hex ve token dışı punto yok."
// Bu dosya o sözü kilitler.
//
// KİLİTLENEN ÜÇ SÖZ
//   1. Ekranda geçen HER renk ya bir token'dır (`var(--color-…)`) ya da
//      onaylı tasarımın gradyan/gölge durağıdır. Yeni bir hex uydurulamaz.
//   2. Punto DAİMA `ui/type.ts` ölçeğinden gelir — serbest `13px` yazılamaz.
//   3. Boşluk / köşe / kart yüksekliği `--oy-*` ölçeğinden gelir.
//
// NEDEN GEREKLİ: bu ekranın önceki sürümünde ölçüler `clamp()` içine elle
// yazılmıştı ve zamanla saptı. Kural yazıyla değil testle tutulur.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TYPE_PX } from '../../ui/type';

const KOK = process.cwd();
const oku = (p: string) => readFileSync(join(KOK, p), 'utf8');

/** Ana sayfayı oluşturan dosyalar — kural ikisini birden bağlar. */
const DOSYALAR = ['views/Dashboard.tsx', 'components/dashboard/HomePieces.tsx'];
const kaynak = DOSYALAR.map(oku).join('\n');

const css = oku('index.css');

/**
 * Yorumsuz kaynak.
 *
 * Performans kuralları (aşağıda) yasaklı özelliğin ADINI arıyor. Bu isim
 * doğal olarak "neden kullanmıyoruz" diye ANLATAN yorumlarda da geçiyor —
 * yorum yüzünden kırmızıya dönen bir test, insanları açıklama yazmaktan
 * caydırır. Kural koda bakar, anlatıya değil.
 */
const yorumsuz = kaynak
  .split('\n')
  .filter((l) => {
    const t = l.trim();
    return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
  })
  .join('\n');

/** `index.css` @theme içinde tanımlı TÜM hex değerleri (renk rolleri). */
const tokenHexleri = (): Set<string> => {
  const out = new Set<string>();
  for (const m of css.matchAll(/#[0-9A-Fa-f]{6}\b/g)) out.add(m[0].toUpperCase());
  return out;
};

/**
 * Tasarımın gradyan / gölge DURAKLARI.
 *
 * Bunlar rol değildir: tek bir gradyanın ara tonlarıdır ("sarıdan siyaha
 * geçerken uğranan ton"). Rol olmadıkları için `index.css`'te token'ları da
 * yoktur — ama keyfi de değiller: onaylı tasarımdan birebir alındılar ve
 * listenin kendisi bir kapıdır. Yeni bir ton eklemek isteyen, önce buraya
 * yazmak ve gerekçesini bırakmak zorundadır.
 */
const GRADYAN_DURAKLARI = new Set([
  '#000000', '#000',                       // top yuvarlağının çekirdeği
  '#11161D', '#0A0E14', '#05070A',         // kart gradyanı (135deg)
  '#080B11', '#090C12',                    // başlık gradyanının üst ucu
  '#FFD700', '#EAB308', '#1A1600',         // Top Oyna gradyanı
  '#059669',                               // saha aksanının koyu ucu
  '#E64A19',                               // organizasyon aksanının koyu ucu
  '#1A7A20',                               // kaleci aksanının koyu ucu
  '#2563EB', '#60A5FA',                    // hakem aksanı (info ailesiyle aynı)
  '#8F0000',                               // stüdyo aksanının koyu ucu
]);

describe('ana sayfa — renk disiplini', () => {
  const izinli = new Set<string>([...tokenHexleri(), ...GRADYAN_DURAKLARI]);

  it('ekranda token dışı hex YOK', () => {
    const kullanilan = new Set<string>();
    for (const m of kaynak.matchAll(/#[0-9A-Fa-f]{3,6}\b/g)) kullanilan.add(m[0].toUpperCase());

    const kacak = [...kullanilan].filter((h) => !izinli.has(h));
    expect(
      kacak,
      `Bu renkler ne token ne de onaylı gradyan durağı:\n${kacak.join(', ')}\n` +
      "Rol ise index.css @theme'e ekle; gradyan durağıysa bu testteki listeye gerekçesiyle yaz.",
    ).toEqual([]);
  });

  it('metin renkleri mürekkep merdiveninden gelir (çıplak beyaz/gri yok)', () => {
    // `color: '#FFFFFF'` yerine `var(--color-ink)`. Gradyan durakları
    // `background` içindedir, `color` içinde değil.
    const ihlal: string[] = [];
    for (const dosya of DOSYALAR) {
      oku(dosya).split('\n').forEach((satir, i) => {
        const m = /(?<!background|border|box)[\s{]color:\s*'#[0-9A-Fa-f]{3,6}'/.exec(satir);
        if (m) ihlal.push(`${dosya}:${i + 1}`);
      });
    }
    expect(ihlal, `metin rengi token'dan gelmeli:\n${ihlal.join('\n')}`).toEqual([]);
  });

  it('cüzdan kutusu ana sayfadan kaldırıldı (lansman kararı: bakiye yok)', () => {
    // Cüzdan kapatıldı (shared/featureFlags.ts): ana sayfada bakiye kutusu
    // kalmadı — bakiye rengi de bu ekranda artık kullanılmaz. Token, cüzdan
    // lisanslı bir modelle geri açılırsa diye index.css'te tanımlı durur.
    expect(kaynak).not.toContain('CÜZDANIM');
    expect(kaynak).not.toContain('var(--color-money-balance)');
    expect(css).toMatch(/--color-money-balance:\s*#00FFA5/);
  });
});

describe('ana sayfa — punto disiplini', () => {
  it('serbest piksel punto YOK — hepsi ui/type.ts ölçeğinden', () => {
    const ihlal: string[] = [];
    for (const dosya of DOSYALAR) {
      oku(dosya).split('\n').forEach((satir, i) => {
        const t = satir.trim();
        if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
        // Yasak: fontSize: '13px' / fontSize: 13 / text-[13px]
        if (/fontSize:\s*'?\d/.test(satir)) ihlal.push(`${dosya}:${i + 1} → ${t.slice(0, 80)}`);
        if (/text-\[\d+(\.\d+)?px\]/.test(satir)) ihlal.push(`${dosya}:${i + 1} → ${t.slice(0, 80)}`);
      });
    }
    expect(
      ihlal,
      `Punto ölçeği ui/type.ts'tir. Tabloda yoksa TABLOYA EKLE:\n${ihlal.join('\n')}`,
    ).toEqual([]);
  });

  it('kullanılan her punto basamağı ölçekte TANIMLI', () => {
    const basamaklar = new Set(Object.keys(TYPE_PX));
    const kullanilan = [...kaynak.matchAll(/\bpx\('([a-zA-Z]+)'\)/g)].map((m) => m[1]);
    expect(kullanilan.length, 'ekran hiç punto kullanmıyor olamaz').toBeGreaterThan(5);
    const tanimsiz = [...new Set(kullanilan)].filter((k) => !basamaklar.has(k));
    expect(tanimsiz, `ui/type.ts'te olmayan basamak: ${tanimsiz.join(', ')}`).toEqual([]);
  });
});

describe('ana sayfa — ölçek disiplini', () => {
  it("4px tabanlı ölçek @theme'de tanımlı", () => {
    for (const t of ['--oy-space-4', '--oy-space-6', '--oy-radius-lg', '--oy-radius-pill', '--oy-card-tall']) {
      expect(css, `${t} tanımsız`).toContain(t);
    }
  });

  it("kart yüksekliği ve köşesi token'dan gelir — çıplak px yok", () => {
    const ihlal: string[] = [];
    for (const dosya of DOSYALAR) {
      oku(dosya).split('\n').forEach((satir, i) => {
        const t = satir.trim();
        if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
        if (/\bheight:\s*'\d+px'/.test(satir)) ihlal.push(`${dosya}:${i + 1} → ${t.slice(0, 80)}`);
        if (/borderRadius:\s*'\d+px'/.test(satir)) ihlal.push(`${dosya}:${i + 1} → ${t.slice(0, 80)}`);
      });
    }
    expect(ihlal, `--oy-card-* / --oy-radius-* kullan:\n${ihlal.join('\n')}`).toEqual([]);
  });
});

describe('ana sayfa — performans sözü', () => {
  it('backdrop-filter KULLANILMIYOR', () => {
    // Orta segment Android'de kare düşürüyor (tasarım brifingi · madde 7).
    expect(yorumsuz).not.toMatch(/backdrop-?[Ff]ilter/);
  });

  it('drop-shadow filtresi yerine statik box-shadow', () => {
    expect(yorumsuz).not.toMatch(/filter:\s*'?drop-shadow/);
  });

  it('maske hem önekli hem öneksiz yazılmış (eski WebView + yeni tarayıcı)', () => {
    expect(kaynak).toContain('WebkitMaskImage');
    expect(kaynak).toContain('maskImage');
  });
});

describe('ana sayfa — erişilebilirlik sözü', () => {
  it('dokunma hedefi tabanı 48px token olarak tanımlı ve kullanılıyor', () => {
    expect(css).toMatch(/--oy-tap-min:\s*48px/);
    expect(kaynak).toContain('var(--oy-tap-min)');
  });

  it('her basılabilir kap klavyeyle açılabiliyor', () => {
    // `Tap` tek giriş noktası: role/tabIndex/onKeyDown orada bir kez kurulu.
    const pieces = oku('components/dashboard/HomePieces.tsx');
    expect(pieces).toContain("role=\"button\"");
    expect(pieces).toContain('tabIndex={0}');
    expect(pieces).toMatch(/e\.key === 'Enter' \|\| e\.key === ' '/);
  });

  it('titreşim eklenmemiş (uygulama genelindeki karar korunuyor)', () => {
    expect(yorumsuz).not.toContain('Haptics');
    expect(yorumsuz).not.toContain('navigator.vibrate');
  });
});
