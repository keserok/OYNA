import React, { useState } from 'react';
import { ArrowLeft, Users, RefreshCw } from 'lucide-react';
import { Player, AppView } from '../types';
import { MOCK_FRIENDS } from '../constants';

interface TeamBuilderProps {
  onBack: () => void;
}

export const TeamBuilder: React.FC<TeamBuilderProps> = ({ onBack }) => {
  const [selectedPlayers, setSelectedPlayers] = useState<Player[]>([]);
  const [teamA, setTeamA] = useState<Player[]>([]);
  const [teamB, setTeamB] = useState<Player[]>([]);
  const [isBalanced, setIsBalanced] = useState(false);

  // Add mock overall scores to players for balancing
  const playersWithScores = MOCK_FRIENDS.map((p, i) => ({
    ...p,
    overall: 70 + (i % 20) // Mock score between 70 and 89
  }));

  const togglePlayer = (player: any) => {
    if (selectedPlayers.find(p => p.id === player.id)) {
      setSelectedPlayers(selectedPlayers.filter(p => p.id !== player.id));
    } else {
      setSelectedPlayers([...selectedPlayers, player]);
    }
    setIsBalanced(false);
    setTeamA([]);
    setTeamB([]);
  };

  const generateBalancedTeams = () => {
    if (selectedPlayers.length < 2) return;

    // 1. Sort players by overall score descending
    const sortedPlayers = [...selectedPlayers].sort((a: any, b: any) => b.overall - a.overall);

    const newTeamA: Player[] = [];
    const newTeamB: Player[] = [];
    let sumA = 0;
    let sumB = 0;

    // 2. Snake draft logic to minimize difference
    sortedPlayers.forEach((player: any, index) => {
      // Basic snake draft: A, B, B, A, A, B...
      // A better approach for exact balancing is greedy: add to the team with lower sum
      if (sumA <= sumB) {
        newTeamA.push(player);
        sumA += player.overall;
      } else {
        newTeamB.push(player);
        sumB += player.overall;
      }
    });

    setTeamA(newTeamA);
    setTeamB(newTeamB);
    setIsBalanced(true);
  };

  const getAverage = (team: any[]) => {
    if (team.length === 0) return 0;
    const sum = team.reduce((acc, p) => acc + p.overall, 0);
    return Math.round(sum / team.length);
  };

  return (
    <div className="min-h-screen bg-[#0A0E14] font-sans flex flex-col">
      <header className="p-6 bg-[#0A0E14]/90 backdrop-blur-xl sticky top-0 z-20 border-b border-white/5 flex items-center gap-4">
        <button 
          onClick={onBack} 
          className="w-11 h-11 flex items-center justify-center bg-[#161B22] rounded-full text-white border border-white/5 hover:bg-white/10 transition-all"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-black text-white uppercase tracking-tighter">Takım Kurucu</h1>
          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Akıllı Dengeleme Sistemi</p>
        </div>
      </header>

      <main className="flex-1 p-6 overflow-y-auto custom-scrollbar">
        {!isBalanced ? (
          <div className="space-y-6 animate-in fade-in">
            <div className="flex justify-between items-center">
              <h2 className="text-sm font-bold text-white uppercase tracking-widest">Oyuncu Seç ({selectedPlayers.length})</h2>
              <button 
                onClick={generateBalancedTeams}
                disabled={selectedPlayers.length < 2}
                className="bg-[#FFFF00] text-black px-4 py-2 rounded-xl font-black text-xs uppercase tracking-widest disabled:opacity-50 flex items-center gap-2"
              >
                <RefreshCw size={14} /> Dengele
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {playersWithScores.map((player) => {
                const isSelected = selectedPlayers.find(p => p.id === player.id);
                return (
                  <div 
                    key={player.id}
                    onClick={() => togglePlayer(player)}
                    className={`p-3 rounded-2xl border cursor-pointer transition-all flex flex-col items-center text-center gap-2 ${
                      isSelected 
                        ? 'bg-green-500/10 border-green-500/50 shadow-[0_0_15px_rgba(34,197,94,0.1)]' 
                        : 'bg-[#161B22] border-white/5 hover:border-white/20'
                    }`}
                  >
                    <div className="relative">
                      <img src={player.avatar} className="w-12 h-12 rounded-full object-cover border-2 border-white/10" />
                      <div className="absolute -bottom-2 -right-2 bg-[#0A0E14] border border-white/20 rounded-full w-6 h-6 flex items-center justify-center">
                        <span className="text-[10px] font-black text-[#FFFF00]">{player.overall}</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white truncate w-full">{player.name}</p>
                      <p className="text-[9px] text-gray-500 uppercase">{player.position}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="space-y-6 animate-in slide-in-from-bottom-4">
            <div className="flex justify-between items-center">
              <h2 className="text-sm font-bold text-white uppercase tracking-widest">Dengeli Kadrolar</h2>
              <button 
                onClick={() => setIsBalanced(false)}
                className="bg-white/10 text-white px-4 py-2 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-white/20"
              >
                Yeniden Seç
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Team A */}
              <div className="bg-[#161B22] border border-white/10 rounded-3xl overflow-hidden">
                <div className="bg-gradient-to-br from-blue-900/40 to-transparent p-4 border-b border-white/5 text-center">
                  <h3 className="text-lg font-black text-white uppercase tracking-tighter">A Takımı</h3>
                  <div className="inline-flex items-center gap-2 mt-2 bg-black/40 px-3 py-1 rounded-full border border-white/10">
                    <span className="text-[10px] text-gray-400 font-bold uppercase">Ortalama Güç</span>
                    <span className="text-sm font-black text-[#FFFF00]">{getAverage(teamA)}</span>
                  </div>
                </div>
                <div className="p-2 space-y-1">
                  {teamA.map((p: any) => (
                    <div key={p.id} className="flex items-center justify-between p-2 rounded-xl hover:bg-white/5">
                      <div className="flex items-center gap-2">
                        <img src={p.avatar} className="w-8 h-8 rounded-full" />
                        <span className="text-xs font-bold text-white">{p.name}</span>
                      </div>
                      <span className="text-xs font-black text-[#FFFF00]">{p.overall}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Team B */}
              <div className="bg-[#161B22] border border-white/10 rounded-3xl overflow-hidden">
                <div className="bg-gradient-to-br from-red-900/40 to-transparent p-4 border-b border-white/5 text-center">
                  <h3 className="text-lg font-black text-white uppercase tracking-tighter">B Takımı</h3>
                  <div className="inline-flex items-center gap-2 mt-2 bg-black/40 px-3 py-1 rounded-full border border-white/10">
                    <span className="text-[10px] text-gray-400 font-bold uppercase">Ortalama Güç</span>
                    <span className="text-sm font-black text-[#FFFF00]">{getAverage(teamB)}</span>
                  </div>
                </div>
                <div className="p-2 space-y-1">
                  {teamB.map((p: any) => (
                    <div key={p.id} className="flex items-center justify-between p-2 rounded-xl hover:bg-white/5">
                      <div className="flex items-center gap-2">
                        <img src={p.avatar} className="w-8 h-8 rounded-full" />
                        <span className="text-xs font-bold text-white">{p.name}</span>
                      </div>
                      <span className="text-xs font-black text-[#FFFF00]">{p.overall}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
