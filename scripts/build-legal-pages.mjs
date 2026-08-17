// build-legal-pages.mjs
// Kanonik markdown (sozlesmeler/oyuncu/*.md) → public/*.html yasal sayfaları üretir.
// Tek kaynak ilkesi: markdown güncellenince bu script yeniden çalıştırılır:
//   node scripts/build-legal-pages.mjs
// Elle tutulan gizlilik.html / cerez-politikasi.html / hesap-silme.html DOKUNULMAZ;
// yalnızca aşağıdaki DOCS listesindeki sayfalar + yasal.html indeksi üretilir.
//
// ─── ALINTI (>) BLOKLARI İÇİN "VARSAYILAN GİZLİ" KURALI ──────────────────────
// Kanonik md dosyalarındaki `>` ile başlayan bloklar iki farklı amaçla kullanılıyor:
//   (1) şirketin kendi iç notları  — "Durum:", "Bilinen açık:", "PR:" gibi;
//   (2) kullanıcıya gösterilmesi GEREKEN uyarı damgaları — ör. Kullanım Şartları
//       md. 6.5'in "YÜRÜRLÜKTE DEĞİLDİR" damgası.
//
// Eskiden süzgeç yalnızca "Durum:" geçen blokları atıyordu. Bu ters çalışıyordu:
// biri ileride yeni bir iç not eklediğinde (o kalıbı kullanmazsa) not sessizce
// yayına ve oradan uygulama paketine çıkıyordu. Nitekim çıktı da: "Bilinen açık:
// ... henüz değerlendirilmedi" notu public/mesafeli-satis.html'de yayınlanmıştı.
//
// Kural artık TERS: bir `>` bloğu, hemen öncesindeki satırda `<!-- YAYINLA -->`
// işareti YOKSA yayınlanmaz. Yani unutulan/yeni eklenen her not varsayılan olarak
// GİZLİ kalır; yayınlanması için bilinçli bir işaret gerekir. Tüm HTML yorumları
// (işaretin kendisi dahil) çıktıdan atılır.
//
// İç notların kalıcı yeri: sozlesmeler/ic-notlar/ — bu script o klasörü hiç
// okumaz; aşağıdaki KAYNAK_DIZIN kontrolü bunu sert biçimde garanti eder.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Yayına girebilecek TEK kaynak klasör. Başka bir klasörden (ör. ic-notlar)
// okuma denemesi derlemeyi patlatır — sessizce yayına sızmasındansa build çöksün.
const KAYNAK_DIZIN = resolve(ROOT, 'sozlesmeler', 'oyuncu');

// Kanonik md dosya adı → public slug (çapraz-atıf linklerini yeniden yazmak için)
const SLUG_BY_MD = {
  '01-kullanim-sartlari.md': 'kullanim-sartlari',
  '02-gizlilik-politikasi.md': 'gizlilik',
  '03-kvkk-aydinlatma-metni.md': 'kvkk-aydinlatma',
  '04-kvkk-acik-riza-metni.md': 'kvkk-acik-riza',
  '05-mesafeli-satis-iptal-iade.md': 'mesafeli-satis',
  '06-cerez-politikasi.md': 'cerez-politikasi',
  '07-hesap-silme-bilgilendirmesi.md': 'hesap-silme',
  '08-veli-muvafakatnamesi.md': 'veli-muvafakatnamesi',
  '09-topluluk-kurallari.md': 'topluluk-kurallari',
};

// Bu script'in ürettiği sayfalar (elle tutulan 3 sayfa listede yok = korunur)
const DOCS = [
  { md: '01-kullanim-sartlari.md', title: 'Kullanım Şartları', desc: 'OYNA kullanım şartları ve üyelik sözleşmesi.' },
  { md: '03-kvkk-aydinlatma-metni.md', title: 'KVKK Aydınlatma Metni', desc: 'OYNA kişisel verilerin işlenmesine ilişkin aydınlatma metni.' },
  { md: '04-kvkk-acik-riza-metni.md', title: 'KVKK Açık Rıza Metni', desc: 'OYNA açık rıza gerektiren veri işlemleri.' },
  { md: '05-mesafeli-satis-iptal-iade.md', title: 'Mesafeli Satış ve İptal/İade Koşulları', desc: 'OYNA mesafeli satış, iptal ve iade koşulları.' },
  { md: '08-veli-muvafakatnamesi.md', title: 'Veli/Vasi Muvafakatnamesi', desc: 'OYNA 18 yaş altı kullanıcılar için veli muvafakatnamesi.' },
  { md: '09-topluluk-kurallari.md', title: 'Topluluk Kuralları ve Kullanıcı Davranış Kuralları', desc: 'OYNA topluluk kuralları ve kullanıcı davranış kuralları.' },
];

