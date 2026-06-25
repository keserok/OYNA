// ═══════════════════════════════════════════════════════════════
// OYNA — create-payment Edge Function
// Sağlayıcı-bağımsız kapora (deposit) ödeme başlatma.
//
// Akış:
//   action 'create'      → payment_intent oluştur → sağlayıcı checkout URL/token döndür
//   action 'confirm-sim' → YALNIZ SIMULATION: ödemeyi uygula (gerçek parada KAPALI)
//
// Sağlayıcı aktifleştirme:
//   PAYMENT_PROVIDER=IYZICO  → IYZICO_API_KEY + IYZICO_SECRET_KEY + IYZICO_BASE_URL
//   PAYMENT_PROVIDER=PAYTR   → PAYTR_MERCHANT_ID + PAYTR_MERCHANT_KEY + PAYTR_MERCHANT_SALT
//   PAYMENT_PROVIDER=SIMULATION (varsayılan) → harici çağrı yok, confirm-sim ile test
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

// ── İmza yardımcıları ─────────────────────────────────────────────────────────

async function hmacSha256(key: string, data: string): Promise<string> {
  const enc = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    'raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data))
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
}

// ── iyzico Checkout Form v2 ───────────────────────────────────────────────────
// Docs: https://dev.iyzipay.com/tr/api/odeme-formu

async function iyzicoCheckout(intent: {
  id: string; amount: number; currency: string;
}, callbackUrl: string): Promise<{ checkoutUrl: string; token: string }> {
  const apiKey    = Deno.env.get('IYZICO_API_KEY')!
  const secretKey = Deno.env.get('IYZICO_SECRET_KEY')!
  const baseUrl   = Deno.env.get('IYZICO_BASE_URL') ?? 'https://api.iyzipay.com'

  const randomString = crypto.randomUUID().replace(/-/g, '').slice(0, 12)

  const body = {
    locale: 'tr',
    conversationId: intent.id,
    price: (intent.amount / 100).toFixed(2),      // iyzico kuruş değil TL alır
    paidPrice: (intent.amount / 100).toFixed(2),
    currency: intent.currency,
    basketId: intent.id,
    paymentGroup: 'PRODUCT',
    callbackUrl,
    enabledInstallments: [1, 2, 3, 6],
    buyer: { id: intent.id, name: 'OYNA', surname: 'Kullanici', email: 'oyuncu@oyna.app', identityNumber: '11111111110', registrationAddress: 'TR', city: 'Istanbul', country: 'Turkey', gsmNumber: '+905000000000' },
    shippingAddress: { contactName: 'OYNA', city: 'Istanbul', country: 'Turkey', address: 'TR' },
    billingAddress:  { contactName: 'OYNA', city: 'Istanbul', country: 'Turkey', address: 'TR' },
    basketItems: [{ id: `booking-${intent.id}`, name: 'Saha Kapora', category1: 'Spor', itemType: 'VIRTUAL', price: (intent.amount / 100).toFixed(2) }],
  }

  const bodyStr = JSON.stringify(body)
  // iyzico imzası: base64(sha256(randomStr + apiKey + base64(sha256(bodyStr))))
  const bodyHash = btoa(String.fromCharCode(...new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(bodyStr))
  )))
  const rawSig = randomString + apiKey + bodyHash
  const sigHash = btoa(String.fromCharCode(...new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secretKey + rawSig))
  )))

  const res = await fetch(`${baseUrl}/payment/iyzipos/checkoutform/initialize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `IYZWS apiKey:${apiKey}:${sigHash}`,
      'x-iyzi-rnd': randomString,
    },
    body: bodyStr,
  })
  const data = await res.json() as { status: string; paymentPageUrl: string; token: string; errorMessage?: string }
  if (data.status !== 'success') throw new Error(`iyzico: ${data.errorMessage ?? 'checkout başlatılamadı'}`)
  return { checkoutUrl: data.paymentPageUrl, token: data.token }
}

// ── PayTR iframe token ────────────────────────────────────────────────────────
// Docs: https://dev.paytr.com/iframe-api

async function paytrToken(intent: {
  id: string; amount: number;
}, userIp: string): Promise<{ checkoutUrl: string; token: string }> {
  const merchantId   = Deno.env.get('PAYTR_MERCHANT_ID')!
  const merchantKey  = Deno.env.get('PAYTR_MERCHANT_KEY')!
  const merchantSalt = Deno.env.get('PAYTR_MERCHANT_SALT')!

  const amountKurus = String(intent.amount)  // PayTR kuruş alır
  const basketBase64 = btoa(JSON.stringify([[`Saha Kapora`, amountKurus, 1]]))

  // Hash: base64(HMAC-SHA256(merchantId+userIp+intentId+email+amount+basketBase64+no_installment+max_installment+currency+test_mode, merchantKey+merchantSalt))
  const testMode = PROVIDER === 'PAYTR' && !Deno.env.get('PAYTR_PRODUCTION') ? '1' : '0'
  const hashStr = `${merchantId}${userIp}${intent.id}oyuncu@oyna.app${amountKurus}${basketBase64}01TL${testMode}${merchantSalt}`
  const paytrToken = await hmacSha256(merchantKey, hashStr)

  const params = new URLSearchParams({
    merchant_id: merchantId, user_ip: userIp, merchant_oid: intent.id,
    email: 'oyuncu@oyna.app', payment_amount: amountKurus,
    paytr_token: paytrToken, user_basket: basketBase64,
    debug_on: '0', no_installment: '0', max_installment: '3',
    currency: 'TL', test_mode: testMode, lang: 'tr',
  })

  const res = await fetch('https://www.paytr.com/odeme/api/get-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  })
  const data = await res.json() as { status: string; token?: string; reason?: string }
  if (data.status !== 'success' || !data.token) throw new Error(`PayTR: ${data.reason ?? 'token alınamadı'}`)
  return {
    token: data.token,
    checkoutUrl: `https://www.paytr.com/odeme/guvenli/${data.token}`,
  }
}

// ── Ana adaptör ───────────────────────────────────────────────────────────────

async function createProviderCheckout(
  intent: { id: string; amount: number; currency: string },
  req: Request,
): Promise<{ provider: string; checkoutUrl: string | null; token: string }> {
  if (PROVIDER === 'SIMULATION') {
    return { provider: 'SIMULATION', checkoutUrl: null, token: intent.id }
  }
  if (PROVIDER === 'IYZICO') {
    const callbackUrl = Deno.env.get('IYZICO_CALLBACK_URL') ?? `${Deno.env.get('SUPABASE_URL')}/functions/v1/payment-webhook`
    const result = await iyzicoCheckout(intent, callbackUrl)
    return { provider: 'IYZICO', ...result }
  }
  if (PROVIDER === 'PAYTR') {
    const userIp = req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for') ?? '127.0.0.1'
    const result = await paytrToken(intent, userIp)
    return { provider: 'PAYTR', ...result }
  }
  throw new Error(`PROVIDER_NOT_CONFIGURED: Bilinmeyen sağlayıcı: ${PROVIDER}`)
}

// ── Request handler ───────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405)

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

      const checkout = await createProviderCheckout(intent, req)
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
