
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, ChevronRight, Users, UserPlus, Share2, Search,
  Shield, Scale, Star, Check, Plus, Copy, X, Zap, MapPin,
  Trophy, Layers, Droplets, CreditCard, SkipForward,
  CalendarCheck, Activity, Swords, Clock, ChevronLeft, Lock,
  Filter, Map as MapIcon, LayoutGrid, Heart, Thermometer, Wind, Sun, Moon, Radio,
  Target, Feather, CheckCircle2, ArrowRight
} from 'lucide-react';
import { Pitch, Goalkeeper, Referee, AppView, PlayerSeekAnnouncement } from '../types';
import { useAppStore } from '../store';
import { ORDU_CENTER, ORDU_DISTRICTS } from '../utils/orduData';
import Marketplace from './Marketplace';
import SharedPitch from '../components/SharedPitch';
import PitchDiscovery from './PitchDiscovery';
import { PageLayout } from '../components/common/PageLayout';
import { AnimatedButton } from '../components/AnimatedButton';
import { useMatchCreate } from '../hooks/useMatchCreate';

import { MapContainer, TileLayer, Marker, Popup, useMap, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getHaversineDistance } from '../utils/geo';

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
  { v: '10v10', label: '10v10', players: 20, popular: false },
  { v: '11v11', label: '11v11', players: 22, popular: false },
];

const GENDER_OPTIONS = ['Karma', 'Erkek', 'Kadın'];
const AGE_OPTIONS = ['10-14', '14-16', '16-18', '18-22', '23-27', '28-35', '35+', 'Tümü'];

const ROLE_OPTIONS = [
  { id: 'HÜC', label: 'HÜCUM', color: '#ef4444' },
  { id: 'ORT', label: 'ORTA', color: '#f97316' },
  { id: 'SAV', label: 'SAVUNMA', color: '#3b82f6' },
  { id: 'KL', label: 'KALECİ', color: '#10b981' }
];

const MENTALITY_OPTIONS = [
  { id: 'ciddi', title: 'CİDDİ', subtitle: 'Rekabetçi', icon: Zap, color: '#FFFF00' },
  { id: 'taktiksel', title: 'TAKTİKSEL', subtitle: 'Sistem', icon: Target, color: '#3b82f6' },
  { id: 'rahat', title: 'RAHAT', subtitle: 'Eğlence', icon: Feather, color: '#10b981' }
];

const STEP_LABELS = ['Format', 'Takımlar', 'Saha', 'Hizmetler', 'Tamamla'];

