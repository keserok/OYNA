import { supabase } from '../supabaseClient';
import { auth } from '../supabaseAuth';
import { mapError } from '../utils/errorMap';
import { subscribeWithResync } from './realtimeResync';

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

/**
 * Bir konuşmanın mesajlarını getir (eskiden yeniye — dönen sözleşme).
 *
 * BE-2: sorgu YENİDEN ESKİYE atılıp istemcide ters çevrilir. Eskiden
 * `ascending: true` + `limit` kullanılıyordu; bu "konuşmanın İLK 100 mesajı"
 * demekti — 100'ü aşan sohbetlerde en yeni mesajlar hiç yüklenmiyor, ekran
 * sessizce bayat kalıyordu. (teamChatService.getTeamMessages ile aynı desen.)
 *
 * @param beforeCreatedAt Eskiye doğru sayfalama imleci: elde bulunan EN ESKİ
 *   mesajın createdAt'i verilirse yalnız ondan öncekiler döner. Verilmezse
 *   davranış değişmez (en yeni `limit` mesaj).
 */
export const getMessages = async (
  conversationId: string,
  limit = 100,
  beforeCreatedAt?: string,
): Promise<Message[]> => {
  let query = supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId);
  // Filtre, order/limit'ten ÖNCE uygulanmalı (PostgrestFilterBuilder zinciri).
  if (beforeCreatedAt) query = query.lt('created_at', beforeCreatedAt);

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.warn('[message] mesajlar okunamadı:', error.message);
    return [];
  }
  // En yeniden geldi → çağıranın beklediği eskiden-yeniye sıraya çevir.
  return (data ?? []).reverse().map(mapMessage);
};

/** Mesaj gönder. */
export const sendMessage = async (conversationId: string, body: string): Promise<Message> => {
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
 *
 * DB-2: kanal koptuğunda o pencerede gelen INSERT'ler bir daha yayınlanmaz.
 * Yeniden bağlanınca `onResync` çağrılır; ekran KENDİ tam yüklemesini yapar.
 * Burada getMessages çağırıp onMessage'a beslemek YANLIŞ olurdu — ekranın
 * elindeki mesajlar ikinci kez eklenirdi.
 *
 * @param onResync Kopukluk sonrası tazeleme (opsiyonel, geriye uyumlu).
 * @returns aboneliği iptal eden fonksiyon.
 */
export const subscribeToConversation = (
  conversationId: string,
  onMessage: (m: Message) => void,
  onResync?: () => void,
): (() => void) =>
  subscribeWithResync({
    kanal: `conversation:${conversationId}`,
    baglan: (ch) => ch.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
      (payload) => onMessage(mapMessage(payload.new)),
    ),
    yenidenYukle: () => { onResync?.(); },
  });
