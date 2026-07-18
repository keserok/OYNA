import { supabase } from '../supabaseClient';
import { mapStaffError } from '../shared/staffModel';

export { mapStaffError } from '../shared/staffModel';

// ═══════════════════════════════════════════════════════════════════════════
// PERSONEL (STAFF) VERİ KATMANI — davet yaşam döngüsü + ekip + panel girişi
// Tüm yazma/okuma denetimli SECURITY DEFINER RPC'lerden geçer (STAFF-1/2).
//   • Davet/rol/kaldır: SAHİP-only (staff_invite/set_role/remove/regenerate)
//   • Roster/nöbet: yönetim (staff_upsert_roster/set_duty/delete_roster)
//   • Ekip listesi: kasa (get_pitch_team — davet kodu yalnız yöneticiye)
//   • Panel girişi: get_my_staff_pitches (kullanıcının yönettiği tesisler)
// ═══════════════════════════════════════════════════════════════════════════

export type AccessLevel = 'OWNER' | 'MANAGER' | 'STAFF';
export type StaffRole = 'MANAGER' | 'STAFF';
export type StaffAccountStatus = 'ROSTER' | 'INVITED' | 'ACTIVE' | 'PASSIVE';
export type DutyStatus = 'ON_DUTY' | 'OFF_DUTY' | 'LEAVE';

export interface TeamMember {
  id: string;
  name: string;
  role_title: string;
  status: DutyStatus;
  avatar_url: string | null;
  phone: string | null;
  sort_order: number;
  staff_role: StaffRole;
  account_status: StaffAccountStatus;
  is_demo: boolean;
  invite_code: string | null;         // yalnız yönetici görür (aksi null)
  invite_expires_at: string | null;   // yalnız yönetici görür
}

export interface InviteResult {
  member_id: string;
  invite_code: string;
  expires_at: string;
  staff_role: StaffRole;
  name: string;
}

export interface AcceptResult {
  pitch_id: string;
  pitch_name: string;
  staff_role: StaffRole;
  member_id: string;
}

export interface StaffPitch {
  pitch_id: string;
  pitch_name: string;
  access_level: StaffRole;   // MANAGER | STAFF (sahip zaten kendi paneline düşer)
  role_title: string;
  member_id: string;
}

// ── DAVET (SAHİP-only) ──────────────────────────────────────────────────────
export async function staffInvite(
  pitchId: string,
  opts: { memberId?: string; name?: string; roleTitle?: string; phone?: string; staffRole?: StaffRole },
): Promise<InviteResult> {
  const { data, error } = await supabase.rpc('staff_invite', {
    p_pitch_id: pitchId,
    p_member_id: opts.memberId ?? null,
    p_name: opts.name ?? null,
    p_role_title: opts.roleTitle ?? null,
    p_phone: opts.phone ?? null,
    p_staff_role: opts.staffRole ?? 'STAFF',
  });
  if (error) throw new Error(mapStaffError(error));
  return data as InviteResult;
}

export async function staffRegenerateInvite(memberId: string): Promise<InviteResult> {
  const { data, error } = await supabase.rpc('staff_regenerate_invite', { p_member_id: memberId });
  if (error) throw new Error(mapStaffError(error));
  return data as InviteResult;
}

export async function staffSetRole(memberId: string, role: StaffRole): Promise<void> {
  const { error } = await supabase.rpc('staff_set_role', { p_member_id: memberId, p_staff_role: role });
  if (error) throw new Error(mapStaffError(error));
}

export async function staffRemove(memberId: string): Promise<void> {
  const { error } = await supabase.rpc('staff_remove', { p_member_id: memberId });
  if (error) throw new Error(mapStaffError(error));
}

// ── DAVET KABUL (herhangi kullanıcı) ────────────────────────────────────────
export async function staffAcceptInvite(code: string): Promise<AcceptResult> {
  const { data, error } = await supabase.rpc('staff_accept_invite', { p_code: code });
  if (error) throw new Error(mapStaffError(error));
  return data as AcceptResult;
}

// ── ROSTER / NÖBET (yönetim) ────────────────────────────────────────────────
export async function staffUpsertRoster(
  pitchId: string,
  opts: { memberId?: string; name?: string; roleTitle?: string; phone?: string; sortOrder?: number },
): Promise<string> {
  const { data, error } = await supabase.rpc('staff_upsert_roster', {
    p_pitch_id: pitchId,
    p_member_id: opts.memberId ?? null,
    p_name: opts.name ?? null,
    p_role_title: opts.roleTitle ?? null,
    p_phone: opts.phone ?? null,
    p_sort_order: opts.sortOrder ?? 0,
  });
  if (error) throw new Error(mapStaffError(error));
  return data as string;
}

export async function staffSetDuty(memberId: string, status: DutyStatus): Promise<void> {
  const { error } = await supabase.rpc('staff_set_duty', { p_member_id: memberId, p_status: status });
  if (error) throw new Error(mapStaffError(error));
}

export async function staffDeleteRoster(memberId: string): Promise<void> {
  const { error } = await supabase.rpc('staff_delete_roster', { p_member_id: memberId });
  if (error) throw new Error(mapStaffError(error));
}

// ── EKİP LİSTESİ (kasa) — davet kodu yalnız yöneticiye döner ────────────────
export async function getPitchTeam(pitchId: string): Promise<TeamMember[]> {
  const { data, error } = await supabase.rpc('get_pitch_team', { p_pitch_id: pitchId });
  if (error) throw new Error(mapStaffError(error));
  return (data ?? []) as TeamMember[];
}

// ── PANEL GİRİŞİ — kullanıcının personel/müdür olduğu tesisler ──────────────
export async function getMyStaffPitches(): Promise<StaffPitch[]> {
  const { data, error } = await supabase.rpc('get_my_staff_pitches');
  if (error) throw new Error(mapStaffError(error));
  return (data ?? []) as StaffPitch[];
}
