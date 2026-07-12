// ═══════════════════════════════════════════════════════════════════════════
// OYNA — refund-payment Edge Function (FAZ 7.1 · OPERASYONEL #3 · go-live)
// Kademeli iade işlemcisi: process_tiered_refund (politika) + iyzico karta iade.
//
// Akış:
//   PROVIDER=IYZICO     → (CAPTURED ise) iyzico /payment/refund → process_tiered_refund
//   PROVIDER=SIMULATION → doğrudan process_tiered_refund (OYNA kredisi)
//
// İptal akışları (maç iptali / rezervasyon iptali / owner red) go-live'da bunu çağırır.
// Yetki: PAYMENT_EDGE_SECRET header (sistem/cron/admin çağrısı; son kullanıcı değil).
// Deploy: supabase functions deploy refund-payment
// ═══════════════════════════════════════════════════════════════════════════
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const PROVIDER = Deno.env.get('PAYMENT_PROVIDER') ?? 'SIMULATION'
const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-payment-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

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

// iyzico karta iade. NOT (go-live): iyzico iade paymentTransactionId (kalem bazlı) ister;
// pre-auth akışında provider_ref'in tutması gereken değer sözleşme entegrasyonunda netleşir.
async function iyzicoRefund(conversationId: string, paymentTxnId: string, price: string) {
  const baseUrl = Deno.env.get('IYZICO_BASE_URL') ?? 'https://api.iyzipay.com'
  const body = JSON.stringify({ locale: 'tr', conversationId, paymentTransactionId: paymentTxnId, price, ip: '85.34.78.112' })
  // H2 — iade isteğine timeout (sonsuz asılı kalma önlenir). RETRY YOK: iade
  // iyzico'ya ulaşıp yanıtı kaybolduysa kör retry çift-iade yapabilir.
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 20_000)
  let res: Response
  try {
    res = await fetch(`${baseUrl}/payment/refund`, { method: 'POST', headers: await iyziHeaders(body), body, signal: ctrl.signal })
  } finally {
    clearTimeout(t)
  }
  const data = await res.json() as { status: string; errorMessage?: string }
  if (data.status !== 'success') {
    const msg = data.errorMessage ?? ''
    if (!/iade|refund|already/i.test(msg)) throw new Error(`iyzico refund: ${msg || 'başarısız'}`)
  }
  return data
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405)

  const secret = req.headers.get('x-payment-secret')
  if (!secret || secret !== Deno.env.get('PAYMENT_EDGE_SECRET')) return json({ error: 'FORBIDDEN' }, 403)

  let payload: { intentId?: string; hoursToMatch?: number }
  try { payload = await req.json() } catch { return json({ error: 'INVALID_BODY' }, 400) }
  if (!payload.intentId) return json({ error: 'intentId gerekli' }, 400)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  try {
    const { data: intent, error: selErr } = await admin
      .from('payment_intents').select('id, status, amount, provider_ref, conversation_id, match_id, booking_id').eq('id', payload.intentId).maybeSingle()
    if (selErr || !intent) return json({ error: 'NOT_FOUND' }, 404)

    // Maça/rezervasyona kalan saat (kademe seçimi); payload verilmezse hesapla
    let hours = payload.hoursToMatch
    if (hours === undefined) {
      let startsAt: string | null = null
      if (intent.match_id) {
        const { data: m } = await admin.from('matches').select('starts_at').eq('id', intent.match_id).maybeSingle()
        startsAt = m?.starts_at ?? null
      }
      hours = startsAt ? Math.max(0, (new Date(startsAt).getTime() - Date.now()) / 3_600_000) : 999
    }

    // iyzico karta iade yalnız tahsil edilmiş (CAPTURED) ödeme için anlamlı
    if (PROVIDER === 'IYZICO' && intent.status === 'CAPTURED' && intent.provider_ref) {
      await iyzicoRefund(intent.conversation_id ?? intent.id, intent.provider_ref, Number(intent.amount).toFixed(2))
    }

    // Kademeli iade politikası (service_role → process_tiered_refund yetki kapısını geçer)
    const { data, error } = await admin.rpc('process_tiered_refund', {
      p_intent_id: payload.intentId,
      p_hours_to_match: hours,
    })
    if (error) return json({ error: error.message }, 400)
    return json({ ...data, provider: PROVIDER })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'INTERNAL' }, 500)
  }
})
