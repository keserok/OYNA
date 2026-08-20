// ═══════════════════════════════════════════════════════════════════════════
// OYNA — refund-payment Edge Function
//
// İKİ GÖREV (16 Ağu 2026 — karta iade kararı):
//
//   1) action: 'process-queue' → KARTA İADE KUYRUĞU İŞLEMCİSİ (cron, */5).
//      card_refund_queue'daki PENDING satırları iyzico'ya taşır:
//        · SIMULATION → anında DONE (gerçek para yok).
//        · IYZICO     → /payment/refund (paymentTransactionId intent.raw'dan;
//                       3DS callback'i saklar). Başarısızlıkta attempts++;
//                       3 denemede geçmeyen satır FAILED durur (kural 7.5 —
//                       zehirli iş insana kalır, sonsuz tekrar yok).
//      Auth: Bearer WEBHOOK_SECRET (süpürücüyle aynı desen — cron vault'tan okur).
//
//   2) action verilmezse → ESKİ DAVRANIŞ (kademeli iade tetikleyici):
//      process_tiered_refund çağrılır; iade hedefini artık RPC'nin kendisi
//      seçer (kart → kuyruk, eski cüzdan emaneti → iade kredisi).
//      Auth: x-payment-secret (PAYMENT_EDGE_SECRET) — sistem/admin çağrısı.
// ═══════════════════════════════════════════════════════════════════════════
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { resolvePaymentProvider } from '../_shared/paymentProvider.ts'

// Sağlayıcı: panel (app_config) daraltır, secret genişletmez. Kural ve gerekçe
// _shared/paymentProvider.ts'te.

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-payment-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

// iyzico IYZWSv2 imzası (create-payment ile aynı şema)
async function hmacSha256Hex(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data))
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('')
}

