// OYNA — KN-3 eşzamanlılık kanıtı (G2 kapısının ana testi).
//
// Senaryo:
//   1) oyuncu01 (SDK) test maçı yaratır (4 açık slot, ücretsiz, herkese açık).
//   2) oyuncu02 TARAYICIDA (gerçek UI) lobiye girer; oyuncu03 SDK ile —
//      o2'nin UI katılımıyla EŞZAMANLI — başka bir slota katılır.
//   3) Assert A: DB'de İKİSİ de kadrodadır (eski kod: o2'nin client'ı bayat
//      tam-dizi yazımıyla o3'ü siliyordu).
//   4) Assert B: o2'nin tarayıcısı HİÇ player_update_match yazmaz (realtime
//      yankı döngüsü öldü) — o3'ün katılımı realtime ile o2 ekranına düşer.
//   5) o2 UI'dan ayrılır → Assert C: o3 kadroda KALIR, yazım hâlâ 0.
//   6) Temizlik: maç CANCELLED yapılır (oyuncu01).
//
// GEREKSİNİM: shim (54321) + dev server (5199) — bkz. tests/player-smoke.mjs.
// ÇALIŞTIR: NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt node tests/match-concurrency.mjs

import pkg from '@playwright/test';
const { chromium } = pkg;
import { createClient } from '@supabase/supabase-js';

const BASE = process.env.SMOKE_BASE || 'http://localhost:5199';
const SB = process.env.SMOKE_SB || 'http://localhost:54321';
const ANON = process.env.SMOKE_ANON ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlpa3Z6Z3ljY3ZnY3liemRmd2x2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NjM0NDAsImV4cCI6MjA5NTAzOTQ0MH0.T7P_7lYp07zcXrioKkMqZENoYoi-D9aPmjhNAfihMvM';
const PASS = 'password123';
const CHROMIUM = process.env.PLAYWRIGHT_CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const PROXY = process.env.HTTPS_PROXY || 'http://127.0.0.1:38961';
const SHOTS = process.env.SMOKE_SHOTS || '/tmp/match-concurrency-shots';
import fs from 'node:fs';
fs.mkdirSync(SHOTS, { recursive: true });

