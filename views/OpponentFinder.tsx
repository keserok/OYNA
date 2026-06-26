import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  ArrowLeft, MapPin, Clock, Filter, MessageSquare,
  Swords, X, ChevronDown, User, Target,
  Trophy, Heart, Users, Calendar, LayoutGrid, Map as MapIcon,
  ChevronRight, Shield, Zap, Star, Award, Cloud, Sun, CloudRain,
  Navigation, CreditCard, CheckCircle2, Loader2, Plus
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AppView, Team, FieldPlayerCard, MatchScore } from '../types';
import { MapContainer, TileLayer, Marker, useMap, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';
import { getHaversineDistance } from '../utils/geo';

// Fix leafet default icon path issues
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});


// ─── Map CSS ────────────────────────────────────────────────────────────────
const OPPONENT_MAP_CSS = `
  .leaflet-popup-content-wrapper, .leaflet-popup-tip-container { display: none !important; }
  .leaflet-container { background: #060B12 !important; font-family: inherit; }
  .leaflet-control-attribution, .leaflet-control-zoom { display: none !important; }
  .oyna-team-pin { cursor: pointer; }
  .oyna-team-pin .pin-bubble {
    display: flex; align-items: center; gap: 5px;
    background: rgba(13,17,26,0.92);
    border: 1.5px solid rgba(239,68,68,0.3);
    color: #fff;
    font-size: 10px; font-weight: 900; font-family: inherit;
    padding: 6px 11px; border-radius: 100px; white-space: nowrap;
    backdrop-filter: blur(8px);
    box-shadow: 0 4px 20px rgba(0,0,0,0.6), 0 0 0 0 rgba(239,68,68,0);
    transform: translate(-50%, -100%) translateY(-10px);
    transition: transform 0.18s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.18s ease, background 0.18s ease;
    position: relative;
  }
  .oyna-team-pin .pin-bubble:hover {
    background: rgba(239,68,68,0.15);
    border-color: rgba(239,68,68,0.6);
    transform: translate(-50%, -100%) translateY(-10px) scale(1.05);
  }
  .oyna-team-pin .pin-bubble.selected {
    background: #EF4444;
    border-color: #EF4444;
    box-shadow: 0 4px 20px rgba(0,0,0,0.6), 0 0 0 4px rgba(239,68,68,0.25);
    transform: translate(-50%, -100%) translateY(-10px) scale(1.18);
    z-index: 9999;
  }
  .oyna-team-pin .pin-nub {
    width: 7px; height: 7px; border-radius: 50%;
    background: #EF4444;
    position: absolute; bottom: -11px; left: 50%;
    transform: translateX(-50%);
    box-shadow: 0 0 8px rgba(239,68,68,0.7);
    transition: box-shadow 0.18s ease;
  }
  .oyna-team-pin .pin-nub.selected { box-shadow: 0 0 16px rgba(239,68,68,1), 0 0 32px rgba(239,68,68,0.4); }
  .leaflet-tile-pane { filter: brightness(0.82) saturate(0.45) contrast(1.05); }
  .leaflet-marker-pane { z-index: 620; }
`;

// ─── Pin factory ────────────────────────────────────────────────────────────
const createTeamPin = (team: Team, isSelected: boolean) => {
  const shortName = team.name.split(' ')[0].toUpperCase();
  const levelColor = team.level === 'HARD' ? '#EF4444' : team.level === 'MEDIUM' ? '#EAB308' : '#22C55E';
  return L.divIcon({
    className: 'oyna-team-pin',
    html: `
      <div style="position:relative;display:inline-block;">
        <div class="pin-bubble ${isSelected ? 'selected' : ''}">
          <img src="${team.logo}" style="width:14px;height:14px;border-radius:50%;flex-shrink:0;" />
          ${shortName}
          <span style="width:6px;height:6px;border-radius:50%;background:${levelColor};flex-shrink:0;display:inline-block;"></span>
        </div>
        <div class="pin-nub ${isSelected ? 'selected' : ''}"></div>
      </div>
    `,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  } as any);
};

// ─── Map resizer (fixes blank-on-mount) ─────────────────────────────────────
const MapResizer = () => {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => { map.invalidateSize(); }, 150);
    return () => clearTimeout(t);
  }, [map]);
  return null;
};

// ─── ChangeView (pans dynamically) ──────────────────────────────────────────
const ChangeView = ({ center }: { center: [number, number] }) => {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center, map]);
  return null;
};

