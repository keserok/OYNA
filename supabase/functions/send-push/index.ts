// ═══════════════════════════════════════════════════════════════
// OYNA APP — Supabase Edge Function: send-push
// Firebase bağımsız push gönderici.
// Apple APNs ve Google FCM HTTP v1 API doğrudan kullanır.
//
// Kurulum:
//   supabase functions deploy send-push
//
// Supabase Dashboard → Database → Webhooks:
//   Table: notifications
//   Events: INSERT
//   URL: https://YOUR_PROJECT.supabase.co/functions/v1/send-push
// ═══════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } }
)

// ─── Tip Tanımları ────────────────────────────────────────────────
interface WebhookPayload {
  type: 'INSERT'
  table: string
  record: NotificationRecord
  schema: string
}

interface NotificationRecord {
  id: string
  user_id: string
  title: string
  body: string
  type_key: string
  match_id?: string
  team_id?: string
  deep_link?: string
  push_sent: boolean
  action_required: boolean
}

interface UserProfile {
  push_token: string | null
  push_token_platform: string | null
  notification_preferences: Record<string, { enabled: boolean; mandatory: boolean }>
}

// ─── Ana Handler ─────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  // Sadece Supabase webhook'larından gelen istekleri kabul et
  const authHeader = req.headers.get('Authorization')
  const webhookSecret = Deno.env.get('WEBHOOK_SECRET')
  if (!webhookSecret) {
    console.error('[send-push] WEBHOOK_SECRET env variable is not set!')
    return new Response('Server misconfigured', { status: 500 })
  }
  if (authHeader !== `Bearer ${webhookSecret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const payload: WebhookPayload = await req.json()

    // Sadece notifications tablosu INSERT'lerini işle
    if (payload.type !== 'INSERT' || payload.table !== 'notifications') {
      return new Response('Ignored', { status: 200 })
    }

    const notification = payload.record

    // Zaten push gönderilmişse tekrar gönderme
    if (notification.push_sent) {
      return new Response('Already sent', { status: 200 })
    }

    // 1. Kullanıcının token ve tercihlerini çek
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('push_token, push_token_platform, notification_preferences')
      .eq('id', notification.user_id)
      .single()

    if (profileError || !profile) {
      await markPushFailed(notification.id, 'PROFILE_NOT_FOUND', profileError?.message)
      return new Response('Profile not found', { status: 200 })
    }

    const typedProfile = profile as UserProfile

    // 2. Push token yoksa gönderme
    if (!typedProfile.push_token) {
      await markPushFailed(notification.id, 'NO_PUSH_TOKEN', 'User has no push token')
      return new Response('No push token', { status: 200 })
    }

    // 2.5 Bildirim kapısı (app_config) — tek master simülasyon anahtarı
    //     push_live_enabled=false iken uygulama-içi bildirim zaten oluştu;
    //     telefona GERÇEK push GİTMEZ. (Lansmanda panelden tek anahtarla açılır.)
    const gate = await loadGate()
    if (!gate.pushLive) {
      await logPushStatus(notification, typedProfile, 'simulated')
      return new Response('Simulation mode (push_live_enabled=false)', { status: 200 })
    }

    // 3. Kullanıcı bu bildirim türünü kapatmış mı? (Zorunlu olanlar geçemez)
    const prefs = typedProfile.notification_preferences || {}
    const prefForType = prefs[notification.type_key]

    if (prefForType && !prefForType.enabled && !prefForType.mandatory) {
      await supabaseAdmin
        .from('push_log')
        .insert({
          notification_id: notification.id,
          user_id: notification.user_id,
          push_token: typedProfile.push_token,
          platform: typedProfile.push_token_platform || 'unknown',
          status: 'opted_out',
        })
      return new Response('User opted out', { status: 200 })
    }

    // 3.5 Zorunlu OLMAYAN bildirimler için sessiz saat + saatlik hız limiti.
    //     Zorunlu türler (maç iptali, davet, gk/hakem kararı vb.) bu kapılardan MUAF.
    const isMandatory = await isTypeMandatory(notification.type_key, prefForType)
    if (!isMandatory && inSilentHours(gate)) {
      await logPushStatus(notification, typedProfile, 'deferred')
      return new Response('Silent hours', { status: 200 })
    }
    if (!isMandatory) {
      const since = new Date(Date.now() - 3600_000).toISOString()
      const { count } = await supabaseAdmin
        .from('push_log')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', notification.user_id)
        .eq('status', 'sent')
        .gte('created_at', since)
      if ((count ?? 0) >= gate.ratePerHour) {
        await logPushStatus(notification, typedProfile, 'rate_limited')
        return new Response('Rate limited', { status: 200 })
      }
    }

    // 4. Push gönder
    const platform = typedProfile.push_token_platform
    let result: { success: boolean; messageId?: string; error?: string }

    if (platform === 'ios') {
      result = await sendApns(typedProfile.push_token, notification)
    } else if (platform === 'android') {
      result = await sendFcmHttpV1(typedProfile.push_token, notification)
    } else {
      result = { success: false, error: `Unknown platform: ${platform}` }
    }

    // 5. Sonucu kaydet
    if (result.success) {
      await supabaseAdmin.from('notifications').update({
        push_sent: true,
        push_sent_at: new Date().toISOString(),
      }).eq('id', notification.id)

      await supabaseAdmin.from('push_log').insert({
        notification_id: notification.id,
        user_id: notification.user_id,
        push_token: typedProfile.push_token,
        platform: platform || 'unknown',
        status: 'sent',
        apns_message_id: platform === 'ios' ? result.messageId : null,
        fcm_message_id: platform === 'android' ? result.messageId : null,
      })
    } else {
      await markPushFailed(notification.id, 'SEND_FAILED', result.error, typedProfile)
    }

    return new Response(JSON.stringify({ success: result.success }), {
      headers: { 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('[send-push] Kritik hata:', error)
    return new Response('Internal Error', { status: 500 })
  }
})

// ─── Apple APNs Gönderici ─────────────────────────────────────────
async function sendApns(
  token: string,
  notification: NotificationRecord,
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const keyId = Deno.env.get('APNS_KEY_ID')!
  const teamId = Deno.env.get('APNS_TEAM_ID')!
  const privateKey = Deno.env.get('APNS_PRIVATE_KEY')!
  const bundleId = Deno.env.get('APNS_BUNDLE_ID') || 'com.oyna.app'
  const isProduction = Deno.env.get('APNS_PRODUCTION') === 'true'

  try {
    // JWT Token oluştur
    const jwtToken = await createApnsJwt(keyId, teamId, privateKey)

    const host = isProduction
      ? 'api.push.apple.com'
      : 'api.sandbox.push.apple.com'

    const payload = {
      aps: {
        alert: { title: notification.title, body: notification.body },
        sound: 'default',
        badge: 1,
        'content-available': 1,
        'mutable-content': 1,
      },
      deep_link: notification.deep_link,
      type_key: notification.type_key,
      notification_id: notification.id,
      match_id: notification.match_id,
    }

    const response = await fetch(`https://${host}/3/device/${token}`, {
      method: 'POST',
      headers: {
        'authorization': `bearer ${jwtToken}`,
        'apns-topic': bundleId,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (response.status === 200) {
      const messageId = response.headers.get('apns-id') || undefined
      return { success: true, messageId }
    } else {
      const errorBody = await response.json().catch(() => ({}))
      return { success: false, error: `APNs ${response.status}: ${JSON.stringify(errorBody)}` }
    }
  } catch (error) {
    return { success: false, error: `APNs exception: ${error}` }
  }
}

