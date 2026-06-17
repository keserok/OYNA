#!/usr/bin/env node
/**
 * Owner menü ayarları — canlı Supabase okuma testi (anon key)
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const DEMO_PITCH_ID = 'd1111111-1111-4111-8111-111111111111';

function loadEnv() {
  const envPath = resolve(root, '.env');
  if (!existsSync(envPath)) throw new Error('.env bulunamadı');
  const env = {};
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

const checks = [];
function ok(name, pass, detail = '') {
  checks.push({ name, pass, detail });
  console.log(`${pass ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  const env = loadEnv();
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY gerekli');

  const sb = createClient(url, key);
  console.log(`\nOYNA Owner Menü Canlı Test — ${url}\n`);

  const { data: pitch, error: pitchErr } = await sb
    .from('pitches')
    .select(
      'id,name,city,district,address,is_open,auto_approve_enabled,auto_approve_minutes,working_hours,payment_options,param_merchant_id,verification_status',
    )
    .eq('id', DEMO_PITCH_ID)
    .maybeSingle();

  ok('Demo tesis okuma', !pitchErr && !!pitch, pitchErr?.message ?? pitch?.name);

  if (pitch) {
    ok('Tesis konum alanları', !!(pitch.city || pitch.district || pitch.address));
    ok('Çalışma saatleri JSON', Array.isArray(pitch.working_hours) || pitch.working_hours == null);
    ok('Oto onay ayarı', typeof pitch.auto_approve_enabled === 'boolean');
    ok('Oto onay dakikası', Number(pitch.auto_approve_minutes) > 0);
    ok('Tesis açık/kapalı', typeof pitch.is_open === 'boolean');
    ok('Ödeme seçenekleri', !!pitch.payment_options);
  }

  const { data: tariffs, error: tariffErr } = await sb
    .from('pitch_tariffs')
    .select('id,name,price_per_hour,is_active')
    .eq('pitch_id', DEMO_PITCH_ID)
    .eq('is_active', true);
  ok('Aktif tarifeler', !tariffErr, tariffErr?.message ?? `${tariffs?.length ?? 0} tarife`);

  const { data: banks, error: bankErr } = await sb
    .from('pitch_bank_accounts')
    .select('id,bank_name,is_primary')
    .eq('pitch_id', DEMO_PITCH_ID);
  const bankAnonBlocked =
    bankErr?.message?.includes('permission') || bankErr?.message?.includes('has_role');
  if (bankAnonBlocked) {
    ok('Banka hesapları (anon RLS)', true, 'Owner oturumu gerekli — uzak DB doğrulandı');
  } else {
    ok('Banka hesapları', !bankErr, bankErr?.message ?? `${banks?.length ?? 0} hesap`);
  }

  const { data: courts, error: courtErr } = await sb
    .from('courts')
    .select('id,name,is_active')
    .eq('pitch_id', DEMO_PITCH_ID)
    .eq('is_active', true);
  ok('Aktif sahalar', !courtErr, courtErr?.message ?? `${courts?.length ?? 0} saha`);

  const passed = checks.filter((c) => c.pass).length;
  const failed = checks.filter((c) => !c.pass).length;
  console.log(`\nSonuç: ${passed} geçti, ${failed} başarısız\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
