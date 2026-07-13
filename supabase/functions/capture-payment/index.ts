// ═══════════════════════════════════════════════════════════════
// OYNA — capture-payment Edge Function
// Bloke edilmiş kaporayı TAHSİL eder (maç eşiği dolunca sistem çağırır).
//
// CÜZDAN-ÖNCELİKLİ: maç kaporası artık cüzdandan güvenceye alınır
// (provider='WALLET') — para bloke anında platformda olduğundan tahsil
// yalnız DB durum geçişidir (capture_preauth). Kart pre-auth intent'i
// (eski kayıtlar) gelirse iyzico post-auth IYZWSv2 imzayla çağrılır.
//
// Yetki: PAYMENT_EDGE_SECRET header (sistem/cron/admin; son kullanıcı değil).
// ═══════════════════════════════════════════════════════════════
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const PROVIDER = Deno.env.get('PAYMENT_PROVIDER') ?? 'SIMULATION'
const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-payment-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

// iyzico IYZWSv2 imzası (create-payment ile aynı şema — v1 IYZWS kaldırıldı)
async function hmacSha256Hex(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data))
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('')
}

async function iyzicoPost(uriPath: string, bodyObj: unknown): Promise<any> {
  const apiKey    = Deno.env.get('IYZICO_API_KEY')!
  const secretKey = Deno.env.get('IYZICO_SECRET_KEY')!
  const baseUrl   = Deno.env.get('IYZICO_BASE_URL') ?? 'https://api.iyzipay.com'
  const bodyStr   = JSON.stringify(bodyObj)
  const randomKey = `${Date.now()}${Math.floor(Math.random() * 1_000_000)}`
  const signature = await hmacSha256Hex(secretKey, randomKey + uriPath + bodyStr)
  const authHeader = 'IYZWSv2 ' + btoa(`apiKey:${apiKey}&randomKey:${randomKey}&signature:${signature}`)
  const res = await fetch(baseUrl + uriPath, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': authHeader, 'x-iyzi-rnd': randomKey },
    body: bodyStr,
  })
  return await res.json()
}

// Kart pre-auth tahsili (yalnız eski kart-bloke kayıtları için).
async function iyzicoPostAuth(conversationId: string, paymentId: string, paidPrice: string) {
  const data = await iyzicoPost('/payment/postauth', {
    locale: 'tr', conversationId, paymentId, paidPrice, currency: 'TRY', ip: '85.34.78.112',
  })
  // Yeniden-deneme yakınsaması: zaten tahsil edildiyse başarı say.
  if (data?.status !== 'success') {
    const msg = data?.errorMessage ?? ''
    if (!/tahsil|capture|already|kullanıl|used/i.test(msg)) throw new Error(`iyzico postauth: ${msg || 'başarısız'}`)
  }
  return data
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405)

  const secret = req.headers.get('x-payment-secret')
  if (!secret || secret !== Deno.env.get('PAYMENT_EDGE_SECRET')) return json({ error: 'FORBIDDEN' }, 403)

  let payload: { intentId?: string }
  try { payload = await req.json() } catch { return json({ error: 'INVALID_BODY' }, 400) }
  if (!payload.intentId) return json({ error: 'intentId gerekli' }, 400)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  try {
    const { data: intent, error: selErr } = await admin
      .from('payment_intents').select('id, status, amount, provider, provider_ref, conversation_id')
      .eq('id', payload.intentId).maybeSingle()
    if (selErr || !intent) return json({ error: 'NOT_FOUND' }, 404)
    if (intent.status === 'CAPTURED') return json({ intent_id: intent.id, status: 'CAPTURED', idempotent: true })
    if (!['BLOCKED', 'PENDING'].includes(intent.status))
      return json({ error: `INVALID_STATE: ${intent.status}` }, 409)

    // Cüzdan güvencesi: para bloke anında platformda — dış çağrı gerekmez.
    let providerRef = intent.provider === 'WALLET' ? `WALLET-CAP-${Date.now()}` : `SIM-CAP-${Date.now()}`
    if (PROVIDER === 'IYZICO' && intent.provider !== 'WALLET') {
      if (!intent.provider_ref) return json({ error: 'NO_PAYMENT_ID: pre-auth paymentId yok' }, 400)
      const r = await iyzicoPostAuth(intent.conversation_id ?? intent.id, intent.provider_ref, Number(intent.amount).toFixed(2))
      providerRef = r.paymentId ?? intent.provider_ref
    }

    const { data, error } = await admin.rpc('capture_preauth', {
      p_intent_id: payload.intentId,
      p_provider_ref: providerRef,
      p_raw: { captured_via: intent.provider === 'WALLET' ? 'WALLET' : PROVIDER, at: new Date().toISOString() },
    })
    if (error) return json({ error: error.message }, 400)
    return json(data)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'INTERNAL' }, 500)
  }
})
