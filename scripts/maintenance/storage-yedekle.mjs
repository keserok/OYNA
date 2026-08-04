// ============================================================================
// OYNA — Storage (dosya) yedekleyici
//
// `yedek-al.sh` tarafından çağrılır. Tek başına da çalışır:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... HEDEF_KLASOR=./dosyalar \
//     node scripts/maintenance/storage-yedekle.mjs
//
// Tüm kovaları gezer, iç içe klasörler dahil her dosyayı indirir ve
// HEDEF_KLASOR/<kova>/<yol> altına aynı yapıyla yazar.
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const HEDEF = process.env.HEDEF_KLASOR || './dosyalar';

if (!URL_ || !KEY) {
  console.error('SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY gerekli.');
  process.exit(1);
}

const sb = createClient(URL_, KEY, { auth: { persistSession: false } });

/** Bir kovadaki tüm dosyaları (alt klasörler dahil) listeler. */
async function tumDosyalar(kova, yol = '') {
  const { data, error } = await sb.storage.from(kova).list(yol, { limit: 1000 });
  if (error) throw new Error(`'${kova}/${yol}' listelenemedi: ${error.message}`);
  if (!data?.length) return [];

  const cikti = [];
  for (const oge of data) {
    // metadata yoksa bu bir klasördür → içine in
    if (!oge.metadata) {
      cikti.push(...(await tumDosyalar(kova, `${yol}${oge.name}/`)));
    } else {
      cikti.push(`${yol}${oge.name}`);
    }
  }
  return cikti;
}

const { data: kovalar, error: kovaHata } = await sb.storage.listBuckets();
if (kovaHata) {
  console.error(`Kovalar alınamadı: ${kovaHata.message}`);
  process.exit(1);
}

let toplam = 0;
let basarisiz = 0;

for (const kova of kovalar) {
  const dosyalar = await tumDosyalar(kova.name);
  console.log(`  • ${kova.name}: ${dosyalar.length} dosya`);

  for (const dosyaYolu of dosyalar) {
    const { data, error } = await sb.storage.from(kova.name).download(dosyaYolu);
    if (error) {
      console.error(`    ✗ ${dosyaYolu} — ${error.message}`);
      basarisiz++;
      continue;
    }
    const hedefDosya = join(HEDEF, kova.name, dosyaYolu);
    await mkdir(dirname(hedefDosya), { recursive: true });
    await writeFile(hedefDosya, Buffer.from(await data.arrayBuffer()));
    toplam++;
  }
}

console.log(`✓ ${toplam} dosya indirildi${basarisiz ? ` (${basarisiz} hata)` : ''}`);
if (basarisiz) process.exit(1);
