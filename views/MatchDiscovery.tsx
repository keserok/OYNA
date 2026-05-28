import React, { useState, useMemo } from 'react';
import {
  ArrowLeft, MapPin, Clock, Shield,
  Zap, ChevronRight, Target, CheckCircle2, Feather, Lock, ShieldAlert
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { MatchListing } from '../types';
import { useAppStore } from '../store';
import { auth } from '../firebase';

interface MatchDiscoveryProps {
  onBack: () => void;
  onSelect: (match: MatchListing) => void;
}

// ── OYUN DNA'SI SEÇENEKLERİ ──
const BUDGET_OPTIONS = ['Ücretsiz', '150-200₺', '200-250₺', '250-300₺', '300-350₺'];
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
  const { adminMatches, adminUsers } = useAppStore();
  const currentUserUid = auth.currentUser?.uid || 'u1';
  const currentUser = adminUsers.find(u => u.id === currentUserUid) || adminUsers[0];
  const trustScore = currentUser?.rating || 4.2;

  const [showWizard, setShowWizard] = useState(false);
  const [dna, setDna] = useState({
    format: '',
    budget: '',
    duration: '',
    age: '',
    gender: '',
    role: '',
    mentality: ''
  });

  const enhancedMatches = useMemo(() => {
    return adminMatches.map((m, i) => {
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

      return {
        ...m,
        price,
        difficulty: (m.difficulty || (matchMentality === 'CİDDİ' ? 'Ciddi' : matchMentality === 'TAKTİKSEL' ? 'Taktiksel' : 'Rahat')) as 'Ciddi' | 'Taktiksel' | 'Rahat',
        matchMentality,
        mentalityColor,
        format,
        duration,
        gender,
        ageGroup,
      };
    });
  }, [adminMatches]);

  const isFilterActive = useMemo(() => {
    return !!(dna.format || dna.budget || dna.duration || (dna.age && dna.age !== 'Tümü') || dna.gender || dna.role || dna.mentality);
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
      if (dna.budget === '150-200₺' && (price < 150 || price > 200)) {
        return false;
      }
      if (dna.budget === '200-250₺' && (price < 200 || price > 250)) {
        return false;
      }
      if (dna.budget === '250-300₺' && (price < 250 || price > 300)) {
        return false;
      }
      if (dna.budget === '300-350₺' && (price < 300 || price > 350)) {
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
      const roleMap: Record<string, string> = { 'HÜC': 'FW', 'ORT': 'MID', 'SAV': 'DEF', 'KL': 'GK' };
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
      mentality: ''
    });
  };

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
              <button onClick={() => setShowWizard(false)} className="text-[10px] font-black uppercase tracking-widest text-white/50 hover:text-white transition-colors">
                Geç
              </button>
            </div>

            {/* ANA İÇERİK */}
            <div className="flex-1 flex flex-col px-5 py-2 gap-4 justify-between relative z-10 overflow-y-auto no-scrollbar">
              <div className="space-y-3">
              
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
                <span className="relative z-10 drop-shadow-sm">MAÇLARA GİT</span>
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
                  <h1 className="text-xl font-black text-white italic uppercase tracking-tight leading-none drop-shadow-lg">Oyun Alanı</h1>
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
                <button onClick={() => setShowWizard(true)} className="flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-white/[0.03] backdrop-blur-md border border-white/10 text-white hover:bg-white/10 transition-all">
                  <span className="text-[10px] font-black uppercase tracking-widest drop-shadow-md">Filtre</span>
                  {isFilterActive && (
                    <span className="w-2 h-2 bg-[#FFFF00] rounded-full shadow-[0_0_10px_rgba(255,255,0,0.8)]" />
                  )}
                </button>
              </div>
            </div>
          </header>

          {/* MATCH CARDS (POSTERS) */}
          <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6 relative z-10 custom-scrollbar">
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
                      <button 
                        onClick={handleClearFilters} 
                        className="px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-[10px] font-black uppercase tracking-widest text-white transition-all active:scale-95"
                      >
                        Filtreleri Temizle
                      </button>
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
                      Tüm Maçlar
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
                {otherMatches.length === 0 ? (
                  <div className="text-center py-20 text-white/50 font-bold uppercase tracking-widest text-xs">Aktif maç bulunamadı.</div>
                ) : (
                  otherMatches.map((match, index) => (
                    <MatchCard key={match.id} match={match} index={index} onSelect={onSelect} dna={dna} trustScore={trustScore} />
                  ))
                )}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
};

