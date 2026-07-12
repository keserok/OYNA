// ═══════════════════════════════════════════════════════════════
// OYNA — iyzico-3ds-callback Edge Function
// Banka 3DS (SMS) doğrulaması sonrası iyzico'nun POST ettiği sonuç:
//   mdStatus=1 → /payment/3dsecure/auth ile TAHSİLAT → apply_card_payment.
//   değilse    → mark_intent_failed + kullanıcıya anlaşılır hata sayfası.
// Sayfa iframe içinde açıldığından ana uygulamaya postMessage ile sinyal
// gönderir; uygulama kendi başarı/hata ekranını gösterir.
// Güvenlik: tahsilat YALNIZ iyzico auth 'success' dönerse uygulanır
// (paymentId imzalı istekle iyzico'da doğrulanır); sahte POST para hareketi
// yaratamaz. Kart verisi bu fonksiyona hiç gelmez.
// ═══════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

async function hmacSha256Hex(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data))
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('')
}

// H2 — Bu iyzicoPost tahsilat (3dsecure/auth) için kullanılır. Timeout EKLENİR
// (sonsuz asılı kalma önlenir) ama RETRY YOK: tahsilat isteği iyzico'ya ulaşıp
// yanıtı kaybolduysa, kör bir retry çift-çekim yapabilir. Timeout'ta niyet
// PENDING kalır; FE poll'u ve iyzico webhook'u nihai durumu belirler.
const IYZICO_TIMEOUT_MS = 20_000

async function iyzicoPost(uriPath: string, bodyObj: unknown): Promise<any> {
  const apiKey    = Deno.env.get('IYZICO_API_KEY')!
  const secretKey = Deno.env.get('IYZICO_SECRET_KEY')!
  const baseUrl   = Deno.env.get('IYZICO_BASE_URL') ?? 'https://api.iyzipay.com'
  const bodyStr   = JSON.stringify(bodyObj)
  const randomKey = `${Date.now()}${Math.floor(Math.random() * 1_000_000)}`
  const signature = await hmacSha256Hex(secretKey, randomKey + uriPath + bodyStr)
  const authHeader = 'IYZWSv2 ' + btoa(`apiKey:${apiKey}&randomKey:${randomKey}&signature:${signature}`)
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), IYZICO_TIMEOUT_MS)
  try {
    const res = await fetch(baseUrl + uriPath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': authHeader, 'x-iyzi-rnd': randomKey },
      body: bodyStr,
      signal: ctrl.signal,
    })
    return await res.json()
  } finally {
    clearTimeout(t)
  }
}

// mdStatus → kullanıcı diline çeviri (iyzico 3DS sonuç kodları)
const MD_STATUS_TR: Record<string, string> = {
  '0': 'Banka doğrulaması (3D Secure) geçersiz sayıldı. Kartını çıkaran bankayla iletişime geçebilirsin.',
  '2': 'Bu kart 3D Secure sistemine kayıtlı görünmüyor. Bankandan 3D Secure/SMS onayını açtırman gerekiyor.',
  '3': 'Kartın bankası 3D Secure sistemine kayıtlı değil. Farklı bir kart deneyebilirsin.',
  '4': 'Banka doğrulama denemesi tamamlanamadı. Tekrar deneyebilirsin.',
  '5': 'Banka doğrulaması yapılamadı. Tekrar deneyebilir veya farklı bir kart kullanabilirsin.',
  '6': 'Banka 3D Secure doğrulama hatası verdi. Bankanla iletişime geçebilirsin.',
  '7': 'Banka doğrulaması sırasında sistem hatası oluştu. Biraz sonra tekrar dene.',
  '8': 'Kart numarası doğrulanamadı. Kart bilgilerini kontrol et.',
}

