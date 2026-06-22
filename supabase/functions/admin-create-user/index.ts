// Admin panel — Auth kullanıcısı oluşturma (service role)
// Deploy: supabase functions deploy admin-create-user

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// F9: ADMIN_ALLOWED_ORIGIN env var ile production'da origin kısıtlaması yapılmalı.
// Örnek: supabase secrets set ADMIN_ALLOWED_ORIGIN=https://admin.oyna.app
const allowedOrigin = Deno.env.get('ADMIN_ALLOWED_ORIGIN') ?? '*';

const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Yetkilendirme gerekli' }), { status: 401, headers: corsHeaders });
    }

    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: isAdmin, error: adminErr } = await caller.rpc('is_platform_admin');
    if (adminErr || !isAdmin) {
      return new Response(JSON.stringify({ error: 'Platform admin yetkisi gerekli' }), { status: 403, headers: corsHeaders });
    }

    const { email, password, fullName, role = 'PLAYER' } = await req.json();
    if (!email || !password || !fullName) {
      return new Response(JSON.stringify({ error: 'email, password ve fullName zorunlu' }), { status: 400, headers: corsHeaders });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: authData, error: createErr } = await admin.auth.admin.createUser({
      email: String(email).trim().toLowerCase(),
      password: String(password),
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (createErr || !authData.user) {
      throw createErr ?? new Error('Auth kullanıcısı oluşturulamadı');
    }

    const { error: profileErr } = await admin.rpc('admin_upsert_user_profile', {
      p_user_id: authData.user.id,
      p_email: email,
      p_full_name: fullName,
      p_role: role,
    });

    if (profileErr) {
      // F9: Profile oluşturmazsa auth kullanıcısını geri al (orphan auth user önleme)
      console.error('Profile upsert failed, rolling back auth user:', profileErr.message);
      await admin.auth.admin.deleteUser(authData.user.id);
      return new Response(
        JSON.stringify({ error: `Kullanıcı profili oluşturulamadı: ${profileErr.message}` }),
        { status: 500, headers: corsHeaders },
      );
    }

    return new Response(JSON.stringify({
      userId: authData.user.id,
      email: authData.user.email,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
