import { supabase } from '../../supabaseClient';
import { AdminUser, UserRole, AdminLog, MatchListing, PositionSlot, Goalkeeper, Referee, Pitch, Team } from '../../types';
import { mapAdminMatchRowToListing, listingToMatchPayload, type AdminMatchRow } from '../utils/matchMapper';
import { mapAdminPitchRowToUi } from '../utils/pitchMapper';
import { mapDbRowToCamel } from '../utils/dbRowMapper';

function isRpcMissing(err: { message?: string; code?: string }): boolean {
  return (err.message || '').includes('PGRST202') || err.code === 'PGRST202';
}

function isRpcDenied(err: { message?: string; code?: string }): boolean {
  const msg = (err.message || '').toUpperCase();
  return (
    err.code === 'P0001' ||
    err.code === '42501' ||
    msg.includes('UNAUTHORIZED') ||
    msg.includes('PERMISSION DENIED')
  );
}

/** RPC yok, yetki reddi veya şema uyumsuzluğu — doğrudan tablo okumasına düş */
function isRpcFallback(err: { message?: string; code?: string }): boolean {
  const msg = (err.message || '').toLowerCase();
  const schemaMismatch = msg.includes('does not exist') || err.code === '42703';
  return isRpcMissing(err) || isRpcDenied(err) || schemaMismatch;
}

/** Bootstrap tek seferde çekilen kayıt üst sınırı */
export const ADMIN_BOOTSTRAP_LIMIT = 80;

const ADMIN_PROFILE_LOOKUP_MS = 10_000;

