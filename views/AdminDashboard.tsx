import React, { useState, useMemo } from 'react';
import { 
  ArrowLeft, Shield, Calendar, Users, AlertTriangle, UserMinus, 
  UserCheck, Plus, Trash2, X, Check, Loader2, Star, ShieldAlert,
  Search, Lock, Unlock, Play, LayoutGrid, Clock, MapPin
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppStore } from '../store';
import { MatchListing, PositionSlot, Player, Pitch } from '../types';
import { EmptyState } from '../components/common/StatusState';

interface AdminDashboardProps {
  onBack: () => void;
}

const FORMATS = ['5v5', '6v6', '7v7', '8v8', '9v9', '10v10', '11v11'];
const DIFFICULTIES = ['Ciddi', 'Taktiksel', 'Rahat'];

const generateSlotsForFormat = (format: string): PositionSlot[] => {
  let count = 10;
  if (format === '6v6') count = 12;
  else if (format === '7v7') count = 14;
  else if (format === '8v8') count = 16;
  else if (format === '9v9') count = 18;
  else if (format === '11v11') count = 22;

  const slots: PositionSlot[] = [];
  const half = count / 2;
  for (let i = 0; i < count; i++) {
    const isTeamA = i < half;
    let role = 'MID';
    
    // Assign typical roles based on position
    if (i === 0 || i === half) role = 'GK';
    else if (i === 1 || i === 2 || i === half + 1 || i === half + 2) role = 'DEF';
    else if (i === half - 1 || i === count - 1) role = 'FWD';

    slots.push({
      id: `slot_${i}_${Date.now()}`,
      role,
      x: 50,
      y: 50,
      status: 'OPEN'
    });
  }
  return slots;
};