// ─── PROGRESS BAR ──────────────────────────────────────────────────────────────
const ProgressBar: React.FC<{ step: number }> = ({ step }) => (
  <div className="flex items-center gap-0 px-4 py-4 bg-[#0A0E14] border-b border-white/5 relative">
    <div className="flex items-center gap-0 w-full relative z-10">
      {STEP_LABELS.map((label, i) => {
        const num = i + 1;
        const isActive = num === step;
        const isDone = num < step;
        return (
          <React.Fragment key={label}>
            <div className="flex flex-col items-center gap-1 min-w-0 relative">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black transition-all duration-300 flex-shrink-0 relative z-10 ${
                isDone ? 'bg-[#FFFF00] text-black shadow-[0_0_15px_rgba(255,255,0,0.6)]' 
                : isActive ? 'bg-[#FFFF00] text-black shadow-[0_0_25px_rgba(255,255,0,0.8)]' 
                : 'bg-[#161B22] text-gray-600 border border-white/10'
              }`}>
                <span className="relative z-10">{isDone ? <Check size={14} strokeWidth={3} /> : num}</span>
              </div>
              <span className={`text-[8px] font-black uppercase tracking-[0.15em] truncate max-w-[50px] text-center transition-colors duration-300 mt-1 ${isActive || isDone ? 'text-[#FFFF00] drop-shadow-sm' : 'text-gray-600'}`}>{label}</span>
            </div>
            {i < STEP_LABELS.length - 1 && (
              <div className="flex-1 h-1 mx-2 rounded-full overflow-hidden bg-[#161B22] min-w-0 border border-white/5 relative">
                <div className={`absolute top-0 left-0 h-full bg-[#FFFF00] transition-all duration-500 shadow-[0_0_10px_rgba(255,255,0,0.8)] ${isDone ? 'w-full' : 'w-0'}`} />
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  </div>
);

// ─── STEP 1: FORMAT ────────────────────────────────────────────────────────────
const FormatStep: React.FC<{ onSelect: (f: typeof FORMATS[0]) => void }> = ({ onSelect }) => {
  const [selected, setSelected] = useState('7v7');
  return (
    <motion.div key="fmt" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }}
      className="flex-1 px-5 py-6 space-y-6 overflow-y-auto custom-scrollbar relative">
      
      <div className="absolute -top-40 -right-40 w-96 h-96 bg-[#FFFF00]/10 blur-[100px] pointer-events-none rounded-full" />
      <div className="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-[#0A0E14] to-transparent pointer-events-none" />

      <div className="relative z-10">
        <h2 className="text-4xl font-black text-white italic uppercase tracking-tighter drop-shadow-md">Maç Formatı</h2>
        <p className="text-[11px] text-[#FFFF00] font-bold uppercase tracking-widest mt-1 drop-shadow-sm">Saha tipini ve oyuncu sayısını seç</p>
      </div>

      <div className="grid grid-cols-2 gap-4 relative z-10">
        {FORMATS.map(fmt => {
          const isSelected = selected === fmt.v;
          return (
            <motion.button key={fmt.v} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.96 }}
              onClick={() => setSelected(fmt.v)}
              className={`relative rounded-3xl p-5 text-left transition-all duration-300 overflow-hidden group border ${
                isSelected 
                ? 'bg-[#FFFF00]/10 border-[#FFFF00]/60 shadow-[0_10px_30px_rgba(255,255,0,0.2)]' 
                : 'bg-[#161B22]/80 backdrop-blur-md border-white/5 hover:border-white/20 hover:bg-[#161B22]'
              }`}>
              
              {isSelected && <motion.div layoutId="format-bg-glow" className="absolute inset-0 bg-gradient-to-br from-[#FFFF00]/20 to-transparent pointer-events-none" />}
              
              {fmt.popular && (
                <span className="absolute top-0 right-0 px-3 py-1 bg-gradient-to-r from-orange-500 to-red-500 text-white text-[9px] font-black uppercase tracking-widest rounded-bl-xl rounded-tr-3xl shadow-lg z-20">🔥 Popüler</span>
              )}
              
              <div className="relative z-10">
                 <p className={`text-3xl font-black mb-1 italic tracking-tighter transition-colors duration-300 ${isSelected ? 'text-[#FFFF00] drop-shadow-[0_0_10px_rgba(255,255,0,0.5)]' : 'text-white'}`}>{fmt.label}</p>
                 <p className={`text-[11px] font-bold uppercase tracking-widest transition-colors ${isSelected ? 'text-[#FFFF00]/80' : 'text-gray-500'}`}>{fmt.players} Oyuncu</p>
              </div>

              {isSelected && (
                 <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute bottom-4 right-4 w-8 h-8 rounded-full bg-[#FFFF00] flex items-center justify-center text-black shadow-lg z-20">
                    <Check size={18} strokeWidth={3} />
                 </motion.div>
              )}
            </motion.button>
          );
        })}
      </div>

      <div className="relative z-10 p-5 bg-[#161B22]/90 backdrop-blur-xl border border-[#FFFF00]/20 rounded-3xl flex items-center gap-4 shadow-2xl">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#FFFF00] to-yellow-600 p-[2px] shadow-[0_0_20px_rgba(255,255,0,0.3)] flex-shrink-0">
           <div className="w-full h-full bg-[#0A0E14] rounded-2xl flex items-center justify-center text-3xl">⚽</div>
        </div>
        <div>
          <p className="text-base font-black text-white italic uppercase tracking-tight">{FORMATS.find(f => f.v === selected)?.label} SEÇİLDİ</p>
          <p className="text-[11px] text-gray-400 font-bold tracking-wide">Her takımda {parseInt(selected) || 7} oyuncu yer alacak.</p>
        </div>
      </div>

      <motion.button whileTap={{ scale: 0.95 }} onClick={() => onSelect(FORMATS.find(f => f.v === selected)!)}
        className="relative z-10 w-full h-16 bg-[#FFFF00] hover:bg-[#FFFF00]/90 text-black font-black text-sm uppercase tracking-[0.2em] rounded-2xl flex items-center justify-center gap-3 shadow-[0_0_30px_rgba(255,255,0,0.4)] transition-all mt-4">
        TAKIMLARI KUR <ChevronRight size={20} strokeWidth={3} />
      </motion.button>
    </motion.div>
  );
};

// Helper for dynamic, perfectly centered and symmetrical field formations
const getSymmetricalFormation = (formatKey: string): { x: number; y: number; role: string }[] => {
  switch (formatKey) {
    case '3v3':
      return [
        { x: 50, y: 88, role: 'KL' },
        { x: 25, y: 45, role: 'OS' }, { x: 75, y: 45, role: 'OS' }
      ];
    case '4v4':
      return [
        { x: 50, y: 88, role: 'KL' },
        { x: 50, y: 65, role: 'STP' },
        { x: 25, y: 35, role: 'OS' }, { x: 75, y: 35, role: 'OS' }
      ];
    case '5v5':
      return [
        { x: 50, y: 88, role: 'KL' },
        { x: 50, y: 70, role: 'STP' },
        { x: 25, y: 45, role: 'OS' }, { x: 75, y: 45, role: 'OS' },
        { x: 50, y: 22, role: 'SNT' }
      ];
    case '6v6':
      return [
        { x: 50, y: 88, role: 'KL' },
        { x: 30, y: 70, role: 'STP' }, { x: 70, y: 70, role: 'STP' },
        { x: 30, y: 45, role: 'OS' }, { x: 70, y: 45, role: 'OS' },
        { x: 50, y: 22, role: 'SNT' }
      ];
    case '7v7':
      return [
        { x: 50, y: 88, role: 'KL' },
        { x: 30, y: 70, role: 'STP' }, { x: 70, y: 70, role: 'STP' },
        { x: 20, y: 45, role: 'OS' }, { x: 50, y: 45, role: 'OS' }, { x: 80, y: 45, role: 'OS' },
        { x: 50, y: 22, role: 'SNT' }
      ];
    case '8v8':
      return [
        { x: 50, y: 88, role: 'KL' },
        { x: 20, y: 70, role: 'STP' }, { x: 50, y: 72, role: 'STP' }, { x: 80, y: 70, role: 'STP' },
        { x: 30, y: 45, role: 'OS' }, { x: 70, y: 45, role: 'OS' },
        { x: 35, y: 22, role: 'SNT' }, { x: 65, y: 22, role: 'SNT' }
      ];
    case '9v9':
      return [
        { x: 50, y: 88, role: 'KL' },
        { x: 20, y: 70, role: 'STP' }, { x: 50, y: 72, role: 'STP' }, { x: 80, y: 70, role: 'STP' },
        { x: 20, y: 45, role: 'OS' }, { x: 50, y: 45, role: 'OS' }, { x: 80, y: 45, role: 'OS' },
        { x: 35, y: 22, role: 'SNT' }, { x: 65, y: 22, role: 'SNT' }
      ];
    case '11v11':
      return [
        { x: 50, y: 88, role: 'KL' },
        { x: 15, y: 70, role: 'STP' }, { x: 38, y: 72, role: 'STP' }, { x: 62, y: 72, role: 'STP' }, { x: 85, y: 70, role: 'STP' },
        { x: 25, y: 45, role: 'OS' }, { x: 50, y: 47, role: 'OS' }, { x: 75, y: 45, role: 'OS' },
        { x: 20, y: 22, role: 'SLA' }, { x: 50, y: 20, role: 'SNT' }, { x: 80, y: 22, role: 'SĞA' }
      ];
    default:
      return [
        { x: 50, y: 88, role: 'KL' }, { x: 30, y: 70, role: 'STP' }, { x: 70, y: 70, role: 'STP' },
        { x: 20, y: 45, role: 'OS' }, { x: 50, y: 45, role: 'OS' }, { x: 80, y: 45, role: 'OS' },
        { x: 50, y: 22, role: 'SNT' }
      ];
  }
};

// ─── STEP 2: TEAMS ─────────────────────────────────────────────────────────────
const TeamsStep: React.FC<{ format: typeof FORMATS[0]; onNext: (c: number) => void }> = ({ format, onNext }) => {
  const { friends, userTeams, adminUsers } = useAppStore();
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

  const togglePlayer = (f: any) => {
    setMyPlayers(prev => {
      const exists = prev.find(p => p.id === f.id);
      if (exists) return prev.filter(p => p.id !== f.id);
      if (prev.length >= perTeam) return prev;
      return [...prev, { id: f.id, name: f.name, avatar: f.avatar }];
    });
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
      <div className="relative bg-[#06080A]/80 backdrop-blur-xl rounded-[24px] border border-white/10 overflow-hidden shadow-[0_10px_40px_rgba(0,0,0,0.5)] group">
        <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#FFFF00]/40 to-transparent opacity-50" />

        <div className="px-4 py-3 bg-black/40 border-b border-white/5 flex items-center justify-between relative z-10">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-[#FFFF00] rounded-full shadow-[0_0_8px_rgba(255,255,0,0.8)]" />
            <span className="text-xs font-black text-[#FFFF00] uppercase tracking-widest drop-shadow-md">BENİM TAKIM</span>
          </div>
          <span className="text-[10px] text-gray-400 font-bold">{myPlayers.length}/{perTeam} Oyuncu</span>
        </div>
        
        <div className="p-3 relative z-10 w-full max-w-[300px] mx-auto">
          <SharedPitch 
            mode="create" 
            slots={slots.map((_, i) => {
              const defaultPositions = getSymmetricalFormation(format.v);
              return {
                  id: `slot_${i}`,
                  x: defaultPositions[i % defaultPositions.length].x,
                  y: defaultPositions[i % defaultPositions.length].y,
                  role: defaultPositions[i % defaultPositions.length].role,
                  player: myPlayers[i]
              };
            })}
            onSlotClick={() => { setShowFriendPicker(true); setShowTeamPicker(false); }}
          />
        </div>
        
        <div className="px-3 pb-3 grid grid-cols-2 gap-2 relative z-10">
          <button onClick={() => { setShowTeamPicker(!showTeamPicker); setShowFriendPicker(false); setShowQuickInput(false); }}
            className={`flex items-center justify-center gap-1.5 h-12 bg-[#161B22]/80 backdrop-blur-md text-white border ${showTeamPicker ? 'border-[#FFFF00]/50 shadow-[0_0_15px_rgba(255,255,0,0.2)]' : 'border-white/10 hover:bg-white/10 hover:border-white/20'} rounded-2xl text-[11px] font-black uppercase transition-all group`}>
            <Users size={14} className={`${showTeamPicker ? 'text-[#FFFF00]' : 'text-gray-400 group-hover:text-white'} transition-colors`} /> Takımlarım
          </button>
          <button onClick={() => { setShowFriendPicker(!showFriendPicker); setShowTeamPicker(false); setShowQuickInput(false); }}
            className={`flex items-center justify-center gap-1.5 h-12 bg-[#161B22]/80 backdrop-blur-md text-white border ${showFriendPicker ? 'border-[#FFFF00]/50 shadow-[0_0_15px_rgba(255,255,0,0.2)]' : 'border-white/10 hover:bg-white/10 hover:border-white/20'} rounded-2xl text-[11px] font-black uppercase transition-all group`}>
            <UserPlus size={14} className={`${showFriendPicker ? 'text-[#FFFF00]' : 'text-gray-400 group-hover:text-white'} transition-colors`} /> Arkadaşlarım
          </button>
        </div>
        
        <AnimatePresence>
          {showTeamPicker && (
            <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden relative z-10">
              <div className="border-t border-white/5 p-3 space-y-2 max-h-48 overflow-y-auto custom-scrollbar bg-black/20">
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest px-1">Kayıtlı Takımlarım</p>
                {userTeams.map(t => (
                  <button key={t.id} 
                    onClick={() => {
                      const newPlayers = t.roster.slice(0, perTeam).map(p => ({ id: p.id, name: p.name, avatar: p.avatar }));
                      setMyPlayers(newPlayers);
                      setShowTeamPicker(false);
                    }}
                    className="w-full flex items-center justify-between p-2.5 rounded-2xl border border-white/5 bg-[#161B22]/50 hover:border-[#FFFF00]/30 hover:bg-[#FFFF00]/5 transition-all group">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-black/60 border border-white/10 p-1 flex items-center justify-center group-hover:border-[#FFFF00]/30 transition-colors shadow-inner">
                        <img src={t.logo} className="w-full h-full object-contain drop-shadow-md" alt="" />
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-black text-white italic tracking-tighter uppercase drop-shadow-sm">{t.name}</p>
                        <p className="text-[10px] text-gray-400 font-bold">{t.roster.length} Oyuncu</p>
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-gray-500 group-hover:text-[#FFFF00] transition-colors" />
                  </button>
                ))}
                {userTeams.length === 0 && <p className="text-xs text-gray-600 text-center py-4 font-bold">Henüz kayıtlı takımın yok.</p>}
              </div>
            </motion.div>
          )}
          
          {showFriendPicker && (
            <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }} className="overflow-hidden relative z-10">
              <div className="border-t border-white/5 p-4 bg-black/20">
                <div className="flex items-center justify-between mb-3 px-1">
                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Arkadaş Seç</p>
                  <span className="text-[10px] font-black text-[#FFFF00]">{myPlayers.length}/{perTeam} Seçildi</span>
                </div>
                <div className="grid grid-cols-3 gap-2 max-h-60 overflow-y-auto custom-scrollbar p-1">
                  {confirmedFriends.map(f => {
                    const already = myPlayers.some(p => p.id === f.id);
                    const disabled = !already && myPlayers.length >= perTeam;
                    return (
                      <button key={f.id} onClick={() => togglePlayer(f)} disabled={disabled}
                        className={`relative flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl border transition-all ${already ? 'bg-[#FFFF00]/10 border-[#FFFF00] shadow-[0_0_15px_rgba(255,255,0,0.2)] scale-[1.02]' : disabled ? 'opacity-30 cursor-not-allowed bg-black/40 border-white/5' : 'bg-[#161B22]/80 border-white/10 hover:border-white/30 hover:bg-white/10'}`}>
                        {already && <div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-[#FFFF00] flex items-center justify-center text-black shadow-sm"><Check size={10} strokeWidth={4} /></div>}
                        <img src={f.avatar} className={`w-10 h-10 rounded-full border-2 ${already ? 'border-[#FFFF00]' : 'border-white/10'} shadow-md`} alt="" />
                        <p className={`text-[10px] font-black tracking-tight leading-none text-center ${already ? 'text-[#FFFF00]' : 'text-white'}`}>{f.name.split(' ').join('\n')}</p>
                        <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-md ${already ? 'bg-[#FFFF00]/20 text-[#FFFF00]' : 'bg-black/50 text-gray-400'}`}>{f.position}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <motion.button whileTap={{ scale: 0.97 }} onClick={() => onNext(myPlayers.length)}
        className="w-full h-14 bg-[#FFFF00] text-black font-black text-sm rounded-2xl flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(255,255,0,0.25)] hover:bg-yellow-300 transition-all uppercase tracking-widest">
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

interface MapViewProps {
  pitches: Pitch[];
  selectedPitch: Pitch | null;
  onPitchSelect: (p: Pitch) => void;
  center: [number, number];
}

const PitchMapResizer = () => {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => { map.invalidateSize(); }, 200);
    return () => clearTimeout(t);
  }, [map]);
  return null;
};

// React component to dynamically set map center
const ChangeView = ({ center }: { center: [number, number] }) => {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center, map]);
  return null;
};

const MapViewComponent = ({ pitches, selectedPitch, onPitchSelect, center }: MapViewProps) => {
  return (
    <div className="absolute inset-0 z-0">
      <style>{AIRBNB_MAP_CSS}</style>
      <MapContainer center={center} zoom={13} className="w-full h-full" zoomControl={false}>
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution=""
        />
        <PitchMapResizer />
        <ChangeView center={center} />

        {/* Proximity Search Area Circle */}
        <Circle
          center={center}
          radius={3000}
          pathOptions={{
            color: '#39FF14',
            fillColor: '#39FF14',
            fillOpacity: 0.03,
            weight: 1.5,
            dashArray: '5, 8'
          }}
        />

        {/* User Location Pulse Marker */}
        <Circle
          center={center}
          radius={120}
          pathOptions={{
            color: '#00D8FF',
            fillColor: '#00D8FF',
            fillOpacity: 0.15,
            weight: 2
          }}
        />
        <Circle
          center={center}
          radius={20}
          pathOptions={{
            color: '#ffffff',
            fillColor: '#00D8FF',
            fillOpacity: 0.9,
            weight: 2
          }}
        />

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
  const [isFavorite, setIsFavorite] = useState(false);
  
  // Create a combined grade from mock qualities
  const avgScore = ((pitch.grassQuality || 85) + (pitch.lighting || 85) + (pitch.lockerRoomQuality || 80)) / 3;
  const grade = getGrade(avgScore);
  const colorOfGrade = gradeColor(grade);

  const dayPrice = pitch.totalPrice;
  const nightPrice = Math.round(pitch.totalPrice * 1.25);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-3 mb-6 cursor-pointer group bg-[#161B22]/60 backdrop-blur-sm rounded-[32px] p-2.5 border border-white/5 hover:border-white/10 transition-all shadow-xl"
      onClick={() => onClick(pitch)}
    >
      {/* Image Container */}
      <div className="relative w-full aspect-[16/9] rounded-3xl overflow-hidden shadow-lg bg-[#0A0E14]">
        <img
          src={pitch.image}
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          alt={pitch.name}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0A0E14]/90 via-black/20 to-transparent"></div>
        
        {/* Favorite Button */}
        <button 
          onClick={(e) => { e.stopPropagation(); setIsFavorite(!isFavorite); }}
          className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center hover:scale-110 transition-transform z-10 border border-white/10"
        >
          <Heart 
            size={18} 
            className={isFavorite ? 'fill-[#FF385C] text-[#FF385C]' : 'fill-black/30 text-white'} 
            strokeWidth={2}
          />
        </button>

        {/* Grade Badge */}
        <div className="absolute top-4 left-4 px-3 py-1.5 bg-black/50 backdrop-blur-md rounded-xl border border-white/10 flex items-center gap-2 shadow-2xl">
          <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest">Saha Notu</span>
          <div className="w-1 h-3 rounded-full bg-white/20"></div>
          <span className={`text-base font-black ${colorOfGrade} drop-shadow-[0_0_8px_currentColor]`}>{grade}</span>
        </div>

        {/* Floating Quick Info */}
        <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between">
            <div className="flex gap-2">
                {pitch.amenities?.slice(0, 2).map((amenity, idx) => (
                    <span key={idx} className="px-2.5 py-1 bg-white/10 backdrop-blur-md border border-white/10 rounded-lg text-[9px] font-black text-white uppercase tracking-widest shadow-sm">
                        {amenity}
                    </span>
                ))}
            </div>
            <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-2.5 py-1.5 rounded-xl border border-white/10 shadow-lg">
                <Star size={12} className="fill-[#FFFF00] text-[#FFFF00]" />
                <span className="text-[12px] font-black text-white">{pitch.rating}</span>
                <span className="text-[10px] text-gray-400 font-bold ml-1 tracking-widest">({pitch.googleReviews})</span>
            </div>
        </div>
      </div>

      {/* Info Container */}
      <div className="flex flex-col px-3 pb-2 pt-1">
        <div className="flex justify-between items-start mb-1.5">
          <h3 className="text-xl font-black text-white truncate pr-4 italic tracking-tighter">{pitch.name}</h3>
        </div>
        
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-1.5">
            <MapPin size={12} className="text-[#39FF14]" /> {pitch.district} <span className="opacity-30 mx-1">•</span> {pitch.distance}
        </p>
        
        <div className="flex gap-2">
            {/* Day Price */}
            <div className="flex-1 bg-[#0A0E14] border border-white/5 rounded-2xl p-3 flex flex-col items-center justify-center relative overflow-hidden group-hover:border-white/10 transition-colors shadow-inner">
                <Sun size={24} className="text-yellow-400/10 absolute -top-1 -left-1" strokeWidth={3} />
                <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1 z-10">Gündüz Fiyatı</span>
                <div className="flex items-baseline gap-1 z-10">
                    <span className="text-lg font-black text-white tracking-tighter">{dayPrice}₺</span>
                    <span className="text-[10px] text-gray-500 font-bold uppercase">/saat</span>
                </div>
            </div>
            {/* Night Price */}
            <div className="flex-1 bg-[#0A0E14] border border-white/5 rounded-2xl p-3 flex flex-col items-center justify-center relative overflow-hidden group-hover:border-white/10 transition-colors shadow-inner">
                <Moon size={24} className="text-blue-400/10 absolute -top-1 -left-1" strokeWidth={3} />
                <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest mb-1 z-10">Gece Fiyatı</span>
                <div className="flex items-baseline gap-1 z-10">
                    <span className="text-lg font-black text-[#FFFF00] tracking-tighter">{nightPrice}₺</span>
                    <span className="text-[10px] text-gray-500 font-bold uppercase">/saat</span>
                </div>
            </div>
        </div>
      </div>
    </motion.div>
  );
};


// ─── STEP 3: SAHA SEÇ ─────────────────────────────────────────────────────────
const DISTRICT_COORDINATES: Record<string, [number, number]> = ORDU_DISTRICTS;

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

  // User proximity center (kullanıcı konumu yoksa Ordu merkez)
  const [mapCenter, setMapCenter] = useState<[number, number]>([ORDU_CENTER.lat, ORDU_CENTER.lng]);

  const { adminPitches } = useAppStore();
  const districts = React.useMemo(() => ['Tümü', ...Array.from(new Set(adminPitches.map((p:any) => p.district)))], [adminPitches]);

  // Sync map center with district filters
  useEffect(() => {
    if (filters.district !== 'Tümü' && DISTRICT_COORDINATES[filters.district]) {
      setMapCenter(DISTRICT_COORDINATES[filters.district]);
    } else {
      setMapCenter([ORDU_CENTER.lat, ORDU_CENTER.lng]);
    }
  }, [filters.district]);

  const handleOpenDetail = (pitch: Pitch) => {
    setLocalSelectedPitch(pitch);
    setIsDetailOpen(true);
    setSelectedCourtId(pitch.courts?.[0]?.id || null);
    setLocalSelectedSlot(null);
    if (pitch.coordinates?.lat && pitch.coordinates?.lng) {
      setMapCenter([pitch.coordinates.lat, pitch.coordinates.lng]);
    }
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
    }).map((p: any) => {
      // Calculate dynamic Haversine distance
      if (p.coordinates?.lat && p.coordinates?.lng) {
        const dist = getHaversineDistance(mapCenter[0], mapCenter[1], p.coordinates.lat, p.coordinates.lng);
        return {
          ...p,
          distance: `${dist.toFixed(1)} km`
        };
      }
      return p;
    });
    if (sortOrder === 'PRICE_ASC') result.sort((a:any, b:any) => a.totalPrice - b.totalPrice);
    return result;
  }, [searchQuery, filters, sortOrder, adminPitches, mapCenter]);

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
      
      <div className="z-20 bg-[#0A0E14]/95 backdrop-blur-2xl pt-5 pb-4 px-5 border-b border-white/5 shrink-0 shadow-lg relative">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/2 h-[1px] bg-gradient-to-r from-transparent via-[#FFFF00]/20 to-transparent" />
        
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-1 bg-[#161B22]/80 backdrop-blur-md p-1 rounded-[14px] border border-white/10 shadow-inner">
            <button onClick={() => setViewMode('LIST')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black transition-all flex items-center gap-2 ${viewMode === 'LIST' ? 'bg-[#FFFF00] text-black shadow-[0_0_15px_rgba(255,255,0,0.3)]' : 'text-gray-500 hover:text-white'}`}><LayoutGrid size={14} /> LİSTE</button>
            <button onClick={() => setViewMode('MAP')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black transition-all flex items-center gap-2 ${viewMode === 'MAP' ? 'bg-[#FFFF00] text-black shadow-[0_0_15px_rgba(255,255,0,0.3)]' : 'text-gray-500 hover:text-white'}`}><MapIcon size={14} /> HARİTA</button>
          </div>
          <button onClick={() => setShowFilters(true)} className={`w-12 h-12 flex items-center justify-center rounded-[14px] transition-all shadow-md ${showFilters ? 'bg-[#FFFF00] text-black shadow-[0_0_15px_rgba(255,255,0,0.3)]' : 'bg-[#161B22] border border-white/10 text-white hover:border-[#FFFF00]/50'}`}><Filter size={20} /></button>
        </div>

        <div className="relative group mb-5">
          <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none text-gray-500 group-focus-within:text-[#FFFF00] transition-colors"><Search size={20} /></div>
          <input type="text" placeholder="Saha veya bölge ara..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full h-14 bg-[#161B22]/50 backdrop-blur-md border border-white/10 rounded-[20px] pl-14 pr-6 text-sm font-bold outline-none focus:border-[#FFFF00]/60 focus:bg-[#161B22] transition-all shadow-inner text-white placeholder:text-gray-600" />
        </div>

        <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-2 -mx-5 px-5">
          <button onClick={() => setFilters({ ...filters, type: filters.type === 'Kapalı' ? 'Tümü' : 'Kapalı' })} className={`shrink-0 px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border ${filters.type === 'Kapalı' ? 'bg-[#FFFF00] text-black border-[#FFFF00] shadow-[0_0_15px_rgba(255,255,0,0.2)]' : 'bg-[#161B22]/80 backdrop-blur-sm text-gray-400 border-white/5 hover:border-white/20'}`}>Kapalı Saha</button>
          <button onClick={() => setFilters({ ...filters, type: filters.type === 'Açık' ? 'Tümü' : 'Açık' })} className={`shrink-0 px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border ${filters.type === 'Açık' ? 'bg-[#FFFF00] text-black border-[#FFFF00] shadow-[0_0_15px_rgba(255,255,0,0.2)]' : 'bg-[#161B22]/80 backdrop-blur-sm text-gray-400 border-white/5 hover:border-white/20'}`}>Açık Saha</button>
          <button onClick={() => setFilters({ ...filters, availability: filters.availability === 'Şu an Boş' ? 'Tümü' : 'Şu an Boş' })} className={`shrink-0 px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border ${filters.availability === 'Şu an Boş' ? 'bg-green-500 text-black border-green-500 shadow-[0_0_15px_rgba(34,197,94,0.3)]' : 'bg-[#161B22]/80 backdrop-blur-sm text-gray-400 border-white/5 hover:border-white/20'}`}>Şu an Boş</button>
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
             <MapViewComponent pitches={filteredPitches} selectedPitch={localSelectedPitch} onPitchSelect={(p:any) => { setLocalSelectedPitch(p); setIsDetailOpen(true); }} center={mapCenter} />
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
                <button disabled={!localSelectedSlot} onClick={handleConfirmAction} className={`flex-[1.5] h-16 rounded-[20px] font-black text-lg uppercase italic tracking-tighter flex items-center justify-center gap-3 transition-all shadow-2xl ${localSelectedSlot ? 'bg-[#FFFF00] text-black shadow-[0_0_20px_rgba(255,255,0,0.4)] active:scale-95' : 'bg-[#FFFF00]/10 border border-[#FFFF00]/20 text-[#FFFF00]/50 shadow-[0_0_15px_rgba(255,255,0,0.05)] cursor-not-allowed'}`}>
                  SEÇİMİ ONAYLA
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
  setPlayerAdCount: (count: number) => void;
  wantsOpponentAd?: boolean;
  setWantsOpponentAd?: (v: boolean) => void;
}> = ({ selectedPitch, selectedTimeSlot, selectedGk, selectedRef, onSelectGk, onSelectRef, onNext, onNavigate, setPlayerAdCount, wantsOpponentAd, setWantsOpponentAd }) => {
  const [activeService, setActiveService] = useState<string | null>(null);
  const [opponentSubView, setOpponentSubView] = useState<'options' | 'private'>('options');
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
      id: 'gk', title: 'Kaleci Davet Et', desc: 'Kalenizi Sağlama Alın', 
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
      id: 'ref', title: 'Hakem Davet Et', desc: 'Maçı Profesyoneller Yönetsin', 
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

            <div className="flex-1 flex flex-col p-6 gap-4 relative">
              {/* Option 1: Özel Maç */}
              <motion.button 
                whileHover={{ scale: 1.02, y: -2 }} whileTap={{ scale: 0.98 }}
                onClick={() => setOpponentSubView('private')}
                className="flex-1 bg-gradient-to-br from-blue-900/40 via-[#161B22] to-[#0A0E14] border border-white/10 rounded-[24px] p-6 flex flex-col items-center justify-center text-center relative overflow-hidden group shadow-lg"
              >
                <div className="absolute inset-0 bg-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-700 blur-2xl pointer-events-none" />
                <div className="w-14 h-14 rounded-full bg-blue-500/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-[0_0_30px_rgba(59,130,246,0.3)]">
                  <Lock size={28} className="text-blue-400" />
                </div>
                <h3 className="text-xl font-black text-white italic tracking-tighter uppercase mb-1">Takım Davet Et</h3>
                <p className="text-[10px] text-blue-300 font-bold uppercase tracking-widest opacity-80">Özel Maç Kodu İle Davet</p>
              </motion.button>

              {/* Option 2: Rakiplere Açık Yap */}
              <motion.button 
                whileHover={{ scale: 1.02, y: -2 }} whileTap={{ scale: 0.98 }}
                onClick={() => {
                  if (setWantsOpponentAd) {
                    setWantsOpponentAd(!wantsOpponentAd);
                    if (!wantsOpponentAd) showToast('Rakip ilanı açıldı! Maçınız Discovery\'de listelenecek.', 'success');
                    setActiveService(null);
                  }
                }}
                className={`flex-1 bg-gradient-to-br from-orange-900/40 via-[#161B22] to-[#0A0E14] border ${wantsOpponentAd ? 'border-orange-500 shadow-[0_0_20px_rgba(249,115,22,0.4)]' : 'border-white/10 shadow-lg'} rounded-[24px] p-6 flex flex-col items-center justify-center text-center relative overflow-hidden group`}
              >
                <div className="absolute inset-0 bg-orange-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-700 blur-2xl pointer-events-none" />
                <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform shadow-[0_0_30px_rgba(249,115,22,0.3)] ${wantsOpponentAd ? 'bg-orange-500 text-white' : 'bg-orange-500/20 text-orange-400'}`}>
                  <Radio size={28} />
                </div>
                <h3 className="text-xl font-black text-white italic tracking-tighter uppercase mb-1">Rakiplere Açık Yap</h3>
                <p className="text-[10px] text-orange-300 font-bold uppercase tracking-widest opacity-80">Genel İlan Ver</p>
              </motion.button>

            </div>
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
                   if (setPlayerAdCount) setPlayerAdCount(activeCount);
                   setActiveService(null); 
                   showToast(`${activeCount} mevkii için ilan yayınlandı! Yakındaki oyuncular bildirim aldı. 🔔`, 'success');
                }} 
                 className={`w-full h-16 text-white font-black text-sm rounded-[24px] flex items-center justify-center gap-2 shadow-lg transition-all active:scale-95 uppercase tracking-widest border ${activeCount > 0 ? 'bg-[#9D00FF] hover:bg-[#8B00E6] shadow-[0_0_40px_rgba(157,0,255,0.8)] border-[#BF40FF] text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]' : 'bg-[#161B22] border-white/5 text-gray-500 cursor-not-allowed'}`}>
                 <Check size={20} className={activeCount > 0 ? "drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]" : ""} /> İLANI YAYINLA {activeCount > 0 && `(${activeCount} OYUNCU)`}
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
  playerAdCount: number;
  wantsPlayerAd: boolean;
  setWantsPlayerAd: (v: boolean) => void;
  onPay: () => void;
}> = ({ format, myCount, pitch, timeSlot, gk, ref, wantsOpponentAd, setWantsOpponentAd, playerAdCount, wantsPlayerAd, setWantsPlayerAd, onPay }) => {
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
        {/* Background celebration glow (Initial burst) */}
        <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: [0, 2, 1.5], opacity: [0, 0.4, 0] }} transition={{ duration: 1.5, ease: "easeOut" }} className="absolute z-0 w-64 h-64 bg-[#FFFF00]/40 rounded-full blur-[100px] pointer-events-none" />
        
        {/* Animated Checkmark Container with Continuous Glow */}
        <motion.div 
          initial={{ scale: 0, rotate: -180 }} 
          animate={{ scale: 1, rotate: 0 }} 
          transition={{ duration: 0.7, type: 'spring', bounce: 0.5 }} 
          className="relative w-28 h-28 mb-8 z-10 flex items-center justify-center"
        >
          {/* Continuous Pulsing Ambient Glow */}
          <motion.div
            animate={{ scale: [1, 1.4, 1], opacity: [0.4, 0.9, 0.4] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            className="absolute inset-0 rounded-full bg-[#FFFF00]/50 blur-xl"
          />
          {/* Main Solid Circle */}
          <div className="relative z-10 w-full h-full rounded-full bg-gradient-to-br from-[#FFFF00] to-yellow-500 flex items-center justify-center border-[4px] border-[#0E1520] shadow-[0_0_40px_rgba(255,255,0,0.8)] text-black">
             <Check size={56} strokeWidth={4} className="drop-shadow-md" />
          </div>
        </motion.div>
        
        <motion.h2 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.5 }} className="text-4xl font-black text-white italic uppercase tracking-tighter mb-2 drop-shadow-md relative z-10">
            MAÇ OLUŞTURULDU!
        </motion.h2>
        
        <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.5 }} className="text-emerald-400 font-bold uppercase tracking-widest text-[11px] mb-10 relative z-10">
            REZERVASYON ONAYLANDI • SAHA AYIRTILDI
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
      className="flex-1 px-5 py-5 space-y-5 overflow-y-auto custom-scrollbar pb-36 relative">

      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[200%] h-[300px] bg-[#FFFF00]/5 pointer-events-none opacity-50 blur-[80px] rounded-full" />

      <div className="relative z-10">
        <h2 className="text-4xl font-black text-white italic uppercase tracking-tighter drop-shadow-md">Tamamla</h2>
        <p className="text-[11px] text-[#FFFF00] font-bold uppercase tracking-widest mt-1">Rezervasyon özetini inceleyin ve onaylayın</p>
      </div>

      <div className="relative bg-[#161B22]/80 backdrop-blur-xl rounded-[32px] border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden z-10">
         <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#FFFF00] to-transparent opacity-80 shadow-[0_0_20px_#FFFF00]" />
         
         <div className="p-6 space-y-6">
            <div>
              <p className="text-[9px] text-[#FFFF00] font-black uppercase tracking-[0.2em] mb-4">MAÇ BİLGİLERİ</p>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-gradient-to-br from-[#FFFF00]/20 to-transparent rounded-[16px] border border-[#FFFF00]/30 flex items-center justify-center text-2xl shadow-inner">⚽</div>
                <div>
                  <p className="text-lg font-black text-white italic uppercase tracking-tight">{format.label} Format</p>
                  <p className="text-[11px] text-gray-400 font-bold tracking-widest">Takımımda {myCount} oyuncu hazır</p>
                </div>
              </div>
            </div>

            {pitch && (
              <div className="rounded-[24px] overflow-hidden border border-white/5 relative group">
                <div className="relative h-32">
                  <img src={pitch.image} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" alt={pitch.name} />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0A0E14] via-[#0A0E14]/50 to-transparent" />
                  <div className="absolute inset-0 p-5 flex flex-col justify-end">
                    <p className="text-[9px] font-black text-[#FFFF00] uppercase tracking-[0.2em] mb-1">SAHA</p>
                    <div className="flex items-end justify-between">
                      <div>
                        <p className="text-xl font-black text-white italic uppercase leading-none drop-shadow-md">{pitch.name}</p>
                        <div className="flex items-center gap-3 mt-2">
                          <p className="text-[10px] text-gray-300 flex items-center gap-1 font-bold"><MapPin size={10} className="text-[#FFFF00]" />{pitch.district}</p>
                          {timeSlot && <p className="text-[10px] text-gray-300 flex items-center gap-1 font-bold"><Clock size={10} className="text-[#FFFF00]" />{timeSlot.split(' - ')[0]}</p>}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {(gk || ref) && (
              <div className="space-y-4">
                <p className="text-[9px] text-gray-500 font-black uppercase tracking-[0.2em]">DESTEK KADROSU</p>
                {gk && (
                  <div className="flex items-center gap-4 p-3 bg-emerald-500/5 rounded-[20px] border border-emerald-500/20">
                    <img src={gk.avatar} className="w-12 h-12 rounded-full border-2 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.3)]" alt={gk.name} referrerPolicy="no-referrer" />
                    <div className="flex-1">
                      <p className="text-base font-black text-white uppercase italic">{gk.name}</p>
                      <p className="text-[10px] text-emerald-400 font-bold tracking-widest">KALECİ • {gk.preferredZones[0]}</p>
                    </div>
                  </div>
                )}
                {ref && (
                  <div className="flex items-center gap-4 p-3 bg-[#FFFF00]/5 rounded-[20px] border border-[#FFFF00]/20">
                    <img src={ref.avatar} className="w-12 h-12 rounded-full border-2 border-[#FFFF00]/50 shadow-[0_0_15px_rgba(255,255,0,0.3)]" alt={ref.name} referrerPolicy="no-referrer" />
                    <div className="flex-1">
                      <p className="text-base font-black text-white uppercase italic">{ref.name}</p>
                      <p className="text-[10px] text-[#FFFF00] font-bold tracking-widest">HAKEM • {ref.isElite ? 'FIFA Kokartlı' : ref.preferredZones[0]}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="w-full border-b-2 border-dashed border-white/10" />

            <div className="space-y-2">
               <div className="flex items-center justify-between">
                 <div>
                   <p className="text-lg font-black text-white italic uppercase tracking-tight">SAHA KİRA ÜCRETİ</p>
                   <p className="text-[11px] text-gray-500 font-bold tracking-widest">Toplam Maliyet</p>
                 </div>
                 <div className="text-right">
                   <p className="text-3xl font-black text-[#FFFF00] drop-shadow-[0_0_10px_rgba(255,255,0,0.3)]">{total}₺</p>
                 </div>
               </div>
            </div>
         </div>
      </div>

      <div 
        className={`relative z-10 rounded-[24px] border p-5 flex items-center justify-between group cursor-pointer transition-all duration-300 shadow-lg ${wantsOpponentAd ? 'bg-red-500/10 border-red-500/40 shadow-[0_0_20px_rgba(239,68,68,0.2)]' : 'bg-[#161B22]/40 border-white/5 hover:bg-[#161B22]/80'}`} 
        onClick={() => setWantsOpponentAd(!wantsOpponentAd)}
      >
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 rounded-[16px] flex items-center justify-center transition-colors duration-300 shadow-inner border ${wantsOpponentAd ? 'bg-red-500/20 text-red-400 border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.4)]' : 'bg-[#0A0E14] text-gray-500 border-white/5'}`}>
            <Swords size={24} />
          </div>
          <div>
            <p className={`text-base font-black italic uppercase tracking-tight transition-colors ${wantsOpponentAd ? 'text-white' : 'text-gray-400'}`}>Rakip İlanı Aç</p>
            <p className={`text-[10px] font-bold tracking-widest mt-0.5 transition-colors ${wantsOpponentAd ? 'text-red-400/80' : 'text-gray-600'}`}>MATCH DISCOVERY'DE GÖRÜNÜR OL</p>
          </div>
        </div>
        
        <div className={`w-[52px] h-7 rounded-full p-1 flex items-center shrink-0 transition-colors duration-300 ${wantsOpponentAd ? 'bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.6)]' : 'bg-[#0A0E14] border border-white/10'}`}>
          <motion.div 
            animate={{ x: wantsOpponentAd ? 24 : 0 }} 
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            className={`w-5 h-5 rounded-full shadow-md ${wantsOpponentAd ? 'bg-white' : 'bg-gray-500'}`} 
          />
        </div>
      </div>

      {playerAdCount > 0 && (
        <div 
          className={`relative z-10 rounded-[24px] border p-5 flex items-center justify-between group cursor-pointer transition-all duration-300 shadow-lg ${wantsPlayerAd ? 'bg-purple-500/10 border-purple-500/40 shadow-[0_0_20px_rgba(168,85,247,0.2)]' : 'bg-[#161B22]/40 border-white/5 hover:bg-[#161B22]/80'}`} 
          onClick={() => setWantsPlayerAd(!wantsPlayerAd)}
        >
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-[16px] flex items-center justify-center transition-colors duration-300 shadow-inner border ${wantsPlayerAd ? 'bg-purple-500/20 text-purple-400 border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.4)]' : 'bg-[#0A0E14] text-gray-500 border-white/5'}`}>
              <Users size={24} />
            </div>
            <div>
              <p className={`text-base font-black italic uppercase tracking-tight transition-colors ${wantsPlayerAd ? 'text-white' : 'text-gray-400'}`}>Oyuncu İlanı Aç</p>
              <p className={`text-[10px] font-bold tracking-widest mt-0.5 transition-colors ${wantsPlayerAd ? 'text-purple-400/80' : 'text-gray-600'}`}>{playerAdCount} MEVKİ İÇİN OYUNCU BUL</p>
            </div>
          </div>
          
          <div className={`w-[52px] h-7 rounded-full p-1 flex items-center shrink-0 transition-colors duration-300 ${wantsPlayerAd ? 'bg-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.6)]' : 'bg-[#0A0E14] border border-white/10'}`}>
            <motion.div 
              animate={{ x: wantsPlayerAd ? 24 : 0 }} 
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
              className={`w-5 h-5 rounded-full shadow-md ${wantsPlayerAd ? 'bg-white' : 'bg-gray-500'}`} 
            />
          </div>
        </div>
      )}

      <div className="h-4" />

      <div className="fixed bottom-0 left-0 right-0 z-50 p-5 bg-[#0A0E14]/95 backdrop-blur-2xl border-t border-white/5 space-y-4 shadow-[0_-20px_50px_rgba(0,0,0,0.8)]">
        <div className="flex items-center justify-center gap-2">
          <CalendarCheck size={12} className="text-gray-500" />
          <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">ÖDEME İŞLEMİ SAHADA YAPILACAKTIR</span>
        </div>
        <motion.button disabled={isPaying} whileTap={{ scale: 0.95 }} onClick={handlePayDeposit}
          className={`relative w-full h-16 font-black text-lg uppercase tracking-widest rounded-[20px] flex items-center justify-center gap-3 transition-all overflow-hidden ${isPaying ? 'bg-[#161B22] text-gray-500 cursor-not-allowed border border-white/5' : 'bg-[#FFFF00] text-black shadow-[0_0_30px_rgba(255,255,0,0.4)] hover:bg-yellow-300 hover:shadow-[0_0_40px_rgba(255,255,0,0.6)]'}`}>
          {isPaying ? <Activity className="animate-spin text-gray-500" size={24} /> : <><Check size={24} strokeWidth={3} /> REZERVASYONU TAMAMLA</>}
        </motion.button>
      </div>
    </motion.div>
  );
};

// ─── MAIN ──────────────────────────────────────────────────────────────────────
const MatchCreate: React.FC<MatchCreateProps> = ({ onBack, onNavigate }) => {
  const { friends, userTeams } = useAppStore();
  const {
    activeSheet, setActiveSheet,
    isPublishing,
    pickerTab, setPickerTab,
    pickerCategory, setPickerCategory,
    friendSearch, setFriendSearch,
    selectedFriendsForPicker, setSelectedFriendsForPicker,
    selectedSlotForPicker, setSelectedSlotForPicker,
    format, setFormat,
    dna, setDna,
    manualBudget, setManualBudget,
    matchTitle, setMatchTitle,
    homeTeamName, setHomeTeamName,
    awayTeamName, setAwayTeamName,
    visibility, setVisibility,
    isTeamMatch, setIsTeamMatch,
    homeTeamId, setHomeTeamId,
    myPlayers, setMyPlayers,
    selectedPitch, setSelectedPitch,
    selectedTimeSlot, setSelectedTimeSlot,
    orientation, setOrientation,
    customPositions, setCustomPositions,
    draftMatch, isDraftMode,
    perTeam, isReady,
    handleSlotMove, pitchSlots,
    toggleOrientation, costPerPerson,
    publishMatch
  } = useMatchCreate(onNavigate);

  return (
    <PageLayout
      title="MAÇ LOBİSİ"
      onBack={onBack}
      scrollable={false}
      showSafeBottom={false}
      className="bg-[#06080A]"
      rightElement={
        <button 
          type="button" 
          aria-label="Paylaş"
          className="w-10 h-10 flex items-center justify-center bg-white/5 backdrop-blur-md rounded-full text-white border border-white/10 shadow-lg hover:bg-white/10 transition-colors"
        >
          <Share2 size={16} />
        </button>
      }
    >
      {/* Ambient breathing backgrounds */}
      <motion.div 
         animate={{ x: [-20, 20, -20], y: [-20, 20, -20], scale: [1, 1.1, 1] }} 
         transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
         className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-gradient-to-br from-[#0B2815]/30 to-[#0A0E14] rounded-full blur-[100px] pointer-events-none" 
      />
      <motion.div 
         animate={{ x: [20, -20, 20], y: [20, -20, 20], scale: [1, 1.2, 1] }} 
         transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
         className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-[#39FF14]/5 rounded-full blur-[120px] pointer-events-none" 
      />

      {/* CENTER: PITCH */}
      <div className="flex-1 relative flex flex-col items-center justify-center p-4 pt-10 pb-[360px] z-10 overflow-hidden">
          <div className={`w-full relative transition-all duration-500 flex items-center justify-center drop-shadow-[0_20px_50px_rgba(0,0,0,0.8)] ${orientation === 'horizontal' ? 'w-[95vw] max-w-[550px]' : 'w-[85vw] max-w-[420px]'}`}>
              <SharedPitch 
                mode="edit" 
                slots={pitchSlots}
                orientation={orientation}
                onSlotMove={handleSlotMove}
                onSlotClick={(id) => { setSelectedSlotForPicker(id); setActiveSheet('PLAYER_PICKER'); }}
                onDropPlayer={(slotId, player) => {
                    setMyPlayers(prev => {
                        const next = { ...prev };
                        for (const k in next) { if (next[k].id === player.id) delete next[k]; }
                        next[slotId] = { ...player, avatar: player.avatar || '', status: 'PENDING' as const };
                        return next;
                    });
                }}
              />
          </div>
      </div>

      {/* Console Dashboard Bottom Area */}
      <div className="absolute bottom-0 left-0 right-0 z-20 px-4 pb-6 pt-16 bg-gradient-to-t from-[#06080A] via-[#06080A]/90 to-transparent">
          
          {/* Action Tiles */}
          <div className="flex flex-col gap-3 mb-5">
              
              {/* Saha Seç Tile */}
              <motion.button 
                  whileHover={!isDraftMode ? { scale: 1.01 } : {}}
                  whileTap={!isDraftMode ? { scale: 0.99 } : {}}
                  onClick={() => { if (!isDraftMode) setActiveSheet('PITCH') }}
                  className={`relative overflow-hidden bg-white/5 backdrop-blur-2xl border ${isDraftMode ? 'border-amber-500/50 cursor-not-allowed opacity-90' : 'border-white/10 hover:border-[#39FF14]/50 cursor-pointer'} rounded-2xl p-4 flex justify-between items-center shadow-[0_10px_30px_rgba(0,0,0,0.5)] group transition-colors w-full min-h-[70px]`}
              >
                  <div className={`absolute right-4 opacity-10 ${isDraftMode ? 'text-amber-500' : 'group-hover:opacity-30 group-hover:scale-110'} transition-all transform`}>
                      {isDraftMode ? <Lock size={60} /> : <MapPin size={60} className="text-[#39FF14]" />}
                  </div>
                  <div className="flex flex-col items-start gap-1 relative z-10 w-[80%]">
                      <span className={`text-[10px] font-black uppercase ${isDraftMode ? 'text-amber-400 bg-amber-500/20 border-amber-500/30' : 'text-gray-400 bg-black/40 border-white/5'} tracking-widest px-2 py-0.5 rounded border`}>
                          {isDraftMode ? 'SABİT TESİS' : 'SAHA SEÇ'}
                      </span>
                      <span className={`text-sm font-black uppercase italic text-left leading-tight mt-1 w-full truncate drop-shadow-md ${isDraftMode ? 'text-amber-100' : 'text-white'}`}>
                          {selectedPitch ? selectedPitch.name : 'Henüz Saha Seçilmedi'}
                      </span>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-black/40 border border-white/10 flex items-center justify-center group-hover:bg-[#39FF14] transition-colors relative z-10">
                      <ArrowRight size={14} className="text-white group-hover:text-black" />
                  </div>
              </motion.button>
              
              <div className="flex gap-3">
                  {/* Maç Özellikleri Tile */}
                  <motion.button
                      whileHover={!isDraftMode ? { scale: 1.01 } : {}}
                      whileTap={!isDraftMode ? { scale: 0.99 } : {}}
                      onClick={() => { if (!isDraftMode) setActiveSheet('RULES') }}
                      className={`flex-1 bg-white/5 backdrop-blur-2xl border ${isDraftMode ? 'border-amber-500/30 opacity-90 cursor-not-allowed' : 'border-white/10 hover:border-[#FFFF00]/50'} rounded-2xl p-4 flex flex-col justify-center items-start shadow-lg transition-colors group relative overflow-hidden`}
                  >
                      <div className="absolute right-[-10px] bottom-[-10px] opacity-10 group-hover:opacity-20"><Activity size={60} className="text-[#FFFF00]" /></div>
                      <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-1 flex items-center gap-1.5 z-10"><Activity size={12} className="text-[#FFFF00]"/> MAÇ ÖZELLİKLERİ</span>
                      <span className="text-sm font-black text-white uppercase z-10 drop-shadow-md truncate">{format.label} • {costPerPerson > 0 ? `${costPerPerson}₺` : 'Ücretsiz'}</span>
                  </motion.button>
              </div>
          </div>

          {/* Action Row: Publish Button */}
          <div className="flex flex-col gap-2 relative z-20 mt-2">
             <div className="flex items-center gap-3 w-full">
                 <AnimatedButton 
                    onClick={async () => {
                        if(isReady) {
                            await publishMatch();
                        } else {
                            setActiveSheet('PITCH');
                        }
                    }}
                    isLoading={isPublishing}
                    disabled={isPublishing}
                    className="flex-1 h-[60px]"
                    style={{
                      background: isReady ? '#39FF14' : 'rgba(255,255,255,0.05)',
                      color: isReady ? '#000' : 'rgba(255,255,255,0.3)',
                      boxShadow: isReady && !isPublishing ? '0 0 30px rgba(57,255,20,0.3)' : 'none',
                    }}
                 >
                     {isReady ? (isDraftMode ? 'DAVETLERİ GÖNDER & MAÇI YAYINLA' : 'YAYINLA & DAVET ET') : 'YAYINLA & DAVET ET'}
                 </AnimatedButton>
             </div>
          </div>
      </div>

      {/* BOTTOM SHEETS (Modals) for specific configs */}
      <AnimatePresence>
        {activeSheet === 'PITCH' && (
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 300 }} className="fixed inset-0 z-50 bg-[#0A0E14] flex flex-col">
                <PitchDiscovery 
                   onBack={() => setActiveSheet('NONE')}
                   isSelectionMode={true}
                   onSelectTime={(pitch, court, date, time) => {
                       setSelectedPitch(pitch);
                       setSelectedTimeSlot({ date, time });
                       setActiveSheet('NONE');
                   }}
                />
            </motion.div>
        )}
        {activeSheet === 'RULES' && (
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 300 }} className="fixed inset-0 z-50 bg-[#0A0E14] flex flex-col pt-10">
                <header className="flex items-center justify-between px-6 pb-4 border-b border-white/5">
                    <h2 className="text-lg font-black text-white italic tracking-tighter uppercase drop-shadow-md">MAÇ ÖZELLİKLERİ</h2>
                    <button onClick={() => setActiveSheet('NONE')} className="p-3 bg-white/5 rounded-full text-white hover:bg-white/10 border border-white/5"><X size={18} /></button>
                </header>
                <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8 custom-scrollbar">

                   {/* Maç Adı (opsiyonel) */}
                   <div className="space-y-2">
                     <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50 drop-shadow-md">Maç Adı <span className="text-white/25 normal-case font-normal">(opsiyonel)</span></p>
                     <input
                       type="text"
                       value={matchTitle}
                       onChange={e => setMatchTitle(e.target.value)}
                       placeholder="Süper Lig Derbisi…"
                       maxLength={40}
                       className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-sm font-semibold text-white placeholder-white/20 focus:outline-none focus:border-[#FFFF00]/40 transition-colors"
                     />
                   </div>

                   {/* Maç Görünürlüğü: Açık (vitrin) | Özel (kodla davet) */}
                   <div className="space-y-2">
                     <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50 drop-shadow-md">Görünürlük</p>
                     <div className="grid grid-cols-2 gap-2">
                       <button
                         type="button"
                         onClick={() => setVisibility('OPEN')}
                         className={`flex flex-col items-start gap-1 px-4 py-3 rounded-xl border text-left transition-all ${
                           visibility === 'OPEN'
                             ? 'bg-[#39FF14]/10 border-[#39FF14]/50 shadow-[0_0_20px_rgba(57,255,20,0.15)]'
                             : 'bg-white/[0.02] border-white/10 hover:bg-white/[0.05]'
                         }`}
                       >
                         <span className={`text-xs font-black uppercase tracking-wide ${visibility === 'OPEN' ? 'text-[#39FF14]' : 'text-white'}`}>Açık</span>
                         <span className="text-[9px] text-white/40 font-bold leading-tight">Vitrinde herkes görür</span>
                       </button>
                       <button
                         type="button"
                         onClick={() => setVisibility('PRIVATE')}
                         className={`flex flex-col items-start gap-1 px-4 py-3 rounded-xl border text-left transition-all ${
                           visibility === 'PRIVATE'
                             ? 'bg-[#FFFF00]/10 border-[#FFFF00]/50 shadow-[0_0_20px_rgba(255,255,0,0.15)]'
                             : 'bg-white/[0.02] border-white/10 hover:bg-white/[0.05]'
                         }`}
                       >
                         <span className={`text-xs font-black uppercase tracking-wide ${visibility === 'PRIVATE' ? 'text-[#FFFF00]' : 'text-white'}`}>Özel</span>
                         <span className="text-[9px] text-white/40 font-bold leading-tight">Sadece kodla katılım</span>
                       </button>
                     </div>
                     {visibility === 'PRIVATE' && (
                       <p className="text-[9px] text-[#FFFF00]/70 font-bold leading-relaxed pt-1">
                         Maç oluşturulduktan sonra lobide bir katılım kodu görünecek; bu kodu paylaştığın kişiler maça katılabilir.
                       </p>
                     )}
                   </div>

                   {/* S38: Rakip Takım Davet Et — takım maçı (ev sahibi + deplasman), kodla davet */}
                   <button
                     type="button"
                     onClick={() => {
                       const next = !isTeamMatch;
                       setIsTeamMatch(next);
                       if (next) setVisibility('PRIVATE');
                     }}
                     className={`w-full flex items-center justify-between gap-3 px-4 py-3.5 rounded-2xl border text-left transition-all ${
                       isTeamMatch
                         ? 'bg-red-500/10 border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.15)]'
                         : 'bg-white/[0.02] border-white/10 hover:bg-white/[0.05]'
                     }`}
                   >
                     <div className="flex items-center gap-3 min-w-0">
                       <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${isTeamMatch ? 'bg-red-500/20 text-red-400' : 'bg-white/5 text-gray-400'}`}>
                         <Swords size={20} />
                       </div>
                       <div className="min-w-0">
                         <p className={`text-sm font-black italic uppercase tracking-tight ${isTeamMatch ? 'text-white' : 'text-gray-300'}`}>Rakip Takım Davet Et</p>
                         <p className="text-[10px] text-gray-500 font-bold leading-tight truncate">
                           {homeTeamId ? `${homeTeamName} vs rakip — kodla davet` : 'Takım maçı: kodu rakibe gönder, ödeyip katılır'}
                         </p>
                       </div>
                     </div>
                     <div className={`w-[52px] h-7 rounded-full p-1 flex items-center shrink-0 transition-colors ${isTeamMatch ? 'bg-red-500' : 'bg-[#0A0E14] border border-white/10'}`}>
                       <motion.div animate={{ x: isTeamMatch ? 24 : 0 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }} className={`w-5 h-5 rounded-full ${isTeamMatch ? 'bg-white' : 'bg-gray-500'}`} />
                     </div>
                   </button>
                   {isTeamMatch && (
                     <div className="rounded-2xl bg-red-500/5 border border-red-500/20 px-4 py-3 space-y-1.5">
                       {!homeTeamId && (
                         <p className="text-[10px] text-red-300/90 font-bold leading-relaxed">
                           İpucu: "Takımlarım"dan kadronu sahaya dizersen ev sahibi takımın belirlenir.
                         </p>
                       )}
                       <p className="text-[10px] text-gray-400 font-medium leading-relaxed">
                         Maç oluşturulunca rakip için boş bir <span className="text-white font-bold">deplasman tarafı</span> ve paylaşılabilir <span className="text-[#FFFF00] font-bold">davet kodu</span> oluşur. Rakip takım kodu girip slotlarını ödeyerek katılır. Ödemeyi tek kişi de yapabilir, herkes ayrı ayrı da.
                       </p>
                     </div>
                   )}

                   {/* Takım Formatı */}
                   <div className="space-y-2">
                     <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50 drop-shadow-md">Format</p>
                     <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                       {FORMATS.map(f => (
                         <button
                           key={f.v}
                           onClick={() => setFormat(f as any)}
                           className={`shrink-0 px-4 py-2.5 rounded-xl text-[10px] font-black tracking-widest transition-all backdrop-blur-md border ${
                             format.v === f.v
                               ? 'bg-[#39FF14]/10 border-[#39FF14]/50 text-[#39FF14] shadow-[0_0_20px_rgba(57,255,20,0.2)]'
                               : 'bg-white/[0.02] border-white/10 text-white hover:bg-white/[0.05]'
                           }`}
                         >
                           {f.v}
                         </button>
                       ))}
                     </div>
                   </div>

                   {/* Yaş & Cinsiyet */}
                   <div className="flex gap-4">
                     <div className="flex-1 space-y-2">
                       <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50 drop-shadow-md">Cinsiyet</p>
                       <div className="flex bg-white/[0.02] p-1 rounded-xl border border-white/10 backdrop-blur-md">
                         {GENDER_OPTIONS.map(g => (
                           <button
                             key={g}
                             onClick={() => setDna({ ...dna, gender: g })}
                             className={`flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                               dna.gender === g ? 'bg-white/20 text-white shadow-md drop-shadow-[0_0_5px_rgba(255,255,255,0.5)] border border-white/30' : 'text-white'
                             }`}
                           >
                             {g}
                           </button>
                         ))}
                       </div>
                     </div>
                     <div className="flex-[1.5] space-y-2">
                       <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50 drop-shadow-md">Yaş Grubu</p>
                       <div className="flex overflow-x-auto no-scrollbar gap-1.5 pb-1">
                         {AGE_OPTIONS.map(a => (
                           <button
                             key={a}
                             onClick={() => setDna(prev => ({ ...prev, age: prev.age.includes(a) ? prev.age.filter(x => x !== a) : [...prev.age, a] }))}
                             className={`shrink-0 px-4 py-2 rounded-xl text-[10px] font-black transition-all backdrop-blur-md border ${
                               dna.age.includes(a) ? 'bg-[#FFFF00]/10 border-[#FFFF00]/50 text-[#FFFF00] shadow-[0_0_15px_rgba(255,255,0,0.2)]' : 'bg-white/[0.02] border-white/10 text-white'
                             }`}
                           >
                             {a}
                           </button>
                         ))}
                       </div>
                     </div>
                   </div>

                   {/* Oyun Sertliği */}
                   <div className="space-y-2">
                     <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50 drop-shadow-md">Oyun Sertliği</p>
                     <div className="flex flex-col gap-2">
                       {MENTALITY_OPTIONS.map(m => (
                         <button
                           key={m.id}
                           onClick={() => setDna({ ...dna, mentality: m.id })}
                           className={`h-12 w-full rounded-2xl px-4 flex items-center justify-between border transition-all backdrop-blur-xl overflow-hidden ${
                             dna.mentality === m.id
                               ? 'border-transparent'
                               : 'bg-white/[0.02] border-white/10 hover:bg-white/[0.06] hover:border-white/20'
                           }`}
                           style={dna.mentality === m.id ? { backgroundColor: `${m.color}15`, borderColor: `${m.color}60`, boxShadow: `0 0 30px ${m.color}20` } : {}}
                         >
                           <div className="flex items-center gap-3">
                             <m.icon size={16} className="text-white" style={dna.mentality === m.id ? { color: m.color, filter: `drop-shadow(0 0 5px ${m.color})` } : {}} />
                             <span className={`text-base font-black italic uppercase tracking-tighter ${dna.mentality === m.id ? 'text-white drop-shadow-md' : 'text-white'}`}>
                               {m.title}
                             </span>
                           </div>
                           <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${dna.mentality === m.id ? 'border-transparent' : 'border-white/40'}`} style={dna.mentality === m.id ? { backgroundColor: m.color } : {}}>
                             {dna.mentality === m.id && <CheckCircle2 size={10} className="text-black" />}
                           </div>
                         </button>
                       ))}
                     </div>
                   </div>

                   {/* Ücret */}
                   <div className="space-y-3">
                     <div className="flex items-center justify-between">
                       <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50 drop-shadow-md">Ücret (Kişi Başı)</p>
                       <span className="text-sm font-black text-white">{costPerPerson > 0 ? `${costPerPerson} ₺` : 'Ücretsiz'}</span>
                     </div>
                     <input
                       type="range" min="0" max="500" step="10"
                       value={costPerPerson}
                       onChange={e => setManualBudget(parseInt(e.target.value))}
                       className="w-full accent-[#FFFF00]"
                     />
                     <div className="flex justify-between text-[9px] text-white/25 font-bold">
                       <span>Ücretsiz</span><span>500 ₺</span>
                     </div>
                   </div>

                   {/* Takım Adları (opsiyonel) */}
                   <div className="space-y-3">
                     <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50 drop-shadow-md">Takım Adları <span className="text-white/25 normal-case font-normal">(opsiyonel)</span></p>
                     <div className="flex gap-3">
                       <input
                         type="text"
                         value={homeTeamName}
                         onChange={e => setHomeTeamName(e.target.value)}
                         placeholder="Ev Sahibi Takım"
                         maxLength={20}
                         className="flex-1 bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-sm font-semibold text-white placeholder-white/20 focus:outline-none focus:border-[#39FF14]/40 transition-colors"
                       />
                       <input
                         type="text"
                         value={awayTeamName}
                         onChange={e => setAwayTeamName(e.target.value)}
                         placeholder="Deplasman Takım"
                         maxLength={20}
                         className="flex-1 bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-sm font-semibold text-white placeholder-white/20 focus:outline-none focus:border-red-400/40 transition-colors"
                       />
                     </div>
                   </div>

                   <p className="text-[10px] text-gray-500 text-center">Boş bırakılan alanlar otomatik doldurulur.</p>

                   <button onClick={() => setActiveSheet('NONE')} className="w-full h-[60px] mt-4 bg-[#FFFF00] text-black font-black italic uppercase text-lg rounded-[24px] transition-all shadow-[0_0_35px_rgba(255,255,0,0.65)] hover:shadow-[0_0_45px_rgba(255,255,0,0.85)] active:scale-95 cursor-pointer">
                       ONAYLA
                   </button>
                </div>
            </motion.div>
        )}
        {activeSheet === 'SUPPORT' && (
             <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 300 }} className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end">
                 <div className="w-full bg-[#0D1117] border-t border-white/10 rounded-t-[32px] p-6 pb-12">
                    <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-6" />
                    <h2 className="text-lg font-black text-white italic uppercase tracking-tighter mb-1">PRO DESTEK MERKEZİ</h2>
                    <p className="text-xs text-gray-500 mb-6">Maçın için profesyonel kaleci veya hakem desteği çağır.</p>
                    
                    <div className="grid grid-cols-2 gap-4 mb-6">
                        {/* Kaleci Kartı */}
                        <button 
                          onClick={() => {
                              setActiveSheet('NONE');
                              onNavigate('MARKETPLACE_GK');
                          }}
                          className="p-5 rounded-[24px] bg-[#161B22]/80 backdrop-blur-md border border-green-500/20 hover:border-green-500/50 transition-all flex flex-col items-center text-center gap-3 shadow-[0_0_20px_rgba(34,197,94,0.05)] hover:shadow-[0_0_30px_rgba(34,197,94,0.15)] group"
                        >
                            <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center border border-green-500/30 text-green-400 group-hover:scale-110 transition-transform">
                                <Shield size={24} />
                            </div>
                            <div>
                                <h3 className="text-sm font-black italic uppercase tracking-tight text-white">Kaleci Çağır</h3>
                                <p className="text-[10px] text-gray-400 font-bold mt-1 uppercase tracking-wider">Eksik Kaleyi Doldur</p>
                            </div>
                        </button>

                        {/* Hakem Kartı */}
                        <button 
                          onClick={() => {
                              setActiveSheet('NONE');
                              onNavigate('MARKETPLACE_REF');
                          }}
                          className="p-5 rounded-[24px] bg-[#161B22]/80 backdrop-blur-md border border-blue-500/20 hover:border-blue-500/50 transition-all flex flex-col items-center text-center gap-3 shadow-[0_0_20px_rgba(59,130,246,0.05)] hover:shadow-[0_0_30px_rgba(59,130,246,0.15)] group"
                        >
                            <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/30 text-blue-400 group-hover:scale-110 transition-transform">
                                <Zap size={24} />
                            </div>
                            <div>
                                <h3 className="text-sm font-black italic uppercase tracking-tight text-white">Hakem Çağır</h3>
                                <p className="text-[10px] text-gray-400 font-bold mt-1 uppercase tracking-wider">Profesyonel Yönetim</p>
                            </div>
                        </button>
                    </div>

                    <button onClick={() => setActiveSheet('NONE')} className="w-full h-14 bg-white/5 border border-white/10 text-white font-black uppercase text-xs rounded-2xl tracking-widest hover:bg-white/10 transition-all">
                        KAPAT
                    </button>
                 </div>
             </motion.div>
         )}

        {activeSheet === 'PLAYER_PICKER' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-black/90 backdrop-blur-2xl flex flex-col">
                <div className="flex-1 overflow-y-auto">
                    {/* Modal Header */}
                    <div className="sticky top-0 bg-[#0A0E14]/95 backdrop-blur-xl border-b border-white/5 px-6 pt-14 pb-5 z-10">
                        <div className="flex justify-between items-start mb-5">
                            <div>
                                <h2 className="text-xl font-black text-white uppercase italic tracking-tight">KADROYA OYUNCU EKLE</h2>
                                <p className="text-[10px] text-[#39FF14] font-bold uppercase tracking-widest mt-1">Arkadaşlarını Çağır</p>
                            </div>
                            <button onClick={() => { setActiveSheet('NONE'); setSelectedFriendsForPicker([]); setFriendSearch(''); }}
                                className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:bg-white/10">
                                <X size={18} />
                            </button>
                        </div>
                        
                        {/* Arama */}
                        <div className="relative mb-5">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" size={16} />
                            <input type="text" value={friendSearch} onChange={e => setFriendSearch(e.target.value)}
                                placeholder="Arkadaş ara..."
                                className="w-full bg-[#161B22] border border-white/10 rounded-2xl pl-11 pr-4 py-3.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#39FF14]/50 transition-colors" />
                        </div>

                        {/* Tab and Categories */}
                        <div className="flex flex-col gap-4">
                            <div className="flex items-center gap-4">
                                <button onClick={() => setPickerTab('FRIENDS')} className={`text-[11px] font-black uppercase tracking-widest px-4 py-2 rounded-xl transition-all ${pickerTab === 'FRIENDS' ? 'bg-white/10 text-white shadow-inner border border-white/10' : 'text-gray-500 hover:text-white'}`}>Arkadaşlarım</button>
                                <button onClick={() => setPickerTab('TEAMS')} className={`text-[11px] font-black uppercase tracking-widest px-4 py-2 rounded-xl transition-all ${pickerTab === 'TEAMS' ? 'bg-white/10 text-white shadow-inner border border-white/10' : 'text-gray-500 hover:text-white'}`}>Takımlarım</button>
                            </div>

                            {pickerTab === 'FRIENDS' && (
                                <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-2">
                                    {['Tümü', 'Favorilerim', 'Lise Tayfası', 'Üniversite', 'İş Arkadaşları'].map(cat => (
                                    <button 
                                        key={cat}
                                        onClick={() => setPickerCategory(cat)}
                                        className={`shrink-0 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                                        pickerCategory === cat 
                                            ? (cat === 'Favorilerim' ? 'bg-[#FFFF00] text-black shadow-[0_0_15px_rgba(255,255,0,0.3)]' : 'bg-[#39FF14] text-black shadow-[0_0_15px_rgba(57,255,20,0.3)]')
                                            : 'bg-white/5 text-white/50 border border-white/10 hover:bg-white/10'
                                        }`}
                                    >
                                        {cat === 'Favorilerim' && <Star size={10} fill={pickerCategory === cat ? "black" : "currentColor"} />}
                                        {cat}
                                    </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                    
                    <div className="px-6 py-4 max-w-lg mx-auto w-full pb-24">
                        {pickerTab === 'FRIENDS' && (
                            <div className="space-y-2">
                                {friends.filter(f => {
                                    if (friendSearch && !f.name.toLowerCase().includes(friendSearch.toLowerCase())) return false;
                                    if (pickerCategory !== 'Tümü') {
                                        if (pickerCategory === 'Favorilerim') {
                                            if (!(f as any).isFavorite) return false;
                                        } else {
                                            if (f.group !== pickerCategory) return false;
                                        }
                                    }
                                    return true;
                                }).map(f => {
                                    const isSelected = selectedFriendsForPicker.includes(f.id);
                                    return (
                                        <div key={f.id} onClick={() => {
                                            setSelectedFriendsForPicker(prev => prev.includes(f.id) ? prev.filter(id => id !== f.id) : [...prev, f.id]);
                                        }} className={`flex items-center justify-between p-3 rounded-2xl border transition-all cursor-pointer ${isSelected ? 'bg-[#39FF14]/10 border-[#39FF14]/50 shadow-[0_0_15px_rgba(57,255,20,0.1)]' : 'bg-[#161B22] border-white/5 hover:border-[#39FF14]/30'}`}>
                                            <div className="flex items-center gap-3">
                                                <div className="w-12 h-12 rounded-full bg-white/10 overflow-hidden relative border border-white/10">
                                                    {f.avatar ? <img src={f.avatar} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-white font-black text-sm">{f.name.charAt(0)}</div>}
                                                    {(f as any).isFavorite && <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-[#FFFF00] rounded-full flex items-center justify-center border-2 border-[#161B22]"><Star size={8} className="text-black" fill="black" /></div>}
                                                </div>
                                                <div>
                                                    <h3 className="text-sm font-black text-white drop-shadow-md">{f.name}</h3>
                                                    <p className="text-[9px] text-[#39FF14] uppercase font-black tracking-widest mt-0.5">{f.group}</p>
                                                </div>
                                            </div>
                                            <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-[#39FF14] border-[#39FF14]' : 'border-white/20'}`}>
                                                {isSelected && <Check size={14} className="text-black" strokeWidth={3} />}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                        {pickerTab === 'TEAMS' && (
                            <div className="space-y-3">
                                {userTeams.map(t => (
                                    <div key={t.id} className="bg-gradient-to-b from-[#161B22] to-black rounded-2xl border border-white/5 p-5 flex flex-col gap-4">
                                        <div className="flex items-center gap-4">
                                            <div className="w-14 h-14 rounded-full bg-black/60 border border-white/10 p-1 flex items-center justify-center text-2xl drop-shadow-lg shadow-inner overflow-hidden shrink-0">
                                                {t.logo ? (
                                                    <img src={t.logo} className="w-full h-full object-contain drop-shadow-md" alt="" />
                                                ) : (
                                                    '🛡️'
                                                )}
                                            </div>
                                            <div>
                                                <h4 className="text-base font-black text-white drop-shadow-md">{t.name}</h4>
                                                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">{t.players?.length || 0} Oyuncu</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => {
                                                const newPlayers: typeof myPlayers = { ...myPlayers };
                                                const emptySlots = pitchSlots.filter(s => !newPlayers[s.id]);
                                                let slotIdx = 0;
                                                t.players?.forEach((p) => {
                                                    if (slotIdx < emptySlots.length) {
                                                        const friend = friends.find(f => f.id === p);
                                                        for (const k in newPlayers) { if (newPlayers[k].id === p) delete newPlayers[k]; }
                                                        newPlayers[emptySlots[slotIdx].id] = { id: p, name: friend ? friend.name : `Oyuncu`, avatar: friend?.avatar || '', status: 'PENDING' };
                                                        slotIdx++;
                                                    }
                                                });
                                                setMyPlayers(newPlayers);
                                                // S38: ev sahibi gerçek takım — rakip daveti için takımı kaydet
                                                setHomeTeamId(t.id);
                                                setHomeTeamName(t.name);
                                                setActiveSheet('NONE');
                                            }}
                                            className="w-full py-3 bg-[#FFFF00]/10 text-[#FFFF00] border border-[#FFFF00]/30 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-[#FFFF00] hover:text-black hover:shadow-[0_0_15px_rgba(255,255,0,0.3)] transition-all"
                                        >
                                            Kadroyu Sahaya Diz
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {pickerTab === 'FRIENDS' && selectedFriendsForPicker.length > 0 && (
                    <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-[#0A0E14] via-[#0A0E14]/95 to-transparent pointer-events-none z-20">
                        <div className="pointer-events-auto">
                            <button
                                onClick={() => {
                                    setMyPlayers(prev => {
                                        const next = { ...prev };
                                        const emptySlots = pitchSlots.filter(s => !next[s.id]);
                                        let targetSlots = [...emptySlots];
                                        if (selectedSlotForPicker && emptySlots.find(s => s.id === selectedSlotForPicker)) {
                                            targetSlots = [emptySlots.find(s => s.id === selectedSlotForPicker)!, ...emptySlots.filter(s => s.id !== selectedSlotForPicker)];
                                        }
                                        let slotIdx = 0;
                                        selectedFriendsForPicker.forEach(friendId => {
                                            const friend = friends.find(f => f.id === friendId);
                                            if (friend && slotIdx < targetSlots.length) {
                                                for (const k in next) { if (next[k].id === friend.id) delete next[k]; }
                                                next[targetSlots[slotIdx].id] = { id: friend.id, name: friend.name, avatar: friend.avatar || '', status: 'PENDING' };
                                                slotIdx++;
                                            }
                                        });
                                        return next;
                                    });
                                    setSelectedFriendsForPicker([]);
                                    setFriendSearch('');
                                    setActiveSheet('NONE');
                                }}
                                className="w-full h-[60px] bg-[#39FF14] text-black font-black uppercase tracking-widest text-base rounded-2xl shadow-[0_0_30px_rgba(57,255,20,0.3)] hover:shadow-[0_0_40px_rgba(57,255,20,0.5)] transition-all"
                            >
                                Seçili {selectedFriendsForPicker.length} Arkadaşı Ekle
                            </button>
                        </div>
                    </div>
                )}
            </motion.div>
        )}


      </AnimatePresence>
    </PageLayout>
  );
};

export default MatchCreate;
