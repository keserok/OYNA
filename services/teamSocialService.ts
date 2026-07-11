// ================================================================
// teamSocialService — Takımlar dikey diliminin kanonik veri katmanı
// (Foundation Spec §6). get_my_teams/list_public_teams/vitrin/kadro
// okumaları + üyelik makinesi (istek·davet·link·rol) + create_team.
// store.myTeams / friendService.fetchUserTeams ikilisinin halefi (G40).
// ================================================================
import { supabase } from '../supabaseClient';

export type TeamRole = 'CAPTAIN' | 'ADMIN' | 'MEMBER';
export type TeamVisibility = 'PUBLIC' | 'PRIVATE';
export type TeamFormat =
  | '3v3' | '4v4' | '5v5' | '6v6' | '7v7' | '8v8' | '9v9' | '10v10' | '11v11';

/** Türk halı saha dili: "6v6" → "5+1" (Spec J59). */
export const formatLabel = (f?: string | null): string => {
  const m = /^(\d+)v\d+$/.exec(f || '');
  if (!m) return f || '7v7';
  const n = parseInt(m[1], 10);
  return `${n - 1}+1`;
};

export interface MyTeamRow {
  team_id: string;
  name: string;
  short_name: string | null;
  crest_config: unknown;
  color1: string | null;
  color2: string | null;
  format: TeamFormat | null;
  city: string | null;
  visibility: TeamVisibility;
  is_recruiting: boolean;
  is_archived: boolean;
  my_role: TeamRole;
  my_sort_order: number;
  member_count: number;
  wins: number;
  draws: number;
  losses: number;
  next_match_id: string | null;
  next_match_date: string | null;
  next_match_time: string | null;
  next_match_location: string | null;
  pending_invites: number;
}

export interface PublicTeamRow {
  team_id: string;
  name: string;
  crest_config: unknown;
  color1: string | null;
  color2: string | null;
  format: TeamFormat | null;
  city: string | null;
  is_recruiting: boolean;
  member_count: number;
  roster_max: number;
  wins: number;
  draws: number;
  losses: number;
  my_state: 'NONE' | 'MEMBER' | 'REQUEST_PENDING';
  /** Gizli (PRIVATE) takım dizinde isim+arma+sayıyla listelenir; kadrosu ve
      katılma isteği kapalıdır (üyeler yalnız davetle alınır). */
  visibility: TeamVisibility;
}

export interface TeamSquadRow {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  oyna_id: string | null;
  role: TeamRole;
  jersey_number: number | null;
  pos: string | null;
  fp: number | null;
  joined_at: string | null;
}

export interface TeamPublicProfile {
  team_id: string;
  name: string;
  short_name: string | null;
  crest_config: unknown;
  color1: string | null;
  color2: string | null;
  format: TeamFormat | null;
  city: string | null;
  play_style: string | null;
  visibility: TeamVisibility;
  is_recruiting: boolean;
  wins: number;
  draws: number;
  losses: number;
  member_count: number;
  roster_max: number;
  captain_name: string | null;
  is_member: boolean;
  my_request_pending: boolean;
  h2h: { played: number; wins: number; draws: number } | null;
}

export interface TeamJoinRequestRow {
  id: string;
  team_id: string;
  user_id: string;
  message: string | null;
  status: string;
  created_at: string;
  // profil zenginleştirmesi (ayrı sorgu)
  full_name?: string;
  avatar_url?: string | null;
  oyna_id?: string | null;
}

export interface TeamInviteRow {
  id: string;
  team_id: string;
  inviter_id: string;
  invited_id: string;
  status: string;
  created_at: string;
  full_name?: string;
  avatar_url?: string | null;
  team_name?: string;
}

export interface CreateTeamPayload {
  name: string;
  short_name?: string;
  color1?: string;
  color2?: string;
  crest_config?: unknown;
  format?: TeamFormat;
  visibility?: TeamVisibility;
  is_recruiting?: boolean;
  city?: string;
  play_style?: string;
  invite_user_ids?: string[];
}

