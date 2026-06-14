
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell, MapPin, Users, User, Scale, Shield, Swords,
  Clock, Check, Wallet, Sparkles, ChevronRight,
  Target, MousePointer2, Trophy, Activity, Calendar, CalendarCheck, Star, TrendingUp, Flame, Zap
} from 'lucide-react';
import { OynaLogo } from '../components/OynaLogo';
import { AppView, Goalkeeper, Referee } from '../types';
import { AnimatedButton } from '../components/AnimatedButton';
import { useAppStore } from '../store';
import { check90MinAutoCancel } from '../utils/gameRules';

interface DashboardProps {
  onNavigate: (view: AppView) => void;
  onBack: () => void;
  onRoleSelect?: (role: any) => void;
  selectedGk: Goalkeeper | null;
  selectedRef: Referee | null;
}

const DashboardSkeleton = () => (
  <div className="p-6 space-y-4 min-h-screen bg-[#0A0E14] animate-pulse">
    <div className="flex justify-between items-center mb-8">
      <div className="h-10 w-40 bg-gray-800 rounded-xl"></div>
      <div className="h-10 w-10 bg-gray-800 rounded-full"></div>
    </div>
    <div className="h-48 w-full bg-gray-800 rounded-[32px] relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-[shimmer_1.5s_infinite]"></div>
    </div>
    <div className="grid grid-cols-2 gap-4">
      <div className="h-40 bg-gray-800 rounded-[32px]"></div>
      <div className="h-40 bg-gray-800 rounded-[32px]"></div>
    </div>
    <div className="h-24 w-full bg-gray-800 rounded-[32px]"></div>
    <div className="flex justify-center items-center gap-2 mt-10">
      <div className="w-2 h-2 bg-[#FFFF00] rounded-full animate-bounce"></div>
      <p className="text-[#FFFF00] text-xs font-bold uppercase tracking-widest">Sistem Sahayı Hazırlıyor...</p>
    </div>
  </div>
);

// Maç saatini Date objesine çevir: date="2026-04-13", time="21:30"
const parseMatchDate = (date: string, time: string): Date | null => {
  try {
    // "2026-04-13" formatında değil, "26 Mart" gibi Türkçe ise Demo modda yakın saat kullan
    if (date.includes('-')) {
      return new Date(`${date}T${time}:00`);
    }
    // Demo data: bugünün tarihine time uygula
    const today = new Date();
    const [hours, minutes] = time.split(':').map(Number);
    today.setHours(hours, minutes, 0, 0);
    return today;
  } catch {
    return null;
  }
};

interface MatchCountdownProps {
  onClick: () => void;
  matchTitle: string;
  matchLocation: string;
  matchTime: string;
  matchDate: Date;
  isDraft?: boolean;
  isCancelled?: boolean;
  isLive?: boolean;
}

