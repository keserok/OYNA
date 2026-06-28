// OYNA Admin Edge Function — service-role protected broadcast helper
// Deploy: supabase functions deploy admin-broadcast
// Invoke with Authorization: Bearer <service_role_key> OR authenticated admin JWT

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ADMIN_ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-secret',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // FAZ 8 — fail-CLOSED yetki: (1) sistem secret'i VEYA (2) authenticated platform admin JWT.
    // Eskiden ADMIN_EDGE_SECRET set DEĞİLSE kontrol tamamen atlanıyordu (fail-open, herkese açık).
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const adminSecret = Deno.env.get('ADMIN_EDGE_SECRET');
    const headerSecret = req.headers.get('x-admin-secret');
    const authHeader = req.headers.get('Authorization');

    let authorized = false;
    if (adminSecret && headerSecret === adminSecret) {
      authorized = true; // sistem/cron çağrısı
    } else if (authHeader) {
      // Çağıranın platform admin olduğunu KENDİ JWT'siyle doğrula (admin panel bu yoldan geçer)
      const caller = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: isAdmin } = await caller.rpc('is_platform_admin');
      authorized = isAdmin === true;
    }
    if (!authorized) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { title, body, segment = 'ALL' } = await req.json();

    const { data, error } = await supabase.rpc('admin_broadcast_notification', {
      p_title: title,
      p_body: body,
      p_segment: segment,
      p_type: 'ADMIN_BROADCAST',
    });

    if (error) throw error;

    return new Response(JSON.stringify({ recipients: data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