// yasal.html indeksindeki tüm belgeler (üretilenler + elle tutulan 3)
const INDEX = [
  { slug: 'kullanim-sartlari', title: 'Kullanım Şartları', desc: 'Üyelik ve kullanım koşulları' },
  { slug: 'topluluk-kurallari', title: 'Topluluk Kuralları', desc: '6 temel kural + davranış kuralları' },
  { slug: 'gizlilik', title: 'Gizlilik Politikası', desc: 'Kişisel verilerin korunması' },
  { slug: 'kvkk-aydinlatma', title: 'KVKK Aydınlatma Metni', desc: 'Veri işleme aydınlatması' },
  { slug: 'kvkk-acik-riza', title: 'KVKK Açık Rıza Metni', desc: 'Açık rıza gerektiren işlemler' },
  { slug: 'veli-muvafakatnamesi', title: 'Veli/Vasi Muvafakatnamesi', desc: '18 yaş altı kullanıcılar için' },
  { slug: 'cerez-politikasi', title: 'Çerez Politikası', desc: 'Çerezler ve benzer teknolojiler' },
  { slug: 'mesafeli-satis', title: 'Mesafeli Satış ve İptal/İade', desc: 'Satış, iptal ve iade koşulları' },
  { slug: 'hesap-silme', title: 'Hesap Silme', desc: 'Hesap ve veri silme adımları' },
];

const STYLE = `
    body { font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; background: #0A0E14; color: #E5E7EB; margin: 0; }
    main { max-width: 720px; margin: 0 auto; padding: 48px 24px 96px; line-height: 1.7; }
    h1 { color: #FACC15; font-size: 1.6rem; }
    h2 { color: #fff; font-size: 1.1rem; margin-top: 2rem; }
    h3 { color: #fff; font-size: 1rem; margin-top: 1.5rem; }
    h4 { color: #E5E7EB; font-size: .95rem; margin-top: 1.2rem; }
    a { color: #FACC15; }
    .meta { color: #9CA3AF; font-size: .85rem; }
    blockquote { border-left: 3px solid #FACC15; margin: 1rem 0; padding: .3rem 0 .3rem 1rem; color: #B6BCC6; }
    code { background:#161B22; padding:.1rem .35rem; border-radius:4px; font-size:.85em; }
    hr { border: none; border-top: 1px solid #232A34; margin: 2rem 0; }
    ul, ol { padding-left: 1.3rem; }
    li { margin: .3rem 0; }
    .backlink { display:inline-block; margin-bottom: 1.5rem; color:#9CA3AF; text-decoration:none; font-size:.85rem; }
    .cards { list-style:none; padding:0; }
    .cards li { margin:.6rem 0; }
    .cards a { display:block; background:#111722; border:1px solid #232A34; border-radius:12px; padding:14px 16px; text-decoration:none; }
    .cards a:hover { border-color:#FACC15; }
    .cards .t { color:#FACC15; font-weight:700; display:block; }
    .cards .d { color:#9CA3AF; font-size:.85rem; }
`;

function pageHtml(title, desc, bodyHtml, withBack = true) {
  const back = withBack ? '<a class="backlink" href="/yasal.html">← Tüm yasal belgeler</a>\n' : '';
  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} — OYNA</title>
  <meta name="description" content="${desc}" />
  <style>${STYLE}  </style>
