import { supabase } from '../supabaseClient';
import { AdminUser, UserRole, AdminLog } from '../types';

export interface AdminSession {
  userId: string;
  email: string;
  name: string;
  isAdmin: boolean;
}

export interface AdminDashboardStats {
  total_users: number;
  total_pitches: number;
  total_matches: number;
  pending_verifications: number;
  pending_pitches: number;
  pending_withdrawals: number;
  banned_users: number;
  active_goalkeepers: number;
  active_referees: number;
  commission_rate: number;
}

export interface DbAuditLogRow {
  id: string;
  admin_id: string;
  admin_name: string;
  action: string;
  target_type: string;
  target_id: string | null;
  target_identifier: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  created_at: string;
}

export interface AppSettingsDb {
  appName: string;
  maintenanceMode: boolean;
  registrationOpen: boolean;
  proPrice: number;
  commissionRate: number;
  minRatingToPlay: number;
  maxMatchsPerDay: number;
  featuredPitchId: string | null;
  announcementBanner: string;
  showAnnouncementBanner: boolean;
  payoutMode?: 'cash' | 'online' | 'deposit';
}

const mapProfileRow = (row: Record<string, unknown>): AdminUser => {
  const rolesRaw = row.roles;
  const roles = Array.isArray(rolesRaw)
    ? rolesRaw as string[]
    : (typeof rolesRaw === 'object' && rolesRaw !== null ? Object.values(rolesRaw as Record<string, string>) : undefined);
  return {
    id: row.id as string,
    name: (row.full_name as string) || (row.name as string) || (row.email as string) || 'Kullanıcı',
    email: (row.email as string) || '',
    phone: row.phone as string | undefined,
    avatar: (row.avatar_url as string) || '',
    role: (row.role as UserRole) || UserRole.PLAYER,
    roles: roles as UserRole[] | undefined,
    rating: Number(row.rating ?? 5),
    isVerified: Boolean(row.is_verified),
    isBanned: Boolean(row.is_banned),
    isPro: Boolean(row.is_pro),
    joinDate: (row.created_at as string) || new Date().toISOString(),
    matchCount: Number(row.match_count ?? 0),
    wallet: Number(row.wallet_balance ?? 0),
    banExpiresAt: (row.ban_expires_at as string) || null,
  };
};

const mapSettingsRow = (row: Record<string, unknown>): AppSettingsDb => ({
  appName: (row.app_name as string) || (row.appName as string) || 'OYNA',
  maintenanceMode: Boolean(row.maintenance_mode ?? row.maintenanceMode),
  registrationOpen: (row.registration_open ?? row.registrationOpen) !== false,
  proPrice: Number(row.pro_price ?? row.proPrice ?? 99.9),
  commissionRate: Number(row.commission_rate ?? row.commissionRate ?? 10),
  minRatingToPlay: Number(row.min_rating_to_play ?? row.minRatingToPlay ?? 3),
  maxMatchsPerDay: Number(row.max_matches_per_day ?? row.maxMatchsPerDay ?? 3),
  featuredPitchId: (row.featured_pitch_id as string) || (row.featuredPitchId as string) || null,
  announcementBanner: (row.announcement_banner as string) || (row.announcementBanner as string) || '',
  showAnnouncementBanner: (row.show_announcement_banner ?? row.showAnnouncementBanner) !== false,
});

const mapAuditRow = (row: DbAuditLogRow): AdminLog => ({
  id: row.id,
  action: row.action as AdminLog['action'],
  targetId: row.target_id || '',
  targetName: row.target_identifier || row.target_type,
  details: row.new_value ? JSON.stringify(row.new_value) : row.action,
  timestamp: row.created_at,
  adminId: row.admin_id,
});

export const toTurkishAdminError = (err: unknown): string => {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes('UNAUTHORIZED') || raw.includes('row-level security')) {
    return 'Bu işlem için platform admin yetkisi gerekli.';
  }
  if (raw.includes('Invalid login')) return 'E-posta veya şifre hatalı.';
  return raw;
};

export async function signInAdmin(email: string, password: string): Promise<AdminSession> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  if (!data.user) throw new Error('Oturum açılamadı.');

  const session = await resolveAdminSession(data.user.id, data.user.email || email);
  if (!session.isAdmin) {
    await supabase.auth.signOut();
    throw new Error('UNAUTHORIZED: Bu hesap platform admini değil.');
  }
  return session;
}

