#!/usr/bin/env node
/**
 * Admin panel Supabase deploy — migration + edge function
 * Gerekli env (en az biri):
 *   SUPABASE_ACCESS_TOKEN — Dashboard → Account → Access Tokens
 *   SUPABASE_DB_PASSWORD — proje DB şifresi (supabase db push için)
 * Uygulama yolu (SG-6): önce CLI `supabase db push` (schema_migrations
 * defterine yazar — playbook kural 1); Management API yalnız son çaredir.
 */
import { readFileSync, existsSync, readdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../..');
const PROJECT_REF = 'iikvzgyccvgcybzdfwlv';
// Tüm migration dosyalarını TARİH SIRASIYLA (dosya adı YYYYMMDD... ile başlar)
// otomatik topla — elle liste tutmak "sessiz eksik migration" riskine yol açıyordu.
// Migrasyonlar idempotent yazıldığı için "already exists" durumları aşağıda atlanır.
const MIGRATIONS_DIR = resolve(root, 'supabase/migrations');
const MIGRATIONS = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => resolve(MIGRATIONS_DIR, f));

function loadEnv() {
  const env = { ...process.env };
  for (const name of ['.env', '.env.local']) {
    const p = resolve(root, name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const k = trimmed.slice(0, eq).trim();
      if (!env[k]) env[k] = trimmed.slice(eq + 1).trim();
    }
  }
  return env;
}

const env = loadEnv();
const tokenArg = process.argv.find((a) => a.startsWith('--token='));
if (tokenArg) env.SUPABASE_ACCESS_TOKEN = tokenArg.slice('--token='.length);
const token = env.SUPABASE_ACCESS_TOKEN;
const dbPassword = env.SUPABASE_DB_PASSWORD;

console.log('🚀 OYNA OS Admin — Supabase Deploy\n');

function ensureCliAuth() {
  if (!token) return false;
  const login = spawnSync('supabase', ['login', '--token', token], { cwd: root, stdio: 'pipe' });
  return login.status === 0;
}

async function applyViaManagementApi() {
  if (!token) return false;
  // ⚠️ Bu yol ham SQL çalıştırır ve supabase_migrations.schema_migrations
  // defterine YAZMAZ (MIGRATION_PLAYBOOK kural 1'in yasakladığı defter-dışı
  // mekanizma; 2026-07-21 drift onarımının kaynağıydı). Bu yüzden artık yalnız
  // CLI (db push) kurulamadığında son çare olarak kullanılır.
  console.warn('⚠️  Management API yolu schema_migrations defterine yazmaz — drift riski. Mümkünse SUPABASE_DB_PASSWORD verip CLI yolunu kullanın.');
  for (const migrationPath of MIGRATIONS) {
    if (!existsSync(migrationPath)) {
      console.error('❌ Migration dosyası bulunamadı:', migrationPath);
      process.exit(1);
    }
    const sql = readFileSync(migrationPath, 'utf8');
    const name = migrationPath.split('/').pop();
    console.log(`📦 Management API ile migration uygulanıyor: ${name}...`);
    const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    });
    const body = await res.text();
    if (!res.ok) {
      const alreadyApplied = res.status === 400 && (
        body.includes('already exists') ||
        body.includes('duplicate key')
      );
      if (alreadyApplied) {
        console.warn(`⚠️  ${name} zaten uygulanmış — atlanıyor`);
        continue;
      }
      console.error('❌ Migration API hatası:', name, res.status, body.slice(0, 500));
      return false;
    }
    console.log(`✅ ${name} uygulandı (Management API)`);
  }
  return true;
}

function applyViaCli() {
  if (!dbPassword && !token) return false;
  if (token && !ensureCliAuth()) {
    console.error('❌ supabase login --token başarısız');
    return false;
  }
  console.log('📦 supabase link + db push...');
  const linkArgs = ['link', '--project-ref', PROJECT_REF, '--yes'];
  if (dbPassword) linkArgs.push('--password', dbPassword);
  const link = spawnSync('supabase', linkArgs, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, SUPABASE_ACCESS_TOKEN: token || '' },
  });
  if (link.status !== 0) {
    console.error('❌ supabase link başarısız');
    return false;
  }
  const push = spawnSync('supabase', ['db', 'push', '--yes'], { cwd: root, stdio: 'inherit' });
  if (push.status !== 0) {
    console.error('❌ supabase db push başarısız');
    return false;
  }
  console.log('✅ Migration uygulandı (CLI db push)');
  return true;
}

function deployEdgeFunction() {
  if (!token) {
    console.warn('⚠️  Edge function için SUPABASE_ACCESS_TOKEN gerekli');
    return false;
  }
  ensureCliAuth();
  console.log('📦 Edge function: admin-create-user...');
  const deploy = spawnSync('supabase', ['functions', 'deploy', 'admin-create-user', '--project-ref', PROJECT_REF, '--no-verify-jwt'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, SUPABASE_ACCESS_TOKEN: token || '' },
  });
  if (deploy.status !== 0) {
    console.warn('⚠️  Edge function deploy başarısız — SUPABASE_ACCESS_TOKEN ile tekrar deneyin');
    return false;
  }
  console.log('✅ admin-create-user deploy edildi');
  return true;
}

// SIRA ÖNEMLİ (SG-6): önce CLI (supabase db push) — schema_migrations
// defterine yazar, playbook'un tek onaylı kanalıdır. Management API yalnız
// CLI başarısız olursa son çaredir (defter-dışı; drift üretir).
let migrated = applyViaCli();
if (!migrated && token) migrated = await applyViaManagementApi();

if (!migrated) {
  console.log('\n❌ Migration uygulanamadı. Şunlardan birini .env dosyasına ekleyin:\n');
  console.log('  SUPABASE_ACCESS_TOKEN=sbp_...   (önerilen)');
  console.log('  SUPABASE_DB_PASSWORD=...        (alternatif)\n');
  console.log('Token: https://supabase.com/dashboard/account/tokens');
  console.log('Manuel: Dashboard → SQL Editor →');
  console.log('  npm run admin:deploy:interactive\n');
  process.exit(1);
}

deployEdgeFunction();

console.log('\n🔍 RPC doğrulaması...\n');
const verify = spawnSync('node', ['admin-panel/scripts/admin-panel-verify.mjs'], { cwd: root, stdio: 'inherit' });
process.exit(verify.status ?? 1);
