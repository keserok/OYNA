import { supabase } from '../supabaseClient';

// ════════════════════════════════════════════════════════════════════════════
// Kaptan → çok sağlayıcı TEKLİF (offer) akışı istemci sarmalayıcıları.
// Teklifler match_block_deposit içinde (kapora bloke edilince) sunucu tarafında
// gönderilir; istemci yalnız sağlayıcı yanıtını ve gelen teklif listesini yönetir.
// (migration 20260716000002)
// ════════════════════════════════════════════════════════════════════════════

export interface MatchServiceOffer {
  id: string;
  match_id: string;
  provider_type: 'GK' | 'REF';
  fee: number;
  status: string;
  created_at: string;
  expires_at?: string | null;
  match_title?: string | null;
  location?: string | null;
  date?: string | null;
  time?: string | null;
  format?: string | null;
}

/** Sağlayıcının bekleyen (PENDING) tekliflerini getirir (ServiceDashboard). */
export const getMyMatchServiceOffers = async (): Promise<MatchServiceOffer[]> => {
  const { data, error } = await supabase.rpc('get_my_match_service_offers');
  if (error) throw error;
  return (data ?? []) as MatchServiceOffer[];
};

/** Sağlayıcı bir teklifi kabul/red eder. Kabulde ücret bloke edilir (escrow). */
export const respondMatchServiceOffer = async (
  offerId: string,
  accept: boolean,
): Promise<{ ok: boolean; status?: string; request_id?: string; reason?: string }> => {
  const { data, error } = await supabase.rpc('respond_match_service_offer', {
    p_offer_id: offerId,
    p_accept: accept,
  });
  if (error) throw error;
  return (data ?? { ok: false }) as any;
};
