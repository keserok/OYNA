// Admin panel — Saha sahibi (owner) hesap yönetimi (service role)
// E-posta değiştirme, yeni şifre belirleme, şifre sıfırlama kodu gönderme.
// Yalnız platform admin çağırabilir (is_platform_admin RPC ile doğrulanır).
// Deploy: supabase functions deploy admin-owner-credentials

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildCorsHeaders, enforceAdminNetworkPolicy } from '../_shared/adminGuard.ts';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  try {
    // Origin + IP allowlist kapısı (env boşsa dormant)
    const denied = enforceAdminNetworkPolicy(req, corsHeaders);
    if (denied) return denied;

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Yetkilendirme gerekli' }, 401);

    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: isAdmin, error: adminErr } = await caller.rpc('is_platform_admin');
    if (adminErr || !isAdmin) {
      return json({ error: 'Platform admin yetkisi gerekli' }, 403);
    }

    const { userId, action, email, password } = await req.json();
    if (!userId || !action) return json({ error: 'userId ve action zorunlu' }, 400);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: target, error: getErr } = await admin.auth.admin.getUserById(String(userId));
    if (getErr || !target?.user) return json({ error: 'Kullanıcı bulunamadı' }, 404);
    const currentEmail = target.user.email ?? '';

    // Denetim izi — ana işlemi bloklamaz (log_admin_action admin kimliğiyle yazar).
    const audit = async (act: string, newValue: Record<string, unknown>) => {
      try {
        await caller.rpc('log_admin_action', {
          p_action: act,
          p_target_type: 'owner_account',
          p_target_id: String(userId),
          p_target_identifier: currentEmail,
          p_new_value: newValue,
        });
      } catch (e) {
        console.error('log_admin_action:', e);
      }
    };

    if (action === 'set_email') {
      const nextEmail = String(email ?? '').trim().toLowerCase();
      if (!EMAIL_RE.test(nextEmail)) return json({ error: 'Geçerli bir e-posta girin' }, 400);
      const { error: updErr } = await admin.auth.admin.updateUserById(String(userId), {
        email: nextEmail,
        email_confirm: true,
      });
      if (updErr) return json({ error: `E-posta güncellenemedi: ${updErr.message}` }, 400);
      // profiles.email de senkron kalsın (panel listeleri buradan okur).
      const { error: profErr } = await admin.from('profiles').update({ email: nextEmail }).eq('id', String(userId));
      if (profErr) console.error('profiles.email sync:', profErr.message);
      await audit('OWNER_EMAIL_CHANGED', { new_email: nextEmail });
      return json({ ok: true, email: nextEmail });
    }

    if (action === 'set_password') {
      const nextPassword = String(password ?? '');
      if (nextPassword.length < 8) return json({ error: 'Şifre en az 8 karakter olmalı' }, 400);
      const { error: updErr } = await admin.auth.admin.updateUserById(String(userId), {
        password: nextPassword,
      });
      if (updErr) return json({ error: `Şifre güncellenemedi: ${updErr.message}` }, 400);
      await audit('OWNER_PASSWORD_SET', { by: 'admin' }); // şifre asla loglanmaz
      return json({ ok: true });
    }

    if (action === 'send_reset_code') {
      if (!currentEmail) return json({ error: 'Kullanıcının e-postası yok' }, 400);
      // Mevcut "şifremi unuttum" akışını tetikler: 6 haneli kod e-postaya gider,
      // kullanıcı uygulamadaki sıfırlama ekranından yeni şifresini belirler.
      const res = await fetch(`${supabaseUrl}/functions/v1/password-reset-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: anonKey, Authorization: `Bearer ${anonKey}` },
        body: JSON.stringify({ email: currentEmail }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        return json({ error: (body as { error?: string }).error || 'Sıfırlama kodu gönderilemedi' }, 502);
      }
      await audit('OWNER_RESET_CODE_SENT', { email: currentEmail });
      return json({ ok: true, email: currentEmail });
    }

    return json({ error: `Bilinmeyen action: ${String(action)}` }, 400);
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
