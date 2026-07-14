import { supabase } from '../supabaseClient';

// ─── Veli Onayı (reşit olmayan kullanıcı) servis katmanı ──────────
// Faz 0 migration'ındaki RPC'lerin tipli sarmalayıcıları.
// TC bilgileri sunucuda hash'lenir; buradan yalnızca RPC'ye iletilir,
// hiçbir yerde saklanmaz.

export type GuardianConsentStatus = 'NONE' | 'PENDING' | 'ACTIVE' | 'REVOKED';

export interface MinorLookupResult {
  found: boolean;
  masked_name?: string;
  age_range?: string;
}

export interface CreateGuardianConsentInput {
  code: string;
  guardianFullName: string;
  guardianTc: string;
  guardianBirthdate: string; // 'YYYY-MM-DD'
  minorFullName: string;
  minorTc: string;
  minorBirthdate: string; // 'YYYY-MM-DD'
  consentTextVersion: string;
}

/** Oturum açmış kullanıcının kendi veli-onay durumunu ve reşitlik bilgisini getirir. */
export const getMyGuardianState = async (): Promise<{ status: GuardianConsentStatus; isMinor: boolean } | null> => {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('guardian_consent_status, is_minor')
    .eq('id', u.user.id)
    .single();
  if (error) throw error;
  return {
    status: (data?.guardian_consent_status ?? 'NONE') as GuardianConsentStatus,
    isMinor: !!data?.is_minor,
  };
};

/** Bu velinin verdiği aktif onaylar (geri alma ekranı için). */
export interface ActiveConsentRow {
  minor_user_id: string;
  minor_full_name: string;
  consented_at: string;
}
export const getConsentsIGave = async (): Promise<ActiveConsentRow[]> => {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) return [];
  const { data, error } = await supabase
    .from('guardian_consents')
    .select('minor_user_id, minor_full_name, consented_at')
    .eq('guardian_user_id', u.user.id)
    .eq('status', 'ACTIVE')
    .order('consented_at', { ascending: false });
  if (error) throw error;
  return (data || []) as ActiveConsentRow[];
};

/** Çocuğun kendi hesabında görünen benzersiz Veli Bağlantı Kodu (üret/getir). */
export const getOrCreateGuardianLinkCode = async (): Promise<string> => {
  const { data, error } = await supabase.rpc('get_or_create_guardian_link_code');
  if (error) throw error;
  return data as string;
};

/** Veli, kodu girer; eşleşen çocuğun MASKELİ bilgisini (ad baş harfi + yaş aralığı) döner. */
export const lookupMinorByCode = async (code: string): Promise<MinorLookupResult> => {
  const { data, error } = await supabase.rpc('lookup_minor_by_code', { p_code: code });
  if (error) throw error;
  return data as MinorLookupResult;
};

/** Veli onayını oluşturur; başarılıysa çocuğun ödeme/işlem kapısı açılır. */
export const createGuardianConsent = async (
  input: CreateGuardianConsentInput,
): Promise<{ ok: boolean; minor_user_id: string }> => {
  const { data, error } = await supabase.rpc('create_guardian_consent', {
    p_code: input.code.trim().toUpperCase(),
    p_guardian_full_name: input.guardianFullName.trim(),
    p_guardian_tc: input.guardianTc.trim(),
    p_guardian_birthdate: input.guardianBirthdate,
    p_minor_full_name: input.minorFullName.trim(),
    p_minor_tc: input.minorTc.trim(),
    p_minor_birthdate: input.minorBirthdate,
    p_consent_text_version: input.consentTextVersion,
  });
  if (error) throw error;
  return data as { ok: boolean; minor_user_id: string };
};

/** Veli onayını geri alır; çocuk yeniden sınırlı moda döner. */
export const revokeGuardianConsent = async (minorUserId: string): Promise<{ ok: boolean }> => {
  const { data, error } = await supabase.rpc('revoke_guardian_consent', { p_minor_user_id: minorUserId });
  if (error) throw error;
  return data as { ok: boolean };
};

/**
 * RPC'lerin fırlattığı hata kodlarını kullanıcıya gösterilecek Türkçe
 * mesaja çevirir. Supabase, PL/pgSQL RAISE mesajını error.message içinde
 * taşır; koda göre eşleştiriyoruz.
 */
export const guardianErrorMessage = (error: unknown): string => {
  const msg = (error as { message?: string })?.message || '';
  if (msg.includes('INVALID_TC')) return 'TC Kimlik No 11 haneli ve geçerli olmalı.';
  if (msg.includes('NAME_REQUIRED')) return 'Ad-soyad alanları boş bırakılamaz.';
  if (msg.includes('GUARDIAN_NOT_ADULT')) return 'Onay veren veli 18 yaşından büyük olmalı.';
  if (msg.includes('INVALID_CODE')) return 'Veli bağlantı kodu geçersiz. Kodu kontrol edin.';
  if (msg.includes('SELF_LINK_FORBIDDEN')) return 'Kendi hesabınızı çocuk olarak onaylayamazsınız.';
  if (msg.includes('TARGET_NOT_MINOR')) return 'Bu hesap reşit görünüyor; veli onayı gerekmiyor.';
  if (msg.includes('ALREADY_LINKED')) return 'Bu çocuk için zaten aktif bir veli onayı bulunuyor.';
  if (msg.includes('CONSENT_NOT_FOUND')) return 'Geri alınacak aktif bir onay bulunamadı.';
  if (msg.includes('RATE_LIMITED')) return 'Çok fazla deneme yaptınız. Lütfen bir süre sonra tekrar deneyin.';
  if (msg.includes('AUTH_REQUIRED')) return 'Bu işlem için giriş yapmış olmanız gerekir.';
  return 'İşlem tamamlanamadı. Lütfen bilgileri kontrol edip tekrar deneyin.';
};
