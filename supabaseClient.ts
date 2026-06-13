import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('[Supabase] Credentials missing — running in offline/mock mode');
}

const REMEMBER_ME_KEY = 'oyna.auth.rememberMe';
const hasWindow = typeof window !== 'undefined';

// "Beni hatırla" tercihini okur. Varsayılan: true (yalnızca açıkça kapatılırsa false).
export const getRememberMe = (): boolean => {
  if (!hasWindow) return true;
  try {
    return window.localStorage.getItem(REMEMBER_ME_KEY) !== 'false';
  } catch {
    return true;
  }
};

// "Beni hatırla" tercihini kaydeder. Giriş yapmadan önce ayarlanmalıdır.
export const setRememberMe = (remember: boolean): void => {
  if (!hasWindow) return;
  try {
    window.localStorage.setItem(REMEMBER_ME_KEY, remember ? 'true' : 'false');
  } catch {
    /* sessizce yoksay */
  }
};

// Hibrit oturum deposu:
// - "Beni hatırla" AÇIK  → localStorage (tarayıcı kapansa da oturum korunur)
// - "Beni hatırla" KAPALI → sessionStorage (sekme/tarayıcı kapanınca oturum silinir)
// Böylece kullanıcı çıkış yapana kadar aynı kimlikle işlem yapabilir.
const hybridAuthStorage = {
  getItem: (key: string): string | null => {
    if (!hasWindow) return null;
    try {
      return window.localStorage.getItem(key) ?? window.sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string): void => {
    if (!hasWindow) return;
    try {
      if (getRememberMe()) {
        window.localStorage.setItem(key, value);
        window.sessionStorage.removeItem(key);
      } else {
        window.sessionStorage.setItem(key, value);
        window.localStorage.removeItem(key);
      }
    } catch {
      /* sessizce yoksay */
    }
  },
  removeItem: (key: string): void => {
    if (!hasWindow) return;
    try {
      window.localStorage.removeItem(key);
      window.sessionStorage.removeItem(key);
    } catch {
      /* sessizce yoksay */
    }
  },
};

export const supabase = createClient(
  SUPABASE_URL ?? 'http://localhost:54321',
  SUPABASE_ANON_KEY ?? 'offline-placeholder-key',
  {
    auth: {
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true,
      storage: hybridAuthStorage,
      storageKey: 'oyna.auth.token',
    },
  }
);

export const getTeamRolesAndInstructions = async (teamId: string) => {
  try {
    const { data, error } = await supabase
      .from('teams')
      .select('team_roles')
      .eq('id', teamId)
      .maybeSingle();

    if (error) {
      console.warn('Error fetching team roles from Supabase:', error.message);
      return null;
    }
    return data?.team_roles;
  } catch (err) {
    console.error('Unexpected error fetching team roles:', err);
    return null;
  }
};

export const updateTeamRolesAndInstructions = async (teamId: string, teamRoles: any) => {
  try {
    const { error } = await supabase
      .from('teams')
      .update({ team_roles: teamRoles })
      .eq('id', teamId);

    if (error) {
      console.warn('Error updating team roles in Supabase:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Unexpected error updating team roles:', err);
    return false;
  }
};

export const sbRemovePlayerFromTeam = async (teamId: string, playerId: string) => {
  try {
    const { error } = await supabase
      .rpc('sbremoveplayerfromteam', { p_team_id: teamId, p_player_id: playerId });

    if (error) {
      console.warn('RPC sbremoveplayerfromteam failed, falling back to direct delete:', error.message);
      
      const { error: deleteError } = await supabase
        .from('team_members')
        .delete()
        .eq('team_id', teamId)
        .eq('player_id', playerId);

      if (deleteError) {
        console.error('Direct delete fallback failed in Supabase:', deleteError.message);
        return false;
      }
      return true;
    }
    return true;
  } catch (err) {
    console.error('Unexpected error removing player from team:', err);
    return false;
  }
};
