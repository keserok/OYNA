import React, { useState, useMemo, useEffect } from 'react';
import {
  ArrowLeft, MapPin, Clock, Shield, Circle,
  Zap, ChevronRight, Target, CheckCircle2, Feather, Lock, ShieldAlert,
  Check, KeyRound, Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { MatchListing, PlayerSeekAnnouncement } from '../types';
import { useAppStore } from '../store';
import { auth } from '../supabaseAuth';
import { supabase } from '../supabaseClient';
import { subscribeToOpenMatches, fetchNearbyMatches, resolvePrivateMatch, toPrivateMatchErrorMessage, getMatchDetails } from '../services/matchService';
import { EmptyState } from '../components/common/StatusState';

interface MatchDiscoveryProps {
  onBack: () => void;
  onSelect: (match: MatchListing) => void;
}

// ── OYUN DNA'SI SEÇENEKLERİ ──
const BUDGET_OPTIONS = ['Ücretsiz', '150₺ ve Altı', '150-250₺', '250-350₺', '350₺ ve Üzeri'];
const GENDER_OPTIONS = ['Karma', 'Erkek', 'Kadın'];
const AGE_OPTIONS = ['10-14', '14-16', '16-18', '18-22', '23-27', '28-35', '35+', 'Tümü'];
const FORMAT_OPTIONS = ['3v3', '4v4', '5v5', '6v6', '7v7', '8v8', '9v9', '10v10', '11v11'];

const ROLE_OPTIONS = [
  { id: 'HÜC', label: 'HÜCUM', color: '#ef4444' },
  { id: 'ORT', label: 'ORTA', color: '#f97316' },
  { id: 'SAV', label: 'SAVUNMA', color: '#3b82f6' },
  { id: 'KL', label: 'KALECİ', color: '#10b981' }
];

const MENTALITY_OPTIONS = [
  { id: 'ciddi', title: 'CİDDİ', subtitle: 'Rekabetçi', icon: Zap, color: '#FFFF00' },
  { id: 'taktiksel', title: 'TAKTİKSEL', subtitle: 'Sistem', icon: Target, color: '#3b82f6' },
  { id: 'rahat', title: 'RAHAT', subtitle: 'Eğlence', icon: Feather, color: '#10b981' }
];

const MatchDiscovery: React.FC<MatchDiscoveryProps> = ({ onBack, onSelect }) => {
  const { 
    adminMatches, 
    adminUsers, 
    playerSeekAds,
    toggleJoinPlayerSeekAd,
    acceptPlayerSeekAdRequest,
    navigateTo,
    userLocation,
    searchRadius,
    setSearchRadius
  } = useAppStore();
  const currentUserUid = auth.currentUser?.uid || 'u1';
  const currentUser = adminUsers.find(u => u.id === currentUserUid) || adminUsers[0];
  const trustScore = currentUser?.rating || 4.2;

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' } | null>(null);
  const showToast = (message: string, type: 'success' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // ── Özel maç (kodla katılım) ──
  const [showPrivateModal, setShowPrivateModal] = useState(false);
  const [privateCode, setPrivateCode] = useState('');
  const [privateLoading, setPrivateLoading] = useState(false);
  const [privateError, setPrivateError] = useState<string | null>(null);

  const handleJoinPrivate = async () => {
    const code = privateCode.trim().toUpperCase();
    if (code.length < 4) {
      setPrivateError('Kod en az 4 karakter olmalı.');
      return;
    }
    setPrivateLoading(true);
    setPrivateError(null);
    try {
      // 1) Önce özel MAÇ kodu dene
      try {
        const resolved = await resolvePrivateMatch(code);
        const match = await getMatchDetails(resolved.matchId);
        if (!match) throw new Error('NOT_FOUND');
        setShowPrivateModal(false);
        setPrivateCode('');
        onSelect(match);
        return;
      } catch (matchErr) {
        // 2) Özel maç değilse: SLOT devralma kodu dene (player_claim_slot_code)
        const { data, error } = await supabase.rpc('player_claim_slot_code', { p_code: code });
        if (error) throw matchErr; // ikisi de değilse özgün maç hatasını göster
        const matchId = (data as any)?.match_id;
        const claimed = matchId ? await getMatchDetails(matchId) : null;
        if (!claimed) throw new Error('NOT_FOUND');
        setShowPrivateModal(false);
        setPrivateCode('');
        onSelect(claimed);
      }
    } catch (err) {
      console.error('Kod çözülemedi:', err);
      setPrivateError(toPrivateMatchErrorMessage(err));
    } finally {
      setPrivateLoading(false);
    }
  };

  const [showWizard, setShowWizard] = useState(false);
  const [activeSection, setActiveSection] = useState<'bireysel' | 'takim'>('bireysel');
  const [dna, setDna] = useState({
    format: '',
    budget: '',
    duration: '',
    age: '',
    gender: '',
    role: '',
    mentality: '',
    district: ''
  });

  const [nearbyMatches, setNearbyMatches] = useState<any[]>([]);

  useEffect(() => {
    if (userLocation) {
        fetchNearbyMatches(userLocation.lat, userLocation.lng, searchRadius).then((results) => {
            if (results && results.length > 0) {
                const mapped = results.map((m: any) => ({
                    id: m.match_id,
                    title: `${m.pitch_name} Maçı`,
                    pitchName: m.pitch_name,
                    date: new Date(m.start_time).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' }),
                    time: new Date(m.start_time).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }),
                    format: m.format || '7v7',
                    price: 200,
                    difficulty: m.difficulty || 'Ciddi',
                    distance: m.distance_meters,
                    creatorName: m.captain_name || 'Kaptan',
                    creatorAvatar: 'https://i.pravatar.cc/150'
                }));
                setNearbyMatches(mapped);
            }
        });
    }
  }, [userLocation, searchRadius]);

  const enhancedMatches = useMemo(() => {
    const sourceMatches = (userLocation && nearbyMatches.length > 0) ? nearbyMatches : adminMatches;
    // Sadece oynanabilir maçları göster — DRAFT/CANCELLED/COMPLETED gizle.
    // Özel maçlar (PRIVATE) vitrinde GÖRÜNMEZ; yalnız kodla erişilir.
    const activeMatches = sourceMatches.filter(
      m => (!m.status || m.status === 'ACTIVE' || m.status === 'LIVE') && m.visibility !== 'PRIVATE'
    );
    return activeMatches.map((m, i) => {
      // Demo price adjustment for index 2 if not set, else keep DB price
      const price = m.price !== undefined ? m.price : (i === 2 ? 0 : 200);
      const diffStr = (m.difficulty || '').toLowerCase().trim();
      let matchMentality = '';
      let mentalityColor = '';

      if (diffStr === 'ciddi') {
        matchMentality = 'CİDDİ';
        mentalityColor = '#FFFF00';
      } else if (diffStr === 'taktiksel') {
        matchMentality = 'TAKTİKSEL';
        mentalityColor = '#3b82f6';
      } else if (diffStr === 'rahat') {
        matchMentality = 'RAHAT';
        mentalityColor = '#10b981';
      } else {
        const option = MENTALITY_OPTIONS[i % 3];
        matchMentality = option.title;
        mentalityColor = option.color;
      }

      const format = m.format || '7v7';
      const duration = m.duration || '90 Dakika';
      const gender = m.gender || 'Karma';
      const ageGroup = m.ageGroup || 'Tümü';
      
      const mappedMissingPositions = (m.missingPositions || []).map((pos: any) => {
        let role = pos.role;
        if (['GK', 'KALECİ'].includes(role)) role = 'KALECİ';
        else if (['DEF', 'STP', 'SĞB', 'SLB', 'SAVUNMA', 'BEK'].includes(role)) role = 'SAVUNMA';
        else if (['MID', 'ORT', 'MDO', 'OS', 'ORTA', 'ORTA SAHA'].includes(role)) role = 'ORTA SAHA';
        else if (['FW', 'HÜC', 'SNT', 'SĞA', 'SLA', 'HÜCUM', 'FV'].includes(role)) role = 'HÜCUM';
        return { ...pos, role };
      });

      return {
        ...m,
        date: m.date || '18.05.2026',
        time: m.time || '22:00 - 23:00',
        missingPositions: mappedMissingPositions,
        price,
        difficulty: (m.difficulty || (matchMentality === 'CİDDİ' ? 'Ciddi' : matchMentality === 'TAKTİKSEL' ? 'Taktiksel' : 'Rahat')) as 'Ciddi' | 'Taktiksel' | 'Rahat',
        matchMentality,
        mentalityColor,
        format,
        duration,
        gender,
        ageGroup,
        distance: m.distance
      };
    });
  }, [adminMatches, nearbyMatches, userLocation]);

  const isFilterActive = useMemo(() => {
    return !!(dna.format || dna.budget || dna.duration || (dna.age && dna.age !== 'Tümü') || dna.gender || dna.role || dna.mentality || dna.district);
  }, [dna]);

  const checkMatchFilters = (match: any) => {
    if (dna.format && match.format && match.format.toLowerCase() !== dna.format.toLowerCase()) {
      return false;
    }
    if (dna.budget) {
      const price = match.price || 0;
      if (dna.budget === 'Ücretsiz' && price !== 0) {
        return false;
      }
      if (dna.budget === '150₺ ve Altı' && (price === 0 || price > 150)) {
        return false;
      }
      if (dna.budget === '150-250₺' && (price < 150 || price > 250)) {
        return false;
      }
      if (dna.budget === '250-350₺' && (price < 250 || price > 350)) {
        return false;
      }
      if (dna.budget === '350₺ ve Üzeri' && price < 350) {
        return false;
      }
    }
    if (dna.duration && match.duration && match.duration.toLowerCase() !== dna.duration.toLowerCase()) {
      return false;
    }
    if (dna.age && dna.age !== 'Tümü' && match.ageGroup && match.ageGroup.toLowerCase() !== dna.age.toLowerCase()) {
      return false;
    }
    if (dna.gender && match.gender && match.gender.toLowerCase() !== dna.gender.toLowerCase()) {
      return false;
    }
    if (dna.role) {
      const roleMap: Record<string, string> = { 'HÜC': 'HÜCUM', 'ORT': 'ORTA SAHA', 'SAV': 'SAVUNMA', 'KL': 'KALECİ' };
      const targetRole = roleMap[dna.role];
      const hasMissingSlot = match.missingPositions?.some((p: any) => p.role === targetRole && p.count > 0);
      if (!hasMissingSlot) {
        return false;
      }
    }
    if (dna.mentality) {
      if (!match.difficulty || match.difficulty.toLowerCase() !== dna.mentality.toLowerCase()) {
        return false;
      }
    }
    if (dna.district && match.location && !match.location.toLowerCase().includes(dna.district.toLowerCase())) {
      return false;
    }
    return true;
  };

  const { matchingMatches, otherMatches } = useMemo(() => {
    if (!isFilterActive) {
      return { matchingMatches: [], otherMatches: enhancedMatches };
    }
    const matching = enhancedMatches.filter(checkMatchFilters);
    const other = enhancedMatches.filter(m => !checkMatchFilters(m));
    return { matchingMatches: matching, otherMatches: other };
  }, [enhancedMatches, isFilterActive, dna]);

  const handleClearFilters = () => {
    setDna({
      format: '',
      budget: '',
      duration: '',
      age: '',
      gender: '',
      role: '',
      mentality: '',
      district: ''
    });
  };

  const wizardCount = isFilterActive ? matchingMatches.length : enhancedMatches.length;
  const wizardLabel = wizardCount > 0 ? `${wizardCount} MAÇI GÖSTER` : 'EŞLEŞEN MAÇ YOK';

  const ROLE_LABEL_MAP: Record<string, string> = { 'HÜC': 'HÜCUM', 'ORT': 'ORTA SAHA', 'SAV': 'SAVUNMA', 'KL': 'KALECİ' };

  return (
    <div className="min-h-screen max-h-screen bg-[#0A0E14] flex flex-col relative overflow-hidden font-sans selection:bg-[#FFFF00] selection:text-black">
      
      {/* ── ARKA PLAN ── */}
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20 mix-blend-overlay pointer-events-none" />

      {/* ═══════════════════════════════════════════════════════════════════════
          TEK SAYFALIK OYUN DNA PANELİ
      ═══════════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showWizard && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50, filter: 'blur(10px)' }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="absolute inset-0 z-50 flex flex-col h-full bg-[#0A0E14]"
          >
            {/* 1. ÜST BAR */}
            <div className="px-5 pt-safe pb-4 flex items-center justify-between shrink-0 border-b border-white/5 bg-black/20 backdrop-blur-lg">
              <button onClick={() => setShowWizard(false)} className="w-10 h-10 rounded-full bg-white/[0.03] backdrop-blur-md border border-white/10 flex items-center justify-center hover:bg-white/10 hover:border-white/20 transition-all shadow-[0_0_15px_rgba(255,255,255,0.05)]">
                <ArrowLeft size={18} className="text-white drop-shadow-md" />
              </button>
              <h1 className="text-[17px] font-black italic uppercase tracking-tighter text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]">
                Oynamak istediğin maçı bul
              </h1>
              <button onClick={() => setShowWizard(false)} className="w-10 text-right text-[10px] font-black uppercase tracking-widest text-white/50 hover:text-white transition-colors">
                Geç
              </button>
            </div>

            {/* ANA İÇERİK */}
            <div className="flex-1 flex flex-col px-5 py-2 gap-4 justify-between relative z-10 overflow-y-auto no-scrollbar">
              <div className="space-y-3">
              
                {/* Yarıçap (Radius) Slider */}
                {userLocation && (
                  <div className="space-y-3 mb-2 p-4 bg-[#161B22] border border-[#39FF14]/30 rounded-2xl shadow-[0_0_15px_rgba(57,255,20,0.1)]">
                    <div className="flex justify-between items-center">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#39FF14]">Arama Çapı (Mesafe)</p>
                        <span className="text-[#39FF14] text-xs font-black drop-shadow-md">{searchRadius} KM</span>
                    </div>
                    <input 
                        type="range" 
                        min="1" max="100" 
                        value={searchRadius} 
                        onChange={(e) => setSearchRadius(Number(e.target.value))}
                        className="w-full h-2 bg-black rounded-lg appearance-none cursor-pointer border border-white/10"
                        style={{
                          background: `linear-gradient(to right, #39FF14 0%, #39FF14 ${(searchRadius / 100) * 100}%, #161B22 ${(searchRadius / 100) * 100}%, #161B22 100%)`
                        }}
                    />
                    <p className="text-[9px] text-white/50 italic">Mevcut konumuna göre <span className="text-white font-bold">{searchRadius} KM</span> çapındaki sahalarda olan maçlar listelenir.</p>
                  </div>
                )}

                {/* Bölge (İlçe) Seçimi - Konum Yoksa Alternatif */}
                {!userLocation && (
                  <div className="space-y-2 mb-2 p-4 bg-[#161B22] border border-white/5 rounded-2xl">
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50 drop-shadow-md">Arama Bölgesi (İlçe)</p>
                    <div className="flex flex-wrap gap-2">
                      {['Tümü', 'Kadıköy', 'Beşiktaş', 'Şişli', 'Ümraniye', 'Ataşehir', 'Bakırköy'].map(dist => (
                        <button
                          key={dist}
                          type="button"
                          onClick={() => setDna({ ...dna, district: dist === 'Tümü' ? '' : dist })}
                          className={`px-3 py-2 rounded-xl text-[10px] font-black tracking-widest transition-all backdrop-blur-md border ${
                            (dist === 'Tümü' && !dna.district) || dna.district === dist
                              ? 'bg-[#39FF14]/10 border-[#39FF14]/50 text-[#39FF14] shadow-[0_0_20px_rgba(57,255,20,0.2)]'
                              : 'bg-white/[0.02] border-white/10 text-white hover:bg-white/[0.05]'
                          }`}
                        >
                          {dist.toUpperCase()}
                        </button>
                      ))}
                    </div>
                    <p className="text-[9px] text-white/50 italic">Cihaz konumu bulunamadığı için maçları bölge bazlı filtreleyebilirsiniz.</p>
                  </div>
                )}

                {/* Takım Formatı */}
                <div className="space-y-2">
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50 drop-shadow-md">Takım Formatı</p>
                  <div className="flex flex-wrap gap-2">
                    {FORMAT_OPTIONS.map(f => (
                      <button
                        key={f}
                        onClick={() => setDna({ ...dna, format: dna.format === f ? '' : f })}
                        className={`px-3 py-2 rounded-xl text-[10px] font-black tracking-widest transition-all backdrop-blur-md border ${
                          dna.format === f 
                            ? 'bg-[#39FF14]/10 border-[#39FF14]/50 text-[#39FF14] shadow-[0_0_20px_rgba(57,255,20,0.2)]' 
                            : 'bg-white/[0.02] border-white/10 text-white hover:bg-white/[0.05]'
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Bütçe */}
                <div className="space-y-2">
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50 drop-shadow-md">Kişi Başı Ücret</p>
                  <div className="flex flex-wrap gap-2">
                    {BUDGET_OPTIONS.map(b => (
                      <button
                        key={b}
                        onClick={() => setDna({ ...dna, budget: dna.budget === b ? '' : b })}
                        className={`px-4 py-2.5 rounded-xl text-[10px] font-black tracking-widest transition-all backdrop-blur-md border ${
                          dna.budget === b 
                            ? 'bg-[#FFFF00]/10 border-[#FFFF00]/50 text-[#FFFF00] shadow-[0_0_20px_rgba(255,255,0,0.2)] drop-shadow-[0_0_5px_rgba(255,255,0,0.8)]' 
                            : 'bg-white/[0.02] border-white/10 text-white hover:bg-white/[0.05]'
                        }`}
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Maç Süresi */}
                <div className="space-y-2">
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50 drop-shadow-md">Maç Süresi</p>
                  <div className="flex gap-2">
                    {['60 Dakika', '90 Dakika', '120 Dakika'].map(d => (
                      <button
                        key={d}
                        onClick={() => setDna({ ...dna, duration: dna.duration === d ? '' : d })}
                        className={`flex-1 py-2.5 rounded-xl text-[10px] font-black tracking-widest transition-all backdrop-blur-md border ${
                          dna.duration === d 
                            ? 'bg-[#39FF14]/10 border-[#39FF14]/50 text-[#39FF14] shadow-[0_0_20px_rgba(57,255,20,0.2)]' 
                            : 'bg-white/[0.02] border-white/10 text-white hover:bg-white/[0.05]'
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Yaş & Cinsiyet */}
                <div className="flex gap-4">
                  <div className="flex-1 space-y-2">
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50 drop-shadow-md">Cinsiyet</p>
                    <div className="flex bg-white/[0.02] p-1 rounded-xl border border-white/10 backdrop-blur-md">
                      {GENDER_OPTIONS.map(g => (
                        <button
                          key={g}
                          onClick={() => setDna({ ...dna, gender: dna.gender === g ? '' : g })}
                          className={`flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                            dna.gender === g ? 'bg-white/20 text-white shadow-md drop-shadow-[0_0_5px_rgba(255,255,255,0.5)] border border-white/30' : 'text-white'
                          }`}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex-[1.5] space-y-2">
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50 drop-shadow-md">Yaş</p>
                    <div className="flex overflow-x-auto no-scrollbar gap-1.5 pb-1">
                      {AGE_OPTIONS.map(a => (
                        <button
                          key={a}
                          onClick={() => setDna({ ...dna, age: dna.age === a ? '' : a })}
                          className={`shrink-0 px-4 py-2 rounded-xl text-[10px] font-black transition-all backdrop-blur-md border ${
                            dna.age === a ? 'bg-[#FFFF00]/10 border-[#FFFF00]/50 text-[#FFFF00] shadow-[0_0_15px_rgba(255,255,0,0.2)]' : 'bg-white/[0.02] border-white/10 text-white'
                          }`}
                        >
                          {a}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* POZİSYON */}
              <div className="space-y-2">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50 drop-shadow-md">Pozisyon Tercihi</p>
                <div className="grid grid-cols-4 gap-2">
                  {ROLE_OPTIONS.map(role => (
                    <button
                      key={role.id}
                      onClick={() => setDna({ ...dna, role: dna.role === role.id ? '' : role.id })}
                      className={`h-16 rounded-2xl border flex flex-col items-center justify-center transition-all backdrop-blur-xl ${
                        dna.role === role.id 
                          ? 'bg-[#39FF14]/10 border-[#39FF14]/60 shadow-[0_0_25px_rgba(57,255,20,0.25)]' 
                          : 'bg-white/[0.02] border-white/10 hover:bg-white/[0.05]'
                      }`}
                    >
                      <span className={`text-[12px] font-black uppercase tracking-widest ${dna.role === role.id ? 'text-[#39FF14] drop-shadow-[0_0_8px_rgba(57,255,20,0.8)]' : 'text-white'}`}>
                        {role.id}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* MENTALİTE */}
              <div className="space-y-2">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50 drop-shadow-md">Oyun Ruhun</p>
                <div className="flex flex-col gap-2">
                  {MENTALITY_OPTIONS.map(m => (
                    <button
                      key={m.id}
                      onClick={() => setDna({ ...dna, mentality: dna.mentality === m.id ? '' : m.id })}
                      className={`h-12 w-full rounded-2xl px-4 flex items-center justify-between border transition-all backdrop-blur-xl overflow-hidden ${
                        dna.mentality === m.id 
                          ? 'border-transparent' 
                          : 'bg-white/[0.02] border-white/10 hover:bg-white/[0.06] hover:border-white/20'
                      }`}
                      style={dna.mentality === m.id ? { backgroundColor: `${m.color}15`, borderColor: `${m.color}60`, boxShadow: `0 0 30px ${m.color}20` } : {}}
                    >
                      <div className="flex items-center gap-3">
                        <m.icon size={16} className="text-white" style={dna.mentality === m.id ? { color: m.color, filter: `drop-shadow(0 0 5px ${m.color})` } : {}} />
                        <span className={`text-base font-black italic uppercase tracking-tighter ${dna.mentality === m.id ? 'text-white drop-shadow-md' : 'text-white'}`}>
                          {m.title}
                        </span>
                      </div>
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${dna.mentality === m.id ? 'border-transparent' : 'border-white/40'}`} style={dna.mentality === m.id ? { backgroundColor: m.color } : {}}>
                        {dna.mentality === m.id && <CheckCircle2 size={10} className="text-black" />}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

            </div>

            {/* ANA BUTON (SABİT ALT) */}
            <div className="px-5 pb-8 pt-2 shrink-0 relative z-10 bg-gradient-to-t from-black via-black/80 to-transparent">
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowWizard(false)}
                className="relative overflow-hidden w-full py-4 rounded-2xl text-black font-black uppercase tracking-[0.2em] text-xs transition-all border border-[#FFFF00]/50"
                style={{ 
                  background: 'linear-gradient(135deg, #FFFF00, #39FF14)',
                  boxShadow: '0 0 30px rgba(57,255,20,0.3), 0 8px 30px rgba(255,255,0,0.2)'
                }}
              >
                {/* Shimmer Efekti */}
                <motion.div
                  className="absolute inset-0 skew-x-12 bg-gradient-to-r from-transparent via-white/40 to-transparent"
                  animate={{ x: ['-100%', '200%'] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', repeatDelay: 2 }}
                />
                <span className="relative z-10 drop-shadow-sm">{wizardLabel}</span>
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>


      {/* ═══════════════════════════════════════════════════════════════════════
          MAÇ LİSTESİ (POSTER-CARD TASARIMI)
      ═══════════════════════════════════════════════════════════════════════ */}
      {!showWizard && (
        <motion.div 
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}
          className="absolute inset-0 flex flex-col z-40 bg-[#0A0E14]"
        >
          {/* HEADER */}
          <header className="sticky top-0 z-50 bg-black/40 backdrop-blur-2xl border-b border-white/5 px-5 pt-safe pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button onClick={onBack} className="w-10 h-10 rounded-full bg-white/[0.03] backdrop-blur-md border border-white/10 flex items-center justify-center text-white active:scale-90 transition-all hover:bg-white/10">
                  <ArrowLeft size={18} />
                </button>
                <div>
                  <h1 className="text-xl font-black text-white italic uppercase tracking-tight leading-none drop-shadow-lg">Top Oyna</h1>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isFilterActive && (
                  <button 
                    onClick={handleClearFilters} 
                    className="px-3.5 py-2 rounded-full bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 transition-all text-[10px] font-black uppercase tracking-widest"
                  >
                    Temizle
                  </button>
                )}
                <button
                  onClick={() => { setShowPrivateModal(true); setPrivateError(null); setPrivateCode(''); }}
                  className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-full bg-[#FFFF00]/[0.06] backdrop-blur-md border border-[#FFFF00]/25 text-[#FFFF00] hover:bg-[#FFFF00]/10 transition-all"
                  title="Özel maça kodla katıl"
                >
                  <KeyRound size={13} />
                  <span className="text-[10px] font-black uppercase tracking-widest drop-shadow-md">Kodla Katıl</span>
                </button>
                <button onClick={() => setShowWizard(true)} className="flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-white/[0.03] backdrop-blur-md border border-white/10 text-white hover:bg-white/10 transition-all">
                  <span className="text-[10px] font-black uppercase tracking-widest drop-shadow-md">Filtre</span>
                  {isFilterActive && (
                    <span className="w-2 h-2 bg-[#FFFF00] rounded-full shadow-[0_0_10px_rgba(255,255,0,0.8)]" />
                  )}
                </button>
              </div>
            </div>
          </header>

          {/* ── KALDIRILABİLİR FİLTRE ÇİPLERİ ── */}
          {isFilterActive && (
            <div className="flex overflow-x-auto no-scrollbar gap-2 px-5 py-2.5 border-b border-white/5 bg-black/20 backdrop-blur-md shrink-0">
              {dna.format && (
                <button onClick={() => setDna({ ...dna, format: '' })} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/15 text-[10px] font-black uppercase tracking-widest text-white shrink-0 active:scale-95 transition-all">
                  {dna.format} <span className="text-white/40 text-[11px] leading-none">✕</span>
                </button>
              )}
              {dna.mentality && (
                <button onClick={() => setDna({ ...dna, mentality: '' })} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/15 text-[10px] font-black uppercase tracking-widest text-white shrink-0 active:scale-95 transition-all">
                  {dna.mentality.toUpperCase()} <span className="text-white/40 text-[11px] leading-none">✕</span>
                </button>
              )}
              {dna.role && (
                <button onClick={() => setDna({ ...dna, role: '' })} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/15 text-[10px] font-black uppercase tracking-widest text-white shrink-0 active:scale-95 transition-all">
                  {ROLE_LABEL_MAP[dna.role] || dna.role} <span className="text-white/40 text-[11px] leading-none">✕</span>
                </button>
              )}
              {dna.budget && (
                <button onClick={() => setDna({ ...dna, budget: '' })} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/15 text-[10px] font-black uppercase tracking-widest text-white shrink-0 active:scale-95 transition-all">
                  {dna.budget} <span className="text-white/40 text-[11px] leading-none">✕</span>
                </button>
              )}
              {dna.duration && (
                <button onClick={() => setDna({ ...dna, duration: '' })} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/15 text-[10px] font-black uppercase tracking-widest text-white shrink-0 active:scale-95 transition-all">
                  {dna.duration} <span className="text-white/40 text-[11px] leading-none">✕</span>
                </button>
              )}
              {dna.gender && (
                <button onClick={() => setDna({ ...dna, gender: '' })} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/15 text-[10px] font-black uppercase tracking-widest text-white shrink-0 active:scale-95 transition-all">
                  {dna.gender.toUpperCase()} <span className="text-white/40 text-[11px] leading-none">✕</span>
                </button>
              )}
              {dna.age && dna.age !== 'Tümü' && (
                <button onClick={() => setDna({ ...dna, age: '' })} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/15 text-[10px] font-black uppercase tracking-widest text-white shrink-0 active:scale-95 transition-all">
                  {dna.age} YAŞ <span className="text-white/40 text-[11px] leading-none">✕</span>
                </button>
              )}
              {dna.district && (
                <button onClick={() => setDna({ ...dna, district: '' })} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/15 text-[10px] font-black uppercase tracking-widest text-white shrink-0 active:scale-95 transition-all">
                  {dna.district.toUpperCase()} <span className="text-white/40 text-[11px] leading-none">✕</span>
                </button>
              )}
            </div>
          )}

          {/* TAB SELECTION */}
          <div className="flex px-5 py-2.5 bg-black/20 backdrop-blur-md border-b border-white/5 gap-3 shrink-0">
            <button 
              onClick={() => setActiveSection('bireysel')}
              className={`flex-1 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                activeSection === 'bireysel' 
                  ? 'bg-[#39FF14]/10 border-[#39FF14]/50 text-white shadow-[0_0_20px_rgba(57,255,20,0.1)]' 
                  : 'bg-white/[0.02] border-white/5 text-white/50 hover:bg-white/5'
              }`}
            >
              Bireysel Maç Bul
            </button>
            <button 
              onClick={() => setActiveSection('takim')}
              className={`flex-1 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                activeSection === 'takim' 
                  ? 'bg-[#FFFF00]/10 border-[#FFFF00]/50 text-white shadow-[0_0_20px_rgba(255,255,0,0.1)]' 
                  : 'bg-white/[0.02] border-white/5 text-white/50 hover:bg-white/5'
              }`}
            >
              Takıma Katıl
            </button>
          </div>

          {/* QUICK FILTERS */}
          {activeSection === 'bireysel' && (
            <div className="relative shrink-0">
            <div className="flex overflow-x-auto no-scrollbar gap-3 px-5 py-3 border-b border-white/5 bg-[#0D121F]/40 backdrop-blur-md">
              <div className="flex gap-2 items-center shrink-0">
                <span className="text-[9px] font-black uppercase tracking-[0.15em] text-[#FFFF00]/70 mr-1">FORMAT</span>
                {['Tümü', '5v5', '6v6', '7v7', '8v8', '9v9', '10v10', '11v11'].map(f => {
                  const isSelected = (f === 'Tümü' && !dna.format) || (dna.format === f);
                  return (
                    <button
                      key={f}
                      onClick={() => setDna({ ...dna, format: f === 'Tümü' ? '' : f })}
                      className={`px-3.5 py-1.5 rounded-full text-[10px] font-black tracking-widest transition-all border ${
                        isSelected 
                          ? 'bg-[#39FF14]/15 border-[#39FF14]/50 text-[#39FF14] shadow-[0_0_15px_rgba(57,255,20,0.2)]' 
                          : 'bg-white/[0.02] border-white/10 text-white/70 hover:bg-white/5'
                      }`}
                    >
                      {f}
                    </button>
                  );
                })}
              </div>

              <div className="w-px h-4 bg-white/10 shrink-0 self-center" />

              <div className="flex gap-2 items-center shrink-0">
                <span className="text-[9px] font-black uppercase tracking-[0.15em] text-[#FFFF00]/70 mr-1">MANTALİTE</span>
                {['Tümü', 'Ciddi', 'Taktiksel', 'Rahat'].map(m => {
                  const isSelected = (m === 'Tümü' && !dna.mentality) || (dna.mentality.toLowerCase() === m.toLowerCase());
                  return (
                    <button
                      key={m}
                      onClick={() => setDna({ ...dna, mentality: m === 'Tümü' ? '' : m })}
                      className={`px-3.5 py-1.5 rounded-full text-[10px] font-black tracking-widest transition-all border ${
                        isSelected 
                          ? 'bg-[#FFFF00]/15 border-[#FFFF00]/50 text-[#FFFF00] shadow-[0_0_15px_rgba(255,255,0,0.2)]' 
                          : 'bg-white/[0.02] border-white/10 text-white/70 hover:bg-white/5'
                      }`}
                    >
                      {m.toUpperCase()}
                    </button>
                  );
                })}
              </div>

              <div className="w-px h-4 bg-white/10 shrink-0 self-center" />

              <div className="flex gap-2 items-center shrink-0">
                <span className="text-[9px] font-black uppercase tracking-[0.15em] text-[#FFFF00]/70 mr-1">POZİSYON</span>
                {['Tümü', 'KL', 'SAV', 'ORT', 'HÜC'].map(r => {
                  const isSelected = (r === 'Tümü' && !dna.role) || (dna.role === r);
                  return (
                    <button
                      key={r}
                      onClick={() => setDna({ ...dna, role: r === 'Tümü' ? '' : r })}
                      className={`px-3.5 py-1.5 rounded-full text-[10px] font-black tracking-widest transition-all border ${
                        isSelected 
                          ? 'bg-[#39FF14]/15 border-[#39FF14]/50 text-[#39FF14] shadow-[0_0_15px_rgba(57,255,20,0.2)]' 
                          : 'bg-white/[0.02] border-white/10 text-white/70 hover:bg-white/5'
                      }`}
                    >
                      {r}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="absolute right-0 top-0 bottom-0 w-11 pointer-events-none bg-gradient-to-l from-[#0A0E14] to-transparent" />
            </div>
          )}

          {/* MATCH CARDS (POSTERS) */}
          <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6 relative z-10 custom-scrollbar">
            {activeSection === 'bireysel' && (
              <>
                {isFilterActive && (
                  <>
                    {/* Filtreye Uygun Maçlar Section */}
                    <div>
                      <h2 className="text-sm font-black italic uppercase tracking-widest text-[#39FF14] mb-4 flex items-center gap-2 drop-shadow-[0_0_8px_rgba(57,255,20,0.4)]">
                        <span className="inline-block w-1.5 h-3 bg-[#39FF14] rounded-sm" />
                        Filtreye Uygun Maçlar
                      </h2>
                      
                      {matchingMatches.length === 0 ? (
                        <div className="bg-[#ef4444]/10 border border-[#ef4444]/20 backdrop-blur-md rounded-[24px] p-6 flex flex-col items-center justify-center text-center gap-3 shadow-[0_0_15px_rgba(239,68,68,0.1)] mb-8">
                          <p className="text-white font-black italic uppercase tracking-tighter text-base">Filtrelere Uygun Maç Bulunamadı</p>
                          <p className="text-white/60 text-[10px] font-bold uppercase tracking-wider max-w-sm">
                            Seçtiğin kriterlere uyan aktif bir maç bulunmuyor. Diğer maçları inceleyebilir ya da filtrelerini sıfırlayabilirsin.
                          </p>
                          <div className="flex gap-2 flex-wrap justify-center">
                            <button
                              onClick={handleClearFilters}
                              className="px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-[10px] font-black uppercase tracking-widest text-white transition-all active:scale-95"
                            >
                              Filtreleri Temizle
                            </button>
                            <button
                              onClick={() => {
                                if (userLocation) {
                                  setSearchRadius(Math.min(searchRadius + 15, 100));
                                } else {
                                  setShowWizard(true);
                                }
                              }}
                              className="px-5 py-2.5 rounded-full bg-[#39FF14]/10 hover:bg-[#39FF14]/20 border border-[#39FF14]/40 text-[10px] font-black uppercase tracking-widest text-[#39FF14] transition-all active:scale-95"
                            >
                              Çapı Genişlet
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-6 mb-8">
                          {matchingMatches.map((match, index) => (
                            <MatchCard key={match.id} match={match} index={index} onSelect={onSelect} dna={dna} trustScore={trustScore} />
                          ))}
                        </div>
                      )}
                    </div>
     
                    {/* Tüm Diğer Maçlar Section */}
                    {otherMatches.length > 0 && (
                      <div>
                        <h2 className="text-sm font-black italic uppercase tracking-widest text-white/40 mb-4 flex items-center gap-2">
                          <span className="inline-block w-1.5 h-3 bg-white/20 rounded-sm" />
                          {userLocation ? `${searchRadius} KM ÇAPINDAKİ DİĞER MAÇLAR` : 'Tüm Maçlar'}
                        </h2>
                        <div className="space-y-6">
                          {otherMatches.map((match, index) => (
                            <MatchCard key={match.id} match={match} index={index + matchingMatches.length} onSelect={onSelect} dna={dna} trustScore={trustScore} />
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
     
                {!isFilterActive && (
                  <div className="space-y-6">
                    {userLocation && (
                        <h2 className="text-sm font-black italic uppercase tracking-widest text-[#39FF14] mb-4 flex items-center gap-2 drop-shadow-[0_0_8px_rgba(57,255,20,0.4)]">
                          <MapPin size={16} />
                          {searchRadius} KM ÇAPINDAKİ MAÇLAR
                        </h2>
                    )}
                    {otherMatches.length === 0 ? (
                      <EmptyState title="Aktif Maç Bulunamadı" message="Bu bölgede şu an açık bir maç yok." />
                    ) : (
                      otherMatches.map((match, index) => (
                        <MatchCard key={match.id} match={match} index={index} onSelect={onSelect} dna={dna} trustScore={trustScore} />
                      ))
                    )}
                  </div>
                )}
              </>
            )}

            {activeSection === 'takim' && (
              <div className="space-y-6">
                {playerSeekAds.length === 0 ? (
                  <EmptyState title="Aktif Oyuncu İlanı Bulunamadı" message="Şu an takım arayan bir oyuncu ilanı yok." />
                ) : (
                  playerSeekAds.map((ad, index) => {
                    const isJoined = ad.joinedPlayers?.includes(currentUserUid);
                    const isAccepted = ad.acceptedPlayers?.includes(currentUserUid);
                    let accentColor = '#FFFF00'; // Neon Yellow for Ciddi
                    if (ad.difficulty === 'Taktiksel') accentColor = '#3b82f6';
                    if (ad.difficulty === 'Rahat') accentColor = '#10b981';

                    return (
                      <motion.div
                        key={ad.id}
                        initial={{ opacity: 0, y: 30, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ duration: 0.5, delay: index * 0.05, type: 'spring', damping: 25 }}
                        className="relative w-full bg-[#161B22]/80 backdrop-blur-xl border border-white/5 rounded-[32px] p-6 shadow-2xl overflow-hidden group"
                      >
                        {/* Dynamic background glow */}
                        <div className="absolute top-0 right-0 w-32 h-32 opacity-10 blur-3xl pointer-events-none rounded-full" style={{ backgroundColor: accentColor }} />
                        
                        {/* Inner Glow Border */}
                        <div className="absolute inset-0 border-[1.5px] rounded-[32px] pointer-events-none transition-all duration-500" style={{ borderColor: `${accentColor}20` }} />

                        <div className="flex items-start justify-between gap-4">
                          {/* Captain Info */}
                          <div className="flex items-center gap-3">
                            <div className="relative">
                              <img src={ad.creatorAvatar} className="w-12 h-12 rounded-full border-2 border-white/10 shadow-lg object-cover" alt={ad.creatorName} referrerPolicy="no-referrer" />
                              <div className="absolute -bottom-1 -right-1 bg-gradient-to-br from-[#FFFF00] to-yellow-500 text-black text-[7px] font-black px-1.5 py-0.5 rounded-full border border-black uppercase tracking-wider">
                                KPT
                              </div>
                            </div>
                            <div>
                              <h4 className="text-sm font-black text-white uppercase italic tracking-tight">{ad.creatorName}</h4>
                              <p className="text-[9px] text-[#39FF14] font-black tracking-widest uppercase">Kaptan Bildirisi</p>
                            </div>
                          </div>

                          {/* Difficulty / Mentality Indicator */}
                          <div className="px-3.5 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-widest" style={{ borderColor: `${accentColor}40`, backgroundColor: `${accentColor}10`, color: accentColor }}>
                            {ad.difficulty}
                          </div>
                        </div>

                        {/* Middle Match Details */}
                        <div className="mt-6 space-y-3">
                          <h3 className="text-xl font-black text-white italic uppercase leading-none tracking-tighter">
                            {ad.pitchName}
                          </h3>
                          
                          <div className="flex items-center gap-4 text-xs font-black text-white/60 tracking-wider">
                            <span className="flex items-center gap-1.5">
                              <Clock size={12} className="text-[#39FF14]" />
                              18.05.2026 • 22:00 - 23:00
                            </span>
                          </div>

                          {/* Positions Needed badges */}
                          <div className="flex flex-wrap gap-2 pt-1">
                            {ad.positionsNeeded.map((pos, i) => {
                              let mappedPos = pos;
                              if (['GK', 'KALECİ'].includes(mappedPos)) mappedPos = 'KALECİ';
                              else if (['DEF', 'STP', 'SĞB', 'SLB', 'SAVUNMA', 'BEK'].includes(mappedPos)) mappedPos = 'SAVUNMA';
                              else if (['MID', 'ORT', 'MDO', 'OS', 'ORTA', 'ORTA SAHA'].includes(mappedPos)) mappedPos = 'ORTA SAHA';
                              else if (['FW', 'HÜC', 'SNT', 'SĞA', 'SLA', 'HÜCUM', 'FV'].includes(mappedPos)) mappedPos = 'HÜCUM';
                              
                              return (
                                <span key={i} className="px-3 py-1.5 bg-red-500/15 border border-red-500/30 text-red-400 text-[10px] font-black uppercase tracking-widest rounded-xl flex items-center gap-1.5 shadow-[0_0_10px_rgba(239,68,68,0.1)]">
                                  <Circle size={10} className="text-red-500 animate-pulse" /> {mappedPos} ARANIYOR
                                </span>
                              );
                            })}
                          </div>
                        </div>

                        {/* Rules Pill Grid */}
                        <div className="flex items-center gap-1.5 flex-wrap mt-5 border-t border-white/5 pt-4">
                          <span className="px-2 py-0.5 rounded border border-white/10 bg-white/5 text-[9px] font-black text-white/80 uppercase tracking-widest backdrop-blur-sm">
                            {ad.format} FORMAT
                          </span>
                          <span className="px-2 py-0.5 rounded border border-white/10 bg-white/5 text-[9px] font-black text-white/80 uppercase tracking-widest backdrop-blur-sm">
                            {ad.duration}
                          </span>
                          <span className="px-2 py-0.5 rounded border border-white/10 bg-white/5 text-[9px] font-black text-white/80 uppercase tracking-widest backdrop-blur-sm">
                            {ad.gender}
                          </span>
                          {ad.ageGroup && ad.ageGroup !== 'Tümü' && (
                            <span className="px-2 py-0.5 rounded border border-white/10 bg-white/5 text-[9px] font-black text-white/80 uppercase tracking-widest backdrop-blur-sm">
                              {ad.ageGroup} YAŞ
                            </span>
                          )}
                        </div>

                        {/* Request/Join Action */}
                        <div className="mt-5 flex items-center justify-between border-t border-white/5 pt-4">
                          <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                            {ad.joinedPlayers?.length || 0} OYUNCU TALEPTE BULUNDU
                          </span>

                          {isAccepted ? (
                            <span
                              className="px-5 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest bg-gradient-to-r from-emerald-500 to-[#39FF14] text-black shadow-[0_0_25px_rgba(57,255,20,0.5)] border-2 border-white/30 flex items-center gap-1.5"
                            >
                              <Check size={12} /> KADROYA KABUL EDİLDİ
                            </span>
                          ) : (
                            <motion.button
                              whileHover={{ scale: 1.03 }}
                              whileTap={{ scale: 0.97 }}
                              onClick={() => {
                                toggleJoinPlayerSeekAd(ad.id, currentUserUid);
                                if (!isJoined) {
                                  // Simulate captain accepting after 2.5 seconds
                                  setTimeout(() => {
                                    acceptPlayerSeekAdRequest(ad.id, currentUserUid);
                                    showToast('Talebiniz Kabul Edildi! Kaptanla mesajlaşabilirsiniz. 💬', 'success');
                                  }, 2500);
                                }
                              }}
                              className={`px-5 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all cursor-pointer ${
                                isJoined 
                                  ? 'bg-emerald-500/10 border border-emerald-500/50 text-[#39FF14] shadow-[0_0_15px_rgba(16,185,129,0.2)]' 
                                  : 'bg-[#FFFF00] hover:bg-yellow-300 text-black shadow-[0_0_20px_rgba(255,255,0,0.3)]'
                              }`}
                            >
                              {isJoined ? (
                                <span className="flex items-center gap-1">
                                  <CheckCircle2 size={12} /> TALEP GÖNDERİLDİ
                                </span>
                              ) : (
                                'KATILMA TALEBİ GÖNDER'
                              )}
                            </motion.button>
                          )}
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* ── ÖZEL MAÇ: KODLA KATILIM MODALI ── */}
      <AnimatePresence>
        {showPrivateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-black/85 backdrop-blur-sm flex items-center justify-center p-6"
            onClick={() => { if (!privateLoading) { setShowPrivateModal(false); setPrivateError(null); setPrivateCode(''); } }}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#161B22] w-full max-w-sm rounded-[32px] border border-[#FFFF00]/20 p-7 text-center"
            >
              <div className="w-16 h-16 mx-auto rounded-full bg-[#FFFF00]/10 border-2 border-[#FFFF00]/40 flex items-center justify-center mb-5">
                <KeyRound size={28} className="text-[#FFFF00]" />
              </div>
              <h2 className="text-xl font-black text-white mb-2 italic uppercase tracking-tight">Özel Maça Katıl</h2>
              <p className="text-xs text-gray-400 leading-relaxed mb-5">
                Sana iletilen <span className="text-[#FFFF00] font-bold">özel maç kodunu</span> gir. Sadece davetlilerin görebildiği maçlara böyle katılırsın.
              </p>

              <input
                autoFocus
                value={privateCode}
                onChange={(e) => { setPrivateCode(e.target.value.toUpperCase().slice(0, 8)); setPrivateError(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter' && !privateLoading) handleJoinPrivate(); }}
                placeholder="ÖRN. A1B2C3"
                maxLength={8}
                className="w-full bg-black/40 border border-white/15 rounded-2xl px-4 py-4 text-center text-2xl font-black tracking-[0.4em] text-white placeholder:text-white/20 placeholder:tracking-widest placeholder:text-base focus:border-[#FFFF00]/50 focus:outline-none transition-all uppercase"
              />

              {privateError && (
                <p className="text-xs text-red-400 bg-red-950/40 border border-red-500/20 rounded-xl px-3 py-2 mt-4">{privateError}</p>
              )}

              <div className="flex flex-col gap-3 mt-6">
                <button
                  onClick={handleJoinPrivate}
                  disabled={privateLoading || privateCode.trim().length < 4}
                  className={`w-full py-3.5 bg-[#FFFF00] text-black font-black rounded-2xl text-sm uppercase tracking-wide transition-transform flex items-center justify-center gap-2 ${privateLoading || privateCode.trim().length < 4 ? 'opacity-50 cursor-not-allowed' : 'active:scale-95 hover:bg-yellow-300'}`}
                >
                  {privateLoading ? <><Loader2 size={16} className="animate-spin" /> Aranıyor...</> : 'Maça Git'}
                </button>
                <button
                  onClick={() => { if (!privateLoading) { setShowPrivateModal(false); setPrivateError(null); setPrivateCode(''); } }}
                  className="w-full py-3 text-gray-400 font-bold text-sm hover:text-white transition-colors"
                >
                  Vazgeç
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Premium Toast Overlay */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 px-5 py-3.5 rounded-2xl border border-[#39FF14]/30 bg-[#0A0E14]/90 backdrop-blur-xl shadow-[0_8px_32px_rgba(57,255,20,0.25)]"
          >
            <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-[#39FF14] flex items-center justify-center text-xs font-black">
              ✓
            </div>
            <p className="text-white text-xs font-bold tracking-wide">{toast.message}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const getMatchTargetDate = (dateStr: string, timeStr: string): Date => {
  const now = new Date();
  const [hours, minutes] = timeStr.split(':').map(Number);
  
  let targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0);
  
  const cleanDateStr = dateStr.toLowerCase().trim();
  if (cleanDateStr === 'yarın') {
    targetDate.setDate(targetDate.getDate() + 1);
  } else if (cleanDateStr !== 'bugün') {
    const daysOfWeek: Record<string, number> = {
      'pazartesi': 1,
      'salı': 2,
      'çarşamba': 3,
      'perşembe': 4,
      'cuma': 5,
      'cumartesi': 6,
      'pazar': 0
    };
    const targetDayNum = daysOfWeek[cleanDateStr];
    if (targetDayNum !== undefined) {
      const currentDayNum = now.getDay();
      let diff = targetDayNum - currentDayNum;
      if (diff <= 0) diff += 7; // Next occurrence
      targetDate.setDate(targetDate.getDate() + diff);
    }
  }
  return targetDate;
};

const MatchCard: React.FC<{
  match: any;
  index: number;
  onSelect: (match: MatchListing) => void;
  dna: any;
  trustScore: number;
}> = ({ match, index, onSelect, dna, trustScore }) => {
  const roleMap: Record<string, string> = { 'HÜC': 'HÜCUM', 'ORT': 'ORTA SAHA', 'SAV': 'SAVUNMA', 'KL': 'KALECİ' };
  const myRole = roleMap[dna.role];
  const glowColor = match.mentalityColor;
  
  // Güven skoru 3.0'ın altındakiler veya minRating'i karşılayamayanlar için kilitli premium kart mantığı
  const isLocked = match.minRating && match.minRating > trustScore;

  // ── Kontenjan hesabı (gerçek slot verisi) ──
  const homeSlots: any[] = match.slots || [];
  const awaySlotData: any[] = match.awaySlots || [];
  const totalSlots = homeSlots.length + awaySlotData.length;
  const slotFilled =
    homeSlots.filter((s: any) => s.status === 'TAKEN').length +
    awaySlotData.filter((s: any) => s.status === 'TAKEN').length;
  const slotRemaining = totalSlots - slotFilled;
  const fillPct = totalSlots > 0 ? Math.round((slotFilled / totalSlots) * 100) : 0;

  // Maça kalan süre ticking timer state & effect
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [isUrgentTime, setIsUrgentTime] = useState(false);

  useEffect(() => {
    const target = getMatchTargetDate(match.date, match.time);
    
    const updateTimer = () => {
      const now = new Date().getTime();
      const diff = target.getTime() - now;
      
      setIsUrgentTime(diff > 0 && diff < 2 * 60 * 60 * 1000);
      if (diff <= 0) {
        setTimeLeft('BAŞLADI');
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      
      const pad = (n: number) => String(n).padStart(2, '0');
      
      if (hours > 24) {
        const days = Math.floor(hours / 24);
        setTimeLeft(`${days} GÜN KALDI`);
      } else {
        setTimeLeft(`${pad(hours)}:${pad(minutes)}:${pad(seconds)}`);
      }
    };
    
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [match.date, match.time]);

  const urgencyType: 'son1kisi' | 'sonDakika' | null =
    (slotRemaining <= 1 && slotRemaining > 0) ? 'son1kisi' : (isUrgentTime ? 'sonDakika' : null);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 30, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, delay: index * 0.05, type: 'spring', damping: 25 }}
      onClick={() => {
        if (isLocked) return; // Kilitliyse tıklanamaz
        onSelect(match);
      }}
      className="relative w-full h-[400px] rounded-[32px] overflow-hidden cursor-pointer group shadow-2xl border border-white/5"
    >
      {/* Arka Plan Posteri */}
      <img src={match.image} className="absolute inset-0 w-full h-full object-cover transition-transform duration-[2s] ease-out group-hover:scale-110" alt={match.location} referrerPolicy="no-referrer" />
      
      {/* Renk Tonu ve Güçlü Karartma (Gradient) */}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/75 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 to-transparent" />
      <div className="absolute inset-0 opacity-20 mix-blend-overlay" style={{ background: `radial-gradient(circle at center, transparent 0%, ${glowColor} 100%)` }} />
      
      {/* Karizma Sınır Çizgisi (İç Glow) */}
      <div className="absolute inset-0 border-[1.5px] rounded-[32px] pointer-events-none transition-all duration-500" style={{ borderColor: `${glowColor}30`, boxShadow: `inset 0 0 30px ${glowColor}15` }} />
 
      {/* ── ÜST KISIM (SAAT & GERİ SAYIM) ── */}
      <div className="absolute top-5 left-5 right-5 flex justify-between items-start z-10">
        {/* Dijital Saat (Sol Üst) */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-black/60 backdrop-blur-md rounded-xl border border-white/10 shadow-lg">
          <Clock size={12} className="text-[#39FF14]" />
          <span className="text-xs font-black text-white tracking-[0.1em] drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]">{match.time}</span>
        </div>
 
        {/* Maça Kalan Süre Ticking Geri Sayım (Sağ Üst) */}
        <div className="flex items-center gap-1.5 px-3.5 py-1.5 bg-black/70 backdrop-blur-md border border-[#39FF14]/30 rounded-xl shadow-[0_0_15px_rgba(57,255,20,0.1)]">
          <span className="w-1.5 h-1.5 bg-[#39FF14] rounded-full animate-ping shrink-0" />
          <span className="text-[10px] font-black tracking-widest text-[#39FF14] drop-shadow-[0_0_8px_rgba(57,255,20,0.5)]">
            {timeLeft}
          </span>
        </div>
      </div>

      {/* ── ACİLİYET ROZETİ ── */}
      {urgencyType && (
        <div className="absolute top-[56px] left-0 right-0 flex justify-center z-10">
          <div className="px-3 py-1 rounded-full bg-black/70 backdrop-blur-md text-[9px] font-black tracking-[0.18em] uppercase border"
            style={{
              borderColor: urgencyType === 'son1kisi' ? '#ef4444' : '#FFFF00',
              color: urgencyType === 'son1kisi' ? '#ef4444' : '#FFFF00',
              boxShadow: `0 0 10px ${urgencyType === 'son1kisi' ? 'rgba(239,68,68,0.35)' : 'rgba(255,255,0,0.35)'}`
            }}>
            {urgencyType === 'son1kisi' ? 'SON 1 KİŞİ' : 'SON DAKİKA'}
          </div>
        </div>
      )}

      {/* ── ORTA KISIM (EKSİK POZİSYONLAR - Net ve Şık) ── */}
      <div className="absolute top-1/2 left-5 -translate-y-1/2 flex flex-col gap-2.5 z-10">
        {match.missingPositions?.map((pos: any, i: number) => {
          const isUrgent = pos.role === myRole;
          const localizedRole = pos.role;
          
          return (
            <div 
              key={i} 
              className={`flex items-center gap-2 px-3 py-2 rounded-xl backdrop-blur-xl border transition-all ${
                isUrgent 
                  ? 'bg-red-500/15 border-red-500/40 shadow-[0_0_20px_rgba(239,68,68,0.2)]' 
                  : 'bg-black/60 border-white/10'
              }`}
              style={{ borderLeft: `4px solid ${isUrgent ? '#ef4444' : '#39FF14'}` }}
            >
              <Circle size={12} className={isUrgent ? 'text-[#ef4444]' : 'text-[#39FF14]'} />
              <span className={`text-[10px] font-black uppercase tracking-widest ${isUrgent ? 'text-white drop-shadow-[0_0_5px_rgba(255,255,255,0.8)]' : 'text-white/80'}`}>
                {pos.count} {localizedRole} ARANIYOR
              </span>
            </div>
          );
        })}
      </div>
 
      {/* ── ALT KISIM (TESİS, TARİH, SAAT & FİYAT + KATIL AKSİYONU) ── */}
      <div className="absolute bottom-0 left-0 right-0 p-6 z-20 flex flex-col justify-end">
        <div className="flex items-end justify-between gap-4">
          <div className="flex-1">
            {/* ── KONTENJAN GÖSTERGESİ ── */}
            {totalSlots > 0 && (
              <div className="flex items-center gap-2 mb-2">
                <div className="w-[88px] h-[3px] rounded-full bg-white/10 overflow-hidden shrink-0">
                  <div className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${fillPct}%`,
                      backgroundColor: slotRemaining <= 1 ? '#FFFF00' : '#39FF14',
                      boxShadow: `0 0 6px ${slotRemaining <= 1 ? 'rgba(255,255,0,0.6)' : 'rgba(57,255,20,0.6)'}`
                    }} />
                </div>
                <span className="text-[9px] font-black uppercase tracking-wider text-white/60 drop-shadow-sm">
                  {slotFilled}/{totalSlots} OYUNCU
                </span>
              </div>
            )}

            {/* Tesis ve Lokasyon İsmi Devasa (Üst Karakter) */}
            <h3 className="text-2xl font-black text-white italic uppercase leading-none tracking-tighter drop-shadow-[0_4px_15px_rgba(0,0,0,1)] mb-2">
              {match.location.toUpperCase()}
            </h3>

            {/* Tarih ve Saat (Üst Karakter) */}
            <div className="text-[10px] font-black text-[#FFFF00] italic uppercase tracking-widest mb-3 drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
              {match.date.toUpperCase()} • {match.time.toUpperCase()}
            </div>
            
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest backdrop-blur-sm"
                style={{
                  border: `1px solid ${match.mentalityColor}66`,
                  backgroundColor: `${match.mentalityColor}22`,
                  color: match.mentalityColor,
                  textShadow: `0 0 6px ${match.mentalityColor}55`
                }}>
                {match.matchMentality}
              </span>
              <span className="px-2 py-0.5 rounded border border-white/10 bg-white/5 text-[9px] font-black text-white/80 uppercase tracking-widest backdrop-blur-sm">
                {match.format}
              </span>
              <span className="px-2 py-0.5 rounded border border-white/10 bg-white/5 text-[9px] font-black text-white/80 uppercase tracking-widest backdrop-blur-sm">
                {match.duration}
              </span>
              <span className="px-2 py-0.5 rounded border border-white/10 bg-white/5 text-[9px] font-black text-white/80 uppercase tracking-widest backdrop-blur-sm">
                {match.gender}
              </span>
              {match.ageGroup && match.ageGroup !== 'Tümü' && (
                <span className="px-2 py-0.5 rounded border border-white/10 bg-white/5 text-[9px] font-black text-white/80 uppercase tracking-widest backdrop-blur-sm">
                  {match.ageGroup} Yaş
                </span>
              )}
            </div>
          </div>
 
          {/* Fiyat (Sağ Altta) & Katıl Aksiyon Butonu */}
          <div className="flex flex-col items-end gap-2.5 shrink-0">
            {match.price === 0 ? (
              <div className="px-3.5 py-1.5 bg-gradient-to-br from-[#39FF14]/20 to-[#10b981]/10 backdrop-blur-xl border border-[#39FF14]/50 rounded-xl shadow-[0_0_20px_rgba(57,255,20,0.25)]">
                <span className="text-[10px] font-black italic uppercase tracking-widest text-[#39FF14] drop-shadow-[0_0_8px_rgba(57,255,20,0.6)]">ÜCRETSİZ</span>
              </div>
            ) : (
              <div className="px-3 py-1.5 bg-black/70 backdrop-blur-md border border-white/10 rounded-xl shadow-lg flex flex-col items-center gap-0.5">
                <span className="text-[7px] font-black uppercase tracking-wider text-white/45">KİŞİ BAŞI</span>
                <span className="text-[13px] font-black text-[#FFFF00] tracking-wider drop-shadow-md">{match.price} ₺</span>
              </div>
            )}

            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              disabled={isLocked}
              className="w-14 h-14 rounded-2xl flex items-center justify-center backdrop-blur-xl border border-white/20 transition-all bg-white/[0.05] hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_30px_rgba(0,0,0,0.5)]"
              style={{ boxShadow: `0 0 35px ${glowColor}25` }}
            >
              <ChevronRight size={24} className="text-white drop-shadow-lg group-hover:translate-x-1 transition-transform" />
            </motion.button>
          </div>
        </div>
      </div>

      {/* ── PREMIUM DİNAMİK KİLİT & BLUR KAPLAMASI ── */}
      {isLocked && (
        <div className="absolute inset-0 bg-black/75 backdrop-blur-md z-30 flex flex-col items-center justify-center p-6 text-center select-none animate-in fade-in duration-300">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', delay: 0.1 }}
            className="flex flex-col items-center gap-4"
          >
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-red-600/20 to-amber-600/10 border-2 border-red-500/50 flex items-center justify-center shadow-[0_0_25px_rgba(239,68,68,0.4)]">
              <ShieldAlert size={32} className="text-red-500 animate-pulse" />
            </div>
            
            <div className="space-y-2">
              <h4 className="text-lg font-black italic uppercase tracking-widest text-[#FFFF00] drop-shadow-[0_0_10px_rgba(255,255,0,0.4)]">
                KİLİTLİ PREMİUM MAÇ
              </h4>
              <p className="text-[10px] text-white/80 font-black uppercase tracking-widest leading-relaxed max-w-[240px] mx-auto">
                Bu maça katılabilmek için minimum <span className="text-[#39FF14]">★ {match.minRating}</span> yetenek puanı gerekmektedir.
              </p>
              <div className="w-24 h-px bg-white/10 mx-auto my-3" />
              <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">
                Senin Yetenek Puanın: <span className="text-red-400">★ {trustScore}</span>
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
};

export default MatchDiscovery;

