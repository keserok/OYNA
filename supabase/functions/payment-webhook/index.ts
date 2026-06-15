// ═══════════════════════════════════════════════════════════════
// OYNA — payment-webhook Edge Function
// GERÇEK ödeme sağlayıcısının (iyzico/PayTR) ödeme sonucunu bildirdiği uç.
// Sağlayıcı imzasını DOĞRULAR, sonra apply_booking_payment'i service_role ile çağırır.
//
// GÜVENLİK: imza doğrulaması olmadan ASLA ödeme uygulanmaz. Gerçek parada
// tek geçerli onay yolu burasıdır (istemci confirm-sim yalnız SIMULATION içindir).
//
// Sağlayıcı bağlarken:
//   - PAYMENT_WEBHOOK_SECRET (PayTR hash anahtarı / iyzico imza) env'e koyun
//   - verifyProviderSignature() içine sağlayıcının imza doğrulamasını yazın
//   - extractIntentId() ile sağlayıcı payload'undan intent referansını çıkarın
//
// Kurulum: supabase functions deploy payment-webhook --no-verify-jwt
// (Sağlayıcı JWT göndermez; doğrulama imza ile yapılır.)
// ═══════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const PROVIDER = Deno.env.get('PAYMENT_PROVIDER') ?? 'SIMULATION'
const WEBHOOK_SECRET = Deno.env.get('PAYMENT_WEBHOOK_SECRET') ?? ''

// Sağlayıcının imzasını doğrula. Gerçek entegrasyonda zorunlu.
async function verifyProviderSignature(_req: Request, _rawBody: string): Promise<boolean> {
  if (PROVIDER === 'SIMULATION') {
    // SIMULATION modunda gerçek sağlayıcı yok; bu uç gerçek parada kullanılır.
    // Yine de paylaşılan secret ile basit koruma uygula.
    return false
  }
  // ── iyzico/PayTR imza doğrulaması buraya ──
  // PayTR örn: hash = base64(HMAC_SHA256(merchant_oid+merchant_salt+status+total_amount, merchant_key))
  // iyzico: gelen signature ile hesaplanan imza karşılaştırılır.
  if (!WEBHOOK_SECRET) return false
  return false // adaptör bağlanana kadar reddet
}

function extractIntentId(_body: unknown): string | null {
  // Sağlayıcı payload'undan payment_intents.id (veya provider_ref eşlemesi) çıkarılır.
  return null
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  const rawBody = await req.text()

  const ok = await verifyProviderSignature(req, rawBody)
  if (!ok) {
    console.error('[payment-webhook] İmza doğrulanamadı veya sağlayıcı yapılandırılmadı.')
    return new Response('Invalid signature', { status: 401 })
  }

  let body: unknown
  try {
    body = JSON.parse(rawBody)
  } catch {
    return new Response('Invalid body', { status: 400 })
  }

  const intentId = extractIntentId(body)
  if (!intentId) return new Response('No intent reference', { status: 400 })

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  // İdempotent: apply_booking_payment zaten PAID ise tekrar uygulamaz.
  const { error } = await admin.rpc('apply_booking_payment', {
    p_intent_id: intentId,
    p_provider_ref: (body as Record<string, unknown>)?.providerRef as string ?? null,
    p_raw: body as Record<string, unknown>,
  })
  if (error) {
    console.error('[payment-webhook] apply_booking_payment hatası:', error.message)
    return new Response('Apply failed', { status: 500 })
  }

  return new Response('OK', { status: 200 })
})
