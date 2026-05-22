import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Shield, ChevronRight, ChevronLeft, Plus, X, Users, Star, 
  MapPin, Flag, Trophy, Target, Zap, ShieldCheck, Check,
  Hexagon, Circle, Triangle, Crown, Swords, Flame, Info
} from 'lucide-react';

interface TeamCreatorWizardProps {
  onClose: () => void;
  onComplete: (teamData: any) => void;
  friends: any[];
}

export const TeamCreatorWizard: React.FC<TeamCreatorWizardProps> = ({ onClose, onComplete, friends }) => {
  const [step, setStep] = useState(1);
  const [isCreating, setIsCreating] = useState(false);
  
  const [teamData, setTeamData] = useState({
    name: '',
    shortName: '',
    location: '',
    color1: '#39FF14',
    color2: '#0A0E14',
    crest: 'shield', // 'shield', 'hexagon', 'circle', 'triangle', 'star', 'crown', 'swords', 'flame'
    players: [] as string[],
    captain: '',
    formation: '2-3-1',
    playstyle: 'Hücum',
    teamValue: '50000',
  });

  const availableColors = ['#39FF14', '#0A0E14', '#FF385C', '#3B82F6', '#F59E0B', '#A855F7', '#10B981', '#FFFFFF', '#000000'];
  const formations = ['2-3-1', '3-2-1', '2-2-2', '3-1-2'];
  const playstyles = [
    { id: 'Hücum', desc: 'Sürekli baskı ve atak', icon: Flame },
    { id: 'Kontra Atak', desc: 'Hızlı çıkışlarla rakibi avla', icon: Zap },
    { id: 'Pas Oyunu', desc: 'Topa sahip ol, oyunu yönet', icon: Target },
    { id: 'Katı Defans', desc: 'Önce güvenlik, kaleyi kapat', icon: ShieldCheck }
  ];

  const crestOptions = [
      { id: 'shield', icon: Shield },
      { id: 'hexagon', icon: Hexagon },
      { id: 'circle', icon: Circle },
      { id: 'triangle', icon: Triangle },
      { id: 'star', icon: Star },
      { id: 'crown', icon: Crown },
      { id: 'swords', icon: Swords },
      { id: 'flame', icon: Flame }
  ];

  // Group handling for Step 3
  const groupTabs = ['Tümü', ...Array.from(new Set(friends.map(f => f.group)))];
  const [selectedGroup, setSelectedGroup] = useState('Tümü');

  const updateData = (key: string, value: any) => {
    setTeamData(prev => ({ ...prev, [key]: value }));
  };

  const togglePlayer = (id: string) => {
    setTeamData(prev => {
      let newPlayers = [...prev.players];
      let newCap = prev.captain;
      if (newPlayers.includes(id)) {
        newPlayers = newPlayers.filter(p => p !== id);
        if (newCap === id) newCap = newPlayers[0] || '';
      } else {
        newPlayers.push(id);
        if (!newCap) newCap = id;
      }
      return { ...prev, players: newPlayers, captain: newCap };
    });
  };

  // Team Form/Rating calculation based on wins instead of ELO
  const teamOvr = useMemo(() => {
    if (teamData.players.length === 0) return 0;
    const selectedFriends = friends.filter(f => teamData.players.includes(f.id));
    const avgWins = selectedFriends.reduce((sum, f) => sum + (f.wins || 0), 0) / selectedFriends.length;
    return Math.min(99, Math.max(50, 60 + Math.floor(avgWins * 2)));
  }, [teamData.players, friends]);

  // Positional Dots Calculation
  const selectedFriendsData = friends.filter(f => teamData.players.includes(f.id));
  const countPos = (positions: string[]) => selectedFriendsData.filter(f => positions.includes(f.pos)).length;
  
  const numAttack = countPos(['FV', 'SNT', 'SĞA', 'SOA']);
  const numMid = countPos(['OS', 'MDO', 'MO', 'SĞO', 'SO']);
  const numDef = countPos(['STP', 'BEK', 'KL', 'SĞB', 'SOB']);

  const handleComplete = () => {
    setIsCreating(true);
    setTimeout(() => {
      onComplete(teamData);
    }, 2500); // Wait for celebration animation
  };

  const renderCrest = (type: string, color: string, className = "") => {
    const CrestIcon = crestOptions.find(c => c.id === type)?.icon || Shield;
    return <CrestIcon size={48} className={className} style={{ color }} />;
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      {/* Container */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="w-full max-w-4xl bg-[#0A0E14] border border-white/10 rounded-[32px] overflow-hidden flex flex-col md:flex-row relative shadow-[0_0_50px_rgba(0,0,0,0.8)] min-h-[600px] max-h-[90vh]"
      >
        {/* Close Button */}
        {!isCreating && (
          <button onClick={onClose} className="absolute top-4 right-4 z-50 w-10 h-10 bg-white/5 border border-white/10 rounded-full flex items-center justify-center text-gray-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        )}

        {/* ─── LEFT: LIVE PREVIEW CARD ────────────────────────────────────── */}
        <div className="w-full md:w-1/3 bg-[#161B22] p-8 flex flex-col items-center justify-center relative border-r border-white/5 hidden md:flex">
          {/* Ambience */}
          <div 
            className="absolute inset-0 opacity-20 transition-colors duration-500 blur-3xl" 
            style={{ background: `radial-gradient(circle at center, ${teamData.color1}, transparent 70%)` }}
          />
          
          <div className="text-center mb-8 relative z-10 w-full">
            <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Takım Kartı</h3>
            <p className="text-xs font-bold text-gray-400">Canlı Önizleme</p>
          </div>

          {/* The Dynamic Card - Asymmetrical & Premium */}
          <motion.div 
            layout
            className="w-full aspect-[2/3] rounded-3xl relative overflow-hidden flex flex-col p-6 border-2 shadow-2xl transition-all duration-500"
            style={{ 
              background: `linear-gradient(135deg, ${teamData.color2}, #000000)`,
              borderColor: `${teamData.color1}40`,
              boxShadow: `0 20px 40px -10px ${teamData.color1}40`
            }}
          >
            {/* Right Side Huge Crest Watermark */}
            <div className="absolute right-[-20%] top-1/2 -translate-y-1/2 opacity-30 mix-blend-overlay transition-all duration-500 blur-[1px]">
                {renderCrest(teamData.crest, teamData.color1, "w-64 h-64")}
            </div>
            
            {/* Top Left: Rating */}
            <div className="absolute top-6 left-5 flex flex-col items-start z-10">
              <span className="text-3xl font-black leading-none drop-shadow-md" style={{ color: teamData.color1 }}>{teamOvr > 0 ? teamOvr : '--'}</span>
              <span className="text-[9px] font-bold text-white/70 uppercase tracking-widest">OVR</span>
            </div>

            {/* Top Right: Small Crest */}
            <div className="absolute top-6 right-5 z-10 drop-shadow-lg">
                {renderCrest(teamData.crest, teamData.color1, "w-10 h-10")}
            </div>

            {/* Bottom Content Area */}
            <div className="mt-auto w-full z-10">
              <div className="mb-4">
                <h2 className="text-2xl font-black text-white italic tracking-tighter leading-none uppercase drop-shadow-md">
                  {teamData.name || 'TAKIM ADI'}
                </h2>
                <div className="flex items-center gap-2 mt-2">
                  <span className="px-2 py-0.5 rounded uppercase text-[10px] font-black tracking-widest bg-white/10 text-white backdrop-blur-sm">
                    {teamData.shortName || 'KOD'}
                  </span>
                  {teamData.location && (
                    <span className="text-[10px] text-gray-300 font-bold flex items-center gap-1 drop-shadow-md">
                      <MapPin size={10} /> {teamData.location}
                    </span>
                  )}
                </div>
              </div>

              {/* Stats Row (Heatmap Dots) */}
              <div className="grid grid-cols-1 gap-2 border-t border-white/20 pt-4 pb-2">
                
                {/* Hücum */}
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-white/80 font-black uppercase tracking-widest w-12">HÜCUM</span>
                  <div className="flex gap-1">
                    {Array.from({ length: Math.max(1, numAttack) }).map((_, i) => (
                      <div key={`att-${i}`} className={`w-2 h-2 rounded-full ${numAttack > 0 ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]' : 'bg-white/10'}`} />
                    ))}
                  </div>
                </div>

                {/* Orta */}
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-white/80 font-black uppercase tracking-widest w-12">ORTA</span>
                  <div className="flex gap-1">
                    {Array.from({ length: Math.max(1, numMid) }).map((_, i) => (
                      <div key={`mid-${i}`} className={`w-2 h-2 rounded-full ${numMid > 0 ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]' : 'bg-white/10'}`} />
                    ))}
                  </div>
                </div>

                {/* Defans */}
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-white/80 font-black uppercase tracking-widest w-12">DEFANS</span>
                  <div className="flex gap-1">
                    {Array.from({ length: Math.max(1, numDef) }).map((_, i) => (
                      <div key={`def-${i}`} className={`w-2 h-2 rounded-full ${numDef > 0 ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-white/10'}`} />
                    ))}
                  </div>
                </div>

              </div>

              {/* Team Value */}
              <div className="mt-3 text-center bg-black/40 backdrop-blur-md rounded-xl py-1.5 border border-white/10">
                  <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mr-2">Değer:</span>
                  <span className="text-xs font-black text-amber-400 tabular-nums tracking-widest">{Number(teamData.teamValue || 0).toLocaleString('tr-TR')} 💎</span>
              </div>

            </div>
          </motion.div>
        </div>

        {/* ─── RIGHT: WIZARD CONTENT ──────────────────────────────────────── */}
        <div className="w-full md:w-2/3 flex flex-col relative max-h-[90vh]">
          
          {/* Progress Header */}
          {!isCreating && (
            <div className="px-8 py-6 pr-16 border-b border-white/5 flex items-center justify-between shrink-0">
              <div className="flex gap-2">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className={`h-1.5 rounded-full transition-all duration-500 ${step >= i ? 'w-8 bg-[#39FF14] shadow-[0_0_10px_rgba(57,255,20,0.5)]' : 'w-4 bg-white/10'}`} />
                ))}
              </div>
              <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                ADIM {step}/4
              </span>
            </div>
          )}

          {/* Steps Area */}
          <div className="flex-1 p-8 overflow-y-auto custom-scrollbar relative">
            <AnimatePresence mode="wait">
              {isCreating ? (
                <motion.div 
                  key="celebration"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center"
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-[#39FF14]/20 to-transparent blur-3xl" />
                  <motion.div 
                    animate={{ rotate: 360, scale: [1, 1.2, 1] }}
                    transition={{ duration: 2, ease: "easeInOut" }}
                    className="w-32 h-32 mb-8 relative z-10 drop-shadow-[0_0_30px_rgba(57,255,20,0.5)]"
                  >
                    {renderCrest(teamData.crest, teamData.color1, "w-full h-full")}
                  </motion.div>
                  <motion.h1 
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="text-4xl font-black italic uppercase tracking-tighter text-white mb-2 relative z-10"
                  >
                    Takım Kuruldu!
                  </motion.h1>
                  <motion.p 
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.7 }}
                    className="text-emerald-400 font-bold uppercase tracking-widest relative z-10"
                  >
                    Efsane Başlıyor...
                  </motion.p>
                </motion.div>
              ) : step === 1 ? (
                <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-black italic uppercase tracking-tighter mb-1">Kulüp Kimliği</h2>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Takımının adını ve konumunu belirle.</p>
                  </div>

                  <div className="space-y-4 pt-4">
                    <div>
                      <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 block">Takım Adı</label>
                      <input 
                        type="text" value={teamData.name} onChange={e => updateData('name', e.target.value)}
                        placeholder="Örn: Kuzey Yıldızları FC"
                        className="w-full bg-[#161B22] border border-white/10 rounded-2xl px-5 py-4 text-white font-black outline-none focus:border-[#39FF14]/50 focus:bg-[#0A0E14] transition-all"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 block">Kısaltma (3 Harf)</label>
                        <input 
                          type="text" maxLength={3} value={teamData.shortName} onChange={e => updateData('shortName', e.target.value.toUpperCase())}
                          placeholder="KYZ"
                          className="w-full bg-[#161B22] border border-white/10 rounded-2xl px-5 py-4 text-white font-black uppercase tracking-[0.2em] outline-none focus:border-[#39FF14]/50 focus:bg-[#0A0E14] transition-all"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 block">Lokasyon</label>
                        <input 
                          type="text" value={teamData.location} onChange={e => updateData('location', e.target.value)}
                          placeholder="Kadıköy, İstanbul"
                          className="w-full bg-[#161B22] border border-white/10 rounded-2xl px-5 py-4 text-white font-bold outline-none focus:border-[#39FF14]/50 focus:bg-[#0A0E14] transition-all"
                        />
                      </div>
                    </div>
                  </div>
                </motion.div>

              ) : step === 2 ? (
                <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-black italic uppercase tracking-tighter mb-1">Renkler & Arma</h2>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Sahadaki imzanı oluştur.</p>
                  </div>

                  <div className="space-y-6 pt-4">
                    <div>
                      <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3 block">Ana Renk</label>
                      <div className="flex flex-wrap gap-3">
                        {availableColors.map(c => (
                          <button 
                            key={`c1-${c}`} onClick={() => updateData('color1', c)}
                            className={`w-12 h-12 rounded-full border-2 transition-all ${teamData.color1 === c ? 'border-white scale-110 shadow-lg' : 'border-white/10 hover:scale-105'}`}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                    </div>
                    
                    <div>
                      <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3 block">İkincil Renk (Gradient)</label>
                      <div className="flex flex-wrap gap-3">
                        {availableColors.map(c => (
                          <button 
                            key={`c2-${c}`} onClick={() => updateData('color2', c)}
                            className={`w-10 h-10 rounded-full border-2 transition-all ${teamData.color2 === c ? 'border-white scale-110 shadow-lg' : 'border-white/10 hover:scale-105'}`}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3 block">Arma Sembolü</label>
                      <div className="grid grid-cols-4 gap-3">
                        {crestOptions.map(crest => (
                          <button 
                            key={crest.id} onClick={() => updateData('crest', crest.id)}
                            className={`py-4 rounded-2xl border-2 flex items-center justify-center transition-all ${teamData.crest === crest.id ? 'border-[#39FF14] bg-[#39FF14]/5' : 'border-white/10 hover:bg-white/5'}`}
                          >
                            {renderCrest(crest.id, teamData.crest === crest.id ? '#39FF14' : '#666', "w-10 h-10")}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.div>

              ) : step === 3 ? (
                <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6 flex flex-col h-full">
                  <div>
                    <h2 className="text-2xl font-black italic uppercase tracking-tighter mb-1">Kurucu Kadro & Değer</h2>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Arkadaşlarını davet et, kaptanı seç ve takım değerini belirle.</p>
                  </div>

                  {/* Takım Değeri Input */}
                  <div className="bg-[#161B22] border border-white/10 rounded-2xl p-4 flex flex-col gap-3 shrink-0">
                      <div className="flex justify-between items-center">
                          <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Tahmini Değer (Piyasa)</label>
                          <div className="group relative">
                              <Info size={14} className="text-gray-400 cursor-pointer" />
                              <div className="absolute right-0 top-6 w-64 bg-gray-900 border border-white/10 rounded-xl p-3 shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 text-[10px] font-bold text-gray-300 pointer-events-none">
                                  <p className="text-emerald-400 mb-2">Gelecek Değer Skalası Referansları:</p>
                                  <ul className="space-y-1">
                                      <li>10 Maç, 5 Galibiyet -&gt; ~30.000 💎</li>
                                      <li>10 Maç, 8 Galibiyet -&gt; ~50.000 💎</li>
                                      <li>10 Maç, 10 Galibiyet -&gt; ~80.000 💎</li>
                                      <li>20 Maç, 16 Galibiyet -&gt; ~150.000 💎</li>
                                  </ul>
                              </div>
                          </div>
                      </div>
                      <div className="flex items-center gap-3">
                          <input 
                              type="number" 
                              value={teamData.teamValue} 
                              onChange={e => updateData('teamValue', e.target.value)}
                              placeholder="50000"
                              className="w-full bg-[#0A0E14] border border-white/10 rounded-xl px-4 py-3 text-amber-400 font-black outline-none focus:border-amber-400/50 transition-all text-lg tracking-widest"
                          />
                          <span className="text-xl font-black text-amber-400">💎</span>
                      </div>
                  </div>

                  {/* Group Filter Tabs */}
                  <div className="flex gap-2 overflow-x-auto pb-2 shrink-0 custom-scrollbar">
                      {groupTabs.map(g => (
                          <button 
                              key={g} 
                              onClick={() => setSelectedGroup(g)}
                              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors whitespace-nowrap border ${selectedGroup === g ? 'bg-white text-black border-white' : 'bg-transparent text-gray-500 border-white/10 hover:border-white/30'}`}
                          >
                              {g}
                          </button>
                      ))}
                  </div>

                  {/* Player List */}
                  <div className="flex-1 overflow-y-auto custom-scrollbar -mx-2 px-2 pb-4 space-y-2">
                    {friends.filter(f => selectedGroup === 'Tümü' || f.group === selectedGroup).length === 0 ? (
                      <div className="text-center py-10 text-gray-500">
                        <Users size={40} className="mx-auto mb-3 opacity-20" />
                        <p className="font-bold text-sm">Bu grupta kimse yok.</p>
                      </div>
                    ) : (
                      friends.filter(f => selectedGroup === 'Tümü' || f.group === selectedGroup).map(friend => {
                        const isSelected = teamData.players.includes(friend.id);
                        const isCaptain = teamData.captain === friend.id;
                        return (
                          <div 
                            key={friend.id} 
                            onClick={() => togglePlayer(friend.id)}
                            className={`flex items-center justify-between p-3 rounded-2xl border transition-all cursor-pointer ${isSelected ? 'bg-[#39FF14]/5 border-[#39FF14]/30' : 'bg-[#161B22] border-white/5 hover:border-white/20'}`}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center text-sm font-black text-white relative">
                                {friend.name.charAt(0)}
                                {isSelected && (
                                  <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-[#39FF14] rounded-full border-2 border-[#161B22] flex items-center justify-center">
                                    <Check size={10} className="text-black" />
                                  </div>
                                )}
                              </div>
                              <div>
                                <p className="text-sm font-black text-white">{friend.name}</p>
                                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{friend.pos} • {friend.group}</p>
                              </div>
                            </div>
                            
                            {isSelected && (
                              <button 
                                onClick={(e) => { e.stopPropagation(); updateData('captain', friend.id); }}
                                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${isCaptain ? 'bg-[#FFFF00] text-black shadow-[0_0_10px_rgba(255,255,0,0.5)]' : 'bg-white/10 text-gray-400 hover:text-[#FFFF00]'}`}
                                title="Kaptan Yap"
                              >
                                <span className="font-black text-xs">C</span>
                              </button>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </motion.div>

              ) : (
                <motion.div key="step4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-black italic uppercase tracking-tighter mb-1">Felsefe & Taktik</h2>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Sahaya nasıl dizileceksiniz?</p>
                  </div>

                  <div className="space-y-6 pt-4">
                    <div>
                      <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3 block">Diziliş</label>
                      <div className="grid grid-cols-4 gap-2">
                        {formations.map(form => (
                          <button 
                            key={form} onClick={() => updateData('formation', form)}
                            className={`py-3 rounded-xl border-2 font-black text-sm transition-all ${teamData.formation === form ? 'border-[#39FF14] text-[#39FF14] bg-[#39FF14]/5' : 'border-white/10 text-gray-400 hover:border-white/30'}`}
                          >
                            {form}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3 block">Oyun Tarzı</label>
                      <div className="grid grid-cols-2 gap-3">
                        {playstyles.map(style => {
                          const Icon = style.icon;
                          const isActive = teamData.playstyle === style.id;
                          return (
                            <button 
                              key={style.id} onClick={() => updateData('playstyle', style.id)}
                              className={`p-4 rounded-2xl border-2 flex flex-col items-start gap-2 transition-all text-left ${isActive ? 'border-[#39FF14] bg-[#39FF14]/5' : 'border-white/10 hover:border-white/30'}`}
                            >
                              <Icon size={20} className={isActive ? 'text-[#39FF14]' : 'text-gray-500'} />
                              <div>
                                <h4 className={`text-sm font-black uppercase tracking-widest ${isActive ? 'text-white' : 'text-gray-400'}`}>{style.id}</h4>
                                <p className="text-[9px] text-gray-500 font-bold uppercase mt-1">{style.desc}</p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Footer Actions */}
          {!isCreating && (
            <div className="p-8 border-t border-white/5 flex items-center justify-between shrink-0">
              <button 
                onClick={() => setStep(s => Math.max(1, s - 1))}
                className={`px-6 py-3 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center gap-2 transition-all ${step === 1 ? 'opacity-0 pointer-events-none' : 'bg-white/5 text-white hover:bg-white/10'}`}
              >
                <ChevronLeft size={16} /> Geri
              </button>
              
              {step < 4 ? (
                <button 
                  onClick={() => setStep(s => s + 1)}
                  disabled={step === 1 && !teamData.name}
                  className="px-8 py-3 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center gap-2 bg-white text-black hover:bg-gray-200 transition-all disabled:opacity-50"
                >
                  Devam <ChevronRight size={16} />
                </button>
              ) : (
                <button 
                  onClick={handleComplete}
                  className="px-8 py-3 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center gap-2 bg-[#39FF14] text-black hover:scale-105 active:scale-95 transition-all shadow-[0_0_20px_rgba(57,255,20,0.4)]"
                >
                  Kulübü Kur <Check size={16} />
                </button>
              )}
            </div>
          )}
          
        </div>
      </motion.div>
    </div>
  );
};