export const parseTeamError = (e: unknown): string => {
  const msg = (e as { message?: string })?.message || '';
  const map: Record<string, string> = {
    ROSTER_FULL: 'Kadro dolu.',
    MEMBERSHIP_LIMIT: 'Takım üyeliği sınırına ulaştın.',
    CAPTAINCY_LIMIT: 'Kaptanlık sınırına ulaştın.',
    NOT_RECRUITING: 'Takım şu an oyuncu almıyor.',
    ALREADY_MEMBER: 'Zaten bu takımdasın.',
    PENDING_LIMIT: 'Çok fazla bekleyen isteğin var.',
    COOLDOWN: 'Bu takıma şimdilik tekrar istek gönderemezsin.',
    CAPTAIN_MUST_TRANSFER: 'Ayrılmadan önce kaptanlığı devretmelisin.',
    CANNOT_REMOVE_CAPTAIN: 'Kaptan kadrodan çıkarılamaz.',
    CANNOT_REMOVE_PRIMARY: 'Kaptanın yetkisi alınamaz.',
    INVALID_TOKEN: 'Davet linki geçersiz.',
    EXPIRED: 'Davetin süresi dolmuş.',
    NOT_PENDING: 'Bu kayıt zaten yanıtlanmış.',
    RESTORE_WINDOW_CLOSED: '30 günlük geri açma süresi geçmiş.',
    INVALID_NAME: 'Takım adı en az 2 karakter olmalı.',
    NOT_FOUND: 'Kayıt bulunamadı.',
    UNAUTHORIZED: 'Bu işlem için yetkin yok.',
  };
  for (const key of Object.keys(map)) if (msg.includes(key)) return map[key];
  return 'Bir şeyler ters gitti. Tekrar dener misin?';
};

// ─── Okumalar ───────────────────────────────────────────────────

export const getMyTeams = async (): Promise<MyTeamRow[]> => {
  const { data, error } = await supabase.rpc('get_my_teams');
  if (error) throw error;
  return (data || []) as MyTeamRow[];
};

export const listPublicTeams = async (opts: {
  q?: string; city?: string; format?: string; recruitingOnly?: boolean;
  limit?: number; offset?: number;
} = {}): Promise<PublicTeamRow[]> => {
  const { data, error } = await supabase.rpc('list_public_teams', {
    p_q: opts.q ?? null,
    p_city: opts.city ?? null,
    p_format: opts.format ?? null,
    p_recruiting_only: opts.recruitingOnly ?? false,
    p_limit: opts.limit ?? 20,
    p_offset: opts.offset ?? 0,
  });
  if (error) throw error;
  return (data || []) as PublicTeamRow[];
};

export const getTeamPublicProfile = async (teamId: string): Promise<TeamPublicProfile> => {
  const { data, error } = await supabase.rpc('get_team_public_profile', { p_team_id: teamId });
  if (error) throw error;
  return data as TeamPublicProfile;
};

export const getTeamSquad = async (teamId: string): Promise<TeamSquadRow[]> => {
  const { data, error } = await supabase.rpc('get_team_squad', { p_team_id: teamId });
  if (error) throw error;
  return (data || []) as TeamSquadRow[];
};

// ─── Oluşturma & ayarlar ────────────────────────────────────────

export const createTeamRpc = async (payload: CreateTeamPayload): Promise<{ team_id: string; invites_sent: number }> => {
  const { data, error } = await supabase.rpc('create_team', { p_payload: payload });
  if (error) throw error;
  return data as { team_id: string; invites_sent: number };
};

export const updateTeamSettings = async (teamId: string, patch: Partial<CreateTeamPayload> & { home_pitch_id?: string }): Promise<void> => {
  const { error } = await supabase.rpc('update_team_settings_v2', {
    p_team_id: teamId, p_patch: patch,
  });
  if (error) throw error;
};

// ─── Katılma istekleri (dizin tarafı — I53) ─────────────────────

export const requestToJoinTeam = async (teamId: string, message?: string): Promise<void> => {
  const { error } = await supabase.rpc('request_to_join_team', {
    p_team_id: teamId, p_message: message ?? null,
  });
  if (error) throw error;
};

