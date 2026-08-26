#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// ETKİ ANALİZİ (PRENSİPLER §9.2) — değişen dosyaları yapı taşlarıyla eşler.
//
// Neden var: package.json bu komutu (npm run etki) baştan beri tanımlıyordu
// ama scripts/sistem/ dizini hiç yazılmamıştı — komut MODULE_NOT_FOUND ile
// düşüyordu (26 Ağu 2026 denetim bulgusu 0.1). §9.2 kritik taşlara dokunmadan
// önce bu analizi ZORUNLU kılar: 🔴 KRİTİK bir taşa (PARA · KAPILAR · KİMLİK ·
// AYARLAR · KURTARMA) dokunulduysa iş durur, CEO onayı gerekir.
//
// Davranış (asgari, bilinçli):
//   1. git'e göre değişen dosyalar toplanır (HEAD'e karşı + izlenmeyenler).
//   2. docs/sistem/YAPI-TASLARI.json'daki taşların `dosyalar` listesiyle
//      eşleştirilir — liste hem dosya ('services/paymentService.ts') hem
//      sonu '/' ile biten dizin ('components/payment/') içerir, eşleşme bu
//      yüzden önek tabanlıdır.
//   3. Dokunulan taşlar risk sırasıyla yazdırılır; KRİTİK taş varsa çıkış
//      kodu 1 döner (CI/el akışı işi durdurabilsin).
//
// Diğer dört sistem komutu (harita/kapsam/surum/zaman-deseni) bu paketin
// KAPSAMI DIŞINDA — yazılmadılar; package.json girişleri bilinçli duruyor.
// ════════════════════════════════════════════════════════════════════════
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const calistir = (komut) => {
  try {
    return execSync(komut, { cwd: KOK, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    console.error(`✗ Komut çalıştırılamadı: ${komut}\n  ${String(err?.message ?? err)}`);
    process.exit(2);
  }
};

// 1 · Değişen dosyalar — HEAD'e göre (staged + unstaged) ve izlenmeyenler.
const degisenler = new Set(
  [
    ...calistir('git diff --name-only HEAD').split('\n'),
    ...calistir('git ls-files --others --exclude-standard').split('\n'),
  ].map((s) => s.trim()).filter(Boolean),
);

if (degisenler.size === 0) {
  console.log('✓ Değişen dosya yok — etki analizi temiz.');
  process.exit(0);
}

// 2 · Yapı taşları.
const tasDosyasi = path.join(KOK, 'docs', 'sistem', 'YAPI-TASLARI.json');
let taslar;
try {
  taslar = JSON.parse(readFileSync(tasDosyasi, 'utf8')).yapi_taslari;
  if (!Array.isArray(taslar)) throw new Error('yapi_taslari bir dizi değil');
} catch (err) {
  console.error(`✗ ${path.relative(KOK, tasDosyasi)} okunamadı: ${String(err?.message ?? err)}`);
  process.exit(2);
}

const dosyaTasaDegiyorMu = (dosya, tasYolu) =>
  tasYolu.endsWith('/') ? dosya.startsWith(tasYolu) : dosya === tasYolu;

// 3 · Eşleştir.
const dokunulan = [];
for (const tas of taslar) {
  const yollar = Array.isArray(tas.dosyalar) ? tas.dosyalar : [];
  const eslesen = [...degisenler].filter((d) => yollar.some((y) => dosyaTasaDegiyorMu(d, y)));
  if (eslesen.length > 0) dokunulan.push({ tas, eslesen });
}

const RISK_SIRA = { KRITIK: 0, YUKSEK: 1, ORTA: 2, DUSUK: 3 };
const RISK_IKON = { KRITIK: '🔴', YUKSEK: '🟠', ORTA: '🟡', DUSUK: '🟢' };
dokunulan.sort((a, b) => (RISK_SIRA[a.tas.risk] ?? 9) - (RISK_SIRA[b.tas.risk] ?? 9));

console.log(`\n  ETKİ ANALİZİ — ${degisenler.size} değişen dosya\n`);
if (dokunulan.length === 0) {
  console.log('  ✓ Hiçbir yapı taşına dokunulmuyor.');
  process.exit(0);
}

for (const { tas, eslesen } of dokunulan) {
  console.log(`  ${RISK_IKON[tas.risk] ?? '·'} ${tas.id} ${tas.ad} (${tas.risk})`);
  for (const d of eslesen) console.log(`      ${d}`);
}

const kritikler = dokunulan.filter(({ tas }) => tas.risk === 'KRITIK');
if (kritikler.length > 0) {
  console.log(
    `\n  🔴 ${kritikler.map(({ tas }) => tas.ad).join(' · ')} taş(lar)ına dokunuluyor.` +
    '\n  PRENSİPLER §9.2: iş DURUR — devam için CEO (kurucu) onayı gerekir.\n',
  );
  process.exit(1);
}
console.log('\n  ✓ Kritik taş yok — devam edilebilir.\n');
process.exit(0);
