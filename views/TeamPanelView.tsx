import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, MoreHorizontal, MapPin, Crown, ChevronRight,
  Bell, Users, Calendar, Loader2, Shield, Swords,
} from 'lucide-react';
import { AppView, Team, Player } from '../types';
import { useAppStore } from '../store';
import { auth } from '../supabaseAuth';
import {
  fetchTeamMatchHistory, fetchTeamNextMatch, computeTeamStats,
  TeamMatchRow, TeamStats,
} from '../services/teamService';

// ─── Types ───────────────────────────────────────────────────────────────────
interface TeamPanelViewProps {
  onBack: () => void;
  onNavigate: (view: AppView) => void;
}

type PanelTab = 'KADRO' | 'MACLAR' | 'ISTATISTIK';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const POSITION_GROUPS: Record<string, string[]> = {
  'KALECI':     ['KALECI', 'KL', 'GK'],
  'DEFANS':     ['DEFANS', 'DEF', 'CB', 'SB', 'RB', 'LB'],
  'ORTA SAHA':  ['ORTA SAHA', 'OS', 'CM', 'CDM', 'CAM', 'MF'],
  'FORVET':     ['FORVET', 'FV', 'STP', 'CF', 'SS', 'RW', 'LW', 'ST'],
  'YEDEKLER':   ['YEDEK', 'OYUNCU', 'KAPTAN'],
};

const getGroup = (pos: string): string => {
  const u = pos.toUpperCase();
  for (const [group, vals] of Object.entries(POSITION_GROUPS)) {
    if (vals.includes(u)) return group;
  }
  return 'YEDEKLER';
};

const FORM_STYLE: Record<string, string> = {
  G: 'bg-emerald-500 text-white',
  B: 'bg-amber-500 text-white',
  M: 'bg-red-500 text-white',
};

const AVAILABILITY_STYLE: Record<string, string> = {
  Uygun: 'text-emerald-400',
  Sakat: 'text-red-400',
  İzinli: 'text-amber-400',
};

const getInitials = (name: string) =>
  name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

// Pseudo-form from wins/draws/losses (5 badges, proportional)
const buildFormBadges = (matches: TeamMatchRow[], wins: number, losses: number, draws: number = 0): string[] => {
  if (matches.length >= 5) return matches.slice(0, 5).map(m => m.result);
  const form: string[] = matches.map(m => m.result);
  const remaining = 5 - form.length;
  const total = wins + draws + losses || 1;
  const padG = Math.round((wins / total) * remaining);
  const padB = Math.round((draws / total) * remaining);
  const padM = remaining - padG - padB;
  for (let i = 0; i < padG; i++) form.push('G');
  for (let i = 0; i < padB; i++) form.push('B');
  for (let i = 0; i < padM; i++) form.push('M');
  return form;
};

// Countdown string to a date+time
const buildCountdown = (date: string, time: string): string => {
  if (!date || !time) return '';
  try {
    const dt = new Date(`${date}T${time}`);
    const diff = dt.getTime() - Date.now();
    if (diff <= 0) return 'Maç başladı';
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    if (h > 24) return `${Math.floor(h / 24)} gün içinde`;
    return `${h}sa ${m}dk içinde`;
  } catch {
    return '';
  }
};

// Deterministic activity rate from player id (seeded)
const playerActivityRate = (player: Player, index: number): number => {
  const c0 = player.id.charCodeAt(0) || 0;
  const c1 = player.id.length > 1 ? player.id.charCodeAt(1) : c0;
  const seed = (c0 + c1 + index) % 40;
  return 60 + seed; // 60–99
};

const playerAvailability = (player: Player, index: number): 'Uygun' | 'Sakat' | 'İzinli' => {
  const seed = (player.id.charCodeAt(0) + index) % 10;
  if (seed === 7) return 'Sakat';
  if (seed === 4) return 'İzinli';
  return 'Uygun';
};

