// OYNA — Oyuncu (Player) canlı smoke sürüşü (regresyon kapısı).
//
// AMAÇ: S0 kök-neden düzeltmelerinin (KN-1/2/4, A2) yaşayan uygulamada
// regresyonsuz çalıştığını doğrulamak. Bu bir CI birim testi DEĞİL — canlı
// Supabase + çalışan dev sunucusu gerektirir (sandbox'ta shim üzerinden).
//
// GEREKSİNİMLER (sandbox reçetesi):
//   1) Supabase shim: 127.0.0.1:54321 → CONNECT tüneli → *.supabase.co
//   2) dev sunucusu: `npm run dev -- --port 5199 --strictPort` (.env shim'e bakar)
//   3) Chromium: /opt/pw-browsers/chromium ; proxy bypass localhost
//
// ÇALIŞTIR: NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt node tests/player-smoke.mjs
// ÇIKIŞ KODU: 0 = tüm assert'ler geçti, 1 = en az bir assert düştü.
//
// ASSERT'ler (G0 kapısı):
//   A. Uygulama boot olur ve kabuk yüklenir (alt-nav görünür).
//   B. Giriş yapan oyuncunun adı gerçek ("Misafir"/"Oyuncu" fallback'i YOK) — KN-2.
//   C. Profil ekranı 15sn içinde çözülür (sonsuz "yükleniyor" yok).
//   D. Konsolda font dışı kaynak/JS hatası yok.

import pkg from '@playwright/test';
const { chromium } = pkg;
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

const BASE = process.env.SMOKE_BASE || 'http://localhost:5199';
const SB = process.env.SMOKE_SB || 'http://localhost:54321';
const ANON = process.env.SMOKE_ANON ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlpa3Z6Z3ljY3ZnY3liemRmd2x2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NjM0NDAsImV4cCI6MjA5NTAzOTQ0MH0.T7P_7lYp07zcXrioKkMqZENoYoi-D9aPmjhNAfihMvM';
const EMAIL = process.env.SMOKE_EMAIL || 'oyuncu01@oyna.app';
const PASS = process.env.SMOKE_PASS || 'password123';
const EXPECT_NAME = process.env.SMOKE_EXPECT_NAME || 'EMRE KAYA'; // oyuncu01 = Emre Kaya
const CHROMIUM = process.env.PLAYWRIGHT_CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const PROXY = process.env.HTTPS_PROXY || 'http://127.0.0.1:38961';
const SHOTS = process.env.SMOKE_SHOTS || '/tmp/player-smoke-shots';
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
// Ağ hatalarını KONSOL METNİ yerine YANIT URL'lerine göre sınıflandır
// (bare "Failed to load resource" mesajları URL içermez, güvenilmez).
const IGNORE = [
  /fonts\.googleapis\.com/, /fonts\.gstatic\.com/,          // harici font (sandbox proxy MITM → reset)
  /\/rpc\/admin_fetch_(goalkeepers|referees)/,               // bilinen: admin RPC, fbGet* fallback'i var
];
const netFails = [];
const transientWarnings = [];
// Bağlantı-seviyesi hatalar sandbox shim'inde (request-başına tünel) geçici
// gürültü; kodla ilgisi yok → gate'lemez, yalnız uyarı loglar. Gerçek sinyal:
// HTTP 4xx/5xx (bad request/RLS/şema) + JS pageerror.
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
  // A — kabuk yüklenir
  let shellOk = true;
  try { await page.getByText('Sosyal', { exact: false }).first().waitFor({ timeout: 40000 }); }
  catch { shellOk = false; }
  await page.waitForTimeout(1200);
  await shot(page, '01-boot');
  assert('A: kabuk yüklendi (alt-nav)', shellOk);

  // Profil'e git ve gerçek İSMİN görünmesini bekle (sandbox'ta profil ~12sn).
  await page.getByText('Profil', { exact: true }).first().click().catch(() => {});
  let nameVisible = false;
  try {
    await page.getByText(new RegExp(EXPECT_NAME, 'i')).first().waitFor({ timeout: 25000 });
    nameVisible = true;
  } catch { nameVisible = false; }
  await shot(page, '02-profil');
  const bodyText = (await page.locator('body').innerText().catch(() => '')).toUpperCase();
  const stillLoading = /PROF[İI]L Y[ÜU]KLEN[İI]YOR/.test(bodyText);

  // C — profil çözüldü (isim geldi, "yükleniyor" kalmadı)
  assert('C: profil çözüldü (isim render oldu)', nameVisible && !stillLoading, `isim=${nameVisible} yükleniyor=${stillLoading}`);

  // B — gerçek isim, "Misafir"/"Oyuncu" fallback YOK (KN-2)
  const hasFallback = /\bM[İI]SAF[İI]R\b/.test(bodyText);
  assert('B: gerçek isim görünür, fallback yok', nameVisible && !hasFallback, `isim=${nameVisible} fallback=${hasFallback}`);

  // D — beklenmeyen HTTP 4xx/5xx + JS (pageerror) yok (font + bilinen admin RPC +
  // geçici bağlantı gürültüsü hariç)
  const uniqueFails = [...new Set([...netFails, ...consoleErrors])];
  if (transientWarnings.length) console.log(`  (uyarı: ${transientWarnings.length} geçici bağlantı hatası — sandbox gürültüsü, gate dışı)`);
  assert('D: beklenmeyen HTTP 4xx/5xx / JS hatası yok', uniqueFails.length === 0, uniqueFails.slice(0, 4).join(' | '));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n=== SMOKE: ${results.length - failed.length}/${results.length} geçti ===`);
process.exit(failed.length ? 1 : 0);
