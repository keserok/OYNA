import { supabase } from '../supabaseClient';

// Komisyon SSOT: commission_config tablosunu okuyan calculate_commission RPC'sinin
// (migration 20260707000007_faz7_model_b_net.sql) ince sarmalayıcısı.
// Tek doğru kaynak: oyuncu/sağlayıcı/tesis sahibi/admin aynı rakamı buradan görür.

export type CommissionScope = 'GLOBAL' | 'PITCH' | 'SERVICE_GK' | 'SERVICE_REF' | 'MATCH';
export type CommissionModel = 'MODEL_A' | 'MODEL_B';

export interface CommissionBreakdown {
  /** İşlem tutarı (baz). */
  amount: number;
  /** OYNA komisyon oranı (%). */
  commissionPct: number;
  /** MODEL_B markup oranı (%) — oyuncuya eklenen. MODEL_A'da 0. */
  markupPct: number;
  /** OYNA'nın toplam payı (komisyon + markup). */
  oynaTake: number;
  /** Sağlayıcı/tesis sahibinin eline geçen net tutar. */
  ownerNet: number;
  /** Ödeyenin toplam ödediği tutar (MODEL_B'de markup dahil). */
  payerTotal: number;
  model: CommissionModel;
}

/**
 * Aktif komisyon dökümünü getirir. Hata/oturum yoksa null döner (çağıran taraf
 * tutarı gizlemeden "hesaplanamadı" fallback'i gösterebilsin).
 */
export async function getCommissionBreakdown(
  amount: number,
  scope: CommissionScope = 'GLOBAL',
  scopeId?: string | null,
  model: CommissionModel = 'MODEL_A',
): Promise<CommissionBreakdown | null> {
  try {
    const { data, error } = await supabase.rpc('calculate_commission', {
      p_amount: amount,
      p_scope: scope,
      p_scope_id: scopeId ?? null,
      p_model: model,
    });
    if (error || !data) return null;
    const d = data as any;
    return {
      amount: Number(d.amount ?? amount),
      commissionPct: Number(d.commission_pct ?? 0),
      markupPct: Number(d.markup_pct ?? 0),
      oynaTake: Number(d.oyna_take ?? d.commission_amt ?? 0),
      ownerNet: Number(d.owner_net ?? d.net_amount ?? amount),
      payerTotal: Number(d.player_total ?? amount),
      model: (d.model as CommissionModel) ?? model,
    };
  } catch {
    return null;
  }
}
