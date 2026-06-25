import React, { useState } from 'react';
import { ArrowLeft, Star, ShieldCheck, Crown, Users, Trophy, MessageSquare, Scale, Droplets } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface PostMatchEvalProps {
  onBack: () => void;
  onComplete: () => void;
}

const PLAYERS = [
  { id: 'p1', name: 'Ahmet Y.', pos: 'SNT',     initials: 'AY', color: '#ffd54f', tier: 'gold' },
  { id: 'p2', name: 'Caner K.', pos: 'MID',     initials: 'CK', color: '#c5cef5', tier: 'silver' },
  { id: 'p3', name: 'Emre D.',  pos: 'DEF',     initials: 'ED', color: '#d4986a', tier: 'bronze' },
  { id: 'p4', name: 'Burak Ş.', pos: 'KL',      initials: 'BŞ', color: '#ffd54f', tier: 'gold' },
  { id: 'p5', name: 'Mert A.',  pos: 'MID',     initials: 'MA', color: '#c5cef5', tier: 'silver' },
];

const FAIR_PLAY_TAGS = [
  { id: 'fair', label: '🤝 Centilmendi', positive: true },
  { id: 'rough', label: '💪 Agresif / Sertti', positive: false },
  { id: 'spirit', label: '⭐️ Lider Ruhlu', positive: true },
  { id: 'argue', label: '😤 İtirazcıydı', positive: false },
];

// Sparkle Particle Component
const Sparkle: React.FC<{ x: number; y: number; delay: number }> = ({ x, y, delay }) => (
  <motion.div
    initial={{ x, y, scale: 0, opacity: 1 }}
    animate={{ 
      y: y - 70, 
      x: x + (Math.random() - 0.5) * 50,
      scale: [0, 1.3, 0.7, 0],
      opacity: [1, 1, 0.5, 0],
      rotate: [0, 180, 360]
    }}
    transition={{ duration: 1.0, delay, ease: "easeOut" }}
    className="absolute pointer-events-none text-[#FFFF00] z-50"
  >
    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0l3 9 9 3-9 3-3 9-3-9-9-3 9-3z" />
    </svg>
  </motion.div>
);

