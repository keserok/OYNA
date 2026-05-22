
import React, { useState, useMemo } from 'react';
import {
    ChevronLeft, Map as MapIcon, List, Minus, Plus, Zap, Activity, MessageSquare, Sparkles, Shield, Scale, Star, Navigation, Heart, Share2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Referee, Goalkeeper } from '../types';
import { useAppStore } from '../store';
import { MarketplaceCard } from '../components/Marketplace/MarketplaceCard';
import { MarketplaceMap } from '../components/Marketplace/MarketplaceMap';

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
    const [showToast, setShowToast] = useState(false);
    const [bidAmount, setBidAmount] = useState<number>(0);
    const [isBidding, setIsBidding] = useState(false);

    // If initialType is provided, we might want to lock the tab or just default to it.
    // The user said "yalnızca ... çıksın", so I'll hide the tabs if initialType is passed.
    const isLocked = !!initialType;

    const { adminGoalkeepers, adminReferees } = useAppStore();
    const profiles = activeTab === 'GK' ? adminGoalkeepers : adminReferees;

    const handleSelect = (p: Goalkeeper | Referee) => {
        setSelectedProfile(p);
        setBidAmount(p.fee);
    };

    const confirmHire = (isQuick: boolean = false) => {
        setIsHiring(true);
        setTimeout(() => {
            setIsHiring(false);
            if (onSelect && selectedProfile) {
                onSelect(selectedProfile);
            } else {
                setSelectedProfile(null);
                setIsBidding(false);
                setShowToast(true);
                setTimeout(() => setShowToast(false), 2000);
            }
            if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
        }, 2000);
    };

    const handleBid = () => {
        if (bidAmount >= (selectedProfile?.fee || 0)) {
            confirmHire(true);
        } else {
            setIsHiring(true);
            setTimeout(() => {
                setIsHiring(false);
                if (onSelect && selectedProfile) {
                    onSelect(selectedProfile);
                } else {
                    setSelectedProfile(null);
                    setIsBidding(false);
                    alert("Teklifiniz iletildi! Karşı tarafın onayı bekleniyor.");
                }
            }, 1500);
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

            {/* 3. Main Content */}
            <div className="flex-1 relative overflow-hidden">
                {viewMode === 'LIST' ? (
                    <div className="h-full px-6 pb-24 overflow-y-auto custom-scrollbar">
                        <div className="grid grid-cols-1 gap-6 pt-2">
                            {profiles.map(p => (
                                <MarketplaceCard
                                    key={p.id}
                                    item={p}
                                    type={activeTab}
                                    onClick={() => handleSelect(p)}
                                />
                            ))}
                        </div>
                    </div>
                ) : (
                    <MarketplaceMap
                        items={profiles}
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
                                <div className={`absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t ${activeTab === 'GK' ? 'from-[#0A0E14] via-[#0A0E14]/80' : 'from-[#0A0E14] via-[#0A0E14]/80'} to-transparent`}></div>
                            </div>

                            <div className="px-6 -mt-16 relative z-10 mb-8">
                                <h1 className="text-[32px] font-bold text-white leading-tight">{selectedProfile.name}</h1>
                                <p className={`text-sm font-medium mt-1 ${activeTab === 'GK' ? 'text-emerald-400' : 'text-brand-primary'}`}>
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
                                            <SkillBar label="Otorite" value={(selectedProfile as Referee).stats.authority} color="bg-brand-primary" />
                                            <SkillBar label="Kondisyon" value={(selectedProfile as Referee).stats.fitness} color="bg-amber-400" />
                                            <SkillBar label="İletişim" value={(selectedProfile as Referee).stats.communication} color="bg-orange-400" />
                                            <SkillBar label="Kart Yönetimi" value={85} color="bg-brand-primary" />
                                            <SkillBar label="VAR Uyumu" value={95} color="bg-yellow-600" />
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Footer Showcase Actions */}
                        <div className="absolute bottom-0 left-0 w-full p-6 bg-[#0A0E14] border-t border-white/5 flex gap-4 items-center z-20">
                            <button
                                className="w-14 h-14 rounded-2xl flex items-center justify-center transition-all bg-white/5 border border-white/10 text-white hover:bg-white/10"
                            >
                                <Heart size={20} />
                            </button>
                            <button
                                onClick={() => confirmHire(true)}
                                disabled={isHiring}
                                className={`flex-1 h-14 rounded-2xl font-bold text-[15px] flex items-center justify-center gap-2 transition-all active:scale-95 shadow-xl ${activeTab === 'GK' ? 'bg-emerald-500 text-black shadow-emerald-900/20 hover:bg-emerald-400' : 'bg-brand-primary text-black shadow-yellow-900/20 hover:bg-yellow-400'}`}
                            >
                                {isHiring ? <Activity className="animate-spin" /> : (
                                    <>
                                        <MessageSquare size={18} /> MESAJ GÖNDER
                                    </>
                                )}
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Toast */}
            <AnimatePresence>
                {showToast && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[100]"
                    >
                        <div className={`px-8 py-6 rounded-3xl shadow-2xl flex flex-col items-center ${activeTab === 'GK' ? 'bg-green-500 text-black' : 'bg-yellow-500 text-black'}`}>
                            <Activity size={32} className="mb-2 animate-pulse" />
                            <h3 className="font-black text-xl italic uppercase">İSTEK GÖNDERİLDİ</h3>
                            <p className="text-[10px] font-bold opacity-70 uppercase tracking-widest">Profesyonel ile iletişime geçilecek!</p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

        </div>
    );
};

export default Marketplace;
