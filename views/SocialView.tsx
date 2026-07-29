import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus } from 'lucide-react';
import { AppView } from '../types';
import { auth } from '../supabaseAuth';
import {
  getFriends, getFriendRequests, getFriendLists, subscribeSocialEvents,
  FriendRow, FriendRequestRow, FriendList,
} from '../services/socialService';
import {
  getMyTeams, getMyTeamInvites, MyTeamRow, TeamInviteRow,
} from '../services/teamSocialService';
import { getOrCreateConversation } from '../services/messageService';
import { useAppStore } from '../store';
import SegmentedTabs from '../components/ui/SegmentedTabs';
import FriendsPanel from './social/FriendsPanel';
import MyTeamsPanel from './social/MyTeamsPanel';
import TeamsDirectoryPanel from './social/TeamsDirectoryPanel';
import TeamCreatePanel, { hasTeamDraft } from './social/TeamCreatePanel';

// ================================================================
// SocialView — Sosyal kabuk (Foundation Spec §2-3)
// Üst seviye: Arkadaşlar | Takımlar (altı çizgili)
// Takımlar: Tüm Takımlar · Takımlarım (varsayılan) · Takım Oluştur (hap)
// Eski FriendsTab/TeamsTab/TeamCreatorWizard-modal ÖLDÜ (Spec §11).
// ================================================================

interface SocialViewProps {
  onNavigate: (view: AppView) => void;
}

type MainTab = 'FRIENDS' | 'TEAMS';
type TeamsSubTab = 'ALL' | 'MINE' | 'CREATE';

// Oturum-içi sekme hafızası (Spec A3): görünüm değişse de hatırlanır,
// uygulama yeniden açılınca doğal olarak varsayılana (Takımlar→Takımlarım) döner.
let rememberedMainTab: MainTab = 'TEAMS';
let rememberedTeamsSubTab: TeamsSubTab = 'MINE';

