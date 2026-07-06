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

// ─── Stüdyo köprüsü (Küme 3) — tek kayıt kapısı + hidrasyon ─────────

/** save_team_tactic RPC girdisi: Stüdyo'nun TacticState alanları.
    slots/subs/opponents/drawings dizi olarak gider; sunucu TEXT yazar
    (jsonb dönüşümü Aşama 2'de — eski istemci JSON.parse uyumu). */
export interface TacticSavePayload {
  name: string;
  size: string;
  formation: string;
  slots: unknown[];
  subs: unknown[];
  opponents: unknown[];
  drawings: unknown[];
  captainId: string | null;
  notes: string;
  mentality: string;
  tempo: string;
  identity: string;
}

/** Taktiği tek kapıdan kaydet: status SUNUCUDA belirlenir (yönetici →
    APPROVED, üye → PENDING_APPROVAL + yöneticilere bildirim; takımsız →
    kişisel APPROVED). p_tactic_id verilirse günceller. */
export const saveTeamTactic = async (
  teamId: string | null,
  tacticId: string | null,
  payload: TacticSavePayload,
): Promise<{ tacticId: string; status: string }> => {
  const { data, error } = await supabase.rpc('save_team_tactic', {
    p_team_id: teamId, p_tactic_id: tacticId, p_payload: payload,
  });
  if (error) throw new Error(parseRpcError(error.message) || 'Taktik kaydedilemedi.');
  return { tacticId: data.tactic_id as string, status: data.status as string };
};

/** Bekleyen takım taktiği önerisini onayla (yalnız yönetici). */
export const approveTacticRpc = async (tacticId: string): Promise<void> => {
  const { error } = await supabase.rpc('approve_tactic', { p_tactic_id: tacticId });
  if (error) throw new Error(parseRpcError(error.message) || 'Taktik onaylanamadı.');
};

/** Öneriyi reddet — yazarın emeği kişisel kütüphanesine kopyalanır (M88). */
export const rejectTacticRpc = async (tacticId: string): Promise<void> => {
  const { error } = await supabase.rpc('reject_tactic', { p_tactic_id: tacticId });
  if (error) throw new Error(parseRpcError(error.message) || 'Taktik reddedilemedi.');
};

/** Tek taktiği ham satır olarak getir (derin bağlantı hidrasyonu —
    RLS: kendi taktiğin veya üyesi olduğun takımın taktiği). */
export const getTacticById = async (tacticId: string): Promise<Record<string, any> | null> => {
  const { data, error } = await supabase
    .from('tactics')
    .select('*')
    .eq('id', tacticId)
    .maybeSingle();
  if (error) {
    console.warn('[tactic] taktik okunamadı:', error.message);
    return null;
  }
  return data as Record<string, any> | null;
};

// ─── Maça taktik atama (L76) ────────────────────────────────────────

/** Maça onaylı takım taktiği ata (yalnız yönetici; maç başına tek plan). */
export const assignMatchTactic = async (matchId: string, tacticId: string): Promise<void> => {
  const { error } = await supabase.rpc('assign_match_tactic', {
    p_match_id: matchId, p_tactic_id: tacticId,
  });
  if (error) throw new Error(parseRpcError(error.message) || 'Taktik atanamadı.');
};

export interface MatchTacticInfo {
  tacticId: string;
  teamId: string;
  name: string | null;
  formation: string | null;
  size: string | null;
}

/** Maça atanmış takım planı (yalnız o takımın üyeleri görür — RLS). */
export const getMatchTactic = async (matchId: string): Promise<MatchTacticInfo | null> => {
  const { data, error } = await supabase
    .from('match_tactics')
    .select('tactic_id, team_id, tactics(name, formation, size)')
    .eq('match_id', matchId)
    .maybeSingle();
  if (error || !data) return null;
  const t = (data as any).tactics;
  return {
    tacticId: (data as any).tactic_id,
    teamId: (data as any).team_id,
    name: t?.name ?? null,
    formation: t?.formation ?? null,
    size: t?.size ?? null,
  };
};
