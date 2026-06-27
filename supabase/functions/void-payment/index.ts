// ═══════════════════════════════════════════════════════════════
// OYNA — void-payment Edge Function (FAZ 7.1 · OPERASYONEL #2)
// Ön-provizyon (pre-auth blokaj) → İPTAL/ÇÖZÜM (void/cancel).
// Maç quorum'a ulaşmadan iptal olursa veya hizmet talebi reddedilirse
// bloke edilen tutar serbest bırakılır (müşteriden tahsilat YAPILMAZ).
//
// Akış:
//   PROVIDER=IYZICO    → iyzico /payment/cancel → void_preauth RPC
//   PROVIDER=SIMULATION→ doğrudan void_preauth RPC (test)
//
// Yetki: PAYMENT_EDGE_SECRET header (sistem/cron/admin çağrısı; son kullanıcı değil).
// Deploy: supabase functions deploy void-payment
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

// iyzico HMAC imzası (create-payment / capture-payment ile aynı şema)
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

async function iyzicoCancel(conversationId: string, paymentId: string) {
  const baseUrl = Deno.env.get('IYZICO_BASE_URL') ?? 'https://api.iyzipay.com'
  const body = JSON.stringify({ locale: 'tr', conversationId, paymentId, ip: '85.34.78.112' })
  const res = await fetch(`${baseUrl}/payment/cancel`, { method: 'POST', headers: await iyziHeaders(body), body })
  const data = await res.json() as { status: string; errorMessage?: string }
  // iyzico zaten iptal/iade etmişse (örn. otomatik blokaj düşmesi) akışı bozma.
  if (data.status !== 'success') {
    const msg = data.errorMessage ?? ''
    if (!/iptal|cancel|refund|iade/i.test(msg)) throw new Error(`iyzico cancel: ${msg || 'başarısız'}`)
  }
  return data
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405)

  // Sistem çağrısı yetkisi (son kullanıcı bu fonksiyonu çağıramaz)
  const secret = req.headers.get('x-payment-secret')
  if (!secret || secret !== Deno.env.get('PAYMENT_EDGE_SECRET')) return json({ error: 'FORBIDDEN' }, 403)

  let payload: { intentId?: string; reason?: string }
  try { payload = await req.json() } catch { return json({ error: 'INVALID_BODY' }, 400) }
  if (!payload.intentId) return json({ error: 'intentId gerekli' }, 400)
  const reason = payload.reason ?? 'SYSTEM_VOID'

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  try {
    const { data: intent, error: selErr } = await admin
      .from('payment_intents').select('id, status, provider_ref, conversation_id').eq('id', payload.intentId).maybeSingle()
    if (selErr || !intent) return json({ error: 'NOT_FOUND' }, 404)
    if (intent.status === 'VOIDED') return json({ intent_id: intent.id, status: 'VOIDED', idempotent: true })
    if (!['BLOCKED', 'PENDING'].includes(intent.status))
      return json({ error: `INVALID_STATE: ${intent.status}` }, 409)

    if (PROVIDER === 'IYZICO' && intent.provider_ref) {
      // Pre-auth paymentId varsa iyzico tarafında blokajı düşür.
      await iyzicoCancel(intent.conversation_id ?? intent.id, intent.provider_ref)
    }

    // void_preauth service_role ile çağrılır → auth.uid() NULL → sahiplik kontrolü atlanır.
    const { data, error } = await admin.rpc('void_preauth', {
      p_intent_id: payload.intentId,
      p_void_reason: reason,
    })
    if (error) return json({ error: error.message }, 400)
    return json(data)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'INTERNAL' }, 500)
  }
})
