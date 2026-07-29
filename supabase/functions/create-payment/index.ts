// ═══════════════════════════════════════════════════════════════
// OYNA — create-payment Edge Function
// Uygulama-içi kart ödemesi (Uber standardı): OYNA'nın kendi kart formu →
// bu fonksiyon → iyzico 3DS initialize → banka SMS (uygulama içinde) →
// iyzico-3ds-callback → tahsilat. Kart verisi ASLA loglanmaz/saklanmaz;
// yalnız iyzico'ya iletilir (PCI-DSS: saklama yok, geçiş var).
// iyzico kimlik doğrulama: IYZWSv2 (HMAC-SHA256).
//
// Aksiyonlar:
//   pay           → 3 akış: BOOKING_DEPOSIT | TOP_UP | MATCH_JOIN (yeni kart
//                   veya kayıtlı kart token'ı ile; 3DS HTML döner)
//   register-card → cüzdandan bağımsız kart kaydetme (iyzico kart deposu)
//   create        → eski barındırılan Checkout Form (yedek akış)
//   confirm-sim   → simülasyon onayı (yalnız SIMULATION modunda)
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
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

async function hmacSha256Hex(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data))
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('')
}

// H2 — Ödeme sağlayıcısına yapılan çağrı timeout'suz/retry'sız kalmasın: iyzico
// gecikirse istemci sonsuza dek spinner'da asılır, niyet PENDING'te kalır. 20 sn
// timeout + ağ/timeout hatasında TEK retry. NOT: retry yalnız istek KURULAMADIĞINDA
// (ağ/timeout) yapılır — iyzico'dan gelen iş-hatası (status!=success) retry edilmez,
// çünkü bir tahsilat başlamış olabilir (çift-çekim riski).
const IYZICO_TIMEOUT_MS = 20_000

