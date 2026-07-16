// ═══════════════════════════════════════════════════════════════
// OYNA — sweep-stale-payments Edge Function
//
// [S1.2 / C6 / S19] ASKIDA ÖDEME SÜPÜRÜCÜSÜ — sunucu tarafı, iyzico MUTABAKATLI.
//
// Kullanıcı 3DS banka penceresini yarıda bırakırsa payment_intents satırı
// PENDING'te asılı kalır. Bu fonksiyon saatlik cron ile çağrılır ve HER askıda
// niyet için iyzico'ya "bu para GERÇEKTEN çekildi mi?" diye sorar (mutabakat):
//   • ÇEKİLMİŞ  → apply_card_payment (heal → PAID). Para kaybının TERSİ durumu:
//                 iyzico tahsil etti ama callback APPLY_ERROR'a düştü; burada
//                 kullanıcı bileti/bakiyesi tamamlanır. (idempotent — PAID no-op.)
//   • ÇEKİLMEMİŞ→ mark_intent_failed (yalnız PENDING→FAILED; muhasebe temiz).
//   • BELİRSİZ  → DOKUNMA (sonraki tura bırak). KÖR FAILED YASAK: iyzico kesin
//                 "yok" demeden hiçbir niyet FAILED yazılmaz (çift-çekim/para
//                 kaybı önlenir).
//
// GÜVENLİK KATMANLARI:
//   • Kill-switch: list_stale_payment_intents 'sweeper_enabled' KAPALI iken BOŞ
//     döner → cron tetiklense bile no-op. (SQL değişmezi.)
//   • Üç zaman penceresi: ekran 3dk < 3DS 5dk < süpürücü ≥15dk (DB'de GREATEST
//     ile taban zorlanır) → aktif bir 3DS'e asla çarpmaz.
//   • Para hareketi YENİDEN İCAT EDİLMEZ: test edilmiş apply_card_payment /
//     mark_intent_failed çağrılır (auto-cancel-matches felsefesi).
//
// Auth: send-push / auto-cancel-matches ile aynı — yalnız Bearer WEBHOOK_SECRET.
// Zamanlama: supabase/migrations/20260726000001_sweep_stale_payments_cron.sql
// Kart verisi bu fonksiyona HİÇ gelmez; yalnız intent id + iyzico durum sorgusu.
// ═══════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const PROVIDER = Deno.env.get('PAYMENT_PROVIDER') ?? 'SIMULATION'

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
)

// ── iyzico IYZWSv2 imzalı POST (create-payment ile aynı; retry YOK) ──────────
// Sorgu (retrieve) idempotent OKUMADIR ama yine de retry etmiyoruz: ağ hatası =
// BELİRSİZ = dokunma. 20 sn timeout; hata fırlarsa çağıran skip'e düşer.
const IYZICO_TIMEOUT_MS = 20_000

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

// iyzico ödeme sorgu sonucunu üç sınıfa ayır. Yanlış sınıflama = para riski,
// bu yüzden KESİNLİK gerektiren yalnız iki uç (CHARGED/NOT_CHARGED); gerisi SKIP.
type Verdict = 'CHARGED' | 'NOT_CHARGED' | 'AMBIGUOUS'

