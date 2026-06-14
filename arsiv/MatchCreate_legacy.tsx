
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, ChevronRight, Users, UserPlus, Share2, Search,
  Shield, Scale, Star, Check, Plus, Copy, X, Zap, MapPin,
  Trophy, Layers, Droplets, CreditCard, SkipForward,
  CalendarCheck, Activity, Swords, Clock, ChevronLeft, Globe, Lock,
  Filter, Map as MapIcon, LayoutGrid, Heart, Thermometer, Wind
} from 'lucide-react';
import { Pitch, Goalkeeper, Referee, AppView } from '../types';
import { useAppStore } from '../store';
import OpponentFinder from './OpponentFinder';
import Marketplace from './Marketplace';

import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix leafet default icon path issues
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});


interface MatchCreateProps {
  onBack: () => void;
  onNavigate: (view: AppView) => void;
}

// ─── DATA ─────────────────────────────────────────────────────────────────────
const FORMATS = [
  { v: '3v3', label: '3v3', players: 6,  popular: false },
  { v: '4v4', label: '4v4', players: 8,  popular: false },
  { v: '5v5', label: '5v5', players: 10, popular: false },
  { v: '6v6', label: '6v6', players: 12, popular: false },
  { v: '7v7', label: '7v7', players: 14, popular: true  },
  { v: '8v8', label: '8v8', players: 16, popular: true  },
  { v: '9v9', label: '9v9', players: 18, popular: false },
  { v: '11v11', label: '11v11', players: 22, popular: false },
];

const STEP_LABELS = ['Format', 'Takımlar', 'Saha', 'Hizmetler', 'Ödeme'];

