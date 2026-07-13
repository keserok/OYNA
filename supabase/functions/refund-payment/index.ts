// ═══════════════════════════════════════════════════════════════════════════
// OYNA — refund-payment Edge Function
// Kademeli iade işlemcisi: process_tiered_refund → iade OYNA İADE KREDİSİNE.
//
// POLİTİKA (cüzdan-öncelikli strateji kararı): iadeler yalnız uygulama içi
// iade kredisine döner — karta iade YAPILMAZ (PSP maliyeti + para platformda
// kalır). Eski karta-iade dalı kaldırıldı; zaten process_tiered_refund kredi
// yazdığından o dal ÇİFTE İADE üretiyordu. İstisnai karta iade gerekirse
// admin bankadan manuel yapar ve admin panelde işaretler.
//
// Yetki: PAYMENT_EDGE_SECRET header (sistem/cron/admin çağrısı; son kullanıcı değil).
// ═══════════════════════════════════════════════════════════════════════════
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-payment-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405)

  const secret = req.headers.get('x-payment-secret')
  if (!secret || secret !== Deno.env.get('PAYMENT_EDGE_SECRET')) return json({ error: 'FORBIDDEN' }, 403)

  let payload: { intentId?: string; hoursToMatch?: number; policy?: string }
  try { payload = await req.json() } catch { return json({ error: 'INVALID_BODY' }, 400) }
  if (!payload.intentId) return json({ error: 'intentId gerekli' }, 400)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

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

    // Kademeli iade → OYNA iade kredisi (service_role → yetki kapısını geçer)
    const { data, error } = await admin.rpc('process_tiered_refund', {
      p_intent_id: payload.intentId,
      p_hours_to_match: hours,
      ...(payload.policy ? { p_policy: payload.policy } : {}),
    })
    if (error) return json({ error: error.message }, 400)
    return json({ ...data, refund_target: 'OYNA_CREDIT' })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'INTERNAL' }, 500)
  }
})
