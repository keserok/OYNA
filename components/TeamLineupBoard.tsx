import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Users, ChevronDown, Shield, Plus, Star, Trophy, 
  Trash2, RefreshCw, Layers, Check, X, Award, Zap, Heart 
} from 'lucide-react';
import { useAppStore } from '../store';
import { Player } from '../types';

// ─── TYPES ───────────────────────────────────────────────────────────────────
interface LineupTeam {
  name: string;
  isRegistered: boolean;
  color: string; // 'RED' | 'WHITE'
  formation: string;
  crest: string; // Emoji
  players: (Player & { style?: string })[];
}

interface TeamLineupBoardProps {
  matchId?: string;
}

// ─── FORMATIONS (Çift-takım yarı-saha layout) ─────────────────────────────────
// NOT: Bu board iki takımı tek sahada karşı karşıya gösterir (ev sahibi alt yarı
// Y: 53–90, deplasman Y=100-Y ile yansıtılır). Bu yüzden tek-takım tam-saha SSOT'tan
// (utils/formations.ts) farklı bir koordinat sistemi kullanır — bilinçli istisna.
const FORMATIONS_BASE: Record<string, { role: string; x: number; y: number }[]> = {
  '2-3-1': [
    { role: 'GK', x: 50, y: 90 },
    { role: 'STP', x: 28, y: 78 }, // DEF Left
    { role: 'STP', x: 72, y: 78 }, // DEF Right
    { role: 'OS', x: 22, y: 64 },  // MID Left
    { role: 'OS', x: 50, y: 64 },  // MID Center
    { role: 'OS', x: 78, y: 64 },  // MID Right
    { role: 'SNT', x: 50, y: 53 }  // FWD
  ],
  '3-2-1': [
    { role: 'GK', x: 50, y: 90 },
    { role: 'STP', x: 22, y: 78 }, // DEF Left
    { role: 'STP', x: 50, y: 78 }, // DEF Center
    { role: 'STP', x: 78, y: 78 }, // DEF Right
    { role: 'OS', x: 34, y: 64 },  // MID Left
    { role: 'OS', x: 66, y: 64 },  // MID Right
    { role: 'SNT', x: 50, y: 53 }  // FWD
  ],
  '2-2-2': [
    { role: 'GK', x: 50, y: 90 },
    { role: 'STP', x: 28, y: 78 }, // DEF Left
    { role: 'STP', x: 72, y: 78 }, // DEF Right
    { role: 'OS', x: 30, y: 64 },  // MID Left
    { role: 'OS', x: 70, y: 64 },  // MID Right
    { role: 'SNT', x: 34, y: 53 }, // FWD Left
    { role: 'SNT', x: 66, y: 53 }  // FWD Right
  ],
  '1-3-2': [
    { role: 'GK', x: 50, y: 90 },
    { role: 'STP', x: 50, y: 78 }, // DEF Center
    { role: 'OS', x: 22, y: 64 },  // MID Left
    { role: 'OS', x: 50, y: 64 },  // MID Center
    { role: 'OS', x: 78, y: 64 },  // MID Right
    { role: 'SNT', x: 34, y: 53 }, // FWD Left
    { role: 'SNT', x: 66, y: 53 }  // FWD Right
  ]
};

// Archetypes/Styles for FUT card design
const SQUAD_STYLES = ['Maestro', 'Duvar', 'Refleks', 'Avcı', 'Kaya', 'Dinamik', 'Fuleli', 'Sihirbaz'];

