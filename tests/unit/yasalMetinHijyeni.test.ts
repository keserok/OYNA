// Denetim A10 bekçisi — yasal metin hijyeni.
//
// Kilitlenen sözler:
//   1. Şirketin iç notu ("Bilinen açık: ... henüz değerlendirilmedi" gibi) hiçbir
//      yayınlanmış sayfada görünmez. İç notlar sozlesmeler/ic-notlar/ altında durur
//      ve oradan asla yayına çıkmaz.
//   2. Alıntı (>) blokları "varsayılan gizli"dir: <!-- YAYINLA --> işareti almayan
//      bir blok yayına çıkarsa test patlar. Yani ileride eklenecek yeni bir not,
//      kimse fark etmese bile burada yakalanır.
//   3. Yürürlük tarihi tek: kanonik md'ler, üretilen sayfalar ve uygulama içi metin
//      aynı günü gösterir. (Kullanıcı hangi metne onay verdi sorusu cevapsız kalmasın.)
//   4. Cüzdan/para çekimi/bakiye sözü yalnızca md. 6.5'in "YÜRÜRLÜKTE DEĞİLDİR"
//      damgası altında kalabilir. Damganın dışındaki her para cümlesi karttan/karta
//      demek zorundadır — uygulama içi metin ile yayındaki metin çelişemez.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { DOCS } from '../../shared/legalDocs';
import { LEGAL_UPDATED_TR } from '../../shared/legalVersion';

const KOK = process.cwd();
const oku = (p: string) => readFileSync(join(KOK, p), 'utf8');

// build-legal-pages.mjs'in ürettiği sayfalar (elle tutulan 3 sayfa listede yok).
const URETILEN: Array<[md: string, html: string]> = [
  ['01-kullanim-sartlari.md', 'kullanim-sartlari.html'],
  ['03-kvkk-aydinlatma-metni.md', 'kvkk-aydinlatma.html'],
  ['04-kvkk-acik-riza-metni.md', 'kvkk-acik-riza.html'],
  ['05-mesafeli-satis-iptal-iade.md', 'mesafeli-satis.html'],
  ['08-veli-muvafakatnamesi.md', 'veli-muvafakatnamesi.html'],
  ['09-topluluk-kurallari.md', 'topluluk-kurallari.html'],
];

const yayinSayfalari = () =>
  readdirSync(join(KOK, 'public'))
    .filter((f) => f.endsWith('.html'))
    .map((f) => ['public/' + f, oku('public/' + f)] as const);

