// ─── Ödeme Servisi (kapora tahsilatı) ────────────────────────────────────────
// Sağlayıcı-bağımsız. create-payment edge function'ı üzerinden çalışır.
// SIMULATION modunda uçtan uca test edilebilir (gerçek para yok).
// Gerçek sağlayıcı bağlandığında checkoutUrl'e yönlendirme devreye girer.

import { supabase } from '../supabaseClient';

export interface CreatePaymentResponse {
  intentId: string;
  amount: number;
  currency: string;
  commission: number;
  provider: string;
  checkoutUrl: string | null;
  requiresClientConfirm: boolean;
}

export interface PaymentResult {
  intent_id: string;
  status: string;
  amount?: number;
  commission?: number;
  owner_amount?: number;
  booking_payment_status?: string;
  idempotent?: boolean;
}

const ERROR_MAP: [string, string][] = [
  ['ALREADY_PAID', 'Bu rezervasyonun kaporası zaten ödenmiş.'],
  ['NO_DEPOSIT', 'Bu rezervasyon için online kapora gerekmiyor.'],
  ['CANCELLED', 'İptal edilmiş bir rezervasyon ödenemez.'],
  ['UNAUTHORIZED', 'Bu işlem için giriş yapman gerekiyor.'],
  ['NOT_FOUND', 'Rezervasyon bulunamadı.'],
  ['PROVIDER_NOT_CONFIGURED', 'Ödeme sağlayıcısı henüz yapılandırılmadı. Lütfen daha sonra tekrar dene.'],
  ['CONFIRM_DISABLED_IN_LIVE', 'Test onayı canlı modda kapalıdır.'],
];

export function toPaymentErrorMessage(error: unknown): string {
  const msg = error instanceof Error ? error.message : String((error as any)?.message ?? error ?? '');
  for (const [code, tr] of ERROR_MAP) if (msg.includes(code)) return tr;
  return 'Ödeme sırasında bir sorun oluştu. Lütfen tekrar dene.';
}

// Edge function non-2xx döndürünce supabase-js jenerik "non-2xx" hatası verir;
// asıl gövde error.context (Response) içindedir. Gerçek mesajı oradan çıkar.
async function invokeEdge(action: string, body: Record<string, unknown>): Promise<any> {
  const { data, error } = await supabase.functions.invoke('create-payment', {
    body: { action, ...body },
  });
  if (error) {
    let detail = '';
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === 'function') {
        const parsed = await ctx.json();
        detail = parsed?.error || '';
      }
    } catch { /* gövde okunamadı — jenerik mesaja düş */ }
    throw new Error(detail || error.message || 'Ödeme başlatılamadı.');
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

/** Rezervasyon kaporası için ödeme başlatır. */
export async function startBookingPayment(bookingId: string): Promise<CreatePaymentResponse> {
  return await invokeEdge('create', { bookingId }) as CreatePaymentResponse;
}

/** SIMULATION modunda ödemeyi onaylar (gerçek sağlayıcıda webhook yapar). */
export async function confirmSimPayment(intentId: string): Promise<PaymentResult> {
  return await invokeEdge('confirm-sim', { intentId }) as PaymentResult;
}

/**
 * Kaporayı uçtan uca öde.
 * - Gerçek sağlayıcı: checkoutUrl'e yönlendirir (kullanıcı orada öder, webhook tamamlar).
 * - SIMULATION: niyet oluşturup hemen onaylar; sonucu döndürür.
 */
export async function payBookingDeposit(bookingId: string): Promise<{ redirected: boolean; result?: PaymentResult }> {
  const created = await startBookingPayment(bookingId);

  if (created.checkoutUrl) {
    // Gerçek sağlayıcı ödeme sayfası
    window.location.href = created.checkoutUrl;
    return { redirected: true };
  }

  if (created.requiresClientConfirm) {
    const result = await confirmSimPayment(created.intentId);
    return { redirected: false, result };
  }

  // checkoutUrl yok ve confirm gerekmiyorsa (beklenmedik) — niyet beklemede kalır
  return { redirected: false };
}

