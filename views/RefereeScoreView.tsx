import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, AlertCircle, Trophy, Loader2, ShieldCheck } from 'lucide-react';
import { RefereeScoreModule } from '../components/RefereeScoreModule';
import { useAppStore } from '../store';
import { fbGetMatchDetail } from '../supabaseMutations';
import { auth } from '../supabaseAuth';

interface RefereeScoreViewProps {
  onBack: () => void;
  matchId?: string;  // Optional - bildirimden gelirse
}

const RefereeScoreView: React.FC<RefereeScoreViewProps> = ({ onBack, matchId: propMatchId }) => {
  const { adminMatches, recordMatchScore, adminUsers } = useAppStore() as any;
  const authUid = auth.currentUser?.uid;
  const currentUser = adminUsers?.find((u: any) => u.id === authUid);
  const [match, setMatch] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);

  // Hakemin bekleyen maçları
  const myRefereedMatches = adminMatches.filter((m: any) => {
    return m.refereeId && (!m.scoreEnteredAt || m.scoreEnteredRole !== 'REFEREE');
  });

  const targetMatchId = propMatchId || myRefereedMatches[0]?.id;

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      if (!targetMatchId) {
        setLoading(false);
        return;
      }
      // Önce local'den dene
      const local = adminMatches.find((m: any) => m.id === targetMatchId);
      if (local) {
        setMatch(local);
        setLoading(false);
        return;
      }
      // Sonra DB'den
      const detail = await fbGetMatchDetail(targetMatchId);
      setMatch(detail);
      setLoading(false);
    };
    load();
  }, [targetMatchId, adminMatches]);

  const handleSubmit = async (home: number, away: number) => {
    if (!match) return;
    const result = await recordMatchScore(match.id, home, away, 'REFEREE');
    if (result.success) {
      setSubmitted(true);
      setTimeout(() => onBack(), 2500);
    } else {
      alert('Skor gönderilemedi: ' + result.error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0E14] flex items-center justify-center">
        <Loader2 className="animate-spin text-[#39FF14]" size={32} />
      </div>
    );
  }

  if (!match) {
    return (
      <div className="min-h-screen bg-[#0A0E14] text-white flex flex-col">
        <header className="px-5 py-4 border-b border-white/5 flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-11 h-11 rounded-2xl bg-[#161B22] hover:bg-white/10 border border-white/5 flex items-center justify-center"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-lg font-black italic uppercase">Hakem Skor Paneli</h1>
        </header>
        <div className="flex-1 flex items-center justify-center p-6 text-center">
          <div>
            <AlertCircle size={48} className="text-gray-600 mx-auto mb-4" />
            <p className="text-white font-bold mb-2">Atanmış maç bulunmuyor</p>
            <p className="text-xs text-gray-500">
              Hakem olarak atandığınız bir maç görüldüğünde burada görünecek.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-[#0A0E14] flex items-center justify-center p-6">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center"
        >
          <div className="w-24 h-24 rounded-full bg-[#39FF14]/10 border-2 border-[#39FF14] flex items-center justify-center mx-auto mb-6 shadow-[0_0_40px_rgba(57,255,20,0.4)]">
            <ShieldCheck className="w-12 h-12 text-[#39FF14]" />
          </div>
          <h2 className="text-2xl font-black text-white italic mb-2">SKOR MÜHÜRLENDİ</h2>
          <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">
            Kaptan onayları bekleniyor
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0E14] text-white flex flex-col">
      <header className="px-5 py-4 border-b border-white/5 flex items-center gap-3 sticky top-0 z-20 bg-[#0A0E14]/95 backdrop-blur-2xl">
        <button
          onClick={onBack}
          className="w-11 h-11 rounded-2xl bg-[#161B22] hover:bg-white/10 border border-white/5 flex items-center justify-center"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-lg font-black italic uppercase tracking-tight">Hakem Skor Paneli</h1>
          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-0.5">
            {match.title || 'Maç'}
          </p>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center p-6">
        <RefereeScoreModule
          matchId={match.id}
          homeTeamName={match.homeTeamName || 'Ev Sahibi'}
          awayTeamName={match.awayTeamName || 'Deplasman'}
          refereeName={currentUser?.name || 'Hakem'}
          onSubmitScore={handleSubmit}
        />
      </div>
    </div>
  );
};

export default RefereeScoreView;
