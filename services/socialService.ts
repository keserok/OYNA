// ================================================================
// socialService — Sosyal yeniden tasarımın kanonik veri katmanı.
// TÜM yazımlar SECURITY DEFINER RPC'lerle (Foundation Spec §6);
// kişiye-özel tablolar (friend_lists/prefs) RLS-owner CRUD ile.
// Eski friendService yalnız miras tüketiciler için yaşar (Küme 2'de ölür).
// ================================================================
import { supabase } from '../supabaseClient';

// ─── Tipler ─────────────────────────────────────────────────────

export type RelationshipState = 'NONE' | 'FRIENDS' | 'PENDING_OUT' | 'PENDING_IN';

export interface FriendRow {
  friendship_id: string;
  friend_id: string;
  full_name: string;
  avatar_url: string | null;
  oyna_id: string | null;
  pos: string | null;
  fp: number | null;
  win_count: number;
  total_matches: number;
  matches_together: number;
  is_favorite: boolean;
  list_ids: string[];
  last_active_at: string | null; // karşılıklı görünürlük kuralı sunucuda (F35)
  friends_since: string;
}

export interface FriendRequestRow {
  request_id: string;
  direction: 'IN' | 'OUT';
  other_id: string;
  full_name: string;
  avatar_url: string | null;
  oyna_id: string | null;
  pos: string | null;
  created_at: string;
}

export interface UserSearchRow {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  oyna_id: string | null;
  pos: string | null;
  relationship: RelationshipState;
  request_id: string | null;
  mutual_friends: number;
}

export interface TeammateRow extends Omit<UserSearchRow, 'mutual_friends'> {
  shared_matches: number;
}

export interface SuggestionRow extends UserSearchRow {}

export interface ContactMatchRow {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  oyna_id: string | null;
  relationship: RelationshipState;
  request_id: string | null;
}

export interface FriendList {
  id: string;
  owner_id: string;
  name: string;
  emoji: string | null;
  sort_order: number;
}

export interface FriendshipActionResult {
  ok: boolean;
  state: RelationshipState;
  request_id?: string | null;
  auto_accepted?: boolean;
}

export interface BlockedUserRow {
  blocked_id: string;
  full_name: string;
  avatar_url: string | null;
  oyna_id: string | null;
}

// RPC hata kodlarını kullanıcı-dostu Türkçe'ye çevir (repo deseni)
export const parseSocialError = (e: unknown): string => {
  const msg = (e as { message?: string })?.message || '';
  const map: Record<string, string> = {
    COOLDOWN: 'Bu kullanıcıya şimdilik tekrar istek gönderemezsin.',
    DAILY_LIMIT: 'Günlük istek sınırına ulaştın. Yarın tekrar dene.',
    PENDING_LIMIT: 'Çok fazla bekleyen isteğin var.',
    NOT_FOUND: 'Kullanıcı bulunamadı.',
    INVALID_TARGET: 'Bu işlem yapılamaz.',
    NOT_PENDING: 'İstek zaten yanıtlanmış.',
    LIST_LIMIT: 'Liste sınırına ulaştın.',
    NOT_FRIENDS: 'Bu işlem yalnız arkadaşlar için geçerli.',
    CANNOT_ADD_SELF: 'Kendini ekleyemezsin.',
    BATCH_TOO_LARGE: 'Tek seferde çok fazla kayıt gönderildi.',
    QUOTA: 'Günlük kota aşıldı. Yarın tekrar dene.',
    NOT_PARTICIPANT: 'Davet için maçın katılımcısı olmalısın.',
    UNAUTHORIZED: 'Bu işlem için yetkin yok.',
  };
  for (const key of Object.keys(map)) {
    if (msg.includes(key)) return map[key];
  }
  return 'Bir şeyler ters gitti. Tekrar dener misin?';
};

// ─── Arkadaşlık durum makinesi (Spec §6 / Bölüm C) ──────────────

export const getFriends = async (): Promise<FriendRow[]> => {
  const { data, error } = await supabase.rpc('get_friends');
  if (error) throw error;
  return (data || []) as FriendRow[];
};

export const getFriendRequests = async (): Promise<FriendRequestRow[]> => {
  const { data, error } = await supabase.rpc('get_friend_requests');
  if (error) throw error;
  return (data || []) as FriendRequestRow[];
};

export const sendFriendRequest = async (targetId: string): Promise<FriendshipActionResult> => {
  const { data, error } = await supabase.rpc('send_friend_request', { p_target: targetId });
  if (error) throw error;
  return data as FriendshipActionResult;
};

export const respondFriendRequest = async (requestId: string, accept: boolean): Promise<FriendshipActionResult> => {
  const { data, error } = await supabase.rpc('respond_friend_request', {
    p_request_id: requestId, p_accept: accept,
  });
  if (error) throw error;
  return data as FriendshipActionResult;
};

export const cancelFriendRequest = async (requestId: string): Promise<void> => {
  const { error } = await supabase.rpc('cancel_friend_request', { p_request_id: requestId });
  if (error) throw error;
};

