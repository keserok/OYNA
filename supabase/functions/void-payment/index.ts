// ═══════════════════════════════════════════════════════════════
// OYNA — void-payment Edge Function
// Bloke edilmiş kaporayı ÇÖZER (maç dolmadı/iptal → müşteriden tahsilat yok).
//
// CÜZDAN-ÖNCELİKLİ: maç kaporası cüzdandan güvenceye alınır (provider='WALLET')
// — çözümde tutar OTOMATİK iade kredisine döner (void_preauth →
// _refund_wallet_escrow). Kart pre-auth intent'i (eski kayıtlar) gelirse
// iyzico /payment/cancel IYZWSv2 imzayla çağrılır.
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

async function iyzicoCancel(conversationId: string, paymentId: string) {
  const data = await iyzicoPost('/payment/cancel', {
    locale: 'tr', conversationId, paymentId, ip: '85.34.78.112',
  })
  // iyzico zaten iptal/iade etmişse (örn. otomatik blokaj düşmesi) akışı bozma.
  if (data?.status !== 'success') {
    const msg = data?.errorMessage ?? ''
    if (!/iptal|cancel|refund|iade/i.test(msg)) throw new Error(`iyzico cancel: ${msg || 'başarısız'}`)
  }
  return data
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405)

  const secret = req.headers.get('x-payment-secret')
  if (!secret || secret !== Deno.env.get('PAYMENT_EDGE_SECRET')) return json({ error: 'FORBIDDEN' }, 403)

  let payload: { intentId?: string; reason?: string }
  try { payload = await req.json() } catch { return json({ error: 'INVALID_BODY' }, 400) }
  if (!payload.intentId) return json({ error: 'intentId gerekli' }, 400)
  const reason = payload.reason ?? 'SYSTEM_VOID'

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  try {
    const { data: intent, error: selErr } = await admin
      .from('payment_intents').select('id, status, provider, provider_ref, conversation_id')
      .eq('id', payload.intentId).maybeSingle()
    if (selErr || !intent) return json({ error: 'NOT_FOUND' }, 404)
    if (intent.status === 'VOIDED') return json({ intent_id: intent.id, status: 'VOIDED', idempotent: true })
    if (!['BLOCKED', 'PENDING'].includes(intent.status))
      return json({ error: `INVALID_STATE: ${intent.status}` }, 409)

    // Cüzdan güvencesi: dış çağrı gerekmez — void_preauth iade kredisini kendisi yazar.
    if (PROVIDER === 'IYZICO' && intent.provider !== 'WALLET' && intent.provider_ref) {
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
