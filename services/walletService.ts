import { supabase } from '../supabaseClient';

// ─── Tipler ───────────────────────────────────────────────────────────────────
export interface WalletSummary {
  earningsBalance: number;   // çekilebilir kazanç
  reservedBalance: number;   // bekleyen çekim talebi (rezerve)
  refundCreditBalance: number; // iade kredisi (yalnızca OYNA içi)
  topupBalance: number;        // yüklenen bakiye
  spendableBalance: number;    // topup + iade kredisi (ödemelerde kullanılabilir)
}

// Kayıtlı kart — YALNIZ maskeli meta (PAN/CVV asla FE'den öteye geçmez;
// SIMULATION'da hiç gönderilmez, canlıda iyzico tokenizasyonu edge'de yapılır).
export interface SavedCard {
  id: string;
  brand: string;
  last4: string;
  expMonth: number | null;
  expYear: number | null;
  holderName: string | null;
  gradient: string | null;
  isDefault: boolean;
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
  const d = data as any;
  const refund = Number(d?.refund_credit_balance) || 0;
  const topup = Number(d?.topup_balance) || 0;
  return {
    earningsBalance: Number(d?.earnings_balance) || 0,
    reservedBalance: Number(d?.reserved_balance) || 0,
    refundCreditBalance: refund,
    topupBalance: topup,
    spendableBalance: Number(d?.spendable_balance) || topup + refund,
  };
};

// ─── Kayıtlı kartlar (user_saved_cards; RLS: kullanıcı kendi kartlarını görür) ─
const CARD_GRADIENTS = [
  'from-purple-700 to-blue-600',
  'from-emerald-600 to-teal-700',
  'from-sky-500 to-indigo-500',
  'from-orange-600 to-rose-600',
];

export const pickCardGradient = (last4: string): string =>
  CARD_GRADIENTS[(Number(last4) || 0) % CARD_GRADIENTS.length];

/** Kart numarası ön ekinden marka tahmini (yalnız görsel amaçlı). */
export const detectCardBrand = (cardNumber: string): string => {
  const digits = cardNumber.replace(/\D/g, '');
  if (/^(9792|65|9(?!792))/.test(digits)) return 'TROY';
  if (/^4/.test(digits)) return 'VISA';
  if (/^(5[1-5]|2[2-7])/.test(digits)) return 'MASTERCARD';
  if (/^3[47]/.test(digits)) return 'AMEX';
  return 'KART';
};

const mapSavedCard = (r: any): SavedCard => ({
  id: r.id,
  brand: r.brand ?? 'KART',
  last4: r.last4,
  expMonth: r.exp_month ?? null,
  expYear: r.exp_year ?? null,
  holderName: r.holder_name ?? null,
  gradient: r.gradient ?? null,
  isDefault: !!r.is_default,
});

export const listSavedCards = async (): Promise<SavedCard[]> => {
  const { data, error } = await supabase
    .from('user_saved_cards')
    .select('*')
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) {
    console.warn('[Wallet] kayıtlı kartlar okunamadı:', error.message);
    return [];
  }
  return (data ?? []).map(mapSavedCard);
};

export const addSavedCard = async (params: {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  holderName?: string;
  gradient?: string;
  makeDefault?: boolean;
}): Promise<SavedCard> => {
  const { data, error } = await supabase.rpc('add_saved_card', {
    p_brand: params.brand,
    p_last4: params.last4,
    p_exp_month: params.expMonth,
    p_exp_year: params.expYear,
    p_holder_name: params.holderName ?? null,
    p_gradient: params.gradient ?? pickCardGradient(params.last4),
    p_make_default: params.makeDefault ?? false,
  });
  if (error) throw new Error(parseRpcError(error.message) || 'Kart kaydedilemedi.');
  return mapSavedCard(data);
};

export const deleteSavedCard = async (cardId: string): Promise<void> => {
  const { error } = await supabase.rpc('delete_saved_card', { p_card_id: cardId });
  if (error) throw new Error(parseRpcError(error.message) || 'Kart silinemedi.');
};

export const setDefaultSavedCard = async (cardId: string): Promise<void> => {
  const { error } = await supabase.rpc('set_default_saved_card', { p_card_id: cardId });
  if (error) throw new Error(parseRpcError(error.message) || 'Varsayılan kart ayarlanamadı.');
};

// ─── Para yükleme (min 300₺, bonus yok; canlı modda edge function'a taşınır) ──
export interface TopUpResult {
  intentId: string | null;
  amount: number;
  topupBalance: number;
  refundCreditBalance: number;
  spendableBalance: number;
}

export const topUpWallet = async (amount: number, cardId?: string | null): Promise<TopUpResult> => {
  const { data, error } = await supabase.rpc('wallet_topup', {
    p_amount: amount,
    p_card_id: cardId ?? null,
  });
  if (error) throw new Error(parseRpcError(error.message) || 'Para yükleme başarısız.');
  const d = data as any;
  return {
    intentId: d?.intent_id ?? null,
    amount: Number(d?.amount) || amount,
    topupBalance: Number(d?.topup_balance) || 0,
    refundCreditBalance: Number(d?.refund_credit_balance) || 0,
    spendableBalance: Number(d?.spendable_balance) || 0,
  };
};

// ─── Kazanç özeti (tesis/kaleci/hakem) — owner_earnings_summary RPC ──────────
export interface EarningsSummary {
  available: number;        // çekilebilir kazanç
  reserved: number;         // bekleyen çekim talebinde rezerve
  pending: number;          // güvence beklemesinde (2 hafta)
  monthGross: number;       // bu ay brüt uygulama tahsilatı (saha)
  monthNet: number;         // bu ay net saha kazancı
  monthCommission: number;  // bu ay OYNA komisyonu
  monthCount: number;       // bu ay ödeme adedi
  monthOtherNet: number;    // bu ay maç/hizmet kazancı (kaleci/hakem)
}

export const getOwnerEarningsSummary = async (): Promise<EarningsSummary | null> => {
  const { data, error } = await supabase.rpc('owner_earnings_summary');
  if (error || !data) return null;
  const d = data as any;
  return {
    available: Number(d.available) || 0,
    reserved: Number(d.reserved) || 0,
    pending: Number(d.pending) || 0,
    monthGross: Number(d.month_gross) || 0,
    monthNet: Number(d.month_net) || 0,
    monthCommission: Number(d.month_commission) || 0,
    monthCount: Number(d.month_count) || 0,
    monthOtherNet: Number(d.month_other_net) || 0,
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