const PostMatchEval: React.FC<PostMatchEvalProps> = ({ onBack, onComplete }) => {
  const [step, setStep] = useState(1);
  const [showHandshake, setShowHandshake] = useState(true);
  const [fairPlay, setFairPlay] = useState(0);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [playerRatings, setPlayerRatings] = useState<Record<string, number>>({});
  const [motm, setMotm] = useState<string | null>(null);
  const [refRating, setRefRating] = useState(0);
  const [pitchRating, setPitchRating] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [infoToast, setInfoToast] = useState<string | null>(null);

  const showInfo = (msg: string) => {
    setInfoToast(msg);
    setTimeout(() => setInfoToast(null), 3500);
  };

  // Sparkle burst coordinates
  const [sparkles, setSparkles] = useState<{ id: number; x: number; y: number; delay: number }[]>([]);

  const toggleTag = (id: string) => {
    if (navigator.vibrate) navigator.vibrate(15);
    setSelectedTags(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]);
  };

  const setPlayerRating = (pid: string, val: number, e: React.MouseEvent) => {
    if (navigator.vibrate) navigator.vibrate(20);
    setPlayerRatings(prev => ({ ...prev, [pid]: val }));
    triggerSparkles(e);
  };

  const triggerSparkles = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const newSparkles = Array.from({ length: 6 }).map((_, i) => ({
      id: Math.random() + i,
      x: x + (Math.random() - 0.5) * 10,
      y: y + (Math.random() - 0.5) * 10,
      delay: i * 0.04
    }));
    
    setSparkles(prev => [...prev, ...newSparkles]);
    
    setTimeout(() => {
      setSparkles(prev => prev.filter(s => !newSparkles.some(n => n.id === s.id)));
    }, 1200);
  };

  const motmPlayer = PLAYERS.find(p => p.id === motm);
  const ratingValues: number[] = Object.values(playerRatings) as number[];
  const avgPlayerRating = ratingValues.length > 0
    ? (ratingValues.reduce((a, b) => a + b, 0) / ratingValues.length).toFixed(1)
    : '—';

  const getTierBadgeClass = (tier: string) => {
    if (tier === 'gold') return 'bg-gradient-to-br from-[#ffe082] to-[#ffb300] text-black border border-[#ffb300] shadow-[0_0_12px_rgba(255,179,0,0.35)]';
    if (tier === 'silver') return 'bg-gradient-to-br from-[#e0e0e0] to-[#9e9e9e] text-black border border-[#9e9e9e] shadow-[0_0_10px_rgba(200,200,200,0.15)]';
    return 'bg-gradient-to-br from-[#bcaaa4] to-[#8d6e63] text-white border border-[#8d6e63]';
  };

  if (showResult) {
    return (
      <div className="fixed inset-0 bg-[#0A0E14] text-white font-sans flex flex-col items-center justify-center p-6 z-50 overflow-hidden">
        {/* Background glow flares */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] bg-[#FFFF00]/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 translate-y-1/2 w-[300px] h-[300px] bg-[#39FF14]/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10 pointer-events-none" />

        {/* Confetti simulation sparkles (Auto floating) */}
        {Array.from({ length: 12 }).map((_, i) => (
          <motion.div
            key={i}
            initial={{ 
              x: Math.random() * window.innerWidth - window.innerWidth / 2, 
              y: window.innerHeight / 2 + 100, 
              scale: Math.random() * 0.5 + 0.5,
              opacity: 1
            }}
            animate={{ 
              y: -window.innerHeight / 2 - 100, 
              rotate: [0, 360],
              x: Math.random() * window.innerWidth - window.innerWidth / 2 
            }}
            transition={{ 
              duration: Math.random() * 4 + 3, 
              repeat: Infinity, 
              delay: i * 0.4, 
              ease: "linear" 
            }}
            className="absolute pointer-events-none text-[#FFFF00]/60 z-0"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0l3 9 9 3-9 3-3 9-3-9-9-3 9-3z" />
            </svg>
          </motion.div>
        ))}

        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }} 
          animate={{ scale: 1, opacity: 1 }} 
          transition={{ type: 'spring', damping: 20, stiffness: 150 }}
          className="flex flex-col items-center gap-6 w-full max-w-sm relative z-10"
        >
          <motion.div 
            animate={{ 
              rotate: [0, -10, 10, -10, 0],
              scale: [1, 1.05, 1] 
            }} 
            transition={{ duration: 0.8, ease: "easeInOut", repeat: 0, delay: 0.2 }}
            className="w-24 h-24 rounded-full bg-gradient-to-br from-[#FFFF00] to-amber-500 flex items-center justify-center shadow-[0_0_50px_rgba(255,255,0,0.5)] border border-[#FFFF00]/40"
          >
            <Trophy size={42} className="text-black" />
          </motion.div>

          <div className="text-center space-y-1">
            <h2 className="text-2xl font-black uppercase tracking-tighter italic leading-none">DEĞERLENDİRME TAMAM!</h2>
            <p className="text-gray-500 text-xs font-bold uppercase tracking-wider">Puanların veri merkezine başarıyla yüklendi.</p>
          </div>

          {motmPlayer && (
            <motion.div 
              initial={{ opacity: 0, y: 15 }} 
              animate={{ opacity: 1, y: 0 }} 
              transition={{ delay: 0.3 }}
              className="w-full bg-[#121620]/60 backdrop-blur-xl border border-[#FFFF00]/30 rounded-[28px] p-5 text-center shadow-[0_0_25px_rgba(255,255,0,0.1)] relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-[#FFFF00]/5 to-transparent pointer-events-none" />
              <Crown size={22} className="text-[#FFFF00] mx-auto mb-2 drop-shadow-[0_0_8px_rgba(255,255,0,0.5)]" />
              <p className="text-[9px] text-[#FFFF00] font-black uppercase tracking-[0.25em] italic">MAÇIN ADAMI (MOTM)</p>
              
              <div className={`w-14 h-14 rounded-2xl mx-auto my-3.5 flex items-center justify-center font-black text-xl border ${getTierBadgeClass(motmPlayer.tier)}`}>
                {motmPlayer.initials}
              </div>
              <p className="text-lg font-black text-white uppercase tracking-tight italic">{motmPlayer.name}</p>
              <span className="px-2 py-0.5 bg-white/5 border border-white/10 rounded text-[8px] font-black text-gray-400 mt-1 inline-block tracking-widest">{motmPlayer.pos}</span>
            </motion.div>
          )}

          <div className="grid grid-cols-2 gap-3 w-full">
            <div className="bg-[#121620]/50 border border-white/5 rounded-2xl p-4 text-center">
              <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest mb-2">Rakip Centilmenliği</p>
              <div className="flex justify-center gap-1">
                {[1,2,3,4,5].map(s => (
                  <Star key={s} size={11} className={s <= fairPlay ? 'text-[#FFFF00] fill-[#FFFF00] drop-shadow-[0_0_6px_rgba(255,255,0,0.4)]' : 'text-gray-800'} />
                ))}
              </div>
            </div>
            <div className="bg-[#121620]/50 border border-white/5 rounded-2xl p-4 text-center flex flex-col justify-center">
              <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest mb-1.5">Ort. Oyuncu Puanı</p>
              <p className="text-xl font-black text-[#39FF14] italic tracking-tighter leading-none">{avgPlayerRating}</p>
            </div>
          </div>

          <motion.button 
            whileHover={{ scale: 1.02 }} 
            whileTap={{ scale: 0.98 }} 
            onClick={onComplete}
            className="w-full h-14 bg-[#39FF14] text-black font-black rounded-2xl text-xs uppercase tracking-[0.2em] shadow-[0_0_30px_rgba(57,255,20,0.25)] hover:shadow-[0_0_40px_rgba(57,255,20,0.4)] active:scale-95 transition-all"
          >
            Lobiye Geri Dön
          </motion.button>
        </motion.div>
      </div>
    );
  }

  if (showHandshake) {
    return (
      <div className="fixed inset-0 bg-[#0A0E14] text-white font-sans flex flex-col items-center justify-center p-6 z-50 overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10 pointer-events-none" />

        <motion.div 
          initial={{ scale: 0.9, opacity: 0, y: 20 }} 
          animate={{ scale: 1, opacity: 1, y: 0 }} 
          className="bg-[#121620]/80 backdrop-blur-xl border border-white/10 rounded-3xl p-8 w-full max-w-sm relative z-10 flex flex-col items-center text-center shadow-2xl"
        >
          <div className="w-16 h-16 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center mb-4">
            <Trophy size={32} className="text-blue-400" />
          </div>
          <h2 className="text-2xl font-black uppercase italic tracking-tight text-white mb-2">SKOR ONAYI</h2>
          <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mb-6">Hakem Maç Skorunu Girdi</p>

          <div className="flex items-center justify-center gap-6 mb-8 w-full">
            <div className="text-center flex-1">
              <span className="text-[10px] text-gray-500 font-bold uppercase block mb-2">SİZİN TAKIM</span>
              <div className="text-5xl font-black text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">5</div>
            </div>
            <div className="text-3xl font-black text-gray-700">-</div>
            <div className="text-center flex-1">
              <span className="text-[10px] text-gray-500 font-bold uppercase block mb-2">RAKİP</span>
              <div className="text-5xl font-black text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">3</div>
            </div>
          </div>

          <div className="w-full space-y-3">
            <motion.button 
              whileTap={{ scale: 0.96 }}
              onClick={() => setShowHandshake(false)}
              className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-500 text-white font-black text-sm rounded-2xl uppercase tracking-widest shadow-[0_0_20px_rgba(59,130,246,0.3)] flex items-center justify-center gap-2"
            >
              <ShieldCheck size={18} /> SKORU ONAYLA
            </motion.button>
            <motion.button 
              whileTap={{ scale: 0.96 }}
              onClick={() => {
                showInfo('Skor itirazınız hakeme ve diğer kaptana iletildi.');
                setShowHandshake(false);
              }}
              className="w-full py-4 bg-white/5 border border-white/10 text-gray-400 hover:text-white hover:bg-white/10 font-black text-xs rounded-2xl uppercase tracking-widest transition-all"
            >
              SKORA İTİRAZ ET
            </motion.button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-[#0A0E14] text-white font-sans flex flex-col overflow-hidden select-none">
      {infoToast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[999] bg-blue-900/90 border border-blue-500/40 text-blue-200 text-[11px] font-bold px-4 py-2 rounded-xl shadow-xl backdrop-blur-sm">
          {infoToast}
        </div>
      )}
      {/* ── HEADER (Glassmorphic & safe area top) ── */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-[#0E131F]/80 backdrop-blur-xl border-b border-white/5 pb-4 pt-safe px-5">
        <div className="flex items-center justify-between pt-3 mb-3">
          <button onClick={onBack} className="w-11 h-11 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 active:scale-95 transition-all shadow-md">
            <ArrowLeft size={20} className="text-white" />
          </button>
          
          <div className="text-center flex-1 mx-4">
            <h1 className="text-sm font-black uppercase tracking-[0.2em] italic text-white truncate leading-none">MAÇ DEĞERLENDİRME</h1>
            <p className="text-[9px] text-[#39FF14] font-black uppercase tracking-widest mt-1.5">Güney Kampüs SK • Bugün 21:00</p>
          </div>
          
          <div className="w-11 h-11 bg-white/5 border border-white/10 rounded-full flex items-center justify-center">
            <span className="text-[10px] font-black text-white/50">{step}/3</span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="flex gap-1.5 px-1">
          {[1,2,3].map(s => (
            <div key={s} className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }} 
                animate={{ width: step >= s ? '100%' : '0%' }} 
                transition={{ duration: 0.4 }}
                className="h-full rounded-full bg-gradient-to-r from-[#39FF14] to-emerald-400" 
              />
            </div>
          ))}
        </div>
      </header>

      {/* ── CONTENT AREA ── */}
      <div className="flex-1 overflow-y-auto pt-32 pb-12 px-5 custom-scrollbar">
        <AnimatePresence mode="wait">

          {/* ─ STEP 1: FAIR PLAY ─ */}
          {step === 1 && (
            <motion.div 
              key="s1" 
              initial={{ opacity: 0, x: 25 }} 
              animate={{ opacity: 1, x: 0 }} 
              exit={{ opacity: 0, x: -25 }} 
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="space-y-6"
            >
              <div className="text-center py-4 bg-[#121620]/40 rounded-[32px] border border-white/5 p-5 relative overflow-hidden">
                <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />
                <div className="w-14 h-14 bg-blue-500/10 border border-blue-500/20 rounded-2xl flex items-center justify-center mx-auto mb-3.5 shadow-[inset_0_2px_8px_rgba(59,130,246,0.15)]">
                  <ShieldCheck size={26} className="text-blue-400" />
                </div>
                <h2 className="text-base font-black uppercase tracking-tight italic">Rakip Takım Centilmenliği</h2>
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">Rakibinizin centilmence davranışlarını derecelendirin</p>
              </div>

              {/* Large Star Rating */}
              <div className="bg-[#121620]/60 backdrop-blur-xl border border-white/5 rounded-[32px] p-6 flex flex-col items-center gap-1 shadow-inner relative overflow-visible">
                <div className="flex justify-center gap-2">
                  {[1,2,3,4,5].map(star => (
                    <motion.button 
                      key={star} 
                      whileHover={{ scale: 1.18 }} 
                      whileTap={{ scale: 0.88 }}
                      onClick={(e) => {
                        if (navigator.vibrate) navigator.vibrate(20);
                        setFairPlay(star);
                        triggerSparkles(e);
                      }}
                      className="p-1 relative overflow-visible"
                    >
                      <Star 
                        size={38} 
                        className={`transition-all duration-300 ${
                          star <= fairPlay 
                            ? 'text-[#FFFF00] fill-[#FFFF00] drop-shadow-[0_0_12px_rgba(255,255,0,0.5)] scale-105' 
                            : 'text-gray-800 hover:text-white/40'
                        }`} 
                      />
                    </motion.button>
                  ))}
                </div>
                {/* Local Sparkles burst wrapper */}
                <div className="absolute inset-0 pointer-events-none overflow-visible">
                  {sparkles.map(s => (
                    <Sparkle key={s.id} x={s.x} y={s.y} delay={s.delay} />
                  ))}
                </div>
                {fairPlay > 0 && (
                  <span className="text-[9px] font-black uppercase tracking-widest mt-2.5 text-[#FFFF00]">
                    {fairPlay === 5 ? 'Kusursuz / Mükemmel Centilmenlik' : fairPlay === 4 ? 'Çok İyi Centilmenlik' : fairPlay === 3 ? 'Normal Centilmenlik' : fairPlay === 2 ? 'Kötü Davranışlar' : 'Sert ve Centilmenlik Dışı'}
                  </span>
                )}
              </div>

              {/* Tags Grid */}
              <div className="space-y-3">
                <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest block ml-1">ÖNE ÇIKAN DAVRANIŞLAR</span>
                <div className="grid grid-cols-2 gap-3">
                  {FAIR_PLAY_TAGS.map(tag => {
                    const isSelected = selectedTags.includes(tag.id);
                    return (
                      <motion.button 
                        key={tag.id} 
                        whileTap={{ scale: 0.96 }}
                        onClick={() => toggleTag(tag.id)}
                        className={`p-4 rounded-[20px] border text-[11px] font-black uppercase tracking-wider transition-all text-left flex items-center justify-between ${
                          isSelected
                            ? tag.positive 
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.15)]' 
                              : 'bg-rose-500/10 border-rose-500/30 text-rose-400 shadow-[0_0_15px_rgba(239,68,68,0.15)]'
                            : 'bg-black/30 border-white/5 text-gray-500 hover:border-white/10'
                        }`}
                      >
                        <span>{tag.label}</span>
                        {isSelected && <div className={`w-1.5 h-1.5 rounded-full ${tag.positive ? 'bg-emerald-400' : 'bg-rose-400'}`} />}
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              {/* Action Button */}
              <motion.button 
                whileHover={{ scale: 1.01 }} 
                whileTap={{ scale: 0.99 }}
                disabled={fairPlay === 0}
                onClick={() => setStep(2)}
                className="w-full h-14 bg-gradient-to-r from-[#39FF14] to-emerald-400 disabled:from-white/5 disabled:to-white/5 text-black disabled:text-white/30 font-black rounded-2xl uppercase tracking-[0.2em] text-xs transition-all flex items-center justify-center gap-1"
              >
                KADRO DEĞERLENDİRMESİNE GEÇ →
              </motion.button>
            </motion.div>
          )}

          {/* ─ STEP 2: PLAYER RATINGS & MOTM ─ */}
          {step === 2 && (
            <motion.div 
              key="s2" 
              initial={{ opacity: 0, x: 25 }} 
              animate={{ opacity: 1, x: 0 }} 
              exit={{ opacity: 0, x: -25 }} 
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="space-y-6"
            >
              <div className="text-center py-4 bg-[#121620]/40 rounded-[32px] border border-white/5 p-5 relative overflow-hidden">
                <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />
                <div className="w-14 h-14 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-center mx-auto mb-3.5 shadow-[inset_0_2px_8px_rgba(245,158,11,0.15)]">
                  <Users size={26} className="text-amber-400" />
                </div>
                <h2 className="text-base font-black uppercase tracking-tight italic">Öne Çıkan Oyuncular</h2>
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">Rakip oyuncuların performansını puanlayın ve maçın adamını seçin</p>
              </div>

              {/* Player list */}
              <div className="space-y-3.5 relative">
                {PLAYERS.map(p => {
                  const isMotm = motm === p.id;
                  const currentRating = playerRatings[p.id] ?? 0;
                  return (
                    <div 
                      key={p.id} 
                      className={`rounded-[24px] border p-4 transition-all relative overflow-hidden flex flex-col gap-3 ${
                        isMotm 
                          ? 'border-[#FFFF00] bg-gradient-to-br from-[#2c1d00]/30 to-[#121620]/60 shadow-[0_0_20px_rgba(255,255,0,0.15)]' 
                          : 'bg-[#121620]/50 border-white/5'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {/* FUT initials circle badge */}
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs border ${getTierBadgeClass(p.tier)}`}>
                            {p.initials}
                          </div>
                          <div>
                            <p className="text-xs font-black text-white uppercase tracking-tight leading-none mb-1">{p.name}</p>
                            <span className="px-1.5 py-0.5 bg-white/5 border border-white/10 rounded text-[7px] font-black text-gray-400 tracking-wider uppercase">{p.pos}</span>
                          </div>
                        </div>

                        {/* MOTM Button */}
                        <motion.button 
                          whileTap={{ scale: 0.92 }}
                          onClick={() => {
                            if (navigator.vibrate) navigator.vibrate(25);
                            setMotm(isMotm ? null : p.id);
                          }}
                          className={`h-9 px-3 rounded-xl border text-[9px] font-black tracking-widest uppercase flex items-center gap-1.5 transition-all ${
                            isMotm 
                              ? 'bg-[#FFFF00] text-black border-[#FFFF00] shadow-[0_0_12px_rgba(255,255,0,0.3)]' 
                              : 'bg-white/5 border-white/10 text-gray-500 hover:text-white hover:bg-white/10'
                          }`}
                        >
                          <Crown size={11} fill={isMotm ? 'black' : 'none'} className={isMotm ? 'text-black' : 'text-gray-500'} /> 
                          {isMotm ? 'MOTM SEÇİLDİ' : 'MOTM SEÇ'}
                        </motion.button>
                      </div>

                      {/* Small Star rating bar */}
                      <div className="flex gap-1.5 items-center relative overflow-visible">
                        {[1,2,3,4,5].map(s => (
                          <motion.button 
                            key={s} 
                            whileHover={{ scale: 1.22 }} 
                            whileTap={{ scale: 0.85 }}
                            onClick={(e) => setPlayerRating(p.id, s, e)}
                            className="p-0.5 relative overflow-visible"
                          >
                            <Star 
                              size={22} 
                              className={`transition-all duration-200 ${
                                s <= currentRating 
                                  ? 'text-[#FFFF00] fill-[#FFFF00] drop-shadow-[0_0_6px_rgba(255,255,0,0.4)]' 
                                  : 'text-gray-800 hover:text-white/40'
                              }`} 
                            />
                          </motion.button>
                        ))}
                        {currentRating > 0 && (
                          <span className="text-[8px] font-black uppercase tracking-widest text-[#FFFF00]/70 ml-2">
                            Puan: {currentRating}.0
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
                {/* Star rating Sparkle burst layer */}
                <div className="absolute inset-0 pointer-events-none overflow-visible">
                  {sparkles.map(s => (
                    <Sparkle key={s.id} x={s.x} y={s.y} delay={s.delay} />
                  ))}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-3">
                <motion.button 
                  whileTap={{ scale: 0.98 }} 
                  onClick={() => setStep(1)}
                  className="flex-1 h-14 bg-white/5 border border-white/10 text-white font-black rounded-2xl text-xs uppercase tracking-widest flex items-center justify-center hover:bg-white/10"
                >
                  ← GERİ
                </motion.button>
                <motion.button 
                  whileTap={{ scale: 0.98 }} 
                  onClick={() => setStep(3)}
                  className="flex-[2] h-14 bg-gradient-to-r from-[#39FF14] to-emerald-400 text-black font-black rounded-2xl text-xs uppercase tracking-widest flex items-center justify-center shadow-lg hover:shadow-xl"
                >
                  DEVAM ET →
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* ─ STEP 3: REFEREE & COURT ─ */}
          {step === 3 && (
            <motion.div 
              key="s3" 
              initial={{ opacity: 0, x: 25 }} 
              animate={{ opacity: 1, x: 0 }} 
              exit={{ opacity: 0, x: -25 }} 
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="space-y-6"
            >
              <div className="text-center py-4 bg-[#121620]/40 rounded-[32px] border border-white/5 p-5 relative overflow-hidden">
                <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
                <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto mb-3.5 shadow-[inset_0_2px_8px_rgba(16,185,129,0.15)]">
                  <Star size={26} className="text-emerald-400" />
                </div>
                <h2 className="text-base font-black uppercase tracking-tight italic">Hakem & Saha Değerlendirmesi</h2>
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">Organizasyon kalitesini oylayın</p>
              </div>

              {[
                { label: 'HAKEM PERFORMANSI', val: refRating, set: setRefRating, icon: Scale, color: 'text-blue-400' },
                { label: 'SAHA / ZEMİN KALİTESİ', val: pitchRating, set: setPitchRating, icon: Droplets, color: 'text-[#39FF14]' },
              ].map(({ label, val, set, icon: Icon, color }) => (
                <div key={label} className="bg-[#121620]/50 border border-white/5 rounded-[24px] p-5 flex flex-col gap-3.5 relative overflow-visible">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{label}</span>
                    <Icon size={16} className={color} />
                  </div>
                  <div className="flex gap-2 justify-center relative overflow-visible">
                    {[1,2,3,4,5].map(s => (
                      <motion.button 
                        key={s} 
                        whileHover={{ scale: 1.15 }} 
                        whileTap={{ scale: 0.9 }} 
                        onClick={(e) => {
                          if (navigator.vibrate) navigator.vibrate(20);
                          set(s);
                          triggerSparkles(e);
                        }}
                        className="p-1 relative overflow-visible"
                      >
                        <Star 
                          size={28} 
                          className={`transition-colors ${
                            s <= val 
                              ? 'text-[#39FF14] fill-[#39FF14] drop-shadow-[0_0_8px_rgba(57,255,20,0.5)]' 
                              : 'text-gray-800 hover:text-white/40'
                          }`} 
                        />
                      </motion.button>
                    ))}
                  </div>
                </div>
              ))}

              {/* Sparkle burst layer */}
              <div className="absolute inset-0 pointer-events-none overflow-visible">
                {sparkles.map(s => (
                  <Sparkle key={s.id} x={s.x} y={s.y} delay={s.delay} />
                ))}
              </div>

              {/* Feedback Textarea */}
              <div className="bg-[#121620]/50 border border-white/5 rounded-[24px] p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <MessageSquare size={14} className="text-gray-500" />
                  <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">ORGANİZASYON YORUMU (İSTEĞE BAĞLI)</span>
                </div>
                <textarea
                  className="w-full bg-black/40 border border-white/8 rounded-2xl p-4 text-xs text-white focus:outline-none focus:border-[#39FF14]/50 min-h-[96px] resize-none placeholder-gray-700 font-bold focus:shadow-[0_0_15px_rgba(57,255,20,0.05)] transition-all"
                  placeholder="Hakem kararları veya saha detayları hakkında eklemek istedikleriniz..."
                />
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <motion.button 
                  whileTap={{ scale: 0.98 }} 
                  onClick={() => setStep(2)}
                  className="flex-1 h-14 bg-white/5 border border-white/10 text-white font-black rounded-2xl text-xs uppercase tracking-widest flex items-center justify-center hover:bg-white/10"
                >
                  ← GERİ
                </motion.button>
                <motion.button 
                  whileTap={{ scale: 0.98 }} 
                  onClick={() => setShowResult(true)}
                  className="flex-[2] h-14 bg-gradient-to-r from-emerald-600 to-[#39FF14] text-black font-black rounded-2xl text-xs uppercase tracking-[0.2em] flex items-center justify-center shadow-[0_0_20px_rgba(57,255,20,0.2)] hover:shadow-[0_0_30px_rgba(57,255,20,0.3)] transition-all"
                >
                  DEĞERLENDİRMEYİ TAMAMLA ✓
                </motion.button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

    </div>
  );
};

export default PostMatchEval;
