import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useScroll, useTransform } from 'framer-motion';
import { 
  Users, Trophy, ShieldCheck, Mail, Lock, ChevronRight, ArrowLeft,
  ArrowRightLeft, Star, Swords, LayoutDashboard, Sparkles, Activity,
  Calendar, Flame, Medal, Zap, Radio, Crown, Target, TrendingUp, Check, X
} from 'lucide-react';
import { ICommunity, ITeam, IUser, AppView } from '../types';

interface CommunityViewProps {
  onBack: () => void;
  onNavigate: (view: AppView) => void;
  community: ICommunity;
  currentUser: IUser;
}

// ─── Rich Data ────────────────────────────────────────────────────────────────
const MOCK_TEAMS = [
  { id: 't1', name: 'Boğaziçi FC',    initials: 'BFC', color: '#10B981', bg: 'from-emerald-500 to-emerald-700', wins: 14, losses: 3,  draws: 1, fp: 96, elo: 1280 },
  { id: 't2', name: 'Güney SK',       initials: 'GSK', color: '#3B82F6', bg: 'from-blue-500 to-blue-700',     wins: 10, losses: 6,  draws: 2, fp: 88, elo: 1095 },
  { id: 't3', name: 'Hisar SK',       initials: 'HSK', color: '#EF4444', bg: 'from-rose-500 to-rose-700',     wins:  8, losses: 8,  draws: 2, fp: 82, elo: 1020 },
  { id: 't4', name: 'Kuzey SK',       initials: 'KSK', color: '#F59E0B', bg: 'from-amber-500 to-amber-700',   wins:  5, losses: 11, draws: 2, fp: 79, elo:  940 },
];

