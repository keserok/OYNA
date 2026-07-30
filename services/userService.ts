import { supabase } from '../supabaseClient';
import { User } from '@supabase/supabase-js';
// Oyuncu istatistiği artık yalnız maç sayısı taşır. Akran-puanı türevleri
// (skill_rating → kart OVR zinciri) 20260831000000 sökümüyle öldü; kamusal
// seviye göstergesi profiles.self_skill'dir (OynaUser.selfSkill).
const mapPlayerStats = (row: any): { matchesPlayed: number } => ({
  matchesPlayed: Number(row?.match_count ?? 0),
});

export interface OynaUser {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  role: string;
  roles: string[];
  verification_status: string;
  is_admin: boolean;
  walletBalance: number;
  stats: {
    matchesPlayed: number;
  };
  /** Sahadaki mevki (ör. Kaleci, Stoper, Orta Saha) — sade profilde gösterilir. */
  position?: string | null;
  /** Kısa tanıtım — sade profilde gösterilir. */
  bio?: string | null;
  /** Doğum tarihi (date) — profil rozetinde yaş olarak gösterilir. */
  birthdate?: string | null;
  /** Güven puanı, DB'de 0.0–5.0; UI'da ×20 ile 0–100 gösterilir. */
  trustScore?: number | null;
  // ─── Onboarding + reşit olmayan / veli onayı alanları ───────────
  ageRange?: string | null;
  gender?: string | null;
  playStyle?: string | null;
  /** Beyan edilen seviye (1–10). Kamusal seviye bandının tek kaynağı;
   *  dönüşüm utils/skillBand.ts'te. NULL = beyan yok → çip çizilmez. */
  selfSkill?: number | null;
  firstName?: string | null;
  lastName?: string | null;
  /** Reşit olmayan kullanıcı mı? (sunucuda birthdate/age_range'ten hesaplanır) */
  isMinor?: boolean;
  /** Veli onay durumu — ödeme kapısı bu değere bakar. */
  guardianConsentStatus?: 'NONE' | 'PENDING' | 'ACTIVE' | 'REVOKED';
  /** Çocuğun velisine vereceği benzersiz bağlantı kodu. */
  guardianLinkCode?: string | null;
  /** Onboarding tamamlandı mı? */
  hasCompletedOnboarding?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface MatchHistorySummary {
  id: string;
  date: string;
  pitchName: string;
  score: string;
  /**
   * IP-18: `NO_SCORE` eklendi. Skoru hiç girilmemiş maç (auto_finalize_matches
   * cron'u 3 saat sonra maçı skorsuz kapatıyor) eskiden `?? 0` yedeği yüzünden
   * "0 - 0 / BERABERLİK" sayılıyor ve galibiyet oranını aşağı çekiyordu.
   */
  result: 'WIN' | 'LOSS' | 'DRAW' | 'NO_SCORE';
}

// ─── GK/Ref rolleri onay gerektiren roller ─────────────────────────────────
const ROLES_REQUIRING_APPROVAL = ['GOALKEEPER', 'REFEREE'];

/**
 * Kullanıcı sisteme ilk girdiğinde veya tekrar girdiğinde profiles tablosunu senkronize eder.
 * Yeni kullanıcılar varsayılan PLAYER rolüyle oluşturulur.
 */
export const syncUserToSupabase = async (supabaseUser: User | null): Promise<OynaUser | null> => {
  if (!supabaseUser) return null;

  try {
    const { data: userSnap, error: fetchError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', supabaseUser.id)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('[UserService] Kullanıcı çekerken hata:', fetchError);
      return null;
    }

    if (!userSnap) {
      // Yeni kullanıcı, profilini oluşturuyoruz.
      const dbUser = {
        id: supabaseUser.id,
        email: supabaseUser.email,
        full_name: supabaseUser.user_metadata?.full_name || supabaseUser.user_metadata?.name || '',
        avatar_url: supabaseUser.user_metadata?.avatar_url || supabaseUser.user_metadata?.picture || '',
        role: 'PLAYER',
        roles: ['PLAYER'],
        verification_status: 'approved',
        is_admin: false,
        wallet_balance: 0,
        stats: {
          matchesPlayed: 0,
        },
        last_active_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { error: insertError } = await supabase.from('profiles').insert([dbUser]);
      if (insertError) {
        console.error('[UserService] Kullanıcı yaratılırken hata:', insertError);
        return null;
      }

      return {
        id: dbUser.id,
        email: dbUser.email ?? null,
        full_name: dbUser.full_name,
        avatar_url: dbUser.avatar_url,
        role: dbUser.role,
        roles: dbUser.roles,
        verification_status: dbUser.verification_status,
        is_admin: dbUser.is_admin,
        walletBalance: dbUser.wallet_balance,
        stats: dbUser.stats,
        isMinor: false,
        guardianConsentStatus: 'NONE',
        hasCompletedOnboarding: false,
        createdAt: dbUser.created_at,
        updatedAt: dbUser.updated_at
      } as OynaUser;
    } else {
      // Zaten kayıtlı bir kullanıcı, son aktif olma tarihini güncelleyip bilgilerini döndür
      const nowISO = new Date().toISOString();
      await supabase
        .from('profiles')
        .update({ last_active_at: nowISO, updated_at: nowISO })
        .eq('id', supabaseUser.id);
      
      return {
        id: userSnap.id,
        email: userSnap.email,
        full_name: userSnap.full_name,
        avatar_url: userSnap.avatar_url,
        role: userSnap.role ?? 'PLAYER',
        roles: userSnap.roles ?? ['PLAYER'],
        verification_status: userSnap.verification_status ?? 'approved',
        is_admin: userSnap.is_admin ?? false,
        walletBalance: Number(userSnap.wallet_balance ?? 0),
        stats: mapPlayerStats(userSnap),
        position: userSnap.position ?? null,
        bio: userSnap.bio ?? null,
        birthdate: userSnap.birthdate ?? null,
        ageRange: userSnap.age_range ?? null,
        gender: userSnap.gender ?? null,
        playStyle: userSnap.play_style ?? null,
        selfSkill: userSnap.self_skill ?? null,
        firstName: userSnap.first_name ?? null,
        lastName: userSnap.last_name ?? null,
        isMinor: userSnap.is_minor ?? false,
        guardianConsentStatus: userSnap.guardian_consent_status ?? 'NONE',
        guardianLinkCode: userSnap.guardian_link_code ?? null,
        hasCompletedOnboarding: userSnap.has_completed_onboarding ?? false,
        createdAt: userSnap.created_at,
        updatedAt: nowISO
      } as OynaUser;
    }
  } catch (err) {
    console.error('[UserService] Senkronizasyon hatası:', err);
    return null;
  }
};

/**
 * Kullanıcının rollerini günceller.
 * GK veya REFEREE seçilirse verification_status otomatik 'pending' yapılır.
 */
export const updateUserRoles = async (
  userId: string,
  primaryRole: string,
  roles: string[],
): Promise<boolean> => {
  const requiresApproval = roles.some(r => ROLES_REQUIRING_APPROVAL.includes(r));
  const verificationStatus = requiresApproval ? 'pending' : 'approved';

  const { error } = await supabase
    .from('profiles')
    .update({
      role: primaryRole,
      roles,
      verification_status: verificationStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) {
    console.error('[UserService] Rol güncelleme hatası:', error);
    return false;
  }

  return true;
};

/**
 * FAZ 7.5 — Tek hesabın çoklu rolü arasında geçiş.
 * Kullanıcının AKTİF rolünü (profiles.role) yalnızca zaten roles dizisinde
 * bulunan bir role çevirir. protect_profile_columns trigger'ını set_active_role
 * RPC'si (SECURITY DEFINER + bypass bayrağı) ile aşar; doğrudan UPDATE çalışmaz.
 * Başarılıysa yeni aktif rolü döndürür, aksi halde null.
 */
export const setActiveRole = async (role: string): Promise<string | null> => {
  const { data, error } = await supabase.rpc('set_active_role', { p_role: role });
  if (error) {
    console.error('[UserService] Aktif rol değiştirme hatası:', error);
    return null;
  }
  return (data as string) ?? role;
};

/**
 * Kullanıcının sahip olduğu rolleri (profiles.roles) döndürür.
 */
export const getUserRoles = async (userId: string): Promise<string[]> => {
  const { data, error } = await supabase
    .from('profiles')
    .select('roles')
    .eq('id', userId)
    .single();
  if (error || !data) return [];
  return Array.isArray(data.roles) ? (data.roles as string[]) : [];
};

/**
 * Kullanıcının tam profilini roles, verification_status ve is_admin dahil döndürür.
 */
export const getFullUserProfile = async (userId: string): Promise<OynaUser | null> => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error || !data) {
    console.error('[UserService] Profil çekme hatası:', error);
    return null;
  }

  return {
    id: data.id,
    email: data.email,
    full_name: data.full_name,
    avatar_url: data.avatar_url,
    role: data.role ?? 'PLAYER',
    roles: data.roles ?? ['PLAYER'],
    verification_status: data.verification_status ?? 'approved',
    is_admin: data.is_admin ?? false,
    walletBalance: data.wallet_balance ?? 0,
    stats: mapPlayerStats(data),
    position: data.position ?? null,
    bio: data.bio ?? null,
    birthdate: data.birthdate ?? null,
    trustScore: typeof data.trust_score === 'number' ? data.trust_score : null,
    // Onboarding rozet alanları: bunlar haritalanmadığı için kullanıcı
    // kaydettiği hâlde profil rozetleri (yaş aralığı/cinsiyet/stil) hiç
    // görünmüyordu — admin profil aynası da aynı okuyucuyu kullanır.
    ageRange: data.age_range ?? null,
    gender: data.gender ?? null,
    playStyle: data.play_style ?? null,
    selfSkill: data.self_skill ?? null,
    firstName: data.first_name ?? null,
    lastName: data.last_name ?? null,
    isMinor: data.is_minor ?? false,
    guardianConsentStatus: data.guardian_consent_status ?? 'NONE',
    hasCompletedOnboarding: data.has_completed_onboarding ?? false,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
};

/** Sade profil "Profili Düzenle": mevki/bio/avatar/doğum tarihi/cinsiyet/oyun stili günceller (kullanıcının kendi satırı). */
export const updateProfileBasics = async (
  userId: string,
  fields: { position?: string; bio?: string; avatar_url?: string; birthdate?: string | null; gender?: string | null; play_style?: string | null },
): Promise<void> => {
  const { error } = await supabase.from('profiles').update(fields).eq('id', userId);
  if (error) throw error;
};

// Seviye beyanı DOĞRUDAN kolon yazımıyla GİTMEZ: authenticated'ın profiles
// UPDATE yetkisi kolon-bazlıdır ve self_skill listede yok — payload'a girerse
// tüm PATCH 42501 ile düşer. Tek yazma yolu set_my_self_skill RPC'sidir;
// aralık (1-10) ve NULL reddi (beyan silinemez) kapısı da orada.
export const setMySelfSkill = async (value: number): Promise<void> => {
  const { error } = await supabase.rpc('set_my_self_skill', { p_value: value });
  if (error) throw error;
};

// Görünen ad — DB'de hem name (NOT NULL, legacy) hem full_name (görüntülenen)
// tutuluyor; ikisini de senkron tutar ki isim her yerde tutarlı görünsün.
export const updateProfileName = async (userId: string, fullName: string): Promise<void> => {
  const trimmed = fullName.trim();
  if (!trimmed) throw new Error('İsim boş olamaz.');
  const { error } = await supabase.from('profiles').update({ name: trimmed, full_name: trimmed }).eq('id', userId);
  if (error) throw error;
};

export interface WalletHistoryItem {
  id: string;
  date: string;
  description: string;
  amount: number;
  commission: number;
  status: 'CLEARED' | 'PENDING';
}

/**
 * Servis sağlayıcının cüzdan işlem geçmişini döndürür.
 */
export const getWalletHistory = async (userId: string): Promise<WalletHistoryItem[]> => {
  try {
    const { data, error } = await supabase
      .from('wallet_transactions')
      .select('id, amount, type, status, description, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    return (data || []).map((row: any) => ({
      id: row.id as string,
      date: row.created_at
        ? new Date(row.created_at).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })
        : '—',
      description: row.description || row.type || 'İşlem',
      amount: Number(row.amount ?? 0),
      commission: 0,
      status: (row.status === 'COMPLETED' || row.status === 'CLEARED') ? 'CLEARED' : 'PENDING',
    }));
  } catch (err) {
    console.error('[UserService] Cüzdan geçmişi çekme hatası:', err);
    throw err;
  }
};

