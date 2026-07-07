import { supabase } from '../supabaseClient';

// ─── Tipler ───────────────────────────────────────────────────────────────────
export interface WalletSummary {
  earningsBalance: number;   // çekilebilir kazanç
  reservedBalance: number;   // bekleyen çekim talebi (rezerve)
  refundCreditBalance: number;
}

export interface PayoutMethod {
  id: string;
  kind: 'IBAN' | 'CARD';
  label: string | null;
  holderName: string;
  iban: string | null;
  cardLast4: string | null;
  cardBrand: string | null;
  isDefault: boolean;
  createdAt: string;
}

export interface PayoutRequestRow {
  id: string;
  amount: number;
  iban: string;
  ibanHolderName: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  methodKind: 'IBAN' | 'CARD' | null;
  createdAt: string;
  processedAt: string | null;
}

const mapMethod = (r: any): PayoutMethod => ({
  id: r.id,
  kind: r.kind,
  label: r.label ?? null,
  holderName: r.holder_name,
  iban: r.iban ?? null,
  cardLast4: r.card_last4 ?? null,
  cardBrand: r.card_brand ?? null,
  isDefault: !!r.is_default,
  createdAt: r.created_at,
});

const mapPayout = (r: any): PayoutRequestRow => ({
  id: r.id,
  amount: Number(r.amount),
  iban: r.iban,
  ibanHolderName: r.iban_holder_name,
  status: r.status,
  methodKind: r.method_kind ?? null,
  createdAt: r.created_at,
  processedAt: r.processed_at ?? null,
});

// RPC RAISE EXCEPTION 'KOD: açıklama' → kullanıcıya açıklamayı göster
const parseRpcError = (message?: string): string | null => {
  if (!message) return null;
  const withDesc = message.match(/[A-Z_]+:\s*(.+)$/);
  return withDesc ? withDesc[1] : message;
};

// ─── Cüzdan özeti (TEK kaynak: get_wallet_summary) ───────────────────────────
export const getWalletSummary = async (): Promise<WalletSummary> => {
  const { data, error } = await supabase.rpc('get_wallet_summary');
  if (error) throw new Error('Bakiye bilgisi alınamadı.');
  return {
    earningsBalance: Number((data as any)?.earnings_balance) || 0,
    reservedBalance: Number((data as any)?.reserved_balance) || 0,
    refundCreditBalance: Number((data as any)?.refund_credit_balance) || 0,
  };
};

// ─── Kayıtlı ödeme yöntemleri ─────────────────────────────────────────────────
export const getPayoutMethods = async (): Promise<PayoutMethod[]> => {
  const { data, error } = await supabase
    .from('payout_methods')
    .select('*')
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true });
  if (error) {
    console.warn('[Wallet] ödeme yöntemleri okunamadı:', error.message);
    return [];
  }
  return (data ?? []).map(mapMethod);
};

export const addPayoutMethod = async (params: {
  kind: 'IBAN' | 'CARD';
  holderName: string;
  label?: string;
  iban?: string;
  cardNumber?: string;
  cardBrand?: string;
}): Promise<void> => {
  const { error } = await supabase.rpc('add_payout_method', {
    p_kind: params.kind,
    p_holder_name: params.holderName,
    p_label: params.label ?? null,
    p_iban: params.iban ?? null,
    p_card_number: params.cardNumber ?? null,
    p_card_brand: params.cardBrand ?? null,
  });
  if (error) throw new Error(parseRpcError(error.message) || 'Ödeme yöntemi eklenemedi.');
};

export const deletePayoutMethod = async (methodId: string): Promise<void> => {
  const { error } = await supabase.rpc('delete_payout_method', { p_method_id: methodId });
  if (error) throw new Error(parseRpcError(error.message) || 'Ödeme yöntemi silinemedi.');
};

export const setDefaultPayoutMethod = async (methodId: string): Promise<void> => {
  const { error } = await supabase.rpc('set_default_payout_method', { p_method_id: methodId });
  if (error) throw new Error(parseRpcError(error.message) || 'Varsayılan yöntem ayarlanamadı.');
};

// ─── Çekim talebi (TC kimlik + bakiye + tek-PENDING kapıları backend'de) ─────
export const requestPayoutWithMethod = async (
  amount: number,
  methodId: string,
): Promise<PayoutRequestRow> => {
  const { data, error } = await supabase.rpc('request_payout_with_method', {
    p_amount: amount,
    p_method_id: methodId,
  });
  if (error) throw new Error(parseRpcError(error.message) || 'Çekim talebi oluşturulamadı.');
  return mapPayout(data);
};

// ─── Çekim geçmişi (RLS: kullanıcı kendi satırlarını görür) ──────────────────
export const getMyPayoutRequests = async (limit = 20): Promise<PayoutRequestRow[]> => {
  const { data, error } = await supabase
    .from('payout_requests')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.warn('[Wallet] çekim geçmişi okunamadı:', error.message);
    return [];
  }
  return (data ?? []).map(mapPayout);
};

export const getPendingPayout = async (): Promise<PayoutRequestRow | null> => {
  const { data, error } = await supabase
    .from('payout_requests')
    .select('*')
    .in('status', ['PENDING', 'PROCESSING'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return mapPayout(data);
};
