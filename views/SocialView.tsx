import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Swords, Plus, Search, X, Check, Star, MessageCircle,
  ChevronRight, Zap, Shield, Crown, TrendingUp, UserPlus,
  Calendar, MapPin, Loader2
} from 'lucide-react';
import { AppView } from '../types';
import { auth } from '../supabaseAuth';
import {
  fetchFriends, fetchPendingRequests, fetchUserTeams,
  acceptFriendRequest, removeFriendship, toggleFriendFavorite,
  updateFriendGroup,
  FriendshipRow, FriendRequest,
} from '../services/friendService';
import { createTeam } from '../services/teamService';
import { getOrCreateConversation } from '../services/messageService';
import { useAppStore } from '../store';
import { TeamCreatorWizard } from '../components/TeamCreatorWizard';

// ─── Types ──────────────────────────────────────────────────────────────────
interface SocialViewProps {
  onNavigate: (view: AppView) => void;
}

type MainTab = 'FRIENDS' | 'TEAMS';

const GROUPS = ['Tümü', 'Favorilerim', 'Üniversite', 'Lise Tayfası', 'İş', 'Futbol'];

// ─── Helpers ─────────────────────────────────────────────────────────────────
const getInitials = (name: string | null) =>
  (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

const getPosition = (friend: FriendshipRow) =>
  friend.other_user.player_card?.position || 'OS';

const getWinRate = (wins: number, total: number) =>
  total > 0 ? Math.round((wins / total) * 100) : 0;

const TEAM_COLORS: Record<number, { from: string; to: string; text: string }> = {
  0: { from: '#10B981', to: '#065F46', text: '#10B981' },
  1: { from: '#3B82F6', to: '#1E3A8A', text: '#3B82F6' },
  2: { from: '#8B5CF6', to: '#4C1D95', text: '#8B5CF6' },
  3: { from: '#F59E0B', to: '#78350F', text: '#F59E0B' },
  4: { from: '#EF4444', to: '#7F1D1D', text: '#EF4444' },
};

const teamColor = (index: number) => TEAM_COLORS[index % Object.keys(TEAM_COLORS).length];

// Pseudo form badges from win/loss ratio (last 5 as placeholder)
const buildForm = (wins: number, losses: number): string[] => {
  const total = wins + losses;
  const form: string[] = [];
  for (let i = 0; i < 5; i++) {
    if (i < Math.min(wins, 3)) form.push('G');
    else if (i < Math.min(wins + Math.floor(losses / 2), 4)) form.push('B');
    else form.push('M');
  }
  return form.reverse().slice(0, 5);
};

const FORM_STYLE: Record<string, string> = {
  G: 'bg-emerald-500 text-white',
  B: 'bg-amber-500/80 text-white',
  M: 'bg-red-500 text-white',
};

// ─── Sub-components ──────────────────────────────────────────────────────────

const OnlineDot: React.FC<{ active: boolean }> = ({ active }) =>
  active ? (
    <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#0A0E14]" />
  ) : null;

const Avatar: React.FC<{ name: string | null; url: string | null; size?: number; color?: string }> = ({
  name, url, size = 48, color = 'from-slate-600 to-slate-800'
}) => {
  const s = `${size}px`;
  if (url) return (
    <img src={url} alt={name || ''} style={{ width: s, height: s }}
      className="rounded-2xl object-cover flex-shrink-0" />
  );
  return (
    <div style={{ width: s, height: s }}
      className={`rounded-2xl bg-gradient-to-br ${color} flex items-center justify-center flex-shrink-0`}>
      <span className="text-white font-black" style={{ fontSize: size * 0.33 }}>
        {getInitials(name)}
      </span>
    </div>
  );
};

// ─── Teams Tab ───────────────────────────────────────────────────────────────
const TeamsTab: React.FC<{
  captainTeams: any[];
  memberTeams: any[];
  loading: boolean;
  onNavigate: (v: AppView) => void;
  onCreateTeam: () => void;
}> = ({ captainTeams, memberTeams, loading, onNavigate, onCreateTeam }) => {
  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="animate-spin text-emerald-400" size={28} />
    </div>
  );

  const mainTeam = captainTeams[0];

  return (
    <div className="space-y-4 pb-6">
      {/* Captain Teams */}
      {captainTeams.map((team, i) => {
        const color = team.color1 || teamColor(i).from;
        const initials = team.shortName || getInitials(team.name);
        const wins = team.wins ?? 0;
        const losses = team.losses ?? 0;
        const draws = Math.max(0, (team.matches ?? 0) - wins - losses);
        const form = buildForm(wins, losses);
        const fp = team.karatScore ?? Math.min(99, Math.round(50 + wins * 2.5));
        const rosterCount = Array.isArray(team.roster) ? team.roster.length : 0;
        const isMain = i === 0;

        return (
          <motion.div
            key={team.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="rounded-2xl overflow-hidden border border-white/10"
            style={{ background: `linear-gradient(135deg, ${color}18 0%, #0D1117 60%)` }}
          >
            <div className="p-4">
              {/* Team Header */}
              <div className="flex items-start gap-3 mb-4">
                <motion.div
                  animate={{ boxShadow: [`0 0 16px ${color}30`, `0 0 32px ${color}60`, `0 0 16px ${color}30`] }}
                  transition={{ duration: 3, repeat: Infinity }}
                  className="w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0 border border-white/10"
                  style={{ background: `linear-gradient(135deg, ${color}AA, ${color}55)` }}
                >
                  <span className="text-white font-black text-lg italic">{initials}</span>
                </motion.div>

                <div className="flex-1 min-w-0">
                  <h2 className="text-xl font-black italic tracking-tight text-white truncate">{team.name}</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-sm text-gray-400 font-medium">
                      {wins}G · {draws}B · {losses}M
                    </span>
                    <span className="text-gray-600">·</span>
                    <div className="flex items-center gap-1">
                      <Shield size={12} className="text-emerald-400" />
                      <span className="text-xs font-black text-emerald-400">FP {fp}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Form */}
              <div className="flex items-center gap-2 mb-4">
                <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Form</span>
                <div className="flex gap-1">
                  {form.map((r, fi) => (
                    <span key={fi} className={`w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-black ${FORM_STYLE[r]}`}>
                      {r}
                    </span>
                  ))}
                </div>
              </div>

              {/* Next Match */}
              {isMain && (
                <div className="bg-black/40 border border-white/8 rounded-xl p-3 mb-4 flex items-center gap-3">
                  <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                  </span>
                  <div>
                    <div className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-0.5">Sıradaki Maç</div>
                    <div className="text-sm font-bold text-white">Bugün 22:00 · Yıldız Halı Saha</div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => onNavigate('MY_TEAM')}
                  className="py-3 px-4 bg-white/8 border border-white/10 rounded-xl text-sm font-bold text-white hover:bg-white/12 transition-colors"
                >
                  Kadro · {rosterCount} oyuncu
                </button>
                <button
                  onClick={() => onNavigate('STUDIO')}
                  className="py-3 px-4 rounded-xl text-sm font-bold text-emerald-900 hover:brightness-110 transition-all"
                  style={{ background: `linear-gradient(135deg, ${color}, ${color}CC)` }}
                >
                  Taktik Stüdyo
                </button>
              </div>
            </div>
          </motion.div>
        );
      })}

      {captainTeams.length === 0 && memberTeams.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <Swords size={40} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">Henüz takımın yok</p>
        </div>
      )}

      {/* Member Teams */}
      {memberTeams.length > 0 && (
        <div>
          <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-1 mb-3">
            Diğer Takımlarım
          </div>
          <div className="space-y-2">
            {memberTeams.map((team, i) => {
              const color = team.color1 || teamColor(i + captainTeams.length).from;
              const initials = team.shortName || getInitials(team.name);
              const wins = team.wins ?? 0;
              const total = team.matches ?? (wins + (team.losses ?? 0));
              const winRate = getWinRate(wins, total);
              const form = buildForm(wins, team.losses ?? 0);

              return (
                <motion.div
                  key={team.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="bg-white/4 border border-white/8 rounded-2xl p-4"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 font-black text-white italic"
                      style={{ background: `linear-gradient(135deg, ${color}99, ${color}44)` }}
                    >
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-white truncate">{team.name}</span>
                        <span className="text-[9px] font-black text-gray-400 bg-white/10 border border-white/15 px-1.5 py-0.5 rounded-md">ÜYE</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">{wins}G · {team.losses ?? 0}M</span>
                        <div className="flex gap-0.5">
                          {form.map((r, fi) => (
                            <span key={fi} className={`w-2.5 h-2.5 rounded-full ${r === 'G' ? 'bg-emerald-500' : r === 'B' ? 'bg-amber-500' : 'bg-red-500'}`} />
                          ))}
                        </div>
                      </div>
                      {/* Win rate bar */}
                      <div className="mt-2 h-1 bg-white/8 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${winRate}%` }}
                          transition={{ duration: 0.8, delay: 0.3 }}
                          className="h-full rounded-full"
                          style={{ background: color }}
                        />
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-xl font-black" style={{ color }}>%{winRate}</div>
                      <div className="text-[9px] text-gray-600 uppercase tracking-widest">Galibiyet</div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* Create Team Button */}
      <button
        onClick={onCreateTeam}
        className="w-full py-4 border-2 border-dashed border-white/15 rounded-2xl flex items-center justify-center gap-2 text-gray-500 hover:text-gray-300 hover:border-white/25 transition-all"
      >
        <Plus size={18} />
        <span className="text-sm font-bold">Yeni Takım Oluştur</span>
      </button>
    </div>
  );
};

// ─── Friends Tab ─────────────────────────────────────────────────────────────
const FriendsTab: React.FC<{
  userId: string;
  friends: FriendshipRow[];
  requests: FriendRequest[];
  loading: boolean;
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
  onToggleFav: (f: FriendshipRow) => void;
  onGroupChange: (f: FriendshipRow, group: string) => void;
  onNavigate: (v: AppView) => void;
  onMessage: (f: FriendshipRow) => void;
  messagingId: string | null;
}> = ({ userId, friends, requests, loading, onAccept, onDecline, onToggleFav, onGroupChange, onNavigate, onMessage, messagingId }) => {
  const [search, setSearch] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('Tümü');
  const [expandedGroupPicker, setExpandedGroupPicker] = useState<string | null>(null);

  const filtered = friends.filter(f => {
    const name = (f.other_user.full_name || '').toLowerCase();
    const matchSearch = name.includes(search.toLowerCase());
    if (!matchSearch) return false;
    if (selectedGroup === 'Tümü') return true;
    if (selectedGroup === 'Favorilerim') return f.isFavorite;
    return f.myGroup === selectedGroup;
  });

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="animate-spin text-emerald-400" size={28} />
    </div>
  );

  return (
    <div className="space-y-4 pb-6">
      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Arkadaş ara"
          className="w-full bg-white/6 border border-white/10 rounded-2xl pl-10 pr-4 py-3.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-emerald-500/50"
        />
      </div>

      {/* Pending Requests */}
      {requests.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">İstekler</span>
            <span className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center text-[10px] font-black text-white">
              {requests.length}
            </span>
          </div>
          <div className="space-y-2">
            {requests.map(req => (
              <motion.div
                key={req.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -40 }}
                className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center gap-3"
              >
                <div className="relative">
                  <Avatar name={req.sender.full_name} url={req.sender.avatar_url} size={44} color="from-blue-600 to-blue-900" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white truncate">{req.sender.full_name || 'Oyuncu'}</span>
                    {req.sender.player_card?.position && (
                      <span className="text-[9px] font-black bg-blue-500/20 text-blue-300 border border-blue-500/30 px-1.5 py-0.5 rounded-md">
                        {req.sender.player_card.position}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {req.sender.oyna_id || 'OYNA kullanıcısı'}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => onDecline(req.id)}
                    className="w-9 h-9 rounded-xl bg-white/8 border border-white/10 flex items-center justify-center hover:bg-red-500/20 transition-colors"
                  >
                    <X size={16} className="text-gray-400" />
                  </button>
                  <button
                    onClick={() => onAccept(req.id)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-emerald-500 rounded-xl text-sm font-bold text-white hover:bg-emerald-400 transition-colors"
                  >
                    <Check size={15} />
                    Onayla
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Group Filter Chips */}
      <div>
        <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3">Arkadaşlarım</div>
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {GROUPS.map(g => (
            <button
              key={g}
              onClick={() => setSelectedGroup(g)}
              className={`flex-shrink-0 px-3.5 py-2 rounded-xl text-xs font-bold transition-all border ${
                selectedGroup === g
                  ? 'bg-white text-[#0A0E14] border-white'
                  : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10'
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {/* Friends List */}
      {filtered.length === 0 ? (
        <div className="text-center py-10">
          <Users size={36} className="mx-auto mb-3 text-gray-700" />
          <p className="text-sm text-gray-500">
            {search ? 'Arkadaş bulunamadı' : 'Henüz arkadaşın yok'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((f, i) => {
            const name = f.other_user.full_name || 'Oyuncu';
            const pos = getPosition(f);
            const wins = f.other_user.win_count ?? 0;
            const total = f.other_user.total_matches ?? 0;
            const winRate = getWinRate(wins, total);
            const isOnline = !!f.other_user.last_active_at &&
              Date.now() - new Date(f.other_user.last_active_at).getTime() < 5 * 60 * 1000;
            const showPicker = expandedGroupPicker === f.id;

            return (
              <motion.div
                key={f.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="bg-white/4 border border-white/8 rounded-2xl overflow-hidden"
              >
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <div className="relative">
                      <Avatar name={name} url={f.other_user.avatar_url} size={50} color="from-emerald-700 to-emerald-900" />
                      <OnlineDot active={isOnline} />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-white truncate">{name}</span>
                        {f.isFavorite && <Star size={13} className="text-amber-400 fill-amber-400 flex-shrink-0" />}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <span className="text-[10px] font-black bg-blue-500/15 text-blue-300 border border-blue-500/25 px-1.5 py-0.5 rounded-md">
                          {pos}
                        </span>
                        {f.myGroup && f.myGroup !== 'Tümü' && (
                          <span className="text-[10px] text-gray-500">{f.myGroup}</span>
                        )}
                        {isOnline && (
                          <span className="text-[10px] text-emerald-400 font-bold">· Çevrimiçi</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-500">
                        <span>{f.matches_together ?? 0} birlikte</span>
                        <span className="text-gray-700">·</span>
                        <span>{total}G</span>
                      </div>
                    </div>

                    {/* Win Rate */}
                    <div className="text-right flex-shrink-0">
                      <div className="text-lg font-black text-emerald-400">%{winRate}</div>
                      <div className="text-[9px] text-gray-600 uppercase tracking-widest">Galibiyet</div>
                      <div className="mt-1.5 w-14 h-1 bg-white/8 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${winRate}%` }}
                          transition={{ duration: 0.7, delay: 0.2 }}
                          className="h-full bg-emerald-500 rounded-full"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 mt-3">
                    <button
                      onClick={() => onMessage(f)}
                      disabled={messagingId === f.id}
                      title="Mesaj gönder"
                      className="w-10 h-10 rounded-xl bg-white/6 border border-white/10 flex items-center justify-center hover:bg-white/12 transition-colors disabled:opacity-50"
                    >
                      {messagingId === f.id
                        ? <Loader2 size={16} className="text-gray-400 animate-spin" />
                        : <MessageCircle size={16} className="text-gray-400" />}
                    </button>
                    <button
                      onClick={() => onToggleFav(f)}
                      className={`w-10 h-10 rounded-xl border flex items-center justify-center transition-colors ${
                        f.isFavorite
                          ? 'bg-amber-500/20 border-amber-500/40'
                          : 'bg-white/6 border-white/10 hover:bg-amber-500/10'
                      }`}
                    >
                      <Star size={16} className={f.isFavorite ? 'text-amber-400 fill-amber-400' : 'text-gray-400'} />
                    </button>
                    <button
                      onClick={() => setExpandedGroupPicker(showPicker ? null : f.id)}
                      className="w-10 h-10 rounded-xl bg-white/6 border border-white/10 flex items-center justify-center hover:bg-white/12 transition-colors"
                      title="Grup ata"
                    >
                      <Users size={16} className="text-gray-400" />
                    </button>
                    <button className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-sm font-bold text-white hover:bg-emerald-400 transition-colors">
                      Maça Çağır
                    </button>
                  </div>

                  {/* Group Picker */}
                  <AnimatePresence>
                    {showPicker && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="pt-3 flex flex-wrap gap-1.5">
                          {GROUPS.filter(g => g !== 'Tümü' && g !== 'Favorilerim').map(g => (
                            <button
                              key={g}
                              onClick={() => {
                                onGroupChange(f, f.myGroup === g ? '' : g);
                                setExpandedGroupPicker(null);
                              }}
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border ${
                                f.myGroup === g
                                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                                  : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                              }`}
                            >
                              {g}
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────
const SocialView: React.FC<SocialViewProps> = ({ onNavigate }) => {
  const userId = auth.currentUser?.uid || '';

  const [tab, setTab] = useState<MainTab>('TEAMS');
  const [friends, setFriends] = useState<FriendshipRow[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [captainTeams, setCaptainTeams] = useState<any[]>([]);
  const [memberTeams, setMemberTeams] = useState<any[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(true);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [showTeamWizard, setShowTeamWizard] = useState(false);
  const [wizardLoading, setWizardLoading] = useState(false);
  const [messagingId, setMessagingId] = useState<string | null>(null);
  const setSelectedConversationId = useAppStore(s => s.setSelectedConversationId);

  // Load data
  useEffect(() => {
    if (!userId) {
      setLoadingFriends(false);
      setLoadingTeams(false);
      return;
    }

    const loadFriends = async () => {
      setLoadingFriends(true);
      try {
        const [f, r] = await Promise.all([
          fetchFriends(userId),
          fetchPendingRequests(userId),
        ]);
        setFriends(f);
        setRequests(r);
      } catch (e) {
        console.error('[SocialView] arkadaşlar yüklenemedi', e);
      } finally {
        setLoadingFriends(false);
      }
    };

    const loadTeams = async () => {
      setLoadingTeams(true);
      try {
        const { captainTeams: ct, memberTeams: mt } = await fetchUserTeams(userId);
        setCaptainTeams(ct);
        setMemberTeams(mt);
      } catch (e) {
        console.error('[SocialView] takımlar yüklenemedi', e);
      } finally {
        setLoadingTeams(false);
      }
    };

    loadFriends();
    loadTeams();
  }, [userId]);

  const handleAccept = useCallback(async (requestId: string) => {
    try {
      await acceptFriendRequest(requestId);
      setRequests(prev => prev.filter(r => r.id !== requestId));
      // Reload friends list
      const f = await fetchFriends(userId);
      setFriends(f);
    } catch (e) {
      console.error('[SocialView] istek kabul edilemedi', e);
    }
  }, [userId]);

  const handleDecline = useCallback(async (requestId: string) => {
    try {
      await removeFriendship(requestId);
      setRequests(prev => prev.filter(r => r.id !== requestId));
    } catch (e) {
      console.error('[SocialView] istek reddedilemedi', e);
    }
  }, []);

  const handleToggleFav = useCallback(async (f: FriendshipRow) => {
    const newVal = !f.isFavorite;
    setFriends(prev => prev.map(x => x.id === f.id ? { ...x, isFavorite: newVal } : x));
    try {
      await toggleFriendFavorite(f.id, userId, f.sender_id, newVal);
    } catch (e) {
      // rollback
      setFriends(prev => prev.map(x => x.id === f.id ? { ...x, isFavorite: f.isFavorite } : x));
    }
  }, [userId]);

  const handleGroupChange = useCallback(async (f: FriendshipRow, group: string) => {
    const newGroup = group || null;
    setFriends(prev => prev.map(x => x.id === f.id ? { ...x, myGroup: newGroup } : x));
    try {
      await updateFriendGroup(f.id, userId, f.sender_id, newGroup);
    } catch (e) {
      setFriends(prev => prev.map(x => x.id === f.id ? { ...x, myGroup: f.myGroup } : x));
    }
  }, [userId]);

  const handleMessage = useCallback(async (f: FriendshipRow) => {
    if (messagingId) return;
    const friendId = f.other_user.id;
    setMessagingId(f.id);
    try {
      const conversationId = await getOrCreateConversation(friendId);
      setSelectedConversationId(conversationId);
      onNavigate('MESSAGES');
    } catch (e: any) {
      console.error('[SocialView] konuşma açılamadı', e?.message || e);
    } finally {
      setMessagingId(null);
    }
  }, [messagingId, onNavigate, setSelectedConversationId]);

  const handleTeamWizardComplete = useCallback(async (wizardData: any) => {
    setWizardLoading(true);
    try {
      const newTeam = await createTeam({
        name: wizardData.name,
        shortName: wizardData.shortName,
        color1Hex: wizardData.color1,
        color2Hex: wizardData.color2,
        crest: wizardData.crest,
        location: wizardData.location,
        formation: wizardData.formation,
        playStyle: wizardData.playStyle,
        value: wizardData.value,
        rosterIds: wizardData.players || [],
        communityId: null,
      });
      setCaptainTeams(prev => [...prev, newTeam]);
    } catch (e) {
      console.error('[SocialView] takım oluşturulamadı', e);
    } finally {
      setWizardLoading(false);
      setShowTeamWizard(false);
    }
  }, []);

  // Wizard için arkadaş listesini uygun formata çevir
  const wizardFriends = friends.map(f => ({
    id: f.other_user.id,
    name: f.other_user.full_name || 'Oyuncu',
    avatar: f.other_user.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${f.other_user.id}`,
    group: f.myGroup || 'Diğer',
    rating: f.other_user.player_card?.fp ?? 0,
  }));

  const totalTeams = captainTeams.length + memberTeams.length;
  const captainCount = captainTeams.length;

  return (
    <div className="min-h-screen bg-[#070B10] text-white flex flex-col font-sans">
      {/* ── Header ── */}
      <div className="pt-safe px-5 pb-0 flex-shrink-0">
        {/* Ambient glow */}
        <div
          className="absolute top-0 right-0 w-64 h-64 pointer-events-none opacity-10 blur-[80px]"
          style={{ background: 'radial-gradient(circle, #10B981 0%, transparent 70%)' }}
        />

        <div className="flex items-start justify-between pt-5 mb-1 relative z-10">
          <div>
            <h1 className="text-3xl font-black tracking-tight">Sosyal</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {totalTeams} takım · {captainCount} kaptanlık
            </p>
          </div>
          <button
            onClick={() => setShowTeamWizard(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-white/8 border border-white/15 rounded-2xl text-sm font-bold text-white hover:bg-white/12 transition-colors"
          >
            <Plus size={16} />
            Takım
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 mt-5 border-b border-white/8 relative z-10">
          {([
            { id: 'FRIENDS' as MainTab, label: 'Arkadaşlar', count: friends.length + requests.length },
            { id: 'TEAMS' as MainTab, label: 'Takımlar', count: totalTeams },
          ] as const).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative flex items-center gap-2 px-1 pb-3 mr-6 text-sm font-bold transition-colors ${
                tab === t.id ? 'text-white' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {t.label}
              {t.count > 0 && (
                <span className={`min-w-[20px] h-5 px-1.5 rounded-full flex items-center justify-center text-[10px] font-black ${
                  tab === t.id ? 'bg-emerald-500 text-white' : 'bg-white/10 text-gray-400'
                }`}>
                  {t.count}
                </span>
              )}
              {tab === t.id && (
                <motion.div
                  layoutId="tabUnderline"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-400 rounded-full"
                />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── TeamCreatorWizard Modal ── */}
      <AnimatePresence>
        {showTeamWizard && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50"
          >
            <TeamCreatorWizard
              friends={wizardFriends}
              onClose={() => setShowTeamWizard(false)}
              onComplete={handleTeamWizardComplete}
            />
            {wizardLoading && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10">
                <Loader2 size={32} className="text-[#39FF14] animate-spin" />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto px-5 pt-5">
        <AnimatePresence mode="wait">
          {tab === 'TEAMS' ? (
            <motion.div key="teams" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.18 }}>
              <TeamsTab
                captainTeams={captainTeams}
                memberTeams={memberTeams}
                loading={loadingTeams}
                onNavigate={onNavigate}
                onCreateTeam={() => setShowTeamWizard(true)}
              />
            </motion.div>
          ) : (
            <motion.div key="friends" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} transition={{ duration: 0.18 }}>
              <FriendsTab
                userId={userId}
                friends={friends}
                requests={requests}
                loading={loadingFriends}
                onAccept={handleAccept}
                onDecline={handleDecline}
                onToggleFav={handleToggleFav}
                onGroupChange={handleGroupChange}
                onNavigate={onNavigate}
                onMessage={handleMessage}
                messagingId={messagingId}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default SocialView;
