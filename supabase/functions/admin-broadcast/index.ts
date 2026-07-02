// OYNA Admin Edge Function — service-role protected broadcast helper
// Deploy: supabase functions deploy admin-broadcast
// Invoke with Authorization: Bearer <service_role_key> OR authenticated admin JWT

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-secret',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Fail-closed: ADMIN_EDGE_SECRET set edilmeden fonksiyon ÇALIŞMAZ.
    const adminSecret = Deno.env.get('ADMIN_EDGE_SECRET');
    if (!adminSecret) {
      return new Response(JSON.stringify({ error: 'ADMIN_EDGE_SECRET is not configured' }), {
        status: 503,
        headers: corsHeaders,
      });
    }
    const headerSecret = req.headers.get('x-admin-secret');
    if (headerSecret !== adminSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
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