export async function resolveAdminSession(userId: string, email: string): Promise<AdminSession> {
  const { data, error } = await supabase
    .from('profiles')
    .select('full_name, name, is_admin, role, roles')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  const role = data?.role as string | undefined;
  const roleList: string[] = Array.isArray(data?.roles) ? (data?.roles as string[]) : [];
  const hasRole = (r: string) => role === r || roleList.includes(r);
  const isAdmin = Boolean(
    data?.is_admin || hasRole('ADMIN') || hasRole('SUPER_ADMIN'),
  );

  return {
    userId,
    email,
    name: (data?.full_name as string) || (data?.name as string) || email,
    isAdmin,
  };
}

export async function checkPlatformAdmin(): Promise<AdminSession | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return null;
  const session = await resolveAdminSession(user.id, user.email);
  return session.isAdmin ? session : null;
}

export async function signOutAdmin(): Promise<void> {
  await supabase.auth.signOut();
}

export async function fetchAdminProfiles(): Promise<AdminUser[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, name, email, phone, avatar_url, role, roles, rating, match_count, is_verified, is_banned, is_pro, wallet_balance, ban_expires_at, created_at')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) throw new Error(error.message);
  return (data || []).map((row) => mapProfileRow(row as Record<string, unknown>));
}

export async function fetchAdminSettings(): Promise<AppSettingsDb | null> {
  const { data, error } = await supabase.from('settings').select('*').eq('id', 1).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return mapSettingsRow(data as Record<string, unknown>);
}

