#!/usr/bin/env node
/**
 * Admin panel RPC ve deploy durumu kontrolü
 * Kullanım: node scripts/admin-panel-verify.mjs
 */
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../..');

function loadEnv() {
  const envPath = resolve(root, '.env');
  if (!existsSync(envPath)) return {};
  const env = {};
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

const RPC_CHECKS = [
  { name: 'admin_fetch_revenue_trend', body: { p_days: 7 } },
  { name: 'admin_revoke_platform_role', body: { p_user_id: '00000000-0000-0000-0000-000000000001' } },
  { name: 'admin_fetch_owner_billing_events', body: { p_limit: 1 } },
  { name: 'admin_upsert_user_profile', body: { p_user_id: '00000000-0000-0000-0000-000000000001', p_email: 'x@y.z', p_full_name: 'Test' } },
  { name: 'admin_fetch_matches', body: { p_limit: 1, p_offset: 0 } },
  { name: 'admin_fetch_communities', body: { p_limit: 1, p_offset: 0 } },
  { name: 'admin_get_community', body: { p_id: '00000000-0000-0000-0000-000000000001' } },
  { name: 'admin_create_community', body: { p_payload: { name: 'Test' } } },
  { name: 'admin_update_community', body: { p_id: '00000000-0000-0000-0000-000000000001', p_payload: { name: 'Test' } } },
  { name: 'admin_delete_community', body: { p_id: '00000000-0000-0000-0000-000000000001' } },
  { name: 'admin_manage_community_member', body: { p_community_id: '00000000-0000-0000-0000-000000000001', p_user_id: '00000000-0000-0000-0000-000000000002', p_action: 'ADD' } },
  { name: 'admin_moderate_join_request', body: { p_request_id: '00000000-0000-0000-0000-000000000001', p_approved: false } },
  { name: 'admin_notify_community', body: { p_community_id: '00000000-0000-0000-0000-000000000001', p_title: 'T', p_body: 'B' } },
  { name: 'admin_fetch_pitches', body: { p_limit: 1, p_offset: 0 } },
  { name: 'admin_fetch_withdrawal_requests', body: { p_status: 'PENDING', p_limit: 1 } },
  { name: 'admin_delete_goalkeeper', body: { p_id: '00000000-0000-0000-0000-000000000001' } },
  { name: 'admin_update_user_profile', body: { p_user_id: '00000000-0000-0000-0000-000000000001', p_payload: {} } },
  { name: 'admin_update_goalkeeper', body: { p_id: '00000000-0000-0000-0000-000000000001', p_payload: {} } },
  { name: 'admin_dashboard_stats', body: {} },
  { name: 'admin_get_my_role', body: {} },
  { name: 'admin_fetch_goalkeepers', body: { p_limit: 1 } },
  { name: 'admin_fetch_pending_verifications', body: {} },
];

const env = loadEnv();
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('❌ .env içinde VITE_SUPABASE_URL ve VITE_SUPABASE_ANON_KEY gerekli');
  process.exit(1);
}

console.log('🔍 OYNA OS Admin — Remote RPC Kontrolü\n');
console.log(`Proje: ${url}\n`);

let missing = 0;
let present = 0;

for (const rpc of RPC_CHECKS) {
  const res = await fetch(`${url}/rest/v1/rpc/${rpc.name}`, {
    method: 'POST',
    headers: {
      apikey: key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(rpc.body),
  });
  const text = await res.text();
  const notFound = text.includes('PGRST202') || text.includes('no matches were found');
  if (notFound) {
    console.log(`❌ ${rpc.name} — YOK (migration gerekli)`);
    missing++;
  } else {
    console.log(`✅ ${rpc.name} — mevcut`);
    present++;
  }
}

console.log(`\nÖzet: ${present} mevcut, ${missing} eksik\n`);

if (missing > 0) {
  console.log('Deploy adımları:');
  console.log('  1. supabase login');
  console.log('  2. supabase link --project-ref iikvzgyccvgcybzdfwlv');
  console.log('  3. supabase db push');
  console.log('  4. supabase functions deploy admin-create-user');
  console.log('\nAlternatif: Supabase Dashboard → SQL Editor →');
  console.log('  supabase/migrations/20260623000001_admin_panel_complete.sql dosyasını çalıştırın');
  process.exit(1);
}

console.log('✅ Tüm yeni RPC\'ler remote\'da mevcut.');
process.exit(0);
