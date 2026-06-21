import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ShieldCheck, Users, Swords, PlusCircle, ArrowRight, Lock, Building2, MapPin, Check } from 'lucide-react';
import { fetchPublicCommunities } from '../services/communityService';

interface CommunityHubProps {
  onSelect: (id: string) => void;
  onNewNetwork: () => void;
}

const HUB_STYLES = [
  { bg: 'from-emerald-500/20 to-emerald-900/40', border: 'border-emerald-500/30', color: 'text-emerald-400' },
  { bg: 'from-orange-500/20 to-orange-900/40', border: 'border-orange-500/30', color: 'text-orange-400' },
  { bg: 'from-blue-500/20 to-blue-900/40', border: 'border-blue-500/30', color: 'text-blue-400' },
  { bg: 'from-indigo-500/20 to-indigo-900/40', border: 'border-indigo-500/30', color: 'text-indigo-400' },
];

const MOCK_MY_HUBS = [
  { id: 'c1', name: 'Boğaziçi Üniversitesi', type: 'Üniversite', members: 1250, activeMatches: 12, bg: 'from-emerald-500/20 to-emerald-900/40', border: 'border-emerald-500/30', color: 'text-emerald-400', initial: 'B' },
  { id: 'c2', name: 'Trendyol Tech', type: 'Kurumsal', members: 340, activeMatches: 4, bg: 'from-orange-500/20 to-orange-900/40', border: 'border-orange-500/30', color: 'text-orange-400', initial: 'T' }
];

const MOCK_DISCOVER = [
  { id: 'c3', name: 'Kadıköy Ligi', type: 'Semt', members: 8900, activeMatches: 45, bg: 'from-blue-500/20 to-blue-900/40', border: 'border-blue-500/30', color: 'text-blue-400', initial: 'K', locked: false },
  { id: 'c4', name: 'İTÜ Futbol', type: 'Üniversite', members: 2100, activeMatches: 8, bg: 'from-indigo-500/20 to-indigo-900/40', border: 'border-indigo-500/30', color: 'text-indigo-400', initial: 'İ', locked: true }
];

type HubCard = {
  id: string;
  name: string;
  type: string;
  members: number;
  activeMatches: number;
  bg: string;
  border: string;
  color: string;
  initial: string;
  locked?: boolean;
  isVerified?: boolean;
  joinMode?: string;
};

