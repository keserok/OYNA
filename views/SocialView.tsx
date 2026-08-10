import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, ArrowLeft } from 'lucide-react';
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
import { useAsagiCekYenile } from '../hooks/useAsagiCekYenile';
import { YenileniyorSeridi } from '../components/common/YenileniyorSeridi';
import SegmentedTabs from '../components/ui/SegmentedTabs';
import FriendsPanel from './social/FriendsPanel';
import MyTeamsPanel from './social/MyTeamsPanel';
import TeamsDirectoryPanel from './social/TeamsDirectoryPanel';
import TeamCreatePanel, { hasTeamDraft } from './social/TeamCreatePanel';
import { mapError } from '../utils/errorMap';
import { ErrorState } from '../components/common/StatusState';

// ================================================================
// SocialView — Sosyal kabuk (Foundation Spec §2-3)
// Üst seviye: Arkadaşlar | Takımlar (altı çizgili)
// Takımlar: Tüm Takımlar · Takımlarım (varsayılan) · Takım Oluştur (hap)
// Eski FriendsTab/TeamsTab/TeamCreatorWizard-modal ÖLDÜ (Spec §11).
// ================================================================

interface SocialViewProps {
  /** IP-14: Sosyal artık bir sekme KÖKÜ değil — Profil'den açılıyor, dolayısıyla
   *  kapanış yolu olmalı. Alt menü bu ekranda çizilmez. */
  onBack: () => void;
  onNavigate: (view: AppView) => void;
}

type MainTab = 'FRIENDS' | 'TEAMS';
type TeamsSubTab = 'ALL' | 'MINE' | 'CREATE';

// Oturum-içi sekme hafızası (Spec A3): görünüm değişse de hatırlanır,
// uygulama yeniden açılınca doğal olarak varsayılana (Takımlar→Takımlarım) döner.
let rememberedMainTab: MainTab = 'TEAMS';
let rememberedTeamsSubTab: TeamsSubTab = 'MINE';

const SocialView: React.FC<SocialViewProps> = ({ onBack, onNavigate }) => {
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
  const [friendsError, setFriendsError] = useState<string | null>(null);
  const [teamsError, setTeamsError] = useState<string | null>(null);

  const loadFriendData = useCallback(async (silent = false) => {
    if (!userId) { setLoadingFriends(false); return; }
    if (!silent) setLoadingFriends(true);
    try {
      const [f, r, l] = await Promise.all([
        getFriends(), getFriendRequests(), getFriendLists(),
      ]);
      setFriends(f); setRequests(r); setFriendLists(l);
      setFriendsError(null);
    } catch (e) {
      console.error('[SocialView] arkadaşlar yüklenemedi', e);
      // Sessiz hata = yalan boş durum. Kullanıcı "arkadaşın yok" sanıyordu.
      setFriendsError(mapError(e, 'Arkadaş listen yüklenemedi.'));
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
      setTeamsError(null);
    } catch (e) {
      console.error('[SocialView] takımlar yüklenemedi', e);
      setTeamsError(mapError(e, 'Takımların yüklenemedi.'));
    } finally {
      setLoadingTeams(false);
    }
  }, [userId]);

  // AŞAĞI ÇEKİP YENİLE — arkadaşlar VE takımlar birlikte tazelenir; kullanıcı
  // hangi sekmede olursa olsun jest aynı işi yapsın (iki ayrı davranış
  // "bazen yeniliyor" hissi verirdi).
  const cekerekYenileniyor = useAsagiCekYenile(
    () => Promise.all([loadFriendData(true), loadTeamData(true)]),
  );

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
    }, () => {
      // Kopukluk telafisi: soket düşerken gelen arkadaşlık/takım olayları bir
      // daha yayınlanmaz. Hangi olayın kaçtığını bilemediğimiz için iki alanı
      // da sessizce (silent=true) tazeleriz.
      void loadFriendData(true);
      void loadTeamData(true);
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
    <div className="h-full bg-[#0A0E14] text-white flex flex-col font-sans">
      {/* ── Header ── */}
      <div className="pt-safe px-5 pb-0 flex-shrink-0">
        <div
          className="absolute top-0 right-0 w-64 h-64 pointer-events-none opacity-[0.07] blur-[80px]"
          style={{ background: 'radial-gradient(circle, #39FF14 0%, transparent 70%)' }}
        />

        <div className="flex items-start gap-3 pt-5 mb-1 relative z-10">
          <button
            onClick={onBack}
            aria-label="Geri"
            className="w-11 h-11 shrink-0 -ml-1 flex items-center justify-center bg-white/5 rounded-full border border-white/10 text-white hover:bg-white/10 active:scale-95 transition-all"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Sosyal</h1>
            {/* Sekme-başına bağlamsal özet (G41) */}
            <p className="text-sm text-ink-4 mt-0.5">
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
                tab === t.id ? 'text-white' : 'text-ink-4 hover:text-gray-300'
              }`}
            >
              {t.label}
              {t.count > 0 && (
                <span className={`min-w-[20px] h-5 px-1.5 rounded-full flex items-center justify-center text-[0.6875rem] font-extrabold ${
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

      <YenileniyorSeridi aktif={cekerekYenileniyor} />

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
              {teamsSubTab === 'MINE' && teamsError && !loadingTeams && (
                <ErrorState
                  title="Takımların Yüklenemedi"
                  message={teamsError}
                  onRetry={() => loadTeamData()}
                />
              )}
              {teamsSubTab === 'MINE' && !teamsError && (
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
              {friendsError && !loadingFriends ? (
                <ErrorState
                  title="Arkadaş Listen Yüklenemedi"
                  message={friendsError}
                  onRetry={() => loadFriendData()}
                />
              ) : (
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
              )}
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
