import React from 'react';
import { ArrowLeft, Trophy, Calendar, Clock, MapPin } from 'lucide-react';
import { motion } from 'framer-motion';

interface Match {
  id: string;
  teamA: string;
  teamB: string;
  scoreA: number;
  scoreB: number;
  date: string;
  time: string;
  pitch: string;
}

interface MatchesViewProps {
  onBack: () => void;
  matches: Match[];
}

const MatchesView: React.FC<MatchesViewProps> = ({ onBack, matches }) => {
  return (
    <div className="min-h-screen bg-[#0A0E14] text-white flex flex-col">
      {/* Header */}
      <div className="p-6 flex items-center justify-between border-b border-white/5 bg-[#161B22]/50 backdrop-blur-xl sticky top-0 z-50">
        <button onClick={onBack} className="p-2 hover:bg-white/5 rounded-full transition-colors">
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-lg font-bold italic tracking-tight uppercase">MAÇLAR</h1>
        <div className="w-10"></div>
      </div>

      <div className="flex-1 p-6">
        {matches.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[60vh] text-center">
            <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center mb-4">
              <Trophy size={40} className="text-gray-600" />
            </div>
            <h3 className="text-xl font-bold mb-2">Henüz Maç Yok</h3>
            <p className="text-gray-500 text-sm max-w-[250px]">
              Skor girildiğinde tamamlanan maçlar burada listelenecektir.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {matches.map((match, idx) => (
              <motion.div
                key={match.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                className="bg-[#161B22] rounded-3xl border border-white/10 p-5 overflow-hidden relative group"
              >
                {/* Background Glow */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 blur-3xl rounded-full -mr-16 -mt-16 group-hover:bg-blue-500/10 transition-colors"></div>

                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                    <Calendar size={12} />
                    {match.date}
                    <span className="mx-1">•</span>
                    <Clock size={12} />
                    {match.time}
                  </div>
                  <div className="px-2 py-1 rounded-lg bg-green-500/10 text-green-400 text-[10px] font-black uppercase tracking-tighter">
                    TAMAMLANDI
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 text-center">
                    <div className="text-sm font-black italic mb-1 truncate">{match.teamA}</div>
                    <div className="text-[10px] font-bold text-gray-500 uppercase">EV SAHİBİ</div>
                  </div>

                  <div className="flex items-center gap-4">
                    <span className="text-3xl font-black italic text-white">{match.scoreA}</span>
                    <div className="w-px h-8 bg-white/10"></div>
                    <span className="text-3xl font-black italic text-white">{match.scoreB}</span>
                  </div>

                  <div className="flex-1 text-center">
                    <div className="text-sm font-black italic mb-1 truncate">{match.teamB}</div>
                    <div className="text-[10px] font-bold text-gray-500 uppercase">DEPLASMAN</div>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-white/5 flex items-center gap-2 text-[10px] font-bold text-gray-500 uppercase">
                  <MapPin size={12} className="text-blue-400" />
                  {match.pitch}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MatchesView;
