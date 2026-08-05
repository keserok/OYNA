#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// TASARIM KİTİ ÜRETİCİSİ  ·  npm run tasarim:kit
// ════════════════════════════════════════════════════════════════════════════
//
// NE YAPAR: `design-kit/` klasörünü kaynaktan yeniden üretir. O klasör, tasarım
// araçlarına (Claude Design) verilen "ön yüz odaklı alt klasördür": uygulamanın
// TAMAMI yerine yalnız görsel dili anlatan dosyaları taşır.
//
// NEDEN ÜRETİLİYOR, ELLE YAZILMIYOR: içindeki kod dosyaları kaynağın AYNASIDIR.
// Elle kopyalanan bir ayna, kaynak değişince sessizce eskir; kimse fark etmez.
// Burada iki güvence var:
//   1. `npm run tasarim:kit`          → aynayı kaynaktan yeniden yazar,
//   2. `npm run tasarim:kit -- --kontrol` → sapma varsa HATA verir (sessiz eskime yok).
//
// EL DEĞMEYEN DOSYALAR: design-kit/*.md ve onizleme.html'in metinleri elle
// yazılır; bu betik yalnız onların TOKEN'DAN BESLENEN bölümlerini (aşağıdaki
// `OYNA:BASLA/BITIS` işaretleri arası) yeniden doldurur. Böylece renk/ölçü
// değerleri belgelerde de asla elle güncellenmez.
// ════════════════════════════════════════════════════════════════════════════

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const KOK = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KIT = join(KOK, 'design-kit');
const KONTROL = process.argv.includes('--kontrol');

// ── Aynalanan dosyalar ──────────────────────────────────────────────────────
// Liste BİLİNÇLİ olarak kısadır. Kit'in işi uygulamayı taşımak değil, görsel
// dili öğretmektir: token'lar, ortak bileşenler ve üç örnek ekran yeter.
// Yeni dosya eklerken sor: "bunu görmeden tasarım yanlış çizilir mi?" Cevap
// hayırsa ekleme — kit büyüdükçe sinyal düşer.
const AYNALAR = [
  // Sözlükler — punto ölçeği ve ekran adları
  ['ui/type.ts', 'temel/type.ts'],
  ['ui/labels.ts', 'temel/labels.ts'],

  // Uygulamanın tam stil dosyası (token'ların ve kuralların tek doğru kaynağı)
  ['index.css', 'stil/index.css'],

  // Arayüz ilkelleri (components/ui) — hepsi
  ['components/ui/ActionSheet.tsx', 'bilesenler/ui/ActionSheet.tsx'],
  ['components/ui/Avatar.tsx', 'bilesenler/ui/Avatar.tsx'],
  ['components/ui/BottomSheet.tsx', 'bilesenler/ui/BottomSheet.tsx'],
  ['components/ui/Chip.tsx', 'bilesenler/ui/Chip.tsx'],
  ['components/ui/ConfirmDialog.tsx', 'bilesenler/ui/ConfirmDialog.tsx'],
  ['components/ui/ConfirmSheet.tsx', 'bilesenler/ui/ConfirmSheet.tsx'],
  ['components/ui/EmptyState.tsx', 'bilesenler/ui/EmptyState.tsx'],
  ['components/ui/FilterDropdown.tsx', 'bilesenler/ui/FilterDropdown.tsx'],
  ['components/ui/GlassModal.tsx', 'bilesenler/ui/GlassModal.tsx'],
  ['components/ui/IconButton.tsx', 'bilesenler/ui/IconButton.tsx'],
  ['components/ui/OwnerIconButton.tsx', 'bilesenler/ui/OwnerIconButton.tsx'],
  ['components/ui/SegmentedTabs.tsx', 'bilesenler/ui/SegmentedTabs.tsx'],
  ['components/ui/SkeletonList.tsx', 'bilesenler/ui/SkeletonList.tsx'],
  ['components/ui/Spinner.tsx', 'bilesenler/ui/Spinner.tsx'],
  ['components/ui/useConfirmSheet.tsx', 'bilesenler/ui/useConfirmSheet.tsx'],

  // Ortak yapı taşları
  ['components/common/PageLayout.tsx', 'bilesenler/common/PageLayout.tsx'],
  ['components/common/UserAvatar.tsx', 'bilesenler/common/UserAvatar.tsx'],
  ['components/common/StatusState.tsx', 'bilesenler/common/StatusState.tsx'],
  ['components/common/Toast.tsx', 'bilesenler/common/Toast.tsx'],
  ['components/common/PhotoCarousel.tsx', 'bilesenler/common/PhotoCarousel.tsx'],

  // Ana sayfanın yapı taşları (onaylı tasarımın parçaları)
  ['components/dashboard/HomePieces.tsx', 'bilesenler/dashboard/HomePieces.tsx'],
  ['components/dashboard/OynaMarks.tsx', 'bilesenler/dashboard/OynaMarks.tsx'],

  // Sık görünen bileşenler
  ['components/AnimatedButton.tsx', 'bilesenler/AnimatedButton.tsx'],
  ['components/BottomNav.tsx', 'bilesenler/BottomNav.tsx'],
  ['components/OynaLogo.tsx', 'bilesenler/OynaLogo.tsx'],
  ['components/BookingCard.tsx', 'bilesenler/BookingCard.tsx'],
  ['components/MatchJoinCard.tsx', 'bilesenler/MatchJoinCard.tsx'],

  // Örnek ekranlar — üç ayrı düzen dili: ana sayfa · liste · profil
  ['views/Dashboard.tsx', 'ekranlar/Dashboard.tsx'],
  ['views/MatchDiscovery.tsx', 'ekranlar/MatchDiscovery.tsx'],
  ['views/ProfileScreen.tsx', 'ekranlar/ProfileScreen.tsx'],
];

