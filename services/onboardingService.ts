import { supabase } from '../supabaseClient';
import { POSITION_LABEL, OnboardingDraft } from '../views/onboarding/onboardingShared';

// ─── Onboarding kayıt servisi ─────────────────────────────────────
// Onboarding KAYIT SONRASINDA (kullanıcı girişliyken) çalışır; toplanan
// veri doğrudan apply_onboarding RPC'si ile profile yazılır. is_minor ve
// guardian_consent_status SUNUCUDA (apply_onboarding) hesaplanır — client
// bu gate-kritik alanları belirleyemez.
//
// completed=false → ATLAMA: girilen kısmi veri yazılır ama profil
// "tamamlanmadı" (has_completed_onboarding=false) kalır. RPC forward-only
// yazar: boş alanlar mevcut değeri silmez.

export interface ApplyOnboardingResult {
  ok: boolean;
  is_minor?: boolean;
  completed?: boolean;
  skipped?: boolean;
}

export const applyOnboarding = async (
  draft: OnboardingDraft,
  completed: boolean = true,
): Promise<ApplyOnboardingResult> => {
  const { data, error } = await supabase.rpc('apply_onboarding', {
    p_age_range: draft.ageRange || '',
    p_first_name: draft.firstName || '',
    p_last_name: draft.lastName || '',
    p_gender: draft.gender || '',
    p_position: draft.position ? POSITION_LABEL[draft.position] : '',
    p_play_style: draft.playStyle || '',
    p_completed: completed,
  });
  if (error) throw error;
  return data as ApplyOnboardingResult;
};
