import { supabase } from '../supabaseClient';
import { auth } from '../supabaseAuth';
import { UserRole } from '../types';

// ─── Kaleci / Hakem başvuru formu veri tipi ──────────────────────────────────
export interface ServiceApplicationData {
  fullName: string;
  phone: string;          // E.164 (+90...) formatında
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

  // ─── 1a. Rolü ayarla (RPC — profiles.role/roles admin olmayan UPDATE'lerde
  // trigger tarafından korunuyor; sadece bu RPC kendi rolünü GOALKEEPER/REFEREE
  // yapmasına izin veriyor) ──────────────────────────────────────────────────
  const { error: roleError } = await supabase.rpc('apply_for_provider_role', {
    p_role: role,
  });
  if (roleError) {
    console.error('[ServiceProvider] rol ayarlama hatası:', roleError);
    throw new Error('Başvuru kaydedilemedi. Lütfen tekrar dene.');
  }

  // ─── 1b. Diğer profil alanlarını güncelle ──────────────────────────────────
  const { error: profileError } = await supabase
    .from('profiles')
    .update({
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
  // NOT: goalkeepers/referees tablolarında kolonlar camelCase (preferredZones,
  // matchCount, authUid) olarak tanımlı; is_available kolonu yok (pasif/aktif
  // durumu profiles.verification_status üzerinden yönetiliyor).
  if (role === UserRole.GOALKEEPER) {
    const { error } = await supabase.from('goalkeepers').upsert(
      {
        id: uid,
        authUid: uid,
        name: data.fullName.trim(),
        height: data.height ?? null,
        age: data.age ?? null,
        fee: data.fee,
        bio: data.bio.trim(),
        style: data.style,
        preferredZones: data.preferredZones,
        rating: 0,
        matchCount: 0,
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
        authUid: uid,
        name: data.fullName.trim(),
        level: data.level ?? null,
        fee: data.fee,
        bio: data.bio.trim(),
        style: data.style,
        preferredZones: data.preferredZones,
        // HR-C: matchCount = platformda yönetilen maç sayısıdır, YENİ hakemde 0
        // olmalı (kaleci dalıyla aynı). Başvurudaki "deneyim yılı" bir platform
        // istatistiği DEĞİL — self-report; onu stats.experienceYears'a yazıyoruz,
        // matchCount'u sahte şişirmiyoruz. Sıralama/rozetler dürüst kalır.
        matchCount: 0,
        stats: { experienceYears: data.experienceYears ?? 0 },
        rating: 0,
      },
      { onConflict: 'id' },
    );
    if (error) {
      console.error('[ServiceProvider] hakem profili hatası:', error);
      throw new Error('Hakem profili oluşturulamadı.');
    }
  }
};

// ─── FAZ 8A — Sağlayıcı self-servis profil güncelleme ────────────────────────
// admin_update_goalkeeper/referee admin yetkisi ister ve working_hours/settings
// alanlarını yok sayar; sağlayıcının KENDİ kayıtları bu RPC ile DB'ye ulaşır.
export interface OwnProviderProfileUpdate {
  name?: string;
  bio?: string;
  fee?: number;
  style?: string;
  avatar?: string;
  height?: string;
  age?: number;
  preferredZones?: string[];
  coordinates?: { lat: number; lng: number };
  workingHours?: { activeDays: string[]; activeHours: string };
  settings?: Record<string, unknown>;
  isAvailable?: boolean;
}

export const updateOwnProviderProfile = async (
  payload: OwnProviderProfileUpdate,
): Promise<void> => {
  // undefined alanları at — RPC yalnız gönderilen anahtarları günceller
  const clean = Object.fromEntries(
    Object.entries(payload).filter(([, v]) => v !== undefined),
  );
  const { error } = await supabase.rpc('provider_update_own_profile', {
    p_payload: clean,
  });
  if (error) {
    console.error('[ServiceProvider] profil güncelleme hatası:', error);
    const withDesc = error.message?.match(/[A-Z_]+:\s*(.+)$/);
    throw new Error(withDesc ? withDesc[1] : 'Profil güncellenemedi. Lütfen tekrar dene.');
  }
};