async function iyzicoPost(uriPath: string, bodyObj: unknown): Promise<any> {
  const apiKey    = Deno.env.get('IYZICO_API_KEY')!
  const secretKey = Deno.env.get('IYZICO_SECRET_KEY')!
  const baseUrl   = Deno.env.get('IYZICO_BASE_URL') ?? 'https://api.iyzipay.com'
  const bodyStr   = JSON.stringify(bodyObj)

  const attempt = async (): Promise<any> => {
    // Her denemede taze randomKey/signature — iyzico nonce tekrarını reddeder.
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

  try {
    return await attempt()
  } catch (e) {
    // Ağ/timeout — bağlantı kurulamadı, tahsilat başlamadı: bir kez daha dene.
    console.warn('[create-payment] iyzico çağrısı başarısız, 1 kez daha denenecek:', String(e))
    return await attempt()
  }
}

interface Buyer { name: string; surname: string; email: string; identityNumber: string; gsmNumber: string; }

function splitName(full?: string | null): { name: string; surname: string } {
  const clean = (full ?? '').trim().replace(/\s+/g, ' ')
  if (!clean) return { name: 'OYNA', surname: 'Kullanici' }
  const parts = clean.split(' ')
  if (parts.length === 1) return { name: parts[0], surname: parts[0] }
  return { name: parts.slice(0, -1).join(' '), surname: parts[parts.length - 1] }
}

function buyerBlock(intentId: string, buyer: Buyer) {
  const contactName = `${buyer.name} ${buyer.surname}`.trim() || 'OYNA Kullanici'
  return {
    buyer: {
      id: intentId, name: buyer.name, surname: buyer.surname, email: buyer.email,
      identityNumber: buyer.identityNumber, registrationAddress: 'Istanbul, Turkiye',
      city: 'Istanbul', country: 'Turkey', ip: '85.34.78.112', gsmNumber: buyer.gsmNumber,
    },
    shippingAddress: { contactName, city: 'Istanbul', country: 'Turkey', address: 'Istanbul, Turkiye' },
    billingAddress:  { contactName, city: 'Istanbul', country: 'Turkey', address: 'Istanbul, Turkiye' },
  }
}

const FLOW_BASKET_NAME: Record<string, string> = {
  BOOKING_DEPOSIT: 'Saha Kapora',
  TOP_UP: 'Cuzdan Yukleme',
  MATCH_JOIN: 'Mac Katilim',
}

// Kart verisi: yalnız bellek içinde, iyzico isteğine gömülür — log/DB'ye girmez.
interface CardInput {
  holderName?: string
  number?: string
  expireMonth?: string | number
  expireYear?: string | number
  cvc?: string
  save?: boolean
}

function normalizeCard(card: CardInput): { holderName: string; number: string; expireMonth: string; expireYear: string; cvc: string } | null {
  const number = String(card.number ?? '').replace(/\D/g, '')
  const holderName = String(card.holderName ?? '').trim()
  const cvc = String(card.cvc ?? '').replace(/\D/g, '')
  let month = parseInt(String(card.expireMonth ?? ''), 10)
  let year  = parseInt(String(card.expireYear ?? ''), 10)
  if (year < 100) year += 2000
  if (!/^\d{12,19}$/.test(number) || !holderName || !(month >= 1 && month <= 12) || !(year >= 2024 && year <= 2060)) return null
  return {
    holderName, number,
    expireMonth: String(month).padStart(2, '0'),
    expireYear: String(year),
    cvc,
  }
}

function detectBrand(number: string): string {
  if (/^(9792|65)/.test(number)) return 'TROY'
  if (/^3[47]/.test(number)) return 'AMEX'
  if (/^4/.test(number)) return 'VISA'
  if (/^(5[1-5]|2[2-7])/.test(number)) return 'MASTERCARD'
  return 'KART'
}

const BRAND_MAP: Record<string, string> = { MASTER_CARD: 'MASTERCARD', AMERICAN_EXPRESS: 'AMEX' }

// Eski barındırılan Checkout Form (yedek). cardUserKey verilirse kayıtlı
// kartlar formda görünür.
async function iyzicoCheckout(
  intent: { id: string; amount: number; currency: string },
  callbackUrl: string, buyer: Buyer, cardUserKey?: string | null,
): Promise<{ checkoutUrl: string; token: string; checkoutFormContent: string }> {
  const price = Number(intent.amount).toFixed(2)
  const body: Record<string, unknown> = {
    locale: 'tr', conversationId: intent.id, price, paidPrice: price,
    currency: intent.currency || 'TRY', basketId: intent.id, paymentGroup: 'PRODUCT',
    callbackUrl, enabledInstallments: [1, 2, 3, 6],
    ...buyerBlock(intent.id, buyer),
    basketItems: [{ id: `svc-${intent.id}`, name: 'Saha Kapora', category1: 'Spor Hizmeti', itemType: 'VIRTUAL', price }],
  }
  if (cardUserKey) body.cardUserKey = cardUserKey

  const data = await iyzicoPost('/payment/iyzipos/checkoutform/initialize/auth/ecom', body)
  if (data?.status !== 'success' || !data?.checkoutFormContent) {
    const detail = data?.errorMessage || data?.errorCode || 'checkout başlatılamadı'
    console.error('[create-payment] iyzico initialize başarısız:', detail, JSON.stringify(data))
    // BULGU-092 — sağlayıcı adı ve ham İngilizce metni kullanıcıya SIZMAZ;
    // ham `detail` yalnız sunucu logunda kalır. Kodun ardında Türkçe cümle
    // ZORUNLU: kırpma yardımcısı yalnız öneki alır, gerisini kullanıcı görür.
    throw new Error('PROVIDER_ERROR: Ödeme sağlayıcısına ulaşılamadı. Lütfen birazdan tekrar dene.')
  }
  return { checkoutUrl: data.paymentPageUrl, token: data.token, checkoutFormContent: data.checkoutFormContent }
}

interface Payload {
  action?: string
  bookingId?: string
  intentId?: string
  // pay / register-card
  flow?: string
  amount?: number
  matchId?: string
  slotIds?: string[]
  useBalance?: boolean
  card?: CardInput
  savedCardId?: string
  idempotencyKey?: string
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST')    return json({ error: 'METHOD_NOT_ALLOWED' }, 405)
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'UNAUTHORIZED' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } })
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  let payload: Payload
  try { payload = await req.json() } catch { return json({ error: 'INVALID_BODY' }, 400) }
  const action = payload.action ?? 'create'

  try {
    // ── PAY: uygulama-içi kart ödemesi (3 akış) ────────────────────────────
    if (action === 'pay') {
      const { data: { user } } = await userClient.auth.getUser()
      if (!user) return json({ error: 'UNAUTHORIZED' }, 401)

      const flow = payload.flow ?? ''
      if (!['BOOKING_DEPOSIT', 'TOP_UP', 'MATCH_JOIN'].includes(flow)) {
        return json({ error: 'INVALID_FLOW' }, 400)
      }

      // Kart girdisi: yeni kart VEYA kayıtlı kart
      let newCard: ReturnType<typeof normalizeCard> = null
      let savedToken: string | null = null
      let registerCard = false
      if (payload.savedCardId) {
        const { data: saved } = await userClient
          .from('user_saved_cards')
          .select('id, provider_card_token, last4')
          .eq('id', payload.savedCardId).maybeSingle()
        if (!saved) return json({ error: 'CARD_NOT_FOUND: Kayıtlı kart bulunamadı.' }, 404)
        if (PROVIDER === 'IYZICO' && !saved.provider_card_token) {
          return json({ error: 'CARD_NEEDS_REVALIDATION: Bu kart eski sistemden; güvenlik için kart bilgilerini bir kez daha girmen gerekiyor.' }, 400)
        }
        savedToken = saved.provider_card_token
      } else if (payload.card) {
        newCard = normalizeCard(payload.card)
        if (!newCard) return json({ error: 'INVALID_CARD: Kart bilgilerini kontrol et.' }, 400)
        if (!/^\d{3,4}$/.test(newCard.cvc)) return json({ error: 'INVALID_CARD: Güvenlik kodunu (CVV) kontrol et.' }, 400)
        registerCard = payload.card.save === true
      } else {
        return json({ error: 'CARD_REQUIRED: Kart bilgisi veya kayıtlı kart seç.' }, 400)
      }

      // Profil → alıcı bilgisi + iyzico kart anahtarı
      const { data: profile } = await userClient
        .from('profiles').select('full_name, name, email, phone, iyzico_card_user_key')
        .eq('id', user.id).maybeSingle()
      const nm = splitName(profile?.full_name ?? profile?.name)
      const digits = (profile?.phone ?? '').replace(/\D/g, '')
      const buyer: Buyer = {
        name: nm.name, surname: nm.surname,
        email: profile?.email || user.email || 'oyuncu@oyna.app',
        identityNumber: '74300864791',
        gsmNumber: digits ? `+90${digits.slice(-10)}` : '+905000000000',
      }
      const cardUserKey = profile?.iyzico_card_user_key ?? null
      if (savedToken && !cardUserKey) {
        return json({ error: 'CARD_NEEDS_REVALIDATION: Bu kart eski sistemden; güvenlik için kart bilgilerini bir kez daha girmen gerekiyor.' }, 400)
      }

      // Niyet oluştur (bakiye kısmı henüz HARCANMAZ — 3DS onayında düşülür)
      // C1: idempotency_key ile aynı denemenin retry'ı var olan niyeti geri getirir.
      const { data: prep, error: prepErr } = await admin.rpc('prepare_card_payment', {
        p_user_id: user.id,
        p_flow: flow,
        p_amount: payload.amount ?? null,
        p_booking_id: payload.bookingId ?? null,
        p_match_id: payload.matchId ?? null,
        p_slot_ids: payload.slotIds ?? null,
        p_use_balance: payload.useBalance === true,
        p_idempotency_key: payload.idempotencyKey ?? null,
      })
      if (prepErr) return json({ error: prepErr.message }, 400)

      const intentId = prep.intent_id as string
      const cardAmount = Number(prep.card_amount)
      const balanceApplied = Number(prep.balance_applied)

      // C1 — Çift-çekim koruması: aynı idempotency anahtarlı niyet ZATEN ÖDENMİŞSE
      // (ör. istemci timeout'undan sonra 3DS geç geçti ve kullanıcı "tekrar dene"
      // dedi) iyzico'yu HİÇ ÇAĞIRMA; başarıyı doğrudan döndür. Böylece ikinci bir
      // gerçek kart çekimi oluşmaz.
      if (prep.reused === true && prep.status === 'PAID') {
        return json({
          provider: PROVIDER === 'SIMULATION' ? 'SIMULATION' : 'IYZICO',
          requiresThreeDS: false,
          intentId, cardAmount, balanceApplied,
          result: { ok: true, idempotent: true },
        })
      }

      // Simülasyon: 3DS yok → direkt uygula (geliştirme/test modu)
      if (PROVIDER === 'SIMULATION') {
        // C11 — kontrollü RED: kart tutarı sim_decline_amount'e eşitse gerçek kart
        // reddi gibi 402 döndür (para uygulanmaz; hata UX'i QA edilir). 0 = kapalı.
        const { data: declAmt } = await admin.rpc('get_config_number', { p_key: 'sim_decline_amount', p_default: 0 })
        if (Number(declAmt) > 0 && Number(cardAmount) === Number(declAmt)) {
          await admin.rpc('mark_intent_failed', { p_intent_id: intentId, p_reason: 'SIM_DECLINE (QA)' })
          return json({ error: 'CARD_DECLINED: Kartından ödeme alınamadı (test reddi).' }, 402)
        }
        const { data: result, error: applyErr } = await admin.rpc('apply_card_payment', {
          p_intent_id: intentId, p_provider_ref: `SIM-${Date.now()}`,
          p_raw: { simulated: true, at: new Date().toISOString() },
        })
        if (applyErr) return json({ error: applyErr.message }, 400)
        if (registerCard && newCard) {
          await userClient.rpc('add_saved_card', {
            p_brand: detectBrand(newCard.number), p_last4: newCard.number.slice(-4),
            p_exp_month: parseInt(newCard.expireMonth, 10), p_exp_year: parseInt(newCard.expireYear, 10),
            p_holder_name: newCard.holderName,
          })
        }
        return json({
          provider: 'SIMULATION', requiresThreeDS: false,
          intentId, cardAmount, balanceApplied, result,
        })
      }

      // iyzico 3DS başlat → banka doğrulama sayfası (uygulama içinde açılır)
      const price = cardAmount.toFixed(2)
      const callbackUrl = Deno.env.get('IYZICO_3DS_CALLBACK_URL') ?? `${supabaseUrl}/functions/v1/iyzico-3ds-callback`
      const paymentCard: Record<string, unknown> = savedToken
        ? { cardUserKey, cardToken: savedToken }
        : {
            cardHolderName: newCard!.holderName, cardNumber: newCard!.number,
            expireMonth: newCard!.expireMonth, expireYear: newCard!.expireYear,
            cvc: newCard!.cvc, registerCard: registerCard ? 1 : 0,
            ...(registerCard && cardUserKey ? { cardUserKey } : {}),
          }
      const body = {
        locale: 'tr', conversationId: intentId, price, paidPrice: price,
        currency: 'TRY', installment: 1, basketId: intentId,
        paymentChannel: 'MOBILE', paymentGroup: 'PRODUCT', callbackUrl,
        paymentCard,
        ...buyerBlock(intentId, buyer),
        basketItems: [{
          id: `svc-${intentId}`, name: FLOW_BASKET_NAME[flow] ?? 'OYNA Hizmet',
          category1: 'Spor Hizmeti', itemType: 'VIRTUAL', price,
        }],
      }
      const data = await iyzicoPost('/payment/3dsecure/initialize', body)
      if (data?.status !== 'success' || !data?.threeDSHtmlContent) {
        const detail = data?.errorMessage || data?.errorCode || '3DS başlatılamadı'
        // Kart verisi loglanmaz — yalnız iyzico hata özeti.
        console.error('[create-payment] 3DS initialize başarısız:', JSON.stringify({
          status: data?.status, errorCode: data?.errorCode, errorMessage: data?.errorMessage, intentId,
        }))
        // Ham metin destek için payment_intents.raw'a yazılır; kullanıcıya gitmez.
        await admin.rpc('mark_intent_failed', { p_intent_id: intentId, p_reason: `3DS_INIT: ${detail}` })
        return json({ error: 'CARD_DECLINED: Kartından ödeme alınamadı.' }, 402)
      }
      return json({
        provider: 'IYZICO', requiresThreeDS: true,
        intentId, cardAmount, balanceApplied,
        threeDSHtml: data.threeDSHtmlContent, // base64 — FE çözer, iframe'e basar
      })
    }

    // ── REGISTER-CARD: cüzdandan bağımsız kart kaydetme ────────────────────
    if (action === 'register-card') {
      const { data: { user } } = await userClient.auth.getUser()
      if (!user) return json({ error: 'UNAUTHORIZED' }, 401)
      const card = payload.card ? normalizeCard(payload.card) : null
      if (!card) return json({ error: 'INVALID_CARD: Kart bilgilerini kontrol et.' }, 400)

      if (PROVIDER === 'SIMULATION') {
        const { data: row, error } = await userClient.rpc('add_saved_card', {
          p_brand: detectBrand(card.number), p_last4: card.number.slice(-4),
          p_exp_month: parseInt(card.expireMonth, 10), p_exp_year: parseInt(card.expireYear, 10),
          p_holder_name: card.holderName,
        })
        if (error) return json({ error: error.message }, 400)
        return json({ ok: true, provider: 'SIMULATION', card: row })
      }

      const { data: profile } = await userClient
        .from('profiles').select('email, iyzico_card_user_key').eq('id', user.id).maybeSingle()
      const body: Record<string, unknown> = {
        locale: 'tr', conversationId: crypto.randomUUID(),
        email: profile?.email || user.email || 'oyuncu@oyna.app',
        externalId: user.id,
        card: {
          cardAlias: `OYNA-${card.number.slice(-4)}`,
          cardHolderName: card.holderName, cardNumber: card.number,
          expireMonth: card.expireMonth, expireYear: card.expireYear,
        },
      }
      if (profile?.iyzico_card_user_key) body.cardUserKey = profile.iyzico_card_user_key

      const data = await iyzicoPost('/cardstorage/card', body)
      if (data?.status !== 'success' || !data?.cardToken) {
        const detail = data?.errorMessage || data?.errorCode || 'kart kaydedilemedi'
        // Ham sağlayıcı metni YALNIZ sunucu logunda; kullanıcı sabit Türkçe görür.
        console.error('[create-payment] kart kaydı başarısız:', detail, JSON.stringify({
          status: data?.status, errorCode: data?.errorCode, errorMessage: data?.errorMessage,
        }))
        return json({ error: 'CARD_SAVE_FAILED: Kart kaydedilemedi. Kart bilgilerini kontrol edip tekrar dene.' }, 402)
      }
      if (data.cardUserKey) {
        await admin.rpc('set_iyzico_card_user_key', { p_user_id: user.id, p_key: data.cardUserKey })
      }
      const brand = BRAND_MAP[data.cardAssociation ?? ''] ?? data.cardAssociation ?? detectBrand(card.number)
      await admin.rpc('upsert_iyzico_saved_card', {
        p_user_id: user.id, p_card_token: data.cardToken,
        p_last4: data.lastFourDigits ?? card.number.slice(-4), p_brand: brand,
        p_exp_month: parseInt(card.expireMonth, 10), p_exp_year: parseInt(card.expireYear, 10),
      })
      return json({ ok: true, provider: 'IYZICO', card: { last4: data.lastFourDigits ?? card.number.slice(-4), brand } })
    }

    // ── CREATE: eski barındırılan Checkout Form (yedek akış) ───────────────
    if (action === 'create') {
      if (!payload.bookingId) return json({ error: 'bookingId gerekli' }, 400)
      const { data: intent, error } = await userClient.rpc('create_payment_intent', { p_booking_id: payload.bookingId, p_provider: PROVIDER })
      if (error) return json({ error: error.message }, 400)

      if (PROVIDER === 'SIMULATION') {
        return json({
          intentId: intent.id, amount: intent.amount, currency: intent.currency,
          commission: intent.commission_amount, provider: 'SIMULATION',
          checkoutUrl: null, requiresClientConfirm: true,
        })
      }

      const { data: { user } } = await userClient.auth.getUser()
      const { data: profile } = await userClient
        .from('profiles').select('full_name, name, email, phone, iyzico_card_user_key')
        .eq('id', user?.id ?? '').maybeSingle()
      const nm = splitName(profile?.full_name ?? profile?.name)
      const digits = (profile?.phone ?? '').replace(/\D/g, '')
      const buyer = {
        name: nm.name, surname: nm.surname,
        email: profile?.email || user?.email || 'oyuncu@oyna.app',
        identityNumber: '74300864791',
        gsmNumber: digits ? `+90${digits.slice(-10)}` : '+905000000000',
      }
      const callbackUrl = Deno.env.get('IYZICO_CALLBACK_URL') ?? `${supabaseUrl}/functions/v1/payment-webhook`
      const checkout = await iyzicoCheckout(intent, callbackUrl, buyer, profile?.iyzico_card_user_key ?? null)

      return json({
        intentId: intent.id, amount: intent.amount, currency: intent.currency,
        commission: intent.commission_amount, provider: 'IYZICO',
        checkoutUrl: checkout.checkoutUrl,
        requiresClientConfirm: false,
      })
    }

    // ── CONFIRM-SIM: simülasyon onayı ──────────────────────────────────────
    if (action === 'confirm-sim') {
      if (PROVIDER !== 'SIMULATION') return json({ error: 'CONFIRM_DISABLED_IN_LIVE' }, 403)
      if (!payload.intentId) return json({ error: 'intentId gerekli' }, 400)
      const { data: owned, error: selErr } = await userClient.from('payment_intents').select('id, status').eq('id', payload.intentId).maybeSingle()
      if (selErr || !owned) return json({ error: 'NOT_FOUND_OR_FORBIDDEN' }, 403)
      const { data: result, error: applyErr } = await admin.rpc('apply_booking_payment', {
        p_intent_id: payload.intentId, p_provider_ref: `SIM-${Date.now()}`, p_raw: { simulated: true, at: new Date().toISOString() },
      })
      if (applyErr) return json({ error: applyErr.message }, 400)
      return json(result)
    }

    return json({ error: 'UNKNOWN_ACTION' }, 400)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'INTERNAL'
    console.error('[create-payment] hata:', msg)
    return json({ error: msg }, 500)
  }
})
