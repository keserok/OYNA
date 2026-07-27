// Kılavuz görsellerini depoya uygun boyuta indirir.
// Çekim 2x (deviceScaleFactor 2) yapılıyor; belgeler için 1.5x fazlasıyla net
// ve dosya boyutu belirgin düşüyor. Ayrıca palet tabanlı PNG sıkıştırma.
//
//   node scripts/kilavuz-gorselleri/optimize.mjs
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..', 'docs/kilavuzlar/gorseller');
const SCALE = Number(process.env.OYNA_SHOT_SCALE || 0.75); // 2x → 1.5x

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.png')) files.push(p);
  }
})(ROOT);

let before = 0, after = 0;
for (const f of files.sort()) {
  const stat = fs.statSync(f);
  before += stat.size;
  const img = sharp(f);
  const meta = await img.metadata();
  const buf = await img
    .resize(Math.round(meta.width * SCALE))
    .png({ compressionLevel: 9, palette: true, quality: 88, effort: 8 })
    .toBuffer();
  // Sıkıştırma büyütüyorsa dosyayı bozma
  if (buf.length < stat.size) fs.writeFileSync(f, buf);
  after += fs.statSync(f).size;
}

const mb = (n) => (n / 1024 / 1024).toFixed(1) + ' MB';
console.log(`${files.length} görsel: ${mb(before)} → ${mb(after)} (%${Math.round((1 - after / before) * 100)} küçüldü)`);