function classifyDetail(d: any): { verdict: Verdict; paymentId: string | null; note: string } {
  if (!d || typeof d !== 'object') return { verdict: 'AMBIGUOUS', paymentId: null, note: 'no-response' }
  const status = String(d.status ?? '')
  const paymentStatus = String(d.paymentStatus ?? '')
  const paymentId = d.paymentId ? String(d.paymentId) : null

  // KESİN ÇEKİLDİ: iyzico başarı + ödeme durumu SUCCESS + paymentId var.
  if (status === 'success' && paymentStatus === 'SUCCESS' && paymentId) {
    return { verdict: 'CHARGED', paymentId, note: 'paymentStatus=SUCCESS' }
  }
  // KESİN ÇEKİLMEDİ: (a) bu conversationId için ödeme YOK (status=failure), veya
  // (b) 3DS yarım kalmış/başarısız durumları (15dk sonrası kesin terk).
  const NOT_CHARGED_STATES = ['FAILURE', 'BANK_FAIL', 'INIT_THREEDS', 'CALLBACK_THREEDS', 'BKM_POS_SELECTED', 'INIT_APM']
  if (status === 'failure') {
    return { verdict: 'NOT_CHARGED', paymentId, note: `failure:${d.errorCode ?? ''}` }
  }
  if (status === 'success' && NOT_CHARGED_STATES.includes(paymentStatus)) {
    return { verdict: 'NOT_CHARGED', paymentId, note: `paymentStatus=${paymentStatus}` }
  }
  // Geri kalan her şey (PENDING_CREDIT, bilinmeyen durum, eksik alan) = BELİRSİZ.
  return { verdict: 'AMBIGUOUS', paymentId, note: `status=${status} paymentStatus=${paymentStatus}` }
}

// iyzico'da bu intent (conversationId) için tamamlanmış ödeme var mı? Retrieve
// endpoint'i conversationId ile sorgular. Ağ/hata → fırlatır (çağıran SKIP eder).
async function reconcile(intentId: string): Promise<{ verdict: Verdict; paymentId: string | null; note: string }> {
  const data = await iyzicoPost('/payment/detail', {
    locale: 'tr',
    conversationId: intentId,
    paymentConversationId: intentId,
  })
  // Ham yanıtı SANDBOX teyidi için özetle logla (kart/PII yok — yalnız durum).
  console.log('[sweep] detail', JSON.stringify({
    intentId, status: data?.status, paymentStatus: data?.paymentStatus,
    errorCode: data?.errorCode, paymentId: data?.paymentId ? 'var' : 'yok',
  }))
  return classifyDetail(data)
}

