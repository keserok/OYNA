import { supabase } from '../supabaseClient';
import { mapError } from '../utils/errorMap';

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

// IP-12: ortak çeviri utils/errorMap.ts'te. Buradaki sözlük yalnız BU
// bağlamda daha isabetli olan mesajları ezer.
const OZEL: Record<string, string> = {
  FORBIDDEN: 'Bu işlem için yetkin yok (takım üyesi/yönetici değilsin).',
  NOT_FOUND: 'Taktik bulunamadı.',
};
const parseRpcError = (message?: string): string | null =>
  message ? mapError(message, undefined, OZEL) : null;

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
  tempo: number; // 1-10 (DB kolonu text; RPC değeri olduğu gibi taşır)
  identity: string;
  /** İyimser kilit: taktik açıldığındaki "updatedAt". Uyuşmazsa sunucu CONFLICT
      verir (sessiz emek kaybını önler). Verilmezse kilit devre dışı (yeni kayıt). */
  expectedUpdatedAt?: string | null;
}

/** save_team_tactic sonucu (updated_at ile — istemci beklenen damgayı tazeler). */
export interface TacticSaveResult { tacticId: string; status: string; updatedAt: string | null; }

/** İyimser kilit çakışması — istemci bunu "üzerine yaz / yenile" diyaloguna çevirir. */
export class TacticConflictError extends Error {
  code = 'CONFLICT' as const;
  constructor() { super('Taktik sen açtıktan sonra değişti.'); this.name = 'TacticConflictError'; }
}

/** Taktiği tek kapıdan kaydet: status SUNUCUDA belirlenir (yönetici →
    APPROVED, üye → PENDING_APPROVAL + yöneticilere bildirim; takımsız →
    kişisel APPROVED). p_tactic_id verilirse günceller. */
export const saveTeamTactic = async (
  teamId: string | null,
  tacticId: string | null,
  payload: TacticSavePayload,
): Promise<TacticSaveResult> => {
  const { data, error } = await supabase.rpc('save_team_tactic', {
    p_team_id: teamId, p_tactic_id: tacticId, p_payload: payload,
  });
  if (error) {
    if (/\bCONFLICT\b/.test(error.message || '')) throw new TacticConflictError();
    throw new Error(parseRpcError(error.message) || 'Taktik kaydedilemedi.');
  }
  return {
    tacticId: data.tactic_id as string,
    status: data.status as string,
    updatedAt: (data.updated_at as string) ?? null,
  };
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

/**
 * KENDİ taktiğini sil (kişisel kütüphane satırı).
 *
 * Yetki tamamen veritabanındaki `tactics_delete` kuralına dayanır:
 * yalnız `userId = auth.uid()` olan satır silinebilir. Yani başkasının ya da
 * takımın (senin yazmadığın) taktiği bu yolla silinemez.
 *
 * Kural engellediğinde Postgres HATA VERMEZ, sadece 0 satır etkiler; bu yüzden
 * silinen satır geri istenir ve boş dönerse sessiz başarısızlık yerine açık
 * hata fırlatılır.
 */
export const deleteMyTactic = async (tacticId: string): Promise<void> => {
  const { data, error } = await supabase
    .from('tactics')
    .delete()
    .eq('id', tacticId)
    .select('id');
  if (error) throw new Error(parseRpcError(error.message) ?? 'Taktik silinemedi.');
  if (!data || data.length === 0) {
    throw new Error('Taktik silinemedi — yalnız kendi kaydettiğin taktikleri silebilirsin.');
  }
};

/** Taktik paylaşım linkini aç/yenile/kapat (yalnız yazar — N92).
    enabled=true her çağrıda YENİ token üretir. → oyna.app/t/{token} */
export const setTacticShareLink = async (
  tacticId: string, enabled: boolean,
): Promise<string | null> => {
  const { data, error } = await supabase.rpc('set_tactic_share_link', {
    p_tactic_id: tacticId, p_enabled: enabled,
  });
  if (error) throw new Error(parseRpcError(error.message) || 'Paylaşım linki ayarlanamadı.');
  return (data as { share_token: string | null }).share_token;
};

export const tacticShareUrl = (token: string): string => `https://oyna.app/t/${token}`;

// ─── Maç Taktik Önerileri (tek lobi P3) — kişi başı 1 öneri ──────────────────
// Kadrodaki herkes Stüdyo'daki KENDİ taktiğinden birini önerir; öneriler yalnız
// Maçlarım (MANAGE) lobisinin altında listelenir. (match_id, proposer_id) PK'sı
// kişi başı tek öneriyi DB'de garanti eder; tekrar önermek üstüne yazar.

export interface MatchTacticProposal {
  proposer_id: string;
  proposer_name: string;
  proposer_avatar: string;
  tactic_id: string;
  tactic_name: string | null;
  formation: string | null;
  size: string | null;
  created_at: string;
}

export const getMatchTacticProposals = async (matchId: string): Promise<MatchTacticProposal[]> => {
  const { data, error } = await supabase.rpc('get_match_tactic_proposals', { p_match_id: matchId });
  if (error) throw new Error(parseRpcError(error.message) || 'Taktik önerileri yüklenemedi.');
  return (data as MatchTacticProposal[]) ?? [];
};

export const proposeMatchTactic = async (matchId: string, tacticId: string): Promise<void> => {
  const { error } = await supabase.rpc('propose_match_tactic', {
    p_match_id: matchId, p_tactic_id: tacticId,
  });
  if (error) throw new Error(parseRpcError(error.message) || 'Taktik önerilemedi.');
};

export const withdrawMatchTactic = async (matchId: string): Promise<void> => {
  const { error } = await supabase.rpc('withdraw_match_tactic', { p_match_id: matchId });
  if (error) throw new Error(parseRpcError(error.message) || 'Öneri geri çekilemedi.');
};

export interface MyTacticLite { id: string; name: string | null; formation: string | null; size: string | null }

/** Öneri seçicisi için kullanıcının kendi Stüdyo taktikleri (hafif liste, RLS-kapsamlı). */
export const listMyTacticsLite = async (): Promise<MyTacticLite[]> => {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData?.user?.id;
  if (!uid) return [];
  const { data, error } = await supabase
    .from('tactics')
    .select('id, name, formation, size')
    .eq('userId', uid)
    .order('updatedAt', { ascending: false })
    .limit(30);
  if (error) {
    console.warn('[tactic] taktik listesi okunamadı:', error.message);
    return [];
  }
  return (data as MyTacticLite[]) ?? [];
};

// ─── Stüdyo telemetrisi — anonim olay sayacı (KİŞİSEL İÇERİK YAZILMAZ) ─────────

export type StudioEvent = 'studio_open' | 'tactic_save' | 'tactic_play' | 'sample_load';

/** Ateşle-unut: yalnız olay adını sayar; taktik verisi/isim GÖNDERMEZ. Hata
    kullanıcı akışını asla bozmaz (sessiz yutulur). Sunucu allowlist'i doğrular. */
export const logStudioEvent = (event: StudioEvent): void => {
  try {
    const p = supabase.rpc('log_studio_event', { p_event: event }) as unknown as Promise<unknown>;
    if (p && typeof p.then === 'function') p.then(() => {}, () => {}); // başarı/başarısızlık sessiz
  } catch { /* çevrimdışı / RPC yok — yok say */ }
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
