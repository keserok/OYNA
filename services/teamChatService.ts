import { supabase } from '../supabaseClient';

// ================================================================
// teamChatService — takım sohbeti veri katmanı (Küme 4 / Spec §N90)
// 1:1 makinesine DOKUNMAZ (messageService ayrı); takım sohbeti ayrı
// tablo + ayrı servis. Push: send_team_message sunucuda sessize
// almayan üyelere inbox=false taşıyıcı satırlar üretir.
// ================================================================

export interface TeamChatOverviewRow {
  team_id: string;
  team_name: string;
  crest_config: unknown;
  color1: string | null;
  color2: string | null;
  last_body: string | null;
  last_sender: string | null;
  last_at: string | null;
  unread_count: number;
  muted: boolean;
}

export interface TeamMessage {
  id: string;
  teamId: string;
  senderId: string;
  senderName: string;
  senderAvatar: string | null;
  body: string;
  createdAt: string;
}

const parseChatError = (e: unknown): string => {
  const msg = (e as { message?: string })?.message || '';
  const map: Record<string, string> = {
    NOT_MEMBER: 'Takım sohbeti üyeler içindir.',
    ARCHIVED: 'Takım arşivde — sohbet kapalı.',
    EMPTY_MESSAGE: 'Boş mesaj gönderilemez.',
    UNAUTHORIZED: 'Oturumun bulunamadı. Lütfen tekrar giriş yap.',
  };
  for (const key of Object.keys(map)) if (msg.includes(key)) return map[key];
  return 'Mesaj gönderilemedi. Tekrar dener misin?';
};

/** Birleşik gelen kutusu için takım sohbet özetleri (son mesaj + okunmamış). */
export const getTeamChatOverview = async (): Promise<TeamChatOverviewRow[]> => {
  const { data, error } = await supabase.rpc('get_team_chat_overview');
  if (error) {
    console.warn('[teamChat] özet okunamadı:', error.message);
    return [];
  }
  return ((data as any[]) ?? []).map(r => ({
    ...r,
    unread_count: Number(r.unread_count ?? 0),
    muted: !!r.muted,
  }));
};

/** Takım sohbet geçmişi (eskiden yeniye; RLS: yalnız üyeler). */
export const getTeamMessages = async (teamId: string, limit = 100): Promise<TeamMessage[]> => {
  const { data, error } = await supabase
    .from('team_messages')
    .select('id, team_id, sender_id, body, created_at, profiles(full_name, avatar_url)')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.warn('[teamChat] mesajlar okunamadı:', error.message);
    return [];
  }
  return ((data as any[]) ?? []).reverse().map(r => ({
    id: r.id,
    teamId: r.team_id,
    senderId: r.sender_id,
    senderName: r.profiles?.full_name || 'Oyuncu',
    senderAvatar: r.profiles?.avatar_url ?? null,
    body: r.body,
    createdAt: r.created_at,
  }));
};

/** Mesaj gönder — sunucu üyelik/arşiv doğrular, push taşıyıcılarını üretir. */
export const sendTeamMessage = async (teamId: string, body: string): Promise<TeamMessage> => {
  const { data, error } = await supabase.rpc('send_team_message', {
    p_team_id: teamId, p_body: body,
  });
  if (error) throw new Error(parseChatError(error));
  return {
    id: data.id,
    teamId: data.team_id,
    senderId: data.sender_id,
    senderName: '', // gönderen kendisi — UI kendi adını kullanır
    senderAvatar: null,
    body: data.body,
    createdAt: data.created_at,
  };
};

export const markTeamChatRead = async (teamId: string): Promise<void> => {
  const { error } = await supabase.rpc('mark_team_chat_read', { p_team_id: teamId });
  if (error) console.warn('[teamChat] okundu işaretlenemedi:', error.message);
};

export const setTeamChatMuted = async (teamId: string, muted: boolean): Promise<void> => {
  const { error } = await supabase.rpc('set_team_chat_muted', {
    p_team_id: teamId, p_muted: muted,
  });
  if (error) throw new Error(parseChatError(error));
};

/** Takım sohbetinin yeni mesajlarına realtime abone ol.
    Not: payload profil içermez — gönderen adı çağıranın kadro haritasından
    ya da ayrı sorgudan tamamlanır. */
export const subscribeTeamChat = (
  teamId: string,
  onMessage: (m: Omit<TeamMessage, 'senderName' | 'senderAvatar'>) => void,
): (() => void) => {
  const channel = supabase
    .channel(`team-chat:${teamId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'team_messages', filter: `team_id=eq.${teamId}` },
      payload => {
        const r = payload.new as any;
        onMessage({
          id: r.id, teamId: r.team_id, senderId: r.sender_id,
          body: r.body, createdAt: r.created_at,
        });
      },
    )
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
};

// ── Taktik kartı işaretçisi — sohbette zengin kart (Küme 4 / P çıktısı) ──
// Gövde deseni: "[taktik:UUID] Ad · Diziliş"
const TACTIC_MARKER = /^\[taktik:([0-9a-f-]{36})\]\s*(.*)$/i;

export const tacticMessageBody = (tacticId: string, name: string, formation?: string | null): string =>
  `[taktik:${tacticId}] ${name}${formation ? ` · ${formation}` : ''}`;

export const parseTacticMessage = (body: string): { tacticId: string; label: string } | null => {
  const m = TACTIC_MARKER.exec(body);
  return m ? { tacticId: m[1], label: m[2] || 'Taktik' } : null;
};
