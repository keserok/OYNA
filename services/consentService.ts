import { supabase } from '../supabaseClient';
import { LEGAL_UPDATED_ISO } from '../shared/legalVersion';

// ─── KVKK / Sözleşme rıza kaydı servis katmanı ────────────────────
// Kullanıcının kabul ettiği belgeleri sunucuda denetlenebilir şekilde
// kaydeder (kim, hangi belge, hangi sürüm, ne zaman, IP/UA sunucuda).

/**
 * Kabul edilen belgelerin sürüm damgası.
 *
 * IP-15: bu tarihler elle yazılıyordu ve belgenin kendi "Son güncelleme"
 * tarihinden ESKİ kalmıştı — sunucuda "kullanıcı hangi metne onay verdi"
 * sorusu cevapsızdı. Artık damga belgeyle TEK kaynaktan gelir.
 *
 * Mevcut kullanıcılardan yeniden onay İSTENMİYOR (kullanıcı kararı 9a):
 * `record_user_consent` her çağrıda yeni satır yazar, eski kayıtlar silinmez.
 */
export const CONSENT_VERSIONS = {
  TERMS: LEGAL_UPDATED_ISO,
  KVKK: LEGAL_UPDATED_ISO,
  RIZA: LEGAL_UPDATED_ISO,
  PRIVACY: LEGAL_UPDATED_ISO,
  VELI: LEGAL_UPDATED_ISO,
} as const;

export type ConsentDocumentKey = keyof typeof CONSENT_VERSIONS;

/** Tek bir belge kabulünü kaydeder (hata olursa fırlatır). */
export const recordUserConsent = async (
  documentKey: ConsentDocumentKey,
  documentVersion: string = CONSENT_VERSIONS[documentKey],
): Promise<void> => {
  const { error } = await supabase.rpc('record_user_consent', {
    p_document_key: documentKey,
    p_document_version: documentVersion,
  });
  if (error) throw error;
};

/**
 * Birden çok belge kabulünü sırayla kaydeder. Kayıt akışında KVKK ve
 * Kullanıcı Sözleşmesi ayrı ayrı kaydedilir (bundle edilmez). Denetim
 * kaydı best-effort'tur: bir kaydın başarısız olması kayıt akışını
 * bloke etmemeli, yalnızca loglanmalıdır.
 */
export const recordUserConsents = async (documentKeys: ConsentDocumentKey[]): Promise<void> => {
  for (const key of documentKeys) {
    try {
      await recordUserConsent(key);
    } catch (e) {
      console.error(`[consentService] "${key}" rıza kaydı başarısız:`, e);
    }
  }
};
