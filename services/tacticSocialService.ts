import { supabase } from '../supabaseClient';

// ─── FAZ 6 — Takım Taktik Sosyal Motoru (oylama/yorum/favori/aktif/kopyala) ──

/** "En İyi Taktikler" vitrini öğesi (aggregate). */
export interface TacticShowcaseItem {
  id: string;
  name: string | null;
  formation: string | null;
  size: string | null;
  status: string | null;
  is_active: boolean;
  proposed_by: string | null;
  priority: number | null;
  avg_vote: number;       // ortalama oy %
  vote_count: number;
  fav_count: number;
  comment_count: number;
  i_favorited: boolean;
  my_vote: number | null;
}

export interface TacticComment {
  id: string;
  tacticId: string;
  userId: string;
  body: string;
  createdAt: string;
}

function parseRpcError(message?: string): string | null {
  if (!message) return null;
  const m = message.match(/[A-Z_]+:\s*(.+)$/);
  if (m) return m[1];
  const bare: Record<string, string> = {
    FORBIDDEN: 'Bu işlem için yetkin yok (takım üyesi/yönetici değilsin).',
    NOT_TEAM_TACTIC: 'Yalnızca takım taktikleri için geçerli.',
    UNAUTHORIZED: 'Oturumun bulunamadı. Lütfen tekrar giriş yap.',
    NOT_FOUND: 'Taktik bulunamadı.',
  };
  const b = message.match(/\b([A-Z][A-Z_]{3,})\b/);
  return b && bare[b[1]] ? bare[b[1]] : message;
}

/** Takımın "En İyi Taktikler" vitrinini getir (aktif → oy % → favori sıralı). */
export const getTeamTacticsShowcase = async (teamId: string): Promise<TacticShowcaseItem[]> => {
  const { data, error } = await supabase.rpc('get_team_tactics_showcase', { p_team_id: teamId });
  if (error) {
    console.warn('[tactic] vitrin okunamadı:', error.message);
    return [];
  }
  return ((data as any[]) ?? []).map((r) => ({
    ...r,
    is_active: !!r.is_active,
    avg_vote: Number(r.avg_vote ?? 0),
    vote_count: Number(r.vote_count ?? 0),
    fav_count: Number(r.fav_count ?? 0),
    comment_count: Number(r.comment_count ?? 0),
    i_favorited: !!r.i_favorited,
    my_vote: r.my_vote == null ? null : Number(r.my_vote),
  }));
};

/** Taktiğe % oy ver (0-100). */
export const voteTactic = async (tacticId: string, percent: number): Promise<void> => {
  const { error } = await supabase.rpc('vote_tactic', { p_tactic_id: tacticId, p_percent: Math.round(percent) });
  if (error) throw new Error(parseRpcError(error.message) || 'Oy kaydedilemedi.');
};

/** Taktiğe yorum yap. */
export const commentTactic = async (tacticId: string, body: string): Promise<TacticComment> => {
  const { data, error } = await supabase.rpc('comment_tactic', { p_tactic_id: tacticId, p_body: body });
  if (error) throw new Error(parseRpcError(error.message) || 'Yorum gönderilemedi.');
  return {
    id: data.id, tacticId: data.tactic_id, userId: data.user_id, body: data.body, createdAt: data.created_at,
  };
};

/** Taktiğin yorumlarını getir. */
export const getTacticComments = async (tacticId: string): Promise<TacticComment[]> => {
  const { data, error } = await supabase
    .from('tactic_comments')
    .select('*')
    .eq('tactic_id', tacticId)
    .order('created_at', { ascending: true });
  if (error) {
    console.warn('[tactic] yorumlar okunamadı:', error.message);
    return [];
  }
  return (data ?? []).map((r: any) => ({
    id: r.id, tacticId: r.tactic_id, userId: r.user_id, body: r.body, createdAt: r.created_at,
  }));
};

/** Favori aç/kapat → yeni favori durumu. */
export const toggleTacticFavorite = async (tacticId: string): Promise<boolean> => {
  const { data, error } = await supabase.rpc('toggle_tactic_favorite', { p_tactic_id: tacticId });
  if (error) throw new Error(parseRpcError(error.message) || 'Favori güncellenemedi.');
  return !!data;
};

/** Aktif taktiği ayarla (yalnız yönetici; takımda tek aktif). */
export const setActiveTactic = async (tacticId: string): Promise<void> => {
  const { error } = await supabase.rpc('set_active_tactic', { p_tactic_id: tacticId });
  if (error) throw new Error(parseRpcError(error.message) || 'Aktif taktik ayarlanamadı.');
};

/** Bir taktiği kopyala & öner (PENDING_APPROVAL klon) → yeni taktik id. */
export const copyTactic = async (tacticId: string, teamId?: string): Promise<string> => {
  const { data, error } = await supabase.rpc('copy_tactic', { p_tactic_id: tacticId, p_team_id: teamId ?? null });
  if (error) throw new Error(parseRpcError(error.message) || 'Taktik kopyalanamadı.');
  return data as string;
};
