// build-legal-roles.mjs
// Kanonik markdown → shared/legalDocsRol.ts (rol sözleşmeleri, düz metin).
//
//   node scripts/build-legal-roles.mjs
//
// ─── NEDEN AYRI BİR MODÜL ────────────────────────────────────────────────────
// Bu iki sözleşme 31 KB ve 39 KB. `shared/legalDocs.ts`e konsalardı, giriş
// ekranının tembel yüklediği yasal paket 70 KB büyürdü — üstelik oyuncuların
// %99'unun hiç açmayacağı iki belge için. Ayrı modülde duruyorlar ve yalnız
// kaleci/hakem/tesis rolü olan kullanıcı yasal ekranı açtığında indiriliyorlar.
//
// ─── NEDEN "ÖRNEK METİN" DAMGASI ─────────────────────────────────────────────
// Kaynak markdown'ların kendi başlıkları ikisini de TASLAK ilan ediyor ve
// "imza öncesinde lisanslı bir avukat tarafından onaylanmalıdır" diyor.
// Ayrıca imza bloğu alanları doldurulmamış: [AD SOYAD], [IBAN],
// [TİCARET SİCİL NO] ve B2B'de komisyon oranlarında [X].
//
// Böyle bir metni uygulamada damgasız göstermek, bağlayıcı bir sözleşme
// izlenimi verir — kaynak dosyanın kendi notunun yasakladığı şey tam budur.
// Kurucu kararı (24 Ağu 2026): eklensin ama BAŞINDA damga olsun.
// Damga metnin İÇİNE, ilk satıra yazılır: ayrı bir arayüz öğesi olsaydı
// belge başka bir yerde gösterildiğinde damga arkada kalırdı.
//
// ─── İÇ NOTLAR YAYINLANMAZ ───────────────────────────────────────────────────
// `>` ile başlayan bloklar şirketin kendi notlarıdır ("Durum:", "Not:",
// "Uygulandığı yer:"). build-legal-pages.mjs'teki kuralın aynısı burada da
// geçerli: bir `>` bloğu, öncesinde `<!-- YAYINLA -->` işareti YOKSA atılır.
// Unutulan her not varsayılan olarak GİZLİ kalır.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const BELGELER = [
  {
    anahtar: 'SAGLAYICI',
    md: 'sozlesmeler/kaleci-hakem/01-hizmet-saglayici-sozlesmesi.md',
    title: 'Kaleci / Hakem Hizmet Sözleşmesi',
    icon: 'Scale',
  },
  {
    anahtar: 'ISLETME',
    md: 'sozlesmeler/saha-sahibi/01-isletme-b2b-sozlesmesi.md',
    title: 'İşletme (Tesis) Sözleşmesi',
    icon: 'Building2',
  },
];

const DAMGA = `⚠️ BU METİN BİLGİ AMAÇLI ÖRNEKTİR — BAĞLAYICI DEĞİLDİR.

Aşağıdaki sözleşme, OYNA ile çalışmaya başladığında imzalayacağın metnin
örneğidir; şartları önceden okuyabilmen için burada duruyor. Henüz
imzalanmış bir sözleşme yerine geçmez ve tek başına taraflar arasında hak
ya da yükümlülük doğurmaz.

İçindeki köşeli parantezli alanlar ([AD SOYAD], [IBAN] gibi) sana özel
bilgilerle doldurulacak yerlerdir. İmzalanacak nihai nüsha, ticari
şartlarıyla birlikte sana ayrıca iletilir.

Soruların için: mirackeremcuruksulu@gmail.com

────────────────────────────────────────────────────────────

`;

/** İç notları at, markdown işaretlerini sadeleştir, düz metne indir. */
const duzMetne = (ham) => {
  const satirlar = ham.split('\n');
  const cikti = [];
  let yayinlaIsareti = false;

  for (const satir of satirlar) {
    // HTML yorumu: yalnız YAYINLA işaretini taşır, çıktıya girmez.
    if (/^\s*<!--/.test(satir)) {
      yayinlaIsareti = /YAYINLA/.test(satir);
      continue;
    }
    // `>` bloğu: işaret yoksa ATILIR (varsayılan gizli).
    if (/^\s*>/.test(satir)) {
      if (!yayinlaIsareti) continue;
      cikti.push(satir.replace(/^\s*>\s?/, ''));
      continue;
    }
    yayinlaIsareti = false;

    let s = satir;
    s = s.replace(/^#{1,6}\s+/, '');            // başlık işaretleri
    s = s.replace(/\*\*(.+?)\*\*/g, '$1');      // kalın
    s = s.replace(/(?<!\*)\*(?!\s)(.+?)(?<!\s)\*(?!\*)/g, '$1'); // italik
    s = s.replace(/`([^`]+)`/g, '$1');          // kod
    s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'); // bağlantı → yalnız metin
    s = s.replace(/^\s*[-*]\s+/, '- ');         // madde imi
    s = s.replace(/^---+$/, '────────────────');// yatay çizgi
    cikti.push(s);
  }

  return cikti
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')   // üçten fazla boş satır → iki
    .trim();
};

/** TS şablon dizesine güvenli gömme: ters tırnak ve ${ kaçışlanır. */
const kacisla = (s) => s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

const parcalar = BELGELER.map(({ anahtar, md, title, icon }) => {
  const ham = readFileSync(join(ROOT, md), 'utf8');
  const govde = DAMGA + duzMetne(ham);

  // SON SAVUNMA HATTI: iç not sızdıysa üretim DURUR.
  for (const iz of ['Durum:', 'Uygulandığı yer:', 'adversarial', 'bir iş kararıdır']) {
    if (govde.includes(iz)) {
      console.error(`✖ ${md}: iç not çıktıya sızdı → "${iz}"`);
      console.error('  Notu `>` bloğu içine al ya da ic-notlar/ altına taşı.');
      process.exit(1);
    }
  }

  return `  ${anahtar}: {
    title: '${title}',
    icon: ${icon},
    body: \`${kacisla(govde)}\`,
  },`;
}).join('\n');

const ciktiDosyasi = `// ⚠️ ÜRETİLMİŞ DOSYA — ELLE DÜZENLEME.
// Kaynak: sozlesmeler/kaleci-hakem/*.md · sozlesmeler/saha-sahibi/*.md
// Yeniden üret: node scripts/build-legal-roles.mjs
//
// Bu iki sözleşme neden ayrı modülde ve neden "örnek metin" damgalı:
// bkz. scripts/build-legal-roles.mjs dosya başı.
import type React from 'react';
import { Scale, Building2 } from 'lucide-react';

export type RolBelgeAnahtari = 'SAGLAYICI' | 'ISLETME';

export const ROL_BELGELERI: Record<
  RolBelgeAnahtari,
  { title: string; icon: React.ElementType; body: string }
> = {
${parcalar}
};
`;

writeFileSync(join(ROOT, 'shared/legalDocsRol.ts'), ciktiDosyasi, 'utf8');
console.log(`✓ shared/legalDocsRol.ts üretildi (${BELGELER.length} sözleşme, ${Math.round(ciktiDosyasi.length / 1024)} KB)`);