const AdminDashboard: React.FC<AdminDashboardProps> = ({ onBack }) => {
  const { 
    adminMatches, 
    setAdminMatches, 
    adminPitches, 
    adminUsers, 
    banUser, 
    unbanUser 
  } = useAppStore();

  const [activeTab, setActiveTab] = useState<'MATCHES' | 'LIVE_SLOTS' | 'RISKY_PLAYERS'>('MATCHES');
  const [searchQuery, setSearchQuery] = useState('');

  // ─── Match Create States ───
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newMatch, setNewMatch] = useState({
    pitchId: '',
    date: '',
    time: '',
    price: '200',
    format: '7v7',
    difficulty: 'Taktiksel' as 'Ciddi' | 'Taktiksel' | 'Rahat',
    minRating: '3.0',
    matchTitle: '',
    homeTeamName: '',
    awayTeamName: ''
  });

  // ─── Slot Override States ───
  const [selectedMatchForOverride, setSelectedMatchForOverride] = useState<MatchListing | null>(null);
  const [selectedSlotForOverride, setSelectedSlotForOverride] = useState<PositionSlot | null>(null);
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [overridePlayerSearch, setOverridePlayerSearch] = useState('');

  // Pitches lookup
  const pitchMap = useMemo(() => {
    return new Map<string, Pitch>(adminPitches.map(p => [p.id, p]));
  }, [adminPitches]);

  // Filtered Users for Override
  const filteredUsersForOverride = useMemo(() => {
    if (!overridePlayerSearch) return adminUsers.slice(0, 5);
    return adminUsers.filter(u => 
      !u.isBanned &&
      (u.name.toLowerCase().includes(overridePlayerSearch.toLowerCase()) ||
       u.email.toLowerCase().includes(overridePlayerSearch.toLowerCase()))
    ).slice(0, 5);
  }, [adminUsers, overridePlayerSearch]);

  // Risky Users (Red Flags)
  const riskyUsers = useMemo(() => {
    return adminUsers.filter(u => {
      const matchesSearch = u.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            u.email.toLowerCase().includes(searchQuery.toLowerCase());
      // Risk criterion: Banned or trust score (rating) < 4.0
      const isRisky = u.isBanned || u.rating < 4.0;
      return matchesSearch && isRisky;
    });
  }, [adminUsers, searchQuery]);

  // Handle Match Creation
  const handleCreateMatch = (e: React.FormEvent) => {
    e.preventDefault();
    const selectedPitch = pitchMap.get(newMatch.pitchId) || adminPitches[0];
    if (!selectedPitch) return;

    const matchObj: MatchListing = {
      id: `match_${Date.now()}`,
      title: newMatch.matchTitle.trim() || `${selectedPitch.name} Arena`,
      homeTeamName: newMatch.homeTeamName.trim() || undefined,
      awayTeamName: newMatch.awayTeamName.trim() || undefined,
      location: selectedPitch.district,
      time: newMatch.time,
      date: newMatch.date,
      price: parseFloat(newMatch.price),
      difficulty: newMatch.difficulty,
      minRating: parseFloat(newMatch.minRating),
      image: selectedPitch.image,
      badges: ['Premium Saha', 'Duş İmkanı'],
      missingPositions: [],
      slots: generateSlotsForFormat(newMatch.format),
      status: 'ACTIVE'
    };

    setAdminMatches([matchObj, ...adminMatches]);
    setShowCreateModal(false);
  };

  // Handle Match Cancellation
  const handleCancelMatch = (id: string) => {
    if (confirm('Bu maçı iptal etmek istediğinizden emin misiniz? Bütün katılımcılar iade alacaktır.')) {
      setAdminMatches(adminMatches.map(m => m.id === id ? { ...m, status: 'CANCELLED' as const } : m));
    }
  };

  // Handle Slot Override (Assign Player Manually)
  const handleAssignPlayerOverride = (player: any) => {
    if (!selectedMatchForOverride || !selectedSlotForOverride) return;

    const updatedMatches = adminMatches.map(m => {
      if (m.id === selectedMatchForOverride.id) {
        const updatedSlots = m.slots.map(s => {
          if (s.id === selectedSlotForOverride.id) {
            return {
              ...s,
              status: 'TAKEN' as const,
              player: {
                id: player.id,
                name: player.name,
                rating: player.rating,
                avatar: player.avatar || '',
                position: s.role,
                x: s.x,
                y: s.y
              }
            };
          }
          return s;
        });
        return { ...m, slots: updatedSlots };
      }
      return m;
    });

    setAdminMatches(updatedMatches);
    setShowOverrideModal(false);
    setSelectedSlotForOverride(null);
    // Sync current selection
    const syncMatch = updatedMatches.find(m => m.id === selectedMatchForOverride.id) || null;
    setSelectedMatchForOverride(syncMatch);
  };

  // Handle Clear Slot Override
  const handleClearSlotOverride = (slotId: string) => {
    if (!selectedMatchForOverride) return;

    const updatedMatches = adminMatches.map(m => {
      if (m.id === selectedMatchForOverride.id) {
        const updatedSlots = m.slots.map(s => {
          if (s.id === slotId) {
            return {
              ...s,
              status: 'OPEN' as const,
              player: undefined
            };
          }
          return s;
        });
        return { ...m, slots: updatedSlots };
      }
      return m;
    });

    setAdminMatches(updatedMatches);
    const syncMatch = updatedMatches.find(m => m.id === selectedMatchForOverride.id) || null;
    setSelectedMatchForOverride(syncMatch);
  };

  return (
    <div className="fixed inset-0 bg-[#0A0E14] text-white flex flex-col font-sans overflow-hidden select-none">
      
      {/* ── HEADER (Glassmorphic & safe area top) ── */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-[#0E131F]/80 backdrop-blur-xl border-b border-white/5 pb-4 pt-safe px-5">
        <div className="flex items-center justify-between pt-3 mb-3">
          <button onClick={onBack} className="w-11 h-11 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 active:scale-95 transition-all shadow-md">
            <ArrowLeft size={20} className="text-white" />
          </button>
          
          <div className="text-center flex-1 mx-4">
            <h1 className="text-sm font-black uppercase tracking-[0.2em] italic text-white truncate leading-none">PATRON PANELİ</h1>
            <p className="text-[9px] text-[#39FF14] font-black uppercase tracking-widest mt-1.5">OYNA Master Admin Dashboard</p>
          </div>
          
          <div className="w-11 h-11 bg-red-500/10 border border-red-500/20 rounded-full flex items-center justify-center text-red-500 shadow-md">
            <Shield size={18} />
          </div>
        </div>

        {/* Tab Bar */}
        <div className="flex gap-1 bg-black/40 p-1 rounded-2xl border border-white/5 mt-2">
          <button
            onClick={() => { setActiveTab('MATCHES'); setSearchQuery(''); }}
            className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
              activeTab === 'MATCHES' ? 'bg-[#FFFF00] text-black shadow-md' : 'text-gray-500 hover:text-white'
            }`}
          >
            Maç / Saha
          </button>
          <button
            onClick={() => { setActiveTab('LIVE_SLOTS'); setSearchQuery(''); }}
            className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
              activeTab === 'LIVE_SLOTS' ? 'bg-[#FFFF00] text-black shadow-md' : 'text-gray-500 hover:text-white'
            }`}
          >
            Canlı Slot
          </button>
          <button
            onClick={() => { setActiveTab('RISKY_PLAYERS'); setSearchQuery(''); }}
            className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
              activeTab === 'RISKY_PLAYERS' ? 'bg-[#FFFF00] text-black shadow-md' : 'text-gray-500 hover:text-white'
            }`}
          >
            Kırmızı Bayrak
          </button>
        </div>
      </header>

      {/* ── CONTENT AREA ── */}
      <div className="flex-1 overflow-y-auto pt-36 pb-8 px-5 custom-scrollbar">
        
        {/* ── TABS Content ── */}
        {activeTab === 'MATCHES' && (
          <div className="space-y-5">
            <div className="flex justify-between items-center bg-[#121620]/40 rounded-[24px] p-4 border border-white/5">
              <div>
                <h3 className="text-xs font-black uppercase tracking-widest text-[#FFFF00]">Maç Yönetimi</h3>
                <p className="text-[9px] text-gray-500 font-bold uppercase mt-0.5">Sistemdeki tüm aktif maçları inceleyin ve yönetin</p>
              </div>
              <button 
                onClick={() => setShowCreateModal(true)}
                className="w-10 h-10 rounded-xl bg-[#39FF14] text-black flex items-center justify-center shadow-lg active:scale-95 transition-all"
              >
                <Plus size={20} />
              </button>
            </div>

            <div className="space-y-3.5">
              {adminMatches.map((match) => (
                <div 
                  key={match.id}
                  className={`bg-[#121620]/60 backdrop-blur-xl border rounded-[24px] p-5 flex flex-col gap-4 relative overflow-hidden transition-all ${
                    match.status === 'CANCELLED' ? 'border-red-900/30 opacity-60' : 'border-white/5'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div className="min-w-0">
                      <h4 className="text-xs font-black text-white truncate uppercase tracking-tight italic">{match.title}</h4>
                      <div className="flex items-center gap-2 mt-1.5 opacity-60">
                        <Clock size={11} className="text-[#39FF14]" />
                        <span className="text-[9px] font-black uppercase tracking-widest">{match.time} • {match.date}</span>
                      </div>
                    </div>
                    {match.status === 'CANCELLED' ? (
                      <span className="px-2 py-0.5 bg-red-500/10 border border-red-500/20 text-red-500 text-[8px] font-black tracking-widest rounded uppercase">İPTAL EDİLDİ</span>
                    ) : (
                      <span className="px-2 py-0.5 bg-[#39FF14]/10 border border-[#39FF14]/20 text-[#39FF14] text-[8px] font-black tracking-widest rounded uppercase">AKTİF</span>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-black/30 rounded-xl p-2.5 border border-white/5 text-center">
                      <span className="text-[8px] text-gray-500 font-bold block uppercase tracking-wider mb-0.5">Ücret</span>
                      <span className="text-xs font-black text-[#FFFF00]">{match.price}₺</span>
                    </div>
                    <div className="bg-black/30 rounded-xl p-2.5 border border-white/5 text-center">
                      <span className="text-[8px] text-gray-500 font-bold block uppercase tracking-wider mb-0.5">Katılım</span>
                      <span className="text-xs font-black text-white">{match.slots?.filter(s => s.status === 'TAKEN').length}/{match.slots?.length}</span>
                    </div>
                    <div className="bg-black/30 rounded-xl p-2.5 border border-white/5 text-center">
                      <span className="text-[8px] text-gray-500 font-bold block uppercase tracking-wider mb-0.5">Min Puan</span>
                      <span className="text-xs font-black text-white">{match.minRating}★</span>
                    </div>
                  </div>

                  {match.status !== 'CANCELLED' && (
                    <div className="flex gap-3 mt-1">
                      <button 
                        onClick={() => { setSelectedMatchForOverride(match); setActiveTab('LIVE_SLOTS'); }}
                        className="flex-1 h-9 rounded-xl bg-white/5 border border-white/10 text-white font-black text-[9px] uppercase tracking-widest hover:bg-white/10 active:scale-95 transition-all flex items-center justify-center gap-1"
                      >
                        Kuyruk & Slot
                      </button>
                      <button 
                        onClick={() => handleCancelMatch(match.id)}
                        className="h-9 px-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 font-black text-[9px] uppercase tracking-widest hover:bg-red-500 hover:text-white active:scale-95 transition-all flex items-center justify-center gap-1"
                      >
                        <Trash2 size={12} /> İptal
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── LIVE SLOTS TAB ── */}
        {activeTab === 'LIVE_SLOTS' && (
          <div className="space-y-5">
            <div className="bg-[#121620]/40 rounded-[24px] p-4 border border-white/5">
              <h3 className="text-xs font-black uppercase tracking-widest text-[#FFFF00]">Canlı Kadro & Kuyruk Değişimi</h3>
              <p className="text-[9px] text-gray-500 font-bold uppercase mt-0.5">Bir maç seçin ve slotları manuel olarak eşleştirin / sıfırlayın</p>
            </div>

            {/* Select Match dropdown */}
            <div className="relative">
              <select
                value={selectedMatchForOverride?.id || ''}
                onChange={(e) => {
                  const match = adminMatches.find(m => m.id === e.target.value) || null;
                  setSelectedMatchForOverride(match);
                }}
                className="w-full h-14 bg-black/40 border border-white/10 rounded-2xl px-4 text-xs font-black uppercase tracking-wider text-white appearance-none outline-none focus:border-[#FFFF00]/50"
              >
                <option value="" className="bg-[#0A0E14] text-gray-600">-- MAÇ SEÇİN --</option>
                {adminMatches.filter(m => m.status !== 'CANCELLED').map(m => (
                  <option key={m.id} value={m.id} className="bg-[#0A0E14] text-white">
                    {m.title.substring(0, 18)}... ({m.slots?.filter(s => s.status === 'TAKEN').length}/{m.slots?.length} Slot)
                  </option>
                ))}
              </select>
            </div>

            {selectedMatchForOverride ? (
              <div className="space-y-5 animate-in fade-in duration-300">
                <div className="flex justify-between items-center px-1">
                  <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">KADRO OVERRIDE (MÜDAHALE)</h4>
                  <span className="text-[9px] font-black text-[#FFFF00]">{selectedMatchForOverride.date} • {selectedMatchForOverride.time}</span>
                </div>

                <div className="space-y-2.5">
                  {selectedMatchForOverride.slots?.map((slot, idx) => {
                    const isTaken = slot.status === 'TAKEN';
                    return (
                      <div 
                        key={slot.id}
                        className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all ${
                          isTaken ? 'bg-black/35 border-white/5' : 'bg-black/10 border-dashed border-white/10'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-gray-600 font-mono text-[10px] w-4 shrink-0">{idx + 1}</span>
                          <span className={`w-6 h-6 rounded-lg text-[8px] font-black flex items-center justify-center shrink-0 ${
                            isTaken ? 'bg-[#39FF14]/10 text-[#39FF14] border border-[#39FF14]/20' : 'bg-white/5 border border-white/10 text-gray-400'
                          }`}>
                            {slot.role}
                          </span>
                          
                          {isTaken ? (
                            <div className="min-w-0">
                              <p className="text-xs font-black text-white truncate uppercase tracking-tight leading-none mb-1">{slot.player?.name}</p>
                              <span className="text-[8px] text-gray-500 font-bold">⭐️ {slot.player?.rating.toFixed(1)} Puan</span>
                            </div>
                          ) : (
                            <span className="text-xs font-bold text-gray-600 uppercase tracking-widest">Açık Slot / Boş</span>
                          )}
                        </div>

                        {isTaken ? (
                          <button 
                            onClick={() => handleClearSlotOverride(slot.id)}
                            className="h-8 px-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 font-black text-[9px] uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all active:scale-95 flex items-center gap-1"
                          >
                            <UserMinus size={11} /> Kaldır
                          </button>
                        ) : (
                          <button 
                            onClick={() => { setSelectedSlotForOverride(slot); setShowOverrideModal(true); }}
                            className="h-8 px-3 rounded-lg bg-[#39FF14] text-black font-black text-[9px] uppercase tracking-widest hover:scale-105 active:scale-95 transition-all flex items-center gap-1"
                          >
                            <Plus size={11} /> Ekle
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="text-center py-20 bg-[#121620]/20 border border-white/5 rounded-[28px] border-dashed flex flex-col items-center justify-center gap-3">
                <LayoutGrid size={32} className="text-gray-700" />
                <p className="text-xs font-bold text-gray-600 uppercase tracking-widest">MÜDAHALE ETMEK İÇİN LÜTFEN BİR MAÇ SEÇİN</p>
              </div>
            )}
          </div>
        )}

        {/* ── RED FLAGS / BAN DIRECTORY TAB ── */}
        {activeTab === 'RISKY_PLAYERS' && (
          <div className="space-y-5">
            <div className="bg-[#121620]/40 rounded-[24px] p-4 border border-white/5">
              <h3 className="text-xs font-black uppercase tracking-widest text-[#FFFF00]">Kırmızı Bayraklı Oyuncular</h3>
              <p className="text-[9px] text-gray-500 font-bold uppercase mt-0.5">Düşük güven skoru olan veya banlı hesapları denetleyin</p>
            </div>

            {/* Search */}
            <div className="relative group">
              <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-gray-500 group-focus-within:text-[#FFFF00] transition-colors">
                <Search size={18} />
              </div>
              <input
                type="text"
                placeholder="İsim veya mail adresi ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-12 bg-black/40 border border-white/10 rounded-xl pl-12 pr-4 text-xs font-bold outline-none focus:border-[#FFFF00]/50 transition-all"
              />
            </div>

            <div className="space-y-3">
              {riskyUsers.map((user) => (
                <div 
                  key={user.id}
                  className={`bg-[#121620]/60 backdrop-blur-xl border rounded-[24px] p-4 flex items-center justify-between transition-all ${
                    user.isBanned ? 'border-red-900/30' : 'border-white/5'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-sm shrink-0 ${
                      user.isBanned ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                    }`}>
                      {user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-black text-white truncate uppercase tracking-tight leading-none mb-1">{user.name}</p>
                      <div className="flex items-center gap-2">
                        <span className={`text-[8px] font-black px-1.5 py-0.5 rounded border ${
                          user.rating < 3.5 
                            ? 'bg-red-500/10 border-red-500/20 text-red-400' 
                            : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                        }`}>
                          Güven: {user.rating.toFixed(1)}★
                        </span>
                        <span className="text-[7.5px] text-gray-500 font-bold uppercase tracking-wider">{user.email}</span>
                      </div>
                    </div>
                  </div>

                  {user.isBanned ? (
                    <button 
                      onClick={() => unbanUser(user.id)}
                      className="h-9 px-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-black text-[9px] uppercase tracking-widest hover:bg-emerald-500 hover:text-black transition-all active:scale-95 flex items-center gap-1"
                    >
                      <Unlock size={11} /> Yasağı Kaldır
                    </button>
                  ) : (
                    <button 
                      onClick={() => banUser(user.id)}
                      className="h-9 px-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 font-black text-[9px] uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all active:scale-95 flex items-center gap-1"
                    >
                      <Lock size={11} /> Yasakla
                    </button>
                  )}
                </div>
              ))}

              {riskyUsers.length === 0 && (
                <div className="text-center py-12 bg-[#121620]/20 border border-white/5 rounded-[28px] border-dashed flex flex-col items-center justify-center gap-2">
                  <ShieldAlert size={26} className="text-gray-700" />
                  <p className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">TEMİZ: RİSKLİ VEYA BANLI HESAP BULUNMUYOR</p>
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      {/* ── CREATE MATCH MODAL ── */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-end justify-center">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowCreateModal(false)} className="absolute inset-0 bg-black/85 backdrop-blur-sm" />
            <motion.div 
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative w-full max-w-md bg-[#161B22] border-t border-white/10 rounded-t-[32px] p-6 pb-safe shadow-2xl z-10 space-y-5"
            >
              <div className="w-12 h-1 bg-gray-800 rounded-full mx-auto mb-2" />
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-black text-white italic tracking-tighter uppercase">YENİ MAÇ OLUŞTUR</h3>
                <button onClick={() => setShowCreateModal(false)} className="w-8 h-8 bg-black/40 rounded-full flex items-center justify-center text-gray-400 hover:text-white"><X size={16} /></button>
              </div>

              <form onSubmit={handleCreateMatch} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1 pb-4 custom-scrollbar">
                
                {/* Pitch Select */}
                <div>
                  <label className="text-[9px] text-gray-500 font-black tracking-widest uppercase mb-1.5 block">TESİS SEÇİMİ</label>
                  <select
                    required
                    value={newMatch.pitchId}
                    onChange={(e) => setNewMatch({...newMatch, pitchId: e.target.value})}
                    className="w-full h-12 bg-black/40 border border-white/10 rounded-xl px-3 text-xs font-black uppercase text-white appearance-none outline-none focus:border-[#FFFF00]/50"
                  >
                    <option value="" className="bg-[#161B22] text-gray-500">Seçiniz...</option>
                    {adminPitches.map(p => (
                      <option key={p.id} value={p.id} className="bg-[#161B22] text-white">{p.name}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Date */}
                  <div>
                    <label className="text-[9px] text-gray-500 font-black tracking-widest uppercase mb-1.5 block">TARİH</label>
                    <input
                      type="text"
                      required
                      placeholder="Örn: 27 Mayıs Çar"
                      value={newMatch.date}
                      onChange={(e) => setNewMatch({...newMatch, date: e.target.value})}
                      className="w-full h-12 bg-black/40 border border-white/10 rounded-xl px-3 text-xs font-bold text-white outline-none focus:border-[#FFFF00]/50"
                    />
                  </div>
                  {/* Time */}
                  <div>
                    <label className="text-[9px] text-gray-500 font-black tracking-widest uppercase mb-1.5 block">SAAT</label>
                    <input
                      type="text"
                      required
                      placeholder="Örn: 20:00 - 21:00"
                      value={newMatch.time}
                      onChange={(e) => setNewMatch({...newMatch, time: e.target.value})}
                      className="w-full h-12 bg-black/40 border border-white/10 rounded-xl px-3 text-xs font-bold text-white outline-none focus:border-[#FFFF00]/50"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Price */}
                  <div>
                    <label className="text-[9px] text-gray-500 font-black tracking-widest uppercase mb-1.5 block">ÜCRET (₺)</label>
                    <input
                      type="number"
                      required
                      value={newMatch.price}
                      onChange={(e) => setNewMatch({...newMatch, price: e.target.value})}
                      className="w-full h-12 bg-black/40 border border-white/10 rounded-xl px-3 text-xs font-bold text-white outline-none focus:border-[#FFFF00]/50"
                    />
                  </div>
                  {/* Format */}
                  <div>
                    <label className="text-[9px] text-gray-500 font-black tracking-widest uppercase mb-1.5 block">KAPASİTE / FORMAT</label>
                    <select
                      value={newMatch.format}
                      onChange={(e) => setNewMatch({...newMatch, format: e.target.value})}
                      className="w-full h-12 bg-black/40 border border-white/10 rounded-xl px-3 text-xs font-black uppercase text-white appearance-none outline-none focus:border-[#FFFF00]/50"
                    >
                      {FORMATS.map(f => (
                        <option key={f} value={f} className="bg-[#161B22] text-white">{f}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Difficulty */}
                  <div>
                    <label className="text-[9px] text-gray-500 font-black tracking-widest uppercase mb-1.5 block">ZORLUK</label>
                    <select
                      value={newMatch.difficulty}
                      onChange={(e) => setNewMatch({...newMatch, difficulty: e.target.value as any})}
                      className="w-full h-12 bg-black/40 border border-white/10 rounded-xl px-3 text-xs font-black uppercase text-white appearance-none outline-none focus:border-[#FFFF00]/50"
                    >
                      {DIFFICULTIES.map(d => (
                        <option key={d} value={d} className="bg-[#161B22] text-white">{d}</option>
                      ))}
                    </select>
                  </div>
                  {/* Minimum Rating */}
                  <div>
                    <label className="text-[9px] text-gray-500 font-black tracking-widest uppercase mb-1.5 block">MİN GÜVEN PUANI</label>
                    <select
                      value={newMatch.minRating}
                      onChange={(e) => setNewMatch({...newMatch, minRating: e.target.value})}
                      className="w-full h-12 bg-black/40 border border-white/10 rounded-xl px-3 text-xs font-black uppercase text-white appearance-none outline-none focus:border-[#FFFF00]/50"
                    >
                      {['0.0', '3.0', '3.5', '4.0', '4.5'].map(r => (
                        <option key={r} value={r} className="bg-[#161B22] text-white">{r}★</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Opsiyonel: Maç Adı */}
                <div>
                  <label className="text-[9px] text-gray-500 font-black tracking-widest uppercase mb-1.5 block">MAÇ ADI <span className="text-gray-600 normal-case font-normal">(opsiyonel)</span></label>
                  <input
                    type="text"
                    placeholder="Süper Lig Derbisi…"
                    value={newMatch.matchTitle}
                    onChange={(e) => setNewMatch({...newMatch, matchTitle: e.target.value})}
                    maxLength={40}
                    className="w-full h-12 bg-black/40 border border-white/10 rounded-xl px-3 text-xs font-bold text-white outline-none focus:border-[#FFFF00]/50"
                  />
                </div>

                {/* Opsiyonel: Takım Adları */}
                <div>
                  <label className="text-[9px] text-gray-500 font-black tracking-widest uppercase mb-1.5 block">TAKIM ADLARI <span className="text-gray-600 normal-case font-normal">(opsiyonel)</span></label>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      placeholder="Ev Sahibi"
                      value={newMatch.homeTeamName}
                      onChange={(e) => setNewMatch({...newMatch, homeTeamName: e.target.value})}
                      maxLength={20}
                      className="w-full h-12 bg-black/40 border border-white/10 rounded-xl px-3 text-xs font-bold text-white outline-none focus:border-white/40"
                    />
                    <input
                      type="text"
                      placeholder="Deplasman"
                      value={newMatch.awayTeamName}
                      onChange={(e) => setNewMatch({...newMatch, awayTeamName: e.target.value})}
                      maxLength={20}
                      className="w-full h-12 bg-black/40 border border-white/10 rounded-xl px-3 text-xs font-bold text-white outline-none focus:border-red-500/40"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full h-14 bg-[#39FF14] text-black font-black rounded-2xl text-xs uppercase tracking-[0.25em] shadow-[0_0_20px_rgba(57,255,20,0.2)] hover:shadow-[0_0_30px_rgba(57,255,20,0.3)] transition-all pt-1"
                >
                  MAÇI YAYINLA
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── SLOT OVERRIDE PLAYER PICKER MODAL ── */}
      <AnimatePresence>
        {showOverrideModal && selectedSlotForOverride && (
          <div className="fixed inset-0 z-[60] flex items-end justify-center">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => { setShowOverrideModal(false); setSelectedSlotForOverride(null); }} className="absolute inset-0 bg-black/85 backdrop-blur-sm" />
            <motion.div 
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative w-full max-w-md bg-[#161B22] border-t border-white/10 rounded-t-[32px] p-6 pb-safe shadow-2xl z-10 space-y-5"
            >
              <div className="w-12 h-1 bg-gray-800 rounded-full mx-auto mb-2" />
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-black text-white italic tracking-tighter uppercase">OYUNCU MÜDAHALESİ (EKLE)</h3>
                  <p className="text-[9px] text-[#FFFF00] font-black uppercase tracking-wider mt-0.5">POZİSYON: {selectedSlotForOverride.role}</p>
                </div>
                <button onClick={() => { setShowOverrideModal(false); setSelectedSlotForOverride(null); }} className="w-8 h-8 bg-black/40 rounded-full flex items-center justify-center text-gray-400 hover:text-white"><X size={16} /></button>
              </div>

              {/* Search override user */}
              <div className="relative group">
                <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-gray-500 group-focus-within:text-[#FFFF00] transition-colors">
                  <Search size={16} />
                </div>
                <input
                  type="text"
                  placeholder="Kullanıcı ara..."
                  value={overridePlayerSearch}
                  onChange={(e) => setOverridePlayerSearch(e.target.value)}
                  className="w-full h-11 bg-black/40 border border-white/10 rounded-xl pl-11 pr-4 text-xs font-bold outline-none focus:border-[#FFFF00]/50 transition-all text-white"
                  autoFocus
                />
              </div>

              <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                {filteredUsersForOverride.map(user => (
                  <div 
                    key={user.id} 
                    className="flex items-center justify-between p-3 bg-black/20 border border-white/5 rounded-2xl"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center font-black text-xs text-white">
                        {user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-white uppercase tracking-tight leading-none mb-1">{user.name}</h4>
                        <span className="text-[8px] text-gray-500 font-bold">⭐️ {user.rating.toFixed(1)} Puan</span>
                      </div>
                    </div>
                    <button 
                      onClick={() => handleAssignPlayerOverride(user)}
                      className="px-3.5 py-2 bg-[#39FF14] text-black text-[9px] font-black uppercase tracking-widest rounded-xl hover:scale-105 active:scale-95 transition-all shadow-md flex items-center gap-1"
                    >
                      <UserCheck size={11} /> SAHAYA EKLE
                    </button>
                  </div>
                ))}

                {filteredUsersForOverride.length === 0 && (
                  <EmptyState title="Oyuncu Bulunamadı" message="Aramaya uygun aktif bir oyuncu bulunamadı." />
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};

export default AdminDashboard;
