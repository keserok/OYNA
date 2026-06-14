import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, AlertTriangle, Fingerprint, X, Trophy, Loader2, Award, Users } from 'lucide-react';
import { useAppStore } from '../../store';

interface ScoreEntryDrawerProps {
  matchId: string;
  homeTeamName: string;
  awayTeamName: string;
  matchTitle?: string;
  refereeAssigned?: boolean;
  enteredByRole?: 'OWNER' | 'REFEREE';
  onClose: () => void;
  onSubmitted?: () => void;
}

const ScoreEntryDrawer: React.FC<ScoreEntryDrawerProps> = ({
  matchId,
  homeTeamName,
  awayTeamName,
  matchTitle,
  refereeAssigned = false,
  enteredByRole = 'OWNER',
  onClose,
  onSubmitted
}) => {
  const { recordMatchScore } = useAppStore();
  const [homeScore, setHomeScore] = useState(0);
  const [awayScore, setAwayScore] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError(null);
    const result = await recordMatchScore(matchId, homeScore, awayScore, enteredByRole);
    setIsSubmitting(false);
    if (result.success) {
      setSubmitted(true);
      setTimeout(() => {
        onSubmitted?.();
        onClose();
      }, 1800);
    } else {
      setError(result.error || 'Skor gönderilemedi');
      setShowConfirm(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-[#0A0E14] border border-[#39FF14]/20 rounded-[32px] p-6 shadow-[0_0_60px_rgba(57,255,20,0.15)] relative overflow-hidden"
      >
        <div className="absolute top-[-20%] left-[-20%] w-40 h-40 bg-[#39FF14] opacity-5 blur-[60px] rounded-full pointer-events-none" />

        {/* HEADER */}
        <div className="flex items-center justify-between mb-6 border-b border-white/5 pb-4 relative z-10">
          <div className="flex items-center gap-3">
            <div className="bg-[#39FF14]/10 p-2.5 rounded-2xl border border-[#39FF14]/30">
              <Fingerprint className="w-6 h-6 text-[#39FF14]" />
            </div>
            <div className="flex flex-col">
              <span className="text-white/40 text-[10px] font-bold uppercase tracking-widest">
                Resmi Skor Otoritesi
              </span>
              <span className="text-white font-black italic tracking-tight">
                {enteredByRole === 'OWNER' ? 'TESİS SAHİBİ' : 'ATANMIŞ HAKEM'}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-400 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {!submitted ? (
          <>
            {/* Match Title */}
            {matchTitle && (
              <p className="text-center text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-4">
                {matchTitle}
              </p>
            )}

            {/* Score Input */}
            <div className="flex items-center justify-between gap-4 mb-6 relative z-10">
              {/* Home */}
              <div className="flex-1 flex flex-col items-center gap-3">
                <span className="text-white/60 font-bold uppercase tracking-widest text-[10px] text-center truncate w-full">
                  {homeTeamName}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setHomeScore(Math.max(0, homeScore - 1))}
                    disabled={isSubmitting}
                    className="w-10 h-10 rounded-xl bg-[#161B22] border border-white/5 text-white font-black text-xl hover:bg-white/10 active:scale-95 transition-all disabled:opacity-50"
                  >
                    −
                  </button>
                  <div className="w-16 h-20 rounded-2xl bg-black border border-white/10 flex items-center justify-center shadow-inner">
                    <span className="text-white font-black text-4xl">{homeScore}</span>
                  </div>
                  <button
                    onClick={() => setHomeScore(Math.min(99, homeScore + 1))}
                    disabled={isSubmitting}
                    className="w-10 h-10 rounded-xl bg-[#161B22] border border-white/5 text-white font-black text-xl hover:bg-white/10 active:scale-95 transition-all disabled:opacity-50"
                  >
                    +
                  </button>
                </div>
              </div>
              <span className="text-white/20 font-black italic text-xl shrink-0">VS</span>
              {/* Away */}
              <div className="flex-1 flex flex-col items-center gap-3">
                <span className="text-white/60 font-bold uppercase tracking-widest text-[10px] text-center truncate w-full">
                  {awayTeamName}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setAwayScore(Math.max(0, awayScore - 1))}
                    disabled={isSubmitting}
                    className="w-10 h-10 rounded-xl bg-[#161B22] border border-white/5 text-white font-black text-xl hover:bg-white/10 active:scale-95 transition-all disabled:opacity-50"
                  >
                    −
                  </button>
                  <div className="w-16 h-20 rounded-2xl bg-black border border-white/10 flex items-center justify-center shadow-inner">
                    <span className="text-white font-black text-4xl">{awayScore}</span>
                  </div>
                  <button
                    onClick={() => setAwayScore(Math.min(99, awayScore + 1))}
                    disabled={isSubmitting}
                    className="w-10 h-10 rounded-xl bg-[#161B22] border border-white/5 text-white font-black text-xl hover:bg-white/10 active:scale-95 transition-all disabled:opacity-50"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs font-bold">
                {error}
              </div>
            )}

            {/* Warning */}
            <div className="bg-[#1A0B0B]/60 border border-orange-500/20 rounded-2xl p-4 flex gap-3 mb-4 relative z-10">
              <Users className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
              <p className="text-orange-300/90 text-[10px] uppercase font-bold tracking-widest leading-relaxed">
                Skor girildiğinde her iki takım kaptanına anında bildirim gönderilecek. Her iki kaptan da
                onayladığında skor mühürlenir ve geri alınamaz.
              </p>
            </div>

            {/* Submit */}
            {!showConfirm ? (
              <button
                onClick={() => setShowConfirm(true)}
                disabled={isSubmitting}
                className="w-full bg-[#161B22] hover:bg-[#39FF14]/10 text-white hover:text-[#39FF14] border border-white/5 hover:border-[#39FF14]/50 py-4 rounded-2xl font-black uppercase tracking-widest transition-all duration-300 disabled:opacity-50"
              >
                Skoru Gönder ({homeScore} - {awayScore})
              </button>
            ) : (
              <div className="space-y-2">
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="w-full bg-[#39FF14] hover:bg-[#32e612] text-black border border-[#39FF14] py-4 rounded-2xl font-black uppercase tracking-widest transition-all shadow-[0_0_20px_rgba(57,255,20,0.4)] flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" /> GÖNDERİLİYOR
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-5 h-5" /> ONAYLIYORUM ({homeScore} - {awayScore})
                    </>
                  )}
                </button>
                <button
                  onClick={() => setShowConfirm(false)}
                  disabled={isSubmitting}
                  className="w-full py-3 rounded-xl text-gray-500 text-[10px] font-bold uppercase tracking-widest hover:text-white"
                >
                  Vazgeç
                </button>
              </div>
            )}
          </>
        ) : (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="py-8 text-center relative z-10"
          >
            <div className="w-20 h-20 rounded-full bg-[#39FF14]/10 border-2 border-[#39FF14] flex items-center justify-center mx-auto mb-4 shadow-[0_0_30px_rgba(57,255,20,0.3)]">
              <Trophy className="w-10 h-10 text-[#39FF14]" />
            </div>
            <h3 className="text-2xl font-black text-white italic mb-2">SKOR KAYDEDİLDİ</h3>
            <p className="text-4xl font-black text-[#39FF14] mb-4">
              {homeScore} - {awayScore}
            </p>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">
              Kaptan onayları bekleniyor
            </p>
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  );
};

export default ScoreEntryDrawer;
