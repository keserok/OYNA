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
import { readFileSync, existsSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
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
// 2b. ÜRETİCİYE karşı test — kuralın kendisi kilitleniyor, çıktısı değil
// ─────────────────────────────────────────────────────────────────────────────
//
// NEDEN BU BLOK VAR (17 Ağustos 2026 denetimi): yukarıdaki 2. bölüm yalnızca
// public/*.html'in BUGÜNKÜ hâlini kanonik md ile karşılaştırıyor. Denetçi şunu
// deneyle gösterdi: build-legal-pages.mjs'teki "varsayılan gizli" kuralı eski
// hâline ("yalnız 'Durum:' geçen blokları at") geri çevrildiğinde altı sayfa da
// BAYT BAYT AYNI çıkıyor — çünkü bugün kanonik dosyalarda kalan işaretsiz
// blokların hepsi zaten "Durum:" içeriyor. Yani düzeltme sessizce geri
// alınabiliyordu ve test paketi yeşil kalıyordu.
//
// Buradaki testler o boşluğu kapatıyor: gerçek üretici script'i geçici bir
// klasöre kopyalanıp UYDURMA bir sözleşme dosyası üzerinde çalıştırılıyor.
// Fixture bilerek hiçbir "yasak kelime" (Durum:, PR:, Bilinen açık…) içermiyor;
// bu yüzden eski süzgeç geri gelirse işaretsiz not yayına çıkar ve test KIRMIZI
// döner. Depodaki public/ dosyalarına dokunulmaz.
describe('üretici: alıntı süzgeci kuralı gerçekten uyguluyor', () => {
  // Fixture izleri: gerçek metinde asla geçmeyecek benzersiz damgalar.
  const IZ = {
    isaretsiz: 'IZ-ISARETSIZ-ALINTI',
    isaretli: 'IZ-ISARETLI-ALINTI',
    girintili: 'IZ-GIRINTILI-ALINTI',
    cokSatirliYorum: 'IZ-COK-SATIRLI-YORUM',
    duzParagraf: 'IZ-DUZ-PARAGRAF',
    ayniSatirMetin: 'IZ-AYNI-SATIR-METIN',
    sonMadde: 'IZ-SON-MADDE',
  };

  // Dikkat: hiçbir satırda "Durum:", "PR:", "Bilinen açık" gibi eski süzgecin
  // tanıdığı kalıp YOK. Süzgeç kuralı geri alınırsa notlar yayına çıkar.
  const FIXTURE = [
    '# Deneme Sözleşmesi',
    '',
    '**Son güncelleme: ' + LEGAL_UPDATED_TR + '**',
    '',
    '## 1. Genel',
    '',
    'Kullanıcıya gösterilen normal bir paragraf.',
    '',
    '> Şirket içi hatırlatma ' + IZ.isaretsiz + ' — yayına çıkmamalı.',
    '',
    '<!-- YAYINLA -->',
    '> Kullanıcıya gösterilmesi gereken uyarı ' + IZ.isaretli + ' — yayına çıkmalı.',
    '',
    '  > Girintili şirket içi hatırlatma ' + IZ.girintili + ' — yayına çıkmamalı.',
    '',
    '<!--',
    '  Çok satırlı şirket içi yorum ' + IZ.cokSatirliYorum + ' — yayına çıkmamalı.',
    '-->',
    '',
    'Serbest paragraf hâlinde yazılmış not ' + IZ.duzParagraf + '.',
    '',
    // Yorum AYNI SATIRDA kapanıyor ve ardından GERÇEK SÖZLEŞME METNİ geliyor.
    // Bu satır yanlış ele alınırsa yorumdan sonrası "çok satırlı yorum gövdesi"
    // sanılır ve dosyanın SONUNA kadar her şey sessizce silinir.
    '<!-- kısa iç not --> Bu madde ' + IZ.ayniSatirMetin + ' yayında kalmalı.',
    '',
    '## 2. Son Madde',
    '',
    'Dosyanın son maddesi ' + IZ.sonMadde + ' — silinmemeli.',
    '',
  ].join('\n');

  /**
   * GERÇEK üreticiyi geçici bir kum havuzunda fixture üzerinde çalıştırır ve
   * ürettiği tüm sayfaları tek metin olarak döndürür.
   */
  function ureticidenGecir(mdIcerik: string): string {
    const script = 'scripts/build-legal-pages.mjs';
    // Üreticinin hangi md dosyalarını beklediğini kaynağından okuyoruz; liste
    // ileride büyürse test kendi kendini uydurur, ENOENT ile patlamaz.
    const beklenen = [...oku(script).matchAll(/\{\s*md:\s*'([^']+)'/g)].map((m) => m[1]!);
    expect(beklenen.length, 'üreticide DOCS listesi bulunamadı').toBeGreaterThan(0);

    const kum = mkdtempSync(join(tmpdir(), 'oyna-yasal-'));
    try {
      mkdirSync(join(kum, 'scripts'), { recursive: true });
      mkdirSync(join(kum, 'sozlesmeler', 'oyuncu'), { recursive: true });
      mkdirSync(join(kum, 'public'), { recursive: true });
      copyFileSync(join(KOK, script), join(kum, script));
      for (const ad of beklenen) writeFileSync(join(kum, 'sozlesmeler', 'oyuncu', ad), mdIcerik, 'utf8');

      execFileSync(process.execPath, [join(kum, script)], { stdio: 'pipe' });

      return readdirSync(join(kum, 'public'))
        .filter((f) => f.endsWith('.html') && f !== 'yasal.html')
        .map((f) => readFileSync(join(kum, 'public', f), 'utf8'))
        .join('\n');
    } finally {
      rmSync(kum, { recursive: true, force: true });
    }
  }

  const cikti = ureticidenGecir(FIXTURE);

  it('işaretsiz alıntı bloğu YAYINLANMAZ (süzgeç eski hâline dönerse kırmızı)', () => {
    expect(
      cikti.includes(IZ.isaretsiz),
      'İşaretsiz `>` bloğu yayına sızdı — "varsayılan gizli" kuralı çalışmıyor.',
    ).toBe(false);
  });

  it('<!-- YAYINLA --> işaretli blok YAYINLANIR (süzgeç metni kesmiyor)', () => {
    // Karşı yön: kural fazla agresifleşip kullanıcıya gösterilmesi GEREKEN
    // damgayı da yutarsa (ör. md. 6.5 "YÜRÜRLÜKTE DEĞİLDİR"), bu test yakalar.
    expect(
      cikti.includes(IZ.isaretli),
      'İşaretli blok yayına çıkmadı — kullanıcıya gösterilmesi gereken uyarı kayboluyor.',
    ).toBe(true);
  });

  it('GİRİNTİLİ işaretsiz alıntı da YAYINLANMAZ', () => {
    // Delik 1: süzgeç `startsWith('>')` kullanırken "  > not" satırı kaçıyordu.
    expect(
      cikti.includes(IZ.girintili),
      'Girintili `>` bloğu yayına sızdı — süzgeç satır başındaki boşluğu atlamıyor.',
    ).toBe(false);
  });

  it('ÇOK SATIRLI HTML yorumu YAYINLANMAZ', () => {
    // Delik 2: tek satırlık yorum kalıbı çok satırlı yorumun hiçbir satırıyla
    // eşleşmiyordu; yorum gövdesi olduğu gibi yayına çıkıyordu.
    expect(
      cikti.includes(IZ.cokSatirliYorum),
      'Çok satırlı `<!-- ... -->` yorumu yayına sızdı.',
    ).toBe(false);
  });

  it('düz paragraf hâlindeki not YAYINLANIR — bu bilinçli bir sınır', () => {
    // DÜRÜSTLÜK NOTU: bu bir kusur DEĞİL, kabul edilmiş bir sınır. Her paragrafı
    // şüpheli sayan bir kural sözleşme metnini keser ve kullanıcıya eksik metin
    // gösterir. Koruma kural değil YER ile sağlanıyor: iç notlar
    // sozlesmeler/ic-notlar/ altında durur, üretici o klasörü hiç okumaz.
    // Bu test o sınırı KAYIT ALTINA alıyor; biri ileride paragraf kuralı yazarsa
    // burası kırmızı döner ve kararın bilinçli olduğu hatırlanır.
    expect(cikti.includes(IZ.duzParagraf)).toBe(true);

    // Sınırın karşılığı: iç not klasörü gerçekten var ve üretici onu okumuyor.
    expect(existsSync(join(KOK, 'sozlesmeler/ic-notlar/ACIK-KONULAR.md'))).toBe(true);
    expect(oku('scripts/build-legal-pages.mjs')).toContain('sozlesmeler/ic-notlar/');
  });

  // ── SÜZGEÇ METNİ YEMESİN: susturmak, sızdırmaktan DAHA TEHLİKELİ ──────────
  // Yorum bekçisi bir kez fazla geniş yazıldı: `<!-- not --> Madde metni` gibi
  // bir satır "çok satırlı yorum başladı" sanıldı ve o satırdan dosya SONUNA
  // kadar her şey — gerçek sözleşme maddeleri — sessizce silindi. Script yine
  // "başarılı" dedi. Sızan bir not GÖRÜNÜR; silinen bir madde GÖRÜNMEZ.
  it('yorum AYNI SATIRDA kapanıyorsa ardındaki METİN KORUNUR', () => {
    expect(
      cikti.includes(IZ.ayniSatirMetin),
      'Yorumdan sonraki sözleşme metni silindi — bekçi fazla geniş yazılmış.',
    ).toBe(true);
  });

  it('yorumdan SONRAKİ maddeler de yerinde durur (dosya sonuna kadar silinmez)', () => {
    expect(
      cikti.includes(IZ.sonMadde),
      'Yorum satırından sonrası tamamen uçmuş — sessiz metin kaybı.',
    ).toBe(true);
  });

  it('KAPATILMAMIŞ yorum sessizce metin yutmaz, derlemeyi DURDURUR', () => {
    // Bu durumda doğru davranış "elinden geleni yap" değil, DURMAK: eksik bir
    // sözleşmeyi yayınlamaktansa derleme çöksün, kurucu hatayı görsün.
    const bozuk = FIXTURE.replace('<!-- kısa iç not -->', '<!-- kapatilmamis yorum');
    expect(() => ureticidenGecir(bozuk)).toThrow();
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

  // ÜRETİLEN sayfalarla sınırlı kalmak yetmedi: public/cerez-politikasi.html
  // ELLE tutuluyor, üretici listesinde değil ve diğer 8 belge 15.07.2026'ya
  // çekilirken 12.07.2026'da kalmıştı. Uygulama içi metin bir gün, paketteki
  // sayfa başka bir gün diyordu. Bu yüzden tarama artık public altındaki HER
  // .html'i kapsıyor — elle tutulanlar dahil.
  it.each(yayinSayfalari())('%s içindeki her "Son güncelleme" tarihi LEGAL_UPDATED_TR', (yol, icerik) => {
    const bulunanlar = [...icerik.matchAll(/Son güncelleme:?\**\s*(\d{2}\.\d{2}\.\d{4})/g)].map((m) => m[1]);
    for (const t of bulunanlar) expect(t, `${yol}: sayfadaki tarih diğer belgelerden farklı`).toBe(LEGAL_UPDATED_TR);
  });

  // Yukarıdaki test tarih SATIRI SİLİNEREK de susturulabilirdi. Bu yüzden hangi
  // sayfaların tarih taşımak ZORUNDA olduğu ayrıca kilitleniyor.
  // (public/hesap-silme.html ve public/yasal.html listede yok: ikisi de sözleşme
  //  metni değil — biri adım adım yol tarifi, diğeri belge indeksi.)
  const TARIH_ZORUNLU = [
    ...URETILEN.map(([, htmlAd]) => htmlAd),
    'gizlilik.html',        // elle tutuluyor
    'cerez-politikasi.html', // elle tutuluyor
  ];

  it.each(TARIH_ZORUNLU)('public/%s "Son güncelleme" satırını taşıyor', (htmlAd) => {
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