// Betiğin YÖNETTİĞİ klasörler. Bu klasörlerde listede olmayan bir dosya
// kalırsa artık kaynağı olmayan bir aynadır — silinir (kontrol modunda bildirilir).
const YONETILEN_KLASORLER = ['temel', 'stil', 'bilesenler', 'ekranlar'];

// ── Yardımcılar ─────────────────────────────────────────────────────────────

const sapmalar = [];
const bilgi = [];

function oku(gorecelYol) {
  const tam = join(KOK, gorecelYol);
  if (!existsSync(tam)) {
    console.error(`\n✖ Kaynak dosya yok: ${gorecelYol}`);
    console.error('  Dosya taşındıysa scripts/tasarim-kiti.mjs içindeki listeyi güncelle.\n');
    process.exit(1);
  }
  return readFileSync(tam, 'utf8');
}

/** Aynaya konan her dosyanın başındaki uyarı. Kaynağı ve tazeleme komutunu söyler. */
function basligiEkle(kaynakYolu, icerik) {
  return (
    `/* ─────────────────────────────────────────────────────────────────────────\n` +
    `   OYNA TASARIM KİTİ · SALT OKUNUR AYNA — BU DOSYAYI DÜZENLEME.\n` +
    `   Kaynak: ${kaynakYolu}\n` +
    `   Değişiklik kaynakta yapılır, sonra: npm run tasarim:kit\n` +
    `   ───────────────────────────────────────────────────────────────────────── */\n` +
    icerik
  );
}

function yazVeyaKarsilastir(hedefGoreceli, icerik) {
  const tam = join(KIT, hedefGoreceli);
  if (KONTROL) {
    if (!existsSync(tam)) { sapmalar.push(`eksik: design-kit/${hedefGoreceli}`); return; }
    if (readFileSync(tam, 'utf8') !== icerik) sapmalar.push(`eskimiş: design-kit/${hedefGoreceli}`);
    return;
  }
  mkdirSync(dirname(tam), { recursive: true });
  writeFileSync(tam, icerik);
}

function ozet(metin) {
  return createHash('sha256').update(metin).digest('hex').slice(0, 12);
}

/** `@theme { … }` bloğunu süslü parantezleri sayarak ayıklar. */
function themeBlogu(css) {
  const basla = css.indexOf('@theme');
  if (basla === -1) { console.error('✖ index.css içinde @theme bloğu bulunamadı.'); process.exit(1); }
  const ilkSuslu = css.indexOf('{', basla);
  let derinlik = 0;
  for (let i = ilkSuslu; i < css.length; i++) {
    if (css[i] === '{') derinlik++;
    else if (css[i] === '}') {
      derinlik--;
      if (derinlik === 0) return css.slice(basla, i + 1);
    }
  }
  console.error('✖ @theme bloğu kapanmıyor.');
  process.exit(1);
}