// ─── Sub-Components ──────────────────────────────────────────────────────────

const TeamAvatar: React.FC<{ team: Team; size?: number }> = ({ team, size = 56 }) => {
  const color = team.color1 || team.colors?.[0] || '#10B981';
  const short = team.shortName || getInitials(team.name);
  return (
    <motion.div
      animate={{ boxShadow: [`0 0 12px ${color}30`, `0 0 28px ${color}60`, `0 0 12px ${color}30`] }}
      transition={{ duration: 3, repeat: Infinity }}
      style={{ width: size, height: size, background: `linear-gradient(135deg, ${color}CC, ${color}55)` }}
      className="rounded-2xl flex items-center justify-center border border-white/10 flex-shrink-0"
    >
      <span className="font-black italic text-white" style={{ fontSize: size * 0.28 }}>{short}</span>
    </motion.div>
  );
};

const SmallTeamAvatar: React.FC<{ name: string; color?: string; size?: number }> = ({ name, color = '#10B981', size = 44 }) => (
  <div
    style={{ width: size, height: size, background: `linear-gradient(135deg, ${color}CC, ${color}55)` }}
    className="rounded-xl flex items-center justify-center flex-shrink-0 border border-white/10"
  >
    <span className="font-black italic text-white text-xs">{getInitials(name)}</span>
  </div>
);

const PlayerAvatar: React.FC<{ player: Player; size?: number }> = ({ player, size = 40 }) => {
  const COLORS = ['#10B981', '#3B82F6', '#8B5CF6', '#F59E0B', '#EF4444', '#14B8A6'];
  const idx = player.id.charCodeAt(0) % COLORS.length;
  const color = COLORS[idx];
  return (
    <div
      style={{ width: size, height: size, background: `linear-gradient(135deg, ${color}99, ${color}44)` }}
      className="rounded-xl flex items-center justify-center flex-shrink-0 border border-white/10"
    >
      {player.avatar && !player.avatar.includes('api.dicebear') ? (
        <img src={player.avatar} alt={player.name} className="w-full h-full rounded-xl object-cover" />
      ) : (
        <span className="font-black text-white text-xs">{getInitials(player.name)}</span>
      )}
    </div>
  );
};