// ═══ UYGULAMA-İÇİ KART ÖDEMESİ (Uber standardı — iyzico görünmez) ═══════════
// OYNA'nın kendi kart formu → edge 'pay' → 3DS (banka SMS) uygulama içinde.
// Kart verisi YALNIZ bellekte yaşar ve doğrudan edge'e gider; ne DB'ye ne
// log'a yazılır. Kayıtlı kartla ödemede yalnız kart id gönderilir (token
// eşlemesi sunucuda yapılır).

/** Yeni kart bilgisi — yalnız ödeme anında bellekte taşınır. */
export interface NewCardInput {
  holderName: string;
  number: string;
  expireMonth: number;
  expireYear: number;
  cvc: string;
  /** true → ödeme onaylanınca kart iyzico deposuna kaydedilir (tek dokunuş). */
  save?: boolean;
}

export interface InAppPayInput {
  flow: 'BOOKING_DEPOSIT' | 'TOP_UP' | 'MATCH_JOIN';
  amount?: number;
  bookingId?: string;
  matchId?: string;
  slotIds?: string[];
  useBalance?: boolean;
  card?: NewCardInput;
  savedCardId?: string;
  /** C1 — idempotency anahtarı. Aynı ödeme denemesinin retry'ları aynı anahtarı
   *  taşır; sunucu var olan niyeti yeniden kullanır → geç-3DS + retry çift çekimi
   *  önlenir. FE her yeni ödeme için taze bir UUID üretir. */
  idempotencyKey?: string;
}

export interface InAppPayStart {
  provider: 'IYZICO' | 'SIMULATION';
  requiresThreeDS: boolean;
  intentId: string;
  cardAmount: number;
  balanceApplied: number;
  /** base64 — banka 3DS sayfası; decodeBase64Utf8 ile çözülüp iframe'e basılır. */
  threeDSHtml?: string;
  /** SIMULATION modunda ödeme anında uygulanır; sonuç burada döner. */
  result?: { ok: boolean; reason?: string; [k: string]: unknown };
}

/** Uygulama-içi kart ödemesi başlat (3 akış: kapora / cüzdan / maça katılım). */
export async function startInAppCardPayment(input: InAppPayInput): Promise<InAppPayStart> {
  return await invokeEdge('pay', input as unknown as Record<string, unknown>) as InAppPayStart;
}

/** Cüzdandan bağımsız kart kaydet (iyzico kart deposu üzerinden). */
export async function registerCardInApp(card: NewCardInput): Promise<{ ok: boolean; card?: unknown }> {
  return await invokeEdge('register-card', { card }) as { ok: boolean; card?: unknown };
}

export interface IntentStatus {
  status: 'PENDING' | 'PAID' | 'FAILED' | string;
  /** İade-krediye dönüş nedeni (SLOT_TAKEN_REFUNDED vb.) — raw.result_reason */
  resultReason: string | null;
  failReason: string | null;
}

/** 3DS yoklama yedeği: postMessage kaçarsa niyet durumundan sonucu oku (RLS: sahibi). */
export async function getIntentStatus(intentId: string): Promise<IntentStatus | null> {
  const { data, error } = await supabase
    .from('payment_intents')
    .select('status, raw')
    .eq('id', intentId)
    .maybeSingle();
  if (error || !data) return null;
  const raw = (data.raw ?? {}) as Record<string, unknown>;
  return {
    status: data.status as string,
    resultReason: (raw.result_reason as string) ?? null,
    failReason: (raw.fail_reason as string) ?? null,
  };
}

/** base64 → UTF-8 metin (iyzico threeDSHtmlContent çözümü). */
export function decodeBase64Utf8(b64: string): string {
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
