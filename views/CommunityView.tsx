import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useScroll, useTransform, Reorder } from 'framer-motion';
import { 
  Users, Trophy, ShieldCheck, Mail, Lock, ChevronRight, ArrowLeft,
  ArrowRightLeft, Star, Swords, LayoutDashboard, Sparkles, Activity,
  Calendar, Flame, Medal, Zap, Radio, Crown, Target, TrendingUp, Check, X,
  UserPlus, PlusCircle, Search, Hash, Link, Send, Copy, CheckCircle2, Network
} from 'lucide-react';
import { ICommunity, ITeam, IUser, AppView } from '../types';
import { TeamCreatorWizard } from '../components/TeamCreatorWizard';
import { CommunityHub } from '../components/CommunityHub';
import { TeamDashboard } from '../components/TeamDashboard';
import { CommunityApplicationWizard } from '../components/CommunityApplicationWizard';
import { useAppStore } from '../store';
import { auth } from '../supabaseAuth';
import {
  fetchMyCommunities, fetchDiscoverCommunities,
  joinCommunity, joinCommunityByInviteCode,
} from '../services/communityService';

interface CommunityViewProps {
  onBack: () => void;
  onNavigate: (view: AppView) => void;
}

// ─── Rich Data ────────────────────────────────────────────────────────────────
const MOCK_TEAMS = [
  { id: 't1', name: 'Boğaziçi FC',    initials: 'BFC', color: '#10B981', bg: 'from-emerald-500 to-emerald-700', wins: 14, losses: 3,  draws: 1, fp: 96 },
  { id: 't2', name: 'Güney SK',       initials: 'GSK', color: '#3B82F6', bg: 'from-blue-500 to-blue-700',     wins: 10, losses: 6,  draws: 2, fp: 88 },
  { id: 't3', name: 'Hisar SK',       initials: 'HSK', color: '#EF4444', bg: 'from-rose-500 to-rose-700',     wins:  8, losses: 8,  draws: 2, fp: 82 },
  { id: 't4', name: 'Kuzey SK',       initials: 'KSK', color: '#F59E0B', bg: 'from-amber-500 to-amber-700',   wins:  5, losses: 11, draws: 2, fp: 79 },
];

const MOCK_PLAYERS = [
  { id: 'u1', name: 'Ahmet Yılmaz', initials: 'AY', pos: 'FV', fp: 98, goals: 18, assists:  9, color: 'from-emerald-700 via-emerald-800 to-[#0A0E14]', online: true,  team: 'Boğaziçi FC' },
  { id: 'u2', name: 'Caner Kaya',   initials: 'CK', pos: 'OS', fp: 91, goals: 12, assists: 14, color: 'from-blue-700 via-blue-800 to-[#0A0E14]',       online: true,  team: 'Güney SK' },
  { id: 'u3', name: 'Emre Demir',   initials: 'ED', pos: 'STP',fp: 87, goals:  3, assists:  6, color: 'from-rose-700 via-rose-800 to-[#0A0E14]',       online: false, team: 'Hisar SK' },
  { id: 'u4', name: 'Burak Şahin',  initials: 'BŞ', pos: 'KL', fp: 85, goals:  0, assists:  1, color: 'from-amber-700 via-amber-800 to-[#0A0E14]',     online: true,  team: 'Kuzey SK' },
  { id: 'u5', name: 'Mert Arslan',  initials: 'MA', pos: 'OS', fp: 80, goals:  7, assists:  7, color: 'from-purple-700 via-purple-800 to-[#0A0E14]',   online: false, team: 'Hisar SK' },
  { id: 'u6', name: 'Kerem Ün',     initials: 'KÜ', pos: 'FV', fp: 77, goals:  9, assists:  4, color: 'from-cyan-700 via-cyan-800 to-[#0A0E14]',       online: true,  team: 'Güney SK' },
];

const STORIES: { id: string; label: string; bg: string; icon: string; badge: string; view: AppView }[] = [
  { id: 'potw', label: 'HAFTANIN', bg: 'from-amber-500 to-orange-600',  icon: '⚽', badge: 'Ahmet Y.', view: 'LEADERBOARDS' },
  { id: 'live', label: 'CANLI',    bg: 'from-red-500 to-rose-600',       icon: '🔴', badge: '2 Maç',   view: 'MATCH_DISCOVERY' },
  { id: 'trn',  label: 'TURNUVA', bg: 'from-purple-500 to-indigo-600',  icon: '🏆', badge: 'Finaller', view: 'TOURNAMENT_BRACKET' },
  { id: 'trf',  label: 'TRANSFER',bg: 'from-blue-500 to-cyan-600',      icon: '🔄', badge: '3 Yeni',  view: 'TRANSFER_CENTER' },
  { id: 'top',  label: 'PUAN STA',bg: 'from-emerald-500 to-teal-600',   icon: '📊', badge: 'Canlı',   view: 'LEADERBOARDS' },
];

const MATCHES = [
  { id: 1, h: 'Boğaziçi FC', hc: '#10B981', hg: 4, a: 'Güney SK',   ac: '#3B82F6', ag: 1, date: '1 saat önce', live: false },
  { id: 2, h: 'Hisar SK',    hc: '#EF4444', hg: 2, a: 'Kuzey SK',   ac: '#F59E0B', ag: 2, date: '4 saat önce', live: false },
  { id: 3, h: 'Boğaziçi FC', hc: '#10B981', hg: 1, a: 'Hisar SK',   ac: '#EF4444', ag: 0, date: 'Bugün 19:00', live: true  },
];

const POS_STYLE: Record<string, string> = {
  FV: 'bg-red-500/20 text-red-300 border-red-500/30',
  OS: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  STP: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  KL: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
};

const LIVE_TICKER = [
  'Ahmet Yılmaz yeni maç başlattı · 2 dk',
  'Burak Şahin kadroya katıldı · 8 dk',
  'Kerem Ün oyuncu ilanı yayınladı · 15 dk',
  'Caner Kaya 12. golünü attı · 22 dk',
  'Boğaziçi FC turnuva maçına çıkıyor · 30 dk',
];

// ─── Animated Number ─────────────────────────────────────────────────────────
const AnimNum: React.FC<{ to: number; suffix?: string }> = ({ to, suffix = '' }) => {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let start = 0;
    const step = Math.ceil(to / 30);
    const t = setInterval(() => { start = Math.min(start + step, to); setVal(start); if (start >= to) clearInterval(t); }, 40);
    return () => clearInterval(t);
  }, [to]);
  return <>{val}{suffix}</>;
};

