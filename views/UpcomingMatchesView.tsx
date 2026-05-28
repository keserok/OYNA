import React, { useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Clock, MapPin, Calendar, Target, Zap, Shield, ChevronRight, Swords, User } from 'lucide-react';
import { AppView } from '../types';
import { useAppStore } from '../store';

interface UpcomingMatchesViewProps {
  onBack: () => void;
  onNavigate: (view: AppView) => void;
}

const CountdownBadge: React.FC<{ timeStr: string; dateStr: string; color: string }> = ({ timeStr, dateStr, color }) => {
  const [timeLeft, setTimeLeft] = useState({ h: 0, m: 0, s: 0 });

  useEffect(() => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    
    const interval = setInterval(() => {
      const now = new Date();
      const matchTime = new Date();
      matchTime.setHours(hours, minutes, 0, 0);
      
      let diff = matchTime.getTime() - now.getTime();
      if (diff < 0) {
        matchTime.setDate(matchTime.getDate() + 1);
        diff = matchTime.getTime() - now.getTime();
      }

      const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const m = Math.floor((diff / 1000 / 60) % 60);
      const s = Math.floor((diff / 1000) % 60);
      
      setTimeLeft({ h, m, s });
    }, 1000);
    
    return () => clearInterval(interval);
  }, [timeStr]);

  return (
    <div className="flex flex-col items-center justify-center px-4 py-2.5 bg-black/60 backdrop-blur-md rounded-xl border shadow-lg" style={{ borderColor: `${color}40` }}>
      <div className="flex items-center gap-1.5 mb-1.5 opacity-80">
        <Clock size={10} style={{ color }} />
        <span className="text-[9px] font-black uppercase tracking-[0.2em]" style={{ color }}>BAŞLAMASINA</span>
      </div>
      <div className="flex items-center gap-1 font-black tabular-nums tracking-widest text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]">
        <div className="flex flex-col items-center w-8">
          <span className="text-xl leading-none">{String(timeLeft.h).padStart(2, '0')}</span>
          <span className="text-[7px] text-white/50 mt-0.5">SAAT</span>
        </div>
        <span className="text-xl leading-none mb-3 animate-pulse" style={{ color }}>:</span>
        <div className="flex flex-col items-center w-8">
          <span className="text-xl leading-none">{String(timeLeft.m).padStart(2, '0')}</span>
          <span className="text-[7px] text-white/50 mt-0.5">DK</span>
        </div>
        <span className="text-xl leading-none mb-3 animate-pulse" style={{ color }}>:</span>
        <div className="flex flex-col items-center w-8">
          <span className="text-xl leading-none" style={{ color }}>{String(timeLeft.s).padStart(2, '0')}</span>
          <span className="text-[7px] text-white/50 mt-0.5">SN</span>
        </div>
      </div>
    </div>
  );
};

