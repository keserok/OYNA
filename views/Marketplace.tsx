
import React, { useState, useMemo } from 'react';
import {
    ChevronLeft, ChevronRight, X, Map as MapIcon, List, Minus, Plus, Zap, Activity, MessageSquare, Sparkles, Shield, Scale, Star, Navigation, Heart, Share2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Referee, Goalkeeper } from '../types';
import { useAppStore } from '../store';
import { MarketplaceCard } from '../components/Marketplace/MarketplaceCard';
import { MarketplaceMap } from '../components/Marketplace/MarketplaceMap';
import { EmptyState } from '../components/common/StatusState';
import { Toast } from '../components/common/Toast';
import { createServiceRequest } from '../services/serviceRequestService';

const getNormalizedDifficulty = (diff?: string): string => {
  if (!diff) return 'Rahat';
  const d = diff.trim().toLowerCase();
  if (d === 'ciddi' || d === 'pro') return 'Ciddi';
  if (d === 'taktiksel' || d === 'yarı-pro' || d === 'yari-pro' || d === 'yarı pro' || d === 'yari pro') return 'Taktiksel';
  if (d === 'rahat' || d === 'amatör' || d === 'amator' || d === 'eğlence' || d === 'eglence') return 'Rahat';
  return diff.charAt(0).toUpperCase() + diff.slice(1);
};

interface MarketplaceProps {
    type: 'REF' | 'GK';
    onBack: () => void;
    onSelect?: (item: Goalkeeper | Referee) => void;
}

const SkillBar: React.FC<{ label: string; value: number; color: string }> = ({ label, value, color }) => (
    <div className="space-y-1">
        <div className="flex justify-between items-center px-1">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-tighter">{label}</span>
            <span className="text-[10px] font-black text-white">{value}</span>
        </div>
        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
            <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${value}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
                className={`h-full ${color} rounded-full`}
            />
        </div>
    </div>
);