async function withServiceTimeout<T>(label: string, fn: () => Promise<T>, ms = ADMIN_PROFILE_LOOKUP_MS): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} zaman aşımına uğradı (${ms / 1000}s)`)), ms),
    ),
  ]);
}

export interface AdminSession {
  userId: string;
  email: string;
  name: string;
  isAdmin: boolean;
  adminRole?: 'SUPER_ADMIN' | 'ADMIN' | 'MODERATOR' | 'FINANCE' | 'SUPPORT';
}

export interface AdminDashboardStats {
  total_users: number;
  total_pitches: number;
  total_matches: number;
  successful_matches?: number;
  completed_matches?: number;
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
    joinDate: (row.created_at as string) || (row.join_date as string) || new Date().toISOString(),
    matchCount: Number(row.match_count ?? 0),
    wallet: Number(row.wallet_balance ?? 0),
    banExpiresAt: (row.ban_expires_at as string) || null,
    cardActive: Boolean(row.card_active),
    cardTier: (row.card_tier as 'bronze' | 'silver' | 'gold' | null) ?? null,
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
  payoutMode: ((row.payoutMode as string) || 'cash') as 'cash' | 'online' | 'deposit',
});

const mapAuditRow = (row: DbAuditLogRow): AdminLog => ({
  id: row.id,
  action: row.action as AdminLog['action'],
  targetId: row.target_id || '',
  targetName: row.target_identifier || row.target_type,
  details: row.new_value ? JSON.stringify(row.new_value) : row.action,
  timestamp: row.created_at,
  adminId: row.admin_id,
  adminName: row.admin_name || undefined,
});

export const toTurkishAdminError = (err: unknown): string => {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.includes('UNAUTHORIZED') || raw.includes('P0001')) {
    return 'Platform admin yetkisi doğrulanamadı. Supabase profiles tablosunda is_admin=true veya role=ADMIN/SUPER_ADMIN olmalı.';
  }
  if (raw.includes('row-level security')) {
    return 'Bu veriye erişim için platform admin yetkisi gerekli (RLS).';
  }
  if (raw.includes('Invalid login')) return 'E-posta veya şifre hatalı.';
  return raw;
};

// ─── İki Adımlı Doğrulama (MFA / TOTP) ───────────────────────────────────────

/** Supabase Auth Assurance Level — aal1: yalnız şifre, aal2: şifre + TOTP. */
export type AdminAal = 'aal1' | 'aal2';

export interface AdminMfaState {
  /** Bu oturumun ulaştığı seviye (genelde aal1). */
  currentLevel: AdminAal | null;
  /** Bu hesap için gerekli/ulaşılabilir en yüksek seviye. */
  nextLevel: AdminAal | null;
  /** Doğrulanmış (verified) TOTP faktörü var mı? */
  hasVerifiedFactor: boolean;
}

/**
 * signInAdmin sonucu:
 * - 'authenticated' → tam yetkili (aal2 veya MFA gerekmiyor); panel açılabilir.
 * - 'mfa_challenge' → kayıtlı TOTP faktörü var, 6 haneli kod istenir.
 * - 'mfa_enroll'    → henüz faktör yok, kurulum (QR + doğrulama) gerekir.
 */
export type AdminSignInResult =
  | { status: 'authenticated'; session: AdminSession }
  | { status: 'mfa_challenge'; session: AdminSession; factorId: string }
  | { status: 'mfa_enroll'; session: AdminSession };

/** Mevcut oturumun MFA seviyesini ve doğrulanmış faktör durumunu okur. */
export async function getAdminMfaState(): Promise<AdminMfaState> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw new Error(error.message);
  const currentLevel = (data?.currentLevel ?? null) as AdminAal | null;
  const nextLevel = (data?.nextLevel ?? null) as AdminAal | null;
  // nextLevel 'aal2' iken currentLevel 'aal1' ise: ya kurulu faktör var (challenge),
  // ya da en azından bir faktör mevcut. Doğrulanmış faktör listesini ayrıca çekiyoruz.
  let hasVerifiedFactor = false;
  try {
    const { data: factorsData } = await supabase.auth.mfa.listFactors();
    hasVerifiedFactor = Boolean(factorsData?.totp?.length);
  } catch {
    // listFactors başarısızsa AAL ipucuna düşeriz.
    hasVerifiedFactor = nextLevel === 'aal2' && currentLevel === 'aal1';
  }
  return { currentLevel, nextLevel, hasVerifiedFactor };
}

/** Yeni bir TOTP faktörü kaydı başlatır → QR (SVG data-URI), secret ve factorId döner. */
export async function enrollAdminTotp(): Promise<{ factorId: string; qrCode: string; secret: string }> {
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: `OYNA Admin ${new Date().toISOString().slice(0, 10)}`,
  });
  if (error) throw new Error(error.message);
  return {
    factorId: data.id,
    qrCode: data.totp.qr_code,
    secret: data.totp.secret,
  };
}

/**
 * Verilen factorId için challenge + verify yapar.
 * Başarılıysa oturum aal2'ye yükselir. Yanlış kodda Türkçe hata fırlatır.
 */
export async function verifyAdminTotp(factorId: string, code: string): Promise<void> {
  const cleaned = code.replace(/\s+/g, '');
  const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId });
  if (challengeErr) throw new Error(challengeErr.message);

  const { error: verifyErr } = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.id,
    code: cleaned,
  });
  if (verifyErr) {
    const msg = verifyErr.message || '';
    if (/invalid|incorrect|code/i.test(msg)) {
      throw new Error('Kod hatalı, tekrar dene.');
    }
    throw new Error(msg || 'Doğrulama başarısız.');
  }
}

/** Kayıtlı (örn. yarım kalmış) bir faktörü siler — kurulum iptali için. */
export async function unenrollAdminTotp(factorId: string): Promise<void> {
  await supabase.auth.mfa.unenroll({ factorId }).catch(() => undefined);
}

/**
 * Mevcut oturum için kayıtlı, doğrulanmış (verified) TOTP faktörünün id'sini döner.
 * Yoksa null. Challenge ekranında kullanılır.
 */
export async function getAdminVerifiedFactorId(): Promise<string | null> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) return null;
  const verified = (data?.totp ?? []).find((f) => f.status === 'verified') ?? data?.totp?.[0];
  return verified?.id ?? null;
}

export async function signInAdmin(email: string, password: string): Promise<AdminSignInResult> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  if (!data.user) throw new Error('Oturum açılamadı.');

  const { data: sessionCheck, error: sessionErr } = await supabase.auth.getSession();
  if (sessionErr) throw new Error(sessionErr.message);
  if (!sessionCheck.session?.access_token) {
    throw new Error('Oturum jetonu alınamadı. Sayfayı yenileyip tekrar deneyin.');
  }

  const session = await resolveAdminSession(data.user.id, data.user.email || email);
  if (!session.isAdmin) {
    await supabase.auth.signOut();
    throw new Error('UNAUTHORIZED: Bu hesap platform admini değil.');
  }

  // Şifre doğru ve admin yetkisi onaylı → şimdi 2FA seviyesini kontrol et.
  const mfa = await getAdminMfaState();

  // Zaten aal2'ye ulaşılmışsa (örn. süren oturum) → giriş tamam.
  if (mfa.currentLevel === 'aal2') {
    return { status: 'authenticated', session };
  }

  // Kayıtlı, doğrulanmış faktör var → kod doğrulaması (challenge) iste.
  // (Supabase'de bu durumda nextLevel='aal2', currentLevel='aal1' olur.)
  if (mfa.hasVerifiedFactor) {
    const factorId = await getAdminVerifiedFactorId();
    if (factorId) {
      return { status: 'mfa_challenge', session, factorId };
    }
  }

  // Hiç faktör yok → admin güvenliği için 2FA kurulumu ZORUNLU.
  // (Supabase varsayılanı nextLevel='aal1' olsa da paneli kurulumsuz açmıyoruz.)
  return { status: 'mfa_enroll', session };
}

export async function fetchAdminRole(userId: string): Promise<AdminSession['adminRole']> {
  const { data, error } = await supabase.rpc('admin_get_my_role');
  if (!error && data) return data as AdminSession['adminRole'];
  const { data: row } = await supabase
    .from('admin_team_members')
    .select('admin_role')
    .eq('user_id', userId)
    .maybeSingle();
  return (row?.admin_role as AdminSession['adminRole']) || 'SUPPORT';
}

export async function resolveAdminSession(userId: string, email: string): Promise<AdminSession> {
  const { data, error } = await withServiceTimeout('Profil sorgusu', async () =>
    supabase
      .from('profiles')
      .select('full_name, name, is_admin, role, roles')
      .eq('id', userId)
      .maybeSingle(),
  );

  if (error) throw new Error(error.message);

  const role = data?.role as string | undefined;
  const roleList: string[] = Array.isArray(data?.roles) ? (data?.roles as string[]) : [];
  const hasRole = (r: string) => role === r || roleList.includes(r);
  let isAdmin = Boolean(
    data?.is_admin || hasRole('ADMIN') || hasRole('SUPER_ADMIN'),
  );

  // F5 güvenlik ağı: admin_set_platform_role is_admin=true yazar, ama admin_team_members'ta
  // doğrudan eklenen (RPC dışı) satırlar için profiles.is_admin hâlâ false olabilir.
  if (!isAdmin) {
    const { data: memberRow } = await supabase
      .from('admin_team_members')
      .select('admin_role')
      .eq('user_id', userId)
      .maybeSingle();
    isAdmin = Boolean(memberRow);
  }

  return {
    userId,
    email,
    name: (data?.full_name as string) || (data?.name as string) || email,
    isAdmin,
    adminRole: isAdmin ? await fetchAdminRole(userId).catch(() => 'SUPPORT' as const) : undefined,
  };
}

export async function checkPlatformAdmin(): Promise<AdminSession | null> {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session?.user?.email) return null;
  try {
    const adminSession = await resolveAdminSession(session.user.id, session.user.email);
    if (!adminSession.isAdmin) {
      void signOutAdmin();
      return null;
    }
    // 2FA güvenlik kapısı (sayfa yenileme / süren oturum):
    //  a) aal2 gerekli ama oturum yalnız aal1 ise → paneli açma (challenge gerek).
    //  b) Hiç doğrulanmış faktör yoksa → kurulum zorunlu, paneli açma.
    // Oturumu KAPATMA — kullanıcı login ekranına döner, signInAdmin onu doğru
    // MFA adımına (challenge/enroll) yönlendirir.
    const mfa = await getAdminMfaState().catch(() => null);
    if (mfa) {
      const needsChallenge = mfa.nextLevel === 'aal2' && mfa.currentLevel !== 'aal2';
      const needsEnrollment = !mfa.hasVerifiedFactor && mfa.currentLevel !== 'aal2';
      if (needsChallenge || needsEnrollment) {
        return null;
      }
    }
    return adminSession;
  } catch (err) {
    console.warn('[Admin] Geçersiz veya süresi dolmuş oturum temizleniyor:', err);
    void signOutAdmin();
    return null;
  }
}

const AUTH_STORAGE_KEY = 'oyna.auth.token';

export async function signOutAdmin(): Promise<void> {
  try {
    await Promise.race([
      supabase.auth.signOut(),
      new Promise<void>((resolve) => setTimeout(resolve, 2500)),
    ]);
  } catch {
    /* ağ hatası — yerel jeton yine de temizlenir */
  }
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    sessionStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    /* storage opsiyonel */
  }
}

export type AdminProfileStatusFilter = 'all' | 'active' | 'banned' | 'pro';

export async function fetchAdminProfiles(options?: {
  offset?: number;
  limit?: number;
  search?: string;
  status?: AdminProfileStatusFilter;
}): Promise<{
  users: AdminUser[];
  total: number;
}> {
  const limit = options?.limit ?? 500;
  const offset = options?.offset ?? 0;
  const search = options?.search?.trim() || null;
  const status = options?.status && options.status !== 'all' ? options.status : null;

  const rpcParams: Record<string, unknown> = {
    p_offset: offset,
    p_limit: limit,
  };
  if (search) rpcParams.p_search = search;
  if (status) rpcParams.p_status = status;

  const { data, error } = await supabase.rpc('admin_fetch_profiles', rpcParams);
  if (!error && data) {
    const rows = data as Array<Record<string, unknown>>;
    const total = Number(rows[0]?.total_count ?? rows.length);
    return {
      users: rows.map((row) => mapProfileRow(row)),
      total,
    };
  }
  if (error && !isRpcFallback(error)) throw new Error(error.message);

  let q = supabase
    .from('profiles')
    .select('id, full_name, name, email, phone, avatar_url, role, roles, rating, match_count, is_verified, is_banned, is_pro, wallet_balance, ban_expires_at, created_at, join_date, card_active, card_tier', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (search) {
    q = q.or(`full_name.ilike.%${search}%,name.ilike.%${search}%,email.ilike.%${search}%,role.ilike.%${search}%`);
  }
  if (status === 'banned') q = q.eq('is_banned', true);
  else if (status === 'pro') q = q.eq('is_pro', true);
  else if (status === 'active') q = q.eq('is_banned', false);

  const { data: fallback, error: fbErr, count } = await q.range(offset, offset + limit - 1);

  if (fbErr) {
    let retryQ = supabase
      .from('profiles')
      .select('id, full_name, name, email, phone, avatar_url, role, roles, rating, match_count, is_verified, is_banned, is_pro, wallet_balance, ban_expires_at, created_at, join_date, card_active, card_tier', { count: 'exact' })
      .order('join_date', { ascending: false });
    if (search) {
      retryQ = retryQ.or(`full_name.ilike.%${search}%,name.ilike.%${search}%,email.ilike.%${search}%`);
    }
    const retry = await retryQ.range(offset, offset + limit - 1);
    if (retry.error) throw new Error(retry.error.message);
    return {
      users: (retry.data || []).map((row) => mapProfileRow(row as Record<string, unknown>)),
      total: retry.count ?? 0,
    };
  }
  return {
    users: (fallback || []).map((row) => mapProfileRow(row as Record<string, unknown>)),
    total: count ?? 0,
  };
}

export async function fetchAdminSettings(): Promise<AppSettingsDb | null> {
  const { data, error } = await supabase.from('settings').select('*').eq('id', 'main').maybeSingle();
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

async function countRows(
  table: string,
  filter?: { column: string; op: 'eq' | 'in'; value: unknown },
): Promise<number> {
  let q = supabase.from(table).select('*', { count: 'exact', head: true });
  if (filter?.op === 'eq') q = q.eq(filter.column, filter.value);
  if (filter?.op === 'in') q = q.in(filter.column, filter.value as string[]);
  const { count, error } = await q;
  if (error) return 0;
  return count ?? 0;
}

async function fetchDashboardStatsFallback(): Promise<Record<string, number | string | null>> {
  const [
    total_users,
    total_pitches,
    total_matches,
    total_communities,
    pending_verifications,
    pending_pitches,
    pending_withdrawals,
    open_disputes,
    banned_users,
    active_goalkeepers,
    active_referees,
    active_promo_codes,
    settingsRes,
  ] = await Promise.all([
    countRows('profiles'),
    countRows('pitches'),
    countRows('matches'),
    countRows('communities'),
    countRows('profiles', { column: 'verification_status', op: 'eq', value: 'pending' }),
    countRows('pitches', { column: 'verification_status', op: 'eq', value: 'pending' }),
    countRows('payout_requests', { column: 'status', op: 'eq', value: 'PENDING' }),
    countRows('match_disputes', { column: 'status', op: 'in', value: ['OPEN', 'UNDER_REVIEW'] }),
    countRows('profiles', { column: 'is_banned', op: 'eq', value: true }),
    countRows('goalkeepers'),
    countRows('referees'),
    countRows('promo_codes', { column: 'is_active', op: 'eq', value: true }),
    supabase.from('settings').select('commissionRate').eq('id', 'main').maybeSingle(),
  ]);

  return {
    total_users,
    total_pitches,
    total_matches,
    total_communities,
    pending_verifications,
    pending_pitches,
    pending_withdrawals,
    open_disputes,
    banned_users,
    active_goalkeepers,
    active_referees,
    active_promo_codes,
    commission_rate: Number(settingsRes.data?.commissionRate ?? 10),
  };
}

export async function fetchDashboardStats(): Promise<AdminDashboardStats | null> {
  const { data, error } = await supabase.rpc('admin_dashboard_stats');
  if (error) {
    if (isRpcFallback(error)) {
      const fallback = await fetchDashboardStatsFallback();
      return fallback as unknown as AdminDashboardStats;
    }
    throw new Error(error.message);
  }
  return data as AdminDashboardStats;
}

export async function loadAdminOperationalData(): Promise<{
  users: AdminUser[];
  settings: AppSettingsDb | null;
  auditLogs: AdminLog[];
  stats: Record<string, number | string> | null;
}> {
  const [usersRes, settingsRes, logsRes, statsRes] = await Promise.allSettled([
    fetchAdminProfiles({ limit: 150 }),
    fetchAdminSettings(),
    fetchAdminAuditLogs(),
    fetchDashboardStats(),
  ]);

  if (usersRes.status === 'rejected') {
    console.warn('[Admin] Kullanıcı listesi yüklenemedi:', usersRes.reason);
    return {
      users: [],
      settings: settingsRes.status === 'fulfilled' ? settingsRes.value : null,
      auditLogs: logsRes.status === 'fulfilled' ? logsRes.value : [],
      stats: statsRes.status === 'fulfilled' && statsRes.value
        ? (statsRes.value as unknown as Record<string, number | string>)
        : null,
    };
  }
  return {
    users: usersRes.value.users,
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

/**
 * Oyuncunun premium kartını aktive/pasive eder ve tier atar.
 * active=false → sade profil (foto + mevki + bio + oynanan maçlar).
 * active=true  → premium FIFA kartı; tier verilmezse mevcut tier ya da 'bronze'.
 */
export async function setPlayerCardAdmin(
  userId: string,
  active: boolean,
  tier?: 'bronze' | 'silver' | 'gold' | null,
): Promise<void> {
  const { error } = await supabase.rpc('admin_set_player_card', {
    p_user_id: userId,
    p_active: active,
    p_tier: tier ?? null,
  });
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
  if (settings.payoutMode !== undefined) payload.payout_mode = settings.payoutMode;
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
  community_join_requests: Array<{
    id: string;
    community_id: string;
    community_name: string;
    user_id: string;
    user_name: string | null;
    created_at: string;
  }>;
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
  description?: string | null;
  location?: string | null;
  owner_id?: string | null;
  owner_name?: string | null;
  member_count: number;
  is_verified: boolean;
  is_private?: boolean;
  is_demo?: boolean;
  join_mode: string;
  invite_code?: string | null;
  active_matches?: number;
  created_at: string;
  updated_at?: string | null;
}

export interface CommunityMemberRow {
  id: string;
  user_id: string;
  user_name: string | null;
  user_email: string | null;
  role: string;
  notifications_enabled: boolean;
  joined_at: string;
}

export interface CommunityJoinRequestRow {
  id: string;
  user_id: string;
  user_name: string | null;
  user_email: string | null;
  message: string | null;
  status: string;
  created_at: string;
}

export interface CommunityDetail {
  community: CommunityRow & {
    rules?: string | null;
    logo_url?: string | null;
    banner_url?: string | null;
  };
  members: CommunityMemberRow[];
  pending_join_requests: CommunityJoinRequestRow[];
}

export interface CommunityAdminInput {
  name: string;
  type?: string;
  description?: string;
  rules?: string;
  domain?: string;
  location?: string;
  logo_url?: string;
  banner_url?: string;
  owner_id?: string | null;
  is_verified?: boolean;
  is_private?: boolean;
  is_demo?: boolean;
  join_mode?: 'OPEN' | 'REQUEST' | 'INVITE_ONLY';
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
  if (!error && data) return data as OpsQueue;
  if (error && !isRpcFallback(error)) throw new Error(error.message);

  const empty: OpsQueue = {
    pending_verifications: [],
    pending_pitches: [],
    pending_withdrawals: [],
    open_disputes: [],
    deletion_requests: [],
    community_requests: [],
    community_join_requests: [],
  };

  const [verif, pitches, withdrawals, disputes] = await Promise.allSettled([
    fetchPendingVerificationsAdmin(),
    fetchPitchesAdmin({ status: 'pending', limit: 50 }),
    fetchPayouts('PENDING', 50),
    fetchMatchDisputes(),
  ]);

  if (verif.status === 'fulfilled') {
    empty.pending_verifications = verif.value.map((v) => ({
      id: v.id,
      name: v.full_name ?? 'İsimsiz',
      email: v.email ?? '',
      created_at: v.created_at,
    }));
  }
  if (pitches.status === 'fulfilled') {
    empty.pending_pitches = pitches.value.pitches.map((p) => ({
      id: p.id,
      name: p.name,
      created_at: p.created_at ?? new Date().toISOString(),
    }));
  }
  if (withdrawals.status === 'fulfilled') {
    empty.pending_withdrawals = withdrawals.value.map((w) => ({
      id: w.id,
      amount: w.amount,
      owner_id: w.user_id,
      created_at: w.created_at,
    }));
  }
  if (disputes.status === 'fulfilled') {
    empty.open_disputes = disputes.value
      .filter((d) => d.status === 'OPEN' || d.status === 'PENDING')
      .map((d) => ({
        id: d.id,
        match_id: d.match_id,
        status: d.status,
        created_at: d.created_at,
      }));
  }
  return empty;
}

export async function fetchFinanceStats(days = 30): Promise<FinanceStats> {
  const { data, error } = await supabase.rpc('admin_finance_stats', { p_days: days });
  if (!error && data) return data as FinanceStats;
  if (error && !isRpcFallback(error)) throw new Error(error.message);
  return {
    booking_revenue: 0,
    wallet_credits: 0,
    wallet_debits: 0,
    withdrawal_pending: 0,
    payment_count: 0,
  };
}

export async function fetchWalletLedger(limit = 100): Promise<WalletLedgerRow[]> {
  const { data, error } = await supabase.rpc('admin_fetch_wallet_ledger', { p_limit: limit });
  if (!error && data) return (data || []) as WalletLedgerRow[];
  if (error && !isRpcFallback(error)) throw new Error(error.message);
  const { data: rows, error: fbErr } = await supabase
    .from('wallet_transactions')
    .select('id, user_id, amount, type, status, description, created_at, match_id')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (fbErr) throw new Error(fbErr.message);
  return (rows || []) as WalletLedgerRow[];
}

export async function fetchBookingPayments(limit = 100): Promise<BookingPaymentRow[]> {
  const { data, error } = await supabase.rpc('admin_fetch_booking_payments', { p_limit: limit });
  if (!error && data) return (data || []) as BookingPaymentRow[];
  if (error && !isRpcFallback(error)) throw new Error(error.message);
  return [];
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

export type BroadcastSegment = 'ALL' | 'PRO' | 'OWNER' | 'NEW_USERS' | 'GOALKEEPER' | 'REFEREE';

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

export async function fetchCommunitiesAdmin(opts?: {
  search?: string;
  verifiedOnly?: boolean | null;
  type?: string;
  limit?: number;
  offset?: number;
}): Promise<{ communities: CommunityRow[]; total: number }> {
  const { data, error } = await supabase.rpc('admin_fetch_communities', {
    p_search: opts?.search ?? null,
    p_verified_only: opts?.verifiedOnly ?? null,
    p_type: opts?.type ?? null,
    p_limit: opts?.limit ?? 100,
    p_offset: opts?.offset ?? 0,
  });
  if (error) {
    if (isRpcFallback(error)) {
      const rows = await fetchCommunitiesLegacy();
      return { communities: rows, total: rows.length };
    }
    throw new Error(error.message);
  }
  const rows = (data || []) as Array<CommunityRow & { total_count?: number }>;
  const total = rows.length > 0 ? Number(rows[0].total_count ?? rows.length) : 0;
  return {
    communities: rows.map(({ total_count: _tc, ...row }) => row),
    total,
  };
}

async function fetchCommunitiesLegacy(): Promise<CommunityRow[]> {
  const { data, error } = await supabase
    .from('communities')
    .select('id, name, type, domain, description, location, owner_id, member_count, is_verified, is_private, is_demo, join_mode, invite_code, active_matches, created_at, updated_at')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []) as CommunityRow[];
}

export async function fetchCommunities(): Promise<CommunityRow[]> {
  const res = await fetchCommunitiesAdmin({ limit: 200 });
  return res.communities;
}

export async function adminGetCommunity(id: string): Promise<CommunityDetail> {
  const { data, error } = await supabase.rpc('admin_get_community', { p_id: id });
  if (error) throw new Error(error.message);
  return data as CommunityDetail;
}

export async function createCommunityAdmin(input: CommunityAdminInput): Promise<string> {
  const { data, error } = await supabase.rpc('admin_create_community', {
    p_payload: {
      name: input.name,
      type: input.type,
      description: input.description,
      rules: input.rules,
      domain: input.domain,
      location: input.location,
      logo_url: input.logo_url,
      banner_url: input.banner_url,
      owner_id: input.owner_id,
      is_verified: input.is_verified,
      is_private: input.is_private,
      is_demo: input.is_demo,
      join_mode: input.join_mode,
    },
  });
  if (error) {
    if (isRpcFallback(error)) {
      const { data: row, error: fb } = await supabase.from('communities').insert({
        name: input.name,
        type: input.type || 'Bağımsız',
        description: input.description || '',
        location: input.location || '',
        owner_id: input.owner_id ?? null,
        is_verified: input.is_verified ?? false,
        is_private: input.is_private ?? false,
        join_mode: input.join_mode || 'OPEN',
        is_demo: input.is_demo ?? false,
      }).select('id').single();
      if (fb) throw new Error(fb.message);
      return row.id as string;
    }
    throw new Error(error.message);
  }
  return data as string;
}

export async function updateCommunityAdmin(id: string, input: Partial<CommunityAdminInput>): Promise<void> {
  const { error } = await supabase.rpc('admin_update_community', {
    p_id: id,
    p_payload: input,
  });
  if (error) throw new Error(error.message);
}

export async function deleteCommunity(id: string): Promise<void> {
  const { error } = await supabase.rpc('admin_delete_community', { p_id: id });
  if (error) {
    if (isRpcFallback(error)) {
      const fb = await supabase.from('communities').delete().eq('id', id);
      if (fb.error) throw new Error(fb.error.message);
      return;
    }
    throw new Error(error.message);
  }
}

export async function manageCommunityMember(
  communityId: string,
  userId: string,
  action: 'ADD' | 'REMOVE' | 'SET_ROLE',
  role: 'MEMBER' | 'ADMIN' = 'MEMBER',
): Promise<void> {
  const { error } = await supabase.rpc('admin_manage_community_member', {
    p_community_id: communityId,
    p_user_id: userId,
    p_action: action,
    p_role: role,
  });
  if (error) throw new Error(error.message);
}

export async function moderateJoinRequest(
  requestId: string,
  approved: boolean,
  notes?: string,
): Promise<void> {
  const { error } = await supabase.rpc('admin_moderate_join_request', {
    p_request_id: requestId,
    p_approved: approved,
    p_notes: notes ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function notifyCommunityMembers(
  communityId: string,
  title: string,
  body: string,
): Promise<number> {
  const { data, error } = await supabase.rpc('admin_notify_community', {
    p_community_id: communityId,
    p_title: title,
    p_body: body,
  });
  if (error) throw new Error(error.message);
  return Number(data);
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

// ─── Sistem Parametreleri (app_config) & Modül Anahtarları (feature_flags) ────
export interface AppConfigRow {
  key: string;
  value: unknown; // jsonb scalar — number | boolean | string
  value_type: 'number' | 'boolean' | 'text' | 'json';
  category: string;
  label: string;
  description: string | null;
  is_public: boolean;
  min_value: number | null;
  max_value: number | null;
  updated_at: string;
}

export interface FeatureFlagRow {
  key: string;
  enabled: boolean;
  label: string;
  description: string | null;
  category: string;
  updated_at: string;
}

export async function fetchAppConfig(): Promise<AppConfigRow[]> {
  const { data, error } = await supabase.rpc('admin_fetch_config');
  if (error) throw new Error(error.message);
  return (data || []) as AppConfigRow[];
}

export async function setAppConfig(key: string, value: unknown): Promise<void> {
  const { error } = await supabase.rpc('admin_set_config', { p_key: key, p_value: value });
  if (error) throw new Error(error.message);
}

export async function fetchFeatureFlags(): Promise<FeatureFlagRow[]> {
  const { data, error } = await supabase.rpc('admin_fetch_feature_flags');
  if (error) throw new Error(error.message);
  return (data || []) as FeatureFlagRow[];
}

export async function setFeatureFlag(key: string, enabled: boolean): Promise<void> {
  const { error } = await supabase.rpc('admin_set_feature_flag', { p_key: key, p_enabled: enabled });
  if (error) throw new Error(error.message);
}

/** Hafif bayrak haritası (key→enabled) — modül gizleme için (public read). */
export async function fetchFeatureFlagMap(): Promise<Record<string, boolean>> {
  const { data, error } = await supabase.from('feature_flags').select('key, enabled');
  if (error) throw new Error(error.message);
  const map: Record<string, boolean> = {};
  (data || []).forEach((r: { key: string; enabled: boolean }) => {
    map[r.key] = !!r.enabled;
  });
  return map;
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

export async function revokePlatformRole(userId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_revoke_platform_role', { p_user_id: userId });
  if (error) throw new Error(error.message);
}

export interface RevenueTrendRow {
  day_date: string;
  revenue: number;
  payment_count: number;
}

export async function fetchRevenueTrend(days = 30): Promise<RevenueTrendRow[]> {
  const { data, error } = await supabase.rpc('admin_fetch_revenue_trend', { p_days: days });
  if (error) {
    if (isRpcFallback(error)) return [];
    throw new Error(error.message);
  }
  return (data || []) as RevenueTrendRow[];
}

export interface OwnerBillingEventRow {
  id: string;
  owner_user_id: string;
  owner_name: string;
  event_type: string;
  amount: number | null;
  currency: string;
  external_id: string | null;
  created_at: string;
}

export async function fetchOwnerBillingEvents(limit = 100): Promise<OwnerBillingEventRow[]> {
  const { data, error } = await supabase.rpc('admin_fetch_owner_billing_events', { p_limit: limit });
  if (error) {
    if (isRpcFallback(error)) return [];
    throw new Error(error.message);
  }
  return (data || []) as OwnerBillingEventRow[];
}

export async function fetchProfileNameMap(userIds: string[]): Promise<Record<string, string>> {
  if (userIds.length === 0) return {};
  const unique = [...new Set(userIds)];
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in('id', unique);
  if (error) throw new Error(error.message);
  const map: Record<string, string> = {};
  (data || []).forEach((p: { id: string; full_name: string | null; email: string | null }) => {
    map[p.id] = p.full_name || p.email || p.id.slice(0, 8);
  });
  return map;
}

export async function createUserAdmin(input: {
  email: string;
  password: string;
  fullName: string;
  role?: string;
}): Promise<{ userId: string; email: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Oturum gerekli');

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-create-user`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      fullName: input.fullName,
      role: input.role ?? 'PLAYER',
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error('admin-create-user edge function deploy edilmemiş. Çalıştırın: supabase functions deploy admin-create-user');
    }
    throw new Error(body.error || 'Kullanıcı oluşturulamadı');
  }
  return body as { userId: string; email: string };
}

