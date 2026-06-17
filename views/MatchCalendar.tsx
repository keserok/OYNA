
import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Plus, Calendar, MapPin, Clock, Users, ArrowRight, Search, Key, LayoutGrid, X } from 'lucide-react';
import { AppView } from '../types';
import { useAppStore } from '../store';
import { auth } from '../supabaseAuth';

interface MatchCalendarProps {
  onBack: () => void;
  onNavigate: (view: AppView) => void;
}

interface UpcomingMatch {
  id: string;
  title: string;
  pitchName: string;
  time: string;
  date: string;
  timeLeftSeconds: number;
  playersCount: number;
  maxPlayers: number;
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

const countFilledSlots = (slots?: { player?: unknown }[]) =>
  (slots || []).filter(s => !!s.player).length;

const MatchCalendar: React.FC<MatchCalendarProps> = ({ onBack, onNavigate }) => {
  const [showAddOptions, setShowAddOptions] = useState(false);
  const [showJoinCodeInput, setShowJoinCodeInput] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [now, setNow] = useState(() => Date.now());

  const { adminMatches, setSelectedMatch } = useAppStore();
  const currentUserUid = auth.currentUser?.uid || 'u1';

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const matches = useMemo<UpcomingMatch[]>(() => {
    return adminMatches
      .filter(m => {
        if (m.status === 'CANCELLED' || m.status === 'COMPLETED') return false;
        return m.slots?.some(s => s.player?.id === currentUserUid) || m.awaySlots?.some(s => s.player?.id === currentUserUid);
      })
      .map(m => {
        const matchDate = parseMatchDate(m.date, m.time);
        const timeLeftSeconds = matchDate ? Math.max(0, Math.floor((matchDate.getTime() - now) / 1000)) : 0;
        const playersCount = countFilledSlots(m.slots) + countFilledSlots(m.awaySlots);
        const maxPlayers = (m.slots?.length || 0) + (m.awaySlots?.length || 0);
        return {
          id: m.id,
          title: m.title,
          pitchName: m.location,
          time: m.time,
          date: m.date,
          timeLeftSeconds,
          playersCount,
          maxPlayers: maxPlayers || playersCount,
        };
      })
      .sort((a, b) => a.timeLeftSeconds - b.timeLeftSeconds);
  }, [adminMatches, currentUserUid, now]);

  const handleSelectMatch = (matchId: string) => {
    const match = adminMatches.find(m => m.id === matchId);
    if (match) setSelectedMatch(match);
    onNavigate('MATCH_LOBBY');
  };

  // Calculate pulse speed based on time left
  // Closer = faster.
  // Under 1 hour: very fast (0.5s)
  // Under 5 hours: fast (1s)
  // Under 24 hours: medium (2s)
  // Over 24 hours: slow (4s)
  const getPulseDuration = (seconds: number) => {
    if (seconds < 3600) return 0.5;
    if (seconds < 3600 * 5) return 1;
    if (seconds < 3600 * 24) return 2;
    return 4;
  };

  return (
    <div className="min-h-screen bg-[#0A0E14] text-white relative flex flex-col overflow-hidden">
      {/* Background Decor */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-[#FFFF00]/5 blur-[120px] rounded-full"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-blue-900/10 blur-[120px] rounded-full"></div>
      </div>

      {/* Header */}
      <header className="p-6 flex items-center justify-between sticky top-0 z-30 bg-[#0A0E14]/80 backdrop-blur-md border-b border-white/5">
        <button 
          onClick={onBack}
          className="w-12 h-12 flex items-center justify-center bg-[#161B22] border border-white/5 rounded-full text-white hover:bg-white/10 transition-colors"
        >
          <ChevronLeft size={24} />
        </button>
        <div className="text-center">
          <h1 className="text-sm font-black tracking-[0.3em] text-[#FFFF00] uppercase">MAÇ TAKVİMİM</h1>
          <p className="text-[10px] text-gray-500 font-bold uppercase mt-0.5">Yaklaşan Heyecanlar</p>
        </div>
        <div className="w-12"></div> {/* Spacer */}
      </header>

      {/* Match List */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 pb-32 custom-scrollbar">
        {matches.map((match, idx) => (
          <motion.div
            key={match.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: idx * 0.1 }}
            onClick={() => handleSelectMatch(match.id)}
            className="group relative bg-[#161B22]/60 backdrop-blur-xl border border-white/5 rounded-[32px] overflow-hidden cursor-pointer hover:border-[#FFFF00]/30 transition-all duration-500"
          >
            {/* Dynamic Pulse Strip */}
            <motion.div 
              animate={{ 
                opacity: [0.2, 0.8, 0.2],
                backgroundColor: ["#FFFF00", "#FFD700", "#FFFF00"]
              }}
              transition={{ 
                duration: getPulseDuration(match.timeLeftSeconds), 
                repeat: Infinity, 
                ease: "easeInOut" 
              }}
              className="absolute top-0 left-0 w-1.5 h-full"
            />

            <div className="p-6 pl-8">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-xl font-black italic tracking-tight text-white group-hover:text-[#FFFF00] transition-colors">
                    {match.title}
                  </h3>
                  <div className="flex items-center gap-2 text-gray-400 mt-1">
                    <MapPin size={14} className="text-[#FFFF00]" />
                    <span className="text-xs font-medium">{match.pitchName}</span>
                  </div>
                </div>
                <div className="bg-black/40 px-3 py-1.5 rounded-xl border border-white/5 flex items-center gap-2">
                   <div className="flex items-center gap-1">
                      <Calendar size={12} className="text-[#FFFF00]" />
                      <span className="text-[10px] font-black text-white uppercase">{match.date}</span>
                   </div>
                   <div className="w-1 h-1 rounded-full bg-white/30"></div>
                   <div className="flex items-center gap-1">
                      <Clock size={12} className="text-[#FFFF00]" />
                      <span className="text-[10px] font-black text-white">{match.time}</span>
                   </div>
                </div>
              </div>

              <div className="flex items-center justify-between mt-6">
                <div className="flex items-center gap-4">
                  <div className="flex -space-x-2">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="w-8 h-8 rounded-full border-2 border-[#161B22] bg-gray-800 overflow-hidden">
                        <img src={`https://i.pravatar.cc/150?u=${match.id}${i}`} alt="player" className="w-full h-full object-cover" />
                      </div>
                    ))}
                    <div className="w-8 h-8 rounded-full border-2 border-[#161B22] bg-[#FFFF00] flex items-center justify-center text-[10px] font-black text-black">
                      +{match.playersCount - 3}
                    </div>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">KADRO</span>
                    <span className="text-xs font-bold text-white">{match.playersCount}/{match.maxPlayers}</span>
                  </div>
                </div>

                <div className="flex flex-col items-end">
                  <span className="text-[10px] font-black text-[#FFFF00] uppercase tracking-widest">KALAN SÜRE</span>
                  <span className="text-xs font-mono font-bold text-white tabular-nums">
                    {Math.floor(match.timeLeftSeconds / 3600)}s {Math.floor((match.timeLeftSeconds % 3600) / 60)}dk
                  </span>
                </div>
              </div>
            </div>

            {/* Hover Indicator */}
            <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 group-hover:translate-x-0 translate-x-4 transition-all duration-300">
               <div className="w-10 h-10 rounded-full bg-[#FFFF00] flex items-center justify-center text-black shadow-[0_0_20px_rgba(255,255,0,0.4)]">
                  <ArrowRight size={20} />
               </div>
            </div>
          </motion.div>
        ))}

        {/* Empty State if no matches */}
        {matches.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 bg-[#161B22] rounded-full flex items-center justify-center mb-4 border border-white/5">
              <Calendar size={32} className="text-gray-600" />
            </div>
            <h3 className="text-lg font-black italic text-white">HENÜZ MAÇIN YOK</h3>
            <p className="text-gray-500 text-xs mt-2 max-w-[200px]">Hemen bir maça katıl veya saha kirala!</p>
          </div>
        )}
      </div>

      {/* Add Match FAB & Overlay */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50">
        <AnimatePresence>
          {showAddOptions && (
            <>
              {/* Backdrop */}
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowAddOptions(false)}
                className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[-1]"
              />

              {/* Options Menu */}
              <motion.div 
                initial={{ opacity: 0, y: 20, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.9 }}
                className="absolute bottom-20 left-1/2 -translate-x-1/2 w-64 bg-[#161B22] border border-white/10 rounded-[32px] p-4 shadow-2xl space-y-2"
              >
                <button 
                  onClick={() => {
                    setShowAddOptions(false);
                    onNavigate('MATCH_DISCOVERY');
                  }}
                  className="w-full p-4 rounded-2xl bg-white/5 hover:bg-[#FFFF00] hover:text-black transition-all flex items-center gap-3 group"
                >
                  <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center group-hover:bg-black/10">
                    <Search size={20} />
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-black uppercase">MAÇ BUL</p>
                    <p className="text-[9px] opacity-60 font-bold">Eksik tamamla</p>
                  </div>
                </button>

                <button 
                  onClick={() => {
                    setShowAddOptions(false);
                    setShowJoinCodeInput(true);
                  }}
                  className="w-full p-4 rounded-2xl bg-white/5 hover:bg-[#FFFF00] hover:text-black transition-all flex items-center gap-3 group"
                >
                  <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center group-hover:bg-black/10">
                    <Key size={20} />
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-black uppercase">KOD İLE KATIL</p>
                    <p className="text-[9px] opacity-60 font-bold">Özel maça gir</p>
                  </div>
                </button>

                <button 
                  onClick={() => {
                    setShowAddOptions(false);
                    onNavigate('PITCH_DISCOVERY');
                  }}
                  className="w-full p-4 rounded-2xl bg-white/5 hover:bg-[#FFFF00] hover:text-black transition-all flex items-center gap-3 group"
                >
                  <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center group-hover:bg-black/10">
                    <LayoutGrid size={20} />
                  </div>
                  <div className="text-left">
                    <p className="text-xs font-black uppercase">SAHA KİRALA</p>
                    <p className="text-[9px] opacity-60 font-bold">Kendi maçını kur</p>
                  </div>
                </button>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setShowAddOptions(!showAddOptions)}
          className={`w-16 h-16 rounded-full flex items-center justify-center shadow-2xl transition-all duration-300 ${showAddOptions ? 'bg-white text-black rotate-45' : 'bg-[#FFFF00] text-black'}`}
        >
          <Plus size={32} />
        </motion.button>
      </div>

      {/* Join Code Modal */}
      <AnimatePresence>
        {showJoinCodeInput && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowJoinCodeInput(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-sm bg-[#161B22] border border-white/10 rounded-[40px] p-8 shadow-2xl"
            >
              <button 
                onClick={() => setShowJoinCodeInput(false)}
                className="absolute top-6 right-6 text-gray-500 hover:text-white"
              >
                <X size={24} />
              </button>

              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-[#FFFF00]/10 rounded-3xl flex items-center justify-center mx-auto mb-4 border border-[#FFFF00]/20">
                  <Key size={32} className="text-[#FFFF00]" />
                </div>
                <h2 className="text-2xl font-black text-white italic tracking-tighter uppercase">KOD İLE KATIL</h2>
                <p className="text-gray-400 text-xs mt-2 font-medium">Sana iletilen 6 haneli maç kodunu gir.</p>
              </div>

              <div className="space-y-6">
                <input 
                  type="text"
                  maxLength={6}
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="ÖRN: XJ92K1"
                  className="w-full h-16 bg-[#0A0E14] border border-white/10 rounded-2xl text-center text-2xl font-black tracking-[0.5em] text-[#FFFF00] outline-none focus:border-[#FFFF00]/50 transition-all"
                />

                <button 
                  onClick={() => {
                    if (joinCode.length === 6) {
                      setShowJoinCodeInput(false);
                      onNavigate('MATCH_LOBBY');
                    }
                  }}
                  disabled={joinCode.length !== 6}
                  className={`w-full h-16 rounded-2xl font-black text-sm tracking-widest transition-all ${joinCode.length === 6 ? 'bg-[#FFFF00] text-black shadow-[0_10px_30px_rgba(255,255,0,0.2)]' : 'bg-gray-800 text-gray-500 cursor-not-allowed'}`}
                >
                  MAÇA GİT
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MatchCalendar;
