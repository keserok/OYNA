// ═══════════════════════════════════════════════════════════════════════════
// OYNA — password-reset-request Edge Function
// "Şifremi unuttum" akışı — 1. adım: 6 haneli kod üret + e-postaya gönder.
//
// • Kodun yalnız SHA-256 HASH'i public.password_reset_codes'a yazılır.
// • Kod, mevcut Resend `send-email` fonksiyonu ile gönderilir (x-email-secret).
// • Kullanıcı sıralaması (enumeration) sızdırmaz: e-posta kayıtlı olsun olmasın
//   HER ZAMAN 200 { ok: true } döner.
// • Rate-limit: aynı e-posta için son 15 dk'da 3'ten fazla istek → sessiz yut.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (otomatik)
//   RESEND_API_KEY     → Resend gönderimi (yoksa SİMÜLASYON: e-posta gitmez)
//   EMAIL_FROM         → gönderici (ör. "OYNA <no-reply@oyna.app>"; doğrulanmış alan)
//   RESET_CODE_PEPPER  → hash biberi (opsiyonel; yoksa service key kullanılır)
//
// NOT: E-posta doğrudan Resend'e gönderilir (send-email fonksiyonuyla aynı sağlayıcı),
// böylece EMAIL_EDGE_SECRET el sıkışmasına gerek kalmaz — teslimat için yalnız
// RESEND_API_KEY + EMAIL_FROM yeterli.
//
// Deploy: supabase functions deploy password-reset-request --no-verify-jwt
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

const EXPIRY_MINUTES = 10;
const RATE_WINDOW_MINUTES = 15;
const RATE_MAX = 3;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const pepper = Deno.env.get('RESET_CODE_PEPPER') || serviceKey;
  const resendKey = Deno.env.get('RESEND_API_KEY') ?? '';
  const emailFrom = Deno.env.get('EMAIL_FROM') ?? 'OYNA <no-reply@oyna.app>';

  let body: { email?: string };
  try { body = await req.json(); } catch { return json({ error: 'INVALID_BODY' }, 400); }

  const email = String(body.email ?? '').trim().toLowerCase();
  // Basit format kontrolü; başarısızsa yine ok dön (enumeration yok).
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!email || !emailOk) return json({ ok: true });

  const admin = createClient(supabaseUrl, serviceKey);

  try {
    // 1) Kullanıcı var mı? (profiles.email UNIQUE) — yoksa sessizce ok dön.
    const { data: profile } = await admin
      .from('profiles')
      .select('id, email, full_name')
      .eq('email', email)
      .maybeSingle();

    if (!profile) return json({ ok: true });

    // 2) Rate-limit — son 15 dk'daki istek sayısı.
    const since = new Date(Date.now() - RATE_WINDOW_MINUTES * 60_000).toISOString();
    const { count } = await admin
      .from('password_reset_codes')
      .select('id', { count: 'exact', head: true })
      .eq('email', email)
      .gte('created_at', since);
    if ((count ?? 0) >= RATE_MAX) return json({ ok: true });

    // 3) Önceki kullanılmamış kodları geçersiz kıl.
    await admin.from('password_reset_codes').update({ used: true }).eq('email', email).eq('used', false);

    // 4) Yeni kod üret + hash'ini sakla.
    const code = String(Math.floor(100000 + Math.random() * 900000)); // 6 hane
    const codeHash = await sha256Hex(`${pepper}:${email}:${code}`);
    const expiresAt = new Date(Date.now() + EXPIRY_MINUTES * 60_000).toISOString();

    const { error: insertErr } = await admin.from('password_reset_codes').insert({
      email, code_hash: codeHash, expires_at: expiresAt, used: false, attempts: 0,
    });
    if (insertErr) throw insertErr;

    // 5) Kodu e-postayla gönder (mevcut Resend send-email fonksiyonu).
    const name = (profile.full_name as string) || email.split('@')[0];
    const subject = 'OYNA — Şifre sıfırlama kodun';
    const text = `Merhaba ${name},\n\nOYNA şifre sıfırlama kodun: ${code}\n\nBu kod ${EXPIRY_MINUTES} dakika geçerlidir. Bu isteği sen yapmadıysan bu e-postayı yok sayabilirsin.`;
    const html = `
      <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#0A0E14;color:#fff;border-radius:16px">
        <h2 style="margin:0 0 8px;font-weight:900;letter-spacing:1px">OYNA</h2>
        <p style="color:#9aa4b2;font-size:14px;margin:0 0 16px">Merhaba ${name}, şifreni sıfırlamak için aşağıdaki kodu uygulamaya gir:</p>
        <div style="font-size:34px;font-weight:900;letter-spacing:10px;background:#161B22;border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:16px;text-align:center;color:#FACC15">${code}</div>
        <p style="color:#6b7280;font-size:12px;margin:16px 0 0">Kod ${EXPIRY_MINUTES} dakika geçerlidir. Bu isteği sen yapmadıysan bu e-postayı yok say.</p>
      </div>`;

    // Anahtar yoksa SİMÜLASYON: akış bozulmaz, gerçek e-posta gitmez (go-live öncesi).
    if (!resendKey) {
      console.log('[password-reset-request] SIMULATION (RESEND_API_KEY yok):', { to: email });
    } else {
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: emailFrom, to: [email], subject, html, text }),
      });
      // Gönderim başarısız olsa da akışı/güvenliği bozmuyoruz; sadece logla.
      if (!emailRes.ok) {
        console.error('[password-reset-request] resend failed:', emailRes.status, await emailRes.text().catch(() => ''));
      }
    }

    return json({ ok: true });
  } catch (e) {
    console.error('[password-reset-request] error:', e);
    // Hata durumunda bile enumeration/detay sızdırma → ok dön.
    return json({ ok: true });
  }
});