export async function fetchProfileById(userId: string): Promise<AdminUser | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, name, email, phone, avatar_url, role, roles, rating, match_count, is_verified, is_banned, is_pro, wallet_balance, ban_expires_at, created_at, card_active, card_tier')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) return null;
  return mapProfileRow(data as Record<string, unknown>);
}

export async function fetchTeamsFromDb(): Promise<Array<{ id: string; name: string; captain_id: string | null; created_at: string | null; is_demo?: boolean }>> {
  const { data, error } = await supabase
    .from('teams')
    .select('id, name, captain_id, captain, rating, level, location, is_demo')
    .order('name', { ascending: true })
    .limit(100);
  if (error) {
    if (isRpcFallback(error) || (error.message || '').includes('row-level security')) return [];
    throw new Error(error.message);
  }
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
  if (error) {
    if (isRpcFallback(error)) return 0;
    throw new Error(error.message);
  }
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
  const { error } = await supabase.rpc('admin_delete_promo_code', { p_id: id });
  if (error) {
    if (isRpcMissing(error)) {
      const fb = await supabase.from('promo_codes').delete().eq('id', id);
      if (fb.error) throw new Error(fb.error.message);
      return;
    }
    throw new Error(error.message);
  }
}

export async function setPromoCodeActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase.rpc('admin_set_promo_code_active', { p_id: id, p_active: isActive });
  if (error) {
    if (isRpcMissing(error)) {
      const fb = await supabase.from('promo_codes').update({ is_active: isActive }).eq('id', id);
      if (fb.error) throw new Error(fb.error.message);
      return;
    }
    throw new Error(error.message);
  }
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
    const texts = await fetchCmsTextsAdmin();
    return { texts };
  } catch {
    return { texts: {} };
  }
}

