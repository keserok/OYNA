import { supabase } from '../supabaseClient';

// ════════════════════════════════════════════════════════════════════════════
// Maç escrow yaşam-döngüsü servis sarmalayıcıları (20260716000001 migration).
//   blockMatchDeposit  → kaptan kaporayı BLOKE eder, maç ACTIVE olur,
//                         ertelenmiş kaleci/hakem talepleri gönderilir.
//   checkMatchThreshold→ eşik (toplam−2) dolunca maçı LIVE yapar + kaporayı capture eder.
//   cancelMatchByCaptain → 24s kuralı + no-show politikası.
//   adminMatchDepositAction → admin panel TAM YETKİ (CAPTURE|VOID|REFUND).
//
// ⚠️ FIXME: Gerçek iyzico ön-provizyon/capture/void/iade `create-payment` edge
//   function'ında bağlanmalı; şu an SIMULATION'da DB-tamamdır. Prod'a almadan
//   staging/Pro-branch'te test edin (bkz. migration başlığı).
// ════════════════════════════════════════════════════════════════════════════

export type ProviderKind = 'GK' | 'REF';
/** Aktivasyonda gönderilecek teklif seçimi: belirli sağlayıcılar veya "tümüne". */
export interface DeferredProvider { type: ProviderKind; providerIds: string[]; all: boolean }

/** Kaptan kaporayı bloke eder (çekilmez) → maç ACTIVE + sağlayıcı talepleri gönderilir. */
export const blockMatchDeposit = async (
  matchId: string,
  amount: number,
  providers: DeferredProvider[] = [],
): Promise<{ ok: boolean; intent_id?: string; deposit_status?: string; min_players?: number }> => {
  const { data, error } = await supabase.rpc('match_block_deposit', {
    p_match_id: matchId,
    p_amount: amount,
    p_providers: providers,
  });
  if (error) throw error;
  return (data ?? { ok: false }) as any;
};

/** Katılım/ayrılış sonrası eşiği kontrol eder; dolduysa maç LIVE + kapora capture. */
export const checkMatchThreshold = async (
  matchId: string,
): Promise<{ live: boolean; filled: number; min_players: number; total: number }> => {
  const { data, error } = await supabase.rpc('match_check_threshold', { p_match_id: matchId });
  if (error) throw error;
  return (data ?? { live: false, filled: 0, min_players: 0, total: 0 }) as any;
};

/** Kaptan maçı iptal eder — 24s kuralı: ≥24s iade (komisyon hariç) / <24s no-show. */
export const cancelMatchByCaptain = async (matchId: string): Promise<{ ok: boolean; outcome?: string }> => {
  const { data, error } = await supabase.rpc('match_cancel_by_captain', { p_match_id: matchId });
  if (error) throw error;
  return (data ?? { ok: false }) as any;
};

/** ADMIN — tam yetkiyle kapora işlemi (CAPTURE | VOID | REFUND). */
export const adminMatchDepositAction = async (
  matchId: string,
  action: 'CAPTURE' | 'VOID' | 'REFUND',
  reason?: string,
): Promise<{ ok: boolean; deposit_status?: string }> => {
  const { data, error } = await supabase.rpc('admin_match_deposit_action', {
    p_match_id: matchId,
    p_action: action,
    p_reason: reason ?? null,
  });
  if (error) throw error;
  return (data ?? { ok: false }) as any;
};
