#!/usr/bin/env node
// depo-temizle.mjs — herkese açık `images` kovasından işaretli dosyaları siler.
//
//   npm run depo:sil                      kuru çalışma — ne silinecek, göster
//   SUPABASE_SERVICE_ROLE_KEY=… npm run depo:sil -- --uygula
//
// ─── NEDEN AYRI BİR ARAÇ ────────────────────────────────────────────────────
// 25 Ağustos 2026'da açık kovada uygulamayla ilgisi olmayan dosyalar bulundu:
// üçüncü kişi telifi, kurucunun kendi aile fotoğrafları, uygulamanın logosu.
// Veritabanı bağları göçlerle koparıldı — uygulama artık hiçbirini göstermiyor.
// Ama dosya kovada durduğu sürece ADRESİNİ BİLEN AÇABİLİR.
//
// Silmek SQL ile YAPILAMAZ: Supabase `storage.protect_delete()` tetiğiyle
// storage.objects üzerinde doğrudan DELETE'i engeller. Doğru gerekçesi var —
// satırı silmek S3'teki nesneyi silmez, geriye erişilemeyen ama yer kaplayan
// bir artık bırakır. Depolama API'si ikisini birlikte yapar; bu betik onu
// çağırır.
//
// ─── ANAHTAR DİSKE YAZILMAZ ─────────────────────────────────────────────────
// SUPABASE_SERVICE_ROLE_KEY TAM YETKİLİDİR: sızarsa tüm veriye erişilir.
// Bu yüzden yalnız ortam değişkeninden okunur, hiçbir dosyaya yazılmaz ve
// ekrana basılmaz. Kasadan (`npm run kasa:ac`) alıp tek komutluk kullan.
//
// ─── SİLME GERİ ALINAMAZ ────────────────────────────────────────────────────
// Bu yüzden iki kapı var:
//   1. Listede `onaylandi: true` olmayan dosyaya DOKUNULMAZ.
//   2. Silmeden önce dosyanın hiçbir yerden BAĞLI OLMADIĞI canlıdan doğrulanır;
//      bağlıysa silinmez, çünkü silinirse uygulamada kırık görsel kalır.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK   = join(dirname(fileURLToPath(import.meta.url)), '..');
const LISTE = join(KOK, 'docs/master/depo-silinecekler.json');
const URL_TABAN = process.env.VITE_SUPABASE_URL || 'https://iikvzgyccvgcybzdfwlv.supabase.co';
const ANON = process.env.VITE_SUPABASE_ANON_KEY
  || readFileSync(join(KOK, 'supabaseClient.ts'), 'utf8')
       .match(/PROD_SUPABASE_ANON_KEY\s*=\s*\n?\s*'([^']+)'/)?.[1] || '';
const ANAHTAR = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const UYGULA  = process.argv.includes('--uygula');

const yesil=(s)=>`\x1b[32m${s}\x1b[0m`, kirmizi=(s)=>`\x1b[31m${s}\x1b[0m`;
const sari=(s)=>`\x1b[33m${s}\x1b[0m`, soluk=(s)=>`\x1b[90m${s}\x1b[0m`;

const liste = JSON.parse(readFileSync(LISTE, 'utf8'));
const kova  = liste.kova;
const hepsi = liste.dosyalar;
const onayli = hepsi.filter((d) => d.onaylandi);
const bekleyen = hepsi.filter((d) => !d.onaylandi);

console.log(`\n  DEPO TEMİZLİĞİ · kova "${kova}"\n`);

if (bekleyen.length) {
  console.log(`  ${sari('!')} ${bekleyen.length} dosya ${sari('BEKLEMEDE')} ${soluk('(onaylandi: false — dokunulmayacak)')}`);
  for (const s of [...new Set(bekleyen.map((d) => d.sinif))]) {
    const n = bekleyen.filter((d) => d.sinif === s).length;
    console.log(`      ${soluk(`${s}: ${n}`)}`);
  }
  console.log('');
}

if (onayli.length === 0) {
  console.log(`  ${soluk('Onaylı dosya yok — silinecek bir şey yok.')}\n`);
  process.exit(0);
}

