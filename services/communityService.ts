import { supabase } from '../supabaseClient';
import type { ICommunity } from '../types';

export interface CommunityRecord {
  id: string;
  name: string;
  type: string;
  domain: string | null;
  description: string | null;
  location: string | null;
  member_count: number;
  active_matches: number;
  is_verified: boolean;
  is_private: boolean;
  join_mode: string;
  invite_code: string | null;
  created_at: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isCommunityUuid(id: string): boolean {
  return UUID_RE.test(id);
}

export function mapCommunityToICommunity(row: CommunityRecord): ICommunity {
  return {
    id: row.id,
    name: row.name,
    domain: row.domain || '',
    memberCount: row.member_count ?? 0,
    activeMatches: row.active_matches ?? 0,
    isVerified: row.is_verified ?? false,
    joinMode: row.join_mode,
    isPrivate: row.is_private ?? false,
    type: row.type,
    location: row.location ?? undefined,
  };
}

export async function fetchPublicCommunities(limit = 50): Promise<CommunityRecord[]> {
  const { data, error } = await supabase
    .from('communities')
    .select('id, name, type, domain, description, location, member_count, active_matches, is_verified, is_private, join_mode, invite_code, created_at')
    .order('member_count', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data || []) as CommunityRecord[];
}

export async function fetchCommunityById(id: string): Promise<CommunityRecord | null> {
  if (!isCommunityUuid(id)) return null;
  const { data, error } = await supabase
    .from('communities')
    .select('id, name, type, domain, description, location, member_count, active_matches, is_verified, is_private, join_mode, invite_code, created_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as CommunityRecord) || null;
}

export function subscribeCommunityUpdates(
  communityId: string,
  onChange: (row: CommunityRecord) => void,
): () => void {
  if (!isCommunityUuid(communityId)) return () => {};

  const channel = supabase
    .channel(`community-live-${communityId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'communities', filter: `id=eq.${communityId}` },
      (payload) => {
        onChange(payload.new as CommunityRecord);
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
