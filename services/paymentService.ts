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

/** Rezervasyon kaporası için ödeme başlatır. */
export async function startBookingPayment(bookingId: string): Promise<CreatePaymentResponse> {
  const { data, error } = await supabase.functions.invoke('create-payment', {
    body: { action: 'create', bookingId },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as CreatePaymentResponse;
}

/** SIMULATION modunda ödemeyi onaylar (gerçek sağlayıcıda webhook yapar). */
export async function confirmSimPayment(intentId: string): Promise<PaymentResult> {
  const { data, error } = await supabase.functions.invoke('create-payment', {
    body: { action: 'confirm-sim', intentId },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as PaymentResult;
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
