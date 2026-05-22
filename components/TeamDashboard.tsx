import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Shield, Hexagon, Circle, Triangle, Star, Crown, Swords, Flame,
  ArrowLeft, MapPin, Users, ChevronRight, Award, X, Activity, Zap
} from 'lucide-react';

interface TeamDashboardProps {
  team: any;
  onBack: () => void;
  onNavigateToStudio: () => void;
  friendsData: any[];
}

export const TeamDashboard: React.FC<TeamDashboardProps> = ({ team, onBack, onNavigateToStudio, friendsData }) => {
  const [selectedPlayer, setSelectedPlayer] = useState<any | null>(null);

  const crestOptions = [
    { id: 'shield', icon: Shield },
    { id: 'hexagon', icon: Hexagon },
    { id: 'circle', icon: Circle },
    { id: 'triangle', icon: Triangle },
    { id: 'star', icon: Star },
    { id: 'crown', icon: Crown },
    { id: 'swords', icon: Swords },
    { id: 'flame', icon: Flame }
  ];

  const renderCrest = (type: string, color: string, className = "") => {
    const CrestIcon = crestOptions.find(c => c.id === type)?.icon || Shield;
    return <CrestIcon size={48} className={className} style={{ color }} />;
  };

  const teamPlayers = team.players 
    ? team.players.map((id: string) => friendsData.find(f => f.id === id)).filter(Boolean)
    : [];

  return (
    <motion.div 
        initial={{ opacity: 0, x: 20 }} 
        animate={{ opacity: 1, x: 0 }} 
        exit={{ opacity: 0, x: -20 }}
        className="flex flex-col min-h-[100vh] text-white pb-20 relative overflow-hidden"
        style={{ backgroundColor: team.color2 || '#0A0E14' }}
    >
        {/* Dynamic Background Blur heavily using team.color1 */}
        <div className="absolute inset-0 opacity-20 pointer-events-none mix-blend-screen" style={{ background: `linear-gradient(to bottom, ${team.color1}, transparent 60%)` }} />
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] blur-[120px] opacity-30 pointer-events-none mix-blend-screen" style={{ backgroundColor: team.color1 }} />
        <div className="absolute top-1/3 -left-20 w-[400px] h-[400px] blur-[100px] opacity-10 pointer-events-none mix-blend-screen" style={{ backgroundColor: team.color1 }} />

        {/* ── HEADER ── */}
        <div className="px-5 pt-12 pb-6 flex items-center justify-between relative z-10">
            <button 
                onClick={onBack} 
                className="w-12 h-12 rounded-full flex items-center justify-center text-white backdrop-blur-xl border hover:scale-105 transition-all shadow-lg"
                style={{ backgroundColor: `${team.color1}20`, borderColor: `${team.color1}50` }}
            >
                <ArrowLeft size={24} />
            </button>
            <div className="px-4 py-2 rounded-full backdrop-blur-xl border flex items-center gap-2" style={{ backgroundColor: `${team.color1}10`, borderColor: `${team.color1}30` }}>
                <span className="w-2 h-2 rounded-full animate-pulse shadow-[0_0_10px_currentColor]" style={{ backgroundColor: team.color1 }} />
                <span className="text-[10px] font-black uppercase tracking-widest text-white">Aktif</span>
            </div>
        </div>

        {/* ── HERO: CREST & IDENTITY ── */}
        <div className="px-5 relative z-10 flex flex-col items-center text-center mt-2 mb-10">
            <motion.div 
                animate={{ y: [0, -10, 0], scale: [1, 1.02, 1] }} 
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                className="relative mb-6 drop-shadow-[0_0_50px_rgba(255,255,255,0.2)]"
            >
                <div className="absolute inset-0 blur-3xl opacity-60 scale-150 mix-blend-screen" style={{ background: `radial-gradient(circle, ${team.color1}, transparent)` }} />
                {renderCrest(team.crest, team.color1, "w-48 h-48 relative z-10 drop-shadow-2xl")}
            </motion.div>
            
            <h1 className="text-4xl font-black italic uppercase tracking-tighter leading-none mb-3" style={{ textShadow: `0 10px 30px ${team.color1}80` }}>
                {team.name}
            </h1>
            
            <div className="flex items-center justify-center gap-3 mt-2">
                <span className="px-3 py-1 rounded-lg uppercase text-[11px] font-black tracking-[0.2em] text-white backdrop-blur-md border" style={{ backgroundColor: `${team.color1}20`, borderColor: `${team.color1}40` }}>
                    {team.shortName}
                </span>
                {team.location && (
                    <span className="text-xs text-white font-bold flex items-center gap-1 px-3 py-1 rounded-lg border backdrop-blur-md" style={{ backgroundColor: `${team.color1}10`, borderColor: `${team.color1}20` }}>
                        <MapPin size={12} style={{ color: team.color1 }} /> {team.location}
                    </span>
                )}
            </div>

            <div className="mt-8 flex gap-4 w-full">
                <div className="flex-1 backdrop-blur-xl border rounded-3xl p-5 flex flex-col items-center shadow-2xl" style={{ backgroundColor: `${team.color1}10`, borderColor: `${team.color1}30` }}>
                    <span className="text-2xl font-black text-white drop-shadow-md">{teamPlayers.length}</span>
                    <span className="text-[9px] font-bold uppercase tracking-widest mt-1 opacity-80" style={{ color: team.color1 }}>Kadro</span>
                </div>
                <div className="flex-1 backdrop-blur-xl border rounded-3xl p-5 flex flex-col items-center shadow-2xl relative overflow-hidden" style={{ backgroundColor: `${team.color1}20`, borderColor: `${team.color1}50` }}>
                    <div className="absolute inset-0 opacity-30" style={{ background: `linear-gradient(45deg, transparent, ${team.color1}, transparent)` }} />
                    <span className="text-xl font-black text-white drop-shadow-md relative z-10">{Number(team.teamValue || 0).toLocaleString('tr-TR')} 💎</span>
                    <span className="text-[9px] font-bold uppercase tracking-widest mt-1 opacity-90 relative z-10" style={{ color: team.color1 }}>Takım Değeri</span>
                </div>
                <div className="flex-1 backdrop-blur-xl border rounded-3xl p-5 flex flex-col items-center shadow-2xl" style={{ backgroundColor: `${team.color1}10`, borderColor: `${team.color1}30` }}>
                    <div className="flex gap-1.5 mt-1">
                        <span className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-black" style={{ backgroundColor: `${team.color1}40` }}>-</span>
                        <span className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-black" style={{ backgroundColor: `${team.color1}40` }}>-</span>
                        <span className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-black" style={{ backgroundColor: `${team.color1}40` }}>-</span>
                    </div>
                    <span className="text-[9px] font-bold uppercase tracking-widest mt-2 opacity-80" style={{ color: team.color1 }}>Form</span>
                </div>
            </div>
        </div>

        {/* ── CALL TO ACTION: TAKTİK STUDIO ── */}
        <div className="px-5 mb-10 relative z-10">
            <motion.button 
                whileHover={{ scale: 1.02 }} 
                whileTap={{ scale: 0.98 }}
                onClick={onNavigateToStudio}
                className="w-full relative overflow-hidden rounded-[32px] p-8 group cursor-pointer border shadow-2xl"
                style={{ backgroundColor: `${team.color1}15`, borderColor: `${team.color1}50`, boxShadow: `0 20px 50px -10px ${team.color1}60` }}
            >
                {/* Field Background graphic */}
                <div className="absolute inset-0 opacity-20 group-hover:opacity-40 transition-opacity duration-700 pointer-events-none" style={{ backgroundImage: `linear-gradient(0deg, transparent 24%, ${team.color1} 25%, ${team.color1} 26%, transparent 27%, transparent 74%, ${team.color1} 75%, ${team.color1} 76%, transparent 77%, transparent), linear-gradient(90deg, transparent 24%, ${team.color1} 25%, ${team.color1} 26%, transparent 27%, transparent 74%, ${team.color1} 75%, ${team.color1} 76%, transparent 77%, transparent)`, backgroundSize: '30px 30px' }} />
                
                <div className="absolute right-[-5%] top-[-10%] opacity-30 group-hover:scale-110 group-hover:rotate-12 transition-all duration-700 pointer-events-none mix-blend-screen">
                    <Shield size={180} style={{ color: team.color1 }} />
                </div>

                <div className="relative z-10 flex items-center justify-between">
                    <div className="text-left">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="w-2 h-2 rounded-full animate-pulse shadow-[0_0_10px_currentColor]" style={{ backgroundColor: team.color1 }} />
                            <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: team.color1 }}>Strateji Odası</span>
                        </div>
                        <h2 className="text-3xl font-black italic uppercase tracking-tighter text-white mb-2 drop-shadow-md">Taktik Stüdyosu</h2>
                        <p className="text-xs font-bold text-white/70">Dizilişini belirle, ilk 11'i sahaya sür.</p>
                    </div>
                    <div className="w-14 h-14 rounded-full border flex items-center justify-center transition-all group-hover:scale-110" style={{ backgroundColor: `${team.color1}20`, borderColor: team.color1, color: team.color1 }}>
                        <ChevronRight size={28} />
                    </div>
                </div>
            </motion.button>
        </div>

        {/* ── KADRO (SQUAD) ── */}
        <div className="px-5 mb-8 relative z-10">
            <div className="flex items-center justify-between mb-5">
                <h3 className="text-xl font-black italic uppercase tracking-tighter flex items-center gap-2 text-white">
                    <Users size={20} style={{ color: team.color1 }} /> Takım Kadrosu
                </h3>
            </div>
            
            <div className="grid gap-3">
                {teamPlayers.length === 0 ? (
                    <div className="text-center py-8 rounded-3xl border backdrop-blur-md" style={{ backgroundColor: `${team.color1}05`, borderColor: `${team.color1}20` }}>
                        <p className="text-sm font-bold text-white/50">Kadroya henüz oyuncu eklenmedi.</p>
                    </div>
                ) : (
                    teamPlayers.map((player: any) => {
                        const isCaptain = team.captain === player.id;
                        return (
                            <motion.div 
                                key={player.id} 
                                onClick={() => setSelectedPlayer(player)}
                                whileHover={{ scale: 1.01 }}
                                className="rounded-2xl p-4 flex items-center justify-between group cursor-pointer border backdrop-blur-md transition-all shadow-lg hover:shadow-2xl"
                                style={{ backgroundColor: `${team.color1}10`, borderColor: `${team.color1}30` }}
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-xl flex items-center justify-center font-black text-xl shadow-inner border" style={{ background: `linear-gradient(135deg, ${team.color1}40, transparent)`, borderColor: `${team.color1}50`, color: team.color1 }}>
                                        {player.name.charAt(0)}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h4 className="text-base font-black text-white">{player.name}</h4>
                                            {isCaptain && (
                                                <div className="bg-[#FFFF00] text-black text-[9px] font-black px-2 py-0.5 rounded flex items-center gap-1 shadow-[0_0_15px_rgba(255,255,0,0.4)]">
                                                    <Award size={10} /> KAPTAN
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: team.color1 }}>{player.pos}</span>
                                            <span className="w-1 h-1 rounded-full bg-white/30" />
                                            <span className="text-[9px] font-bold text-white/60 uppercase tracking-widest">{player.wins} Galibiyet</span>
                                        </div>
                                    </div>
                                </div>
                                <ChevronRight size={18} className="text-white/30 group-hover:text-white transition-colors" />
                            </motion.div>
                        );
                    })
                )}
            </div>
        </div>

        {/* ── HOLOGRAPHIC PLAYER MODAL ── */}
        <AnimatePresence>
            {selectedPlayer && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl">
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        className="w-full max-w-sm rounded-[32px] overflow-hidden relative border shadow-[0_0_80px_rgba(0,0,0,0.8)]"
                        style={{ backgroundColor: '#0A0E14', borderColor: `${team.color1}50` }}
                    >
                        <div className="absolute inset-0 opacity-30 mix-blend-screen" style={{ background: `radial-gradient(circle at top, ${team.color1}, transparent 70%)` }} />
                        
                        <button onClick={() => setSelectedPlayer(null)} className="absolute top-4 right-4 z-50 w-10 h-10 bg-black/40 border border-white/20 rounded-full flex items-center justify-center text-white backdrop-blur-md hover:bg-white/10 transition-colors">
                            <X size={20} />
                        </button>

                        <div className="p-8 pb-10 flex flex-col items-center relative z-10 mt-6">
                            {/* 3D Hologram Effect Avatar */}
                            <div className="relative mb-6">
                                <div className="absolute inset-0 rounded-full blur-xl scale-125 opacity-50 animate-pulse" style={{ backgroundColor: team.color1 }} />
                                <div className="w-28 h-28 rounded-full border-4 flex items-center justify-center font-black text-4xl shadow-[0_0_30px_currentColor] relative z-10 bg-[#0A0E14]" style={{ borderColor: team.color1, color: team.color1 }}>
                                    {selectedPlayer.name.charAt(0)}
                                </div>
                                <div className="absolute -bottom-2 -right-2 w-10 h-10 rounded-full border-4 border-[#0A0E14] flex items-center justify-center font-black text-xs z-20" style={{ backgroundColor: team.color1, color: '#000' }}>
                                    {selectedPlayer.pos}
                                </div>
                            </div>

                            <h2 className="text-3xl font-black italic uppercase tracking-tighter text-white mb-1 drop-shadow-md text-center">{selectedPlayer.name}</h2>
                            <p className="text-xs font-bold uppercase tracking-widest text-white/50 mb-8">{selectedPlayer.group}</p>

                            <div className="grid grid-cols-2 gap-4 w-full">
                                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col items-center justify-center">
                                    <Activity size={20} className="mb-2" style={{ color: team.color1 }} />
                                    <span className="text-2xl font-black text-white">{selectedPlayer.wins}</span>
                                    <span className="text-[9px] font-bold uppercase tracking-widest text-white/40 mt-1">Galibiyet</span>
                                </div>
                                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col items-center justify-center">
                                    <Zap size={20} className="mb-2 text-amber-400" />
                                    <span className="text-2xl font-black text-white">{selectedPlayer.losses}</span>
                                    <span className="text-[9px] font-bold uppercase tracking-widest text-white/40 mt-1">Mağlubiyet</span>
                                </div>
                            </div>

                            <button className="w-full mt-6 py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition-transform hover:scale-105 active:scale-95 text-black shadow-[0_0_20px_currentColor]" style={{ backgroundColor: team.color1, color: '#000' }}>
                                Tüm İstatistikler
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>

    </motion.div>
  );
};
