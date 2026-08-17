import { supabase } from '../supabaseClient';
import { auth } from '../supabaseAuth';
import { mapError } from '../utils/errorMap';
import { uygunsuzMu, UYGUNSUZ_ICERIK_MESAJI } from '../shared/icerikSuzgeci';

// ─── FAZ 6 — 1-1 Mesajlaşma (yalnız arkadaşlar, realtime) ────────────────────

export interface ConversationSummary {
  id: string;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  otherId: string;
  otherName: string | null;
  otherAvatar: string | null;
  otherOynaId: string | null;
  unreadCount: number;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

const mapMessage = (r: any): Message => ({
  id: r.id,
  conversationId: r.conversation_id,
  senderId: r.sender_id,
  body: r.body,
  readAt: r.read_at ?? null,
  createdAt: r.created_at,
});

// IP-12: ortak çeviri utils/errorMap.ts'te. Buradaki sözlük yalnız BU
// bağlamda daha isabetli olan mesajları ezer.
const OZEL: Record<string, string> = {
  NOT_FRIENDS: 'Yalnızca arkadaşlarınla mesajlaşabilirsin.',
  BLOCKED: 'Engelleme nedeniyle mesajlaşılamıyor.',
};
const parseRpcError = (message?: string): string | null =>
  message ? mapError(message, undefined, OZEL) : null;

/** Bir arkadaşla konuşma getir/oluştur → conversation id. */
export const getOrCreateConversation = async (otherUserId: string): Promise<string> => {
  const { data, error } = await supabase.rpc('get_or_create_conversation', { p_other: otherUserId });
  if (error) throw new Error(parseRpcError(error.message) || 'Konuşma açılamadı.');
  return data as string;
};

/** Konuşma listesi (diğer kullanıcı + okunmamış sayısı). */
export const getMyConversations = async (): Promise<ConversationSummary[]> => {
  const { data, error } = await supabase.rpc('get_my_conversations');
  if (error) {
    console.warn('[message] konuşmalar okunamadı:', error.message);
    return [];
  }
  return ((data as any[]) ?? []).map((r) => ({
    id: r.id,
    lastMessageAt: r.last_message_at ?? null,
    lastMessagePreview: r.last_message_preview ?? null,
    otherId: r.other_id,
    otherName: r.other_name ?? null,
    otherAvatar: r.other_avatar ?? null,
    otherOynaId: r.other_oyna_id ?? null,
    unreadCount: Number(r.unread_count ?? 0),
  }));
};

/** Bir konuşmanın mesajlarını getir (eskiden yeniye). */
export const getMessages = async (conversationId: string, limit = 100): Promise<Message[]> => {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) {
    console.warn('[message] mesajlar okunamadı:', error.message);
    return [];
  }
  return (data ?? []).map(mapMessage);
};

/** Mesaj gönder. */
export const sendMessage = async (conversationId: string, body: string): Promise<Message> => {
  // App Store 1.2 — uygunsuz içerik SÜZGECİ. Sunucuya gitmeden burada durur:
  // engellenen mesaj hiç kaydedilmez, karşı tarafa bildirim de düşmez.
  if (uygunsuzMu(body)) throw new Error(UYGUNSUZ_ICERIK_MESAJI);

  const { data, error } = await supabase.rpc('send_message', {
    p_conversation_id: conversationId,
    p_body: body,
  });
  if (error) throw new Error(parseRpcError(error.message) || 'Mesaj gönderilemedi.');
  return mapMessage(data);
};

/** Konuşmayı okundu işaretle. */
export const markConversationRead = async (conversationId: string): Promise<void> => {
  const { error } = await supabase.rpc('mark_conversation_read', { p_conversation_id: conversationId });
  if (error) console.warn('[message] okundu işaretlenemedi:', error.message);
};

/** Kullanıcıyı engelle / engeli kaldır. */
export const blockUser = async (otherUserId: string, block: boolean): Promise<void> => {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Oturumun bulunamadı.');
  if (block) {
    const { error } = await supabase.from('user_blocks').upsert(
      { blocker_id: uid, blocked_id: otherUserId },
      { onConflict: 'blocker_id,blocked_id' },
    );
    if (error) throw new Error('Kullanıcı engellenemedi.');
  } else {
    const { error } = await supabase.from('user_blocks').delete().eq('blocker_id', uid).eq('blocked_id', otherUserId);
    if (error) throw new Error('Engel kaldırılamadı.');
  }
};

/**
 * Bir konuşmanın yeni mesajlarına realtime abone ol.
 * @returns aboneliği iptal eden fonksiyon.
 */
export const subscribeToConversation = (
  conversationId: string,
  onMessage: (m: Message) => void,
): (() => void) => {
  const channel = supabase
    .channel(`conversation:${conversationId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
      (payload) => onMessage(mapMessage(payload.new)),
    )
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
};
