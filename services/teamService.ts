// ═══════════════════════════════════════════════════════════════
// OYNA — Team Service
// teams + team_members tablolarının tek erişim noktası.
// RLS: teams INSERT = authenticated, UPDATE/DELETE = captain_id;
//      team_members = kendisi veya kaptan (bkz. 20260606174119 migration).
// ═══════════════════════════════════════════════════════════════
import { supabase } from '../supabaseClient';
import { auth } from '../supabaseAuth';
import { Team, Player } from '../types';

// TeamCreator'ın ürettiği ham veri
export interface NewTeamInput {
  name: string;
  color: string;       // tailwind sınıfı: 'bg-emerald-500'
  communityId: string | null;
  formation: string;   // '5+1' | '6+1' | '7+1'
}

// TeamCreator'daki tailwind renklerinin hex karşılıkları
const TAILWIND_HEX: Record<string, string> = {
  'bg-emerald-500': '#10B981',
  'bg-blue-500': '#3B82F6',
  'bg-red-500': '#EF4444',
  'bg-amber-500': '#F59E0B',
  'bg-purple-500': '#A855F7',
  'bg-pink-500': '#EC4899',
  'bg-indigo-500': '#6366F1',
  'bg-teal-500': '#14B8A6',
};

const toHex = (twClass: string) => TAILWIND_HEX[twClass] || '#10B981';

const toShortName = (name: string) =>
  name.replace(/[^A-Za-zÇĞİÖŞÜçğıöşü]/g, '').slice(0, 3).toUpperCase() || 'TKM';

// Kadrodaki oyunculara saha üzerinde varsayılan x/y dağılımı (MyTeam pitch'i için)
export const withDefaultPositions = (roster: Partial<Player>[]): Player[] => {
  const layout = [
    { x: 50, y: 15 }, { x: 30, y: 40 }, { x: 70, y: 40 },
    { x: 20, y: 65 }, { x: 50, y: 65 }, { x: 80, y: 65 }, { x: 50, y: 88 },
  ];
  return roster.map((p, i) => ({
    rating: 0,
    position: 'OYUNCU',
    ...p,
    id: p.id || `p_${i}`,
    name: p.name || 'Oyuncu',
    avatar: p.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.id || i}`,
    x: typeof p.x === 'number' ? p.x : layout[i % layout.length].x,
    y: typeof p.y === 'number' ? p.y : layout[i % layout.length].y,
  })) as Player[];
};

// DB satırı → Team (kolonlar zaten camelCase; captain_id ek alan)
const mapRowToTeam = (row: any): Team => ({
  ...row,
  captain: row.captain || row.captain_id,
  roster: withDefaultPositions(Array.isArray(row.roster) ? row.roster : []),
  wins: row.wins ?? 0,
  losses: row.losses ?? 0,
});

export const createTeam = async (input: NewTeamInput): Promise<Team> => {
  const user = auth.currentUser;
  if (!user?.uid) throw new Error('Takım kurmak için giriş yapmalısınız.');

  const color1 = toHex(input.color);
  const captainPlayer = {
    id: user.uid,
    name: user.displayName || 'Kaptan',
    avatar: user.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`,
    position: 'KAPTAN',
    x: 50, y: 88,
  };

  const { data, error } = await supabase
    .from('teams')
    .insert({
      name: input.name.trim(),
      shortName: toShortName(input.name),
      color1,
      color2: '#0A0E14',
      colors: [color1, '#0A0E14'],
      crest: 'shield',
      logo: `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(input.name)}&backgroundColor=${color1.slice(1)}`,
      formation: { name: input.formation, players: [] },
      captain: user.uid,
      captain_id: user.uid,
      captains: [user.uid],
      players: [user.uid],
      roster: [captainPlayer],
      wins: 0,
      losses: 0,
    })
    .select()
    .single();

  if (error) throw error;

  // Kaptanı üyelik tablosuna da yaz (RLS: user_id = auth.uid() ile izinli)
  const { error: memberErr } = await supabase
    .from('team_members')
    .insert({ team_id: data.id, user_id: user.uid, is_active: true });
  if (memberErr) console.error('[teamService] Kaptan üyeliği yazılamadı:', memberErr.message);

  return mapRowToTeam(data);
};

export const fetchMyTeams = async (uid: string): Promise<Team[]> => {
  // Üyesi olduğum takım id'leri
  const { data: memberRows, error: memberErr } = await supabase
    .from('team_members')
    .select('team_id')
    .eq('user_id', uid)
    .eq('is_active', true);
  if (memberErr) console.error('[teamService] Üyelikler çekilemedi:', memberErr.message);

  const ids = (memberRows || []).map(r => r.team_id).filter(Boolean);

  let query = supabase.from('teams').select('*');
  query = ids.length > 0
    ? query.or(`captain_id.eq.${uid},id.in.(${ids.join(',')})`)
    : query.eq('captain_id', uid);

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) {
    console.error('[teamService] Takımlar çekilemedi:', error.message);
    return [];
  }
  return (data || []).map(mapRowToTeam);
};

export const addTeamMember = async (teamId: string, member: { id: string; name: string; avatar?: string }) => {
  const { error } = await supabase
    .from('team_members')
    .insert({ team_id: teamId, user_id: member.id, is_active: true });
  if (error) throw error;
};

export const removeTeamMember = async (teamId: string, userId: string) => {
  const { error } = await supabase
    .from('team_members')
    .update({ is_active: false })
    .eq('team_id', teamId)
    .eq('user_id', userId);
  if (error) throw error;
};
