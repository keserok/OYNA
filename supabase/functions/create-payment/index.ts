// ═══════════════════════════════════════════════════════════════
// OYNA — create-payment Edge Function
// Kapora ödemesi başlatma: SIMULATION (test) veya iyzico Checkout Form v2.
//
// Akış:
//   action 'create'      → payment_intent oluştur → iyzico checkout URL döndür
//   action 'confirm-sim' → YALNIZ SIMULATION: ödemeyi uygula (canlıda KAPALI)
//
// iyzico aktifleştirme (Supabase → Settings → Edge Functions → Secrets):
//   PAYMENT_PROVIDER=IYZICO
//   IYZICO_API_KEY=sandbox_xxx          (iyzico Dashboard → API Keys)
//   IYZICO_SECRET_KEY=sandbox_xxx
//   IYZICO_BASE_URL=https://sandbox-api.iyzipay.com   (prod: https://api.iyzipay.com)
//   IYZICO_CALLBACK_URL=https://<proje>.supabase.co/functions/v1/payment-webhook
//
// Deploy: supabase functions deploy create-payment
// ═══════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const PROVIDER = Deno.env.get('PAYMENT_PROVIDER') ?? 'SIMULATION'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// ── iyzico Checkout Form v2 ───────────────────────────────────────────────────
// Docs: https://dev.iyzipay.com/tr/api/odeme-formu

// iyzico'ya gönderilecek alıcı bilgisi — gerçek kullanıcıdan türetilir.
// (iyzico ad/soyad ve geçerli formatta kimlik no bekler; eksikse ödeme reddedilebilir.)
interface Buyer {
  name: string; surname: string; email: string;
  identityNumber: string; gsmNumber: string;
}

