// ═══════════════════════════════════════════════════════════════
// OYNA — create-payment Edge Function
// Sağlayıcı-bağımsız kapora (deposit) ödeme başlatma + SIMULATION onayı.
//
// Akış:
//   action 'create'      → oyuncunun rezervasyonu için payment_intent oluşturur
//                          (create_payment_intent RPC, kullanıcının JWT'si ile).
//                          Gerçek sağlayıcıda checkout URL/token döner.
//   action 'confirm-sim' → YALNIZ SIMULATION modunda: ödemeyi onaylar
//                          (apply_booking_payment, service_role ile).
//                          Gerçek parada bu yol KAPALIDIR; onay her zaman
//                          payment-webhook üzerinden sağlayıcıdan gelir.
//
// Gerçek sağlayıcı (iyzico/PayTR) eklemek için:
//   - PAYMENT_PROVIDER env = 'IYZICO' | 'PAYTR'
//   - createProviderCheckout() içine sağlayıcı çağrısını ekle (anahtarlar env'den)
//   - Sağlayıcı ödemeyi payment-webhook'a bildirir → apply_booking_payment çalışır
//
// Kurulum: supabase functions deploy create-payment
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

// ── Sağlayıcı adaptörü ───────────────────────────────────────────
// Gerçek sağlayıcıda checkout oturumu açıp token/URL döndürür.
// SIMULATION: harici çağrı yok; istemci confirm-sim ile onaylar.
async function createProviderCheckout(intent: { id: string; amount: number; currency: string }) {
  if (PROVIDER === 'SIMULATION') {
    return { provider: 'SIMULATION', checkoutUrl: null as string | null, token: intent.id }
  }
  // ── iyzico / PayTR entegrasyon noktası ──
  // Örn (iyzico Checkout Form): apiKey/secretKey env'den; /payment/iyzipos/checkoutform/initialize
  // çağrılır, dönen paymentPageUrl checkoutUrl olarak döndürülür.
  // Şimdilik yapılandırılmamışsa açık hata ver:
  throw new Error(`PROVIDER_NOT_CONFIGURED: ${PROVIDER} adaptörü henüz bağlanmadı. PAYMENT_PROVIDER ve anahtarları ayarlayın.`)
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'UNAUTHORIZED' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // Kullanıcı kimliğiyle çalışan client (auth.uid() RPC'lerde doğru çalışsın)
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })

  let payload: { action?: string; bookingId?: string; intentId?: string }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'INVALID_BODY' }, 400)
  }

  const action = payload.action ?? 'create'

  try {
    if (action === 'create') {
      if (!payload.bookingId) return json({ error: 'bookingId gerekli' }, 400)

      // Niyet oluştur (kullanıcı JWT'si ile → auth.uid() çalışır, sahiplik kontrolü RPC'de)
      const { data: intent, error } = await userClient.rpc('create_payment_intent', {
        p_booking_id: payload.bookingId,
        p_provider: PROVIDER,
      })
      if (error) return json({ error: error.message }, 400)

      const checkout = await createProviderCheckout(intent)
      return json({
        intentId: intent.id,
        amount: intent.amount,
        currency: intent.currency,
        commission: intent.commission_amount,
        provider: checkout.provider,
        checkoutUrl: checkout.checkoutUrl,
        // SIMULATION'da istemci confirm-sim ile tamamlar
        requiresClientConfirm: PROVIDER === 'SIMULATION',
      })
    }

    if (action === 'confirm-sim') {
      // GÜVENLİK: yalnız SIMULATION modunda; gerçek parada onay webhook'tan gelir
      if (PROVIDER !== 'SIMULATION') return json({ error: 'CONFIRM_DISABLED_IN_LIVE' }, 403)
      if (!payload.intentId) return json({ error: 'intentId gerekli' }, 400)

      // Niyetin gerçekten bu kullanıcıya ait olduğunu doğrula (RLS ile)
      const { data: owned, error: selErr } = await userClient
        .from('payment_intents')
        .select('id, status')
        .eq('id', payload.intentId)
        .maybeSingle()
      if (selErr || !owned) return json({ error: 'NOT_FOUND_OR_FORBIDDEN' }, 403)

      // Ödemeyi uygula (service_role — para mantığı sunucuda, idempotent)
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
