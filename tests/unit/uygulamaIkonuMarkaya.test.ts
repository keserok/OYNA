// Uygulama ikonu bekçisi — "telefondaki simge her zaman BİZİM logomuz olsun".
//
// NEDEN VAR (2026-07-30):
//   Marka amblemi değiştirildiğinde `assets/` altındaki ana görseller
//   güncellendi ama `android/app/src/main/res/mipmap-*` altındaki ÜRETİLMİŞ
//   ikonlar eski şimşek logosunda kaldı. Depoya bir kez işlenmiş üretim
//   çıktısı, kaynak değişince sessizce eskidi ve kimse fark etmedi.
//   Aynı sınıf hata capacitor.build.gradle'da da yaşandı.
//
// BU TEST NE YAPAR:
//   Ürüne giden ikonun, `assets/` altındaki ana görselden GERÇEKTEN türediğini
//   piksel düzeyinde doğrular. Bayt karşılaştırması yapmaz — sıkıştırma ve
//   sharp sürümü bayt düzeyinde oynarsa test boşuna kırmızı yanar. Bunun
//   yerine her iki görsel 16x16 gri tonlamaya indirgenip ortalama fark
//   ölçülür; yani "aynı şekil mi" sorusu sorulur, "aynı dosya mı" değil.
//
// EŞİĞİN GERÇEKLİĞİ (ölçülmüş değerler):
//   doğru ikon  <-> kaynak :  0.11
//   eski şimşek <-> kaynak : 13.29   <-- yakalanması gereken
//   alakasız görsel        : 22.92
//   Eşik 3.0 seçildi: doğru tarafta ~27 kat, hatalı tarafta ~4 kat pay bırakır.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const KOK = process.cwd();
const yol = (p: string) => join(KOK, p);
const oku = (p: string) => readFileSync(yol(p), 'utf8');

/** Görseli 16x16 gri tonlamaya indirger — "şekil parmak izi". */
async function parmakIzi(dosya: string): Promise<Buffer> {
  return await sharp(yol(dosya))
    // Saydam alanlar marka zeminiyle doldurulur ki saydam/opak fark yaratmasın.
    .flatten({ background: '#0A0E14' })
    .resize(16, 16, { fit: 'fill' })
    .greyscale()
    .raw()
    .toBuffer();
}

/** İki parmak izi arasındaki ortalama mutlak fark (0 = birebir aynı şekil). */
function fark(a: Buffer, b: Buffer): number {
  let toplam = 0;
  for (let i = 0; i < a.length; i++) toplam += Math.abs(a[i] - b[i]);
  return toplam / a.length;
}

const ESIK = 3.0;

describe('uygulama ikonu marka amblemiyle aynı olmalı', () => {
  it('Android launcher ikonu assets/icon-foreground.png üzerinden üretilmiş', async () => {
    // Bu dosya eskiden ŞİMŞEKTİ. Kaynak değişip bu üretilmezse test kırmızı yanar.
    const kaynak = await parmakIzi('assets/icon-foreground.png');
    const uretilen = await parmakIzi('android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png');
    expect(fark(kaynak, uretilen)).toBeLessThan(ESIK);
  });

  it('Android ikonu tüm ekran yoğunluklarında aynı amblemi taşıyor', async () => {
    const kaynak = await parmakIzi('assets/icon-foreground.png');
    for (const yogunluk of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
      const dosya = `android/app/src/main/res/mipmap-${yogunluk}/ic_launcher_foreground.png`;
      expect(existsSync(yol(dosya)), `${dosya} yok`).toBe(true);
      expect(fark(kaynak, await parmakIzi(dosya)), `${yogunluk} amblemi tutmuyor`).toBeLessThan(ESIK);
    }
  });

  it('iOS uygulama ikonu assets/icon-only.png üzerinden üretilmiş', async () => {
    // iOS derlemesi macOS'ta, CI dışında yapılıyor; oradaki eskimeyi
    // yakalayabilecek TEK otomatik kontrol budur.
    const kaynak = await parmakIzi('assets/icon-only.png');
    const uretilen = await parmakIzi('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png');
    expect(fark(kaynak, uretilen)).toBeLessThan(ESIK);
  });
});

describe('ikon üretimi derleme hattına bağlı kalmalı', () => {
  it('assets:generate betiği hem Android hem iOS üretiyor', () => {
    const pkg = JSON.parse(oku('package.json')) as { scripts: Record<string, string> };
    const betik = pkg.scripts['assets:generate'] ?? '';
    expect(betik).toContain('capacitor-assets generate');
    expect(betik, 'Android kapsam dışı kalmış').toContain('--android');
    expect(betik, 'iOS kapsam dışı kalmış').toContain('--ios');
  });

  it('AAB iş akışı, cap sync ÖNCESİNDE ikonları üretiyor', () => {
    // Sıra önemli: cap sync, üretilmiş ikonları native projeye taşır.
    // Üretim sonra çalışırsa pakete eski ikon girer.
    const akis = oku('.github/workflows/android-release.yml');
    const uretim = akis.indexOf('assets:generate');
    const senkron = akis.indexOf('cap sync android');
    expect(uretim, 'ikon üretim adımı iş akışından kaldırılmış').toBeGreaterThan(-1);
    expect(senkron).toBeGreaterThan(-1);
    expect(uretim, 'ikon üretimi cap sync SONRASINA kaymış').toBeLessThan(senkron);
  });

  it('iOS için de tek komutluk üretim+senkron yolu var', () => {
    // macOS'ta çalışan kişi `npm run sync:ios` derse ikon üretimi atlanamaz.
    const pkg = JSON.parse(oku('package.json')) as { scripts: Record<string, string> };
    expect(pkg.scripts['sync:ios'] ?? '').toContain('assets:generate');
  });
});