const SocialView: React.FC<SocialViewProps> = ({ onNavigate }) => {
  const userId = auth.currentUser?.uid || '';

  const [tab, setTabState] = useState<MainTab>(rememberedMainTab);
  const [teamsSubTab, setTeamsSubTabState] = useState<TeamsSubTab>(rememberedTeamsSubTab);

  // Arkadaşlar verisi
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [requests, setRequests] = useState<FriendRequestRow[]>([]);
  const [friendLists, setFriendLists] = useState<FriendList[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(true);
  const [messagingId, setMessagingId] = useState<string | null>(null);

  // Takımlar verisi (tek kaynak: get_my_teams — G40)
  const [myTeams, setMyTeams] = useState<MyTeamRow[]>([]);
  const [teamInvites, setTeamInvites] = useState<TeamInviteRow[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(true);

  const [toast, setToast] = useState<string | null>(null);

  const setSelectedConversationId = useAppStore(s => s.setSelectedConversationId);
  const setSelectedTeamId = useAppStore(s => s.setSelectedTeamId);
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

  // Arkadaş verisi — tek atış RPC katmanı (C4)
  const loadFriendData = useCallback(async (silent = false) => {
    if (!userId) { setLoadingFriends(false); return; }
    if (!silent) setLoadingFriends(true);
    try {
      const [f, r, l] = await Promise.all([
        getFriends(), getFriendRequests(), getFriendLists(),
      ]);
      setFriends(f); setRequests(r); setFriendLists(l);
    } catch (e) {
      console.error('[SocialView] arkadaşlar yüklenemedi', e);
    } finally {
      setLoadingFriends(false);
    }
  }, [userId]);

  // Takım verisi — tek atış (get_my_teams; N+1 ölür)
  const loadTeamData = useCallback(async (silent = false) => {
    if (!userId) { setLoadingTeams(false); return; }
    if (!silent) setLoadingTeams(true);
    try {
      const [t, inv] = await Promise.all([
        getMyTeams(), getMyTeamInvites(userId),
      ]);
      setMyTeams(t); setTeamInvites(inv);
    } catch (e) {
      console.error('[SocialView] takımlar yüklenemedi', e);
    } finally {
      setLoadingTeams(false);
    }
  }, [userId]);

  useEffect(() => {
    loadFriendData();
    loadTeamData();
  }, [loadFriendData, loadTeamData]);

  // Bildirim-güdümlü tazeleme (F36): tek kanal, iki alan
  useEffect(() => {
    if (!userId) return;
    const unsub = subscribeSocialEvents(userId, typeKey => {
      if (typeKey.startsWith('friend_')) void loadFriendData(true);
      if (typeKey.startsWith('team_')) void loadTeamData(true);
    });
    return unsub;
  }, [userId, loadFriendData, loadTeamData]);

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

  // Takım Detayı — kimlik AÇIKÇA taşınır (A4/G42; "ilk takım" varsayımı yasak)
  const openTeam = useCallback((teamId: string) => {
    setSelectedTeamId(teamId);
    onNavigate('MY_TEAM');
  }, [setSelectedTeamId, onNavigate]);

  const activeTeams = myTeams.filter(t => !t.is_archived);
  const totalTeams = activeTeams.length;
  const captainCount = activeTeams.filter(t => t.my_role === 'CAPTAIN').length;

  return (
    <div className="min-h-screen bg-[#0A0E14] text-white flex flex-col font-sans">
      {/* ── Header ── */}
      <div className="pt-safe px-5 pb-0 flex-shrink-0">
        <div
          className="absolute top-0 right-0 w-64 h-64 pointer-events-none opacity-[0.07] blur-[80px]"
          style={{ background: 'radial-gradient(circle, #39FF14 0%, transparent 70%)' }}
        />

        <div className="flex items-start justify-between pt-5 mb-1 relative z-10">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Sosyal</h1>
            {/* Sekme-başına bağlamsal özet (G41) */}
            <p className="text-sm text-gray-500 mt-0.5">
              {tab === 'TEAMS'
                ? `${totalTeams} takım · ${captainCount} kaptanlık`
                : `${friends.length} arkadaş${requests.length > 0 ? ` · ${requests.length} istek` : ''}`}
            </p>
          </div>
        </div>

        {/* Üst seviye sekmeler — altı çizgili (G38) */}
        <div className="flex gap-0 mt-5 border-b border-white/8 relative z-10">
          {([
            { id: 'FRIENDS' as MainTab, label: 'Arkadaşlar', count: friends.length + requests.length },
            { id: 'TEAMS' as MainTab, label: 'Takımlar', count: totalTeams + teamInvites.length },
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
                <span className={`min-w-[20px] h-5 px-1.5 rounded-full flex items-center justify-center text-[10px] font-extrabold ${
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

        {/* Takımlar alt-sekmeleri — hap kontrol: Keşif · Evim · Üretim (G38/39) */}
        {tab === 'TEAMS' && (
          <div className="relative z-10 mt-3">
            <SegmentedTabs
              layoutId="teamsSubTabs"
              activeId={teamsSubTab}
              onChange={id => setTeamsSubTab(id as TeamsSubTab)}
              items={[
                { id: 'ALL', label: 'Tüm Takımlar' },
                { id: 'MINE', label: 'Takımlarım' },
                { id: 'CREATE', label: 'Takım Oluştur', icon: <Plus size={13} />, badge: hasTeamDraft() },
              ]}
            />
          </div>
        )}
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto px-5 pt-5">
        <AnimatePresence mode="wait">
          {tab === 'TEAMS' ? (
            <motion.div
              key={`teams-${teamsSubTab}`}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.18 }}
            >
              {teamsSubTab === 'MINE' && (
                <MyTeamsPanel
                  teams={myTeams}
                  invites={teamInvites}
                  loading={loadingTeams}
                  onRefresh={() => loadTeamData(true)}
                  onOpenTeam={openTeam}
                  onCreate={() => setTeamsSubTab('CREATE')}
                  onExplore={() => setTeamsSubTab('ALL')}
                  onToast={showToast}
                />
              )}
              {teamsSubTab === 'ALL' && (
                <TeamsDirectoryPanel onOpenTeam={openTeam} onToast={showToast} />
              )}
              {teamsSubTab === 'CREATE' && (
                <TeamCreatePanel
                  friends={friends}
                  onToast={showToast}
                  onCreated={teamId => {
                    void loadTeamData(true);
                    openTeam(teamId);
                  }}
                />
              )}
            </motion.div>
          ) : (
            <motion.div
              key="friends"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.18 }}
            >
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