// ─── Kadro Tab ────────────────────────────────────────────────────────────────
const KadroTab: React.FC<{ team: Team; onNavigate: (v: AppView) => void }> = ({ team, onNavigate }) => {
  const roster = team.roster || [];

  // Group players by position
  const groups: Record<string, Player[]> = {};
  const groupOrder = ['KALECI', 'DEFANS', 'ORTA SAHA', 'FORVET', 'YEDEKLER'];
  groupOrder.forEach(g => (groups[g] = []));

  roster.forEach(p => {
    const g = getGroup(p.position);
    if (!groups[g]) groups[g] = [];
    groups[g].push(p);
  });

  return (
    <div className="space-y-4 pb-6">
      {/* Strateji Odası */}
      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={() => onNavigate('STUDIO')}
        className="w-full bg-emerald-500/8 border border-emerald-500/20 rounded-2xl p-4 flex items-center justify-between hover:bg-emerald-500/12 transition-colors"
      >
        <div>
          <div className="text-[9px] font-black text-emerald-500/70 uppercase tracking-widest mb-0.5">Strateji Odası</div>
          <div className="text-base font-black text-white uppercase tracking-wider">Taktik Stüdyo</div>
        </div>
        <ChevronRight size={20} className="text-emerald-400" />
      </motion.button>

      {/* Player Groups */}
      {groupOrder.map(groupName => {
        const players = groups[groupName] || [];
        if (players.length === 0) return null;
        return (
          <div key={groupName}>
            <div className="flex items-center gap-2 mb-2 px-1">
              <span className="relative flex h-2 w-2">
                <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${groupName === 'KALECI' ? 'bg-amber-400 animate-ping' : groupName === 'DEFANS' ? 'bg-blue-400 animate-ping' : groupName === 'ORTA SAHA' ? 'bg-purple-400 animate-ping' : groupName === 'FORVET' ? 'bg-red-400 animate-ping' : 'bg-gray-500'}`} />
                <span className={`relative inline-flex rounded-full h-2 w-2 ${groupName === 'KALECI' ? 'bg-amber-400' : groupName === 'DEFANS' ? 'bg-blue-400' : groupName === 'ORTA SAHA' ? 'bg-purple-400' : groupName === 'FORVET' ? 'bg-red-400' : 'bg-gray-600'}`} />
              </span>
              <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                {groupName} <span className="text-gray-700">· {players.length} oyuncu</span>
              </span>
            </div>

            <div className="space-y-1.5">
              {players.map((player, idx) => {
                const activityRate = playerActivityRate(player, idx);
                const availability = playerAvailability(player, idx);
                const jerseyNum = idx + (groupName === 'KALECI' ? 1 : groupName === 'DEFANS' ? 2 : groupName === 'ORTA SAHA' ? 6 : groupName === 'FORVET' ? 10 : 14);

                return (
                  <motion.div
                    key={player.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.04 }}
                    className="bg-white/4 border border-white/8 rounded-2xl px-4 py-3 flex items-center gap-3"
                  >
                    {/* Jersey # */}
                    <span className="text-xs font-black text-gray-600 w-4 text-center flex-shrink-0">{jerseyNum}</span>

                    {/* Avatar */}
                    <PlayerAvatar player={player} size={38} />

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-sm font-bold text-white truncate">{player.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md border bg-blue-500/15 text-blue-300 border-blue-500/25">
                          {player.position}
                        </span>
                        <span className={`flex items-center gap-0.5 text-[10px] font-bold ${AVAILABILITY_STYLE[availability]}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${availability === 'Uygun' ? 'bg-emerald-400' : availability === 'Sakat' ? 'bg-red-400' : 'bg-amber-400'}`} />
                          {availability}
                        </span>
                      </div>
                    </div>

                    {/* Activity Bar */}
                    <div className="flex-shrink-0 text-right">
                      <div className="text-[9px] text-gray-600 uppercase tracking-widest mb-1">Aktiflik</div>
                      <div className="w-16 h-1.5 bg-white/8 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${activityRate}%` }}
                          transition={{ duration: 0.8, delay: idx * 0.05 }}
                          className={`h-full rounded-full ${activityRate >= 80 ? 'bg-emerald-400' : activityRate >= 60 ? 'bg-amber-400' : 'bg-red-400'}`}
                        />
                      </div>
                      <div className={`text-[9px] font-bold mt-0.5 ${availability === 'Sakat' ? 'text-red-400' : 'text-emerald-400'}`}>
                        {availability === 'Sakat' ? 'Sakat' : 'Aktif'}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        );
      })}

      {roster.length === 0 && (
        <div className="text-center py-12">
          <Users size={36} className="mx-auto mb-3 text-gray-700" />
          <p className="text-sm text-gray-500">Kadro henüz oluşturulmadı</p>
          <button
            onClick={() => onNavigate('TEAM_BUILDER')}
            className="mt-3 px-4 py-2 bg-emerald-500/20 text-emerald-400 text-sm font-bold rounded-xl border border-emerald-500/30"
          >
            Oyuncu Ekle
          </button>
        </div>
      )}
    </div>
  );
};

