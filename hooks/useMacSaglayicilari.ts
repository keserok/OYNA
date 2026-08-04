import { useCallback, useEffect, useState } from 'react';
import { getMatchProviders, type MatchProvider } from '../services/matchService';
import { getMatchServiceRequests } from '../services/serviceRequestService';
import type { ServiceRequest } from '../types';

// ════════════════════════════════════════════════════════════════════════════
// [K-15.1] MAÇ LOBİSİ — KALECİ & HAKEM ALANI
// ────────────────────────────────────────────────────────────────────────────
// Kurucu kararı K-15.1: MatchJoin.tsx ÜRÜN KAVRAMLARINA göre bölünür.
// Bu dosya "Kaleci-Hakem" (pazaryeri) öbeğidir.
//
// NEDEN AYRI: K-5.1 (kaleci teminatı + online ödeme) doğrudan buraya dokunuyor.
// Bölme ölçütü: kurucunun bir cümlesi = tek bir dosya. Bundan sonra
// "kaleci kuralını değiştirelim" dendiğinde YALNIZ bu dosya açılır.
//
// KAPSAM: maça ATANMIŞ sağlayıcılar (ev kalecisi, deplasman kalecisi, hakem)
// ve maçın açık hizmet TALEPLERİ. Ekranın kendisi (modaller, kartlar)
// MatchJoin'de kalır; burası yalnız VERİYİ getirir ve tazeler.
//
// İKİ TARAFLI KALECİ: gk_id = ev sahibi, away_gk_id = deplasman. Her takım
// kendi kalecisini ayrı kiralar; bu yüzden ikisi ayrı tutulur.
// ════════════════════════════════════════════════════════════════════════════

export interface MacSaglayicilari {
  /** Maça atanmış ev sahibi kalecisi. Yoksa null. */
  assignedGoalkeeper: MatchProvider | null;
  /** Maça atanmış deplasman kalecisi. Yoksa null. */
  assignedAwayGoalkeeper: MatchProvider | null;
  /** Maça atanmış hakem. Yoksa null. */
  assignedReferee: MatchProvider | null;
  /** Maçın açık/geçmiş hizmet talepleri. */
  serviceRequests: ServiceRequest[];
  /** Talepleri sunucudan yeniden çeker (bir aksiyondan sonra çağrılır). */
  refreshServiceRequests: () => Promise<void>;
}

/**
 * @param macId        Lobisi açık olan maçın kimliği.
 * @param gkId         Ev sahibi kalecisinin kimliği (maç satırından).
 * @param awayGkId     Deplasman kalecisinin kimliği.
 * @param refId        Hakemin kimliği.
 */
export function useMacSaglayicilari(
  macId: string | undefined,
  gkId: string | null,
  awayGkId: string | null,
  refId: string | null,
): MacSaglayicilari {
  const [assignedGoalkeeper, setAssignedGoalkeeper] = useState<MatchProvider | null>(null);
  const [assignedAwayGoalkeeper, setAssignedAwayGoalkeeper] = useState<MatchProvider | null>(null);
  const [assignedReferee, setAssignedReferee] = useState<MatchProvider | null>(null);
  const [serviceRequests, setServiceRequests] = useState<ServiceRequest[]>([]);

  const refreshServiceRequests = useCallback(async () => {
    if (!macId) return;
    try {
      const reqs = await getMatchServiceRequests(macId);
      setServiceRequests(reqs);
    } catch (err) {
      // Sessiz geçmiyoruz: talepler yüklenemezse ekranda liste boş görünür,
      // sebebini kayıtta görebilelim.
      console.warn('[useMacSaglayicilari] hizmet talepleri yüklenemedi:', err);
    }
  }, [macId]);

  useEffect(() => { void refreshServiceRequests(); }, [refreshServiceRequests]);

  // Atanmış sağlayıcılar: üç kimlikten en az biri doluysa çekilir.
  useEffect(() => {
    if (!gkId && !awayGkId && !refId) {
      setAssignedGoalkeeper(null);
      setAssignedAwayGoalkeeper(null);
      setAssignedReferee(null);
      return;
    }
    let alive = true;
    getMatchProviders(gkId, refId, awayGkId)
      .then(({ goalkeeper, awayGoalkeeper, referee }) => {
        if (!alive) return;
        setAssignedGoalkeeper(goalkeeper);
        setAssignedAwayGoalkeeper(awayGoalkeeper);
        setAssignedReferee(referee);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [gkId, awayGkId, refId]);

  return {
    assignedGoalkeeper,
    assignedAwayGoalkeeper,
    assignedReferee,
    serviceRequests,
    refreshServiceRequests,
  };
}