async function createApnsJwt(keyId: string, teamId: string, privateKeyPem: string): Promise<string> {
  // ES256 JWT oluşturma (Deno crypto API)
  const header = { alg: 'ES256', kid: keyId }
  const claims = { iss: teamId, iat: Math.floor(Date.now() / 1000) }

  const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const claimsB64 = btoa(JSON.stringify(claims)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const signingInput = `${headerB64}.${claimsB64}`

  // PEM key'i import et
  const keyData = privateKeyPem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '')
  const keyBuffer = Uint8Array.from(atob(keyData), c => c.charCodeAt(0))

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', keyBuffer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, ['sign']
  )

  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    cryptoKey,
    new TextEncoder().encode(signingInput),
  )

  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  return `${signingInput}.${signatureB64}`
}

// ─── Google FCM HTTP v1 API Gönderici ────────────────────────────
// Firebase SDK'sı KULLANILMIYOR — Doğrudan REST API çağrısı
async function sendFcmHttpV1(
  token: string,
  notification: NotificationRecord,
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const serviceAccountJson = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_KEY')!
  const projectId = Deno.env.get('GOOGLE_PROJECT_ID')!

  try {
    // Service Account ile OAuth2 token al
    const accessToken = await getGoogleAccessToken(serviceAccountJson)

    const message = {
      message: {
        token,
        notification: {
          title: notification.title,
          body: notification.body,
        },
        data: {
          deep_link: notification.deep_link || '',
          type_key: notification.type_key,
          notification_id: notification.id,
          match_id: notification.match_id || '',
        },
        android: {
          priority: 'high',
          notification: {
            sound: 'default',
            channel_id: 'oyna_main',
          },
        },
      },
    }

    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      },
    )

    const responseData = await response.json()

    if (response.ok) {
      return { success: true, messageId: responseData.name }
    } else {
      return { success: false, error: `FCM ${response.status}: ${JSON.stringify(responseData)}` }
    }
  } catch (error) {
    return { success: false, error: `FCM exception: ${error}` }
  }
}