// ─── Maçlar Tab ──────────────────────────────────────────────────────────────
const MaclarTab: React.FC<{ matches: TeamMatchRow[]; loading: boolean; team: Team }> = ({ matches, loading, team }) => {
  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="animate-spin text-emerald-400" size={26} />
    </div>
  );

  // Fall back to team.matchHistory if DB has no completed matches
  const teamHistory = (team as any).matchHistory || (team as any).matchScore || [];
  const hasDbMatches = matches.length > 0;

  const relativeDate = (dateStr: string): string => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      const now = new Date();
      const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
      if (diffDays === 0) return 'Bugün';
      if (diffDays === 1) return 'Dün';
      if (diffDays < 7) return `${diffDays} gün önce`;
      if (diffDays < 14) return '1 hafta önce';
      if (diffDays < 21) return '2 hafta önce';
      if (diffDays < 28) return '3 hafta önce';
      return `${Math.floor(diffDays / 7)} hafta önce`;
    } catch {
      return dateStr;
    }
  };

  if (!hasDbMatches && teamHistory.length === 0) {
    return (
      <div className="text-center py-16">
        <Calendar size={36} className="mx-auto mb-3 text-gray-700" />
        <p className="text-sm text-gray-500">Henüz tamamlanan maç yok</p>
      </div>
    );
  }

  return (
    <div className="pb-6 space-y-4">
      <div>
        <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3">Son Sonuçlar</div>
        <div className="space-y-2">
          {hasDbMatches
            ? matches.map((m, i) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="bg-white/4 border border-white/8 rounded-2xl px-4 py-3 flex items-center gap-3"
              >
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black flex-shrink-0 ${FORM_STYLE[m.result]}`}>
                  {m.result}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-white truncate">{m.opponentName}</div>
                  <div className="text-xs text-gray-500">{relativeDate(m.date)}</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <span className="text-base font-black text-white">{m.myScore}-{m.theirScore}</span>
                </div>
              </motion.div>
            ))
            : teamHistory.map((m: any, i: number) => {
              const result = m.result === 'WIN' ? 'G' : m.result === 'DRAW' ? 'B' : 'M';
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="bg-white/4 border border-white/8 rounded-2xl px-4 py-3 flex items-center gap-3"
                >
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-black flex-shrink-0 ${FORM_STYLE[result]}`}>
                    {result}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-white truncate">{m.opponent || 'Rakip'}</div>
                    <div className="text-xs text-gray-500">{m.date || ''}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="text-base font-black text-white">{m.score || '0-0'}</span>
                  </div>
                </motion.div>
              );
            })
          }
        </div>
      </div>
    </div>
  );
};