// ─── DEFAULT ROSTERS FOR PRE-POPULATING ──────────────────────────────────────
const DEFAULT_HOME_PLAYERS: (Player & { style?: string })[] = [
  { id: 'h1', name: 'Caner Kaya', avatar: 'https://i.pravatar.cc/150?u=caner', rating: 4.8, position: 'GK', x: 0, y: 0, style: 'Refleks' },
  { id: 'h2', name: 'Burak Şahin', avatar: 'https://i.pravatar.cc/150?u=burak', rating: 4.5, position: 'STP', x: 0, y: 0, style: 'Duvar' },
  { id: 'h3', name: 'Ozan Tekin', avatar: 'https://i.pravatar.cc/150?u=ozan', rating: 4.3, position: 'STP', x: 0, y: 0, style: 'Kaya' },
  { id: 'h4', name: 'Hakan Çelik', avatar: 'https://i.pravatar.cc/150?u=hakan', rating: 4.7, position: 'OS', x: 0, y: 0, style: 'Maestro' },
  { id: 'h5', name: 'Emre Demir', avatar: 'https://i.pravatar.cc/150?u=emre', rating: 4.6, position: 'OS', x: 0, y: 0, style: 'Dinamik' },
  { id: 'h6', name: 'Yusuf Can', avatar: 'https://i.pravatar.cc/150?u=yusuf', rating: 4.2, position: 'OS', x: 0, y: 0, style: 'Sihirbaz' },
  { id: 'h7', name: 'Mert Arslan', avatar: 'https://i.pravatar.cc/150?u=mert', rating: 4.9, position: 'SNT', x: 0, y: 0, style: 'Avcı' },
];

const DEFAULT_AWAY_PLAYERS: (Player & { style?: string })[] = [
  { id: 'a1', name: 'Volkan Demirel', avatar: 'https://i.pravatar.cc/150?u=volkan', rating: 4.9, position: 'GK', x: 0, y: 0, style: 'Refleks' },
  { id: 'a2', name: 'Ahmet Yılmaz', avatar: 'https://i.pravatar.cc/150?u=ahmet', rating: 4.4, position: 'STP', x: 0, y: 0, style: 'Duvar' },
  { id: 'a3', name: 'Kaya Yıldırım', avatar: 'https://i.pravatar.cc/150?u=kaya', rating: 4.5, position: 'STP', x: 0, y: 0, style: 'Kaya' },
  { id: 'a4', name: 'Ali Şen', avatar: 'https://i.pravatar.cc/150?u=ali', rating: 4.3, position: 'OS', x: 0, y: 0, style: 'Dinamik' },
  { id: 'a5', name: 'Semih Kaya', avatar: 'https://i.pravatar.cc/150?u=semih', rating: 4.1, position: 'OS', x: 0, y: 0, style: 'Maestro' },
  { id: 'a6', name: 'Deniz Sarp', avatar: 'https://i.pravatar.cc/150?u=deniz', rating: 4.4, position: 'OS', x: 0, y: 0, style: 'Sihirbaz' },
  { id: 'a7', name: 'Ozan Kabak', avatar: 'https://i.pravatar.cc/150?u=ozan2', rating: 4.8, position: 'SNT', x: 0, y: 0, style: 'Fuleli' },
];

