import { supabase } from '../supabaseClient';

// ─── KVKK / Sözleşme rıza kaydı servis katmanı ────────────────────
// Kullanıcının kabul ettiği belgeleri sunucuda denetlenebilir şekilde
// kaydeder (kim, hangi belge, hangi sürüm, ne zaman, IP/UA sunucuda).

/** Kabul edilen belgelerin sürüm damgası — metin değişince artırılır. */
export const CONSENT_VERSIONS = {
  TERMS: '2026-07-13',
  KVKK: '2026-07-12',
  RIZA: '2026-07-12',
  PRIVACY: '2026-07-12',
  VELI: '2026-07-14',
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