// ─── Admin Maç Kontrol RPC'leri ───────────────────────────────────────────

export async function fetchMatchesAdmin(opts?: {
  search?: string;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ matches: MatchListing[]; total: number }> {
  const { data, error } = await supabase.rpc('admin_fetch_matches', {
    p_search: opts?.search?.trim() || null,
    p_status: opts?.status && opts.status !== 'ALL' ? opts.status : null,
    p_limit: opts?.limit ?? 100,
    p_offset: opts?.offset ?? 0,
  });
  if (error) {
    if (isRpcFallback(error)) {
      const { fbGetMatches } = await import('../../supabaseMutations');
      const rows = await fbGetMatches();
      return { matches: rows as MatchListing[], total: rows.length };
    }
    throw new Error(error.message);
  }
  const rows = (data || []) as AdminMatchRow[];
  const total = rows[0]?.total_count ?? rows.length;
  return { matches: rows.map((r) => mapAdminMatchRowToListing(r)), total: Number(total) };
}

export async function adminGetMatchAdmin(matchId: string): Promise<MatchListing | null> {
  const { data, error } = await supabase.rpc('admin_get_match', { p_match_id: matchId });
  if (error) {
    if (isRpcFallback(error)) {
      const { fbGetMatches } = await import('../../supabaseMutations');
      const rows = await fbGetMatches();
      return (rows as MatchListing[]).find((m) => m.id === matchId) ?? null;
    }
    throw new Error(error.message);
  }
  if (!data) return null;
  return mapAdminMatchRowToListing(data as Record<string, unknown>);
}

export async function createMatchAdmin(payload: Record<string, unknown>): Promise<string> {
  const { data, error } = await supabase.rpc('admin_create_match', { p_payload: payload });
  if (error) throw new Error(isRpcMissing(error) ? 'admin_create_match RPC deploy edilmedi — npm run admin:deploy' : error.message);
  return data as string;
}

export async function updateMatchAdmin(matchId: string, payload: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.rpc('admin_update_match', { p_match_id: matchId, p_payload: payload });
  if (error) throw new Error(isRpcMissing(error) ? 'admin_update_match RPC deploy edilmedi' : error.message);
}

export async function cancelMatchAdmin(matchId: string, reason?: string, refund = false): Promise<void> {
  const { error } = await supabase.rpc('admin_cancel_match', {
    p_match_id: matchId,
    p_reason: reason ?? null,
    p_refund: refund,
  });
  if (error) throw new Error(error.message);
}

export async function setMatchStatusAdmin(matchId: string, status: string): Promise<void> {
  const { error } = await supabase.rpc('admin_set_match_status', { p_match_id: matchId, p_status: status });
  if (error) throw new Error(error.message);
}

export async function deleteMatchAdmin(matchId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_delete_match', { p_match_id: matchId });
  if (error) {
    if (isRpcMissing(error)) {
      const { fbDeleteMatch } = await import('../../supabaseMutations');
      await fbDeleteMatch(matchId);
      return;
    }
    throw new Error(error.message);
  }
}

export async function kickFromSlotAdmin(matchId: string, slotId: string, isAway = false): Promise<PositionSlot[]> {
  const { data, error } = await supabase.rpc('admin_kick_from_slot', {
    p_match_id: matchId,
    p_slot_id: slotId,
    p_is_away: isAway,
  });
  if (error) throw new Error(error.message);
  return (data || []) as PositionSlot[];
}

export async function assignToSlotAdmin(matchId: string, slotId: string, userId: string, isAway = false): Promise<PositionSlot[]> {
  const { data, error } = await supabase.rpc('admin_assign_to_slot', {
    p_match_id: matchId,
    p_slot_id: slotId,
    p_user_id: userId,
    p_is_away: isAway,
  });
  if (error) throw new Error(error.message);
  return (data || []) as PositionSlot[];
}

export async function assignMatchRefereeAdmin(matchId: string, refereeId: string | null): Promise<void> {
  const { error } = await supabase.rpc('admin_assign_match_referee', {
    p_match_id: matchId,
    p_referee_id: refereeId,
  });
  if (error) throw new Error(error.message);
}

// ─── Maç Kontrol Kokpiti (Wave 9) ────────────────────────────────────────────
export async function assignMatchGoalkeeperAdmin(matchId: string, goalkeeperId: string | null): Promise<void> {
  const { error } = await supabase.rpc('admin_assign_match_goalkeeper', { p_match_id: matchId, p_goalkeeper_id: goalkeeperId });
  if (error) throw new Error(error.message);
}

export interface MatchTimelineRow {
  source: string;
  event_type: string;
  title: string;
  detail: string | null;
  actor: string | null;
  created_at: string;
}

export async function fetchMatchTimelineAdmin(matchId: string): Promise<MatchTimelineRow[]> {
  const { data, error } = await supabase.rpc('admin_fetch_match_timeline', { p_match_id: matchId });
  if (error) throw new Error(error.message);
  return (data || []) as MatchTimelineRow[];
}

export async function overrideMatchScoreAdmin(matchId: string, home: number, away: number, notes?: string): Promise<void> {
  const { error } = await supabase.rpc('admin_override_match_score', {
    p_match_id: matchId, p_home: home, p_away: away, p_notes: notes ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function notifyMatchRosterAdmin(matchId: string, title: string, body: string): Promise<number> {
  const { data, error } = await supabase.rpc('admin_notify_match_roster', {
    p_match_id: matchId, p_title: title, p_body: body,
  });
  if (error) throw new Error(error.message);
  return Number(data) || 0;
}

export interface MatchIntentRow {
  id: string;
  user_id: string | null;
  user_name: string;
  amount: number;
  status: string;
  commission_amount: number | null;
  owner_amount: number | null;
  created_at: string;
}

export async function fetchMatchIntentsAdmin(matchId: string): Promise<MatchIntentRow[]> {
  const { data, error } = await supabase.rpc('admin_fetch_match_intents', { p_match_id: matchId });
  if (error) throw new Error(error.message);
  return (data || []) as MatchIntentRow[];
}

export async function forceCaptureIntentAdmin(intentId: string, notes?: string): Promise<void> {
  const { error } = await supabase.rpc('admin_force_capture_intent', { p_intent_id: intentId, p_notes: notes ?? null });
  if (error) throw new Error(error.message);
}

export async function forceVoidIntentAdmin(intentId: string, reason?: string): Promise<void> {
  const { error } = await supabase.rpc('admin_force_void_intent', { p_intent_id: intentId, p_reason: reason ?? null });
  if (error) throw new Error(error.message);
}

export async function forceRefundIntentAdmin(intentId: string, notes?: string): Promise<void> {
  const { error } = await supabase.rpc('admin_refund_intent', { p_intent_id: intentId, p_notes: notes ?? null });
  if (error) throw new Error(error.message);
}

export interface MatchAuditRow {
  id: string;
  action: string;
  admin_name: string | null;
  target_identifier: string | null;
  old_value: unknown;
  new_value: unknown;
  created_at: string;
}

export async function fetchMatchAuditAdmin(matchId: string): Promise<MatchAuditRow[]> {
  const { data, error } = await supabase.rpc('admin_fetch_match_audit', { p_match_id: matchId });
  if (error) throw new Error(error.message);
  return (data || []) as MatchAuditRow[];
}

export function buildMatchPayloadFromListing(match: Partial<MatchListing> & { rawDate?: string }): Record<string, unknown> {
  return listingToMatchPayload(match);
}

// ─── Pitch admin RPCs ───────────────────────────────────────────────────────

export interface AdminPitchRow {
  id: string;
  name: string;
  district: string | null;
  city: string | null;
  latitude: number;
  longitude: number;
  price_per_match: number;
  google_rating: number | null;
  google_review_count: number | null;
  verification_status: string | null;
  owner_id: string | null;
  image: string | null;
  isDemo: boolean;
  created_at: string | null;
  total_count: number;
}

export function buildPitchPayloadFromUi(pitch: Partial<import('../../types').Pitch>): Record<string, unknown> {
  return {
    id: pitch.id,
    name: pitch.name,
    district: pitch.district,
    city: pitch.district,
    latitude: pitch.coordinates?.lat ?? 40.9839,
    longitude: pitch.coordinates?.lng ?? 37.8764,
    price_per_match: pitch.totalPrice ?? pitch.pricePerPerson ?? 0,
    google_rating: pitch.googleRating ?? 4.5,
    google_review_count: pitch.googleReviews ?? 0,
    verification_status: pitch.isApproved === false ? 'pending' : 'approved',
    image: pitch.image,
    isDemo: (pitch as { isDemo?: boolean }).isDemo ?? false,
  };
}

export async function fetchPitchesAdmin(opts?: {
  search?: string;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ pitches: AdminPitchRow[]; total: number }> {
  const { data, error } = await supabase.rpc('admin_fetch_pitches', {
    p_search: opts?.search ?? null,
    p_status: opts?.status ?? null,
    p_limit: opts?.limit ?? 200,
    p_offset: opts?.offset ?? 0,
  });
  if (error) {
    if (isRpcFallback(error)) {
      const { fbGetPitches } = await import('../../supabaseMutations');
      const rows = await fbGetPitches() as Array<Record<string, unknown>>;
      let filtered = rows;
      if (opts?.status === 'pending') {
        filtered = filtered.filter((p) =>
          p.isApproved === false
          || p.verification_status === 'pending'
          || (p as { verificationStatus?: string }).verificationStatus === 'pending',
        );
      }
      const q = opts?.search?.trim().toLowerCase();
      if (q) filtered = filtered.filter((p) => JSON.stringify(p).toLowerCase().includes(q));
      const mapped: AdminPitchRow[] = filtered.map((p) => ({
        id: String(p.id),
        name: String(p.name || ''),
        district: (p.district as string) ?? null,
        city: (p.district as string) ?? null,
        latitude: Number((p.coordinates as { lat?: number })?.lat ?? 40.9839),
        longitude: Number((p.coordinates as { lng?: number })?.lng ?? 37.8764),
        price_per_match: Number(p.totalPrice ?? 0),
        google_rating: Number(p.googleRating ?? 4.5),
        google_review_count: Number(p.googleReviews ?? 0),
        verification_status: p.isApproved === false ? 'pending' : 'approved',
        owner_id: null,
        image: (p.image as string) ?? null,
        isDemo: Boolean((p as { isDemo?: boolean }).isDemo),
        created_at: null,
        total_count: filtered.length,
      }));
      return { pitches: mapped, total: mapped.length };
    }
    throw new Error(error.message);
  }
  const rows = (data || []) as AdminPitchRow[];
  const total = rows[0]?.total_count ?? rows.length;
  return { pitches: rows, total: Number(total) };
}

export async function createPitchAdmin(payload: Record<string, unknown>): Promise<string> {
  const { data, error } = await supabase.rpc('admin_create_pitch', { p_payload: payload });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function updatePitchAdmin(pitchId: string, payload: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.rpc('admin_update_pitch', { p_pitch_id: pitchId, p_payload: payload });
  if (error) throw new Error(error.message);
}

export async function deletePitchAdmin(pitchId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_delete_pitch', { p_pitch_id: pitchId });
  if (error) throw new Error(error.message);
}

export interface PayoutRequestRow {
  id: string;
  user_id: string;
  amount: number;
  iban: string;
  iban_holder_name: string;
  payout_type: string;
  status: string;
  created_at: string;
  processed_at: string | null;
  iyzico_payout_ref: string | null;
  admin_notes: string | null;
}

/** Faz 2 payout_requests taleplerini getirir (saha sahibi 2-haftalık + provider anlık). */
export async function fetchPayouts(status = 'PENDING', limit = 100): Promise<PayoutRequestRow[]> {
  const { data, error } = await supabase.rpc('admin_fetch_payouts', { p_status: status, p_limit: limit });
  if (error) throw new Error(isRpcMissing(error) ? 'admin_fetch_payouts RPC deploy edilmedi' : error.message);
  return (data || []) as PayoutRequestRow[];
}

/** Payout talebini işler: PROCESSING/COMPLETED/FAILED/CANCELLED (admin_process_payout). */
export async function processPayout(
  payoutId: string,
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED',
  ref?: string,
  notes?: string,
): Promise<void> {
  const { error } = await supabase.rpc('admin_process_payout', {
    p_payout_id: payoutId,
    p_status: status,
    p_ref: ref ?? null,
    p_notes: notes ?? null,
  });
  if (error) throw new Error(error.message);
}

/** Yanlış COMPLETED işaretlenen payout'u geri al → PENDING (admin_reverse_payout). */
export async function reversePayout(payoutId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('admin_reverse_payout', { p_payout_id: payoutId, p_reason: reason });
  if (error) throw new Error(error.message);
}

// ─── Wave 11: Ödeme go-live ön-uçuş + mutabakat ─────────────────────────────
export interface PaymentGoliveCheck { check_key: string; ok: boolean; detail: string; }

/** Gerçek ödemeye geçmeden önce hazırlık kontrolü (admin_payment_golive_readiness). */
export async function fetchPaymentGoliveReadiness(): Promise<PaymentGoliveCheck[]> {
  const { data, error } = await supabase.rpc('admin_payment_golive_readiness');
  if (error) throw new Error(isRpcMissing(error) ? 'admin_payment_golive_readiness RPC deploy edilmedi' : error.message);
  return (data || []) as PaymentGoliveCheck[];
}

export interface ReconciliationSummary {
  from: string; to: string;
  captured_count: number; gross_captured: number; total_commission: number; owner_share: number;
  refunded_count: number; refunded_sum: number; booking_payments: number;
  wallet_pending: number; wallet_completed: number; payout_requested: number; payout_completed: number;
}

/** Tahsilat/komisyon/owner/iade/payout mutabakat özeti (admin_reconciliation_summary). */
export async function fetchReconciliationSummary(from?: string, to?: string): Promise<ReconciliationSummary> {
  const params: Record<string, string> = {};
  if (from) params.p_from = from;
  if (to) params.p_to = to;
  const { data, error } = await supabase.rpc('admin_reconciliation_summary', params);
  if (error) throw new Error(isRpcMissing(error) ? 'admin_reconciliation_summary RPC deploy edilmedi' : error.message);
  return (data || {}) as ReconciliationSummary;
}

// ─── Wave 12: Toplu bildirim geçmişi + şablon editörü ───────────────────────
export interface BroadcastCampaignRow {
  id: string; created_by_name: string; segment: string; type_key: string | null;
  title: string; body: string; recipient_count: number; status: string;
  is_simulation: boolean; created_at: string;
}

/** Gönderilen toplu bildirim kampanyalarının geçmişi (admin_fetch_broadcast_campaigns). */
export async function fetchBroadcastCampaigns(limit = 50): Promise<BroadcastCampaignRow[]> {
  const { data, error } = await supabase.rpc('admin_fetch_broadcast_campaigns', { p_limit: limit });
  if (error) {
    if (isRpcFallback(error)) return [];
    throw new Error(error.message);
  }
  return (data || []) as BroadcastCampaignRow[];
}

export interface NotificationTemplateRow {
  id: string; type_key: string; label_tr: string; title_tr: string; body_tr: string;
  title_en: string | null; body_en: string | null; category: string | null;
  is_mandatory: boolean; can_user_disable: boolean; sound: string | null; sort_order: number;
}

/** Bildirim şablonlarını getirir (admin_fetch_notification_templates). */
export async function fetchNotificationTemplates(): Promise<NotificationTemplateRow[]> {
  const { data, error } = await supabase.rpc('admin_fetch_notification_templates');
  if (error) throw new Error(isRpcMissing(error) ? 'admin_fetch_notification_templates RPC deploy edilmedi' : error.message);
  return (data || []) as NotificationTemplateRow[];
}

/** Bir şablonun METİN alanlarını günceller (admin_update_notification_template). */
export async function updateNotificationTemplate(
  id: string,
  labelTr: string,
  titleTr: string,
  bodyTr: string,
  titleEn?: string | null,
  bodyEn?: string | null,
): Promise<void> {
  const { error } = await supabase.rpc('admin_update_notification_template', {
    p_id: id, p_label_tr: labelTr, p_title_tr: titleTr, p_body_tr: bodyTr,
    p_title_en: titleEn ?? null, p_body_en: bodyEn ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function deleteGoalkeeperAdmin(id: string): Promise<void> {
  const { error } = await supabase.rpc('admin_delete_goalkeeper', { p_id: id });
  if (error) throw new Error(isRpcMissing(error) ? 'admin_delete_goalkeeper RPC deploy edilmedi' : error.message);
}

export async function deleteRefereeAdmin(id: string): Promise<void> {
  const { error } = await supabase.rpc('admin_delete_referee', { p_id: id });
  if (error) throw new Error(isRpcMissing(error) ? 'admin_delete_referee RPC deploy edilmedi' : error.message);
}

export async function updateOwnerAccountAdmin(ownerUserId: string, payload: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.rpc('admin_update_owner_account', {
    p_owner_user_id: ownerUserId,
    p_payload: payload,
  });
  if (error) {
    if (isRpcMissing(error)) {
      const { updateOwnerAccountForAdmin } = await import('../../services/ownerAccountService');
      await updateOwnerAccountForAdmin(ownerUserId, payload as Parameters<typeof updateOwnerAccountForAdmin>[1]);
      return;
    }
    throw new Error(error.message);
  }
}

export function buildUserProfilePayload(user: import('../../types').AdminUser): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    full_name: user.name,
    email: user.email,
    avatar_url: user.avatar,
    role: user.role,
    is_verified: user.isVerified,
    is_pro: user.isPro,
    wallet_balance: user.wallet,
    match_count: user.matchCount,
    rating: user.rating,
  };
  if (user.phone) payload.phone = user.phone;
  if (user.playerCard) payload.player_card = user.playerCard;
  if (user.matchCount !== undefined || user.rating !== undefined) {
    payload.stats = { matchesPlayed: user.matchCount ?? 0, rating: user.rating ?? 5 };
  }
  return payload;
}

function providerToDbPayload(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const map: Record<string, string> = {
    matchCount: 'match_count',
    recentAwards: 'recent_awards',
    preferredZones: 'preferred_zones',
    isElite: 'is_elite',
    isAvailable: 'is_available',
    workingHours: 'working_hours',
    authUid: 'auth_uid',
  };
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || key === 'id') continue;
    out[map[key] ?? key] = value;
  }
  return out;
}

export async function updateUserProfileAdmin(user: import('../../types').AdminUser): Promise<void> {
  const payload = buildUserProfilePayload(user);
  const { error } = await supabase.rpc('admin_update_user_profile', {
    p_user_id: user.id,
    p_payload: payload,
  });
  if (error) {
    if (isRpcMissing(error)) {
      const { fbUpdateUser } = await import('../../supabaseMutations');
      await fbUpdateUser(user);
      return;
    }
    throw new Error(error.message);
  }
}

export async function toggleUserProAdmin(userId: string, isPro: boolean): Promise<void> {
  const { error } = await supabase.rpc('admin_toggle_user_pro', { p_user_id: userId, p_is_pro: isPro });
  if (error) {
    if (isRpcMissing(error)) {
      const { fbToggleUserPro } = await import('../../supabaseMutations');
      await fbToggleUserPro(userId, isPro);
      return;
    }
    throw new Error(error.message);
  }
}

export async function verifyUserAdmin(userId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_verify_user', { p_user_id: userId });
  if (error) {
    if (isRpcMissing(error)) {
      const { fbVerifyUser } = await import('../../supabaseMutations');
      await fbVerifyUser(userId);
      return;
    }
    throw new Error(error.message);
  }
}

export async function updateGoalkeeperAdmin(gk: import('../../types').Goalkeeper): Promise<void> {
  const payload = providerToDbPayload(gk as unknown as Record<string, unknown>);
  const { error } = await supabase.rpc('admin_update_goalkeeper', { p_id: gk.id, p_payload: payload });
  if (error) {
    if (isRpcMissing(error)) {
      const { fbUpdateGoalkeeper } = await import('../../supabaseMutations');
      await fbUpdateGoalkeeper(gk);
      return;
    }
    throw new Error(error.message);
  }
}

export async function updateRefereeAdmin(ref: import('../../types').Referee): Promise<void> {
  const payload = providerToDbPayload(ref as unknown as Record<string, unknown>);
  const { error } = await supabase.rpc('admin_update_referee', { p_id: ref.id, p_payload: payload });
  if (error) {
    if (isRpcMissing(error)) {
      const { fbUpdateReferee } = await import('../../supabaseMutations');
      await fbUpdateReferee(ref);
      return;
    }
    throw new Error(error.message);
  }
}

export interface PendingVerificationRow {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  primary_role: string | null;
  roles: string[] | null;
  verification_status: string;
  created_at: string;
  gk_profile_id: string | null;
  gk_bio: string | null;
  gk_fee: number | null;
  ref_profile_id: string | null;
  ref_bio: string | null;
  ref_fee: number | null;
}

export async function fetchPendingVerificationsAdmin(): Promise<PendingVerificationRow[]> {
  const { data, error } = await supabase.rpc('admin_fetch_pending_verifications');
  if (error) {
    if (isRpcFallback(error)) {
      const { data: rows, error: fbErr } = await supabase
        .from('pending_provider_verifications')
        .select('*')
        .order('created_at', { ascending: true });
      if (fbErr) throw new Error(fbErr.message);
      return (rows || []) as PendingVerificationRow[];
    }
    throw new Error(error.message);
  }
  return (data || []) as PendingVerificationRow[];
}

export async function approveProviderVerification(
  userId: string,
  approved: boolean,
  notes?: string,
): Promise<void> {
  const { error } = await supabase.rpc('approve_provider_verification', {
    p_user_id: userId,
    p_approved: approved,
    p_notes: notes ?? null,
  });
  if (error) throw new Error(error.message);
}

// ─── Faz 5: Kaleci & Hakem kimlik doğrulama + hizmet itirazları ─────────────

export interface ProviderIdentityRow {
  user_id: string;
  full_name: string | null;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  birth_year: number | null;
  created_at: string;
  email: string | null;
  avatar_url: string | null;
}

export interface ProviderApplicationRow {
  id: string;
  user_id: string;
  role: string;
  id_photo_path: string | null;
  phone: string | null;
  intent_letter: string | null;
  level: string | null;
  status: string;
  created_at: string;
}

export interface ServiceDisputeRow {
  id: string;
  match_id: string;
  provider_id: string;
  provider_type: string | null;
  fee: number | null;
  provider_amount: number | null;
  status: string;
  reported_at: string;
  payout_released: boolean;
  provider_name?: string | null;
}

/** Kimlik doğrulaması bekleyen sağlayıcılar (provider_identities status='PENDING') */
export async function fetchPendingProviderIdentities(): Promise<ProviderIdentityRow[]> {
  const { data, error } = await supabase
    .from('provider_identities')
    .select('user_id, full_name, status, birth_year, created_at')
    .eq('status', 'PENDING')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);

  const rows = (data || []) as Array<Omit<ProviderIdentityRow, 'email' | 'avatar_url'>>;
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.user_id);
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, email, avatar_url')
    .in('id', ids);
  const profileMap: Record<string, { full_name: string | null; email: string | null; avatar_url: string | null }> = {};
  (profiles || []).forEach((p: { id: string; full_name: string | null; email: string | null; avatar_url: string | null }) => {
    profileMap[p.id] = { full_name: p.full_name, email: p.email, avatar_url: p.avatar_url };
  });

  return rows.map((r) => ({
    ...r,
    full_name: r.full_name ?? profileMap[r.user_id]?.full_name ?? null,
    email: profileMap[r.user_id]?.email ?? null,
    avatar_url: profileMap[r.user_id]?.avatar_url ?? null,
  }));
}

/** Sağlayıcı kimliğini VERIFIED/REJECTED yap (admin_verify_provider_identity) */
export async function verifyProviderIdentity(
  userId: string,
  approve: boolean,
  notes?: string,
): Promise<void> {
  const { error } = await supabase.rpc('admin_verify_provider_identity', {
    p_user_id: userId,
    p_approve: approve,
    p_notes: notes ?? null,
  });
  if (error) throw new Error(error.message);
}

/** Bir kullanıcının son PENDING başvurusu (kimlik fotoğrafı + niyet mektubu için) */
export async function fetchProviderApplication(userId: string): Promise<ProviderApplicationRow | null> {
  const { data, error } = await supabase
    .from('provider_applications')
    .select('id, user_id, role, id_photo_path, phone, intent_letter, level, status, created_at')
    .eq('user_id', userId)
    .eq('status', 'PENDING')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if ((error.message || '').includes('row-level security')) return null;
    throw new Error(error.message);
  }
  return (data as ProviderApplicationRow | null) ?? null;
}

/** Private provider-docs bucket için kısa ömürlü imzalı URL */
export async function getProviderDocSignedUrl(path: string): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from('provider-docs')
    .createSignedUrl(path, 120);
  if (error) return null;
  return data?.signedUrl ?? null;
}

/** Başvuruyu APPROVED/REJECTED yap + rol/verification_status set (admin_review_provider_application) */
export async function reviewProviderApplication(
  appId: string,
  approve: boolean,
  notes?: string,
): Promise<void> {
  const { error } = await supabase.rpc('admin_review_provider_application', {
    p_app_id: appId,
    p_approve: approve,
    p_notes: notes ?? null,
  });
  if (error) throw new Error(error.message);
}

/** Açık hizmet itirazları: reported_at not null & payout_released=false (+ sağlayıcı adı) */
export async function fetchServiceDisputes(): Promise<ServiceDisputeRow[]> {
  const { data, error } = await supabase
    .from('service_requests')
    .select('id, match_id, provider_id, provider_type, fee, provider_amount, status, reported_at, payout_released')
    .not('reported_at', 'is', null)
    .eq('payout_released', false)
    .order('reported_at', { ascending: true });
  if (error) throw new Error(error.message);

  const rows = (data || []) as ServiceDisputeRow[];
  if (rows.length === 0) return rows;

  const providerIds = [...new Set(rows.map((r) => r.provider_id).filter(Boolean))];
  const nameMap = providerIds.length > 0 ? await fetchProfileNameMap(providerIds) : {};
  return rows.map((r) => ({ ...r, provider_name: nameMap[r.provider_id] ?? null }));
}

/** İtiraz edilen hizmet ödemesini serbest bırak (admin_release_service_payout) */
export async function releaseServicePayout(requestId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_release_service_payout', {
    p_request_id: requestId,
  });
  if (error) throw new Error(error.message);
}