export async function fetchAdminAuditLogs(limit = 100): Promise<AdminLog[]> {
  const { data, error } = await supabase
    .from('admin_audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return (data || []).map((row) => mapAuditRow(row as DbAuditLogRow));
}

export async function fetchDashboardStats(): Promise<AdminDashboardStats> {
  const { data, error } = await supabase.rpc('admin_dashboard_stats');
  if (error) throw new Error(error.message);
  return data as AdminDashboardStats;
}

export async function loadAdminOperationalData(): Promise<{
  users: AdminUser[];
  settings: AppSettingsDb | null;
  auditLogs: AdminLog[];
  stats: Record<string, number | string> | null;
}> {
  const [usersRes, settingsRes, logsRes, statsRes] = await Promise.allSettled([
    fetchAdminProfiles(),
    fetchAdminSettings(),
    fetchAdminAuditLogs(),
    fetchDashboardStats(),
  ]);

  if (usersRes.status === 'rejected') throw usersRes.reason;
  return {
    users: usersRes.value,
    settings: settingsRes.status === 'fulfilled' ? settingsRes.value : null,
    auditLogs: logsRes.status === 'fulfilled' ? logsRes.value : [],
    stats: statsRes.status === 'fulfilled' ? (statsRes.value as unknown as Record<string, number | string>) : null,
  };
}

export async function persistAdminLog(
  action: string,
  targetType: string,
  targetId: string | null,
  targetIdentifier: string,
  oldValue?: Record<string, unknown>,
  newValue?: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.rpc('log_admin_action', {
    p_action: action,
    p_target_type: targetType,
    p_target_id: targetId,
    p_target_identifier: targetIdentifier,
    p_old_value: oldValue ?? null,
    p_new_value: newValue ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function moderatePitch(pitchId: string, approved: boolean, notes?: string): Promise<void> {
  const { error } = await supabase.rpc('admin_moderate_pitch', {
    p_pitch_id: pitchId,
    p_approved: approved,
    p_notes: notes ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function processWithdrawal(requestId: string, approved: boolean, notes?: string): Promise<void> {
  const { error } = await supabase.rpc('admin_process_withdrawal', {
    p_request_id: requestId,
    p_approved: approved,
    p_notes: notes ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function banUserAdmin(
  userId: string,
  isBanned: boolean,
  expiresAt?: string | null,
  reason?: string,
): Promise<void> {
  const { error } = await supabase.rpc('admin_ban_user', {
    p_user_id: userId,
    p_is_banned: isBanned,
    p_expires_at: expiresAt ?? null,
    p_reason: reason ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function updateSettingsAdmin(settings: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.rpc('admin_update_settings', { p_settings: settings });
  if (error) throw new Error(error.message);
}

export async function logImpersonation(targetUserId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_log_impersonation', { p_target_user_id: targetUserId });
  if (error) throw new Error(error.message);
}

export function settingsToDbPayload(settings: Partial<AppSettingsDb>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (settings.appName !== undefined) payload.app_name = settings.appName;
  if (settings.maintenanceMode !== undefined) payload.maintenance_mode = settings.maintenanceMode;
  if (settings.registrationOpen !== undefined) payload.registration_open = settings.registrationOpen;
  if (settings.proPrice !== undefined) payload.pro_price = settings.proPrice;
  if (settings.commissionRate !== undefined) payload.commission_rate = settings.commissionRate;
  if (settings.minRatingToPlay !== undefined) payload.min_rating_to_play = settings.minRatingToPlay;
  if (settings.maxMatchsPerDay !== undefined) payload.max_matches_per_day = settings.maxMatchsPerDay;
  if (settings.featuredPitchId !== undefined) payload.featured_pitch_id = settings.featuredPitchId;
  if (settings.announcementBanner !== undefined) payload.announcement_banner = settings.announcementBanner;
  if (settings.showAnnouncementBanner !== undefined) payload.show_announcement_banner = settings.showAnnouncementBanner;
  return payload;
}

// ─── Faz 4-6: Finans, operasyon, topluluk, CMS, kampanya, ACL ───

export interface OpsQueue {
  pending_verifications: Array<{ id: string; name: string; email: string; created_at: string }>;
  pending_pitches: Array<{ id: string; name: string; created_at: string }>;
  pending_withdrawals: Array<{ id: string; amount: number; owner_id: string; created_at: string }>;
  open_disputes: Array<{ id: string; match_id: string; status: string; created_at: string }>;
  deletion_requests: Array<{ id: string; name: string; email: string; requested_at: string }>;
  community_requests: Array<{ id: string; name: string; requester_id: string; created_at: string }>;
}

export interface FinanceStats {
  booking_revenue: number;
  wallet_credits: number;
  wallet_debits: number;
  withdrawal_pending: number;
  payment_count: number;
}

export interface WalletLedgerRow {
  id: string;
  user_id: string;
  amount: number;
  type: string;
  status: string;
  description: string | null;
  created_at: string;
  match_id?: string | null;
}

export interface BookingPaymentRow {
  id: string;
  booking_id: string;
  amount: number;
  payment_method: string;
  note: string | null;
  created_at: string;
  pitch_name: string | null;
}

export interface MatchDisputeRow {
  id: string;
  match_id: string;
  raised_by: string;
  home_claimed_score: string | null;
  away_claimed_score: string | null;
  status: string;
  resolution_notes: string | null;
  created_at: string;
}

export interface CommunityRow {
  id: string;
  name: string;
  type: string;
  domain: string | null;
  member_count: number;
  is_verified: boolean;
  join_mode: string;
  created_at: string;
}

export interface CommunityCreationRequest {
  id: string;
  requester_id: string;
  name: string;
  type: string;
  description: string | null;
  location: string | null;
  status: string;
  created_at: string;
  requesterName?: string;
}

export interface PromoCodeRow {
  id: string;
  code: string;
  description: string | null;
  discount_type: string;
  discount_value: number;
  max_redemptions: number | null;
  redemption_count: number;
  valid_until: string | null;
  target_segment: string;
  is_active: boolean;
  created_at: string;
}

export interface AdminTeamMember {
  id: string;
  user_id: string;
  admin_role: string;
  created_at: string;
  userName?: string;
  userEmail?: string;
}

export async function fetchOpsQueue(): Promise<OpsQueue> {
  const { data, error } = await supabase.rpc('admin_ops_queue');
  if (error) throw new Error(error.message);
  return data as OpsQueue;
}

export async function fetchFinanceStats(days = 30): Promise<FinanceStats> {
  const { data, error } = await supabase.rpc('admin_finance_stats', { p_days: days });
  if (error) throw new Error(error.message);
  return data as FinanceStats;
}

export async function fetchWalletLedger(limit = 100): Promise<WalletLedgerRow[]> {
  const { data, error } = await supabase.rpc('admin_fetch_wallet_ledger', { p_limit: limit });
  if (error) throw new Error(error.message);
  return (data || []) as WalletLedgerRow[];
}

export async function fetchBookingPayments(limit = 100): Promise<BookingPaymentRow[]> {
  const { data, error } = await supabase.rpc('admin_fetch_booking_payments', { p_limit: limit });
  if (error) throw new Error(error.message);
  return (data || []) as BookingPaymentRow[];
}

export async function fetchMatchDisputes(): Promise<MatchDisputeRow[]> {
  const { data, error } = await supabase
    .from('match_disputes')
    .select('id, match_id, raised_by, home_claimed_score, away_claimed_score, status, resolution_notes, created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data || []) as MatchDisputeRow[];
}

export async function resolveDispute(disputeId: string, status: 'RESOLVED' | 'DISMISSED' | 'UNDER_REVIEW', notes?: string): Promise<void> {
  const { error } = await supabase.rpc('admin_resolve_dispute', {
    p_dispute_id: disputeId,
    p_status: status,
    p_notes: notes ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function processAccountDeletion(userId: string, anonymize = true): Promise<void> {
  const { error } = await supabase.rpc('admin_process_account_deletion', {
    p_user_id: userId,
    p_anonymize: anonymize,
  });
  if (error) throw new Error(error.message);
}

export type BroadcastSegment = 'ALL' | 'PRO' | 'CAPTAIN' | 'OWNER' | 'NEW_USERS' | 'GOALKEEPER' | 'REFEREE';

export async function broadcastNotification(
  title: string,
  body: string,
  segment: BroadcastSegment = 'ALL',
): Promise<number> {
  const { data, error } = await supabase.rpc('admin_broadcast_notification', {
    p_title: title,
    p_body: body,
    p_segment: segment,
    p_type: 'ADMIN_BROADCAST',
  });
  if (error) throw new Error(error.message);
  return Number(data);
}

export async function fetchCommunities(): Promise<CommunityRow[]> {
  const { data, error } = await supabase
    .from('communities')
    .select('id, name, type, domain, member_count, is_verified, join_mode, created_at')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []) as CommunityRow[];
}

export async function fetchCommunityCreationRequests(): Promise<CommunityCreationRequest[]> {
  const { data, error } = await supabase
    .from('community_creation_requests')
    .select('id, requester_id, name, type, description, location, status, created_at')
    .eq('status', 'PENDING')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  const rows = (data || []) as CommunityCreationRequest[];
  if (rows.length === 0) return rows;
  const ids = rows.map((r) => r.requester_id);
  const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', ids);
  const nameMap: Record<string, string> = {};
  (profiles || []).forEach((p: { id: string; full_name: string | null }) => {
    nameMap[p.id] = p.full_name || 'Bilinmeyen';
  });
  return rows.map((r) => ({ ...r, requesterName: nameMap[r.requester_id] }));
}

export async function moderateCommunityCreation(requestId: string, approved: boolean, notes?: string): Promise<void> {
  const { error } = await supabase.rpc('admin_moderate_community_creation', {
    p_request_id: requestId,
    p_approved: approved,
    p_notes: notes ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function fetchCmsTexts(): Promise<Record<string, string>> {
  const { data, error } = await supabase.from('texts').select('key, value');
  if (error) throw new Error(error.message);
  const map: Record<string, string> = {};
  (data || []).forEach((row: { key: string; value: string }) => { map[row.key] = row.value; });
  return map;
}

export async function updateCmsTexts(texts: Record<string, string>): Promise<number> {
  const { data, error } = await supabase.rpc('admin_update_texts', { p_texts: texts });
  if (error) throw new Error(error.message);
  return Number(data);
}

export async function fetchPromoCodes(): Promise<PromoCodeRow[]> {
  const { data, error } = await supabase
    .from('promo_codes')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []) as PromoCodeRow[];
}

export async function createPromoCode(input: {
  code: string;
  discountType: 'PERCENT' | 'FIXED';
  discountValue: number;
  description?: string;
  maxRedemptions?: number;
  validUntil?: string;
  targetSegment?: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc('admin_create_promo_code', {
    p_code: input.code,
    p_discount_type: input.discountType,
    p_discount_value: input.discountValue,
    p_description: input.description ?? null,
    p_max_redemptions: input.maxRedemptions ?? null,
    p_valid_until: input.validUntil ?? null,
    p_target_segment: input.targetSegment ?? 'ALL',
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function fetchAdminTeam(): Promise<AdminTeamMember[]> {
  const { data, error } = await supabase
    .from('admin_team_members')
    .select('id, user_id, admin_role, created_at')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  const rows = (data || []) as AdminTeamMember[];
  if (rows.length === 0) return rows;
  const ids = rows.map((r) => r.user_id);
  const { data: profiles } = await supabase.from('profiles').select('id, full_name, email').in('id', ids);
  const profileMap: Record<string, { name: string; email: string }> = {};
  (profiles || []).forEach((p: { id: string; full_name: string | null; email: string | null }) => {
    profileMap[p.id] = { name: p.full_name || '—', email: p.email || '—' };
  });
  return rows.map((r) => ({
    ...r,
    userName: profileMap[r.user_id]?.name,
    userEmail: profileMap[r.user_id]?.email,
  }));
}

export async function setPlatformRole(
  userId: string,
  adminRole: 'SUPER_ADMIN' | 'ADMIN' | 'MODERATOR' | 'FINANCE' | 'SUPPORT',
  grantPlatformAdmin = false,
): Promise<void> {
  const { error } = await supabase.rpc('admin_set_platform_role', {
    p_user_id: userId,
    p_admin_role: adminRole,
    p_grant_platform_admin: grantPlatformAdmin,
  });
  if (error) throw new Error(error.message);
}

export async function fetchTeamsFromDb(): Promise<Array<{ id: string; name: string; captain_id: string | null; created_at: string | null; is_demo?: boolean }>> {
  const { data, error } = await supabase
    .from('teams')
    .select('id, name, captain_id, captain, rating, level, location, is_demo')
    .order('name', { ascending: true })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data || []).map((t: Record<string, unknown>) => ({
    id: t.id as string,
    name: t.name as string,
    captain_id: (t.captain_id as string) || (t.captain as string) || null,
    created_at: null,
    is_demo: Boolean(t.is_demo),
  }));
}

export async function fetchSegmentPreview(segment: string): Promise<number> {
  const { data, error } = await supabase.rpc('admin_segment_preview', { p_segment: segment });
  if (error) throw new Error(error.message);
  return Number((data as { count?: number })?.count ?? 0);
}

export async function seedGodviewDemo(): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc('seed_godview_demo');
  if (error) throw new Error(error.message);
  return (data || {}) as Record<string, number>;
}

export async function purgeGodviewDemo(): Promise<void> {
  const { error } = await supabase.rpc('purge_godview_demo');
  if (error) throw new Error(error.message);
}

export type DemoModuleKey =
  | 'all' | 'goalkeepers' | 'referees' | 'matches' | 'communities'
  | 'teams' | 'tournaments' | 'promo_codes' | 'pitches' | 'texts';

export async function seedModuleDemo(module: DemoModuleKey): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc('seed_module_demo', { p_module: module });
  if (error) throw new Error(error.message);
  return (data || {}) as Record<string, number>;
}

export async function purgeModuleDemo(module: DemoModuleKey): Promise<void> {
  const { error } = await supabase.rpc('purge_module_demo', { p_module: module });
  if (error) throw new Error(error.message);
}

export async function deletePromoCode(id: string): Promise<void> {
  const { error } = await supabase.from('promo_codes').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function setPromoCodeActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase.from('promo_codes').update({ is_active: isActive }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteCommunity(id: string): Promise<void> {
  const { error } = await supabase.from('communities').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function createCommunityAdmin(input: {
  name: string; type?: string; description?: string; location?: string; isDemo?: boolean;
}): Promise<string> {
  const { data, error } = await supabase.from('communities').insert({
    name: input.name,
    type: input.type || 'Semt',
    description: input.description || '',
    location: input.location || '',
    is_verified: false,
    member_count: 0,
    is_demo: input.isDemo ?? false,
  }).select('id').single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function deleteTeamAdmin(id: string): Promise<void> {
  const { error } = await supabase.from('teams').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function createTeamAdmin(name: string, isDemo = false): Promise<string> {
  const { data, error } = await supabase.from('teams').insert({ name, is_demo: isDemo }).select('id').single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function deleteTournament(id: string): Promise<void> {
  const { error } = await supabase.from('tournaments').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function createTournamentAdmin(input: {
  name: string; status?: string; maxTeams?: number; isDemo?: boolean;
}): Promise<string> {
  const { data, error } = await supabase.from('tournaments').insert({
    name: input.name,
    status: input.status || 'DRAFT',
    max_teams: input.maxTeams ?? 8,
    is_demo: input.isDemo ?? false,
    starts_at: new Date(Date.now() + 7 * 86400000).toISOString(),
  }).select('id').single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function fetchTournaments(): Promise<Array<{ id: string; name: string; status: string; max_teams: number; is_demo: boolean; starts_at: string | null }>> {
  const { data, error } = await supabase.from('tournaments').select('*').order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []) as Array<{ id: string; name: string; status: string; max_teams: number; is_demo: boolean; starts_at: string | null }>;
}

export async function loadAdminExtendedData(): Promise<{ texts: Record<string, string> }> {
  try {
    const texts = await fetchCmsTexts();
    return { texts };
  } catch {
    return { texts: {} };
  }
}
