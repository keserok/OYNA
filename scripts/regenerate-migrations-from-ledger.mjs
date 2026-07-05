#!/usr/bin/env node
// ============================================================================
// OYNA — Migration defterini (schema_migrations) repo ile birebir eşitleyen araç
// ----------------------------------------------------------------------------
// NE YAPAR
//   Canlı Supabase Postgres'teki `supabase_migrations.schema_migrations` tablosu
//   HER migration'ın uygulanan GERÇEK SQL'ini (statements[]) saklar. Bu script o
//   tabloyu okuyup `supabase/migrations/` klasörünü baştan, uygulanan gerçek
//   geçmişle BİREBİR aynı olacak şekilde yeniden üretir.
//
//   Sonuç: `supabase db push`  → no-op (drift yok)
//          `supabase db reset`  → boş DB'de üretimin AYNISINI kurar (DR/staging çalışır)
//
// NEDEN GEREKLİ
//   Repo'daki dosya adları/timestamp'leri zamanla canlı defterle uyumsuz hale
//   geldi (MCP apply_migration kendi timestamp'ini üretir; bazı migration'lar
//   repo'ya hiç yazılmadı). Detay: docs/master/SUPABASE_MIGRATION_RECONCILIATION.md
//
// GÜVENLİ
//   - Canlı VERİTABANINA YAZMAZ, sadece OKUR (SELECT).
//   - Mevcut repo dosyalarını SİLMEZ; `supabase/migrations_archive_<tarih>/`
//     altına taşır (geri alınabilir).
//   - --confirm verilmeden dosya yazmaz (dry-run varsayılan).
//
// KULLANIM
//   1) Bağımlılık:            npm i -D pg
//   2) DB bağlantısı (Supabase Dashboard → Project Settings → Database → Connection string):
//        export SUPABASE_DB_URL="postgresql://postgres:[PASSWORD]@db.iikvzgyccvgcybzdfwlv.supabase.co:5432/postgres"
//   3) Önce prova (yazmadan gösterir):
//        node scripts/regenerate-migrations-from-ledger.mjs
//   4) Gerçekten uygula:
//        node scripts/regenerate-migrations-from-ledger.mjs --confirm
//   5) İncele → commit et:  git add -A supabase/ && git commit
//
//   Not: PASSWORD içinde özel karakter varsa URL-encode et. Pooler (6543) yerine
//   doğrudan (5432) bağlantı önerilir. İşi biten yedek tablo:
//   `supabase_migrations.schema_migrations_backup_20260705` (istersen sonra düşür).
// ============================================================================

