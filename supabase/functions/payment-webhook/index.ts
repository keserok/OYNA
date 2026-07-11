// ═══════════════════════════════════════════════════════════════
// OYNA — payment-webhook Edge Function
// iyzico Checkout Form v2 ödeme sonucu bildirimi.
// İmzayı DOĞRULAR, sonra apply_booking_payment'i service_role ile çağırır.
//
// GÜVENLİK: iyzico sunucu tarafı token doğrulaması başarısız olursa 401
// döner, ödeme UYGULANMAZ. Gerçek parada tek geçerli onay yolu burasıdır.
//
// Deploy: supabase functions deploy payment-webhook --no-verify-jwt
// (iyzico JWT göndermez; doğrulama /checkoutform/auth ile yapılır.)
// ═══════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const PROVIDER = Deno.env.get('PAYMENT_PROVIDER') ?? 'SIMULATION'

// ── iyzico IYZWSv2 imza (HMAC-SHA256, hex) ────────────────────────────────────
async function hmacSha256Hex(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data))
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('')
}

// ── iyzico server-side sonuç doğrulama (Checkout Form retrieve) ───────────────
// Callback form-POST'unda gelen token'ı iyzico'da sorgulayıp ödemeyi doğrularız.
async function verifyIyzico(params: URLSearchParams): Promise<{ ok: boolean; intentId?: string; paymentId?: string }> {
  const token  = params.get('token')
  if (!token) return { ok: false }

  const apiKey    = Deno.env.get('IYZICO_API_KEY')
  const secretKey = Deno.env.get('IYZICO_SECRET_KEY')
  const baseUrl   = Deno.env.get('IYZICO_BASE_URL') ?? 'https://api.iyzipay.com'
  if (!apiKey || !secretKey) {
    console.error('[payment-webhook] IYZICO_API_KEY veya IYZICO_SECRET_KEY eksik')
    return { ok: false }
  }

  const uriPath   = '/payment/iyzipos/checkoutform/auth/ecom/detail'
  const bodyStr   = JSON.stringify({ locale: 'tr', token })
  const randomKey = `${Date.now()}${Math.floor(Math.random() * 1_000_000)}`
  const signature = await hmacSha256Hex(secretKey, randomKey + uriPath + bodyStr)
  const authHeader = 'IYZWSv2 ' + btoa(`apiKey:${apiKey}&randomKey:${randomKey}&signature:${signature}`)

  const res = await fetch(`${baseUrl}${uriPath}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authHeader,
      'x-iyzi-rnd': randomKey,
    },
    body: bodyStr,
  })

  const data = await res.json() as {
    status?: string; paymentStatus?: string; errorMessage?: string;
    conversationId?: string; paymentId?: string;
  }
  if (data.status !== 'success' || data.paymentStatus !== 'SUCCESS') {
    console.error('[payment-webhook] iyzico doğrulama başarısız:', JSON.stringify(data))
    return { ok: false }
  }
  // conversationId = payment_intents.id (create-payment'te böyle set edildi)
  return { ok: true, intentId: data.conversationId, paymentId: data.paymentId }
}

// ── Kullanıcıya gösterilen sonuç sayfası ─────────────────────────────────────
// iyzico Checkout Form, ödeme sonrası KULLANICININ TARAYICISINI bu adrese
// form-POST ile yönlendirir — yani yanıt gövdesini kullanıcı görür. Düz "OK"
// yerine uygulama temasında kısa bir Türkçe sonuç sayfası döndürülür.
function resultPage(ok: boolean, title: string, body: string, status = 200) {
  const color = ok ? '#39FF14' : '#F87171'
  const icon  = ok ? '✓' : '✕'
  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>OYNA — Ödeme</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0A0E14;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#fff;text-align:center;padding:24px">
<div>
  <div style="width:96px;height:96px;border-radius:9999px;background:${color};color:#0A0E14;font-size:48px;font-weight:900;line-height:96px;margin:0 auto 24px;box-shadow:0 0 60px ${color}55">${icon}</div>
  <h1 style="font-size:24px;font-weight:900;margin:0">${title}</h1>
  <p style="font-size:14px;color:#9CA3AF;margin:12px auto 0;max-width:320px;line-height:1.6">${body}</p>
  <p style="font-size:12px;color:#4B5563;margin-top:28px">Bu sayfayı kapatıp OYNA uygulamasına dönebilirsin.</p>
</div></body></html>`
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  const rawBody = await req.text()
  const params  = new URLSearchParams(rawBody)

  let intentId: string | undefined
  let providerRef: string | null = null

  if (PROVIDER === 'IYZICO') {
    // Retrieve ile ödemeyi doğrula; intent id (conversationId) yanıttan gelir.
    const result = await verifyIyzico(params)
    if (!result.ok) {
      return resultPage(false, 'Ödeme Tamamlanamadı',
        'Ödeme iptal edildi, kart onaylanmadı veya doğrulanamadı. Uygulamadan tekrar deneyebilirsin; onaylanmayan tutar kartına yansımaz.', 402)
    }
    intentId = result.intentId
    providerRef = result.paymentId ?? null
  } else if (PROVIDER === 'SIMULATION') {
    // SIMULATION modunda bu webhook gerçek parada kullanılır.
    if (!Deno.env.get('SIMULATION_WEBHOOK_ALLOW')) {
      console.warn('[payment-webhook] SIMULATION modunda — bu uç yalnız iyzico canlı ortamında çalışır.')
      return new Response('Not available in simulation mode', { status: 400 })
    }
    intentId = params.get('conversationId') ?? undefined
    providerRef = params.get('paymentId')
  } else {
    return new Response('Unknown provider', { status: 400 })
  }

  if (!intentId) return resultPage(false, 'Eksik Bilgi', 'Ödeme referansı bulunamadı. Uygulamadan durumu kontrol edebilirsin.', 400)

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  // İdempotent: apply_booking_payment zaten PAID ise tekrar uygulamaz.
  const { error } = await admin.rpc('apply_booking_payment', {
    p_intent_id: intentId,
    p_provider_ref: providerRef,
    p_raw: Object.fromEntries(params.entries()),
  })

  if (error) {
    console.error('[payment-webhook] apply_booking_payment hatası:', error.message)
    return resultPage(false, 'Bir Sorun Oluştu',
      'Ödemen alındı ancak sisteme işlenirken bir sorun oluştu. Ekibimiz durumu görebiliyor; rezervasyonun kısa süre içinde güncellenir.', 500)
  }

  return resultPage(true, 'Ödemen Alındı!',
    'Kapora ödemen başarıyla tamamlandı. Rezervasyonun güvence altında — uygulamada Rezervasyonlarım ekranından görebilirsin.')
})