const UpcomingMatchesView: React.FC<UpcomingMatchesViewProps> = ({ onBack, onNavigate }) => {
  const { adminMatches, setActiveDraftId, setSelectedMatch } = useAppStore();

  const myDrafts = useMemo(() => adminMatches.filter(m => m.status === 'DRAFT'), [adminMatches]);
  const myUpcomingMatches = useMemo(() => adminMatches.filter(m => m.status !== 'DRAFT'), [adminMatches]);

  return (
    <div className="min-h-screen bg-[#0A0E14] text-white flex flex-col relative font-sans selection:bg-[#FFFF00] selection:text-black">
      {/* ── ARKA PLAN ── */}
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20 mix-blend-overlay pointer-events-none" />

      {/* 1. Header */}
      <header className="sticky top-0 z-30 bg-[#0A0E14]/90 backdrop-blur-xl border-b border-white/5 pt-safe">
        <div className="p-4 pb-3 flex items-center justify-between relative z-10">
          <button 
            onClick={onBack} 
            className="p-2 bg-[#161B22] rounded-full text-white border border-white/5 hover:bg-white/10 transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-black text-white italic uppercase tracking-tighter leading-none drop-shadow-lg text-center">Sıradaki Maçların</h1>
            <p className="text-[10px] text-gray-500 text-center uppercase tracking-widest mt-0.5">Maç & Kadro Merkezi</p>
          </div>
          <div className="w-10 h-10"></div> {/* Spacer for symmetry */}
        </div>
      </header>

      <main className="flex-1 p-4 overflow-y-auto space-y-10 custom-scrollbar pb-24 relative z-10">
        
        {/* DRAFT TALEPLERİ */}
        {myDrafts.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center gap-2 px-1">
              <Target size={16} className="text-[#FFFF00]" />
              <h2 className="text-sm font-black text-white italic uppercase tracking-widest">KADRO KURULUMU BEKLEYENLER</h2>
            </div>
            
            <div className="space-y-6">
              {myDrafts.map((match, index) => {
                const glowColor = '#FFFF00';
                const totalSlots = match.slots.length;
                const filledSlots = match.slots.filter(s => s.status === 'TAKEN').length;
                const isSquadFull = filledSlots === totalSlots;
                
                return (
                  <motion.div
                    key={match.id}
                    layout
                    initial={{ opacity: 0, y: 30, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.5, delay: index * 0.1, type: 'spring', damping: 25 }}
                    onClick={() => {
                      setActiveDraftId(match.id);
                      onNavigate('MATCH_CREATE');
                    }}
                    className="relative w-full h-[420px] rounded-[32px] overflow-hidden cursor-pointer group shadow-2xl"
                  >
                    {/* Arka Plan Posteri */}
                    <img src={match.image} className="absolute inset-0 w-full h-full object-cover transition-transform duration-[2s] ease-out group-hover:scale-110" alt={match.title} referrerPolicy="no-referrer" />
                    
                    {/* Renk Tonu ve Güçlü Karartma (Gradient) */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-transparent" />
                    <div className="absolute inset-0 bg-gradient-to-b from-black/60 to-transparent" />
                    <div className="absolute inset-0 opacity-20 mix-blend-overlay" style={{ background: `radial-gradient(circle at center, transparent 0%, ${glowColor} 100%)` }} />
                    
                    {/* Karizma Sınır Çizgisi (İç Glow) */}
                    <div className="absolute inset-0 border-[1.5px] rounded-[32px] pointer-events-none transition-all duration-500" style={{ borderColor: `${glowColor}50`, boxShadow: `inset 0 0 30px ${glowColor}20` }} />

                    {/* ── ÜST KISIM (GERİ SAYIM) ── */}
                    <div className="absolute top-5 left-5 z-20">
                      <CountdownBadge timeStr={match.time} dateStr={match.date} color={glowColor} />
                    </div>
                    
                    {/* ── SAĞ ÜST (DRAFT BADGE) ── */}
                    <div className="absolute top-5 right-5 z-20">
                       <div className="px-3 py-1.5 bg-[#FFFF00]/20 backdrop-blur-xl border border-[#FFFF00]/50 rounded-xl shadow-[0_0_25px_rgba(255,255,0,0.3)]">
                         <span className="text-[10px] font-black italic uppercase tracking-widest text-[#FFFF00] drop-shadow-[0_0_10px_rgba(255,255,0,0.8)]">DRAFT</span>
                       </div>
                    </div>

                    {/* ── ORTA/ALT KISIM (DURUM PANELLERİ) ── */}
                    <div className="absolute bottom-0 left-0 right-0 p-5 z-20 flex flex-col gap-4">
                      
                      {/* STATUS GRID */}
                      <div className="grid grid-cols-2 gap-3">
                        {/* KADRO DURUMU */}
                        <div className={`p-3 rounded-2xl border backdrop-blur-md flex flex-col justify-center items-center gap-1 ${isSquadFull ? 'bg-[#39FF14]/10 border-[#39FF14]/30' : 'bg-[#f97316]/10 border-[#f97316]/30'}`}>
                          <div className="flex items-center gap-1.5">
                            <User size={12} className={isSquadFull ? 'text-[#39FF14]' : 'text-[#f97316] animate-pulse'} />
                            <span className="text-[9px] font-black uppercase tracking-widest text-white/80">Kadro Durumu</span>
                          </div>
                          <span className={`text-base font-black tracking-tighter italic ${isSquadFull ? 'text-[#39FF14]' : 'text-[#f97316]'}`}>
                            {filledSlots} / {totalSlots}
                          </span>
                          <span className="text-[8px] font-bold text-white/50 uppercase tracking-widest mt-0.5">
                            {isSquadFull ? 'Kadro Tamam' : 'Oyuncu Bekleniyor'}
                          </span>
                        </div>

                        {/* RAKİP DURUMU */}
                        <div className="p-3 rounded-2xl border bg-[#ef4444]/10 border-[#ef4444]/30 backdrop-blur-md flex flex-col justify-center items-center gap-1">
                          <div className="flex items-center gap-1.5">
                            <Swords size={12} className="text-[#ef4444] animate-pulse" />
                            <span className="text-[9px] font-black uppercase tracking-widest text-white/80">Rakip Durumu</span>
                          </div>
                          <span className="text-base font-black tracking-tighter italic text-[#ef4444]">ARANIYOR</span>
                          <span className="text-[8px] font-bold text-white/50 uppercase tracking-widest mt-0.5">Eşleştirme Aktif</span>
                        </div>
                      </div>

                      {/* LOKASYON VE BUTON */}
                      <div className="flex items-end justify-between gap-4 mt-2">
                        <div className="flex-1 bg-black/40 backdrop-blur-xl p-3 rounded-2xl border border-white/10">
                          <h3 className="text-xl font-black text-white italic uppercase leading-[1] tracking-tighter drop-shadow-[0_4px_15px_rgba(0,0,0,1)] mb-1">
                            {match.title.replace(' Maçı', '')}
                          </h3>
                          
                          <div className="flex items-center gap-3">
                            <span className="flex items-center gap-1 text-[10px] text-white/70 font-bold uppercase tracking-widest">
                              <MapPin size={10} className="text-[#FFFF00]" />
                              {match.location}
                            </span>
                            <span className="flex items-center gap-1 text-[10px] text-white/70 font-bold uppercase tracking-widest">
                              <Calendar size={10} className="text-[#FFFF00]" />
                              {match.date}
                            </span>
                          </div>
                        </div>

                        {/* Git Butonu */}
                        <motion.button 
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          className="shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center backdrop-blur-xl border border-white/20 transition-all group-hover:bg-white/10"
                          style={{ background: 'rgba(255,255,255,0.05)', boxShadow: `0 0 30px ${glowColor}20` }}
                        >
                          <ChevronRight size={24} className="text-[#FFFF00] drop-shadow-lg group-hover:translate-x-1 transition-transform" />
                        </motion.button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </section>
        )}

        {/* AKTİF MAÇLAR */}
        {myUpcomingMatches.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center gap-2 px-1">
              <Zap size={16} className="text-[#39FF14]" />
              <h2 className="text-sm font-black text-white italic uppercase tracking-widest">YAKLAŞAN MAÇLARIN</h2>
            </div>
            
            <div className="space-y-6">
              {myUpcomingMatches.map((match, index) => {
                const glowColor = '#39FF14';
                const totalSlots = match.slots.length;
                const filledSlots = match.slots.filter(s => s.status === 'TAKEN').length;
                const isSquadFull = filledSlots === totalSlots;
                
                return (
                  <motion.div
                    key={match.id}
                    layout
                    initial={{ opacity: 0, y: 30, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.5, delay: index * 0.1, type: 'spring', damping: 25 }}
                    onClick={() => {
                      setSelectedMatch(match);
                      onNavigate('MATCH_JOIN');
                    }}
                    className="relative w-full h-[420px] rounded-[32px] overflow-hidden cursor-pointer group shadow-2xl"
                  >
                    {/* Arka Plan Posteri */}
                    <img src={match.image} className="absolute inset-0 w-full h-full object-cover transition-transform duration-[2s] ease-out group-hover:scale-110" alt={match.title} referrerPolicy="no-referrer" />
                    
                    {/* Renk Tonu ve Güçlü Karartma (Gradient) */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-transparent" />
                    <div className="absolute inset-0 bg-gradient-to-b from-black/60 to-transparent" />
                    <div className="absolute inset-0 opacity-20 mix-blend-overlay" style={{ background: `radial-gradient(circle at center, transparent 0%, ${glowColor} 100%)` }} />
                    
                    {/* Karizma Sınır Çizgisi (İç Glow) */}
                    <div className="absolute inset-0 border-[1.5px] rounded-[32px] pointer-events-none transition-all duration-500" style={{ borderColor: `${glowColor}40`, boxShadow: `inset 0 0 30px ${glowColor}15` }} />

                    {/* ── ÜST KISIM (GERİ SAYIM) ── */}
                    <div className="absolute top-5 left-5 z-20">
                      <CountdownBadge timeStr={match.time} dateStr={match.date} color={glowColor} />
                    </div>

                    {/* ── SAĞ ÜST (VİP ETİKETİ) ── */}
                    <div className="absolute top-5 right-5 z-20">
                      {match.price === 0 ? (
                        <div className="px-3 py-1.5 bg-[#39FF14]/20 backdrop-blur-xl border border-[#39FF14]/50 rounded-xl shadow-[0_0_25px_rgba(57,255,20,0.3)]">
                          <span className="text-[10px] font-black italic uppercase tracking-widest text-[#39FF14] drop-shadow-[0_0_10px_rgba(57,255,20,0.8)]">ÜCRETSİZ</span>
                        </div>
                      ) : (
                        <div className="px-3 py-1.5 bg-black/60 backdrop-blur-md border border-white/10 rounded-xl">
                          <span className="text-[13px] font-black text-white drop-shadow-md">{match.price} ₺</span>
                        </div>
                      )}
                    </div>

                    {/* ── ORTA/ALT KISIM (DURUM PANELLERİ) ── */}
                    <div className="absolute bottom-0 left-0 right-0 p-5 z-20 flex flex-col gap-4">
                      
                      {/* STATUS GRID */}
                      <div className="grid grid-cols-2 gap-3">
                        {/* KADRO DURUMU */}
                        <div className={`p-3 rounded-2xl border backdrop-blur-md flex flex-col justify-center items-center gap-1 ${isSquadFull ? 'bg-[#39FF14]/10 border-[#39FF14]/30' : 'bg-[#f97316]/10 border-[#f97316]/30'}`}>
                          <div className="flex items-center gap-1.5">
                            <Shield size={12} className={isSquadFull ? 'text-[#39FF14]' : 'text-[#f97316] animate-pulse'} />
                            <span className="text-[9px] font-black uppercase tracking-widest text-white/80">Kadro Durumu</span>
                          </div>
                          <span className={`text-base font-black tracking-tighter italic ${isSquadFull ? 'text-[#39FF14]' : 'text-[#f97316]'}`}>
                            {filledSlots} / {totalSlots}
                          </span>
                          <span className="text-[8px] font-bold text-white/50 uppercase tracking-widest mt-0.5">
                            {isSquadFull ? 'Kadro Tamam' : 'Oyuncu Bekleniyor'}
                          </span>
                        </div>

                        {/* RAKİP DURUMU */}
                        <div className="p-3 rounded-2xl border bg-black/40 border-white/10 backdrop-blur-md flex flex-col justify-center items-center gap-1">
                          <div className="flex items-center gap-1.5">
                            <Swords size={12} className="text-white/60" />
                            <span className="text-[9px] font-black uppercase tracking-widest text-white/80">Rakip Durumu</span>
                          </div>
                          <span className="text-base font-black tracking-tighter italic text-white/80">BEKLENİYOR</span>
                          <span className="text-[8px] font-bold text-white/50 uppercase tracking-widest mt-0.5">Eşleştirme Pasif</span>
                        </div>
                      </div>

                      {/* LOKASYON VE BUTON */}
                      <div className="flex items-end justify-between gap-4 mt-2">
                        <div className="flex-1 bg-black/40 backdrop-blur-xl p-3 rounded-2xl border border-white/10">
                          <h3 className="text-xl font-black text-white italic uppercase leading-[1] tracking-tighter drop-shadow-[0_4px_15px_rgba(0,0,0,1)] mb-1">
                            {match.title}
                          </h3>
                          
                          <div className="flex items-center gap-3">
                            <span className="flex items-center gap-1 text-[10px] text-white/70 font-bold uppercase tracking-widest">
                              <MapPin size={10} className="text-[#39FF14]" />
                              {match.location}
                            </span>
                            <span className="flex items-center gap-1 text-[10px] text-white/70 font-bold uppercase tracking-widest">
                              <Calendar size={10} className="text-[#39FF14]" />
                              {match.date}
                            </span>
                          </div>
                        </div>

                        {/* Git Butonu */}
                        <motion.button 
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          className="shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center backdrop-blur-xl border border-white/20 transition-all group-hover:bg-white/10"
                          style={{ background: 'rgba(255,255,255,0.05)', boxShadow: `0 0 30px ${glowColor}20` }}
                        >
                          <ChevronRight size={24} className="text-white drop-shadow-lg group-hover:translate-x-1 transition-transform" />
                        </motion.button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </section>
        )}

        {myDrafts.length === 0 && myUpcomingMatches.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-center px-4 relative z-10">
            <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4 border border-white/10">
              <Calendar size={32} className="text-[#39FF14]/50" />
            </div>
            <h3 className="text-lg font-black italic uppercase text-white mb-2 drop-shadow-lg">Maç Bulunamadı</h3>
            <p className="text-xs text-white/50 tracking-widest uppercase">Henüz planlanmış veya yaklaşan bir maçınız bulunmuyor.</p>
          </div>
        )}

      </main>
    </div>
  );
};

export default UpcomingMatchesView;
