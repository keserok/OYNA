import { supabase } from '../supabaseClient';

// ─── FAZ 6 — Takım yönetimi: kaptan devir + çoklu yönetici + ayrıl/arşiv ─────

function parseRpcError(message?: string): string | null {
  if (!message) return null;
  const m = message.match(/[A-Z_]+:\s*(.+)$/);
  if (m) return m[1];
  const bare: Record<string, string> = {
    FORBIDDEN: 'Bu işlem için yetkin yok (takım yöneticisi değilsin).',
    NOT_MEMBER: 'Kullanıcı takım üyesi değil.',
    UNAUTHORIZED: 'Oturumun bulunamadı. Lütfen tekrar giriş yap.',
    NOT_FOUND: 'Takım bulunamadı.',
  };
  const b = message.match(/\b([A-Z][A-Z_]{3,})\b/);
  return b && bare[b[1]] ? bare[b[1]] : message;
}

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