async function getGoogleAccessToken(serviceAccountJson: string): Promise<string> {
  const serviceAccount = JSON.parse(serviceAccountJson)
  const scopes = ['https://www.googleapis.com/auth/firebase.messaging']

  const now = Math.floor(Date.now() / 1000)
  const claims = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: scopes.join(' '),
  }

  // RS256 JWT oluştur (service account private key ile)
  const header = { alg: 'RS256', typ: 'JWT' }
  const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const claimsB64 = btoa(JSON.stringify(claims)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  const signingInput = `${headerB64}.${claimsB64}`

  const keyPem = serviceAccount.private_key
  const keyData = keyPem.replace(/-----.*-----/g, '').replace(/\s/g, '')
  const keyBuffer = Uint8Array.from(atob(keyData), c => c.charCodeAt(0))

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', keyBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  )

  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput),
  )

  const jwtAssertion = `${signingInput}.${btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}`

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwtAssertion,
    }),
  })

  const tokenData = await tokenResponse.json()
  return tokenData.access_token
}

// ─── Bildirim Kapısı (app_config) ────────────────────────────────
interface NotificationGate { pushLive: boolean; silentStart: number; silentEnd: number; ratePerHour: number }

async function loadGate(): Promise<NotificationGate> {
  const { data } = await supabaseAdmin
    .from('app_config')
    .select('key, value')
    .in('key', ['push_live_enabled', 'silent_hours_start', 'silent_hours_end', 'rate_limit_per_user_per_hour'])
  const m: Record<string, unknown> = {}
  for (const row of data ?? []) m[(row as { key: string }).key] = (row as { value: unknown }).value
  const num = (v: unknown, d: number) => { const n = Number(v); return Number.isFinite(n) ? n : d }
  return {
    pushLive: m['push_live_enabled'] === true || m['push_live_enabled'] === 'true',
    silentStart: num(m['silent_hours_start'], 23),
    silentEnd: num(m['silent_hours_end'], 9),
    ratePerHour: num(m['rate_limit_per_user_per_hour'], 6),
  }
}

function istanbulHour(): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Istanbul', hour: '2-digit', hourCycle: 'h23' }).format(new Date()),
  )
}

function inSilentHours(g: NotificationGate): boolean {
  if (g.silentStart === g.silentEnd) return false
  const h = istanbulHour()
  return g.silentStart < g.silentEnd
    ? (h >= g.silentStart && h < g.silentEnd)
    : (h >= g.silentStart || h < g.silentEnd)
}

async function isTypeMandatory(
  typeKey: string,
  prefForType?: { enabled: boolean; mandatory: boolean },
): Promise<boolean> {
  if (prefForType?.mandatory === true) return true
  const { data } = await supabaseAdmin
    .from('notification_templates')
    .select('is_mandatory')
    .eq('type_key', typeKey)
    .maybeSingle()
  return (data as { is_mandatory?: boolean } | null)?.is_mandatory === true
}

async function logPushStatus(n: NotificationRecord, p: UserProfile, status: string) {
  await supabaseAdmin.from('push_log').insert({
    notification_id: n.id,
    user_id: n.user_id,
    push_token: p.push_token,
    platform: p.push_token_platform || 'unknown',
    status,
  })
}

// ─── Yardımcı: Push Başarısız İşaretle ───────────────────────────
async function markPushFailed(
  notificationId: string,
  errorCode: string,
  errorMessage?: string,
  profile?: UserProfile,
) {
  await supabaseAdmin.from('notifications').update({
    push_error: `${errorCode}: ${errorMessage || ''}`,
  }).eq('id', notificationId)

  if (profile?.push_token) {
    await supabaseAdmin.from('push_log').insert({
      notification_id: notificationId,
      user_id: '', // Bilinmiyor bu noktada
      push_token: profile.push_token,
      platform: profile.push_token_platform || 'unknown',
      status: 'failed',
      error_code: errorCode,
      error_message: errorMessage,
    })
  }
}