export const respondJoinRequest = async (requestId: string, approve: boolean): Promise<void> => {
  const { error } = await supabase.rpc('respond_join_request', {
    p_request_id: requestId, p_approve: approve,
  });
  if (error) throw error;
};

export const cancelJoinRequest = async (requestId: string): Promise<void> => {
  const { error } = await supabase.rpc('cancel_join_request', { p_request_id: requestId });
  if (error) throw error;
};

/** Takımın bekleyen katılma istekleri (profil zenginleştirmeli) — Kadro→Bekleyenler. */
export const getTeamJoinRequests = async (teamId: string): Promise<TeamJoinRequestRow[]> => {
  const { data, error } = await supabase
    .from('team_join_requests')
    .select('id, team_id, user_id, message, status, created_at')
    .eq('team_id', teamId)
    .eq('status', 'PENDING')
    .order('created_at', { ascending: false });
  if (error) throw error;
  const rows = (data || []) as TeamJoinRequestRow[];
  if (rows.length === 0) return rows;
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, oyna_id')
    .in('id', rows.map(r => r.user_id));
  const byId = new Map((profiles || []).map(p => [p.id, p]));
  return rows.map(r => ({
    ...r,
    full_name: byId.get(r.user_id)?.full_name || 'Oyuncu',
    avatar_url: byId.get(r.user_id)?.avatar_url ?? null,
    oyna_id: byId.get(r.user_id)?.oyna_id ?? null,
  }));
};

// ─── Davetler (K68) ─────────────────────────────────────────────

export const inviteToTeam = async (teamId: string, invitedId: string): Promise<void> => {
  const { error } = await supabase.rpc('invite_to_team', {
    p_team_id: teamId, p_invited: invitedId,
  });
  if (error) throw error;
};

export const respondTeamInvite = async (inviteId: string, accept: boolean): Promise<void> => {
  const { error } = await supabase.rpc('respond_team_invite', {
    p_invite_id: inviteId, p_accept: accept,
  });
  if (error) throw error;
};

export const cancelTeamInvite = async (inviteId: string): Promise<void> => {
  const { error } = await supabase.rpc('cancel_team_invite', { p_invite_id: inviteId });
  if (error) throw error;
};

/** Bana gelen bekleyen takım davetleri — Takımlarım üstü şerit (K69). */
export const getMyTeamInvites = async (userId: string): Promise<TeamInviteRow[]> => {
  const { data, error } = await supabase
    .from('team_invites')
    .select('id, team_id, inviter_id, invited_id, status, created_at')
    .eq('invited_id', userId)
    .eq('status', 'PENDING')
    .order('created_at', { ascending: false });
  if (error) throw error;
  const rows = (data || []) as TeamInviteRow[];
  if (rows.length === 0) return rows;
  const [{ data: teams }, { data: profiles }] = await Promise.all([
    supabase.from('teams').select('id, name').in('id', rows.map(r => r.team_id)),
    supabase.from('profiles').select('id, full_name, avatar_url').in('id', rows.map(r => r.inviter_id)),
  ]);
  const teamById = new Map((teams || []).map(t => [t.id, t]));
  const profById = new Map((profiles || []).map(p => [p.id, p]));
  return rows.map(r => ({
    ...r,
    team_name: teamById.get(r.team_id)?.name || 'Takım',
    full_name: profById.get(r.inviter_id)?.full_name || 'Bir oyuncu',
    avatar_url: profById.get(r.inviter_id)?.avatar_url ?? null,
  }));
};

/** Takımın gönderdiği bekleyen davetler — Kadro→Bekleyenler (giden). */
export const getTeamOutgoingInvites = async (teamId: string): Promise<TeamInviteRow[]> => {
  const { data, error } = await supabase
    .from('team_invites')
    .select('id, team_id, inviter_id, invited_id, status, created_at')
    .eq('team_id', teamId)
    .eq('status', 'PENDING')
    .order('created_at', { ascending: false });
  if (error) throw error;
  const rows = (data || []) as TeamInviteRow[];
  if (rows.length === 0) return rows;
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url')
    .in('id', rows.map(r => r.invited_id));
  const byId = new Map((profiles || []).map(p => [p.id, p]));
  return rows.map(r => ({
    ...r,
    full_name: byId.get(r.invited_id)?.full_name || 'Oyuncu',
    avatar_url: byId.get(r.invited_id)?.avatar_url ?? null,
  }));
};