async function iyzicoCheckout(
  intent: { id: string; amount: number; currency: string },
  callbackUrl: string,
  buyer: Buyer,
): Promise<{ checkoutUrl: string; token: string }> {
  const apiKey    = Deno.env.get('IYZICO_API_KEY')!
  const secretKey = Deno.env.get('IYZICO_SECRET_KEY')!
  const baseUrl   = Deno.env.get('IYZICO_BASE_URL') ?? 'https://api.iyzipay.com'

  const randomString = crypto.randomUUID().replace(/-/g, '').slice(0, 12)
  const contactName = `${buyer.name} ${buyer.surname}`.trim() || 'OYNA Kullanici'

  const body = {
    locale: 'tr',
    conversationId: intent.id,
    price: Number(intent.amount).toFixed(2),
    paidPrice: Number(intent.amount).toFixed(2),
    currency: intent.currency,
    basketId: intent.id,
    paymentGroup: 'PRODUCT',
    callbackUrl,
    enabledInstallments: [1, 2, 3],
    buyer: {
      id: intent.id,
      name: buyer.name, surname: buyer.surname,
      email: buyer.email,
      identityNumber: buyer.identityNumber,
      registrationAddress: 'Turkiye', city: 'Istanbul', country: 'Turkey',
      gsmNumber: buyer.gsmNumber,
    },
    shippingAddress: { contactName, city: 'Istanbul', country: 'Turkey', address: 'Turkiye' },
    billingAddress:  { contactName, city: 'Istanbul', country: 'Turkey', address: 'Turkiye' },
    basketItems: [{
      id: `booking-${intent.id}`,
      name: 'Saha Kapora',
      category1: 'Spor',
      itemType: 'VIRTUAL',
      price: Number(intent.amount).toFixed(2),
    }],
  }

  const bodyStr  = JSON.stringify(body)
  const enc      = new TextEncoder()

  const bodyHashBuf = await crypto.subtle.digest('SHA-256', enc.encode(bodyStr))
  const bodyHash    = btoa(String.fromCharCode(...new Uint8Array(bodyHashBuf)))

  const rawSig      = randomString + apiKey + bodyHash
  const sigHashBuf  = await crypto.subtle.digest('SHA-256', enc.encode(secretKey + rawSig))
  const sigHash     = btoa(String.fromCharCode(...new Uint8Array(sigHashBuf)))

  const res = await fetch(`${baseUrl}/payment/iyzipos/checkoutform/initialize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `IYZWS apiKey:${apiKey}:${sigHash}`,
      'x-iyzi-rnd': randomString,
    },
    body: bodyStr,
  })

  const data = await res.json() as {
    status: string; paymentPageUrl: string; token: string; errorMessage?: string
  }
  if (data.status !== 'success') {
    throw new Error(`iyzico: ${data.errorMessage ?? 'checkout başlatılamadı'}`)
  }
  return { checkoutUrl: data.paymentPageUrl, token: data.token }
}

// ── Ana adaptör ───────────────────────────────────────────────────────────────

// Türkçe ad → iyzico name/surname (son boşluktan böl). Boşsa güvenli varsayılan.
function splitName(full?: string | null): { name: string; surname: string } {
  const clean = (full ?? '').trim().replace(/\s+/g, ' ')
  if (!clean) return { name: 'OYNA', surname: 'Kullanici' }
  const parts = clean.split(' ')
  if (parts.length === 1) return { name: parts[0], surname: parts[0] }
  return { name: parts.slice(0, -1).join(' '), surname: parts[parts.length - 1] }
}

async function createProviderCheckout(
  intent: { id: string; amount: number; currency: string },
  buyer: Buyer,
): Promise<{ provider: string; checkoutUrl: string | null; token: string }> {
  if (PROVIDER === 'SIMULATION') {
    return { provider: 'SIMULATION', checkoutUrl: null, token: intent.id }
  }
  if (PROVIDER === 'IYZICO') {
    const callbackUrl = Deno.env.get('IYZICO_CALLBACK_URL')
      ?? `${Deno.env.get('SUPABASE_URL')}/functions/v1/payment-webhook`
    const result = await iyzicoCheckout(intent, callbackUrl, buyer)
    return { provider: 'IYZICO', ...result }
  }
  throw new Error(`PROVIDER_NOT_CONFIGURED: Geçersiz PAYMENT_PROVIDER="${PROVIDER}". SIMULATION veya IYZICO olmalı.`)
}

// ── Request handler ───────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST')    return json({ error: 'METHOD_NOT_ALLOWED' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'UNAUTHORIZED' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })

  let payload: { action?: string; bookingId?: string; intentId?: string }
  try { payload = await req.json() } catch { return json({ error: 'INVALID_BODY' }, 400) }

  const action = payload.action ?? 'create'

  try {
    if (action === 'create') {
      if (!payload.bookingId) return json({ error: 'bookingId gerekli' }, 400)

      const { data: intent, error } = await userClient.rpc('create_payment_intent', {
        p_booking_id: payload.bookingId,
        p_provider: PROVIDER,
      })
      if (error) return json({ error: error.message }, 400)

      // Gerçek kullanıcı bilgisiyle alıcı oluştur (iyzico ad/kimlik bekler).
      const { data: { user } } = await userClient.auth.getUser()
      const { data: profile } = await userClient
        .from('profiles')
        .select('full_name, name, email, phone')
        .eq('id', user?.id ?? '')
        .maybeSingle()
      const { name, surname } = splitName(profile?.full_name ?? profile?.name)
      const digits = (profile?.phone ?? '').replace(/\D/g, '')
      const buyer = {
        name, surname,
        email: profile?.email || user?.email || 'oyuncu@oyna.app',
        // Uygulamada TC toplanmıyor → iyzico'nun geçerli test kimlik no'su (sandbox kabul eder).
        identityNumber: '74300864791',
        gsmNumber: digits ? `+90${digits.slice(-10)}` : '+905000000000',
      }

      const checkout = await createProviderCheckout(intent, buyer)
      return json({
        intentId: intent.id,
        amount: intent.amount,
        currency: intent.currency,
        commission: intent.commission_amount,
        provider: checkout.provider,
        checkoutUrl: checkout.checkoutUrl,
        requiresClientConfirm: PROVIDER === 'SIMULATION',
      })
    }

    if (action === 'confirm-sim') {
      if (PROVIDER !== 'SIMULATION') return json({ error: 'CONFIRM_DISABLED_IN_LIVE' }, 403)
      if (!payload.intentId) return json({ error: 'intentId gerekli' }, 400)

      const { data: owned, error: selErr } = await userClient
        .from('payment_intents')
        .select('id, status')
        .eq('id', payload.intentId)
        .maybeSingle()
      if (selErr || !owned) return json({ error: 'NOT_FOUND_OR_FORBIDDEN' }, 403)

      const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
      const { data: result, error: applyErr } = await admin.rpc('apply_booking_payment', {
        p_intent_id: payload.intentId,
        p_provider_ref: `SIM-${Date.now()}`,
        p_raw: { simulated: true, at: new Date().toISOString() },
      })
      if (applyErr) return json({ error: applyErr.message }, 400)
      return json(result)
    }

    return json({ error: 'UNKNOWN_ACTION' }, 400)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'INTERNAL' }, 500)
  }
})
