// ═══════════════════════════════════════════════════════════════════════════
// OYNA — Chat Service Layer
// İki sınırlı sohbet türü için tüm client tarafı operasyonları:
//   • PLAYER_SEEK  : Kaptan ↔ Oyuncu (Top Oyna / Takıma Katıl başvurusu)
//   • SERVICE_OFFER: Kaptan ↔ Kaleci/Hakem (teklif kabul edildiğinde)
// Realtime için Supabase postgres_changes kullanılır (mesaj DB-persisted).
// Presence ve typing için Supabase Broadcast channel kullanılır.
// ═══════════════════════════════════════════════════════════════════════════

import { supabase } from '../supabaseClient';
import type { RealtimeChannel } from '@supabase/supabase-js';

// ─── Tipler ────────────────────────────────────────────────────────────────

export type ConversationType = 'PLAYER_SEEK' | 'SERVICE_OFFER';
export type OtherRole = 'Oyuncu' | 'Kaleci' | 'Hakem';

export interface InboxItem {
  conversation_id: string;
  type: ConversationType;
  other_user_id: string;
  other_name: string;
  other_avatar: string | null;
  other_role: OtherRole;
  last_message_preview: string | null;
  last_message_at: string;
  unread_count: number;
}

export interface ChatMessageRow {
  id: string;
  sender_id: string;
  body: string;
  body_masked: string;
  is_system: boolean;
  created_at: string;
  delivered_at: string | null;
  read_at: string | null;
}

export interface ConversationMeta {
  id: string;
  type: ConversationType;
  captain_id: string;
  other_id: string;
  captain_name: string;
  captain_avatar: string | null;
  other_name: string;
  other_avatar: string | null;
  other_role: OtherRole;
  last_message_at: string;
  last_message_preview: string | null;
}

export type ReportReason = 'SPAM' | 'HARASSMENT' | 'HATE' | 'PROFANITY' | 'SCAM' | 'OTHER';

// ─── 1. Gelen Kutusu ───────────────────────────────────────────────────────

export const getInbox = async (): Promise<InboxItem[]> => {
  const { data, error } = await supabase.rpc('get_my_inbox');
  if (error) {
    console.error('[chatService] getInbox error:', error);
    return [];
  }
  return (data ?? []) as InboxItem[];
};

