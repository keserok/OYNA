import { supabase } from '../supabaseClient';

// ─── FAZ 6 — Takım-vs-takım skor kaydı (oyuncu-hepsi-onaylar) ────────────────

export interface ScoreProposal {
  id: string;
  matchId: string;
  proposedBy: string;
  homeScore: number;
  awayScore: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUPERSEDED';
  createdAt: string;
}

export interface ScoreActionResult {
  proposalId: string;
  status: string;
  finalized?: boolean;
  approvals?: number;
  needed?: number;
}

function parseRpcError(message?: string): string | null {
  if (!message) return null;
  const m = message.match(/[A-Z_]+:\s*(.+)$/);
  if (m) return m[1];
  const bare: Record<string, string> = {
    NOT_PARTICIPANT: 'Yalnızca maça katılanlar skor önerebilir/onaylayabilir.',
    INVALID_SCORE: 'Geçersiz skor.',
    UNAUTHORIZED: 'Oturumun bulunamadı. Lütfen tekrar giriş yap.',
    NOT_FOUND: 'Öneri bulunamadı.',
  };
  const b = message.match(/\b([A-Z][A-Z_]{3,})\b/);
  return b && bare[b[1]] ? bare[b[1]] : message;
}

/** Maç skoru öner (katılımcı). Öneren otomatik onaylar. */
export const proposeMatchScore = async (
  matchId: string,
  home: number,
  away: number,
): Promise<ScoreActionResult> => {
  const { data, error } = await supabase.rpc('propose_match_score', {
    p_match_id: matchId, p_home: home, p_away: away,
  });
  if (error) throw new Error(parseRpcError(error.message) || 'Skor önerilemedi.');
  return {
    proposalId: data.proposal_id, status: data.status, finalized: data.finalized,
    approvals: data.approvals, needed: data.needed,
  };
};

/** Bekleyen skor önerisini onayla. Tüm katılımcılar onaylayınca kesinleşir. */
export const approveMatchScore = async (proposalId: string): Promise<ScoreActionResult> => {
  const { data, error } = await supabase.rpc('approve_match_score', { p_proposal_id: proposalId });
  if (error) throw new Error(parseRpcError(error.message) || 'Skor onaylanamadı.');
  return {
    proposalId: data.proposal_id, status: data.status, finalized: data.finalized,
    approvals: data.approvals, needed: data.needed,
  };
};

/** Bir maçın bekleyen skor önerisini getir (varsa). */
export const getPendingScoreProposal = async (matchId: string): Promise<ScoreProposal | null> => {
  const { data, error } = await supabase
    .from('match_score_proposals')
    .select('*')
    .eq('match_id', matchId)
    .eq('status', 'PENDING')
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id, matchId: data.match_id, proposedBy: data.proposed_by,
    homeScore: data.home_score, awayScore: data.away_score, status: data.status, createdAt: data.created_at,
  };
};
