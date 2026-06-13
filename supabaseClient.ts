import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('[Supabase] Credentials missing — running in offline/mock mode');
}

export const supabase = createClient(
  SUPABASE_URL ?? 'http://localhost:54321',
  SUPABASE_ANON_KEY ?? 'offline-placeholder-key',
  {
    auth: {
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true,
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
