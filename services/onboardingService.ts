import { supabase } from '../supabaseClient';
import {
  loadOnboardingDraft, clearOnboardingDraft, POSITION_LABEL, OnboardingDraft,
} from '../views/onboarding/onboardingShared';

// ─── Onboarding flush servisi ─────────────────────────────────────
// Onboarding KAYITTAN ÖNCE veriyi localStorage taslağında toplar; kayıt
// (e-posta veya Google/Apple) başarılı olunca bu taslak profile yazılır.
// is_minor / guardian_consent_status SUNUCUDA (apply_onboarding RPC'si)
// hesaplanır — client bu gate-kritik alanları belirleyemez.

export const applyOnboarding = async (draft: OnboardingDraft): Promise<{ ok: boolean; is_minor?: boolean; skipped?: boolean }> => {
  const { data, error } = await supabase.rpc('apply_onboarding', {
    p_age_range: draft.ageRange,
    p_first_name: draft.firstName,
    p_last_name: draft.lastName,
    p_gender: draft.gender || '',
    p_position: draft.position ? POSITION_LABEL[draft.position] : '',
    p_play_style: draft.playStyle || '',
  });
  if (error) throw error;
  return data as { ok: boolean; is_minor?: boolean; skipped?: boolean };
};

/**
 * Kayıt sonrası çağrılır. Taslak varsa profile flush eder ve temizler.
 * Taslak yoksa (mevcut kullanıcı, onboarding'den geçmeyen) hiçbir şey
 * yapmaz — "mevcut kullanıcılara dokunma" kararı. best-effort: hata
 * kayıt akışını bloke etmez.
 */
export const flushOnboardingDraft = async (): Promise<{ isMinor: boolean } | null> => {
  const draft = loadOnboardingDraft();
  if (!draft || !draft.ageRange) return null;
  try {
    const res = await applyOnboarding(draft);
    clearOnboardingDraft();
    return { isMinor: !!res.is_minor };
  } catch (e) {
    console.error('[onboardingService] flush başarısız:', e);
    return null;
  }
};
