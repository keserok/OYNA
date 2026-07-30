import { supabase } from '../supabaseClient';
import { mapError } from '../utils/errorMap';

// ─── FAZ 6 — Takım yönetimi: kaptan devir + çoklu yönetici + ayrıl/arşiv ─────

// IP-12: ortak çeviri utils/errorMap.ts'te. Buradaki sözlük yalnız BU
// bağlamda daha isabetli olan mesajları ezer.
const OZEL: Record<string, string> = {
  FORBIDDEN: 'Bu işlem için yetkin yok (takım yöneticisi değilsin).',
  NOT_MEMBER: 'Kullanıcı takım üyesi değil.',
  NOT_FOUND: 'Takım bulunamadı.',
};
const parseRpcError = (message?: string): string | null =>
  message ? mapError(message, undefined, OZEL) : null;

/** Kaptanlığı başka bir üyeye devret. */
export const transferCaptaincy = async (teamId: string, newCaptainId: string): Promise<void> => {
  const { error } = await supabase.rpc('transfer_captaincy', { p_team_id: teamId, p_new_captain: newCaptainId });
  if (error) throw new Error(parseRpcError(error.message) || 'Kaptanlık devredilemedi.');
};

/** Bir üyeye yöneticilik ver / al (çoklu yönetici). */
export const setTeamAdmin = async (teamId: string, userId: string, grant: boolean): Promise<void> => {
  const { error } = await supabase.rpc('set_team_admin', { p_team_id: teamId, p_user: userId, p_grant: grant });
  if (error) throw new Error(parseRpcError(error.message) || 'Yönetici durumu güncellenemedi.');
};

/** Takımdan ayrıl (son yönetici ayrılırsa takım arşivlenir). */
export const leaveTeam = async (teamId: string): Promise<{ archived: boolean }> => {
  const { data, error } = await supabase.rpc('leave_team', { p_team_id: teamId });
  if (error) throw new Error(parseRpcError(error.message) || 'Takımdan ayrılınamadı.');
  return { archived: !!data?.archived };
};

/** Takımı arşivle / arşivden çıkar (geçmiş korunur). */
export const archiveTeam = async (teamId: string, archive = true): Promise<void> => {
  const { error } = await supabase.rpc('archive_team', { p_team_id: teamId, p_archive: archive });
  if (error) throw new Error(parseRpcError(error.message) || 'Arşivleme başarısız.');
};

export interface TeamSettingsInput {
  name?: string;
  shortName?: string;
  color1?: string;
  color2?: string;
  crest?: string;
  homePitchId?: string | null;
  pitch?: string | null;
  coordinates?: { lat: number; lng: number } | null;
}

/** Takım kimliğini güncelle (ad/kısa ad/renkler/arma/ev sahası) — yalnız kaptan. */
export const updateTeamSettings = async (teamId: string, fields: TeamSettingsInput): Promise<void> => {
  const { error } = await supabase.rpc('update_team_settings', {
    p_team_id: teamId,
    p_name: fields.name ?? null,
    p_short_name: fields.shortName ?? null,
    p_color1: fields.color1 ?? null,
    p_color2: fields.color2 ?? null,
    p_crest: fields.crest ?? null,
    p_home_pitch_id: fields.homePitchId ?? null,
    p_pitch: fields.pitch ?? null,
    p_coordinates: fields.coordinates ?? null,
  });
  if (error) throw new Error(parseRpcError(error.message) || 'Takım ayarları güncellenemedi.');
};

export interface PitchLite {
  id: string;
  name: string;
  district: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
}

