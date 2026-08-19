#!/usr/bin/env node
/**
 * SÜRÜM ARTIRMA — `npm run surum:artir [-- --ad 3.1.0]`
 *
 * NİYE VAR: iki mağaza da aynı derleme numarasını iki kez kabul etmez. Numara
 * iki ayrı yerde tutuluyor (Android: build.gradle · iOS: project.pbxproj) ve
 * birini artırıp diğerini unutmak, yüklemenin son adımında geri dönmek demek.
 * Bu betik ikisini TEK hamlede ve BİRLİKTE yükseltir.
 *
 * NE ARTAR:
 *   · derleme numarası (versionCode / CURRENT_PROJECT_VERSION) → her çağrıda +1
 *   · sürüm adı (versionName / MARKETING_VERSION) → yalnız `--ad` verilirse
 *
 * Sürüm adı bilerek elle: kullanıcının gördüğü numaradır, otomatik artmamalı.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = join(dirname(fileURLToPath(import.meta.url)), '..');
const GRADLE = join(KOK, 'android/app/build.gradle');
const PBX = join(KOK, 'ios/App/App.xcodeproj/project.pbxproj');

const arg = (ad) => {
  const i = process.argv.indexOf(`--${ad}`);
  return i > -1 ? process.argv[i + 1] : null;
};
const yeniAd = arg('ad');

if (yeniAd && !/^\d+\.\d+\.\d+$/.test(yeniAd)) {
  console.error(`\n  Sürüm adı x.y.z biçiminde olmalı: "${yeniAd}" kabul edilmedi.\n`);
  process.exit(1);
}

// ── Android ────────────────────────────────────────────────────────────────
let gradle = readFileSync(GRADLE, 'utf8');
const kodKalip = /(oynaVersionCode'\)\s*\?:\s*')(\d+)(')/;
const adKalip = /(oynaVersionName'\)\s*\?:\s*')([^']+)(')/;

const kodEsleme = gradle.match(kodKalip);
const adEsleme = gradle.match(adKalip);
if (!kodEsleme || !adEsleme) {
  console.error('\n  android/app/build.gradle içindeki sürüm kalıbı bulunamadı — dosya değişmiş.\n');
  process.exit(1);
}

const eskiKod = Number(kodEsleme[2]);
const yeniKod = eskiKod + 1;
const eskiAd = adEsleme[2];
const adSonuc = yeniAd ?? eskiAd;

gradle = gradle.replace(kodKalip, `$1${yeniKod}$3`).replace(adKalip, `$1${adSonuc}$3`);
writeFileSync(GRADLE, gradle);

// ── iOS ────────────────────────────────────────────────────────────────────
// pbxproj'de bu anahtarlar her yapılandırma (Debug/Release) için ayrı geçer;
// HEPSİ aynı değeri taşımalı, yoksa hangi yapılandırmayla arşivlendiğine göre
// farklı numara yüklenir.
let pbx = readFileSync(PBX, 'utf8');
const oncekiKodlar = [...pbx.matchAll(/CURRENT_PROJECT_VERSION = (\d+);/g)].map((m) => m[1]);
if (oncekiKodlar.length === 0) {
  console.error('\n  project.pbxproj içinde CURRENT_PROJECT_VERSION bulunamadı.\n');
  process.exit(1);
}
pbx = pbx
  .replace(/CURRENT_PROJECT_VERSION = \d+;/g, `CURRENT_PROJECT_VERSION = ${yeniKod};`)
  .replace(/MARKETING_VERSION = [\d.]+;/g, `MARKETING_VERSION = ${adSonuc};`);
writeFileSync(PBX, pbx);

const soluk = (t) => `\x1b[90m${t}\x1b[0m`;
const yesil = (t) => `\x1b[32m${t}\x1b[0m`;

console.log('');
console.log(`  ${yesil('Sürüm yükseltildi')}`);
console.log(`  ${soluk('derleme')}  ${eskiKod} → ${yesil(String(yeniKod))}  ${soluk('(Android + iOS)')}`);
if (yeniAd) {
  console.log(`  ${soluk('sürüm')}    ${eskiAd} → ${yesil(adSonuc)}`);
} else {
  console.log(`  ${soluk('sürüm')}    ${adSonuc} ${soluk('(değişmedi — değiştirmek için: npm run surum:artir -- --ad 3.1.0)')}`);
}
console.log(soluk('\n  Sonraki adım: npx cap sync && npm run magaza:denetim\n'));