const MatchCountdown: React.FC<MatchCountdownProps> = ({ onClick, matchTitle, matchLocation, matchTime, matchDate, isDraft, isCancelled, isLive }) => {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    if (isCancelled) return;
    const tick = () => {
      const now = new Date();
      const diff = matchDate.getTime() - now.getTime();
      if (diff > 0) {
        setTimeLeft({
          days: Math.floor(diff / (1000 * 60 * 60 * 24)),
          hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
          minutes: Math.floor((diff / 1000 / 60) % 60),
          seconds: Math.floor((diff / 1000) % 60),
        });
      } else {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [matchDate, isCancelled]);

  const format = (num: number) => num.toString().padStart(2, '0');

  const hasDays = timeLeft.days > 0;
  const themeColor = isCancelled 
    ? 'text-red-500 font-extrabold animate-pulse' 
    : isLive 
      ? 'text-[#39FF14] font-black drop-shadow-[0_0_8px_rgba(57,255,20,0.5)] animate-pulse' 
      : isDraft 
        ? 'text-amber-400' 
        : hasDays 
          ? 'text-green-400' 
          : 'text-red-500';
  const themeBg = isCancelled ? 'bg-red-500' : isLive ? 'bg-[#39FF14]' : isDraft ? 'bg-amber-500' : hasDays ? 'bg-green-500' : 'bg-red-500';
  const themeBorder = isCancelled ? 'border-red-500/30' : isLive ? 'border-[#39FF14]/50' : isDraft ? 'border-amber-500/30' : hasDays ? 'border-green-500/30' : 'border-red-500/30';
  const themeGlow = isCancelled ? 'bg-red-500/20' : isLive ? 'bg-[#39FF14]/25' : isDraft ? 'bg-amber-500/20' : hasDays ? 'bg-green-500/20' : 'bg-red-500/20';

  const TimerBox = ({ value, label, color, pulse }: { value: string, label: string, color: string, pulse?: boolean }) => (
    <div className="flex-1 max-w-[75px] aspect-square bg-[#06080A]/60 backdrop-blur-xl border border-white/10 rounded-[20px] flex flex-col items-center justify-center shadow-[inset_0_2px_10px_rgba(255,255,255,0.03)] relative overflow-hidden group-hover:border-white/20 transition-colors">
       <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-50" />
       <motion.span 
          animate={pulse || isDraft || isLive ? { opacity: [1, 0.6, 1], scale: [1, 1.03, 1] } : {}} 
          transition={pulse || isDraft || isLive ? { duration: 1.5, repeat: Infinity, ease: 'easeInOut' } : {}}
          className="font-black text-[26px] sm:text-[32px] leading-none tabular-nums tracking-tighter" 
          style={{ color, textShadow: pulse || isDraft || isLive ? `0 0 15px ${color}80` : 'none' }}
       >
          {value}
       </motion.span>
       <span className="text-[8px] sm:text-[9px] text-gray-500 font-black uppercase mt-1.5 tracking-[0.2em]">{label}</span>
    </div>
  );

  return (
    <motion.div
      onClick={onClick}
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{
        opacity: 1,
        y: 0,
        scale: 1,
        boxShadow: isCancelled
           ? '0 12px 40px -10px rgba(239,68,68,0.55), inset 0 1px 0 rgba(255,255,255,0.1)'
           : isLive
              ? '0 12px 50px -10px rgba(57,255,20,0.6), inset 0 1px 0 rgba(255,255,255,0.2)'
              : isDraft
                 ? '0 12px 40px -10px rgba(245,158,11,0.3), inset 0 1px 0 rgba(255,255,255,0.1)'
                 : hasDays 
                    ? '0 12px 40px -10px rgba(34,197,94,0.2), inset 0 1px 0 rgba(255,255,255,0.1)'
                    : '0 12px 40px -10px rgba(239,68,68,0.4), inset 0 1px 0 rgba(255,255,255,0.1)'
      }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      className="w-full relative rounded-[32px] cursor-pointer group z-20"
    >
      {/* Dynamic Background */}
      <div className="absolute inset-0 bg-[#0A0E14] rounded-[32px] overflow-hidden border border-white/10 group-hover:border-white/20 transition-colors">
         {/* Animated Neon Mesh */}
         <motion.div
           animate={{
             backgroundPosition: ['0% 0%', '100% 100%', '0% 0%'],
             scale: [1, 1.15, 1]
           }}
           transition={{ duration: 15, repeat: Infinity, ease: 'linear' }}
           className="absolute inset-0 opacity-40 mix-blend-screen"
           style={{
             backgroundImage: isCancelled
                ? 'radial-gradient(circle at 50% -20%, rgba(239,68,68,0.75) 0%, transparent 60%), radial-gradient(circle at 10% 120%, rgba(220,38,38,0.55) 0%, transparent 50%)'
                : isLive
                   ? 'radial-gradient(circle at 50% -20%, rgba(57,255,20,0.85) 0%, transparent 65%), radial-gradient(circle at 10% 120%, rgba(57,255,20,0.45) 0%, transparent 55%)'
                   : isDraft
                      ? 'radial-gradient(circle at 50% -20%, rgba(245,158,11,0.5) 0%, transparent 60%), radial-gradient(circle at 10% 120%, rgba(217,119,6,0.3) 0%, transparent 50%)'
                      : hasDays 
                         ? 'radial-gradient(circle at 50% -20%, rgba(34,197,94,0.5) 0%, transparent 60%), radial-gradient(circle at 10% 120%, rgba(16,185,129,0.3) 0%, transparent 50%)'
                         : 'radial-gradient(circle at 50% -20%, rgba(239,68,68,0.6) 0%, transparent 60%), radial-gradient(circle at 10% 120%, rgba(220,38,38,0.4) 0%, transparent 50%)',
             backgroundSize: '200% 200%'
           }}
         />
         {/* Glass Overlay */}
         <div className="absolute inset-0 bg-black/20 backdrop-blur">
          {/* Radar Scan Line / Thin Red Laser (when starting soon, draft action, cancelled, or live) */}
          {isCancelled ? (
            <motion.div
              animate={{ y: ['-100%', '250%'] }}
              transition={{ duration: 3.5, repeat: Infinity, ease: 'linear' }}
              className="absolute left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-red-500 to-transparent pointer-events-none z-10"
              style={{
                boxShadow: '0 0 10px 2px rgba(239, 68, 68, 0.8), 0 0 20px 4px rgba(239, 68, 68, 0.4)'
              }}
            />
          ) : (isDraft || isLive || !hasDays) && (
            <motion.div
              animate={{ y: ['-100%', '200%'] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}
              className={`absolute left-0 right-0 h-1/2 bg-gradient-to-b from-transparent pointer-events-none ${isLive ? 'to-[#39FF14]/15' : isDraft ? 'to-amber-500/20' : 'to-red-500/20'}`}
              style={{ borderBottom: isLive ? '1.5px solid rgba(57,255,20,0.8)' : isDraft ? '1px solid rgba(245,158,11,0.5)' : '1px solid rgba(239,68,68,0.5)' }}
            />
          )}
        </div>
      </div>

       {/* Content */}
       <div className="relative z-10 p-5 flex flex-col gap-5">
          
          {/* Header Row */}
          <div className="flex items-center justify-between">
             <div className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-black/40 border border-white/5 backdrop-blur-md">
               <motion.div
                 animate={{ opacity: [1, 0.4, 1], scale: [1, 1.2, 1] }}
                 transition={{ duration: 1.5, repeat: Infinity }}
                 className={`w-2.5 h-2.5 rounded-full ${isCancelled ? 'bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.9)]' : isLive ? 'bg-[#39FF14] shadow-[0_0_12px_rgba(57,255,20,0.9)] animate-pulse' : isDraft ? 'bg-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.9)]' : hasDays ? 'bg-green-500' : 'bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.9)]'}`}
               />
               <span className={`text-[10px] sm:text-[12px] font-black uppercase tracking-[0.25em] ${themeColor}`}>
                 {isCancelled ? 'MAÇ İPTAL EDİLDİ' : isLive ? 'MAÇ ONAYLANDI - LIVE' : isDraft ? 'DRAFT MAÇIN VAR - KADROYU KUR' : hasDays ? 'SIRADAKİ MAÇ' : 'BAŞLIYOR'}
               </span>
             </div>
             
             {!isCancelled && (
               <div className="px-3 py-1.5 rounded-full bg-white/10 border border-white/10 backdrop-blur-md flex items-center gap-1.5 shadow-inner">
                 <Clock size={13} className="text-[#FFB800]" />
                 <span className="text-white text-[11px] sm:text-[12px] font-black tracking-widest">{matchTime}</span>
               </div>
             )}
          </div>

          {/* Timers Row or Cancelled Banner */}
          {isCancelled ? (
            <div className="flex flex-col gap-1.5 py-3.5 px-4 bg-red-950/20 border border-red-500/10 rounded-2xl relative overflow-hidden">
              <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500 opacity-80" />
              <h3 className="text-white font-black text-[16px] sm:text-[18px] tracking-tight uppercase italic leading-none pl-2">{matchTitle}</h3>
              <p className="text-gray-400 font-bold text-[10px] sm:text-[11px] pl-2 uppercase tracking-wide">
                {matchLocation}
              </p>
              <p className="text-red-400 font-bold text-[11px] sm:text-xs pl-2">
                Bu maç için yeterli doluluk sağlanamadı.
              </p>
              <div className="flex items-center gap-1.5 mt-1 pl-2">
                <Shield size={12} className="text-red-500" />
                <span className="text-gray-300 font-black text-[10px] sm:text-[11px] uppercase tracking-wider">
                  Ücret alınmadı
                </span>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-center gap-2 sm:gap-4 w-full pt-1">
                 <TimerBox value={format(timeLeft.days)} label="GÜN" color={isLive ? '#39FF14' : isDraft ? '#FFB800' : hasDays ? '#22c55e' : '#fff'} />
                 <span className="text-white/20 font-black text-2xl mb-4">:</span>
                 <TimerBox value={format(timeLeft.hours)} label="SAAT" color={isLive ? '#39FF14' : isDraft ? '#fff' : hasDays ? '#fff' : '#ef4444'} pulse={isLive || !hasDays || isDraft} />
                 <span className="text-white/20 font-black text-2xl mb-4">:</span>
                 <TimerBox value={format(timeLeft.minutes)} label="DAKİKA" color={isLive ? '#39FF14' : isDraft ? '#fff' : hasDays ? '#fff' : '#ef4444'} pulse={isLive || !hasDays || isDraft} />
              </div>

              {/* Match Info Footer */}
              <div className="mt-1 w-full bg-black/40 backdrop-blur-md border border-white/10 rounded-2xl p-4 flex flex-col gap-1 relative overflow-hidden group-hover:bg-white/5 transition-colors">
                 <div className={`absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b ${isCancelled ? 'from-red-500' : isLive ? 'from-[#39FF14]' : isDraft ? 'from-amber-500' : 'from-[#FFB800]'} to-transparent opacity-80`} />
                 <h3 className="text-white font-black text-[15px] sm:text-[17px] tracking-tight leading-none truncate pl-3">{matchTitle}</h3>
                 <p className="text-gray-400 font-bold text-[10px] sm:text-[11px] truncate pl-3">
                   {isLive ? `✓ Tüm ödemeler yapıldı, maç yayında!` : isDraft ? `⚡ ${matchLocation} • Eksik mevkileri seçip davet gönder!` : matchLocation}
                 </p>
              </div>
            </>
          )}
      </div>
    </motion.div>
  );
};

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 30, scale: 0.95 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring" as const, stiffness: 300, damping: 24 } }
};


const Dashboard: React.FC<DashboardProps> = ({ onNavigate, onBack, selectedGk, selectedRef }) => {
  const { 
    initialLoadComplete, 
    globalTexts, 
    unreadNotificationsCount, 
    adminMatches, 
    myTeams, 
    setActiveStudioTeam, 
    setActiveDraftId, 
    setSelectedMatch, 
    updateMatch, 
    addUserNotification, 
    setMatchJoinReturnView,
    adminUsers,
    setNewMatchBadge,
    setIsNotificationsOpen
  } = useAppStore();
  const [isLoading, setIsLoading] = useState(!initialLoadComplete);
  const myDrafts = React.useMemo(() => adminMatches.filter(m => m.status === 'DRAFT'), [adminMatches]);
  const myUpcomingMatches = React.useMemo(() => adminMatches.filter(m => m.status !== 'DRAFT'), [adminMatches]);

  const currentUserUid = React.useMemo(() => {
    return 'u1'; // Default / local testing user
  }, []);

  const currentUserProfile = React.useMemo(() => {
    return adminUsers.find(u => u.id === currentUserUid);
  }, [adminUsers, currentUserUid]);

  const userMatches = React.useMemo(() => {
    return adminMatches.filter(m => {
      // 1. If draft, show
      if (m.status === 'DRAFT') return true;
      // 2. If cancelled, show
      if (m.status === 'CANCELLED') return true;
      // 3. If user u1 is in it
      const userInMatch = m.slots?.some(s => s.player?.id === currentUserUid) || m.awaySlots?.some(s => s.player?.id === currentUserUid);
      return userInMatch;
    });
  }, [adminMatches, currentUserUid]);

  const closestMatchPulse = React.useMemo(() => {
    const now = new Date();
    let minDiffMs = Infinity;

    const activeUpcoming = userMatches.filter(m => m.status !== 'CANCELLED');

    activeUpcoming.forEach(m => {
      const matchDate = parseMatchDate(m.date, m.time);
      if (matchDate) {
        const diffMs = matchDate.getTime() - now.getTime();
        if (diffMs > 0 && diffMs < minDiffMs) {
          minDiffMs = diffMs;
        }
      }
    });

    if (minDiffMs === Infinity) return 1.8;

    const diffHours = minDiffMs / (1000 * 60 * 60);
    if (diffHours < 2) return 0.4; // fast
    if (diffHours < 6) return 0.8; // medium
    return 1.8; // slow
  }, [userMatches]);

  const closestMatch = React.useMemo(() => {
    const activeUpcoming = userMatches.filter(m => m.status !== 'CANCELLED');
    if (activeUpcoming.length === 0) return null;
    return activeUpcoming.map(m => {
      const matchDate = parseMatchDate(m.date, m.time);
      return { match: m, date: matchDate };
    })
    .filter((entry): entry is { match: typeof adminMatches[0]; date: Date } => entry.date !== null)
    .sort((a, b) => a.date.getTime() - b.date.getTime())[0]?.match;
  }, [userMatches, adminMatches]);

  const buttonSubtitle = React.useMemo(() => {
    if (closestMatch) {
      return `Sıradaki: ${closestMatch.title} • ${closestMatch.time}`;
    }
    return 'Kadro ve maç lobileri merkezi';
  }, [closestMatch]);

  const COMMUNITIES = [
    { id: 'c1', name: 'Boğaziçi Üni', short: 'BOUN' },
    { id: 'c2', name: 'İTÜ', short: 'ITU' },
    { id: 'c3', name: 'ODTÜ', short: 'ODTU' },
  ];
  const [activeCommunity, setActiveCommunity] = useState(COMMUNITIES[0]);
  const [isCommunityDropdownOpen, setIsCommunityDropdownOpen] = useState(false);

  useEffect(() => {
    // ⚽ B2B SaaS Game Engine - 90-minute auto-cancel evaluation scan
    const scanAndAutoCancel = async () => {
      for (const m of adminMatches) {
        if (m.status !== 'CANCELLED' && m.status !== 'COMPLETED') {
          const shouldCancel = check90MinAutoCancel(m);
          if (shouldCancel) {
            const updated = { ...m, status: 'CANCELLED' as const };
            await updateMatch(updated);
            
            // Send premium user notification to alert the participant
            addUserNotification({
              id: `autocancel-${m.id}-${Date.now()}`,
              title: 'Maç İptal Edildi!',
              desc: `Yeterli oyuncu toplanamadığı için ${m.title} maçı otomatik iptal edildi. Ücretler iade edildi.`,
              time: 'Şimdi',
              type: 'error',
              iconName: 'AlertTriangle',
              color: 'bg-red-500',
              textColor: 'text-red-500'
            });
          }
        }
      }
    };

    scanAndAutoCancel();
  }, [adminMatches, updateMatch, addUserNotification]);

  useEffect(() => {
    if (initialLoadComplete) {
      setIsLoading(false);
    }
  }, [initialLoadComplete]);

  if (isLoading) return <DashboardSkeleton />;

  return (
    <div className="flex flex-col min-h-screen pb-6 bg-[#0A0E14] text-white font-sans selection:bg-[#FFFF00] selection:text-black">

      {/* Header */}
      <header className="px-6 pt-safe pb-4 flex justify-between items-center bg-transparent z-30">
        <div className="flex items-center gap-3">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="w-12 h-12 rounded-full bg-gradient-to-br from-[#161B22] to-[#0A0E14] border border-white/10 p-0.5 overflow-hidden shadow-[0_0_20px_rgba(57,255,20,0.15)] transition-colors"
            onClick={() => onNavigate('PROFILE')}
          >
            <img src="https://images.unsplash.com/photo-1517466787929-bc90951d0974?auto=format&fit=crop&q=80&w=150" alt="Profile" className="w-full h-full object-cover rounded-full" />
          </motion.button>
          <div>
            <h1 className="text-xl font-black text-white italic tracking-tighter leading-none uppercase">{globalTexts?.dashboardTitle || 'ANA SAYFA'}</h1>

          </div>
        </div>
        <div className="flex gap-3 relative">
          

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsNotificationsOpen(true)}
            className="w-12 h-12 flex items-center justify-center rounded-full bg-[#161B22]/80 backdrop-blur-md border border-white/5 text-gray-300 relative hover:bg-white/10 transition-colors shadow-lg"
          >
            <Bell size={20} />
            {unreadNotificationsCount > 0 ? (
              <span className="absolute -top-1 -right-1 min-w-[20px] h-[20px] px-1 bg-red-500 rounded-full shadow-[0_0_15px_rgba(239,68,68,0.6)] border-[3px] border-[#0A0E14] flex items-center justify-center text-[10px] font-black text-white">
                +{unreadNotificationsCount}
              </span>
            ) : (
              <span className="absolute top-3 right-3 w-2.5 h-2.5 bg-[#39FF14] rounded-full shadow-[0_0_10px_rgba(57,255,20,0.8)] animate-pulse border-2 border-[#161B22]"></span>
            )}
          </motion.button>
        </div>
      </header>

      {/* 2. MAÇLARIM Pulsing Button */}
      {userMatches.length > 0 && (
        <div className="px-6 mb-6 relative z-20">
          <motion.div
            onClick={() => {
              // Dismiss badge
              setNewMatchBadge(false);
              // Navigate to upcoming matches
              onNavigate('UPCOMING_MATCHES');
            }}
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{
              opacity: 1,
              y: 0,
              scale: 1,
              boxShadow: [
                `0 0 15px rgba(239, 68, 68, ${0.1 + (1.8 - closestMatchPulse) * 0.15})`,
                `0 0 45px rgba(239, 68, 68, ${0.35 + (1.8 - closestMatchPulse) * 0.35})`,
                `0 0 15px rgba(239, 68, 68, ${0.1 + (1.8 - closestMatchPulse) * 0.15})`
              ]
            }}
            transition={{
              boxShadow: {
                duration: closestMatchPulse,
                repeat: Infinity,
                ease: 'easeInOut'
              }
            }}
            whileHover={{ scale: 1.015 }}
            whileTap={{ scale: 0.985 }}
            className="w-full relative rounded-[28px] cursor-pointer group overflow-hidden border border-white/10 hover:border-white/20 transition-all bg-[#0F1319] bg-gradient-to-r from-[#0F1319] to-[#141A22]"
          >
            {/* Full button background pulsing red glow (acts like counter, increases with match closeness) */}
            <motion.div
              animate={{
                opacity: [0.03, 0.15 + (1.8 - closestMatchPulse) * 0.12, 0.03]
              }}
              transition={{
                duration: closestMatchPulse,
                repeat: Infinity,
                ease: 'easeInOut'
              }}
              className="absolute inset-0 bg-[#ef4444] pointer-events-none z-0"
            />

            {/* Glowing pulsing border effect */}
            <motion.div
              animate={{
                opacity: [0.15, 0.45, 0.15],
                boxShadow: [
                  'inset 0 0 15px rgba(239, 68, 68, 0.1)',
                  'inset 0 0 25px rgba(239, 68, 68, 0.25)',
                  'inset 0 0 15px rgba(239, 68, 68, 0.1)'
                ]
              }}
              transition={{
                duration: closestMatchPulse,
                repeat: Infinity,
                ease: 'easeInOut'
              }}
              className="absolute inset-0 rounded-[28px] pointer-events-none z-0"
            />

            {/* Red Laser Scan Line (sweeps full button height smoothly up and down) */}
            <motion.div
              animate={{ top: ['-40px', '100%', '-40px'] }}
              transition={{
                duration: 3.5,
                repeat: Infinity,
                ease: 'linear'
              }}
              className="absolute left-0 right-0 h-10 bg-gradient-to-b from-transparent via-red-500/30 to-transparent pointer-events-none z-10 top-0"
              style={{
                borderBottom: '3.5px solid rgba(239, 68, 68, 0.95)',
                boxShadow: '0 8px 35px 4px rgba(239, 68, 68, 0.75)'
              }}
            />

            <div className="relative z-10 py-6 px-7 flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                {/* Pulsing radar indicator */}
                <div className="relative flex h-4 w-4 items-center justify-center shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-600"></span>
                </div>
                
                <div className="flex flex-col">
                  <h3 className="text-white font-black text-lg sm:text-xl tracking-tighter italic uppercase leading-none">
                    MAÇLARIM
                  </h3>
                  <span className="text-xs sm:text-sm text-gray-300 font-medium uppercase tracking-wider mt-2 leading-none">
                    {buttonSubtitle}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                {currentUserProfile?.newMatchBadge && (
                  <motion.span
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ duration: 0.8, repeat: Infinity }}
                    className="px-3 py-1.5 text-[10px] font-black tracking-widest text-[#0A0E14] bg-[#FFFF00] rounded-xl shadow-[0_0_15px_rgba(255,255,0,0.6)] uppercase italic shrink-0"
                  >
                    YENİ MAÇ EKLENDİ
                  </motion.span>
                )}
                <ChevronRight size={20} className="text-gray-400 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* BENTO GRID LAYOUT */}
      <motion.main
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="px-4 xs:px-6 grid grid-cols-2 gap-3 xs:gap-4 auto-rows-min"
      >

        

        {/* Countdown Box removed from here and moved to the horizontal top slider */}



        {/* ═══ TOP OYNA — Ana Buton ═══ */}
        <AnimatedButton
          as="div"
          variants={itemVariants}
          whileHover={{ scale: 1.02, y: -3 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => onNavigate('MATCH_DISCOVERY')}
          className="col-span-2 min-h-[176px] py-6 rounded-[32px] relative overflow-hidden group cursor-pointer border border-black/20"
          style={{ boxShadow: '0 0 60px rgba(255,255,0,0.35), 0 0 120px rgba(255,215,0,0.15), inset 0 1px 0 rgba(255,255,255,0.2)' }}
        >
          {/* Sarı → Siyah ana gradient */}
          <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, #FFFF00 0%, #FFD700 25%, #FFC107 45%, #1a1600 75%, #000000 100%)' }} />
          {/* Animated sweep — koyu tarafta neon yeşili vurgu */}
          <motion.div
            animate={{ backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] }}
            transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute inset-0 pointer-events-none opacity-40"
            style={{ background: 'radial-gradient(ellipse at 80% 50%, rgba(57,255,20,0.25) 0%, transparent 60%)', backgroundSize: '200% 200%' }}
          />
          {/* Carbon texture */}
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20 pointer-events-none" />
          {/* Sol taraf sarı parlaması (metin bölgesi) */}
          <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(90deg, rgba(255,255,0,0.15) 0%, transparent 50%)' }} />
          {/* Shimmer */}
          <motion.div
            className="absolute inset-0 pointer-events-none"
            animate={{ x: ['-100%', '200%'] }}
            transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', repeatDelay: 4 }}
            style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)', transform: 'skewX(-20deg)' }}
          />

          {/* Content */}
          <div className="absolute inset-0 p-6 flex items-center justify-between">
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-2">
                <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 1.5, repeat: Infinity }}>
                  <Flame size={16} className="text-black fill-black drop-shadow-[0_0_6px_rgba(0,0,0,0.6)]" />
                </motion.div>
                <span className="text-black text-[10px] font-black uppercase tracking-[0.3em]">Sahaya Çık</span>
              </div>
              <h2 className="text-5xl font-black text-black italic uppercase leading-[0.85] tracking-tighter" style={{ textShadow: '0 2px 8px rgba(255,255,0,0.3)' }}>Top<br />Oyna</h2>
              <p className="text-[10px] text-black/60 mt-2 font-bold">Hemen bir maça katıl ve oynamaya başla.</p>
            </div>

            {/* OYNA LOGO — sağ taraf, siyah zemin üzerinde parlak sarı */}
            <div className="relative w-32 h-32 flex items-center justify-center shrink-0">
              {/* Arka plan disk — koyu kısım */}
              <div className="absolute inset-0 rounded-full" style={{ background: 'radial-gradient(circle, #0A0E14 0%, #000000 100%)', boxShadow: '0 0 30px rgba(0,0,0,0.8), inset 0 0 20px rgba(0,0,0,0.5)' }} />
              {/* Dış halka */}
              <motion.div
                animate={{ opacity: [0.4, 1, 0.4], scale: [1, 1.04, 1] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute inset-0 rounded-full border-2"
                style={{ borderColor: 'rgba(255,255,0,0.6)', boxShadow: '0 0 20px rgba(255,255,0,0.4), inset 0 0 10px rgba(255,255,0,0.1)' }}
              />
              {/* İkinci parlama halkası */}
              <motion.div
                animate={{ opacity: [0.1, 0.4, 0.1], scale: [1.05, 1.15, 1.05] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute rounded-full border"
                style={{ inset: '-6px', borderColor: 'rgba(255,255,0,0.2)' }}
              />
              {/* Rotate animasyonu ile logo */}
              <motion.div
                animate={{ rotate: [0, 4, -4, 0] }}
                transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
                className="relative z-10"
              >
                <OynaLogo
                  width={82}
                  height={82}
                  animate={false}
                  className="drop-shadow-[0_0_16px_rgba(255,255,0,0.9)]"
                />
              </motion.div>
            </div>
          </div>
        </AnimatedButton>

        {/* ═══════════════════════════════════════════════════════════════════
            MAÇ OLUŞTUR — VERSİYON A (AKTİF)
            Stil: Saha Vitrini / Maça Katıl / Rakip Bul ile aynı dil.
            Amber dolgu, carbon-fibre doku, sol başlık + sağ yuvarlak ikon.
        ═══════════════════════════════════════════════════════════════════ */}
        <AnimatedButton
          as="div"
          variants={itemVariants}
          whileHover={{ scale: 1.02, y: -2 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onNavigate('MATCH_CREATE')}
          className="col-span-2 min-h-[128px] py-5 premium-glass-card premium-glass-card-hover relative overflow-hidden group cursor-pointer button-neon-glow-yellow"
          style={{ borderColor: 'rgba(245,158,11,0.2)' }}
        >
          {/* Carbon Fibre Texture */}
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20 pointer-events-none" />
          {/* Gradient fade to protect text */}
          <div className="absolute inset-0 bg-gradient-to-r from-amber-500/15 via-transparent to-transparent pointer-events-none" />
          {/* Content */}
          <div className="absolute inset-0 p-5 flex items-center justify-between">
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-1">
                <Swords size={18} className="text-amber-400" />
                <span className="text-amber-400 text-xs font-bold uppercase tracking-widest">Kaptan Modu</span>
              </div>
              <h2 className="text-3xl font-black text-white italic uppercase leading-none drop-shadow-md">Maç<br />Oluştur</h2>
              <p className="text-[10px] text-amber-100 mt-1 font-bold">Takımını kur, sahayı seç, oyna.</p>
            </div>
            <div className="w-24 h-24 bg-amber-500/10 rounded-full flex items-center justify-center backdrop-blur-sm border-4 border-amber-500/20 group-hover:scale-110 transition-transform">
              <Swords size={40} className="text-amber-400" />
            </div>
          </div>
        </AnimatedButton>

        {/* ═══════════════════════════════════════════════════════════════════
            MAÇ OLUŞTUR — VERSİYON B (YEDEK 1)
            Stil: Koyu arka plan + altın gradient çerçeve + saha çizgileri.
            Daha koyu ve "gece maçı" hissiyatı. Aktif etmek için:
            → Üstteki A bloğunu sil veya yorum yap
            → Aşağıdaki bloğun { ve } yorum kapaklarını kaldır
        ═══════════════════════════════════════════════════════════════════
        <AnimatedButton
          as="div"
          variants={itemVariants}
          whileHover={{ scale: 1.02, y: -2 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onNavigate('MATCH_CREATE')}
          className="col-span-2 h-32 bg-[#0A0E14] rounded-[32px] relative overflow-hidden group cursor-pointer border border-amber-500/40 shadow-[0_0_30px_rgba(217,119,6,0.15)]"
        >
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-40 pointer-events-none"></div>
          <div className="absolute inset-0 bg-gradient-to-r from-amber-600/20 via-transparent to-amber-600/10 pointer-events-none"></div>
          <div className="absolute inset-0 p-5 flex items-center justify-between">
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-1">
                <Swords size={18} className="text-amber-400" />
                <span className="text-amber-400 text-xs font-bold uppercase tracking-widest">Kaptan Modu</span>
              </div>
              <h2 className="text-3xl font-black text-white italic uppercase leading-none drop-shadow-md">Maç<br />Oluştur</h2>
              <p className="text-[10px] text-amber-300/80 mt-1 font-bold">Takımını kur, sahayı seç, oyna.</p>
            </div>
            <div className="w-24 h-24 bg-amber-500/10 rounded-full flex items-center justify-center backdrop-blur-sm border-4 border-amber-500/30 group-hover:scale-110 group-hover:border-amber-400/60 transition-all">
              <Swords size={40} className="text-amber-400" />
            </div>
          </div>
        </AnimatedButton>
        */}

        {/* ═══════════════════════════════════════════════════════════════════
            MAÇ OLUŞTUR — VERSİYON C (YEDEK 2)
            Stil: Beyaz/Gümüş minimal. Apple estetiği, temiz ve keskin.
            Aktif etmek için:
            → Üstteki A bloğunu sil veya yorum yap
            → Aşağıdaki bloğun { ve } yorum kapaklarını kaldır
        ═══════════════════════════════════════════════════════════════════
        <AnimatedButton
          as="div"
          variants={itemVariants}
          whileHover={{ scale: 1.02, y: -2 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onNavigate('MATCH_CREATE')}
          className="col-span-2 h-32 bg-white rounded-[32px] relative overflow-hidden group cursor-pointer shadow-[0_0_30px_rgba(255,255,255,0.1)]"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-white via-gray-100 to-gray-200 pointer-events-none"></div>
          <div className="absolute inset-0 p-5 flex items-center justify-between">
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-1">
                <Swords size={18} className="text-gray-900" />
                <span className="text-gray-900 text-xs font-bold uppercase tracking-widest">Kaptan Modu</span>
              </div>
              <h2 className="text-3xl font-black text-gray-900 italic uppercase leading-none">Maç<br />Oluştur</h2>
              <p className="text-[10px] text-gray-500 mt-1 font-bold">Takımını kur, sahayı seç, oyna.</p>
            </div>
            <div className="w-24 h-24 bg-gray-900/5 rounded-full flex items-center justify-center border-4 border-gray-900/10 group-hover:scale-110 group-hover:bg-gray-900/10 transition-all">
              <Swords size={40} className="text-gray-900" />
            </div>
          </div>
        </AnimatedButton>
        */}

        {/* Community Button (FULL WIDTH) */}
        <AnimatedButton
          as="div"
          variants={itemVariants}
          whileHover={{ scale: 1.02, y: -2 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onNavigate('COMMUNITY_VIEW')}
          className="col-span-2 min-h-[128px] py-5 premium-glass-card premium-glass-card-hover relative overflow-hidden group cursor-pointer button-neon-glow-yellow"
          style={{ borderColor: 'rgba(251,146,60,0.2)' }}
        >
          {/* Intertwined Geometric Mesh Pattern (No Circles) */}
          <div className="absolute inset-0 pointer-events-none opacity-[0.12]">
            <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="community-mesh" width="40" height="40" patternUnits="userSpaceOnUse" patternTransform="scale(1.5) rotate(45)">
                  {/* Interlocking squares/diamonds symbolizing structured community */}
                  <rect x="0" y="0" width="24" height="24" fill="none" stroke="black" strokeWidth="3" />
                  <rect x="16" y="16" width="24" height="24" fill="none" stroke="black" strokeWidth="3" />
                  <path d="M 24 0 L 24 16 M 0 24 L 16 24 M 40 16 L 40 24 M 16 40 L 24 40" stroke="black" strokeWidth="3" fill="none" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#community-mesh)" />
            </svg>
          </div>
          <div className="absolute inset-0 bg-gradient-to-r from-orange-500/15 via-transparent to-transparent pointer-events-none" />
          <div className="absolute inset-0 p-5 flex items-center justify-between">
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-1">
                <Users size={18} className="text-orange-400" />
                <span className="text-orange-400 text-xs font-bold uppercase tracking-widest">Sosyal</span>
              </div>
              <h2 className="text-lg xs:text-xl sm:text-2xl font-black text-white italic uppercase leading-none drop-shadow-sm">Topluluklar, Takımlarım ve Arkadaşlarım</h2>
              <p className="text-[10px] text-orange-200 mt-1 font-bold">Üniversite ve şirket ligleri.</p>
            </div>
            <div className="w-24 h-24 bg-orange-500/10 rounded-full flex items-center justify-center backdrop-blur-sm border-4 border-orange-500/20 group-hover:scale-110 transition-transform">
              <Users size={40} className="text-orange-400" />
            </div>
          </div>
        </AnimatedButton>

        {/* KALECİLER */}
        <AnimatedButton
          as="div"
          variants={itemVariants}
          onClick={() => onNavigate('MARKETPLACE_GK')}
          whileHover={{ scale: 1.03, y: -5 }}
          whileTap={{ scale: 0.97 }}
          className="h-40 premium-glass-card premium-glass-card-hover relative overflow-hidden group cursor-pointer button-neon-glow-green"
          style={{ borderColor: 'rgba(57,255,20,0.2)' }}
        >
          {/* Fluid animated gradient */}
          <motion.div
            className="absolute inset-0"
            animate={{ backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] }}
            transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              background: 'linear-gradient(135deg, #011a07, #0a3d12, #39FF14, #0a3d12, #011a07)',
              backgroundSize: '300% 300%',
            }}
          />
          {/* Scale / sequin pattern — animated drift */}
          <motion.div
            className="absolute inset-0 pointer-events-none"
            animate={{ backgroundPosition: ['0px 0px', '28px 28px'] }}
            transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='28'%3E%3Cellipse cx='14' cy='14' rx='9' ry='6' fill='none' stroke='rgba(57,255,20,0.12)' stroke-width='0.8'/%3E%3C/svg%3E")`,
              backgroundSize: '28px 28px',
            }}
          />
          {/* Depth overlay */}
          <div className="absolute inset-0 bg-black/45" />
          {/* Shimmer */}
          <motion.div
            className="absolute inset-0 pointer-events-none"
            animate={{ x: ['-100%', '150%'] }}
            transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', repeatDelay: 6 }}
            style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.07), transparent)', transform: 'skewX(-20deg)' }}
          />
          {/* Content */}
          <div className="relative z-10 h-full flex flex-col justify-between p-4 xs:p-5">
            <motion.div
              animate={{ y: [0, -4, 0] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
              className="w-11 h-11 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(57,255,20,0.15)', border: '1px solid rgba(57,255,20,0.5)', color: '#39FF14' }}
            >
              <Shield size={22} />
            </motion.div>
            <div>
              <motion.h3
                animate={{ textShadow: ['0 0 8px rgba(57,255,20,0.5)', '0 0 24px rgba(57,255,20,1)', '0 0 8px rgba(57,255,20,0.5)'] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                className="text-lg xs:text-2xl font-black italic tracking-tighter leading-none"
                style={{ color: '#39FF14' }}
              >
                KALECİLER
              </motion.h3>
            </div>
          </div>
        </AnimatedButton>

        {/* HAKEMLER */}
        <AnimatedButton
          as="div"
          variants={itemVariants}
          onClick={() => onNavigate('MARKETPLACE_REF')}
          whileHover={{ scale: 1.03, y: -5 }}
          whileTap={{ scale: 0.97 }}
          className="h-40 premium-glass-card premium-glass-card-hover relative overflow-hidden group cursor-pointer button-neon-glow-blue"
          style={{ borderColor: 'rgba(59,130,246,0.2)' }}
        >
          {/* Fluid animated gradient */}
          <motion.div
            className="absolute inset-0"
            animate={{ backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] }}
            transition={{ duration: 26, repeat: Infinity, ease: 'easeInOut', delay: 0.8 }}
            style={{
              background: 'linear-gradient(135deg, #020b18, #0a2240, #3b82f6, #0a2240, #020b18)',
              backgroundSize: '300% 300%',
            }}
          />
          {/* Diamond / referee jersey pattern — animated drift */}
          <motion.div
            className="absolute inset-0 pointer-events-none"
            animate={{ backgroundPosition: ['0px 0px', '-32px 32px'] }}
            transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32'%3E%3Cpolygon points='16,4 28,16 16,28 4,16' fill='none' stroke='rgba(96,165,250,0.13)' stroke-width='0.9'/%3E%3C/svg%3E")`,
              backgroundSize: '32px 32px',
            }}
          />
          {/* Depth overlay */}
          <div className="absolute inset-0 bg-black/45" />
          {/* Shimmer */}
          <motion.div
            className="absolute inset-0 pointer-events-none"
            animate={{ x: ['-100%', '150%'] }}
            transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', repeatDelay: 7 }}
            style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.07), transparent)', transform: 'skewX(-20deg)' }}
          />
          {/* Content */}
          <div className="relative z-10 h-full flex flex-col justify-between p-4 xs:p-5">
            <motion.div
              animate={{ y: [0, -4, 0] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
              className="w-11 h-11 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(99,179,255,0.5)', color: '#60a5fa' }}
            >
              <Scale size={22} />
            </motion.div>
            <div>
              <motion.h3
                animate={{ textShadow: ['0 0 8px rgba(59,130,246,0.5)', '0 0 24px rgba(99,179,255,1)', '0 0 8px rgba(59,130,246,0.5)'] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
                className="text-lg xs:text-2xl font-black italic tracking-tighter leading-none"
                style={{ color: '#60a5fa' }}
              >
                HAKEMLER
              </motion.h3>
            </div>
          </div>
        </AnimatedButton>

        {/* 3. Pitch Booking (FULL WIDTH) */}
        <AnimatedButton
          as="div"
          variants={itemVariants}
          whileHover={{ scale: 1.02, y: -2 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onNavigate('PITCH_DISCOVERY')}
          className="col-span-2 min-h-[128px] py-5 premium-glass-card premium-glass-card-hover relative overflow-hidden group cursor-pointer button-neon-glow-green"
          style={{ borderColor: 'rgba(34,197,94,0.2)' }}
        >
          {/* Vektörel Futbol Sahası Deseni */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {/* Grass Stripes */}
            <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 40px, rgba(0,0,0,0.15) 40px, rgba(0,0,0,0.15) 80px)' }}></div>

            {/* Pitch SVG */}
            <div className="absolute inset-0 w-full h-full opacity-30">
              <svg viewBox="0 0 1050 680" preserveAspectRatio="xMidYMid slice" className="w-full h-full drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]" xmlns="http://www.w3.org/2000/svg">
                <g stroke="white" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round">
                  {/* Outer Boundary */}
                  <rect x="25" y="25" width="1000" height="630" />
                  {/* Halfway Line */}
                  <line x1="525" y1="25" x2="525" y2="655" />
                  {/* Center Circle */}
                  <circle cx="525" cy="340" r="90" />
                  {/* Center Spot */}
                  <circle cx="525" cy="340" r="4" fill="white" />

                  {/* Left Penalty Area */}
                  <rect x="25" y="140" width="165" height="400" />
                  {/* Left Goal Area */}
                  <rect x="25" y="240" width="55" height="200" />
                  {/* Left Penalty Spot */}
                  <circle cx="120" cy="340" r="4" fill="white" />
                  {/* Left Penalty Arc */}
                  <path d="M 190 260 A 90 90 0 0 1 190 420" />

                  {/* Right Penalty Area */}
                  <rect x="860" y="140" width="165" height="400" />
                  {/* Right Goal Area */}
                  <rect x="970" y="240" width="55" height="200" />
                  {/* Right Penalty Spot */}
                  <circle cx="930" cy="340" r="4" fill="white" />
                  {/* Right Penalty Arc */}
                  <path d="M 860 260 A 90 90 0 0 0 860 420" />

                  {/* Corner Arcs */}
                  <path d="M 65 25 A 40 40 0 0 0 25 65" />
                  <path d="M 25 615 A 40 40 0 0 0 65 655" />
                  <path d="M 985 25 A 40 40 0 0 1 1025 65" />
                  <path d="M 1025 615 A 40 40 0 0 1 985 655" />
                </g>
              </svg>
            </div>

            {/* Gradient Fade to protect text */}
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/15 via-transparent to-transparent"></div>
          </div>
          <div className="absolute inset-0 p-5 flex items-center justify-between">
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-1">
                <MapPin size={18} className="text-[#39FF14]" />
                <span className="text-[#39FF14] text-xs font-bold uppercase tracking-widest">Rezervasyon</span>
              </div>
              <h2 className="text-3xl font-black text-white italic uppercase leading-none drop-shadow-md">Saha<br />Vitrini</h2>
              <p className="text-[10px] text-lime-100 mt-1 font-bold">Uygun sahaları gör.</p>
            </div>
            <div className="w-24 h-24 bg-emerald-500/10 rounded-full flex items-center justify-center backdrop-blur-sm border-4 border-emerald-500/20 group-hover:scale-110 transition-transform">
              <MapPin size={40} className="text-[#39FF14]" />
            </div>
          </div>
        </AnimatedButton>

        {/* Rezervasyonlarım — saha kiralamalarını görüntüle/iptal et */}
        <AnimatedButton
          as="div"
          variants={itemVariants}
          whileHover={{ scale: 1.02, y: -2 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onNavigate('MY_BOOKINGS')}
          className="col-span-2 py-4 premium-glass-card premium-glass-card-hover relative overflow-hidden group cursor-pointer"
          style={{ borderColor: 'rgba(255,255,255,0.08)' }}
        >
          <div className="px-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-[#39FF14]">
                <CalendarCheck size={20} />
              </div>
              <div>
                <h3 className="text-base font-black text-white italic uppercase leading-none">Rezervasyonlarım</h3>
                <p className="text-[10px] text-gray-400 mt-1 font-bold">Saha kiralamalarını yönet</p>
              </div>
            </div>
            <ChevronRight size={20} className="text-gray-500 group-hover:translate-x-1 transition-transform" />
          </div>
        </AnimatedButton>

        {/* 6. Studio Box (FULL WIDTH) */}
        <AnimatedButton
          as="div"
          variants={itemVariants}
          onClick={() => onNavigate('STUDIO')}
          whileHover={{ scale: 1.02, y: -2 }}
          whileTap={{ scale: 0.98 }}
          className="col-span-2 min-h-[176px] py-6 premium-glass-card premium-glass-card-hover relative overflow-hidden group cursor-pointer button-neon-glow-green flex flex-col justify-between p-5 xs:p-6"
          style={{ borderColor: 'rgba(57,255,20,0.2)' }}
        >
          {/* Soccer Pitch Background Pattern */}
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none">
            <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
              <rect x="0" y="0" width="100" height="100" fill="none" stroke="#39FF14" strokeWidth="0.5" />
              <line x1="50" y1="0" x2="50" y2="100" stroke="#39FF14" strokeWidth="0.5" />
              <circle cx="50" cy="50" r="15" fill="none" stroke="#39FF14" strokeWidth="0.5" />
              <rect x="0" y="30" width="15" height="40" fill="none" stroke="#39FF14" strokeWidth="0.5" />
              <rect x="85" y="30" width="15" height="40" fill="none" stroke="#39FF14" strokeWidth="0.5" />
            </svg>
          </div>

          <div className="flex justify-between items-start relative z-10">
            <motion.div
              animate={{
                rotate: [0, 10, -10, 0],
                scale: [1, 1.1, 1]
              }}
              transition={{ duration: 5, repeat: Infinity }}
              className="w-14 h-14 bg-[#39FF14]/10 backdrop-blur-md rounded-2xl flex items-center justify-center text-[#39FF14] border border-[#39FF14]/20"
            >
              <Target size={28} />
            </motion.div>
            <div className="flex -space-x-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="w-8 h-8 rounded-full border-2 border-[#050812] bg-[#161B22] flex items-center justify-center overflow-hidden">
                  <img src={`https://i.pravatar.cc/100?u=player${i}`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </div>
              ))}
              <div className="w-8 h-8 rounded-full border-2 border-[#050812] bg-[#39FF14] flex items-center justify-center text-[10px] font-black text-black">
                +8
              </div>
            </div>
          </div>

          <div className="relative z-10 flex justify-between items-end">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Sparkles size={14} className="text-[#39FF14]" />
                <p className="text-[10px] text-[#39FF14] font-black uppercase tracking-[0.2em]">Strateji & Analiz</p>
              </div>
              <h2 className="text-3xl font-black text-white italic leading-none">TAKTİK ZEKA</h2>
            </div>
            <motion.div
              animate={{ x: [0, 5, 0] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="bg-[#39FF14] text-black p-3 rounded-2xl shadow-[0_0_20px_rgba(57,255,20,0.4)]"
            >
              <MousePointer2 size={20} />
            </motion.div>
          </div>
        </AnimatedButton>
      </motion.main>

    </div>
  );
};

export default Dashboard;
