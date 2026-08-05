// ════════════════════════════════════════════════════════════════════════════
// AYARLAR EKRANI · BÖLÜM DÜZENİ
// ════════════════════════════════════════════════════════════════════════════
//
// Kullanıcı kararı (2026-08):
//   1. "Tesise Katıl" Ayarlar'ın "İşletme" bölümünden çıktı, "Sahada Rolün"
//      sayfasının İÇİNE girdi — davet koduyla ekibe katılmak da bir
//      "sahadaki rolün" meselesi.
//   2. "Sahada Rolün" ekranın en üstündeki büyük mavi karttan indi ve
//      "Destek" bölümünde Yardım Merkezi'nin altına İKİNCİ SATIR oldu.
//
// Bu düzen kolay bozulur: biri "önemli, üste alalım" der ve karar geri döner.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const oku = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const ayarlar = oku('views/SettingsScreen.tsx');
const rolSayfasi = oku('components/settings/FieldRolePage.tsx');

/** Yorumsuz kaynak — anlatı kuralın dışında. */
const yorumsuz = (s: string) => s
  // Blok yorumlar (JSX içindekiler dahil) tek satıra sığmayabilir; kuralın
  // ANLATIYA takılmaması için hepsi baştan silinir.
  .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, '')
  .split('\n')
  .filter((l) => !l.trim().startsWith('//'))
  .join('\n');

/** Ayar LİSTESİNİN gövdesi — modaller ve alt sayfalar bunun dışında kalır. */
const mainGovdesi = (): string => {
  const s = yorumsuz(ayarlar);
  const bas = s.indexOf('<main');
  const son = s.indexOf('</main>');
  return s.slice(bas, son);
};

describe('Tesise Katıl → Sahada Rolün sayfasında', () => {
  it('Ayarlar listesinde artık Tesise Katıl düğmesi YOK', () => {
    // Modalın KENDİSİ hâlâ bu dosyada (katılım sonrası tesis listesini o
    // tazeliyor) — aranan şey, ayar listesinde bir GİRİŞ kalmamış olması.
    // Bu yüzden yalnız <main> gövdesine bakılır, dosyanın tamamına değil.
    expect(mainGovdesi()).not.toContain('Tesise Katıl');
  });

  it('Sahada Rolün sayfası Tesise Katıl satırını çiziyor', () => {
    expect(rolSayfasi).toContain('Tesise Katıl');
    expect(rolSayfasi).toContain('davet koduyla tesis ekibine katıl');
  });

  it('satır Ayarlar\'daki modalı açıyor — iki ayrı katılma yolu yok', () => {
    expect(rolSayfasi).toContain('onJoinPitch');
    expect(ayarlar).toMatch(/onJoinPitch=\{\(\) => setShowJoinModal\(true\)\}/);
  });

  it('İşletme bölümü personel tesisi yoksa hiç çizilmiyor', () => {
    // Tesise Katıl gidince bölümü ayakta tutan tek şey kalmamıştı;
    // boş başlık bırakmak yerine bölüm tamamen gizleniyor.
    expect(ayarlar).toMatch(/\{staffPitches\.length > 0 && \(/);
  });
});

describe('Sahada Rolün → Destek bölümünde ikinci satır', () => {
  const destekBloku = ayarlar.slice(ayarlar.indexOf('Destek</h3>'));

  it('Destek bölümünde Yardım Merkezi\'nden SONRA geliyor', () => {
    const y = destekBloku.indexOf('Yardım Merkezi');
    const r = destekBloku.indexOf('Sahada Rolün');
    expect(y, 'Yardım Merkezi Destek bölümünde yok').toBeGreaterThan(-1);
    expect(r, 'Sahada Rolün Destek bölümünde yok').toBeGreaterThan(-1);
    expect(r, 'Sahada Rolün, Yardım Merkezi\'nin ÜSTÜNE çıkmış').toBeGreaterThan(y);
  });

  it('Çıkış Yap hâlâ en altta — bölümün son öğesi', () => {
    const r = destekBloku.indexOf('Sahada Rolün');
    const c = destekBloku.indexOf('Çıkış Yap');
    expect(c).toBeGreaterThan(r);
  });

  it('ekranın EN ÜSTÜNDEKİ büyük mavi kart kaldırıldı', () => {
    // Eski kart `<main>`ın İLK çocuğuydu. Artık listede yalnız bir kez
    // geçiyor ve o da Destek bölümünde — yani ilk yarıda hiç görünmemeli.
    const g = mainGovdesi();
    const yer = g.indexOf('Sahada Rolün');
    expect(yer, 'Sahada Rolün listede hiç yok').toBeGreaterThan(-1);
    expect(yer / g.length, 'Sahada Rolün hâlâ ekranın üst yarısında').toBeGreaterThan(0.5);
    // Ve yalnız TEK bir giriş olmalı; iki yerde durursa karar yarım kalmış demektir.
    expect(g.split('Sahada Rolün').length - 1).toBe(1);
  });

  it('sayfa yine de açılabiliyor — subPage kancası duruyor', () => {
    expect(ayarlar).toContain("setSubPage('role')");
    expect(ayarlar).toMatch(/<FieldRolePage[\s\S]{0,200}open=\{subPage === 'role'\}/);
  });
});
