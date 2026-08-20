// ═══════════════════════════════════════════════════════════════════════════
// ÖDEME SAĞLAYICISI ÇÖZÜMLEMESİ — tek kaynak
//
// ── BULUNAN HATA (19 Ağustos 2026) ────────────────────────────────────────
// Sağlayıcı İKİ yerde tutuluyordu ve İKİSİ AYRI cevap verebiliyordu:
//   · app_config.payment_provider → uygulamanın ödeme ekranını açan kapı
//     (`resolve_payment_mode`), panelden çevrilen "tek anahtar".
//   · PAYMENT_PROVIDER secret'ı    → paranın gerçekten çekildiği yer.
// Canlıda tam bu ayrışma vardı: panel SIMULATION diyordu, fonksiyon IYZICO'ydu.
// Yani uygulama "ödeyebilirsin" diyor, arkada GERÇEK kart çekimi deneniyordu.
// Mağaza incelemecisi hayali kartını girseydi reddedilirdi; gerçek kart giren
// biri de gerçekten ödeme yapardı. İkisinin ayrışabilmesi başlı başına hataydı.
//
// ── KURAL: PANEL DARALTIR, ASLA GENİŞLETMEZ ───────────────────────────────
//   IYZICO     ⟸ config = IYZICO      VE  secret = IYZICO
//   SIMULATION ⟸ config = SIMULATION  VE  simulation_counts_as_live = true
//   DISABLED   ⟸ bunların dışındaki her hâl
//
// Okunuşu: GERÇEK PARA için İKİ tarafın da aynı anda "IYZICO" demesi gerekir.
// Panelden SIMULATION'a çekmek her zaman para akışını DURDURUR — secret IYZICO
// kalsa bile. Tersi mümkün değil: panel tek başına gerçek para yolunu AÇAMAZ,
// çünkü secret olmadan IYZICO dalı hiç seçilmez.
//
// FAIL-CLOSED (lansman kararı, 16 Ağu 2026) korunuyor: secret verilmemişse
// gerçek para yolu yoktur. Değişen tek şey, secret'ın artık TEK BAŞINA yetmemesi.
//
// `simulation_counts_as_live` neden şart: simülasyon ödemesi para almaz ama
// GERÇEK rezervasyon yaratır — saha kapanır, tesis parayı bekler. Bu yüzden
// sahte tahsilatın kabulü de bilinçli bir karar olmalı. Aynı anahtar zaten
// `resolve_payment_mode`'da ekranı açıyor; burada da aranması iki katmanlı
// kapı demek (prensip 6.1: arayüze asla güvenme).
// ═══════════════════════════════════════════════════════════════════════════

const ENV_PROVIDER = (Deno.env.get('PAYMENT_PROVIDER') ?? '').trim().toUpperCase() || null

const ONBELLEK_MS = 60_000
let onbellek: { at: number; value: string } | null = null

type RpcYanit = { data: unknown }
type RpcClient = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<RpcYanit> }

/** Bu istek için etkin sağlayıcı: 'IYZICO' | 'SIMULATION' | 'DISABLED'. */
export async function resolvePaymentProvider(admin: RpcClient): Promise<string> {
  const now = Date.now()
  if (onbellek && now - onbellek.at < ONBELLEK_MS) return onbellek.value

  let sonuc: string
  try {
    const [prov, simCanli] = await Promise.all([
      admin.rpc('get_config_text', { p_key: 'payment_provider', p_default: null }),
      admin.rpc('get_config_bool', { p_key: 'simulation_counts_as_live', p_default: false }),
    ])
    const config = String(prov.data ?? '').trim().toUpperCase()

    if (config === 'IYZICO' && ENV_PROVIDER === 'IYZICO') {
      sonuc = 'IYZICO'
    } else if (config === 'SIMULATION' && simCanli.data === true) {
      sonuc = 'SIMULATION'
    } else {
      sonuc = 'DISABLED'
    }
  } catch {
    // Config OKUNAMADI — geçici bir veritabanı arızası canlı tahsilatı
    // kesmesin: elimizde taze olmayan ama bilinen bir değer varsa onu sürdür.
    // Hiç değer yoksa DISABLED; belirsizlikte para yolu açılmaz.
    if (onbellek) return onbellek.value
    sonuc = 'DISABLED'
  }

  onbellek = { at: now, value: sonuc }
  return sonuc
}

/** Yalnız testler için: önbelleği düşür. */
export function resetPaymentProviderCache(): void {
  onbellek = null
}
