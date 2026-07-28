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
// Yerel yığında tek Vite sunucusu hem uygulamayı hem admin panelini veriyor.
// NOT: `/admin.html` kısayolu yalnız ADMIN_DEV=1 ile çalışır (o modda `/` de
// panele yönlenir); tek sunucuda ikisini birden almak için panelin gerçek
// dosya yolu kullanılıyor. OYNA_APP_URL / OYNA_ADMIN_URL ile değiştirilebilir.
export const APP = process.env.OYNA_APP_URL || 'http://127.0.0.1:5199/';
export const ADMIN = process.env.OYNA_ADMIN_URL || 'http://127.0.0.1:5199/admin-panel/admin.html';

const ACCOUNTS = {
  oyuncu: { email: 'oyuncu01@oyna.app', landmark: 'Sosyal' },
  kaleci: { email: 'kaleci1@oyna.app', landmark: 'Maç Bul' },
  hakem:  { email: 'hakem1@oyna.app', landmark: 'Maç Bul' },
  saha:   { email: 'saha1@oyna.app', landmark: 'Takvim' },
};
export const PASS = 'password123';

export async function launch(role, { desktop = false } = {}) {
  const profileDir = path.join(SCRATCH, 'profiles', role);
  fs.mkdirSync(profileDir, { recursive: true });
  // Yerel yığında (127.0.0.1) vekil gerekmez; canlıya sürülürken HTTPS_PROXY kullanılır.
  const useProxy = !APP.includes('127.0.0.1') && !!process.env.HTTPS_PROXY;
  const ctx = await chromium.launchPersistentContext(profileDir, {
    executablePath: '/opt/pw-browsers/chromium',
    headless: true,
    viewport: desktop ? { width: 1440, height: 900 } : { width: 390, height: 844 },
    ...(useProxy ? { proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } } : {}),
    deviceScaleFactor: 2,
  });
  const page = ctx.pages()[0] || (await ctx.newPage());
  return { ctx, page };
}

export async function loginApp(page, role) {
  const acc = ACCOUNTS[role];
  await page.goto(APP, { waitUntil: 'domcontentloaded' });

  // Giriş akışı splash → TANITIM → form şeklinde ilerler; form alanları ancak
  // tanıtımdaki ok düğmesine basınca gelir. (Oturum zaten varsa ikisi de gelmez.)
  const intro = page.locator('#intro-continue-button');
  if (await intro.waitFor({ timeout: 20000 }).then(() => true).catch(() => false)) {
    await intro.click();
  }

  // Oturum zaten varsa auth ekranı gelmez
  const emailBox = page.locator('input[type="email"]').first();
  try {
    await emailBox.waitFor({ timeout: 20000 });
  } catch {
    return; // muhtemelen zaten girişli
  }

  // NOT: Türkçe "İ" (U+0130) JavaScript'in /i/ bayrağıyla "i"ye katlanmaz —
  // /giriş yap/i deseni "GİRİŞ YAP" metnini BULAMAZ. Bu yüzden her yerde
  // birebir (exact) metin eşleşmesi kullanılıyor.

  // Açılış KAYIT modunda olabilir — GİRİŞ moduna geç.
  const toLogin = page.getByRole('button', { name: 'Zaten hesabın var mı? Giriş yap' });
  if (await toLogin.isVisible().catch(() => false)) {
    await toLogin.click();
    await page.waitForTimeout(800);
  }

  await page.locator('input[type="email"]').first().fill(acc.email);
  await page.locator('input[type="password"]').first().fill(PASS);

  // KVKK onayı — özel bir <button id="agreement-checkbox">; işaretlenmeden
  // GİRİŞ YAP düğmesi disabled kalır.
  const consent = page.locator('#agreement-checkbox');
  if (await consent.isVisible().catch(() => false)) await consent.click();

  // Gönder düğmesi — "KOD İLE GİRİŞ YAP" ile karışmasın diye birebir eşleşme.
  await page.getByRole('button', { name: 'GİRİŞ YAP', exact: true }).click();
  await page.getByText(acc.landmark).first().waitFor({ timeout: 45000 });
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
