import React, { useState } from 'react';
import { UserRole, AppView, PlayerCardData } from '../types';
import { ArrowLeft, Settings, Shield, ChevronRight, Share2, Pencil, TrendingUp, Target, Activity, Trophy, Users } from 'lucide-react';
import { MATCH_HISTORY } from '../constants';
import { PlayerCard } from '../components/PlayerCard';
import { useAppStore } from '../store';
import { motion } from 'framer-motion';

interface ProfileScreenProps {
    role: UserRole;
    onBack: () => void;
    onNavigate?: (view: AppView) => void;
    onOpenDiaryEntry: (id: string) => void;
}

const CardBack: React.FC<{ tier: 'gold' | 'silver' | 'bronze' }> = ({ tier }) => {
    const last5 = MATCH_HISTORY.slice(0, 5);
    const wins = MATCH_HISTORY.filter(m => m.result === 'WIN').length;
    const total = MATCH_HISTORY.length;
    const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

    const colors = {
        gold: { border: '#d4a84b', text: '#ffd54f', label: '#c8962a' },
        silver: { border: '#8a96c0', text: '#c5cef5', label: '#7888b8' },
        bronze: { border: '#b07840', text: '#d4986a', label: '#8a5c28' }
    }[tier];

    return (
        <div className="w-full h-full rounded-[24px] overflow-hidden relative" style={{ background: 'linear-gradient(160deg, #0a0e14 0%, #161B22 50%, #0a0e14 100%)', border: `2px solid ${colors.border}` }}>
            <div className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none">
                <svg width="100%" height="100%"><defs><pattern id="hcb" width="22" height="38" patternUnits="userSpaceOnUse"><path d="M11 0l11 6.35v12.7L11 25.4 0 19.05V6.35z" fill="none" stroke="white" strokeWidth="0.7" /></pattern></defs><rect width="100%" height="100%" fill="url(#hcb)" /></svg>
            </div>
            <div className="relative z-10 h-full flex flex-col justify-between p-5">
                <div className="text-center">
                    <div className="flex items-center justify-center gap-2 mb-1">
                        <div className="flex-1 h-px" style={{ background: `linear-gradient(to right, transparent, ${colors.border}66)` }} />
                        <span className="text-[8px] font-black uppercase tracking-[0.3em]" style={{ color: colors.label }}>Scouting Raporu</span>
                        <div className="flex-1 h-px" style={{ background: `linear-gradient(to left, transparent, ${colors.border}66)` }} />
                    </div>
                </div>
                <div>
                    <p className="text-[8px] font-black uppercase tracking-widest mb-2" style={{ color: colors.label }}>Son 5 Maç</p>
                    <div className="flex gap-2 justify-center">
                        {last5.map((m, i) => (
                            <div key={i} className={`w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black border ${m.result === 'WIN' ? 'bg-green-500/20 text-green-400 border-green-500/30' : m.result === 'LOSS' ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-gray-500/20 text-gray-400 border-gray-500/30'}`}>
                                {m.result === 'WIN' ? 'G' : m.result === 'LOSS' ? 'M' : 'B'}
                            </div>
                        ))}
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <div className="bg-black/40 rounded-xl p-2.5 border border-white/5 text-center">
                        <span className="text-lg font-black" style={{ color: colors.text }}>18</span>
                        <p className="text-[7px] font-black uppercase tracking-widest" style={{ color: colors.label }}>Gol</p>
                    </div>
                    <div className="bg-black/40 rounded-xl p-2.5 border border-white/5 text-center">
                        <span className="text-lg font-black" style={{ color: colors.text }}>12</span>
                        <p className="text-[7px] font-black uppercase tracking-widest" style={{ color: colors.label }}>Asist</p>
                    </div>
                    <div className="bg-black/40 rounded-xl p-2.5 border border-white/5 text-center">
                        <span className="text-lg font-black" style={{ color: colors.text }}>9.2</span>
                        <p className="text-[7px] font-black uppercase tracking-widest" style={{ color: colors.label }}>En İyi Puan</p>
                    </div>
                    <div className="bg-black/40 rounded-xl p-2.5 border border-white/5 text-center">
                        <span className="text-lg font-black" style={{ color: colors.text }}>{winRate}%</span>
                        <p className="text-[7px] font-black uppercase tracking-widest" style={{ color: colors.label }}>Galibiyet</p>
                    </div>
                </div>
                <div>
                    <p className="text-[8px] font-black uppercase tracking-widest mb-1.5" style={{ color: colors.label }}>Performans Trendi</p>
                    <div className="flex items-end gap-[3px] h-8 justify-center">
                        {[7.2, 8.1, 6.5, 8.8, 9.2, 7.8, 8.5, 9.0, 7.5, 8.2].map((v, i) => (
                            <div key={i} className="w-3 rounded-sm" style={{ height: `${(v / 10) * 100}%`, background: v >= 8 ? 'linear-gradient(to top, #22c55e, #4ade80)' : v >= 7 ? 'linear-gradient(to top, #eab308, #facc15)' : 'linear-gradient(to top, #ef4444, #f87171)' }} />
                        ))}
                    </div>
                </div>
                <div className="flex items-center justify-center gap-2">
                    <div className="flex-1 h-px" style={{ background: `linear-gradient(to right, transparent, ${colors.border}44)` }} />
                    <span className="text-[7px] font-black uppercase tracking-[0.2em]" style={{ color: `${colors.label}80` }}>OYNA</span>
                    <div className="flex-1 h-px" style={{ background: `linear-gradient(to left, transparent, ${colors.border}44)` }} />
                </div>
            </div>
        </div>
    );
};