import { writeFileSync, mkdirSync, readdirSync, renameSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');            // scripts/ → repo kökü
const MIG_DIR = join(REPO_ROOT, 'supabase', 'migrations');

const CONFIRM = process.argv.includes('--confirm');
const DB_URL = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;

function die(msg) { console.error(`\n❌ ${msg}\n`); process.exit(1); }

if (!DB_URL) {
  die('SUPABASE_DB_URL (veya DATABASE_URL) tanımlı değil. Yukarıdaki KULLANIM bölümüne bak.');
}

let pg;
try {
  pg = await import('pg');
} catch {
  die("'pg' paketi yok. Önce çalıştır:  npm i -D pg");
}

// UTC tabanlı arşiv damgası (yerel saat kaymasından etkilenmez)
function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}_${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

// Dosya adı için güvenli sanitizasyon (defter 'name' alanı serbest metin olabilir)
function safeName(name) {
  return String(name || 'unnamed').replace(/[^a-zA-Z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'unnamed';
}

const { Client } = pg;
const client = new Client({ connectionString: DB_URL });

console.log('→ Canlı deftere bağlanılıyor (yalnız okuma)…');
await client.connect();

const { rows } = await client.query(
  `SELECT version, name, statements
     FROM supabase_migrations.schema_migrations
    ORDER BY version ASC`
);
await client.end();

if (!rows.length) die('Defter boş görünüyor — bağlantı/şema doğru mu?');

// ── KRİTİK: Defter (ledger) EN BAŞTA EKSİKTİR ────────────────────────────────
// Defterin ilk kaydı (ör. v20260606112849) `public.pitches`'i VAR kabul eder;
// onu YARATMAZ. Temel şema (profiles/matches/pitches… — Mayıs sonu migration'ları)
// yalnız REPO dosyalarında kayıtlıdır, defterde değil. Bu yüzden birebir yeniden-
// kurulabilir bir repo = [defter-öncesi temel repo dosyaları] + [defter kayıtları].
// Aksi halde boş DB'de `db reset` "pitches yok" hatası verir.
const firstLedgerVersion = rows[0].version;

const existingFiles = existsSync(MIG_DIR)
  ? readdirSync(MIG_DIR).filter((f) => f.endsWith('.sql'))
  : [];
// version-prefix'i defterin ilk sürümünden KÜÇÜK olan repo dosyaları = temel (korunur)
const foundational = existingFiles
  .filter((f) => {
    const m = f.match(/^(\d+)_/);
    return m && m[1] < firstLedgerVersion;
  })
  .sort();

console.log(`→ ${rows.length} defter kaydı okundu (v${firstLedgerVersion} … v${rows[rows.length - 1].version}).`);
console.log(`→ Defter-öncesi temel repo dosyası (korunacak): ${foundational.length}`);

// Ledger kayıtlarından üretilecek dosyalar
const ledgerFiles = rows.map((r) => {
  const fname = `${r.version}_${safeName(r.name)}.sql`;
  const header = `-- Kaynak: supabase_migrations.schema_migrations (uygulanan gerçek SQL)\n`
              + `-- version=${r.version} name=${r.name}\n`
              + `-- Bu dosya ledger'dan otomatik üretildi (regenerate-migrations-from-ledger.mjs). Elle düzenleme.\n\n`;
  const body = Array.isArray(r.statements) ? r.statements.join('\n') : String(r.statements ?? '');
  return { fname, content: header + body + (body.endsWith('\n') ? '' : '\n') };
});

if (!CONFIRM) {
  console.log('\n— PROVA (dry-run). --confirm ile gerçekten yazılır. —');
  console.log(`  Arşivlenecek mevcut dosya: ${existingFiles.length}`);
  console.log(`  Korunacak temel dosya:     ${foundational.length}  (${foundational[0] ?? '-'} … ${foundational[foundational.length - 1] ?? '-'})`);
  console.log(`  Ledger'dan üretilecek:      ${ledgerFiles.length}`);
  console.log('  Ledger ilk 3:'); ledgerFiles.slice(0, 3).forEach(f => console.log('   +', f.fname));
  console.log('  Ledger son 3:'); ledgerFiles.slice(-3).forEach(f => console.log('   +', f.fname));
  process.exit(0);
}

// Mevcut TÜM dosyaları arşive taşı (silme değil, geri alınabilir)
let archive = null;
if (existingFiles.length) {
  archive = join(REPO_ROOT, 'supabase', `migrations_archive_${stamp()}`);
  mkdirSync(archive, { recursive: true });
  for (const f of existingFiles) renameSync(join(MIG_DIR, f), join(archive, f));
  console.log(`→ ${existingFiles.length} eski dosya arşivlendi: ${archive.replace(REPO_ROOT + '/', '')}`);
} else {
  mkdirSync(MIG_DIR, { recursive: true });
}

// 1) Temel (defter-öncesi) dosyaları arşivden GERİ getir (değiştirmeden)
for (const f of foundational) {
  renameSync(join(archive, f), join(MIG_DIR, f));
}
// 2) Ledger kayıtlarını yaz
for (const f of ledgerFiles) writeFileSync(join(MIG_DIR, f.fname), f.content, 'utf8');

console.log(`\n✅ Yeniden üretildi → supabase/migrations/  (${foundational.length} temel + ${ledgerFiles.length} ledger = ${foundational.length + ledgerFiles.length} dosya)`);
console.log('   Sıradaki: `git add -A supabase/ && git status` ile incele, sonra commit et.');
console.log('   ÖNEMLİ doğrulama: boş bir Supabase branch/staging\'de `supabase db reset` çalıştır →');
console.log('   hatasız kurulmalı. Sonra `supabase db push` → "no changes" demeli (drift kalmadı).');
