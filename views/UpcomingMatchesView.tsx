import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Clock } from 'lucide-react';
import { AppView } from '../types';
import { useAppStore } from '../store';
import { useMyMatches } from '../hooks/useMyMatches';
import { MatchJoinCard } from '../components/MatchJoinCard';

interface UpcomingMatchesViewProps {
  onBack: () => void;
  onNavigate: (view: AppView) => void;
}

const UpcomingMatchesView: React.FC<UpcomingMatchesViewProps> = ({ onBack, onNavigate }) => {
  const { setSelectedMatch } = useAppStore();
  const { upcoming: sortedActiveMatches, cancelled: cancelledMatches, currentUserUid } = useMyMatches();
  const [activeTab, setActiveTab] = useState<'UPCOMING' | 'CANCELLED'>('UPCOMING');

  const displayList = activeTab === 'UPCOMING' ? sortedActiveMatches : cancelledMatches;

  return (
    <div className="min-h-screen bg-[#0A0E14] text-white flex flex-col relative font-sans selection:bg-[#FACC15] selection:text-black">
      {/* Background overlay */}
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-15 mix-blend-overlay pointer-events-none" />

      {/* Header */}
      <header className="sticky top-0 z-30 bg-[#0A0E14]/90 backdrop-blur-xl border-b border-white/5 pt-safe">
        <div className="p-4 pb-3 flex items-center justify-between relative z-10 gap-3">
          <button 
            onClick={onBack} 
            className="p-2 bg-[#161B22] rounded-full text-white border border-white/5 hover:bg-white/10 transition-colors shrink-0"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="text-center flex-1 min-w-0">
            <h1 className="text-base sm:text-lg font-black text-white italic uppercase tracking-tighter leading-none drop-shadow-lg truncate">Sıradaki Maçlarım</h1>
            <p className="text-[9px] text-gray-500 uppercase tracking-widest mt-1 truncate">Kadro & Maç Lobisi Merkezi</p>
          </div>
          
          {/* Small top-right toggle button for Cancelled Matches */}
          <button
            onClick={() => setActiveTab(activeTab === 'UPCOMING' ? 'CANCELLED' : 'UPCOMING')}
            className={`px-2.5 py-1.5 rounded-xl border text-[9px] font-black italic uppercase tracking-wider transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
              activeTab === 'CANCELLED'
                ? 'bg-[#ef4444] text-white border-[#ef4444] shadow-[0_0_12px_rgba(239,68,68,0.3)]'
                : 'bg-[#161B22] text-red-500 border-[#ef4444]/35 hover:border-[#ef4444]/60'
            }`}
          >
            <div className={`w-1.5 h-1.5 rounded-full ${activeTab === 'CANCELLED' ? 'bg-white animate-pulse' : 'bg-[#ef4444]'}`} />
            <span>İptal Olanlar</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-4 overflow-y-auto space-y-4 custom-scrollbar pb-24 relative z-10">
        <AnimatePresence mode="wait">
          {displayList.length > 0 ? (
            <motion.div 
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              {displayList.map((match, index) => (
                <motion.div
                  key={match.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.06 }}
                >
                  <MatchJoinCard
                    match={match}
                    currentUserUid={currentUserUid}
                    onOpenLobby={() => {
                      useAppStore.getState().setLobbyMode('MANAGE');
                      setSelectedMatch(match);
                      onNavigate('MATCH_JOIN');
                    }}
                  />
                </motion.div>
              ))}
            </motion.div>
          ) : (
            <motion.div 
              key={`empty-${activeTab}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col items-center justify-center h-64 text-center px-4 relative z-10"
            >
              <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4 border border-white/10">
                <Clock size={32} className={`${activeTab === 'UPCOMING' ? 'text-[#FACC15]/40' : 'text-[#ef4444]/40'}`} />
              </div>
              <h3 className="text-lg font-black italic uppercase text-white mb-2 drop-shadow-lg">Maç Bulunamadı</h3>
              <p className="text-xs text-white/50 tracking-widest uppercase">
                {activeTab === 'UPCOMING' ? 'Yaklaşan aktif bir maçınız bulunmuyor.' : 'İptal edilmiş bir maçınız bulunmuyor.'}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
};

export default UpcomingMatchesView;