</head>
<body>
<main>
${back}${bodyHtml}
</main>
</body>
</html>
`;
}

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function rewriteHref(u) {
  u = u.trim();
  if (/^https?:\/\//.test(u) || u.startsWith('mailto:') || u.startsWith('/') || u.startsWith('#')) return u;
  const m = u.match(/(\d\d-[a-z0-9-]+\.md)(#[^)]*)?$/i);
  if (m && SLUG_BY_MD[m[1]]) return '/' + SLUG_BY_MD[m[1]] + '.html' + (m[2] || '');
  return null; // yayımlanmayan hedef → link kaldırılır (metin korunur)
}

function inline(s) {
  s = escapeHtml(s);
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, t, u) => {
    const h = rewriteHref(u);
    return h ? `<a href="${h}">${t}</a>` : t;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, '$1<em>$2</em>');
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  return s;
}

const YAYIN_ISARETI = /^\s*<!--\s*YAYINLA\s*-->\s*$/;
const HTML_YORUMU = /^\s*<!--[\s\S]*-->\s*$/;

// Varsayılan gizli: `>` blokları yalnızca hemen öncesinde <!-- YAYINLA --> varsa
// çıktıya girer. (Gerekçe dosyanın başındaki açıklamada.)
function alintiBloklariniSuz(lines) {
  const out = [];
  let i = 0;
  let isaretli = false; // bir önceki anlamlı satır <!-- YAYINLA --> mıydı?

  while (i < lines.length) {
    const line = lines[i];

    if (YAYIN_ISARETI.test(line)) { isaretli = true; i++; continue; }
    // İşaret dışındaki her HTML yorumu da çıktıya girmez: yorum = iç iletişim.
    if (HTML_YORUMU.test(line)) { i++; continue; }

    if (line.startsWith('>')) {
      const run = [];
      let j = i;
      while (j < lines.length && lines[j].startsWith('>')) { run.push(lines[j]); j++; }
      if (isaretli) out.push(...run); // açıkça yayına işaretlenmiş → geçer
      isaretli = false;               // işaret tek bloğu kapsar, devretmez
      i = j;
      continue;
    }

    // Boş satır işareti bozmaz (işaret ile blok arasında boşluk bırakılabilsin);
    // dolu bir satır araya girerse işaret düşer.
    if (!/^\s*$/.test(line)) isaretli = false;
    out.push(line);
    i++;
  }
  return out;
}

function mdToHtml(md) {
  let lines = md.replace(/\r/g, '').split('\n');
  lines = alintiBloklariniSuz(lines);
  const html = [];
  let i = 0;
  let seenSection = false;
  let metaDone = false;

  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*$/.test(line)) { i++; continue; }

    const hm = line.match(/^(#{1,6})\s+(.*)$/);
    if (hm) {
      const lvl = hm[1].length;
      if (lvl >= 2) seenSection = true;
      html.push(`<h${lvl}>${inline(hm[2].trim())}</h${lvl}>`);
      i++;
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      if (seenSection) html.push('<hr />');
      i++;
      continue;
    }

    if (line.startsWith('>')) {
      const buf = [];
      while (i < lines.length && lines[i].startsWith('>')) { buf.push(lines[i].replace(/^>\s?/, '')); i++; }
      html.push(`<blockquote>${inline(buf.join(' ').trim())}</blockquote>`);
      continue;
    }

    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const topType = /^\s*\d+\./.test(line) ? 'ol' : 'ul';
      const items = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        const l = lines[i];
        const indent = l.match(/^(\s*)/)[1].length;
        const content = l.replace(/^\s*([-*]|\d+\.)\s+/, '');
        if (indent >= 2 && items.length) {
          const parent = items[items.length - 1];
          parent.childType = /^\s*\d+\./.test(l) ? 'ol' : 'ul';
          parent.children.push(inline(content));
        } else {
          items.push({ text: inline(content), children: [], childType: 'ul' });
        }
        i++;
      }
      const parts = items.map((it) => {
        let s = `<li>${it.text}`;
        if (it.children.length) s += `<${it.childType}>` + it.children.map((c) => `<li>${c}</li>`).join('') + `</${it.childType}>`;
        return s + '</li>';
      }).join('');
      html.push(`<${topType}>${parts}</${topType}>`);
      continue;
    }

    // paragraf
    const buf = [line];
    i++;
    while (
      i < lines.length &&
      !/^\s*$/.test(lines[i]) &&
      !/^(#{1,6})\s/.test(lines[i]) &&
      !/^(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i]) &&
      !lines[i].startsWith('>') &&
      !/^\s*([-*]|\d+\.)\s+/.test(lines[i])
    ) {
      buf.push(lines[i]);
      i++;
    }
    const raw = buf.join(' ').trim();
    if (!metaDone && /^\*\*(Son güncelleme|Sürüm)/.test(raw)) {
      metaDone = true;
      html.push(`<p class="meta">${inline(raw.replace(/^\*\*/, '').replace(/\*\*$/, ''))}</p>`);
      continue;
    }
    // Kaynak markdown'da paragraflar tek satır; bir blok içindeki ardışık satırlar
    // (ör. veri sorumlusu adres bloğu) kasıtlı satır sonlarıdır → <br /> ile korunur.
    html.push(`<p>${buf.map((l) => inline(l.trim())).join('<br />')}</p>`);
  }
  return html.join('\n');
}

for (const d of DOCS) {
  // Yayına yalnızca sozlesmeler/oyuncu altındaki kanonik dosyalar çıkar.
  // ic-notlar/ gibi bir klasöre uzanan yol (ör. "../ic-notlar/...") burada durur.
  const yol = resolve(KAYNAK_DIZIN, d.md);
  if (!yol.startsWith(KAYNAK_DIZIN + '/')) {
    throw new Error(`Yayın kaynağı sozlesmeler/oyuncu dışında: ${d.md} — iç notlar yayınlanamaz.`);
  }
  const md = readFileSync(yol, 'utf8');
  const out = pageHtml(d.title, d.desc, mdToHtml(md));
  const slug = SLUG_BY_MD[d.md];
  writeFileSync(join(ROOT, 'public', slug + '.html'), out);
  console.log('wrote public/' + slug + '.html (' + out.length + ' bytes)');
}

const cards = INDEX.map(
  (x) => `  <li><a href="/${x.slug}.html"><span class="t">${x.title}</span><span class="d">${x.desc}</span></a></li>`
).join('\n');
const indexBody = `<h1>⚡ OYNA — Yasal Belgeler</h1>
<p class="meta">Tüm sözleşmeler, politikalar ve kullanım kuralları</p>
<ul class="cards">
${cards}
</ul>`;
writeFileSync(join(ROOT, 'public', 'yasal.html'), pageHtml('Yasal Belgeler', 'OYNA sözleşmeleri, gizlilik ve kullanım kuralları.', indexBody, false));
console.log('wrote public/yasal.html');