export async function fetchGoalkeepersAdmin(limit = 500): Promise<Goalkeeper[]> {
  const { data, error } = await supabase.rpc('admin_fetch_goalkeepers', { p_limit: limit });
  if (error) {
    if (isRpcFallback(error)) {
      const { fbGetGoalkeepers } = await import('../../supabaseMutations');
      return await fbGetGoalkeepers();
    }
    throw new Error(error.message);
  }
  return (data || []).map((row) => mapDbRowToCamel(row as Record<string, unknown>) as unknown as Goalkeeper);
}

export async function fetchRefereesAdmin(limit = 500): Promise<Referee[]> {
  const { data, error } = await supabase.rpc('admin_fetch_referees', { p_limit: limit });
  if (error) {
    if (isRpcFallback(error)) {
      const { fbGetReferees } = await import('../../supabaseMutations');
      return await fbGetReferees();
    }
    throw new Error(error.message);
  }
  return (data || []).map((row) => mapDbRowToCamel(row as Record<string, unknown>) as unknown as Referee);
}

export async function fetchCmsTextsAdmin(): Promise<Record<string, string>> {
  const { data, error } = await supabase.rpc('admin_fetch_cms_texts');
  if (!error && data) {
    return (typeof data === 'object' && data !== null ? data : {}) as Record<string, string>;
  }
  return fetchCmsTexts();
}