// Inbox değişikliklerini canlı dinle (yeni konuşma veya unread count değişimi)
export const subscribeToInbox = (
  userId: string,
  onChange: () => void
): (() => void) => {
  const channel = supabase
    .channel(`inbox:${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'conversations' },
      (payload) => {
        const row: any = payload.new ?? payload.old;
        if (row && (row.captain_id === userId || row.other_id === userId)) {
          onChange();
        }
      }
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'conversation_participants_state', filter: `user_id=eq.${userId}` },
      () => onChange()
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
};

// ─── 2. Konuşma Detayı ─────────────────────────────────────────────────────

export const getConversation = async (
  conversationId: string
): Promise<ConversationMeta | null> => {
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', conversationId)
    .single();
  if (error) {
    console.error('[chatService] getConversation error:', error);
    return null;
  }
  return data as ConversationMeta;
};

export const getMessages = async (
  conversationId: string,
  limit = 50,
  before?: string
): Promise<ChatMessageRow[]> => {
  const { data, error } = await supabase.rpc('get_conversation_messages', {
    p_conversation_id: conversationId,
    p_limit: limit,
    p_before: before ?? null,
  });
  if (error) {
    console.error('[chatService] getMessages error:', error);
    return [];
  }
  // RPC en yeni → en eskiye dönüyor; UI'ya artan zaman sırasıyla verelim
  return ((data ?? []) as ChatMessageRow[]).slice().reverse();
};

// ─── 3. Mesaj Gönderme ─────────────────────────────────────────────────────

export interface SendResult {
  success: boolean;
  message?: ChatMessageRow;
  error?: string;
  errorCode?: 'RATE_LIMITED' | 'PROFANITY_BLOCKED' | 'BLOCKED' | 'NOT_A_PARTICIPANT' | 'UNKNOWN';
}

export const sendMessage = async (
  conversationId: string,
  senderId: string,
  body: string
): Promise<SendResult> => {
  const trimmed = body.trim();
  if (!trimmed) return { success: false, error: 'Boş mesaj gönderilemez.', errorCode: 'UNKNOWN' };
  if (trimmed.length > 2000) return { success: false, error: 'Mesaj çok uzun (max 2000).', errorCode: 'UNKNOWN' };

  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: senderId,
      body: trimmed,
      body_masked: trimmed, // Trigger sunucuda yeniden maskeleyecek
      is_system: false,
    })
    .select()
    .single();

  if (error) {
    const code: SendResult['errorCode'] = error.message.includes('RATE_LIMITED')
      ? 'RATE_LIMITED'
      : error.message.includes('PROFANITY_BLOCKED')
      ? 'PROFANITY_BLOCKED'
      : error.message.includes('BLOCKED')
      ? 'BLOCKED'
      : error.message.includes('NOT_A_PARTICIPANT')
      ? 'NOT_A_PARTICIPANT'
      : 'UNKNOWN';
    return { success: false, error: error.message, errorCode: code };
  }

  return { success: true, message: data as ChatMessageRow };
};

// ─── 4. Realtime: Yeni mesajları dinle ─────────────────────────────────────

export const subscribeToMessages = (
  conversationId: string,
  onNewMessage: (msg: ChatMessageRow) => void,
  onMessageUpdate?: (msg: ChatMessageRow) => void
): (() => void) => {
  const channel = supabase
    .channel(`messages:${conversationId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
      (payload) => onNewMessage(payload.new as ChatMessageRow)
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
      (payload) => onMessageUpdate?.(payload.new as ChatMessageRow)
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
};

// ─── 5. Okundu işaretle ────────────────────────────────────────────────────

export const markAsRead = async (conversationId: string): Promise<void> => {
  const { error } = await supabase.rpc('mark_conversation_read', {
    p_conversation_id: conversationId,
  });
  if (error) console.error('[chatService] markAsRead error:', error);
};

// ─── 6. Geçmişimi sil ──────────────────────────────────────────────────────

export const clearMyHistory = async (conversationId: string): Promise<boolean> => {
  const { error } = await supabase.rpc('clear_my_chat_history', {
    p_conversation_id: conversationId,
  });
  if (error) {
    console.error('[chatService] clearMyHistory error:', error);
    return false;
  }
  return true;
};

// ─── 7. Engelleme ──────────────────────────────────────────────────────────

export const blockUser = async (blockedUserId: string, reason?: string): Promise<boolean> => {
  const { error } = await supabase.rpc('block_user', {
    p_blocked_id: blockedUserId,
    p_reason: reason ?? null,
  });
  if (error) {
    console.error('[chatService] blockUser error:', error);
    return false;
  }
  return true;
};

export const unblockUser = async (blockedUserId: string): Promise<boolean> => {
  const { error } = await supabase.rpc('unblock_user', { p_blocked_id: blockedUserId });
  if (error) {
    console.error('[chatService] unblockUser error:', error);
    return false;
  }
  return true;
};

export const getMyBlockedUsers = async (): Promise<Array<{ blocked_id: string; reason: string | null; created_at: string }>> => {
  const { data, error } = await supabase
    .from('user_blocks')
    .select('blocked_id, reason, created_at')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[chatService] getMyBlockedUsers error:', error);
    return [];
  }
  return data ?? [];
};

// ─── 8. Şikayet ────────────────────────────────────────────────────────────

export const reportMessage = async (
  messageId: string,
  reason: ReportReason,
  details?: string
): Promise<{ success: boolean; reportId?: string }> => {
  const { data, error } = await supabase.rpc('report_message', {
    p_message_id: messageId,
    p_reason: reason,
    p_details: details ?? null,
  });
  if (error) {
    console.error('[chatService] reportMessage error:', error);
    return { success: false };
  }
  return { success: true, reportId: data as string };
};

// ─── 9. Presence (Online/Offline + Son Görülme) ────────────────────────────

let _heartbeatTimer: ReturnType<typeof setInterval> | null = null;

export const setMyPresenceOnline = async (userId: string): Promise<void> => {
  await supabase
    .from('user_presence')
    .upsert({ user_id: userId, is_online: true, last_seen_at: new Date().toISOString() });

  if (_heartbeatTimer) clearInterval(_heartbeatTimer);
  _heartbeatTimer = setInterval(async () => {
    await supabase
      .from('user_presence')
      .upsert({ user_id: userId, is_online: true, last_seen_at: new Date().toISOString() });
  }, 30_000);
};

export const setMyPresenceOffline = async (userId: string): Promise<void> => {
  if (_heartbeatTimer) {
    clearInterval(_heartbeatTimer);
    _heartbeatTimer = null;
  }
  await supabase
    .from('user_presence')
    .upsert({ user_id: userId, is_online: false, last_seen_at: new Date().toISOString() });
};

export const getUserPresence = async (
  userId: string
): Promise<{ is_online: boolean; last_seen_at: string } | null> => {
  const { data, error } = await supabase
    .from('user_presence')
    .select('is_online, last_seen_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    console.error('[chatService] getUserPresence error:', error);
    return null;
  }
  return data ?? null;
};

export const subscribeToUserPresence = (
  userId: string,
  onChange: (p: { is_online: boolean; last_seen_at: string }) => void
): (() => void) => {
  const channel = supabase
    .channel(`presence:${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'user_presence', filter: `user_id=eq.${userId}` },
      (payload) => {
        const row: any = payload.new;
        if (row) onChange({ is_online: !!row.is_online, last_seen_at: row.last_seen_at });
      }
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
};

// ─── 10. Typing Indicator (Broadcast — kaydedilmez) ────────────────────────

export interface TypingChannel {
  channel: RealtimeChannel;
  sendTyping: () => void;
  unsubscribe: () => void;
}

export const openTypingChannel = (
  conversationId: string,
  myUserId: string,
  onOtherTyping: (otherUserId: string) => void
): TypingChannel => {
  const channel = supabase.channel(`typing:${conversationId}`, {
    config: { broadcast: { self: false } },
  });

  channel
    .on('broadcast', { event: 'typing' }, ({ payload }: any) => {
      if (payload?.user_id && payload.user_id !== myUserId) onOtherTyping(payload.user_id);
    })
    .subscribe();

  let lastSent = 0;
  const sendTyping = () => {
    const now = Date.now();
    if (now - lastSent < 1500) return; // 1.5sn throttle
    lastSent = now;
    channel.send({ type: 'broadcast', event: 'typing', payload: { user_id: myUserId } });
  };

  return {
    channel,
    sendTyping,
    unsubscribe: () => {
      supabase.removeChannel(channel);
    },
  };
};

// ─── 11. KVKK: Veri export ─────────────────────────────────────────────────

export const exportMyChatData = async (): Promise<any | null> => {
  const { data, error } = await supabase.rpc('export_my_chat_data');
  if (error) {
    console.error('[chatService] exportMyChatData error:', error);
    return null;
  }
  return data;
};

export const downloadMyChatExport = async () => {
  const data = await exportMyChatData();
  if (!data) return false;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `oyna-mesaj-gecmisim-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return true;
};

// ─── 12. Yardımcı: Son görülme metni ───────────────────────────────────────

export const formatLastSeen = (isoTs: string, isOnline: boolean): string => {
  if (isOnline) return 'Çevrimiçi';
  const diff = Date.now() - new Date(isoTs).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Az önce';
  if (mins < 60) return `${mins} dk önce`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} sa önce`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} gün önce`;
  return new Date(isoTs).toLocaleDateString('tr-TR');
};