const MOCK_PLAYERS = [
  { id: 'u1', name: 'Ahmet Yılmaz', initials: 'AY', pos: 'FV', fp: 98, elo: 1280, goals: 18, assists:  9, color: 'from-emerald-700 via-emerald-800 to-[#0A0E14]', online: true,  team: 'Boğaziçi FC' },
  { id: 'u2', name: 'Caner Kaya',   initials: 'CK', pos: 'OS', fp: 91, elo: 1140, goals: 12, assists: 14, color: 'from-blue-700 via-blue-800 to-[#0A0E14]',       online: true,  team: 'Güney SK' },
  { id: 'u3', name: 'Emre Demir',   initials: 'ED', pos: 'STP',fp: 87, elo: 1050, goals:  3, assists:  6, color: 'from-rose-700 via-rose-800 to-[#0A0E14]',       online: false, team: 'Hisar SK' },
  { id: 'u4', name: 'Burak Şahin',  initials: 'BŞ', pos: 'KL', fp: 85, elo:  990, goals:  0, assists:  1, color: 'from-amber-700 via-amber-800 to-[#0A0E14]',     online: true,  team: 'Kuzey SK' },
  { id: 'u5', name: 'Mert Arslan',  initials: 'MA', pos: 'OS', fp: 80, elo:  910, goals:  7, assists:  7, color: 'from-purple-700 via-purple-800 to-[#0A0E14]',   online: false, team: 'Hisar SK' },
  { id: 'u6', name: 'Kerem Ün',     initials: 'KÜ', pos: 'FV', fp: 77, elo:  870, goals:  9, assists:  4, color: 'from-cyan-700 via-cyan-800 to-[#0A0E14]',       online: true,  team: 'Güney SK' },
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
const CommunityView: React.FC<CommunityViewProps> = ({ onBack, onNavigate, community, currentUser }) => {
  const [activeTab, setActiveTab] = useState<'TEAMS' | 'PLAYERS'>('TEAMS');
  const [ticker, setTicker] = useState(0);
  const isMember = currentUser.communities.includes(community.id);
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
      <div className="relative pt-12 pb-5 px-5 overflow-hidden flex-shrink-0">
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

        {/* Identity */}
        <div className="flex items-center gap-4 mb-5 relative z-10">
          <motion.div
            animate={{ boxShadow: ['0 0 25px rgba(16,185,129,0.2)', '0 0 50px rgba(16,185,129,0.5)', '0 0 25px rgba(16,185,129,0.2)'] }}
            transition={{ duration: 3.5, repeat: Infinity }}
            className="w-[72px] h-[72px] rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-700 flex items-center justify-center border border-emerald-400/30 shadow-2xl flex-shrink-0"
          >
            <Users size={34} className="text-white drop-shadow-lg" />
          </motion.div>

          <div className="flex-1">
            <div className="flex items-center gap-2 mb-0.5">
              <h1 className="text-[22px] font-black tracking-tighter italic leading-none">{community.name}</h1>
              {community.isVerified && (
                <ShieldCheck size={16} className="text-emerald-400 flex-shrink-0" />
              )}
            </div>
            <p className="text-emerald-400/60 text-[10px] font-bold tracking-wide">{community.domain}</p>
          </div>
        </div>

        {/* Stat pills */}
        <div className="flex gap-2.5 mb-5 relative z-10">
          {[
            { label: 'Üye', val: community.memberCount, Icon: Users, color: 'text-emerald-400', border: 'border-emerald-500/20', bg: 'bg-emerald-500/5' },
            { label: 'Aktif Maç', val: community.activeMatches ?? 2, Icon: Swords, color: 'text-rose-400', border: 'border-rose-500/20', bg: 'bg-rose-500/5' },
            { label: 'FP Ort.', val: '91', Icon: ShieldCheck, color: 'text-blue-400', border: 'border-blue-500/20', bg: 'bg-blue-500/5' },
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
      </div>

      {/* ══ SCROLLABLE BODY ════════════════════════════════════════════════ */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto pb-28">

        {!isMember && (
          <div className="absolute inset-0 z-30 backdrop-blur-xl bg-black/70 flex flex-col items-center justify-center p-6">
            <motion.div animate={{ rotate: [0, -5, 5, 0] }} transition={{ duration: 3, repeat: Infinity }}
              className="w-20 h-20 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-6">
              <Lock size={30} className="text-slate-400" />
            </motion.div>
            <h2 className="text-xl font-black mb-2 text-center">Bu Topluluk Gizli</h2>
            <p className="text-slate-400 text-center mb-8 max-w-xs text-sm leading-relaxed">
              İçerikleri görmek için <b className="text-white">{community.domain}</b> uzantılı e-posta ile doğrulamalısın.
            </p>
            <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              className="w-full max-w-xs bg-gradient-to-r from-emerald-500 to-teal-500 text-black font-black py-4 rounded-2xl flex items-center justify-center gap-2 shadow-[0_0_30px_rgba(16,185,129,0.3)]">
              <Mail size={18} /> E-posta Doğrula
            </motion.button>
          </div>
        )}

        <div className={`space-y-5 px-4 pt-4 ${!isMember ? 'pointer-events-none select-none blur-sm' : ''}`}>


          {/* ── Season / Leader Banner ──────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="relative rounded-3xl overflow-hidden border border-amber-500/15 shadow-2xl"
            style={{ background: 'linear-gradient(125deg, #1a0a00 0%, #0D1117 60%, #0A0E14 100%)' }}
          >
            <div className="absolute inset-0 pointer-events-none">
              <motion.div animate={{ opacity: [0.4, 0.8, 0.4], x: [-10, 10, -10] }} transition={{ duration: 6, repeat: Infinity }}
                className="absolute top-0 left-0 w-48 h-full bg-gradient-to-r from-amber-500/10 to-transparent" />
            </div>
            <div className="relative z-10 p-4 flex items-center gap-4">
              <motion.div
                animate={{ rotate: [0, 10, -10, 0] }} transition={{ duration: 4, repeat: Infinity }}
                className="w-14 h-14 bg-gradient-to-br from-amber-400 to-amber-600 rounded-2xl flex items-center justify-center shadow-[0_0_20px_rgba(251,191,36,0.4)] border border-amber-400/30 flex-shrink-0"
              >
                <Crown size={26} className="text-black" />
              </motion.div>
              <div className="flex-1">
                <p className="text-[9px] text-amber-400/60 font-black uppercase tracking-widest">4. Hafta Lideri</p>
                <h2 className="text-lg font-black italic text-white leading-tight">Boğaziçi FC</h2>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-[10px] text-emerald-400 font-bold">14G</span>
                  <span className="text-[10px] text-rose-400 font-bold">3M</span>
                  <span className="text-[10px] text-gray-600 font-bold">1 B</span>
                  <span className="text-[10px] text-gray-500 font-bold">·</span>
                  <span className="text-[10px] text-amber-400 font-black">1280 ELO</span>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="w-14 h-14 rounded-2xl border border-amber-500/20 flex flex-col items-center justify-center bg-amber-500/5">
                  <span className="text-[22px] font-black text-amber-400 leading-none tabular-nums">W4</span>
                  <span className="text-[8px] text-amber-400/50 font-bold">SEZON</span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* ── Match Results & Upcoming ────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Swords size={13} className="text-rose-400" />
                <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Maçlar</h3>
              </div>
            </div>
            <div className="space-y-2.5">
              {MATCHES.map((m, i) => (
                <motion.div key={m.id}
                  initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.07 }}
                  whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}
                  onClick={() => onNavigate(m.live ? 'MATCH_LOBBY' : 'MATCH_DISCOVERY')}
                  className={`relative overflow-hidden rounded-2xl border p-3.5 flex items-center gap-3 cursor-pointer transition-colors ${m.live ? 'border-red-500/30 bg-red-500/5 hover:bg-red-500/10' : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.05]'}`}
                >
                  {m.live && (
                    <div className="absolute top-2 right-2 flex items-center gap-1">
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
                      </span>
                      <span className="text-[8px] font-black text-red-400">CANLI</span>
                    </div>
                  )}
                  <div className="flex-1 flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center font-black text-sm shadow-lg border border-white/10" style={{ background: `linear-gradient(135deg, ${m.hc}40, ${m.hc}10)` }}>
                      <span style={{ color: m.hc }}>{m.h.charAt(0)}</span>
                    </div>
                    <span className="text-[10px] font-black text-white truncate" style={{ maxWidth: 70 }}>{m.h}</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {m.live ? (
                      <span className="text-[11px] font-black text-gray-500 px-2">VS</span>
                    ) : (
                      <div className="flex items-center gap-1 bg-white/5 rounded-xl px-3 py-1.5 border border-white/5">
                        <span className={`text-base font-black tabular-nums ${m.hg > m.ag ? 'text-emerald-400' : m.hg < m.ag ? 'text-rose-400' : 'text-gray-400'}`}>{m.hg}</span>
                        <span className="text-gray-700 font-black">–</span>
                        <span className={`text-base font-black tabular-nums ${m.ag > m.hg ? 'text-emerald-400' : m.ag < m.hg ? 'text-rose-400' : 'text-gray-400'}`}>{m.ag}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 flex items-center gap-2 justify-end">
                    <span className="text-[10px] font-black text-white truncate text-right" style={{ maxWidth: 70 }}>{m.a}</span>
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center font-black text-sm shadow-lg border border-white/10" style={{ background: `linear-gradient(135deg, ${m.ac}40, ${m.ac}10)` }}>
                      <span style={{ color: m.ac }}>{m.a.charAt(0)}</span>
                    </div>
                  </div>
                </motion.div>
              ))}
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
                        <span className="w-8 text-center">ELO</span>
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
                            <span className="text-[10px] font-black text-white w-8">{team.elo}</span>
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
                          {/* ELO */}
                          <div className="self-start bg-black/40 rounded-lg px-1.5 py-0.5 mb-2 border border-white/10">
                            <span className="text-[8px] font-black text-white">{p.elo}</span>
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
      </div>
    </div>
  );
};

export default CommunityView;
