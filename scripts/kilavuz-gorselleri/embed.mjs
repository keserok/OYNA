// Kılavuzlardaki görselleri küçük boyutta yerleştirir.
//
// Markdown'ın `![alt](yol)` biçimi görseli sayfa genişliğinde basıyor; dikey
// telefon kareleri (585×1266) metni tamamen bastırıyordu. Bunları genişliği
// sınırlı bir <img>'e çeviriyoruz. Dosya çözünürlüğü aynı kalır — görsele
// tıklayınca tam boy açılsın diye <a> ile sarılır.
//
//   node scripts/kilavuz-gorselleri/embed.mjs           # uygula
//   node scripts/kilavuz-gorselleri/embed.mjs --check   # yalnız rapor
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const DOCS = path.join(REPO, 'docs/kilavuzlar');
const CHECK = process.argv.includes('--check');

// Görüntüleme genişlikleri (piksel) — dosyanın en/boy oranına göre seçilir.
const WIDTH_PORTRAIT = 260;   // telefon kareleri
const WIDTH_LANDSCAPE = 680;  // admin paneli (masaüstü)

const IMG_RE = /^!\[([^\]]*)\]\((gorseller\/[^)]+)\)\s*$/;

let converted = 0, skipped = 0;

for (const file of fs.readdirSync(DOCS).filter((f) => f.endsWith('.md'))) {
  const full = path.join(DOCS, file);
  const lines = fs.readFileSync(full, 'utf8').split('\n');
  const out = [];
  let touched = false;

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(IMG_RE);
    if (!m) { out.push(lines[i]); continue; }

    const [, alt, rel] = m;
    const abs = path.join(DOCS, rel);
    if (!fs.existsSync(abs)) {
      console.log(`  ! dosya yok, atlandı: ${rel}`);
      out.push(lines[i]);
      skipped++;
      continue;
    }

    const meta = await sharp(abs).metadata();
    const width = meta.width >= meta.height ? WIDTH_LANDSCAPE : WIDTH_PORTRAIT;

    out.push(`<a href="${rel}"><img src="${rel}" alt="${alt}" width="${width}"></a>`);
    // HTML bloğunun hemen ardından gelen metin satırı GitHub'da bloğa
    // yapışabiliyor; başlık satırının ayrı paragraf kalması için boş satır.
    if (lines[i + 1] !== undefined && lines[i + 1].trim() !== '') out.push('');

    touched = true;
    converted++;
  }

  if (touched && !CHECK) fs.writeFileSync(full, out.join('\n'));
  if (touched) console.log(`${CHECK ? '·' : '✓'} ${file}`);
}

console.log(`\n${converted} görsel ${CHECK ? 'dönüştürülecek' : 'dönüştürüldü'}` +
            (skipped ? `, ${skipped} atlandı` : '') +
            ` (dikey ${WIDTH_PORTRAIT}px, yatay ${WIDTH_LANDSCAPE}px)`);
