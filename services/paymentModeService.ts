import { supabase } from '../supabaseClient';
import type { PaymentMode, PaymentModeResolution } from '../types';

/**
 * ÖDEME MODU — tek doğruluk kaynağı istemci sarmalayıcısı.
 *
 * Etkin mod ASLA istemcide hesaplanmaz; `resolve_payment_mode` RPC'si hesaplar.
 * Sebebi: global mod bir tavandır ve ödeme sağlayıcısı canlı değilken online
 * ödeme hiçbir koşulda açılmamalıdır. Bu kuralı sunucuda tutmak, arayüzü
 * atlatan çağrıların da aynı kurala çarpmasını garanti eder.
 */

/** Sunucuya ulaşılamazsa dönülecek güvenli varsayılan: para akmaz. */
const SAFE_FALLBACK: PaymentModeResolution = {
  effective_mode: 'CASH_ONLY',
  global_mode: 'CASH_ONLY',
  pitch_mode: null,
  locked: false,
  provider: 'SIMULATION',
  provider_live: false,
  cash_allowed: true,
  online_allowed: false,
  reason: 'PROVIDER_NOT_LIVE',
};

/**
 * Etkin ödeme modunu çözer.
 * @param pitchId Tesis id'si. Verilmezse yalnızca platform geneli duruş döner
 *                (cüzdan/ödeme yüzeylerinin hiç gösterilip gösterilmeyeceği).
 */
export async function resolvePaymentMode(pitchId?: string | null): Promise<PaymentModeResolution> {
  try {
    const { data, error } = await supabase.rpc('resolve_payment_mode', {
      p_pitch_id: pitchId ?? null,
    });
    if (error) throw error;
    if (!data) return SAFE_FALLBACK;
    return data as PaymentModeResolution;
  } catch (error) {
    console.error('resolvePaymentMode:', error);
    // Hata durumunda online ödeme AÇILMAZ — fail-safe.
    return SAFE_FALLBACK;
  }
}

/**
 * Saha sahibi kendi tesisinin mod TERCİHİNİ yazar.
 * Global tavan izin vermiyorsa tercih saklanır ama etkin mod değişmez;
 * dönen çözümleme bunu arayüze dürüstçe bildirir.
 */
export async function setOwnerPaymentMode(
  pitchId: string,
  mode: PaymentMode,
): Promise<PaymentModeResolution> {
  const { data, error } = await supabase.rpc('owner_set_payment_mode', {
    p_pitch_id: pitchId,
    p_mode: mode,
  });
  if (error) throw error;
  return data as PaymentModeResolution;
}

/** Mod anahtarının kullanıcıya gösterilecek Türkçe adı. */
export function paymentModeLabel(mode: PaymentMode): string {
  switch (mode) {
    case 'CASH_ONLY':
      return 'Sahada Ödeme';
    case 'ONLINE_ONLY':
      return 'Online Ödeme';
    case 'HYBRID':
      return 'Oyuncu Seçsin';
  }
}

/** Modun ne anlama geldiğinin bir cümlelik açıklaması. */
export function paymentModeDescription(mode: PaymentMode): string {
  switch (mode) {
    case 'CASH_ONLY':
      return 'Rezervasyon bir taleptir; ücret tesiste tahsil edilir. Uygulama içinde para alınmaz.';
    case 'ONLINE_ONLY':
      return 'Rezervasyon uygulama içinde ödeme yapılarak kesinleşir.';
    case 'HYBRID':
      return 'Oyuncu, rezervasyon sırasında sahada ödeme ile online ödeme arasında seçim yapar.';
  }
}

/**
 * Etkin modun neden o değere düştüğünü açıklar. Saha sahibi "online'ı açtım
 * ama görünmüyor" dediğinde cevabı burasıdır.
 */
export function paymentModeReasonText(res: PaymentModeResolution): string | null {
  switch (res.reason) {
    case 'PROVIDER_NOT_LIVE':
      return 'Ödeme altyapısı henüz canlıya alınmadı; şu an tüm tesislerde yalnızca sahada ödeme geçerli.';
    case 'GLOBAL_CASH_ONLY':
      return 'Platform şu anda nakit modunda; online ödeme geçici olarak kapalı.';
    case 'GLOBAL_ONLINE_ONLY':
      return 'Platform şu anda online ödeme modunda; tüm rezervasyonlar uygulama içinden ödenir.';
    case 'GLOBAL_HYBRID':
    case 'PITCH_CHOICE':
      return null;
    default:
      return null;
  }
}
