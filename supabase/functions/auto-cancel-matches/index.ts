// ═══════════════════════════════════════════════════════════════
// ⚠️⚠️ BU DOSYA ARTIK KULLANILMIYOR — YAYINDA DEĞİL (SRE-6, 4 Ağu 2026)
// ───────────────────────────────────────────────────────────────
// SRE turu canlıyı ölçtü:
//   • Bu fonksiyon Supabase'e HİÇ yayınlanmamış (canlıda 14 fonksiyon var,
//     bu onlardan biri değil).
//   • Onu çağıracağı söylenen cron işi de canlıda yok.
//   • Yaptığı iş BAŞKA BİR YERDE zaten yapılıyor: veritabanındaki
//     `auto_process_matches()` fonksiyonu, `auto_process_matches` cron işiyle
//     10 dakikada bir çalışıyor ve karar anına gelen her maç için AYNI RPC'yi
//     (`process_match_at_deadline`) çağırıyor.
//
// Yani maç iptali ÇALIŞIYOR — ama bu dosya üzerinden değil, veritabanı
// üzerinden. Bu dosya silinmedi çünkü silme kararı kurucunun; ama YANLIŞLIKLA
// yayınlanmasın diye buraya yazıldı. Yayınlanırsa zarar vermez
// (process_match_at_deadline aynı işi iki kez yapmaz) ama iki ayrı yerde iki
// ayrı kural olur — ilerideki bir değişiklikte biri güncellenip diğeri
// unutulur. Tek kural tek yerde durmalı.
//
// KARAR BEKLİYOR: ya bu dosya silinsin, ya da veritabanındaki kopya kaldırılıp
// bu yayınlansın. İkisi birden durmamalı.
// ═══════════════════════════════════════════════════════════════
//
// OYNA APP — Supabase Edge Function: auto-cancel-matches
//
// [C4] 90 dakikalık OTOMATİK MAÇ İPTALİ — sunucu tarafı otorite.
//
// Eskiden bu tarama her Dashboard açan istemcide (views/Dashboard.tsx
// scanAndAutoCancel useEffect'i) çalışıyordu: birçok istemci aynı maçı
// iptal etmek için yarışıyor (write storm), mükerrer bildirim gönderiyor
// ve yeniden render osilasyonu yaratıyordu. Maç iptali + iade bir SUNUCU
// sorumluluğudur; bu fonksiyon tek otoriter yerdir.
//
// Kural (TEK KAYNAK BU DOSYADIR — eski utils/gameRules.ts kopyası silindi):
//   • Maç başlangıcına 90 dk veya daha az kaldıysa (henüz başlamamışsa) VE
//   • dolu (TAKEN) slot sayısı toplam slotun %70'inin (ceil) altındaysa
//   → maç otomatik iptal edilir.
//
// Para hareketi YENİDEN İCAT EDİLMEZ: iptal + kapora iade/void işi, test
// edilmiş mevcut RPC `process_match_at_deadline(uuid)` ile yapılır. Bu RPC:
//   • idempotenttir (CONFIRMED/CANCELLED/COMPLETED/LIVE ise no-op),
//   • quorum tutmuyorsa status=CANCELLED + BLOCKED/PENDING intent'leri VOID +
//     refund_status=DONE yapar,
//   • service_role'e GRANT'lidir (auth.uid() gerektirmez).
//
// Kurulum:
//   supabase functions deploy auto-cancel-matches
//   supabase secrets set WEBHOOK_SECRET=...   (send-push ile aynı sır)
//
// Zamanlama: supabase/migrations/20260719000001_c4_auto_cancel_cron.sql
//   (pg_cron + pg_net → bu fonksiyonu ~5 dakikada bir Bearer WEBHOOK_SECRET
//    ile çağırır).
// ═══════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
)

// Eşik: kadro %70'in altındaysa iptal aday (kuralın tek kaynağı bu dosya).
const FILL_THRESHOLD = 0.7
// 90 dakika penceresi (0 < kalan ≤ 90 dk).
const WINDOW_MINUTES = 90