// ─── Pure map layer — no popups, just click targets ──────────────────────────
const MapViewComponent = ({ teams, selectedTeam, onTeamSelect, center }: { teams: Team[], selectedTeam: Team | null, onTeamSelect: (t: Team) => void, center: [number, number] }) => {
  return (
    <div className="absolute inset-0 z-0">
      <style>{OPPONENT_MAP_CSS}</style>
      {/* Bottom vignette for dramatic depth */}
      <div className="absolute bottom-0 left-0 right-0 h-48 z-10 pointer-events-none"
        style={{ background: 'linear-gradient(to top, rgba(6,11,18,0.9) 0%, transparent 100%)' }} />
      {/* Edge vignette */}
      <div className="absolute inset-0 z-10 pointer-events-none"
        style={{ boxShadow: 'inset 0 0 120px rgba(6,11,18,0.7)' }} />
      <MapContainer center={center} zoom={13} className="w-full h-full" zoomControl={false}>
        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" attribution="" />
        <MapResizer />
        <ChangeView center={center} />

        {/* Proximity Search Area Circle (Dotted Neon Red) */}
        <Circle
          center={center}
          radius={4000} // 4km search boundary
          pathOptions={{
            color: '#EF4444',
            fillColor: '#EF4444',
            fillOpacity: 0.02,
            weight: 1.5,
            dashArray: '5, 8'
          }}
        />

        {/* User Location Pulse Marker */}
        <Circle
          center={center}
          radius={150}
          pathOptions={{
            color: '#00D8FF',
            fillColor: '#00D8FF',
            fillOpacity: 0.15,
            weight: 2
          }}
        />
        <Circle
          center={center}
          radius={25}
          pathOptions={{
            color: '#ffffff',
            fillColor: '#00D8FF',
            fillOpacity: 0.9,
            weight: 2
          }}
        />

        {teams.map(team => {
          if (!team.coordinates?.lat || !team.coordinates?.lng) return null;
          return (
            <Marker
              key={team.id}
              position={[team.coordinates.lat, team.coordinates.lng]}
              icon={createTeamPin(team, selectedTeam?.id === team.id)}
              eventHandlers={{ click: () => onTeamSelect(team) }}
            />
          );
        })}
      </MapContainer>
    </div>
  );
};