async function iyzicoPost(uriPath: string, bodyObj: unknown): Promise<any> {
  const apiKey    = Deno.env.get('IYZICO_API_KEY')!
  const secretKey = Deno.env.get('IYZICO_SECRET_KEY')!
  const baseUrl   = Deno.env.get('IYZICO_BASE_URL') ?? 'https://api.iyzipay.com'
  const bodyStr   = JSON.stringify(bodyObj)
  const randomKey = `${Date.now()}${Math.floor(Math.random() * 1_000_000)}`
  const signature = await hmacSha256Hex(secretKey, randomKey + uriPath + bodyStr)
  const authHeader = 'IYZWSv2 ' + btoa(`apiKey:${apiKey}&randomKey:${randomKey}&signature:${signature}`)
  const res = await fetch(baseUrl + uriPath, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': authHeader, 'x-iyzi-rnd': randomKey },
    body: bodyStr,
  })
  return await res.json()
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405)

  let payload: { action?: string; intentId?: string; hoursToMatch?: number; policy?: string }
  try { payload = await req.json() } catch { return json({ error: 'INVALID_BODY' }, 400) }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const PROVIDER = await resolvePaymentProvider(admin)

  // ── 1) KUYRUK İŞLEMCİSİ ────────────────────────────────────────────────────
  if (payload.action === 'process-queue') {
    // Auth: süpürücüyle aynı desen — cron Bearer WEBHOOK_SECRET gönderir.
    const authHeader = req.headers.get('Authorization')
    const webhookSecret = Deno.env.get('WEBHOOK_SECRET')
    if (!webhookSecret) {
      console.error('[refund-payment] WEBHOOK_SECRET tanımlı değil!')
      return json({ error: 'MISCONFIGURED' }, 500)
    }
    if (authHeader !== `Bearer ${webhookSecret}`) return json({ error: 'FORBIDDEN' }, 403)

    const { data: rows, error: qErr } = await admin
      .from('card_refund_queue')
      .select('id, intent_id, amount, attempts')
      .eq('status', 'PENDING')
      .lt('attempts', 3)
      .order('created_at', { ascending: true })
      .limit(20)
    if (qErr) return json({ error: qErr.message }, 500)

    let done = 0, failed = 0, retried = 0
    for (const row of rows ?? []) {
      try {
        const { data: intent } = await admin
          .from('payment_intents').select('id, raw, provider_ref').eq('id', row.intent_id).maybeSingle()

        // PARA KAPISI (19 Ağu 2026): "sağlayıcı SIMULATION" tek başına satırı
        // DONE yazmaya YETMEZ. Sağlayıcı artık env yoksa app_config'ten de
        // gelebiliyor; canlıya geçilirken `simulation_counts_as_live` kapatılmayı
        // unutulursa GERÇEK ÇEKİLMİŞ bir tahsilat "iade edildi" diye işaretlenip
        // müşterinin parası bizde kalırdı. Sahte iade YALNIZ tahsilatın kendisi
        // de sahteyse (apply_card_payment'ın yazdığı raw.simulated) yapılır.
        const sahteTahsilat = intent?.raw?.simulated === true
        if (PROVIDER === 'SIMULATION' && sahteTahsilat) {
          await admin.from('card_refund_queue').update({
            status: 'DONE', provider_ref: `SIM-REFUND-${Date.now()}`, processed_at: new Date().toISOString(),
          }).eq('id', row.id)
          done++
          continue
        }
        if (PROVIDER === 'SIMULATION') {
          // Gerçek para çekilmiş ama sağlayıcı simülasyonda: sessizce "iade edildi"
          // demek yerine satırı insana bırak (kural 7.5).
          throw new Error('GERCEK_TAHSILAT_SIM_MODDA: bu tahsilat gerçek çekildi, sağlayıcı simülasyonda — elle iade gerekir')
        }
        if (PROVIDER !== 'IYZICO') throw new Error(`PROVIDER_${PROVIDER}: canlı iade için sağlayıcı IYZICO olmalı`)

        const txId = intent?.raw?.itemTransactions?.[0]?.paymentTransactionId ?? null
        if (!txId) throw new Error('NO_TX_ID: paymentTransactionId yok — eski kayıt, elle iade gerekir')

        const res = await iyzicoPost('/payment/refund', {
          locale: 'tr',
          conversationId: row.id,
          paymentTransactionId: txId,
          price: Number(row.amount).toFixed(2),
          currency: 'TRY',
          ip: '85.34.78.112',
        })
        if (res?.status !== 'success') {
          throw new Error(res?.errorMessage || res?.errorCode || 'IYZICO_REFUND_FAILED')
        }
        await admin.from('card_refund_queue').update({
          status: 'DONE', provider_ref: res.paymentTransactionId ?? txId,
          processed_at: new Date().toISOString(),
        }).eq('id', row.id)
        done++
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        const attempts = (row.attempts ?? 0) + 1
        const statusNow = attempts >= 3 ? 'FAILED' : 'PENDING'
        await admin.from('card_refund_queue').update({
          attempts, last_error: msg.slice(0, 500), status: statusNow,
          ...(statusNow === 'FAILED' ? { processed_at: new Date().toISOString() } : {}),
        }).eq('id', row.id)
        if (statusNow === 'FAILED') { failed++; console.error(`[refund-payment] kuyruk FAILED (${row.id}): ${msg}`) }
        else retried++
      }
    }
    return json({ ok: true, processed: done, retried, failed, remaining_hint: (rows?.length ?? 0) === 20 })
  }

  // ── 2) ESKİ DAVRANIŞ: tekil kademeli iade tetikleyici ──────────────────────
  const secret = req.headers.get('x-payment-secret')
  if (!secret || secret !== Deno.env.get('PAYMENT_EDGE_SECRET')) return json({ error: 'FORBIDDEN' }, 403)
  if (!payload.intentId) return json({ error: 'intentId gerekli' }, 400)

  try {
    const { data: intent, error: selErr } = await admin
      .from('payment_intents').select('id, status, amount, match_id, booking_id').eq('id', payload.intentId).maybeSingle()
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

    // Kademeli iade — hedefi RPC seçer: kart → karta iade kuyruğu, eski cüzdan
    // emaneti → iade kredisi (service_role → yetki kapısını geçer).
    const { data, error } = await admin.rpc('process_tiered_refund', {
      p_intent_id: payload.intentId,
      p_hours_to_match: hours,
      ...(payload.policy ? { p_policy: payload.policy } : {}),
    })
    if (error) return json({ error: error.message }, 400)
    return json({ ...data, refund_target: 'CARD_OR_LEGACY_CREDIT' })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'INTERNAL' }, 500)
  }
})
