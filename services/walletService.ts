import { supabase } from '../supabaseClient';
import { mapError } from '../utils/errorMap';
import { cekimUygulamadanAcikMi, CEKIM_KAPALI_ACIKLAMA } from '../shared/featureFlags';

// ─── Tipler ───────────────────────────────────────────────────────────────────
export interface WalletSummary {
  earningsBalance: number;   // çekilebilir kazanç
  reservedBalance: number;   // bekleyen çekim talebi (rezerve)
  refundCreditBalance: number; // iade kredisi (yalnızca OYNA içi)
  topupBalance: number;        // yüklenen bakiye
  spendableBalance: number;    // topup + iade kredisi (ödemelerde kullanılabilir)
  /**
   * Bir maçta GÜVENCEDE bekleyen kapora toplamı. Harcanabilir bakiyeye DÂHİL
   * DEĞİLDİR — para zaten cüzdandan çıkmıştır. Yalnız "param nerede?" sorusunu
   * cevaplar: kapora ödendiğinde bakiye düşüyor ve sıradan bir harcama gibi
   * görünüyordu; nereye gittiği hiçbir ekranda yazmıyordu.
   */
  blockedBalance: number;
  /** Kaç maçta bloke var (tekil rakam yerine "1 maçta" diyebilmek için). */
  blockedMatchCount: number;
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
  /** Hizmet bedeli — yalnız WALLET_CASHOUT'ta dolu, kazanç çekiminde null. */
  feeAmount: number | null;
  /** Hesaba geçecek net tutar. Kazanç çekiminde null (kesinti yok → brüt). */
  netAmount: number | null;
  /** WALLET_CASHOUT | PROVIDER_INSTANT | MANUAL — iptal yalnız ilkinde mümkün. */
  payoutType: string | null;
  /** Reddedilen/iptal edilen talepte kullanıcıya gösterilecek sebep. */
  rejectReason: string | null;
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
  feeAmount: r.fee_amount != null ? Number(r.fee_amount) : null,
  netAmount: r.net_amount != null ? Number(r.net_amount) : null,
  payoutType: r.payout_type ?? null,
  rejectReason: r.reject_reason ?? null,
});

// IP-12: eskiden yalnız 'KOD: açıklama' biçimini ayıklıyordu; açıklamasız
// çıplak kod (ör. UNAUTHORIZED) ekrana TEK KELİME olarak çıkıyordu. Artık
// ortak sözlükten geçiyor.
const parseRpcError = (message?: string): string | null =>
  message ? mapError(message) : null;

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
    blockedBalance: Number(d?.blocked_balance) || 0,
    blockedMatchCount: Number(d?.blocked_match_count) || 0,
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

// ─── Para yükleme ─────────────────────────────────────────────────────────────
// KALDIRILDI (S1 ölü-yol temizliği): eski `wallet_topup` RPC'si idempotency ve
// 3DS içermiyordu. Tek yükleme yolu artık uygulama-içi 3DS akışıdır
// (paymentService.startInAppCardPayment, flow:'TOP_UP'). İki para yolu = risk;
// bu yüzden bu fonksiyon ve RPC grant'ı devre dışı bırakıldı.

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
  // KURUCU KARARI (19 Ağu 2026): uygulamadan çekim yok — kazanç OYNA
  // tarafından elle aktarılıyor. Kapı SERVİS katmanında: hangi ekran çağırırsa
  // çağırsın kullanıcı sunucu hatası değil, ne olduğunu anlatan bir cümle görür.
  if (!cekimUygulamadanAcikMi()) throw new Error(CEKIM_KAPALI_ACIKLAMA);

  const { data, error } = await supabase.rpc('request_payout_with_method', {
    p_amount: amount,
    p_method_id: methodId,
  });
  if (error) throw new Error(parseRpcError(error.message) || 'Çekim talebi oluşturulamadı.');
  return mapPayout(data);
};

// ─── Cüzdandan çekim (K1: yüklenen + iade bakiyesi, %5 hizmet bedeli) ────────
// Çekilebilir bakiye artık TOP_UP + REFUND_CREDIT. "İade kredisi" ayrı bir
// para türü değildir; kullanıcıya tek isim gösterilir: Cüzdan Bakiyesi.
export interface CashoutPreview {
  gross: number;
  fee_pct: number;
  fee: number;
  net: number;
  enabled: boolean;
  min: number;
  /** Çekilebilir toplam (yüklenen + iade). */
  withdrawable_balance: number;
  /** @deprecated K1 öncesi ad; withdrawable_balance ile aynı değeri taşır. */
  topup_balance: number;
  identity_ok: boolean;
  identity_required: boolean;
  has_pending: boolean;
  /** Bakiyenin tamamı çekiliyor: minimum eşik aranmıyor. */
  min_waived: boolean;
}

