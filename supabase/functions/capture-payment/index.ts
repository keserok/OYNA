// ═══════════════════════════════════════════════════════════════
// OYNA — capture-payment Edge Function (FAZ 7.1 · OPERASYONEL #1)
// Ön-provizyon (pre-auth blokaj) → TAHSİL (capture).
// Maç onayında (T-8s) veya onay sonrası hizmet eklemede sistem çağırır.
//
// Akış:
//   PROVIDER=IYZICO    → iyzico /payment/iyzipos/capture → capture_preauth RPC
//   PROVIDER=SIMULATION→ doğrudan capture_preauth RPC (test)
//
// Yetki: PAYMENT_EDGE_SECRET header (sistem/cron/admin çağrısı; son kullanıcı değil).
// Deploy: supabase functions deploy capture-payment
// Secrets: PAYMENT_PROVIDER, IYZICO_API_KEY/SECRET_KEY/BASE_URL,
//          PAYMENT_EDGE_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ═══════════════════════════════════════════════════════════════
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const PROVIDER = Deno.env.get('PAYMENT_PROVIDER') ?? 'SIMULATION'
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-payment-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

// iyzico HMAC imzası (create-payment ile aynı şema)
async function iyziHeaders(body: string) {
  const apiKey = Deno.env.get('IYZICO_API_KEY')!
  const secretKey = Deno.env.get('IYZICO_SECRET_KEY')!
  const rnd = crypto.randomUUID().replace(/-/g, '').slice(0, 12)
  const enc = new TextEncoder()
  const bodyHashBuf = await crypto.subtle.digest('SHA-256', enc.encode(body))
  const bodyHash = btoa(String.fromCharCode(...new Uint8Array(bodyHashBuf)))
  const sigHashBuf = await crypto.subtle.digest('SHA-256', enc.encode(secretKey + rnd + apiKey + bodyHash))
  const sigHash = btoa(String.fromCharCode(...new Uint8Array(sigHashBuf)))
  return { 'Content-Type': 'application/json', 'Authorization': `IYZWS apiKey:${apiKey}:${sigHash}`, 'x-iyzi-rnd': rnd }
}

async function iyzicoCapture(conversationId: string, paymentId: string, paidPrice: string) {
  const baseUrl = Deno.env.get('IYZICO_BASE_URL') ?? 'https://api.iyzipay.com'
  const body = JSON.stringify({ locale: 'tr', conversationId, paymentId, paidPrice })
  const res = await fetch(`${baseUrl}/payment/iyzipos/capture`, { method: 'POST', headers: await iyziHeaders(body), body })
  const data = await res.json() as { status: string; paymentId?: string; errorMessage?: string }
  // Yeniden-deneme yakınsaması: iyzico tarafında zaten tahsil edilmişse (örn. RPC
  // commit'inden önce process çöktü → retry) bunu BAŞARI say; aksi halde intent
  // DB'de BLOCKED kalıp manuel mutabakat gerektirir. (void tarafındaki tolerans ile aynı.)
  if (data.status !== 'success') {
    const msg = data.errorMessage ?? ''
    if (!/tahsil|capture|already|kullanıl|used/i.test(msg)) throw new Error(`iyzico capture: ${msg || 'başarısız'}`)
  }
  return data
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405)

  // Sistem çağrısı yetkisi (son kullanıcı bu fonksiyonu çağıramaz)
  const secret = req.headers.get('x-payment-secret')
  if (!secret || secret !== Deno.env.get('PAYMENT_EDGE_SECRET')) return json({ error: 'FORBIDDEN' }, 403)

  let payload: { intentId?: string }
  try { payload = await req.json() } catch { return json({ error: 'INVALID_BODY' }, 400) }
  if (!payload.intentId) return json({ error: 'intentId gerekli' }, 400)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  try {
    // intent'i al (provider_ref = iyzico paymentId, pre-auth webhook'unda kaydedilmiş olmalı)
    const { data: intent, error: selErr } = await admin
      .from('payment_intents').select('id, status, amount, provider_ref, conversation_id').eq('id', payload.intentId).maybeSingle()
    if (selErr || !intent) return json({ error: 'NOT_FOUND' }, 404)
    if (!['BLOCKED', 'PENDING'].includes(intent.status))
      return json({ error: `INVALID_STATE: ${intent.status}` }, 409)

    let providerRef = `SIM-CAP-${Date.now()}`
    if (PROVIDER === 'IYZICO') {
      if (!intent.provider_ref) return json({ error: 'NO_PAYMENT_ID: pre-auth paymentId yok' }, 400)
      const r = await iyzicoCapture(intent.conversation_id ?? intent.id, intent.provider_ref, Number(intent.amount).toFixed(2))
      providerRef = r.paymentId ?? intent.provider_ref
    }

    const { data, error } = await admin.rpc('capture_preauth', {
      p_intent_id: payload.intentId,
      p_provider_ref: providerRef,
      p_raw: { captured_via: PROVIDER, at: new Date().toISOString() },
    })
    if (error) return json({ error: error.message }, 400)
    return json(data)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'INTERNAL' }, 500)
  }
})