/** @theme içindeki `--ad: değer;` satırlarını sırayla çıkarır. */
function tokenlar(themeCss) {
  const cikti = [];
  for (const satir of themeCss.split('\n')) {
    const m = satir.match(/^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/i);
    if (!m) continue;
    const not = satir.slice(m[0].length).match(/\/\*\s*(.*?)\s*\*\//);
    cikti.push({ ad: m[1], deger: m[2].trim(), not: not ? not[1] : '' });
  }
  return cikti;
}

/** ui/type.ts içindeki punto ölçeğini (ad → px + açıklama) çıkarır. */
function puntoOlcegi(typeTs) {
  const pxBlok = typeTs.match(/TYPE_PX[^=]*=\s*\{([\s\S]*?)\n\};/);
  if (!pxBlok) { console.error('✖ ui/type.ts içinde TYPE_PX bulunamadı.'); process.exit(1); }
  const px = {};
  for (const m of pxBlok[1].matchAll(/^\s*([A-Za-z0-9_]+)\s*:\s*([\d.]+),/gm)) px[m[1]] = Number(m[2]);

  // Açıklamalar `type_` bloğundaki JSDoc satırlarından gelir.
  const aciklama = {};
  const typeBlok = typeTs.match(/export const type_ = \{([\s\S]*?)\n\} as const;/);
  if (typeBlok) {
    for (const m of typeBlok[1].matchAll(/\/\*\*([\s\S]*?)\*\/\s*\n\s*([A-Za-z0-9_]+)\s*:/g)) {
      aciklama[m[2]] = m[1].replace(/\n\s*\*?/g, ' ').replace(/\s+/g, ' ').trim();
    }
  }
  return Object.entries(px).map(([ad, deger]) => ({ ad, px: deger, aciklama: aciklama[ad] || '' }));
}

const kacir = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Kaçırılmış metindeki `ters tırnaklı` kelimeleri <code> olarak çizer. */
const kodlu = (s) => kacir(s).replace(/`([^`]+)`/g, '<code>$1</code>');

/** onizleme.html içindeki `OYNA:BASLA ad` … `OYNA:BITIS ad` arasını doldurur. */
function bolumuDoldur(html, ad, icerik) {
  const desen = new RegExp(`(<!-- OYNA:BASLA ${ad} -->)[\\s\\S]*?(<!-- OYNA:BITIS ${ad} -->)`);
  if (!desen.test(html)) {
    console.error(`✖ onizleme.html içinde "${ad}" bölüm işareti yok.`);
    process.exit(1);
  }
  return html.replace(desen, `$1\n${icerik}\n$2`);
}

// ── 1) Kod aynaları ─────────────────────────────────────────────────────────

const manifest = [];
for (const [kaynak, hedef] of AYNALAR) {
  const icerik = basligiEkle(kaynak, oku(kaynak));
  yazVeyaKarsilastir(hedef, icerik);
  manifest.push({ ayna: hedef, kaynak, satir: icerik.split('\n').length, ozet: ozet(icerik) });
}

// Kaynağı kalmamış aynaları temizle
const beklenen = new Set(AYNALAR.map(([, h]) => h));
for (const klasor of YONETILEN_KLASORLER) {
  const tam = join(KIT, klasor);
  if (!existsSync(tam)) continue;
  const gez = (dizin) => {
    for (const ad of readdirSync(dizin)) {
      const p = join(dizin, ad);
      if (statSync(p).isDirectory()) { gez(p); continue; }
      const goreceli = relative(KIT, p).split('\\').join('/');
      if (goreceli === 'stil/theme.css') continue; // aşağıda üretiliyor
      if (beklenen.has(goreceli)) continue;
      if (KONTROL) sapmalar.push(`kaynağı yok: design-kit/${goreceli}`);
      else { rmSync(p); bilgi.push(`silindi (kaynağı yok): ${goreceli}`); }
    }
  };
  gez(tam);
}

// ── 2) Token dosyası (index.css @theme bloğundan) ───────────────────────────

const indexCss = oku('index.css');
const theme = themeBlogu(indexCss);
const tokenListesi = tokenlar(theme);

const themeCiktisi = basligiEkle(
  'index.css (@theme bloğu)',
  `/* OYNA tasarım token'ları — renk, punto, boşluk, köşe ve kart ölçüleri.\n` +
  `   Bu blok uygulamanın index.css dosyasından OLDUĞU GİBİ alınır; ekrandaki\n` +
  `   her ölçü buradan çözülür. Tasarımda kullanılan bir değer burada yoksa,\n` +
  `   önce buraya token olarak eklenir. */\n\n${theme}\n`,
);
yazVeyaKarsilastir('stil/theme.css', themeCiktisi);

// ── 3) Önizleme sayfasının üretilen bölümleri ───────────────────────────────

const onizlemeYolu = join(KIT, 'onizleme.html');
if (existsSync(onizlemeYolu)) {
  let html = readFileSync(onizlemeYolu, 'utf8');

  // 3a) Token değişkenleri — önizleme kendi renklerini token'dan çözer
  const degiskenler =
    '  <style>\n    :root {\n' +
    tokenListesi.map((t) => `      ${t.ad}: ${t.deger};`).join('\n') +
    '\n    }\n  </style>';
  html = bolumuDoldur(html, 'DEGISKENLER', degiskenler);

  // 3b) Renk kartları — rol bazlı öbekler
  const OBEKLER = [
    ['Birincil aksiyon', (a) => /^--color-(primary|on-primary)$/.test(a)],
    ['Yüzeyler ve çizgiler', (a) => /^--color-(bg|bg-main|surface-\d|line|line-strong)$/.test(a)],
    ['Mürekkep merdiveni (metin)', (a) => /^--color-(ink|ink-\d|text-)/.test(a)],
    ['Durum dili', (a) => /^--color-(success|warning|error|info|on-error-fill|on-info-fill)/.test(a)],
    ['Kategori aksanları (ana sayfa)', (a) => /^--color-cat-/.test(a)],
    ['Para', (a) => /^--color-money-/.test(a)],
    // Yakalayıcı öbek: yarın index.css'e eklenen bir renk token'ı yukarıdaki
    // öbeklerin hiçbirine uymazsa önizlemeden SESSİZCE düşmesin diye burada
    // toplanır. (P-0: "bu koruma bozulursa kim söyleyecek?" — bu satır söyler.)
    ['Öbeğe girmemiş renkler', () => true],
  ];
  const renkler = tokenListesi.filter((t) => t.ad.startsWith('--color-'));
  const kullanilan = new Set();
  const renkBolumu = OBEKLER.map(([baslik, testi]) => {
    const uyanlar = renkler.filter((t) => testi(t.ad) && !kullanilan.has(t.ad));
    uyanlar.forEach((t) => kullanilan.add(t.ad));
    if (!uyanlar.length) return '';
    return (
      `      <h3 class="obek">${kacir(baslik)}</h3>\n      <div class="izgara">\n` +
      uyanlar
        .map(
          (t) =>
            `        <figure class="renk">\n` +
            `          <span class="ornek" style="background:var(${t.ad})"></span>\n` +
            `          <figcaption><code>${kacir(t.ad.replace('--color-', ''))}</code><b>${kacir(t.deger)}</b>` +
            (t.not ? `<i>${kacir(t.not)}</i>` : '') +
            `</figcaption>\n        </figure>`,
        )
        .join('\n') +
      '\n      </div>'
    );
  })
    .filter(Boolean)
    .join('\n');
  html = bolumuDoldur(html, 'RENKLER', renkBolumu);

  // 3c) Punto ölçeği
  const olcek = puntoOlcegi(oku('ui/type.ts'));
  const puntoBolumu = olcek
    .map(
      (s) =>
        `      <div class="punto">\n` +
        `        <span class="punto-ad"><code>${kacir(s.ad)}</code><b>${s.px}px</b></span>\n` +
        `        <span class="punto-ornek" style="font-size:${s.px}px">Halı saha maçı · ${s.px}px</span>\n` +
        (s.aciklama ? `        <span class="punto-not">${kodlu(s.aciklama)}</span>\n` : '') +
        `      </div>`,
    )
    .join('\n');
  html = bolumuDoldur(html, 'PUNTO', puntoBolumu);

  // 3d) Ölçü merdivenleri
  const merdiven = (baslik, on, cizer) => {
    const uyanlar = tokenListesi.filter((t) => t.ad.startsWith(on));
    if (!uyanlar.length) return '';
    return `      <h3 class="obek">${kacir(baslik)}</h3>\n      <div class="merdiven">\n${uyanlar.map(cizer).join('\n')}\n      </div>`;
  };
  const olcuBolumu = [
    merdiven(
      'Boşluk merdiveni',
      '--oy-space-',
      (t) =>
        `        <div class="basamak"><code>${kacir(t.ad)}</code><span class="bar" style="width:var(${t.ad})"></span><b>${kacir(t.deger)}</b></div>`,
    ),
    merdiven(
      'Köşe merdiveni',
      '--oy-radius-',
      (t) =>
        `        <div class="basamak"><code>${kacir(t.ad)}</code><span class="kose" style="border-radius:var(${t.ad})"></span><b>${kacir(t.deger)}</b></div>`,
    ),
    merdiven(
      'Kart yüksekliği merdiveni',
      '--oy-card-',
      (t) =>
        `        <div class="basamak"><code>${kacir(t.ad)}</code><span class="yukseklik" style="height:var(${t.ad})"></span><b>${kacir(t.deger)}</b></div>`,
    ),
  ]
    .filter(Boolean)
    .join('\n');
  html = bolumuDoldur(html, 'OLCULER', olcuBolumu);

  if (KONTROL) {
    if (readFileSync(onizlemeYolu, 'utf8') !== html) sapmalar.push('eskimiş: design-kit/onizleme.html (üretilen bölümler)');
  } else {
    writeFileSync(onizlemeYolu, html);
  }
}

// ── 4) Kaynak künyesi ───────────────────────────────────────────────────────

let commit = 'bilinmiyor';
try {
  commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: KOK }).toString().trim();
} catch { /* git yoksa künye yine yazılır */ }

const kunye = {
  aciklama:
    'design-kit klasöründeki kod dosyaları kaynağın salt okunur aynasıdır. ' +
    'Elle düzenlenmez; "npm run tasarim:kit" ile yeniden üretilir.',
  uretenBetik: 'scripts/tasarim-kiti.mjs',
  kaynakCommit: commit,
  tokenSayisi: tokenListesi.length,
  aynalar: manifest,
};
const kunyeMetni = `${JSON.stringify(kunye, null, 2)}\n`;
if (KONTROL) {
  const yol = join(KIT, 'KAYNAK.json');
  if (!existsSync(yol)) sapmalar.push('eksik: design-kit/KAYNAK.json');
  else {
    // commit her taze üretimde değişir; kontrolde yalnız ayna listesi karşılaştırılır.
    const eski = JSON.parse(readFileSync(yol, 'utf8'));
    if (JSON.stringify(eski.aynalar) !== JSON.stringify(manifest)) sapmalar.push('eskimiş: design-kit/KAYNAK.json');
  }
} else {
  writeFileSync(join(KIT, 'KAYNAK.json'), kunyeMetni);
}

// ── Sonuç ───────────────────────────────────────────────────────────────────

if (KONTROL) {
  if (sapmalar.length) {
    console.error('\n✖ Tasarım kiti kaynakla aynı değil:\n');
    for (const s of sapmalar) console.error(`   · ${s}`);
    console.error('\n  Düzeltmek için: npm run tasarim:kit\n');
    process.exit(1);
  }
  console.log(`✔ Tasarım kiti güncel (${AYNALAR.length} ayna, ${tokenListesi.length} token).`);
} else {
  for (const s of bilgi) console.log(`   · ${s}`);
  console.log(`✔ design-kit yenilendi — ${AYNALAR.length} ayna dosyası, ${tokenListesi.length} token.`);
  console.log('   Sapma denetimi: npm run tasarim:kit -- --kontrol');
}
