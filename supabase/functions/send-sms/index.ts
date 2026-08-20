// ═══════════════════════════════════════════════════════════════════════════
// OYNA — send-sms Edge Function (Supabase Auth "Send SMS" kancası)
// ───────────────────────────────────────────────────────────────────────────
// Telefon ANA giriş yöntemidir (kurucu kararı, 17 Ağustos 2026). Supabase,
// kullanıcı kod isteyince BU fonksiyonu çağırır; kodu biz göndeririz.
//
// NEDEN KENDİ SAĞLAYICIMIZ: Supabase'in hazır seçenekleri (Twilio vb.) mesaj
// başına ~5–10 kat pahalı ve Türkiye teslimatı daha zayıf. Netgsm yerli, ucuz
// ve teslimat oranı yüksek.
//
// KANAL KURALI (kurucu kararı):
//   • +90 → SMS (Netgsm)
//   • diğer ülkeler → WhatsApp. WhatsApp Business hesabı açılana dek KAPALI;
//     kapalıyken açıkça hata döneriz, sessizce "gönderildi" DEMEYİZ. İstemci
//     zaten yurt dışı numarada kod istemez (shared/phone.ts), bu sunucu
//     tarafındaki ikinci kapıdır (prensip 6.1: kapı arayüze güvenmez).
//
// GÜVENLİK:
//   • Kanca imzası (standard-webhooks) doğrulanır. Sır yoksa fonksiyon
//     ÇALIŞMAZ — fail-closed. Aksi halde herkes bu uca istek atıp bizim
//     kontörümüzle SMS gönderebilirdi.
//   • KOD LOGLANMAZ. Hiçbir dalda `otp` konsola yazılmaz.
//   • Numara loglarda maskelenir (son 4 hane).
//
// GEREKLİ GİZLİ ANAHTARLAR (supabase secrets set):
//   SEND_SMS_HOOK_SECRET   Supabase Auth → Hooks ekranındaki "v1,whsec_…" değeri
//   NETGSM_USERCODE        Netgsm abone numarası
//   NETGSM_PASSWORD        Netgsm API şifresi
//   NETGSM_MSGHEADER       Onaylı gönderici başlığı (ör. OYNA)
//   WHATSAPP_ENABLED       'true' yapılınca yurt dışı kanalı açılır (bugün kapalı)
//   SMS_SIMULATION         YALNIZ geliştirme: 'true' ise anahtarsız ortamda istek
//                          başarılı sayılır (gerçek SMS yok, kod loglanmaz)
//
// ANAHTARLAR EKSİKSE (kurucu onayı, 20 Ağu 2026): istek REDDEDİLİR (503) —
// fail-closed. "Gönderildi" deyip sessizce yutmak, kullanıcıyı hiç gelmeyecek
// bir kodla bekletmek demektir. Tek istisna, SMS_SIMULATION='true' yazılmış
// geliştirme ortamıdır; üretimde bu değişken tanımlanmaz.
// ═══════════════════════════════════════════════════════════════════════════

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, webhook-id, webhook-timestamp, webhook-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

/** Loglarda numara açık yazılmaz: +90532******67 gibi. */
const maskPhone = (p: string): string => {
  const d = String(p ?? '').replace(/\D/g, '')
  if (d.length < 6) return '***'
  return `+${d.slice(0, 5)}${'*'.repeat(Math.max(d.length - 7, 0))}${d.slice(-2)}`
}