// ─────────────────────────────────────────────────────────────────────────────
// 1. İç not sızıntısı
// ─────────────────────────────────────────────────────────────────────────────
describe('şirketin iç notu yayında görünmüyor', () => {
  // Yayına çıktığı tespit edilen gerçek ifadeler + iç metadata alan adları.
  const YASAK = [
    'Bilinen açık',
    'henüz değerlendirilmedi',
    'teyit edilmelidir',
    'uyum takip paneli',
    'Uygulandığı yer',
    'Uygulandığı yerler',
    'Durum:',
    'PR:',
  ];

  it.each(yayinSayfalari())('%s temiz', (_yol, icerik) => {
    for (const kalip of YASAK) expect(icerik).not.toContain(kalip);
  });

  it('HTML yorumu hiçbir yayın sayfasında yok (işaretler çıktıya sızmaz)', () => {
    for (const [yol, icerik] of yayinSayfalari()) {
      expect(icerik.includes('<!--'), `${yol} içinde HTML yorumu var`).toBe(false);
    }
  });

  it('iç not dosyası ayrı klasörde duruyor ve bilgi kaybolmadı', () => {
    const notlar = oku('sozlesmeler/ic-notlar/ACIK-KONULAR.md');
    // Sözleşmelerden çıkarılan iki notun da karşılığı burada olmalı.
    expect(notlar).toContain('6563');
    expect(notlar).toContain('Ticaret Bakanlığı');
    expect(notlar).toContain('İYS');
  });

  it('ic-notlar klasörü yayın kaynağı değil', () => {
    const script = oku('scripts/build-legal-pages.mjs');
    // Yayın kaynağı tek klasöre sabitlenmiş ve sert kontrol var.
    expect(script).toContain("resolve(ROOT, 'sozlesmeler', 'oyuncu')");
    expect(script).toContain('iç notlar yayınlanamaz');

    // Yayın listesindeki her giriş, sozlesmeler/oyuncu altında düz bir dosya adı
    // olmalı — "../ic-notlar/..." gibi bir yol listeye hiç girememeli.
    const girisler = [...script.matchAll(/\{\s*md:\s*'([^']+)'/g)].map((m) => m[1]);
    expect(girisler.length).toBeGreaterThan(0);
    for (const g of girisler) {
      expect(g).toMatch(/^\d\d-[a-z0-9-]+\.md$/);
      expect(existsSync(join(KOK, 'sozlesmeler/oyuncu', g)), `${g} kanonik klasörde yok`).toBe(true);
    }

    // İç not dosyasının hiçbir cümlesi yayına düşmemiş olmalı.
    for (const [yol, icerik] of yayinSayfalari()) {
      expect(icerik.includes('ACIK-KONULAR'), `${yol}`).toBe(false);
      expect(icerik.includes('YAYINLANMAZ'), `${yol}`).toBe(false);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Süzgeç tersine çevrildi: işaretlenmeyen alıntı bloğu yayınlanmaz
// ─────────────────────────────────────────────────────────────────────────────
describe('alıntı blokları varsayılan olarak gizli', () => {
  const ISARET = /^\s*<!--\s*YAYINLA\s*-->\s*$/;

  // Bir md dosyasındaki `>` bloklarını, öncesinde YAYINLA işareti olup olmadığıyla
  // birlikte döndürür.
  function bloklar(md: string) {
    const satirlar = md.replace(/\r/g, '').split('\n');
    const cikti: Array<{ metin: string; isaretli: boolean }> = [];
    let isaretli = false;
    for (let i = 0; i < satirlar.length; i++) {
      const s = satirlar[i];
      if (ISARET.test(s)) { isaretli = true; continue; }
      if (s.startsWith('>')) {
        const buf: string[] = [];
        while (i < satirlar.length && satirlar[i].startsWith('>')) { buf.push(satirlar[i].replace(/^>\s?/, '')); i++; }
        i--;
        cikti.push({ metin: buf.join(' ').trim(), isaretli });
        isaretli = false;
        continue;
      }
      if (s.trim() !== '') isaretli = false;
    }
    return cikti;
  }

  // Markdown vurgusunu ve HTML etiketlerini atıp karşılaştırılabilir düz metin verir.
  const duz = (s: string) =>
    s.replace(/<[^>]+>/g, '').replace(/[*`\[\]]/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

  it.each(URETILEN)('%s → %s: işaretsiz blok yayınlanmamış, işaretli blok yayınlanmış', (mdAd, htmlAd) => {
    const md = oku('sozlesmeler/oyuncu/' + mdAd);
    const html = duz(oku('public/' + htmlAd));

    for (const b of bloklar(md)) {
      // Kısa bloklarda yanlış eşleşme olmasın diye ilk 60 karakterle arıyoruz.
      const iz = duz(b.metin).slice(0, 60);
      if (!iz) continue;
      if (b.isaretli) {
        expect(html.includes(iz), `${mdAd}: <!-- YAYINLA --> işaretli blok yayına çıkmamış → "${iz}"`).toBe(true);
      } else {
        expect(html.includes(iz), `${mdAd}: işaretsiz blok yayına sızmış → "${iz}"`).toBe(false);
      }
    }
  });

  it('kullanıcıya lazım olan iki blok bilinçli olarak işaretli', () => {
    const sartlar = oku('sozlesmeler/oyuncu/01-kullanim-sartlari.md');
    // md. 6.5 damgası ve md. 4.7 veli akışı notu kullanıcıya gösterilmeli.
    expect(sartlar).toMatch(/<!--\s*YAYINLA\s*-->\s*\n>\s*\*\*YÜRÜRLÜKTE DEĞİLDİR/);
    expect(oku('public/kullanim-sartlari.html')).toContain('YÜRÜRLÜKTE DEĞİLDİR');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Tarih tutarlılığı
// ─────────────────────────────────────────────────────────────────────────────
describe('yürürlük tarihi tek', () => {
  const mdDosyalari = readdirSync(join(KOK, 'sozlesmeler/oyuncu')).filter((f) => f.endsWith('.md'));

  it.each(mdDosyalari)('%s içindeki her "Son güncelleme" tarihi LEGAL_UPDATED_TR ile aynı', (ad) => {
    const metin = oku('sozlesmeler/oyuncu/' + ad);
    const bulunanlar = [...metin.matchAll(/Son güncelleme:?\**\s*(\d{2}\.\d{2}\.\d{4})/g)].map((m) => m[1]);
    expect(bulunanlar.length, `${ad}: hiç "Son güncelleme" tarihi yok`).toBeGreaterThan(0);
    for (const t of bulunanlar) expect(t).toBe(LEGAL_UPDATED_TR);
  });

  it.each(URETILEN)('%s sayfası (%s) aynı tarihi gösteriyor', (_md, htmlAd) => {
    const html = oku('public/' + htmlAd);
    const m = html.match(/<p class="meta">Son güncelleme: (\d{2}\.\d{2}\.\d{4})/);
    expect(m, `${htmlAd}: meta satırında tarih yok`).not.toBeNull();
    expect(m![1]).toBe(LEGAL_UPDATED_TR);
  });

  it('uygulama içi metin tarihi tek kaynaktan okuyor', () => {
    const kaynak = oku('shared/legalDocs.ts');
    expect(kaynak).toContain("import { LEGAL_UPDATED_TR } from './legalVersion'");
    // Gövdelerde elle yazılmış gg.aa.yyyy tarih olmamalı; yalnızca ${UPDATED}.
    expect(kaynak).not.toMatch(/Son güncelleme: \d{2}\.\d{2}\.\d{4}/);
    for (const [anahtar, belge] of Object.entries(DOCS)) {
      expect(belge.body, `${anahtar}: tarih satırı yok`).toContain(`Son güncelleme: ${LEGAL_UPDATED_TR}`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Cüzdan kalıntısı yok / iki kaynak çelişmiyor
// ─────────────────────────────────────────────────────────────────────────────
describe('cüzdan sözü yalnız damganın altında', () => {
  const PARA = /cüzdan|bakiye|para çekim|çekim talebi|%5 hizmet bedeli|100 ₺/i;
  // Damga dışında kalan bir para cümlesi ancak bunlardan birini söylüyorsa geçerli:
  // "karta iade", "bakiye tutulmaz" gibi bugün gerçekten doğru olan ifadeler.
  const GUVENLI = /karta|kartınıza|ödeme aracınıza|bakiye tutmaz|bakiye tutulmaz|bakiye tutmadığından|bakiyeye aktarılmaz|bakiyeye DEĞİL|YÜRÜRLÜKTE DEĞİLDİR|yürürlükte değildir|yürürlükte olmadığından/i;

  // metni 6.5 bölgesi / dışı diye ikiye ayırır.
  function ayir(satirlar: string[], basla: RegExp, bitir: RegExp) {
    const i = satirlar.findIndex((s) => basla.test(s));
    if (i < 0) return { icinde: [] as string[], disinda: satirlar };
    let j = satirlar.findIndex((s, k) => k > i && bitir.test(s));
    if (j < 0) j = satirlar.length;
    return { icinde: satirlar.slice(i, j), disinda: [...satirlar.slice(0, i), ...satirlar.slice(j)] };
  }

  const KAYNAKLAR: Array<[ad: string, satirlar: string[], basla: RegExp, bitir: RegExp]> = [
    ['shared/legalDocs.ts → TERMS', DOCS.TERMS.body.split('\n'), /^6\.5 Cüzdan ve Para Çekimi/, /^7\. KULLANICI YÜKÜMLÜLÜKLERİ/],
    ['sozlesmeler/oyuncu/01-kullanim-sartlari.md', oku('sozlesmeler/oyuncu/01-kullanim-sartlari.md').split('\n'), /^### 6\.5 Cüzdan ve Para Çekimi/, /^## 7\./],
    ['public/kullanim-sartlari.html', oku('public/kullanim-sartlari.html').split('\n'), /<h3>6\.5 Cüzdan ve Para Çekimi<\/h3>/, /<h2>7\./],
  ];

  it.each(KAYNAKLAR)('%s — 6.5 dışındaki para cümleleri karttan/karta diyor', (ad, satirlar, basla, bitir) => {
    const { disinda } = ayir(satirlar, basla, bitir);
    const kotu = disinda.filter((s) => PARA.test(s) && !GUVENLI.test(s));
    expect(kotu, `${ad}: damga dışında sahipsiz cüzdan cümlesi`).toEqual([]);
  });

  it.each(KAYNAKLAR)('%s — 6.5 bölgesi damgayla başlıyor', (ad, satirlar, basla, bitir) => {
    const { icinde } = ayir(satirlar, basla, bitir);
    expect(icinde.length, `${ad}: 6.5 bölümü bulunamadı`).toBeGreaterThan(0);
    // Damga, cüzdan anlatımından ÖNCE gelmeli; yoksa kullanıcı önce vaadi okur.
    const damga = icinde.findIndex((s) => /YÜRÜRLÜKTE DEĞİLDİR/.test(s));
    const vaat = icinde.findIndex((s) => /%5 hizmet bedeli|100 ₺/.test(s));
    expect(damga, `${ad}: 6.5 damgası kayıp`).toBeGreaterThanOrEqual(0);
    if (vaat >= 0) expect(damga).toBeLessThan(vaat);
  });

  it('06 dışındaki sayfalarda damgasız cüzdan vaadi yok', () => {
    for (const [yol, icerik] of yayinSayfalari()) {
      if (yol === 'public/kullanim-sartlari.html') continue; // 6.5 bölgesi yukarıda ayrıca denetlendi
      for (const satir of icerik.split('\n')) {
        if (!PARA.test(satir)) continue;
        expect(GUVENLI.test(satir), `${yol}: damgasız cüzdan cümlesi → ${satir.slice(0, 120)}`).toBe(true);
      }
    }
  });

  it('hesap silme metni bakiye engeli vaat etmiyor', () => {
    const md = oku('sozlesmeler/oyuncu/07-hesap-silme-bilgilendirmesi.md');
    expect(md).not.toContain('hesabınız silinemez');
    expect(md).toContain('bakiye (cüzdan) tutmaz');
  });

  it('mesafeli satış: md ile uygulama içi metin aynı şeyi söylüyor', () => {
    const md = oku('sozlesmeler/oyuncu/05-mesafeli-satis-iptal-iade.md');
    const uygulama = DOCS.SALES.body;
    // İade hedefi tek: karta. "hesabınıza" gibi bakiye çağrışımı kalmamalı.
    expect(md).not.toContain('kartınıza/hesabınıza');
    for (const kaynak of [md, uygulama]) {
      expect(kaynak).toContain('kullanıcı adına bakiye (cüzdan) tutmaz');
      expect(kaynak).toMatch(/tesis kendi ücretsiz iptal süresini farklı belirleyebilir/);
    }
  });

  it('kullanım şartları md. 6.2 iki kaynakta da damgaya atıf yapıyor', () => {
    expect(DOCS.TERMS.body).toContain("Madde 6.5'teki cüzdan düzenlemesi YÜRÜRLÜKTE DEĞİLDİR");
    expect(oku('sozlesmeler/oyuncu/01-kullanim-sartlari.md')).toContain(
      "Madde 6.5'teki cüzdan düzenlemesi **YÜRÜRLÜKTE DEĞİLDİR**",
    );
  });

  it('reşit olmayan kullanıcı maddesinde cüzdan yükleme kalıntısı yok', () => {
    expect(DOCS.TERMS.body).not.toContain('cüzdana bakiye yükleme');
    expect(oku('sozlesmeler/oyuncu/01-kullanim-sartlari.md')).not.toContain('cüzdana bakiye yükleme');
  });
});

describe('yasal dosyalar yerinde', () => {
  it.each([
    'scripts/build-legal-pages.mjs',
    'sozlesmeler/ic-notlar/ACIK-KONULAR.md',
    ...URETILEN.map(([, h]) => 'public/' + h),
  ])('%s var', (y) => {
    expect(existsSync(join(KOK, y))).toBe(true);
  });
});