// ─── İstatistik Tab ──────────────────────────────────────────────────────────
const IstatistikTab: React.FC<{ stats: TeamStats; team: Team; loading: boolean }> = ({ stats, team, loading }) => {
  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="animate-spin text-emerald-400" size={26} />
    </div>
  );

  // Use DB-derived stats when available; fall back to team row counters only when no match history
  const wins   = stats.total > 0 ? stats.wins   : (team.wins   ?? 0);
  const draws  = stats.total > 0 ? stats.draws  : 0;
  const losses = stats.total > 0 ? stats.losses : (team.losses ?? 0);
  const total  = wins + draws + losses || 1;
  const winRate = Math.round((wins / total) * 100);
  const winW    = Math.round((wins  / total) * 100);
  const drawW   = Math.round((draws / total) * 100);

  // Top scorer: player with highest rating in the roster
  const topScorer = (team.roster || []).reduce<Player | null>(
    (best, p) => (!best || (p.rating ?? 0) > (best.rating ?? 0) ? p : best),
    null
  );

  const avgDisplay = stats.average >= 0 ? `+${stats.average}` : String(stats.average);
  const statCards = [
    { label: 'Attığı Gol', value: stats.goalsScored, color: 'text-emerald-400' },
    { label: 'Yediği Gol', value: stats.goalsConceded, color: 'text-red-400' },
    { label: 'Averaj', value: avgDisplay, color: stats.average >= 0 ? 'text-emerald-400' : 'text-red-400' },
    { label: 'Gol Yemedi', value: stats.cleanSheets, color: 'text-white' },
  ];

  return (
    <div className="pb-6 space-y-4">
      {/* Win Rate Bar */}
      <div className="bg-white/4 border border-white/8 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-bold text-white">Galibiyet Oranı</span>
          <span className="text-sm font-black text-emerald-400">%{winRate}</span>
        </div>
        <div className="h-3 rounded-full overflow-hidden flex gap-0.5 mb-2">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${winW}%` }}
            transition={{ duration: 0.9 }}
            className="h-full bg-emerald-500 rounded-l-full"
          />
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${drawW}%` }}
            transition={{ duration: 0.9, delay: 0.1 }}
            className="h-full bg-amber-500"
          />
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${100 - winW - drawW}%` }}
            transition={{ duration: 0.9, delay: 0.2 }}
            className="h-full bg-red-500 rounded-r-full"
          />
        </div>
        <div className="flex justify-between text-[10px] text-gray-500">
          <span className="text-emerald-400">{wins} Galibiyet</span>
          <span className="text-amber-400">{draws} Beraberlik</span>
          <span className="text-red-400">{losses} Mağlubiyet</span>
        </div>
      </div>

      {/* Stat Grid */}
      <div className="grid grid-cols-2 gap-2">
        {statCards.map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.06 }}
            className="bg-white/4 border border-white/8 rounded-2xl p-4"
          >
            <div className={`text-2xl font-black mb-1 ${s.color}`}>{s.value}</div>
            <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{s.label}</div>
          </motion.div>
        ))}
      </div>

      {/* Top Scorer */}
      {topScorer && (
        <div className="bg-white/4 border border-white/8 rounded-2xl p-4">
          <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3">En Golcü</div>
          <div className="flex items-center gap-3">
            <PlayerAvatar player={topScorer} size={40} />
            <div className="flex-1">
              <div className="text-sm font-bold text-white">{topScorer.name}</div>
              <div className="text-xs text-gray-500">{topScorer.position}</div>
            </div>
            <div className="text-right">
              <span className="text-xl font-black text-white">
                {stats.goalsScored > 0 ? Math.ceil(stats.goalsScored * 0.4) : wins}
              </span>
              <span className="text-xs text-gray-500 ml-1">gol</span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
const TeamPanelView: React.FC<TeamPanelViewProps> = ({ onBack, onNavigate }) => {
  const myTeams = useAppStore(s => s.myTeams);
  const selectedTeamId = useAppStore(s => s.selectedTeamId);
  const userId = auth.currentUser?.uid || '';
  const [activeTeamIdx, setActiveTeamIdx] = useState(0);
  // Açık kimlik ilkesi (A4/G42): Sosyal'den gelen selectedTeamId önceliklidir;
  // yoksa eski davranış (ilk takım) korunur. "Index-0" hatası kapanır.
  const selectedIdx = selectedTeamId
    ? myTeams.findIndex(t => t.id === selectedTeamId)
    : -1;
  const team = (selectedIdx >= 0 ? myTeams[selectedIdx] : myTeams[activeTeamIdx]) ?? null;

  const [tab, setTab] = useState<PanelTab>('KADRO');
  const [matchHistory, setMatchHistory] = useState<TeamMatchRow[]>([]);
  const [nextMatch, setNextMatch] = useState<TeamMatchRow | null>(null);
  const [stats, setStats] = useState<TeamStats>({
    wins: 0, draws: 0, losses: 0, total: 0,
    winRate: 0, goalsScored: 0, goalsConceded: 0, average: 0, cleanSheets: 0,
  });
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [countdown, setCountdown] = useState('');

  // Load match data when team changes
  useEffect(() => {
    if (!team?.id) return;
    let cancelled = false;
    const load = async () => {
      setLoadingMatches(true);
      try {
        const [history, next] = await Promise.all([
          fetchTeamMatchHistory(team.id),
          fetchTeamNextMatch(team.id),
        ]);
        if (cancelled) return;
        setMatchHistory(history);
        setNextMatch(next);
        setStats(computeTeamStats(history, team.wins ?? 0, team.losses ?? 0));
      } catch (e) {
        console.error('[TeamPanelView] Maç verisi yüklenemedi:', e);
      } finally {
        if (!cancelled) setLoadingMatches(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [team?.id]);

  // Countdown timer
  useEffect(() => {
    if (!nextMatch) return;
    const tick = () => setCountdown(buildCountdown(nextMatch.date, nextMatch.time));
    tick();
    const interval = setInterval(tick, 60000);
    return () => clearInterval(interval);
  }, [nextMatch]);

  if (!team) {
    return (
      <div className="min-h-screen bg-[#070B10] text-white flex flex-col items-center justify-center gap-4 px-6">
        <Swords size={48} className="text-gray-700" />
        <p className="text-gray-400 text-center">Henüz bir takımın yok.</p>
        <button
          onClick={() => onNavigate('TEAM_CREATOR')}
          className="px-6 py-3 bg-emerald-500 rounded-2xl text-sm font-bold text-white hover:bg-emerald-400"
        >
          Takım Oluştur
        </button>
        <button onClick={onBack} className="text-sm text-gray-600">Geri Dön</button>
      </div>
    );
  }

  const teamColor = team.color1 || team.colors?.[0] || '#10B981';
  const wins = team.wins ?? 0;
  const losses = team.losses ?? 0;
  const draws = stats.total > 0 ? stats.draws : Math.max(0, (team.matches ?? 0) - wins - losses);
  const total = wins + draws + losses;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
  const formBadges = buildFormBadges(matchHistory, wins, losses, draws);
  const isCaptain = team.captain === userId || (team as any).captain_id === userId;
  const rosterCount = (team.roster || []).length;

  const TABS: { id: PanelTab; label: string }[] = [
    { id: 'KADRO', label: 'Kadro' },
    { id: 'MACLAR', label: 'Maçlar' },
    { id: 'ISTATISTIK', label: 'İstatistik' },
  ];

  return (
    <div className="min-h-screen bg-[#070B10] text-white flex flex-col font-sans">
      {/* ── Ambient Glow ── */}
      <div
        className="fixed top-0 right-0 w-72 h-72 pointer-events-none opacity-12 blur-[100px]"
        style={{ background: `radial-gradient(circle, ${teamColor} 0%, transparent 70%)` }}
      />

      {/* ── Header ── */}
      <div className="pt-safe px-5 pt-3 flex-shrink-0 relative z-10">
        {/* Nav row */}
        <div className="flex items-center justify-between mb-5">
          <button
            onClick={onBack}
            className="w-10 h-10 rounded-2xl bg-white/8 border border-white/10 flex items-center justify-center hover:bg-white/12 transition-colors"
          >
            <ArrowLeft size={18} className="text-white" />
          </button>
          <button className="w-10 h-10 rounded-2xl bg-white/8 border border-white/10 flex items-center justify-center">
            <MoreHorizontal size={18} className="text-white" />
          </button>
        </div>

        {/* Team Identity */}
        <div className="flex items-center gap-4 mb-5">
          <TeamAvatar team={team} size={64} />
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-black italic tracking-tight text-white leading-tight truncate uppercase">
              {team.name}
            </h1>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {team.shortName && (
                <span className="text-[10px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-2 py-0.5 rounded-lg">
                  {team.shortName}
                </span>
              )}
              {team.location && (
                <span className="flex items-center gap-1 text-[11px] text-gray-400">
                  <MapPin size={11} /> {team.location}
                </span>
              )}
              {isCaptain && (
                <span className="flex items-center gap-1 text-[11px] text-amber-400 font-bold">
                  <Crown size={11} /> Kaptan
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {[
            { value: `${wins}-${draws}-${losses}`, label: 'G-B-M' },
            { value: `%${winRate}`, label: 'Galibiyet', accent: true },
          ].map((s, i) => (
            <div key={i} className="bg-white/5 border border-white/8 rounded-xl p-3 text-center">
              <div className={`text-lg font-black ${s.accent ? 'text-emerald-400' : 'text-white'}`}>{s.value}</div>
              <div className="text-[9px] font-black text-gray-600 uppercase tracking-widest mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Form Row */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">Form</span>
            <div className="flex gap-1">
              {formBadges.map((r, i) => (
                <span key={i} className={`w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-black ${FORM_STYLE[r]}`}>
                  {r}
                </span>
              ))}
            </div>
          </div>
          <span className="text-[10px] text-gray-600">Son 5 maç</span>
        </div>

        {/* Next Match Card */}
        {nextMatch ? (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                </span>
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Sıradaki Maç</span>
              </div>
              {countdown && (
                <span className="text-[11px] font-bold text-emerald-400">{countdown}</span>
              )}
            </div>

            <div className="flex items-center justify-between mb-3">
              <div className="flex flex-col items-center gap-1.5">
                <SmallTeamAvatar name={team.name} color={teamColor} size={46} />
                <span className="text-[10px] text-gray-400 font-medium">{team.shortName || getInitials(team.name)}</span>
              </div>
              <div className="text-center">
                <div className="text-[11px] font-black text-gray-500 uppercase tracking-widest">vs</div>
                <div className="text-base font-black text-white">{nextMatch.time || '--:--'}</div>
              </div>
              <div className="flex flex-col items-center gap-1.5">
                <SmallTeamAvatar name={nextMatch.opponentName} color={nextMatch.opponentColor} size={46} />
                <span className="text-[10px] text-gray-400 font-medium">{nextMatch.opponentShort}</span>
              </div>
            </div>

            {nextMatch.location && (
              <div className="flex items-center justify-center gap-1.5 mb-3">
                <MapPin size={11} className="text-gray-600" />
                <span className="text-[11px] text-gray-500">
                  {nextMatch.date ? 'Bugün' : ''} · {nextMatch.location}
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => onNavigate('MY_TEAM_TACTICS')}
                className="py-3 rounded-xl text-sm font-bold text-white border border-white/10"
                style={{ background: `linear-gradient(135deg, ${teamColor}33, transparent)` }}
              >
                Kadroyu Kur
              </button>
              <button className="py-3 rounded-xl bg-white/8 border border-white/10 text-sm font-bold text-white flex items-center justify-center gap-2 hover:bg-white/12 transition-colors">
                <Bell size={15} />
                Hatırlat
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white/4 border border-white/8 border-dashed rounded-2xl p-4 mb-5 flex items-center justify-center gap-2 text-gray-600">
            <Calendar size={16} />
            <span className="text-sm">Yaklaşan maç yok</span>
          </div>
        )}

        {/* Tab Bar */}
        <div className="flex gap-0 border-b border-white/8">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative flex-1 pb-3 text-sm font-bold transition-colors ${tab === t.id ? 'text-white' : 'text-gray-500 hover:text-gray-300'}`}
            >
              {t.label}
              {tab === t.id && (
                <motion.div
                  layoutId="teamTabLine"
                  className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                  style={{ background: teamColor }}
                />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab Content ── */}
      <div className="flex-1 overflow-y-auto px-5 pt-4 relative z-10">
        <AnimatePresence mode="wait">
          {tab === 'KADRO' && (
            <motion.div key="kadro" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.15 }}>
              <KadroTab team={team} onNavigate={onNavigate} />
            </motion.div>
          )}
          {tab === 'MACLAR' && (
            <motion.div key="maclar" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.15 }}>
              <MaclarTab matches={matchHistory} loading={loadingMatches} team={team} />
            </motion.div>
          )}
          {tab === 'ISTATISTIK' && (
            <motion.div key="istatistik" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.15 }}>
              <IstatistikTab stats={stats} team={team} loading={loadingMatches} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default TeamPanelView;
