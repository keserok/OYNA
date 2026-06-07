
import React, { useState, useRef } from 'react';
import { ArrowLeft, Share2, MapPin, Calendar, Clock, CloudRain, Navigation, Shield, User, CheckCircle2, AlertCircle, XCircle, Edit3, Save, Hand, Scale, ExternalLink, MessageSquare, X, Star, Brain, ShoppingBag, CreditCard, Users, UserPlus, Check, Banknote, PiggyBank, Crosshair, QrCode, Phone } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Player, AppView } from '../types';
import { MY_TEAM, PITCHES } from '../constants';
import { useAppStore } from '../store';
import LiveTacticBoard from '../components/LiveTacticBoard';
import { TeamLineupBoard } from '../components/TeamLineupBoard';

interface MatchLobbyProps {
    onBack: () => void;
    onNavigate: (view: AppView) => void;
}

// Mock Data specific for this view
const MATCH_DATA = {
    pitchName: 'Arena Sport Center',
    pitchId: '1',
    date: '26 Mart',
    day: 'Çarşamba',
    time: '20:00 - 21:00',
    weather: '12°C, Parçalı Bulutlu',
    location: 'Fulya, Beşiktaş',
    totalPrice: 2800,
    pricePerPerson: 200,
    hiredReferee: { name: 'Cüneyt Ç.', avatar: 'https://i.pravatar.cc/150?u=ref1', status: 'CONFIRMED', price: 300, liveStatus: 'ON_THE_WAY' },
    hiredGk: { name: 'Volkan D.', avatar: 'https://i.pravatar.cc/150?u=gk1', status: 'CONFIRMED', price: 200, liveStatus: 'ARRIVED' },
    teamATarget: 1500,
    teamBTarget: 1300,
    teamBPaid: 800
};

// Enriching the roster with payment status
const INITIAL_ROSTER: Player[] = MY_TEAM.roster.map((p, i) => ({
    ...p,
    paymentStatus: i < 4 ? 'PAID' : i === 4 ? 'PENDING' : 'UNPAID'
}));