const MatchBanner: React.FC<{ item: typeof MATCH_HISTORY[0]; isMvp?: boolean; onClick: () => void }> = ({ item, isMvp, onClick }) => (
    <button onClick={onClick} className="w-full relative group hover:scale-[1.01] active:scale-[0.99] transition-all text-left">
        <div className="absolute inset-0 bg-gradient-to-r from-white/5 to-transparent rounded-[24px] pointer-events-none" />
        <div className="relative bg-[#161B22]/80 backdrop-blur-xl border border-white/5 rounded-[24px] p-5 flex items-center gap-3 hover:bg-white/[0.08] transition-all overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="flex flex-col gap-1.5 z-10 text-left flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="text-[9px] font-black uppercase tracking-[0.2em] text-[#c8962a]">{item.date}</span>
                    {isMvp && (
                        <span className="px-2 py-0.5 bg-[#FFFF00] text-black text-[8px] font-black rounded-full uppercase tracking-widest flex items-center gap-1 shadow-[0_0_10px_rgba(255,255,0,0.4)]">
                            <Trophy size={8} fill="black" /> MVP
                        </span>
                    )}
                </div>
                <h4 className="text-sm font-bold text-gray-300 truncate uppercase tracking-tight">{item.pitchName}</h4>
            </div>
            <div className="flex flex-col items-center z-10 w-20 shrink-0">
                <span className={`text-3xl font-black italic leading-none tracking-tighter drop-shadow-[0_0_15px_rgba(255,255,255,0.3)] ${item.result === 'WIN' ? 'text-[#39FF14]' : item.result === 'LOSS' ? 'text-[#FF3131]' : 'text-white'}`}>
                    {item.score}
                </span>
                <span className="text-[7px] font-black uppercase tracking-widest mt-1 opacity-50">SKOR</span>
            </div>
            <div className="z-10 shrink-0 bg-white/5 p-2.5 rounded-xl border border-white/10 group-hover:border-[#d4a84b]/50 transition-colors">
                <ChevronRight size={16} className="text-[#d4a84b]" />
            </div>
        </div>
    </button>
);

