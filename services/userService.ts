import { supabase } from '../supabaseClient';
import { User } from '@supabase/supabase-js';

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
    rating: number;
  };
  createdAt?: string;
  updatedAt?: string;
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
          rating: 5.0,
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
        stats: userSnap.stats || { matchesPlayed: 0, rating: 5.0 },
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
    stats: { matchesPlayed: 0, rating: 5.0 },
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
};