export async function fetchProfileNamesAdmin(ids: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return {};
  const { data, error } = await supabase.rpc('admin_fetch_profile_names', { p_ids: unique });
  if (error) {
    if (isRpcFallback(error)) {
      const { data: rows } = await supabase.from('profiles').select('id, full_name').in('id', unique);
      const map: Record<string, string> = {};
      (rows ?? []).forEach((r) => { map[r.id] = r.full_name ?? 'Bilinmeyen'; });
      return map;
    }
    throw new Error(error.message);
  }
  const map: Record<string, string> = {};
  (data || []).forEach((r: { id: string; full_name: string }) => { map[r.id] = r.full_name; });
  return map;
}

export async function loadAdminInventoryFromRpc(): Promise<{
  pitches: Pitch[];
  matches: MatchListing[];
  teams: Team[];
  goalkeepers: Goalkeeper[];
  referees: Referee[];
  texts: Record<string, string>;
  warnings: string[];
}> {
  const warnings: string[] = [];
  const labels = ['Sahalar', 'Maçlar', 'Takımlar', 'Kaleciler', 'Hakemler', 'CMS metinleri'] as const;
  const settled = await Promise.allSettled([
    fetchPitchesAdmin({ limit: ADMIN_BOOTSTRAP_LIMIT }),
    fetchMatchesAdmin({ limit: ADMIN_BOOTSTRAP_LIMIT }),
    fetchTeamsFromDb(),
    fetchGoalkeepersAdmin(ADMIN_BOOTSTRAP_LIMIT),
    fetchRefereesAdmin(ADMIN_BOOTSTRAP_LIMIT),
    fetchCmsTextsAdmin(),
  ]);

  const pitchesRes = settled[0].status === 'fulfilled'
    ? settled[0].value
    : { pitches: [], total: 0 };
  const matchesRes = settled[1].status === 'fulfilled'
    ? settled[1].value
    : { matches: [], total: 0 };
  const teams = settled[2].status === 'fulfilled' ? settled[2].value : [];
  const goalkeepers = settled[3].status === 'fulfilled' ? settled[3].value : [];
  const referees = settled[4].status === 'fulfilled' ? settled[4].value : [];
  const texts = settled[5].status === 'fulfilled' ? settled[5].value : {};

  settled.forEach((result, i) => {
    if (result.status === 'rejected') {
      warnings.push(`${labels[i]} yüklenemedi: ${toTurkishAdminError(result.reason)}`);
    }
  });

  if (warnings.length > 0) {
    warnings.push('Bazı veriler yedek okuma modunda yüklendi. Tam yetki için profiles.is_admin=true kontrol edin.');
  }

  return {
    pitches: pitchesRes.pitches.map(mapAdminPitchRowToUi),
    matches: matchesRes.matches,
    teams: teams as unknown as Team[],
    goalkeepers,
    referees,
    texts,
    warnings,
  };
}