const MatchCard: React.FC<{
  match: any;
  index: number;
  onSelect: (match: MatchListing) => void;
  dna: any;
  trustScore: number;
}> = ({ match, index, onSelect, dna, trustScore }) => {
  const roleMap: Record<string, string> = { 'HÜC': 'FW', 'ORT': 'MID', 'SAV': 'DEF', 'KL': 'GK' };
  const myRole = roleMap[dna.role];
  const glowColor = match.mentalityColor;
  
  // Güven skoru 3.0'ın altındakiler veya minRating'i karşılayamayanlar için kilitli premium kart mantığı
  const isLocked = match.minRating && match.minRating > trustScore;
  
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
      className="relative w-full h-[400px] rounded-[32px] overflow-hidden cursor-pointer group shadow-2xl"
    >
      {/* Arka Plan Posteri */}
      <img src={match.image} className="absolute inset-0 w-full h-full object-cover transition-transform duration-[2s] ease-out group-hover:scale-110" alt={match.title} referrerPolicy="no-referrer" />
      
      {/* Renk Tonu ve Güçlü Karartma (Gradient) */}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 to-transparent" />
      <div className="absolute inset-0 opacity-20 mix-blend-overlay" style={{ background: `radial-gradient(circle at center, transparent 0%, ${glowColor} 100%)` }} />
      
      {/* Karizma Sınır Çizgisi (İç Glow) */}
      <div className="absolute inset-0 border-[1.5px] rounded-[32px] pointer-events-none transition-all duration-500" style={{ borderColor: `${glowColor}30`, boxShadow: `inset 0 0 30px ${glowColor}15` }} />
 
      {/* ── ÜST KISIM (SAAT & BİLET) ── */}
      <div className="absolute top-5 left-5 right-5 flex justify-between items-start z-10">
        {/* Dijital Saat */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-black/50 backdrop-blur-md rounded-xl border border-white/20 shadow-lg">
          <Clock size={12} className="text-[#39FF14]" />
          <span className="text-xs font-black text-white tracking-[0.1em] drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]">{match.time}</span>
        </div>
 
        {/* VIP Ücret Tag */}
        {match.price === 0 ? (
          <div className="px-4 py-2 bg-gradient-to-br from-[#39FF14]/20 to-[#10b981]/10 backdrop-blur-xl border border-[#39FF14]/50 rounded-xl shadow-[0_0_25px_rgba(57,255,20,0.3)]">
            <span className="text-[10px] font-black italic uppercase tracking-widest text-[#39FF14] drop-shadow-[0_0_10px_rgba(57,255,20,0.8)]">ÜCRETSİZ</span>
          </div>
        ) : (
          <div className="px-3 py-1.5 bg-black/60 backdrop-blur-md border border-white/10 rounded-xl">
            <span className="text-[13px] font-black text-white drop-shadow-md">{match.price} ₺</span>
          </div>
        )}
      </div>
 
      {/* ── ORTA KISIM (EKSİK POZİSYONLAR Taktik Rozetleri) ── */}
      <div className="absolute top-1/2 left-5 -translate-y-1/2 flex flex-col gap-2 z-10">
        {match.missingPositions?.map((pos: any, i: number) => {
          const isUrgent = pos.role === myRole;
          const roleNameMap: Record<string, string> = { 'FW': 'HÜC', 'MID': 'ORT', 'DEF': 'SAV', 'GK': 'KL' };
          const localizedRole = roleNameMap[pos.role] || pos.role;
          
          return (
            <div key={i} className={`flex items-center gap-2 px-3 py-1.5 rounded-r-xl rounded-l-md backdrop-blur-xl border-y border-r transition-all ${isUrgent ? 'bg-[#ef4444]/20 border-[#ef4444]/60 shadow-[0_0_20px_rgba(239,68,68,0.4)]' : 'bg-black/40 border-white/10'}`} style={{ borderLeft: `3px solid ${isUrgent ? '#ef4444' : 'white'}` }}>
              <Shield size={12} className={isUrgent ? 'text-[#ef4444]' : 'text-white/60'} />
              <span className={`text-[10px] font-black uppercase tracking-widest ${isUrgent ? 'text-white drop-shadow-[0_0_5px_rgba(255,255,255,0.8)]' : 'text-white/70'}`}>
                {localizedRole}
              </span>
              <span className={`w-4 h-4 flex items-center justify-center rounded-full text-[9px] font-black ${isUrgent ? 'bg-[#ef4444] text-white' : 'bg-white/10 text-white'}`}>
                {pos.count}
              </span>
            </div>
          )
        })}
      </div>
 
      {/* ── ALT KISIM (SAHA BİLGİSİ & AKSİYON) ── */}
      <div className="absolute bottom-0 left-0 right-0 p-6 z-20 flex flex-col justify-end">
        
        <div className="flex items-end justify-between gap-4">
          <div className="flex-1">
            {/* Sahanın Adı Devasa */}
            <h3 className="text-3xl font-black text-white italic uppercase leading-[0.9] tracking-tighter drop-shadow-[0_4px_15px_rgba(0,0,0,1)] mb-2">
              {match.title}
            </h3>
            
            <div className="flex items-center gap-2 flex-wrap">
              <span className="flex items-center gap-1.5 text-[9px] text-white/60 font-bold uppercase tracking-widest drop-shadow-md mr-1">
                <MapPin size={11} className="text-white/40" />
                {match.location}
              </span>
              <span className="px-2 py-0.5 rounded border border-white/10 bg-white/5 text-[9px] font-black text-white/80 uppercase tracking-widest backdrop-blur-sm">
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
 
          {/* Katıl Butonu */}
          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            disabled={isLocked}
            className="shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center backdrop-blur-xl border border-white/20 transition-all group-hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: 'rgba(255,255,255,0.05)', boxShadow: `0 0 30px ${glowColor}20` }}
          >
            <ChevronRight size={24} className="text-white drop-shadow-lg group-hover:translate-x-1 transition-transform" />
          </motion.button>
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

