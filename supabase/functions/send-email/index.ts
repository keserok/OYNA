// ═══════════════════════════════════════════════════════════════════════════
// OYNA — send-email Edge Function (FAZ 7.2 · Bildirim · Resend)
// İşlemsel e-posta gönderimi (doğrulama onayı, ödeme/payout bilgilendirme,
// hesap güvenliği). Sağlayıcı: Resend (https://resend.com).
//
// AKTİVASYON (Supabase → Edge Functions → Secrets):
//   RESEND_API_KEY      = re_xxx                 (yoksa SİMÜLASYON: gerçek mail gitmez)
//   EMAIL_FROM          = OYNA <no-reply@oyna.app>
//   EMAIL_EDGE_SECRET   = <rastgele>             (sistem/cron çağrısı yetkisi)
//
// Yetki: x-email-secret header === EMAIL_EDGE_SECRET (son kullanıcı çağıramaz).
// Deploy: supabase functions deploy send-email
// ═══════════════════════════════════════════════════════════════════════════

// CORS: sistem-içi çağrı (secret header). ALLOWED_ORIGIN env'i ile kısıtlanabilir; varsayılan '*'.
const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-email-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

interface EmailPayload {
  to?: string | string[]
  subject?: string
  html?: string
  text?: string
  replyTo?: string
}

async function sendViaResend(p: EmailPayload, apiKey: string, from: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: Array.isArray(p.to) ? p.to : [p.to],
      subject: p.subject,
      html: p.html,
      text: p.text,
      reply_to: p.replyTo,
    }),
  })
  const data = await res.json().catch(() => ({})) as { id?: string; message?: string }
  if (!res.ok) throw new Error(`resend: ${data.message ?? res.status}`)
  return data
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405)

  const secret = req.headers.get('x-email-secret')
  if (!secret || secret !== Deno.env.get('EMAIL_EDGE_SECRET')) return json({ error: 'FORBIDDEN' }, 403)

  let p: EmailPayload
  try { p = await req.json() } catch { return json({ error: 'INVALID_BODY' }, 400) }
  if (!p.to || !p.subject || (!p.html && !p.text)) return json({ error: 'to, subject ve html/text gerekli' }, 400)

  const apiKey = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('EMAIL_FROM') ?? 'OYNA <no-reply@oyna.app>'

  // Anahtar yoksa SİMÜLASYON: akış bozulmaz, gerçek e-posta gitmez (go-live öncesi).
  if (!apiKey) {
    console.log('[send-email] SIMULATION (RESEND_API_KEY yok):', { to: p.to, subject: p.subject })
    return json({ simulated: true, to: p.to, subject: p.subject })
  }

  try {
    const data = await sendViaResend(p, apiKey, from)
    return json({ sent: true, id: data.id })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'INTERNAL' }, 500)
  }
})
