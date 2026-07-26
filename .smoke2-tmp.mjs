// Canlı smoke 2: (1) demo oyuncu → Ayarlar → Yardım Merkezi → talep aç (gerçek
// destek döngüsü; test verisi sonda SQL ile silinir), (2) admin.html açılışı.
import { chromium } from 'playwright';
import fs from 'node:fs';

const SHOTS = '/tmp/claude-0/-home-user-OYNA/9db6d362-6a78-5409-9625-1c2629137b48/scratchpad/shots2/';
fs.mkdirSync(SHOTS, { recursive: true });
const BASE = 'http://localhost:5199';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' },
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const shot = (n) => page.screenshot({ path: SHOTS + n + '.png' });

try {
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);
  const girisBtn = page.getByText('Giriş Yap', { exact: false }).first();
  if (await girisBtn.isVisible().catch(() => false)) await girisBtn.click();
  await page.waitForTimeout(1000);
  const email = page.locator('input[type="email"], input[placeholder*="posta" i]').first();
  await email.waitFor({ timeout: 20000 });
  await email.fill('oyuncu01@oyna.app');
  await page.locator('input[type="password"]').first().fill('password123');
  const kvkk = page.locator('p:has-text("okudum")').first();
  if (await kvkk.isVisible().catch(() => false)) {
    const bb = await kvkk.boundingBox();
    if (bb) await page.mouse.click(bb.x - 16, bb.y + bb.height / 2);
    await page.waitForTimeout(400);
  }
  await page.locator('button:has-text("GİRİŞ YAP")').first().click({ timeout: 15000 });
  await page.getByText('Sosyal').first().waitFor({ timeout: 40000 });

  // Profil → Ayarlar → Yardım Merkezi
  await page.getByText('Profil', { exact: true }).first().click();
  await page.waitForTimeout(2500);
  await page.locator('button:has(svg.lucide-settings)').first().click().catch(async () => {
    await page.mouse.click(345, 54); // sağ üst ayarlar dişlisi
  });
  await page.waitForTimeout(1500);
  await page.getByText('Yardım Merkezi').first().click();
  await page.waitForTimeout(1500);
  await shot('01-yardim-merkezi');

  // Yeni talep aç
  await page.getByText('Yeni Destek Talebi').first().click();
  await page.getByPlaceholder(/İade hesabıma/).fill('Smoke test talebi');
  await page.getByText('Ödeme & İade').first().click();
  await page.locator('textarea').first().fill('Bu bir uçtan uca smoke testidir — admin panel Destek Merkezi doğrulaması için açıldı.');
  await shot('02-talep-formu');
  await page.locator('button:has-text("Talebi Gönder")').first().click();
  await page.waitForTimeout(3000);
  await shot('03-talep-dizisi');
  const body = await page.textContent('body');
  console.log('DESTEK-AKISI:', /Smoke test talebi/.test(body || '') ? 'OK — talep açıldı ve dizi görünüyor' : 'ŞÜPHELİ');

  // Admin boot
  const admin = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await admin.goto(BASE + '/admin-panel/admin.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await admin.waitForTimeout(4000);
  await admin.screenshot({ path: SHOTS + '04-admin-boot.png' });
  const at = await admin.textContent('body');
  console.log('ADMIN-BOOT:', /OYNA|Giriş/i.test(at || '') ? 'OK' : 'ŞÜPHELİ');
} catch (e) {
  console.error('SMOKE2 HATA:', e.message);
  await shot('99-hata');
} finally {
  await browser.close();
}
