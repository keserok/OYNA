import { supabase } from '../supabaseClient';
import { User } from '@supabase/supabase-js';

export interface OynaUser {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  role: 'PLAYER' | 'GOALKEEPER' | 'REFEREE' | 'ADMIN';
  walletBalance: number;
  stats: {
    matchesPlayed: number;
    rating: number;
  };
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Kullanıcı sisteme girdiğinde veritabanında (Supabase PostgreSQL) kaydı olup olmadığını kontrol eder.
 * Eğer yeni bir kullanıcıysa, OYNA sistemine varsayılan özellikleriyle kaydeder.
 */
export const syncUserToSupabase = async (supabaseUser: User | null): Promise<OynaUser | null> => {
  if (!supabaseUser) return null;

  try {
    const { data: userSnap, error: fetchError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', supabaseUser.id)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116: no rows returned
      console.error('Kullanıcı çekerken hata:', fetchError);
      return null;
    }

    if (!userSnap) {
      // Yeni kullanıcı, profilini oluşturuyoruz.
      const newUser = {
        id: supabaseUser.id,
        email: supabaseUser.email,
        full_name: supabaseUser.user_metadata?.full_name || supabaseUser.user_metadata?.name || '',
        avatar_url: supabaseUser.user_metadata?.avatar_url || supabaseUser.user_metadata?.picture || '',
        role: 'PLAYER',
        walletBalance: 0,
        stats: {
          matchesPlayed: 0,
          rating: 5.0,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      const { error: insertError } = await supabase.from('profiles').insert([newUser]);
      if (insertError) {
        console.error('Kullanıcı yaratılırken hata:', insertError);
        return null;
      }
      return newUser as OynaUser;
    } else {
      // Zaten kayıtlı bir kullanıcı, son aktif olma tarihini güncelleyip bilgilerini döndür
      await supabase
        .from('profiles')
        .update({ updatedAt: new Date().toISOString() })
        .eq('id', supabaseUser.id);
      
      return userSnap as OynaUser;
    }
  } catch (err) {
    console.error('Senkronizasyon hatası:', err);
    return null;
  }
};
