// ═══════════════════════════════════════════════════════════════
// OYNA — Team Service
// teams + team_members tablolarının tek erişim noktası.
// RLS: teams INSERT = authenticated, UPDATE/DELETE = captain_id;
//      team_members = kendisi veya kaptan (bkz. 20260606174119 migration).
// ═══════════════════════════════════════════════════════════════
import { supabase } from '../supabaseClient';
import { auth } from '../supabaseAuth';
import { Team, Player } from '../types';

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

// ── SÖKÜLDÜ (20 Ağu 2026 çapraz incelemesi) ────────────────────────────────
// createTeam + NewTeamInput kaldırıldı: hiçbir ekran çağırmıyordu (takım
// kurma create_team RPC'siyle — teamSocialService) ve insert gövdesi şemada
// olmayan kolonlara (play_style/value) yazdığı için çağrıldığı gün komple
// düşecekti. Tek takım kurma yolu: create_team RPC'si.

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

// ─── Maç Geçmişi & Sıradaki Maç ─────────────────────────────────────────────

export interface TeamMatchRow {
  id: string;
  date: string;
  time: string;
  location: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  homeTeamName: string;
  awayTeamName: string;
  homeTeamShort: string;
  awayTeamShort: string;
  homeTeamColor: string;
  awayTeamColor: string;
  // derived
  isHome: boolean;
  myScore: number;
  theirScore: number;
  opponentName: string;
  opponentShort: string;
  opponentColor: string;
  result: 'G' | 'B' | 'M'; // Galibiyet / Beraberlik / Mağlubiyet
}

export interface TeamStats {
  wins: number;
  draws: number;
  losses: number;
  total: number;
  winRate: number;
  goalsScored: number;
  goalsConceded: number;
  average: number;
  cleanSheets: number;
}

// Takım maç geçmişi (DB'den — tamamlanan maçlar)
export const fetchTeamMatchHistory = async (teamId: string, limit = 20): Promise<TeamMatchRow[]> => {
  const { data, error } = await supabase
    .from('matches')
    .select(`
      id, date, time, location, status,
      "homeTeamId", "awayTeamId",
      "homeScore", "awayScore"
    `)
    .or(`"homeTeamId".eq.${teamId},"awayTeamId".eq.${teamId}`)
    .in('status', ['COMPLETED', 'FINISHED', 'SCORED'])
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  if (!data || data.length === 0) return [];

  // Rakip takım isimlerini çek
  const otherTeamIds = [
    ...new Set(data.map(m => m.homeTeamId === teamId ? m.awayTeamId : m.homeTeamId).filter(Boolean))
  ];

  const { data: teamRows } = await supabase
    .from('teams')
    .select('id, name, "shortName", color1')
    .in('id', otherTeamIds);

  const teamMap = new Map((teamRows || []).map(t => [t.id, t]));

  return data.map(m => {
    const isHome = m.homeTeamId === teamId;
    const myScore = isHome ? (m.homeScore ?? 0) : (m.awayScore ?? 0);
    const theirScore = isHome ? (m.awayScore ?? 0) : (m.homeScore ?? 0);
    const opponentId = isHome ? m.awayTeamId : m.homeTeamId;
    const opp = teamMap.get(opponentId);
    const result: 'G' | 'B' | 'M' = myScore > theirScore ? 'G' : myScore === theirScore ? 'B' : 'M';

    return {
      ...m,
      homeTeamName: '',
      awayTeamName: '',
      homeTeamShort: '',
      awayTeamShort: '',
      homeTeamColor: '#10B981',
      awayTeamColor: '#3B82F6',
      isHome,
      myScore,
      theirScore,
      opponentName: opp?.name || 'Rakip Takım',
      opponentShort: opp?.shortName || '???',
      opponentColor: opp?.color1 || '#3B82F6',
      result,
    };
  });
};

// Sıradaki maç
// Not: time sütunu TEXT tipinde saklanıyor; lexicografik sıralama
// tek haneli saat için hatalı sonuç verebilir ("9:00" > "10:00").
// Bu yüzden DB'den en yakın tarihteki 10 maçı çekip JS'de doğru sıralıyoruz.
export const fetchTeamNextMatch = async (teamId: string): Promise<TeamMatchRow | null> => {
  const { data: rows, error } = await supabase
    .from('matches')
    .select(`
      id, date, time, location, status,
      "homeTeamId", "awayTeamId",
      "homeScore", "awayScore"
    `)
    .or(`"homeTeamId".eq.${teamId},"awayTeamId".eq.${teamId}`)
    .in('status', ['PENDING', 'OPEN', 'CONFIRMED'])
    .order('date', { ascending: true })
    .limit(10);

  if (error) throw error;
  if (!rows || rows.length === 0) return null;

  // JS-level sort: date is DATE type (sorts correctly), time is TEXT so we
  // zero-pad single-digit hours before comparing ("9:00" → "09:00").
  const padTime = (t: string) => (t && /^\d:/.test(t) ? `0${t}` : t || '00:00');
  const data = [...rows].sort((a, b) => {
    const da = `${a.date}T${padTime(a.time)}`;
    const db = `${b.date}T${padTime(b.time)}`;
    return da < db ? -1 : da > db ? 1 : 0;
  })[0];

  if (!data) return null;

  const isHome = data.homeTeamId === teamId;
  const opponentId = isHome ? data.awayTeamId : data.homeTeamId;

  const { data: opp } = opponentId
    ? await supabase.from('teams').select('id, name, "shortName", color1').eq('id', opponentId).maybeSingle()
    : { data: null };

  return {
    ...data,
    homeTeamName: '',
    awayTeamName: '',
    homeTeamShort: '',
    awayTeamShort: '',
    homeTeamColor: '#10B981',
    awayTeamColor: opp?.color1 || '#3B82F6',
    isHome,
    myScore: 0,
    theirScore: 0,
    opponentName: opp?.name || 'Rakip Takım',
    opponentShort: opp?.shortName || '???',
    opponentColor: opp?.color1 || '#3B82F6',
    result: 'G',
  };
};

// Takım istatistiklerini maç geçmişinden hesapla
export const computeTeamStats = (matches: TeamMatchRow[], teamWins: number, teamLosses: number): TeamStats => {
  if (matches.length === 0) {
    const total = teamWins + teamLosses;
    return {
      wins: teamWins, draws: 0, losses: teamLosses, total,
      winRate: total > 0 ? Math.round((teamWins / total) * 100) : 0,
      goalsScored: 0, goalsConceded: 0, average: 0, cleanSheets: 0,
    };
  }
  const wins = matches.filter(m => m.result === 'G').length;
  const draws = matches.filter(m => m.result === 'B').length;
  const losses = matches.filter(m => m.result === 'M').length;
  const total = wins + draws + losses;
  const goalsScored = matches.reduce((s, m) => s + m.myScore, 0);
  const goalsConceded = matches.reduce((s, m) => s + m.theirScore, 0);
  const cleanSheets = matches.filter(m => m.theirScore === 0).length;
  return {
    wins, draws, losses, total,
    winRate: total > 0 ? Math.round(((wins + draws * 0.5) / total) * 100) : 0,
    goalsScored, goalsConceded,
    average: goalsScored - goalsConceded,
    cleanSheets,
  };
};

// F4.2: getFriendsWithStats kaldırıldı — tek tüketicisi silinen TeamBuilder
// ekranıydı (erişilemez OVR-dengeleme maketi). Gelecekte MatchCreate'e gerçek
// bir dengeleme özelliği gelirse public_profiles(skill_rating, match_count)
// üzerinden yeniden yazılır.