export const removeFriend = async (otherId: string): Promise<void> => {
  const { error } = await supabase.rpc('remove_friend', { p_other: otherId });
  if (error) throw error;
};

// ─── Keşif (Spec §6 / Bölüm B) ──────────────────────────────────

export const searchUsers = async (q: string, limit = 20, offset = 0): Promise<UserSearchRow[]> => {
  const { data, error } = await supabase.rpc('search_users', {
    p_q: q, p_limit: limit, p_offset: offset,
  });
  if (error) throw error;
  return (data || []) as UserSearchRow[];
};

export const getRecentTeammates = async (limit = 20): Promise<TeammateRow[]> => {
  const { data, error } = await supabase.rpc('get_recent_teammates', { p_limit: limit });
  if (error) throw error;
  return (data || []) as TeammateRow[];
};

export const getFriendSuggestions = async (limit = 10): Promise<SuggestionRow[]> => {
  const { data, error } = await supabase.rpc('get_friend_suggestions', { p_limit: limit });
  if (error) throw error;
  return (data || []) as SuggestionRow[];
};

/** Rehber eşleştirme — YALNIZ SHA-256 hash gönderilir (Spec B3). */
export const matchContacts = async (hashes: string[]): Promise<ContactMatchRow[]> => {
  const { data, error } = await supabase.rpc('match_contacts', { p_hashes: hashes });
  if (error) throw error;
  return (data || []) as ContactMatchRow[];
};

// ─── Referans (davet linki — Spec B) ────────────────────────────

export const getOrCreateReferralCode = async (): Promise<string> => {
  const { data, error } = await supabase.rpc('get_or_create_referral_code');
  if (error) throw error;
  return data as string;
};

export const redeemReferralCode = async (code: string): Promise<{ ok: boolean; reason?: string }> => {
  const { data, error } = await supabase.rpc('redeem_referral_code', { p_code: code });
  if (error) throw error;
  return data as { ok: boolean; reason?: string };
};

// ─── Listeler & favoriler (Spec Bölüm E — RLS owner CRUD) ──────

export const getFriendLists = async (): Promise<FriendList[]> => {
  const { data, error } = await supabase
    .from('friend_lists')
    .select('id, owner_id, name, emoji, sort_order')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []) as FriendList[];
};

export const createFriendList = async (ownerId: string, name: string, emoji?: string | null): Promise<FriendList> => {
  const { data, error } = await supabase
    .from('friend_lists')
    .insert({ owner_id: ownerId, name: name.trim(), emoji: emoji || null })
    .select('id, owner_id, name, emoji, sort_order')
    .single();
  if (error) throw error;
  return data as FriendList;
};

export const renameFriendList = async (listId: string, name: string, emoji?: string | null): Promise<void> => {
  const { error } = await supabase
    .from('friend_lists')
    .update({ name: name.trim(), emoji: emoji ?? null })
    .eq('id', listId);
  if (error) throw error;
};

export const deleteFriendList = async (listId: string): Promise<void> => {
  const { error } = await supabase.from('friend_lists').delete().eq('id', listId);
  if (error) throw error;
};

export const addFriendToList = async (listId: string, memberId: string): Promise<void> => {
  const { error } = await supabase
    .from('friend_list_members')
    .insert({ list_id: listId, member_id: memberId });
  if (error && !`${error.message}`.includes('duplicate')) throw error;
};

export const removeFriendFromList = async (listId: string, memberId: string): Promise<void> => {
  const { error } = await supabase
    .from('friend_list_members')
    .delete()
    .eq('list_id', listId)
    .eq('member_id', memberId);
  if (error) throw error;
};

export const setFriendFavorite = async (ownerId: string, friendId: string, favorite: boolean): Promise<void> => {
  if (favorite) {
    const { error } = await supabase
      .from('friend_prefs')
      .upsert({ owner_id: ownerId, friend_id: friendId, is_favorite: true });
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('friend_prefs')
      .delete()
      .eq('owner_id', ownerId)
      .eq('friend_id', friendId);
    if (error) throw error;
  }
};

// ─── Liste → maç daveti (FCFS — Spec §3.4) ─────────────────────

export const inviteListToMatch = async (matchId: string, listId: string): Promise<{ sent: number; skipped: number }> => {
  const { data, error } = await supabase.rpc('invite_list_to_match', {
    p_match_id: matchId, p_list_id: listId,
  });
  if (error) throw error;
  return data as { sent: number; skipped: number };
};

export const declineMatchListInvite = async (inviteId: string): Promise<void> => {
  const { error } = await supabase.rpc('respond_match_list_invite', {
    p_invite_id: inviteId, p_decline: true,
  });
  if (error) throw error;
};

/** IP-06: kaptanın "eksik oyuncu ilanı". Sunucu kapıları: kaptan, maça <24 saat,
 *  boş slot, maç başına 2 saatte 1, kişi başına günde 1, en fazla 50 kişi.
 *  Dönen değer: bildirim gönderilen kişi sayısı. */
