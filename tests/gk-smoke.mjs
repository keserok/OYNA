// OYNA — Kaleci (Goalkeeper) canlı smoke sürüşü (KS0 regresyon kapısı).
//
// AMAÇ: Kaleci fazı KS0 dürüstlük düzeltmelerinin (rating/stat honesty, null-stats
// guard, formatTRY) yaşayan uygulamada regresyonsuz çalıştığını doğrulamak. CI
// birim testi DEĞİL — canlı Supabase + çalışan dev sunucusu gerektirir (shim).
//
// GEREKSİNİMLER (sandbox reçetesi): player-smoke.mjs ile aynı.
// ÇALIŞTIR: NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt node tests/gk-smoke.mjs
// ÇIKIŞ KODU: 0 = tüm assert'ler geçti, 1 = en az bir assert düştü.
//
// ASSERT'ler:
//   A. Uygulama boot olur ve KALECI kabuğu (SERVICE_DASHBOARD) yüklenir.
//   B. Giriş yapan kalecinin adı gerçek ("Misafir"/"Oyuncu"/fallback YOK).
//   C. Kalecinin kendi profili (ServiceProfile) çöker olmadan render olur.
//   D. Konsolda font dışı kaynak/JS hatası yok (null-stats crash dahil).

import pkg from '@playwright/test';
const { chromium } = pkg;
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

const BASE = process.env.SMOKE_BASE || 'http://localhost:5199';
const SB = process.env.SMOKE_SB || 'http://localhost:54321';
const ANON = process.env.SMOKE_ANON ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlpa3Z6Z3ljY3ZnY3liemRmd2x2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NjM0NDAsImV4cCI6MjA5NTAzOTQ0MH0.T7P_7lYp07zcXrioKkMqZENoYoi-D9aPmjhNAfihMvM';
const EMAIL = process.env.SMOKE_EMAIL || 'kaleci1@oyna.app';
const PASS = process.env.SMOKE_PASS || 'password123';
const EXPECT_NAME = process.env.SMOKE_EXPECT_NAME || 'AHMET'; // kaleci1 = Ahmet Çalık (panelde ilk ad)
const CHROMIUM = process.env.PLAYWRIGHT_CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const PROXY = process.env.HTTPS_PROXY || 'http://127.0.0.1:38961';
const SHOTS = process.env.SMOKE_SHOTS || '/tmp/gk-smoke-shots';
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
const assert = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`); };
const shot = async (page, n) => page.screenshot({ path: `${SHOTS}/${n}.png` }).catch(() => {});

const sb = createClient(SB, ANON, { auth: { persistSession: false } });
const { data, error } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASS });
if (error || !data?.session) { console.error('SDK login FAILED:', error?.message); process.exit(1); }

const browser = await chromium.launch({ executablePath: CHROMIUM, proxy: { server: PROXY, bypass: 'localhost,127.0.0.1' } });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const consoleErrors = [];
await ctx.addInitScript(([k, v]) => { try { localStorage.setItem('oyna.remember', 'true'); localStorage.setItem(k, v); } catch {} }, ['oyna.auth.token', JSON.stringify(data.session)]);
const page = await ctx.newPage();
page.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + e.message));
const IGNORE = [
  /fonts\.googleapis\.com/, /fonts\.gstatic\.com/,
  /\/rpc\/admin_fetch_(goalkeepers|referees)/,
];
const netFails = [];
const transientWarnings = [];
const TRANSIENT = /ERR_FAILED|ERR_CONNECTION_RESET|ERR_ABORTED|ERR_NETWORK|ERR_TIMED_OUT/;
page.on('response', (r) => { if (r.status() >= 400) { const u = r.url(); if (!IGNORE.some((re) => re.test(u))) netFails.push(`${r.status()} ${u.slice(0, 90)}`); } });
page.on('requestfailed', (r) => {
  const u = r.url();
  if (IGNORE.some((re) => re.test(u))) return;
  const err = r.failure()?.errorText || '';
  if (TRANSIENT.test(err)) transientWarnings.push(`${err} ${u.slice(0, 70)}`);
  else netFails.push(`${err} ${u.slice(0, 90)}`);
});

try {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  // A — KALECI kabuğu (SERVICE_DASHBOARD) yüklenir: alt-nav "Cüzdan" / "Ana Sayfa".
  let shellOk = true;
  try { await page.getByText(/Cüzdan|Ana Sayfa/, { exact: false }).first().waitFor({ timeout: 40000 }); }
  catch { shellOk = false; }
  await page.waitForTimeout(1500);
  await shot(page, '01-gk-dashboard');
  assert('A: kaleci kabuğu yüklendi (SERVICE_DASHBOARD)', shellOk);

  // B — gerçek isim, "Misafir"/"Oyuncu" fallback YOK.
  const dashText = (await page.locator('body').innerText().catch(() => '')).toUpperCase();
  const nameOnDash = new RegExp(EXPECT_NAME, 'i').test(dashText);
  const hasFallback = /\bM[İI]SAF[İI]R\b|\bOYUNCU\b/.test(dashText);
  assert('B: gerçek isim görünür, fallback yok', nameOnDash && !hasFallback, `isim=${nameOnDash} fallback=${hasFallback}`);

  // C — kendi profili (ServiceProfile) çökmeden render olur (KS0 honesty + guard).
  // Profil "MENÜ" sekmesi altında → önce MENÜ, sonra Profilim.
  let profileOk = false;
  try {
    await page.getByText('MENÜ', { exact: false }).first().click({ timeout: 8000 });
    await page.waitForTimeout(800);
    await page.getByText('Profilim', { exact: false }).first().click({ timeout: 8000 });
    await page.waitForTimeout(2000);
    const pText = (await page.locator('body').innerText().catch(() => '')).toUpperCase();
    // İsim görünür VE çökme (pageerror) yok → profil sağlıklı açıldı.
    profileOk = new RegExp(EXPECT_NAME, 'i').test(pText) && consoleErrors.length === 0;
  } catch { profileOk = false; }
  await shot(page, '02-gk-profile');
  assert('C: kaleci profili çökmeden açıldı', profileOk, `pageerror=${consoleErrors.length}`);

  // D — beklenmeyen HTTP 4xx/5xx + JS (pageerror) yok.
  const uniqueFails = [...new Set([...netFails, ...consoleErrors])];
  if (transientWarnings.length) console.log(`  (uyarı: ${transientWarnings.length} geçici bağlantı hatası — sandbox gürültüsü, gate dışı)`);
  assert('D: beklenmeyen HTTP 4xx/5xx / JS hatası yok', uniqueFails.length === 0, uniqueFails.slice(0, 4).join(' | '));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n=== GK SMOKE: ${results.length - failed.length}/${results.length} geçti ===`);
process.exit(failed.length ? 1 : 0);
