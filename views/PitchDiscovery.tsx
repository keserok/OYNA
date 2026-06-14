import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Search, Filter, MapPin, Star, Layers, Zap, Shield,
  ChevronRight, X, Check, Map as MapIcon, LayoutGrid, Info,
  Car, Coffee, Wifi, Camera, Droplets, Thermometer, Wind, Users, Heart, Phone,
  CreditCard, Activity, CheckCircle, Sun, Moon
} from 'lucide-react';
import { Pitch, Court } from '../types';
import { useAppStore } from '../store';
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getHaversineDistance } from '../utils/geo';
import PitchShowcaseCard from '../components/PitchShowcaseCard';
import OccupancyCalendar from '../components/OccupancyCalendar';
import { getOccupancyMatrix, OccupancyMatrix } from '../services/pitchService';
import { fbSubscribePitchBookings } from '../supabaseMutations';

// Fix leafet default icon path issues
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});


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

        {/* Proximity Search Area Circle (Google Maps / Radar Quality) */}
        <Circle
          center={center}
          radius={3000} // 3km search boundary
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
                      İncele →
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


interface PitchDiscoveryProps {
  onBack: () => void;
  onBook?: () => void;
  isSelectionMode?: boolean;
  onSelectTime?: (pitch: Pitch, court: Court, date: string, time: string) => void;
}

// --- HELPERS ---

const getGrade = (score: number): string => {
  if (score >= 95) return 'A+';
  if (score >= 90) return 'A';
  if (score >= 85) return 'A-';
  if (score >= 80) return 'B+';
  if (score >= 75) return 'B';
  if (score >= 70) return 'B-';
  if (score >= 60) return 'C+';
  if (score >= 50) return 'C';
  return 'D';
};

const getGradeColor = (grade: string): string => {
  if (grade.startsWith('A')) return 'text-emerald-400';
  if (grade.startsWith('B')) return 'text-yellow-400';
  if (grade.startsWith('C')) return 'text-orange-400';
  return 'text-red-400';
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
      <span className={`text-sm font-black ${getGradeColor(grade)}`}>{grade}</span>
    </div>
  );
};

