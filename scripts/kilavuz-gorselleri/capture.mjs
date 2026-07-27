// OYNA ekran görüntüsü sürücüsü (verify skill reçetesi)
// Kullanım: node capture.mjs <rol> — rol: oyuncu|kaleci|hakem|saha|admin
// Ön koşullar: sb-shim (54321) + ana app (5199); admin için ayrıca 4005 (npm run dev:admin).
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

// Depo köküne göre çözülür — oturuma/geçici klasöre bağımlı değildir.
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const ROOT = path.join(REPO, 'docs/kilavuzlar/gorseller');
// Tarayıcı profilleri geçici bir yere yazılır (OYNA_SHOT_TMP ile değiştirilebilir).
const SCRATCH = process.env.OYNA_SHOT_TMP || '/tmp/oyna-gorsel';
const APP = 'http://localhost:5199/';
const ADMIN = 'http://localhost:4005/admin.html';

const ACCOUNTS = {
  oyuncu: { email: 'oyuncu01@oyna.app', landmark: 'Sosyal' },
  kaleci: { email: 'kaleci1@oyna.app', landmark: 'Maç Bul' },
  hakem:  { email: 'hakem1@oyna.app', landmark: 'Maç Bul' },
  saha:   { email: 'saha1@oyna.app', landmark: 'Takvim' },
};
const PASS = 'password123';

export async function launch(role, { desktop = false } = {}) {
  const profileDir = path.join(SCRATCH, 'profiles', role);
  fs.mkdirSync(profileDir, { recursive: true });
  const ctx = await chromium.launchPersistentContext(profileDir, {
    executablePath: '/opt/pw-browsers/chromium',
    headless: true,
    viewport: desktop ? { width: 1440, height: 900 } : { width: 390, height: 844 },
    proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' },
    deviceScaleFactor: 2,
  });
  const page = ctx.pages()[0] || (await ctx.newPage());
  return { ctx, page };
}

export async function loginApp(page, role) {
  const acc = ACCOUNTS[role];
  await page.goto(APP, { waitUntil: 'domcontentloaded' });
  // Oturum zaten varsa auth ekranı gelmez
  const emailBox = page.locator('input[type="email"]').first();
  try {
    await emailBox.waitFor({ timeout: 15000 });
  } catch {
    return; // muhtemelen zaten girişli
  }
  await emailBox.fill(acc.email);
  await page.locator('input[type="password"]').first().fill(PASS);
  // KVKK onay kutusu — özel buton; metin kardeşi üzerinden dene, olmazsa koordinat
  try { await page.locator('p:has-text("okudum")').first().click({ timeout: 4000 }); }
  catch { await page.mouse.click(55, 805); }
  await page.getByRole('button', { name: /giriş yap/i }).first().click();
  await page.getByText(acc.landmark).first().waitFor({ timeout: 40000 });
}

export async function shot(page, rel, { settle = 1200 } = {}) {
  const file = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await page.waitForTimeout(settle);
  await page.screenshot({ path: file });
  console.log('✓', rel);
}

// Admin girişi (masaüstü görünüm) — geçici admin hesabı bilgileri env'den
export async function loginAdmin(page) {
  await page.goto(ADMIN, { waitUntil: 'domcontentloaded' });
  const email = process.env.OYNA_ADMIN_EMAIL, pass = process.env.OYNA_ADMIN_PASS;
  const emailBox = page.locator('input[type="email"]').first();
  await emailBox.waitFor({ timeout: 20000 });
  await emailBox.fill(email);
  await page.locator('input[type="password"]').first().fill(pass);
  await page.getByRole('button', { name: /giriş/i }).first().click();
  // MFA kapalıysa doğrudan panel; bootstrap bekle
  await page.getByText(/Genel Bakış|OYNA OS/i).first().waitFor({ timeout: 60000 });
}
