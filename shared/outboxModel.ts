// ════════════════════════════════════════════════════════════════════════
// P-OFFLINE — OUTBOX SAF ÇEKİRDEĞİ (yan-etkisiz, birim-test edilebilir)
// ------------------------------------------------------------------------
// Kasa işlemleri çevrimdışıyken localStorage kuyruğuna alınır; bağlantı
// gelince SIRAYLA (FIFO) yeniden gönderilir. Sunucu tarafı idempotent
// (client_request_id + owner_client_ops) → tekrar gönderim çift kayıt üretmez.
// ════════════════════════════════════════════════════════════════════════

export type OutboxOpType = 'RECORD_PAYMENT' | 'DEBTOR_PAYMENT';

export interface OutboxItem {
  /** client_request_id — sunucu idempotency anahtarı (uuid). */
  id: string;
  type: OutboxOpType;
  /** RPC parametreleri (op türüne göre). */
  payload: Record<string, unknown>;
  /** Kullanıcıya gösterilecek kısa özet (ör. "Ahmet · 100₺ nakit"). */
  label: string;
  createdAt: string; // ISO
  tries: number;
  lastError?: string;
}

/** Hata sınıfı: NETWORK = bağlantı yok, kuyruğa al + sonra dene;
 *  PERMANENT = sunucu isteği reddetti (yetki/validasyon), tekrar DENEME. */
export type OutboxErrorClass = 'NETWORK' | 'PERMANENT';

/**
 * supabase-js / fetch hata mesajından ağ-mı-kalıcı-mı sınıflandırması.
 * Bilinmeyen durumda NETWORK varsayılmaz — para işleminde sonsuz tekrar
 * yerine kullanıcıya dürüst hata göstermek daha güvenlidir.
 */
export function classifyOutboxError(err: unknown): OutboxErrorClass {
  const msg = String((err as { message?: string })?.message ?? err ?? '').toLowerCase();
  if (
    msg.includes('failed to fetch') ||       // Chromium fetch ağ hatası
    msg.includes('networkerror') ||          // Firefox
    msg.includes('fetch failed') ||          // undici/node
    msg.includes('load failed') ||           // Safari
    msg.includes('network request failed') ||
    msg.includes('err_internet_disconnected') ||
    msg.includes('err_network') ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('abort')
  ) {
    return 'NETWORK';
  }
  return 'PERMANENT';
}

/** Kuyruk (de)serileştirme — bozuk kayıtlar sessizce atılır (kuyruk asla
 *  uygulamayı kilitleyemez; para izi sunucuda, kuyruk yalnız taşıyıcıdır). */
export function parseOutbox(raw: string | null): OutboxItem[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((it): it is OutboxItem =>
      !!it && typeof it === 'object'
      && typeof (it as OutboxItem).id === 'string'
      && ((it as OutboxItem).type === 'RECORD_PAYMENT' || (it as OutboxItem).type === 'DEBTOR_PAYMENT')
      && typeof (it as OutboxItem).payload === 'object' && (it as OutboxItem).payload !== null
      && typeof (it as OutboxItem).label === 'string'
      && typeof (it as OutboxItem).createdAt === 'string'
      && typeof (it as OutboxItem).tries === 'number');
  } catch {
    return [];
  }
}

export function serializeOutbox(items: OutboxItem[]): string {
  return JSON.stringify(items);
}

/** Kuyruk üst sınırı — kasa gerçekçi kullanımda küçük kalır; taşma durumunda
 *  en yeni işlem reddedilir (sessiz veri kaybı YOK, çağıran hata gösterir). */
export const OUTBOX_MAX_ITEMS = 100;