const MatchLobby: React.FC<MatchLobbyProps> = ({ onBack, onNavigate }) => {
    const [activeTab, setActiveTab] = useState<'LOBI' | 'KADRO' | 'DİZİLİŞ' | 'TAKTİK'>('DİZİLİŞ');
    const [roster, setRoster] = useState<Player[]>(INITIAL_ROSTER);
    const [isEditing, setIsEditing] = useState(false);
    const [draggedPlayer, setDraggedPlayer] = useState<string | null>(null);
    const [isPitchDetailOpen, setIsPitchDetailOpen] = useState(false);
    const [selectedBoot, setSelectedBoot] = useState<any>(null);
    const [isPaying, setIsPaying] = useState(false);
    const [rentedBoots, setRentedBoots] = useState<string[]>([]);
    const pitchRef = useRef<HTMLDivElement>(null);

    // Dynamic Payment States
    const [teamAExtraPaid, setTeamAExtraPaid] = useState(0);
    const [isCustomPaymentModalOpen, setIsCustomPaymentModalOpen] = useState(false);
    const [isCopied, setIsCopied] = useState(false);
    const [customAmount, setCustomAmount] = useState('');
    const [pendingPayment, setPendingPayment] = useState<{amount: number, label: string} | null>(null);

    const { friends } = useAppStore();
    const [invitedFriendIds, setInvitedFriendIds] = useState<string[]>([]);

    const handleInviteFriend = (id: string) => {
        setInvitedFriendIds(prev => [...prev, id]);
        if (navigator.vibrate) navigator.vibrate([30, 10, 30]);
    };

    const selectedPitch = PITCHES.find(p => p.id === MATCH_DATA.pitchId);

    const BOOTS = [
        { id: 'b1', name: 'Nike Mercurial Vapor 15', price: 150, image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&q=80', brand: 'Nike' },
        { id: 'b2', name: 'Adidas Predator Accuracy', price: 140, image: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=400&q=80', brand: 'Adidas' },
        { id: 'b3', name: 'Puma Future Ultimate', price: 130, image: 'https://images.unsplash.com/photo-1608231387042-66d1773070a5?w=400&q=80', brand: 'Puma' },
    ];

    const handleRentBoot = (boot: any) => {
        setSelectedBoot(boot);
    };

    const confirmPayment = () => {
        setIsPaying(true);
        setTimeout(() => {
            setRentedBoots([...rentedBoots, selectedBoot.id]);
            setIsPaying(false);
            setSelectedBoot(null);
            if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
        }, 2000);
    };

    const rafRef = useRef<number | null>(null);

    // Vertical VS Kumbara calculations
    const teamABasePaid = roster.filter(p => p.paymentStatus === 'PAID').length * MATCH_DATA.pricePerPerson;
    const teamAPaid = teamABasePaid + teamAExtraPaid;
    const teamAProgress = Math.min(100, Math.max(0, (teamAPaid / MATCH_DATA.teamATarget) * 100));
    const teamARemaining = Math.max(0, MATCH_DATA.teamATarget - teamAPaid);

    const teamBPaid = MATCH_DATA.teamBPaid;
    const teamBProgress = Math.min(100, Math.max(0, (teamBPaid / MATCH_DATA.teamBTarget) * 100));

    const handleQuickPayment = (amount: number) => {
        if (amount <= 0 || teamARemaining === 0) return;
        const validAmount = Math.min(amount, teamARemaining);
        setTeamAExtraPaid(prev => prev + validAmount);
        if (navigator.vibrate) navigator.vibrate([15, 15, 15]);
    };

    const handleCustomPaymentSubmit = () => {
        const amount = parseInt(customAmount);
        if (!isNaN(amount) && amount > 0) {
            setIsCustomPaymentModalOpen(false);
            setPendingPayment({ amount, label: 'Özel Tutar' });
        }
        setCustomAmount('');
    };

    const handleDirectionsClick = () => {
        const query = encodeURIComponent(`${MATCH_DATA.pitchName} ${MATCH_DATA.location}`);
        window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank');
    };

    const handleShareClick = () => {
        navigator.clipboard.writeText(window.location.href);
        setIsCopied(true);
        if (navigator.vibrate) navigator.vibrate(50);
        setTimeout(() => setIsCopied(false), 2000);
    };

    const TABS = [
        { id: 'LOBI' as const, label: 'Lobi' },
        { id: 'KADRO' as const, label: 'Kadro' },
        { id: 'DİZİLİŞ' as const, label: 'Diziliş' },
        { id: 'TAKTİK' as const, label: 'Taktik' },
    ];

    return (
        <div className="min-h-screen bg-[#0A0E14] flex flex-col font-sans pb-24 relative">

            {/* 1. Header & Context */}
            <header className="sticky top-0 z-30 bg-[#0A0E14]/90 backdrop-blur-xl border-b border-white/5">
                <div className="p-4 flex items-center justify-between">
                    <button onClick={onBack} className="p-2 bg-[#161B22] rounded-full text-white border border-white/5 hover:bg-white/10 transition-colors">
                        <ArrowLeft size={20} />
                    </button>
                    <h1 className="text-sm font-bold text-white tracking-widest uppercase">MAÇ LOBİSİ</h1>
                    <button onClick={handleShareClick} className="p-2 bg-[#161B22] rounded-full text-white border border-white/5 hover:bg-white/10 transition-colors relative">
                        <AnimatePresence mode="wait">
                            {isCopied ? (
                                <motion.div key="check" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                                    <CheckCircle2 size={20} className="text-[#39FF14]" />
                                </motion.div>
                            ) : (
                                <motion.div key="share" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>
                                    <Share2 size={20} />
                                </motion.div>
                            )}
                        </AnimatePresence>
                        {isCopied && (
                            <span className="absolute top-12 right-0 bg-[#0A0E14] text-[#39FF14] text-[10px] font-bold px-2 py-1 rounded-md border border-[#39FF14]/20 whitespace-nowrap shadow-lg">
                                Kopyalandı!
                            </span>
                        )}
                    </button>
                </div>

                {/* Match Info Strip */}
                <div className="px-6 pb-4">
                    <div className="flex justify-between items-start">
                        <div>
                            <h2 className="text-2xl font-black text-white leading-none">{MATCH_DATA.pitchName}</h2>
                            <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                                <span className="flex items-center gap-1"><Calendar size={12} /> {MATCH_DATA.date}</span>
                                <span className="w-1 h-1 bg-gray-600 rounded-full"></span>
                                <span className="flex items-center gap-1"><Clock size={12} /> {MATCH_DATA.time}</span>
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="bg-blue-500/10 text-blue-400 px-3 py-1 rounded-lg text-xs font-bold border border-blue-500/20 flex items-center gap-1">
                                <CloudRain size={12} /> {MATCH_DATA.weather}
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mt-4">
                        <button
                            onClick={() => setIsPitchDetailOpen(true)}
                            className="bg-[#161B22] border border-white/10 py-2.5 rounded-xl text-[11px] font-bold text-white flex items-center justify-center gap-2 hover:bg-white/5 transition-colors"
                        >
                            <ExternalLink size={14} /> Tesis Detayı
                        </button>
                        <button
                            onClick={handleDirectionsClick}
                            className="bg-[#161B22] border border-white/10 py-2.5 rounded-xl text-[11px] font-bold text-white flex items-center justify-center gap-2 hover:bg-white/5 transition-colors"
                        >
                            <Navigation size={14} /> Yol Tarifi
                        </button>
                        <button
                            onClick={() => {}}
                            className="bg-red-500/10 border border-red-500/30 py-2.5 rounded-xl text-[11px] font-bold text-red-400 flex items-center justify-center gap-2 hover:bg-red-500/20 transition-colors shadow-[0_0_10px_rgba(239,68,68,0.1)]"
                        >
                            <Phone size={14} /> Tesis İletişim
                        </button>
                        <button
                            onClick={() => onNavigate('QR_SCANNER')}
                            className="bg-[#39FF14]/10 border border-[#39FF14]/30 py-2.5 rounded-xl text-[11px] font-black text-[#39FF14] flex items-center justify-center gap-2 hover:bg-[#39FF14]/20 transition-colors shadow-[0_0_10px_rgba(57,255,20,0.1)] uppercase tracking-wider"
                        >
                            <QrCode size={14} /> Check-in
                        </button>
                    </div>
                </div>

                {/* Tab Bar */}
                <div className="flex gap-1 px-4 pb-3">
                    {TABS.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                                activeTab === tab.id
                                    ? 'bg-[#FFFF00] text-black border-[#FFFF00] shadow-[0_0_15px_rgba(255,255,0,0.4)]'
                                    : 'bg-white/[0.04] text-gray-400 border-white/[0.06] hover:text-white'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </header>

            <main className="p-4 flex-1 overflow-y-auto custom-scrollbar">

                {/* ── DİZİLİŞ TAB ────────────────────────────────────── */}
                {activeTab === 'DİZİLİŞ' && (
                    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                        <div className="flex items-center gap-3 mb-1">
                            <div className="p-2.5 bg-[#39FF14]/10 rounded-xl">
                                <Users size={18} className="text-[#39FF14]" />
                            </div>
                            <div>
                                <h2 className="text-base font-black text-white italic uppercase tracking-tight leading-none">Takım Dizilişleri</h2>
                                <p className="text-[10px] text-gray-500 mt-0.5">İki takımın taktiksel dizilişleri ve kadroları</p>
                            </div>
                        </div>
                        <TeamLineupBoard />
                    </motion.div>
                )}

                {/* ── TAKTİK TAB ─────────────────────────────────────── */}
                {activeTab === 'TAKTİK' && (
                    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                        <div className="flex items-center gap-3 mb-1">
                            <div className="p-2.5 bg-[#39FF14]/10 rounded-xl">
                                <Crosshair size={18} className="text-[#39FF14]" />
                            </div>
                            <div>
                                <h2 className="text-base font-black text-white italic uppercase tracking-tight leading-none">Canlı Taktik Tahtası</h2>
                                <p className="text-[10px] text-gray-500 mt-0.5">Tüm oyuncular aynı anda görür ve düzenleyebilir</p>
                            </div>
                        </div>
                        <LiveTacticBoard matchId="match_demo_001" />
                    </motion.div>
                )}

                {/* ── KADRO TAB ──────────────────────────────────────── */}
                {activeTab === 'KADRO' && (
                    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                        <div className="flex items-center justify-between mb-1">
                            <h3 className="font-black text-white text-sm uppercase tracking-widest">Kadro & Ödemeler</h3>
                            <span className="text-xs text-gray-500">{MATCH_DATA.pricePerPerson}₺ / Kişi</span>
                        </div>
                        <div className="bg-[#161B22] rounded-[24px] border border-white/5 overflow-hidden">
                            {roster.map((player, idx) => (
                                <div key={player.id} className="flex items-center justify-between p-3.5 border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <span className="text-gray-600 text-xs font-mono w-5">{idx + 1}</span>
                                        <img src={player.avatar} className="w-10 h-10 rounded-full bg-gray-700 object-cover border border-white/10" alt={player.name} />
                                        <div>
                                            <p className="text-sm font-bold text-white">{player.name}</p>
                                            <p className="text-[10px] text-gray-500">{player.position}</p>
                                        </div>
                                    </div>
                                    <div>
                                        {player.paymentStatus === 'PAID' && <span className="text-green-400 text-[10px] font-black flex items-center gap-1 bg-green-500/10 px-2.5 py-1.5 rounded-xl border border-green-500/20"><CheckCircle2 size={11} /> ÖDENDİ</span>}
                                        {player.paymentStatus === 'PENDING' && <span className="text-yellow-500 text-[10px] font-black flex items-center gap-1 bg-yellow-500/10 px-2.5 py-1.5 rounded-xl border border-yellow-500/20"><Clock size={11} /> BEKLİYOR</span>}
                                        {player.paymentStatus === 'UNPAID' && <button className="text-red-400 text-[10px] font-black flex items-center gap-1 bg-red-500/10 px-2.5 py-1.5 rounded-xl border border-red-500/20 hover:bg-red-500/20 transition-colors"><AlertCircle size={11} /> HATIRLAT</button>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}

                {/* ── LOBİ TAB ───────────────────────────────────────── */}
                {activeTab === 'LOBI' && <div className="space-y-6">

                {/* 2. Side-by-Side VS Payment Bars */}
                <section>
                    <div className="flex justify-between items-center mb-3 px-1 mt-2">
                        <h3 className="font-black text-white text-sm flex items-center gap-2">
                            <Scale size={16} className="text-[#39FF14]" /> TAKIM ÖDEMELERİ
                        </h3>
                        <div className="bg-[#FFFF00]/10 text-[#FFFF00] text-[10px] font-black px-3 py-1.5 rounded-full border border-[#FFFF00]/30 hidden sm:flex items-center gap-1">
                            <CheckCircle2 size={12} /> TOPLAM {MATCH_DATA.totalPrice}₺
                        </div>
                    </div>

                    <div className="bg-[#161B22] rounded-[32px] border border-white/5 relative overflow-hidden shadow-[0_10px_40px_rgba(0,0,0,0.5)] p-5 pb-6 mb-4">
                        {/* Background glow */}
                        <div className="absolute top-0 left-0 w-32 h-32 bg-[#39FF14]/5 rounded-full blur-3xl pointer-events-none"></div>
                        <div className="absolute bottom-0 right-0 w-32 h-32 bg-[#FF3366]/5 rounded-full blur-3xl pointer-events-none"></div>
                        
                        <div className="flex items-end justify-between gap-2 h-[260px]">
                            
                            {/* TEAM A (Left) */}
                            <div className="flex-1 flex flex-col items-center h-full pb-0 relative">
                                {/* Hired GK Float */}
                                <div className="absolute -left-3 top-10 bg-[#0A0E14] border border-green-500/30 rounded-2xl p-2 z-20 flex flex-col items-center shadow-2xl">
                                    <div className="relative p-1 bg-green-500/10 rounded-full mb-1">
                                        <img src={MATCH_DATA.hiredGk.avatar} className="w-6 h-6 rounded-full border border-green-500/50" />
                                        {MATCH_DATA.hiredGk.liveStatus === 'ARRIVED' && (
                                            <div className="absolute -bottom-1 -right-1 bg-[#39FF14] text-black rounded-full p-0.5 shadow-lg">
                                                <CheckCircle2 size={8} />
                                            </div>
                                        )}
                                    </div>
                                    <span className="text-[7px] font-black text-gray-500 uppercase tracking-widest">Kaleci</span>
                                    <span className="text-[9px] font-black text-[#39FF14] bg-[#39FF14]/10 px-1.5 py-0.5 rounded-sm mt-0.5 mb-1">+{MATCH_DATA.hiredGk.price}₺</span>
                                    {MATCH_DATA.hiredGk.liveStatus === 'ARRIVED' && (
                                        <span className="text-[7px] font-black text-black bg-[#39FF14] px-1.5 py-0.5 rounded-full uppercase">TESİSTE</span>
                                    )}
                                    {MATCH_DATA.hiredGk.liveStatus === 'ON_THE_WAY' && (
                                        <span className="text-[7px] font-black text-black bg-blue-400 px-1.5 py-0.5 rounded-full uppercase">YOLDA</span>
                                    )}
                                </div>

                                <div className="text-center mb-3 z-10 w-full relative pt-2">
                                    <h4 className="text-[11px] font-black text-white uppercase tracking-widest bg-[#0A0E14] px-3 py-1.5 rounded-xl inline-block border border-[#39FF14]/20 shadow-[0_0_15px_rgba(57,255,20,0.1)]">BİZİM TAKIM</h4>
                                    <p className="text-[9px] text-gray-500 font-bold mt-1.5">Hedef: {MATCH_DATA.teamATarget}₺</p>
                                </div>

                                {/* Vertical Bar */}
                                <div className="relative w-14 sm:w-16 flex-1 bg-[#0A0E14] rounded-t-[20px] rounded-b-[8px] border border-white/10 overflow-hidden flex flex-col justify-end shadow-[inset_0_4px_20px_rgba(0,0,0,0.8)] z-10">
                                    <div className="absolute inset-0 flex flex-col items-center justify-center z-20 pointer-events-none">
                                        <span className="text-sm font-black text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">%{Math.round(teamAProgress)}</span>
                                    </div>
                                    <motion.div 
                                        initial={{ height: 0 }}
                                        animate={{ height: `${teamAProgress}%` }}
                                        transition={{ type: "spring", stiffness: 50, damping: 15 }}
                                        className="w-full bg-gradient-to-t from-green-700 via-[#39FF14] to-yellow-300 relative rounded-t-[12px]"
                                    >
                                        <div className="absolute top-0 left-0 w-full h-8 bg-gradient-to-b from-white/40 to-transparent animate-pulse blur-[1px]"></div>
                                    </motion.div>
                                </div>
                                <div className="mt-3 text-center bg-[#0A0E14] w-full py-2 rounded-xl border border-white/5">
                                    <span className={`text-sm font-black block leading-none mb-1 ${teamARemaining === 0 ? 'text-[#39FF14]' : 'text-white'}`}>{teamARemaining === 0 ? 'ÖDENDİ' : `${teamAPaid}₺`}</span>
                                    {teamARemaining > 0 && <span className="text-[9px] text-[#FF3366] font-bold block leading-none">Kalan: {teamARemaining}₺</span>}
                                </div>
                            </div>

                            {/* REFEREE (Center VS) */}
                            <div className="flex flex-col items-center justify-center h-full z-20 px-1 sm:px-2">
                                <div className="bg-[#0A0E14] border border-[#FFFF00]/30 rounded-[24px] p-2 shadow-[0_0_30px_rgba(255,255,0,0.15)] relative flex flex-col items-center mt-8">
                                    <div className="bg-[#161B22] border border-[#FFFF00]/20 rounded-2xl w-14 h-16 sm:w-16 sm:h-20 flex flex-col items-center justify-center relative overflow-hidden mb-2">
                                        <div className="absolute inset-0 bg-yellow-500/10 animate-[pulse_3s_ease-in-out_infinite]"></div>
                                        <div className="relative">
                                            <img src={MATCH_DATA.hiredReferee.avatar} className="w-8 h-8 sm:w-10 sm:h-10 rounded-full border border-yellow-500/50 object-cover relative z-10 mb-1 shadow-md" />
                                            {MATCH_DATA.hiredReferee.liveStatus === 'ON_THE_WAY' && (
                                                <div className="absolute -bottom-1 -right-1 bg-blue-400 text-black rounded-full p-0.5 shadow-lg z-20">
                                                    <Navigation size={10} />
                                                </div>
                                            )}
                                        </div>
                                        <div className="bg-yellow-500/20 px-1.5 py-0.5 rounded text-[8px] font-black text-[#FFFF00] relative z-10">+{MATCH_DATA.hiredReferee.price}₺</div>
                                    </div>
                                    <span className="text-[8px] font-black text-gray-500 block uppercase tracking-widest mb-0.5">Hakem</span>
                                    <span className="text-[9px] font-bold text-yellow-500 bg-yellow-500/10 px-2.5 py-1 rounded-full mb-1">{MATCH_DATA.hiredReferee.name}</span>
                                    {MATCH_DATA.hiredReferee.liveStatus === 'ON_THE_WAY' && (
                                        <span className="text-[8px] font-black text-black bg-blue-400 px-2 py-0.5 rounded-full uppercase">YOLDA</span>
                                    )}
                                </div>
                            </div>

                            {/* TEAM B (Right) */}
                            <div className="flex-1 flex flex-col items-center h-full pb-0 relative">
                                <div className="text-center mb-3 z-10 w-full relative pt-2">
                                    <h4 className="text-[11px] font-black text-gray-400 uppercase tracking-widest bg-[#0A0E14] px-3 py-1.5 rounded-xl inline-block border border-red-500/20 shadow-[0_0_15px_rgba(255,51,102,0.1)]">RAKİP TAKIM</h4>
                                    <p className="text-[9px] text-gray-500 font-bold mt-1.5">Hedef: {MATCH_DATA.teamBTarget}₺</p>
                                </div>

                                <div className="relative w-14 sm:w-16 flex-1 bg-[#0A0E14] rounded-t-[20px] rounded-b-[8px] border border-white/10 overflow-hidden flex flex-col justify-end shadow-[inset_0_4px_20px_rgba(0,0,0,0.8)] z-10 opacity-90">
                                    <div className="absolute inset-0 flex flex-col items-center justify-center z-20 pointer-events-none">
                                        <span className="text-sm font-black text-white/80 drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">%{Math.round(teamBProgress)}</span>
                                    </div>
                                    <motion.div 
                                        initial={{ height: 0 }}
                                        animate={{ height: `${teamBProgress}%` }}
                                        transition={{ type: "spring", stiffness: 50, damping: 15 }}
                                        className="w-full bg-gradient-to-t from-red-900 via-[#FF3366] to-pink-400 relative rounded-t-[12px]"
                                    >
                                        <div className="absolute top-0 left-0 w-full h-8 bg-gradient-to-b from-white/20 to-transparent animate-pulse blur-[1px]"></div>
                                    </motion.div>
                                </div>
                                <div className="mt-3 text-center bg-[#0A0E14] w-full py-2 rounded-xl border border-white/5 opacity-80">
                                    <span className={`text-sm font-black block leading-none mb-1 text-gray-300`}>{teamBPaid}₺</span>
                                    <span className="text-[9px] text-gray-600 font-bold block leading-none">Kalan: {MATCH_DATA.teamBTarget - teamBPaid}₺</span>
                                </div>
                            </div>

                        </div>
                    </div>

                    {/* Quick Payment Action Buttons */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 relative z-10 w-full mb-8">
                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => setPendingPayment({ amount: MATCH_DATA.pricePerPerson, label: 'Kendi Payım' })}
                            disabled={teamARemaining === 0}
                            className="w-full bg-[#0A0E14] border border-[#FFFF00]/20 p-3 rounded-2xl flex flex-col items-center justify-center gap-2 hover:bg-[#FFFF00]/10 hover:border-[#FFFF00] transition-colors group disabled:opacity-50 disabled:pointer-events-none"
                        >
                            <User size={18} className="text-[#FFFF00] group-hover:scale-110 transition-transform" />
                            <div className="text-center">
                                <div className="text-[9px] text-[#FFFF00]/70 font-bold uppercase leading-none mb-1">Kendi Payım</div>
                                <div className="text-sm font-black text-[#FFFF00] leading-none">{MATCH_DATA.pricePerPerson}₺</div>
                            </div>
                        </motion.button>

                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => setPendingPayment({ amount: MATCH_DATA.pricePerPerson * 2, label: '+1 Misafir' })}
                            disabled={teamARemaining === 0}
                            className="w-full bg-[#0A0E14] border border-[#FFFF00]/20 p-3 rounded-2xl flex flex-col items-center justify-center gap-2 hover:bg-[#FFFF00]/10 hover:border-[#FFFF00] transition-colors group disabled:opacity-50 disabled:pointer-events-none"
                        >
                            <Users size={18} className="text-[#FFFF00] group-hover:scale-110 transition-transform" />
                            <div className="text-center">
                                <div className="text-[9px] text-[#FFFF00]/70 font-bold uppercase leading-none mb-1">+1 Misafir</div>
                                <div className="text-sm font-black text-[#FFFF00] leading-none">{MATCH_DATA.pricePerPerson * 2}₺</div>
                            </div>
                        </motion.button>

                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => setPendingPayment({ amount: teamARemaining, label: 'Kalanı Kapat' })}
                            disabled={teamARemaining === 0}
                            className="w-full bg-[#0A0E14] border border-[#FFFF00]/20 p-3 rounded-2xl flex flex-col items-center justify-center gap-2 hover:bg-[#FFFF00]/10 hover:border-[#FFFF00] transition-colors group disabled:opacity-50 disabled:pointer-events-none"
                        >
                            <Banknote size={18} className="text-[#FFFF00] group-hover:scale-110 transition-transform" />
                            <div className="text-center">
                                <div className="text-[9px] text-[#FFFF00]/70 font-bold uppercase leading-none mb-1">Kalanı Kapat</div>
                                <div className="text-sm font-black text-[#FFFF00] leading-none">{teamARemaining}₺</div>
                            </div>
                        </motion.button>

                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => setIsCustomPaymentModalOpen(true)}
                            disabled={teamARemaining === 0}
                            className="w-full bg-gradient-to-br from-[#FFFF00] to-yellow-500 p-3 rounded-2xl flex flex-col items-center justify-center gap-2 group shadow-[0_0_20px_rgba(255,255,0,0.4)] text-black disabled:opacity-50 disabled:pointer-events-none disabled:grayscale"
                        >
                            <CreditCard size={18} className="text-black group-hover:scale-110 transition-transform" />
                            <div className="text-center">
                                <div className="text-[9px] font-black uppercase opacity-70 leading-none mb-1 text-black">Özel Tutar</div>
                                <div className="text-sm font-black leading-none text-black">ÖDE</div>
                            </div>
                        </motion.button>
                    </div>
                </section>

                {/* 3. Squad & Payment List */}
                <section>
                    <div className="flex justify-between items-center mb-3 px-1">
                        <h3 className="font-black text-white text-sm">KADRO & ÖDEMELER</h3>
                        <span className="text-xs text-gray-400">{MATCH_DATA.pricePerPerson}₺ / Kişi</span>
                    </div>

                    <div className="bg-[#161B22] rounded-[24px] border border-white/5 overflow-hidden">
                        {roster.map((player, idx) => (
                            <div key={player.id} className="flex items-center justify-between p-3 border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors">
                                <div className="flex items-center gap-3">
                                    <span className="text-gray-600 text-xs font-mono w-4">{idx + 1}</span>
                                    <img src={player.avatar} className="w-8 h-8 rounded-full bg-gray-700 object-cover" alt={player.name} />
                                    <div>
                                        <p className="text-sm font-bold text-white">{player.name}</p>
                                        <p className="text-[10px] text-gray-500">{player.position}</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    {player.paymentStatus === 'PAID' && (
                                        <span className="text-green-400 text-xs font-bold flex items-center gap-1 bg-green-500/10 px-2 py-1 rounded-lg">
                                            <CheckCircle2 size={12} /> ÖDENDİ
                                        </span>
                                    )}
                                    {player.paymentStatus === 'PENDING' && (
                                        <span className="text-yellow-500 text-xs font-bold flex items-center gap-1 bg-yellow-500/10 px-2 py-1 rounded-lg">
                                            <Clock size={12} /> BEKLİYOR
                                        </span>
                                    )}
                                    {player.paymentStatus === 'UNPAID' && (
                                        <button className="text-red-400 text-xs font-bold flex items-center gap-1 bg-red-500/10 px-2 py-1 rounded-lg border border-red-500/20 hover:bg-red-500 hover:text-white transition-colors">
                                            <AlertCircle size={12} /> HATIRLAT
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                </div>} {/* end LOBI tab */}

            </main>



            {/* Pitch Detail Modal */}
            <AnimatePresence>
                {isPitchDetailOpen && selectedPitch && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-[#0A0E14]/95 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-[#161B22] border border-white/10 rounded-[32px] w-full max-w-md overflow-hidden shadow-2xl my-8"
                        >
                            <div className="relative h-48">
                                <img src={selectedPitch.image} className="w-full h-full object-cover" alt={selectedPitch.name} />
                                <div className="absolute inset-0 bg-gradient-to-t from-[#161B22] to-transparent"></div>
                                <button
                                    onClick={() => setIsPitchDetailOpen(false)}
                                    className="absolute top-4 left-4 px-4 py-2 bg-black/40 backdrop-blur-md rounded-full text-white text-xs font-bold flex items-center gap-2 hover:bg-black/60 transition-colors z-10"
                                >
                                    <ArrowLeft size={16} /> Geri
                                </button>
                                <button
                                    onClick={() => setIsPitchDetailOpen(false)}
                                    className="absolute top-4 right-4 p-2 bg-black/40 backdrop-blur-md rounded-full text-white hover:bg-black/60 transition-colors z-10"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="p-6 pt-2">
                                <h2 className="text-2xl font-black text-white mb-1">{selectedPitch.name}</h2>
                                <p className="text-sm text-gray-400 flex items-center gap-1 mb-4">
                                    <MapPin size={14} /> {selectedPitch.location}
                                </p>

                                <div className="grid grid-cols-3 gap-2 mb-6">
                                    <div className="bg-[#0A0E14] p-3 rounded-xl border border-white/5 flex flex-col items-center">
                                        <p className="text-[8px] text-gray-500 font-bold uppercase mb-1">Zemin</p>
                                        <p className="text-lg font-black text-[#39FF14]">A</p>
                                    </div>
                                    <div className="bg-[#0A0E14] p-3 rounded-xl border border-white/5 flex flex-col items-center">
                                        <p className="text-[8px] text-gray-500 font-bold uppercase mb-1">Işıklandırma</p>
                                        <p className="text-lg font-black text-blue-400">B+</p>
                                    </div>
                                    <div className="bg-[#0A0E14] p-3 rounded-xl border border-white/5 flex flex-col items-center">
                                        <p className="text-[8px] text-gray-500 font-bold uppercase mb-1">Soyunma Odası</p>
                                        <p className="text-lg font-black text-orange-400">C-</p>
                                    </div>
                                </div>

                                {/* Boot Rental Section */}
                                <div className="mb-6">
                                    <div className="flex items-center justify-between mb-3">
                                        <p className="text-[10px] text-gray-500 font-bold uppercase">Krampon Kiralama</p>
                                        <span className="text-[10px] bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded-full border border-blue-500/20">Tesis İçi</span>
                                    </div>
                                    <div className="space-y-3">
                                        {BOOTS.map(boot => (
                                            <div key={boot.id} className="flex items-center justify-between bg-[#0A0E14] p-3 rounded-2xl border border-white/5 group hover:border-white/20 transition-all">
                                                <div className="flex items-center gap-3">
                                                    <img src={boot.image} className="w-12 h-12 rounded-xl object-cover" />
                                                    <div>
                                                        <p className="text-xs font-bold text-white">{boot.name}</p>
                                                        <p className="text-[10px] text-gray-500">{boot.brand} • {boot.price}₺</p>
                                                    </div>
                                                </div>
                                                {rentedBoots.includes(boot.id) ? (
                                                    <span className="text-[10px] font-black text-green-400 bg-green-400/10 px-3 py-1.5 rounded-lg border border-green-400/20">REZERVE EDİLDİ</span>
                                                ) : (
                                                    <button
                                                        onClick={() => handleRentBoot(boot)}
                                                        className="bg-[#161B22] text-white text-[10px] font-black px-4 py-2 rounded-xl border border-white/10 hover:bg-white hover:text-black transition-all"
                                                    >
                                                        KİRALA
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <p className="text-[10px] text-gray-500 font-bold uppercase mb-2">İmkanlar</p>
                                    <div className="flex flex-wrap gap-2">
                                        {selectedPitch.amenities.map(a => (
                                            <span key={a} className="text-xs font-bold bg-[#0A0E14] text-gray-300 px-3 py-1.5 rounded-lg border border-white/5">
                                                {a}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Payment Modal for Boots */}
            <AnimatePresence>
                {selectedBoot && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
                    >
                        <motion.div
                            initial={{ y: 100 }}
                            animate={{ y: 0 }}
                            exit={{ y: 100 }}
                            className="bg-[#161B22] border border-white/10 rounded-t-[32px] sm:rounded-[32px] w-full max-w-md p-6 shadow-2xl"
                        >
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-lg font-black text-white uppercase tracking-widest">ÖDEME & REZERVASYON</h3>
                                <button onClick={() => setSelectedBoot(null)} className="p-2 text-gray-400 hover:text-white"><X size={20} /></button>
                            </div>

                            <div className="bg-[#0A0E14] p-4 rounded-2xl border border-white/5 mb-6 flex items-center gap-4">
                                <img src={selectedBoot.image} className="w-16 h-16 rounded-xl object-cover" />
                                <div>
                                    <p className="text-sm font-bold text-white">{selectedBoot.name}</p>
                                    <p className="text-xs text-gray-500">{selectedBoot.brand}</p>
                                    <p className="text-lg font-black text-[#FFFF00] mt-1">{selectedBoot.price}₺</p>
                                </div>
                            </div>

                            <div className="space-y-4 mb-8">
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-400">Kiralama Bedeli</span>
                                    <span className="text-white font-bold">{selectedBoot.price}₺</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-400">Hizmet Bedeli</span>
                                    <span className="text-white font-bold">0₺</span>
                                </div>
                                <div className="h-px bg-white/5"></div>
                                <div className="flex justify-between text-lg">
                                    <span className="text-white font-black">TOPLAM</span>
                                    <span className="text-[#FFFF00] font-black">{selectedBoot.price}₺</span>
                                </div>
                            </div>

                            <button
                                onClick={confirmPayment}
                                disabled={isPaying}
                                className="w-full h-16 bg-[#FFFF00] text-black rounded-2xl font-black text-sm tracking-widest flex items-center justify-center gap-3 shadow-[0_10px_30px_rgba(255,255,0,0.2)] hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                            >
                                {isPaying ? (
                                    <div className="w-6 h-6 border-4 border-black/30 border-t-black rounded-full animate-spin"></div>
                                ) : (
                                    <>
                                        <CreditCard size={20} />
                                        ÖDEMEYİ TAMAMLA
                                    </>
                                )}
                            </button>
                            <p className="text-center text-[10px] text-gray-500 mt-4 uppercase font-bold tracking-tighter">Ödeme yapıldıktan sonra kramponunuz tesis girişinde teslim edilecektir.</p>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Custom Payment Modal */}
            <AnimatePresence>
                {isCustomPaymentModalOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-4"
                    >
                        <motion.div
                            initial={{ y: 100 }}
                            animate={{ y: 0 }}
                            exit={{ y: 100 }}
                            className="bg-[#161B22] border border-[#39FF14]/30 rounded-t-[32px] sm:rounded-[32px] w-full max-w-sm p-6 shadow-[0_0_50px_rgba(57,255,20,0.1)] relative overflow-hidden"
                        >
                            <div className="absolute top-0 right-0 w-32 h-32 bg-[#39FF14]/10 rounded-full blur-3xl"></div>
                            
                            <div className="flex justify-between items-center mb-6 relative z-10">
                                <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                                    <PiggyBank size={18} className="text-[#39FF14]"/> ÖZEL TUTAR GİR
                                </h3>
                                <button onClick={() => setIsCustomPaymentModalOpen(false)} className="p-2 text-gray-400 hover:text-white"><X size={20} /></button>
                            </div>

                            <div className="relative z-10 mb-6">
                                <label className="text-[10px] text-gray-400 font-bold uppercase mb-2 block">Ne kadar ödemek istiyorsun?</label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        inputMode="numeric"
                                        pattern="[0-9]*"
                                        autoFocus
                                        value={customAmount}
                                        onChange={(e) => setCustomAmount(e.target.value)}
                                        placeholder="0"
                                        className="w-full bg-[#0A0E14] border border-white/10 rounded-2xl h-16 px-6 text-2xl font-black text-white focus:outline-none focus:border-[#39FF14]/50 transition-all font-mono"
                                    />
                                    <div className="absolute right-6 top-1/2 -translate-y-1/2 text-xl font-black text-gray-500">₺</div>
                                </div>
                                <p className="text-[10px] text-gray-500 mt-2 font-bold tracking-tight">Maksimum eklenebilecek: <span className="text-[#FFFF00]">{teamARemaining}₺</span></p>
                            </div>

                            <button
                                onClick={handleCustomPaymentSubmit}
                                disabled={!customAmount || isNaN(parseInt(customAmount)) || parseInt(customAmount) <= 0}
                                className="w-full h-14 bg-gradient-to-r from-[#39FF14] to-[#32E612] text-black rounded-xl font-black text-sm tracking-widest flex items-center justify-center gap-2 shadow-[0_10px_30px_rgba(57,255,20,0.3)] hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:hover:scale-100 relative z-10"
                            >
                                <CheckCircle2 size={18} /> ONAYLA VE ÖDE
                            </button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Confirmation Modal */}
            <AnimatePresence>
                {pendingPayment && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-[#161B22] border border-white/10 rounded-[32px] w-full max-w-sm p-6 shadow-2xl relative overflow-hidden text-center"
                        >
                            <div className="absolute top-0 right-0 w-32 h-32 bg-[#39FF14]/10 rounded-full blur-3xl"></div>
                            
                            <div className="w-16 h-16 bg-[#0A0E14] border border-white/5 rounded-2xl flex items-center justify-center mx-auto mb-4 relative z-10">
                                <AlertCircle size={32} className="text-[#FFFF00]" />
                            </div>

                            <h3 className="text-xl font-black text-white uppercase tracking-widest mb-2 relative z-10">Emin misiniz?</h3>
                            <p className="text-sm text-gray-400 mb-6 relative z-10">
                                {pendingPayment.label} için <span className="text-[#FFFF00] font-black">{Math.min(pendingPayment.amount, teamARemaining)}₺</span> ödeme yapacaksınız. Onaylıyor musunuz?
                            </p>

                            <div className="flex gap-3 relative z-10">
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => setPendingPayment(null)}
                                    className="flex-1 bg-[#0A0E14] border border-white/10 text-white rounded-xl font-bold py-3.5 hover:bg-white/5 transition-colors text-sm uppercase tracking-wider"
                                >
                                    Vazgeç
                                </motion.button>
                                <motion.button
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => {
                                        handleQuickPayment(pendingPayment.amount);
                                        setPendingPayment(null);
                                    }}
                                    className="flex-1 bg-gradient-to-r from-[#FFFF00] to-yellow-500 text-black rounded-xl font-black py-3.5 shadow-[0_10px_30px_rgba(255,255,0,0.4)] text-sm uppercase tracking-wider"
                                >
                                    Öde
                                </motion.button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

        </div>
    );
};

export default MatchLobby;
