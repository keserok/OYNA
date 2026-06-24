
import React, { useState, useEffect } from 'react';
import { ArrowLeft, Award, Crown } from 'lucide-react';
import { Player } from '../types';
import { auth } from '../supabaseAuth';
import { fetchMyTeams } from '../services/teamService';
import { LoadingState, ErrorState, EmptyState } from '../components/common/StatusState';

interface VotingScreenProps {
  onBack: () => void;
  onComplete: () => void;
}

const VotingScreen: React.FC<VotingScreenProps> = ({ onBack, onComplete }) => {
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [roster, setRoster] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const uid = auth.currentUser?.uid;

  const loadRoster = async () => {
    if (!uid) {
      setError('Oturum bulunamadı.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const teams = await fetchMyTeams(uid);
      setRoster(teams[0]?.roster || []);
    } catch (err) {
      console.error('VotingScreen fetch:', err);
      setError('Kadro yüklenemedi. Lütfen tekrar dene.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRoster();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  // Maçın adamı oylamasında kendine oy verilemez
  const votablePlayers = roster.filter(p => p.id !== uid);

  const handleVote = () => {
      setIsSubmitting(true);
      setTimeout(() => {
          onComplete();
      }, 1500);
  };


  return (
    <div className="min-h-screen bg-[#0A0E14] flex flex-col p-6">
       <header className="flex items-center gap-4 mb-8">
           <button onClick={onBack} className="p-3 bg-[#161B22] rounded-full text-white hover:bg-gray-800 transition-colors">
               <ArrowLeft size={20} />
           </button>
           <div>
               <h1 className="text-xl font-black text-white">MAÇIN ADAMI</h1>
               <p className="text-xs text-gray-400">Sahada kim parladı? Maçın adamını seç.</p>
           </div>
       </header>

       <div className="flex-1 space-y-4 overflow-y-auto custom-scrollbar">
           {loading ? (
               <LoadingState message="Kadro yükleniyor..." />
           ) : error ? (
               <ErrorState message={error} onRetry={loadRoster} />
           ) : votablePlayers.length === 0 ? (
               <EmptyState title="Oy Verilecek Oyuncu Yok" message="Kadronuzda oy verebileceğiniz başka oyuncu bulunmuyor." />
           ) : votablePlayers.map(player => {
               const isSelected = selectedPlayerId === player.id;
               return (
                   <div
                     key={player.id}
                     onClick={() => setSelectedPlayerId(player.id)}
                     className={`relative p-4 rounded-[24px] border-2 transition-all cursor-pointer flex items-center gap-4 group ${
                         isSelected
                         ? 'bg-[#FFFF00]/10 border-[#FFFF00] shadow-[0_0_20px_rgba(255,255,0,0.2)]'
                         : 'bg-[#161B22] border-white/5 hover:border-white/20'
                     }`}
                   >
                       <div className="relative">
                           <img src={player.avatar} className="w-16 h-16 rounded-full object-cover bg-gray-700" alt={player.name} />
                           {isSelected && (
                               <div className="absolute -bottom-1 -right-1 bg-[#FFFF00] text-black p-1 rounded-full animate-bounce">
                                   <Crown size={14} fill="black" />
                               </div>
                           )}
                       </div>

                       <div className="flex-1">
                           <h3 className={`text-lg font-black ${isSelected ? 'text-[#FFFF00]' : 'text-white'}`}>{player.name}</h3>
                           <div className="flex items-center gap-2 mt-1">
                               <div className="text-[10px] text-gray-500 font-bold px-2 py-0.5 bg-white/5 rounded-md">
                                   Match Rating: {player.rating}
                               </div>
                           </div>
                       </div>

                       <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all ${
                           isSelected
                           ? 'bg-[#FFFF00] border-[#FFFF00]'
                           : 'border-gray-600 group-hover:border-gray-400'
                       }`}>
                           {isSelected && <div className="w-3 h-3 bg-black rounded-full"></div>}
                       </div>
                   </div>
               );
           })}
       </div>

       <div className="mt-6">
           <button 
             disabled={!selectedPlayerId || isSubmitting}
             onClick={handleVote}
             className="w-full h-16 bg-[#FFFF00] disabled:bg-gray-800 disabled:text-gray-500 text-black font-black text-lg rounded-2xl flex items-center justify-center gap-2 hover:bg-yellow-300 transition-all active:scale-95 shadow-lg shadow-yellow-900/20"
           >
               {isSubmitting ? 'OY GÖNDERİLİYOR...' : 'OYUNU KULLAN'}
               {!isSubmitting && <Award size={20} />}
           </button>
       </div>
    </div>
  );
};

export default VotingScreen;
