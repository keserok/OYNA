import { supabase } from '../supabaseClient';
import { POSITION_LABEL, OnboardingDraft } from '../views/onboarding/onboardingShared';
import { uygunsuzMu, UYGUNSUZ_ICERIK_MESAJI } from '../shared/icerikSuzgeci';

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
  // İÇERİK SÜZGECİ (22 Ağu 2026 — Apple 1.2). Kullanıcının GÖRÜNÜR ADI ilk
  // kez burada yazılır; kapı yalnız Ayarlar'daki "ismini değiştir" yoluna
  // (userService · updateProfileName) konsaydı, tanıtımda küfürlü ad giren
  // kullanıcı süzgece hiç uğramadan uygulamanın her ekranına o adla çıkardı.
  // İki yazma yolu da aynı kapıdan geçer.
  for (const ad of [draft.firstName, draft.lastName]) {
    if (ad && uygunsuzMu(ad)) throw new Error(UYGUNSUZ_ICERIK_MESAJI);
  }
  const { data, error } = await supabase.rpc('apply_onboarding', {
    p_age_range: draft.ageRange || '',
    p_first_name: draft.firstName || '',
    p_last_name: draft.lastName || '',
    p_gender: draft.gender || '',
    p_position: draft.position ? POSITION_LABEL[draft.position] : '',
    p_play_style: draft.playStyle || '',
    p_completed: completed,
    // Beyan edilen seviye (1–10). null gönderilir → sunucu forward-only
    // birleştirir: mevcut değeri SİLMEZ. completed=true iken sunucuda NULL
    // olamaz (SELF_SKILL_REQUIRED) — istemci kapısı Onboarding'de.
    p_self_skill: draft.selfSkill ?? null,
  });
  if (error) throw error;
  return data as ApplyOnboardingResult;
};
