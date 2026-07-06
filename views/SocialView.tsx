import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Swords, Plus, Search, X, Check, Star, MessageCircle,
  ChevronRight, Zap, Shield, Crown, TrendingUp, UserPlus,
  Calendar, MapPin, Loader2
} from 'lucide-react';
import { AppView } from '../types';
import { auth } from '../supabaseAuth';
import { fetchUserTeams } from '../services/friendService';
import {
  getFriends, getFriendRequests, getFriendLists, subscribeSocialEvents,
  FriendRow, FriendRequestRow, FriendList,
} from '../services/socialService';
import { createTeam } from '../services/teamService';
import { getOrCreateConversation } from '../services/messageService';
import { useAppStore } from '../store';
import { TeamCreatorWizard } from '../components/TeamCreatorWizard';
import SegmentedTabs from '../components/ui/SegmentedTabs';
import EmptyState from '../components/ui/EmptyState';
import FriendsPanel from './social/FriendsPanel';

// ─── Types ──────────────────────────────────────────────────────────────────
interface SocialViewProps {
  onNavigate: (view: AppView) => void;
}

type MainTab = 'FRIENDS' | 'TEAMS';
type TeamsSubTab = 'ALL' | 'MINE' | 'CREATE';

// Oturum-içi sekme hafızası (Spec A3): görünüm değişse de hatırlanır,
// uygulama yeniden açılınca doğal olarak varsayılana (Takımlar→Takımlarım) döner.
let rememberedMainTab: MainTab = 'TEAMS';
let rememberedTeamsSubTab: TeamsSubTab = 'MINE';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const getInitials = (name: string | null) =>
  (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

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
// (Eski FriendsTab kaldırıldı — yerine views/social/FriendsPanel; Spec §11 ölüm listesi)

// ─── Main Component ───────────────────────────────────────────────────────────
const SocialView: React.FC<SocialViewProps> = ({ onNavigate }) => {
  const userId = auth.currentUser?.uid || '';

  const [tab, setTabState] = useState<MainTab>(rememberedMainTab);
  const [teamsSubTab, setTeamsSubTabState] = useState<TeamsSubTab>(rememberedTeamsSubTab);
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [requests, setRequests] = useState<FriendRequestRow[]>([]);
  const [friendLists, setFriendLists] = useState<FriendList[]>([]);
  const [captainTeams, setCaptainTeams] = useState<any[]>([]);
  const [memberTeams, setMemberTeams] = useState<any[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(true);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [showTeamWizard, setShowTeamWizard] = useState(false);
  const [wizardLoading, setWizardLoading] = useState(false);
  const [messagingId, setMessagingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const setSelectedConversationId = useAppStore(s => s.setSelectedConversationId);
  const socialTarget = useAppStore(s => s.socialTarget);
  const setSocialTarget = useAppStore(s => s.setSocialTarget);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  }, []);

  const setTab = useCallback((t: MainTab) => { rememberedMainTab = t; setTabState(t); }, []);
  const setTeamsSubTab = useCallback((t: TeamsSubTab) => { rememberedTeamsSubTab = t; setTeamsSubTabState(t); }, []);

  // Derin bağlantı / bildirim hedefi: doğru alt-sekmeye in, tüket (Spec §2.3)
  useEffect(() => {
    if (!socialTarget) return;
    setTab(socialTarget.tab);
    if (socialTarget.tab === 'TEAMS' && socialTarget.subTab
        && ['ALL', 'MINE', 'CREATE'].includes(socialTarget.subTab)) {
      setTeamsSubTab(socialTarget.subTab as TeamsSubTab);
    }
    setSocialTarget(null);
  }, [socialTarget, setTab, setTeamsSubTab, setSocialTarget]);

  // Arkadaş verisi — yeni RPC katmanı, tek atış (C4)
  const loadFriendData = useCallback(async (silent = false) => {
    if (!userId) { setLoadingFriends(false); return; }
    if (!silent) setLoadingFriends(true);
    try {
      const [f, r, l] = await Promise.all([
        getFriends(),
        getFriendRequests(),
        getFriendLists(),
      ]);
      setFriends(f);
      setRequests(r);
      setFriendLists(l);
    } catch (e) {
      console.error('[SocialView] arkadaşlar yüklenemedi', e);
    } finally {
      setLoadingFriends(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setLoadingFriends(false);
      setLoadingTeams(false);
      return;
    }

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

    loadFriendData();
    loadTeams();
  }, [userId, loadFriendData]);

  // Bildirim-güdümlü tazeleme (F36): friend_* olayı gelince sessizce yeniden çek
  useEffect(() => {
    if (!userId) return;
    const unsub = subscribeSocialEvents(userId, typeKey => {
      if (typeKey.startsWith('friend_')) void loadFriendData(true);
    });
    return unsub;
  }, [userId, loadFriendData]);

  const handleMessage = useCallback(async (friendId: string) => {
    if (messagingId) return;
    setMessagingId(friendId);
    try {
      const conversationId = await getOrCreateConversation(friendId);
      setSelectedConversationId(conversationId);
      onNavigate('MESSAGES');
    } catch (e: any) {
      console.error('[SocialView] konuşma açılamadı', e?.message || e);
      showToast('Konuşma açılamadı');
    } finally {
      setMessagingId(null);
    }
  }, [messagingId, onNavigate, setSelectedConversationId, showToast]);

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

  // Wizard için arkadaş listesini uygun formata çevir (yeni FriendRow şekli)
  const listNameById = new Map(friendLists.map(l => [l.id, l.name]));
  const wizardFriends = friends.map(f => ({
    id: f.friend_id,
    name: f.full_name || 'Oyuncu',
    avatar: f.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${f.friend_id}`,
    group: f.list_ids.length > 0 ? (listNameById.get(f.list_ids[0]) || 'Diğer') : 'Diğer',
    rating: f.fp ?? 0,
  }));

  const totalTeams = captainTeams.length + memberTeams.length;
  const captainCount = captainTeams.length;

  return (
    <div className="min-h-screen bg-[#0A0E14] text-white flex flex-col font-sans">
      {/* ── Header ── */}
      <div className="pt-safe px-5 pb-0 flex-shrink-0">
        {/* Ambient glow — marka neonuna hizalı (Spec A5) */}
        <div
          className="absolute top-0 right-0 w-64 h-64 pointer-events-none opacity-[0.07] blur-[80px]"
          style={{ background: 'radial-gradient(circle, #39FF14 0%, transparent 70%)' }}
        />

        <div className="flex items-start justify-between pt-5 mb-1 relative z-10">
          <div>
            <h1 className="text-3xl font-black tracking-tight">Sosyal</h1>
            {/* Sekme-başına bağlamsal özet (Spec G41) */}
            <p className="text-sm text-gray-500 mt-0.5">
              {tab === 'TEAMS'
                ? `${totalTeams} takım · ${captainCount} kaptanlık`
                : `${friends.length} arkadaş${requests.length > 0 ? ` · ${requests.length} istek` : ''}`}
            </p>
          </div>
        </div>

        {/* Üst seviye sekmeler — altı çizgili (Spec G38) */}
        <div className="flex gap-0 mt-5 border-b border-white/8 relative z-10">
          {([
            { id: 'FRIENDS' as MainTab, label: 'Arkadaşlar', count: friends.length + requests.length },
            { id: 'TEAMS' as MainTab, label: 'Takımlar', count: totalTeams },
          ] as const).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative flex items-center gap-2 px-1 pb-3 mr-6 min-h-[44px] text-sm font-bold transition-colors ${
                tab === t.id ? 'text-white' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {t.label}
              {t.count > 0 && (
                <span className={`min-w-[20px] h-5 px-1.5 rounded-full flex items-center justify-center text-[10px] font-black ${
                  tab === t.id ? 'bg-[#39FF14] text-[#0A0E14]' : 'bg-white/10 text-gray-400'
                }`}>
                  {t.count}
                </span>
              )}
              {tab === t.id && (
                <motion.div
                  layoutId="tabUnderline"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#39FF14] rounded-full"
                />
              )}
            </button>
          ))}
        </div>

        {/* Takımlar alt-sekmeleri — hap kontrol: Keşif · Evim · Üretim (Spec G38/39) */}
        {tab === 'TEAMS' && (
          <div className="relative z-10 mt-3">
            <SegmentedTabs
              layoutId="teamsSubTabs"
              activeId={teamsSubTab}
              onChange={id => setTeamsSubTab(id as TeamsSubTab)}
              items={[
                { id: 'ALL', label: 'Tüm Takımlar' },
                { id: 'MINE', label: 'Takımlarım' },
                { id: 'CREATE', label: 'Takım Oluştur', icon: <Plus size={13} /> },
              ]}
            />
          </div>
        )}
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
            <motion.div key={`teams-${teamsSubTab}`} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.18 }}>
              {teamsSubTab === 'MINE' && (
                <TeamsTab
                  captainTeams={captainTeams}
                  memberTeams={memberTeams}
                  loading={loadingTeams}
                  onNavigate={onNavigate}
                  onCreateTeam={() => setTeamsSubTab('CREATE')}
                />
              )}
              {teamsSubTab === 'ALL' && (
                /* Küme 2'de list_public_teams dizinine bağlanacak (Spec I50) */
                <EmptyState
                  icon={Search}
                  title="Takım Keşfi yakında"
                  description="Şehrindeki takımları burada keşfedecek ve katılma isteği gönderebileceksin."
                  actions={[{ label: 'Takımlarıma Dön', onClick: () => setTeamsSubTab('MINE') }]}
                />
              )}
              {teamsSubTab === 'CREATE' && (
                /* Küme 2'de J57 sihirbazı (arma üreteci dahil) buraya gömülecek;
                   geçiş süresince mevcut sihirbaz modal olarak açılır. */
                <EmptyState
                  icon={Shield}
                  title="Yeni takımını kur"
                  description="Adını, armanı ve renklerini seç; kurucu kadronu davet et."
                  actions={[
                    { label: 'Takım Kur', onClick: () => setShowTeamWizard(true), primary: true },
                    { label: 'Takımlarıma Dön', onClick: () => setTeamsSubTab('MINE') },
                  ]}
                />
              )}
            </motion.div>
          ) : (
            <motion.div key="friends" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} transition={{ duration: 0.18 }}>
              <FriendsPanel
                userId={userId}
                friends={friends}
                requests={requests}
                lists={friendLists}
                loading={loadingFriends}
                onRefresh={() => loadFriendData(true)}
                onNavigate={onNavigate}
                onMessage={handleMessage}
                messagingId={messagingId}
                onToast={showToast}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Mini toast */}
      {toast && (
        <div className="fixed bottom-24 inset-x-5 z-50 flex justify-center pointer-events-none">
          <div className="px-4 py-2.5 rounded-2xl bg-[#161B22] border border-white/10 text-sm font-semibold shadow-xl">
            {toast}
          </div>
        </div>
      )}
    </div>
  );
};

export default SocialView;