// ─── PROGRESS BAR ──────────────────────────────────────────────────────────────
const ProgressBar: React.FC<{ step: number }> = ({ step }) => (
  <div className="flex items-center gap-0 px-4 py-4 bg-[#0A0E14] border-b border-white/5">
    {STEP_LABELS.map((label, i) => {
      const num = i + 1;
      const isActive = num === step;
      const isDone = num < step;
      return (
        <React.Fragment key={label}>
          <div className="flex flex-col items-center gap-0.5 min-w-0">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black transition-all duration-300 flex-shrink-0 ${isDone ? 'bg-[#FFFF00] text-black' : isActive ? 'bg-[#FFFF00] text-black shadow-[0_0_10px_rgba(255,255,0,0.5)]' : 'bg-white/10 text-gray-500'}`}>
              {isDone ? <Check size={11} /> : num}
            </div>
            <span className={`text-[7px] font-black uppercase tracking-widest truncate max-w-[44px] text-center ${isActive || isDone ? 'text-[#FFFF00]' : 'text-gray-600'}`}>{label}</span>
          </div>
          {i < STEP_LABELS.length - 1 && (
            <div className="flex-1 h-0.5 mx-1 rounded-full overflow-hidden bg-white/5 min-w-0">
              <motion.div className="h-full bg-[#FFFF00] rounded-full"
                animate={{ width: isDone ? '100%' : '0%' }}
                transition={{ duration: 0.4 }} />
            </div>
          )}
        </React.Fragment>
      );
    })}
  </div>
);

// ─── STEP 1: FORMAT ────────────────────────────────────────────────────────────
const FormatStep: React.FC<{ onSelect: (f: typeof FORMATS[0]) => void }> = ({ onSelect }) => {
  const [selected, setSelected] = useState('7v7');
  return (
    <motion.div key="fmt" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}
      className="flex-1 px-5 py-6 space-y-6 overflow-y-auto custom-scrollbar">
      <div>
        <h2 className="text-2xl font-black text-white italic uppercase">Maç Formatı</h2>
        <p className="text-xs text-gray-500 mt-1">Saha tipini ve oyuncu sayısını seç</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {FORMATS.map(fmt => {
          const isSelected = selected === fmt.v;
          return (
            <motion.button key={fmt.v} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }}
              onClick={() => setSelected(fmt.v)}
              className={`relative rounded-2xl p-4 border text-left transition-all ${isSelected ? 'bg-[#FFFF00]/10 border-[#FFFF00] shadow-[0_0_20px_rgba(255,255,0,0.15)]' : 'bg-[#161B22] border-white/5 hover:border-white/20'}`}>
              {fmt.popular && (
                <span className="absolute -top-2 right-2 px-2 py-0.5 bg-orange-500 text-white text-[8px] font-black uppercase tracking-widest rounded-full">🔥 Popüler</span>
              )}
              <p className={`text-2xl font-black mb-1 ${isSelected ? 'text-[#FFFF00]' : 'text-white'}`}>{fmt.label}</p>
              <p className="text-[10px] text-gray-500 font-bold uppercase">{fmt.players} Oyuncu</p>
              {isSelected && <Check size={14} className="absolute top-3 right-3 text-[#FFFF00]" />}
            </motion.button>
          );
        })}
      </div>
      <div className="p-4 bg-[#161B22] border border-white/5 rounded-2xl flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-[#FFFF00]/10 flex items-center justify-center text-2xl">⚽</div>
        <div>
          <p className="text-sm font-black text-white">{FORMATS.find(f => f.v === selected)?.label} Seçildi</p>
          <p className="text-[10px] text-gray-500">Her takımda {parseInt(selected) || 7} oyuncu</p>
        </div>
      </div>
      <motion.button whileTap={{ scale: 0.97 }} onClick={() => onSelect(FORMATS.find(f => f.v === selected)!)}
        className="w-full h-14 bg-[#FFFF00] text-black font-black text-sm rounded-2xl flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(255,255,0,0.25)] hover:bg-yellow-300 transition-colors">
        DEVAM ET <ChevronRight size={18} />
      </motion.button>
    </motion.div>
  );
};

// ─── STEP 2: TEAMS ─────────────────────────────────────────────────────────────
const TeamsStep: React.FC<{ format: typeof FORMATS[0]; onNext: (c: number) => void }> = ({ format, onNext }) => {
  const { friends, userTeams } = useAppStore();
  const perTeam = parseInt(format.v.split('v')[0]);
  const [myPlayers, setMyPlayers] = useState<{ id: string; name: string; avatar: string }[]>([]);
  const [showFriendPicker, setShowFriendPicker] = useState(false);
  const [quickName, setQuickName] = useState('');
  const [showQuickInput, setShowQuickInput] = useState(false);
  const [showTeamPicker, setShowTeamPicker] = useState(false);
  const [opponentCode] = useState(() => Math.random().toString(36).slice(2, 8).toUpperCase());
  const [codeCopied, setCodeCopied] = useState(false);

  const confirmedFriends = friends.filter(f => f.status === 'FRIEND');
  const slots = Array.from({ length: perTeam });

  const addFriend = (f: typeof confirmedFriends[0]) => {
    if (myPlayers.find(p => p.id === f.id) || myPlayers.length >= perTeam) return;
    setMyPlayers(prev => [...prev, { id: f.id, name: f.name, avatar: f.avatar }]);
    setShowFriendPicker(false);
  };
  const addQuick = () => {
    if (!quickName.trim() || myPlayers.length >= perTeam) return;
    setMyPlayers(prev => [...prev, { id: `q-${Date.now()}`, name: quickName.trim(), avatar: '' }]);
    setQuickName(''); setShowQuickInput(false);
  };
  const copyCode = () => {
    navigator.clipboard?.writeText(opponentCode).catch(() => {});
    setCodeCopied(true); setTimeout(() => setCodeCopied(false), 2000);
  };

  return (
    <motion.div key="teams" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}
      className="flex-1 px-5 py-5 space-y-5 overflow-y-auto custom-scrollbar">
      <div>
        <h2 className="text-2xl font-black text-white italic uppercase">Takımları Kur</h2>
        <p className="text-xs text-gray-500 mt-1">Her takıma {perTeam} oyuncu • Format: {format.label}</p>
      </div>

      {/* BENİM TAKIM */}
      <div className="bg-[#161B22] rounded-2xl border border-[#FFFF00]/20 overflow-hidden">
        <div className="px-4 py-3 bg-[#FFFF00]/5 border-b border-[#FFFF00]/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-[#FFFF00] rounded-full" />
            <span className="text-xs font-black text-[#FFFF00] uppercase tracking-widest">BENİM TAKIM</span>
          </div>
          <span className="text-[10px] text-gray-500 font-bold">{myPlayers.length}/{perTeam} Oyuncu</span>
        </div>
        <div className="p-3 space-y-2">
          {slots.map((_, i) => {
            const p = myPlayers[i];
            return (
              <div key={i} className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all ${p ? 'border-[#FFFF00]/20 bg-[#FFFF00]/5' : 'border-dashed border-white/10'}`}>
                {p ? (
                  <>
                    {p.avatar ? <img src={p.avatar} className="w-8 h-8 rounded-full" alt="" /> : <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-sm">{p.name[0]}</div>}
                    <span className="text-sm font-bold text-white flex-1">{p.name}</span>
                    <button onClick={() => setMyPlayers(prev => prev.filter(pl => pl.id !== p.id))} className="w-6 h-6 rounded-full bg-red-500/10 text-red-400 flex items-center justify-center hover:bg-red-500/30 transition-colors"><X size={10} /></button>
                  </>
                ) : <span className="text-xs text-gray-600 font-bold">Oyuncu {i + 1}</span>}
              </div>
            );
          })}
        </div>
        <div className="px-3 pb-3 grid grid-cols-3 gap-2">
          <button onClick={() => { setShowTeamPicker(true); setShowFriendPicker(false); setShowQuickInput(false); }}
            className="flex items-center justify-center gap-2 h-10 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-xl text-[10px] font-black uppercase hover:bg-blue-500/20 transition-all">
            <Users size={13} /> Kayıtlı Adresim
          </button>
          <button onClick={() => { setShowFriendPicker(true); setShowTeamPicker(false); setShowQuickInput(false); }}
            className="flex items-center justify-center gap-2 h-10 bg-[#FFFF00]/10 text-[#FFFF00] border border-[#FFFF00]/20 rounded-xl text-[10px] font-black uppercase hover:bg-[#FFFF00]/20 transition-all">
            <UserPlus size={13} /> Davet Et
          </button>
          <button onClick={() => { setShowQuickInput(true); setShowFriendPicker(false); setShowTeamPicker(false); }}
            className="flex items-center justify-center gap-2 h-10 bg-white/5 text-white border border-white/10 rounded-xl text-[10px] font-black uppercase hover:bg-white/10 transition-all">
            <Plus size={13} /> Geçici Ad
          </button>
        </div>
        <AnimatePresence>
          {showTeamPicker && (
            <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
              <div className="border-t border-white/5 p-3 space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Kayıtlı Takımlarım</p>
                {userTeams.map(t => (
                  <button key={t.id} 
                    onClick={() => {
                      const newPlayers = t.roster.slice(0, perTeam).map(p => ({ id: p.id, name: p.name, avatar: p.avatar }));
                      setMyPlayers(newPlayers);
                      setShowTeamPicker(false);
                    }}
                    className="w-full flex items-center justify-between p-2 rounded-xl border border-white/5 hover:border-[#FFFF00]/30 hover:bg-[#FFFF00]/5 transition-all group">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#161B22] border border-[#FFFF00]/10 p-1 flex items-center justify-center group-hover:bg-black">
                        <img src={t.logo} className="w-full h-full object-contain" alt="" />
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-black text-white italic tracking-tighter uppercase">{t.name}</p>
                        <p className="text-[10px] text-gray-400">{t.roster.length} Oyuncu</p>
                      </div>
                    </div>
                    <ChevronRight size={14} className="text-gray-500 group-hover:text-[#FFFF00] transition-colors" />
                  </button>
                ))}
                {userTeams.length === 0 && <p className="text-xs text-gray-600 text-center py-2">Henüz kayıtlı takımın yok.</p>}
              </div>
            </motion.div>
          )}
          {showFriendPicker && (
            <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
              <div className="border-t border-white/5 p-3 space-y-2">
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Arkadaşlarım</p>
                {confirmedFriends.map(f => {
                  const already = myPlayers.some(p => p.id === f.id);
                  return (
                    <button key={f.id} onClick={() => addFriend(f)} disabled={already || myPlayers.length >= perTeam}
                      className={`w-full flex items-center gap-3 p-2 rounded-xl transition-all ${already ? 'opacity-40 cursor-not-allowed' : 'hover:bg-white/5'}`}>
                      <img src={f.avatar} className="w-8 h-8 rounded-full" alt="" />
                      <div className="text-left flex-1">
                        <p className="text-sm font-bold text-white">{f.name}</p>
                        <p className="text-[10px] text-gray-500">{f.position}</p>
                      </div>
                      {already ? <Check size={14} className="text-[#FFFF00]" /> : <Plus size={14} className="text-gray-500" />}
                    </button>
                  );
                })}
                {confirmedFriends.length === 0 && <p className="text-xs text-gray-600 text-center py-2">Henüz arkadaşın yok.</p>}
              </div>
            </motion.div>
          )}
          {showQuickInput && (
            <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden">
              <div className="border-t border-white/5 p-3 flex gap-2">
                <input autoFocus type="text" value={quickName} onChange={e => setQuickName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addQuick()}
                  placeholder="Oyuncu adı..." className="flex-1 bg-[#0A0E14] border border-white/10 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-[#FFFF00]/50" />
                <button onClick={addQuick} className="px-4 bg-[#FFFF00] text-black font-black text-xs rounded-xl hover:bg-yellow-300 transition-colors">EKLE</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <motion.button whileTap={{ scale: 0.97 }} onClick={() => onNext(myPlayers.length)}
        className="w-full h-14 bg-[#FFFF00] text-black font-black text-sm rounded-2xl flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(255,255,0,0.25)] hover:bg-yellow-300 transition-colors">
        SAHAYA GEÇ <ChevronRight size={18} />
      </motion.button>
    </motion.div>
  );
};

// ──────────────────────────────────────────────────────────────────────────────
// SHARED HELPERS
// ──────────────────────────────────────────────────────────────────────────────
const getGrade = (s: number) => {
  if (s >= 95) return 'A+'; if (s >= 90) return 'A'; if (s >= 85) return 'A-';
  if (s >= 80) return 'B+'; if (s >= 75) return 'B'; if (s >= 70) return 'B-'; return 'C';
};
const gradeColor = (g: string) =>
  g.startsWith('A') ? 'text-emerald-400' : g.startsWith('B') ? 'text-yellow-400' : 'text-orange-400';

const SkillBar: React.FC<{ label: string; value: number; color: string }> = ({ label, value, color }) => (
  <div className="space-y-1">
    <div className="flex justify-between items-center px-1">
      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-tighter">{label}</span>
      <span className="text-[10px] font-black text-white">{value}</span>
    </div>
    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
      <motion.div initial={{ width: 0 }} animate={{ width: `${value}%` }} transition={{ duration: 1, ease: 'easeOut' }} className={`h-full ${color} rounded-full`} />
    </div>
  </div>
);

// ─── MAP & PITCH HELPERS ───────────────────────────────────────────────────────
const AIRBNB_MAP_CSS = `
  .leaflet-popup-content-wrapper { background: transparent !important; padding: 0 !important; box-shadow: none !important; border: none !important; }
  .leaflet-popup-tip-container { display: none !important; }
  .leaflet-popup-content { margin: 0 !important; }
  .leaflet-container { background: #060B12 !important; font-family: inherit; }
  .leaflet-control-attribution { display: none !important; }
  .leaflet-control-zoom { display: none !important; }
  .oyna-pitch-pin { cursor: pointer; }
  .oyna-pitch-pin .pin-bubble {
    display: flex; align-items: center; gap: 4px;
    background: #0D111A;
    border: 1.5px solid rgba(57,255,20,0.3);
    color: #39FF14;
    font-size: 10px; font-weight: 900; font-family: inherit;
    padding: 6px 10px; border-radius: 100px;
    white-space: nowrap;
    box-shadow: 0 4px 24px rgba(0,0,0,0.7), 0 0 12px rgba(57,255,20,0.15);
    transform: translate(-50%, -100%) translateY(-8px);
    transition: all 0.2s ease;
  }
  .oyna-pitch-pin .pin-bubble.selected {
    background: #39FF14; color: #000;
    border-color: #39FF14;
    box-shadow: 0 4px 24px rgba(0,0,0,0.7), 0 0 24px rgba(57,255,20,0.6);
    transform: translate(-50%, -100%) translateY(-8px) scale(1.15);
  }
  .oyna-pitch-pin .pin-nub {
    width: 8px; height: 8px; border-radius: 50%;
    background: #39FF14;
    position: absolute; bottom: -4px; left: 50%;
    transform: translateX(-50%);
    box-shadow: 0 0 10px rgba(57,255,20,0.8);
    transition: all 0.2s ease;
  }
  .oyna-pitch-pin .pin-nub.selected { background: #000; box-shadow: 0 0 15px rgba(57,255,20,1); }
  .leaflet-tile-pane { filter: brightness(0.9) saturate(0.6); }
`;

const createPitchPin = (pitch: Pitch, isSelected: boolean) => {
  const priceLabel = pitch.totalPrice ? `${pitch.totalPrice}₺` : pitch.name.split(' ')[0];
  return L.divIcon({
    className: 'oyna-pitch-pin',
    html: `
      <div style="position:relative;display:inline-block;">
        <div class="pin-bubble ${isSelected ? 'selected' : ''}">
          <svg width="8" height="8" viewBox="0 0 8 8" fill="${isSelected ? '#000' : '#39FF14'}"><circle cx="4" cy="4" r="4"/></svg>
          ${priceLabel}
        </div>
        <div class="pin-nub ${isSelected ? 'selected' : ''}"></div>
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
};

interface MapViewProps { pitches: Pitch[]; selectedPitch: Pitch | null; onPitchSelect: (p: Pitch) => void; }

const PitchMapResizer = () => {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => { map.invalidateSize(); }, 200);
    return () => clearTimeout(t);
  }, [map]);
  return null;
};

const MapViewComponent = ({ pitches, selectedPitch, onPitchSelect }: MapViewProps) => {
  const center: [number, number] = [41.0082, 28.9784];

  return (
    <div className="absolute inset-0 z-0">
      <style>{AIRBNB_MAP_CSS}</style>
      <MapContainer center={center} zoom={12} className="w-full h-full" zoomControl={false}>
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution=""
        />
        <PitchMapResizer />
        {pitches.map(pitch => {
          if (!pitch.coordinates?.lat || !pitch.coordinates?.lng) return null;
          const isSel = selectedPitch?.id === pitch.id;
          return (
            <Marker
              key={pitch.id}
              position={[pitch.coordinates.lat, pitch.coordinates.lng]}
              icon={createPitchPin(pitch, isSel)}
              eventHandlers={{ click: () => onPitchSelect(pitch) }}
            >
              <Popup closeButton={false} offset={[0, -30]}>
                <div
                  onClick={() => onPitchSelect(pitch)}
                  style={{
                    width: 200,
                    background: 'rgba(13,17,26,0.96)',
                    backdropFilter: 'blur(20px)',
                    border: '1px solid rgba(57,255,20,0.2)',
                    borderRadius: 20,
                    overflow: 'hidden',
                    boxShadow: '0 16px 48px rgba(0,0,0,0.8)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ position: 'relative', height: 100 }}>
                    <img src={pitch.image} alt={pitch.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <div style={{
                      position: 'absolute', inset: 0,
                      background: 'linear-gradient(to bottom, transparent 40%, rgba(13,17,26,0.95))',
                    }} />
                    <div style={{
                      position: 'absolute', top: 8, right: 8,
                      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
                      borderRadius: 100, padding: '3px 8px',
                      display: 'flex', alignItems: 'center', gap: 4,
                      fontSize: 10, fontWeight: 900, color: '#FACC15',
                    }}>
                      ★ {pitch.rating}
                    </div>
                  </div>
                  <div style={{ padding: '10px 12px 12px' }}>
                    <div style={{ fontSize: 11, fontWeight: 900, color: '#fff', textTransform: 'uppercase', letterSpacing: 0.5 }}>{pitch.name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>{pitch.district}</div>
                      <div style={{ fontSize: 12, fontWeight: 900, color: '#39FF14' }}>{pitch.totalPrice}₺</div>
                    </div>
                    <div style={{
                      marginTop: 8, padding: '6px 10px',
                      background: 'rgba(57,255,20,0.12)', borderRadius: 10,
                      border: '1px solid rgba(57,255,20,0.2)',
                      textAlign: 'center', fontSize: 9, fontWeight: 900,
                      color: '#39FF14', textTransform: 'uppercase', letterSpacing: 1,
                    }}>
                      Rezerve Et →
                    </div>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
};


// --- COMPONENTS ---

const GradeBadge: React.FC<{ label: string; score: number; icon: any }> = ({ label, score, icon: Icon }) => {
  const grade = getGrade(score);
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-gray-400 mb-1">
        <Icon size={18} />
      </div>
      <span className="text-[8px] font-black text-gray-500 uppercase tracking-tighter">{label}</span>
      <span className={`text-sm font-black ${gradeColor(grade)}`}>{grade}</span>
    </div>
  );
};

const PitchCard: React.FC<{ pitch: Pitch; onClick: (pitch: Pitch) => void }> = ({ pitch, onClick }) => {
  const [timeLeft, setTimeLeft] = useState(Math.floor(Math.random() * 3600) + 1800); // Random 30-90 mins

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onClick(pitch)}
      className="relative w-full h-[420px] rounded-[40px] overflow-hidden mb-6 cursor-pointer group shadow-2xl"
    >
      {/* Background Image */}
      <img
        src={pitch.image}
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
        alt={pitch.name}
      />

      {/* Overlays */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#0A0E14] via-black/20 to-transparent"></div>
      <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors"></div>

      {/* Top Badges */}
      <div className="absolute top-6 left-6 flex flex-col gap-2">
        <div className="flex gap-2">
          <div className="px-3 py-1.5 bg-white/10 backdrop-blur-md border border-white/20 rounded-full flex items-center gap-1.5">
            <Star size={12} className="text-yellow-400" fill="currentColor" />
            <span className="text-[10px] font-black text-white">{pitch.rating}</span>
          </div>
          <div className="px-3 py-1.5 bg-black/40 backdrop-blur-md border border-white/10 rounded-full">
            <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest">{pitch.district}</span>
          </div>
        </div>

        {/* Dynamic Countdown for Last Minute Deals */}
        {pitch.occupancy > 80 && (
          <motion.div
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="px-3 py-1.5 bg-red-600/90 backdrop-blur-md border border-red-400/30 rounded-full flex items-center gap-2 self-start"
          >
            <Zap size={12} className="text-white fill-current" />
            <span className="text-[9px] font-black text-white uppercase tracking-wider">SON FIRSAT: {formatTime(timeLeft)}</span>
          </motion.div>
        )}
      </div>

      {/* Quality Grades - Floating Glassmorphism Panel */}
      <div className="absolute top-6 right-6 p-4 bg-black/40 backdrop-blur-xl border border-white/10 rounded-3xl flex flex-col gap-4 shadow-2xl">
        <GradeBadge label="ZEMİN" score={pitch.grassQuality} icon={Layers} />
        <GradeBadge label="IŞIK" score={pitch.lighting} icon={Zap} />
        <GradeBadge label="SOYUNMA" score={pitch.lockerRoomQuality} icon={Droplets} />
      </div>

      {/* Bottom Info */}
      <div className="absolute bottom-0 left-0 w-full p-8">
        <div className="flex justify-between items-end">
          <div className="flex-1">
            <h3 className="text-3xl font-black text-white italic uppercase tracking-tighter mb-2 drop-shadow-lg">
              {pitch.name}
            </h3>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5 text-gray-300">
                <MapPin size={14} className="text-[#FFFF00]" />
                <span className="text-xs font-bold">{pitch.distance}</span>
              </div>
              <div className="flex items-center gap-1.5 text-gray-300">
                <Users size={14} className="text-[#FFFF00]" />
                <span className="text-xs font-bold">7v7 • 8v8</span>
              </div>
            </div>
          </div>

          <div className="text-right">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">TOPLAM FİYAT</p>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-black text-[#FFFF00]">{pitch.totalPrice}</span>
              <span className="text-sm font-bold text-[#FFFF00]">₺</span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};


// ─── STEP 3: SAHA SEÇ ─────────────────────────────────────────────────────────
const PitchSelectStep: React.FC<{
  selectedPitch: Pitch | null;
  selectedTimeSlot: string | null;
  onSelectPitch: (p: Pitch | null) => void;
  onSelectTimeSlot: (t: string | null) => void;
  onNext: () => void;
}> = ({ selectedPitch, selectedTimeSlot, onSelectPitch, onSelectTimeSlot, onNext }) => {
  const [viewMode, setViewMode] = useState<'LIST' | 'MAP'>('LIST');
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  
  const [localSelectedPitch, setLocalSelectedPitch] = useState<Pitch | null>(selectedPitch);
  const [localSelectedSlot, setLocalSelectedSlot] = useState<string | null>(selectedTimeSlot);
  const [selectedCourtId, setSelectedCourtId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(0);

  const [filters, setFilters] = useState({
    district: 'Tümü', minRating: 0, maxPrice: 4000, hasAmenities: [] as string[], type: 'Tümü', availability: 'Tümü'
  });
  const [sortOrder, setSortOrder] = useState<'DEFAULT' | 'PRICE_ASC'>('DEFAULT');

  const { adminPitches } = useAppStore();
  const districts = React.useMemo(() => ['Tümü', ...Array.from(new Set(adminPitches.map((p:any) => p.district)))], [adminPitches]);

  const handleOpenDetail = (pitch: Pitch) => {
    setLocalSelectedPitch(pitch);
    setIsDetailOpen(true);
    setSelectedCourtId(pitch.courts?.[0]?.id || null);
    setLocalSelectedSlot(null);
  };

  const selectedCourt = React.useMemo(() => {
    if (!localSelectedPitch || !selectedCourtId) return null;
    return localSelectedPitch.courts?.find((c: any) => c.id === selectedCourtId) || null;
  }, [localSelectedPitch, selectedCourtId]);

  const calculateTotal = () => {
    if (!selectedCourt) return localSelectedPitch?.totalPrice || 0;
    return selectedCourt.price;
  };

  const filteredPitches = React.useMemo(() => {
    let result = adminPitches.filter((p:any) => {
      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.district.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesDistrict = filters.district === 'Tümü' || p.district === filters.district;
      const matchesRating = p.rating >= filters.minRating;
      const matchesPrice = p.totalPrice <= filters.maxPrice;
      let matchesType = true;
      if (filters.type === 'Kapalı') matchesType = p.courts?.some((c:any) => c.type === 'CLOSED') || false;
      else if (filters.type === 'Açık') matchesType = p.courts?.some((c:any) => c.type === 'OPEN') || false;
      let matchesAvailability = true;
      if (filters.availability === 'Şu an Boş') matchesAvailability = p.occupancy < 80;

      return matchesSearch && matchesDistrict && matchesRating && matchesPrice && matchesType && matchesAvailability;
    });
    if (sortOrder === 'PRICE_ASC') result.sort((a:any, b:any) => a.totalPrice - b.totalPrice);
    return result;
  }, [searchQuery, filters, sortOrder, adminPitches]);

  const handleConfirmAction = () => {
    if (localSelectedPitch && localSelectedSlot) {
      onSelectPitch(localSelectedPitch);
      onSelectTimeSlot(localSelectedSlot);
      onNext();
    }
  };

  const DAYS = ['Bugün', 'Yarın', 'Cuma', 'Cmt', 'Paz', 'Pzt', 'Sal'];

  return (
    <motion.div key="pitch-sel" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} className="flex-1 flex flex-col relative overflow-hidden bg-[#0A0E14] text-white">
      
      {/* Top Header Inline Block */}
      <div className="z-10 bg-[#0A0E14]/90 backdrop-blur-md pt-5 pb-3 px-5 border-b border-white/5 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-1 bg-[#161B22] p-1 rounded-2xl border border-white/5 shadow-inner">
            <button onClick={() => setViewMode('LIST')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black transition-all flex items-center gap-2 ${viewMode === 'LIST' ? 'bg-[#FFFF00] text-black shadow-lg shadow-yellow-900/20' : 'text-gray-500'}`}><LayoutGrid size={14} /> LİSTE</button>
            <button onClick={() => setViewMode('MAP')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black transition-all flex items-center gap-2 ${viewMode === 'MAP' ? 'bg-[#FFFF00] text-black shadow-lg shadow-yellow-900/20' : 'text-gray-500'}`}><MapIcon size={14} /> HARİTA</button>
          </div>
          <button onClick={() => setShowFilters(true)} className={`w-12 h-12 flex items-center justify-center rounded-full transition-all ${showFilters ? 'bg-[#FFFF00] text-black' : 'bg-[#161B22] border border-white/5 text-white'}`}><Filter size={20} /></button>
        </div>

        <div className="relative group mb-4">
          <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none text-gray-500 group-focus-within:text-[#FFFF00] transition-colors"><Search size={20} /></div>
          <input type="text" placeholder="Saha veya bölge ara..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full h-14 bg-[#161B22] border border-white/5 rounded-[20px] pl-14 pr-6 text-sm font-bold outline-none focus:border-[#FFFF00]/50 transition-all shadow-inner" />
        </div>

        <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-1 -mx-5 px-5">
          <button onClick={() => setFilters({ ...filters, type: filters.type === 'Kapalı' ? 'Tümü' : 'Kapalı' })} className={`shrink-0 px-4 py-2 rounded-full text-[10px] font-black uppercase transition-all border ${filters.type === 'Kapalı' ? 'bg-[#FFFF00] text-black border-[#FFFF00]' : 'bg-[#161B22] text-gray-400 border-white/5'}`}>Kapalı Saha</button>
          <button onClick={() => setFilters({ ...filters, type: filters.type === 'Açık' ? 'Tümü' : 'Açık' })} className={`shrink-0 px-4 py-2 rounded-full text-[10px] font-black uppercase transition-all border ${filters.type === 'Açık' ? 'bg-[#FFFF00] text-black border-[#FFFF00]' : 'bg-[#161B22] text-gray-400 border-white/5'}`}>Açık Saha</button>
          <button onClick={() => setFilters({ ...filters, availability: filters.availability === 'Şu an Boş' ? 'Tümü' : 'Şu an Boş' })} className={`shrink-0 px-4 py-2 rounded-full text-[10px] font-black uppercase transition-all border ${filters.availability === 'Şu an Boş' ? 'bg-[#FFFF00] text-black border-[#FFFF00]' : 'bg-[#161B22] text-gray-400 border-white/5'}`}>Şu an Boş</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 pb-24 relative custom-scrollbar">
        {viewMode === 'LIST' ? (
          <div className="space-y-4">
            <div className="flex justify-between items-center px-1 mb-2">
              <h2 className="text-xs font-black text-gray-500 uppercase tracking-[0.2em]">{filteredPitches.length} TESİS BULUNDU</h2>
              {filters.district !== 'Tümü' && <span className="text-[10px] font-black text-[#FFFF00] bg-[#FFFF00]/10 px-2 py-1 rounded-lg">{filters.district}</span>}
            </div>
            <AnimatePresence mode="popLayout">
              {filteredPitches.map((pitch:any) => <PitchCard key={pitch.id} pitch={pitch} onClick={() => handleOpenDetail(pitch)} />)}
            </AnimatePresence>
            {filteredPitches.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center text-gray-500">
                <Search size={32} className="mb-4 opacity-50"/>
                <p className="font-bold">Sonuç bulunamadı</p>
              </div>
            )}
          </div>
        ) : (
          <div className="absolute inset-0 z-0">
             <MapViewComponent pitches={filteredPitches} selectedPitch={localSelectedPitch} onPitchSelect={(p:any) => { setLocalSelectedPitch(p); setIsDetailOpen(true); }} />
          </div>
        )}
      </div>

      {/* Detail Overlay with "SAATİ ONAYLA" */}
      <AnimatePresence>
        {isDetailOpen && localSelectedPitch && (
          <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 300 }} className="fixed inset-0 z-[110] bg-[#0A0E14] flex flex-col overflow-hidden">
            <div className="absolute top-0 left-0 w-full p-6 flex justify-between items-center z-20">
              <button onClick={() => setIsDetailOpen(false)} className="w-12 h-12 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center text-white border border-white/10"><ChevronRight className="rotate-90" size={24} /></button>
              <button className="w-12 h-12 bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center text-white border border-white/10"><Heart size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar pb-40">
              <div className="relative h-[40vh] w-full">
                <img src={localSelectedPitch.image} className="w-full h-full object-cover" alt="" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0A0E14] via-transparent to-transparent"></div>
              </div>
              <div className="px-6 -mt-10 relative z-10">
                <div className="bg-[#161B22] border border-white/5 rounded-[40px] p-8 shadow-2xl">
                  <h1 className="text-3xl font-black text-white italic uppercase tracking-tighter mb-2">{localSelectedPitch.name}</h1>
                  <p className="text-gray-400 text-sm flex items-center gap-2 mb-8"><MapPin size={14} className="text-[#FFFF00]" /> {localSelectedPitch.district}</p>
                  
                  <div className="flex flex-wrap gap-2 mb-10">
                    {localSelectedPitch.amenities?.map((a:string) => (
                      <span key={a} className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-full text-[10px] font-black text-gray-400 uppercase tracking-widest">{a}</span>
                    ))}
                  </div>

                  <div className="mb-10">
                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-4">TARİH SEÇİMİ</p>
                    <div className="flex gap-3 overflow-x-auto pb-2 custom-scrollbar">
                      {DAYS.map((day, i) => (
                        <button key={i} onClick={() => setSelectedDate(i)} className={`shrink-0 w-20 h-24 rounded-3xl flex flex-col items-center justify-center gap-1 border transition-all ${selectedDate === i ? 'bg-[#FFFF00] text-black border-[#FFFF00] shadow-lg shadow-yellow-900/20' : 'bg-[#0A0E14] border-white/5 text-gray-500'}`}>
                          <span className="text-[10px] font-black uppercase">{day}</span>
                          <span className="text-xl font-black">{new Date().getDate() + i}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {localSelectedPitch.courts && localSelectedPitch.courts.length > 0 && (
                    <div className="mb-10">
                      <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-4">SAHA SEÇİMİ</p>
                      <div className="space-y-3">
                        {localSelectedPitch.courts.map((court:any) => (
                          <button key={court.id} onClick={() => { setSelectedCourtId(court.id); setLocalSelectedSlot(null); }} className={`w-full p-5 rounded-3xl border transition-all flex items-center justify-between group ${selectedCourtId === court.id ? 'bg-[#FFFF00] border-[#FFFF00] text-black shadow-lg shadow-yellow-900/20' : 'bg-[#0A0E14] border-white/5 text-white hover:border-white/20'}`}>
                            <div className="flex items-center gap-4">
                              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${selectedCourtId === court.id ? 'bg-black/10' : 'bg-white/5'}`}>
                                {court.type === 'CLOSED' ? <Thermometer size={20} /> : <Wind size={20} />}
                              </div>
                              <div className="text-left">
                                <p className="font-black text-sm uppercase italic tracking-tight">{court.name}</p>
                                <p className={`text-[10px] font-bold ${selectedCourtId === court.id ? 'text-black/60' : 'text-gray-500'}`}>{court.type === 'CLOSED' ? 'KAPALI SAHA • ISITMALI' : 'AÇIK SAHA'}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-lg font-black">{court.price}₺</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedCourt && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                      <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] mb-4">MÜSAİT SAATLER</p>
                      <div className="grid grid-cols-3 gap-3">
                        {selectedCourt.slots.map((slot:any, i:number) => {
                          const isSelected = localSelectedSlot === slot.time;
                          const isBooked = slot.status === 'booked';
                          return (
                            <button key={i} disabled={isBooked} onClick={() => setLocalSelectedSlot(slot.time)} className={`h-16 rounded-2xl border font-black text-sm transition-all flex flex-col items-center justify-center relative overflow-hidden ${isBooked ? 'bg-gray-900 border-transparent text-gray-700 cursor-not-allowed' : isSelected ? 'bg-[#FFFF00] border-[#FFFF00] text-black shadow-lg shadow-yellow-900/20' : 'bg-[#0A0E14] border-white/5 text-white hover:border-white/20'}`}>
                              {slot.time}
                              {isBooked && <span className="text-[8px] mt-1 opacity-50">DOLU</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="absolute bottom-0 left-0 w-full p-8 bg-gradient-to-t from-[#0A0E14] via-[#0A0E14] to-transparent pt-20 pointer-events-none">
              <div className="flex gap-4 items-center pointer-events-auto">
                <div className="flex-1">
                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">TOPLAM TUTAR</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-black text-white">{calculateTotal()}</span>
                    <span className="text-lg font-bold text-[#FFFF00]">₺</span>
                  </div>
                </div>
                <button disabled={!localSelectedSlot} onClick={handleConfirmAction} className={`flex-[1.5] h-16 rounded-[20px] font-black text-lg uppercase italic tracking-tighter flex items-center justify-center gap-3 transition-all shadow-2xl ${localSelectedSlot ? 'bg-[#FFFF00] text-black shadow-yellow-900/40 active:scale-95' : 'bg-gray-800 text-gray-600 cursor-not-allowed'}`}>
                  {localSelectedSlot ? 'SAATİ ONAYLA' : 'SAAT SEÇİNİZ'}
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Basic Filters Modal */}
      <AnimatePresence>
        {showFilters && (
          <div className="fixed inset-0 z-[100] flex items-end justify-center">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowFilters(false)} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} className="relative w-full max-w-md bg-[#161B22] border-t border-white/10 rounded-t-[40px] p-8 shadow-2xl">
              <div className="w-12 h-1.5 bg-gray-800 rounded-full mx-auto mb-8"></div>
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl font-black text-white italic tracking-tighter uppercase">FİLTRELE</h2>
                <button onClick={() => setShowFilters(false)} className="w-10 h-10 bg-[#0A0E14] rounded-full flex items-center justify-center text-gray-400"><X size={20} /></button>
              </div>
              <div className="space-y-8">
                <div>
                   <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-4">BÖLGE SEÇİMİ</p>
                   <div className="flex flex-wrap gap-2">
                     {districts.map(d => (
                       <button key={String(d)} onClick={() => setFilters({ ...filters, district: String(d) })} className={`px-4 py-2.5 rounded-xl text-[10px] font-black transition-all border ${filters.district === String(d) ? 'bg-[#FFFF00] text-black border-[#FFFF00]' : 'bg-[#0A0E14] text-gray-400 border-white/5'}`}>{String(d).toUpperCase()}</button>
                     ))}
                   </div>
                </div>
                <button onClick={() => setShowFilters(false)} className="w-full h-16 bg-[#FFFF00] text-black rounded-2xl font-black text-sm tracking-widest uppercase shadow-[0_10px_30px_rgba(255,255,0,0.2)]">UYGULA</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </motion.div>
  );
};

// ─── STEP 4: HİZMETLER (Kaleci + Hakem, vb.) ────────────────────────────────────
const ServicesStep: React.FC<{
  selectedPitch: Pitch | null;
  selectedTimeSlot: string | null;
  selectedGk: Goalkeeper | null;
  selectedRef: Referee | null;
  onSelectGk: (gk: Goalkeeper | null) => void;
  onSelectRef: (ref: Referee | null) => void;
  onNext: () => void;
  onNavigate: (view: AppView) => void;
}> = ({ selectedPitch, selectedTimeSlot, selectedGk, selectedRef, onSelectGk, onSelectRef, onNext, onNavigate }) => {
  const [activeService, setActiveService] = useState<string | null>(null);
  const [opponentSubView, setOpponentSubView] = useState<'options' | 'finder' | 'private'>('options');
  const fieldRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<{ id: string; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const [tacticalPlayers, setTacticalPlayers] = useState([
    { id: 'gk',  label: 'KL',  x: 50, y: 88, active: false },
    { id: 'cb1', label: 'STP', x: 30, y: 70, active: false },
    { id: 'cb2', label: 'STP', x: 70, y: 70, active: false },
    { id: 'cm1', label: 'OS',  x: 25, y: 48, active: false },
    { id: 'cm2', label: 'OS',  x: 75, y: 48, active: false },
    { id: 'st1', label: 'FV',  x: 35, y: 25, active: false },
    { id: 'st2', label: 'FV',  x: 65, y: 25, active: false },
  ]);

  const classifyRole = (yPct: number) => {
    if (yPct > 85) return 'KL';
    if (yPct > 60) return 'STP';
    if (yPct > 35) return 'OS';
    return 'FV';
  };

  const handlePlayerPointerDown = (e: React.PointerEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!fieldRef.current) return;
    const rect = fieldRef.current.getBoundingClientRect();
    const player = tacticalPlayers.find(p => p.id === id)!;
    // Store drag start info
    draggingRef.current = {
      id,
      startX: e.clientX,
      startY: e.clientY,
      origX: player.x,
      origY: player.y,
    };
    setDraggingId(id);
    // Capture pointer so we get events outside the element
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleFieldPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current || !fieldRef.current) return;
    e.preventDefault();
    const rect = fieldRef.current.getBoundingClientRect();
    const dx = e.clientX - draggingRef.current.startX;
    const dy = e.clientY - draggingRef.current.startY;
    let newX = draggingRef.current.origX + (dx / rect.width) * 100;
    let newY = draggingRef.current.origY + (dy / rect.height) * 100;
    // Clamp within the field
    newX = Math.max(5, Math.min(95, newX));
    newY = Math.max(5, Math.min(95, newY));
    const id = draggingRef.current.id;
    setTacticalPlayers(prev => prev.map(p =>
      p.id === id ? { ...p, x: newX, y: newY } : p
    ));
  };

  const handleFieldPointerUp = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const id = draggingRef.current.id;
    const dx = Math.abs(e.clientX - draggingRef.current.startX);
    const dy = Math.abs(e.clientY - draggingRef.current.startY);
    const wasTap = dx < 6 && dy < 6;
    if (wasTap) {
      // It was a tap, toggle active
      setTacticalPlayers(prev => prev.map(p =>
        p.id === id ? { ...p, active: !p.active } : p
      ));
    } else {
      // It was a drag — classify role by final position
      setTacticalPlayers(prev => prev.map(p =>
        p.id === id ? { ...p, label: classifyRole(p.y) } : p
      ));
    }
    draggingRef.current = null;
    setDraggingId(null);
  };

  const activeCount = tacticalPlayers.filter(p => p.active).length;

  // ── In-App Toast System ──────────────────────────────────────
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 3200);
  };

  const services = [
    { 
      id: 'opponent', title: 'Takım Davet Et veya Rakip Bul', desc: 'Oynayacağınız takımı ayarlayın.', 
      Icon: Swords, color: 'text-red-400',
      glow: 'bg-red-500/30', borderHover: 'hover:border-red-400/60',
      bgBase: 'bg-gradient-to-br from-red-900/40 via-red-950/20 to-[#0A0E14]',
      extra: null
    },
    { 
      id: 'player', title: 'Oyuncu Bul', desc: 'Eksik Mevkilere Adam Çağır', 
      Icon: UserPlus, color: 'text-purple-400',
      glow: 'bg-purple-500/30', borderHover: 'hover:border-purple-400/60',
      bgBase: 'bg-gradient-to-br from-purple-900/40 via-purple-950/20 to-[#0A0E14]',
      extra: null
    },
    { 
      id: 'gk', title: 'Kaleci Kirala', desc: 'Kalenizi Sağlama Alın', 
      Icon: Shield, color: 'text-green-400',
      glow: 'bg-green-500/30', borderHover: 'hover:border-green-400/60',
      bgBase: 'bg-gradient-to-br from-emerald-900/40 via-emerald-950/20 to-[#0A0E14]',
      extra: (
        <>
          <motion.div animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }} transition={{ duration: 4, repeat: Infinity }} className="absolute inset-0 bg-green-500/20 blur-3xl rounded-full pointer-events-none" />
          <motion.div animate={{ y: [0, -10, 0] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }} className="absolute right-10 top-[20%] pointer-events-none drop-shadow-[0_0_15px_rgba(74,222,128,0.5)]">
            <Shield size={64} className="text-green-400 opacity-60" />
          </motion.div>
        </>
      )
    },
    { 
      id: 'ref', title: 'Hakem Kirala', desc: 'Maçı Profesyoneller Yönetsin', 
      Icon: Activity, color: 'text-yellow-400',
      glow: 'bg-yellow-500/30', borderHover: 'hover:border-yellow-400/60',
      bgBase: 'bg-gradient-to-br from-yellow-900/40 via-yellow-950/20 to-[#0A0E14]',
      extra: (
        <>
          <motion.div animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }} transition={{ duration: 4, repeat: Infinity, delay: 1 }} className="absolute inset-0 bg-yellow-500/20 blur-3xl rounded-full pointer-events-none" />
          <motion.div animate={{ rotate: [-10, 10, -10] }} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }} className="absolute right-10 top-[20%] pointer-events-none drop-shadow-[0_0_15px_rgba(250,204,21,0.5)]">
            <Activity size={64} className="text-yellow-400 opacity-60" />
          </motion.div>
        </>
      )
    }
  ];

  return (
    <>
      {/* ── In-App Toast Overlay ── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            key="toast"
            initial={{ opacity: 0, y: -20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            className="fixed top-5 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl max-w-[90vw] pointer-events-none"
            style={{
              background: toast.type === 'success' ? 'linear-gradient(135deg,#1a472a,#14532d)' : toast.type === 'error' ? 'linear-gradient(135deg,#7f1d1d,#991b1b)' : 'linear-gradient(135deg,#1e1b4b,#312e81)',
              border: `1px solid ${ toast.type === 'success' ? 'rgba(74,222,128,0.4)' : toast.type === 'error' ? 'rgba(248,113,113,0.4)' : 'rgba(129,140,248,0.4)' }`,
              backdropFilter: 'blur(20px)',
              boxShadow: toast.type === 'success' ? '0 8px 32px rgba(22,163,74,0.25)' : toast.type === 'error' ? '0 8px 32px rgba(239,68,68,0.25)' : '0 8px 32px rgba(99,102,241,0.25)',
            }}
          >
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-lg flex-shrink-0 ${
              toast.type === 'success' ? 'bg-green-500/20 text-green-400' : toast.type === 'error' ? 'bg-red-500/20 text-red-400' : 'bg-indigo-500/20 text-indigo-400'
            }`}>
              {toast.type === 'success' ? '✓' : toast.type === 'error' ? '✕' : '●'}
            </div>
            <p className="text-white text-sm font-bold leading-snug">{toast.message}</p>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {!activeService && (
          <motion.div key="services" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
            className="flex-1 flex flex-col p-4 gap-4 pb-28 relative h-full">

            {services.map(s => (
              <motion.button key={s.id} 
                whileHover={{ scale: 1.02, y: -2 }} whileTap={{ scale: 0.97 }}
                onClick={() => setActiveService(s.id)}
                className={`flex-1 w-full rounded-[32px] ${s.bgBase} border border-white/10 ${s.borderHover} relative overflow-hidden flex flex-col justify-end p-6 text-left transition-all duration-300 group shadow-lg`}>
                
                {/* Permanent Gentle Glow (Yoğun Renkli Ferah Görüntü) */}
                <div className={`absolute inset-0 ${s.glow} opacity-40 group-hover:opacity-100 transition-opacity duration-700 blur-2xl pointer-events-none`} />

                {/* Custom Extra Animations specially requested */}
                {s.extra}

                {/* Background Decorative Icons */}
                <s.Icon size={140} strokeWidth={1} className={`absolute -right-6 -bottom-6 opacity-10 ${s.color} transform group-hover:scale-125 group-hover:rotate-12 transition-transform duration-700 pointer-events-none`} />
                <s.Icon size={200} strokeWidth={0.5} className={`absolute -left-12 -top-12 opacity-[0.05] ${s.color} transform group-hover:scale-125 group-hover:-rotate-12 transition-transform duration-1000 pointer-events-none`} />
                
                {/* Action Icon Top Right */}
                <div className={`absolute top-5 right-5 w-12 h-12 rounded-[18px] bg-white/5 backdrop-blur-xl flex items-center justify-center border border-white/10 group-hover:bg-white/10 group-hover:scale-110 transition-all z-20`}>
                  <s.Icon size={20} className={s.color} />
                </div>

                <div className="relative z-10 w-3/4">
                  {/* For long titles, reduce size dynamically if needed, or just let it wrap nicely */}
                  <h3 className={`${s.id === 'opponent' ? 'text-2xl' : 'text-3xl'} font-black text-white italic tracking-tighter uppercase leading-none drop-shadow-md`}>{s.title}</h3>
                  <p className={`text-[10px] ${s.color} mt-2 font-black uppercase tracking-widest drop-shadow-md flex items-center gap-2`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${s.color.replace('text-', 'bg-')} animate-pulse shrink-0`} />
                    {s.desc}
                  </p>
                </div>
              </motion.button>
            ))}

            {/* Modern Floating Footer */}
            <div className="fixed bottom-0 left-0 right-0 z-20 p-5 bg-gradient-to-t from-[#0A0E14] via-[#0A0E14]/90 to-transparent pt-12 pointer-events-none">
              <button onClick={onNext}
                className="w-full h-16 bg-white/10 backdrop-blur-xl text-white font-black text-[13px] rounded-[24px] flex items-center justify-center gap-2 border border-white/10 hover:bg-white/20 transition-colors active:scale-[0.98] pointer-events-auto">
                HİZMET SEÇMEDEN DEVAM ET <ChevronRight size={18} />
              </button>
            </div>
          </motion.div>
        )}

        {/* OPPONENT SUB-MODAL */}
        {activeService === 'opponent' && (
          <motion.div 
            key="opponent-modal"
            initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }}
            className="absolute inset-0 z-30 bg-[#0A0E14] flex flex-col h-full"
          >
            {/* Header */}
            <header className="px-6 py-4 flex items-center gap-4 border-b border-white/5 bg-[#161B22]/50 backdrop-blur-lg">
              <button onClick={() => setActiveService(null)} className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white hover:bg-white/10 transition-colors">
                <ChevronLeft size={20} />
              </button>
              <div>
                <h2 className="text-xl font-black text-white uppercase italic tracking-tighter">Maç Şekli</h2>
                <p className="text-[10px] text-red-400 font-bold uppercase tracking-widest">Takım Ayarları</p>
              </div>
            </header>

            <div className="flex-1 flex flex-col p-6 gap-6 relative">
              {/* Option 1: Özel Maç */}
              <motion.button 
                whileHover={{ scale: 1.02, y: -2 }} whileTap={{ scale: 0.98 }}
                onClick={() => setOpponentSubView('private')}
                className="flex-1 bg-gradient-to-br from-blue-900/40 via-[#161B22] to-[#0A0E14] border border-white/10 rounded-[32px] p-8 flex flex-col items-center justify-center text-center relative overflow-hidden group shadow-lg"
              >
                <div className="absolute inset-0 bg-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-700 blur-2xl pointer-events-none" />
                <div className="w-20 h-20 rounded-full bg-blue-500/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-[0_0_30px_rgba(59,130,246,0.3)]">
                  <Lock size={32} className="text-blue-400" />
                </div>
                <h3 className="text-2xl font-black text-white italic tracking-tighter uppercase mb-2">Takım Davet Et</h3>
                <p className="text-xs text-blue-300 font-bold uppercase tracking-widest leading-relaxed opacity-80">Maçın Özel Kodu ile Sadece Sizin Seçtiğiniz Takımı Çağırın</p>
              </motion.button>

              {/* Option 2: Rakip Bul */}
              <motion.button 
                whileHover={{ scale: 1.02, y: -2 }} whileTap={{ scale: 0.98 }}
                onClick={() => setOpponentSubView('finder')}
                className="flex-1 bg-gradient-to-br from-red-900/40 via-[#161B22] to-[#0A0E14] border border-white/10 rounded-[32px] p-8 flex flex-col items-center justify-center text-center relative overflow-hidden group shadow-lg"
              >
                <div className="absolute inset-0 bg-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-700 blur-2xl pointer-events-none" />
                <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform shadow-[0_0_30px_rgba(239,68,68,0.3)]">
                  <Globe size={32} className="text-red-400" />
                </div>
                <h3 className="text-2xl font-black text-white italic tracking-tighter uppercase mb-2">Rakip Bul</h3>
                <p className="text-xs text-red-300 font-bold uppercase tracking-widest leading-relaxed opacity-80">Rakiplerin Seni Bulmasına İzin Ver veya Listeden Takım Seç</p>
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* OPPONENT FINDER FULL SCREEN INSIDE MODAL */}
        {activeService === 'opponent' && opponentSubView === 'finder' && (
          <motion.div 
            initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 50 }}
            className="absolute inset-0 z-40 bg-[#0A0E14]"
          >
            <OpponentFinder onBack={() => setOpponentSubView('options')} onNavigate={onNavigate} />
          </motion.div>
        )}

        {/* OPPONENT PRIVATE MATCH FULL SCREEN INSIDE MODAL */}
        {activeService === 'opponent' && opponentSubView === 'private' && (
          <motion.div 
            initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 50 }}
            className="absolute inset-0 z-50 bg-[#0A0E14] flex flex-col"
          >
            {/* Header */}
            <header className="px-6 py-4 flex items-center gap-4 border-b border-white/5 bg-[#161B22]/50 backdrop-blur-lg z-10">
              <button 
                onClick={() => setOpponentSubView('options')} 
                className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white hover:bg-white/10 transition-colors"
               >
                <ChevronLeft size={20} />
              </button>
              <div>
                <h2 className="text-xl font-black text-white uppercase italic tracking-tighter">Maç Daveti</h2>
                <p className="text-[10px] text-blue-400 font-bold uppercase tracking-widest">Özel Maç Kodu</p>
              </div>
            </header>

            <div className="flex-1 px-6 flex flex-col items-center justify-center relative overflow-hidden">
               {/* Background visual flair */}
               <div className="absolute inset-0 bg-blue-500/5 blur-[100px] pointer-events-none" />
               <motion.div 
                 animate={{ rotate: 360 }} transition={{ duration: 40, repeat: Infinity, ease: 'linear' }}
                 className="absolute -right-32 -top-32 opacity-5 pointer-events-none"
               >
                 <Lock size={400} className="text-blue-500" />
               </motion.div>

               {/* Lock Icon */}
               <div className="w-24 h-24 bg-gradient-to-br from-[#161B22] to-[#0A0E14] rounded-full flex items-center justify-center mb-8 border border-blue-500/30 relative shadow-[0_0_50px_rgba(59,130,246,0.2)]">
                  <Lock size={40} className="text-blue-400 relative z-10" />
                  <motion.div animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }} transition={{ duration: 2, repeat: Infinity }} className="absolute inset-0 rounded-full border-2 border-blue-400/50" />
                  <div className="absolute inset-0 bg-blue-500/20 rounded-full blur-xl"></div>
               </div>

               <h3 className="text-3xl font-black text-white italic text-center uppercase mb-3 drop-shadow-md">Maçın Hazır!</h3>
               <p className="text-xs text-gray-400 text-center mb-8 font-medium max-w-[80%] leading-relaxed">Bu kodu rakip takımın kaptanıyla paylaşın. Sadece koda sahip takımlar size meydan okuyabilir.</p>

               {/* Code Display */}
               <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    className="w-full bg-[#161B22] border-2 border-dashed border-blue-500/50 rounded-3xl p-6 flex flex-col justify-center items-center gap-2 relative group hover:border-blue-500 transition-colors cursor-pointer shadow-[0_0_20px_rgba(59,130,246,0.1)]"
                    onClick={() => {
                      navigator.clipboard?.writeText('X7Y9').catch(() => {});
                      showToast('Maç kodu kopyalandı! ✓', 'success');
                    }}
               >
                  <span className="text-[10px] font-black text-blue-400 tracking-widest uppercase mb-2">Gizli Davet Kodu</span>
                  <span className="text-5xl font-black text-white tracking-[0.2em] font-mono leading-none drop-shadow-[0_0_15px_rgba(59,130,246,0.6)]">X7Y9</span>
                  
                  <div className="absolute top-4 right-4 w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-400 group-hover:bg-blue-500 group-hover:text-black transition-colors">
                     <Copy size={20} />
                  </div>
               </motion.div>

               <button 
                  onClick={() => showToast('WhatsApp paylaşımı açılıyor...', 'info')}
                  className="mt-6 w-full h-14 bg-[#161B22] border border-green-500/30 rounded-[20px] flex items-center justify-center gap-3 text-green-400 font-black text-sm uppercase tracking-widest hover:bg-green-500/10 transition-colors shadow-lg"
                >
                  <Share2 size={18} /> WHATSAPP İLE PAYLAŞ
               </button>
            </div>

            {/* Footer Action */}
            <div className="p-6 bg-gradient-to-t from-[#0A0E14] via-[#0A0E14]/90 to-transparent sticky bottom-0 z-20 pb-12 pt-16">
              <button onClick={() => { setActiveService(null); setOpponentSubView('options'); showToast('Takım daveti kaydedildi!', 'success'); }} 
                 className="w-full h-16 bg-blue-600 hover:bg-blue-500 text-white font-black text-sm rounded-[24px] flex items-center justify-center gap-2 shadow-[0_0_30px_rgba(37,99,235,0.4)] transition-colors active:scale-95 border border-blue-400/50 uppercase tracking-widest">
                 <Check size={20} /> ONAYLA ve HİZMETLERE DÖN
              </button>
            </div>
          </motion.div>
        )}

        {/* PLAYER FINDER (Eksik Adam) FULL SCREEN INSIDE MODAL */}
        {activeService === 'player' && (
          <motion.div 
            key="player-finder"
            initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 50 }}
            className="absolute inset-0 z-50 bg-[#0A0E14] flex flex-col"
          >
            {/* Header */}
            <header className="px-6 py-4 flex items-center justify-between border-b border-white/5 bg-[#161B22]/50 backdrop-blur-lg z-10">
              <div className="flex items-center gap-4">
                <button onClick={() => setActiveService(null)} className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-white hover:bg-white/10 transition-colors">
                  <ChevronLeft size={20} />
                </button>
                <div>
                  <h2 className="text-xl font-black text-white uppercase italic tracking-tighter">Oyuncu Bul</h2>
                  <p className="text-[10px] text-purple-400 font-bold uppercase tracking-widest">Eksik Mevki İlanı</p>
                </div>
              </div>
            </header>

            {/* Match Info Panel */}
            <div className="px-5 py-4 bg-[#161B22] border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
                  <MapPin size={18} className="text-purple-400" />
                </div>
                <div>
                  <p className="text-sm font-black text-white">{selectedPitch?.name || 'Saha Seçilmedi'}</p>
                  <p className="text-[10px] text-gray-400 font-bold uppercase">{selectedTimeSlot || 'Saat Seçilmedi'} • Yaklaşan Maç</p>
                </div>
              </div>
            </div>

              <div className="flex-1 flex flex-col items-center justify-center relative overflow-hidden py-4">
              {/* Background ambient glow */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-green-500/10 blur-[120px] pointer-events-none"></div>

              {/* Message */}
              <p className="text-[10px] text-center text-gray-400 mb-4 font-bold tracking-widest uppercase relative z-10">
                Eksik mevkilere tıkla · sürükle & bırak ile düzenle
              </p>

              {/* SVG Football Pitch + Draggable Nodes Container */}
              <div
                ref={fieldRef}
                className="relative mx-auto shadow-2xl select-none"
                style={{ width: 280, height: 420, borderRadius: 14, overflow: 'hidden', border: '3px solid rgba(34,197,94,0.25)', touchAction: 'none' }}
                onPointerMove={handleFieldPointerMove}
                onPointerUp={handleFieldPointerUp}
                onPointerLeave={handleFieldPointerUp}
              >
                {/* === SVG PITCH — viewBox 280×420, everything mathematically centred === */}
                <svg
                  viewBox="0 0 280 420"
                  width="280"
                  height="420"
                  xmlns="http://www.w3.org/2000/svg"
                  style={{ position: 'absolute', inset: 0 }}
                >
                  {/* === GRASS FILL === */}
                  <defs>
                    {/* alternating stripe pattern */}
                    <pattern id="stripes" x="0" y="0" width="280" height="35" patternUnits="userSpaceOnUse">
                      <rect x="0" y="0" width="280" height="35" fill="#1a472a"/>
                      <rect x="0" y="0" width="280" height="17.5" fill="#1d5230"/>
                    </pattern>
                    {/* clipping mask for rounded corners */}
                    <clipPath id="pitchClip">
                      <rect x="0" y="0" width="280" height="420" rx="11" ry="11"/>
                    </clipPath>
                  </defs>

                  {/* Grass background with stripes */}
                  <rect x="0" y="0" width="280" height="420" fill="url(#stripes)" clipPath="url(#pitchClip)"/>

                  {/* All field lines in one group — rgba white, uniform stroke */}
                  <g clipPath="url(#pitchClip)" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">

                    {/* Outer boundary — margin 16px each side */}
                    <rect x="16" y="16" width="248" height="388" />

                    {/* ── Halfway Line ── */}
                    <line x1="16" y1="210" x2="264" y2="210" />

                    {/* ── Centre Circle (r=42) ── */}
                    <circle cx="140" cy="210" r="42" />
                    {/* Centre spot */}
                    <circle cx="140" cy="210" r="3" fill="rgba(255,255,255,0.75)" stroke="none"/>

                    {/* ══ TOP HALF ══ */}
                    {/* Penalty area: width=148, height=54 → left=66, right=214, bottom=70 */}
                    <rect x="66" y="16" width="148" height="54" />
                    {/* Goal area: width=68, height=22 → left=106, right=174, bottom=38 */}
                    <rect x="106" y="16" width="68" height="22" />
                    {/* Penalty spot */}
                    <circle cx="140" cy="58" r="2.5" fill="rgba(255,255,255,0.75)" stroke="none"/>
                    {/* Penalty arc (D) — centred at penalty spot (140,58), only part below y=70 visible */}
                    <path d="M 110,70 A 36,36 0 0,1 170,70" />

                    {/* Top-left corner arc */}
                    <path d="M 16,28 A 12,12 0 0,0 28,16" />
                    {/* Top-right corner arc */}
                    <path d="M 252,16 A 12,12 0 0,0 264,28" />

                    {/* ══ BOTTOM HALF ══ */}
                    {/* Penalty area: bottom y=404, top=350 */}
                    <rect x="66" y="350" width="148" height="54" />
                    {/* Goal area */}
                    <rect x="106" y="382" width="68" height="22" />
                    {/* Penalty spot */}
                    <circle cx="140" cy="362" r="2.5" fill="rgba(255,255,255,0.75)" stroke="none"/>
                    {/* Penalty arc (D) — only part above y=350 */}
                    <path d="M 110,350 A 36,36 0 0,0 170,350" />

                    {/* Bottom-left corner arc */}
                    <path d="M 16,392 A 12,12 0 0,1 28,404" />
                    {/* Bottom-right corner arc */}
                    <path d="M 264,392 A 12,12 0 0,0 252,404" />

                    {/* ══ GOALS (top + bottom) ══ */}
                    {/* Top goal (outside boundary — above y=16, drawn as a thin tab) */}
                    <rect x="116" y="6" width="48" height="12" strokeWidth="1.5" stroke="rgba(255,255,255,0.50)" fill="rgba(0,0,0,0.25)"/>
                    {/* Bottom goal */}
                    <rect x="116" y="402" width="48" height="12" strokeWidth="1.5" stroke="rgba(255,255,255,0.50)" fill="rgba(0,0,0,0.25)"/>
                  </g>
                </svg>

                {/* === DRAGGABLE PLAYER NODES === */}
                {tacticalPlayers.map(pos => (
                  <motion.button
                    key={pos.id}
                    onPointerDown={(e) => handlePlayerPointerDown(e, pos.id)}
                    whileHover={{ scale: draggingId ? 1 : 1.15 }}
                    whileTap={{ scale: 0.92 }}
                    className={`absolute w-[42px] h-[42px] -ml-[21px] -mt-[21px] rounded-full flex flex-col items-center justify-center border-2 shadow-xl z-20 transition-colors select-none ${
                      draggingId === pos.id
                        ? 'cursor-grabbing scale-110 shadow-[0_0_28px_rgba(255,255,255,0.3)]'
                        : 'cursor-grab'
                    } ${
                      pos.active
                        ? 'bg-purple-600 border-purple-300 shadow-[0_0_22px_rgba(147,51,234,0.65)] text-white'
                        : 'bg-black/85 border-gray-500 text-gray-300 hover:border-gray-300 hover:text-white'
                    }`}
                    style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                  >
                    {pos.active
                      ? <UserPlus size={16} className="mb-0.5 mt-0.5" />
                      : <div className="w-[9px] h-[9px] rounded-full bg-white/30 mb-0.5" />
                    }
                    <span className="text-[9px] font-black uppercase tracking-wider leading-none">{pos.label}</span>
                  </motion.button>
                ))}
              </div>
            </div>

            {/* Footer Action */}
            <div className="p-6 bg-gradient-to-t from-[#0A0E14] via-[#0A0E14]/90 to-transparent sticky bottom-0 z-20 pb-12 pt-16">
              <button 
                onClick={() => { 
                   if (activeCount === 0) {
                      showToast('Lütfen en az bir eksik mevki seçin.', 'error');
                      return;
                   }
                   setActiveService(null); 
                   setActiveService(null);
                   showToast(`${activeCount} mevkii için ilan yayınlandı! Yakındaki oyuncular bildirim aldı. 🔔`, 'success');
                }} 
                 className={`w-full h-16 text-white font-black text-sm rounded-[24px] flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95 uppercase tracking-widest border ${activeCount > 0 ? 'bg-purple-600 hover:bg-purple-500 shadow-[0_0_30px_rgba(147,51,234,0.4)] border-purple-400/50' : 'bg-[#161B22] border-white/5 text-gray-500 cursor-not-allowed'}`}>
                 <Check size={20} /> İLANI YAYINLA {activeCount > 0 && `(${activeCount} OYUNCU)`}
              </button>
            </div>
          </motion.div>
        )}

        {/* GOALKEEPER KIRALA */}
        {activeService === 'gk' && (
          <motion.div initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 50 }} className="absolute inset-0 z-[60] bg-[#0A0E14] flex flex-col">
            <Marketplace type="GK" onBack={() => setActiveService(null)} onSelect={(gk) => { onSelectGk(gk as Goalkeeper); setActiveService(null); showToast('Kaleci profesyonel kadroya dahil edildi! ✓', 'success'); }} />
          </motion.div>
        )}

        {/* HAKEM KIRALA */}
        {activeService === 'ref' && (
          <motion.div initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 50 }} className="absolute inset-0 z-[60] bg-[#0A0E14] flex flex-col">
            <Marketplace type="REF" onBack={() => setActiveService(null)} onSelect={(ref) => { onSelectRef(ref as Referee); setActiveService(null); showToast('Hakem profesyonel kadroya dahil edildi! ✓', 'success'); }} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

const PaymentStep: React.FC<{
  format: typeof FORMATS[0];
  myCount: number;
  pitch: Pitch | null;
  timeSlot: string | null;
  gk: Goalkeeper | null;
  ref: Referee | null;
  wantsOpponentAd: boolean;
  setWantsOpponentAd: (v: boolean) => void;
  onPay: () => void;
}> = ({ format, myCount, pitch, timeSlot, gk, ref, wantsOpponentAd, setWantsOpponentAd, onPay }) => {
  const [isDepositPaid, setIsDepositPaid] = useState(false);
  const [isPaying, setIsPaying] = useState(false);

  const pitchCost  = pitch?.totalPrice || 0;
  const gkCost     = gk?.fee || 0;
  const refCost    = ref?.fee || 0;
  const total      = pitchCost + gkCost + refCost;
  const perPlayer  = format ? Math.ceil(total / parseInt(format.v.split('v')[0])) : total;
  const deposit    = Math.ceil(total * 0.2); // 20% Kapora

  const handlePayDeposit = () => {
    setIsPaying(true);
    setTimeout(() => {
      setIsPaying(false);
      setIsDepositPaid(true);
    }, 1500); // Simulate authentic processing time
  };

  const handleShareToTeam = () => {
    onPay();
  };

  if (isDepositPaid) {
    return (
      <motion.div key="success" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 px-5 py-8 flex flex-col items-center justify-center relative overscroll-none text-center pb-32">
        {/* Background celebration glow */}
        <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: [0, 2, 1.5], opacity: [0, 0.4, 0] }} transition={{ duration: 1.5, ease: "easeOut" }} className="absolute z-0 w-64 h-64 bg-[#FFFF00]/40 rounded-full blur-[100px] pointer-events-none" />
        
        <motion.div initial={{ scale: 0, rotate: -180 }} animate={{ scale: 1, rotate: 0 }} transition={{ duration: 0.7, type: 'spring', bounce: 0.5 }} className="w-28 h-28 rounded-full bg-gradient-to-br from-[#FFFF00] to-yellow-600 flex items-center justify-center mb-8 border-[4px] border-[#0E1520] shadow-[0_0_50px_rgba(255,255,0,0.5)] text-black relative z-10">
           <Check size={56} strokeWidth={4} />
        </motion.div>
        
        <motion.h2 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.5 }} className="text-4xl font-black text-white italic uppercase tracking-tighter mb-2 drop-shadow-md relative z-10">
            MAÇ OLUŞTURULDU!
        </motion.h2>
        
        <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.5 }} className="text-emerald-400 font-bold uppercase tracking-widest text-[11px] mb-10 relative z-10">
            KAPORA ÖDENDİ • SAHA REZERVE EDİLDİ
        </motion.p>

        {/* Info Card */}
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 1, duration: 0.4 }} className="bg-[#161B22] border border-blue-500/30 rounded-3xl p-6 w-full relative overflow-hidden text-left mb-8 shadow-2xl z-10">
           <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 blur-3xl pointer-events-none rounded-full"></div>
           <div className="flex items-start gap-4 relative z-10">
             <div className="p-3 bg-blue-500/20 rounded-2xl text-blue-400 shrink-0 shadow-inner">
                <Users size={24} />
             </div>
             <div>
                <h3 className="text-white font-black uppercase text-sm mb-1 tracking-tight">Takım Ekranına Düşür</h3>
                <p className="text-xs text-gray-400 leading-relaxed font-medium">
                  Takım ekranına düşürdüğünüzde ana sayfadaki <strong className="text-white">"Maç Başlıyor"</strong> alanında yer alacak ve maçı oynayacak olan davetli tüm oyuncularınıza anlık olarak <strong className="text-[#FFFF00]">Bildirim</strong> geçilecektir.
                </p>
             </div>
           </div>
        </motion.div>

        {/* Action Buttons */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.5, duration: 0.4 }} className="w-full space-y-4 z-10">
           <button onClick={handleShareToTeam} className="w-full h-16 bg-[#FFFF00] text-black font-black text-sm uppercase tracking-widest rounded-2xl flex items-center justify-center gap-3 shadow-[0_0_30px_rgba(255,255,0,0.3)] hover:bg-yellow-300 transition-all hover:scale-[1.02] active:scale-95">
              <Share2 size={20} /> TAKIM EKRANINA DÜŞÜR
           </button>
           <button onClick={() => onPay()} className="w-full h-14 bg-transparent border border-white/10 text-gray-500 font-bold text-xs uppercase tracking-widest rounded-2xl hover:text-white hover:bg-white/5 transition-colors">
              Şu an paylaşma, Sadece Oluştur
           </button>
        </motion.div>
      </motion.div>
    );
  }

  const Row: React.FC<{ label: string; sub?: string; amount: number; color?: string }> = ({ label, sub, amount, color }) => (
    <div className="flex items-center justify-between py-3 border-b border-white/5">
      <div>
        <p className="text-sm font-bold text-white">{label}</p>
        {sub && <p className="text-[10px] text-gray-500">{sub}</p>}
      </div>
      <p className={`text-sm font-black ${color || 'text-white'}`}>{amount}₺</p>
    </div>
  );

  return (
    <motion.div key="payment" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}
      className="flex-1 px-5 py-5 space-y-5 overflow-y-auto custom-scrollbar pb-36">

      <div>
        <h2 className="text-2xl font-black text-white italic uppercase">Ödeme Özeti</h2>
        <p className="text-xs text-gray-500 mt-1">Kaporayı ödeyin ve rezervasyonu tamamlayın</p>
      </div>

      {/* Maç bilgileri */}
      <div className="bg-[#161B22] rounded-2xl border border-white/5 p-4 space-y-1">
        <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-3">MAÇ BİLGİLERİ</p>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#FFFF00]/10 rounded-xl flex items-center justify-center text-xl">⚽</div>
          <div>
            <p className="text-sm font-black text-white">{format.label} Format</p>
            <p className="text-[10px] text-gray-500">Takımımda {myCount} oyuncu hazır</p>
          </div>
        </div>
      </div>

      {/* Saha */}
      {pitch && (
        <div className="bg-[#161B22] rounded-2xl border border-white/5 overflow-hidden">
          <div className="relative h-28">
            <img src={pitch.image} className="w-full h-full object-cover" alt={pitch.name} />
            <div className="absolute inset-0 bg-gradient-to-r from-[#161B22]/90 via-transparent to-transparent" />
            <div className="absolute inset-0 p-4 flex items-end">
              <div>
                <p className="text-xs font-black text-gray-400 uppercase tracking-widest">SAHA</p>
                <p className="text-base font-black text-white italic uppercase">{pitch.name}</p>
                <div className="flex items-center gap-3 mt-1">
                  <p className="text-[10px] text-[#FFFF00] flex items-center gap-1"><MapPin size={9} />{pitch.district}</p>
                  {timeSlot && <p className="text-[10px] text-[#FFFF00] flex items-center gap-1"><Clock size={9} />{timeSlot.split(' - ')[0]}</p>}
                </div>
              </div>
              <p className="ml-auto text-2xl font-black text-[#FFFF00]">{pitch.totalPrice}₺</p>
            </div>
          </div>
        </div>
      )}

      {/* Hizmetler */}
      {(gk || ref) && (
        <div className="bg-[#161B22] rounded-2xl border border-white/5 p-4">
          <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-3">DESTEK KADROSU</p>
          {gk && (
            <div className="flex items-center gap-3 mb-3">
              <img src={gk.avatar} className="w-10 h-10 rounded-full border border-emerald-500/30" alt={gk.name} referrerPolicy="no-referrer" />
              <div className="flex-1">
                <p className="text-sm font-black text-white">{gk.name}</p>
                <p className="text-[10px] text-emerald-400">KALECİ • {gk.preferredZones[0]}</p>
              </div>
              <p className="text-sm font-black text-emerald-400">{gk.fee}₺</p>
            </div>
          )}
          {ref && (
            <div className="flex items-center gap-3">
              <img src={ref.avatar} className="w-10 h-10 rounded-full border border-[#FFFF00]/30" alt={ref.name} referrerPolicy="no-referrer" />
              <div className="flex-1">
                <p className="text-sm font-black text-white">{ref.name}</p>
                <p className="text-[10px] text-[#FFFF00]">HAKEM • {ref.isElite ? 'FIFA Kokartlı' : ref.preferredZones[0]}</p>
              </div>
              <p className="text-sm font-black text-[#FFFF00]">{ref.fee}₺</p>
            </div>
          )}
        </div>
      )}

      {/* Toplam */}
      <div className="bg-[#161B22] rounded-2xl border border-[#FFFF00]/20 p-5 space-y-1 shadow-lg">
        <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest mb-3">ÖDEME DÖKÜMÜ</p>
        {pitch && <Row label="Saha Kirası" sub={pitch.name} amount={pitchCost} />}
        {gk && <Row label="Kaleci" sub={gk.name} amount={gkCost} color="text-emerald-400" />}
        {ref && <Row label="Hakem" sub={ref.name} amount={refCost} color="text-[#FFFF00]" />}
        
        <div className="flex items-center justify-between pt-4 pb-3 border-b border-white/5">
          <div>
            <p className="text-sm font-black text-white">TOPLAM TUTAR</p>
            <p className="text-[10px] text-gray-500">≈ {perPlayer}₺ / oyuncu</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-black text-gray-500 line-through opacity-60">{total}₺</p>
          </div>
        </div>

        <div className="flex items-center justify-between pt-4">
          <div>
            <p className="text-lg font-black text-[#FFFF00] uppercase">ÖDENECEK KAPORA</p>
            <p className="text-[9px] text-[#FFFF00]/70 font-bold uppercase tracking-widest">%20 GÜVENCE BEDELİ</p>
          </div>
          <div className="text-right">
            <p className="text-4xl font-black text-[#FFFF00]">{deposit}<span className="text-xl">₺</span></p>
          </div>
        </div>
      </div>

      {/* Rakip Bul İlanı Option */}
      <div className="bg-red-950/20 rounded-2xl border border-red-500/20 p-4 flex items-center justify-between group cursor-pointer hover:bg-red-500/5 transition-colors" onClick={() => setWantsOpponentAd(!wantsOpponentAd)}>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${wantsOpponentAd ? 'bg-red-500/20 text-red-500' : 'bg-[#161B22] text-gray-500 border border-white/5'}`}>
            <Swords size={20} />
          </div>
          <div>
            <p className="text-sm font-black text-white">Rakip Aranıyor İlanı Aç</p>
            <p className="text-[10px] text-red-400">Match Discovery'de takımın için rakip bul.</p>
          </div>
        </div>
        <div className={`w-12 h-6 rounded-full p-1 transition-colors ${wantsOpponentAd ? 'bg-red-500' : 'bg-[#161B22] border border-white/10'}`}>
          <div className={`w-4 h-4 rounded-full transition-transform ${wantsOpponentAd ? 'translate-x-6 bg-white' : 'translate-x-0 bg-gray-500'}`} />
        </div>
      </div>

      {/* Spacer for sticky footer */}
      <div className="h-4" />

      {/* Sticky footer */}
      <div className="fixed bottom-0 left-0 right-0 z-20 p-4 bg-[#0A0E14]/95 backdrop-blur-xl border-t border-white/10 space-y-3">
        <div className="flex items-center gap-2 px-1">
          <CalendarCheck size={14} className="text-gray-400" />
          <span className="text-[10px] text-gray-400">Geri kalan tutar saha lobisinde ödenecektir</span>
        </div>
        <motion.button disabled={isPaying} whileTap={{ scale: 0.97 }} onClick={handlePayDeposit}
          className={`w-full h-16 font-black text-base rounded-2xl flex items-center justify-center gap-3 transition-colors shadow-2xl ${isPaying ? 'bg-gray-800 text-gray-500 cursor-not-allowed' : 'bg-[#FFFF00] text-black shadow-[0_0_30px_rgba(255,255,0,0.3)] hover:bg-yellow-300'}`}>
          {isPaying ? <Activity className="animate-spin" size={20} /> : <><CreditCard size={20} /> {deposit}₺ KAPORAYI ÖDE</>}
        </motion.button>
      </div>
    </motion.div>
  );
};

