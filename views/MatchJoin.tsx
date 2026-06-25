import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft, MapPin, Clock, Calendar, Zap, Hand, Scale,
  X, Loader2, ChevronRight, Diamond, Search, UserPlus,
  Plus, CheckCircle2, Users, Star, Wifi, WifiOff,
  Send, AlertCircle, Shield, Layers, Droplets, Award,
  DollarSign, Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { MatchListing, PositionSlot, UserRole, Player, Team } from '../types';
import { useAppStore } from '../store';
import { auth } from '../supabaseAuth';
import { supabase } from '../supabaseClient';
import { subscribeToMatchUpdates } from '../services/matchService';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Toast } from '../components/common/Toast';

// Fix leaflet default icon path issues
if (typeof window !== 'undefined') {
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  });
}

const AIRBNB_MAP_CSS = `
  .leaflet-popup-content-wrapper { background: transparent !important; padding: 0 !important; box-shadow: none !important; border: none !important; }
  .leaflet-popup-tip-container { display: none !important; }
  .leaflet-popup-content { margin: 0 !important; }
  .leaflet-container { background: #060B12 !important; font-family: inherit; }
  .leaflet-control-attribution { display: none !important; }
  .leaflet-control-zoom { display: none !important; }
  .leaflet-tile-pane { filter: brightness(0.9) saturate(0.6); }
`;

const ChangeView = ({ center }: { center: [number, number] | null }) => {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.setView(center, map.getZoom());
    }
  }, [center, map]);
  return null;
};

