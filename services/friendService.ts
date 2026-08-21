// ═══════════════════════════════════════════════════════════════
// OYNA — Friend Service
// friendships tablosu üzerinden arkadaşlık yönetimi.
// RLS: sender_id veya receiver_id = auth.uid()
// ═══════════════════════════════════════════════════════════════
import { supabase } from '../supabaseClient';

export interface FriendProfile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  oyna_id: string | null;
  win_count: number;
  total_matches: number;
  last_active_at: string | null;
  roles: string[] | null;
}

export interface FriendshipRow {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  sender_group: string | null;
  receiver_group: string | null;
  sender_is_favorite: boolean;
  receiver_is_favorite: boolean;
  matches_together: number;
  created_at: string;
  other_user: FriendProfile;
  // derived
  iAmSender: boolean;
  myGroup: string | null;
  isFavorite: boolean;
}

export interface FriendRequest {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: 'PENDING';
  created_at: string;
  sender: FriendProfile;
}

// Mevcut kullanıcının kabul edilmiş arkadaşlarını getirir
export const fetchFriends = async (userId: string): Promise<FriendshipRow[]> => {
  const { data, error } = await supabase
    .from('friendships')
    .select(`
      id, sender_id, receiver_id, status,
      sender_group, receiver_group,
      sender_is_favorite, receiver_is_favorite,
      matches_together, created_at
    `)
    .eq('status', 'ACCEPTED')
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`);

  if (error) throw error;
  if (!data || data.length === 0) return [];

  // Karşı tarafın ID'lerini topla
  const otherIds = data.map(r => r.sender_id === userId ? r.receiver_id : r.sender_id);

  const { data: profiles, error: pError } = await supabase
    .from('public_profiles')
    .select('id, full_name, avatar_url, oyna_id, win_count, total_matches, last_active_at, roles')
    .in('id', otherIds);

  if (pError) throw pError;

  const profileMap = new Map((profiles || []).map(p => [p.id, p]));

  return data.map(r => {
    const iAmSender = r.sender_id === userId;
    const otherId = iAmSender ? r.receiver_id : r.sender_id;
    return {
      ...r,
      status: r.status as 'PENDING' | 'ACCEPTED' | 'REJECTED',
      other_user: profileMap.get(otherId) || { id: otherId, full_name: null, avatar_url: null, oyna_id: null, win_count: 0, total_matches: 0, last_active_at: null, roles: null },
      iAmSender,
      myGroup: iAmSender ? r.sender_group : r.receiver_group,
      isFavorite: iAmSender ? r.sender_is_favorite : r.receiver_is_favorite,
    };
  });
};

// Bekleyen gelen istekleri getirir
export const fetchPendingRequests = async (userId: string): Promise<FriendRequest[]> => {
  const { data, error } = await supabase
    .from('friendships')
    .select('id, sender_id, receiver_id, status, created_at')
    .eq('receiver_id', userId)
    .eq('status', 'PENDING');

  if (error) throw error;
  if (!data || data.length === 0) return [];

  const senderIds = data.map(r => r.sender_id);

  const { data: profiles } = await supabase
    .from('public_profiles')
    .select('id, full_name, avatar_url, oyna_id, win_count, total_matches, last_active_at, roles')
    .in('id', senderIds);

  const profileMap = new Map((profiles || []).map(p => [p.id, p]));

  return data.map(r => ({
    ...r,
    status: 'PENDING' as const,
    sender: profileMap.get(r.sender_id) || { id: r.sender_id, full_name: null, avatar_url: null, oyna_id: null, win_count: 0, total_matches: 0, last_active_at: null, roles: null },
  }));
};

// ── SÖKÜLDÜ (20 Ağu 2026 çapraz incelemesi) ────────────────────────────────
// sendFriendRequest / acceptFriendRequest / removeFriendship /
// updateFriendGroup / toggleFriendFavorite buradan kaldırıldı: hepsi
// friendships tablosuna DOĞRUDAN yazıyordu ve RLS bunu bilinçli olarak
// engelliyor (tabloda yalnız SELECT politikası var). Arkadaşlık yazmalarının
// tek kapısı socialService'teki RPC'lerdir: send_friend_request,
// respond_friend_request, cancel_friend_request, remove_friend.

// Kullanıcının takımlarını getirir (kaptan veya üye)
export const fetchUserTeams = async (userId: string) => {
  const { data: captainTeams, error: cErr } = await supabase
    .from('teams')
    .select('id, name, shortName, logo, color1, color2, wins, losses, matches, roster, captain_id, captains, players')
    .eq('captain_id', userId);

  if (cErr) throw cErr;

  const { data: memberRows, error: mErr } = await supabase
    .from('team_members')
    .select('team_id')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (mErr) throw mErr;

  const captainTeamIds = new Set((captainTeams || []).map(t => t.id));
  const memberOnlyIds = (memberRows || [])
    .map(r => r.team_id)
    .filter(id => !captainTeamIds.has(id));

  let memberTeams: any[] = [];
  if (memberOnlyIds.length > 0) {
    const { data, error: tErr } = await supabase
      .from('teams')
      .select('id, name, shortName, logo, color1, color2, wins, losses, matches, roster, captain_id, captains, players')
      .in('id', memberOnlyIds);
    if (tErr) throw tErr;
    memberTeams = data || [];
  }

  return {
    captainTeams: captainTeams || [],
    memberTeams,
  };
};