// ─── MAIN ──────────────────────────────────────────────────────────────────────
const MatchCreate: React.FC<MatchCreateProps> = ({ onBack, onNavigate }) => {
  const [step, setStep] = useState(1);
  const [format, setFormat] = useState<typeof FORMATS[0]>(FORMATS[4]);
  const [teamCount, setTeamCount] = useState(0);
  const [selectedPitch, setSelectedPitch] = useState<Pitch | null>(null);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string | null>(null);
  const [selectedGk, setSelectedGk] = useState<Goalkeeper | null>(null);
  const [selectedRef, setSelectedRef] = useState<Referee | null>(null);
  const [wantsOpponentAd, setWantsOpponentAd] = useState(false);
  const { addOpponentAd, incrementUnreadNotifications, addUserNotification } = useAppStore();

  const prev = () => {
    if (step === 1) onBack();
    else setStep(s => s - 1);
  };

  return (
    <div className="min-h-screen bg-[#0A0E14] flex flex-col font-sans">
      {/* Header */}
      <header className="flex items-center justify-between px-5 pt-6 pb-3 bg-[#0A0E14] border-b border-white/5 flex-shrink-0">
        <button onClick={prev} className="w-10 h-10 flex items-center justify-center bg-[#161B22] rounded-full text-white border border-white/5 hover:bg-white/10 transition-colors">
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-sm font-black tracking-widest text-white uppercase">MAÇ OLUŞTUR</h1>
        <div className="w-10 h-10 bg-[#FFFF00]/10 rounded-full flex items-center justify-center border border-[#FFFF00]/20">
          <Zap size={18} className="text-[#FFFF00] fill-current" />
        </div>
      </header>

      <ProgressBar step={step} />

      <AnimatePresence mode="wait">
        {step === 1 && (
          <FormatStep onSelect={f => { setFormat(f); setStep(2); }} />
        )}
        {step === 2 && (
          <TeamsStep format={format} onNext={(count) => { setTeamCount(count); setStep(3); }} />
        )}
        {step === 3 && (
          <PitchSelectStep
            selectedPitch={selectedPitch}
            selectedTimeSlot={selectedTimeSlot}
            onSelectPitch={setSelectedPitch}
            onSelectTimeSlot={setSelectedTimeSlot}
            onNext={() => setStep(4)}
          />
        )}
        {step === 4 && (
          <ServicesStep
            selectedPitch={selectedPitch}
            selectedTimeSlot={selectedTimeSlot}
            selectedGk={selectedGk}
            selectedRef={selectedRef}
            onSelectGk={setSelectedGk}
            onSelectRef={setSelectedRef}
            onNext={() => setStep(5)}
            onNavigate={onNavigate}
          />
        )}
        {step === 5 && (
            <PaymentStep
              format={format}
              myCount={teamCount}
              pitch={selectedPitch}
              timeSlot={selectedTimeSlot}
              gk={selectedGk}
              ref={selectedRef}
              wantsOpponentAd={wantsOpponentAd}
              setWantsOpponentAd={setWantsOpponentAd}
              onPay={() => {
                if (wantsOpponentAd) {
                  addOpponentAd({
                    id: `ad-${Date.now()}`,
                    name: 'Benim Takım',
                    pitch: selectedPitch?.name || 'Seçilmedi',
                    time: '20:00 - 21:00',
                    date: new Date().toLocaleDateString('tr-TR'),
                    weather: { temp: 15, condition: 'SUNNY' },
                    logo: 'https://api.dicebear.com/7.x/identicon/svg?seed=newteam',
                    level: 'MEDIUM',
                    distance: 'Yakın',
                    winRate: '50',
                    avgAge: '24',
                    matches: 1,
                    colors: ['#EF4444', '#000000'],
                    wins: 1,
                    losses: 0,
                    playStyle: 'Dengeli',
                    roster: [],
                    coordinates: { x: 50, y: 50, lat: 41.0, lng: 29.0 },
                    stats: { attack: 70, defense: 70, midfield: 70, physical: 70, teamwork: 70 }
                  });
                }
                addUserNotification({
                  id: Date.now(),
                  type: 'MATCH_CREATED',
                  title: 'Maç Oluşturuldu',
                  desc: `${selectedPitch?.name || 'Seçili Saha'}, ${new Date().toLocaleDateString('tr-TR')} ${selectedTimeSlot?.split(' - ')[0] || ''}. Maç başarıyla davetli listesine ve takım ekranına gönderildi!`,
                  time: 'Şimdi',
                  iconName: 'Check',
                  color: 'bg-green-500',
                  textColor: 'text-green-500'
                });
                incrementUnreadNotifications();
                onNavigate('DASHBOARD');
              }}
            />
        )}
      </AnimatePresence>
    </div>
  );
};

export default MatchCreate;
