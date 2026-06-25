// ═══════════════════════════════════════════════════════════════
// OYNA — payment-webhook Edge Function
// iyzico / PayTR ödeme sonucu bildirimi. İmzayı DOĞRULAR, sonra
// apply_booking_payment'i service_role ile çağırır.
//
// GÜVENLİK: imza doğrulaması başarısız olursa 401 döner, ödeme UYGULANMAZ.
// Gerçek parada tek geçerli onay yolu burasıdır.
//
// Deploy: supabase functions deploy payment-webhook --no-verify-jwt
// ═══════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const PROVIDER = Deno.env.get('PAYMENT_PROVIDER') ?? 'SIMULATION'

async function hmacSha256Base64(key: string, data: string): Promise<string> {
  const enc = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    'raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(data))
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
}

// ── iyzico imza doğrulama ──────────────────────────────────────────────────────
// Checkout Form v2 callback: Form POST; token + status + conversationId gelir.
// İmza: iyzico gelen token'ı geri döndürür; tam doğrulama için payment/iyzipos/checkoutform/auth çağrılır.
async function verifyIyzico(body: URLSearchParams): Promise<boolean> {
  const token   = body.get('token')
  const status  = body.get('status')
  if (!token || status !== 'success') return false

  const apiKey    = Deno.env.get('IYZICO_API_KEY')
  const secretKey = Deno.env.get('IYZICO_SECRET_KEY')
  const baseUrl   = Deno.env.get('IYZICO_BASE_URL') ?? 'https://api.iyzipay.com'
  if (!apiKey || !secretKey) return false

  // Token'ı sunucu tarafında doğrula (ödeme durumunu iyzico'dan sorgula)
  const randomString = crypto.randomUUID().replace(/-/g, '').slice(0, 12)
  const reqBody   = JSON.stringify({ locale: 'tr', token })
  const bodyHash  = btoa(String.fromCharCode(...new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(reqBody))
  )))
  const rawSig    = randomString + apiKey + bodyHash
  const sigHash   = btoa(String.fromCharCode(...new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secretKey + rawSig))
  )))

  const res = await fetch(`${baseUrl}/payment/iyzipos/checkoutform/auth`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `IYZWS apiKey:${apiKey}:${sigHash}`,
      'x-iyzi-rnd': randomString,
    },
    body: reqBody,
  })
  const data = await res.json() as { status: string; paymentStatus: string }
  return data.status === 'success' && data.paymentStatus === 'SUCCESS'
}

// ── PayTR hash doğrulama ───────────────────────────────────────────────────────
// Docs: https://dev.paytr.com/iframe-api#bildirim
// POST body: merchant_oid, status, total_amount, hash
async function verifyPayTR(body: URLSearchParams): Promise<boolean> {
  const merchantKey  = Deno.env.get('PAYTR_MERCHANT_KEY')
  const merchantSalt = Deno.env.get('PAYTR_MERCHANT_SALT')
  if (!merchantKey || !merchantSalt) return false

  const merchantOid  = body.get('merchant_oid') ?? ''
  const status       = body.get('status') ?? ''
  const totalAmount  = body.get('total_amount') ?? ''
  const receivedHash = body.get('hash') ?? ''

  const expected = await hmacSha256Base64(merchantKey, `${merchantOid}${merchantSalt}${status}${totalAmount}`)
  return expected === receivedHash && status === 'success'
}

// ── intentId çıkarıcı ─────────────────────────────────────────────────────────

function extractIntentId(params: URLSearchParams, provider: string): string | null {
  if (provider === 'IYZICO') {
    // iyzico conversationId = intent.id
    return params.get('conversationId') ?? null
  }
  if (provider === 'PAYTR') {
    // merchant_oid = intent.id
    return params.get('merchant_oid') ?? null
  }
  return null
}

function extractProviderRef(params: URLSearchParams, provider: string): string | null {
  if (provider === 'IYZICO') return params.get('paymentId') ?? null
  if (provider === 'PAYTR')  return params.get('payment_amount') ? params.get('merchant_oid') : null
  return null
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  const rawBody = await req.text()
  const params  = new URLSearchParams(rawBody)

  // İmza doğrulaması
  let valid = false
  if (PROVIDER === 'IYZICO') valid = await verifyIyzico(params)
  else if (PROVIDER === 'PAYTR') valid = await verifyPayTR(params)
  else {
    // SIMULATION — bu webhook gerçek parada kullanılır; simulation'da test hook olarak kabul et
    console.warn('[payment-webhook] SIMULATION modunda; gerçek parada kullanılmaz.')
    valid = !!Deno.env.get('SIMULATION_WEBHOOK_ALLOW')
  }

  if (!valid) {
    console.error('[payment-webhook] İmza doğrulanamadı.', { provider: PROVIDER })
    return new Response('Invalid signature', { status: 401 })
  }

  const intentId = extractIntentId(params, PROVIDER)
  if (!intentId) return new Response('No intent reference', { status: 400 })

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  const { error } = await admin.rpc('apply_booking_payment', {
    p_intent_id: intentId,
    p_provider_ref: extractProviderRef(params, PROVIDER),
    p_raw: Object.fromEntries(params.entries()),
  })
  if (error) {
    console.error('[payment-webhook] apply_booking_payment hatası:', error.message)
    return new Response('Apply failed', { status: 500 })
  }

  // PayTR OK yanıtı zorunlu
  if (PROVIDER === 'PAYTR') return new Response('OK', { status: 200 })
  return new Response('OK', { status: 200 })
})
