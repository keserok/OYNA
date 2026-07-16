
import { LAUNCH_CITY } from '../utils/orduData';
import { districtsOfCity } from '../data/turkeyRegions';
import { getHaversineDistance } from '../utils/geo';
import { formatTRYWithSymbol } from '../utils/formatTRY';
import React, { useState, useMemo, useEffect } from 'react';
import {
    ChevronLeft, ChevronRight, X, Minus, Plus, Zap, MessageSquare, Sparkles, Shield, Scale, Star, Navigation, Heart, Share2
} from 'lucide-react';
import { Spinner } from '../components/ui/Spinner';
import { motion, AnimatePresence } from 'framer-motion';
import { Referee, Goalkeeper } from '../types';
import { useAppStore } from '../store';
import { MarketplaceCard } from '../components/Marketplace/MarketplaceCard';
import { EmptyState, ErrorState } from '../components/common/StatusState';
import { createServiceRequest, getAvailableProviderIds } from '../services/serviceRequestService';

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

// Dürüstlük (KS0): gerçek sayı yoksa "—" + boş bar; sahte değer render edilmez.
const SkillBar: React.FC<{ label: string; value: number | null | undefined; color: string }> = ({ label, value, color }) => {
    const v = typeof value === 'number' && Number.isFinite(value) ? value : null;
    return (
    <div className="space-y-1">
        <div className="flex justify-between items-center px-1">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-tighter">{label}</span>
            <span className="text-[10px] font-black text-white">{v == null ? '—' : v}</span>
        </div>
        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
            <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${v ?? 0}%` }}
                transition={{ duration: 1, ease: "easeOut" }}
                className={`h-full ${color} rounded-full`}
            />
        </div>
    </div>
    );
}

const Marketplace: React.FC<MarketplaceProps> = ({ type: initialType, onBack, onSelect }) => {
    const [activeTab, setActiveTab] = useState<'GK' | 'REF'>(initialType);
    const [selectedProfile, setSelectedProfile] = useState<Goalkeeper | Referee | null>(null);
    const [isHiring, setIsHiring] = useState(false);
    // FAZ 8A — gerçek talep sonucu (ücret/komisyon backend'den döner; pazarlık yok)
    const [hireResult, setHireResult] = useState<{ fee: number; providerAmount: number } | null>(null);
    const [hireError, setHireError] = useState<string | null>(null);

    // If initialType is provided, we might want to lock the tab or just default to it.
    // The user said "yalnızca ... çıksın", so I'll hide the tabs if initialType is passed.
    const isLocked = !!initialType;

    const { adminGoalkeepers, adminReferees, adminMatches, activeRegion, selectedRegions, userLocation, servicesError, loadServices } = useAppStore();
    const profiles = activeTab === 'GK' ? adminGoalkeepers : adminReferees;

    // KC-4: uygun (approved + is_available) sağlayıcı id kümesi. null = henüz
    // yüklenmedi / alınamadı → filtreleme yapma (herkesi göster; güvenli fallback,
    // RPC hatasında listeyi boşaltmaz). Uygun-olmayan sağlayıcı vitrinde görünmez.
    const [availableIds, setAvailableIds] = useState<Set<string> | null>(null);
    useEffect(() => {
        let alive = true;
        setAvailableIds(null);
        getAvailableProviderIds(activeTab)
            .then(ids => { if (alive) setAvailableIds(new Set(ids)); })
            .catch(() => { if (alive) setAvailableIds(null); });
        return () => { alive = false; };
    }, [activeTab]);

    const [filterDistrict, setFilterDistrict] = useState<string>('Tümü');
    const [filterDay, setFilterDay] = useState<string>('Tümü');
    const [filterTime, setFilterTime] = useState<string>('Tümü');

    // İlçe seçenekleri birincil (aktif) ile göre (sabit değil).
    const zoneCity = activeRegion?.city ?? LAUNCH_CITY;

    // Çoklu bölge kapsamı: kapsanan (isCovered) seçili şehirlerin birleşimi.
    const scopeCities = useMemo(() => {
        const regions = selectedRegions.length > 0 ? selectedRegions : (activeRegion ? [activeRegion] : []);
        return Array.from(new Set(regions.filter(r => r.isCovered).map(r => r.city)));
    }, [selectedRegions, activeRegion]);

    // Kapsanan tüm şehirlerin ilçeleri (yumuşak ilçe eşleşmesi için birleşim).
    const cityDistricts = useMemo(
        () => Array.from(new Set((scopeCities.length ? scopeCities : [zoneCity]).flatMap(c => districtsOfCity(c)))),
        [scopeCities, zoneCity],
    );

    const filteredProfiles = useMemo(() => {
        return profiles.filter(p => {
            // Seçili bölge kapsamı: sağlayıcının hizmet bölgeleri seçili illerden
            // biriyle ilgili mi? (bölgesizler hariç tutulmaz)
            const matchesRegion = scopeCities.length === 0 || !p.preferredZones || p.preferredZones.length === 0 ||
                p.preferredZones.some(z => {
                    const parts = z.split('/').map(s => s.trim());
                    return scopeCities.includes(parts[0]) || scopeCities.includes(z) || cityDistricts.includes(parts[parts.length - 1]);
                });
            // "İl / İlçe" ve düz "İlçe" formatlarının ikisini de yakala.
            const matchesDistrict = filterDistrict === 'Tümü' || (!!p.preferredZones && p.preferredZones.some(z => z === filterDistrict || z.split('/').pop()?.trim() === filterDistrict));
            const matchesDay = filterDay === 'Tümü' || (p.workingHours && p.workingHours.activeDays && p.workingHours.activeDays.includes(filterDay));
            const matchesTime = filterTime === 'Tümü' || (p.workingHours && p.workingHours.activeHours && p.workingHours.activeHours.includes(filterTime));
            // KD-2: "Profilimi Göster" kapalı (settings.showProfile === false) sağlayıcı
            // vitrinde listelenmez — gizlilik toggle'ı artık gerçekten etkili.
            const notHidden = (p as any).settings?.showProfile !== false;
            // KC-4: uygun-olmayan (is_available=false) sağlayıcı vitrinde görünmez.
            // availableIds null iken (yüklenmedi/hata) filtre uygulanmaz.
            const isBookable = availableIds === null || availableIds.has(p.id);
            return matchesRegion && matchesDistrict && matchesDay && matchesTime && notHidden && isBookable;
        });
    }, [profiles, filterDistrict, filterDay, filterTime, scopeCities, cityDistricts, availableIds]);

    const myMatches = useMemo(() => {
        return adminMatches.filter(m => m.status === 'DRAFT' || m.status === 'ACTIVE' || !m.status);
    }, [adminMatches]);

    const [showMatchSelection, setShowMatchSelection] = useState(false);
    const [selectedMatchForHire, setSelectedMatchForHire] = useState<any>(null);
    const [showSuccessScreen, setShowSuccessScreen] = useState(false);

    const handleSelect = (p: Goalkeeper | Referee) => {
        setSelectedProfile(p);
        setShowMatchSelection(false);
        setShowSuccessScreen(false);
        setHireError(null);
    };

    const handleDirectHire = () => {
        setHireError(null);
        setShowMatchSelection(true);
    };

    // FAZ 8A — gerçek kiralama: create_service_request RPC (blokaj + %10 komisyon
    // + sağlayıcı onayı + bildirim). Maç kaydı doğrudan mutasyona uğratılmaz;
    // sağlayıcı kabul edip tahsilat yapılınca backend gk_id/refereeId'yi yazar.
    const handleConfirmMatch = async (match: any) => {
        if (!selectedProfile || isHiring) return;
        setSelectedMatchForHire(match);
        setIsHiring(true);
        setHireError(null);
        try {
            const result = await createServiceRequest(match.id, selectedProfile.id, activeTab);
            setHireResult({ fee: result.fee, providerAmount: result.providerAmount });
            setShowSuccessScreen(true);

            setTimeout(() => {
                setShowSuccessScreen(false);
                setSelectedProfile(null);
                setShowMatchSelection(false);
                setHireResult(null);
                if (onSelect && selectedProfile) {
                    onSelect(selectedProfile);
                }
            }, 3500);
        } catch (err: any) {
            setHireError(err?.message || 'Talep oluşturulamadı. Lütfen tekrar dene.');
        } finally {
            setIsHiring(false);
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
                        <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${activeTab === 'GK' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-brand-primary shadow-[0_0_8px_rgba(250,204,21,0.5)]'}`}></div>
                        <span className="text-[8px] font-black text-gray-500 uppercase tracking-widest">Profesyonel Arama Aktif</span>
                    </div>
                </div>
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
                    <option value="Tümü" className="bg-[#161B22] text-white">Tüm İlçeler</option>
                    {cityDistricts.map(d => <option key={d} value={d} className="bg-[#161B22] text-white">{d}</option>)}
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
                <div className="h-full px-6 pb-24 overflow-y-auto custom-scrollbar">
                    <div className="grid grid-cols-1 gap-6 pt-2">
                        {filteredProfiles.length === 0 ? (
                            // KC-7: yükleme hatasını "sonuç yok"tan ayırt et. Ham liste
                            // boş + servicesError → yükleme başarısız → retry sun (sessiz
                            // "profil yok" değil).
                            servicesError && profiles.length === 0 ? (
                                <ErrorState message="Sağlayıcılar yüklenemedi. Bağlantını kontrol edip tekrar dene." onRetry={() => { void loadServices(); }} />
                            ) : (
                                <EmptyState title="Profil Bulunamadı" message="Bu kriterlere uygun bir profil bulunamadı." />
                            )
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
                                    <div className="w-20 h-20 rounded-full border-2 flex items-center justify-center shadow-lg bg-emerald-500/10 border-[#39FF14] text-[#39FF14] shadow-[0_0_25px_rgba(57,255,20,0.3)]">
                                        <Sparkles size={38} className="animate-pulse" />
                                    </div>

                                    <div className="space-y-3">
                                        <h3 className="text-2xl font-black italic uppercase tracking-tighter text-[#39FF14]">
                                            TALEP GÖNDERİLDİ
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
                                                <span className="text-[9px] font-black text-white/40 uppercase">HİZMET BEDELİ</span>
                                                <span className="text-sm font-black text-[#39FF14]">
                                                    {formatTRYWithSymbol(hireResult?.fee ?? selectedProfile.fee)}
                                                </span>
                                            </div>
                                            {hireResult && (
                                                <div className="flex justify-between items-center">
                                                    <span className="text-[9px] font-black text-white/40 uppercase">SAĞLAYICININ NET KAZANCI</span>
                                                    <span className="text-xs font-bold text-white/70">{formatTRYWithSymbol(hireResult.providerAmount)}</span>
                                                </div>
                                            )}
                                        </div>

                                        <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mt-4">
                                            {activeTab === 'GK' ? 'Kaleci' : 'Hakem'} onayladığında bildirim alacaksın. Ödeme, onay ve maç kesinleşmesine kadar yalnızca bloke edilir.
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
                                        onClick={() => setShowMatchSelection(false)}
                                        className="w-10 h-10 rounded-full bg-white/[0.03] border border-white/10 flex items-center justify-center text-white/60 hover:text-white transition-all active:scale-90"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>

                                {hireError && (
                                    <div className="mb-4 p-3 rounded-2xl bg-red-500/10 border border-red-500/30 relative z-10">
                                        <p className="text-[10px] font-bold text-red-400 uppercase tracking-wide">{hireError}</p>
                                    </div>
                                )}

                                <div className="flex-1 overflow-y-auto no-scrollbar space-y-3 pb-24 relative z-10">
                                    {isHiring ? (
                                        <div className="flex flex-col items-center justify-center py-20 gap-4">
                                            <Spinner size={32} color="#FACC15" />
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
                                        <p className={`text-sm font-medium mt-1 ${activeTab === 'GK' ? 'text-[#39FF14]' : 'text-[#FACC15]'}`}>
                                            {activeTab === 'GK' ? 'Profesyonel Kaleci' : 'Profesyonel Hakem'}
                                        </p>
                                        <div className="flex items-center gap-1.5 mt-3 text-white">
                                            <Star size={14} className="fill-white" />
                                            {/* Dürüstlük: puanlanmamış sağlayıcı "Yeni". KD-2: "Puan Görünsün"
                                                kapalıysa (settings.showRating===false) puan gizlenir. */}
                                            <span className="text-[15px] font-medium">
                                                {(selectedProfile as { settings?: { showRating?: boolean } }).settings?.showRating === false
                                                    ? 'Puan gizli'
                                                    : (typeof selectedProfile.rating === 'number' && selectedProfile.rating > 0
                                                        ? `${selectedProfile.rating.toFixed(1)} / 10`
                                                        : 'Yeni')}
                                            </span>
                                            <span className="text-gray-400 text-[15px] mx-1">·</span>
                                            <span className="text-[15px] text-gray-400">{selectedProfile.preferredZones?.[0] || LAUNCH_CITY}</span>
                                            <span className="text-gray-400 text-[15px] mx-1">·</span>
                                            <span className="text-[15px] text-gray-400">{
                                                (userLocation && selectedProfile.coordinates)
                                                    ? `${getHaversineDistance(userLocation.lat, userLocation.lng, selectedProfile.coordinates.lat, selectedProfile.coordinates.lng).toFixed(1)} km yakında`
                                                    : (selectedProfile.distance ? `${selectedProfile.distance} km yakında` : 'Konumunu aç')
                                            }</span>
                                        </div>
                                    </div>

                                    {/* Stats Grid */}
                                    <div className="px-6 mb-8">
                                        <h3 className="text-lg font-bold text-white mb-6">Performans Analizi</h3>
                                        <div className="grid grid-cols-1 gap-5">
                                            {/* Null/eksik stats guard (KC-2 crash) + sahte bar yok. */}
                                            {activeTab === 'GK' ? (() => {
                                                const gs = ((selectedProfile as Goalkeeper).stats ?? {}) as Partial<Goalkeeper['stats']>;
                                                const hasAny = ['reflexes','diving','positioning','distribution','oneOnOne']
                                                    .some((k) => typeof (gs as any)[k] === 'number');
                                                if (!hasAny) return (
                                                    <p className="text-sm text-gray-500">Bu kaleci henüz maç istatistiği biriktirmedi.</p>
                                                );
                                                return (
                                                <>
                                                    <SkillBar label="Refleksler" value={gs.reflexes} color="bg-emerald-400" />
                                                    <SkillBar label="Uçuş (Diving)" value={gs.diving} color="bg-emerald-500" />
                                                    <SkillBar label="Pozisyon Alma" value={gs.positioning} color="bg-teal-400" />
                                                    <SkillBar label="Oyun Kurma" value={gs.distribution} color="bg-emerald-600" />
                                                    <SkillBar label="Bire Bir" value={gs.oneOnOne} color="bg-lime-400" />
                                                </>
                                                );
                                            })() : (() => {
                                                const rs = ((selectedProfile as Referee).stats ?? {}) as Partial<Referee['stats']>;
                                                const hasAny = ['authority','fitness','communication']
                                                    .some((k) => typeof (rs as any)[k] === 'number');
                                                if (!hasAny) return (
                                                    <p className="text-sm text-gray-500">Bu hakem henüz maç istatistiği biriktirmedi.</p>
                                                );
                                                return (
                                                <>
                                                    <SkillBar label="Otorite" value={rs.authority} color="bg-[#FACC15]" />
                                                    <SkillBar label="Kondisyon" value={rs.fitness} color="bg-amber-400" />
                                                    <SkillBar label="İletişim" value={rs.communication} color="bg-orange-400" />
                                                </>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                </div>

                                {/* Footer Action — tek yol: sabit ücretle talep gönder (pazarlık yok, Prensipler §4.3) */}
                                <div className="absolute bottom-0 left-0 w-full p-6 bg-[#0A0E14]/90 backdrop-blur-md border-t border-white/5 flex gap-3 items-center z-20">
                                    <div className="flex flex-col items-start pr-2">
                                        <span className="text-[8px] font-black text-white/40 uppercase tracking-widest">Hizmet Bedeli</span>
                                        <span className="text-xl font-black text-white tabular-nums">{formatTRYWithSymbol(selectedProfile.fee)}</span>
                                    </div>
                                    {/* KD-2: "Direkt Teklif Al" kapalıysa (settings.allowOffer===false)
                                        doğrudan kiralama kilitli — sunucu da reddediyor (create_service_request),
                                        UI'da baştan engellenir (başarısız talep denemesi yok). */}
                                    {(selectedProfile as { settings?: { allowOffer?: boolean } }).settings?.allowOffer === false ? (
                                        <div className="flex-1 h-14 rounded-2xl bg-white/5 border border-white/10 text-gray-400 text-[11px] font-black uppercase tracking-widest flex items-center justify-center text-center px-3">
                                            Bu sağlayıcı şu an doğrudan teklif almıyor
                                        </div>
                                    ) : (
                                    <button
                                        onClick={handleDirectHire}
                                        className={`flex-1 h-14 rounded-2xl font-black text-xs uppercase tracking-widest text-black flex items-center justify-center gap-1.5 transition-all active:scale-95 shadow-lg ${
                                            activeTab === 'GK'
                                                ? 'bg-[#39FF14] hover:bg-[#39FF14]/90 shadow-emerald-900/25'
                                                : 'bg-[#FACC15] hover:bg-[#FACC15]/90 shadow-yellow-900/25'
                                        }`}
                                    >
                                        <Zap size={14} />
                                        KİRALA — TALEP GÖNDER
                                    </button>
                                    )}
                                </div>
                            </>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

        </div>
    );
};

export default Marketplace;