export const setTeamInviteLink = async (teamId: string, enabled: boolean): Promise<string | null> => {
  const { data, error } = await supabase.rpc('set_team_invite_link', {
    p_team_id: teamId, p_enabled: enabled,
  });
  if (error) throw error;
  return (data as { invite_token: string | null }).invite_token;
};

/** Mevcut davet linki token'ı — yalnız yönetici okuyabilir (deny-all tablo,
    erişim get_team_invite_link RPC'siyle; teams.invite_token sızıntısı kapandı). */
export const getTeamInviteLink = async (teamId: string): Promise<string | null> => {
  const { data, error } = await supabase.rpc('get_team_invite_link', { p_team_id: teamId });
  if (error) throw error;
  return (data as string | null) ?? null;
};

/** Davet linkinin paylaşılabilir web adresi (Spec §2.3). */
export const inviteLinkUrl = (token: string): string => `https://oyna.app/takim/${token}`;

export const joinByInviteToken = async (token: string): Promise<{ team_id: string; state: string }> => {
  const { data, error } = await supabase.rpc('join_by_invite_token', { p_token: token });
  if (error) throw error;
  return data as { team_id: string; state: string };
};

// ─── Rol & yaşam döngüsü (K65-73) ───────────────────────────────

export const setMemberRole = async (teamId: string, userId: string, role: 'ADMIN' | 'MEMBER'): Promise<void> => {
  const { error } = await supabase.rpc('set_member_role', {
    p_team_id: teamId, p_user: userId, p_role: role,
  });
  if (error) throw error;
};

export const transferCaptaincy = async (teamId: string, newCaptainId: string): Promise<void> => {
  const { error } = await supabase.rpc('transfer_captaincy', {
    p_team_id: teamId, p_new_captain: newCaptainId,
  });
  if (error) throw error;
};

export const removeTeamMember = async (teamId: string, userId: string): Promise<void> => {
  const { error } = await supabase.rpc('remove_team_member', {
    p_team_id: teamId, p_user: userId,
  });
  if (error) throw error;
};

export const leaveTeam = async (teamId: string): Promise<{ archived: boolean }> => {
  const { data, error } = await supabase.rpc('leave_team', { p_team_id: teamId });
  if (error) throw error;
  return data as { archived: boolean };
};

export const disbandTeam = async (teamId: string): Promise<void> => {
  const { error } = await supabase.rpc('disband_team', { p_team_id: teamId });
  if (error) throw error;
};

export const restoreTeam = async (teamId: string): Promise<void> => {
  const { error } = await supabase.rpc('restore_team', { p_team_id: teamId });
  if (error) throw error;
};

/** Forma numarası ata (H47) — team_members UPDATE RLS'i kaptana açık;
    takım içinde benzersizlik DB kısıtıyla garanti (çakışmada hata döner). */
export const setJerseyNumber = async (
  teamId: string, userId: string, jersey: number | null,
): Promise<void> => {
  const { error } = await supabase
    .from('team_members')
    .update({ jersey_number: jersey })
    .eq('team_id', teamId)
    .eq('user_id', userId);
  if (error) {
    if (`${error.message}`.includes('team_members_jersey_uidx')) {
      throw new Error('JERSEY_TAKEN: Bu numara kadroda kullanımda.');
    }
    throw error;
  }
};

/** Kişisel takım sırası (G eki): uzun-bas sürükle sonrası kalıcılık.
    team_members UPDATE RLS'i kaptan-only olduğundan RPC ile yazılır. */
export const saveMyTeamOrder = async (orderedTeamIds: string[]): Promise<void> => {
  const { error } = await supabase.rpc('set_my_team_order', { p_team_ids: orderedTeamIds });
  if (error) throw error;
};
