// ═══════════════════════════════════════════════════════════════════════════
// OYNA — password-reset-confirm Edge Function
// "Şifremi unuttum" akışı — 2. adım: kodu doğrula + yeni şifreyi yaz.
//
// • İstek gövdesi: { email, code, newPassword }
// • Kodun hash'i eşleşir + süresi geçmemiş + kullanılmamış + deneme < 5 ise:
//   service-role ile auth.admin.updateUserById(uid, { password }) çağrılır.
// • Başarıda kod "used=true" işaretlenir.
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (otomatik), RESET_CODE_PEPPER.
// Deploy: supabase functions deploy password-reset-confirm --no-verify-jwt
// ═══════════════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const MAX_ATTEMPTS = 5;
const MIN_PASSWORD = 6;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const pepper = Deno.env.get('RESET_CODE_PEPPER') || serviceKey;

  let body: { email?: string; code?: string; newPassword?: string };
  try { body = await req.json(); } catch { return json({ ok: false, error: 'INVALID_BODY' }, 400); }

  const email = String(body.email ?? '').trim().toLowerCase();
  const code = String(body.code ?? '').trim();
  const newPassword = String(body.newPassword ?? '');

  if (!email || !/^\d{6}$/.test(code)) return json({ ok: false, error: 'invalid_request' }, 400);
  if (newPassword.length < MIN_PASSWORD) return json({ ok: false, error: 'weak_password' }, 400);

  const admin = createClient(supabaseUrl, serviceKey);

  try {
    // 1) En son geçerli (kullanılmamış, süresi geçmemiş) kaydı bul.
    const { data: rows } = await admin
      .from('password_reset_codes')
      .select('id, code_hash, attempts, expires_at')
      .eq('email', email)
      .eq('used', false)
      .gte('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1);

    const row = rows?.[0];
    if (!row) return json({ ok: false, error: 'invalid_or_expired' }, 400);

    if ((row.attempts ?? 0) >= MAX_ATTEMPTS) {
      await admin.from('password_reset_codes').update({ used: true }).eq('id', row.id);
      return json({ ok: false, error: 'too_many_attempts' }, 429);
    }

    const codeHash = await sha256Hex(`${pepper}:${email}:${code}`);
    if (codeHash !== row.code_hash) {
      await admin.from('password_reset_codes').update({ attempts: (row.attempts ?? 0) + 1 }).eq('id', row.id);
      return json({ ok: false, error: 'invalid_or_expired' }, 400);
    }

    // 2) Kullanıcıyı bul (profiles.email UNIQUE) ve şifreyi güncelle.
    const { data: profile } = await admin
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();
    if (!profile) {
      await admin.from('password_reset_codes').update({ used: true }).eq('id', row.id);
      return json({ ok: false, error: 'invalid_or_expired' }, 400);
    }

    const { error: updErr } = await admin.auth.admin.updateUserById(profile.id as string, {
      password: newPassword,
    });
    if (updErr) throw updErr;

    // 3) Kodu tüket.
    await admin.from('password_reset_codes').update({ used: true }).eq('id', row.id);

    return json({ ok: true });
  } catch (e) {
    console.error('[password-reset-confirm] error:', e);
    return json({ ok: false, error: 'internal' }, 500);
  }
});