/**
 * Kullanıcının tamamlanmış maçlardaki geçmişini (home/away katılımına göre) döndürür.
 */
/**
 * Profil maç geçmişi.
 *
 * IP-18: eskiden platformun TÜM tamamlanmış maçlarından ilk 50'si çekilip
 * katılımcı süzgeci tarayıcıda uygulanıyordu — `userId` hiçbir sorgu filtresine
 * girmiyordu. Platformda 50'den fazla tamamlanmış maç biriktiği gün kullanıcının
 * kendi maçları o pencerenin dışına düşüyor ve geçmiş sessizce boşalıyordu.
 * Artık süzgeç sunucuda: `get_my_match_history` katılımı `match_participants`
 * ilişkisel tablosundan okur ve limiti filtreden SONRA uygular.
 */
export const getMatchHistory = async (_userId: string): Promise<MatchHistorySummary[]> => {
  try {
    // Kimlik sunucuda auth.uid()'den okunur; parametre imza uyumu için durur.
    const { data, error } = await supabase.rpc('get_my_match_history', { p_limit: 50 });
    if (error) throw error;

    return (data ?? []).map((row: any): MatchHistorySummary => {
      // Skor durumu SUNUCUNUN türettiği kolondan gelir (matches.score_status).
      // Burada ikinci kez hesaplanmaz — iki ayrı doğruluk kaynağı olmaz.
      const girildi = row.score_status === 'ENTERED';
      const ev = row.homeScore as number | null;
      const dep = row.awayScore as number | null;
      const isAway = !!row.is_away;
      const result: MatchHistorySummary['result'] = !girildi || ev === null || dep === null
        ? 'NO_SCORE'
        : ev === dep
          ? 'DRAW'
          : (isAway ? dep > ev : ev > dep) ? 'WIN' : 'LOSS';
      return {
        id: row.id as string,
        date: row.date as string,
        // `matches` tablosunda pitchName/pitch_name kolonu YOK — saha adı location'dan gelir.
        pitchName: (row.location || row.title || 'Saha') as string,
        score: result === 'NO_SCORE' ? 'Skor yok' : `${ev} - ${dep}`,
        result,
      };
    });
  } catch (err) {
    console.error('[UserService] Maç geçmişi çekme hatası:', err);
    throw err;
  }
};