const PitchCard: React.FC<{ pitch: Pitch; onClick: (pitch: Pitch) => void }> = ({ pitch, onClick }) => {
  const [isFavorite, setIsFavorite] = useState(false);
  
  // Create a combined grade from mock qualities
  const avgScore = ((pitch.grassQuality || 85) + (pitch.lighting || 85) + (pitch.lockerRoomQuality || 80)) / 3;
  const grade = getGrade(avgScore);
  const gradeColor = getGradeColor(grade);

  const dayPrice = pitch.totalPrice;
  const nightPrice = Math.round(pitch.totalPrice * 1.25);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className="flex flex-col cursor-pointer group bg-[#121620]/60 backdrop-blur-xl rounded-[28px] border border-white/5 hover:border-[#39FF14]/30 transition-all shadow-lg overflow-hidden h-[196px]"
      onClick={() => onClick(pitch)}
    >
      {/* Upper part: Image with gradients & badges */}
      <div className="relative w-full h-[110px] bg-[#0A0E14] overflow-hidden shrink-0">
        <img
          src={pitch.image}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          alt={pitch.name}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#121620] via-[#121620]/20 to-transparent pointer-events-none" />
        
        {/* Floating Grade Badge on Image */}
        <div className="absolute top-2.5 left-2.5 px-2 py-0.5 bg-black/60 backdrop-blur-md rounded-lg border border-white/10 flex items-center shadow-md">
          <span className={`text-[9px] font-black tracking-wider ${gradeColor}`}>{grade}</span>
        </div>
        
        {/* Floating Star Rating */}
        <div className="absolute top-2.5 right-2.5 px-2 py-0.5 bg-black/60 backdrop-blur-md rounded-lg border border-white/10 flex items-center gap-1 shadow-md">
          <Star size={9} className="fill-[#FFFF00] text-[#FFFF00]" />
          <span className="text-[9px] font-black text-white">{pitch.rating.toFixed(1)}</span>
        </div>
      </div>

      {/* Lower part: Info & Prices */}
      <div className="p-3 flex-1 flex flex-col justify-between min-w-0">
        <div>
          <h3 className="text-[11px] font-black text-white truncate italic uppercase tracking-tight leading-none">{pitch.name}</h3>
          
          <p className="text-[8px] font-bold text-gray-500 uppercase tracking-widest mt-1.5 flex items-center gap-1">
            <MapPin size={8} className="text-[#39FF14] shrink-0" /> 
            <span className="truncate">{pitch.district} • {pitch.distance}</span>
          </p>
        </div>

        {/* Pricing Row */}
        <div className="flex gap-1.5 mt-2">
          {/* Day Price */}
          <div className="flex-1 bg-black/20 border border-white/5 rounded-xl py-1 px-1.5 flex flex-col items-center justify-center">
            <span className="text-[6px] font-black text-gray-500 uppercase tracking-widest mb-0.5">Gündüz</span>
            <span className="text-[10px] font-black text-white tracking-tighter leading-none">₺{dayPrice}</span>
          </div>
          {/* Night Price */}
          <div className="flex-1 bg-black/20 border border-white/5 rounded-xl py-1 px-1.5 flex flex-col items-center justify-center">
            <span className="text-[6px] font-black text-gray-500 uppercase tracking-widest mb-0.5 text-[#FFFF00]">Gece</span>
            <span className="text-[10px] font-black text-[#FFFF00] tracking-tighter leading-none">₺{nightPrice}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

const DISTRICT_COORDINATES: Record<string, [number, number]> = {
  'Beşiktaş': [41.0433, 29.0057],
  'Kadıköy': [40.9901, 29.0290],
  'Sarıyer': [41.1686, 29.0574],
  'Şişli': [41.0602, 28.9877],
  'Üsküdar': [41.0267, 29.0159],
  'Bakırköy': [40.9780, 28.8720],
  'Fatih': [41.0165, 28.9497],
  'Beykoz': [41.1350, 29.0950],
  'Levent': [41.0822, 29.0120],
  'Bağcılar': [41.0333, 28.8500],
  'Moda': [40.9780, 29.0250],
  'Maslak': [41.1050, 29.0230],
  'Etiler': [41.0850, 29.0350]
};

const PitchDiscovery: React.FC<PitchDiscoveryProps> = ({ onBack, onBook, isSelectionMode, onSelectTime }) => {
  const { userLocation, adminPitches, addUserNotification } = useAppStore();
  const [viewMode, setViewMode] = useState<'LIST' | 'MAP'>('LIST');
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPitch, setSelectedPitch] = useState<Pitch | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedCourtId, setSelectedCourtId] = useState<string | null>(null);
  const [expandedCourtId, setExpandedCourtId] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(0); // 0 = Today
  const [timeFilter, setTimeFilter] = useState<'DAY' | 'NIGHT'>('NIGHT');

  // Quick Rent States
  const [quickRentCourt, setQuickRentCourt] = useState<Court | null>(null);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  // Filters
  const [filters, setFilters] = useState({
    district: 'Tümü',
    minRating: 0,
    maxPrice: 4000,
    hasAmenities: [] as string[],
    type: 'Tümü',
    availability: 'Tümü'
  });
  const [sortOrder, setSortOrder] = useState<'DEFAULT' | 'PRICE_ASC'>('DEFAULT');

  // User Proximity Center Coordinates (default to Beşiktaş Meydan or user location)
  const [mapCenter, setMapCenter] = useState<[number, number]>(userLocation ? [userLocation.lat, userLocation.lng] : [41.0433, 29.0057]);

  // Sync map center with userLocation
  useEffect(() => {
    if (userLocation) {
      setMapCenter([userLocation.lat, userLocation.lng]);
    }
  }, [userLocation]);

  // Sync map center with district filters
  useEffect(() => {
    if (filters.district !== 'Tümü' && DISTRICT_COORDINATES[filters.district]) {
      setMapCenter(DISTRICT_COORDINATES[filters.district]);
    } else {
      setMapCenter([41.0433, 29.0057]);
    }
  }, [filters.district]);

  const handleOpenDetail = (pitch: Pitch) => {
    setSelectedPitch(pitch);
    setIsDetailOpen(true);
    setSelectedCourtId(pitch.courts?.[0]?.id || null);
    setExpandedCourtId(null);
    setSelectedSlot(null);
    if (pitch.coordinates?.lat && pitch.coordinates?.lng) {
      setMapCenter([pitch.coordinates.lat, pitch.coordinates.lng]);
    }
  };

  const selectedCourt = useMemo(() => {
    if (!selectedPitch || !selectedCourtId) return null;
    return selectedPitch.courts?.find(c => c.id === selectedCourtId) || null;
  }, [selectedPitch, selectedCourtId]);

  const handleQuickRentSubmit = () => {
    setIsProcessingPayment(true);
    setTimeout(() => {
      setIsProcessingPayment(false);
      setPaymentSuccess(true);
      if (selectedPitch && quickRentCourt) {
        useAppStore.getState().addUserNotification({
          id: `rent-${Date.now()}`,
          title: 'Saha Kiralandı!',
          desc: `${selectedPitch.name} tesisinde ${quickRentCourt.name} rezervasyonu onaylandı.`,
          time: 'Şimdi',
          type: 'success',
          iconName: 'CheckCircle',
          color: 'bg-[#39FF14]',
          textColor: 'text-[#39FF14]'
        });
      }
      setTimeout(() => {
        setPaymentSuccess(false);
        setQuickRentCourt(null);
        setIsDetailOpen(false);
      }, 2000);
    }, 1500);
  };

  const calculateTotal = () => {
    if (!selectedCourt) return selectedPitch?.totalPrice || 0;
    return selectedCourt.price;
  };

  const districts = useMemo(() => ['Tümü', ...Array.from(new Set(adminPitches.map(p => p.district)))], [adminPitches]);

  const filteredPitches = useMemo(() => {
    let result = adminPitches.filter(p => {
      // Show only approved pitches to players
      if (p.isApproved === false) return false;

      const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.district.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesDistrict = filters.district === 'Tümü' || p.district === filters.district;
      const matchesRating = p.rating >= filters.minRating;
      const matchesPrice = p.totalPrice <= filters.maxPrice;

      let matchesType = true;
      if (filters.type === 'Kapalı') {
        matchesType = p.courts?.some(c => c.type === 'CLOSED') || false;
      } else if (filters.type === 'Açık') {
        matchesType = p.courts?.some(c => c.type === 'OPEN') || false;
      }

      return matchesSearch && matchesDistrict && matchesRating && matchesPrice && matchesType;
    }).map(p => {
      // Calculate dynamic Haversine distance from mapCenter
      if (p.coordinates?.lat && p.coordinates?.lng) {
        const dist = getHaversineDistance(mapCenter[0], mapCenter[1], p.coordinates.lat, p.coordinates.lng);
        return {
          ...p,
          distance: `${dist.toFixed(1)} km`
        };
      }
      return p;
    });

    if (sortOrder === 'PRICE_ASC') {
      result.sort((a, b) => a.totalPrice - b.totalPrice);
    }

    return result;
  }, [searchQuery, filters, sortOrder, mapCenter]);

  return (
    <div className="min-h-screen bg-[#0A0E14] text-white flex flex-col font-sans overflow-hidden">

      {/* Header Section */}
      <header className="px-6 pt-safe pb-4 space-y-6 bg-gradient-to-b from-[#0A0E14] to-transparent sticky top-0 z-40 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <button
            onClick={onBack}
            className="w-12 h-12 flex items-center justify-center bg-[#161B22] border border-white/5 rounded-full text-white hover:bg-white/10 transition-all"
          >
            <ArrowLeft size={24} />
          </button>

          {/* View Toggle */}
          <div className="flex items-center gap-1 bg-[#161B22] p-1 rounded-2xl border border-white/5 shadow-inner">
            <button
              onClick={() => setViewMode('LIST')}
              className={`px-6 py-2.5 rounded-xl text-[10px] font-black transition-all flex items-center gap-2 ${viewMode === 'LIST' ? 'bg-[#FFFF00] text-black shadow-lg shadow-yellow-900/20' : 'text-gray-500'}`}
            >
              <LayoutGrid size={14} /> LİSTE
            </button>
            <button
              onClick={() => setViewMode('MAP')}
              className={`px-6 py-2.5 rounded-xl text-[10px] font-black transition-all flex items-center gap-2 ${viewMode === 'MAP' ? 'bg-[#FFFF00] text-black shadow-lg shadow-yellow-900/20' : 'text-gray-500'}`}
            >
              <MapIcon size={14} /> HARİTA
            </button>
          </div>

          <button
            onClick={() => setShowFilters(true)}
            className={`w-12 h-12 flex items-center justify-center rounded-full transition-all ${showFilters ? 'bg-[#FFFF00] text-black' : 'bg-[#161B22] border border-white/5 text-white'}`}
          >
            <Filter size={24} />
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative group">
          <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none text-gray-500 group-focus-within:text-[#FFFF00] transition-colors">
            <Search size={20} />
          </div>
          <input
            type="text"
            placeholder="Saha veya bölge ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-16 bg-[#161B22] border border-white/5 rounded-[24px] pl-14 pr-6 text-sm font-bold outline-none focus:border-[#FFFF00]/50 focus:bg-[#1C232B] transition-all shadow-inner"
          />
        </div>

        {/* Quick Filters */}
        <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-2 mt-4 -mx-6 px-6">
          <button
            onClick={() => setFilters({ ...filters, type: filters.type === 'Kapalı' ? 'Tümü' : 'Kapalı' })}
            className={`shrink-0 px-4 py-2 rounded-full text-[10px] font-black uppercase transition-all border ${filters.type === 'Kapalı' ? 'bg-[#FFFF00] text-black border-[#FFFF00]' : 'bg-[#161B22] text-gray-400 border-white/5'}`}
          >
            Kapalı Saha
          </button>
          <button
            onClick={() => setFilters({ ...filters, type: filters.type === 'Açık' ? 'Tümü' : 'Açık' })}
            className={`shrink-0 px-4 py-2 rounded-full text-[10px] font-black uppercase transition-all border ${filters.type === 'Açık' ? 'bg-[#FFFF00] text-black border-[#FFFF00]' : 'bg-[#161B22] text-gray-400 border-white/5'}`}
          >
            Açık Saha
          </button>

          <button
            onClick={() => setSortOrder(sortOrder === 'PRICE_ASC' ? 'DEFAULT' : 'PRICE_ASC')}
            className={`shrink-0 px-4 py-2 rounded-full text-[10px] font-black uppercase transition-all border ${sortOrder === 'PRICE_ASC' ? 'bg-[#FFFF00] text-black border-[#FFFF00]' : 'bg-[#161B22] text-gray-400 border-white/5'}`}
          >
            Ucuzdan Pahalıya
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto px-6 pb-32 custom-scrollbar">
        {viewMode === 'LIST' ? (
          <div className="space-y-2">
            <div className="flex justify-between items-center mb-6 px-2">
              <h2 className="text-xs font-black text-gray-500 uppercase tracking-[0.2em]">
                {filteredPitches.length} TESİS BULUNDU
              </h2>
              {filters.district !== 'Tümü' && (
                <span className="text-[10px] font-black text-[#FFFF00] bg-[#FFFF00]/10 px-2 py-1 rounded-lg">
                  {filters.district}
                </span>
              )}
            </div>

            <AnimatePresence mode="popLayout">
              <div className="grid grid-cols-2 gap-3.5 pb-8">
                {filteredPitches.map((pitch) => (
                  <PitchShowcaseCard key={pitch.id} pitch={pitch} variant="list" onClick={() => handleOpenDetail(pitch)} />
                ))}
              </div>
            </AnimatePresence>

            {filteredPitches.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-20 h-20 bg-[#161B22] rounded-full flex items-center justify-center mb-4 border border-white/5">
                  <Search size={32} className="text-gray-600" />
                </div>
                <h3 className="text-lg font-black italic text-white">SONUÇ BULUNAMADI</h3>
                <p className="text-gray-500 text-xs mt-2">Filtreleri temizleyip tekrar dene.</p>
                <button
                  onClick={() => {
                    setFilters({ district: 'Tümü', minRating: 0, maxPrice: 4000, hasAmenities: [] });
                    setSearchQuery('');
                  }}
                  className="mt-6 text-[#FFFF00] text-[10px] font-black uppercase tracking-widest underline"
                >
                  FİLTRELERİ SIFIRLA
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="w-full h-[calc(100vh-280px)] relative rounded-[40px] overflow-hidden border border-white/5 shadow-2xl">
            <MapViewComponent pitches={filteredPitches} selectedPitch={selectedPitch} onPitchSelect={(p) => { setSelectedPitch(p); setIsDetailOpen(true); }} center={mapCenter} />
          </div>
        )}
      </main>

      {/* Filter Modal */}
      <AnimatePresence>
        {showFilters && (
          <div className="fixed inset-0 z-[100] flex items-end justify-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowFilters(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative w-full max-w-md bg-[#161B22] border-t border-white/10 rounded-t-[40px] p-8 shadow-2xl"
            >
              <div className="w-12 h-1.5 bg-gray-800 rounded-full mx-auto mb-8"></div>

              <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl font-black text-white italic tracking-tighter uppercase">FİLTRELE</h2>
                <button
                  onClick={() => setShowFilters(false)}
                  className="w-10 h-10 bg-[#0A0E14] rounded-full flex items-center justify-center text-gray-400"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-8">
                {/* District Filter */}
                <div>
                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-4">BÖLGE SEÇİMİ</p>
                  <div className="flex flex-wrap gap-2">
                    {districts.map(d => (
                      <button
                        key={d}
                        onClick={() => setFilters({ ...filters, district: d })}
                        className={`px-4 py-2.5 rounded-xl text-[10px] font-black transition-all border ${filters.district === d ? 'bg-[#FFFF00] text-black border-[#FFFF00]' : 'bg-[#0A0E14] text-gray-400 border-white/5'}`}
                      >
                        {d.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Price Filter */}
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">MAKSİMUM FİYAT</p>
                    <span className="text-sm font-black text-[#FFFF00]">{filters.maxPrice}₺</span>
                  </div>
                  <input
                    type="range"
                    min="2800"
                    max="4000"
                    step="100"
                    value={filters.maxPrice}
                    onChange={(e) => setFilters({ ...filters, maxPrice: parseInt(e.target.value) })}
                    className="w-full h-2 bg-[#0A0E14] rounded-lg appearance-none cursor-pointer accent-[#FFFF00]"
                  />
                </div>

                {/* Rating Filter */}
                <div>
                  <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-4">MİNİMUM PUAN</p>
                  <div className="flex gap-2">
                    {[0, 3.5, 4.0, 4.5].map(r => (
                      <button
                        key={r}
                        onClick={() => setFilters({ ...filters, minRating: r })}
                        className={`flex-1 py-3 rounded-xl text-[10px] font-black transition-all border flex items-center justify-center gap-1 ${filters.minRating === r ? 'bg-[#FFFF00] text-black border-[#FFFF00]' : 'bg-[#0A0E14] text-gray-400 border-white/5'}`}
                      >
                        {r === 0 ? 'HEPSİ' : <><Star size={10} fill="currentColor" /> {r}+</>}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => setShowFilters(false)}
                  className="w-full h-16 bg-[#FFFF00] text-black rounded-2xl font-black text-sm tracking-widest uppercase shadow-[0_10px_30px_rgba(255,255,0,0.2)]"
                >
                  UYGULA
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Detail Overlay */}
      <AnimatePresence>
        {isDetailOpen && selectedPitch && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed inset-0 z-[60] bg-[#0A0E14] flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="absolute top-0 left-0 w-full p-4 flex justify-between items-center z-20">
              <button
                onClick={() => setIsDetailOpen(false)}
                className="w-10 h-10 bg-black/30 backdrop-blur-md rounded-full flex items-center justify-center text-white border border-white/10 hover:bg-black/50 transition-colors"
              >
                <ChevronRight className="rotate-90" size={20} />
              </button>
              <div className="flex gap-2">
                <button 
                  className="w-10 h-10 bg-black/30 backdrop-blur-md rounded-full flex items-center justify-center text-white border border-white/10 hover:bg-black/50 transition-colors"
                >
                  <Heart size={18} />
                </button>
              </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar pb-32">
              {/* Edge to Edge Image Carousel */}
              <div className="relative w-full h-[35vh]">
                <div className="w-full h-full flex overflow-x-auto snap-x snap-mandatory scrollbar-hide">
                  {(() => {
                    // Owner'ın seçtiği kapak fotoğrafını başa al
                    const imgs = selectedPitch.images || [selectedPitch.image].filter(Boolean);
                    const coverIdx = selectedPitch.coverImageIndex ?? 0;
                    const ordered = imgs.length > 0
                      ? [imgs[coverIdx], ...imgs.filter((_, i) => i !== coverIdx)].filter(Boolean)
                      : [];
                    return ordered.length > 0 ? (
                      ordered.map((img, idx) => (
                        <div key={idx} className="w-full h-full flex-shrink-0 snap-center relative">
                          <img src={img} className="w-full h-full object-cover" alt={`${selectedPitch.name} ${idx + 1}`} />
                        </div>
                      ))
                    ) : (
                      <div className="w-full h-full flex-shrink-0 snap-center relative bg-[#161B22]"></div>
                    );
                  })()}
                </div>
                <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#0A0E14] to-transparent pointer-events-none"></div>

                {/* KAMPANYA BANDI - Owner'ın eklediği */}
                {selectedPitch.showcaseCampaign && (
                  <div className="absolute top-4 left-4 right-4 z-20">
                    <div className="bg-gradient-to-r from-[#FFFF00]/95 to-yellow-300/95 backdrop-blur-md rounded-2xl p-3 flex items-center gap-3 shadow-[0_0_30px_rgba(255,255,0,0.4)] border border-[#FFFF00]">
                      <div className="w-10 h-10 rounded-xl bg-black/20 flex items-center justify-center shrink-0">
                        <span className="text-2xl">🎉</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-black uppercase tracking-tight truncate">
                          {selectedPitch.showcaseCampaign.title}
                        </p>
                        {selectedPitch.showcaseCampaign.subtitle && (
                          <p className="text-[11px] text-black/70 font-bold truncate">
                            {selectedPitch.showcaseCampaign.subtitle}
                          </p>
                        )}
                      </div>
                      {selectedPitch.showcaseCampaign.discountPct && (
                        <span className="text-2xl font-black text-black bg-white/30 px-3 py-1 rounded-lg shrink-0">
                          %{selectedPitch.showcaseCampaign.discountPct}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {/* Carousel Indicator Dots */}
                {selectedPitch.images && selectedPitch.images.length > 1 && (
                  <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
                    {selectedPitch.images.map((_, idx) => (
                      <div key={idx} className="w-1.5 h-1.5 rounded-full bg-white/50 backdrop-blur-md"></div>
                    ))}
                  </div>
                )}
              </div>

              {/* Title & Reviews */}
              <div className="px-6 -mt-8 relative z-10 mb-8">
                <h1 className="text-[28px] font-bold text-white leading-tight pr-4">{selectedPitch.name}</h1>
                <div className="flex items-center gap-1.5 mt-2 text-white">
                  <Star size={14} className="fill-white" />
                  <span className="text-[15px] font-medium">{selectedPitch.rating}</span>
                  <span className="text-gray-400 text-[15px] mx-1">·</span>
                  <span className="text-[15px] font-medium underline">128 değerlendirme</span>
                  <span className="text-gray-400 text-[15px] mx-1">·</span>
                  <span className="text-[15px] text-gray-400">{selectedPitch.district}</span>
                </div>
                {selectedPitch.description && (
                  <p className="mt-4 text-sm text-gray-300 leading-relaxed font-medium">
                    {selectedPitch.description}
                  </p>
                )}
              </div>

              {/* Amenities */}
              <div className="px-6 mb-8">
                <h3 className="text-lg font-bold text-white mb-4">Tesis İmkanları</h3>
                <div className="flex flex-wrap gap-2">
                  {selectedPitch.amenities.map(a => (
                    <span key={a} className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-xl text-xs font-medium text-gray-300">
                      {a}
                    </span>
                  ))}
                </div>
              </div>

               {/* Courts / Showcase Info */}
              <div className="px-6 mb-8">
                  {selectedPitch.courts && selectedPitch.courts.length > 0 && (
                    <div className="animate-in fade-in duration-500">
                      <h3 className="text-lg font-bold text-white mb-4">Saha Seçenekleri</h3>
                      <div className="space-y-4">
                        {selectedPitch.courts.map(court => {
                          const isExpanded = expandedCourtId === court.id;
                          return (
                            <div
                              key={court.id}
                              className="w-full rounded-3xl border bg-[#161B22] border-white/5 overflow-hidden transition-all duration-300 shadow-lg hover:bg-[#1A202A]"
                            >
                              <div 
                                className="p-5 flex items-center justify-between cursor-pointer"
                                onClick={() => setExpandedCourtId(isExpanded ? null : court.id)}
                              >
                                <div className="flex items-center gap-4">
                                  <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-black/40 text-gray-300 border border-white/5 shadow-inner">
                                    {court.type === 'CLOSED' ? <Thermometer size={24} /> : <Wind size={24} />}
                                  </div>
                                  <div className="text-left">
                                    <p className="font-bold text-[16px] text-white">{court.name}</p>
                                    <p className="text-xs font-semibold text-gray-400 mt-0.5">
                                      {court.type === 'CLOSED' ? 'Kapalı Saha • Isıtmalı' : 'Açık Saha • Doğal Hava'}
                                    </p>
                                  </div>
                                </div>
                                <div className="text-right flex items-center gap-3">
                                  <div>
                                    <p className="text-lg font-black text-[#39FF14]">{court.price}₺</p>
                                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest leading-none">saat</p>
                                  </div>
                                  <ChevronRight size={20} className={`text-gray-500 transition-transform duration-300 ${isExpanded ? 'rotate-90' : ''}`} />
                                </div>
                              </div>
                              
                              <AnimatePresence>
                                {isExpanded && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="border-t border-white/5 bg-[#0D111A]"
                                  >
                                    <div className="p-5 space-y-5">
                                      {/* Court Specific Images */}
                                      {court.images && court.images.length > 0 && (
                                        <div className="flex gap-3 overflow-x-auto snap-x scrollbar-hide -mx-5 px-5">
                                          {court.images.map((img, idx) => (
                                            <img key={idx} src={img} alt="" className="w-[140px] h-[90px] rounded-2xl object-cover snap-center flex-shrink-0 shadow-md border border-white/5" />
                                          ))}
                                        </div>
                                      )}
                                      
                                      {/* Court Description */}
                                      {court.description && (
                                        <p className="text-sm font-medium text-gray-300 leading-relaxed">
                                          {court.description}
                                        </p>
                                      )}

                                      {/* Court Features */}
                                      {court.features && court.features.length > 0 && (
                                        <div className="flex flex-wrap gap-2 pt-2">
                                          {court.features.map(f => (
                                            <span key={f} className="px-3 py-1.5 bg-black/50 border border-white/5 rounded-xl text-[11px] font-bold uppercase tracking-wider text-[#39FF14]/80">
                                              {f}
                                            </span>
                                          ))}
                                        </div>
                                      )}

                                      {/* Court Grades */}
                                      {(court.lighting && court.grassQuality && court.lockerRoomQuality) && (
                                        <div className="flex items-center justify-between border-t border-white/5 pt-5 mt-5 mb-5">
                                          <GradeBadge label="Aydınlatma" score={court.lighting} icon={Zap} />
                                          <GradeBadge label="Zemin Kalitesi" score={court.grassQuality} icon={Layers} />
                                          <GradeBadge label="Soyunma Odası" score={court.lockerRoomQuality} icon={Droplets} />
                                        </div>
                                      )}

                                      {/* 7 Günlük Canlı Doluluk Takvimi */}
                                      <div className="border-t border-white/5 pt-5">
                                        <div className="flex items-center justify-between mb-4">
                                          <h4 className="text-[12px] font-black text-white uppercase tracking-widest flex items-center gap-2">
                                            <Activity size={14} className="text-[#FFFF00]" /> CANLI DOLULUK
                                          </h4>
                                          <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                            REALTIME
                                          </span>
                                        </div>
                                        {selectedPitch && (
                                          <OccupancyCalendar
                                            pitchId={selectedPitch.id}
                                            variant="player"
                                            selectedSlot={
                                              selectedSlot && selectedCourtId === court.id
                                                ? { date: new Date().toISOString().split('T')[0], time: selectedSlot }
                                                : null
                                            }
                                            onSlotSelect={(date, time) => {
                                              setSelectedSlot(time);
                                              setSelectedCourtId(court.id);
                                            }}
                                          />
                                        )}
                                      </div>

                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
              </div>
            </div>

            {/* Footer Showcase Actions */}
            <div className="absolute bottom-0 left-0 w-full p-6 bg-[#0A0E14] border-t border-white/5 flex gap-4 items-center z-20">
               <button
                  className="w-14 h-14 rounded-2xl flex items-center justify-center transition-all bg-white/5 border border-white/10 text-white hover:bg-white/10"
                >
                  <Heart size={20} />
                </button>
                {isSelectionMode ? (
                  <button
                    disabled={!selectedSlot || !selectedCourtId}
                    onClick={() => {
                      if (selectedPitch && selectedCourt && selectedSlot && onSelectTime) {
                         const date = new Date();
                         date.setDate(date.getDate() + selectedDate);
                         onSelectTime(selectedPitch, selectedCourt, date.toLocaleDateString('tr-TR'), selectedSlot);
                      }
                    }}
                    className={`flex-1 h-14 rounded-2xl font-black tracking-widest text-[13px] flex items-center justify-center gap-2 transition-all uppercase bg-[#FFFF00] text-black ${
                      selectedSlot && selectedCourtId
                        ? 'shadow-[0_0_35px_rgba(255,255,0,0.65)] hover:shadow-[0_0_45px_rgba(255,255,0,0.85)] active:scale-95 cursor-pointer'
                        : 'opacity-60 cursor-not-allowed'
                    }`}
                  >
                     {selectedSlot ? 'SAHAYI VE SAATİ ONAYLA' : 'ÖNCE SAAT SEÇİN'}
                  </button>
                ) : (
                  <button
                    className="flex-1 h-14 rounded-2xl font-bold text-[15px] flex items-center justify-center gap-2 transition-all bg-[#FF385C] text-white hover:bg-[#D70466] active:scale-95"
                  >
                     <Phone size={18} /> TESİSİ ARA
                  </button>
                )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>



    </div>
  );
};

export default PitchDiscovery;