const Marketplace: React.FC<MarketplaceProps> = ({ type: initialType, onBack, onSelect }) => {
    const [activeTab, setActiveTab] = useState<'GK' | 'REF'>(initialType);
    const [viewMode, setViewMode] = useState<'LIST' | 'MAP'>('LIST');
    const [selectedProfile, setSelectedProfile] = useState<Goalkeeper | Referee | null>(null);
    const [isHiring, setIsHiring] = useState(false);
    const [bidAmount, setBidAmount] = useState<number>(0);
    const [isBidding, setIsBidding] = useState(false);

    // If initialType is provided, we might want to lock the tab or just default to it.
    // The user said "yalnızca ... çıksın", so I'll hide the tabs if initialType is passed.
    const isLocked = !!initialType;

    const { adminGoalkeepers, adminReferees, adminMatches, setAdminMatches, updateMatch } = useAppStore();
    const profiles = activeTab === 'GK' ? adminGoalkeepers : adminReferees;

    const [filterDistrict, setFilterDistrict] = useState<string>('Tümü');
    const [filterDay, setFilterDay] = useState<string>('Tümü');
    const [filterTime, setFilterTime] = useState<string>('Tümü');

    const filteredProfiles = useMemo(() => {
        return profiles.filter(p => {
            const matchesDistrict = filterDistrict === 'Tümü' || (p.preferredZones && p.preferredZones.includes(filterDistrict));
            const matchesDay = filterDay === 'Tümü' || (p.workingHours && p.workingHours.activeDays && p.workingHours.activeDays.includes(filterDay));
            // Check if activeHours contains the time (it might be a string "18:00 - 23:00" or an array)
            const matchesTime = filterTime === 'Tümü' || (p.workingHours && p.workingHours.activeHours && p.workingHours.activeHours.includes(filterTime));
            return matchesDistrict && matchesDay && matchesTime;
        });
    }, [profiles, filterDistrict, filterDay, filterTime]);

    const myMatches = useMemo(() => {
        return adminMatches.filter(m => m.status === 'DRAFT' || m.status === 'ACTIVE' || !m.status);
    }, [adminMatches]);

    const [showBidScreen, setShowBidScreen] = useState(false);
    const [showMatchSelection, setShowMatchSelection] = useState(false);
    const [hireMode, setHireMode] = useState<'BID' | 'DIRECT'>('DIRECT');
    const [selectedMatchForHire, setSelectedMatchForHire] = useState<any>(null);
    const [showSuccessScreen, setShowSuccessScreen] = useState(false);
    // Gerçek hata geri bildirimi (sahte "gönderildi" yerine).
    const [errorToast, setErrorToast] = useState<string | null>(null);

    const showError = (msg: string) => {
        setErrorToast(msg);
        setTimeout(() => setErrorToast(null), 3800);
    };

    const handleSelect = (p: Goalkeeper | Referee) => {
        setSelectedProfile(p);
        setBidAmount(p.fee);
        setShowBidScreen(false);
        setShowMatchSelection(false);
        setShowSuccessScreen(false);
    };

    const handleInitiateOffer = () => {
        setHireMode('BID');
        setShowBidScreen(true);
    };

    const handleDirectHire = () => {
        setHireMode('DIRECT');
        if (selectedProfile) {
            setBidAmount(selectedProfile.fee);
        }
        setShowMatchSelection(true);
    };

    // Başarı ekranını göster + kısa süre sonra kapat (yalnızca gerçek işlem başarılıysa çağrılır).
    const flashSuccessAndClose = () => {
        setShowSuccessScreen(true);
        setTimeout(() => {
            setShowSuccessScreen(false);
            setSelectedProfile(null);
            setShowMatchSelection(false);
            setShowBidScreen(false);
            if (onSelect && selectedProfile) {
                onSelect(selectedProfile);
            }
        }, 3000);
    };

    const handleConfirmMatch = async (match: any) => {
        if (isHiring) return;
        setSelectedMatchForHire(match);
        setIsHiring(true);

        if (hireMode === 'DIRECT') {
            let updatedMatch = { ...match };
            if (activeTab === 'GK') {
                const slots = match.slots ? [...match.slots] : [];
                const gkSlotIndex = slots.findIndex((s: any) => s.role === 'GK' && s.status === 'OPEN');
                if (gkSlotIndex !== -1) {
                    slots[gkSlotIndex] = { ...slots[gkSlotIndex], status: 'TAKEN' };
                    updatedMatch.slots = slots;
                }
                if (updatedMatch.missingPositions) {
                    updatedMatch.missingPositions = updatedMatch.missingPositions.map((pos: any) =>
                        pos.role === 'GK' ? { ...pos, count: Math.max(0, pos.count - 1) } : pos
                    );
                }
            } else {
                updatedMatch.refereeId = selectedProfile?.id;
            }

            if (updateMatch) {
                updateMatch(updatedMatch);
            } else {
                setAdminMatches(adminMatches.map(m => m.id === match.id ? updatedMatch : m));
            }
            setIsHiring(false);
            flashSuccessAndClose();
            return;
        }

        // BID Modu: GERÇEK hizmet talebi oluştur (blokaj + komisyon sunucuda hesaplanır)
        // → sağlayıcının ServiceDashboard "gelen istekler" kutusuna düşer.
        if (!selectedProfile?.id) {
            setIsHiring(false);
            showError('Sağlayıcı seçilmedi.');
            return;
        }
        try {
            const res = await createServiceRequest(match.id, selectedProfile.id, activeTab);
            // Başarı ekranında gerçek ücreti göster (sunucudan dönen), sahte "bid" değil.
            setBidAmount(res.fee);
            setIsHiring(false);
            flashSuccessAndClose();
        } catch (err: any) {
            setIsHiring(false);
            showError(err?.message || 'Teklif gönderilemedi. Lütfen tekrar dene.');
        }
    };

    return (
        <div className="min-h-screen bg-[#0A0E14] relative flex flex-col font-sans overflow-hidden">

            {/* 1. Header */}
            <header className="px-6 pt-6 pb-4 flex justify-between items-center bg-[#0A0E14]/90 backdrop-blur-xl sticky top-0 z-30 border-b border-white/5">
                <button
                    onClick={onBack}
                    className="w-11 h-11 flex items-center justify-center bg-[#161B22] rounded-full text-white border border-white/5 hover:bg-white/10 active:scale-95 transition-all"
                >
                    <ChevronLeft size={20} />
                </button>
                <div className="flex flex-col items-center">
                    <h1 className="text-sm font-black tracking-[0.2em] text-white uppercase font-display">
                        {activeTab === 'GK' ? 'TRANSFER MARKET: KALECİ' : 'TRANSFER MARKET: HAKEM'}
                    </h1>
                    <div className="flex items-center gap-1">
                        <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${activeTab === 'GK' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-brand-primary shadow-[0_0_8px_rgba(255,255,0,0.5)]'}`}></div>
                        <span className="text-[8px] font-black text-gray-500 uppercase tracking-widest">Profesyonel Arama Aktif</span>
                    </div>
                </div>
                <button
                    onClick={() => setViewMode(viewMode === 'LIST' ? 'MAP' : 'LIST')}
                    className="w-11 h-11 flex items-center justify-center bg-[#161B22] rounded-full text-brand-primary border border-brand-primary/20 hover:bg-brand-primary/10 active:scale-95 transition-all"
                >
                    {viewMode === 'LIST' ? <MapIcon size={20} /> : <List size={20} />}
                </button>
            </header>

            {/* 2. Tabs (Hidden if locked) */}
            {!isLocked && (
                <div className="px-6 py-4 bg-[#0A0E14]">
                    <div className="bg-[#161B22] p-1.5 rounded-[24px] flex border border-white/5 shadow-inner">
                        <button
                            onClick={() => setActiveTab('GK')}
                            className={`flex-1 py-3.5 text-[10px] font-black rounded-[18px] transition-all flex items-center justify-center gap-2 ${activeTab === 'GK' ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-900/20' : 'text-gray-500 hover:text-white'}`}
                        >
                            <Shield size={14} /> KALECİLER
                        </button>
                        <button
                            onClick={() => setActiveTab('REF')}
                            className={`flex-1 py-3.5 text-[10px] font-black rounded-[18px] transition-all flex items-center justify-center gap-2 ${activeTab === 'REF' ? 'bg-brand-primary text-black shadow-lg shadow-yellow-900/20' : 'text-gray-500 hover:text-white'}`}
                        >
                            <Scale size={14} /> HAKEMLER
                        </button>
                    </div>
                </div>
            )}

            {/* Filters */}
            <div className="px-6 pb-2 pt-2 bg-[#0A0E14] flex gap-2 overflow-x-auto custom-scrollbar">
                <select 
                    value={filterDistrict} 
                    onChange={e => setFilterDistrict(e.target.value)}
                    className="bg-[#161B22] text-[11px] font-bold text-white px-3 py-2 rounded-xl border border-white/10 outline-none appearance-none min-w-[100px]"
                >
                    <option value="Tümü">Tüm İlçeler</option>
                    <option value="Kadıköy">Kadıköy</option>
                    <option value="Beşiktaş">Beşiktaş</option>
                    <option value="Şişli">Şişli</option>
                    <option value="Ümraniye">Ümraniye</option>
                    <option value="Maltepe">Maltepe</option>
                    <option value="Üsküdar">Üsküdar</option>
                    <option value="Bağcılar">Bağcılar</option>
                    <option value="Pendik">Pendik</option>
                    <option value="Sarıyer">Sarıyer</option>
                    <option value="Bakırköy">Bakırköy</option>
                </select>
                <select 
                    value={filterDay} 
                    onChange={e => setFilterDay(e.target.value)}
                    className="bg-[#161B22] text-[11px] font-bold text-white px-3 py-2 rounded-xl border border-white/10 outline-none appearance-none min-w-[100px]"
                >
                    <option value="Tümü">Tüm Günler</option>
                    <option value="Pzt">Pazartesi</option>
                    <option value="Sal">Salı</option>
                    <option value="Çar">Çarşamba</option>
                    <option value="Per">Perşembe</option>
                    <option value="Cum">Cuma</option>
                    <option value="Cmt">Cumartesi</option>
                    <option value="Paz">Pazar</option>
                </select>
                <select 
                    value={filterTime} 
                    onChange={e => setFilterTime(e.target.value)}
                    className="bg-[#161B22] text-[11px] font-bold text-white px-3 py-2 rounded-xl border border-white/10 outline-none appearance-none min-w-[100px]"
                >
                    <option value="Tümü">Tüm Saatler</option>
                    <option value="18:00">18:00</option>
                    <option value="19:00">19:00</option>
                    <option value="20:00">20:00</option>
                    <option value="21:00">21:00</option>
                    <option value="22:00">22:00</option>
                    <option value="23:00">23:00</option>
                </select>
            </div>

            {/* 3. Main Content */}
            <div className="flex-1 relative overflow-hidden">
                {viewMode === 'LIST' ? (
                    <div className="h-full px-6 pb-24 overflow-y-auto custom-scrollbar">
                        <div className="grid grid-cols-1 gap-6 pt-2">
                            {filteredProfiles.length === 0 ? (
                                <EmptyState title="Profil Bulunamadı" message="Bu kriterlere uygun bir profil bulunamadı." />
                            ) : (
                                filteredProfiles.map(p => (
                                    <MarketplaceCard
                                        key={p.id}
                                        item={p}
                                        type={activeTab}
                                        onClick={() => handleSelect(p)}
                                    />
                                ))
                            )}
                        </div>
                    </div>
                ) : (
                    <MarketplaceMap
                        items={filteredProfiles}
                        type={activeTab}
                        onSelect={handleSelect}
                    />
                )}
            </div>

            {/* Detailed View Modal */}
            <AnimatePresence>
                {selectedProfile && (
                    <motion.div
                        initial={{ opacity: 0, y: 100 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 100 }}
                        className="fixed inset-0 z-50 bg-[#0A0E14] flex flex-col overflow-hidden"
                    >
                        {showSuccessScreen ? (
                            /* Success Screen Overlay */
                            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-[#0A0E14] relative">
                                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-15 pointer-events-none" />
                                
                                <motion.div
                                    initial={{ scale: 0.8, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    transition={{ type: 'spring', delay: 0.1 }}
                                    className="flex flex-col items-center gap-6 z-10"
                                >
                                    <div className={`w-20 h-20 rounded-full border-2 flex items-center justify-center shadow-lg ${
                                        hireMode === 'BID' 
                                            ? 'bg-[#FFFF00]/10 border-[#FFFF00] text-[#FFFF00] shadow-[0_0_25px_rgba(255,255,0,0.3)]' 
                                            : 'bg-emerald-500/10 border-[#39FF14] text-[#39FF14] shadow-[0_0_25px_rgba(57,255,20,0.3)]'
                                    }`}>
                                        <Sparkles size={38} className="animate-pulse" />
                                    </div>
                                    
                                    <div className="space-y-3">
                                        <h3 className={`text-2xl font-black italic uppercase tracking-tighter ${
                                            hireMode === 'BID' ? 'text-[#FFFF00]' : 'text-[#39FF14]'
                                        }`}>
                                            {hireMode === 'BID' ? 'TEKLİFİNİZ GÖNDERİLDİ' : 'KİRALAMA BAŞARILI'}
                                        </h3>
                                        
                                        <div className="bg-[#161B22]/80 border border-white/5 rounded-3xl p-5 max-w-sm mx-auto space-y-3 text-left">
                                            <div className="flex items-center gap-3">
                                                <img src={selectedProfile.avatar} className="w-10 h-10 rounded-full object-cover border border-white/10" referrerPolicy="no-referrer" />
                                                <div>
                                                    <p className="text-xs font-black text-white uppercase">{selectedProfile.name}</p>
                                                    <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">
                                                        {activeTab === 'GK' ? 'Kaleci' : 'Hakem'}
                                                    </p>
                                                </div>
                                            </div>
                                            
                                            <div className="w-full h-px bg-white/5" />
                                            
                                            <div className="space-y-1">
                                                <p className="text-[9px] font-black text-white/40 uppercase tracking-wider">MAÇ DETAYI</p>
                                                <p className="text-xs font-bold text-white uppercase">{selectedMatchForHire?.location}</p>
                                                <p className="text-[10px] text-gray-400">{selectedMatchForHire?.date.toUpperCase()} • {selectedMatchForHire?.time}</p>
                                            </div>
                                            
                                            <div className="w-full h-px bg-white/5" />
                                            
                                            <div className="flex justify-between items-center">
                                                <span className="text-[9px] font-black text-white/40 uppercase">TUTAR</span>
                                                <span className={`text-sm font-black ${
                                                    hireMode === 'BID' ? 'text-[#FFFF00]' : 'text-[#39FF14]'
                                                }`}>
                                                    {bidAmount} ₺
                                                </span>
                                            </div>
                                        </div>
                                        
                                        <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest animate-pulse mt-4">
                                            Yönlendiriliyorsunuz, lütfen bekleyin...
                                        </p>
                                    </div>
                                </motion.div>
                            </div>
                        ) : showMatchSelection ? (
                            /* Match Selection Screen Overlay */
                            <div className="flex-1 flex flex-col p-6 overflow-hidden relative">
                                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-15 pointer-events-none" />
                                
                                <div className="flex items-center justify-between mb-6 relative z-10">
                                    <div>
                                        <h2 className="text-lg font-black italic uppercase tracking-tighter text-white">
                                            SIRADAKİ MAÇLARIM
                                        </h2>
                                        <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mt-0.5">
                                            Hangi maç için {activeTab === 'GK' ? 'kaleci' : 'hakem'} kiralamak istiyorsunuz?
                                        </p>
                                    </div>
                                    <button 
                                        onClick={() => { setShowMatchSelection(false); setShowBidScreen(false); }} 
                                        className="w-10 h-10 rounded-full bg-white/[0.03] border border-white/10 flex items-center justify-center text-white/60 hover:text-white transition-all active:scale-90"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>

                                <div className="flex-1 overflow-y-auto no-scrollbar space-y-3 pb-24 relative z-10">
                                    {isHiring ? (
                                        <div className="flex flex-col items-center justify-center py-20 gap-4">
                                            <Activity className="animate-spin text-[#FFFF00]" size={32} />
                                            <p className="text-[10px] font-black text-white/60 uppercase tracking-widest">
                                                İşlem gerçekleştiriliyor...
                                            </p>
                                        </div>
                                    ) : myMatches.length === 0 ? (
                                        <div className="text-center py-20 text-white/40 text-xs font-black uppercase tracking-widest">
                                            PLANLANMIŞ VEYA AKTİF BİR MAÇINIZ BULUNMUYOR.
                                        </div>
                                    ) : (
                                        myMatches.map(m => {
                                            const needsThisRole = activeTab === 'GK' 
                                                ? m.missingPositions?.some((pos: any) => pos.role === 'GK' && pos.count > 0)
                                                : !m.refereeId;
                                                
                                            return (
                                                <motion.div
                                                    key={m.id}
                                                    whileHover={{ scale: 1.015 }}
                                                    whileTap={{ scale: 0.985 }}
                                                    onClick={() => handleConfirmMatch(m)}
                                                    className={`p-4 rounded-[20px] border transition-all cursor-pointer relative overflow-hidden ${
                                                        needsThisRole 
                                                            ? 'bg-yellow-500/5 border-yellow-500/30 hover:bg-yellow-500/10' 
                                                            : 'bg-[#161B22]/60 border-white/5 hover:bg-[#161B22]/85'
                                                    }`}
                                                >
                                                    {needsThisRole && (
                                                        <div className="absolute top-4 right-4 px-2 py-0.5 rounded bg-yellow-500/20 border border-yellow-500/30">
                                                            <span className="text-[7.5px] font-black text-yellow-400 uppercase tracking-widest">
                                                                {activeTab === 'GK' ? 'KALECİ ARANIYOR' : 'HAKEM EKSİK'}
                                                            </span>
                                                        </div>
                                                    )}

                                                    <div className="flex flex-col gap-1 pr-20">
                                                        <span className="text-xs font-black text-white uppercase italic tracking-tight">
                                                            {m.location.toUpperCase()}
                                                        </span>
                                                        <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">
                                                            {m.date.toUpperCase()} • {m.time}
                                                        </span>
                                                        <div className="flex gap-2 mt-1.5">
                                                            <span className="text-[8px] font-black bg-white/5 border border-white/10 px-1.5 py-0.5 rounded text-white/60">
                                                                {m.format}
                                                            </span>
                                                            <span className="text-[8px] font-black bg-white/5 border border-white/10 px-1.5 py-0.5 rounded text-white/60">
                                                                {getNormalizedDifficulty(m.difficulty)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        ) : showBidScreen ? (
                            /* Bidding Price Overlay */
                            <div className="flex-1 flex flex-col p-6 relative">
                                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-15 pointer-events-none" />
                                
                                <div className="flex items-center justify-between mb-8 relative z-10">
                                    <div>
                                        <h2 className="text-lg font-black italic uppercase tracking-tighter text-white">
                                            TEKLİF TUTARINI BELİRLE
                                        </h2>
                                        <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mt-0.5">
                                            Teklif etmek istediğiniz hizmet bedelini ayarlayın
                                        </p>
                                    </div>
                                    <button 
                                        onClick={() => setShowBidScreen(false)} 
                                        className="w-10 h-10 rounded-full bg-white/[0.03] border border-white/10 flex items-center justify-center text-white/60 hover:text-white transition-all active:scale-90"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>

                                <div className="flex-1 flex flex-col justify-center items-center gap-8 relative z-10">
                                    <div className="flex flex-col items-center justify-center w-full max-w-sm py-10 gap-6 bg-[#161B22]/60 border border-white/5 rounded-3xl relative">
                                        <span className="text-[10px] font-black tracking-[0.15em] text-white/40 uppercase">TEKLİF EDİLEN TUTAR</span>
                                        
                                        <div className="flex items-center gap-8">
                                            <button 
                                                onClick={() => setBidAmount(prev => Math.max(0, prev - 25))}
                                                className="w-12 h-12 rounded-full border border-white/10 bg-white/[0.03] text-white flex items-center justify-center hover:bg-white/10 active:scale-90 font-black text-xl transition-all"
                                            >
                                                -
                                            </button>
                                            <span className="text-4xl font-black text-white italic tracking-tighter tabular-nums drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]">
                                                {bidAmount} ₺
                                            </span>
                                            <button 
                                                onClick={() => setBidAmount(prev => prev + 25)}
                                                className="w-12 h-12 rounded-full border border-white/10 bg-white/[0.03] text-white flex items-center justify-center hover:bg-white/10 active:scale-90 font-black text-xl transition-all"
                                            >
                                                +
                                            </button>
                                        </div>
                                        
                                        <span className={`text-[9px] font-black uppercase tracking-widest px-3.5 py-1.5 rounded-full border ${
                                            activeTab === 'GK' 
                                                ? 'bg-emerald-500/10 border-emerald-500/30 text-[#39FF14]' 
                                                : 'bg-yellow-500/10 border-yellow-500/30 text-[#FFFF00]'
                                        }`}>
                                            PROFESYONEL BEDELİ: {selectedProfile.fee} ₺
                                        </span>
                                    </div>
                                </div>

                                <div className="pb-8 relative z-10">
                                    <button
                                        onClick={() => { setShowBidScreen(false); setShowMatchSelection(true); }}
                                        className={`w-full h-16 rounded-2xl font-black text-xs uppercase tracking-widest text-black flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg ${
                                            activeTab === 'GK' 
                                                ? 'bg-[#39FF14] hover:bg-[#39FF14]/90 shadow-emerald-900/25' 
                                                : 'bg-[#FFFF00] hover:bg-[#FFFF00]/90 shadow-yellow-900/25'
                                        }`}
                                    >
                                        MAÇ SEÇİMİNE GEÇ
                                        <ChevronRight size={16} />
                                    </button>
                                </div>
                            </div>
                        ) : (
                            /* Normal Profile Details */
                            <>
                                {/* Modal Header */}
                                <div className="absolute top-0 left-0 w-full p-4 flex justify-between items-center z-20">
                                    <button onClick={() => setSelectedProfile(null)} className="w-10 h-10 bg-black/30 backdrop-blur-md rounded-full flex items-center justify-center text-white border border-white/10 hover:bg-black/50 transition-colors">
                                        <ChevronLeft size={24} />
                                    </button>
                                    <div className="flex gap-2">
                                        <button className="w-10 h-10 bg-black/30 backdrop-blur-md rounded-full flex items-center justify-center text-white border border-white/10 hover:bg-black/50 transition-colors">
                                            <Share2 size={18} />
                                        </button>
                                        <button className="w-10 h-10 bg-black/30 backdrop-blur-md rounded-full flex items-center justify-center text-white border border-white/10 hover:bg-black/50 transition-colors">
                                            <Heart size={18} />
                                        </button>
                                    </div>
                                </div>

                                {/* Scrollable Content */}
                                <div className="flex-1 overflow-y-auto custom-scrollbar pb-32">
                                    {/* Edge to Edge Image */}
                                    <div className="relative w-full h-[45vh]">
                                        <img src={selectedProfile.avatar} className="w-full h-full object-cover" alt={selectedProfile.name} referrerPolicy="no-referrer" />
                                        <div className={`absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#0A0E14] via-[#0A0E14]/80 to-transparent`}></div>
                                    </div>

                                    <div className="px-6 -mt-16 relative z-10 mb-8">
                                        <h1 className="text-[32px] font-bold text-white leading-tight">{selectedProfile.name}</h1>
                                        <p className={`text-sm font-medium mt-1 ${activeTab === 'GK' ? 'text-[#39FF14]' : 'text-[#FFFF00]'}`}>
                                            {activeTab === 'GK' ? 'Profesyonel Kaleci' : 'Profesyonel Hakem'}
                                        </p>
                                        <div className="flex items-center gap-1.5 mt-3 text-white">
                                            <Star size={14} className="fill-white" />
                                            <span className="text-[15px] font-medium">{selectedProfile.rating}</span>
                                            <span className="text-gray-400 text-[15px] mx-1">·</span>
                                            <span className="text-[15px] text-gray-400">{selectedProfile.preferredZones?.[0] || 'İstanbul'}</span>
                                            <span className="text-gray-400 text-[15px] mx-1">·</span>
                                            <span className="text-[15px] text-gray-400">{selectedProfile.distance || '2.4'} km yakında</span>
                                        </div>
                                    </div>

                                    {/* Stats Grid */}
                                    <div className="px-6 mb-8">
                                        <h3 className="text-lg font-bold text-white mb-6">Performans Analizi</h3>
                                        <div className="grid grid-cols-1 gap-5">
                                            {activeTab === 'GK' ? (
                                                <>
                                                    <SkillBar label="Refleksler" value={(selectedProfile as Goalkeeper).stats.reflexes} color="bg-emerald-400" />
                                                    <SkillBar label="Uçuş (Diving)" value={(selectedProfile as Goalkeeper).stats.diving} color="bg-emerald-500" />
                                                    <SkillBar label="Pozisyon Alma" value={(selectedProfile as Goalkeeper).stats.positioning} color="bg-teal-400" />
                                                    <SkillBar label="Oyun Kurma" value={(selectedProfile as Goalkeeper).stats.distribution} color="bg-emerald-600" />
                                                    <SkillBar label="Bire Bir" value={(selectedProfile as Goalkeeper).stats.oneOnOne} color="bg-lime-400" />
                                                </>
                                            ) : (
                                                <>
                                                    <SkillBar label="Otorite" value={(selectedProfile as Referee).stats.authority} color="bg-[#FFFF00]" />
                                                    <SkillBar label="Kondisyon" value={(selectedProfile as Referee).stats.fitness} color="bg-amber-400" />
                                                    <SkillBar label="İletişim" value={(selectedProfile as Referee).stats.communication} color="bg-orange-400" />
                                                    <SkillBar label="Kart Yönetimi" value={85} color="bg-yellow-500" />
                                                    <SkillBar label="VAR Uyumu" value={95} color="bg-yellow-600" />
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Footer Actions (Side by Side Premium Actions) */}
                                <div className="absolute bottom-0 left-0 w-full p-6 bg-[#0A0E14]/90 backdrop-blur-md border-t border-white/5 flex gap-3 items-center z-20">
                                    <button
                                        onClick={handleInitiateOffer}
                                        className="flex-1 h-14 rounded-2xl border border-white/10 bg-white/[0.03] hover:bg-white/10 text-white font-black uppercase text-xs tracking-widest transition-all active:scale-95 flex items-center justify-center gap-1.5"
                                    >
                                        <MessageSquare size={14} className="text-white/60" />
                                        TEKLİF GÖNDER
                                    </button>
                                    <button
                                        onClick={handleDirectHire}
                                        className={`flex-1 h-14 rounded-2xl font-black text-xs uppercase tracking-widest text-black flex items-center justify-center gap-1.5 transition-all active:scale-95 shadow-lg ${
                                            activeTab === 'GK' 
                                                ? 'bg-[#39FF14] hover:bg-[#39FF14]/90 shadow-emerald-900/25' 
                                                : 'bg-[#FFFF00] hover:bg-[#FFFF00]/90 shadow-yellow-900/25'
                                        }`}
                                    >
                                        <Zap size={14} />
                                        DİREKT KİRALA
                                    </button>
                                </div>
                            </>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Gerçek hata geri bildirimi */}
            {errorToast && <Toast message={errorToast} variant="error" />}

        </div>
    );
};

export default Marketplace;