function resultPage(ok: boolean, title: string, body: string, intentId: string | null, reason: string | null, status = 200) {
  const color = ok ? '#39FF14' : '#F87171'
  const icon  = ok ? '✓' : '✕'
  const msg = JSON.stringify({ source: 'oyna-payment', ok, intentId, reason })
  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>OYNA — Ödeme</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0A0E14;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#fff;text-align:center;padding:24px">
<div>
  <div style="width:96px;height:96px;border-radius:9999px;background:${color};color:#0A0E14;font-size:48px;font-weight:900;line-height:96px;margin:0 auto 24px;box-shadow:0 0 60px ${color}55">${icon}</div>
  <h1 style="font-size:24px;font-weight:900;margin:0">${title}</h1>
  <p style="font-size:14px;color:#9CA3AF;margin:12px auto 0;max-width:320px;line-height:1.6">${body}</p>
  <p style="font-size:12px;color:#4B5563;margin-top:28px">OYNA uygulamasına dönebilirsin.</p>
</div>
<script>try{if(window.parent&&window.parent!==window){window.parent.postMessage(${msg},'*');}}catch(e){}</script>
</body></html>`
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

const BRAND_MAP: Record<string, string> = { MASTER_CARD: 'MASTERCARD', AMERICAN_EXPRESS: 'AMEX' }

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })
  const rawBody = await req.text()
  const params  = new URLSearchParams(rawBody)

  const mdStatus         = params.get('mdStatus') ?? ''
  const paymentId        = params.get('paymentId') ?? ''
  const conversationId   = params.get('conversationId') ?? ''
  const conversationData = params.get('conversationData') ?? ''
  const intentId = /^[0-9a-f-]{36}$/i.test(conversationId) ? conversationId : null

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

  // ── SMS doğrulaması başarısız → niyeti kapat, anlaşılır mesaj göster ─────
  if (mdStatus !== '1') {
    if (intentId) {
      await admin.rpc('mark_intent_failed', { p_intent_id: intentId, p_reason: `3DS mdStatus=${mdStatus || 'yok'}` })
    }
    const msg = MD_STATUS_TR[mdStatus] ?? 'Banka doğrulaması tamamlanmadı. Onaylanmayan tutar kartına yansımaz; tekrar deneyebilirsin.'
    return resultPage(false, 'Doğrulama Tamamlanamadı', msg, intentId, 'MD_FAILED', 402)
  }

  if (!intentId || !paymentId) {
    return resultPage(false, 'Eksik Bilgi', 'Ödeme referansı bulunamadı. Uygulamadan durumu kontrol edebilirsin.', intentId, 'MISSING_REF', 400)
  }

  // ── Tahsilat: 3DS auth (imzalı istek — iyzico paymentId'yi doğrular) ─────
  const auth = await iyzicoPost('/payment/3dsecure/auth', {
    locale: 'tr', conversationId: intentId, paymentId,
    ...(conversationData ? { conversationData } : {}),
  })
  if (auth?.status !== 'success') {
    const detail = auth?.errorMessage || auth?.errorCode || '3DS tahsilatı başarısız'
    console.error('[iyzico-3ds-callback] auth başarısız:', JSON.stringify({
      status: auth?.status, errorCode: auth?.errorCode, errorMessage: auth?.errorMessage, intentId,
    }))
    await admin.rpc('mark_intent_failed', { p_intent_id: intentId, p_reason: `3DS_AUTH: ${detail}` })
    return resultPage(false, 'Ödeme Tamamlanamadı',
      'Banka doğrulaması geçti ancak tahsilat onaylanmadı. Onaylanmayan tutar kartına yansımaz. Sorun sürerse bankanla iletişime geçebilirsin.',
      intentId, 'AUTH_FAILED', 402)
  }

  // ── Para hareketini uygula (idempotent) ──────────────────────────────────
  const { data: applied, error: applyErr } = await admin.rpc('apply_card_payment', {
    p_intent_id: intentId,
    p_provider_ref: auth.paymentId ?? paymentId,
    p_raw: { threeds: true, mdStatus, fraudStatus: auth.fraudStatus ?? null },
  })
  if (applyErr) {
    console.error('[iyzico-3ds-callback] apply_card_payment hatası:', applyErr.message)
    return resultPage(false, 'Bir Sorun Oluştu',
      'Ödemen bankadan onaylandı ancak sisteme işlenirken bir sorun oluştu. Ekibimiz durumu görebiliyor; kısa süre içinde düzeltilir, paran güvende.',
      intentId, 'APPLY_ERROR', 500)
  }

  // ── Kart saklandıysa cardUserKey + maskeli kartı kaydet (best-effort) ────
  if (auth.cardUserKey || auth.cardToken) {
    try {
      const { data: intentRow } = await admin
        .from('payment_intents').select('user_id').eq('id', intentId).maybeSingle()
      const uid = intentRow?.user_id
      if (uid) {
        if (auth.cardUserKey) {
          await admin.rpc('set_iyzico_card_user_key', { p_user_id: uid, p_key: auth.cardUserKey })
        }
        if (auth.cardToken && auth.lastFourDigits) {
          await admin.rpc('upsert_iyzico_saved_card', {
            p_user_id: uid, p_card_token: auth.cardToken, p_last4: auth.lastFourDigits,
            p_brand: BRAND_MAP[auth.cardAssociation ?? ''] ?? auth.cardAssociation ?? 'KART',
          })
        }
      }
    } catch (e) {
      console.error('[iyzico-3ds-callback] kart kaydı yazılamadı:', e instanceof Error ? e.message : e)
    }
  }

  // ── Sonuç sayfası ─────────────────────────────────────────────────────────
  const reason = (applied?.reason as string | undefined) ?? null
  if (reason === 'SLOT_TAKEN_REFUNDED') {
    return resultPage(true, 'Yer Doldu — Paran İade Kredisinde',
      'Sen doğrulama yaparken maçtaki yer doldu. Ödediğin tutar anında cüzdanına iade kredisi olarak eklendi; dilediğin ödemede kullanabilirsin.',
      intentId, reason)
  }
  if (reason === 'BOOKING_CLOSED_REFUNDED') {
    return resultPage(true, 'Rezervasyon Kapandı — Paran İade Kredisinde',
      'Rezervasyon bu sırada kapandığı için ödediğin tutar cüzdanına iade kredisi olarak eklendi; dilediğin ödemede kullanabilirsin.',
      intentId, reason)
  }
  return resultPage(true, 'Ödemen Alındı!',
    'Ödemen banka doğrulamasıyla güvenle tamamlandı. Detayları uygulamadan görebilirsin.',
    intentId, null)
})
