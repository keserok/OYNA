#!/usr/bin/env node
// magaza-ekran-goruntuleri.mjs — App Store için 1290×2796 ekran görüntüsü çeker.
//
//   npm run dev            (ayrı bir kabukta, 5199 portunda)
//   npm run magaza:ekran
//
// ─── ÖLÇÜ NEDEN BU ──────────────────────────────────────────────────────────
// Apple, 6.7"/6.9" iPhone için 1290 × 2796 piksel ister. Burada 430 × 932 CSS
// pikselinde, 3 kat yoğunlukla çekilir; çarpımı tam olarak o ölçüyü verir.
// Ölçü tutmazsa App Store Connect yüklemeyi reddeder.
//
// ─── ÇEKİLEN GÖRÜNTÜLER SON HÂLİ DEĞİLDİR ───────────────────────────────────
// Bu betik uygulamanın HAM ekranını verir. Mağazaya konacak görsel genellikle
// bunun çerçevelenmiş ve başlık eklenmiş hâlidir. Daha önemlisi: saha
// fotoğrafları üçüncü taraf bir sunucuda durduğu sürece, o sunucuya
// ulaşamayan bir makinede çekilen görüntülerde fotoğraflar yerine YER TUTUCU
// çıkar. Çekimden sonra `npm run vitrin:gorseller` ile bak; yer tutucu
// görüyorsan bu görüntüler mağazaya konmaz.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK   = join(dirname(fileURLToPath(import.meta.url)), '..');
const CIKTI = join(KOK, 'docs/master/magaza-gorselleri');
const ADRES = process.env.OYNA_DEV_URL || 'http://localhost:5199/';
const EPOSTA = process.env.OYNA_DEMO_EPOSTA || 'oyuncu@oyna.app';
const SIFRE  = process.env.OYNA_DEMO_SIFRE  || 'Oyna!Saha2026';

mkdirSync(CIKTI, { recursive: true });

const tarayici = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--ssl-version-max=tls1.2'],
});
const baglam = await tarayici.newContext({
  viewport: { width: 430, height: 932 },
  deviceScaleFactor: 3,          // 430×3 = 1290 · 932×3 = 2796
  isMobile: true,
  hasTouch: true,
  ...(process.env.HTTPS_PROXY
    ? { proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } }
    : {}),
});
const sayfa = await baglam.newPage();
const cek = async (ad) => {
  await sayfa.screenshot({ path: join(CIKTI, `${ad}.png`) });
  console.log(`  ✓ ${ad}.png`);
};

try {
  await sayfa.goto(ADRES, { waitUntil: 'domcontentloaded' });
} catch (e) {
  console.error(`\n  ✗ ${ADRES} açılamadı: ${e.message}`);
  console.error(`    Ayrı bir kabukta \`npm run dev\` çalışıyor mu?\n`);
  await tarayici.close();
  process.exit(1);
}

// Giriş ekranından önce tanıtım karuseli var; "devam" tuşuna basarak geç.
for (let i = 0; i < 16 && !(await sayfa.locator('#auth-tab-giris').count()); i++) {
  const devam = sayfa.locator('#intro-continue-button');
  if (await devam.count() && await devam.isVisible()) {
    await devam.click(); await sayfa.waitForTimeout(600);
  } else {
    await sayfa.waitForTimeout(900);
  }
}

await cek('01-giris');

await sayfa.click('#auth-tab-giris');
await sayfa.fill('#auth-eposta', EPOSTA);
await sayfa.fill('#auth-sifre', SIFRE);
await sayfa.locator('button[type=submit]').first().click();
await sayfa.waitForTimeout(10000);
await cek('02-ana-sayfa');

await sayfa.getByLabel('Saha Kirala — rezervasyon').first().click({ force: true });
await sayfa.waitForTimeout(8000);
await cek('03-saha-kirala');

// İlk saha kartına dokun: kartlar başlık metniyle bulunur, koordinattan tıklanır.
const kart = await sayfa.evaluate(() => {
  const a = [...document.querySelectorAll('div')]
    .filter((e) => e.offsetParent !== null && /TESİS|TESIS|ARENA|SAHA/i.test(e.innerText || ''))
    .map((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })
    .filter((r) => r.h > 100 && r.h < 460)
    .sort((x, y) => x.h - y.h);
  return a[0] ?? null;
});
if (kart) {
  await sayfa.mouse.click(kart.x + kart.w / 2, kart.y + 40);
  await sayfa.waitForTimeout(8000);
  await cek('04-saha-detay');
} else {
  console.log('  ! saha kartı bulunamadı — 04-saha-detay atlandı');
}

await sayfa.goto(ADRES, { waitUntil: 'domcontentloaded' });
await sayfa.waitForTimeout(8000);
await sayfa.getByLabel('Top Oyna — maç bul').first().click({ force: true });
await sayfa.waitForTimeout(8000);
await cek('05-mac-bul');

await sayfa.goto(ADRES, { waitUntil: 'domcontentloaded' });
await sayfa.waitForTimeout(8000);
await sayfa.getByLabel('Profil').first().click({ force: true });
await sayfa.waitForTimeout(6000);
await cek('06-profil');

await tarayici.close();
console.log(`\n  Çıktı: docs/master/magaza-gorselleri/`);
console.log(`  Ölçü doğrulaması: her dosya 1290 × 2796 olmalı.\n`);
