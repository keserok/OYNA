// ─── Onboarding: paylaşılan tipler, sabitler, yardımcılar ─────────
// Onboarding KAYIT SONRASINDA (kullanıcı girişliyken) çalışır: toplanan
// veri doğrudan apply_onboarding RPC'si ile profile yazılır (localStorage
// taslağı YOK). Bu modül tipleri, sabitleri ve kill-switch'i tek yerde
// toplar. is_minor / guardian_consent_status SUNUCUDA hesaplanır.

/**
 * Kill-switch: Bir sorun çıkarsa onboarding adımı tek bayrakla devre dışı
 * bırakılabilir; bu durumda yeni kayıt eski "kayıt → LOCATION_PROMPT"
 * akışına düşer. localStorage'da 'oyna.onboarding.disabled' = '1' ise kapalı.
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

/** Onboarding adımlarında toplanan alanların bellek-içi şekli. */
export interface OnboardingDraft {
  ageRange: AgeRange | '';
  firstName: string;
  lastName: string;
  gender: Gender;
  position: OnboardingPosition;
  playStyle: PlayStyle;
  /** Beyan edilen seviye (1–10). Profil tamamlanırken ZORUNLU; dönüşüm kuralı
   *  utils/skillBand.ts'te tek kaynaktan gelir. */
  selfSkill: number | null;
  locationGranted: boolean;
  completedAt: number;
}

/** Onboarding pozisyon kodunu profildeki metin karşılığına çevirir (DB'de saklanan biçim). */
export const POSITION_LABEL: Record<Exclude<OnboardingPosition, ''>, string> = {
  kaleci: 'Kaleci',
  defans: 'Savunma',
  orta: 'Orta Saha',
  forvet: 'Hücum',
};

/** Pozisyon kısaltmaları (kompakt grid/rozet gösterimi için). */
export const POSITION_ABBR: Record<Exclude<OnboardingPosition, ''>, string> = {
  kaleci: 'KL',
  defans: 'SAV',
  orta: 'ORT',
  forvet: 'HÜC',
};

/** Profildeki pozisyon metnini onboarding koduna geri çevirir (ön-dolum için). */
export const POSITION_CODE: Record<string, OnboardingPosition> = {
  Kaleci: 'kaleci',
  Savunma: 'defans',
  'Orta Saha': 'orta',
  Hücum: 'forvet',
};

/** Oyun stili etiket + vurgu rengi (kart/rozet gösterimlerinde tek kaynak).
    KANONİK PALET (kullanıcı kararı): Ciddi=Kırmızı, Taktiksel=Sarı, Rahat=Yeşil —
    maç kartları/oluşturma ile profil-onboarding artık AYNI renkleri kullanır
    (eski amber/mavi profili maç tarafıyla çelişiyordu). */
export const PLAY_STYLE_META: Record<Exclude<PlayStyle, ''>, { label: string; color: string }> = {
  ciddi: { label: 'Ciddi', color: '#FF4D4D' },
  taktiksel: { label: 'Taktiksel', color: '#FACC15' },
  rahat: { label: 'Rahat', color: '#39FF14' },
};

/** Cinsiyet etiketleri. */
export const GENDER_LABEL: Record<Exclude<Gender, ''>, string> = {
  kadin: 'Kadın',
  erkek: 'Erkek',
};

/** tr-TR büyük harf (İ/ı sorunu için). */
export const trUpper = (s: string): string => s.toLocaleUpperCase('tr-TR');

/**
 * Tek "ad soyad" metnini ad/soyad olarak böler: son kelime = soyad, kalanı ad.
 * Kayıtta tek alan (full_name) alındığından onboarding'i ön-doldurmak için.
 * Örn. "Ahmet Mehmet Yılmaz" → { firstName: 'Ahmet Mehmet', lastName: 'Yılmaz' }.
 */
export const splitFullName = (full: string | null | undefined): { firstName: string; lastName: string } => {
  const parts = (full || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
};

/**
 * Yaş aralığından reşit-olmama çıkarımı. Sunucudaki compute_is_minor ile
 * aynı kuralı taşır: yalnızca '13-17' aralığı reşit değildir. (Nihai/otoriter
 * karar sunucudadır; bu yalnızca istemci tarafı gösterim/mantık içindir.)
 */
export const isMinorAgeRange = (ageRange: AgeRange | ''): boolean => ageRange === '13-17';
