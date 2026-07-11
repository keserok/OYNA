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

// ── iyzico server-side token doğrulama ────────────────────────────────────────
// Checkout Form v2 callback: form POST; token + status + conversationId gelir.
// Token'ı /payment/iyzipos/checkoutform/auth ile iyzico sunucusunda doğrularız.
async function verifyIyzico(params: URLSearchParams): Promise<boolean> {
  const token  = params.get('token')
  const status = params.get('status')
  if (!token || status !== 'success') return false

  const apiKey    = Deno.env.get('IYZICO_API_KEY')
  const secretKey = Deno.env.get('IYZICO_SECRET_KEY')
  const baseUrl   = Deno.env.get('IYZICO_BASE_URL') ?? 'https://api.iyzipay.com'
  if (!apiKey || !secretKey) {
    console.error('[payment-webhook] IYZICO_API_KEY veya IYZICO_SECRET_KEY eksik')
    return false
  }

  const enc          = new TextEncoder()
  const randomString = crypto.randomUUID().replace(/-/g, '').slice(0, 12)
  const reqBody      = JSON.stringify({ locale: 'tr', token })

  const bodyHashBuf = await crypto.subtle.digest('SHA-256', enc.encode(reqBody))
  const bodyHash    = btoa(String.fromCharCode(...new Uint8Array(bodyHashBuf)))

  const rawSig     = randomString + apiKey + bodyHash
  const sigHashBuf = await crypto.subtle.digest('SHA-256', enc.encode(secretKey + rawSig))
  const sigHash    = btoa(String.fromCharCode(...new Uint8Array(sigHashBuf)))

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

  if (PROVIDER === 'SIMULATION') {
    // SIMULATION modunda bu webhook gerçek parada kullanılır.
    // Test ortamında SIMULATION_WEBHOOK_ALLOW=true ile geçici kabul edilebilir.
    if (!Deno.env.get('SIMULATION_WEBHOOK_ALLOW')) {
      console.warn('[payment-webhook] SIMULATION modunda — bu uç yalnız iyzico canlı ortamında çalışır.')
      return new Response('Not available in simulation mode', { status: 400 })
    }
  } else if (PROVIDER === 'IYZICO') {
    // Kullanıcı ödemeyi iptal etti / kart reddedildi → doğrulamaya gerek yok.
    if (params.get('status') !== 'success') {
      return resultPage(false, 'Ödeme Tamamlanamadı',
        'Ödeme iptal edildi veya kart onaylanmadı. Uygulamadan tekrar deneyebilirsin; hesabından para çekilmedi.')
    }
    const valid = await verifyIyzico(params)
    if (!valid) {
      console.error('[payment-webhook] iyzico token doğrulaması başarısız.')
      return resultPage(false, 'Ödeme Doğrulanamadı',
        'Ödeme sağlayıcısından geçerli bir onay alınamadı. Paran çekildiyse otomatik iade edilir; uygulamadan durumu kontrol edebilirsin.', 401)
    }
  } else {
    return new Response('Unknown provider', { status: 400 })
  }

  // conversationId = payment_intents.id (create-payment'te bu şekilde set edildi)
  const intentId = params.get('conversationId')
  if (!intentId) return resultPage(false, 'Eksik Bilgi', 'Ödeme referansı bulunamadı. Uygulamadan durumu kontrol edebilirsin.', 400)

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  // İdempotent: apply_booking_payment zaten PAID ise tekrar uygulamaz.
  const { error } = await admin.rpc('apply_booking_payment', {
    p_intent_id: intentId,
    p_provider_ref: params.get('paymentId') ?? null,
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