const TITLE = `KN3 EŞZAMANLILIK ${Date.now().toString(36).toUpperCase()}`;
const results = [];
const assert = (n, ok, d = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`); };
const mkClient = () => createClient(SB, ANON, { auth: { persistSession: false } });
const login = async (email) => {
  const c = mkClient();
  const { data, error } = await c.auth.signInWithPassword({ email, password: PASS });
  if (error) throw new Error(`${email} login: ${error.message}`);
  return { c, session: data.session, uid: data.user.id };
};

// ── 1) Maçı yarat (oyuncu01) ────────────────────────────────────────────────
const o1 = await login('oyuncu01@oyna.app');
const o2 = await login('oyuncu02@oyna.app');
const o3 = await login('oyuncu03@oyna.app');

// Bugün +2 saat (gün taşarsa yarın 21:00) — B8 zaman filtresine takılmasın.
const now = new Date();
let target = new Date(now.getTime() + 2 * 3600 * 1000);
if (target.getDate() !== now.getDate()) target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 21, 0);
const dateIso = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`;
// TEK saat kullan: player_create_match "HH:00 - HH:00" aralığını timezone
// sanıp bozuyor/çökertiyor (H-B1 bulgusu — backend backlog).
const timeStr = `${String(target.getHours()).padStart(2, '0')}:00`;

// 6 slot: 2 katılım eşiği (toplam−2) TETİKLEMESİN — aksi hâlde maç LIVE'a
// geçip lobi düzeni değişiyor ve ayrılma akışı test edilemiyor.
const slots = [
  { id: 'c1', role: 'FWD', x: 50, y: 22, status: 'OPEN' },  // UI: "HÜC"
  { id: 'c2', role: 'MID', x: 28, y: 45, status: 'OPEN' },  // SDK hedefi
  { id: 'c3', role: 'MID', x: 72, y: 45, status: 'OPEN' },
  { id: 'c4', role: 'DEF', x: 30, y: 68, status: 'OPEN' },
  { id: 'c5', role: 'DEF', x: 70, y: 68, status: 'OPEN' },
  { id: 'c6', role: 'GK',  x: 50, y: 86, status: 'OPEN' },
];
// Koordinatlı bir saha bağla → get_nearby_matches'e de girer (scope'lu
// kullanıcıda da görünür; prod-sadık kurulum).
const { data: pitch } = await o1.c.from('pitches').select('id,name').not('latitude', 'is', null).limit(1).single();
const { data: matchId, error: createErr } = await o1.c.rpc('player_create_match', {
  p_payload: {
    // DİKKAT: keşif kartı büyük başlık olarak LOCATION'ı render eder (title'ı
    // değil) → benzersiz test etiketi location'a yazılır ki locator bulsun.
    title: TITLE, location: TITLE, date: dateIso, time: timeStr,
    price: 0, difficulty: 'Rahat', status: 'ACTIVE', format: '4v4',
    // isDemo:false ŞART — matches SELECT RLS'i demo satırları (demo_mode_enabled
    // kapalıyken) HERKESTEN gizler; test maçı görünür olmalı. Temizlik: CANCELLED. visibility: 'OPEN', creatorId: o1.uid, isDemo: false,
    pitch_id: pitch?.id || null,
    badges: [], missingPositions: [], slots, awaySlots: [], reservePlayers: [], chatMessages: [],
  },
});
if (createErr || !matchId) { console.error('Maç yaratılamadı:', createErr?.message); process.exit(1); }
console.log('Test maçı:', matchId, '|', TITLE);

const readSlots = async () => {
  const { data } = await o1.c.from('matches').select('slots').eq('id', matchId).single();
  return data?.slots || [];
};
const inSlots = (arr, uid) => arr.some((s) => s?.player?.id === uid);

let browser;
try {
  // ── 2) o2 tarayıcıda lobiye girer ─────────────────────────────────────────
  browser = await chromium.launch({ executablePath: CHROMIUM, proxy: { server: PROXY, bypass: 'localhost,127.0.0.1' } });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addInitScript(([k, v]) => { try { localStorage.setItem('oyna.remember', 'true'); localStorage.setItem(k, v); } catch {} }, ['oyna.auth.token', JSON.stringify(o2.session)]);
  const page = await ctx.newPage();
  let umWrites = 0; // player_update_match yazım sayacı (0 kalmalı)
  page.on('request', (r) => { if (r.url().includes('player_update_match')) umWrites++; });

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.getByText('Sosyal').first().waitFor({ timeout: 40000 });
  await page.getByText('Top Oyna', { exact: true }).first().click();
  // Sandbox tuzağı: retryInitialLoad'un 3sn timeout'u yavaş shim'de maç
  // listesini boş bırakabilir → kart görünene dek "Yeniden dene" bandına bas.
  const card = page.getByText(new RegExp(TITLE.split(' ')[0] + '.*' + TITLE.split(' ')[2], 'i')).first();
  for (let round = 0; round < 5; round++) {
    try { await card.waitFor({ timeout: 8000 }); break; } catch {}
    console.log(`  (kart yok, yeniden dene turu ${round + 1})`);
    await page.getByText('Yeniden dene', { exact: false }).first().click({ timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(2500);
  }
  try {
    await card.waitFor({ timeout: 5000 });
  } catch (e) {
    // Teşhis: ekran + görünen içerik dökümü
    await page.screenshot({ path: `${SHOTS}/00-discovery-fail.png`, fullPage: true }).catch(() => {});
    const txt = await page.locator('body').innerText().catch(() => '');
    console.log('=== SAYFA METNİ (ilk 1200) ===');
    console.log(txt.slice(0, 1200).replace(/\n{2,}/g, '\n'));
    throw e;
  }
  await card.scrollIntoViewIfNeeded().catch(() => {});
  await card.click();
  await page.waitForTimeout(2500); // lobi + hidrasyon
  await page.screenshot({ path: `${SHOTS}/01-lobby.png` });

  // ── 3) EŞZAMANLI: o2 UI'dan HÜC slotu + o3 SDK'dan c2 ────────────────────
  const pollSlots = async (pred, ms) => {
    const t0 = Date.now();
    let last = [];
    while (Date.now() - t0 < ms) {
      last = await readSlots();
      if (pred(last)) return last;
      await new Promise((r) => setTimeout(r, 1200));
    }
    return last;
  };

  const uiJoinAttempt = async () => {
    await page.locator('button:has-text("HÜC")').first().click({ timeout: 8000 });
    await page.waitForTimeout(500);
    await page.locator('button:has-text("SAHAYA ÇIK"), button:has-text("ÖDE VE KATIL")').first().click({ timeout: 8000 });
    // Katılım başarı sinyali: alt barda KADRODASIN
    await page.getByText('KADRODASIN', { exact: false }).first().waitFor({ timeout: 12000 }).catch(() => {});
  };
  const sdkJoin = o3.c.rpc('join_public_match_slot', { p_match_id: matchId, p_slot_id: 'c2', p_user_id: o3.uid, p_is_away: false });
  const [uiErr, sdkRes] = await Promise.all([uiJoinAttempt().catch((e) => e), sdkJoin]);
  if (uiErr) console.log('  (o2 UI join 1. deneme hatası:', String(uiErr).slice(0, 80) + ')');
  if (sdkRes?.error) console.log('  (o3 SDK join hatası:', sdkRes.error.message + ')');

  // DB'ye kadar POLL et (yavaş sandbox'ta sabit bekleme flaky); o2 girmediyse
  // bir kez daha dene (yeniden-render yarışı olabilir).
  let after = await pollSlots((s) => inSlots(s, o2.uid) && inSlots(s, o3.uid), 18000);
  if (!inSlots(after, o2.uid)) {
    console.log('  (o2 kadroda değil — UI katılım 2. deneme)');
    await uiJoinAttempt().catch((e) => console.log('  (2. deneme hatası:', String(e).slice(0, 80) + ')'));
    after = await pollSlots((s) => inSlots(s, o2.uid), 15000);
  }
  await page.screenshot({ path: `${SHOTS}/02-both-joined.png` });
  assert('A: eşzamanlı katılım — İKİSİ de kadroda', inSlots(after, o2.uid) && inSlots(after, o3.uid),
    `o2=${inSlots(after, o2.uid)} o3=${inSlots(after, o3.uid)}`);
  assert('B: tarayıcı player_update_match yazmadı (yankı yok)', umWrites === 0, `yazım=${umWrites}`);

  // o3 realtime ile o2 ekranına düştü mü? (applyMatchLocal çalışıyor)
  const o3Name = (await o1.c.from('profiles').select('full_name').eq('id', o3.uid).single()).data?.full_name || '';
  const o3First = o3Name.split(' ')[0];
  const uiShowsO3 = o3First ? (await page.getByText(new RegExp(o3First, 'i')).count()) > 0 : true;
  assert('B2: realtime katılımcı UI\'da görünür', uiShowsO3, `aranan=${o3First}`);

  // ── 5) o2 UI'dan ayrılır → o3 hayatta kalmalı ─────────────────────────────
  // "SLOTTAN AYRIL" aksiyonu YALNIZ yönetim (MANAGE) lobisinde render edilir
  // (MatchJoin.tsx ~1098: 'Yönetim aksiyonları — YALNIZ MANAGE'). Gerçek
  // kullanıcı yolu: Ana Sayfa → MAÇLARIM → maç kartı → yönetim lobisi.
  // Lobide alt nav yok → önce header geri okuyla çık, sonra Ana Sayfa.
  await page.locator('button:has(svg.lucide-arrow-left)').first().click({ timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.getByText('Ana Sayfa', { exact: true }).first().click({ timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(1800);
  await page.getByText('MAÇLARIM', { exact: false }).first().click({ timeout: 8000 }).catch((e) => console.log('  (MAÇLARIM yok:', String(e).slice(0, 60) + ')'));
  await page.waitForTimeout(2200);
  await page.getByText(new RegExp(TITLE.split(' ')[2], 'i')).first().click({ timeout: 10000 }).catch((e) => console.log('  (Maçlarım kartı yok:', String(e).slice(0, 60) + ')'));
  await page.waitForTimeout(2500);
  // Katılım sonrası görünüm AWAY tarafında açılabilir; kendi slotumuz EV'de.
  await page.locator('button:has-text("TAKIM")').first().click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(800);
  await page.locator('button:has-text("SEN")').first().click({ timeout: 8000 }).catch((e) => console.log('  (SEN tıklanamadı:', String(e).slice(0, 60) + ')'));
  await page.waitForTimeout(800);
  await page.getByText('SLOTTAN AYRIL', { exact: false }).first().click({ timeout: 6000 }).catch((e) => console.log('  (SLOTTAN AYRIL yok:', String(e).slice(0, 60) + ')'));
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: /AYRIL/i }).last().click({ timeout: 6000 }).catch((e) => console.log('  (AYRIL onayı yok:', String(e).slice(0, 60) + ')'));
  const afterLeave = await pollSlots((s) => !inSlots(s, o2.uid), 15000);
  await page.screenshot({ path: `${SHOTS}/03-after-leave.png` });
  const o2Gone = !inSlots(afterLeave, o2.uid);
  assert('C: o2 ayrıldı, o3 kadroda KALDI', o2Gone && inSlots(afterLeave, o3.uid),
    `o2Gone=${o2Gone} o3=${inSlots(afterLeave, o3.uid)}`);
  assert('D: ayrılma sonrası da yazım 0', umWrites === 0, `yazım=${umWrites}`);
} finally {
  if (browser) await browser.close();
  // ── 6) Temizlik ───────────────────────────────────────────────────────────
  const { error: cancelErr } = await o1.c.rpc('player_update_match', { p_match_id: matchId, p_payload: { status: 'CANCELLED' } });
  console.log('Temizlik:', cancelErr ? 'CANCELLED yapılamadı: ' + cancelErr.message : 'maç CANCELLED');
}

const failed = results.filter((r) => !r).length;
console.log(`\n=== CONCURRENCY: ${results.length - failed}/${results.length} geçti ===`);
process.exit(failed ? 1 : 0);