export const CommunityHub: React.FC<CommunityHubProps> = ({ onSelect, onNewNetwork }) => {
  const [showJoinCode, setShowJoinCode] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [myHubs, setMyHubs] = useState<HubCard[]>(MOCK_MY_HUBS);
  const [discoverHubs, setDiscoverHubs] = useState<HubCard[]>(MOCK_DISCOVER);

  useEffect(() => {
    void (async () => {
      try {
        const rows = await fetchPublicCommunities(24);
        const dbHubs: HubCard[] = rows.map((r, i) => {
          const style = HUB_STYLES[i % HUB_STYLES.length];
          return {
            id: r.id,
            name: r.name,
            type: r.type,
            members: r.member_count ?? 0,
            activeMatches: r.active_matches ?? 0,
            initial: r.name.charAt(0).toUpperCase(),
            locked: r.join_mode === 'INVITE_ONLY' || r.is_private,
            isVerified: r.is_verified,
            joinMode: r.join_mode,
            ...style,
          };
        });
        if (dbHubs.length > 0) {
          setMyHubs(dbHubs.slice(0, Math.min(4, dbHubs.length)));
          setDiscoverHubs(dbHubs.slice(Math.min(4, dbHubs.length)));
        }
      } catch {
        /* mock fallback */
      }
    })();
  }, []);

  const handleJoin = () => {
    setIsJoining(true);
    setTimeout(() => {
      setIsJoining(false);
      setShowJoinCode(false);
      onSelect('c1'); // simulate joining and opening
    }, 1500);
  };

  return (
    <motion.div initial={{opacity:0, y:20}} animate={{opacity:1, y:0}} className="px-5 pt-4 pb-10 space-y-8">
      
      {/* ── HEADER & SEARCH ────────────────────────────────────────────── */}
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-black italic uppercase tracking-tighter">Ağ Merkezi</h2>
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Kendi ekosistemini bul veya yarat.</p>
        </div>

        <div className="flex gap-2">
            <div className="flex-1 flex items-center gap-2 bg-[#161B22] border border-white/10 rounded-xl px-4 py-3 focus-within:border-[#39FF14]/50 transition-colors">
                <Search size={16} className="text-gray-500" />
                <input 
                    type="text" 
                    placeholder="Topluluk ara..."
                    className="bg-transparent w-full text-xs font-black text-white outline-none placeholder:text-gray-600"
                />
            </div>
            <button 
                onClick={() => setShowJoinCode(!showJoinCode)}
                className={`px-4 py-3 rounded-xl border flex items-center justify-center transition-all ${showJoinCode ? 'bg-[#FFFF00] text-black border-[#FFFF00]' : 'bg-[#161B22] text-gray-400 border-white/10 hover:border-white/30'}`}
            >
                <Lock size={16} />
            </button>
        </div>
      </div>

      {/* ── JOIN CODE WIZARD ───────────────────────────────────────────── */}
      <AnimatePresence>
          {showJoinCode && (
              <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
              >
                  <div className="bg-gradient-to-br from-[#161B22] to-[#0A0E14] border border-[#FFFF00]/20 rounded-3xl p-5 shadow-[0_0_30px_rgba(255,255,0,0.05)] relative">
                      <div className="absolute inset-0 bg-[#FFFF00]/5 blur-xl pointer-events-none rounded-3xl" />
                      <h3 className="text-xs font-black text-white uppercase tracking-widest mb-3 flex items-center gap-2">
                          <Lock size={14} className="text-[#FFFF00]" /> Gizli Koda Sahipsin
                      </h3>
                      <div className="flex gap-2 relative z-10">
                          <input 
                              type="text"
                              maxLength={6}
                              value={joinCode}
                              onChange={e => setJoinCode(e.target.value.toUpperCase())}
                              placeholder="XXXXXX"
                              className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white font-black tracking-[0.4em] outline-none focus:border-[#FFFF00]/50 uppercase"
                          />
                          <button 
                              onClick={handleJoin}
                              disabled={joinCode.length < 6 || isJoining}
                              className="px-6 bg-[#FFFF00] text-black font-black uppercase text-xs tracking-widest rounded-xl disabled:opacity-50 hover:bg-yellow-400 transition-colors w-28 flex items-center justify-center"
                          >
                              {isJoining ? <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}><Search size={16}/></motion.div> : 'Katıl'}
                          </button>
                      </div>
                  </div>
              </motion.div>
          )}
      </AnimatePresence>

      {/* ── MY HUBS ────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Dahil Olduğum Ağlar</h3>
        <div className="flex gap-4 overflow-x-auto custom-scrollbar pb-4 -mx-5 px-5">
            {myHubs.map(hub => (
                <motion.div 
                    key={hub.id}
                    onClick={() => onSelect(hub.id)}
                    whileHover={{ scale: 1.02, y: -4 }}
                    whileTap={{ scale: 0.98 }}
                    className={`min-w-[240px] bg-gradient-to-br ${hub.bg} border ${hub.border} rounded-3xl p-5 cursor-pointer relative overflow-hidden group shadow-lg`}
                >
                    <div className="absolute -right-4 -top-4 w-24 h-24 bg-white/5 rounded-full blur-2xl group-hover:bg-white/10 transition-colors" />
                    
                    <div className="flex items-center gap-3 mb-4 relative z-10">
                        <div className={`w-12 h-12 rounded-2xl bg-black/40 border border-white/10 flex items-center justify-center text-xl font-black ${hub.color} shadow-inner`}>
                            {hub.initial}
                        </div>
                        <div>
                            <h4 className="text-sm font-black text-white leading-tight flex items-center gap-1">
                              {hub.name}
                              {hub.isVerified && <ShieldCheck size={12} className="text-emerald-400" />}
                            </h4>
                            <div className="flex items-center gap-1 mt-0.5">
                                {hub.type === 'Üniversite' ? <Building2 size={10} className="text-gray-400" /> : <MapPin size={10} className="text-gray-400" />}
                                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">{hub.type}</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-white/10 pt-3 relative z-10">
                        <div>
                            <p className="text-[16px] font-black text-white">{hub.members}</p>
                            <p className="text-[8px] text-gray-400 font-bold uppercase tracking-widest">Oyuncu</p>
                        </div>
                        <div className="text-right">
                            <p className="text-[16px] font-black text-rose-400">{hub.activeMatches}</p>
                            <p className="text-[8px] text-gray-400 font-bold uppercase tracking-widest">Aktif Maç</p>
                        </div>
                    </div>
                </motion.div>
            ))}
            
            {/* Create New Hub Card */}
            <motion.div 
                onClick={onNewNetwork}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="min-w-[140px] border border-dashed border-white/20 rounded-3xl p-5 flex flex-col items-center justify-center gap-3 cursor-pointer hover:bg-white/5 transition-colors text-gray-500 hover:text-white group"
            >
                <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-[#39FF14]/20 group-hover:text-[#39FF14] transition-colors">
                    <PlusCircle size={24} />
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-center">Yeni Ağ<br/>Kur</span>
            </motion.div>
        </div>
      </div>

      {/* ── DISCOVER ───────────────────────────────────────────────────── */}
      <div className="space-y-4">
        <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Keşfet & Katıl</h3>
        <div className="grid gap-3">
            {discoverHubs.map(hub => (
                <div key={hub.id} onClick={() => onSelect(hub.id)} className="bg-[#161B22] border border-white/5 hover:border-white/20 rounded-2xl p-4 flex items-center justify-between transition-colors group cursor-pointer">
                    <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${hub.bg} border ${hub.border} flex items-center justify-center text-lg font-black ${hub.color}`}>
                            {hub.initial}
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h4 className="text-sm font-black text-white flex items-center gap-1">
                                  {hub.name}
                                  {hub.isVerified && <ShieldCheck size={12} className="text-emerald-400" />}
                                </h4>
                                {(hub.locked || hub.joinMode === 'INVITE_ONLY') && <Lock size={12} className="text-rose-400" />}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">{hub.type}</span>
                                <span className="text-gray-700 text-[8px]">•</span>
                                <span className="text-[9px] font-bold text-gray-400">{hub.members} Üye</span>
                            </div>
                        </div>
                    </div>
                    <button className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-gray-400 group-hover:bg-white/10 group-hover:text-white transition-colors">
                        <ArrowRight size={14} />
                    </button>
                </div>
            ))}
        </div>
      </div>

    </motion.div>
  );
};