Deno.serve(async (req: Request) => {
  // Auth: auto-cancel-matches ile aynı desen — yalnız Bearer WEBHOOK_SECRET.
  const authHeader = req.headers.get('Authorization')
  const webhookSecret = Deno.env.get('WEBHOOK_SECRET')
  if (!webhookSecret) {
    console.error('[sweep-stale-payments] WEBHOOK_SECRET tanımlı değil!')
    return new Response('Server misconfigured', { status: 500 })
  }
  if (authHeader !== `Bearer ${webhookSecret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    // Provider modu SSOT: app_config 'payment_provider' (create_match_preauth ile
    // aynı kaynak); env yalnız yedek. GÜVENLİK: env default'u 'SIMULATION' — bu
    // tuzağa düşüp gerçek IYZICO modunda kör fail YAPMAMAK için SIM kısayolu
    // YALNIZ config KESİN 'SIMULATION' derse açılır; belirsizlikte iyzico'ya sorulur.
    let providerMode = PROVIDER
    try {
      const { data: cfg } = await admin.rpc('get_config_text', { p_key: 'payment_provider', p_default: null })
      if (cfg) providerMode = String(cfg)
    } catch { /* config okunamadı → env'e düş (aşağıda IYZICO varsayımına biter) */ }
    const isSimulation = String(providerMode).toUpperCase() === 'SIMULATION'

    // Aday listesi — kill-switch KAPALI ise boş döner (SQL katmanında).
    const { data: candidates, error: listErr } = await admin.rpc('list_stale_payment_intents', {
      p_older_than_minutes: null, // config'teki sweeper_stale_minutes (taban 15dk)
    })
    if (listErr) {
      console.error('[sweep-stale-payments] liste hatası:', listErr.message)
      return new Response('List failed', { status: 500 })
    }

    const rows = (candidates ?? []) as Array<{
      intent_id: string; amount: number; flow: string; age_minutes: number
      auth_charged: boolean; auth_payment_id: string | null
    }>
    let healed = 0, failed = 0, skipped = 0

    for (const row of rows) {
      const intentId = row.intent_id
      try {
        // ── KURŞUNGEÇİRMEZ HEAL: iyzico-3ds-callback, auth 'success' (para KESİN
        //    çekildi) sonrası apply hata verdiyse bu işareti yazmıştır. iyzico'ya
        //    SORMADAN heal — çekim iyzico'nun kendi auth yanıtıyla kanıtlı. ──────
        if (row.auth_charged === true) {
          const { error } = await admin.rpc('apply_card_payment', {
            p_intent_id: intentId,
            p_provider_ref: row.auth_payment_id,
            p_raw: { sweeper_reconciled: true, source: 'sweep-stale-payments', reconciled_note: 'auth_charged_marker' },
          })
          if (error) { console.error(`[sweep] heal(marker) hata (${intentId}):`, error.message); skipped++ }
          else { console.log(`[sweep] HEAL(marker) → PAID (${intentId})`); healed++ }
          continue
        }

        // ── SIMULATION: iyzico yok → gerçek para yok. Terk edilmiş sim niyeti
        //    güvenle kapatılır (mutabakat gerektirmez). SSOT config ile teyitli. ─
        if (isSimulation) {
          await admin.rpc('mark_intent_failed', { p_intent_id: intentId, p_reason: 'SWEEP_SIM_STALE' })
          failed++
          continue
        }

        // ── iyzico MUTABAKATI ─────────────────────────────────────────────────
        let verdict: Verdict, paymentId: string | null, note: string
        try {
          ({ verdict, paymentId, note } = await reconcile(intentId))
        } catch (e) {
          // Ağ/timeout = BELİRSİZ → dokunma, sonraki tur (kör FAILED yasak).
          console.warn(`[sweep] mutabakat başarısız (${intentId}) — atlanıyor:`, String(e))
          skipped++
          continue
        }

        if (verdict === 'CHARGED') {
          // Para iyzico'da çekilmiş — kullanıcının bileti/bakiyesini tamamla.
          const { error } = await admin.rpc('apply_card_payment', {
            p_intent_id: intentId,
            p_provider_ref: paymentId,
            p_raw: { sweeper_reconciled: true, source: 'sweep-stale-payments', reconciled_note: note },
          })
          if (error) {
            // Heal yazılamadı (ör. slot durumu değişti, RPC iç kuralı) → dokunma,
            // FAILED YAZMA (para çekilmiş!). Sonraki tur/insan bakar.
            console.error(`[sweep] heal apply_card_payment hata (${intentId}):`, error.message)
            skipped++
          } else {
            console.log(`[sweep] HEAL → PAID (${intentId}) ref=${paymentId}`)
            healed++
          }
        } else if (verdict === 'NOT_CHARGED') {
          // iyzico'da tamamlanmış ödeme YOK — niyeti güvenle kapat.
          const { error } = await admin.rpc('mark_intent_failed', {
            p_intent_id: intentId, p_reason: `SWEEP_NO_CHARGE: ${note}`,
          })
          if (error) { console.error(`[sweep] fail RPC hata (${intentId}):`, error.message); skipped++ }
          else { console.log(`[sweep] FAIL (çekilmemiş) (${intentId}) ${note}`); failed++ }
        } else {
          // BELİRSİZ → dokunma.
          console.log(`[sweep] BELİRSİZ → atlandı (${intentId}) ${note}`)
          skipped++
        }
      } catch (e) {
        // Tek bir intent'in beklenmedik hatası tüm turu düşürmesin.
        console.error(`[sweep] intent işlenirken hata (${intentId}):`, e instanceof Error ? e.message : e)
        skipped++
      }
    }

    const summary = { candidates: rows.length, healed, failed, skipped }
    console.log('[sweep-stale-payments] özet:', JSON.stringify(summary))
    return new Response(JSON.stringify(summary), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('[sweep-stale-payments] Kritik hata:', error)
    return new Response('Internal Error', { status: 500 })
  }
})
