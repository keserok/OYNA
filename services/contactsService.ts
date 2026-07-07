// ================================================================
// contactsService — Rehber senkronu (Foundation Spec §3.2 / B3)
// GİZLİLİK SÖZLEŞMESİ:
//  · Numaralar CİHAZDA E.164'e normalize edilir ve SHA-256'ya çevrilir.
//  · Sunucuya YALNIZ hash gider (500'lük partiler, günlük kota sunucuda).
//  · OYNA'da olmayanların ham numarası cihazdan ASLA çıkmaz; davet,
//    cihazın kendi paylaşım sayfasıyla gönderilir.
// Capacitor Contacts eklentisi yoksa (web) özellik kibarca kapalıdır.
// ================================================================
import { Capacitor } from '@capacitor/core';
import { matchContacts, ContactMatchRow } from './socialService';

export interface InvitableContact {
  name: string;
  phone: string; // yalnız cihazda kalır — davet paylaşımı için
}

export interface ContactSyncResult {
  matched: ContactMatchRow[];
  invitable: InvitableContact[];
}

const BATCH_SIZE = 500;

export const isContactsAvailable = (): boolean => Capacitor.isNativePlatform();

/** TR-varsayılanlı E.164 normalizasyonu (auth ile aynı format: +90XXXXXXXXXX). */
export const normalizePhoneTR = (raw: string): string | null => {
  let n = (raw || '').replace(/[\s\-().]/g, '');
  if (!n) return null;
  if (n.startsWith('00')) n = '+' + n.slice(2);
  if (n.startsWith('+')) {
    return /^\+[1-9]\d{6,14}$/.test(n) ? n : null;
  }
  if (n.startsWith('0') && n.length === 11) n = '+9' + n;      // 05xx… → +905xx…
  else if (n.length === 10 && n.startsWith('5')) n = '+90' + n; // 5xx… → +905xx…
  return /^\+[1-9]\d{6,14}$/.test(n) ? n : null;
};

const sha256Hex = async (text: string): Promise<string> => {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
};

/**
 * Rehberi okur, eşleşenleri döndürür; eşleşmeyenler davet listesi olur.
 * Eklenti mevcut değilse (web) anlaşılır hata fırlatır.
 */
export const syncContactsAndMatch = async (): Promise<ContactSyncResult> => {
  if (!isContactsAvailable()) {
    throw new Error('NOT_AVAILABLE: Rehber erişimi yalnız mobil uygulamada kullanılabilir.');
  }

  // Dinamik import: eklenti yalnız native pakette bulunur
  const { Contacts } = await import('@capacitor-community/contacts');

  const perm = await Contacts.requestPermissions();
  if (perm.contacts !== 'granted') {
    throw new Error('UNAUTHORIZED: Rehber izni verilmedi.');
  }

  const { contacts } = await Contacts.getContacts({
    projection: { name: true, phones: true },
  });

  // Numara → kişi adı (cihazda kalır); hash → numara eşlemesi
  const phoneToName = new Map<string, string>();
  for (const c of contacts) {
    const name = c.name?.display || '';
    for (const p of c.phones || []) {
      const e164 = normalizePhoneTR(p.number || '');
      if (e164 && !phoneToName.has(e164)) phoneToName.set(e164, name || e164);
    }
  }

  const phones = Array.from(phoneToName.keys());
  const hashToPhone = new Map<string, string>();
  for (const phone of phones) {
    hashToPhone.set(await sha256Hex(phone), phone);
  }

  const allHashes = Array.from(hashToPhone.keys());
  const matched: ContactMatchRow[] = [];
  for (let i = 0; i < allHashes.length; i += BATCH_SIZE) {
    const batch = allHashes.slice(i, i + BATCH_SIZE);
    const rows = await matchContacts(batch);
    matched.push(...rows);
  }

  // Eşleşen hash'leri bilmiyoruz (sunucu profil döndürür) — davet listesi
  // için "OYNA'da olmayanlar" kabaca: eşleşme sayısı kadarını çıkaramayız;
  // pratik yaklaşım: tüm rehber davet-edilebilir, kullanıcı seçer.
  // Daha temiz sinyal için sunucu eşleşen hash'i de döndürebilir (v2).
  const invitable: InvitableContact[] = phones
    .map(phone => ({ name: phoneToName.get(phone) || phone, phone }))
    .slice(0, 100); // paylaşım sayfası için makul üst sınır

  return { matched, invitable };
};