export const TeamLineupBoard: React.FC<TeamLineupBoardProps> = () => {
  const { myTeams } = useAppStore();

  // ─── STATES ──────────────────────────────────────────────────────────────────
  const [teamA, setTeamA] = useState<LineupTeam>({
    name: 'Kırmızı Takım',
    isRegistered: false,
    color: 'RED',
    formation: '2-3-1',
    crest: '🔴',
    players: [...DEFAULT_HOME_PLAYERS]
  });

  const [teamB, setTeamB] = useState<LineupTeam>({
    name: 'Beyaz Takım',
    isRegistered: false,
    color: 'WHITE',
    formation: '2-3-1',
    crest: '⚪',
    players: [...DEFAULT_AWAY_PLAYERS]
  });

  const [selectedPlayer, setSelectedPlayer] = useState<(Player & { teamColor: string; style?: string }) | null>(null);
  const [activeImportSide, setActiveImportSide] = useState<'A' | 'B' | null>(null);
  const [showFormationMenu, setShowFormationMenu] = useState<'A' | 'B' | null>(null);

  // ─── CALCULATED SLOTS (PITCH GRAPHICS Y-MIRRORED FOR TEAM B) ──────────────────
  const pitchSlots = useMemo(() => {
    const slotsA = FORMATIONS_BASE[teamA.formation].map((pos, idx) => {
      const player = teamA.players[idx] || {
        id: `empty-a-${idx}`,
        name: 'Boş Slot',
        avatar: '',
        rating: 3.0,
        position: pos.role,
        x: 0,
        y: 0
      };
      return {
        id: `slot-a-${idx}`,
        side: 'A',
        color: 'RED',
        role: pos.role,
        x: pos.x,
        y: pos.y, // Bottom half Y
        player
      };
    });

    const slotsB = FORMATIONS_BASE[teamB.formation].map((pos, idx) => {
      const player = teamB.players[idx] || {
        id: `empty-b-${idx}`,
        name: 'Boş Slot',
        avatar: '',
        rating: 3.0,
        position: pos.role,
        x: 0,
        y: 0
      };
      return {
        id: `slot-b-${idx}`,
        side: 'B',
        color: 'WHITE',
        role: pos.role,
        x: pos.x,
        y: 100 - pos.y, // Mirror Y to top half
        player
      };
    });

    return [...slotsA, ...slotsB];
  }, [teamA, teamB]);

  // ─── ACTION HANDLERS ──────────────────────────────────────────────────────────
  const handleImportTeam = (side: 'A' | 'B', teamId: string) => {
    const selected = myTeams.find(t => t.id === teamId);
    if (!selected) return;

    const importedPlayers = (selected.roster || []).map((p: any, idx: number) => ({
      id: p.id || `imported-${side}-${idx}`,
      name: p.name || 'Oyuncu',
      avatar: p.avatar || `https://i.pravatar.cc/150?u=${p.id}`,
      rating: p.rating || 4.2,
      position: p.position || 'OS',
      x: 0,
      y: 0,
      style: SQUAD_STYLES[idx % SQUAD_STYLES.length]
    }));

    // If team roster is less than 7, fill the rest with placeholders
    const requiredSize = 7;
    while (importedPlayers.length < requiredSize) {
      const idx = importedPlayers.length;
      importedPlayers.push({
        id: `placeholder-${side}-${idx}`,
        name: `Katılımcı #${idx + 1}`,
        avatar: `https://i.pravatar.cc/150?u=placeholder-${side}-${idx}`,
        rating: 4.0,
        position: 'OS',
        x: 0,
        y: 0,
        style: 'Dinamik'
      });
    }

    if (side === 'A') {
      setTeamA({
        ...teamA,
        name: selected.name,
        isRegistered: true,
        crest: selected.logo || '🛡️',
        players: importedPlayers
      });
    } else {
      setTeamB({
        ...teamB,
        name: selected.name,
        isRegistered: true,
        crest: selected.logo || '🛡️',
        players: importedPlayers
      });
    }

    setActiveImportSide(null);
    if (navigator.vibrate) navigator.vibrate(30);
  };

  const handleResetToIndividual = (side: 'A' | 'B') => {
    if (side === 'A') {
      setTeamA({
        ...teamA,
        name: 'Kırmızı Takım',
        isRegistered: false,
        crest: '🔴',
        players: [...DEFAULT_HOME_PLAYERS]
      });
    } else {
      setTeamB({
        ...teamB,
        name: 'Beyaz Takım',
        isRegistered: false,
        crest: '⚪',
        players: [...DEFAULT_AWAY_PLAYERS]
      });
    }
    if (navigator.vibrate) navigator.vibrate(15);
  };

  const handleUpdateFormation = (side: 'A' | 'B', f: string) => {
    if (side === 'A') {
      setTeamA({ ...teamA, formation: f });
    } else {
      setTeamB({ ...teamB, formation: f });
    }
    setShowFormationMenu(null);
    if (navigator.vibrate) navigator.vibrate(20);
  };

  return (
    <div className="space-y-6">

      {/* ─── TEAM INFOS & CONTROLS ─── */}
      <div className="grid grid-cols-1 gap-4">
        
        {/* TEAM A (KIRMIZI / EV SAHİBİ) */}
        <div className="bg-[#161B22]/80 backdrop-blur-md border border-white/5 rounded-3xl p-5 relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-2 h-full bg-red-600"></div>
          
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 bg-red-600/10 rounded-2xl flex items-center justify-center text-red-500 border border-red-500/20 text-3xl shadow-inner shadow-red-500/10">
                {teamA.crest.startsWith('http') ? (
                  <img src={teamA.crest} className="w-full h-full object-cover rounded-2xl" />
                ) : (
                  teamA.crest
                )}
              </div>
              <div>
                <span className="text-[9px] font-extrabold text-red-500 uppercase tracking-widest block mb-0.5">EV SAHİBİ</span>
                <h3 className="text-xl font-extrabold text-white italic uppercase tracking-tighter leading-none truncate max-w-[160px]">{teamA.name}</h3>
                <span className="text-[10px] text-gray-500 font-bold block mt-1 uppercase tracking-widest">{teamA.isRegistered ? 'Kayıtlı Kadro' : 'Bireysel Katılım'}</span>
              </div>
            </div>

            <div className="flex flex-col gap-2 items-end">
              {/* Formation Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowFormationMenu(showFormationMenu === 'A' ? null : 'A')}
                  className="bg-black/40 border border-white/10 hover:border-red-500/30 px-3 py-1.5 rounded-xl text-[10px] font-extrabold uppercase text-white flex items-center gap-1.5 transition-all"
                >
                  <Layers size={11} className="text-red-500" />
                  {teamA.formation}
                  <ChevronDown size={12} className="text-gray-400" />
                </button>

                <AnimatePresence>
                  {showFormationMenu === 'A' && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="absolute right-0 mt-2 bg-[#161B22] border border-white/10 rounded-xl p-1 z-30 shadow-2xl min-w-[100px]"
                    >
                      {Object.keys(FORMATIONS_BASE).map(form => (
                        <button
                          key={form}
                          onClick={() => handleUpdateFormation('A', form)}
                          className={`w-full text-left px-3 py-2 text-xs font-extrabold uppercase tracking-widest rounded-lg transition-colors ${teamA.formation === form ? 'bg-red-600 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                        >
                          {form}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Roster Controls */}
              {teamA.isRegistered ? (
                <button
                  onClick={() => handleResetToIndividual('A')}
                  className="text-[9px] font-extrabold uppercase tracking-widest text-red-400 hover:text-red-300 transition-colors flex items-center gap-1"
                >
                  <Trash2 size={11} /> Bireysele Dön
                </button>
              ) : (
                <button
                  onClick={() => setActiveImportSide('A')}
                  className="bg-red-600 hover:bg-red-500 text-white text-[9px] font-extrabold uppercase tracking-widest px-3 py-1.5 rounded-xl flex items-center gap-1 shadow-[0_0_15px_rgba(239,68,68,0.2)] active:scale-95 transition-all"
                >
                  <Plus size={11} /> Takım Yükle
                </button>
              )}
            </div>
          </div>
        </div>

        {/* TEAM B (BEYAZ / DEPLASMAN) */}
        <div className="bg-[#161B22]/80 backdrop-blur-md border border-white/5 rounded-3xl p-5 relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-2 h-full bg-gray-400"></div>
          
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center text-white border border-white/20 text-3xl shadow-inner">
                {teamB.crest.startsWith('http') ? (
                  <img src={teamB.crest} className="w-full h-full object-cover rounded-2xl" />
                ) : (
                  teamB.crest
                )}
              </div>
              <div>
                <span className="text-[9px] font-extrabold text-gray-400 uppercase tracking-widest block mb-0.5">DEPLASMAN</span>
                <h3 className="text-xl font-extrabold text-white italic uppercase tracking-tighter leading-none truncate max-w-[160px]">{teamB.name}</h3>
                <span className="text-[10px] text-gray-500 font-bold block mt-1 uppercase tracking-widest">{teamB.isRegistered ? 'Kayıtlı Kadro' : 'Bireysel Katılım'}</span>
              </div>
            </div>

            <div className="flex flex-col gap-2 items-end">
              {/* Formation Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowFormationMenu(showFormationMenu === 'B' ? null : 'B')}
                  className="bg-black/40 border border-white/10 hover:border-white/30 px-3 py-1.5 rounded-xl text-[10px] font-extrabold uppercase text-white flex items-center gap-1.5 transition-all"
                >
                  <Layers size={11} className="text-gray-400" />
                  {teamB.formation}
                  <ChevronDown size={12} className="text-gray-400" />
                </button>

                <AnimatePresence>
                  {showFormationMenu === 'B' && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="absolute right-0 mt-2 bg-[#161B22] border border-white/10 rounded-xl p-1 z-30 shadow-2xl min-w-[100px]"
                    >
                      {Object.keys(FORMATIONS_BASE).map(form => (
                        <button
                          key={form}
                          onClick={() => handleUpdateFormation('B', form)}
                          className={`w-full text-left px-3 py-2 text-xs font-extrabold uppercase tracking-widest rounded-lg transition-colors ${teamB.formation === form ? 'bg-white text-black' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                        >
                          {form}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Roster Controls */}
              {teamB.isRegistered ? (
                <button
                  onClick={() => handleResetToIndividual('B')}
                  className="text-[9px] font-extrabold uppercase tracking-widest text-red-400 hover:text-red-300 transition-colors flex items-center gap-1"
                >
                  <Trash2 size={11} /> Bireysele Dön
                </button>
              ) : (
                <button
                  onClick={() => setActiveImportSide('B')}
                  className="bg-white/10 hover:bg-white/20 text-white text-[9px] font-extrabold uppercase tracking-widest px-3 py-1.5 rounded-xl border border-white/15 flex items-center gap-1 shadow-md active:scale-95 transition-all"
                >
                  <Plus size={11} /> Takım Yükle
                </button>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* ─── LINEUP PITCH (DİZİLİŞ SAHASI) ─── */}
      <div className="relative w-full aspect-[3/4] bg-[#071b0e] rounded-[36px] border-4 border-[#161B22] shadow-[0_30px_70px_rgba(0,0,0,0.8),inset_0_0_60px_rgba(0,0,0,0.9)] overflow-hidden">
        {/* Pitch Stripes */}
        <div className="absolute inset-0 opacity-[0.07] pointer-events-none" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 10%, rgba(0,0,0,0.3) 10%, rgba(0,0,0,0.3) 20%)' }}></div>

        {/* Tactical Markings */}
        <div className="absolute inset-0 pointer-events-none opacity-30">
          <svg viewBox="0 0 600 800" preserveAspectRatio="xMidYMid meet" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <g stroke="white" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <rect x="25" y="25" width="550" height="750" />
              <line x1="25" y1="400" x2="575" y2="400" strokeWidth="3" />
              <circle cx="300" cy="400" r="75" />
              <circle cx="300" cy="400" r="4" fill="white" />

              {/* Penalty Area Top */}
              <rect x="130" y="25" width="340" height="120" />
              <rect x="210" y="25" width="180" height="40" />
              <circle cx="300" cy="105" r="4" fill="white" />
              <path d="M 230 145 A 75 75 0 0 0 370 145" />

              {/* Penalty Area Bottom */}
              <rect x="130" y="655" width="340" height="120" />
              <rect x="210" y="735" width="180" height="40" />
              <circle cx="300" cy="695" r="4" fill="white" />
              <path d="M 230 655 A 75 75 0 0 1 370 655" />
            </g>
          </svg>
        </div>

        {/* Center Grid Header Indicator */}
        <div className="absolute top-[390px] left-0 right-0 h-[20px] flex justify-between items-center px-4 pointer-events-none z-10">
          <span className="text-[9px] font-extrabold tracking-widest text-red-500/50 uppercase italic leading-none">{teamA.name}</span>
          <span className="text-[9px] font-extrabold tracking-widest text-white/40 uppercase italic leading-none">{teamB.name}</span>
        </div>

        {/* Player Circles */}
        {pitchSlots.map(slot => {
          const hasPlayer = slot.player && slot.player.avatar;
          const isRed = slot.color === 'RED';
          const borderColor = isRed ? '#ef4444' : '#ffffff';
          const glowShadow = isRed ? '0 0 16px rgba(239,68,68,0.7)' : '0 0 16px rgba(255,255,255,0.7)';

          return (
            <motion.div
              key={slot.id}
              layout
              transition={{ type: 'spring', stiffness: 350, damping: 28 }}
              className="absolute transform -translate-x-1/2 -translate-y-1/2 z-20 cursor-pointer"
              style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
              onClick={() => {
                if (slot.player) {
                  setSelectedPlayer({
                    ...slot.player,
                    teamColor: slot.color
                  });
                }
              }}
            >
              <div className="relative flex flex-col items-center">
                
                {/* Avatar with team colored border */}
                <motion.div
                  whileHover={{ scale: 1.15, zIndex: 30 }}
                  whileTap={{ scale: 0.95 }}
                  className="w-12 h-12 rounded-full flex items-center justify-center bg-black border-2 shadow-2xl relative"
                  style={{ 
                    borderColor, 
                    boxShadow: glowShadow 
                  }}
                >
                  {hasPlayer ? (
                    <img src={slot.player.avatar} className="w-full h-full rounded-full object-cover" alt={slot.player.name} />
                  ) : (
                    <div className="w-full h-full rounded-full bg-gray-800 flex items-center justify-center">
                      <span className="text-gray-500 text-[10px] font-extrabold uppercase tracking-wider">{slot.role}</span>
                    </div>
                  )}

                  {/* Rating Small Badge */}
                  {hasPlayer && (
                    <div 
                      className={`absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full border border-black/80 flex items-center justify-center text-[8px] font-extrabold text-black`}
                      style={{ backgroundColor: borderColor }}
                    >
                      {Math.round(slot.player.rating * 20)}
                    </div>
                  )}
                </motion.div>

                {/* Player Name Badge */}
                {slot.player && slot.player.name !== 'Boş Slot' && (
                  <div className="absolute top-full mt-1.5 pointer-events-none">
                    <span className="text-[8px] font-extrabold px-2 py-0.5 rounded bg-black/80 text-white border border-white/5 shadow-md whitespace-nowrap">
                      {slot.player.name.split(' ')[0]}
                    </span>
                  </div>
                )}

              </div>
            </motion.div>
          );
        })}
      </div>

      {/* ─── IMPORT TEAM MODAL (BOTTOM SHEET GLASS) ─── */}
      <AnimatePresence>
        {activeImportSide && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-end justify-center"
            onClick={() => setActiveImportSide(null)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 250 }}
              onClick={e => e.stopPropagation()}
              className="bg-[#161B22] border-t border-white/10 w-full max-w-md rounded-t-[36px] p-6 pb-12 shadow-[0_-20px_50px_rgba(0,0,0,0.8)]"
            >
              <div className="w-12 h-1 bg-white/20 rounded-full mx-auto mb-6" />
              
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-xl font-extrabold text-white italic uppercase tracking-tighter">Takım İçe Aktar</h3>
                  <p className="text-[9px] text-gray-500 uppercase tracking-widest font-extrabold mt-0.5">
                    {activeImportSide === 'A' ? 'Ev Sahibi' : 'Deplasman'} Kadrosunu Doldur
                  </p>
                </div>
                <button 
                  onClick={() => setActiveImportSide(null)} 
                  className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-white/50 hover:bg-white/10"
                >
                  <X size={18} />
                </button>
              </div>

              {myTeams.length === 0 ? (
                <div className="text-center py-10 space-y-3">
                  <Trophy size={36} className="text-gray-600 mx-auto" />
                  <p className="text-sm font-bold text-gray-400">Kayıtlı takım bulunamadı</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                  {myTeams.map(t => (
                    <button
                      key={t.id}
                      onClick={() => handleImportTeam(activeImportSide, t.id)}
                      className="w-full bg-white/[0.02] border border-white/5 hover:border-white/10 p-4 rounded-2xl flex items-center gap-4 text-left active:scale-[0.98] transition-all"
                    >
                      <div className="w-12 h-12 bg-white/5 rounded-xl border border-white/10 flex items-center justify-center text-2xl">
                        {t.logo || '🛡️'}
                      </div>
                      <div className="flex-1">
                        <h4 className="text-sm font-extrabold text-white uppercase tracking-tight">{t.name}</h4>
                        <span className="text-[10px] text-gray-500 font-bold block">{t.roster?.length || 0} Oyuncu · {t.wins || 0}G {t.losses || 0}M</span>
                      </div>
                      <div className="w-7 h-7 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/60">
                        <Plus size={14} />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── EA SPORTS / FUT STYLE CARD PREVIEW MODAL ─── */}
      <AnimatePresence>
        {selectedPlayer && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
            onClick={() => setSelectedPlayer(null)}
          >
            <motion.div
              initial={{ scale: 0.8, y: 30 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.8, y: 30 }}
              className="relative w-72 rounded-[32px] p-0.5 overflow-hidden shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              {/* Premium Glow Frame Border */}
              <div 
                className="absolute inset-0 rounded-[32px] opacity-80"
                style={{ 
                  background: selectedPlayer.teamColor === 'RED' 
                    ? 'linear-gradient(135deg, #ef4444 0%, #000000 50%, #991b1b 100%)' 
                    : 'linear-gradient(135deg, #ffffff 0%, #000000 50%, #737373 100%)',
                  boxShadow: selectedPlayer.teamColor === 'RED' 
                    ? '0 0 30px rgba(239,68,68,0.5)' 
                    : '0 0 30px rgba(255,255,255,0.4)'
                }}
              />
              
              {/* Card Container */}
              <div className="relative bg-[#0d1117] rounded-[30px] p-6 flex flex-col items-center">
                {/* Diagonal Light Beam */}
                <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/[0.02] to-transparent pointer-events-none" />
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/[0.01] rounded-full blur-2xl pointer-events-none" />

                {/* Card Title Header */}
                <div className="w-full flex justify-between items-center mb-4">
                  <span className="text-[8px] font-extrabold text-gray-500 uppercase tracking-[0.25em]">OYNA PLAYER CARD</span>
                  <button onClick={() => setSelectedPlayer(null)} className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:text-white">
                    <X size={12} />
                  </button>
                </div>

                {/* Rating & Position Left Float */}
                <div className="absolute left-6 top-16 flex flex-col items-center">
                  <span className="text-4xl font-extrabold italic tracking-tighter leading-none text-white">
                    {Math.round(selectedPlayer.rating * 20)}
                  </span>
                  <span className="text-[9px] font-extrabold uppercase text-gray-400 mt-1 tracking-widest">
                    {selectedPlayer.position}
                  </span>
                </div>

                {/* Avatar with Glow */}
                <div className="relative w-28 h-28 mb-4 mt-2">
                  <div 
                    className="absolute inset-0 rounded-full blur-xl opacity-40"
                    style={{ backgroundColor: selectedPlayer.teamColor === 'RED' ? '#ef4444' : '#ffffff' }}
                  />
                  <img 
                    src={selectedPlayer.avatar} 
                    className="w-full h-full rounded-full object-cover border-2 relative z-10" 
                    style={{ borderColor: selectedPlayer.teamColor === 'RED' ? '#ef4444' : '#ffffff' }}
                    alt={selectedPlayer.name}
                  />
                </div>

                {/* Player Name */}
                <h3 className="text-xl font-extrabold text-white italic uppercase tracking-tighter mb-1 text-center drop-shadow-md">
                  {selectedPlayer.name}
                </h3>

                {/* Archetype / Style Badge */}
                <div 
                  className="px-3.5 py-1 rounded-full text-[8px] font-extrabold uppercase tracking-widest mb-5 flex items-center gap-1.5 border"
                  style={{ 
                    backgroundColor: selectedPlayer.teamColor === 'RED' ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.05)',
                    borderColor: selectedPlayer.teamColor === 'RED' ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.15)',
                    color: selectedPlayer.teamColor === 'RED' ? '#ef4444' : '#ffffff'
                  }}
                >
                  <Zap size={10} />
                  {selectedPlayer.style || 'Dinamik'}
                </div>

                {/* Mini Stats Bar */}
                <div className="grid grid-cols-3 gap-2.5 w-full">
                  {[
                    { label: 'PAS', score: Math.round(selectedPlayer.rating * 19 + 5) },
                    { label: 'HIZ', score: Math.round(selectedPlayer.rating * 18 + 7) },
                    { label: 'ŞUT', score: Math.round(selectedPlayer.rating * 17 + 8) }
                  ].map(stat => (
                    <div key={stat.label} className="bg-white/[0.02] border border-white/5 rounded-2xl p-2 text-center">
                      <span className="block text-[7px] font-extrabold text-gray-500 uppercase tracking-wider mb-0.5">{stat.label}</span>
                      <span className="text-xs font-extrabold text-white">{stat.score}</span>
                    </div>
                  ))}
                </div>

              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};