// ─── standard-webhooks imza doğrulaması ──────────────────────────────────────
// Supabase kancayı `webhook-id`, `webhook-timestamp`, `webhook-signature`
// başlıklarıyla imzalar. İmzalanan metin: `${id}.${timestamp}.${body}`.
// Sır "v1,whsec_BASE64" biçiminde saklanır; HMAC anahtarı BASE64'ün çözümüdür.
async function verifySignature(req: Request, rawBody: string, secret: string): Promise<boolean> {
  const id = req.headers.get('webhook-id')
  const ts = req.headers.get('webhook-timestamp')
  const sigHeader = req.headers.get('webhook-signature')
  if (!id || !ts || !sigHeader) return false

  // Tekrar saldırısına karşı 5 dakikalık pencere.
  const age = Math.abs(Date.now() / 1000 - Number(ts))
  if (!Number.isFinite(age) || age > 300) return false

  const base64Key = secret.replace(/^v1,whsec_/, '').replace(/^whsec_/, '')
  let keyBytes: Uint8Array
  try {
    keyBytes = Uint8Array.from(atob(base64Key), (c) => c.charCodeAt(0))
  } catch {
    return false
  }

  const key = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${ts}.${rawBody}`))
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)))

  // Başlık birden çok imza taşıyabilir: "v1,<sig> v1,<sig2>"
  for (const part of sigHeader.split(' ')) {
    const value = part.includes(',') ? part.split(',')[1] : part
    if (timingSafeEqual(value, expected)) return true
  }
  return false
}

/** Sabit süreli karşılaştırma — imza sızdıran zamanlama farkı bırakmaz. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// ─── Netgsm SMS gönderimi ────────────────────────────────────────────────────
async function sendViaNetgsm(phoneE164: string, message: string): Promise<void> {
  const usercode = Deno.env.get('NETGSM_USERCODE')!
  const password = Deno.env.get('NETGSM_PASSWORD')!
  const header = Deno.env.get('NETGSM_MSGHEADER')!
  // Netgsm numarayı ülke kodu ile ama '+' olmadan ister: 905321234567
  const no = phoneE164.replace(/\D/g, '')

  const params = new URLSearchParams({
    usercode, password, gsmno: no, message, msgheader: header, dil: 'TR',
  })

  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 15_000)
  let text: string
  try {
    const res = await fetch('https://api.netgsm.com.tr/sms/send/get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      signal: ctrl.signal,
    })
    text = (await res.text()).trim()
  } finally {
    clearTimeout(t)
  }

  // Netgsm "00 <jobid>" / "01 <jobid>" ile başarı, iki haneli kodla hata döner.
  const code = text.split(/\s+/)[0]
  if (code === '00' || code === '01' || code === '02') return

  // Ham sağlayıcı kodu YALNIZ sunucu logunda kalır; çağırana genel hata döner.
  console.error('[send-sms] Netgsm reddetti:', { code, to: maskPhone(no) })
  throw new Error('SMS_PROVIDER_REJECTED')
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405)

  const hookSecret = Deno.env.get('SEND_SMS_HOOK_SECRET')
  const rawBody = await req.text()

  // FAIL-CLOSED: sır tanımlı değilse hiçbir şey gönderilmez. Sırsız çalışan bir
  // uç, kontörümüzü isteyen herkese açık bir SMS makinesidir.
  if (!hookSecret) {
    console.error('[send-sms] SEND_SMS_HOOK_SECRET tanımlı değil — istek reddedildi.')
    return json({ error: 'HOOK_NOT_CONFIGURED' }, 500)
  }
  if (!(await verifySignature(req, rawBody, hookSecret))) {
    return json({ error: 'INVALID_SIGNATURE' }, 401)
  }

  let payload: { user?: { phone?: string }; sms?: { otp?: string } }
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return json({ error: 'INVALID_BODY' }, 400)
  }

  const phone = String(payload.user?.phone ?? '').replace(/\D/g, '')
  const otp = String(payload.sms?.otp ?? '')
  if (!phone || !otp) return json({ error: 'MISSING_FIELDS' }, 400)

  // ── Kanal seçimi ──────────────────────────────────────────────────────────
  const isTurkey = phone.startsWith('90')
  if (!isTurkey) {
    const whatsappOpen = Deno.env.get('WHATSAPP_ENABLED') === 'true'
    if (!whatsappOpen) {
      // Sessizce başarı DÖNMEYİZ: kullanıcı gelmeyen bir kodu beklemesin.
      console.warn('[send-sms] Yurt dışı numara, WhatsApp kanalı kapalı:', maskPhone(phone))
      return json({ error: 'CHANNEL_UNAVAILABLE' }, 400)
    }
    // WhatsApp kanalı açıldığında gövdesi buraya gelir (Meta Cloud API).
    // Bilerek boş: yarım bir uygulama, kapalı bir kapıdan kötüdür.
    console.error('[send-sms] WHATSAPP_ENABLED=true ama kanal gövdesi henüz yazılmadı.')
    return json({ error: 'CHANNEL_NOT_IMPLEMENTED' }, 501)
  }

  // Mesaj metni: marka + kod + kısa güvenlik uyarısı. Tek parça SMS'te kalsın
  // diye kısa tutuldu (Türkçe karakter kullanılmaz — 160 hane sınırı korunur).
  const message = `OYNA giris kodun: ${otp}. Kodu kimseyle paylasma.`

  const netgsmReady = !!Deno.env.get('NETGSM_USERCODE')
    && !!Deno.env.get('NETGSM_PASSWORD')
    && !!Deno.env.get('NETGSM_MSGHEADER')

  if (!netgsmReady) {
    // FAIL-CLOSED (kurucu onayı, 20 Ağu 2026): anahtarlar yoksa istek
    // REDDEDİLİR — "gönderildi" deyip sessizce yutmak, kullanıcıyı hiç
    // gelmeyecek bir kodla bekletmek demektir. Supabase hata alınca kullanıcı
    // ekranda "kod gönderilemedi" görür ve tekrar deneyebilir.
    // TEK İSTİSNA: SMS_SIMULATION='true' açıkça yazılmış geliştirme ortamı —
    // orada gerçek SMS yok, kod loglanmaz, istek başarı döner.
    if (Deno.env.get('SMS_SIMULATION') === 'true') {
      console.warn('[send-sms] SİMÜLASYON (SMS_SIMULATION=true):', maskPhone(phone))
      return json({ ok: true, simulated: true })
    }
    console.error('[send-sms] Netgsm anahtarları tanımlı değil — istek reddedildi:', maskPhone(phone))
    return json({ error: 'SMS_NOT_CONFIGURED' }, 503)
  }

  try {
    await sendViaNetgsm(`+${phone}`, message)
    return json({ ok: true })
  } catch (e) {
    console.error('[send-sms] gönderim başarısız:', e instanceof Error ? e.message : 'INTERNAL')
    return json({ error: 'SEND_FAILED' }, 502)
  }
})
