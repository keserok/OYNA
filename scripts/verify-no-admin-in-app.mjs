#!/usr/bin/env node
/**
 * Faz B güvenlik kanıtı: `APP_TARGET=app` ile üretilen dist/ içinde YÖNETİM
 * PANELİNE ait hiçbir kod/iz kalmadığını doğrular. Mağazaya giden mobil
 * pakette admin kodu taşımak inceleme + saldırı yüzeyi riskidir; bu betik
 * sızıntıyı build'i kırarak yakalar.
 *
 * Kullanım: APP_TARGET=app vite build && node scripts/verify-no-admin-in-app.mjs
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '..', 'dist');

// Yönetim PANELİ (god-view) UI imzaları. Not: admin RPC SERVİS katmanı
// (adminService) owner/saha CRUD için app'te meşru biçimde paylaşılır ve
// sunucuda is_platform_admin() ile korunur; o yüzden servis fonksiyon adları
// değil, YALNIZ panel arayüzü imzaları yasaklıdır.
const FORBIDDEN = [
  'GodViewPanel',      // panel kabuğu
  'AdminLayout',       // panel yerleşimi
  'BÖLGE KOMUTASI',    // sidebar grup başlığı
  'SupportInboxPage',  // panel sayfası
  'CommandPalette',    // panel komut paleti
  'AdminAuthGate',     // panel giriş kapısı
];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

if (!existsSync(DIST)) {
  console.error('✖ dist/ yok. Önce `APP_TARGET=app vite build` çalıştırın.');
  process.exit(1);
}

// 1) admin.html üretilmiş mi?
if (existsSync(path.join(DIST, 'admin-panel', 'admin.html')) || existsSync(path.join(DIST, 'admin.html'))) {
  console.error('✖ dist/ içinde admin.html bulundu — app hedefi admin giriş noktası içermemeli.');
  process.exit(1);
}

// 2) JS/HTML çıktılarında admin imzası taranır
const files = walk(DIST).filter((f) => /\.(js|html)$/.test(f));
const hits = [];
for (const f of files) {
  const content = readFileSync(f, 'utf-8');
  for (const needle of FORBIDDEN) {
    if (content.includes(needle)) hits.push({ file: path.relative(DIST, f), needle });
  }
}

if (hits.length) {
  console.error('✖ App paketine admin kodu sızmış:');
  for (const h of hits) console.error(`   - ${h.file}  →  "${h.needle}"`);
  console.error('\nApp.tsx admin panelini doğrudan import ediyor olabilir; AdminRedirect kullanıldığından emin olun.');
  process.exit(1);
}

console.log(`✓ App paketi temiz — ${files.length} çıktı tarandı, admin kodu yok.`);
