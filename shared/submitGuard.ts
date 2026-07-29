// ════════════════════════════════════════════════════════════════════════
// GÖNDERİM KAPISI — para/veri üreten HER async yazmanın ortak ön koşulu.
// Üç parça: (1) senkron çift-tık kilidi çağıranda tutulur (useRef),
// (2) idempotency anahtarı, (3) çevrimiçi kapısı + yanıt penceresi.
// Referans uygulama: views/PaymentScreen.tsx handlePay (payBusyRef/idemKeyRef).
// ════════════════════════════════════════════════════════════════════════

/** RFC4122 v4 uuid. crypto.randomUUID modern WebView'de var; eski WebView
 *  için güvenli yedek. Sunucudaki owner_client_ops.client_request_id kolonu
 *  uuid tipinde olduğu için çıktının uuid biçiminde olması ZORUNLU. */
export const safeUuid = (): string => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch { /* yedeğe düş */ }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

/** navigator.onLine yoksa (SSR / çok eski WebView) ÇEVRİMİÇİ VARSAYILIR —
 *  yanlış engelleme, geç engellemeden kötüdür. Yalnız kesin false engeller. */
export const isOnline = (): boolean =>
  typeof navigator === 'undefined' || navigator.onLine !== false;

/** Postgres RPC yanıt penceresi (join/create/leave). Normalde <1 sn. */
export const RPC_TIMEOUT_MS = 12_000;
/** Kart tahsilatı penceresi. Edge 'pay' fonksiyonu iyzico'ya 20 sn timeout +
 *  1 tekrar uyguluyor (supabase/functions/create-payment/index.ts) → 40 sn'nin
 *  altına inersek ÇALIŞAN bir ödemeyi keseriz. */
export const CARD_TIMEOUT_MS = 45_000;

export class SubmitTimeoutError extends Error {
  constructor() { super('SUBMIT_TIMEOUT'); this.name = 'SubmitTimeoutError'; }
}

/**
 * İstek verilen süre içinde dönmezse SubmitTimeoutError fırlatır.
 * İSTEĞİ İPTAL ETMEZ — sunucuda tamamlanmış olabilir. Bu yüzden çağıran
 * idempotency anahtarını bu dalda ASLA sıfırlamaz (tekrar deneme aynı
 * anahtarla gider, sunucu ikinci kayıt üretmez).
 */
export function withSubmitTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    p.finally(() => clearTimeout(timer)),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new SubmitTimeoutError()), ms);
    }),
  ]);
}

// ── Sabit Türkçe metinler (tek kaynak — akış boyunca değişmez) ─────────────
export const OFFLINE_PUBLISH   = 'Bağlantın yok. Maçı yayınlamıyoruz — bağlanınca tekrar dene.';
export const OFFLINE_PAY       = 'Bağlantın yok. Ödemeyi göndermiyoruz — bağlanınca tekrar dene.';
export const OFFLINE_JOIN      = 'Bağlantın yok. Kaydını göndermiyoruz — bağlanınca tekrar dene.';
export const OFFLINE_FORMATION = 'Bağlantın yok. Dizilişi kaydetmiyoruz — bağlanınca tekrar dene.';
export const TIMEOUT_PUBLISH   = 'Sunucudan yanıt gelmedi. Maçın oluşmuş olabilir — Maçlarım’a bak. Oluşmadıysa tekrar dene, çift maç açılmaz.';
export const TIMEOUT_PAY       = 'Sunucudan yanıt gelmedi. Ödemen alınmadıysa tekrar dene — çift çekim olmaz.';
export const TIMEOUT_JOIN      = 'Sunucudan yanıt gelmedi. Yerin ayrılmış olabilir — ekranı yenile. Ayrılmadıysa tekrar dene, çift kayıt olmaz.';