/** Cüzdan ekranının çekim bölümü için tek çağrılık durum. */
export interface WalletCashoutState {
  enabled: boolean;
  fee_pct: number;
  min: number;
  allow_full_balance: boolean;
  /** Çekilebilir toplam (yüklenen + iade). */
  withdrawable: number;
  topup_balance: number;
  refund_credit_balance: number;
  identity_required: boolean;
  identity_ok: boolean;
  /** Profilde ad soyad dolu mu — IBAN sahibi eşleşmesi için gerekli. */
  profile_name_ok: boolean;
  pending_request: {
    id: string;
    gross: number;
    fee: number;
    net: number;
    status: 'PENDING' | 'PROCESSING';
    iban_last4: string;
    created_at: string;
    can_cancel: boolean;
  } | null;
}

/** İptal-önizleme deseni: sunucunun KENDİ kesinti/net rakamı (asla FE'de hesaplama). */
export const previewWalletCashout = async (gross: number): Promise<CashoutPreview> => {
  const { data, error } = await supabase.rpc('preview_wallet_cashout', { p_gross: gross });
  if (error) throw new Error(parseRpcError(error.message) || 'Çekim önizlemesi alınamadı.');
  const d = data as any;
  const withdrawable = Number(d.withdrawable_balance ?? d.topup_balance) || 0;
  return {
    gross: Number(d.gross) || 0, fee_pct: Number(d.fee_pct) || 0, fee: Number(d.fee) || 0,
    net: Number(d.net) || 0, enabled: !!d.enabled, min: Number(d.min) || 0,
    withdrawable_balance: withdrawable, topup_balance: withdrawable,
    identity_ok: !!d.identity_ok, identity_required: !!d.identity_required,
    has_pending: !!d.has_pending, min_waived: !!d.min_waived,
  };
};

/** Ekranın çekim bölümü için tek çağrı — bakiye, kapılar ve bekleyen talep. */
export const getWalletCashoutState = async (): Promise<WalletCashoutState> => {
  const { data, error } = await supabase.rpc('get_wallet_cashout_state');
  if (error) throw new Error(parseRpcError(error.message) || 'Çekim durumu alınamadı.');
  const d = data as any;
  const p = d?.pending_request;
  return {
    enabled: !!d.enabled,
    fee_pct: Number(d.fee_pct) || 0,
    min: Number(d.min) || 0,
    allow_full_balance: !!d.allow_full_balance,
    withdrawable: Number(d.withdrawable) || 0,
    topup_balance: Number(d.topup_balance) || 0,
    refund_credit_balance: Number(d.refund_credit_balance) || 0,
    identity_required: !!d.identity_required,
    identity_ok: !!d.identity_ok,
    profile_name_ok: !!d.profile_name_ok,
    pending_request: p
      ? {
          id: String(p.id),
          gross: Number(p.gross) || 0,
          fee: Number(p.fee) || 0,
          net: Number(p.net) || 0,
          status: p.status === 'PROCESSING' ? 'PROCESSING' : 'PENDING',
          iban_last4: String(p.iban_last4 ?? ''),
          created_at: String(p.created_at ?? ''),
          can_cancel: !!p.can_cancel,
        }
      : null,
  };
};

/** Çekim talebi — yalnız kayıtlı IBAN'a; brüt anında düşülür; %5 bedel sunucuda. */
export const requestWalletCashout = async (
  gross: number,
  methodId: string,
): Promise<{
  payout_id: string; gross: number; fee: number; net: number; iban_last4: string;
  from_topup: number; from_refund_credit: number;
}> => {
  const { data, error } = await supabase.rpc('request_wallet_cashout', {
    p_gross: gross, p_method_id: methodId,
  });
  if (error) throw new Error(parseRpcError(error.message) || 'Çekim talebi oluşturulamadı.');
  const d = data as any;
  return {
    payout_id: d.payout_id, gross: Number(d.gross) || 0, fee: Number(d.fee) || 0,
    net: Number(d.net) || 0, iban_last4: String(d.iban_last4 ?? ''),
    from_topup: Number(d.from_topup) || 0,
    from_refund_credit: Number(d.from_refund_credit) || 0,
  };
};

/**
 * Kullanıcı kendi BEKLEYEN çekim talebini iptal eder. Brüt tutar kova bazında
 * cüzdana geri döner ve hizmet bedeli alınmaz. Admin talebi işleme aldıysa
 * sunucu ALREADY_PROCESSING verir — yarış durumu satır kilidiyle çözülür.
 */
export const cancelWalletCashout = async (
  payoutId: string,
): Promise<{ payout_id: string; status: string; restored: number }> => {
  const { data, error } = await supabase.rpc('cancel_wallet_cashout', { p_payout_id: payoutId });
  if (error) throw new Error(parseRpcError(error.message) || 'Çekim talebi iptal edilemedi.');
  const d = data as any;
  return { payout_id: d.payout_id, status: String(d.status ?? ''), restored: Number(d.restored) || 0 };
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