export const broadcastOpenSlot = async (matchId: string): Promise<number> => {
  const { data, error } = await supabase.rpc('broadcast_open_slot', { p_match_id: matchId });
  if (error) throw error;
  return Number((data as { sent?: number } | null)?.sent ?? 0);
};

/** Tekil "Maça Çağır" — mevcut send_match_invite makinesi (D23; tek makine ilkesi). */
export const inviteFriendToMatch = async (
  matchId: string, targetUserId: string, senderId: string,
): Promise<void> => {
  const { error } = await supabase.rpc('send_match_invite', {
    p_match_id: matchId,
    p_target_user_id: targetUserId,
    p_sender_id: senderId,
    p_team_id: null,
  });
  if (error) throw error;
};

// ─── Engelleme & şikâyet (Spec E31-33) ─────────────────────────

/** Tam-sonuçlu engel: arkadaşlık da düşer (E31). */
export const blockUserFully = async (blockerId: string, blockedId: string): Promise<void> => {
  const { error } = await supabase
    .from('user_blocks')
    .insert({ blocker_id: blockerId, blocked_id: blockedId });
  if (error && !`${error.message}`.includes('duplicate')) throw error;
  // Arkadaşlıksa sessizce düşür; bekleyen istekler de aynı RPC'de temizlenir
  try { await removeFriend(blockedId); } catch { /* arkadaş değillerse sorun değil */ }
};

export const unblockUser = async (blockerId: string, blockedId: string): Promise<void> => {
  const { error } = await supabase
    .from('user_blocks')
    .delete()
    .eq('blocker_id', blockerId)
    .eq('blocked_id', blockedId);
  if (error) throw error;
};

export const getBlockedUsers = async (blockerId: string): Promise<BlockedUserRow[]> => {
  const { data, error } = await supabase
    .from('user_blocks')
    .select('blocked_id')
    .eq('blocker_id', blockerId);
  if (error) throw error;
  const ids = (data || []).map(r => r.blocked_id);
  if (ids.length === 0) return [];
  const { data: profiles, error: pErr } = await supabase
    .from('public_profiles')
    .select('id, full_name, avatar_url, oyna_id')
    .in('id', ids);
  if (pErr) throw pErr;
  return (profiles || []).map(p => ({
    blocked_id: p.id,
    full_name: p.full_name || 'Oyuncu',
    avatar_url: p.avatar_url,
    oyna_id: p.oyna_id,
  }));
};

export type ReportReason = 'SPAM' | 'HARASSMENT' | 'FAKE_PROFILE' | 'CHEATING' | 'OTHER';

/** Şikâyet — mevcut user_reports backend'ine bağlanır (E33). */
export const reportUser = async (
  reporterId: string,
  reportedId: string,
  reason: ReportReason,
  note?: string,
  contextType: 'PROFILE' | 'CHAT' | 'MATCH' = 'PROFILE',
): Promise<void> => {
  const { error } = await supabase.from('user_reports').insert({
    reporter_id: reporterId,
    reported_id: reportedId,
    reason,
    note: note?.trim() || null,
    context_type: contextType,
  });
  if (error) throw error;
};

// ─── Bildirim-güdümlü tazeleme sinyali (Spec F36) ───────────────
// Sosyal ekran, kendi ayrık kanalıyla bildirim INSERT'lerini dinler;
// friend_*/team_* olayı gelince ekran verisini yeniden çeker.

export const subscribeSocialEvents = (
  userId: string,
  onEvent: (typeKey: string) => void,
): (() => void) => {
  const channel = supabase
    .channel(`social-events:${userId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      payload => {
        const row = payload.new as { type_key?: string; inbox?: boolean };
        // Sohbet trafiği sosyal veriyi değiştirmez — tazeleme tetiklemesin
        if (row?.inbox === false || row?.type_key === 'team_chat_message') return;
        onEvent(String(row?.type_key || ''));
      },
    )
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
};

// ─── Heartbeat (Spec F34) ───────────────────────────────────────
// Ön planda ~2,5 dk'da bir + görünürlüğe dönüşte çağrılır; arka planda durur.

const HEARTBEAT_MS = 150_000;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

export const touchLastActive = async (userId: string): Promise<void> => {
  try {
    await supabase
      .from('profiles')
      .update({ last_active_at: new Date().toISOString() })
      .eq('id', userId);
  } catch { /* sessiz — presence en-iyi-çaba */ }
};

export const startPresenceHeartbeat = (userId: string): (() => void) => {
  stopPresenceHeartbeat();
  void touchLastActive(userId);
  heartbeatTimer = setInterval(() => {
    if (typeof document === 'undefined' || document.visibilityState === 'visible') {
      void touchLastActive(userId);
    }
  }, HEARTBEAT_MS);
  const onVisible = () => {
    if (document.visibilityState === 'visible') void touchLastActive(userId);
  };
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    stopPresenceHeartbeat();
    document.removeEventListener('visibilitychange', onVisible);
  };
};

export const stopPresenceHeartbeat = (): void => {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
};