interface MatchRow {
  id: string
  title: string | null
  status: string
  starts_at: string | null
  slots: unknown
  awaySlots: unknown
  captain_id: string | null
  creatorId: string | null
}

interface Slot {
  status?: string
  player?: { id?: string } | null
}

// Kadro sayımı: TAKEN slotları say, toplam slotu al, eşiği ceil(total*0.7) uygula.
function isUnderFilled(row: MatchRow): boolean {
  const home = Array.isArray(row.slots) ? (row.slots as Slot[]) : []
  const away = Array.isArray(row.awaySlots) ? (row.awaySlots as Slot[]) : []
  const all = [...home, ...away]
  const totalSlots = all.length || 14
  const filled = all.filter((s) => s?.status === 'TAKEN').length
  return filled < Math.ceil(totalSlots * FILL_THRESHOLD)
}

Deno.serve(async (req: Request) => {
  // Auth: send-push ile aynı desen — yalnız Bearer WEBHOOK_SECRET.
  const authHeader = req.headers.get('Authorization')
  const webhookSecret = Deno.env.get('WEBHOOK_SECRET')
  if (!webhookSecret) {
    console.error('[auto-cancel-matches] WEBHOOK_SECRET env variable is not set!')
    return new Response('Server misconfigured', { status: 500 })
  }
  if (authHeader !== `Bearer ${webhookSecret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  try {
    const nowIso = new Date().toISOString()
    const windowIso = new Date(Date.now() + WINDOW_MINUTES * 60_000).toISOString()

    // Aday maçlar: henüz başlamamış, 90 dk penceresine girmiş, hâlâ açık maçlar.
    // (CANCELLED/COMPLETED/LIVE/CONFIRMED zaten süreç dışı — idempotency 1. katman.)
    const { data: candidates, error: fetchError } = await supabaseAdmin
      .from('matches')
      .select('id, title, status, starts_at, slots, "awaySlots", captain_id, "creatorId"')
      .in('status', ['OPEN', 'ACTIVE'])
      .not('starts_at', 'is', null)
      .gt('starts_at', nowIso)
      .lte('starts_at', windowIso)

    if (fetchError) {
      console.error('[auto-cancel-matches] fetch error:', fetchError.message)
      return new Response('Fetch failed', { status: 500 })
    }

    const rows = (candidates ?? []) as MatchRow[]
    let cancelled = 0

    for (const row of rows) {
      // Kural: yalnız kadrosu %70'in altında olan maçlar iptal adayı.
      if (!isUnderFilled(row)) continue

      // İptal + kapora void/iade: test edilmiş, service_role'e açık RPC ile.
      // İdempotenttir; zaten iptal edilmişse 'idempotent: true' döner ve
      // biz o durumda TEKRAR bildirim GÖNDERMEYİZ (idempotency 2. katman).
      const { data: result, error: rpcError } = await supabaseAdmin
        .rpc('process_match_at_deadline', { p_match_id: row.id })

      if (rpcError) {
        console.error(`[auto-cancel-matches] rpc error (match ${row.id}):`, rpcError.message)
        continue
      }

      const res = (result ?? {}) as { status?: string; idempotent?: boolean }

      // Bu çalıştırmada gerçekten YENİ iptal olduysa say. Quorum beklenmedik
      // şekilde tutuyorsa RPC maçı CONFIRMED yapar → yanlış iptal olmaz.
      //
      // BİLDİRİM burada GÖNDERİLMEZ: matches.status → 'CANCELLED' UPDATE'i, DB
      // trigger'ı on_match_cancelled (notify_match_cancelled) içinde katılımcılara
      // + kurucuya 'match_cancelled' bildirimini ZATEN ekler. Burada tekrar
      // eklersek mükerrer bildirim olur. Tek kaynak: DB trigger'ı.
      if (res.status === 'CANCELLED' && res.idempotent !== true) {
        cancelled += 1
      }
    }

    return new Response(JSON.stringify({ cancelled }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('[auto-cancel-matches] Kritik hata:', error)
    return new Response('Internal Error', { status: 500 })
  }
})