const ProfileScreen: React.FC<ProfileScreenProps> = ({ role, onBack, onNavigate, onOpenDiaryEntry }) => {
    const [isFlipped, setIsFlipped] = useState(false);
    const [activeFilter, setActiveFilter] = useState<'ALL' | 'WIN' | 'PERFORMANCE' | 'MVP'>('ALL');
    const { globalTexts } = useAppStore();

    const total = MATCH_HISTORY.length;
    const wins = MATCH_HISTORY.filter(m => m.result === 'WIN').length;
    const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

    const mockCardData: PlayerCardData = {
        overall: 88,
        tier: 'gold',
        isStatsVerified: true,
        diamondValue: 75000,
        winCount: wins,
        totalMatches: total,
        stats: {
            pace: { value: 85, videoUrl: null },
            shooting: { value: 88, videoUrl: null },
            passing: { value: 82, videoUrl: null },
            dribbling: { value: 90, videoUrl: null },
            defense: { value: 45, videoUrl: null },
            physical: { value: 78, videoUrl: null }
        }
    };

    // Filter match history
    const filteredMatches = MATCH_HISTORY.filter(item => {
        if (activeFilter === 'WIN') return item.result === 'WIN';
        if (activeFilter === 'MVP') return item.id === 'm1'; // Simulate m1 as MVP match
        return true; // ALL or PERFORMANCE shows all matches
    });

    const getActiveFilterLabel = () => {
        switch (activeFilter) {
            case 'WIN': return 'FİLTRE: KAZANILAN MAÇLAR';
            case 'PERFORMANCE': return 'FİLTRE: YÜKSEK PERFORMANSLAR';
            case 'MVP': return 'FİLTRE: MAÇIN ADAMI SEÇİLDİKLERİN';
            default: return 'FİLTRE: TÜM GEÇMİŞ MAÇLAR';
        }
    };

    return (
        <div className="fixed inset-0 bg-[#0A0E14] flex flex-col h-screen overflow-hidden selection:bg-[#FFFF00] selection:text-black">
            {/* ═══ FIXED TOP BAR ═══ */}
            <div className="px-6 pb-4 pt-safe flex justify-between items-center shrink-0 border-b border-white/5 z-50 bg-[#0A0E14]/90 backdrop-blur-md">
                <div className="flex items-center justify-between w-full pt-4">
                    <button onClick={onBack} className="w-10 h-10 flex items-center justify-center bg-[#161B22] rounded-full text-white border border-white/5 hover:bg-white/10 active:scale-95 transition-all">
                        <ArrowLeft size={18} />
                    </button>
                    <span className="text-sm font-black text-white tracking-widest uppercase italic">PROFİL</span>
                    <button onClick={() => onNavigate && onNavigate('SETTINGS')} className="w-10 h-10 flex items-center justify-center bg-[#161B22] rounded-full text-gray-400 hover:text-white border border-white/5 hover:bg-white/10 active:scale-95 transition-all">
                        <Settings size={18} />
                    </button>
                </div>
            </div>

            {/* ═══ NATURAL SCROLLABLE BODY ═══ */}
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8 custom-scrollbar pb-28">
                
                {/* Flitable Player Card */}
                <div className="flex flex-col items-center gap-6">
                    <div className="w-full max-w-[240px] cursor-pointer" style={{ perspective: '1200px' }} onClick={() => setIsFlipped(!isFlipped)}>
                        <motion.div
                            animate={{ rotateY: isFlipped ? 180 : 0 }}
                            transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
                            style={{ transformStyle: 'preserve-3d' }}
                            className="relative w-full"
                        >
                            {/* Front */}
                            <div style={{ backfaceVisibility: 'hidden' }}>
                                <PlayerCard name="Burak Kaptan" photo="/player_card_photo.png" position="OS" cardData={mockCardData} />
                            </div>
                            {/* Back */}
                            <div className="absolute inset-0 w-full" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
                                <div style={{ aspectRatio: '2 / 3' }}><CardBack tier={mockCardData.tier} /></div>
                            </div>
                        </motion.div>
                    </div>

                    {/* Static Info Badges under Card */}
                    <div className="flex justify-center gap-3 relative z-50">
                        <div className="px-3 py-1 bg-[#161B22]/80 backdrop-blur-md border border-[#d4a84b]/30 rounded-full flex items-center gap-1.5 shadow-2xl">
                            <span className="text-[8px] font-black uppercase tracking-widest text-[#c8962a]">Yaş</span>
                            <span className="text-xs font-black text-[#ffd54f]">26</span>
                        </div>
                        <div className="px-3 py-1 bg-[#161B22]/80 backdrop-blur-md border border-[#d4a84b]/30 rounded-full flex items-center gap-1.5 shadow-2xl">
                            <span className="text-[8px] font-black uppercase tracking-widest text-[#c8962a]">Ayak</span>
                            <span className="text-xs font-black text-[#ffd54f]">Sağ</span>
                        </div>
                    </div>

                    {/* Quick Stats Grid */}
                    <div className="w-full max-w-sm flex items-center justify-center gap-6 bg-[#161B22]/30 border border-white/5 rounded-2xl py-4">
                        <div className="text-center flex-1">
                            <p className="text-2xl font-black text-white italic">{total}</p>
                            <p className="text-[8px] text-[#d4a84b] font-black uppercase tracking-widest">Maç</p>
                        </div>
                        <div className="w-px h-10 bg-gradient-to-b from-transparent via-[#d4a84b]/20 to-transparent" />
                        <div className="text-center flex-1">
                            <p className="text-2xl font-black text-[#39FF14] italic">{winRate}%</p>
                            <p className="text-[8px] text-[#d4a84b] font-black uppercase tracking-widest">Galibiyet</p>
                        </div>
                        <div className="w-px h-10 bg-gradient-to-b from-transparent via-[#d4a84b]/20 to-transparent" />
                        <div className="text-center flex-1">
                            <div className="flex items-center justify-center gap-1">
                                <Shield size={16} fill="#39FF14" className="text-[#39FF14]" />
                                <p className="text-2xl font-black text-[#39FF14] italic">100</p>
                            </div>
                            <p className="text-[8px] text-[#d4a84b] font-black uppercase tracking-widest">Güven</p>
                        </div>
                    </div>
                </div>

                {/* ═══ WALLET CARD ═══ */}
                <button 
                    onClick={() => onNavigate && onNavigate('WALLET')}
                    className="w-full bg-[#161B22]/60 backdrop-blur-md border border-[#39FF14]/30 rounded-3xl p-5 flex items-center justify-between group hover:bg-[#39FF14]/5 hover:border-[#39FF14]/50 transition-all shadow-[0_8px_30px_rgb(0,0,0,0.5)] relative overflow-hidden"
                >
                    <div className="absolute -top-10 -right-10 w-32 h-32 bg-[#39FF14]/10 blur-[40px] rounded-full group-hover:bg-[#39FF14]/20 transition-all" />
                    <div className="flex items-center gap-4 relative z-10">
                        <div className="w-12 h-12 bg-[#39FF14]/20 rounded-2xl flex items-center justify-center border border-[#39FF14]/30 group-hover:scale-110 transition-transform shadow-[0_0_15px_rgba(57,255,20,0.2)]">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#39FF14" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>
                        </div>
                        <div className="text-left">
                            <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-0.5">OYNA CÜZDAN</p>
                            <div className="flex items-baseline gap-1">
                                <span className="text-2xl font-black italic text-white leading-none tracking-tighter drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]">1,250</span>
                                <span className="text-sm font-bold text-[#39FF14]">₺</span>
                            </div>
                        </div>
                    </div>
                    <div className="relative z-10 flex flex-col items-end gap-1">
                        <span className="px-4 py-2 bg-[#39FF14] text-black text-[10px] font-black uppercase tracking-[0.2em] rounded-xl hover:bg-[#32e612] transition-colors shadow-[0_0_15px_rgba(57,255,20,0.4)] hover:shadow-[0_0_25px_rgba(57,255,20,0.6)]">
                            YÖNET
                        </span>
                    </div>
                </button>

                {/* ═══ TAKIMLARIM CARD ═══ */}
                <button
                    onClick={() => onNavigate && onNavigate('MY_TEAM')}
                    className="w-full bg-[#161B22]/60 backdrop-blur-md border border-[#FFFF00]/30 rounded-3xl p-5 flex items-center justify-between group hover:bg-[#FFFF00]/5 hover:border-[#FFFF00]/50 transition-all shadow-[0_8px_30px_rgb(0,0,0,0.5)] relative overflow-hidden"
                >
                    <div className="absolute -top-10 -right-10 w-32 h-32 bg-[#FFFF00]/10 blur-[40px] rounded-full group-hover:bg-[#FFFF00]/20 transition-all" />
                    <div className="flex items-center gap-4 relative z-10">
                        <div className="w-12 h-12 bg-[#FFFF00]/20 rounded-2xl flex items-center justify-center border border-[#FFFF00]/30 group-hover:scale-110 transition-transform shadow-[0_0_15px_rgba(255,255,0,0.2)]">
                            <Users size={22} className="text-[#FFFF00]" />
                        </div>
                        <div className="text-left">
                            <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-0.5">TAKIMLARIM</p>
                            <p className="text-sm font-black italic text-white leading-none tracking-tight">Kadro & Taktik Tahtası</p>
                        </div>
                    </div>
                    <ChevronRight size={20} className="text-[#FFFF00] relative z-10 group-hover:translate-x-1 transition-transform" />
                </button>

                {/* ═══ BENTO STATISTICS & FILTERS ═══ */}
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        {/* Wins filter button */}
                        <button 
                            onClick={() => setActiveFilter(activeFilter === 'WIN' ? 'ALL' : 'WIN')}
                            className={`col-span-1 border rounded-[28px] p-5 flex flex-col justify-between h-32 relative overflow-hidden group text-left transition-all ${
                                activeFilter === 'WIN' 
                                    ? 'bg-[#39FF14]/10 border-[#39FF14] shadow-[0_0_20px_rgba(57,255,20,0.2)]' 
                                    : 'bg-[#161B22]/50 border-white/5 hover:border-white/20'
                            }`}
                        >
                            <div className="absolute -top-4 -right-4 w-20 h-20 bg-[#39FF14]/10 blur-3xl rounded-full" />
                            <Activity size={20} className={activeFilter === 'WIN' ? 'text-[#39FF14]' : 'text-gray-400'} />
                            <div>
                                <p className="text-3xl font-black text-white italic leading-none">{wins}</p>
                                <p className={`text-[9px] font-black uppercase tracking-widest mt-1.5 ${
                                    activeFilter === 'WIN' ? 'text-[#39FF14]' : 'text-[#c8962a]'
                                }`}>GALİBİYET</p>
                            </div>
                        </button>

                        {/* Performance/All filter button */}
                        <button 
                            onClick={() => setActiveFilter(activeFilter === 'PERFORMANCE' ? 'ALL' : 'PERFORMANCE')}
                            className={`col-span-1 border rounded-[28px] p-5 flex flex-col justify-between h-32 relative overflow-hidden group text-left transition-all ${
                                activeFilter === 'PERFORMANCE' 
                                    ? 'bg-[#FFFF00]/10 border-[#FFFF00] shadow-[0_0_20px_rgba(255,255,0,0.2)]' 
                                    : 'bg-[#161B22]/50 border-white/5 hover:border-white/20'
                            }`}
                        >
                            <div className="absolute -top-4 -right-4 w-20 h-20 bg-[#FFFF00]/10 blur-3xl rounded-full" />
                            <TrendingUp size={20} className={activeFilter === 'PERFORMANCE' ? 'text-[#FFFF00]' : 'text-gray-400'} />
                            <div>
                                <p className="text-3xl font-black text-white italic leading-none">{winRate}%</p>
                                <p className={`text-[9px] font-black uppercase tracking-widest mt-1.5 ${
                                    activeFilter === 'PERFORMANCE' ? 'text-[#FFFF00]' : 'text-[#c8962a]'
                                }`}>PERFORMANS</p>
                            </div>
                        </button>

                        {/* MVP filter button */}
                        <button 
                            onClick={() => setActiveFilter(activeFilter === 'MVP' ? 'ALL' : 'MVP')}
                            className={`col-span-2 border rounded-[28px] p-5 flex items-center justify-between h-24 relative overflow-hidden group text-left transition-all ${
                                activeFilter === 'MVP' 
                                    ? 'bg-indigo-500/20 border-indigo-500 shadow-[0_0_20px_rgba(99,102,241,0.3)]' 
                                    : 'bg-[#161B22]/50 border-white/5 hover:border-white/20'
                            }`}
                        >
                            <div className="flex items-center gap-4">
                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center border ${
                                    activeFilter === 'MVP' 
                                        ? 'bg-indigo-500/30 border-indigo-400' 
                                        : 'bg-indigo-500/10 border-indigo-500/20'
                                }`}>
                                    <Target size={24} className={activeFilter === 'MVP' ? 'text-indigo-300' : 'text-indigo-400'} />
                                </div>
                                <div>
                                    <p className="text-lg font-black text-white uppercase tracking-tight italic leading-none">MAÇIN ADAMI</p>
                                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1.5">MVP SEÇİLDİN</p>
                                </div>
                            </div>
                            <span className={`text-4xl font-black italic ${activeFilter === 'MVP' ? 'text-indigo-300' : 'text-indigo-400'}`}>4</span>
                        </button>
                    </div>
                </div>

                {/* ═══ MATCH LIST SECTION ═══ */}
                <div className="space-y-5">
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-5">
                            <div className="flex-1 h-px bg-white/10" />
                            <span className="text-[11px] font-black uppercase tracking-[0.4em] text-gray-500">GEÇMİŞ MAÇLAR</span>
                            <div className="flex-1 h-px bg-white/10" />
                        </div>
                        {/* Active Filter Badge */}
                        <div className="flex justify-center">
                            <span className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-[9px] font-black tracking-widest text-[#FFFF00] uppercase shadow-sm">
                                {getActiveFilterLabel()}
                            </span>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {filteredMatches.length > 0 ? (
                            filteredMatches.map(item => (
                                <MatchBanner 
                                    key={item.id} 
                                    item={item} 
                                    isMvp={item.id === 'm1'} 
                                    onClick={() => onOpenDiaryEntry(item.id)} 
                                />
                            ))
                        ) : (
                            <div className="text-center py-10 bg-[#161B22]/30 border border-white/5 rounded-3xl">
                                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">BU KATEGORİDE MAÇ BULUNAMADI</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ═══ FIXED BOTTOM BAR ═══ */}
            <div className="px-6 pt-4 pb-safe border-t border-white/5 flex items-center justify-around shrink-0 bg-[#0A0E14]/90 backdrop-blur-xl z-50">
                <button onClick={() => { if (navigator.share) navigator.share({ title: 'OYNA', url: window.location.href }).catch(() => {}); }} className="flex flex-col items-center gap-1.5 group">
                    <div className="w-11 h-11 bg-[#161B22] border border-white/5 rounded-full flex items-center justify-center text-gray-400 group-hover:text-[#d4a84b] transition-all shadow-lg">
                        <Share2 size={18} />
                    </div>
                    <span className="text-[8px] font-black uppercase tracking-widest text-gray-500">PAYLAŞ</span>
                </button>
                <button className="flex flex-col items-center gap-1.5 group">
                    <div className="w-11 h-11 bg-[#161B22] border border-white/5 rounded-full flex items-center justify-center text-gray-400 group-hover:text-white transition-all shadow-lg">
                        <Pencil size={18} />
                    </div>
                    <span className="text-[8px] font-black uppercase tracking-widest text-gray-500">DÜZENLE</span>
                </button>
            </div>
        </div>
    );
};

export default ProfileScreen;
