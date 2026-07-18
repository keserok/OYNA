// ═══════════════════════════════════════════════════════════════
// OYNA — payment-webhook Edge Function
// iyzico Checkout Form sonucu: IYZWSv2 retrieve → doğrula → uygula.
// Kart saklandıysa cardUserKey + maskeli kart bilgisini DB'ye yazar.
// ═══════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const PROVIDER = Deno.env.get('PAYMENT_PROVIDER') ?? 'SIMULATION'

async function hmacSha256Hex(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data))
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('')
}

interface IyzicoDetail {
  ok: boolean
  intentId?: string
  paymentId?: string
  cardUserKey?: string
  cardToken?: string
  last4?: string
  brand?: string
}

async function verifyIyzico(params: URLSearchParams): Promise<IyzicoDetail> {
  const token = params.get('token')
  if (!token) return { ok: false }
  const apiKey    = Deno.env.get('IYZICO_API_KEY')
  const secretKey = Deno.env.get('IYZICO_SECRET_KEY')
  const baseUrl   = Deno.env.get('IYZICO_BASE_URL') ?? 'https://api.iyzipay.com'
  if (!apiKey || !secretKey) { console.error('[payment-webhook] IYZICO anahtarları eksik'); return { ok: false } }

  const uriPath   = '/payment/iyzipos/checkoutform/auth/ecom/detail'
  const bodyStr   = JSON.stringify({ locale: 'tr', token })
  const randomKey = `${Date.now()}${Math.floor(Math.random() * 1_000_000)}`
  const signature = await hmacSha256Hex(secretKey, randomKey + uriPath + bodyStr)
  const authHeader = 'IYZWSv2 ' + btoa(`apiKey:${apiKey}&randomKey:${randomKey}&signature:${signature}`)
  const res = await fetch(`${baseUrl}${uriPath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': authHeader, 'x-iyzi-rnd': randomKey },
    body: bodyStr,
  })
  const data = await res.json() as {
    status?: string; paymentStatus?: string; errorMessage?: string;
    conversationId?: string; paymentId?: string;
    cardUserKey?: string; cardToken?: string; lastFourDigits?: string; cardAssociation?: string;
  }
  if (data.status !== 'success' || data.paymentStatus !== 'SUCCESS') {
    console.error('[payment-webhook] iyzico doğrulama başarısız:', JSON.stringify(data))
    return { ok: false }
  }
  return {
    ok: true,
    intentId: data.conversationId,
    paymentId: data.paymentId,
    cardUserKey: data.cardUserKey,
    cardToken: data.cardToken,
    last4: data.lastFourDigits,
    brand: data.cardAssociation, // VISA / MASTER_CARD / TROY / AMERICAN_EXPRESS
  }
}

function resultPage(ok: boolean, title: string, body: string, status = 200) {
  const color = ok ? '#39FF14' : '#F87171'
  const icon  = ok ? '✓' : '✕'
  // Gömülü çerçeve (iframe) içinde açıldıysa ana uygulamaya sinyal gönder →
  // OYNA kendi başarı ekranını gösterir (sayfa kapanır). Tam sayfada açıldıysa
  // (yedek yönlendirme) bu script zararsızdır ve bu branded sayfa görünür.
  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>OYNA — Ödeme</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0A0E14;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#fff;text-align:center;padding:24px">
<div>
  <div style="width:96px;height:96px;border-radius:9999px;background:${color};color:#0A0E14;font-size:48px;font-weight:900;line-height:96px;margin:0 auto 24px;box-shadow:0 0 60px ${color}55">${icon}</div>
  <h1 style="font-size:24px;font-weight:900;margin:0">${title}</h1>
  <p style="font-size:14px;color:#9CA3AF;margin:12px auto 0;max-width:320px;line-height:1.6">${body}</p>
  <p style="font-size:12px;color:#4B5563;margin-top:28px">Bu sayfayı kapatıp OYNA uygulamasına dönebilirsin.</p>
</div>
<script>try{if(window.parent&&window.parent!==window){window.parent.postMessage({source:'oyna-payment',ok:${ok}},'*');}}catch(e){}</script>
</body></html>`
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })
  const rawBody = await req.text()
  const params  = new URLSearchParams(rawBody)

  let detail: IyzicoDetail

  if (PROVIDER === 'IYZICO') {
    detail = await verifyIyzico(params)
    if (!detail.ok) {
      return resultPage(false, 'Ödeme Tamamlanamadı',
        'Ödeme iptal edildi, kart onaylanmadı veya doğrulanamadı. Uygulamadan tekrar deneyebilirsin; onaylanmayan tutar kartına yansımaz.', 402)
    }
  } else if (PROVIDER === 'SIMULATION') {
    if (!Deno.env.get('SIMULATION_WEBHOOK_ALLOW')) {
      return new Response('Not available in simulation mode', { status: 400 })
    }
    detail = { ok: true, intentId: params.get('conversationId') ?? undefined, paymentId: params.get('paymentId') ?? undefined }
  } else {
    return new Response('Unknown provider', { status: 400 })
  }

  if (!detail.intentId) return resultPage(false, 'Eksik Bilgi', 'Ödeme referansı bulunamadı. Uygulamadan durumu kontrol edebilirsin.', 400)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  const { error } = await admin.rpc('apply_booking_payment', {
    p_intent_id: detail.intentId, p_provider_ref: detail.paymentId ?? null, p_raw: Object.fromEntries(params.entries()),
  })
  if (error) {
    console.error('[payment-webhook] apply_booking_payment hatası:', error.message)
    return resultPage(false, 'Bir Sorun Oluştu',
      'Ödemen alındı ancak sisteme işlenirken bir sorun oluştu. Ekibimiz durumu görebiliyor; rezervasyonun kısa süre içinde güncellenir.', 500)
  }

  // Kart saklandıysa cardUserKey + maskeli kartı kaydet (best-effort; ödeme başarısını etkilemez).
  if (detail.cardUserKey || detail.cardToken) {
    try {
      const { data: intentRow } = await admin
        .from('payment_intents').select('user_id').eq('id', detail.intentId).maybeSingle()
      const uid = intentRow?.user_id
      if (uid) {
        if (detail.cardUserKey) {
          await admin.rpc('set_iyzico_card_user_key', { p_user_id: uid, p_key: detail.cardUserKey })
        }
        if (detail.cardToken && detail.last4) {
          const brandMap: Record<string, string> = { MASTER_CARD: 'MASTERCARD', AMERICAN_EXPRESS: 'AMEX' }
          await admin.rpc('upsert_iyzico_saved_card', {
            p_user_id: uid, p_card_token: detail.cardToken, p_last4: detail.last4,
            p_brand: brandMap[detail.brand ?? ''] ?? detail.brand ?? 'KART',
          })
        }
      }
    } catch (e) {
      console.error('[payment-webhook] kart kaydı yazılamadı:', e instanceof Error ? e.message : e)
    }
  }

  return resultPage(true, 'Ödemen Alındı!',
    'Kapora ödemen başarıyla tamamlandı. Rezervasyonun güvence altında — uygulamada Maçlarım ekranından görebilirsin.')
})
