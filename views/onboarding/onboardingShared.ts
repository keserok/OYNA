// ─── Onboarding: paylaşılan tipler, sabitler, taslak kalıcılık ────
// Onboarding KAYITTAN ÖNCE çalışır; toplanan veri hesap oluşana kadar
// localStorage'da "taslak" olarak tutulur, kayıt başarılı olunca (e-posta
// VEYA Google/Apple) profile flush edilir (Faz 2). Bu modül veriyi ve
// kill-switch bayrağını tek yerde toplar.

export const ONBOARDING_DRAFT_KEY = 'oyna.onboarding.draft.v1';

/**
 * Kill-switch: Onboarding kayıt hunisinin önüne geçtiği için, bir sorun
 * çıkarsa tek bayrakla eski "Splash → Auth" akışına dönülebilir.
 * localStorage'da 'oyna.onboarding.disabled' = '1' ise devre dışı kalır;
 * ayrıca derleme zamanı sabiti (aşağıda) ile de kapatılabilir.
 */
export const ONBOARDING_ENABLED_DEFAULT = true;

export const isOnboardingEnabled = (): boolean => {
  try {
    if (localStorage.getItem('oyna.onboarding.disabled') === '1') return false;
  } catch {
    /* localStorage erişilemezse varsayılana düş */
  }
  return ONBOARDING_ENABLED_DEFAULT;
};

export const AGE_RANGES = ['13-17', '18-23', '24-30', '31-40', '41-50', '51+'] as const;
export type AgeRange = (typeof AGE_RANGES)[number];

export type Gender = '' | 'kadin' | 'erkek';
export type OnboardingPosition = '' | 'kaleci' | 'defans' | 'orta' | 'forvet';
export type PlayStyle = '' | 'ciddi' | 'taktiksel' | 'rahat';

export interface OnboardingDraft {
  ageRange: AgeRange | '';
  firstName: string;
  lastName: string;
  gender: Gender;
  position: OnboardingPosition;
  playStyle: PlayStyle;
  locationGranted: boolean;
  completedAt: number;
}

/** Onboarding pozisyon kodunu profildeki metin karşılığına çevirir. */
export const POSITION_LABEL: Record<Exclude<OnboardingPosition, ''>, string> = {
  kaleci: 'Kaleci',
  defans: 'Savunma',
  orta: 'Orta Saha',
  forvet: 'Hücum',
};

export const saveOnboardingDraft = (draft: OnboardingDraft): void => {
  try {
    localStorage.setItem(ONBOARDING_DRAFT_KEY, JSON.stringify(draft));
  } catch (e) {
    console.error('[onboarding] taslak kaydedilemedi:', e);
  }
};

export const loadOnboardingDraft = (): OnboardingDraft | null => {
  try {
    const raw = localStorage.getItem(ONBOARDING_DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as OnboardingDraft;
  } catch {
    return null;
  }
};

export const clearOnboardingDraft = (): void => {
  try {
    localStorage.removeItem(ONBOARDING_DRAFT_KEY);
  } catch {
    /* yoksay */
  }
};

// ─── "Onboarding görüldü" bayrağı ─────────────────────────────────
// Aynı cihazda çıkış yapmış dönen kullanıcı her açılışta onboarding'e
// düşmesin diye: onboarding tamamlanınca veya giriş kısayolu kullanılınca
// işaretlenir. Oturum yokken splash yalnızca bu bayrak YOKSA onboarding'i
// gösterir; varsa doğrudan giriş ekranına gider.
const ONBOARDING_SEEN_KEY = 'oyna.onboarding.seen';

export const markOnboardingSeen = (): void => {
  try {
    localStorage.setItem(ONBOARDING_SEEN_KEY, '1');
  } catch {
    /* yoksay */
  }
};

export const hasSeenOnboarding = (): boolean => {
  try {
    return localStorage.getItem(ONBOARDING_SEEN_KEY) === '1';
  } catch {
    return false;
  }
};

/** tr-TR büyük harf (İ/ı sorunu için). */
export const trUpper = (s: string): string => s.toLocaleUpperCase('tr-TR');

/**
 * Yaş aralığından reşit-olmama çıkarımı. Sunucudaki compute_is_minor ile
 * aynı kuralı taşır: yalnızca '13-17' aralığı reşit değildir. (Nihai/otoriter
 * karar sunucudadır; bu yalnızca istemci tarafı gösterim/mantık içindir.)
 */
export const isMinorAgeRange = (ageRange: AgeRange | ''): boolean => ageRange === '13-17';
