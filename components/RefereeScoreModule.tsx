import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, Target, AlertTriangle, Fingerprint } from 'lucide-react';

interface RefereeScoreModuleProps {
  matchId: string;
  homeTeamName: string;
  awayTeamName: string;
  refereeName: string;
  onSubmitScore: (homeScore: number, awayScore: number) => void;
}

export const RefereeScoreModule: React.FC<RefereeScoreModuleProps> = ({
  matchId,
  homeTeamName,
  awayTeamName,
  refereeName,
  onSubmitScore
}) => {
  const [homeScore, setHomeScore] = useState<number>(0);
  const [awayScore, setAwayScore] = useState<number>(0);
  const [isConfirming, setIsConfirming] = useState(false);

  const handleFinalSubmit = () => {
    onSubmitScore(homeScore, awayScore);
    alert('SKOR ONAYLANDI: Elmas ve Karat motorları tetiklendi!');
  };

  return (
    <div className="w-full max-w-md bg-[#0A0E14] border border-[#39FF14]/20 rounded-[32px] p-6 shadow-[0_0_40px_rgba(57,255,20,0.05)] relative overflow-hidden">
      
      {/* Background Ambience */}
      <div className="absolute top-[-20%] left-[-20%] w-40 h-40 bg-[#39FF14] opacity-5 blur-[60px] rounded-full pointer-events-none" />
      
      {/* Header */}
      <div className="flex items-center justify-between mb-8 border-b border-white/5 pb-4">
        <div className="flex items-center gap-3">
          <div className="bg-[#39FF14]/10 p-2.5 rounded-2xl border border-[#39FF14]/30">
            <Fingerprint className="w-6 h-6 text-[#39FF14]" />
          </div>
          <div className="flex flex-col">
            <span className="text-white/40 text-[10px] font-bold uppercase tracking-widest">Resmi Hakem Paneli</span>
            <span className="text-white font-black italic tracking-tight">{refereeName}</span>
          </div>
        </div>
        <div className="bg-[#161B22] px-3 py-1.5 rounded-lg border border-white/5 flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#39FF14] animate-pulse" />
          <span className="text-[#39FF14] text-[9px] font-bold uppercase tracking-widest mt-0.5">Otorite Aktif</span>
        </div>
      </div>

      {/* Score Input Area */}
      <div className="flex items-center justify-between gap-4 mb-8">
        
        {/* Home Team */}
        <div className="flex-1 flex flex-col items-center gap-3">
          <span className="text-white/60 font-bold uppercase tracking-widest text-[10px] text-center">{homeTeamName}</span>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setHomeScore(Math.max(0, homeScore - 1))}
              className="w-10 h-10 rounded-xl bg-[#161B22] border border-white/5 text-white font-black text-xl hover:bg-white/10 active:scale-95 transition-all"
            >-</button>
            <div className="w-16 h-20 rounded-2xl bg-black border border-white/10 flex items-center justify-center shadow-inner">
              <span className="text-white font-black text-4xl">{homeScore}</span>
            </div>
            <button 
              onClick={() => setHomeScore(homeScore + 1)}
              className="w-10 h-10 rounded-xl bg-[#161B22] border border-white/5 text-white font-black text-xl hover:bg-white/10 active:scale-95 transition-all"
            >+</button>
          </div>
        </div>

        {/* VS */}
        <div className="flex flex-col items-center justify-center">
          <span className="text-white/20 font-black italic text-xl">VS</span>
        </div>

        {/* Away Team */}
        <div className="flex-1 flex flex-col items-center gap-3">
          <span className="text-white/60 font-bold uppercase tracking-widest text-[10px] text-center">{awayTeamName}</span>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setAwayScore(Math.max(0, awayScore - 1))}
              className="w-10 h-10 rounded-xl bg-[#161B22] border border-white/5 text-white font-black text-xl hover:bg-white/10 active:scale-95 transition-all"
            >-</button>
            <div className="w-16 h-20 rounded-2xl bg-black border border-white/10 flex items-center justify-center shadow-inner">
              <span className="text-white font-black text-4xl">{awayScore}</span>
            </div>
            <button 
              onClick={() => setAwayScore(awayScore + 1)}
              className="w-10 h-10 rounded-xl bg-[#161B22] border border-white/5 text-white font-black text-xl hover:bg-white/10 active:scale-95 transition-all"
            >+</button>
          </div>
        </div>

      </div>

      {/* Warning & Submit */}
      <div className="flex flex-col gap-4">
        <div className="bg-[#1A0B0B]/60 border border-red-500/20 rounded-2xl p-4 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
          <p className="text-red-500/80 text-[10px] uppercase font-bold tracking-widest leading-relaxed">
            DİKKAT: Hakem skoru mühürlediğinde maç biter. Geri alınamaz. Takım Karat'ları ve Elmas'lar anında güncellenir.
          </p>
        </div>

        {!isConfirming ? (
          <button 
            onClick={() => setIsConfirming(true)}
            className="w-full bg-[#161B22] hover:bg-[#39FF14]/10 text-white hover:text-[#39FF14] border border-white/5 hover:border-[#39FF14]/50 py-4 rounded-2xl font-black uppercase tracking-widest transition-all duration-300"
          >
            Skoru Mühürle
          </button>
        ) : (
          <motion.button 
            initial={{ scale: 0.95 }}
            animate={{ scale: 1 }}
            onClick={handleFinalSubmit}
            className="w-full bg-[#39FF14] hover:bg-[#32e612] text-black border border-[#39FF14] py-4 rounded-2xl font-black uppercase tracking-widest transition-all shadow-[0_0_20px_rgba(57,255,20,0.4)] flex items-center justify-center gap-2"
          >
            <ShieldCheck className="w-5 h-5" />
            ONAYLIYORUM (BİTİR)
          </motion.button>
        )}
      </div>

    </div>
  );
};
