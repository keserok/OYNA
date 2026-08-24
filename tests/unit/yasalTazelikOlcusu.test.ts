/**
 * YASAL SAYFA TAZELİĞİ — ÖLÇÜ ZAMAN DEĞİL, İÇERİK (23 Ağustos 2026)
 *
 * OLAN: Kurucu gönderim gecesi `npm run ios:gonder` çalıştırdı ve mağaza
 * denetimi "1 engel var — gönderim öncesi çözülmeli" deyip durdurdu:
 * altı yasal sayfa "kaynak değişmiş ama yeniden üretilmemiş" sayıldı.
 * Oysa sayfalar baytı baytına güncelti — yeniden üretim TEK BİR baytı bile
 * değiştirmedi.
 *
 * SEBEP: denetim `md.mtime > html.mtime` diye bakıyordu. Git zaman damgası
 * KORUMAZ; taze klonda ya da `git pull` sonrası dosyalar rastgele sırayla
 * yazılır. md, html'den bir saniye sonra yazıldığı anda alarm ötüyordu.
 *
 * NİYE ÖNEMLİ: sahte alarmın bedeli, gerçek alarmın inandırıcılığıdır.
 * Her klonda öten bir bekçi bir süre sonra hiç dinlenmez — ve gerçekten
 * bayat bir yasal metin o gün yayına çıkar.
 *
 * ÇÖZÜM: üretici her sayfaya kaynağının sha256 özetini damgalar, denetim
 * kaynağı yeniden özetleyip karşılaştırır. Bu dosya iki şeyi kilitler:
 * ölçünün zamana geri dönmemesini, ve damganın HTML YORUMU olmamasını
 * (yayın sayfalarında yorum yasak — şirket iç notları oradan sızmıştı).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const oku = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const ozetle = (metin: string) =>
  createHash('sha256').update(metin, 'utf8').digest('hex').slice(0, 16);

const CIFTLER: [string, string][] = [
  ['sozlesmeler/oyuncu/01-kullanim-sartlari.md', 'public/kullanim-sartlari.html'],
  ['sozlesmeler/oyuncu/03-kvkk-aydinlatma-metni.md', 'public/kvkk-aydinlatma.html'],
  ['sozlesmeler/oyuncu/04-kvkk-acik-riza-metni.md', 'public/kvkk-acik-riza.html'],
  ['sozlesmeler/oyuncu/05-mesafeli-satis-iptal-iade.md', 'public/mesafeli-satis.html'],
  ['sozlesmeler/oyuncu/08-veli-muvafakatnamesi.md', 'public/veli-muvafakatnamesi.html'],
  ['sozlesmeler/oyuncu/09-topluluk-kurallari.md', 'public/topluluk-kurallari.html'],
];

const damgaOku = (html: string): string | null =>
  (html.match(/name="oyna-kaynak-ozeti"\s+content="([0-9a-f]{16})"/) || [])[1] ?? null;

describe('Tazelik ölçüsü', () => {
  it('denetim ZAMAN DAMGASINA bakmaz — git onu korumaz', () => {
    const s = oku('scripts/magaza-denetim.mjs');
    // Yasal tazelik bloğunda mtime karşılaştırması olmamalı.
    const bas = s.indexOf('const uretilenler');
    const son = s.indexOf('Üretilen yasal sayfalar', bas);
    const blok = s.slice(bas, son);
    expect(blok).not.toMatch(/mtimeMs/);
    expect(blok).toContain('createHash');
  });

  it('üretici her sayfaya kaynağının özetini damgalar', () => {
    const s = oku('scripts/build-legal-pages.mjs');
    expect(s).toContain('kaynakOzeti');
    expect(s).toContain('oyna-kaynak-ozeti');
  });

  it('damga HTML YORUMU DEĞİL — yayın sayfalarında yorum yasak', () => {
    // Bu kural yasalMetinHijyeni'nin koruduğu şey: iç notlar yorumla sızmıştı.
    const s = oku('scripts/build-legal-pages.mjs');
    expect(s).not.toMatch(/<!--\s*kaynak-ozeti/);
    for (const [, html] of CIFTLER) {
      expect(oku(html).includes('<!--'), `${html} içinde HTML yorumu var`).toBe(false);
    }
  });
});

describe('Damgalar kaynaklarıyla tutuyor', () => {
  it.each(CIFTLER)('%s → %s', (md, html) => {
    const damga = damgaOku(oku(html));
    expect(damga, `${html} damgasız — build-legal-pages.mjs ile yeniden üret`).not.toBeNull();
    expect(damga, `${html} bayat — build-legal-pages.mjs ile yeniden üret`).toBe(ozetle(oku(md)));
  });
});
