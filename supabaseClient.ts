import { createClient } from '@supabase/supabase-js';

// ─── Üretim yedeği (env enjeksiyonu kaçarsa "Failed to fetch"i kökten önler) ───
// Sorun: env değişkeni herhangi bir build yolunda (ör. Vercel'de admin derlemesinde)
// gömülmezse, eski kod sessizce `http://localhost:54321`'e düşüyordu → telefondaki
// panel localhost'a istek atıp "Failed to fetch" veriyordu (mixed-content + bağlantı
// reddi). Çözüm: yedek artık localhost değil, GERÇEK üretim backend'i.
// Bu anon (publishable) anahtar herkese açıktır ve RLS ile korunur → bundle'a gömmek
// güvenlidir (zaten son kullanıcının tarayıcısına iniyor). SERVICE_ROLE anahtarı ASLA
// burada olmamalıdır. Env değişkenleri hâlâ önceliklidir (yerel geliştirme/staging için).
const PROD_SUPABASE_URL = 'https://iikvzgyccvgcybzdfwlv.supabase.co';
const PROD_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlpa3Z6Z3ljY3ZnY3liemRmd2x2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NjM0NDAsImV4cCI6MjA5NTAzOTQ0MH0.T7P_7lYp07zcXrioKkMqZENoYoi-D9aPmjhNAfihMvM';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || PROD_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || PROD_SUPABASE_ANON_KEY;

if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
  // Env eksik ama üretim yedeği devrede — panel yine de gerçek backend'e bağlanır.
  console.warn('[Supabase] VITE_SUPABASE_* env yok — gömülü üretim yedeği kullanılıyor.');
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
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
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
