import React, { useMemo, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Clock, MapPin, Calendar, Info } from 'lucide-react';
import { AppView, MatchListing } from '../types';
import { useAppStore } from '../store';

interface UpcomingMatchesViewProps {
  onBack: () => void;
  onNavigate: (view: AppView) => void;
}

const parseMatchDate = (date: string, time: string): Date | null => {
  try {
    if (date.includes('-')) {
      return new Date(`${date}T${time}:00`);
    }
    const today = new Date();
    const [hours, minutes] = time.split(':').map(Number);
    today.setHours(hours, minutes, 0, 0);

    if (date === 'Yarın') {
      today.setDate(today.getDate() + 1);
    }
    return today;
  } catch {
    return null;
  }
};

const calculateEndTime = (timeStr: string) => {
  try {
    const [h, m] = timeStr.split(':').map(Number);
    const endH = (h + 1) % 24;
    return `${String(endH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  } catch {
    return '22:00';
  }
};

const getNormalizedDifficulty = (diff?: string): string => {
  if (!diff) return 'Rahat';
  const d = diff.trim().toLowerCase();
  if (d === 'ciddi' || d === 'pro') return 'Ciddi';
  if (d === 'taktiksel' || d === 'yarı-pro' || d === 'yari-pro' || d === 'yarı pro' || d === 'yari pro') return 'Taktiksel';
  if (d === 'rahat' || d === 'amatör' || d === 'amator' || d === 'eğlence' || d === 'eglence') return 'Rahat';
  return diff.charAt(0).toUpperCase() + diff.slice(1);
};

const KalanSure: React.FC<{ timeStr: string; dateStr: string }> = ({ timeStr, dateStr }) => {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const matchDate = parseMatchDate(dateStr, timeStr);

      if (matchDate) {
        const diff = matchDate.getTime() - now.getTime();
        if (diff > 0) {
          const h = Math.floor(diff / (1000 * 60 * 60));
          const m = Math.floor((diff / (1000 * 60)) % 60);
          const s = Math.floor((diff / 1000) % 60);

          if (h > 0) {
            setTimeLeft(`${h}s ${m}dk`);
          } else {
            setTimeLeft(`${m}dk ${s}sn`);
          }
        } else {
          setTimeLeft('Maç Başladı');
        }
      } else {
        setTimeLeft('Maç Başladı');
      }
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [timeStr, dateStr]);

  return (
    <div className="flex flex-col items-end">
      <span className="text-[9px] font-black text-[#FFFF00] tracking-wider leading-none">KALAN SÜRE</span>
      <span className="text-xs sm:text-sm font-black text-white mt-1.5 leading-none tracking-tight tabular-nums">{timeLeft}</span>
    </div>
  );
};

const UpcomingMatchesView: React.FC<UpcomingMatchesViewProps> = ({ onBack, onNavigate }) => {
  const { adminMatches, setSelectedMatch } = useAppStore();
  const currentUserUid = 'u1';
  const [activeTab, setActiveTab] = useState<'UPCOMING' | 'CANCELLED'>('UPCOMING');

  const userMatches = useMemo(() => {
    return adminMatches.filter(m => {
      // 1. If draft, show
      if (m.status === 'DRAFT') return true;
      // 2. If cancelled, show
      if (m.status === 'CANCELLED') return true;
      // 3. If user is in it
      const userInMatch = m.slots?.some(s => s.player?.id === currentUserUid) || m.awaySlots?.some(s => s.player?.id === currentUserUid);
      return userInMatch;
    });
  }, [adminMatches]);

  const sortedActiveMatches = useMemo(() => {
    const active = userMatches.filter(m => m.status !== 'CANCELLED');
    // Sort by date and time (closest first)
    active.sort((a, b) => {
      const dateA = parseMatchDate(a.date, a.time) || new Date();
      const dateB = parseMatchDate(b.date, b.time) || new Date();
      return dateA.getTime() - dateB.getTime();
    });
    return active;
  }, [userMatches]);

  const cancelledMatches = useMemo(() => {
    return userMatches.filter(m => m.status === 'CANCELLED');
  }, [userMatches]);

  const displayList = activeTab === 'UPCOMING' ? sortedActiveMatches : cancelledMatches;

  return (
    <div className="min-h-screen bg-[#0A0E14] text-white flex flex-col relative font-sans selection:bg-[#FFFF00] selection:text-black">
      {/* Background overlay */}
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-15 mix-blend-overlay pointer-events-none" />

      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#0A0E14]/90 backdrop-blur-xl border-b border-white/5 pt-safe">
        <div className="p-4 pb-3 flex items-center justify-between relative z-10 gap-3">
          <button 
            onClick={onBack} 
            className="p-2 bg-[#161B22] rounded-full text-white border border-white/5 hover:bg-white/10 transition-colors shrink-0"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="text-center flex-1 min-w-0">
            <h1 className="text-base sm:text-lg font-black text-white italic uppercase tracking-tighter leading-none drop-shadow-lg truncate">Sıradaki Maçlarım</h1>
            <p className="text-[9px] text-gray-500 uppercase tracking-widest mt-1 truncate">Kadro & Maç Lobisi Merkezi</p>
          </div>
          
          {/* Small top-right toggle button for Cancelled Matches */}
          <button
            onClick={() => setActiveTab(activeTab === 'UPCOMING' ? 'CANCELLED' : 'UPCOMING')}
            className={`px-2.5 py-1.5 rounded-xl border text-[9px] font-black italic uppercase tracking-wider transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
              activeTab === 'CANCELLED'
                ? 'bg-[#ef4444] text-white border-[#ef4444] shadow-[0_0_12px_rgba(239,68,68,0.3)]'
                : 'bg-[#161B22] text-red-500 border-[#ef4444]/35 hover:border-[#ef4444]/60'
            }`}
          >
            <div className={`w-1.5 h-1.5 rounded-full ${activeTab === 'CANCELLED' ? 'bg-white animate-pulse' : 'bg-[#ef4444]'}`} />
            <span>İptal Olanlar</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-4 overflow-y-auto space-y-4 custom-scrollbar pb-24 relative z-10">
        <AnimatePresence mode="wait">
          {displayList.length > 0 ? (
            <motion.div 
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {displayList.map((match, index) => {
                const isCancelled = match.status === 'CANCELLED';
                const stripeColor = isCancelled ? '#ef4444' : '#FFFF00';
                
                const totalSlots = match.slots ? match.slots.length : 14;
                const filledSlots = match.slots ? match.slots.filter(s => s.status === 'TAKEN').length : 0;

                const hasHiredReferee = !!match.refereeId;
                const hasHiredGoalkeeper = match.slots?.some(s => (s.role === 'GK' || s.role === 'KL' || s.role === 'KALECİ' || s.role === 'KL') && s.status === 'TAKEN');

                // Extract avatars
                const avatars = match.slots
                  ? match.slots.filter(s => s.status === 'TAKEN' && s.player?.avatar).map(s => s.player!.avatar)
                  : [];
                const fallbackAvatars = [
                  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=80',
                  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=80',
                  'https://images.unsplash.com/photo-1599566150163-29194dcaad36?auto=format&fit=crop&q=80&w=80'
                ];
                const displayAvatars = avatars.length > 0 ? avatars.slice(0, 3) : fallbackAvatars;
                const extraPlayers = Math.max(0, filledSlots - displayAvatars.length);

                return (
                  <motion.div
                    key={match.id}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.05 }}
                    onClick={() => {
                      if (!isCancelled) {
                        setSelectedMatch(match);
                        onNavigate('MATCH_JOIN');
                      }
                    }}
                    className={`w-full bg-[#12161F] hover:bg-[#161B26] border border-white/5 rounded-[24px] overflow-hidden flex relative transition-all group ${
                      isCancelled ? 'cursor-default' : 'cursor-pointer active:scale-[0.99]'
                    }`}
                    style={{
                      boxShadow: isCancelled 
                        ? '0 4px 20px -5px rgba(239,68,68,0.05)'
                        : '0 4px 20px -5px rgba(255,255,0,0.05)'
                    }}
                  >
                    {/* Left accent vertical stripe */}
                    <div 
                      className="w-1.5 shrink-0" 
                      style={{ backgroundColor: stripeColor }}
                    />

                    {/* Card content body */}
                    <div className="flex-1 p-5 flex flex-col justify-between min-w-0">
                      {/* Top Row: Title, Location and Time range pill */}
                      <div className="flex justify-between items-start gap-4">
                        <div className="min-w-0">
                          <h3 className="text-white text-base sm:text-lg font-black italic uppercase leading-none tracking-tight truncate">
                            {match.location} • {match.date}
                          </h3>
                          <div className="flex flex-wrap items-center gap-1.5 text-[9px] sm:text-[10px] text-gray-400 mt-2.5 font-bold uppercase tracking-wider">
                            <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/5 text-white">{getNormalizedDifficulty(match.difficulty)}</span>
                            {hasHiredReferee && (
                              <>
                                <span>•</span>
                                <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                                  ✓ Hakem Kiralandı
                                </span>
                              </>
                            )}
                            {hasHiredGoalkeeper && (
                              <>
                                <span>•</span>
                                <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                                  ✓ Kaleci Kiralandı
                                </span>
                              </>
                            )}
                            {match.badges && match.badges.length > 0 && (
                              <>
                                <span>•</span>
                                <span className="text-[#FFFF00]">{match.badges[0]}</span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Hour bubble */}
                        <div className="bg-[#19202E] border border-white/5 rounded-full px-3 py-1.5 flex items-center gap-1.5 text-[11px] font-black tracking-widest text-white shrink-0">
                          <Clock size={11} style={{ color: stripeColor }} />
                          <span>{match.time} - {calculateEndTime(match.time)}</span>
                        </div>
                      </div>

                      {/* Middle Row: Avatars/Info or Cancelled reason */}
                      <div className="mt-4 flex items-center justify-between gap-4">
                        {isCancelled ? (
                          <div className="flex flex-col gap-1">
                            <p className="text-red-400 font-bold text-[11px] sm:text-xs uppercase tracking-wide flex items-center gap-1">
                              <Info size={12} className="text-red-400 shrink-0" />
                              {match.cancelReason || 'Bu maç için yeterli doluluk sağlanamadı.'}
                            </p>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3">
                            {/* Overlapping Avatars */}
                            <div className="flex -space-x-2">
                              {displayAvatars.map((url, i) => (
                                <img 
                                  key={i} 
                                  src={url} 
                                  className="w-8 h-8 rounded-full border-2 border-[#12161F] object-cover shrink-0" 
                                  alt="avatar"
                               />
                              ))}
                              {extraPlayers > 0 ? (
                                <div className="w-8 h-8 rounded-full border-2 border-[#12161F] bg-[#FFFF00] flex items-center justify-center text-[10px] font-black text-[#0A0E14] shrink-0 shadow-lg">
                                  +{extraPlayers}
                                </div>
                              ) : (
                                filledSlots > displayAvatars.length && (
                                  <div className="w-8 h-8 rounded-full border-2 border-[#12161F] bg-[#FFFF00] flex items-center justify-center text-[10px] font-black text-[#0A0E14] shrink-0 shadow-lg">
                                    +{filledSlots - displayAvatars.length}
                                  </div>
                                )
                              )}
                            </div>

                            {/* Capacity Label */}
                            <div className="flex flex-col">
                              <span className="text-[9px] font-black text-gray-500 tracking-wider uppercase leading-none">KADRO</span>
                              <span className="text-xs font-black text-white mt-1.5 leading-none">{filledSlots}/{totalSlots}</span>
                            </div>
                          </div>
                        )}

                        {/* Right Part: Countdown or Cancel status details */}
                        {isCancelled ? (
                          <div className="flex flex-col items-end">
                            <span className="text-[9px] font-black text-red-500 tracking-wider leading-none">MAÇ İPTAL EDİLDİ</span>
                            <span className="text-xs sm:text-sm font-black text-white/70 mt-1.5 leading-none uppercase tracking-wide">
                              {match.refundStatus || 'Ücret alınmadı'}
                            </span>
                          </div>
                        ) : (
                          <KalanSure timeStr={match.time} dateStr={match.date} />
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          ) : (
            <motion.div 
              key={`empty-${activeTab}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col items-center justify-center h-64 text-center px-4 relative z-10"
            >
              <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4 border border-white/10">
                <Clock size={32} className={`${activeTab === 'UPCOMING' ? 'text-[#FFFF00]/40' : 'text-[#ef4444]/40'}`} />
              </div>
              <h3 className="text-lg font-black italic uppercase text-white mb-2 drop-shadow-lg">Maç Bulunamadı</h3>
              <p className="text-xs text-white/50 tracking-widest uppercase">
                {activeTab === 'UPCOMING' ? 'Yaklaşan aktif bir maçınız bulunmuyor.' : 'İptal edilmiş bir maçınız bulunmuyor.'}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
};

export default UpcomingMatchesView;