const normalizeRole = (role: string): string => {
  const r = (role || '').toUpperCase();
  if (r === 'GK' || r === 'KL' || r === 'KALECİ' || r === 'K') return 'GK';
  if (r === 'DEF' || r === 'SAV' || r === 'STP' || r === 'STOPER' || r === 'S' || r === 'LB' || r === 'RB' || r === 'CB') return 'DEF';
  if (r === 'MID' || r === 'ORT' || r === 'OS' || r === 'ORTA SAHA' || r === 'M' || r === 'CM' || r === 'CDM' || r === 'CAM') return 'MID';
  if (r === 'FWD' || r === 'HÜC' || r === 'SNT' || r === 'HÜCUM' || r === 'F' || r === 'ST' || r === 'CF' || r === 'LW' || r === 'RW') return 'FWD';
  return 'MID';
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface MatchJoinProps {
  match: MatchListing | null;
  onBack: () => void;
  onJoin: () => void;
}

type SlotInviteStatus = 'NONE' | 'INVITED' | 'ACCEPTED';

// ─── Studio FORMATIONS — Birebir Kopya (Simetri Garantisi) ───────────────────
// Bu koordinatlar Studio.tsx'in FORMATIONS sabitinden alınmıştır.
// Herhangi bir hesaplama yapılmaz — direkt atama ile %100 simetri sağlanır.

const FORMATIONS: Record<string, Record<string, { x: number; y: number; role: string }[]>> = {
  '5v5': {
    '1-2-1': [
      { x: 50, y: 90, role: 'GK' },
      { x: 50, y: 75, role: 'DEF' },
      { x: 25, y: 50, role: 'MID' },
      { x: 75, y: 50, role: 'MID' },
      { x: 50, y: 25, role: 'FWD' },
    ],
    '2-1-1': [
      { x: 50, y: 90, role: 'GK' },
      { x: 30, y: 75, role: 'DEF' },
      { x: 70, y: 75, role: 'DEF' },
      { x: 50, y: 50, role: 'MID' },
      { x: 50, y: 25, role: 'FWD' },
    ],
  },
  '6v6': {
    '2-2-1': [
      { x: 50, y: 90, role: 'GK' },
      { x: 30, y: 75, role: 'DEF' },
      { x: 70, y: 75, role: 'DEF' },
      { x: 30, y: 50, role: 'MID' },
      { x: 70, y: 50, role: 'MID' },
      { x: 50, y: 25, role: 'FWD' },
    ],
    '3-1-1': [
      { x: 50, y: 90, role: 'GK' },
      { x: 20, y: 75, role: 'DEF' },
      { x: 50, y: 75, role: 'DEF' },
      { x: 80, y: 75, role: 'DEF' },
      { x: 50, y: 50, role: 'MID' },
      { x: 50, y: 25, role: 'FWD' },
    ],
  },
  '7v7': {
    '2-3-1': [
      { x: 50, y: 90, role: 'GK' },
      { x: 25, y: 75, role: 'DEF' },
      { x: 75, y: 75, role: 'DEF' },
      { x: 20, y: 50, role: 'MID' },
      { x: 50, y: 50, role: 'MID' },
      { x: 80, y: 50, role: 'MID' },
      { x: 50, y: 25, role: 'FWD' },
    ],
    '3-2-1': [
      { x: 50, y: 90, role: 'GK' },
      { x: 20, y: 75, role: 'DEF' },
      { x: 50, y: 75, role: 'DEF' },
      { x: 80, y: 75, role: 'DEF' },
      { x: 35, y: 50, role: 'MID' },
      { x: 65, y: 50, role: 'MID' },
      { x: 50, y: 25, role: 'FWD' },
    ],
    '2-2-2': [
      { x: 50, y: 90, role: 'GK' },
      { x: 30, y: 75, role: 'DEF' },
      { x: 70, y: 75, role: 'DEF' },
      { x: 30, y: 50, role: 'MID' },
      { x: 70, y: 50, role: 'MID' },
      { x: 35, y: 25, role: 'FWD' },
      { x: 65, y: 25, role: 'FWD' },
    ],
  },
  '8v8': {
    '3-3-1': [
      { x: 50, y: 90, role: 'GK' },
      { x: 20, y: 75, role: 'DEF' },
      { x: 50, y: 75, role: 'DEF' },
      { x: 80, y: 75, role: 'DEF' },
      { x: 20, y: 50, role: 'MID' },
      { x: 50, y: 50, role: 'MID' },
      { x: 80, y: 50, role: 'MID' },
      { x: 50, y: 25, role: 'FWD' },
    ],
    '4-2-1': [
      { x: 50, y: 90, role: 'GK' },
      { x: 20, y: 75, role: 'DEF' },
      { x: 40, y: 75, role: 'DEF' },
      { x: 60, y: 75, role: 'DEF' },
      { x: 80, y: 75, role: 'DEF' },
      { x: 35, y: 50, role: 'MID' },
      { x: 65, y: 50, role: 'MID' },
      { x: 50, y: 25, role: 'FWD' },
    ],
  },
  '9v9': {
    '3-3-2': [
      { x: 50, y: 90, role: 'GK' },
      { x: 20, y: 75, role: 'DEF' },
      { x: 50, y: 75, role: 'DEF' },
      { x: 80, y: 75, role: 'DEF' },
      { x: 20, y: 50, role: 'MID' },
      { x: 50, y: 50, role: 'MID' },
      { x: 80, y: 50, role: 'MID' },
      { x: 35, y: 25, role: 'FWD' },
      { x: 65, y: 25, role: 'FWD' },
    ],
    '4-3-1': [
      { x: 50, y: 90, role: 'GK' },
      { x: 20, y: 75, role: 'DEF' },
      { x: 40, y: 75, role: 'DEF' },
      { x: 60, y: 75, role: 'DEF' },
      { x: 80, y: 75, role: 'DEF' },
      { x: 20, y: 50, role: 'MID' },
      { x: 50, y: 50, role: 'MID' },
      { x: 80, y: 50, role: 'MID' },
      { x: 50, y: 25, role: 'FWD' },
    ],
  },
  '10v10': {
    '4-3-2': [
      { x: 50, y: 90, role: 'GK' },
      { x: 20, y: 75, role: 'DEF' },
      { x: 40, y: 75, role: 'DEF' },
      { x: 60, y: 75, role: 'DEF' },
      { x: 80, y: 75, role: 'DEF' },
      { x: 20, y: 50, role: 'MID' },
      { x: 50, y: 50, role: 'MID' },
      { x: 80, y: 50, role: 'MID' },
      { x: 35, y: 25, role: 'FWD' },
      { x: 65, y: 25, role: 'FWD' },
    ],
    '4-4-1': [
      { x: 50, y: 90, role: 'GK' },
      { x: 20, y: 75, role: 'DEF' },
      { x: 40, y: 75, role: 'DEF' },
      { x: 60, y: 75, role: 'DEF' },
      { x: 80, y: 75, role: 'DEF' },
      { x: 20, y: 50, role: 'MID' },
      { x: 40, y: 50, role: 'MID' },
      { x: 60, y: 50, role: 'MID' },
      { x: 80, y: 50, role: 'MID' },
      { x: 50, y: 25, role: 'FWD' },
    ],
  },
  '11v11': {
    '4-4-2': [
      { x: 50, y: 90, role: 'GK' },
      { x: 20, y: 75, role: 'DEF' },
      { x: 40, y: 75, role: 'DEF' },
      { x: 60, y: 75, role: 'DEF' },
      { x: 80, y: 75, role: 'DEF' },
      { x: 20, y: 50, role: 'MID' },
      { x: 40, y: 50, role: 'MID' },
      { x: 60, y: 50, role: 'MID' },
      { x: 80, y: 50, role: 'MID' },
      { x: 35, y: 25, role: 'FWD' },
      { x: 65, y: 25, role: 'FWD' },
    ],
    '4-3-3': [
      { x: 50, y: 90, role: 'GK' },
      { x: 20, y: 75, role: 'DEF' },
      { x: 40, y: 75, role: 'DEF' },
      { x: 60, y: 75, role: 'DEF' },
      { x: 80, y: 75, role: 'DEF' },
      { x: 20, y: 50, role: 'MID' },
      { x: 50, y: 50, role: 'MID' },
      { x: 80, y: 50, role: 'MID' },
      { x: 20, y: 25, role: 'FWD' },
      { x: 50, y: 25, role: 'FWD' },
      { x: 80, y: 25, role: 'FWD' },
    ],
  },
};

// Slot sayısından format tahmini
const inferSquadSize = (slotCount: number): string => {
  if (slotCount <= 5) return '5v5';
  if (slotCount <= 6) return '6v6';
  if (slotCount <= 7) return '7v7';
  if (slotCount <= 8) return '8v8';
  if (slotCount <= 9) return '9v9';
  if (slotCount <= 10) return '10v10';
  return '11v11';
};

const checkAndGetStatus = (slots: PositionSlot[], awaySlots?: PositionSlot[]): 'ACTIVE' | 'LIVE' => {
  const allHomeFilled = slots.filter(s => s.status === 'TAKEN').length === slots.length;
  const allHomePaid = slots.every(s => s.status !== 'TAKEN' || s.player?.paymentStatus === 'PAID');
  
  if (awaySlots && awaySlots.length > 0) {
    const allAwayFilled = awaySlots.filter(s => s.status === 'TAKEN').length === awaySlots.length;
    const allAwayPaid = awaySlots.every(s => s.status !== 'TAKEN' || s.player?.paymentStatus === 'PAID');
    return (allHomeFilled && allHomePaid && allAwayFilled && allAwayPaid) ? 'LIVE' : 'ACTIVE';
  }
  
  return (allHomeFilled && allHomePaid) ? 'LIVE' : 'ACTIVE';
};

// Studio ile %100 Uyumlu Kanonik Koordinat Atayıcı (Rol ve Yatay Simetri Odaklı Eşleme)
const applyCanonicalCoords = (slots: PositionSlot[]): PositionSlot[] => {
  if (!slots || slots.length === 0) return [];
  const size = inferSquadSize(slots.length);
  const formationsForSize = FORMATIONS[size];
  if (!formationsForSize) return slots;
  // İlk mevcut formasyonu al (en yaygın format)
  const firstFormation = Object.values(formationsForSize)[0];
  if (!firstFormation) return slots;

  // Kanonik koordinatları rollerine göre grupla
  const canonicalByRole: Record<string, { x: number; y: number; role: string }[]> = {
    GK: [],
    DEF: [],
    MID: [],
    FWD: []
  };
  firstFormation.forEach(coord => {
    const norm = normalizeRole(coord.role);
    if (canonicalByRole[norm]) {
      canonicalByRole[norm].push(coord);
    }
  });

  // Her rol grubunu kendi içinde X eksenine göre (soldan sağa) sırala
  Object.keys(canonicalByRole).forEach(key => {
    canonicalByRole[key].sort((a, b) => a.x - b.x);
  });

  // Gelen slotları rollerine göre grupla
  const slotsByRole: Record<string, PositionSlot[]> = {
    GK: [],
    DEF: [],
    MID: [],
    FWD: []
  };
  slots.forEach(slot => {
    const norm = normalizeRole(slot.role);
    if (slotsByRole[norm]) {
      slotsByRole[norm].push(slot);
    }
  });

  // Gelen slotları kendi içlerinde X koordinatlarına (varsa) göre sırala ki eşleşme yatayda tutarlı olsun
  Object.keys(slotsByRole).forEach(key => {
    slotsByRole[key].sort((a, b) => (a.x || 0) - (b.x || 0));
  });

  const result: PositionSlot[] = [];
  const usedCanonicalKeys = new Set<string>();

  // İlk Geçiş: Slotları kendi rol grubundaki kanonik koordinatlarla eşle
  Object.keys(slotsByRole).forEach(role => {
    const groupSlots = slotsByRole[role];
    const groupCoords = canonicalByRole[role];

    groupSlots.forEach((slot, index) => {
      const coord = groupCoords[index];
      if (coord) {
        result.push({
          ...slot,
          role: slot.role || coord.role,
          x: coord.x,
          y: coord.y
        });
        usedCanonicalKeys.add(`${coord.x},${coord.y}`);
      } else {
        // Rol grubunda kanonik koordinat kalmadıysa geçici olarak işaretle
        result.push({ ...slot, x: -1, y: -1 });
      }
    });
  });

  // İkinci Geçiş: Eşleşmeyen slotları (x=-1, y=-1) boşta kalan kanonik koordinatlara dağıt
  const unusedCoords = firstFormation.filter(c => !usedCanonicalKeys.has(`${c.x},${c.y}`));
  let unusedIdx = 0;

  const finalResult = result.map(slot => {
    if (slot.x === -1 && slot.y === -1) {
      const coord = unusedCoords[unusedIdx++];
      if (coord) {
        return { ...slot, role: slot.role || coord.role, x: coord.x, y: coord.y };
      } else {
        const original = slots.find(s => s.id === slot.id);
        return { ...slot, role: slot.role || original?.role || 'MID', x: original?.x || 50, y: original?.y || 50 };
      }
    }
    return slot;
  });

  return finalResult;
};

// ─── Difficulty Badge Renk Sistemi ─────────────────────────────────────────

const difficultyConfig: Record<string, { color: string; glow: string; label: string }> = {
  'Ciddi':     { color: '#FF3B3B', glow: 'rgba(255,59,59,0.4)',   label: 'CİDDİ'      },
  'Taktiksel': { color: '#FFFF00', glow: 'rgba(255,255,0,0.4)',   label: 'TAKTİKSEL'  },
  'Rahat':     { color: '#39FF14', glow: 'rgba(57,255,20,0.4)',   label: 'RAHAT'      },
};

const getQualityGrade = (score: number): string => {
  if (score >= 95) return 'A+';
  if (score >= 90) return 'A';
  if (score >= 85) return 'A-';
  if (score >= 80) return 'B+';
  if (score >= 75) return 'B';
  if (score >= 70) return 'B-';
  return 'C';
};

const getGradeColorClass = (grade: string): string => {
  if (grade.startsWith('A')) return 'text-[#39FF14] drop-shadow-[0_0_8px_rgba(57,255,20,0.4)]';
  if (grade.startsWith('B')) return 'text-[#FFFF00] drop-shadow-[0_0_8px_rgba(255,255,0,0.4)]';
  return 'text-orange-400';
};


const generateDefaultSlots = (size: string, prefixId: string): PositionSlot[] => {
  const formationsForSize = FORMATIONS[size];
  if (!formationsForSize) return [];
  const firstFormation = Object.values(formationsForSize)[0];
  if (!firstFormation) return [];
  
  return firstFormation.map((coord, idx) => ({
    id: `${prefixId}_slot_${idx}`,
    role: coord.role,
    x: coord.x,
    y: coord.y,
    status: 'OPEN'
  }));
};

// ─── Ana Bileşen ─────────────────────────────────────────────────────────────

const MatchJoin: React.FC<MatchJoinProps> = ({ match: originalMatch, onBack, onJoin }) => {
  const match = useMemo(() => {
    if (!originalMatch) return null as any;
    const badgeFormat = originalMatch.badges?.find(b => /^\d+v\d+$/i.test(b.trim()))?.toLowerCase();
    const slotCountFormat = originalMatch.slots?.length > 0 ? inferSquadSize(originalMatch.slots.length) : null;
    const fmt = originalMatch.format || badgeFormat || slotCountFormat || '7v7';
    const homeSlots = originalMatch.slots?.length > 0
      ? originalMatch.slots
      : generateDefaultSlots(fmt, (originalMatch.id || 'match') + '_home');
    const awaySlots = originalMatch.awaySlots?.length > 0
      ? originalMatch.awaySlots
      : generateDefaultSlots(inferSquadSize(homeSlots.length), (originalMatch.id || 'match') + '_away');
    return { ...originalMatch, slots: homeSlots, awaySlots };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originalMatch?.id, originalMatch?.slots, originalMatch?.awaySlots, originalMatch?.format]);

  // ── State ────────────────────────────────────────────────────────────────
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);

  // Aksiyon hatası/başarı toast'ı
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const showActionError = (msg: string) => {
    setActionError(msg);
    setTimeout(() => setActionError(null), 4000);
  };
  const showActionSuccess = (msg: string) => {
    setActionSuccess(msg);
    setTimeout(() => setActionSuccess(null), 4000);
  };

  // Lobi Sekmesi & Sohbet & Taktik Kenarı
  const [lobbyTab, setLobbyTab] = useState<'squad' | 'chat'>('squad');
  const [scoreEntry, setScoreEntry] = useState({ home: 0, away: 0 });
  const [pitchSide, setPitchSide] = useState<'home' | 'away'>('home');
  const [chatInputText, setChatInputText] = useState('');

  // Dolu slot — VIP Diamond kart
  const [activePlayerSlotId, setActivePlayerSlotId] = useState<string | null>(null);

  const [inviteModalSlotId, setInviteModalSlotId] = useState<string | null>(null);
  const [friendSearch, setFriendSearch] = useState('');
  const [invitesSent, setInvitesSent] = useState<Record<string, SlotInviteStatus>>({}); // slot
  const [invitedFriendNames, setInvitedFriendNames] = useState<Record<string, string>>({});
  const [resolvedHomeTeam, setResolvedHomeTeam] = useState<Team | null>(null);
  const [resolvedAwayTeam, setResolvedAwayTeam] = useState<Team | null>(null);
  const [removeConfirmSlot, setRemoveConfirmSlot] = useState<PositionSlot | null>(null);
  const [openSlotActionSlot, setOpenSlotActionSlot] = useState<PositionSlot | null>(null);

  // Arkadaş daveti kategorisi
  const [inviteCategory, setInviteCategory] = useState('Tümü');

  // Maçtan Ayrıl
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  // Rakip Modalları
  const [showOpponentModal, setShowOpponentModal] = useState(false);
  const [showJoinOpponentModal, setShowJoinOpponentModal] = useState(false);

  const [showMapModal, setShowMapModal] = useState(false);
  const [pitchCoordinates, setPitchCoordinates] = useState<[number, number] | null>(null);

  // ── Store ─────────────────────────────────────────────────────────────────
  const { 
    adminUsers, friends, updateMatch, addUserNotification, adminPitches, 
    userTeams, myTeams, setSelectedMatch,
    setNewMatchBadge
  } = useAppStore();

  useEffect(() => {
    if (match?.location) {
        const foundPitch = adminPitches?.find(p => (p.name || '').toLowerCase().includes(match.location.toLowerCase()) || match.location.toLowerCase().includes((p.name || '').toLowerCase()));
        if (foundPitch && foundPitch.coordinates) {
            setPitchCoordinates([foundPitch.coordinates.lat, foundPitch.coordinates.lng]);
        } else {
            setPitchCoordinates([41.0433, 29.0057]);
        }
    }
  }, [match, adminPitches]);

  // ── Supabase Realtime: Lobideki değişiklikleri canlı dinle ──────────────
  useEffect(() => {
    if (!originalMatch?.id) return;
    const unsubscribe = subscribeToMatchUpdates(originalMatch.id, (updatedMatch) => {
      // Supabase'den gelen snake_case verileri MatchListing formatına dönüştür
      const mapped: Partial<MatchListing> = {
        ...updatedMatch,
        slots: (updatedMatch as any).slots || [],
        awaySlots: (updatedMatch as any).away_slots || (updatedMatch as any).awaySlots || [],
        homeTeamId: (updatedMatch as any).home_team_id || (updatedMatch as any).homeTeamId,
        awayTeamId: (updatedMatch as any).away_team_id || (updatedMatch as any).awayTeamId,
        creatorId: (updatedMatch as any).creator_id || (updatedMatch as any).creatorId,
        chatMessages: (updatedMatch as any).chat_messages || (updatedMatch as any).chatMessages || [],
        reservePlayers: (updatedMatch as any).reserve_players || (updatedMatch as any).reservePlayers || [],
        minRating: (updatedMatch as any).min_rating || (updatedMatch as any).minRating,
        homeScore: (updatedMatch as any).home_score || (updatedMatch as any).homeScore,
        awayScore: (updatedMatch as any).away_score || (updatedMatch as any).awayScore,
        scoreEnteredAt: (updatedMatch as any).score_entered_at || (updatedMatch as any).scoreEnteredAt,
      };
      updateMatch({ ...originalMatch, ...mapped } as MatchListing);
    });
    return () => { unsubscribe(); };
  }, [originalMatch?.id]);

  if (!match) return null;

  // Saha ve Detaylı Filtre Bilgilerini Çekme
  const matchPitch = (adminPitches || []).find(p =>
    p?.name && match.location &&
    (match.location.toLowerCase().includes(p.name.toLowerCase()) ||
     p.name.toLowerCase().includes(match.location.toLowerCase()))
  );

  const fallbackPitch = {
    name: match.location || 'Oyna Arena',
    rating: 4.5,
    googleRating: 4.4,
    googleReviews: 120,
    grassGrade: 'A' as const,
    lightingGrade: 'A' as const,
    lockerRoomGrade: 'B' as const,
    amenities: ['Duş', 'Otopark', 'Soyunma Odası', 'Su'],
    image: 'https://images.unsplash.com/photo-1529900748604-07564a03e7a6?auto=format&fit=crop&q=80&w=1000'
  };

  const activePitch = matchPitch || fallbackPitch;

  // Dinamik kurallar ve filtreler
  const ageLimit = match.badges?.find(b => b.includes('Yaş') || b.includes('Yaş Grubu'))
    || (match.difficulty === 'Ciddi' ? '20-35 Yaş' : 'Limit Yok (18+)');

  const genderRule = match.badges?.find(b => b === 'Erkek' || b === 'Kadın' || b === 'Karma')
    || 'Karma Katılım';

  // Home & Away Teams derived from store
  const homeTeam = match.homeTeamId ? (userTeams || []).find(t => t.id === match.homeTeamId) : null;
  const awayTeam = match.awayTeamId ? (userTeams || []).find(t => t.id === match.awayTeamId) : null;

  // ── Kullanıcı ─────────────────────────────────────────────────────────────
  const currentUserUid = auth.currentUser?.uid || 'u1';
  const currentUserProfile = (adminUsers || []).find(u => u?.id === currentUserUid)
    || (adminUsers && adminUsers[0])
    || { id: 'u1', name: 'Kerem Y.', avatar: 'https://i.pravatar.cc/150?u=u1', role: UserRole.CAPTAIN, rating: 4.9 };

  const isCaptain = currentUserProfile?.role === UserRole.CAPTAIN
    || match.creatorId === currentUserProfile?.id;

  const isHomeCaptain = match.creatorId === currentUserProfile.id || homeTeam?.captain === currentUserProfile.id || homeTeam?.captains?.includes(currentUserProfile.id);
  const isAwayCaptain = !!awayTeam && (awayTeam.captain === currentUserProfile.id || awayTeam.captains?.includes(currentUserProfile.id));

  // ── Kanonik Simetrik Slotlar (Studio ile aynı koordinatlar) ───────────────
  const canonicalSlots = applyCanonicalCoords(match.slots || []);

  // Profil fotoğrafını DB'den çek (Ev Sahibi Roster)
  const enrichedSlots = canonicalSlots.map((slot, idx) => {
    if (!slot) return slot;
    if (slot.status !== 'TAKEN') return slot;
    const orig = slot.player;
    const dbUser = orig
      ? (adminUsers || []).find(u => u?.id === orig.id || (orig.name && u?.name && u.name.toLowerCase() === orig.name.toLowerCase()))
      : (adminUsers && adminUsers[idx % Math.max(adminUsers.length, 1)]);
    if (dbUser) {
      return {
        ...slot,
        player: {
          id: dbUser.id,
          name: dbUser.name || 'Oyuncu',
          avatar: dbUser.avatar || `https://i.pravatar.cc/150?u=${dbUser.id}`,
          rating: dbUser.rating || 4.5,
          position: slot.role || 'OYUNCU',
          x: slot.x,
          y: slot.y,
          paymentStatus: orig?.paymentStatus || 'UNPAID',
        } as Player,
      };
    }
    return slot;
  });

  // Deplasman Roster Zenginleştirme
  const canonicalAwaySlots = applyCanonicalCoords(match.awaySlots || []);
  const enrichedAwaySlots = canonicalAwaySlots.map((slot, idx) => {
    if (!slot) return slot;
    if (slot.status !== 'TAKEN') return slot;
    const orig = slot.player;
    const dbUser = orig
      ? (adminUsers || []).find(u => u?.id === orig.id || (orig.name && u?.name && u.name.toLowerCase() === orig.name.toLowerCase()))
      : (adminUsers && adminUsers[idx % Math.max(adminUsers.length, 1)]);
    if (dbUser) {
      return {
        ...slot,
        player: {
          id: dbUser.id,
          name: dbUser.name || 'Oyuncu',
          avatar: dbUser.avatar || `https://i.pravatar.cc/150?u=${dbUser.id}`,
          rating: dbUser.rating || 4.5,
          position: slot.role || 'OYUNCU',
          x: slot.x,
          y: slot.y,
          paymentStatus: orig?.paymentStatus || 'PAID',
        } as Player,
      };
    }
    return slot;
  });

  // ── Derived State ─────────────────────────────────────────────────────────
  const isAlreadyJoinedHome = (match.slots || []).some(
    s => s?.player?.id === currentUserProfile?.id
  );
  const isAlreadyJoinedAway = (match.awaySlots || []).some(
    s => s?.player?.id === currentUserProfile?.id
  );
  const isAlreadyJoined = isAlreadyJoinedHome || isAlreadyJoinedAway;

  const isAlreadyJoinedReserve = (match.reservePlayers || []).some(
    p => p?.id === currentUserProfile?.id
  );

  const mySlot = isAlreadyJoined
    ? [...enrichedSlots, ...enrichedAwaySlots].find(s => s?.player?.id === currentUserProfile?.id)
    : null;

  const assignedIds = (match.slots || []).filter(s => s?.player).map(s => s.player!.id);
  const filteredFriends = (friends || []).filter(f => {
    if (!f || !f.id || !f.name) return false;
    if (assignedIds.includes(f.id)) return false;
    if (friendSearch && !f.name.toLowerCase().includes(friendSearch.toLowerCase())) return false;
    if (inviteCategory !== 'Tümü') {
      if (inviteCategory === 'Favorilerim') {
        if (!(f as any).isFavorite) return false;
      } else {
        if (f.group !== inviteCategory) return false;
      }
    }
    return true;
  });
  const onlineFriends = filteredFriends.filter(f => (f as any).online);
  const offlineFriends = filteredFriends.filter(f => !(f as any).online);

  const diffConf = difficultyConfig[match.difficulty] || difficultyConfig['Rahat'];
  const squadSize = inferSquadSize((match.slots || []).length);
  const totalSlots = (match.slots || []).length;
  const takenSlots = (match.slots || []).filter(s => s?.status === 'TAKEN').length;

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSendChatMessage = async (text: string) => {
    if (!text.trim()) return;
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const newMsg = {
      id: `chat_${Date.now()}`,
      senderId: currentUserProfile.id,
      senderName: currentUserProfile.name,
      senderAvatar: currentUserProfile.avatar || 'https://i.pravatar.cc/150?u=' + currentUserProfile.id,
      text: text.trim(),
      timestamp: timeStr
    };
    const baseMessages = match.chatMessages || [];
    const updatedMessages = [...baseMessages, newMsg];
    try {
      await updateMatch({ ...match, chatMessages: updatedMessages });
      setChatInputText('');
    } catch (err) {
      console.error(err);
      showActionError('Mesaj gönderilemedi. Lütfen tekrar dene.');
    }
  };

  const handleSlotClick = (slot: any) => {
    if (!slot) return;

    if (slot.status === 'TAKEN') {
      setActivePlayerSlotId(slot.id);
      return;
    }

    if (slot.status === 'OPEN') {
      if (isAlreadyJoined) {
        // Zaten kadrodayım: + tıklandı → arkadaş daveti
        setInviteModalSlotId(slot.id);
        setFriendSearch('');
        return;
      }
      
      // Henüz kadroda değilim: Karar modalını göster (Kendim Katıl / Arkadaş Davet Et)
      setOpenSlotActionSlot(slot);
    }
  };

  const handleJoin = async () => {
    if (!selectedSlotId || isAlreadyJoined) return;
    setIsProcessing(true);
    
    const isAway = (match.awaySlots || []).some(s => s?.id === selectedSlotId);
    const slotsSource = isAway ? (match.awaySlots || []) : (match.slots || []);
    const targetSlot = slotsSource.find(s => s?.id === selectedSlotId);
    if (!targetSlot) { setIsProcessing(false); return; }

    try {
      // Call Supabase RPC for safe concurrency-locked join
      const { error } = await supabase.rpc('join_public_match_slot', {
        p_match_id: match.id,
        p_slot_id: selectedSlotId,
        p_user_id: currentUserProfile.id,
        p_is_away: isAway
      });

      if (error) throw error;

      const joinedPlayer: Player = {
        id: currentUserProfile.id,
        name: currentUserProfile.name,
        avatar: currentUserProfile.avatar || `https://i.pravatar.cc/150?u=${currentUserProfile.id}`,
        rating: currentUserProfile.rating || 4.5,
        position: targetSlot.role || 'OYUNCU',
        x: targetSlot.x,
        y: targetSlot.y,
        paymentStatus: 'UNPAID',
      };

      let updatedSlots = [...(match.slots || [])];
      let updatedAwaySlots = [...(match.awaySlots || [])];

      if (isAway) {
        updatedAwaySlots = updatedAwaySlots.map(s =>
          s?.id === selectedSlotId
            ? { ...s, status: 'TAKEN' as const, player: joinedPlayer }
            : s
        );
      } else {
        updatedSlots = updatedSlots.map(s =>
          s?.id === selectedSlotId
            ? { ...s, status: 'TAKEN' as const, player: joinedPlayer }
            : s
        );
      }

      const nextStatus = checkAndGetStatus(updatedSlots, updatedAwaySlots);

      await updateMatch({ 
        ...match, 
        slots: updatedSlots, 
        awaySlots: updatedAwaySlots, 
        status: nextStatus 
      });
      
      setSelectedSlotId(null);
      setNewMatchBadge(true);
      setLobbyTab('chat');
    } catch (e: any) {
      console.error('Join error:', e);
      showActionError('Maça katılırken bir hata oluştu. Lütfen tekrar dene.');
    } finally {
      setIsProcessing(false);
    }
  };

  const fillVacatedSlot = (
    slots: PositionSlot[],
    reserves: Player[],
    vacatedSlotId: string
  ): { updatedSlots: PositionSlot[]; remainingReserves: Player[]; promotedPlayer?: Player } => {
    let promotedPlayer: Player | undefined = undefined;
    let remainingReserves = [...reserves];

    const updatedSlots = slots.map(s => {
      if (s.id === vacatedSlotId) {
        if (remainingReserves.length > 0) {
          const rawPlayer = remainingReserves.shift()!;
          promotedPlayer = {
            ...rawPlayer,
            position: s.role || 'OYUNCU',
            x: s.x,
            y: s.y,
            paymentStatus: 'UNPAID',
          };
          return {
            ...s,
            status: 'TAKEN' as const,
            player: promotedPlayer,
          };
        } else {
          const newSlot = { ...s, status: 'OPEN' as const };
          delete newSlot.player;
          return newSlot;
        }
      }
      return s;
    });

    return { updatedSlots, remainingReserves, promotedPlayer };
  };

  const handleJoinAsReserve = async () => {
    if (isAlreadyJoined || isAlreadyJoinedReserve) return;
    setIsProcessing(true);

    try {
      const { error } = await supabase.rpc('join_public_match_reserve', {
        p_match_id: match.id,
        p_user_id: currentUserProfile.id
      });

      if (error) throw error;

      const reservePlayer: Player = {
        id: currentUserProfile.id,
        name: currentUserProfile.name,
        avatar: currentUserProfile.avatar || `https://i.pravatar.cc/150?u=${currentUserProfile.id}`,
        rating: currentUserProfile.rating || 4.5,
        position: 'YEDEK',
        x: 50,
        y: 50,
        paymentStatus: 'UNPAID',
      };

      const updatedReserves = [...(match.reservePlayers || []), reservePlayer];
      await updateMatch({ ...match, reservePlayers: updatedReserves });
    } catch (e: any) {
      console.error('Join reserve error:', e);
      showActionError('Yedek olarak katılırken bir hata oluştu.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLeaveReserves = async () => {
    if (!isAlreadyJoinedReserve) return;
    setIsProcessing(true);

    try {
      const { error } = await supabase.rpc('leave_public_match_slot', {
        p_match_id: match.id,
        p_user_id: currentUserProfile.id
      });

      if (error) throw error;

      const updatedReserves = (match.reservePlayers || []).filter(
        p => p.id !== currentUserProfile.id
      );

      await updateMatch({ ...match, reservePlayers: updatedReserves });
      setShowLeaveConfirm(false);
    } catch (e: any) {
      console.error('Leave reserves error:', e);
      showActionError('Yedek listesinden çıkarken bir hata oluştu.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleInviteFriend = (friend: any) => {
    if (!inviteModalSlotId || !friend) return;
    setInvitesSent(prev => ({ ...prev, [inviteModalSlotId]: 'INVITED' }));
    setInvitedFriendNames(prev => ({ ...prev, [inviteModalSlotId]: friend.name || 'Arkadaş' }));
    
    const isAway = (match.awaySlots || []).some(s => s?.id === inviteModalSlotId);
    
    addUserNotification({
      id: `inv_${inviteModalSlotId}_${Date.now()}`,
      type: 'invite',
      title: isAway ? '⚔️ Rakip Daveti' : '⚽ Maç Daveti',
      desc: isAway 
        ? `${currentUserProfile.name} sizi "${match.title || 'bir maça'}" karşı takımda oynamaya (rakip olarak) davet etti!`
        : `${currentUserProfile.name} sizi "${match.title || 'bir maça'}" davet etti!`,
      time: 'Az önce',
      iconName: 'Trophy',
      color: '#FFFF00',
      textColor: '#FFFF00',
      payload: { matchId: match.id, slotId: inviteModalSlotId },
      read: false,
    });
    setInviteModalSlotId(null);
    setFriendSearch('');
  };



  const handleRemovePlayer = async (slotId: string) => {
    const isHomeSlot = (match.slots || []).some(s => s.id === slotId);
    const reserves = match.reservePlayers || [];

    if (isHomeSlot) {
      const { updatedSlots, remainingReserves } = fillVacatedSlot(match.slots || [], reserves, slotId);
      const nextStatus = checkAndGetStatus(updatedSlots, match.awaySlots);
      try {
        await updateMatch({
          ...match,
          slots: updatedSlots,
          reservePlayers: remainingReserves,
          status: nextStatus
        });
        setActivePlayerSlotId(null);
      } catch (e) {
        console.error(e);
        showActionError('Oyuncu kadrodan çıkarılamadı. Lütfen tekrar dene.');
      }
    } else {
      const { updatedSlots, remainingReserves } = fillVacatedSlot(match.awaySlots || [], reserves, slotId);
      const nextStatus = checkAndGetStatus(match.slots || [], updatedSlots);
      try {
        await updateMatch({
          ...match,
          awaySlots: updatedSlots,
          reservePlayers: remainingReserves,
          status: nextStatus
        });
        setActivePlayerSlotId(null);
      } catch (e) {
        console.error(e);
        showActionError('Oyuncu kadrodan çıkarılamadı. Lütfen tekrar dene.');
      }
    }
  };

  const handleLeaveMatch = async () => {
    if (!isAlreadyJoined || !currentUserProfile?.id) return;
    setIsProcessing(true);

    try {
      const { error } = await supabase.rpc('leave_public_match_slot', {
        p_match_id: match.id,
        p_user_id: currentUserProfile.id
      });

      if (error) throw error;

      const reserves = match.reservePlayers || [];
      const isHomePlayer = (match.slots || []).some(s => s.player?.id === currentUserProfile.id);
      const isAwayPlayer = (match.awaySlots || []).some(s => s.player?.id === currentUserProfile.id);

      let updatedSlots = match.slots || [];
      let updatedAwaySlots = match.awaySlots || [];
      let remainingReserves = reserves;

      if (isHomePlayer) {
        const slotId = (match.slots || []).find(s => s.player?.id === currentUserProfile.id)?.id;
        if (slotId) {
          const res = fillVacatedSlot(match.slots || [], remainingReserves, slotId);
          updatedSlots = res.updatedSlots;
          remainingReserves = res.remainingReserves;
        }
      } else if (isAwayPlayer) {
        const slotId = (match.awaySlots || []).find(s => s.player?.id === currentUserProfile.id)?.id;
        if (slotId) {
          const res = fillVacatedSlot(match.awaySlots || [], remainingReserves, slotId);
          updatedAwaySlots = res.updatedSlots;
          remainingReserves = res.remainingReserves;
        }
      }

      // Halef Kaptan Belirleme Mantığı (Reliability Score Tabanlı)
      let newCreatorId = match.creatorId;
      const isCreatorLeaving = match.creatorId === currentUserProfile.id;
      if (isCreatorLeaving) {
        const remainingPlayers = updatedSlots
          .map(s => s?.player)
          .filter((p): p is Player => !!p && p.id !== currentUserProfile.id);
        if (remainingPlayers.length > 0) {
          let bestScore = -1;
          let bestPlayerId = remainingPlayers[0].id;
          remainingPlayers.forEach(p => {
            const dbUser = (adminUsers || []).find(u => u?.id === p.id);
            const score = dbUser?.reliabilityScore ?? 100;
            if (score > bestScore) {
              bestScore = score;
              bestPlayerId = p.id;
            }
          });
          newCreatorId = bestPlayerId;
          
          // Notify new captain
          addUserNotification({
            id: `succ_${newCreatorId}_${Date.now()}`,
            type: 'system',
            title: '👑 Yeni Kaptan Sensin!',
            desc: `Eski kaptan ayrıldığı için yüksek güvenilirlik skorunla bu maçın yeni kaptanı seçildin.`,
            time: 'Şimdi',
            iconName: 'Award',
            color: '#39FF14',
            textColor: '#39FF14',
            read: false,
          });
        }
      }

      const nextStatus = checkAndGetStatus(updatedSlots, updatedAwaySlots);

      await updateMatch({
        ...match,
        slots: updatedSlots,
        awaySlots: updatedAwaySlots,
        reservePlayers: remainingReserves,
        creatorId: newCreatorId,
        status: nextStatus
      });
      
      setShowLeaveConfirm(false);
      onBack();
    } catch (e: any) {
      console.error('Leave match error:', e);
      showActionError('Maçtan ayrılırken bir hata oluştu.');
    } finally {
      setIsProcessing(false);
    }
  };

  const getDiamondValue = (p: any) => {
    if (!p) return 0;
    const db = (adminUsers || []).find(u => u?.id === p.id || u?.name === p.name);
    if (db?.playerCard?.diamondValue) return db.playerCard.diamondValue;
    const rating = db?.rating || p.rating || 4.5;
    const mc = db?.matchCount || 24;
    return mc * 250 + Math.round(rating * 1000);
  };

  const getFP = (p: any) => {
    const friend = (friends || []).find(f => (f as any).id === p?.id);
    return (friend as any)?.fp || Math.floor(Math.random() * 15) + 85;
  };

  const activePlayerSlot = activePlayerSlotId ? (pitchSide === 'home' ? enrichedSlots : enrichedAwaySlots).find(s => s?.id === activePlayerSlotId) : null;
  const activePlayer = activePlayerSlot?.player || null;

  // ─── RENDER ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#0A0E14] flex flex-col relative overflow-hidden font-sans">

      {/* Ambiyans arka plan */}
      <div className="absolute top-0 left-[-15%] w-[500px] h-[500px] bg-[#39FF14]/4 blur-[140px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 right-[-10%] w-[400px] h-[400px] bg-[#00f2fe]/4 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-[0.08] mix-blend-overlay pointer-events-none" />



      {/* ── VIP Diamond Kart Modalı ────────────────────────────────────────── */}
      <AnimatePresence>
        {activePlayer && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/85 backdrop-blur-2xl flex items-center justify-center p-6"
            onClick={() => setActivePlayerSlotId(null)}>
            <motion.div
              initial={{ scale: 0.75, y: 40, opacity: 0, rotateY: 20 }}
              animate={{ scale: 1, y: 0, opacity: 1, rotateY: 0 }}
              exit={{ scale: 0.75, y: 40, opacity: 0, rotateY: -20 }}
              transition={{ type: 'spring', damping: 22, stiffness: 280 }}
              onClick={e => e.stopPropagation()}
              className="relative w-80 rounded-[32px] overflow-hidden shadow-[0_40px_80px_rgba(0,0,0,0.9)]"
              style={{ perspective: '1000px' }}>

              {(() => {
                const overall = Math.round(((activePlayer as any).rating || 4.5) * 20);
                const isGold = overall >= 90;
                const isSilver = overall >= 80 && overall < 90;
                const tier = isGold ? 'GOLD' : isSilver ? 'SILVER' : 'BRONZE';
                const accentColor = isGold ? '#FFE875' : isSilver ? '#E2E8F0' : '#C27E47';
                const glowColor = isGold ? 'rgba(255,232,117,0.35)' : isSilver ? 'rgba(226,232,240,0.25)' : 'rgba(194,126,71,0.25)';
                const gradFrom = isGold ? '#FFE875' : isSilver ? '#E2E8F0' : '#C27E47';
                const fp = getFP(activePlayer);
                const isMySlot = activePlayer.id === currentUserProfile?.id;

                return (
                  <div className="relative" style={{ background: `linear-gradient(160deg, #0d1117 0%, #161B22 100%)` }}>
                    {/* Doku */}
                    <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-20 mix-blend-overlay" />
                    {/* Glow */}
                    <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full blur-[80px] opacity-40"
                      style={{ background: glowColor }} />

                    {/* Üst Şerit — Tier ve Renk */}
                    <div className="absolute top-0 left-0 right-0 h-1 rounded-t-[32px]"
                      style={{ background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)` }} />

                    <div className="relative p-7 flex flex-col items-center">
                      {/* Overall Badge */}
                      <div className="absolute top-6 left-6 flex flex-col items-center">
                        <span className="text-4xl font-black italic leading-none" style={{ color: accentColor }}>{overall}</span>
                        <span className="text-[8px] font-black uppercase tracking-widest mt-0.5" style={{ color: accentColor + 'aa' }}>{tier}</span>
                      </div>

                      {/* Avatar */}
                      <div className="relative mt-4 mb-5">
                        <div className="absolute inset-0 rounded-full blur-2xl opacity-50" style={{ background: glowColor, transform: 'scale(1.3)' }} />
                        <img src={(activePlayer as any).avatar || `https://i.pravatar.cc/150?u=${(activePlayer as any).id}`}
                          alt={(activePlayer as any).name}
                          className="relative w-36 h-36 rounded-full object-cover bg-black border-[3px]"
                          style={{ borderColor: accentColor + '50' }} />
                        {isMySlot && (
                          <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-[#39FF14] flex items-center justify-center shadow-[0_0_12px_rgba(57,255,20,0.8)]">
                            <Shield size={14} className="text-black" />
                          </div>
                        )}
                        {/* Pozisyon badge */}
                        <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 font-black uppercase tracking-widest text-[9px] px-4 py-1.5 rounded-full border border-black/10"
                          style={{ background: `linear-gradient(90deg, ${gradFrom}, ${isGold ? '#D1A119' : isSilver ? '#64748B' : '#7C4318'})`, color: isGold || isSilver ? '#000' : '#fff' }}>
                          { { 'GK': 'KL', 'DEF': 'SAV', 'MID': 'ORT', 'FWD': 'HÜC' }[normalizeRole((activePlayer as any).position || activePlayerSlot?.role || '')] || 'ORT' }
                        </div>
                      </div>

                      {/* İsim */}
                      <h3 className="text-2xl font-black text-white uppercase tracking-tight italic text-center mt-3 mb-5 drop-shadow-lg">
                        {(activePlayer as any).name || 'Oyuncu'}
                      </h3>

                      {/* Diamond Serveti */}
                      <div className="w-full rounded-2xl border border-white/5 bg-black/60 backdrop-blur-md p-4 flex flex-col items-center gap-2 relative overflow-hidden mb-4">
                        <div className="absolute inset-0" style={{
                          background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 50%, transparent 100%)',
                          animation: 'shimmer 2s infinite',
                        }} />
                        <span className="text-[9px] font-black uppercase tracking-[0.25em] text-white/40">Kariyer Serveti</span>
                        <div className="flex items-center gap-2.5">
                          <Diamond className="w-7 h-7 drop-shadow-[0_0_14px_rgba(0,242,254,0.9)] animate-pulse" style={{ color: '#00f2fe' }} />
                          <span className="text-3xl font-black text-white tabular-nums tracking-tighter">
                            {getDiamondValue(activePlayer).toLocaleString('tr-TR')}
                          </span>
                        </div>
                      </div>

                      {/* Mini İstatistikler */}
                      <div className="grid grid-cols-3 gap-2 w-full">
                        {[
                          { label: 'OVERALL', val: `${overall}` },
                          { label: 'FAIR PLAY', val: `%${fp}` },
                          { label: 'POZİSYON', val: { 'GK': 'KL', 'DEF': 'SAV', 'MID': 'ORT', 'FWD': 'HÜC' }[normalizeRole(activePlayerSlot?.role || '')] || 'ORT' },
                        ].map(stat => (
                          <div key={stat.label} className="bg-white/[0.04] rounded-xl p-2.5 text-center border border-white/5">
                            <span className="block text-[7px] font-black text-white/30 uppercase tracking-widest mb-1">{stat.label}</span>
                            <span className="text-xs font-black text-white/90">{stat.val}</span>
                          </div>
                        ))}
                      </div>

                      {/* Kapora ve Ödeme Bölümü */}
                      <div className="w-full mt-4 p-4 rounded-2xl bg-black/40 border border-white/5 flex flex-col gap-3 relative overflow-hidden">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">KAPORA DURUMU</span>
                          {activePlayer.paymentStatus === 'PAID' ? (
                            <span className="text-[#39FF14] text-[9px] font-black tracking-wider bg-[#39FF14]/10 border border-[#39FF14]/20 px-2.5 py-1 rounded-full uppercase flex items-center gap-1 shadow-[0_0_10px_rgba(57,255,20,0.15)]">
                              <CheckCircle2 size={10} /> TAMAMLANDI
                            </span>
                          ) : (
                            <span className="text-amber-500 text-[9px] font-black tracking-wider bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-full uppercase flex items-center gap-1">
                              <Clock size={10} /> BEKLENİYOR (50 ₺)
                            </span>
                          )}
                        </div>

                        {activePlayer.id === currentUserProfile.id && activePlayer.paymentStatus !== 'PAID' && (
                          <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={async () => {
                              try {
                                setIsProcessing(true);
                                const { error } = await supabase.rpc('pay_public_match_deposit', {
                                  p_match_id: match.id,
                                  p_user_id: currentUserProfile.id,
                                  p_amount: 50
                                });

                                if (error) throw error;

                                // Oyuncunun ev mi deplasman mı takımında olduğunu belirle
                                const isInAwaySlot = (match.awaySlots || []).some(
                                  s => s?.player?.id === currentUserProfile.id
                                );

                                const markPaid = (slots: typeof match.slots) =>
                                  (slots || []).map(s =>
                                    s?.player?.id === currentUserProfile.id
                                      ? { ...s, player: { ...s.player!, paymentStatus: 'PAID' as const } }
                                      : s
                                  );

                                const updatedSlots = isInAwaySlot
                                  ? (match.slots || [])
                                  : markPaid(match.slots);
                                const updatedAwaySlots = isInAwaySlot
                                  ? markPaid(match.awaySlots)
                                  : (match.awaySlots || []);

                                const nextStatus = checkAndGetStatus(updatedSlots, updatedAwaySlots);
                                await updateMatch({
                                  ...match,
                                  slots: updatedSlots,
                                  awaySlots: updatedAwaySlots,
                                  status: nextStatus
                                });
                                setActivePlayerSlotId(null);
                                showActionSuccess('Kapora ödemesi başarıyla gerçekleştirildi! ⚽');
                              } catch (e: any) {
                                console.error(e);
                                showActionError('Ödeme sırasında bir hata oluştu. Lütfen bakiyenizi kontrol edin.');
                              } finally {
                                setIsProcessing(false);
                              }
                            }}
                            className="w-full py-3 rounded-xl bg-[#39FF14] text-black font-black text-xs uppercase tracking-widest shadow-[0_0_20px_rgba(57,255,20,0.4)] transition-all flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer"
                          >
                            <DollarSign size={13} />
                            <span>KAPORAYI ÖDE (50 ₺)</span>
                          </motion.button>
                        )}
                      </div>

                      {/* Kaptan Çıkarma */}
                      {isCaptain && !isMySlot && (
                        <button onClick={() => {
                          setRemoveConfirmSlot(activePlayerSlot);
                          setActivePlayerSlotId(null);
                        }}
                          className="mt-5 w-full py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest text-red-400 bg-red-950/30 border border-red-500/15 active:scale-95 transition-all">
                          KADRODAN ÇIKAR
                        </button>
                      )}

                      {/* Slottan Ayrıl */}
                      {isMySlot && (
                        <button onClick={() => {
                          setActivePlayerSlotId(null);
                          setShowLeaveConfirm(true);
                        }}
                          className="mt-5 w-full py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest text-red-500 bg-red-500/10 border border-red-500/20 hover:border-red-500/40 hover:bg-red-500/20 active:scale-95 transition-all shadow-[0_0_15px_rgba(239,68,68,0.15)]">
                          SLOTTAN AYRIL
                        </button>
                      )}
                    </div>
                  </div>
                );
              })()}

              <button onClick={() => setActivePlayerSlotId(null)}
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/70 hover:bg-white/20 transition-colors backdrop-blur-md z-10">
                <X size={16} />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Maçtan Ayrıl Onay Modalı ────────────────────────────────────────── */}
      <AnimatePresence>
        {showLeaveConfirm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-md flex items-center justify-center p-6">
            <motion.div
              initial={{ scale: 0.9, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 20, opacity: 0 }}
              className="bg-[#161B22] border border-red-500/30 w-full max-w-sm rounded-[32px] p-6 shadow-[0_0_50px_rgba(239,68,68,0.2)] text-center">
              
              <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
                <AlertCircle size={32} className="text-red-500" />
              </div>
              
              <h3 className="text-xl font-black text-white italic uppercase tracking-tighter mb-2">
                {isAlreadyJoinedReserve ? 'Yedeklikten Ayrıl' : 'Maçtan Ayrıl'}
              </h3>
              
              <p className="text-sm text-gray-400 mb-6">
                {isAlreadyJoinedReserve 
                  ? 'Yedek listesinden çıkmak istediğinize emin misiniz?' 
                  : 'Maçtan ayrılmak istediğinize emin misiniz? Kadrodaki yeriniz boşaltılacaktır.'}
              </p>
              
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowLeaveConfirm(false)}
                  disabled={isProcessing}
                  className="flex-1 py-3 rounded-2xl font-black text-sm uppercase tracking-widest text-white bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
                  İPTAL
                </button>
                <button 
                  onClick={isAlreadyJoinedReserve ? handleLeaveReserves : handleLeaveMatch}
                  disabled={isProcessing}
                  className="flex-1 py-3 rounded-2xl font-black text-sm uppercase tracking-widest text-white bg-red-600 shadow-[0_0_20px_rgba(239,68,68,0.4)] hover:bg-red-500 transition-colors flex items-center justify-center">
                  {isProcessing ? <Loader2 size={18} className="animate-spin" /> : 'AYRIL'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Kaptanın Oyuncuyu Çıkarma Onay Modalı ────────────────────────────────── */}
      <AnimatePresence>
        {removeConfirmSlot && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-md flex items-center justify-center p-6">
            <motion.div
              initial={{ scale: 0.9, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 20, opacity: 0 }}
              className="bg-[#161B22] border border-red-500/30 w-full max-w-sm rounded-[32px] p-6 shadow-[0_0_50px_rgba(239,68,68,0.2)] text-center">
              
              <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
                <AlertCircle size={32} className="text-red-500" />
              </div>
              
              <h3 className="text-xl font-black text-white italic uppercase tracking-tighter mb-2">
                Kadrodan Çıkar
              </h3>
              
              <p className="text-sm text-gray-400 mb-6 font-semibold">
                <strong>{removeConfirmSlot.player?.name}</strong> isimli oyuncuyu kadrodan çıkarmak istediğinize emin misiniz?
              </p>
              
              <div className="flex gap-3">
                <button 
                  onClick={() => setRemoveConfirmSlot(null)}
                  className="flex-1 py-3 rounded-2xl font-black text-sm uppercase tracking-widest text-white bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
                  İPTAL
                </button>
                <button 
                  onClick={async () => {
                    if (!removeConfirmSlot) return;
                    setIsProcessing(true);
                    await handleRemovePlayer(removeConfirmSlot.id);
                    setRemoveConfirmSlot(null);
                    setIsProcessing(false);
                  }}
                  disabled={isProcessing}
                  className="flex-1 py-3 rounded-2xl font-black text-sm uppercase tracking-widest text-white bg-red-600 shadow-[0_0_20px_rgba(239,68,68,0.4)] hover:bg-red-500 transition-colors flex items-center justify-center">
                  {isProcessing ? <Loader2 size={18} className="animate-spin" /> : 'ÇIKAR'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Boş Slota Tıklama Karar Modalı (Kendim Katıl / Arkadaş Davet Et) ─────────────────────── */}
      <AnimatePresence>
        {openSlotActionSlot && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-6">
            <motion.div
              initial={{ scale: 0.9, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, y: 20, opacity: 0 }}
              className="bg-[#161B22] border border-[#39FF14]/30 w-full max-w-sm rounded-[32px] p-6 shadow-[0_0_50px_rgba(57,255,20,0.15)] text-center">
              
              <div className="w-16 h-16 rounded-full bg-[#39FF14]/10 border border-[#39FF14]/20 flex items-center justify-center mx-auto mb-4">
                <UserPlus size={32} className="text-[#39FF14]" />
              </div>
              
              <h3 className="text-xl font-black text-white italic uppercase tracking-tighter mb-2">
                Pozisyon Seçimi
              </h3>
              
              <p className="text-sm text-gray-400 mb-6">
                <strong>{ { 'GK': 'Kaleci (KL)', 'DEF': 'Savunma (SAV)', 'MID': 'Orta Saha (ORT)', 'FWD': 'Hücum (HÜC)' }[normalizeRole(openSlotActionSlot.role)] || 'Orta Saha (ORT)' }</strong> pozisyonu için bir işlem seçin:
              </p>
              
              <div className="space-y-3">
                <button 
                  onClick={() => {
                    setSelectedSlotId(openSlotActionSlot.id);
                    setOpenSlotActionSlot(null);
                  }}
                  className="w-full py-3.5 rounded-2xl font-black text-sm uppercase tracking-widest text-black bg-[#39FF14] hover:bg-[#32dd10] transition-colors shadow-[0_0_20px_rgba(57,255,20,0.3)]">
                  KENDİM KATILACAĞIM
                </button>
                <button 
                  onClick={() => {
                    setInviteModalSlotId(openSlotActionSlot.id);
                    setFriendSearch('');
                    setOpenSlotActionSlot(null);
                  }}
                  className="w-full py-3.5 rounded-2xl font-black text-sm uppercase tracking-widest text-white bg-white/5 border border-white/10 hover:bg-white/10 transition-colors">
                  ARKADAŞIMI DAVET ET
                </button>
                <button 
                  onClick={() => setOpenSlotActionSlot(null)}
                  className="w-full py-3.5 rounded-2xl font-black text-sm uppercase tracking-widest text-white/50 hover:text-white transition-colors pt-2">
                  İPTAL
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Arkadaş Davet Modalı ──────────────────────────────────────────── */}
      <AnimatePresence>
        {inviteModalSlotId && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/90 backdrop-blur-2xl flex flex-col">
            <div className="flex-1 overflow-y-auto">
              {/* Modal Header */}
              <div className="sticky top-0 bg-[#0A0E14]/95 backdrop-blur-xl border-b border-white/5 px-6 pt-14 pb-5 z-10">
                <div className="flex justify-between items-start mb-5">
                  {(() => {
                    const isAway = (match.awaySlots || []).some(s => s?.id === inviteModalSlotId);
                    return (
                      <div>
                        <h2 className="text-xl font-black text-white uppercase italic tracking-tight">
                          {isAway ? 'RAKİP OLMAYA DAVET ET' : 'ARKADAŞINI DAVET ET'}
                        </h2>
                        <p className="text-[10px] text-[#39FF14] font-bold uppercase tracking-widest mt-1">
                          {isAway ? 'Deplasman Kadrosuna Çağır' : 'Boş Pozisyona Çağır'}
                        </p>
                      </div>
                    );
                  })()}
                  <button onClick={() => { setInviteModalSlotId(null); setFriendSearch(''); setInviteCategory('Tümü'); }}
                    className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:bg-white/10">
                    <X size={18} />
                  </button>
                </div>
                {/* Arama */}
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" size={16} />
                  <input type="text" value={friendSearch} onChange={e => setFriendSearch(e.target.value)}
                    placeholder="Arkadaş ara..."
                    className="w-full bg-[#161B22] border border-white/10 rounded-2xl pl-11 pr-4 py-3.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#39FF14]/50 transition-colors" />
                </div>
              </div>

              <div className="px-6 py-4 max-w-lg mx-auto w-full">

                {/* Kategori Sekmeleri */}
                <div className="flex gap-2 mb-4 overflow-x-auto custom-scrollbar pb-2">
                  {['Tümü', 'Favorilerim', 'Lise Tayfası', 'Üniversite', 'İş Arkadaşları'].map(cat => (
                    <button 
                      key={cat}
                      onClick={() => setInviteCategory(cat)}
                      className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                        inviteCategory === cat 
                          ? (cat === 'Favorilerim' ? 'bg-[#FFFF00] text-black shadow-[0_0_15px_rgba(255,255,0,0.3)]' : 'bg-[#39FF14] text-black shadow-[0_0_15px_rgba(57,255,20,0.3)]')
                          : 'bg-white/5 text-white/50 border border-white/10 hover:bg-white/10'
                      }`}
                    >
                      {cat === 'Favorilerim' && <Star size={10} fill={inviteCategory === cat ? "black" : "currentColor"} />}
                      {cat}
                    </button>
                  ))}
                </div>

                {/* Çevrimiçi Arkadaşlar */}
                {onlineFriends.length > 0 && (
                  <div className="mb-5">
                    <div className="flex items-center gap-2 mb-3">
                      <Wifi size={12} className="text-[#39FF14]" />
                      <span className="text-[9px] font-black text-[#39FF14] uppercase tracking-[0.2em]">ÇEVRİMİÇİ — {onlineFriends.length}</span>
                    </div>
                    <div className="space-y-2">
                      {onlineFriends.map(friend => (
                        <FriendInviteRow key={(friend as any).id} friend={friend} onInvite={() => handleInviteFriend(friend)} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Çevrimdışı Arkadaşlar */}
                {offlineFriends.length > 0 && (
                  <div className="mb-5">
                    <div className="flex items-center gap-2 mb-3">
                      <WifiOff size={12} className="text-white/30" />
                      <span className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em]">ÇEVRİMDIŞI — {offlineFriends.length}</span>
                    </div>
                    <div className="space-y-2">
                      {offlineFriends.map(friend => (
                        <FriendInviteRow key={(friend as any).id} friend={friend} onInvite={() => handleInviteFriend(friend)} />
                      ))}
                    </div>
                  </div>
                )}

                {filteredFriends.length === 0 && (
                  <div className="text-center py-12">
                    <Users size={28} className="text-white/20 mx-auto mb-3" />
                    <p className="text-xs text-white/30 font-bold uppercase tracking-widest">Arkadaş Bulunamadı</p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Rakip Ekle (Meydan Okuma) Modalı ────────────────────────────────── */}
      <AnimatePresence>
        {showOpponentModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end justify-center"
            onClick={() => setShowOpponentModal(false)}
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
                  <h3 className="text-xl font-black text-white italic uppercase tracking-tighter">Rakip Meydan Okuma</h3>
                  <p className="text-[9px] text-[#FFFF00] font-black uppercase tracking-widest mt-0.5">
                    Aktif kulüplere maç daveti gönder
                  </p>
                </div>
                <button 
                  onClick={() => setShowOpponentModal(false)} 
                  className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-white/50 hover:bg-white/10"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1 custom-scrollbar">
                {(userTeams || [])
                  .filter(t => t.id !== homeTeam?.id)
                  .map(t => {
                    const winRate = t.wins + t.losses > 0 ? Math.round((t.wins / (t.wins + t.losses)) * 100) : 50;
                    return (
                      <div
                        key={t.id}
                        className="bg-black/30 border border-white/5 p-4 rounded-2xl flex items-center gap-4 transition-all hover:border-white/10"
                      >
                        <div className="w-12 h-12 bg-white/5 rounded-xl border border-white/10 flex items-center justify-center text-2xl relative shadow-inner overflow-hidden">
                          {t.logo ? (
                            t.logo.startsWith('http') ? (
                              <img src={t.logo} alt={t.name} className="w-full h-full object-cover" />
                            ) : (
                              t.logo
                            )
                          ) : (
                            '🛡️'
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-black text-white uppercase tracking-tight truncate">{t.name}</h4>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[8px] font-black text-[#FFFF00] bg-[#FFFF00]/10 border border-[#FFFF00]/20 px-1.5 py-0.5 rounded uppercase">OVR {t.teamValue ? Math.round(parseInt(t.teamValue)/1000) : 80}</span>
                            <span className="text-[8px] font-black text-white/40 uppercase">% {winRate} WR</span>
                          </div>
                        </div>
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={async () => {
                            try {
                              // Initialize away slots
                              const awaySlots = (t.roster || []).map((p, index) => ({
                                id: `away_${index}`,
                                role: p.position || 'OYUNCU',
                                x: p.x || 50,
                                y: p.y || 50,
                                status: 'TAKEN' as const,
                                player: p
                              }));
                              await updateMatch({ ...match, awayTeamId: t.id, awaySlots });
                              addUserNotification({
                                id: `chal_${t.id}_${Date.now()}`,
                                type: 'challenge',
                                title: '⚡ Meydan Okuma Kabul Edildi',
                                desc: `"${t.name}" takımı meydan okumanızı kabul etti! Derbi zamanı!`,
                                time: 'Az önce',
                                iconName: 'Shield',
                                color: '#FF007F',
                                textColor: '#FF007F',
                                read: false,
                              });
                              setShowOpponentModal(false);
                              showActionSuccess(`${t.name} takımına meydan okuma daveti gönderildi!`);
                            } catch (err) {
                              console.error(err);
                              showActionError('Meydan okuma daveti gönderilemedi. Lütfen tekrar dene.');
                            } finally {
                              setIsProcessing(false);
                            }
                          }}
                          className="px-3 py-2 rounded-xl bg-pink-600 text-white font-black text-[10px] uppercase tracking-widest shadow-[0_0_15px_rgba(236,72,153,0.3)] hover:bg-pink-500 active:scale-95 transition-all"
                        >
                          Meydan Oku
                        </motion.button>
                      </div>
                    );
                  })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Rakip Olarak Katıl Modalı ──────────────────────────────────────── */}
      <AnimatePresence>
        {showJoinOpponentModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end justify-center"
            onClick={() => setShowJoinOpponentModal(false)}
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
                  <h3 className="text-xl font-black text-white italic uppercase tracking-tighter">Rakip Olarak Katıl</h3>
                  <p className="text-[9px] text-[#00F2FE] font-black uppercase tracking-widest mt-0.5">
                    Kendi kulübünü deplasman takımı olarak ata
                  </p>
                </div>
                <button 
                  onClick={() => setShowJoinOpponentModal(false)} 
                  className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-white/50 hover:bg-white/10"
                >
                  <X size={18} />
                </button>
              </div>

              {(!myTeams || myTeams.length === 0) ? (
                <div className="text-center py-10 space-y-3">
                  <Shield size={36} className="text-white/20 mx-auto" />
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Kayıtlı takımınız bulunmamaktadır.</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                  {myTeams.map(t => (
                    <button
                      key={t.id}
                      onClick={async () => {
                        try {
                          // Initialize away slots
                          const awaySlots = (t.roster || []).map((p, index) => ({
                            id: `away_${index}`,
                            role: p.position || 'OYUNCU',
                            x: p.x || 50,
                            y: p.y || 50,
                            status: 'TAKEN' as const,
                            player: p
                          }));
                          await updateMatch({ ...match, awayTeamId: t.id, awaySlots });
                          addUserNotification({
                            id: `join_opp_${t.id}_${Date.now()}`,
                            type: 'join',
                            title: '⚽ Deplasman Takımı Katıldı',
                            desc: `"${t.name}" takımınız bu maça rakip olarak katıldı!`,
                            time: 'Az önce',
                            iconName: 'Users',
                            color: '#00F2FE',
                            textColor: '#00F2FE',
                            read: false,
                          });
                          setShowJoinOpponentModal(false);
                          showActionSuccess(`Takımınız (${t.name}) başarıyla maça rakip olarak kaydedildi!`);
                        } catch (err) {
                          console.error(err);
                          showActionError('Takımınız maça kaydedilemedi. Lütfen tekrar dene.');
                        } finally {
                          setIsProcessing(false);
                        }
                      }}
                      className="w-full bg-black/30 border border-white/5 hover:border-[#00F2FE]/30 p-4 rounded-2xl flex items-center gap-4 text-left active:scale-[0.98] transition-all group"
                    >
                      <div className="w-12 h-12 bg-white/5 rounded-xl border border-white/10 flex items-center justify-center text-2xl shadow-inner group-hover:border-[#00F2FE]/40 transition-colors overflow-hidden">
                        {t.logo ? (
                          t.logo.startsWith('http') ? (
                            <img src={t.logo} alt={t.name} className="w-full h-full object-cover" />
                          ) : (
                            t.logo
                          )
                        ) : (
                          '🛡️'
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-black text-white uppercase tracking-tight truncate">{t.name}</h4>
                        <span className="text-[10px] text-gray-500 font-bold block mt-0.5">{t.wins || 0} Galibiyet · {t.losses || 0} Mağlubiyet</span>
                      </div>
                      <div className="w-7 h-7 rounded-full bg-[#00F2FE]/10 border border-[#00F2FE]/20 flex items-center justify-center text-[#00F2FE] group-hover:bg-[#00F2FE] group-hover:text-black transition-all">
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

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 bg-[#0A0E14]/90 backdrop-blur-2xl border-b border-white/5 shadow-[0_4px_30px_rgba(0,0,0,0.4)]">
        {/* Navigasyon Satırı */}
        <div className="flex items-center gap-3 px-5 pt-safe pt-2 pb-3">
          <button onClick={onBack}
            className="w-9 h-9 flex items-center justify-center bg-white/5 rounded-full border border-white/10 text-white hover:bg-white/10 active:scale-90 transition-all">
            <ArrowLeft size={17} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-[15px] font-black text-white italic uppercase tracking-tighter leading-tight truncate">
              Maç Lobisi
            </h1>
            <p className="text-[9px] text-white/40 font-bold uppercase tracking-[0.2em] mt-0.5 truncate">
              {match.title || 'Maç Detayı'}
            </p>
          </div>
          {/* Sağ Aksiyon: Doluluk Göstergesi veya Maçtan Ayrıl Butonu */}
          {(isAlreadyJoined || isAlreadyJoinedReserve) ? (
            <button 
              onClick={() => setShowLeaveConfirm(true)}
              className="px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-500 text-[10px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-colors">
              {isAlreadyJoinedReserve ? 'Yedeklikten Ayrıl' : 'Maçtan Ayrıl'}
            </button>
          ) : (
            <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full">
              <Users size={11} className="text-white/50" />
              <span className="text-[10px] font-black text-white/80">{takenSlots}/{totalSlots}</span>
            </div>
          )}
        </div>

        {/* ── Minimalist Maç Başlığı ── */}
        <div className="px-4 pb-3">
          {/* VS Şeridi */}
          <div className="flex items-stretch gap-1.5 mb-2">
            {/* Ev Sahibi */}
            <button
              onClick={() => setPitchSide('home')}
              className={`flex-1 flex items-center gap-2 px-4 py-3.5 rounded-xl border transition-all active:scale-[0.97] ${
                pitchSide === 'home'
                  ? 'bg-white/8 border-white/25'
                  : 'bg-transparent border-white/5 opacity-55'
              }`}
            >
              <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${homeTeam ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-white shadow-[0_0_6px_rgba(255,255,255,0.6)]'}`} />
              <p className="text-[13px] font-black text-white uppercase italic tracking-tight truncate leading-tight flex-1 min-w-0 text-left">
                {match.homeTeamName || homeTeam?.name || 'TAKIM'}
              </p>
              {homeTeam?.logo && (
                <div className="w-7 h-7 rounded-lg shrink-0 overflow-hidden">
                  {homeTeam.logo.startsWith('http')
                    ? <img src={homeTeam.logo} alt={homeTeam.name} className="w-full h-full object-cover" />
                    : <span className="text-sm">{homeTeam.logo}</span>}
                </div>
              )}
            </button>

            {/* Divider */}
            <div className="flex items-center justify-center w-6 shrink-0">
              <div className="w-px h-7 bg-white/10" />
            </div>

            {/* Deplasman */}
            <button
              onClick={() => setPitchSide('away')}
              className={`flex-1 flex items-center gap-2 px-4 py-3.5 rounded-xl border transition-all active:scale-[0.97] ${
                pitchSide === 'away'
                  ? 'bg-red-500/8 border-red-500/25'
                  : 'bg-transparent border-white/5 opacity-55'
              }`}
            >
              {awayTeam?.logo && (
                <div className="w-7 h-7 rounded-lg shrink-0 overflow-hidden">
                  {awayTeam.logo.startsWith('http')
                    ? <img src={awayTeam.logo} alt={awayTeam.name} className="w-full h-full object-cover" />
                    : <span className="text-sm">{awayTeam.logo}</span>}
                </div>
              )}
              <p className={`text-[13px] font-black uppercase italic tracking-tight truncate leading-tight flex-1 min-w-0 text-right ${
                (match.awayTeamName || awayTeam?.name) ? 'text-white' : 'text-red-400'
              }`}>
                {match.awayTeamName || awayTeam?.name || 'TAKIM'}
              </p>
              <div className="w-2.5 h-2.5 rounded-full shrink-0 bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.8)]" />
            </button>
          </div>

          {/* Bilgi + Badge Şeridi */}
          <div className="flex items-center gap-2 mb-2">
            <button onClick={() => setShowMapModal(true)}
              className="flex items-center gap-1 text-[10px] font-bold text-white/50 hover:text-[#39FF14] transition-colors min-w-0 flex-1">
              <MapPin size={9} className="text-[#39FF14] shrink-0" />
              <span className="truncate">{match.location || 'Konum'}</span>
            </button>
            <div className="flex items-center gap-1 text-[10px] font-bold text-white/40 shrink-0">
              <Calendar size={9} />
              <span>{match.date || '—'}</span>
              <span className="text-white/20">•</span>
              <Clock size={9} />
              <span>{match.time || '—'}</span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <span className="px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase border"
                style={{ color: diffConf.color, borderColor: diffConf.color + '40', background: diffConf.color + '12' }}>
                {diffConf.label}
              </span>
              <span className="px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase text-white/70 bg-white/8 border border-white/10">
                {squadSize.toUpperCase()}
              </span>
            </div>
          </div>

          {/* Kurallar Butonu */}
          <button
            onClick={() => setShowInfoModal(true)}
            className="w-full flex items-center justify-between gap-2 py-2 px-3 rounded-xl bg-white/4 border border-white/8 hover:border-white/20 transition-all active:scale-[0.98] cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Info size={11} className="text-white/40" />
              <span className="text-[10px] font-black uppercase tracking-widest text-white/50">Maç Kuralları & Finans</span>
            </div>
            <ChevronRight size={11} className="text-white/30" />
          </button>
        </div>
      </header>

      {/* ── MAIN CONTENT ───────────────────────────────────────────────────── */}
      <main className="flex-1 px-4 overflow-y-auto custom-scrollbar pb-36 pt-4">

        {/* Lobi Sekme Seçici */}
        {/* ── CANLI MAÇ — Skor Girişi Paneli ─────────────────────────────── */}
        {match.status === 'LIVE' && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-br from-red-950/60 to-orange-950/40 border border-red-500/25 rounded-2xl p-4 mb-4"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-[10px] font-black text-red-400 uppercase tracking-widest">Canlı Maç</span>
              </div>
              {isCaptain && !match.scoreEnteredAt && (
                <span className="text-[9px] text-gray-500">Kaptan olarak skor girebilirsin</span>
              )}
              {match.scoreEnteredAt && (
                <span className="text-[9px] text-emerald-500">✓ Skor kaydedildi</span>
              )}
            </div>

            {/* Skor satırı */}
            <div className="flex items-center justify-center gap-6">
              {/* Ev takımı */}
              <div className="flex-1 text-center">
                <p className="text-[9px] text-gray-500 uppercase mb-1 truncate">
                  {(homeTeam as any)?.name || 'EV'}
                </p>
                {isCaptain && !match.scoreEnteredAt ? (
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={() => setScoreEntry(p => ({ ...p, home: Math.max(0, p.home - 1) }))}
                      className="w-7 h-7 rounded-full bg-white/10 text-white font-black text-lg flex items-center justify-center active:scale-95"
                    >−</button>
                    <span className="text-3xl font-black tabular-nums w-10 text-center text-white">{scoreEntry.home}</span>
                    <button
                      onClick={() => setScoreEntry(p => ({ ...p, home: p.home + 1 }))}
                      className="w-7 h-7 rounded-full bg-white/10 text-white font-black text-lg flex items-center justify-center active:scale-95"
                    >+</button>
                  </div>
                ) : (
                  <p className="text-3xl font-black text-white">{match.homeScore ?? 0}</p>
                )}
              </div>

              <span className="text-gray-600 font-black text-2xl">–</span>

              {/* Deplasman takımı */}
              <div className="flex-1 text-center">
                <p className="text-[9px] text-gray-500 uppercase mb-1 truncate">
                  {(awayTeam as any)?.name || 'DEP'}
                </p>
                {isCaptain && !match.scoreEnteredAt ? (
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={() => setScoreEntry(p => ({ ...p, away: Math.max(0, p.away - 1) }))}
                      className="w-7 h-7 rounded-full bg-white/10 text-white font-black text-lg flex items-center justify-center active:scale-95"
                    >−</button>
                    <span className="text-3xl font-black tabular-nums w-10 text-center text-white">{scoreEntry.away}</span>
                    <button
                      onClick={() => setScoreEntry(p => ({ ...p, away: p.away + 1 }))}
                      className="w-7 h-7 rounded-full bg-white/10 text-white font-black text-lg flex items-center justify-center active:scale-95"
                    >+</button>
                  </div>
                ) : (
                  <p className="text-3xl font-black text-white">{match.awayScore ?? 0}</p>
                )}
              </div>
            </div>

            {/* Tamamla butonu — sadece kaptan, skor girilmemişse */}
            {isCaptain && !match.scoreEnteredAt && (
              <motion.button
                whileTap={{ scale: 0.98 }}
                disabled={isProcessing}
                onClick={async () => {
                  try {
                    setIsProcessing(true);
                    await updateMatch({
                      ...match,
                      homeScore: scoreEntry.home,
                      awayScore: scoreEntry.away,
                      scoreEnteredAt: new Date().toISOString(),
                      status: 'COMPLETED',
                    });
                    showActionSuccess(`Maç tamamlandı! ${scoreEntry.home}–${scoreEntry.away} ⚽`);
                  } catch {
                    showActionError('Skor kaydedilemedi. Tekrar dene.');
                  } finally {
                    setIsProcessing(false);
                  }
                }}
                className="mt-3 w-full py-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-red-500/25 transition-colors"
              >
                {isProcessing && <Loader2 size={12} className="animate-spin" />}
                MAÇI TAMAMLA ({scoreEntry.home}–{scoreEntry.away})
              </motion.button>
            )}
          </motion.div>
        )}

        <div className="flex bg-[#161B22]/80 backdrop-blur-md rounded-2xl border border-white/5 p-1 mb-4">
          <button
            onClick={() => setLobbyTab('squad')}
            className={`flex-1 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all cursor-pointer ${
              lobbyTab === 'squad'
                ? 'bg-[#39FF14] text-black shadow-[0_0_15px_rgba(57,255,20,0.3)]'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            KADRO / DİZİLİŞ
          </button>
          <button
            onClick={() => setLobbyTab('chat')}
            className={`flex-1 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all cursor-pointer relative ${
              lobbyTab === 'chat'
                ? 'bg-[#39FF14] text-black shadow-[0_0_15px_rgba(57,255,20,0.3)]'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            LOBİ SOHBETİ
            {match.chatMessages && match.chatMessages.length > 0 && lobbyTab !== 'chat' && (
              <span className="absolute top-1.5 right-3 w-2.5 h-2.5 rounded-full bg-[#39FF14] animate-ping" />
            )}
          </button>
        </div>

        {lobbyTab === 'chat' ? (
          /* ── LOBİ SOHBETİ SEKME İÇERİĞİ ───────────────────────────────── */
          <div className="bg-[#161B22]/80 border border-white/5 rounded-3xl shadow-[0_15px_40px_rgba(0,0,0,0.6)] flex flex-col h-[560px] relative overflow-hidden">
            
            {/* ── Geçici Maç Odası Sabit Bilgi Kartı (Pinned Header) ── */}
            <div className="bg-black/60 backdrop-blur-xl border-b border-white/10 p-4 sticky top-0 z-20 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-[#39FF14]/10 border border-[#39FF14]/30 flex items-center justify-center">
                    <MapPin size={14} className="text-[#39FF14]" />
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-white/50 uppercase tracking-widest">Saha Konumu</p>
                    <p className="text-xs font-bold text-white truncate max-w-[180px]">{match.location || 'Oyna Arena'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <p className="text-[9px] font-black text-white/50 uppercase tracking-widest">Tarih & Saat</p>
                    <p className="text-xs font-bold text-[#00F2FE] truncate max-w-[180px]">{match.date} • {match.time}</p>
                  </div>
                  <div className="w-8 h-8 rounded-full bg-[#00F2FE]/10 border border-[#00F2FE]/30 flex items-center justify-center shrink-0">
                    <Clock size={14} className="text-[#00F2FE]" />
                  </div>
                </div>
              </div>
            </div>

            {/* Ambiyans glow */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#39FF14]/5 rounded-full blur-3xl pointer-events-none" />

            {/* Mesaj Listesi */}
            <div className="flex-1 overflow-y-auto space-y-4 p-4 scrollbar-hide">
              {(match.chatMessages && match.chatMessages.length > 0) ? (
                match.chatMessages.map((msg: any) => {
                  const isMe = msg.senderId === currentUserProfile.id;
                  return (
                    <div key={msg.id} className={`flex gap-3 items-start ${isMe ? 'flex-row-reverse' : ''}`}>
                      <img src={msg.senderAvatar} alt={msg.senderName} className="w-8 h-8 rounded-full object-cover border border-white/10" />
                      <div className={`flex flex-col max-w-[70%] ${isMe ? 'items-end' : 'items-start'}`}>
                        <div className="flex items-center gap-1.5 mb-1 px-1">
                          <span className="text-[9px] font-black text-white/50 uppercase tracking-wider">{msg.senderName}</span>
                          <span className="text-[7px] text-white/30 font-semibold">{msg.timestamp}</span>
                        </div>
                        <div className={`p-3.5 rounded-2xl text-xs font-medium leading-relaxed ${
                          isMe 
                            ? 'bg-[#39FF14] text-black rounded-tr-none shadow-[0_0_15px_rgba(57,255,20,0.25)]' 
                            : 'bg-black/50 border border-white/5 text-white/90 rounded-tl-none'
                        }`}>
                          {msg.text}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-3 py-12">
                  <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                    <Send size={20} className="text-white/20" />
                  </div>
                  <p className="text-[11px] font-bold text-white/30 uppercase tracking-widest">Henüz mesaj yok</p>
                  <p className="text-[10px] text-white/20 text-center max-w-[200px] leading-relaxed">Kadrona katılanlarla buradan iletişime geç</p>
                </div>
              )}
            </div>

            {/* Gönderme Alanı */}
            <div className="p-4 bg-black/40 border-t border-white/5 flex gap-2">
              <input
                type="text"
                value={chatInputText}
                onChange={(e) => setChatInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSendChatMessage(chatInputText);
                  }
                }}
                placeholder="Takıma mesaj yaz..."
                className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white placeholder-white/30 focus:outline-none focus:border-[#39FF14]/40"
              />
              <button
                onClick={() => {
                  handleSendChatMessage(chatInputText);
                }}
                className="p-3 bg-[#39FF14] text-black rounded-xl hover:shadow-[0_0_12px_rgba(57,255,20,0.6)] active:scale-95 transition-all flex items-center justify-center cursor-pointer"
              >
                <Send size={15} />
              </button>
            </div>
          </div>
        ) : (
          /* ── KADRO / DİZİLİŞ SEKME İÇERİĞİ ────────────────────────────── */
          <>
            {/* Kadro Durumu Mesajı */}
            {isAlreadyJoined && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                className="mb-4 flex items-center gap-3 bg-[#39FF14]/10 border border-[#39FF14]/20 rounded-2xl px-4 py-3">
                <CheckCircle2 size={16} className="text-[#39FF14] shrink-0" />
                <p className="text-xs font-bold text-[#39FF14]">
                  Kadroya alındın! Boş pozisyonlara <span className="font-black">+</span> basarak arkadaşlarını davet edebilirsin.
                </p>
              </motion.div>
            )}


        {/* ── TAKTİK SAHA ─────────────────────────────────────────────────── */}
        <AnimatePresence mode="wait">
        <motion.div
          key={pitchSide}
          initial={{ opacity: 0, x: pitchSide === 'home' ? -18 : 18 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="mb-6"
        >
          <div className="flex items-center justify-between mb-3 px-1">
            <div className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                pitchSide === 'home'
                  ? 'bg-[#39FF14] shadow-[0_0_8px_rgba(57,255,20,0.9)]'
                  : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.9)]'
              }`} />
              <p className="text-[10px] font-black text-white/50 uppercase tracking-[0.2em]">
                {pitchSide === 'home'
                  ? `${match.homeTeamName || homeTeam?.name || 'TAKIM'} Kadrosu`
                  : `${match.awayTeamName || awayTeam?.name || 'TAKIM'} Kadrosu`}
              </p>
            </div>
            {selectedSlotId && (
              <motion.span initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border animate-pulse ${
                  pitchSide === 'home'
                    ? 'text-[#39FF14] bg-[#39FF14]/10 border-[#39FF14]/30'
                    : 'text-red-500 bg-red-500/10 border-red-500/30'
                }`}>
                Pozisyon Seçildi ✓
              </motion.span>
            )}
          </div>

          {/* Saha Kapsayıcısı */}
          <div className="relative w-full max-w-[380px] mx-auto rounded-[28px] overflow-hidden aspect-[3/4] border-4 border-[#161B22] shadow-[0_0_60px_rgba(0,0,0,0.8),inset_0_0_80px_rgba(0,0,0,0.6)]"
            style={{ background: '#0B2815' }}>

            {/* Çim desen (Studio.tsx stili dikey koyu çizgiler) */}
            <div className="absolute inset-0 opacity-15 pointer-events-none"
              style={{ backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 8%, rgba(0,0,0,0.25) 8%, rgba(0,0,0,0.25) 16%)' }} />
            {/* Radyal ışık */}
            <div className="absolute inset-0 pointer-events-none"
              style={{ background: 'radial-gradient(ellipse at 50% 50%, rgba(57,255,20,0.08) 0%, transparent 75%)' }} />

            {/* Studio ile Aynı SVG Saha Çizgileri (viewBox="0 0 600 1000") */}
            <div className="absolute inset-0 pointer-events-none opacity-30">
              <svg viewBox="0 0 600 1000" preserveAspectRatio="none" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
                <g stroke="rgba(255,255,255,0.8)" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="10" y="10" width="580" height="980" />
                  <line x1="10" y1="500" x2="590" y2="500" />
                  <circle cx="300" cy="500" r="80" />
                  <circle cx="300" cy="500" r="5" fill="rgba(255,255,255,0.8)" />
                  {/* Üst Ceza Sahası */}
                  <rect x="150" y="10" width="300" height="160" />
                  <circle cx="300" cy="130" r="5" fill="rgba(255,255,255,0.8)" />
                  <path d="M 220 170 A 80 80 0 0 0 380 170" />
                  {/* Alt Ceza Sahası */}
                  <rect x="150" y="830" width="300" height="160" />
                  <circle cx="300" cy="870" r="5" fill="rgba(255,255,255,0.8)" />
                  <path d="M 220 830 A 80 80 0 0 1 380 830" />
                  {/* Köşe Yayları */}
                  <path d="M 10 40 A 30 30 0 0 0 40 10" />
                  <path d="M 560 10 A 30 30 0 0 0 590 40" />
                  <path d="M 10 960 A 30 30 0 0 1 40 990" />
                  <path d="M 590 960 A 30 30 0 0 0 560 990" />
                </g>
              </svg>
            </div>

            {/* SLOTLAR — Kanonik Koordinatlarla */}
            {(pitchSide === 'home' ? enrichedSlots : enrichedAwaySlots).map((slot) => {
              if (!slot) return null;
              const isSelected = selectedSlotId === slot.id;
              const isTaken = slot.status === 'TAKEN';
              const isOpen = slot.status === 'OPEN';
              const player = slot.player;
              const isMyOwnSlot = player?.id === currentUserProfile?.id;
              const inviteStatus = invitesSent[slot.id] || 'NONE';
              const invitedName = invitedFriendNames[slot.id];

              return (
                <div
                  key={slot.id}
                  className="absolute w-12 h-12 flex items-center justify-center z-10"
                  style={{ left: `${slot.x}%`, top: `${slot.y}%`, transform: 'translate(-50%, -50%)' }}
                >
                  {isTaken && player ? (
                    /* ── Dolu Slot ──────────────────────────────── */
                    <button
                      onClick={() => handleSlotClick(slot)}
                      className="w-full h-full rounded-full focus:outline-none cursor-pointer"
                    >
                      <motion.div whileHover={{ scale: 1.12 }} whileTap={{ scale: 0.93 }}
                        className="relative w-full h-full flex flex-col items-center justify-center">
                        <div className={`relative w-12 h-12 rounded-full overflow-hidden border-2 shadow-lg transition-all ${
                          isMyOwnSlot
                            ? 'border-[#39FF14] shadow-[0_0_16px_rgba(57,255,20,0.7)]'
                            : normalizeRole(slot.role) === 'GK'
                              ? 'border-orange-400 hover:shadow-[0_0_14px_rgba(249,115,22,0.6)]'
                              : 'border-white/25 hover:border-[#00f2fe] hover:shadow-[0_0_14px_rgba(0,242,254,0.5)]'
                        }`}>
                          <img
                            src={player.avatar || `https://i.pravatar.cc/150?u=${player.id}`}
                            alt={player.name || 'Oyuncu'}
                            className="w-full h-full object-cover bg-[#0A0E14]"
                          />
                          {isMyOwnSlot && (
                            <div className="absolute inset-0 bg-[#39FF14]/10" />
                          )}
                        </div>
                        <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-1.5 bg-black/90 backdrop-blur-sm px-2 py-0.5 rounded-full border border-white/10 shadow-md max-w-[64px] z-20 pointer-events-none">
                          <span className="text-[8px] font-black text-white whitespace-nowrap uppercase truncate block">
                            {isMyOwnSlot ? 'SEN' : (player.name || 'Oyuncu').split(' ')[0]}
                          </span>
                        </div>
                      </motion.div>
                    </button>
                  ) : isOpen ? (
                    inviteStatus === 'INVITED' ? (
                      /* ── Davet Gönderildi Slotu ────────────────── */
                      <button
                        onClick={() => handleSlotClick(slot)}
                        className="w-full h-full rounded-full focus:outline-none cursor-pointer"
                      >
                        <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }}
                          className="relative w-full h-full flex flex-col items-center justify-center">
                          <div className="w-12 h-12 rounded-full border-2 border-orange-400/60 bg-orange-950/40 flex items-center justify-center shadow-[0_0_10px_rgba(251,146,60,0.3)]">
                            <Send size={14} className="text-orange-400" />
                          </div>
                          <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-1.5 bg-black/90 px-1.5 py-0.5 rounded-full border border-orange-400/30 max-w-[64px] z-20 pointer-events-none">
                            <span className="text-[7px] font-black text-orange-400 whitespace-nowrap truncate block">
                              {(invitedName || 'Davet').split(' ')[0]}
                            </span>
                          </div>
                        </motion.div>
                      </button>
                    ) : (
                      /* ── Açık Slot ──────────────────────────────── */
                      <button
                        onClick={() => handleSlotClick(slot)}
                        className="w-full h-full rounded-full focus:outline-none cursor-pointer"
                      >
                        <motion.div
                          whileHover={{ scale: 1.18 }}
                          whileTap={{ scale: 0.88 }}
                          className="relative w-full h-full flex flex-col items-center justify-center"
                        >
                          <div className={`w-12 h-12 rounded-full flex items-center justify-center border-2 shadow-lg transition-all duration-200 relative ${
                            isSelected
                              ? 'bg-[#39FF14] border-white text-black shadow-[0_0_28px_rgba(57,255,20,0.9)] scale-110'
                              : isAlreadyJoined
                                ? 'bg-black/50 border-white/20 text-white/40 hover:border-[#39FF14]/60 hover:bg-[#39FF14]/10 hover:text-[#39FF14] backdrop-blur-md'
                                : 'bg-black/50 border-white/25 text-white/60 hover:border-[#39FF14]/50 backdrop-blur-md'
                          }`}>
                            {isSelected ? (
                              <CheckCircle2 size={20} className="drop-shadow-md" />
                            ) : (
                              <>
                                <span className="text-[10px] font-black uppercase tracking-wider leading-none">
                                  { { 'GK': 'KL', 'DEF': 'SAV', 'MID': 'ORT', 'FWD': 'HÜC' }[normalizeRole(slot.role)] || 'ORT' }
                                </span>
                                <div className={`absolute -top-1 -right-1 w-4.5 h-4.5 rounded-full text-black flex items-center justify-center border border-black shadow-md z-20 ${
                                  isSelected ? 'bg-white' : 'bg-[#39FF14]'
                                }`}>
                                  <Plus size={10} strokeWidth={3} />
                                </div>
                              </>
                            )}
                          </div>
                          <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-1.5 bg-black/70 px-1.5 py-0.5 rounded-full border border-white/10 max-w-[64px] z-20 pointer-events-none">
                            <span className={`text-[7px] font-black uppercase truncate block whitespace-nowrap ${
                              isSelected ? 'text-[#39FF14]' : 'text-white/40'
                            }`}>
                              {isSelected ? 'SEÇİLDİ' : (isAlreadyJoined ? 'DAVET' : 'BOŞ')}
                            </span>
                          </div>
                        </motion.div>
                      </button>
                    )
                  ) : (
                    /* ── Kilitli Slot ───────────────────────────── */
                    <div className="w-12 h-12 rounded-full bg-black/40 border border-white/10 flex items-center justify-center">
                      <X size={14} className="text-white/20" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <p className="text-center text-[9px] text-white/25 font-bold mt-3 uppercase tracking-[0.2em]">
            {isAlreadyJoined
              ? '+ butonuna basarak arkadaşlarını davet et'
              : 'Pozisyona dokun — ardından aşağıdan "Sahaya Çık"'}
          </p>

          {/* Yedek Kulübesi (Reserve List) */}
          <div className="mt-4 bg-[#161B22]/60 border border-white/5 rounded-3xl p-4 max-w-[380px] mx-auto shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
            <div className="flex items-center justify-between mb-3 px-1">
              <span className="text-[8px] font-black text-white/40 uppercase tracking-[0.25em]">
                Yedek Kulübesi ({match.reservePlayers?.length || 0})
              </span>
              {isAlreadyJoinedReserve && (
                <span className="text-[8px] font-black text-[#FFFF00] uppercase tracking-widest animate-pulse">
                  Sıranız: {(match.reservePlayers || []).findIndex(p => p.id === currentUserProfile.id) + 1}
                </span>
              )}
            </div>
            {(!match.reservePlayers || match.reservePlayers.length === 0) ? (
              <p className="text-[9px] text-white/25 italic px-1">Yedek listesinde kimse yok. Sıra boş.</p>
            ) : (
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {match.reservePlayers.map((player, idx) => (
                  <div key={player.id} className="flex flex-col items-center gap-1 shrink-0 bg-black/40 border border-white/5 rounded-2xl p-2.5 min-w-[75px] relative overflow-hidden group">
                    <div className="relative">
                      <img src={player.avatar} alt={player.name} className="w-9 h-9 rounded-full object-cover border border-white/10" />
                      <div className="absolute -bottom-1 -right-1 w-4.5 h-4.5 rounded-full bg-amber-500 border border-black flex items-center justify-center text-[8px] font-black text-black">
                        {idx + 1}
                      </div>
                    </div>
                    <span className="text-[8px] font-bold text-white/70 truncate max-w-[65px]">{player.name.split(' ')[0]}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Taktik / Diziliş Seçimi (Yalnızca Kaptanlara Özel) */}
          {((pitchSide === 'home' && isHomeCaptain) || (pitchSide === 'away' && isAwayCaptain)) && (
            <div className="mt-4 bg-[#161B22]/60 border border-white/5 rounded-3xl p-4 max-w-[380px] mx-auto">
              <span className="block text-[8px] font-black text-white/40 uppercase tracking-[0.25em] mb-2 px-1">
                TAKIM DİZİLİŞİNİ GÜNCELLE
              </span>
              <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
                {Object.keys(FORMATIONS[pitchSide === 'home' ? squadSize : inferSquadSize(match.awaySlots?.length || match.slots.length)] || {}).map(fName => (
                  <button
                    key={fName}
                    onClick={async () => {
                      try {
                        setIsProcessing(true);
                        const sizeVal = pitchSide === 'home' ? squadSize : inferSquadSize(match.awaySlots?.length || match.slots.length);
                        const coords = FORMATIONS[sizeVal]?.[fName];
                        if (coords) {
                          if (pitchSide === 'home') {
                            const updatedSlots = (match.slots || []).map((s, index) => {
                              const coord = coords[index] || { x: 50, y: 50, role: 'MID' };
                              return {
                                ...s,
                                x: coord.x,
                                y: coord.y,
                                role: coord.role,
                                player: s.player ? { ...s.player, position: coord.role, x: coord.x, y: coord.y } : undefined
                              };
                            });
                            await updateMatch({ ...match, slots: updatedSlots });
                          } else {
                            const updatedAwaySlots = (match.awaySlots || []).map((s, index) => {
                              const coord = coords[index] || { x: 50, y: 50, role: 'MID' };
                              return {
                                ...s,
                                x: coord.x,
                                y: coord.y,
                                role: coord.role,
                                player: s.player ? { ...s.player, position: coord.role, x: coord.x, y: coord.y } : undefined
                              };
                            });
                            await updateMatch({ ...match, awaySlots: updatedAwaySlots });
                          }
                          if (navigator.vibrate) navigator.vibrate(30);
                        }
                      } catch (err) {
                        console.error(err);
                        showActionError('Diziliş güncellenemedi. Lütfen tekrar dene.');
                      } finally {
                        setIsProcessing(false);
                      }
                    }}
                    className="px-3 py-1.5 rounded-xl bg-black/40 border border-white/10 hover:border-[#39FF14]/40 text-white hover:text-[#39FF14] text-[10px] font-black uppercase tracking-wider shrink-0 transition-all active:scale-95 cursor-pointer"
                  >
                    {fName}
                  </button>
                ))}
              </div>
            </div>
          )}
        </motion.div>
        </AnimatePresence>

        {/* ── KULÜP VE DESTEK SERVİSLERİ (2x1 Grid) ─────────────────────────── */}
        <div className="space-y-3 mt-6">
          <p className="text-[9px] font-black text-white/40 uppercase tracking-[0.2em] ml-1">Kulüp & Destek Servisleri</p>
          
          <div className="grid grid-cols-2 gap-3">
            {/* Rakip Davet Et */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => {
                const firstOpenAwaySlot = (match.awaySlots || []).find(s => s?.status === 'OPEN');
                if (firstOpenAwaySlot) {
                  setInviteModalSlotId(firstOpenAwaySlot.id);
                  setFriendSearch('');
                } else {
                  showActionError('Deplasman takımında boş pozisyon bulunmuyor.');
                }
              }}
              className="p-4 rounded-2xl bg-[#161B22]/80 border border-white/5 hover:border-pink-500/30 transition-all flex flex-col items-start gap-2.5 text-left relative group overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-12 h-12 bg-gradient-to-bl from-pink-500/10 to-transparent pointer-events-none" />
              <div className="p-2.5 rounded-xl bg-pink-500/10 text-pink-500 border border-pink-500/20 group-hover:shadow-[0_0_12px_rgba(236,72,153,0.4)] transition-all">
                <Shield size={16} />
              </div>
              <div>
                <h4 className="font-black text-xs text-white uppercase tracking-wider">Rakip Davet Et</h4>
                <p className="text-[8px] text-white/40 font-bold mt-0.5 uppercase tracking-wide">Karşı Takıma Çağır</p>
              </div>
            </motion.button>

            {/* Rakip Olarak Katıl */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setShowJoinOpponentModal(true)}
              className="p-4 rounded-2xl bg-[#161B22]/80 border border-white/5 hover:border-[#00F2FE]/30 transition-all flex flex-col items-start gap-2.5 text-left relative group overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-12 h-12 bg-gradient-to-bl from-[#00F2FE]/10 to-transparent pointer-events-none" />
              <div className="p-2.5 rounded-xl bg-[#00F2FE]/10 text-[#00F2FE] border border-[#00F2FE]/20 group-hover:shadow-[0_0_12px_rgba(0,242,254,0.4)] transition-all">
                <Users size={16} />
              </div>
              <div>
                <h4 className="font-black text-xs text-white uppercase tracking-wider">Rakip Katıl</h4>
                <p className="text-[8px] text-white/40 font-bold mt-0.5 uppercase tracking-wide">Deplasman Olarak Gir</p>
              </div>
            </motion.button>
          </div>
        </div>
      </>
    )}
  </main>

      {/* ── DİNAMİK NEON AKSİYON BARI ─────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 w-full z-30 pointer-events-none">
        <div className="pointer-events-auto bg-gradient-to-t from-[#000] via-[#000]/96 to-transparent pt-14 pb-safe pb-4 px-5 border-t border-white/5">
          <div className="max-w-md mx-auto w-full">

            {isAlreadyJoined ? (
              /* ── Zaten Kadroya Girdim: Tamamlandı Görünümü ──────────── */
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className="flex items-center justify-center gap-3 h-16 rounded-[24px] border border-[#39FF14]/20 bg-[#39FF14]/5">
                <CheckCircle2 size={20} className="text-[#39FF14]" />
                <span className="font-black text-sm text-[#39FF14] uppercase tracking-widest">KADRODASIN</span>
              </motion.div>
            ) : isAlreadyJoinedReserve ? (
              /* ── Zaten Yedek Kulübesindeyim ─────────────────────────── */
              (() => {
                const reserveIndex = (match.reservePlayers || []).findIndex(p => p.id === currentUserProfile.id);
                return (
                  <div className="flex gap-3 w-full">
                    <div className="flex-1 flex items-center justify-center gap-2 h-16 rounded-[24px] border border-amber-500/20 bg-amber-500/5">
                      <Clock size={16} className="text-amber-500 animate-pulse" />
                      <span className="font-black text-xs text-amber-500 uppercase tracking-widest">
                        YEDEK LİSTESİNDESİN (SIRA: {reserveIndex + 1})
                      </span>
                    </div>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setShowLeaveConfirm(true)}
                      className="px-6 h-16 rounded-[24px] bg-red-500/10 border border-red-500/20 text-red-500 font-black text-xs uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all cursor-pointer"
                    >
                      AYRIL
                    </motion.button>
                  </div>
                );
              })()
            ) : (() => {
              const activeSlots = pitchSide === 'home' ? (match.slots || []) : (match.awaySlots || []);
              const isActiveSideFull = activeSlots.length > 0 && activeSlots.every(s => s.status === 'TAKEN');
              
              if (isActiveSideFull) {
                return (
                  <motion.button
                    onClick={handleJoinAsReserve}
                    disabled={isProcessing}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="w-full h-16 rounded-[24px] bg-amber-500 text-black font-black text-sm uppercase tracking-[0.2em] flex items-center justify-center gap-2 shadow-[0_0_25px_rgba(245,158,11,0.4)] cursor-pointer"
                  >
                    {isProcessing ? (
                      <Loader2 size={20} className="animate-spin" />
                    ) : (
                      <>
                        <Clock size={18} />
                        <span>KADRO DOLU - YEDEK OLARAK KATIL</span>
                      </>
                    )}
                  </motion.button>
                );
              }

              if (selectedSlotId) {
                if (isCaptain) {
                  return (
                    <div className="flex gap-3">
                      {/* Sahaya Çık */}
                      <motion.button
                        onClick={handleJoin}
                        disabled={isProcessing}
                        animate={{ scale: [1, 1.015, 1] }}
                        transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
                        whileTap={{ scale: 0.95 }}
                        className="w-[60%] h-16 rounded-[22px] font-black text-sm uppercase tracking-[0.15em] flex items-center justify-center gap-2 transition-all text-black cursor-pointer"
                        style={{
                          background: 'linear-gradient(135deg, #FFFF00 0%, #39FF14 100%)',
                          boxShadow: '0 0 35px rgba(57,255,20,0.6), 0 0 70px rgba(255,255,0,0.4), inset 0 1px 0 rgba(255,255,255,0.4)',
                        }}>
                        {isProcessing ? <Loader2 size={18} className="animate-spin" /> : <><span>SAHAYA ÇIK</span><ChevronRight size={17} /></>}
                      </motion.button>
                      {/* Oyuncu Ekle */}
                      <motion.button
                        onClick={() => {
                          setInviteModalSlotId(selectedSlotId);
                        }}
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.95 }}
                        className="w-[40%] h-16 rounded-[22px] font-black text-xs uppercase tracking-[0.1em] flex items-center justify-center gap-1.5 text-white transition-all cursor-pointer"
                        style={{
                          background: 'linear-gradient(135deg, rgba(0,242,254,0.15) 0%, rgba(79,172,254,0.10) 100%)',
                          border: '1px solid rgba(0,242,254,0.3)',
                          boxShadow: '0 0 20px rgba(0,242,254,0.25)',
                        }}>
                        <UserPlus size={15} />
                        <span>OYUNCU</span>
                      </motion.button>
                    </div>
                  );
                }

                return (
                  <motion.button
                    disabled={isProcessing}
                    onClick={handleJoin}
                    animate={{ scale: [1, 1.018, 1] }}
                    transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
                    whileTap={{ scale: 0.95 }}
                    className="w-full h-16 rounded-[24px] font-black text-sm uppercase tracking-[0.2em] flex items-center justify-center gap-3 transition-all duration-400 cursor-pointer"
                    style={{
                      background: 'linear-gradient(135deg, #FFFF00 0%, #39FF14 100%)',
                      boxShadow: '0 0 35px rgba(57,255,20,0.6), 0 0 70px rgba(255,255,0,0.4), inset 0 1px 0 rgba(255,255,255,0.4)',
                      color: '#000',
                      border: 'none',
                    }}>
                    {isProcessing ? (
                      <><Loader2 size={20} className="animate-spin" /><span>KAYIT EDİLİYOR...</span></>
                    ) : (
                      <><span>SAHAYA ÇIK</span><ChevronRight size={20} /></>
                    )}
                  </motion.button>
                );
              }

              // Selected slot is NOT set and squad is NOT full
              return (
                <div className="flex gap-3">
                  <div className="w-[55%] h-16 rounded-[24px] bg-white/[0.02] border border-dashed border-white/20 text-white/40 font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2">
                    <Zap size={13} className="text-white/20" />
                    <span>POZİSYON SEÇ</span>
                  </div>
                  <motion.button
                    onClick={handleJoinAsReserve}
                    disabled={isProcessing}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="w-[45%] h-16 rounded-[24px] border border-[#FFFF00]/30 hover:border-[#FFFF00] bg-black/40 text-[#FFFF00] font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer transition-all shadow-[0_0_15px_rgba(255,255,0,0.05)]"
                  >
                    {isProcessing ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <>
                        <Plus size={14} />
                        <span>YEDEK KATIL</span>
                      </>
                    )}
                  </motion.button>
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* ── MAP MODAL (SAHA KONUMU) ── */}
      <AnimatePresence>
        {showMapModal && pitchCoordinates && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-md bg-[#0A0E14] border border-white/10 rounded-3xl overflow-hidden shadow-2xl relative"
            >
              <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between bg-black/20">
                <h3 className="text-sm font-black text-white italic uppercase flex items-center gap-2">
                  <MapPin size={16} className="text-[#39FF14]" />
                  {match?.location} KONUMU
                </h3>
                <button onClick={() => setShowMapModal(false)} className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-white/50 hover:bg-white/10 transition-colors">
                  <X size={16} />
                </button>
              </div>
              <div className="h-64 relative">
                <style>{AIRBNB_MAP_CSS}</style>
                {pitchCoordinates && (
                  <MapContainer center={pitchCoordinates} zoom={15} className="w-full h-full" zoomControl={false}>
                      <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" attribution="" />
                      <ChangeView center={pitchCoordinates} />
                      <Marker position={pitchCoordinates}>
                          <Popup closeButton={false}>
                              <div className="bg-[#161B22]/90 backdrop-blur-md p-3 rounded-2xl border border-white/10 shadow-xl text-center min-w-[120px]">
                                  <h4 className="text-white font-black text-[10px] uppercase tracking-widest mb-1">{match?.location}</h4>
                                  <a href={`https://www.google.com/maps/dir/?api=1&destination=${pitchCoordinates[0]},${pitchCoordinates[1]}`} target="_blank" rel="noreferrer" className="inline-block mt-2 px-3 py-1.5 bg-[#39FF14]/20 border border-[#39FF14]/50 text-[#39FF14] text-[9px] font-black uppercase rounded-lg">Yol Tarifi Al</a>
                              </div>
                          </Popup>
                      </Marker>
                  </MapContainer>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Detaylı Maç Bilgileri Modalı ─────────────────────────────────── */}
      <AnimatePresence>
        {showInfoModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xl flex items-end justify-center"
            onClick={() => setShowInfoModal(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              onClick={e => e.stopPropagation()}
              className="bg-[#0A0E14] border-t border-white/10 w-full max-w-lg rounded-t-[40px] shadow-[0_-20px_50px_rgba(0,0,0,0.8)]"
            >
              {/* Başlık */}
              <div className="flex items-center justify-between px-6 pt-7 pb-5">
                <div>
                  <p className="text-[9px] font-black text-white/30 uppercase tracking-[0.3em] mb-0.5">{activePitch.name}</p>
                  <h2 className="text-base font-black text-white uppercase italic tracking-tight">MAÇ ÖZELLİKLERİ</h2>
                </div>
                <button
                  onClick={() => setShowInfoModal(false)}
                  className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Özellikler Listesi */}
              <div className="px-6 pb-2">
                <div className="bg-black/30 border border-white/5 rounded-2xl overflow-hidden divide-y divide-white/5">
                  <div className="flex items-center justify-between px-4 py-4">
                    <span className="text-[11px] font-black text-white/40 uppercase tracking-wider">FORMAT</span>
                    <span className="text-sm font-black text-white uppercase italic">{match.format || '7v7'}</span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-4">
                    <span className="text-[11px] font-black text-white/40 uppercase tracking-wider">YAŞ GRUBU</span>
                    <span className="text-sm font-black text-white uppercase italic">{match.ageGroup || ageLimit}</span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-4">
                    <span className="text-[11px] font-black text-white/40 uppercase tracking-wider">CİNSİYET</span>
                    <span className="text-sm font-black text-white uppercase italic">{match.gender || genderRule}</span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-4">
                    <span className="text-[11px] font-black text-white/40 uppercase tracking-wider">OYUN SERTLİĞİ</span>
                    <span className={`text-sm font-black uppercase italic ${
                      match.difficulty === 'Ciddi' ? 'text-red-400' :
                      match.difficulty === 'Taktiksel' ? 'text-[#FFFF00]' : 'text-[#39FF14]'
                    }`}>{match.difficulty}</span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-4">
                    <span className="text-[11px] font-black text-white/40 uppercase tracking-wider">KATILIM ÜCRETİ</span>
                    <span className={`text-sm font-black uppercase italic ${match.price > 0 ? 'text-[#39FF14]' : 'text-white/50'}`}>
                      {match.price > 0 ? `${match.price} ₺` : 'ÜCRETSİZ'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Kapat */}
              <div className="px-6 pt-4 pb-10">
                <button
                  onClick={() => setShowInfoModal(false)}
                  className="w-full py-3.5 rounded-2xl bg-white/5 border border-white/8 font-black text-xs uppercase tracking-widest text-white/50 hover:text-white hover:bg-white/10 transition-all active:scale-95"
                >
                  Kapat
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {actionError && <Toast message={actionError} variant="error" />}
        {actionSuccess && <Toast message={actionSuccess} variant="success" />}
      </AnimatePresence>

    </div>
  );
};

// ─── Arkadaş Satır Bileşeni ───────────────────────────────────────────────────

const FriendInviteRow: React.FC<{ friend: any; onInvite: () => void }> = ({ friend, onInvite }) => (
  <motion.button
    whileHover={{ scale: 1.01, x: 2 }}
    whileTap={{ scale: 0.98 }}
    onClick={onInvite}
    className="w-full bg-[#161B22] border border-white/5 rounded-2xl p-3.5 flex items-center justify-between transition-all hover:border-[#39FF14]/20 hover:bg-white/[0.02] group"
  >
    <div className="flex items-center gap-3">
      <div className="relative">
        <img src={friend.avatar || `https://i.pravatar.cc/150?u=${friend.id}`}
          alt={friend.name} className="w-11 h-11 rounded-full object-cover bg-[#0A0E14] border border-white/10" />
        <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-[#161B22] ${friend.online ? 'bg-[#39FF14]' : 'bg-white/20'}`} />
      </div>
      <div className="text-left">
        <p className="text-sm font-bold text-white leading-tight">{friend.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-white/5 text-white/40 uppercase tracking-widest">
            {friend.pos || friend.position || 'OYUNCU'}
          </span>
          {friend.fp && (
            <span className="text-[9px] font-bold text-yellow-400 flex items-center gap-0.5">
              <Star size={8} className="fill-current" /> {friend.fp}
            </span>
          )}
        </div>
      </div>
    </div>
    <div className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-black text-xs uppercase tracking-widest transition-all bg-[#39FF14]/5 border border-[#39FF14]/15 text-[#39FF14] group-hover:bg-[#39FF14]/15 group-hover:border-[#39FF14]/40 group-hover:shadow-[0_0_12px_rgba(57,255,20,0.25)]">
      <Send size={11} />
      <span>Davet</span>
    </div>
  </motion.button>
);

export default MatchJoin;
