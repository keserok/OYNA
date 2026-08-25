#!/usr/bin/env node
// vitrin-gorselleri.mjs — canlıdaki bütün saha/kort/maç fotoğraflarını
// tek bir sayfada yan yana basar.
//
//   npm run vitrin:gorseller
//
// ─── NEDEN VAR ──────────────────────────────────────────────────────────────
// 25 Ağustos 2026: App Store ekran görüntüsü çekilirken vitrindeki
// fotoğraflara ilk kez tek tek bakıldı. "Saha Kirala" listesinin ilk kartı
// bir FIFA Dünya Kupası renderıydı; bir kortun fotoğrafları ise tanınabilir
// kişilerin ve çocukların özel fotoğraflarıydı. İkisi de aylardır canlıdaydı.
//
// Hiçbir denetim bunu yakalayamazdı: bir fotoğrafın NE OLDUĞUNU makine
// bilemez. Yakalanmamasının gerçek sebebi ise daha basitti — kimse
// bakmamıştı, çünkü bakmak zahmetliydi: altı saha, kortları, altmış beş maç,
// hepsi ayrı ekranlarda.
//
// Bu betik o zahmeti on saniyeye indirir. `magaza-denetim` içindeki 11. kapı
// makinenin görebildiğini (aynı fotoğrafın iki sahada olması, kırık adres)
// yakalar; bu sayfa ise insanın görmesi gerekeni gösterir.
import { writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = join(dirname(fileURLToPath(import.meta.url)), '..');
const URL_TABAN = process.env.VITE_SUPABASE_URL || 'https://iikvzgyccvgcybzdfwlv.supabase.co';
const ANON = process.env.VITE_SUPABASE_ANON_KEY
  || readFileSync(join(KOK, 'supabaseClient.ts'), 'utf8')
       .match(/PROD_SUPABASE_ANON_KEY\s*=\s*\n?\s*'([^']+)'/)?.[1] || '';

const cek = async (yol) => {
  const y = await fetch(`${URL_TABAN}/rest/v1/${yol}`, { headers: { apikey: ANON } });
  if (!y.ok) throw new Error(`${yol} → HTTP ${y.status}`);
  return y.json();
};

const [sahalar, kortlar, maclar] = await Promise.all([
  cek('pitches?select=id,name,district,image,images&order=name'),
  cek('courts?select=id,name,images,pitch_id'),
  cek('public_matches?select=id,title,image,pitch_id'),
]);

const kac = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const kart = (adres, etiket) =>
  `<figure><img loading="lazy" src="${kac(adres)}" alt="">` +
  `<figcaption>${kac(etiket)}</figcaption></figure>`;

let toplam = 0;
const bolumler = sahalar.map((s) => {
  const parcalar = [];
  if (s.image) { parcalar.push(kart(s.image, 'vitrin (image)')); toplam++; }
  for (const [i, g] of (Array.isArray(s.images) ? s.images : []).entries()) {
    if (g === s.image) continue;               // aynı adres iki kez basılmasın
    parcalar.push(kart(g, `galeri ${i + 1}`)); toplam++;
  }
  for (const k of kortlar.filter((k) => k.pitch_id === s.id)) {
    for (const [i, g] of (Array.isArray(k.images) ? k.images : []).entries()) {
      parcalar.push(kart(g, `kort "${k.name}" · ${i + 1}`)); toplam++;
    }
  }
  // Maç görselleri sahadan türetilir; yalnız SAHADAN FARKLI olanlar ilginçtir.
  const ozelMac = [...new Set(maclar.filter((m) => m.pitch_id === s.id && m.image
    && m.image !== s.image).map((m) => m.image))];
  for (const g of ozelMac) { parcalar.push(kart(g, 'maça özel görsel')); toplam++; }

  return `<section><h2>${kac(s.name)} <small>${kac(s.district ?? '')}</small></h2>` +
    (parcalar.length ? `<div class="izgara">${parcalar.join('')}</div>`
                     : `<p class="bos">fotoğraf yok — uygulama kendi yer tutucusunu gösterir</p>`) +
    `</section>`;
});

const html = `<!doctype html><meta charset="utf-8"><title>OYNA · vitrin görselleri</title>
<style>
 :root{color-scheme:dark}
 body{margin:0;padding:24px;background:#0d1117;color:#e6edf3;
      font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
 h1{font-size:20px;margin:0 0 4px}
 .ust{color:#8b949e;font-size:13px;margin-bottom:28px;max-width:70ch}
 section{margin-bottom:32px}
 h2{font-size:16px;margin:0 0 10px;border-bottom:1px solid #30363d;padding-bottom:6px}
 h2 small{color:#8b949e;font-weight:400;margin-left:6px}
 .izgara{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}
 figure{margin:0}
 img{width:100%;height:150px;object-fit:cover;display:block;
     border:1px solid #30363d;border-radius:6px;background:#161b22}
 figcaption{font-size:12px;color:#8b949e;padding:4px 2px}
 .bos{color:#8b949e;font-size:13px;font-style:italic;margin:0}
</style>
<h1>OYNA · vitrindeki bütün fotoğraflar</h1>
<p class="ust">Kullanıcının gördüğü her saha, kort ve maç fotoğrafı burada.
Gönderim öncesi <strong>hepsine bak</strong>: bu bir halı saha fotoğrafı mı?
Bize mi ait? İçinde tanınabilir bir kişi var mı? Makine bunları göremez.<br>
<span style="color:#6e7681">Üretildi: canlı veriden, ${kac(new Date().toISOString().slice(0, 10))} · ${toplam} görsel</span></p>
${bolumler.join('\n')}
`;

const cikti = join(KOK, 'docs/master/magaza-gorselleri/vitrin-gorselleri.html');
writeFileSync(cikti, html);
console.log(`\n  ✓ ${toplam} görsel · ${sahalar.length} saha`);
console.log(`  Aç: ${cikti.replace(KOK + '/', '')}\n`);
