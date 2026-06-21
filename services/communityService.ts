// ═══════════════════════════════════════════════════════════════
// OYNA — Community Service
// communities + community_members + community_creation_requests
// tablolarının tek erişim noktası.
// RLS: communities SELECT = herkes; INSERT/UPDATE/DELETE = owner_id;
//      community_members INSERT = kendisi (user_id = auth.uid());
//      community_creation_requests INSERT/SELECT = requester_id.
// ═══════════════════════════════════════════════════════════════
import { supabase } from '../supabaseClient';
import { ICommunity } from '../types';

const mapRowToCommunity = (row: any): ICommunity => ({
  id: row.id,
  name: row.name,
  domain: row.domain || '',
  logo: row.logo_url || undefined,
  memberCount: row.member_count ?? 0,
  activeMatches: row.active_matches ?? 0,
  isVerified: !!row.is_verified,
  type: row.type,
  description: row.description,
  location: row.location,
  isPrivate: !!row.is_private,
  joinMode: row.join_mode,
  inviteCode: row.invite_code,
  ownerId: row.owner_id,
});

export const fetchMyCommunities = async (uid: string): Promise<ICommunity[]> => {
  const { data, error } = await supabase
    .from('community_members')
    .select('communities(*)')
    .eq('user_id', uid);
  if (error) {
    console.error('[communityService] Topluluklarım çekilemedi:', error.message);
    return [];
  }
  return (data || [])
    .map((row: any) => row.communities)
    .filter(Boolean)
    .map(mapRowToCommunity);
};

export const fetchDiscoverCommunities = async (uid: string): Promise<ICommunity[]> => {
  const myIds = (await fetchMyCommunities(uid)).map(c => c.id);
  let query = supabase.from('communities').select('*').order('member_count', { ascending: false }).limit(20);
  if (myIds.length > 0) query = query.not('id', 'in', `(${myIds.join(',')})`);
  const { data, error } = await query;
  if (error) {
    console.error('[communityService] Keşfet listesi çekilemedi:', error.message);
    return [];
  }
  return (data || []).map(mapRowToCommunity);
};

export const joinCommunity = async (communityId: string, uid: string): Promise<void> => {
  const { error } = await supabase.from('community_members').insert({ community_id: communityId, user_id: uid });
  if (error && error.code !== '23505') throw error; // 23505: zaten üye, sessizce geç
};

export const joinCommunityByInviteCode = async (code: string, uid: string): Promise<ICommunity> => {
  const { data, error } = await supabase
    .from('communities')
    .select('*')
    .eq('invite_code', code.trim().toUpperCase())
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Bu kod ile eşleşen bir topluluk bulunamadı.');
  await joinCommunity(data.id, uid);
  return mapRowToCommunity(data);
};

export interface CommunityRequestInput {
  name: string;
  type: string;
  location: string;
  description: string;
}

// manifesto için ayrı bir sütun yok; en yakın anlamsal karşılık description.
export const createCommunityRequest = async (uid: string, input: CommunityRequestInput): Promise<void> => {
  const { error } = await supabase.from('community_creation_requests').insert({
    requester_id: uid,
    name: input.name.trim(),
    type: input.type,
    location: input.location.trim(),
    description: input.description.trim(),
  });
  if (error) throw error;
};

export const updateCommunityPrivacy = async (communityId: string, isPrivate: boolean): Promise<void> => {
  const { error } = await supabase.from('communities').update({ is_private: isPrivate }).eq('id', communityId);
  if (error) throw error;
};

export const deleteCommunity = async (communityId: string): Promise<void> => {
  const { error } = await supabase.from('communities').delete().eq('id', communityId);
  if (error) throw error;
};