// ── Canlıdan bağ denetimi ───────────────────────────────────────────────────
// Bağlı bir dosyayı silmek uygulamada kırık görsel bırakır. Profil avatarları
// RLS arkasında olduğu için anonim okunamaz; kapsanan yer vitrindir.
const cek = async (yol) => {
  const y = await fetch(`${URL_TABAN}/rest/v1/${yol}`, { headers: { apikey: ANON } });
  if (!y.ok) throw new Error(`${yol} → HTTP ${y.status}`);
  return y.json();
};

let bagliMi;
try {
  const [sahalar, kortlar, maclar] = await Promise.all([
    cek('pitches?select=id,name,image,images'),
    cek('courts?select=id,name,images'),
    cek('public_matches?select=id,image'),
  ]);
  const havuz = JSON.stringify([sahalar, kortlar, maclar]);
  bagliMi = (yol) => havuz.includes(yol.split('/').pop().replace(/\.[a-z]+$/i, ''));
} catch (e) {
  console.log(`  ${kirmizi('✗')} Canlı okunamadı (${e.message}) — bağ denetimi yapılamıyor.`);
  console.log(`    ${soluk('Bağ denetimi olmadan silmek kırık görsel bırakabilir. Ağ varken tekrar dene.')}\n`);
  process.exit(1);
}

const bagli   = onayli.filter((d) => bagliMi(d.yol));
const silinir = onayli.filter((d) => !bagliMi(d.yol));

if (bagli.length) {
  console.log(`  ${kirmizi('✗')} ${bagli.length} onaylı dosya HÂLÂ BAĞLI — silinmeyecek:`);
  for (const d of bagli) console.log(`      ${d.yol}`);
  console.log(`    ${soluk('Önce bağı koparan bir göç yaz, sonra tekrar çalıştır.')}\n`);
}

console.log(`  Silinecek (${silinir.length}):`);
for (const d of silinir) console.log(`      ${soluk(d.sinif.padEnd(8))} ${d.ne}\n      ${soluk('  ' + d.yol)}`);
console.log('');

if (!UYGULA) {
  console.log(`  ${sari('KURU ÇALIŞMA')} — hiçbir şey silinmedi.`);
  console.log(`  Uygulamak için kasadan servis anahtarını al ve şunu çalıştır:\n`);
  console.log(`      ${soluk('SUPABASE_SERVICE_ROLE_KEY=… npm run depo:sil -- --uygula')}\n`);
  console.log(`  ${soluk('Anahtarsız alternatif: Supabase panosu → Storage → images → dosyayı bul → Delete.')}\n`);
  process.exit(0);
}

if (!ANAHTAR) {
  console.log(`  ${kirmizi('✗')} SUPABASE_SERVICE_ROLE_KEY tanımlı değil.`);
  console.log(`    ${soluk('Depolama API\'si silme için tam yetki ister; anon anahtar yetmez.')}\n`);
  process.exit(1);
}

// ── Silme ───────────────────────────────────────────────────────────────────
let basarili = 0, basarisiz = 0;
for (const d of silinir) {
  const adres = `${URL_TABAN}/storage/v1/object/${kova}/${d.yol}`;
  const y = await fetch(adres, {
    method: 'DELETE',
    headers: { apikey: ANAHTAR, Authorization: `Bearer ${ANAHTAR}` },
  });
  if (!y.ok) {
    console.log(`  ${kirmizi('✗')} HTTP ${y.status} — ${d.yol}`);
    basarisiz++; continue;
  }
  // Gerçekten gitti mi? Silindi demek yetmez; herkese açık adres 404 vermeli.
  const kontrol = await fetch(`${URL_TABAN}/storage/v1/object/public/${kova}/${d.yol}`, { method: 'HEAD' });
  if (kontrol.status === 200) {
    console.log(`  ${kirmizi('✗')} silindi dedi ama adres HÂLÂ AÇIK — ${d.yol}`);
    basarisiz++; continue;
  }
  console.log(`  ${yesil('✓')} silindi ve adres kapandı (${kontrol.status}) ${soluk(d.yol)}`);
  basarili++;
}

console.log('');
if (basarisiz) {
  console.log(`  ${kirmizi(`${basarisiz} dosya silinemedi`)} · ${basarili} silindi\n`);
  process.exit(1);
}
console.log(`  ${yesil(`${basarili} dosya kalıcı olarak silindi.`)}`);
console.log(`  ${soluk('Listede `onaylandi: false` kalan dosyalar için kararını verince aynı komutu tekrar çalıştır.')}\n`);