// ─── Main Component ───────────────────────────────────────────────────────────
const CommunityView: React.FC<CommunityViewProps> = ({ onBack, onNavigate }) => {
  const uid = auth.currentUser?.uid || 'u1';
  const [mainTab, setMainTab] = useState<'COMMUNITIES' | 'TEAMS' | 'FRIENDS'>('COMMUNITIES');
  const [selectedCommunityId, setSelectedCommunityId] = useState<string | null>(null);
  const [showAppWizard, setShowAppWizard] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<any | null>(null);
  const [selectedFriendModal, setSelectedFriendModal] = useState<any | null>(null);
  const {
    myTeams, addMyTeam, setActiveStudioTeam, friends: storeFriends,
    adminMatches, adminTeams, setSelectedMatch
  } = useAppStore();

  // ── Gerçek topluluk verisi ─────────────────────────────────────────────
  const [myCommunities, setMyCommunities] = useState<ICommunity[]>([]);
  const [discoverCommunities, setDiscoverCommunities] = useState<ICommunity[]>([]);
  const [communitiesLoading, setCommunitiesLoading] = useState(true);

  const refreshCommunities = async () => {
    setCommunitiesLoading(true);
    const [mine, discover] = await Promise.all([
      fetchMyCommunities(uid),
      fetchDiscoverCommunities(uid),
    ]);
    setMyCommunities(mine);
    setDiscoverCommunities(discover);
    setCommunitiesLoading(false);
  };

  useEffect(() => {
    refreshCommunities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleJoinHub = async (communityId: string) => {
    await joinCommunity(communityId, uid);
    await refreshCommunities();
  };

  const handleJoinByCode = async (code: string): Promise<ICommunity> => {
    const community = await joinCommunityByInviteCode(code, uid);
    await refreshCommunities();
    return community;
  };

  const selectedCommunity = [...myCommunities, ...discoverCommunities].find(c => c.id === selectedCommunityId) || null;
  const isMember = myCommunities.some(c => c.id === selectedCommunityId);
  const isOwner = !!selectedCommunity && selectedCommunity.ownerId === uid;

  // Topluluğa bağlı maçlar: maç kaydındaki communityId, seçili topluluğun gerçek ID'si ile eşleşmeli.
  const communityMatches = adminMatches.filter(m => !!selectedCommunityId && m.communityId === selectedCommunityId);

  const [activeTab, setActiveTab] = useState<'TEAMS' | 'PLAYERS'>('TEAMS');
  
  // Friends State
  const [friends, setFriends] = useState(storeFriends);
  const [groups, setGroups] = useState(['Favorilerim', 'Lise Tayfası', 'Üniversite', 'İş Arkadaşları', 'Tümü']);
  const [selectedGroup, setSelectedGroup] = useState('Tümü');
  const [expandedFriend, setExpandedFriend] = useState<string | null>(null);
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  const displayedFriends = friends.filter(f => {
      if (selectedGroup === 'Tümü') return true;
      if (selectedGroup === 'Favorilerim') return f.isFavorite;
      return f.group === selectedGroup;
  });

  const handleReorderFriends = (newOrder: any[]) => {
      const newFriends = [...friends];
      const indices = displayedFriends.map(f => friends.findIndex(x => x.id === f.id)).sort((a,b)=>a-b);
      newOrder.forEach((item, i) => {
          newFriends[indices[i]] = item;
      });
      setFriends(newFriends);
  };

  const toggleFavorite = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      setFriends(friends.map(f => f.id === id ? { ...f, isFavorite: !f.isFavorite } : f));
  };
  
  const changeGroup = (e: React.MouseEvent, id: string, newGroup: string) => {
      e.stopPropagation();
      setFriends(friends.map(f => f.id === id ? { ...f, group: newGroup } : f));
  };
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [showCreateTeam, setShowCreateTeam] = useState(false);

  const [codeInput, setCodeInput] = useState('');
  const [codeCopied, setCodeCopied] = useState(false);
  const [codeAccepted, setCodeAccepted] = useState(false);
  const myCode = 'OYNA88';
  
  const handleShareLink = () => {
      console.log('Shared link');
  };
  const copyCode = () => {
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
  };
  const handleCodeSubmit = () => {
      setCodeAccepted(true);
      setTimeout(() => {
          setCodeAccepted(false);
          setCodeInput('');
          setShowAddFriend(false);
      }, 1500);
  };

  const [ticker, setTicker] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setInterval(() => setTicker(i => (i + 1) % LIVE_TICKER.length), 3800);
    return () => clearInterval(t);
  }, []);

  const onlineCount = MOCK_PLAYERS.filter(p => p.online).length;
  const maxWins = Math.max(...MOCK_TEAMS.map(t => t.wins + t.losses + t.draws));

  return (
    <div className="min-h-screen bg-[#070B10] text-white flex flex-col font-sans overflow-hidden">

      {/* ══ HERO HEADER ════════════════════════════════════════════════════ */}
      <div className="relative pt-safe pb-5 px-5 overflow-hidden flex-shrink-0">
        {/* Animated mesh gradient background */}
        <motion.div
          animate={{ scale: [1, 1.1, 1], opacity: [0.15, 0.25, 0.15] }}
          transition={{ duration: 8, repeat: Infinity }}
          className="absolute -top-20 -right-20 w-80 h-80 rounded-full blur-[80px] pointer-events-none"
          style={{ background: 'radial-gradient(circle, #10B981 0%, transparent 70%)' }}
        />
        <motion.div
          animate={{ scale: [1, 1.15, 1], opacity: [0.1, 0.18, 0.1] }}
          transition={{ duration: 10, repeat: Infinity, delay: 2 }}
          className="absolute -bottom-10 -left-16 w-60 h-60 rounded-full blur-[60px] pointer-events-none"
          style={{ background: 'radial-gradient(circle, #6366F1 0%, transparent 70%)' }}
        />

        {/* Nav row */}
        <div className="flex items-center justify-between mb-5 relative z-10">
          <button onClick={onBack} className="flex items-center gap-2 text-emerald-400 hover:text-emerald-300 transition-colors">
            <ArrowLeft size={18} /> <span className="text-xs font-bold">Geri</span>
          </button>
          <div className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center gap-1.5">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
            </span>
            <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">{onlineCount} Çevrimiçi</span>
          </div>
        </div>

        {/* Main Tabs */}
        <div className="flex bg-black/40 backdrop-blur-md rounded-2xl p-1 border border-white/10 mb-6 relative z-10">
            {[
              { id: 'COMMUNITIES', label: 'Topluluklarım', icon: ShieldCheck },
              { id: 'TEAMS', label: 'Takımlarım', icon: Swords },
              { id: 'FRIENDS', label: 'Arkadaşlarım', icon: Users }
            ].map(tab => {
              const Icon = tab.icon;
              return (
                <button 
                  key={tab.id}
                  onClick={() => setMainTab(tab.id as any)}
                  className={`flex-1 py-2.5 flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all relative ${mainTab === tab.id ? 'text-emerald-300' : 'text-gray-500 hover:text-gray-300'}`}
                >
                  {mainTab === tab.id && (
                    <motion.div layoutId="mainNav" className="absolute inset-0 bg-white/10 border border-white/5 rounded-xl" />
                  )}
                  <Icon size={14} className="relative z-10" />
                  <span className="relative z-10">{tab.label}</span>
                </button>
              );
            })}
        </div>

        
        <AnimatePresence>
            {showAppWizard && <CommunityApplicationWizard onClose={() => setShowAppWizard(false)} />}
        </AnimatePresence>
        {mainTab === 'COMMUNITIES' && !selectedCommunityId && (
            <CommunityHub
              myHubs={myCommunities}
              discoverHubs={discoverCommunities}
              isLoading={communitiesLoading}
              onSelect={(id) => setSelectedCommunityId(id)}
              onNewNetwork={() => setShowAppWizard(true)}
              onJoin={handleJoinHub}
              onJoinByCode={handleJoinByCode}
            />
        )}

        {mainTab === 'COMMUNITIES' && selectedCommunityId && (
          <motion.div initial={{opacity:0, y:10}} animate={{opacity:1, y:0}}>
            <button onClick={() => setSelectedCommunityId(null)} className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-4 border border-white/10 px-3 py-1.5 rounded-xl bg-white/5 w-max">
                 <ArrowLeft size={14} /> <span className="text-[10px] font-black uppercase tracking-widest">Ağlara Dön</span>
            </button>
            {/* Dynamic Community Identity */}
            <div className="flex items-center gap-4 mb-5 relative z-10">
              <motion.div
                animate={{ boxShadow: selectedCommunityId === 'c1' ? ['0 0 25px rgba(16,185,129,0.2)', '0 0 50px rgba(16,185,129,0.5)', '0 0 25px rgba(16,185,129,0.2)'] : ['0 0 25px rgba(59,130,246,0.2)', '0 0 50px rgba(59,130,246,0.5)', '0 0 25px rgba(59,130,246,0.2)'] }}
                transition={{ duration: 3.5, repeat: Infinity }}
                className={`w-[72px] h-[72px] rounded-2xl flex items-center justify-center border shadow-2xl flex-shrink-0 ${selectedCommunityId === 'c1' ? 'bg-gradient-to-br from-emerald-400 to-emerald-700 border-emerald-400/30' : selectedCommunityId === 'c2' ? 'bg-gradient-to-br from-orange-400 to-orange-700 border-orange-400/30' : 'bg-gradient-to-br from-blue-400 to-blue-700 border-blue-400/30'}`}
              >
                <Network size={34} className="text-white drop-shadow-lg" />
              </motion.div>

              <div className="flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <h1 className="text-[22px] font-black tracking-tighter italic leading-none">{selectedCommunity?.name || 'Topluluk'}</h1>
                  {selectedCommunity?.isVerified && (
                    <ShieldCheck size={16} className="text-emerald-400 flex-shrink-0" />
                  )}
                </div>
                <p className="text-emerald-400/60 text-[10px] font-bold tracking-wide">{selectedCommunity?.domain || selectedCommunity?.type || ''}</p>
              </div>
            </div>

            {/* Stat pills */}
            <div className="flex gap-2.5 mb-5 relative z-10">
          {[
            { label: 'Üye', val: selectedCommunity?.memberCount ?? 0, Icon: Users, color: 'text-emerald-400', border: 'border-emerald-500/20', bg: 'bg-emerald-500/5' },
            { label: 'Aktif Maç', val: communityMatches.length, Icon: Swords, color: 'text-rose-400', border: 'border-rose-500/20', bg: 'bg-rose-500/5' },
            { label: 'FP Ort.', val: '—', Icon: ShieldCheck, color: 'text-blue-400', border: 'border-blue-500/20', bg: 'bg-blue-500/5' },
          ].map(({ label, val, Icon, color, border, bg }) => (
            <div key={label} className={`flex-1 ${bg} border ${border} rounded-2xl py-2.5 px-2 text-center`}>
              <Icon size={13} className={`${color} mx-auto mb-1`} />
              <p className={`text-sm font-black ${color}`}>
                {typeof val === 'number' ? <AnimNum to={val as number} /> : val}
              </p>
              <p className="text-[8px] text-gray-600 font-bold uppercase tracking-wider">{label}</p>
            </div>
          ))}
        </div>

        {/* Live ticker */}
        <div className="flex items-center gap-3 bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-2.5 relative z-10 overflow-hidden">
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Radio size={11} className="text-red-400 animate-pulse" />
            <span className="text-[9px] font-black text-red-400 uppercase tracking-widest">CANLI</span>
          </div>
          <div className="flex-1 h-4 overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.p key={ticker}
                initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -14, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="text-[11px] text-gray-400 font-semibold whitespace-nowrap"
              >
                <span className="text-white font-black">{LIVE_TICKER[ticker].split(' ').slice(0, 2).join(' ')}</span>
                {' '}{LIVE_TICKER[ticker].split(' ').slice(2).join(' ')}
              </motion.p>
            </AnimatePresence>
          </div>
        </div>
          </motion.div>
        )}
      </div>

      {/* ══ SCROLLABLE BODY ════════════════════════════════════════════════ */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto pb-28">

        {mainTab === 'COMMUNITIES' && selectedCommunityId && (
          <motion.div initial={{opacity:0, x:-20}} animate={{opacity:1, x:0}}>
            {!isMember && (
          <div className="absolute inset-0 z-30 backdrop-blur-xl bg-black/70 flex flex-col items-center justify-center p-6">
            <motion.div animate={{ rotate: [0, -5, 5, 0] }} transition={{ duration: 3, repeat: Infinity }}
              className="w-20 h-20 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-6">
              <Lock size={30} className="text-slate-400" />
            </motion.div>
            <h2 className="text-xl font-black mb-2 text-center">Bu Topluluk Gizli</h2>
            <p className="text-slate-400 text-center mb-8 max-w-xs text-sm leading-relaxed">
              {selectedCommunity?.domain
                ? <>İçerikleri görmek için <b className="text-white">{selectedCommunity.domain}</b> uzantılı e-posta ile doğrulamalısın.</>
                : <>İçerikleri görmek için bu topluluğa katılmalısın.</>}
            </p>
            <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              className="w-full max-w-xs bg-gradient-to-r from-emerald-500 to-teal-500 text-black font-black py-4 rounded-2xl flex items-center justify-center gap-2 shadow-[0_0_30px_rgba(16,185,129,0.3)]">
              <Mail size={18} /> E-posta Doğrula
            </motion.button>
          </div>
        )}

        <div className={`space-y-5 px-4 pt-4 ${!isMember ? 'pointer-events-none select-none blur-sm' : ''}`}>


          {/* ── Match Results & Upcoming ────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Swords size={13} className="text-rose-400" />
                <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Maçlar</h3>
              </div>
            </div>
            <div className="space-y-2.5">
              {communityMatches.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-6 bg-white/[0.01] border border-white/5 rounded-2xl">
                  <Swords size={24} className="text-gray-600 mb-2" />
                  <span className="text-xs font-black text-gray-500 uppercase tracking-wider text-center">Aktif Topluluk Maçı Bulunmuyor</span>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => onNavigate('MATCH_CREATE')}
                    className="mt-3 px-4 py-2 bg-[#FFFF00] text-black font-black text-[10px] uppercase tracking-widest rounded-xl hover:shadow-[0_0_15px_rgba(255,255,0,0.3)] transition-all"
                  >
                    İlk Maçı Oluştur ⚽
                  </motion.button>
                </div>
              ) : (
                communityMatches.map((m, i) => {
                  const slotsFilled = m.slots ? m.slots.filter(s => s.status === 'TAKEN').length : 5;
                  const totalSlots = m.slots ? m.slots.length : 14;
                  const isLive = m.date?.toLowerCase().includes('bugün') && m.time === '19:00';
                  
                  return (
                    <motion.div key={m.id}
                      initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.07 }}
                      whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}
                      onClick={() => {
                        setSelectedMatch(m);
                        onNavigate('MATCH_JOIN');
                      }}
                      className={`relative overflow-hidden rounded-2xl border p-3.5 flex items-center gap-3 cursor-pointer transition-colors ${isLive ? 'border-red-500/30 bg-red-500/5 hover:bg-red-500/10' : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.05]'}`}
                    >
                      {isLive && (
                        <div className="absolute top-2 right-2 flex items-center gap-1">
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
                          </span>
                          <span className="text-[8px] font-black text-red-400">CANLI</span>
                        </div>
                      )}
                      <div className="flex-1 flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 flex items-center justify-center font-black text-xs text-emerald-400 shadow-lg border border-emerald-500/10">
                          {m.location?.charAt(0) || 'M'}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[11px] font-black text-white truncate" style={{ maxWidth: 140 }}>{m.title || 'Halı Saha Maçı'}</span>
                          <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider">{m.location || 'Beşiktaş'}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <span className="text-[9px] text-gray-400 font-bold block uppercase">{m.date} {m.time}</span>
                          <span className="text-[10px] text-emerald-400 font-black block">{slotsFilled}/{totalSlots} OYUNCU</span>
                        </div>
                        <ChevronRight size={16} className="text-gray-600" />
                      </div>
                    </motion.div>
                  );
                })
              )}
            </div>
          </section>

          {/* ── Community Feature Buttons ───────────────────────────── */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={13} className="text-emerald-400" />
              <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Özellikler</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Transfer', sub: 'Merkezi', Icon: ArrowRightLeft, view: 'TRANSFER_CENTER' as AppView, g: 'from-purple-600/25 to-[#0D1117]', border: 'border-purple-500/20', ic: 'bg-purple-500/15 text-purple-400' },
                { label: 'Liderlik', sub: 'Tablosu', Icon: Trophy, view: 'LEADERBOARDS' as AppView, g: 'from-amber-600/25 to-[#0D1117]', border: 'border-amber-500/20', ic: 'bg-amber-500/15 text-amber-400' },
                { label: 'Maç Sonu', sub: 'Değerlendirme', Icon: Star, view: 'POST_MATCH_EVAL' as AppView, g: 'from-rose-600/25 to-[#0D1117]', border: 'border-rose-500/20', ic: 'bg-rose-500/15 text-rose-400' },
                { label: 'Turnuva', sub: 'Eşleşmeleri', Icon: Swords, view: 'TOURNAMENT_BRACKET' as AppView, g: 'from-indigo-600/25 to-[#0D1117]', border: 'border-indigo-500/20', ic: 'bg-indigo-500/15 text-indigo-400' },
              ].map(({ label, sub, Icon, view, g, border, ic }) => (
                <motion.button key={label}
                  whileHover={{ scale: 1.04, y: -2 }} whileTap={{ scale: 0.96 }}
                  onClick={() => onNavigate(view)}
                  className={`relative overflow-hidden bg-gradient-to-br ${g} border ${border} rounded-2xl p-4 flex flex-col items-start gap-3 group`}
                >
                  <div className={`w-10 h-10 rounded-xl ${ic} flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg`}>
                    <Icon size={20} />
                  </div>
                  <div>
                    <span className="font-black text-xs uppercase tracking-tight block text-white">{label}</span>
                    <span className="text-[9px] text-gray-600 font-bold uppercase mt-0.5 block">{sub}</span>
                  </div>
                  <Icon size={60} className="absolute -right-3 -bottom-3 opacity-[0.04] group-hover:opacity-[0.08] -rotate-12 group-hover:rotate-3 transition-all duration-500 text-white" />
                </motion.button>
              ))}

              {isOwner && (
              <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}
                onClick={() => onNavigate('COMMUNITY_ADMIN_DASHBOARD')}
                className="col-span-2 bg-white/[0.02] border border-white/5 rounded-2xl p-4 flex items-center justify-between hover:bg-white/[0.05] transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-slate-400 shadow">
                    <LayoutDashboard size={19} />
                  </div>
                  <div>
                    <span className="font-black text-xs uppercase tracking-tight text-white block">Yönetici Paneli</span>
                    <span className="text-[9px] text-gray-600 font-bold uppercase">Topluluk Ayarları & İstatistikler</span>
                  </div>
                </div>
                <ChevronRight size={17} className="text-slate-600 group-hover:translate-x-1 transition-transform" />
              </motion.button>
              )}
            </div>
          </section>

          {/* ── LEAGUE TABLE + PLAYERS Tabs ─────────────────────────── */}
          <section>
            <div className="flex mb-4 bg-white/[0.03] rounded-2xl p-1 border border-white/5">
              {(['TEAMS', 'PLAYERS'] as const).map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-2.5 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all relative`}
                >
                  {activeTab === tab && (
                    <motion.div layoutId="commTab"
                      className="absolute inset-0 bg-gradient-to-r from-emerald-600/40 to-teal-600/30 border border-emerald-500/25 rounded-xl"
                    />
                  )}
                  <span className={`relative z-10 ${activeTab === tab ? 'text-emerald-300' : 'text-gray-600'}`}>
                    {tab === 'TEAMS' ? '🏆 Puan Tablosu' : '👤 Oyuncular'}
                  </span>
                </button>
              ))}
            </div>

            <AnimatePresence mode="wait">
              <motion.div key={activeTab}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15 }}
              >
                {/* ─ League Table ─ */}
                {activeTab === 'TEAMS' && (
                  <div className="space-y-2.5">
                    {/* Table header */}
                    <div className="flex items-center px-3 pb-1 border-b border-white/5">
                      <span className="text-[8px] text-gray-700 font-black uppercase w-6 flex-shrink-0">#</span>
                      <span className="text-[8px] text-gray-700 font-black uppercase flex-1 ml-3">Takım</span>
                      <div className="flex items-center gap-3 text-[8px] text-gray-700 font-black uppercase flex-shrink-0">
                        <span className="w-4 text-center">G</span>
                        <span className="w-4 text-center">B</span>
                        <span className="w-4 text-center">M</span>
                        <span className="w-8 text-center">FP</span>
                      </div>
                    </div>
                    {MOCK_TEAMS.map((team, idx) => {
                      const total = team.wins + team.losses + team.draws;
                      const winPct = (team.wins / total) * 100;
                      return (
                        <motion.div key={team.id}
                          initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: idx * 0.05 }}
                          whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}
                          onClick={() => onNavigate('LEADERBOARDS')}
                          className={`relative overflow-hidden rounded-2xl border p-3 flex items-center gap-3 cursor-pointer ${idx === 0 ? 'border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10' : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.05]'} transition-colors`}
                        >
                          {/* Win bar bg */}
                          <div
                            className="absolute left-0 top-0 bottom-0 rounded-2xl pointer-events-none transition-all duration-1000"
                            style={{ width: `${winPct}%`, background: `linear-gradient(90deg, ${team.color}15 0%, transparent 100%)` }}
                          />

                          {/* Rank */}
                          <span className={`text-sm font-black w-5 text-center flex-shrink-0 z-10 ${idx === 0 ? 'text-amber-400' : 'text-gray-600'}`}>
                            {idx === 0 ? '👑' : idx + 1}
                          </span>

                          {/* Badge + Name */}
                          <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${team.bg} flex items-center justify-center font-black text-sm text-white border border-white/10 shadow-md flex-shrink-0 z-10`}>
                            {team.initials.charAt(0)}
                          </div>
                          <div className="flex-1 min-w-0 z-10">
                            <p className="font-black text-xs text-white truncate">{team.name}</p>
                            {/* Mini win bar */}
                            <div className="mt-1 h-1 w-full bg-white/5 rounded-full overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${winPct}%` }}
                                transition={{ duration: 1.2, delay: idx * 0.1, ease: 'easeOut' }}
                                className="h-full rounded-full"
                                style={{ background: team.color }}
                              />
                            </div>
                          </div>

                          {/* Stats */}
                          <div className="flex items-center gap-3 text-center flex-shrink-0 z-10">
                            <span className="text-[11px] font-black text-emerald-400 w-4">{team.wins}</span>
                            <span className="text-[11px] font-black text-gray-500 w-4">{team.draws}</span>
                            <span className="text-[11px] font-black text-rose-400 w-4">{team.losses}</span>
                            <div className="w-8">
                              <span className="text-[9px] font-black text-blue-400">{team.fp}</span>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}

                {/* ─ Player Cards ─ */}
                {activeTab === 'PLAYERS' && (
                  <div className="grid grid-cols-3 gap-3">
                    {MOCK_PLAYERS.map((p, idx) => (
                      <motion.div key={p.id}
                        initial={{ opacity: 0, y: 15, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ delay: idx * 0.05 }}
                        whileHover={{ scale: 1.05, y: -4 }} whileTap={{ scale: 0.97 }}
                        onClick={() => onNavigate('MATCH_JOIN')}
                        className={`rounded-2xl overflow-hidden border border-white/8 shadow-2xl cursor-pointer relative group`}
                        style={{ background: `linear-gradient(160deg, ${p.color.includes('emerald') ? '#064e3b' : p.color.includes('blue') ? '#1e3a5f' : p.color.includes('rose') ? '#4c1d2a' : p.color.includes('amber') ? '#4d2f00' : p.color.includes('purple') ? '#3b1c5a' : '#0c3a4d'}, #070B10)` }}
                      >
                        {/* Online dot */}
                        {p.online && (
                          <div className="absolute top-2 right-2 z-10">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                            </span>
                          </div>
                        )}

                        <div className="p-3 flex flex-col items-center">
                          {/* Fair Play (instead of ELO) */}
                          <div className="self-start bg-black/40 rounded-lg px-1.5 py-0.5 mb-2 border border-white/10">
                            <span className="text-[8px] font-black text-emerald-400">⚡ FP {p.fp}</span>
                          </div>

                          {/* Avatar circle */}
                          <div className="w-14 h-14 rounded-full border-2 border-white/15 bg-white/10 flex items-center justify-center font-black text-xl text-white shadow-xl mb-2 group-hover:border-white/30 transition-colors">
                            {p.initials}
                          </div>

                          {/* Position */}
                          <span className={`text-[7px] font-black uppercase tracking-wider border rounded-full px-1.5 py-0.5 mb-1.5 ${POS_STYLE[p.pos]}`}>
                            {p.pos}
                          </span>

                          {/* Name */}
                          <p className="text-[9px] font-black text-white text-center leading-tight">{p.name.split(' ')[0]}</p>
                          <p className="text-[8px] font-bold text-white/50 text-center">{p.name.split(' ')[1]}</p>

                          {/* Stats bar */}
                          <div className="w-full mt-2.5 pt-2 border-t border-white/8 flex justify-around">
                            <div className="text-center">
                              <p className="text-[8px] text-white/40 font-bold">G</p>
                              <p className="text-[11px] font-black text-white">{p.goals}</p>
                            </div>
                            <div className="text-center">
                              <p className="text-[8px] text-white/40 font-bold">A</p>
                              <p className="text-[11px] font-black text-white">{p.assists}</p>
                            </div>
                            <div className="text-center">
                              <p className="text-[8px] text-white/40 font-bold">FP</p>
                              <p className="text-[11px] font-black text-white">{p.fp}</p>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </section>

        </div>
          </motion.div>
        )}

        {mainTab === 'TEAMS' && (
          <>
            {selectedTeam ? (
                <TeamDashboard 
                    team={selectedTeam} 
                    onBack={() => setSelectedTeam(null)} 
                    onNavigateToStudio={() => { setActiveStudioTeam(selectedTeam); onNavigate('STUDIO'); }}
                    friendsData={friends}
                />
            ) : (
                <motion.div initial={{opacity:0, x:-20}} animate={{opacity:1, x:0}} className="px-5 pt-4 space-y-6">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-black italic uppercase tracking-tighter">Takımlarım</h2>
                        <button onClick={() => setShowCreateTeam(!showCreateTeam)} className="px-3 py-1.5 bg-[#39FF14]/20 border border-[#39FF14]/50 rounded-xl text-[#39FF14] flex items-center gap-1.5 text-xs font-black uppercase hover:bg-[#39FF14]/30 transition-colors">
                            <PlusCircle size={14} /> Yeni Oluştur
                        </button>
                    </div>
                    
                    <AnimatePresence>
                        {showCreateTeam && (
                            <TeamCreatorWizard 
                                onClose={() => setShowCreateTeam(false)}
                                friends={friends}
                                onComplete={(data) => {
                                    const newTeam = { ...data, id: 't' + Date.now(), wins: 0, losses: 0 };
                                    addMyTeam(newTeam);
                                    setShowCreateTeam(false);
                                    setSelectedTeam(newTeam);
                                }}
                            />
                        )}
                    </AnimatePresence>

                    <div className="grid gap-3">
                        {myTeams.length === 0 ? (
                            <div className="text-center py-10 bg-white/5 border border-white/10 rounded-2xl">
                                <p className="text-gray-500 font-bold text-sm">Henüz bir takıma üye değilsin.</p>
                            </div>
                        ) : (
                            myTeams.map(t => (
                                <div key={t.id} onClick={() => setSelectedTeam(t)} className="bg-gradient-to-r from-white/10 to-[#0A0E14] border border-white/10 rounded-2xl p-4 flex items-center justify-between cursor-pointer hover:border-white/30 transition-colors group">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-xl flex items-center justify-center font-black text-black text-xl shadow-lg" style={{ backgroundColor: t.color1 }}>
                                            {t.shortName ? t.shortName.charAt(0) : t.name.charAt(0)}
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-black text-white tracking-tight group-hover:text-[#39FF14] transition-colors">{t.name}</h3>
                                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{(t.captain === uid || t.captains?.includes(uid)) ? 'Kaptansın' : 'Oyuncu'} • {t.players?.length || 0} Oyuncu</p>
                                        </div>
                                    </div>
                                    <ChevronRight className="text-gray-500 group-hover:translate-x-1 transition-transform" />
                                </div>
                            ))
                        )}
                    </div>
                </motion.div>
            )}
          </>
        )}

        {mainTab === 'FRIENDS' && (
          <motion.div initial={{opacity:0, x:-20}} animate={{opacity:1, x:0}} className="px-5 pt-4 space-y-5">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-black italic uppercase tracking-tighter">Arkadaşlarım</h2>
                <button onClick={() => setShowAddFriend(!showAddFriend)} className="px-3 py-1.5 bg-[#FFFF00]/20 border border-[#FFFF00]/50 rounded-xl text-[#FFFF00] flex items-center gap-1.5 text-xs font-black uppercase hover:bg-[#FFFF00]/30 transition-colors">
                    <UserPlus size={14} /> Arkadaş Ekle
                </button>
            </div>

            <AnimatePresence>
                {showAddFriend && (
                    <motion.div initial={{opacity:0, height:0}} animate={{opacity:1, height:'auto'}} exit={{opacity:0, height:0}} className="overflow-hidden">
                        <div className="bg-[#161B22]/80 border border-white/10 rounded-3xl p-5 backdrop-blur-xl mb-6 shadow-xl space-y-5">
                            
                            {/* Arkadaş Arama */}
                            <div className="flex items-center gap-3 bg-[#0A0E14] border border-white/10 rounded-xl px-4 py-3 focus-within:border-[#FFFF00]/50 transition-all">
                                <Search size={18} className="text-gray-500" />
                                <input
                                    type="text" 
                                    placeholder="Kullanıcı adı veya ID ile ara..."
                                    className="bg-transparent flex-1 text-sm text-white outline-none placeholder:text-gray-600 font-medium"
                                />
                                <button className="px-3 py-1.5 bg-[#FFFF00] text-black font-black uppercase rounded-lg text-[10px] hover:bg-yellow-400 transition-colors">Bul</button>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                {/* Link ile Davet */}
                                <button
                                    onClick={handleShareLink}
                                    className="bg-gradient-to-br from-blue-900/40 to-[#0A0E14] border border-blue-500/20 rounded-xl p-4 flex flex-col items-start gap-3 hover:border-blue-500/40 transition-all group text-left"
                                >
                                    <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center group-hover:scale-105 transition-transform">
                                        <Link size={18} className="text-blue-400" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-black text-white">Link ile Davet Et</p>
                                        <p className="text-[10px] text-gray-500 mt-0.5">Bağlantıyı paylaş</p>
                                    </div>
                                    <div className="w-full bg-blue-500/10 text-blue-400 text-[10px] font-black py-1.5 rounded-lg text-center border border-blue-500/20 flex items-center justify-center gap-1.5 mt-auto">
                                        <Send size={10} /> PAYLAŞ
                                    </div>
                                </button>

                                {/* Özel Kod */}
                                <div className="bg-gradient-to-br from-[#FFFF00]/5 to-[#0A0E14] border border-[#FFFF00]/20 rounded-xl p-4 flex flex-col items-start gap-3">
                                    <div className="w-10 h-10 bg-[#FFFF00]/10 rounded-xl flex items-center justify-center">
                                        <UserPlus size={18} className="text-[#FFFF00]" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-black text-white">Özel Kodun</p>
                                        <p className="text-[10px] text-gray-500 mt-0.5">Arkadaşına ver</p>
                                    </div>
                                    <button
                                        onClick={copyCode}
                                        className="w-full flex items-center justify-between bg-black/40 px-3 py-2 rounded-lg border border-white/5 hover:border-[#FFFF00]/30 transition-all group/code mt-auto"
                                    >
                                        <span className="font-black text-[#FFFF00] tracking-[0.25em] text-base">{myCode}</span>
                                        <AnimatePresence mode="wait">
                                            {codeCopied
                                                ? <motion.span key="ok" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}><Check size={14} className="text-green-400" /></motion.span>
                                                : <motion.span key="copy" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}><Copy size={14} className="text-gray-500 group-hover/code:text-[#FFFF00]" /></motion.span>
                                            }
                                        </AnimatePresence>
                                    </button>
                                </div>
                            </div>

                            {/* Arkadaşının Kodunu Gir */}
                            <div className="bg-[#0A0E14] border border-white/5 rounded-xl p-4 space-y-3">
                                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Arkadaşının Kodunu Gir</p>
                                <div className="flex gap-2">
                                    <input
                                        type="text" maxLength={6} value={codeInput} onChange={e => setCodeInput(e.target.value.toUpperCase())}
                                        placeholder="XXXXXX"
                                        className="flex-1 bg-black/40 border border-white/10 rounded-lg px-4 py-3 text-white font-black text-sm tracking-[0.3em] outline-none focus:border-[#FFFF00]/50 transition-all placeholder:tracking-normal placeholder:font-normal placeholder:text-gray-700 uppercase"
                                    />
                                    <button
                                        onClick={handleCodeSubmit}
                                        disabled={codeInput.length < 6}
                                        className="px-5 bg-[#FFFF00] text-black font-black text-xs rounded-lg disabled:opacity-30 hover:bg-yellow-400 transition-all relative overflow-hidden"
                                    >
                                        <AnimatePresence mode="wait">
                                            {codeAccepted
                                                ? <motion.span key="ok" initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="flex items-center gap-1 text-green-800"><Check size={16} />GÖNDERİLDİ</motion.span>
                                                : <motion.span key="btn" initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>EKLE</motion.span>
                                            }
                                        </AnimatePresence>
                                    </button>
                                </div>
                            </div>
                            
                            {/* Bekleyen İstekler (Mock) */}
                            <div className="pt-2 border-t border-white/10">
                                <p className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-3">Bekleyen İstekler (1)</p>
                                <div className="flex items-center gap-3 bg-[#0A0E14] border border-red-500/10 rounded-xl p-3">
                                    <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center font-black">E</div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-white truncate">Eren Çelik</p>
                                        <p className="text-[10px] text-gray-500">@erencelik</p>
                                    </div>
                                    <div className="flex gap-2">
                                        <button className="w-8 h-8 bg-red-500/10 text-red-400 rounded-full flex items-center justify-center hover:bg-red-500/20"><X size={14} /></button>
                                        <button className="w-8 h-8 bg-green-500/10 text-green-400 rounded-full flex items-center justify-center hover:bg-green-500/20"><CheckCircle2 size={14} /></button>
                                    </div>
                                </div>
                            </div>

                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar items-center">
                {groups.map(group => (
                    <button 
                        key={group} 
                        onClick={() => setSelectedGroup(group)}
                        className={`whitespace-nowrap px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all flex items-center gap-1.5 ${selectedGroup === group ? (group === 'Favorilerim' ? 'bg-[#FFFF00] text-black border-[#FFFF00] shadow-[0_0_15px_rgba(255,255,0,0.3)]' : 'bg-white text-black border-white shadow-lg') : 'bg-transparent text-gray-500 border-white/10 hover:border-white/30'}`}
                    >
                        {group === 'Favorilerim' && <Star size={12} fill={selectedGroup === group ? "black" : "currentColor"} className={selectedGroup === group ? 'text-black' : 'text-gray-500'} />}
                        {group}
                    </button>
                ))}
                
                {isCreatingGroup ? (
                    <div className="flex items-center gap-1 bg-white/5 border border-white/20 rounded-xl px-2 h-9">
                        <input 
                            autoFocus
                            type="text" 
                            value={newGroupName} 
                            onChange={e => setNewGroupName(e.target.value)}
                            placeholder="Grup Adı"
                            className="bg-transparent w-24 text-[10px] font-bold text-white outline-none"
                            onKeyDown={e => {
                                if (e.key === 'Enter' && newGroupName.trim()) {
                                    setGroups([...groups.filter(g=>g!=='Tümü'), newGroupName.trim(), 'Tümü']);
                                    setSelectedGroup(newGroupName.trim());
                                    setNewGroupName('');
                                    setIsCreatingGroup(false);
                                }
                                if (e.key === 'Escape') setIsCreatingGroup(false);
                            }}
                        />
                        <button onClick={() => {
                            if(newGroupName.trim()) {
                                setGroups([...groups.filter(g=>g!=='Tümü'), newGroupName.trim(), 'Tümü']);
                                setSelectedGroup(newGroupName.trim());
                            }
                            setNewGroupName('');
                            setIsCreatingGroup(false);
                        }} className="text-[#39FF14] p-1"><Check size={12}/></button>
                        <button onClick={() => setIsCreatingGroup(false)} className="text-red-400 p-1"><X size={12}/></button>
                    </div>
                ) : (
                    <button onClick={() => setIsCreatingGroup(true)} className="px-3 h-9 border border-dashed border-white/20 rounded-xl text-gray-500 hover:text-white transition-colors flex items-center justify-center shrink-0">
                        <PlusCircle size={14} />
                    </button>
                )}
            </div>


            <AnimatePresence>
                {showAddFriend && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="w-full max-w-sm bg-[#0A0E14] border border-white/10 rounded-[32px] overflow-hidden flex flex-col relative shadow-[0_0_50px_rgba(0,0,0,0.8)]"
                        >
                            <button onClick={() => setShowAddFriend(false)} className="absolute top-4 right-4 z-50 w-8 h-8 bg-white/5 border border-white/10 rounded-full flex items-center justify-center text-gray-400 hover:text-white transition-colors">
                                <X size={16} />
                            </button>
                            <div className="p-6 pb-8 text-center flex flex-col items-center">
                                <div className="w-16 h-16 bg-[#39FF14]/10 border border-[#39FF14]/30 rounded-full flex items-center justify-center mb-4 shadow-[0_0_20px_rgba(57,255,20,0.2)]">
                                    <Search size={32} className="text-[#39FF14]" />
                                </div>
                                <h3 className="text-xl font-black italic uppercase tracking-tighter text-white mb-2">Oyuncu Radarı</h3>
                                <p className="text-xs text-gray-400 font-bold mb-6">OYNA ID veya Kullanıcı Adı ile sistemdeki oyuncuları tarayıp takımına davet et.</p>
                                
                                <div className="w-full relative mb-4">
                                    <input 
                                        type="text" 
                                        placeholder="OYNA ID veya Kullanıcı Adı"
                                        className="w-full bg-[#161B22] border border-white/10 rounded-2xl px-5 py-4 pl-12 text-white font-bold outline-none focus:border-[#39FF14]/50 transition-all text-sm"
                                    />
                                    <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                                </div>
                                <button onClick={() => setShowAddFriend(false)} className="w-full py-4 rounded-2xl bg-[#39FF14] text-black font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 hover:scale-105 transition-all shadow-[0_0_20px_rgba(57,255,20,0.3)]">
                                    Radarı Çalıştır <UserPlus size={16} />
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {selectedFriendModal && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            className="w-full max-w-sm rounded-[32px] overflow-hidden relative border shadow-[0_0_80px_rgba(0,0,0,0.8)] border-[#39FF14]/50"
                            style={{ backgroundColor: '#0A0E14' }}
                        >
                            <div className="absolute inset-0 opacity-30 mix-blend-screen" style={{ background: `radial-gradient(circle at top, #39FF14, transparent 70%)` }} />
                            
                            <button onClick={() => setSelectedFriendModal(null)} className="absolute top-4 right-4 z-50 w-10 h-10 bg-black/40 border border-white/20 rounded-full flex items-center justify-center text-white backdrop-blur-md hover:bg-white/10 transition-colors">
                                <X size={20} />
                            </button>

                            <div className="p-8 pb-10 flex flex-col items-center relative z-10 mt-6">
                                <div className="relative mb-6">
                                    <div className="absolute inset-0 rounded-full blur-xl scale-125 opacity-50 animate-pulse bg-[#39FF14]" />
                                    <div className="w-28 h-28 rounded-full border-4 flex items-center justify-center font-black text-4xl shadow-[0_0_30px_currentColor] relative z-10 bg-[#0A0E14] border-[#39FF14] text-[#39FF14]">
                                        {selectedFriendModal.name.charAt(0)}
                                    </div>
                                    <div className="absolute -bottom-2 -right-2 w-10 h-10 rounded-full border-4 border-[#0A0E14] flex items-center justify-center font-black text-xs z-20 bg-[#39FF14] text-black">
                                        {selectedFriendModal.pos}
                                    </div>
                                </div>

                                <h2 className="text-3xl font-black italic uppercase tracking-tighter text-white mb-1 drop-shadow-md text-center">{selectedFriendModal.name}</h2>
                                <p className="text-xs font-bold uppercase tracking-widest text-white/50 mb-8">{selectedFriendModal.group}</p>

                                <div className="grid grid-cols-2 gap-4 w-full">
                                    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col items-center justify-center">
                                        <Activity size={20} className="mb-2 text-[#39FF14]" />
                                        <span className="text-2xl font-black text-white">{selectedFriendModal.wins}</span>
                                        <span className="text-[9px] font-bold uppercase tracking-widest text-white/40 mt-1">Galibiyet</span>
                                    </div>
                                    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col items-center justify-center">
                                        <Zap size={20} className="mb-2 text-amber-400" />
                                        <span className="text-2xl font-black text-white">{selectedFriendModal.losses}</span>
                                        <span className="text-[9px] font-bold uppercase tracking-widest text-white/40 mt-1">Mağlubiyet</span>
                                    </div>
                                </div>

                                <button className="w-full mt-6 py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition-transform hover:scale-105 active:scale-95 text-black shadow-[0_0_20px_currentColor] bg-[#39FF14]">
                                    Tüm İstatistikler
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <Reorder.Group axis="y" values={displayedFriends} onReorder={handleReorderFriends} className="grid gap-3">
                {displayedFriends.map(friend => (

                    <Reorder.Item 
                        key={friend.id} 
                        value={friend}
                        onClick={() => setSelectedFriendModal(friend)}
                        className={`bg-gradient-to-br from-[#161B22] to-[#0A0E14] border ${expandedFriend === friend.id ? 'border-[#39FF14]/30 shadow-[0_0_20px_rgba(57,255,20,0.1)]' : 'border-white/5'} rounded-3xl p-4 flex flex-col gap-3 cursor-grab active:cursor-grabbing hover:border-white/20 transition-all overflow-hidden relative`}
                    >
                        
                        <div className="flex items-center justify-between pointer-events-none relative z-10">
                            <div className="flex items-center gap-4">
                                <div className="relative">
                                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center font-black text-lg border border-white/10 shadow-lg">
                                        {friend.name.charAt(0)}
                                    </div>
                                    {friend.online && <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-[#39FF14] rounded-full border-[3px] border-[#0A0E14] shadow-[0_0_10px_rgba(57,255,20,0.5)]" />}
                                </div>
                                <div>
                                    <h4 className="text-base font-black text-white tracking-tight flex items-center gap-2">
                                        {friend.name}
                                        {friend.isFavorite && <Star size={12} className="text-[#FFFF00]" fill="#FFFF00" />}
                                    </h4>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                        <Hash size={10} className="text-gray-500" />
                                        <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">{friend.group}</span>
                                        <span className="text-gray-700 text-[10px]">•</span>
                                        <span className="text-[10px] font-bold text-gray-500">{friend.pos}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex flex-col items-end gap-1.5">
                                <div className="flex items-end gap-[3px] h-4">
                                    {[1, 2, 3, 4, 5].map(level => {
                                        const matches = friend.wins + friend.losses;
                                        const activityLevel = Math.min(5, Math.max(1, Math.ceil(matches / 6)));
                                        const isActive = level <= activityLevel;
                                        const colors = ['bg-[#FFFF00]', 'bg-amber-400', 'bg-orange-500', 'bg-rose-500', 'bg-red-600'];
                                        return (
                                            <div 
                                                key={level} 
                                                className={`w-1.5 rounded-sm transition-colors duration-500 ${isActive ? colors[activityLevel - 1] : 'bg-white/10'}`} 
                                                style={{ height: `${40 + level * 15}%` }} 
                                            />
                                        );
                                    })}
                                </div>
                                <span className="text-[7px] text-gray-500 font-bold uppercase tracking-widest">Aktiflik</span>
                            </div>
                        </div>


                    </Reorder.Item>
                ))}
            </Reorder.Group>
          </motion.div>
        )}

      </div>
    </div>
  );
};

export default CommunityView;
