import { supabase } from '../supabaseClient';
import { auth } from '../supabaseAuth';
import { UserRole } from '../types';

// ─── Kaleci / Hakem başvuru formu veri tipi ──────────────────────────────────
export interface ServiceApplicationData {
  fullName: string;
  phone: string;          // E.164 (+90...) formatında
  tcNumber: string;       // 11 haneli TC kimlik no
  fee: number;            // Maç başı ücret (₺)
  bio: string;
  style: string;          // Kaleci stili / Hakem yaklaşımı
  preferredZones: string[];
  // Kaleciye özel
  height?: string;
  age?: number;
  // Hakeme özel
  level?: string;         // İl / Bölgesel / Klasman / FIFA
  experienceYears?: number;
}

/**
 * Kaleci/Hakem başvurusunu kaydeder.
 *
 * 1. profiles → rol, iletişim bilgileri ve verification_status='pending' güncellenir
 * 2. goalkeepers / referees → hizmet sağlayıcı profili oluşturulur (upsert)
 *
 * Admin onayladığında (approve_provider_verification RPC) profil 'approved' olur ve
 * sağlayıcı pazaryerinde (Marketplace) listelenmeye başlar.
 */
export const submitServiceApplication = async (
  role: UserRole.GOALKEEPER | UserRole.REFEREE,
  data: ServiceApplicationData,
): Promise<void> => {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Oturumun bulunamadı. Lütfen tekrar giriş yap.');

  const nowISO = new Date().toISOString();

  // ─── 1. profiles güncelle ──────────────────────────────────────────────────
  const { error: profileError } = await supabase
    .from('profiles')
    .update({
      role,
      roles: [role],
      full_name: data.fullName.trim(),
      phone: data.phone,
      verification_status: 'pending',
      updated_at: nowISO,
    })
    .eq('id', uid);

  if (profileError) {
    console.error('[ServiceProvider] profil güncelleme hatası:', profileError);
    throw new Error('Başvuru kaydedilemedi. Lütfen tekrar dene.');
  }

  // ─── 2. Sağlayıcı profilini oluştur / güncelle ─────────────────────────────
  if (role === UserRole.GOALKEEPER) {
    const { error } = await supabase.from('goalkeepers').upsert(
      {
        id: uid,
        name: data.fullName.trim(),
        height: data.height ?? null,
        age: data.age ?? null,
        fee: data.fee,
        bio: data.bio.trim(),
        style: data.style,
        preferred_zones: data.preferredZones,
        rating: 0,
        match_count: 0,
        is_available: false, // onay öncesi pasif
      },
      { onConflict: 'id' },
    );
    if (error) {
      console.error('[ServiceProvider] kaleci profili hatası:', error);
      throw new Error('Kaleci profili oluşturulamadı.');
    }
  } else {
    const { error } = await supabase.from('referees').upsert(
      {
        id: uid,
        auth_uid: uid,
        name: data.fullName.trim(),
        level: data.level ?? null,
        fee: data.fee,
        bio: data.bio.trim(),
        style: data.style,
        preferred_zones: data.preferredZones,
        match_count: data.experienceYears ?? 0,
        rating: 0,
        is_available: false, // onay öncesi pasif
      },
      { onConflict: 'id' },
    );
    if (error) {
      console.error('[ServiceProvider] hakem profili hatası:', error);
      throw new Error('Hakem profili oluşturulamadı.');
    }
  }
};
