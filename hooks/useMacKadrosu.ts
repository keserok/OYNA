import { useEffect, useState } from 'react';
import { getMatchLobbyParticipants, type LobbyParticipant } from '../services/matchService';

// ════════════════════════════════════════════════════════════════════════════
// [K-15.1] MAÇ LOBİSİ — KADRO ALANI
// ────────────────────────────────────────────────────────────────────────────
// Kurucu kararı K-15.1: MatchJoin.tsx ÜRÜN KAVRAMLARINA göre bölünür.
// Bu dosya "Kadro" öbeğidir.
//
// NEDEN AYRI: K-3.4 (aylık maç bırakma hakkı) ve K-3.5 (slot devri) doğrudan
// buraya dokunuyor. Bölme ölçütü: kurucunun bir cümlesi = tek bir dosya.
//
// KAPSAM: lobide görünen katılımcı listesi (ev sahibi + deplasman). Slot
// seçme/doldurma gibi EKRAN durumları MatchJoin'de kalır; burası yalnız
// "kimler kadroda" sorusunun cevabını sunucudan getirir.
//
// ⚠️ BİLİNEN ÖLÇEK SORUNU (Mimar M-13, HENÜZ KAPATILMADI):
// getMatchLobbyParticipants tek çağrıda DÖRT sorgu atıyor. Bir kişi slot
// alınca maç satırı değişiyor, lobideki HER istemcinin `dolulukImzasi`'sı
// değişiyor ve hepsi bu dört sorguyu yeniden atıyor. 14 kişilik bir lobide
// 14 satın alma = 784 sorgu. Kalıcı çözüm: sunucuda tek RPC + gecikme
// (debounce). Buraya taşınmış olması o işi KOLAYLAŞTIRIR — tek dosya.
// ════════════════════════════════════════════════════════════════════════════

export interface MacKadrosu {
  /** Lobideki tüm katılımcılar (iki taraf birlikte). */
  lobbyParticipants: LobbyParticipant[];
  homeParticipants: LobbyParticipant[];
  awayParticipants: LobbyParticipant[];
}

/**
 * @param macId          Lobisi açık olan maçın kimliği.
 * @param homeTeamId     Ev sahibi takım kimliği (varsa).
 * @param awayTeamId     Deplasman takım kimliği (varsa).
 * @param dolulukImzasi  "Kaç slot dolu" özeti. Değişince liste tazelenir —
 *                       yani biri slot alınca/bırakınca kadro güncellenir.
 */
export function useMacKadrosu(
  macId: string | undefined,
  homeTeamId: string | undefined,
  awayTeamId: string | undefined,
  dolulukImzasi: string,
): MacKadrosu {
  const [lobbyParticipants, setLobbyParticipants] = useState<LobbyParticipant[]>([]);

  useEffect(() => {
    if (!macId) return;
    let alive = true;
    getMatchLobbyParticipants(macId, homeTeamId, awayTeamId)
      .then((list) => { if (alive) setLobbyParticipants(list); })
      .catch(() => {});
    return () => { alive = false; };
    // dolulukImzasi bilerek bağımlılıkta: slot doluluğu değişince tazelenmeli.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [macId, dolulukImzasi, homeTeamId, awayTeamId]);

  return {
    lobbyParticipants,
    homeParticipants: lobbyParticipants.filter((p) => p.side === 'home'),
    awayParticipants: lobbyParticipants.filter((p) => p.side === 'away'),
  };
}
