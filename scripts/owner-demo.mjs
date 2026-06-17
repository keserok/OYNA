#!/usr/bin/env node
/**
 * Owner demo tesis seed / purge CLI
 * Kullanım: node scripts/owner-demo.mjs seed | purge
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

function loadEnv() {
  const envPath = resolve(root, '.env');
  if (!existsSync(envPath)) {
    console.error('Hata: .env dosyası bulunamadı. .env.example dosyasını kopyalayın.');
    process.exit(1);
  }
  const raw = readFileSync(envPath, 'utf8');
  const env = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

const action = process.argv[2];
if (!action || !['seed', 'purge'].includes(action)) {
  console.error('Kullanım: node scripts/owner-demo.mjs <seed|purge>');
  process.exit(1);
}

const env = loadEnv();
const url = env.VITE_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Hata: VITE_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY .env içinde tanımlı olmalı.');
  console.error('Demo seed/purge yalnızca service role ile çalışır (güvenlik).');
  process.exit(1);
}

const supabase = createClient(url, key);

async function main() {
  const rpc = action === 'seed' ? 'seed_owner_demo' : 'purge_owner_demo';
  const { data, error } = await supabase.rpc(rpc);
  if (error) {
    console.error(`RPC ${rpc} başarısız:`, error.message);
    process.exit(1);
  }
  if (action === 'seed') {
    console.log(`Demo tesis oluşturuldu: ${data ?? 'd1111111-1111-4111-8111-111111111111'}`);
  } else {
    console.log('Demo tesis verileri temizlendi.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
