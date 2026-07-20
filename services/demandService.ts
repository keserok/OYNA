import { supabase } from '../supabaseClient';

// ═══════════════════════════════════════════════════════════════════════════
// COLD-START — talep sinyali veri katmanı
// Boş şehir/bölgede oyuncu "beni haberdar et" (NOTIFY) veya "saha öner"
// (SUGGEST) der. UI ancak bu çağrı GERÇEKTEN başarılıysa "kaydettik" der;
// yazma denetimli SECURITY DEFINER RPC'den (record_demand_signal) geçer.
// ═══════════════════════════════════════════════════════════════════════════

export type DemandSignalType = 'NOTIFY' | 'SUGGEST';

export interface DemandSignalInput {
  type: DemandSignalType;
  city?: string;
  district?: string;
  /** SUGGEST için zorunlu: önerilen sahanın adı. */
  pitchName?: string;
  /** Opsiyonel: önerilen sahanın telefon/iletişimi. */
  contact?: string;
  note?: string;
}

export interface DemandSignalResult {
  ok: true;
  /** NOTIFY zaten kayıtlıysa true (idempotent — "zaten listedesin"). */
  duplicate: boolean;
}

/** RPC hatasını kullanıcıya dürüst, okunur Türkçe mesaja çevirir. */
export function mapDemandError(err: unknown): string {
  const raw = (err as { message?: string })?.message ?? String(err ?? '');
  if (/PITCH_NAME_REQUIRED/i.test(raw)) return 'Lütfen önerdiğin sahanın adını yaz.';
  if (/UNAUTHORIZED/i.test(raw)) return 'Bunun için giriş yapman gerekiyor.';
  if (/INVALID_TYPE/i.test(raw)) return 'Geçersiz istek.';
  if (/Failed to fetch|NetworkError|fetch failed|Load failed/i.test(raw)) {
    return 'Bağlantı yok gibi. İnternetini kontrol edip tekrar dene.';
  }
  return 'Talebin kaydedilemedi. Lütfen tekrar dene.';
}

export async function recordDemandSignal(input: DemandSignalInput): Promise<DemandSignalResult> {
  const { data, error } = await supabase.rpc('record_demand_signal', {
    p_type: input.type,
    p_city: input.city ?? null,
    p_district: input.district ?? null,
    p_pitch_name: input.pitchName ?? null,
    p_contact: input.contact ?? null,
    p_note: input.note ?? null,
  });
  if (error) throw error;
  const row = (data ?? {}) as { duplicate?: boolean };
  return { ok: true, duplicate: !!row.duplicate };
}