// ─── Bottom drawer card that appears when a team pin is selected ─────────────
const MapTeamCard = ({ team, onExpand, onDismiss }: { team: Team; onExpand: () => void; onDismiss: () => void }) => {
  const levelColor = team.level === 'HARD' ? '#EF4444' : team.level === 'MEDIUM' ? '#EAB308' : '#22C55E';
  return (
    <motion.div
      initial={{ y: 120, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 120, opacity: 0 }}
      transition={{ type: 'spring', damping: 28, stiffness: 320 }}
      className="absolute bottom-0 left-0 right-0 z-30 px-4 pb-6 pointer-events-none"
    >
      <div
        className="pointer-events-auto rounded-[28px] overflow-hidden"
        style={{
          background: 'rgba(10,14,20,0.95)',
          backdropFilter: 'blur(24px)',
          border: '1px solid rgba(239,68,68,0.18)',
          boxShadow: '0 -4px 40px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.04)',
        }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-8 h-1 rounded-full bg-white/20" />
        </div>

        {/* Header row */}
        <div className="flex items-center gap-3 px-4 pb-3 pt-1">
          <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 p-2 flex-shrink-0"
            style={{ boxShadow: `0 0 16px ${levelColor}33` }}>
            <img src={team.logo} className="w-full h-full object-contain" alt={team.name} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest mb-0.5"
              style={{ color: levelColor }}>{team.level} · {team.distance}</p>
            <h3 className="text-lg font-black text-white uppercase italic tracking-tighter truncate">{team.name}</h3>
          </div>
          <button onClick={onDismiss}
            className="w-8 h-8 rounded-full bg-white/8 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/15 transition-colors flex-shrink-0">
            <X size={14} />
          </button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 mx-4 mb-3 rounded-2xl overflow-hidden border border-white/5"
          style={{ background: 'rgba(255,255,255,0.03)' }}>
          {[
            { label: 'Galibiyet', value: `%${team.winRate}`, accent: true },
            { label: 'Toplam Maç', value: String(team.matches), accent: false },
            { label: 'Tarih', value: team.date?.split(' ')[0] || '-', accent: false },
          ].map((s, i) => (
            <div key={s.label} className="py-3 text-center"
              style={{ borderRight: i < 2 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
              <p className={`text-sm font-black ${s.accent ? 'text-red-400' : 'text-white'}`}>{s.value}</p>
              <p className="text-[8px] text-gray-500 font-bold uppercase mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Pitch + time info */}
        <div className="flex items-center gap-3 mx-4 mb-3 px-3 py-2.5 rounded-2xl bg-white/4 border border-white/5">
          <MapPin size={14} className="text-red-500 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] text-white font-bold truncate">{team.pitch}</p>
            <p className="text-[9px] text-gray-500 font-bold">{team.time}</p>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-xl bg-white/5 flex-shrink-0">
            {team.weather?.condition === 'SUNNY' ? <Sun size={10} className="text-yellow-400" /> :
              team.weather?.condition === 'RAINY' ? <CloudRain size={10} className="text-blue-400" /> :
                <Cloud size={10} className="text-gray-400" />}
            <span className="text-[9px] font-black text-white">{team.weather?.temp}°</span>
          </div>
        </div>

        {/* CTA */}
        <div className="px-4 pb-4">
          <button
            onClick={onExpand}
            className="w-full h-12 rounded-2xl flex items-center justify-center gap-2.5 font-black text-sm transition-all active:scale-95"
            style={{ background: 'linear-gradient(135deg, #EF4444 0%, #B91C1C 100%)', boxShadow: '0 4px 20px rgba(239,68,68,0.4)' }}
          >
            <Swords size={16} />
            MEYDAN OKU
          </button>
        </div>
      </div>
    </motion.div>
  );
};


interface OpponentFinderProps {
  onBack: () => void;
  onNavigate: (view: AppView) => void;
}

// Rakip takımlar Supabase opponentAds üzerinden gelir (mock kaldırıldı).
const MOCK_TEAMS: Team[] = [];

import { useAppStore } from '../store';

const OpponentFinder: React.FC<OpponentFinderProps> = ({ onBack, onNavigate }) => {
  const { opponentAds } = useAppStore();
  const displayTeams = [...MOCK_TEAMS, ...opponentAds];
  const [viewMode, setViewMode] = useState<'MAP' | 'LIST'>('MAP');
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [lobbyState, setLobbyState] = useState<'NONE' | 'WAITING' | 'READY'>('NONE');
  const [activeStatTab, setActiveStatTab] = useState<'WINRATE' | 'MATCHES' | 'STATS'>('STATS');
  const [zoomLevel, setZoomLevel] = useState(1);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  // Filters
  const [distanceFilter, setDistanceFilter] = useState('Tümü');
  const [levelFilter, setLevelFilter] = useState('Tümü');
  const [showFilters, setShowFilters] = useState(false);

  // Map center location state (defaults to Beşiktaş)
  const [mapCenter, setMapCenter] = useState<[number, number]>([41.0433, 29.0057]);

  // Compute dynamic proximity distance and filter opponents
  const filteredTeams = useMemo(() => {
    return displayTeams.map(team => {
      if (team.coordinates?.lat && team.coordinates?.lng) {
        const dist = getHaversineDistance(mapCenter[0], mapCenter[1], team.coordinates.lat, team.coordinates.lng);
        return {
          ...team,
          distance: `${dist.toFixed(1)} km`,
          distanceNum: dist
        };
      }
      return { ...team, distanceNum: 999 };
    }).filter(team => {
      // Level filter
      if (levelFilter !== 'Tümü' && team.level !== levelFilter) return false;

      // Distance filter
      if (distanceFilter !== 'Tümü') {
        const maxDist = parseInt(distanceFilter);
        if (!isNaN(maxDist) && team.distanceNum > maxDist) return false;
      }

      return true;
    }).sort((a, b) => a.distanceNum - b.distanceNum);
  }, [displayTeams, mapCenter, levelFilter, distanceFilter]);

  // Center the map on load
  useEffect(() => {
    if (mapContainerRef.current && viewMode === 'MAP') {
      const container = mapContainerRef.current;
      container.scrollLeft = (container.scrollWidth - container.clientWidth) / 2;
      container.scrollTop = (container.scrollHeight - container.clientHeight) / 2;
    }
  }, [viewMode]);

  const handleZoomIn = () => setZoomLevel(prev => Math.min(prev + 0.2, 2));
  const handleZoomOut = () => setZoomLevel(prev => Math.max(prev - 0.2, 0.5));

  const handleChallenge = () => {
    setLobbyState('WAITING');
    // Simulate waiting for opponent
    setTimeout(() => {
      setLobbyState('READY');
    }, 3000);
  };

  const FormationView = ({ formation }: { formation: any }) => (
    <div className="relative w-full aspect-[3/4] bg-[#1a0505] rounded-3xl border-4 border-[#161B22] shadow-[inset_0_0_60px_rgba(0,0,0,0.8)] overflow-hidden">
      {/* Grass Stripes */}
      <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 10%, rgba(0,0,0,0.2) 10%, rgba(0,0,0,0.2) 20%)' }}></div>

      {/* Field Lines */}
      <div className="absolute inset-0 pointer-events-none opacity-40">
        <svg viewBox="0 0 680 1050" preserveAspectRatio="none" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <g stroke="#EF4444" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round">
            {/* Dış Çizgiler */}
            <rect x="20" y="20" width="640" height="1010" />
            {/* Orta Saha Çizgisi */}
            <line x1="20" y1="525" x2="660" y2="525" />
            {/* Orta Yuvarlak */}
            <circle cx="340" cy="525" r="90" />
            {/* Başlama Noktası */}
            <circle cx="340" cy="525" r="4" fill="#EF4444" />

            {/* Üst Ceza Sahası */}
            <rect x="140" y="20" width="400" height="150" />
            {/* Üst Altı Pas */}
            <rect x="240" y="20" width="200" height="50" />
            {/* Üst Penaltı Noktası */}
            <circle cx="340" cy="120" r="4" fill="#EF4444" />
            {/* Üst Ceza Sahası Yayı */}
            <path d="M 270 170 A 90 90 0 0 0 410 170" />

            {/* Alt Ceza Sahası */}
            <rect x="140" y="880" width="400" height="150" />
            {/* Alt Altı Pas */}
            <rect x="240" y="980" width="200" height="50" />
            {/* Alt Penaltı Noktası */}
            <circle cx="340" cy="930" r="4" fill="#EF4444" />
            {/* Alt Ceza Sahası Yayı */}
            <path d="M 270 880 A 90 90 0 0 1 410 880" />

            {/* Köşe Yayları */}
            <path d="M 20 60 A 40 40 0 0 0 60 20" />
            <path d="M 620 20 A 40 40 0 0 0 660 60" />
            <path d="M 20 990 A 40 40 0 0 1 60 1030" />
            <path d="M 660 1030 A 40 40 0 0 0 620 990" />
          </g>
        </svg>
      </div>

      {/* Players */}
      {formation.players.map((player: FieldPlayerCard) => (
        <motion.div
          key={player.id}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1 z-10"
          style={{ left: `${player.x}%`, top: `${player.y}%` }}
        >
          <div className={`relative w-12 h-12 rounded-full border-2 p-0.5 transition-all ${player.isSpecial ? 'border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.8)] scale-110' : 'border-white/10'}`}>
            <img src={player.avatar} className="w-full h-full rounded-full object-cover grayscale-[50%]" alt={player.name} />
            {player.isSpecial && (
              <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full border border-black flex items-center justify-center text-[8px] font-black bg-red-500 text-white shadow-lg">
                {player.rating}
              </div>
            )}
          </div>
          <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${player.isSpecial ? 'bg-red-500 text-white' : 'bg-black/80 text-gray-400'}`}>
            {player.name}
          </span>
        </motion.div>
      ))}
    </div>
  );

  const WeatherIcon = ({ condition }: { condition: string }) => {
    switch (condition) {
      case 'SUNNY': return <Sun size={14} className="text-yellow-400" />;
      case 'RAINY': return <CloudRain size={14} className="text-blue-400" />;
      default: return <Cloud size={14} className="text-gray-400" />;
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0E14] flex flex-col font-sans relative overflow-hidden">

      {/* Header & Controls */}
      <header className="absolute top-0 left-0 w-full z-40 bg-gradient-to-b from-[#0A0E14] to-transparent pt-6 pb-10 px-6">
        <div className="flex items-center justify-between mb-4">
          <button onClick={onBack} className="p-3 bg-[#161B22]/80 backdrop-blur-md rounded-full text-white border border-white/10 hover:bg-white/20 transition-colors">
            <ArrowLeft size={20} />
          </button>

          {/* View Toggle */}
          <div className="bg-[#161B22]/80 backdrop-blur-md p-1 rounded-full border border-white/10 flex gap-1">
            <button
              onClick={() => setViewMode('MAP')}
              className={`px-4 py-2 rounded-full flex items-center gap-2 text-[10px] font-black transition-all ${viewMode === 'MAP' ? 'bg-red-500 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              <MapIcon size={14} /> HARİTA
            </button>
            <button
              onClick={() => setViewMode('LIST')}
              className={`px-4 py-2 rounded-full flex items-center gap-2 text-[10px] font-black transition-all ${viewMode === 'LIST' ? 'bg-red-500 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              <LayoutGrid size={14} /> LİSTE
            </button>
          </div>

          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`p-3 rounded-full text-white border transition-colors backdrop-blur-md ${showFilters ? 'bg-red-500 border-red-500 text-white' : 'bg-[#161B22]/80 border-white/10 hover:bg-white/20'}`}
          >
            <Filter size={20} />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 relative min-h-0">
        {viewMode === 'MAP' ? (
          <div className="w-full bg-[#050812]" style={{ height: '100dvh' }}>
            <MapViewComponent
              teams={filteredTeams}
              selectedTeam={selectedTeam}
              onTeamSelect={setSelectedTeam}
              center={mapCenter}
            />
          </div>
        ) : (
          <div className="w-full h-full pt-32 px-6 overflow-y-auto custom-scrollbar space-y-4 pb-10">
            {filteredTeams.map((team, index) => (
              <motion.div
                key={team.id}
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: index * 0.05 }}
                onClick={() => setSelectedTeam(team)}
                className="relative bg-[#161B22]/80 backdrop-blur-md border border-white/10 rounded-3xl overflow-hidden hover:border-red-500/50 transition-all cursor-pointer group shadow-2xl"
              >
                {/* Background Accent */}
                <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-red-500/10 to-transparent rounded-full -mr-24 -mt-24 blur-3xl group-hover:from-red-500/20 transition-colors"></div>

                <div className="p-5 flex flex-col gap-4 relative z-10">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 rounded-2xl bg-[#0A0E14] border border-white/10 p-2 shrink-0 shadow-inner group-hover:scale-105 transition-transform group-hover:border-red-500/30">
                        <img src={team.logo} className="w-full h-full object-contain" alt={team.name} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-2 py-0.5 text-[8px] font-black rounded border uppercase tracking-widest ${team.level === 'HARD' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                            team.level === 'MEDIUM' ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' :
                              'bg-green-500/10 text-green-500 border-green-500/20'
                            }`}>{team.level}</span>
                          <span className="text-[10px] font-bold text-gray-400 uppercase flex items-center gap-1"><MapPin size={10} className="text-red-500" /> {team.distance}</span>
                        </div>
                        <h3 className="text-xl font-black text-white italic uppercase tracking-tighter truncate group-hover:text-red-500 transition-colors">{team.name}</h3>
                      </div>
                    </div>
                    <div className="text-right shrink-0 bg-[#0A0E14] px-4 py-2 rounded-2xl border border-white/5 flex flex-col items-center justify-center shadow-inner group-hover:border-red-500/20 transition-colors">
                      <p className="text-[8px] font-black text-gray-500 uppercase tracking-widest mb-0.5">KAZANMA</p>
                      <p className="text-xl font-black text-white font-display leading-none group-hover:text-red-500 transition-colors">%{team.winRate}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-4 border-t border-white/5">
                    <div className="flex items-center gap-2 bg-white/5 rounded-xl p-2">
                      <Calendar size={14} className="text-gray-400" />
                      <div className="flex flex-col">
                        <span className="text-[8px] text-gray-500 font-bold uppercase">Tarih</span>
                        <span className="text-[10px] text-white font-black truncate">{team.date.split(',')[0]}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 bg-white/5 rounded-xl p-2">
                      <Clock size={14} className="text-gray-400" />
                      <div className="flex flex-col">
                        <span className="text-[8px] text-gray-500 font-bold uppercase">Saat</span>
                        <span className="text-[10px] text-white font-black">{team.time}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 bg-white/5 rounded-xl p-2">
                      <Swords size={14} className="text-gray-400" />
                      <div className="flex flex-col">
                        <span className="text-[8px] text-gray-500 font-bold uppercase">Oyun Stili</span>
                        <span className="text-[10px] text-white font-black">{team.playStyle}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Team Detail Overlay (Formation) */}
      <AnimatePresence>
        {selectedTeam && lobbyState === 'NONE' && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="absolute inset-0 z-[50] bg-[#0A0E14] flex flex-col"
          >
            {/* Detail Header */}
            <header className="p-6 flex items-center justify-between border-b border-white/5 bg-[#0A0E14]/80 backdrop-blur-xl sticky top-0 z-10">
              <button onClick={() => setSelectedTeam(null)} className="w-10 h-10 bg-[#161B22] rounded-full flex items-center justify-center text-white border border-white/5">
                <ArrowLeft size={20} />
              </button>
              <div className="text-center">
                <h2 className="text-sm font-black tracking-widest uppercase italic text-red-500">TAKIM ANALİZİ</h2>
                <p className="text-[10px] text-gray-500 font-bold uppercase">{selectedTeam.name}</p>
              </div>
              <div className="w-10" />
            </header>

            <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar pb-32">
              {/* Team Profile */}
              <div className="flex items-center gap-6">
                <div className="w-24 h-24 rounded-3xl bg-[#161B22] border-2 border-red-500/20 p-4 shadow-[0_0_30px_rgba(239,68,68,0.2)]">
                  <img src={selectedTeam.logo} className="w-full h-full object-contain" />
                </div>
                <div className="flex-1">
                  <h3 className="text-4xl font-black text-white italic uppercase tracking-tighter leading-none mb-2">{selectedTeam.name}</h3>
                  <div className="flex gap-2">
                    <span className="px-3 py-1 bg-red-500/10 text-red-500 text-[10px] font-black rounded-lg border border-red-500/20 uppercase">PRO KULÜP</span>
                    <span className="px-3 py-1 bg-white/5 text-gray-400 text-[10px] font-black rounded-lg border border-white/10 uppercase">{selectedTeam.level}</span>
                  </div>
                </div>
              </div>

              {/* Interactive Stats Grid */}
              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => setActiveStatTab('STATS')}
                  className={`p-4 rounded-3xl border transition-all text-center ${activeStatTab === 'STATS' ? 'bg-red-500 border-red-400 shadow-[0_0_20px_rgba(239,68,68,0.3)]' : 'bg-[#161B22] border-white/5'}`}
                >
                  <Target size={20} className={`mx-auto mb-2 ${activeStatTab === 'STATS' ? 'text-white' : 'text-red-500'}`} />
                  <p className={`text-[10px] font-bold uppercase ${activeStatTab === 'STATS' ? 'text-white/70' : 'text-gray-500'}`}>ANALİZ</p>
                </button>
                <button
                  onClick={() => setActiveStatTab('WINRATE')}
                  className={`p-4 rounded-3xl border transition-all text-center ${activeStatTab === 'WINRATE' ? 'bg-red-500 border-red-400 shadow-[0_0_20px_rgba(239,68,68,0.3)]' : 'bg-[#161B22] border-white/5'}`}
                >
                  <Trophy size={20} className={`mx-auto mb-2 ${activeStatTab === 'WINRATE' ? 'text-white' : 'text-red-500'}`} />
                  <p className={`text-lg font-black ${activeStatTab === 'WINRATE' ? 'text-white' : 'text-white'}`}>%{selectedTeam.winRate}</p>
                </button>
                <button
                  onClick={() => setActiveStatTab('MATCHES')}
                  className={`p-4 rounded-3xl border transition-all text-center ${activeStatTab === 'MATCHES' ? 'bg-red-500 border-red-400 shadow-[0_0_20px_rgba(239,68,68,0.3)]' : 'bg-[#161B22] border-white/5'}`}
                >
                  <Zap size={20} className={`mx-auto mb-2 ${activeStatTab === 'MATCHES' ? 'text-white' : 'text-red-500'}`} />
                  <p className={`text-lg font-black ${activeStatTab === 'MATCHES' ? 'text-white' : 'text-white'}`}>{selectedTeam.matches}</p>
                </button>
              </div>

              {/* Conditional Stat View */}
              <AnimatePresence mode="wait">
                {activeStatTab === 'STATS' && selectedTeam.stats && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="bg-[#161B22] p-6 rounded-[32px] border border-white/5 shadow-inner"
                  >
                    <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-4 text-center">GÜÇ DAĞILIMI</h4>
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <RadarChart cx="50%" cy="50%" outerRadius="70%" data={[
                          { subject: 'Hücum', A: selectedTeam.stats.attack, fullMark: 100 },
                          { subject: 'Savunma', A: selectedTeam.stats.defense, fullMark: 100 },
                          { subject: 'Orta Saha', A: selectedTeam.stats.midfield, fullMark: 100 },
                          { subject: 'Fizik', A: selectedTeam.stats.physical, fullMark: 100 },
                          { subject: 'Takım Oyunu', A: selectedTeam.stats.teamwork, fullMark: 100 },
                        ]}>
                          <PolarGrid stroke="rgba(255,255,255,0.1)" />
                          <PolarAngleAxis dataKey="subject" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: 'bold' }} />
                          <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                          <Radar name={selectedTeam.name} dataKey="A" stroke="#EF4444" fill="#EF4444" fillOpacity={0.3} />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                  </motion.div>
                )}
                {activeStatTab === 'WINRATE' && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="bg-[#161B22] p-6 rounded-[32px] border border-white/5 shadow-inner flex flex-col items-center justify-center"
                  >
                    <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-4">KAZANMA ORANI</h4>
                    <div className="relative w-32 h-32 flex items-center justify-center">
                      <svg className="w-full h-full transform -rotate-90">
                        <circle cx="64" cy="64" r="60" stroke="rgba(255,255,255,0.05)" strokeWidth="8" fill="none" />
                        <circle cx="64" cy="64" r="60" stroke="#EF4444" strokeWidth="8" fill="none" strokeDasharray={`${(parseInt(selectedTeam.winRate) / 100) * 377} 377`} strokeLinecap="round" className="transition-all duration-1000 ease-out" />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-3xl font-black text-white">{selectedTeam.winRate}%</span>
                      </div>
                    </div>
                    <div className="flex gap-6 mt-6">
                      <div className="text-center">
                        <p className="text-xl font-black text-green-500">{selectedTeam.wins}</p>
                        <p className="text-[8px] font-bold text-gray-500 uppercase">Galibiyet</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xl font-black text-red-500">{selectedTeam.losses}</p>
                        <p className="text-[8px] font-bold text-gray-500 uppercase">Mağlubiyet</p>
                      </div>
                    </div>
                  </motion.div>
                )}
                {activeStatTab === 'MATCHES' && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-3"
                  >
                    <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">SON MAÇLAR</h4>
                    {selectedTeam.matchHistory?.map((match: MatchScore) => (
                      <div key={match.id} className="bg-[#161B22] p-4 rounded-2xl border border-white/5 flex items-center justify-between">
                        <div>
                          <p className="text-xs font-black text-white uppercase">{match.opponent}</p>
                          <p className="text-[8px] text-gray-500 font-bold">{match.date}</p>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-lg font-black text-white">{match.score}</span>
                          <span className={`px-2 py-0.5 rounded text-[8px] font-black ${match.result === 'WIN' ? 'bg-green-500 text-black' : match.result === 'LOSS' ? 'bg-red-500 text-white' : 'bg-gray-500 text-white'}`}>
                            {match.result}
                          </span>
                        </div>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Formation Section */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2">
                    <Shield size={16} className="text-red-500" /> DİZİLİŞ ({selectedTeam.formation?.name})
                  </h4>
                  <span className="text-[10px] text-red-500 font-black uppercase animate-pulse">ÖZEL KARTLAR AKTİF</span>
                </div>
                <FormationView formation={selectedTeam.formation} />
              </div>

              {/* Match Info - Highlighted */}
              <div className="space-y-4">
                <div className="bg-red-950/20 p-6 rounded-[32px] border border-red-500/20 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 rounded-full -mr-16 -mt-16 blur-3xl"></div>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center text-red-500 shadow-inner">
                        <MapPin size={28} />
                      </div>
                      <div>
                        <p className="text-[10px] text-red-400 font-black uppercase tracking-widest mb-1">ARANAN SAHA</p>
                        <p className="text-lg font-black text-white uppercase leading-tight">{selectedTeam.pitch}</p>
                      </div>
                    </div>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedTeam.pitch || '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-white hover:bg-white/10 transition-all"
                    >
                      <Navigation size={20} />
                    </a>
                  </div>
                </div>

                <div className="bg-red-950/20 p-6 rounded-[32px] border border-red-500/20 relative overflow-hidden">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center text-red-500">
                      <Clock size={28} />
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] text-red-400 font-black uppercase tracking-widest mb-1">MAÇ DETAYI</p>
                      <div className="flex items-center justify-between">
                        <p className="text-lg font-black text-white uppercase">{selectedTeam.time}</p>
                        <div className="flex items-center gap-2 bg-black/40 px-3 py-1.5 rounded-xl border border-white/5">
                          <WeatherIcon condition={selectedTeam.weather?.condition || 'SUNNY'} />
                          <span className="text-xs font-black text-white">{selectedTeam.weather?.temp}°C</span>
                        </div>
                      </div>
                      <p className="text-[10px] text-gray-500 font-bold mt-1">{selectedTeam.date}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Footer */}
            <div className="p-6 bg-[#0A0E14] border-t border-white/5 sticky bottom-0 z-20">
              <button
                onClick={handleChallenge}
                className="w-full h-16 bg-red-500 text-white font-black text-lg rounded-2xl flex items-center justify-center gap-3 shadow-[0_0_40px_rgba(239,68,68,0.4)] active:scale-95 transition-all"
              >
                <Swords size={24} />
                MEYDAN OKU
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pre-Lobby / Waiting Screen */}
      <AnimatePresence>
        {lobbyState !== 'NONE' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-[#0A0E14] flex flex-col"
          >
            {/* Pulsing Background Animation */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              <motion.div
                animate={{
                  scale: [1, 1.2, 1],
                  opacity: [0.1, 0.2, 0.1]
                }}
                transition={{ duration: 4, repeat: Infinity }}
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-red-500 rounded-full blur-[120px]"
              />
            </div>

            <header className="p-6 flex items-center justify-between relative z-10">
              <button onClick={() => setLobbyState('NONE')} className="w-10 h-10 bg-white/5 rounded-full flex items-center justify-center text-white border border-white/10">
                <X size={20} />
              </button>
              <h2 className="text-sm font-black tracking-widest uppercase italic text-red-500">MAÇ LOBİSİ</h2>
              <div className="w-10" />
            </header>

            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center relative z-10">
              {lobbyState === 'WAITING' ? (
                <div className="space-y-8">
                  <div className="relative">
                    <div className="w-32 h-32 bg-red-500/10 rounded-full flex items-center justify-center border-2 border-red-500/30 animate-pulse">
                      <Loader2 size={48} className="text-red-500 animate-spin" />
                    </div>
                    <div className="absolute -inset-4 border-2 border-red-500/20 rounded-full animate-ping"></div>
                  </div>
                  <div>
                    <h3 className="text-3xl font-black text-white italic uppercase tracking-tighter mb-2">RAKİP BEKLENİYOR</h3>
                    <p className="text-gray-400 text-xs max-w-[240px] mx-auto">Meydan okumanız {selectedTeam?.name} kaptanına iletildi. Onay bekleniyor...</p>
                  </div>
                </div>
              ) : (
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="space-y-10 w-full"
                >
                  <div className="flex items-center justify-center gap-8">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-20 h-20 rounded-3xl bg-white/5 border-2 border-white/10 p-4">
                        <img src="https://api.dicebear.com/7.x/identicon/svg?seed=myteam" className="w-full h-full" />
                      </div>
                      <span className="text-[10px] font-black text-white uppercase">TAKIMINIZ</span>
                    </div>
                    <div className="relative">
                      <Swords size={32} className="text-red-500" />
                      <div className="absolute inset-0 blur-lg bg-red-500/50"></div>
                    </div>
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-20 h-20 rounded-3xl bg-red-500/10 border-2 border-red-500 p-4 shadow-[0_0_20px_rgba(239,68,68,0.4)]">
                        <img src={selectedTeam?.logo} className="w-full h-full" />
                      </div>
                      <span className="text-[10px] font-black text-red-500 uppercase">{selectedTeam?.name}</span>
                    </div>
                  </div>

                  <div className="bg-green-500/10 border border-green-500/20 p-6 rounded-[32px] flex flex-col items-center gap-2">
                    <CheckCircle2 size={32} className="text-green-500" />
                    <h4 className="text-xl font-black text-white uppercase italic tracking-tighter">MEYDAN OKUMA KABUL EDİLDİ!</h4>
                    <p className="text-[10px] text-green-400 font-bold uppercase">Maç onaylandı, ödeme aşamasına geçebilirsiniz.</p>
                  </div>

                  <div className="bg-[#161B22] p-6 rounded-[32px] border border-white/5 space-y-4 text-left">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-500 font-black uppercase">SAHA</span>
                      <span className="text-xs font-bold text-white uppercase">{selectedTeam?.pitch}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-500 font-black uppercase">SAAT</span>
                      <span className="text-xs font-bold text-white uppercase">{selectedTeam?.time}</span>
                    </div>
                    <div className="pt-4 border-t border-white/5 flex items-center justify-between">
                      <span className="text-[10px] text-gray-500 font-black uppercase">TOPLAM TUTAR</span>
                      <span className="text-xl font-black text-[#FFFF00]">2.800₺</span>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Lobby Footer */}
            <div className="p-6 bg-[#0A0E14] border-t border-white/5 sticky bottom-0 z-20">
              <button
                onClick={() => onNavigate('PAYMENT')}
                disabled={lobbyState !== 'READY'}
                className={`w-full h-16 rounded-2xl flex items-center justify-center gap-3 font-black text-lg transition-all shadow-lg ${lobbyState === 'READY' ? 'bg-[#FFFF00] text-black shadow-yellow-900/20 active:scale-95' : 'bg-gray-800 text-gray-500 opacity-50 cursor-not-allowed'}`}
              >
                <CreditCard size={24} />
                ÖDEME YAP
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};

export default OpponentFinder;
